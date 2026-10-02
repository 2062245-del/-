# TravelMate v0.5.24 offline Chinese voice integration

Baseline: shared v0.5.23 source, artifact 11236001804; package com.seungho.barointerpreter.shared. Code only in this step: no APK built or published preview changed.

Restore the baseline Android Studio source ZIP, decode native.tgz.b64, overlay MainActivity, ChineseTtsClient, ChineseTtsEngine, ChineseTtsService, ChineseVoicePack, ChineseVoiceFiles, NeuralTtsClient and NeuralTtsEngine in app/src/main/java/com/seungho/barointerpreter. Overlay build.gradle in app and AndroidManifest.xml in app/src/main. Keep all baseline resources/stores/translators and UnicodeProcessor unchanged.

Download the upstream sherpa-onnx-static-link-onnxruntime-1.13.8.aar, verify its SHA-256 b22c3fc1b6a45666d28892bb2f7694beeb77a8362d7ebd77c1a5431ec9435471, then run prepare-runtime.py INPUT OUTPUT into app/libs/sherpa-onnx-static-1.13.8.aar. This deterministic source adapter retains only ARM64 JNI and avoids merging x86 ONNX libraries from two incompatible runtimes. Existing Microsoft ONNX Runtime 1.26.0 remains unchanged for Supertonic. Pin all dependencies; see upstream SDK and third-party notices when distributing runtime binaries.

The optional Chinese pack has 26 files totaling 178,796,069 bytes. Uses pinned HF revision 155831f1b4ba23b1f5c058be6a61df90cefb2a37 of csukuangfj/kokoro-int8-multi-lang-v1_1. Female SID 3 (zf_001), male SID 58 (zm_009), 24kHz. Model upstream: hexgrad/Kokoro-82M-v1.1-zh, Apache-2.0. Include model LICENSE in downloaded pack. English phonemizer core/data is retained for mixed Latin text; unused languages/dictionaries omitted after synthesis verification.

Transfer is bound to the selected validated Wi-Fi Network; Wi-Fi loss pauses it instead of following mobile data. Range offset, byte length, SHA-256 or upstream Git blob SHA-1 must match before atomically renaming a completed file. Full installation marker is created only after all files validate. Keep partial files for an explicit subsequent resume. No automatic retries, API/audio uploads or paid TTS endpoints.

Chinese runs in a non-exported :chinese_tts service. Other voices use existing :neural_tts service. Switching engines requests model release; files and settings are kept. Stop/switch/recognition suppresses stale callback playback and pending synthesis continuations. Voice previews use selected language rather than always Korean.

Validation: six real Linux CPU synthesis cases for female/male, iced latte/count/cold, greeting, mixed Latin text and money. Nonempty finite PCM verified. Peak Linux RSS approximately 380MiB; NOT Android memory measurement. Android compile, manifest and ARM64 native merge passed on the previous Wi-Fi-routing revision; rerun required for final Network.openConnection change. Integrity tests 67 and existing language tests 22 passed.

Remaining before release: Android airplane-mode playback (both genders/all five languages), pronunciation listening review, Wi-Fi handover/resume, stop during synthesis/playback, native crash fallback, Fold4 memory and long sentence performance. Chinese microphone recognition remains based on installed device STT and is separate from TTS. Personal package update is not built by this sharing overlay; preserve applicationId/signature when preparing a personal update.
