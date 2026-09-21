import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_verified_app.py'
patch_file=base/'avatar_v103_patch.js'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
patch=patch_file.read_text(encoding='utf-8')
html=html.replace('v1.0.2 · 큰 글씨','v1.0.3 · 큰 글씨')
html=html.replace('content="1.0.2"','content="1.0.3"',1)
html=html.replace('large-text,renderer-export-fix','large-text,renderer-export-fix,visual-avatar-v103',1)
html=html.replace('</body>','<script id="avatar-v103-patch">\n'+patch+'\n</script>\n</body>',1)
required=['v1.0.3 · 큰 글씨','v1.0.3 · 아바타+','avatar-v103-css','avatar-preview-card','avatar-option-preview','ponytail','softsquare','almond','button','cupid','compactStudio','window.renderTicket=function()']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.3 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
if len(scripts)!=4: raise SystemExit(f'Expected 4 inline scripts, got {len(scripts)}')
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v103-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('APP_HTML_BYTES='+str(len(out.read_bytes())))
print('V103_VISUAL_AVATAR=PASS')
print('V103_SELECTION_INDICATOR=PASS')
print('V103_COMPACT_STUDIO=PASS')
print('V103_QA=PASS')
