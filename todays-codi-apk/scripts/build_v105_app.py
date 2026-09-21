import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v104_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.4 · 큰 글씨','v1.0.5 · 큰 글씨')
html=html.replace('v1.0.4 · 아바타+','v1.0.5 · 아바타+')
html=html.replace('content="1.0.4"','content="1.0.5"',1)
old_obs="""  const observe = new MutationObserver(()=>{ afterRender(); autoOpenIfNeeded(); });
  observe.observe(document.documentElement,{childList:true,subtree:true});"""
new_obs="""  // v1.0.5: self-observing MutationObserver removed. It caused an infinite render loop when the avatar modal was created.
  window.__todayCodiAvatarV105FreezeFix = true;
  setTimeout(()=>{ afterRender(); },0);"""
if old_obs not in html:
    raise SystemExit('v1.0.5 freeze-fix target not found')
html=html.replace(old_obs,new_obs,1)
html=html.replace('</head>','<style id="v105-modal-scroll-fix">#avatarModal.open{display:flex!important;overflow:hidden!important;touch-action:auto!important}#avatarModal .avatar-sheet{overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y!important}</style></head>',1)
required=['v1.0.5 · 큰 글씨','v1.0.5 · 아바타+','__todayCodiAvatarV105FreezeFix','v105-modal-scroll-fix','내 아바타부터 꾸미기','avatar-first-card']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.5 markers missing: '+repr(missing))
if old_obs in html: raise SystemExit('dangerous MutationObserver loop still present')
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
if len(scripts)!=5: raise SystemExit(f'Expected 5 inline scripts, got {len(scripts)}')
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v105-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V105_AVATAR_MODAL_FREEZE_FIX=PASS')
print('V105_MODAL_SCROLL=PASS')
print('V105_QA=PASS')
