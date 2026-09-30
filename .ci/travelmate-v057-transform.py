from pathlib import Path

root = Path('build-src')
gradle = root / 'app/build.gradle'
main = root / 'app/src/main/java/com/seungho/barointerpreter/MainActivity.java'
helper_file = Path('.ci/travelmate-v057-pronunciation.java.txt')

gs = gradle.read_text()
gs = gs.replace('versionCode 12', 'versionCode 13').replace("versionName '0.5.6'", "versionName '0.5.7'")
if 'versionCode 13' not in gs or "versionName '0.5.7'" not in gs:
    raise SystemExit('version bump failed')
gradle.write_text(gs)

s = main.read_text()

if 'import java.text.Normalizer;' not in s:
    s = s.replace('import java.text.NumberFormat;\n', 'import java.text.NumberFormat;\nimport java.text.Normalizer;\n')

old = 'private TextView heardLangView, resultLangView, resultView, neuralStatusView;'
new = 'private TextView heardLangView, resultLangView, resultView, pronunciationView, neuralStatusView;'
if old not in s:
    raise SystemExit('field anchor missing')
s = s.replace(old, new, 1)

old = '''        resultView = text("번역 결과가 여기에 표시됩니다.", 22, true, INK); resultView.setMinHeight(dp(60)); resultView.setPadding(0, dp(10), 0, dp(8)); resultCard.addView(resultView);\n        LinearLayout resultActions = row(Gravity.CENTER_VERTICAL);\n'''
new = '''        resultView = text("번역 결과가 여기에 표시됩니다.", 22, true, INK); resultView.setMinHeight(dp(60)); resultView.setPadding(0, dp(10), 0, dp(4)); resultCard.addView(resultView);\n        pronunciationView = text("", 16, false, MUTED);\n        pronunciationView.setVisibility(View.GONE);\n        pronunciationView.setPadding(0, dp(2), 0, dp(6));\n        resultCard.addView(pronunciationView);\n        LinearLayout resultActions = row(Gravity.CENTER_VERTICAL);\n'''
if old not in s:
    raise SystemExit('result card anchor missing')
s = s.replace(old, new, 1)

old = '''        root.addView(section("여행 도구", "가장 자주 쓰는 기능만 한 번에 꺼냅니다."), topMargin(dp(22)));\n        LinearLayout toolRow1 = row(Gravity.CENTER);\n        Button phrases = toolButton("💬", "여행회화", "공항·택시·식당", Color.rgb(239, 246, 255)); phrases.setId(9901);\n        Button price = toolButton("💱", "가격 환산", "VND → 원화", Color.rgb(240, 253, 250)); price.setId(9902);\n        toolRow1.addView(phrases, new LinearLayout.LayoutParams(0, dp(108), 1f));\n        LinearLayout.LayoutParams t2 = new LinearLayout.LayoutParams(0, dp(108), 1f); t2.setMargins(dp(10), 0, 0, 0); toolRow1.addView(price, t2);\n        root.addView(toolRow1, topMargin(dp(9)));\n\n        LinearLayout toolRow2 = row(Gravity.CENTER);\n        Button walletBtn = toolButton("👛", "내 지갑", "잔액·소비 이력", Color.rgb(255, 247, 237)); walletBtn.setId(9903);\n        Button bigBtn = toolButton("🪧", "보여주기", "번역을 크게 표시", Color.rgb(250, 245, 255)); bigBtn.setId(9904);\n        toolRow2.addView(walletBtn, new LinearLayout.LayoutParams(0, dp(108), 1f));\n        LinearLayout.LayoutParams t4 = new LinearLayout.LayoutParams(0, dp(108), 1f); t4.setMargins(dp(10), 0, 0, 0); toolRow2.addView(bigBtn, t4);\n        root.addView(toolRow2, topMargin(dp(10)));\n'''
new = '''        root.addView(section("여행 도구", "가격 환산·내 지갑을 가장 먼저 꺼냅니다."), topMargin(dp(22)));\n        LinearLayout toolRow1 = row(Gravity.CENTER);\n        Button walletBtn = toolButton("👛", "내 지갑", "잔액·소비 이력", Color.rgb(255, 247, 237)); walletBtn.setId(9903);\n        Button price = toolButton("💱", "가격 환산", "VND → 원화", Color.rgb(240, 253, 250)); price.setId(9902);\n        toolRow1.addView(walletBtn, new LinearLayout.LayoutParams(0, dp(112), 1f));\n        LinearLayout.LayoutParams t2 = new LinearLayout.LayoutParams(0, dp(112), 1f); t2.setMargins(dp(10), 0, 0, 0); toolRow1.addView(price, t2);\n        root.addView(toolRow1, topMargin(dp(9)));\n\n        LinearLayout toolRow2 = row(Gravity.CENTER);\n        Button phrases = toolButton("💬", "여행회화", "공항·택시·식당", Color.rgb(239, 246, 255)); phrases.setId(9901);\n        Button bigBtn = toolButton("🪧", "보여주기", "번역을 크게 표시", Color.rgb(250, 245, 255)); bigBtn.setId(9904);\n        toolRow2.addView(phrases, new LinearLayout.LayoutParams(0, dp(104), 1f));\n        LinearLayout.LayoutParams t4 = new LinearLayout.LayoutParams(0, dp(104), 1f); t4.setMargins(dp(10), 0, 0, 0); toolRow2.addView(bigBtn, t4);\n        root.addView(toolRow2, topMargin(dp(10)));\n'''
if old not in s:
    raise SystemExit('tool grid anchor missing')
s = s.replace(old, new, 1)

old = '''        resultView.setText(result);\n        resultLangView.setText(to.nativeName);\n        setActivityStatus(optimized ? "여행회화 표현으로 번역 완료" : "번역 완료", GREEN);\n'''
new = '''        resultView.setText(result);\n        resultLangView.setText(to.nativeName);\n        updatePronunciation(result, to);\n        setActivityStatus(optimized ? "여행회화 표현으로 번역 완료" : "번역 완료", GREEN);\n'''
if old not in s:
    raise SystemExit('apply result anchor missing')
s = s.replace(old, new, 1)

anchor = '    private void speak(String text, LanguageProfile language) {'
if anchor not in s:
    raise SystemExit('speak anchor missing')
helper = helper_file.read_text()
s = s.replace(anchor, helper + anchor, 1)

old = '    private void clearConversation(){heardEdit.setText("");lastTranslation="";resultView.setText("번역 결과가 여기에 표시됩니다.");setActivityStatus("버튼을 누르고 말씀하세요",MUTED);} private void clearConversationForPairChange(){clearConversation();speakingFromLeft=true;}'
new = '''    private void clearConversation(){\n        heardEdit.setText("");\n        lastTranslation="";\n        resultView.setText("번역 결과가 여기에 표시됩니다.");\n        if(pronunciationView!=null){pronunciationView.setText("");pronunciationView.setVisibility(View.GONE);}\n        setActivityStatus("버튼을 누르고 말씀하세요",MUTED);\n    }\n    private void clearConversationForPairChange(){clearConversation();speakingFromLeft=true;}'''
if old not in s:
    raise SystemExit('clear conversation anchor missing')
s = s.replace(old, new, 1)

main.write_text(s)
print('TravelMate v0.5.7 transform applied')
