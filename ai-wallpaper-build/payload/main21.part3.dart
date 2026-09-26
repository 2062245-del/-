                    Text('브라우저에서 직접 승인하면 이 앱에 범위가 제한된 임시 생성 토큰이 발급됩니다.'),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              if (_session == null && _error == null) ...[
                const Center(child: CircularProgressIndicator()),
                const SizedBox(height: 16),
                const Center(child: Text('승인 요청을 준비하는 중...')),
              ],
              if (_session case final session?) ...[
                const Text('브라우저 승인 코드', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: SelectableText(
                          session.userCode,
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 2),
                        ),
                      ),
                      IconButton(
                        tooltip: '코드 복사',
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: session.userCode));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('승인 코드를 복사했습니다.')));
                        },
                        icon: const Icon(Icons.copy_rounded),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _openingBrowser ? null : _openApprovalPage,
                  icon: const Icon(Icons.open_in_browser_rounded),
                  label: const Text('승인 페이지 열기'),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2)),
                    const SizedBox(width: 10),
                    Expanded(child: Text('승인 완료를 기다리고 있습니다.', style: TextStyle(color: scheme.onSurfaceVariant))),
                  ],
                ),
              ],
              if (_error case final error?) ...[
                Icon(Icons.error_outline_rounded, color: scheme.error, size: 42),
                const SizedBox(height: 12),
                Text(error, style: TextStyle(color: scheme.error), textAlign: TextAlign.center),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: _startAuthorization,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('다시 연결'),
                ),
              ],
              const Spacer(),
              Text(
                '승인 토큰은 Pollinations 계정에서 언제든 철회할 수 있습니다.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DeviceAuthorizationSession {
  const DeviceAuthorizationSession({required this.deviceCode, required this.userCode, required this.verificationUri});

  final String deviceCode;
  final String userCode;
  final String verificationUri;
}

class PollinationsAuthService {
  PollinationsAuthService._();

  static Future<DeviceAuthorizationSession> requestDeviceCode(String appKey) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final request = await client.postUrl(Uri.parse('https://enter.pollinations.ai/api/device/code')).timeout(const Duration(seconds: 20));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'client_id': appKey}));
      final response = await request.close().timeout(const Duration(seconds: 30));
      final body = await utf8.decodeStream(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw AiGenerationException(_oauthError(body, fallback: '사용자 승인 요청에 실패했습니다 (${response.statusCode}).'));
      }
      final json = jsonDecode(body) as Map<String, dynamic>;
      final deviceCode = json['device_code']?.toString() ?? '';
      final userCode = json['user_code']?.toString() ?? '';
      var verificationUri = json['verification_uri']?.toString() ?? '';
      if (verificationUri.startsWith('/')) verificationUri = 'https://enter.pollinations.ai$verificationUri';
      if (deviceCode.isEmpty || userCode.isEmpty || verificationUri.isEmpty) {
        throw const AiGenerationException('승인 서버 응답 형식이 올바르지 않습니다.');
      }
      return DeviceAuthorizationSession(deviceCode: deviceCode, userCode: userCode, verificationUri: verificationUri);
    } on TimeoutException {
      throw const AiGenerationException('승인 서버 연결 시간이 초과되었습니다.');
    } on SocketException {
      throw const AiGenerationException('인터넷 연결을 확인해 주세요.');
    } on FormatException {
      throw const AiGenerationException('승인 서버 응답을 해석하지 못했습니다.');
    } finally {
      client.close(force: true);
    }
  }

  static Future<String?> pollDeviceToken(String deviceCode) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final request = await client.postUrl(Uri.parse('https://enter.pollinations.ai/api/device/token')).timeout(const Duration(seconds: 20));
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'device_code': deviceCode}));
      final response = await request.close().timeout(const Duration(seconds: 30));
      final body = await utf8.decodeStream(response);
      Map<String, dynamic> json;
      try {
        json = jsonDecode(body) as Map<String, dynamic>;
      } on FormatException {
        throw const AiGenerationException('승인 확인 응답을 해석하지 못했습니다.');
      }
      final error = json['error']?.toString();
      if (error == 'authorization_pending') return null;
      if (error != null && error.isNotEmpty) {
        throw AiGenerationException(_oauthError(body, fallback: '사용자 승인이 완료되지 않았습니다.'));
      }
      final token = json['access_token']?.toString() ?? '';
      if (token.startsWith('sk_')) return token;
      if (response.statusCode >= 200 && response.statusCode < 300) {
        throw const AiGenerationException('승인 토큰이 응답에 없습니다.');
      }
      throw AiGenerationException('승인 서버 응답 오류 (${response.statusCode})');
    } on TimeoutException {
      return null;
    } on SocketException {
      throw const AiGenerationException('인터넷 연결을 확인해 주세요.');
    } finally {
      client.close(force: true);
    }
  }

  static String _oauthError(String body, {required String fallback}) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      final description = json['error_description']?.toString();
      final error = json['error']?.toString();
      if (description != null && description.isNotEmpty) return description;
      if (error != null && error.isNotEmpty) return '$fallback ($error)';
    } catch (_) {}
    return fallback;
  }
}

class GenerationPreviewPage extends StatefulWidget {
  const GenerationPreviewPage({
    super.key,
    required this.prompt,
    required this.style,
    required this.ratio,
    required this.accessToken,
  });

  final String prompt;
  final WallpaperStyle style;
  final String ratio;
  final String accessToken;

  @override
  State<GenerationPreviewPage> createState() => _GenerationPreviewPageState();
}

class _GenerationPreviewPageState extends State<GenerationPreviewPage> with SingleTickerProviderStateMixin {
  Uint8List? _imageBytes;
  String? _error;
  bool _loading = true;
  bool _showOverlay = true;
  bool _applying = false;
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(vsync: this, duration: const Duration(milliseconds: 1700))..repeat(reverse: true);
    _generate();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _error = null;
      _imageBytes = null;
    });

    try {
      final bytes = await AiImageService.generate(
        prompt: widget.prompt,
        stylePrompt: widget.style.promptHint,
        ratio: widget.ratio,
        accessToken: widget.accessToken,
      );
      if (!mounted) return;
      setState(() {
        _imageBytes = bytes;
        _loading = false;
      });
    } on AiGenerationException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '이미지 생성 중 예상하지 못한 오류가 발생했습니다.';
      });
    }
  }

  Future<void> _chooseWallpaperTarget() async {
    final bytes = _imageBytes;
    if (bytes == null || _applying) return;

    final target = await showModalBottomSheet<WallpaperTarget>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('어디에 적용할까요?', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                _TargetTile(
                  icon: Icons.home_outlined,
                  title: '홈 화면',
                  subtitle: '앱 아이콘 뒤의 배경화면으로 적용',
                  onTap: () => Navigator.of(context).pop(WallpaperTarget.home),
                ),
                _TargetTile(
                  icon: Icons.lock_outline_rounded,
                  title: '잠금 화면',
                  subtitle: '잠금화면 배경으로 적용',
                  onTap: () => Navigator.of(context).pop(WallpaperTarget.lock),
                ),
                _TargetTile(
                  icon: Icons.phonelink_lock_rounded,
                  title: '홈 + 잠금 화면',
                  subtitle: '두 화면에 한 번에 적용',
                  onTap: () => Navigator.of(context).pop(WallpaperTarget.both),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (target == null || !mounted) return;
    setState(() => _applying = true);
    try {
      await NativeBridge.applyWallpaper(bytes, target);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('배경화면 적용이 완료되었습니다.')),
      );
    } on PlatformException catch (e) {
      if (!mounted) return;
      final message = e.code == 'UNSUPPORTED'
          ? '이 Android 버전에서는 선택한 적용 방식이 지원되지 않습니다.'
          : '배경화면 적용에 실패했습니다. ${e.message ?? ''}'.trim();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('미리보기'),
        actions: [
          if (_imageBytes != null)
            IconButton(
              tooltip: _showOverlay ? '가이드 숨기기' : '가이드 보기',
              onPressed: () => setState(() => _showOverlay = !_showOverlay),
              icon: Icon(_showOverlay ? Icons.layers_rounded : Icons.layers_outlined),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Stack(
          children: [
            Positioned.fill(child: _buildMainContent()),
            if (_imageBytes != null)
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.transparent, Colors.black.withValues(alpha: 0.92)],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(18, 58, 18, 14),
                  child: SafeArea(
                    top: false,
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _loading ? null : _generate,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: BorderSide(color: Colors.white.withValues(alpha: 0.38)),
                              minimumSize: const Size.fromHeight(56),
                            ),
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('다시 생성'),
                          ),
