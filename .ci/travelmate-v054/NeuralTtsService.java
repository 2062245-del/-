package com.seungho.barointerpreter;

import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.os.IBinder;
import android.os.ResultReceiver;

/**
 * Dedicated native TTS process. A sherpa/onnx native crash is contained here and
 * does not terminate MainActivity's process.
 */
public final class NeuralTtsService extends Service {
    public static final String ACTION_PREPARE = "com.seungho.barointerpreter.NEURAL_PREPARE";
    public static final String ACTION_SPEAK = "com.seungho.barointerpreter.NEURAL_SPEAK";
    public static final String ACTION_STOP = "com.seungho.barointerpreter.NEURAL_STOP";
    public static final String ACTION_RELEASE = "com.seungho.barointerpreter.NEURAL_RELEASE";

    private NeuralTtsEngine engine;

    @Override public void onCreate() {
        super.onCreate();
        CrashDiagnostics.install(this);
        engine = new NeuralTtsEngine(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        ResultReceiver receiver = intent.getParcelableExtra("receiver");
        if (ACTION_STOP.equals(action)) {
            if (engine != null) engine.stop();
            return START_NOT_STICKY;
        }
        if (ACTION_RELEASE.equals(action)) {
            if (engine != null) engine.release();
            engine = null;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (engine == null) engine = new NeuralTtsEngine(this);
        if (ACTION_PREPARE.equals(action)) {
            engine.prepare((message, ok) -> send(receiver, message, ok));
        } else if (ACTION_SPEAK.equals(action)) {
            String text = intent.getStringExtra("text");
            String lang = intent.getStringExtra("lang");
            boolean female = intent.getBooleanExtra("female", true);
            float speed = intent.getFloatExtra("speed", 1.0f);
            engine.speak(text, lang, female, speed, (message, ok) -> send(receiver, message, ok));
        }
        return START_NOT_STICKY;
    }

    private static void send(ResultReceiver receiver, String message, boolean ok) {
        if (receiver == null) return;
        try {
            Bundle b = new Bundle();
            b.putString("message", message);
            b.putBoolean("ok", ok);
            receiver.send(ok ? 1 : 0, b);
        } catch (Throwable ignored) {}
    }

    @Override public void onDestroy() {
        if (engine != null) {
            try { engine.release(); } catch (Throwable ignored) {}
            engine = null;
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
