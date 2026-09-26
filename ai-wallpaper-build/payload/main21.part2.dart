                      onPressed: () async {
                        await NativeBridge.clearPublishableKey();
                        if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                        if (mounted) _showMessage('App Key와 사용자 승인을 삭제했습니다.');
                      },
                      icon: const Icon(Icons.delete_outline_rounded),
                      label: const Text('연결 정보 초기화'),
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
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        centerTitle: false,
        titleSpacing: 20,
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [scheme.primary, scheme.tertiary],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 11),
            const Text('AI 배경화면', style: TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'AI 연결 설정',
            onPressed: _openSettings,
            icon: const Icon(Icons.settings_outlined),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final horizontal = constraints.maxWidth >= 840;
            final content = horizontal
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(flex: 6, child: _buildControls()),
                      const SizedBox(width: 22),
                      Expanded(flex: 4, child: _buildMiniPreview()),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildHero(),
                      const SizedBox(height: 22),
                      _buildPromptCard(),
                      const SizedBox(height: 24),
                      _buildStyleSelector(),
                      const SizedBox(height: 24),
                      _buildRatioSelector(),
                      const SizedBox(height: 116),
                    ],
                  );

            return Stack(
              children: [
                SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(horizontal ? 32 : 20, 14, horizontal ? 32 : 20, 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1120),
                    child: Center(child: content),
                  ),
                ),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _buildGenerateBar(horizontal),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildHero(),
        const SizedBox(height: 22),
        _buildPromptCard(),
        const SizedBox(height: 24),
        _buildStyleSelector(),
        const SizedBox(height: 24),
        _buildRatioSelector(),
        const SizedBox(height: 100),
      ],
    );
  }

  Widget _buildHero() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('한 문장으로\n나만의 화면을 만드세요.', style: theme.textTheme.headlineMedium),
        const SizedBox(height: 10),
        Text(
          '프롬프트 → 생성 → 적용. 핵심 동작은 3번의 터치로 끝냅니다.',
          style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  Widget _buildPromptCard() {
    final theme = Theme.of(context);
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: _SectionTitle(step: '01', title: '어떤 화면을 만들까요?')),
              FilledButton.tonalIcon(
                onPressed: _fillRandomPrompt,
                icon: const Icon(Icons.casino_rounded, size: 18),
                label: const Text('랜덤'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _promptController,
            minLines: 3,
            maxLines: 5,
            maxLength: 240,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: '예: 보랏빛 은하와 유리 행성, 여백이 넓은 미니멀 우주 풍경',
              counterText: '',
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(Icons.lightbulb_outline_rounded, size: 17, color: theme.colorScheme.primary),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  '피사체 + 분위기 + 색감 순으로 적으면 결과를 예측하기 쉽습니다.',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStyleSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle(step: '02', title: '스타일 선택'),
        const SizedBox(height: 12),
        SizedBox(
          height: 64,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _styles.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final item = _styles[index];
              final selected = index == _selectedStyle;
              return ChoiceChip(
                selected: selected,
                onSelected: (_) => setState(() => _selectedStyle = index),
                avatar: Icon(item.icon, size: 18),
                label: Text(item.label),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildRatioSelector() {
    final theme = Theme.of(context);
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle(step: '03', title: '내 화면 비율'),
          const SizedBox(height: 14),
          SegmentedButton<int>(
            showSelectedIcon: false,
            segments: [
              for (var i = 0; i < _ratios.length; i++)
                ButtonSegment<int>(
                  value: i,
                  label: Text(_ratios[i]),
                  icon: const Icon(Icons.smartphone_rounded, size: 18),
                ),
            ],
            selected: {_selectedRatio},
            onSelectionChanged: (value) => setState(() => _selectedRatio = value.first),
          ),
          const SizedBox(height: 12),
          Text(
            '선택한 비율에 맞춰 세로형 AI 이미지를 생성합니다.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniPreview() {
    final scheme = Theme.of(context).colorScheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle(step: 'PREVIEW', title: '잠금화면 가이드'),
          const SizedBox(height: 18),
          Center(
            child: AspectRatio(
              aspectRatio: 9 / 19.5,
              child: Container(
                constraints: const BoxConstraints(maxHeight: 560),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(34),
                  gradient: LinearGradient(
                    colors: [scheme.primaryContainer, scheme.tertiaryContainer],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(color: scheme.shadow.withValues(alpha: 0.16), blurRadius: 26, offset: const Offset(0, 12)),
                  ],
                ),
                child: const Stack(
                  children: [
                    Positioned(top: 48, left: 0, right: 0, child: _ClockOverlay()),
                    Positioned(left: 22, right: 22, bottom: 24, child: _AppDockOverlay()),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            '생성 후 실제 이미지 위에서 시계와 앱 아이콘 겹침을 확인할 수 있습니다.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _buildGenerateBar(bool wide) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.96),
        border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.55))),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(wide ? 32 : 20, 12, wide ? 32 : 20, 12),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1120),
              child: FilledButton.icon(
                onPressed: _handleGenerate,
                icon: const Icon(Icons.auto_awesome_rounded),
                label: const Text('AI 배경화면 만들기'),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class PollinationsAuthorizationPage extends StatefulWidget {
  const PollinationsAuthorizationPage({super.key, required this.appKey});

  final String appKey;

  @override
  State<PollinationsAuthorizationPage> createState() => _PollinationsAuthorizationPageState();
}

class _PollinationsAuthorizationPageState extends State<PollinationsAuthorizationPage> {
  DeviceAuthorizationSession? _session;
  String? _error;
  bool _openingBrowser = false;
  bool _cancelled = false;

  @override
  void initState() {
    super.initState();
    _startAuthorization();
  }

  @override
  void dispose() {
    _cancelled = true;
    super.dispose();
  }

  Future<void> _startAuthorization() async {
    setState(() {
      _error = null;
      _session = null;
    });
    try {
      final session = await PollinationsAuthService.requestDeviceCode(widget.appKey);
      if (!mounted || _cancelled) return;
      setState(() => _session = session);
      await _openApprovalPage();
      for (var attempt = 0; attempt < 60 && mounted && !_cancelled; attempt++) {
        final token = await PollinationsAuthService.pollDeviceToken(session.deviceCode);
        if (token != null) {
          await NativeBridge.setAccessToken(token);
          if (mounted) Navigator.of(context).pop(token);
          return;
        }
        await Future<void>.delayed(const Duration(seconds: 5));
      }
      if (mounted && !_cancelled) {
        setState(() => _error = '승인 시간이 만료되었습니다. 다시 연결해 주세요.');
      }
    } on AiGenerationException catch (e) {
      if (mounted && !_cancelled) setState(() => _error = e.message);
    } on PlatformException {
      if (mounted && !_cancelled) setState(() => _error = '승인 페이지를 열지 못했습니다. 다시 시도해 주세요.');
    }
  }

  Future<void> _openApprovalPage() async {
    final session = _session;
    if (session == null || _openingBrowser) return;
    setState(() => _openingBrowser = true);
    try {
      await NativeBridge.openExternalUrl(session.verificationUri);
    } finally {
      if (mounted) setState(() => _openingBrowser = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('AI 생성 연결')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: scheme.primaryContainer.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.verified_user_outlined, size: 30),
                    SizedBox(height: 12),
                    Text('개인 비밀키를 입력하지 않습니다.', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    SizedBox(height: 6),
