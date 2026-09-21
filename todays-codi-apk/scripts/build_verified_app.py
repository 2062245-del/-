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

native='''<script id="native-apk-bridge">
(function(){
  if(!window.AndroidApp) return;
  window.NativeGeo={getCurrentPosition:function(success,error,options){
    window.__nativeGeoSuccess=function(lat,lng,acc,name){success({coords:{latitude:Number(lat),longitude:Number(lng),accuracy:Number(acc||0)},locationName:String(name||'')});};
    window.__nativeGeoError=function(msg){if(error)error({code:1,message:String(msg||'위치를 확인하지 못했습니다.')});};
    AndroidApp.requestLocation();
  }};
  document.documentElement.classList.add('native-apk');
  document.addEventListener('DOMContentLoaded',function(){var b=document.getElementById('installAppBtn');if(b)b.style.display='none';document.body&&document.body.setAttribute('data-native-app','android');});
})();
</script>'''

html=html.replace('navigator.geolocation.getCurrentPosition','window.NativeGeo.getCurrentPosition')
html=html.replace('</head>',native+'\n</head>',1) if '</head>' in html else native+html
upgrades='<script id="today-codi-verified-upgrades">'+editorial+'\n'+avatar+'</script>'
html=html.replace('</body>',upgrades+'\n</body>',1) if '</body>' in html else html+upgrades

# v1.0.1 removes continuous horizontal/sweeping effects while keeping vertical weather effects.
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
html=html.replace('<title>오늘의 코디</title>','<title>오늘의 코디</title><meta name="today-codi-version" content="1.0.1"><meta name="today-codi-features" content="avatar,editorial-lookbook,teen,native-location,no-horizontal-weather,fashion-icon">',1)

required=['내 아바타','학교·학원','친구 약속','LOOK 01','SOFT AUTHORITY','window.NativeGeo.getCurrentPosition','content="1.0.1"']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('Missing required markers: '+repr(missing))
forbidden=['animation:cloudDrift','animation:windSweep','translateX(150vw)','translateX(28vw)']
found=[x for x in forbidden if x in html]
if found: raise SystemExit('Forbidden motion markers remain: '+repr(found))

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
print('APP_QA=PASS')
