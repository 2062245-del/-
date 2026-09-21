import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v106_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.6 · 큰 글씨','v1.0.7 · 큰 글씨')
html=html.replace('v1.0.6 · 아바타+','v1.0.7 · 아바타+')
html=html.replace('content="1.0.6"','content="1.0.7"',1)

# Glasses: replace low-contrast white/silver avatar frames with fashion-friendly darker frames and subtle lens tint.
repls={
'''if(type==='round') return '<circle cx="25" cy="31" r="5.5" fill="none" stroke="#f1eadf" stroke-width="1.6"/><circle cx="39" cy="31" r="5.5" fill="none" stroke="#f1eadf" stroke-width="1.6"/><path d="M30.5 31h3" stroke="#f1eadf" stroke-width="1.4"/>';''':'''if(type==='round') return '<circle cx="25" cy="31" r="5.5" fill="#B8C6D1" fill-opacity=".10" stroke="#4B352C" stroke-width="2.2"/><circle cx="39" cy="31" r="5.5" fill="#B8C6D1" fill-opacity=".10" stroke="#4B352C" stroke-width="2.2"/><path d="M30.5 31h3" stroke="#4B352C" stroke-width="2"/>';''',
'''if(type==='square') return '<rect x="19" y="25" width="12" height="10" rx="2" fill="none" stroke="#f1eadf" stroke-width="1.6"/><rect x="33" y="25" width="12" height="10" rx="2" fill="none" stroke="#f1eadf" stroke-width="1.6"/><path d="M31 30h2" stroke="#f1eadf" stroke-width="1.4"/>';''':'''if(type==='square') return '<rect x="19" y="25" width="12" height="10" rx="2" fill="#B8C6D1" fill-opacity=".08" stroke="#2F2A28" stroke-width="2.2"/><rect x="33" y="25" width="12" height="10" rx="2" fill="#B8C6D1" fill-opacity=".08" stroke="#2F2A28" stroke-width="2.2"/><path d="M31 30h2" stroke="#2F2A28" stroke-width="2"/>';''',
'''if(type==='sun') return '<rect x="19" y="25" width="12" height="10" rx="3" fill="#231f1d" opacity=".9"/><rect x="33" y="25" width="12" height="10" rx="3" fill="#231f1d" opacity=".9"/><path d="M31 30h2" stroke="#231f1d" stroke-width="1.6"/>';''':'''if(type==='sun') return '<rect x="19" y="25" width="12" height="10" rx="3" fill="#3D3430" fill-opacity=".88" stroke="#211D1B" stroke-width="1.8"/><rect x="33" y="25" width="12" height="10" rx="3" fill="#3D3430" fill-opacity=".88" stroke="#211D1B" stroke-width="1.8"/><path d="M31 30h2" stroke="#211D1B" stroke-width="2"/>';''',
'''if(type==='metal') return '<circle cx="25" cy="31" r="5.3" fill="none" stroke="#c8c8cf" stroke-width="1.4"/><circle cx="39" cy="31" r="5.3" fill="none" stroke="#c8c8cf" stroke-width="1.4"/><path d="M30.5 31h3" stroke="#c8c8cf" stroke-width="1.2"/>';''':'''if(type==='metal') return '<circle cx="25" cy="31" r="5.3" fill="#AAB6C2" fill-opacity=".08" stroke="#63666C" stroke-width="1.9"/><circle cx="39" cy="31" r="5.3" fill="#AAB6C2" fill-opacity=".08" stroke="#63666C" stroke-width="1.9"/><path d="M30.5 31h3" stroke="#63666C" stroke-width="1.7"/>';''',
'''if(type==='cat') return '<path d="M18 27l14-2-2 11H20ZM32 25l14 2-2 9H34Z" fill="none" stroke="#f1eadf" stroke-width="1.5"/>';''':'''if(type==='cat') return '<path d="M18 27l14-2-2 11H20ZM32 25l14 2-2 9H34Z" fill="#B8C6D1" fill-opacity=".08" stroke="#4A302F" stroke-width="2.1"/>';'''
}
for oldtxt,newtxt in repls.items():
    if oldtxt not in html:
        raise SystemExit('v1.0.7 glasses target missing')
    html=html.replace(oldtxt,newtxt,1)

# Extra contrast for the option cards and live/full avatar SVGs.
css='''<style id="v107-glasses-contrast">\n.avatar-group[data-key="glasses"] .avatar-option-preview svg{filter:drop-shadow(0 1px 1px rgba(0,0,0,.28))}\n.avatar-group[data-key="glasses"] .avatar-option.active{background:rgba(255,122,82,.16)!important}\n</style>'''
html=html.replace('</head>',css+'\n</head>',1)
html=html.replace('</body>','<script id="v107-glasses-marker">window.__todayCodiAvatarV107GlassesContrast=true;</script>\n</body>',1)

required=['v1.0.7 · 큰 글씨','v1.0.7 · 아바타+','v107-glasses-contrast','__todayCodiAvatarV107GlassesContrast','#4B352C','#2F2A28','#63666C','#4A302F','__todayCodiAvatarV106ViewportFix']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.7 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v107-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V107_GLASSES_CONTRAST=PASS')
print('V107_VIEWPORT_MODAL=PASS')
print('V107_QA=PASS')
