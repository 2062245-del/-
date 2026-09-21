import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v107_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.7 · 큰 글씨','v1.0.8 · 큰 글씨')
html=html.replace('v1.0.7 · 아바타+','v1.0.8 · 아바타+')
html=html.replace('content="1.0.7"','content="1.0.8"',1)

old_face='''  function patchFigureFace(){
    if(window.__figureFaceV104 || typeof window.buildFigureSVG!=='function') return;
    window.__figureFaceV104=true;
    const old=window.buildFigureSVG;
    window.buildFigureSVG=function(){
      let svg=old.apply(this,arguments); const p=window.__avatarProfile||{};
      let bust=renderBust(p).replace(/<path d="M15 69[^>]+\\\/>/,'');
      bust=bust.replace('<svg viewBox="0 0 64 72"','<svg x="98" y="27" width="64" height="72" viewBox="0 0 64 72"');
      return svg.replace('</g></svg>',bust+'</g></svg>');
    };
  }'''
new_face='''  function patchFigureFace(){
    // v1.0.8: base figure renderer already contains the saved avatar face.
    // Do not append a second bust SVG on top of it.
    window.__figureFaceV104=true;
    window.__todayCodiAvatarV108SingleFace=true;
  }'''
if old_face not in html:
    raise SystemExit('v1.0.8 duplicate-face target not found')
html=html.replace(old_face,new_face,1)

html=html.replace('</body>','<script id="v108-single-face-marker">window.__todayCodiAvatarV108SingleFaceBuild=true;</script>\n</body>',1)
required=['v1.0.8 · 큰 글씨','v1.0.8 · 아바타+','__todayCodiAvatarV108SingleFace','v108-single-face-marker','__todayCodiAvatarV107GlassesContrast','__todayCodiAvatarV106ViewportFix']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.8 markers missing: '+repr(missing))
forbidden=['let bust=renderBust(p)','bust=bust.replace(\'<svg viewBox="0 0 64 72"\'']
found=[x for x in forbidden if x in html]
if found: raise SystemExit('duplicate avatar-face overlay still present: '+repr(found))

scripts=re.findall(r'<script\\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v108-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V108_SINGLE_AVATAR_FACE=PASS')
print('V108_QA=PASS')
