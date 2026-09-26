                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: FilledButton.icon(
                            onPressed: _applying ? null : _chooseWallpaperTarget,
                            style: FilledButton.styleFrom(
                              backgroundColor: scheme.primary,
                              foregroundColor: scheme.onPrimary,
                            ),
                            icon: _applying
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.wallpaper_rounded),
                            label: Text(_applying ? '적용 중' : '배경화면 적용'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildMainContent() {
    if (_loading) {
      return _AuroraLoading(
        animation: _pulseController,
        prompt: widget.prompt,
      );
    }

    if (_error != null) {
      return ColoredBox(
        color: const Color(0xFF0E0E12),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off_rounded, color: Colors.white70, size: 48),
                const SizedBox(height: 18),
                const Text('생성에 실패했습니다.', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, height: 1.45)),
                const SizedBox(height: 24),
                FilledButton.icon(onPressed: _generate, icon: const Icon(Icons.refresh_rounded), label: const Text('다시 시도')),
              ],
            ),
          ),
        ),
      );
    }

    final bytes = _imageBytes!;
    return GestureDetector(
      onTap: () => setState(() => _showOverlay = !_showOverlay),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true),
          if (_showOverlay) ...[
            const Positioned(top: 58, left: 0, right: 0, child: _ClockOverlay()),
            const Positioned(left: 24, right: 24, bottom: 104, child: _AppDockOverlay()),
            Positioned(
              top: 18,
              left: 18,
              child: DecoratedBox(
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(999)),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                  child: Text('시스템 가이드 ON', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class AiImageService {
  AiImageService._();

  static Future<Uint8List> generate({
    required String prompt,
    required String stylePrompt,
    required String ratio,
    required String accessToken,
  }) async {
    if (!accessToken.startsWith('sk_')) {
      throw const AiGenerationException('사용자 승인 토큰이 없습니다. 연결 설정에서 다시 승인해 주세요.');
    }

    final size = _sizeForRatio(ratio);
    final enhancedPrompt = [
      prompt,
      stylePrompt,
      'premium Android smartphone wallpaper',
      'portrait composition',
      'clean negative space near the top for lock-screen clock',
      'important subject away from bottom app dock',
      'no text, no watermark, no logo',
      'high detail, polished lighting',
    ].join(', ');

    final uri = Uri.parse('https://gen.pollinations.ai/image/${Uri.encodeComponent(enhancedPrompt)}').replace(
      queryParameters: {
        'model': 'flux',
        'width': '${size.$1}',
        'height': '${size.$2}',
        'seed': '${DateTime.now().microsecondsSinceEpoch % 1000000000}',
      },
    );

    final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
    try {
      final request = await client.getUrl(uri).timeout(const Duration(seconds: 25));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
      request.headers.set(HttpHeaders.acceptHeader, 'image/*');
      final response = await request.close().timeout(const Duration(seconds: 150));

      if (response.statusCode == 401 || response.statusCode == 403) {
        await response.drain<void>();
        try {
          await NativeBridge.clearAccessToken();
        } on PlatformException {
          // 다음 생성 시 인증 재시도를 유도하기 위한 정리 실패는 생성 오류보다 우선하지 않습니다.
        }
        throw const AiGenerationException('사용자 승인이 만료되었거나 철회되었습니다. 이전 화면으로 돌아가 다시 생성하면 재연결됩니다.');
      }
      if (response.statusCode == 402) {
        await response.drain<void>();
        throw const AiGenerationException('AI 생성 잔액 또는 승인된 예산이 부족합니다. Pollinations 계정의 Pollen 잔액과 승인 예산을 확인해 주세요.');
      }
      if (response.statusCode == 429) {
        await response.drain<void>();
        throw const AiGenerationException('현재 생성 요청이 많거나 사용 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.');
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.drain<void>();
        throw AiGenerationException('이미지 생성 서버 응답 오류 (${response.statusCode})');
      }

      final contentType = response.headers.contentType;
      if (contentType != null && contentType.primaryType != 'image') {
        await response.drain<void>();
        throw const AiGenerationException('이미지 대신 다른 형식의 응답을 받았습니다.');
      }

      final chunks = <int>[];
      await for (final chunk in response.timeout(const Duration(seconds: 150))) {
        chunks.addAll(chunk);
        if (chunks.length > 20 * 1024 * 1024) {
          throw const AiGenerationException('생성 이미지 용량이 너무 큽니다.');
        }
      }
      if (chunks.length < 1024) {
        throw const AiGenerationException('생성된 이미지 데이터가 비어 있습니다.');
      }
      return Uint8List.fromList(chunks);
    } on TimeoutException {
      throw const AiGenerationException('이미지 생성 시간이 너무 길어 연결을 종료했습니다. 다시 시도해 주세요.');
    } on SocketException {
      throw const AiGenerationException('인터넷 연결을 확인해 주세요.');
    } finally {
      client.close(force: true);
    }
  }

  static (int, int) _sizeForRatio(String ratio) {
    switch (ratio) {
      case '9:20':
        return (1080, 2400);
      case '9:16':
        return (1080, 1920);
      case '9:19.5':
      default:
        return (1080, 2340);
    }
  }
}

class AiGenerationException implements Exception {
  const AiGenerationException(this.message);
  final String message;
}

class _AuroraLoading extends StatelessWidget {
  const _AuroraLoading({required this.animation, required this.prompt});

  final Animation<double> animation;
  final String prompt;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final value = Curves.easeInOut.transform(animation.value);
        return ColoredBox(
          color: const Color(0xFF09090F),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned(
                left: -80 + 55 * value,
                top: 80,
                child: _GlowOrb(size: 260 + 40 * value, color: const Color(0xFF7357FF).withValues(alpha: 0.45)),
              ),
              Positioned(
                right: -90 + 35 * (1 - value),
                bottom: 120,
                child: _GlowOrb(size: 300 - 35 * value, color: const Color(0xFFFF5CB8).withValues(alpha: 0.30)),
              ),
              Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Transform.scale(
                        scale: 0.92 + 0.08 * value,
                        child: Container(
                          width: 74,
                          height: 74,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                          ),
                          child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 34),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text('배경화면을 그리고 있어요', style: TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 10),
                      Text(
                        prompt,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70, height: 1.45),
                      ),
                      const SizedBox(height: 24),
                      const SizedBox(width: 160, child: LinearProgressIndicator()),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [color, color.withValues(alpha: 0)],
        ),
      ),
    );
  }
}

class _TargetTile extends StatelessWidget {
  const _TargetTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(child: Icon(icon)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.55)),
      ),
      child: child,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.step, required this.title});

  final String step;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            step,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onPrimaryContainer,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(width: 9),
        Flexible(child: Text(title, style: theme.textTheme.titleMedium)),
      ],
    );
  }
}

class _ClockOverlay extends StatelessWidget {
  const _ClockOverlay();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Text('10:44', style: TextStyle(fontSize: 42, fontWeight: FontWeight.w300, color: Colors.white, shadows: [Shadow(blurRadius: 12, color: Colors.black54)])),
        SizedBox(height: 4),
        Text('9월 26일 토요일', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, shadows: [Shadow(blurRadius: 8, color: Colors.black54)])),
      ],
    );
  }
}

class _AppDockOverlay extends StatelessWidget {
  const _AppDockOverlay();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          Icon(Icons.phone_rounded, color: Colors.white),
          Icon(Icons.chat_bubble_rounded, color: Colors.white),
          Icon(Icons.language_rounded, color: Colors.white),
          Icon(Icons.camera_alt_rounded, color: Colors.white),
        ],
      ),
    );
  }
}
