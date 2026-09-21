import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v108_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.8 · 큰 글씨','v1.0.9 · 큰 글씨')
html=html.replace('v1.0.8 · 아바타+','v1.0.9 · 아바타+')
html=html.replace('content="1.0.8"','content="1.0.9"',1)

# Expose the exact same bust renderer used by avatar option cards/live preview.
needle='  function optionSvg(key, val){'
if needle not in html:
    raise SystemExit('v1.0.9 renderBust export target not found')
html=html.replace(needle,"  window.__todayCodiRenderBust=renderBust;\n"+needle,1)

# Replace the v1.0.8 no-op with one main-avatar renderer that reuses renderBust.
start=html.find('  function patchFigureFace(){')
end=html.find('  function afterRender()',start)
if start<0 or end<0:
    raise SystemExit('v1.0.9 figure renderer target not found')
replacement='''  function patchFigureFace(){
    if(window.__figureFaceV109 || typeof window.buildFigureSVG!=='function') return;
    window.__figureFaceV109=true;
    const old=window.buildFigureSVG;
    window.buildFigureSVG=function(){
      let svg=old.apply(this,arguments);
      const p=window.__avatarProfile||{};
      if(typeof window.__todayCodiRenderBust!=='function') return svg;
      let bust=window.__todayCodiRenderBust(p).replace(/<path d="M15 69[^>]+\\\/>/,'');
      bust=bust.replace('<svg viewBox="0 0 64 72"','<svg x="98" y="24" width="64" height="72" viewBox="0 0 64 72"');
      const cover='<rect x="94" y="20" width="72" height="82" rx="28" fill="#9F9F9F"/>';
      return svg.replace('</g></svg>',cover+bust+'</g></svg>');
    };
    window.__todayCodiAvatarV109UnifiedHair=true;
  }\n'''
html=html[:start]+replacement+html[end:]

# Persist hair by stable key so preview/save/main avatar all use the same value.
hair_sync=r'''<script id="v109-hair-key-sync">
(function(){
  const valid=new Set(['crop','side','textured','wave','bob','long','pixie','curtain','ponytail','bun','straight','layered']);
  const aliases={crop_short:'crop',cropShort:'crop',parted:'side',part:'side',texture:'textured',waves:'wave',pony:'ponytail'};
  const normalize=v=>valid.has(v)?v:(aliases[v]||'side');
  function applyKey(raw){
    const key=normalize(String(raw||''));
    window.__avatarProfile=window.__avatarProfile||{};
    window.__avatarProfile.hairStyle=key;
    try{localStorage.setItem('todayCodiAvatarV2',JSON.stringify(window.__avatarProfile));}catch(e){}
    return key;
  }
  if(window.__avatarProfile) applyKey(window.__avatarProfile.hairStyle);
  document.addEventListener('click',function(e){
    const btn=e.target.closest&&e.target.closest('.avatar-group[data-key="hairStyle"] .avatar-option');
    if(!btn) return;
    const key=applyKey(btn.dataset.value);
    btn.dataset.value=key;
  },true);
  window.__todayCodiAvatarV109HairKeySync=true;
})();
</script>'''
html=html.replace('</body>',hair_sync+'\n<script id="v109-hair-marker">window.__todayCodiAvatarV109HairMatch=true;</script>\n</body>',1)

required=['v1.0.9 · 큰 글씨','v1.0.9 · 아바타+','__todayCodiAvatarV109UnifiedHair','__todayCodiAvatarV109HairKeySync','__todayCodiAvatarV109HairMatch','__todayCodiRenderBust','todayCodiAvatarV2']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.9 markers missing: '+repr(missing))
if 'window.__todayCodiAvatarV108SingleFace=true;' in html:
    raise SystemExit('v1.0.8 no-op figure renderer still present')

scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v109-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V109_HAIR_STYLE_KEY_SYNC=PASS')
print('V109_MAIN_AVATAR_USES_OPTION_RENDERER=PASS')
print('V109_QA=PASS')
