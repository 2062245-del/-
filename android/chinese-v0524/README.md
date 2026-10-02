# TravelMate v0.5.24 offline Chinese voice integration

Baseline: shared v0.5.23 source, artifact 11236001804; package com.seungho.barointerpreter.shared. Personal and Share APKs built and delivered after release validation. Published web preview remains the existing translation/UI preview; native offline voice runs in APK.

Restore the baseline Android Studio source ZIP, decode native.tgz.b64, overlay MainActivity, ChineseTtsClient, ChineseTtsEngine, ChineseTtsService, ChineseVoicePack, ChineseVoiceFiles, NeuralTtsClient and NeuralTtsEngine in app/src/main/java/com/seungho/barointerpreter. Overlay build.gradle in app and AndroidManifest.xml in app/src/main. Keep all baseline resources/stores/translators and UnicodeProcessor unchanged.

Download the upstream sherpa-onnx-static-link-onnxruntime-1.13.8.aar, verify its SHA-256 b22c3fc1b6a45666d28892bb2f7694beeb77a8362d7ebd77c1a5431ec9435471, then run prepare-runtime.py INPUT OUTPUT into app/libs/sherpa-onnx-static-1.13.8.aar. This deterministic source adapter retains only ARM64 JNI and avoids merging x86 ONNX libraries from two incompatible runtimes. Existing Microsoft ONNX Runtime 1.26.0 remains unchanged for Supertonic. Pin all dependencies; see upstream SDK and third-party notices when distributing runtime binaries.

The optional Chinese pack has 26 files totaling 178,796,069 bytes. Uses pinned HF revision 155831f1b4ba23b1f5c058be6a61df90cefb2a37 of csukuangfj/kokoro-int8-multi-lang-v1_1. Female SID 3 (zf_001), male SID 58 (zm_009), 24kHz. Model upstream: hexgrad/Kokoro-82M-v1.1-zh, Apache-2.0. Include model LICENSE in downloaded pack. English phonemizer core/data is retained for mixed Latin text; unused languages/dictionaries omitted after synthesis verification.

Transfer is bound to the selected validated Wi-Fi Network; Wi-Fi loss pauses it instead of following mobile data. Range offset, byte length, SHA-256 or upstream Git blob SHA-1 must match before atomically renaming a completed file. Full installation marker is created only after all files validate. Keep partial files for an explicit subsequent resume. No automatic retries, API/audio uploads or paid TTS endpoints.

Chinese runs in a non-exported :chinese_tts service. Other voices use existing :neural_tts service. Switching engines requests model release; files and settings are kept. Stop/switch/recognition suppresses stale callback playback and pending synthesis continuations. Voice previews use selected language rather than always Korean.

Validation: six real Linux CPU synthesis cases for female/male, iced latte/count/cold, greeting, mixed Latin text and money. Nonempty finite PCM verified. Peak Linux RSS approximately 380MiB; NOT Android memory measurement. Final Wi-Fi-bound code passed Android compile, manifest processing and ARM64 native merge. Signed release build run 37078816861 succeeded for both variants; 54 translation + 67 integrity + 22 language checks passed per variant. Signature, version 27, arm64-only libraries and 16KiB ZIP alignment verified. Repack delivery run 37079162940 reused these exact APKs without rebuilding. Integrity tests 67 and existing language tests 22 passed.

Remaining before release: Android airplane-mode playback (both genders/all five languages), pronunciation listening review, Wi-Fi handover/resume, stop during synthesis/playback, native crash fallback, Fold4 memory and long sentence performance. Chinese microphone recognition remains based on installed device STT and is separate from TTS. Personal package update is not built by this sharing overlay; preserve applicationId/signature when preparing a personal update.

## Delivered release artifacts

- Personal: TravelMate-v0.5.24-Personal-arm64.apk, package com.seungho.barointerpreter, versionName 0.5.24, SHA-256 0883bc86aced6742226510dce9857b4d95c5b2fe4cb6eed90545651131b2f100.
- Share: TravelMate-v0.5.24-Share-arm64.apk, package com.seungho.barointerpreter.shared, versionName 0.5.24-share, SHA-256 a5001cc3a3bc45f1056b287ba781d069f640702b932d541c96d8350fb6953e63.
- Both versionCode 27, original certificate SHA-256 7d411eb878d63e9b30e5a75c65ce1206d195b45a3e5f794955bd78f625b87b85; suitable for same-package updates without uninstalling.
- Android Studio source ZIPs exported separately with pinned ARM64 runtime AAR. WalletStore, FxStore, TravelCatalog, TravelOrderTranslator and TranslationVerification byte-compared against baseline. APKs retained as user deliverables; source remains in this Git-backed project/build artifacts.
- No actual device install/audio verification claimed. Fold4 airplane-mode playback, pronunciation listening, Wi-Fi handover and cancellation still require on-device checking.
