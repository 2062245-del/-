import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  runApp(const AiWallpaperApp());
}

class AiWallpaperApp extends StatelessWidget {
  const AiWallpaperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AI 배경화면',
      themeMode: ThemeMode.system,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark),
      home: const GeneratorHomePage(),
    );
  }

  ThemeData _theme(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF6750A4),
      brightness: brightness,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      textTheme: const TextTheme(
        headlineMedium: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.8),
        titleLarge: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.35),
        titleMedium: TextStyle(fontWeight: FontWeight.w700),
        bodyLarge: TextStyle(height: 1.45),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(58),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class NativeBridge {
  NativeBridge._();

  static const _channel = MethodChannel('com.seungho.aiwallpaper/native');

  static Future<String?> getPublishableKey() async {
    return _channel.invokeMethod<String>('getPublishableKey');
  }

  static Future<void> setPublishableKey(String key) async {
    await _channel.invokeMethod<void>('setPublishableKey', {'key': key});
  }

  static Future<void> clearPublishableKey() async {
    await _channel.invokeMethod<void>('clearPublishableKey');
  }

  static Future<String?> getAccessToken() async {
    return _channel.invokeMethod<String>('getAccessToken');
  }

  static Future<void> setAccessToken(String token) async {
    await _channel.invokeMethod<void>('setAccessToken', {'token': token});
  }

  static Future<void> clearAccessToken() async {
    await _channel.invokeMethod<void>('clearAccessToken');
  }

  static Future<void> openExternalUrl(String url) async {
    await _channel.invokeMethod<void>('openExternalUrl', {'url': url});
  }

  static Future<void> applyWallpaper(Uint8List bytes, WallpaperTarget target) async {
    await _channel.invokeMethod<void>('applyWallpaper', {
      'bytes': bytes,
      'target': target.name,
    });
  }
}

enum WallpaperTarget { home, lock, both }

class WallpaperStyle {
  const WallpaperStyle(this.label, this.icon, this.promptHint);

  final String label;
  final IconData icon;
  final String promptHint;
}

class GeneratorHomePage extends StatefulWidget {
  const GeneratorHomePage({super.key});

  @override
  State<GeneratorHomePage> createState() => _GeneratorHomePageState();
}

class _GeneratorHomePageState extends State<GeneratorHomePage> {
  final TextEditingController _promptController = TextEditingController();
  final Random _random = Random();

  static const _styles = <WallpaperStyle>[
    WallpaperStyle('3D 파스텔', Icons.blur_on_rounded, 'soft pastel 3D render, gentle depth, premium clean composition'),
    WallpaperStyle('네온 사이버펑크', Icons.electric_bolt_rounded, 'cinematic neon cyberpunk, wet reflections, vivid but balanced lighting'),
    WallpaperStyle('미니멀 네이처', Icons.park_rounded, 'minimal nature photography, calm negative space, refined natural tones'),
    WallpaperStyle('픽셀아트', Icons.grid_4x4_rounded, 'high-detail pixel art, crisp pixel clusters, atmospheric lighting'),
  ];

  static const _ratios = <String>['9:19.5', '9:20', '9:16'];

  static const _randomPrompts = <String>[
    '새벽 안개가 흐르는 고요한 숲, 부드러운 빛, 세로형 배경화면',
    '유리 질감의 보랏빛 행성과 별빛, 미니멀한 우주 풍경',
    '비 내린 밤의 네온 골목, 반사광, 시네마틱 사이버펑크',
    '파스텔 구름 위 작은 섬과 달, 몽환적인 3D 렌더',
    '잔잔한 호수와 소나무 실루엣, 여백이 넓은 미니멀 네이처',
  ];

  int _selectedStyle = 0;
  int _selectedRatio = 0;

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  void _fillRandomPrompt() {
    final prompt = _randomPrompts[_random.nextInt(_randomPrompts.length)];
    _promptController.text = prompt;
    _promptController.selection = TextSelection.collapsed(offset: prompt.length);
    setState(() {});
  }

  Future<void> _handleGenerate() async {
    if (_promptController.text.trim().isEmpty) {
      _fillRandomPrompt();
    }

    final appKey = await _ensurePublishableKey();
    if (!mounted || appKey == null) return;

    final accessToken = await _ensureUserAccessToken(appKey);
    if (!mounted || accessToken == null) return;

    final style = _styles[_selectedStyle];
    final ratio = _ratios[_selectedRatio];

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GenerationPreviewPage(
          prompt: _promptController.text.trim(),
          style: style,
          ratio: ratio,
          accessToken: accessToken,
        ),
      ),
    );
  }

  Future<String?> _ensurePublishableKey() async {
    String? current;
    try {
      current = await NativeBridge.getPublishableKey();
    } on PlatformException {
      if (mounted) {
        _showMessage('연결 설정을 불러오지 못했습니다.');
      }
      return null;
    }

    if (current != null && current.trim().startsWith('pk_')) {
      return current.trim();
    }

    if (!mounted) return null;
    return _showApiKeySheet();
  }

  Future<String?> _ensureUserAccessToken(String appKey) async {
    try {
      final saved = await NativeBridge.getAccessToken();
      if (saved != null && saved.trim().startsWith('sk_')) {
        return saved.trim();
      }
    } on PlatformException {
      if (mounted) _showMessage('저장된 사용자 승인을 확인하지 못했습니다.');
    }

    if (!mounted) return null;
    return Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        builder: (_) => PollinationsAuthorizationPage(appKey: appKey),
      ),
    );
  }

  Future<String?> _showApiKeySheet() async {
    final controller = TextEditingController();
    String? errorText;

    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  4,
                  24,
                  24 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AI 생성 연결', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(
                      'Pollinations App Key(pk_)를 입력하세요. 이 키는 공개 client_id이며, 다음 화면에서 브라우저 사용자 승인을 진행합니다. 개인 sk_ 키는 직접 입력하지 않습니다.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: controller,
                      obscureText: false,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'App Key (pk_)',
                        hintText: 'pk_...',
                        errorText: errorText,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Icon(Icons.shield_outlined, size: 17, color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            'App Key는 한 번 저장합니다. 사용자 승인 토큰은 만료되거나 철회되면 다시 연결합니다.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextButton.icon(
                      onPressed: () => NativeBridge.openExternalUrl('https://enter.pollinations.ai/keys'),
                      icon: const Icon(Icons.open_in_new_rounded),
                      label: const Text('Pollinations에서 App Key 만들기'),
                    ),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: () async {
                        final value = controller.text.trim();
                        if (!value.startsWith('pk_') || value.length < 8) {
                          setModalState(() => errorText = 'pk_로 시작하는 App Key를 입력해 주세요.');
                          return;
                        }
                        try {
                          await NativeBridge.setPublishableKey(value);
                          if (sheetContext.mounted) Navigator.of(sheetContext).pop(value);
                        } on PlatformException {
                          setModalState(() => errorText = '키 저장에 실패했습니다. 다시 시도해 주세요.');
                        }
                      },
                      child: const Text('저장 후 사용자 승인'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    controller.dispose();
    return result;
  }

  Future<void> _openSettings() async {
    String? current;
    try {
      current = await NativeBridge.getPublishableKey();
    } on PlatformException {
      current = null;
    }
    if (!mounted) return;

    final controller = TextEditingController(text: current ?? '');
    String? errorText;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  4,
                  24,
                  24 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('연결 설정', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(
                      'Pollinations App Key를 변경하거나 사용자 승인을 초기화할 수 있습니다. 개인 sk_ 키는 직접 저장하지 않습니다.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: controller,
                      obscureText: false,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'App Key (pk_)',
                        hintText: 'pk_...',
                        errorText: errorText,
                      ),
                    ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: () async {
                        final value = controller.text.trim();
                        if (!value.startsWith('pk_') || value.length < 8) {
                          setModalState(() => errorText = 'pk_로 시작하는 App Key를 입력해 주세요.');
                          return;
                        }
                        await NativeBridge.setPublishableKey(value);
                        if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                        if (mounted) _showMessage('App Key를 저장했습니다. 다음 생성 시 사용자 승인을 진행합니다.');
                      },
                      child: const Text('저장'),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
