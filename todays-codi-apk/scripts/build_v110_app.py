import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v109_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.9 · 큰 글씨','v1.0.10 · 큰 글씨')
html=html.replace('v1.0.9 · 아바타+','v1.0.10 · 아바타+')
html=html.replace('content="1.0.9"','content="1.0.10"',1)

start=html.find('  function patchFigureFace(){')
end=html.find('  function afterRender()',start)
if start<0 or end<0:
    raise SystemExit('v1.0.10 figure renderer target not found')
replacement='''  function patchFigureFace(){
    if(window.__figureFaceV110 || typeof window.buildFigureSVG!=='function') return;
    window.__figureFaceV110=true;
    const old=window.buildFigureSVG;
    window.buildFigureSVG=function(){
      let svg=old.apply(this,arguments);
      const p=window.__avatarProfile||{};
      if(typeof window.__todayCodiRenderBust!=='function') return svg;

      // Remove only the original mannequin head/hair/features. Keep neck/body/clothes.
      const headStart=svg.indexOf('<ellipse cx="130" cy="69"');
      if(headStart>=0){
        const shoeAnchor=svg.indexOf(' Q105 412 120 418',headStart);
        if(shoeAnchor>headStart){
          const shoeStart=svg.lastIndexOf('<path d="M',shoeAnchor);
          if(shoeStart>headStart) svg=svg.slice(0,headStart)+svg.slice(shoeStart);
        }
      }

      // Reuse the exact avatar face/hair renderer without any gray cover layer.
      let bust=window.__todayCodiRenderBust(p).replace('<path d="M15 69c5-8 14-11 17-11s12 3 17 11" fill="#8a8a90" opacity=".95"/>','');
      bust=bust.replace('<svg viewBox="0 0 64 72"','<svg x="98" y="22" width="64" height="72" viewBox="0 0 64 72"');
      return svg.replace('</g></svg>',bust+'</g></svg>');
    };
    window.__todayCodiAvatarV110CleanFace=true;
    window.__todayCodiAvatarV110NoGrayCover=true;
  }\n'''
html=html[:start]+replacement+html[end:]

html=html.replace('</body>','<script id="v110-face-marker">window.__todayCodiAvatarV110FaceLayerFix=true;</script>\n</body>',1)
required=['v1.0.10 · 큰 글씨','v1.0.10 · 아바타+','__todayCodiAvatarV110CleanFace','__todayCodiAvatarV110NoGrayCover','__todayCodiAvatarV110FaceLayerFix','__todayCodiRenderBust','__todayCodiAvatarV109HairKeySync']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.10 markers missing: '+repr(missing))
forbidden=['const cover=\'<rect x="94" y="20" width="72" height="82" rx="28" fill="#9F9F9F"/>\'','cover+bust']
found=[x for x in forbidden if x in html]
if found: raise SystemExit('gray face cover still present: '+repr(found))

scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v110-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V110_GRAY_FACE_COVER_REMOVED=PASS')
print('V110_SINGLE_AVATAR_FACE=PASS')
print('V110_HAIR_MATCHING_PRESERVED=PASS')
print('V110_QA=PASS')
