# Today Codi v1.0.2 hotfix builder: renderer export fix + avatar entry + large-text readability
import argparse, base64, gzip, hashlib, pathlib, re, subprocess, zipfile

p=argparse.ArgumentParser()
p.add_argument('--apk', required=True)
p.add_argument('--out', required=True)
a=p.parse_args()

with zipfile.ZipFile(a.apk) as z:
    def txt(name): return z.read('assets/'+name).decode('utf-8').strip()
    base64_src=''.join(txt(f'part{i}.txt') for i in (5,6,7,8,9,10,3))
    editorial64=''.join(txt(f'upgrade{i}.txt') for i in (1,2,3))
    avatar64=''.join(txt(f'upgrade{i}.txt') for i in (4,5,6))

html=gzip.decompress(base64.b64decode(base64_src)).decode('utf-8')
editorial=gzip.decompress(base64.b64decode(editorial64)).decode('utf-8')
avatar=gzip.decompress(base64.b64decode(avatar64)).decode('utf-8')

editorial_marker='window.__TODAY_CODI_EDITORIAL_V1__=true;'
if editorial_marker not in editorial:
    raise SystemExit('Editorial export marker missing')
editorial=editorial.replace(editorial_marker,'window.renderTicket=renderTicket;\n'+editorial_marker,1)

avatar_entry_needle="window.openAvatarEditor=function(){buildModal();document.getElementById('avatarModal').classList.add('open')};"
if avatar_entry_needle not in avatar:
    raise SystemExit('Avatar editor entry marker missing')
avatar_entry_patch=avatar_entry_needle+'''\n  function ensureAvatarHeaderEntry(){\n    if(document.getElementById('avatarHeaderBtn')) return;\n    const host=document.querySelector('.masthead-right') || document.querySelector('.masthead');\n    if(!host) return;\n    const btn=document.createElement('button');\n    btn.id='avatarHeaderBtn';\n    btn.type='button';\n    btn.className='mast-btn avatar-header-btn';\n    btn.textContent='내 아바타';\n    btn.addEventListener('click',window.openAvatarEditor);\n    host.insertBefore(btn,host.firstChild);\n  }\n  ensureAvatarHeaderEntry();'''
avatar=avatar.replace(avatar_entry_needle,avatar_entry_patch,1)

native='''<script id="native-apk-bridge">
(function(){
  if(!window.AndroidApp) return;
  window.NativeGeo={getCurrentPosition:function(success,error,options){
    window.__nativeGeoSuccess=function(lat,lng,acc,name){success({coords:{latitude:Number(lat),longitude:Number(lng),accuracy:Number(acc||0)},locationName:String(name||'')});};
    window.__nativeGeoError=function(msg){if(error)error({code:1,message:String(msg||'위치를 확인하지 못했습니다.')});};
    AndroidApp.requestLocation();
  }};
  document.documentElement.classList.add('native-apk');
  document.addEventListener('DOMContentLoaded',function(){
    var b=document.getElementById('installAppBtn');if(b)b.style.display='none';
    document.body&&document.body.setAttribute('data-native-app','android');
    var host=document.querySelector('.masthead-right')||document.querySelector('.masthead');
    if(host&&!document.getElementById('versionReadabilityBadge')){
      var badge=document.createElement('span');
      badge.id='versionReadabilityBadge';
      badge.className='version-readability-badge';
      badge.textContent='v1.0.2 · 큰 글씨';
      host.appendChild(badge);
    }
  });
})();
</script>'''

readability='''<style id="readability-v102">
.version-readability-badge{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,139,103,.35);background:rgba(255,139,103,.12);color:#ff9a78;font-size:12px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.avatar-header-btn{border-color:rgba(255,139,103,.42)!important;color:#fff3ea!important;background:rgba(255,139,103,.12)!important;font-weight:700!important}
label,.hint,.section-label,.figure-caption,.look-item .look-label,.look-item .sub,.fabric-line,.option-label,.match-sentence,.history-card,.block-kicker,.weather-summary-title,.weather-summary-sub,.weather-summary-item span,.hour-time,.hour-sky,.hour-rain,.weather-mini-note,.weather-ticket-item span,.location-mode-note,.daypart-label,.daypart-weather,.daypart-style,.tpo-detail-head span,.outdoor-ratio-top,.tpo-ticket p{line-height:1.62!important}
@media (max-width:640px){
  .masthead-right{row-gap:10px!important}
  .version-readability-badge{font-size:12px;padding:7px 10px}
  .chip{min-height:38px!important;display:inline-flex!important;align-items:center!important}
  .mast-btn,.ghost-btn,.primary-btn{min-height:40px!important}
  input,select,textarea{min-height:44px!important}
}
</style>'''

html=html.replace('navigator.geolocation.getCurrentPosition','window.NativeGeo.getCurrentPosition')
html=html.replace('</head>',native+'\n'+readability+'\n</head>',1) if '</head>' in html else native+readability+html
upgrades='<script id="today-codi-verified-upgrades">'+editorial+'\n'+avatar+'</script>'
html=html.replace('</body>',upgrades+'\n</body>',1) if '</body>' in html else html+upgrades

replacements={
'@keyframes panelSheen{0%,72%,100%{transform:translateX(-115%)}84%{transform:translateX(115%)}}':'@keyframes panelSheen{0%,100%{opacity:0}50%{opacity:.08}}',
'#weatherFx .fx-drop{position:absolute;top:-15vh;width:1px;height:12vh;background:linear-gradient(transparent,rgba(189,218,255,.58));transform:rotate(8deg);animation:rainFall linear infinite;}':'#weatherFx .fx-drop{position:absolute;top:-15vh;width:1px;height:12vh;background:linear-gradient(transparent,rgba(189,218,255,.58));animation:rainFall linear infinite;}',
'@keyframes rainFall{to{transform:translate3d(-9vw,120vh,0) rotate(8deg)}}':'@keyframes rainFall{to{transform:translate3d(0,120vh,0)}}',
'@keyframes snowFall{0%{transform:translate3d(0,-8vh,0) rotate(0)}50%{transform:translate3d(4vw,52vh,0) rotate(180deg)}100%{transform:translate3d(-2vw,112vh,0) rotate(360deg)}}':'@keyframes snowFall{0%{transform:translate3d(0,-8vh,0) rotate(0)}100%{transform:translate3d(0,112vh,0) rotate(360deg)}}',
'#weatherFx .fx-cloud{position:absolute;width:42vw;height:16vw;max-height:120px;border-radius:50%;background:radial-gradient(ellipse,rgba(215,220,225,.10),rgba(215,220,225,0) 70%);filter:blur(9px);animation:cloudDrift 18s ease-in-out infinite alternate;}':'#weatherFx .fx-cloud{position:absolute;width:42vw;height:16vw;max-height:120px;border-radius:50%;background:radial-gradient(ellipse,rgba(215,220,225,.10),rgba(215,220,225,0) 70%);filter:blur(9px);}',
'@keyframes cloudDrift{from{transform:translateX(-8vw)}to{transform:translateX(28vw)}}':'@keyframes cloudDrift{from{opacity:.8}to{opacity:.8}}',
'#weatherFx .fx-wind{position:absolute;left:-30vw;width:28vw;height:1px;background:linear-gradient(90deg,transparent,rgba(235,238,231,.38),transparent);animation:windSweep linear infinite;}':'#weatherFx .fx-wind{display:none!important;}',
'@keyframes windSweep{to{transform:translateX(150vw)}}':'@keyframes windSweep{to{opacity:0}}',
"el.className='fx-wind'":"el.className='fx-wind-disabled'",
}
for old,new in replacements.items(): html=html.replace(old,new)
html=html.replace('<title>오늘의 코디</title>','<title>오늘의 코디</title><meta name="today-codi-version" content="1.0.2"><meta name="package-compat-version" content="1.0.1"><meta name="today-codi-features" content="avatar,editorial-lookbook,teen,native-location,no-horizontal-weather,fashion-icon,large-text,renderer-export-fix">',1)

required=[
    '내 아바타','학교·학원','친구 약속','LOOK 01','SOFT AUTHORITY',
    'window.NativeGeo.getCurrentPosition','content="1.0.2"','content="1.0.1"',
    'window.renderTicket=renderTicket;','avatarHeaderBtn','v1.0.2 · 큰 글씨','readability-v102'
]
missing=[x for x in required if x not in html]
if missing: raise SystemExit('Missing required markers: '+repr(missing))
forbidden=['animation:cloudDrift','animation:windSweep','translateX(150vw)','translateX(28vw)']
found=[x for x in forbidden if x in html]
if found: raise SystemExit('Forbidden motion markers remain: '+repr(found))

export_pos=html.find('window.renderTicket=renderTicket;')
wrapper_pos=html.find('window.__originalRenderTicket=window.renderTicket;')
if not (export_pos >= 0 and wrapper_pos > export_pos):
    raise SystemExit(f'Renderer export ordering invalid: export={export_pos}, wrapper={wrapper_pos}')

scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
if len(scripts)!=3: raise SystemExit(f'Expected exactly 3 inline scripts, found {len(scripts)}')
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-{i}.js')
    tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)

out=pathlib.Path(a.out)
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('APP_HTML_BYTES='+str(len(out.read_bytes())))
print('RENDERER_EXPORT_ORDER=PASS')
print('AVATAR_HEADER_ENTRY=PASS')
print('LARGE_TEXT_LAYER=PASS')
print('APP_QA=PASS')
