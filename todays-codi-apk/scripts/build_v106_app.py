import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v105_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.5 · 큰 글씨','v1.0.6 · 큰 글씨')
html=html.replace('v1.0.5 · 아바타+','v1.0.6 · 아바타+')
html=html.replace('content="1.0.5"','content="1.0.6"',1)
fix=r'''<style id="v106-avatar-viewport-fix">
#avatarModal.open{display:flex!important;position:absolute!important;left:0!important;right:0!important;width:100%!important;z-index:2147483000!important;align-items:center!important;justify-content:center!important;padding:12px!important;box-sizing:border-box!important}
#avatarModal .avatar-sheet{margin:0!important;max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch!important}
</style>
<script id="v106-avatar-viewport-fix-script">
(function(){
  const prev=window.openAvatarEditor;
  window.openAvatarEditor=function(){
    const y=window.scrollY||document.documentElement.scrollTop||0;
    if(typeof prev==='function') prev();
    const m=document.getElementById('avatarModal'); if(!m)return;
    const vh=Math.max(320,Math.floor((window.visualViewport&&window.visualViewport.height)||window.innerHeight||document.documentElement.clientHeight));
    if(m.parentElement!==document.body) document.body.appendChild(m);
    m.style.position='absolute';m.style.top=y+'px';m.style.left='0';m.style.right='0';m.style.width='100%';m.style.height=vh+'px';m.style.minHeight=vh+'px';m.style.zIndex='2147483000';
    m.classList.add('open');
    const sheet=m.querySelector('.avatar-sheet'); if(sheet){sheet.style.maxHeight=Math.max(280,vh-24)+'px';sheet.scrollTop=0;}
    requestAnimationFrame(()=>{m.style.top=((window.scrollY||document.documentElement.scrollTop||0))+'px';});
  };
  window.__todayCodiAvatarV106ViewportFix=true;
})();
</script>'''
html=html.replace('</body>',fix+'\n</body>',1)
required=['v1.0.6 · 큰 글씨','v1.0.6 · 아바타+','v106-avatar-viewport-fix','__todayCodiAvatarV106ViewportFix','visualViewport.height','m.style.top=y']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.6 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v106-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V106_VIEWPORT_MODAL=PASS')
print('V106_QA=PASS')
