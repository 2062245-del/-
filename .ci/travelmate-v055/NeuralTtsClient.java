package com.seungho.barointerpreter;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Main-process facade for Neural TTS.
 * Native sherpa-onnx inference runs only inside :neural_tts process via NeuralTtsService.
 */
public final class NeuralTtsClient {
    public interface Callback { void state(String message, boolean ok); }
    public interface ModelDownloadCallback {
        void progress(int percent, String message);
        void complete(boolean ok, String message);
    }

    private static final String MODEL_DIR = "supertonic3";
    private static final String HF_BASE =
            "https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/main/";
    private static final String[] FILES = {
            "duration_predictor.int8.onnx",
            "text_encoder.int8.onnx",
            "vector_estimator.int8.onnx",
            "vocoder.int8.onnx",
            "tts.json",
            "unicode_indexer.bin",
            "voice.bin"
    };
    private static final long[] SIZES = {
            3700147L, 36416150L, 78400833L, 25991073L, 8253L, 262144L, 517168L
    };
    private static final String[] SHA256 = {
            "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db",
            "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff",
            "20cd86fa5c6effedfda0e7cffe5b0569ca401c440a0c3a1d72bf39286c0db3fd",
            "e923d60f53f95eb1ce235f1dc33ec56d9c057823c96fa6f8acf98f32b0da6152",
            "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09",
            "8402ca48e5189a8950138580b0fff64db6f072f24ac07cd54ba8b2fbb9883b30",
            "67d5209b0ee8ce6c74105ffbe12fe6a7628aea3b4ba2fcb308a4a67938a93ce8"
    };
    public static final long TOTAL_MODEL_BYTES = 145295768L;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService downloader = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;
    private volatile boolean serviceReady = false;
    private volatile long safeModeUntil = 0L;
    private volatile long lastCrashAt = 0L;

    public NeuralTtsClient(Context context) {
        this.context = context.getApplicationContext();
        // v0.5.5: 과거 버전의 종료 기록으로 AI 음성을 막지 않는다.
        // 오직 이번 요청 이후 :neural_tts 프로세스가 실제로 죽었을 때만 안전모드로 전환한다.
    }

    private File modelDir() { return new File(context.getFilesDir(), MODEL_DIR); }
    public boolean isReady() { return serviceReady && !isSafeMode(); }
    public boolean isDownloading() { return downloading; }
    public boolean isSafeMode() { return System.currentTimeMillis() < safeModeUntil; }
    public long safeModeRemainingSeconds() {
        return Math.max(0L, (safeModeUntil - System.currentTimeMillis() + 999L) / 1000L);
    }
    public void forceRetry() {
        safeModeUntil = 0L;
        lastCrashAt = 0L;
        serviceReady = false;
    }

    public boolean isModelInstalled() {
        File dir = modelDir();
        for (int i = 0; i < FILES.length; i++) {
            File f = new File(dir, FILES[i]);
            if (!f.isFile() || f.length() != SIZES[i]) return false;
        }
        return true;
    }

    public void prepare(Callback callback) {
        if (isSafeMode()) {
            callback.state("AI 음성 일시 중지 · 다시 켜기 버튼으로 즉시 재시도 가능", false);
            return;
        }
        sendService(NeuralTtsService.ACTION_PREPARE, null, null, true, 1.0f, callback);
    }

    public void speak(String text, String lang, boolean female, float speed, Callback callback) {
        if (isSafeMode()) {
            callback.state("AI 음성 일시 중지 · 현재 기본 음성 사용", false);
            return;
        }
        sendService(NeuralTtsService.ACTION_SPEAK, text, lang, female, speed, callback);
    }

    public void stop() {
        try {
            Intent i = new Intent(context, NeuralTtsService.class).setAction(NeuralTtsService.ACTION_STOP);
            context.startService(i);
        } catch (Throwable ignored) {}
    }

    public void releaseModel() { stop(); }

    public void release() {
        try {
            Intent i = new Intent(context, NeuralTtsService.class).setAction(NeuralTtsService.ACTION_RELEASE);
            context.startService(i);
        } catch (Throwable ignored) {}
        downloader.shutdownNow();
    }

    private void sendService(String action, String text, String lang, boolean female, float speed, Callback callback) {
        final long requestAt = System.currentTimeMillis();
        try {
            ResultReceiver receiver = new ResultReceiver(main) {
                @Override protected void onReceiveResult(int resultCode, Bundle resultData) {
                    String message = resultData == null ? "AI 음성 상태 확인" : resultData.getString("message", "AI 음성 상태 확인");
                    boolean ok = resultData != null && resultData.getBoolean("ok", false);
                    if (message.contains("준비됨") || message.contains("재생")) serviceReady = true;
                    if (message.contains("실패")) serviceReady = false;
                    callback.state(message, ok);
                }
            };
            Intent i = new Intent(context, NeuralTtsService.class).setAction(action);
            if (text != null) i.putExtra("text", text);
            if (lang != null) i.putExtra("lang", lang);
            i.putExtra("female", female);
            i.putExtra("speed", speed);
            i.putExtra("receiver", receiver);
            context.startService(i);

            // v0.5.5: 과거 10분의 종료 기록 전체가 아니라 '이번 요청 이후' 죽은 경우만 감지한다.
            main.postDelayed(() -> {
                long crashAt = neuralProcessCrashSince(requestAt);
                if (crashAt > 0L && crashAt != lastCrashAt) {
                    lastCrashAt = crashAt;
                    safeModeUntil = System.currentTimeMillis() + 60_000L;
                    serviceReady = false;
                    callback.state("AI Neural 프로세스 크래시 · 기본 음성 사용 · 다시 켜기 가능", false);
                }
            }, 4500L);
        } catch (Throwable t) {
            serviceReady = false;
            callback.state("AI 음성 시작 실패 · 기본 음성 사용", false);
        }
    }

    private long neuralProcessCrashSince(long since) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return 0L;
        try {
            ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return 0L;
            List<ApplicationExitInfo> infos = am.getHistoricalProcessExitReasons(context.getPackageName(), 0, 20);
            if (infos == null) return 0L;
            String exactProcess = context.getPackageName() + ":neural_tts";
            long newest = 0L;
            for (ApplicationExitInfo info : infos) {
                long ts = info.getTimestamp();
                if (ts + 750L < since) continue;
                if (!exactProcess.equals(info.getProcessName())) continue;
                int r = info.getReason();
                if (r == ApplicationExitInfo.REASON_CRASH_NATIVE || r == ApplicationExitInfo.REASON_CRASH) {
                    newest = Math.max(newest, ts);
                }
            }
            return newest;
        } catch (Throwable ignored) {}
        return 0L;
    }

    public void downloadModel(ModelDownloadCallback callback) {
        if (downloading) { callback.progress(0, "AI 음성팩을 이미 받고 있어요."); return; }
        if (isModelInstalled()) { callback.complete(true, "AI 음성팩이 이미 설치되어 있습니다."); return; }
        downloading = true;
        downloader.execute(() -> {
            File dir = modelDir();
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("모델 폴더 생성 실패");
                long finishedBytes = completedBytes(dir);
                for (int i = 0; i < FILES.length; i++) {
                    File target = new File(dir, FILES[i]);
                    if (target.isFile() && target.length() == SIZES[i] && verifySha256(target, SHA256[i])) {
                        finishedBytes = Math.max(finishedBytes, sumSizesThrough(i));
                        continue;
                    }
                    File part = new File(dir, FILES[i] + ".part");
                    if (part.exists() && part.length() > SIZES[i]) part.delete();
                    long existing = part.exists() ? part.length() : 0L;
                    callback.progress(percent(finishedBytes + existing), "AI 음성팩 받는 중 · " + (i + 1) + "/" + FILES.length);
                    HttpURLConnection conn = (HttpURLConnection) new URL(HF_BASE + FILES[i] + "?download=true").openConnection();
                    conn.setConnectTimeout(20000); conn.setReadTimeout(45000); conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "TravelMate-Android/0.5.5");
                    if (existing > 0L) conn.setRequestProperty("Range", "bytes=" + existing + "-");
                    conn.connect();
                    int code = conn.getResponseCode();
                    boolean append = code == HttpURLConnection.HTTP_PARTIAL && existing > 0L;
                    if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) throw new IllegalStateException("다운로드 응답 오류 " + code);
                    if (!append) { existing = 0L; if (part.exists()) part.delete(); }
                    try (BufferedInputStream in = new BufferedInputStream(conn.getInputStream(), 256 * 1024);
                         FileOutputStream out = new FileOutputStream(part, append)) {
                        byte[] buffer = new byte[256 * 1024]; int n; long current = existing; int last = -1;
                        while ((n = in.read(buffer)) >= 0) {
                            if (n == 0) continue; out.write(buffer, 0, n); current += n;
                            int pct = percent(finishedBytes + current);
                            if (pct != last) { last = pct; callback.progress(pct, "AI 음성팩 받는 중 · " + pct + "%"); }
                        }
                        out.flush();
                    } finally { conn.disconnect(); }
                    if (part.length() != SIZES[i]) throw new IllegalStateException(FILES[i] + " 크기 확인 실패");
                    if (!verifySha256(part, SHA256[i])) { part.delete(); throw new IllegalStateException(FILES[i] + " 무결성 확인 실패"); }
                    if (target.exists() && !target.delete()) throw new IllegalStateException("기존 모델 교체 실패");
                    if (!part.renameTo(target)) { copyFile(part, target); part.delete(); }
                    finishedBytes += SIZES[i];
                }
                downloading = false;
                callback.progress(100, "AI 음성팩 다운로드 완료");
                callback.complete(true, "AI 음성팩 준비 완료 · 이제 오프라인 사용 가능");
            } catch (Throwable t) {
                downloading = false;
                callback.complete(false, "AI 음성팩 다운로드 실패 · 인터넷 연결 후 다시 시도해주세요.");
            }
        });
    }

    private long completedBytes(File dir) { long total=0L; for(int i=0;i<FILES.length;i++){File f=new File(dir,FILES[i]); if(f.isFile()&&f.length()==SIZES[i]) total+=SIZES[i];} return total; }
    private long sumSizesThrough(int index) { long total=0L; for(int i=0;i<=index&&i<SIZES.length;i++) total+=SIZES[i]; return total; }
    private static int percent(long bytes) { return (int)Math.max(0,Math.min(100,Math.round(bytes*100.0/TOTAL_MODEL_BYTES))); }
    private static boolean verifySha256(File file,String expected) throws Exception { MessageDigest md=MessageDigest.getInstance("SHA-256"); try(FileInputStream in=new FileInputStream(file)){byte[] b=new byte[256*1024];int n;while((n=in.read(b))>0)md.update(b,0,n);}StringBuilder sb=new StringBuilder();for(byte x:md.digest())sb.append(String.format("%02x",x&0xff));return expected.equalsIgnoreCase(sb.toString()); }
    private static void copyFile(File from,File to) throws Exception { try(FileInputStream in=new FileInputStream(from);FileOutputStream out=new FileOutputStream(to)){byte[] b=new byte[256*1024];int n;while((n=in.read(b))>0)out.write(b,0,n);out.flush();} }
}
