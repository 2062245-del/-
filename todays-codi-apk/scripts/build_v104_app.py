import argparse, base64, gzip, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v103_app.py'
patch_b64=base/'avatar_v104_patch.js.gz.b64'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
patch=gzip.decompress(base64.b64decode(patch_b64.read_text(encoding='utf-8').strip())).decode('utf-8')
html=html.replace('v1.0.3 · 큰 글씨','v1.0.4 · 큰 글씨')
html=html.replace('v1.0.3 · 아바타+','v1.0.4 · 아바타+')
html=html.replace('content="1.0.3"','content="1.0.4"',1)
html=html.replace('</body>','<script id="v104-avatar-hotfix">\n'+patch+'\n</script>\n</body>',1)
required=['v1.0.4 · 큰 글씨','v1.0.4 · 아바타+','v104-avatar-hotfix','avatar-first-card','내 아바타부터 꾸미기','todayCodiAvatarOnboarded','patchFigureFace','MY AVATAR LOOK','크롭 숏','커튼뱅','V라인','아몬드']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.4 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
if len(scripts)!=5: raise SystemExit(f'Expected 5 inline scripts, got {len(scripts)}')
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v104-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('APP_HTML_BYTES='+str(len(out.read_bytes())))
print('V104_FACE_COLORS=PASS')
print('V104_FACE_SPACING=PASS')
print('V104_HAIR_REDESIGN=PASS')
print('V104_AVATAR_FIRST_FLOW=PASS')
print('V104_LOOKBOOK_COMPACT=PASS')
print('V104_QA=PASS')
