package com.seungho.barointerpreter;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.GenerationConfig;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsSupertonicModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Supertonic 3 INT8 온디바이스 Neural TTS. 네트워크 호출 없음. */
public final class NeuralTtsEngine {
    public interface Callback { void state(String message, boolean ok); }

    private static final String ASSET_DIR = "supertonic3";
    private static final String[] FILES = {
            "duration_predictor.int8.onnx", "text_encoder.int8.onnx",
            "vector_estimator.int8.onnx", "vocoder.int8.onnx",
            "tts.json", "unicode_indexer.bin", "voice.bin"
    };

    // 사용자가 가장 선호한 A 샘플 = Supertonic F1 / sid 0.
    public static final int FEMALE_A = 0;
    // 남성 기본은 부드러운 대화형 M4 / sid 8. 사용자가 변경하기 쉬운 구조로 분리.
    public static final int MALE_DEFAULT = 8;

    private final Context context;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private OfflineTts tts;
    private AudioTrack currentTrack;
    private volatile boolean preparing = false;
    private volatile boolean failed = false;

    public NeuralTtsEngine(Context context) { this.context = context.getApplicationContext(); }

    public boolean isReady() { return tts != null; }
    public boolean isPreparing() { return preparing; }

    public void prepare(Callback callback) {
        if (tts != null) { callback.state("AI 음성 준비됨", true); return; }
        if (preparing) { callback.state("AI 음성 준비 중…", false); return; }
        preparing = true;
        executor.execute(() -> {
            try {
                File dir = new File(context.getFilesDir(), ASSET_DIR);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("모델 폴더 생성 실패");
                copyAssetsIfNeeded(context.getAssets(), dir);

                OfflineTtsSupertonicModelConfig supertonic = new OfflineTtsSupertonicModelConfig();
                supertonic.setDurationPredictor(new File(dir, FILES[0]).getAbsolutePath());
                supertonic.setTextEncoder(new File(dir, FILES[1]).getAbsolutePath());
                supertonic.setVectorEstimator(new File(dir, FILES[2]).getAbsolutePath());
                supertonic.setVocoder(new File(dir, FILES[3]).getAbsolutePath());
                supertonic.setTtsJson(new File(dir, FILES[4]).getAbsolutePath());
                supertonic.setUnicodeIndexer(new File(dir, FILES[5]).getAbsolutePath());
                supertonic.setVoiceStyle(new File(dir, FILES[6]).getAbsolutePath());

                OfflineTtsModelConfig model = new OfflineTtsModelConfig();
                model.setSupertonic(supertonic);
                model.setNumThreads(2);
                model.setDebug(false);
                model.setProvider("cpu");

                OfflineTtsConfig config = new OfflineTtsConfig();
                config.setModel(model);
                // Absolute model paths are used, so pass null AssetManager and load from files.
                tts = new OfflineTts(null, config);
                failed = false;
                preparing = false;
                callback.state("AI 음성 준비됨", true);
            } catch (Throwable t) {
                failed = true;
                preparing = false;
                callback.state("AI 음성 준비 실패", false);
            }
        });
    }

    private void copyAssetsIfNeeded(AssetManager assets, File dir) throws Exception {
        byte[] buffer = new byte[1024 * 256];
        for (String name : FILES) {
            File target = new File(dir, name);
            if (target.exists() && target.length() > 0) continue;
            try (InputStream in = assets.open(ASSET_DIR + "/" + name);
                 FileOutputStream out = new FileOutputStream(target)) {
                int n;
                while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                out.flush();
            }
        }
    }

    public void speak(String text, String lang, boolean female, float speed, Callback callback) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            prepare((message, ok) -> {
                callback.state(message, ok);
                if (ok) speak(text, lang, female, speed, callback);
            });
            return;
        }
        stop();
        executor.execute(() -> {
            try {
                GenerationConfig gen = new GenerationConfig();
                gen.setSid(female ? FEMALE_A : MALE_DEFAULT);
                gen.setNumSteps(8);
                gen.setSpeed(speed <= 0 ? 1.0f : speed);
                Map<String, String> extra = new HashMap<>();
                extra.put("lang", lang);
                gen.setExtra(extra);
                callback.state("AI 음성 생성 중…", true);
                GeneratedAudio audio = tts.generateWithConfigAndCallback(text, gen, samples -> 1);
                play(audio.getSamples(), audio.getSampleRate());
                callback.state("AI 음성 재생", true);
            } catch (Throwable t) {
                callback.state("AI 음성 재생 실패", false);
            }
        });
    }

    private void play(float[] samples, int sampleRate) {
        if (samples == null || samples.length == 0) return;
        short[] pcm = new short[samples.length];
        for (int i = 0; i < samples.length; i++) {
            float v = Math.max(-1f, Math.min(1f, samples[i]));
            pcm[i] = (short) (v * 32767f);
        }
        int min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int buffer = Math.max(min, 32768);
        AudioTrack track;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(buffer).build();
        } else {
            track = new AudioTrack(AudioManager.STREAM_MUSIC, sampleRate, AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, buffer, AudioTrack.MODE_STREAM);
        }
        currentTrack = track;
        track.play();
        int offset = 0;
        while (offset < pcm.length && currentTrack == track) {
            int wrote = track.write(pcm, offset, Math.min(8192, pcm.length - offset));
            if (wrote <= 0) break;
            offset += wrote;
        }
        try { track.stop(); } catch (Exception ignored) {}
        track.release();
        if (currentTrack == track) currentTrack = null;
    }

    public void stop() {
        AudioTrack track = currentTrack;
        currentTrack = null;
        if (track != null) {
            try { track.pause(); track.flush(); track.stop(); } catch (Exception ignored) {}
            try { track.release(); } catch (Exception ignored) {}
        }
    }

    public void release() {
        stop();
        if (tts != null) { try { tts.release(); } catch (Throwable ignored) {} tts = null; }
        executor.shutdownNow();
    }
}
