"""Keep the existing file origin and local storage, add honest Android push UI."""
import sys
from pathlib import Path
p=Path(sys.argv[1])
s=p.read_text()
old="async function mountPushControls(){const m=await pushModule();"
new="""async function mountPushControls(){if(location.protocol==='file:'){const enable=$('#enablePhonePush'),status=$('#pushServerStatus');if(status)status.textContent='APK에서는 앱 사용 중 가격 알림을 확인합니다. 앱을 닫은 뒤 받는 푸시는 Chrome 온라인 화면에서 따로 설정해 주세요. APK의 찜·알림 설정은 Chrome과 자동 공유되지 않습니다.';if(enable){enable.textContent='Chrome에서 푸시 설정';enable.onclick=()=>{location.href='https://2062245-del.github.io/-/ps-radar/preview-v2/';};}return;}const m=await pushModule();"""
assert old in s
s=s.replace(old,new,1)
s=s.replace("function queuePushSync(){","function queuePushSync(){if(location.protocol==='file:')return;",1)
s=s.replace("가격 알림 메뉴에서 휴대폰 푸시를 켜면 앱을 닫아도 서버가 수집 가격을 확인합니다.","APK를 닫은 뒤 받는 알림은 Chrome 온라인 화면에서 별도로 설정합니다.")
s=s.replace("푸시를 켜면 앱을 닫아도 약 20분 간격으로 조건을 확인합니다.","Chrome에서 푸시를 켜면 앱을 닫아도 약 20분 간격으로 조건을 확인합니다.")
assert "PS Radar 2.3.5" in s
assert "psr2-wish" in s
p.write_text(s)
print('Android adapter: local data keys and origin preserved; browser push route explicit.')
