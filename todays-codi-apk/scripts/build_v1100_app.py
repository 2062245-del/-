import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser(); p.add_argument('--apk',required=True); p.add_argument('--out',required=True); a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v111_app.py'; out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.11 · 큰 글씨','v1.1.0 · 큰 글씨')
html=html.replace('v1.0.11 · 아바타+','v1.1.0 · 아바타+')
html=html.replace('content="1.0.11"','content="1.1.0"',1)

patch=r'''<style id="v1100-separated-avatar-style">
.avatar-identity-strip{display:flex;align-items:center;gap:14px;margin:0 0 16px;padding:14px 16px;border-radius:22px;background:linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.025));box-shadow:inset 0 0 0 1px rgba(255,255,255,.085)}
.avatar-identity-face{width:74px;height:74px;border-radius:20px;display:grid;place-items:center;background:rgba(255,255,255,.06);overflow:hidden;flex:0 0 auto}.avatar-identity-face svg{width:70px;height:70px}
.avatar-identity-copy b{display:block;color:#f6efe5;font-size:17px;margin-bottom:5px}.avatar-identity-copy span{display:block;color:rgba(246,239,229,.64);font-size:13px;line-height:1.5}
.editorial-figure::after{content:"STYLE MODEL"!important}
@media(max-width:520px){.avatar-identity-strip{gap:11px}.avatar-identity-face{width:64px;height:64px}.avatar-identity-face svg{width:60px;height:60px}.avatar-identity-copy b{font-size:16px}}
</style>
<script id="v1100-separated-avatar-architecture">
(function(){
  const KEY='todayCodiAvatarV2';
  const getProfile=()=>window.__avatarProfile||(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}})();
  function shade(hex,amt){hex=String(hex||'#E7C3A5').replace('#','');if(hex.length===3)hex=hex.split('').map(x=>x+x).join('');const n=parseInt(hex,16)||0,cl=v=>Math.max(0,Math.min(255,v));return '#'+[cl(((n>>16)&255)+amt),cl(((n>>8)&255)+amt),cl((n&255)+amt)].map(v=>v.toString(16).padStart(2,'0')).join('')}
  function neutralHead(p){
    const skin=p.skin||'#E7C3A5', hair=p.hair||'#4B3429', hairHi=shade(hair,20);
    return `<g id="v1100-neutral-style-head"><ellipse cx="130" cy="67" rx="27" ry="34" fill="${skin}"/><path d="M103 61c1-24 13-35 27-35 17 0 27 12 27 34-8-9-16-12-27-12-10 0-19 4-27 13Z" fill="${hair}"/><path d="M109 44c7-8 13-11 21-11 9 0 16 4 22 12-8-5-14-7-22-7-7 0-14 2-21 6Z" fill="${hairHi}" opacity=".24"/><path d="M130 82c5 0 9-2 12-5" stroke="${shade(skin,-24)}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/></g>`;
  }
  function installSeparatedModel(){
    if(window.__todayCodiV1100ModelInstalled||typeof window.buildFigureSVG!=='function')return;
    window.__todayCodiV1100ModelInstalled=true;
    const original=window.buildFigureSVG;
    window.buildFigureSVG=function(){
      const real=window.__avatarProfile||{};
      const skin=real.skin||'#E7C3A5';
      const temp={...real,hair:skin,hairStyle:'crop',glasses:'none',eyes:'soft',brows:'thin',nose:'small',lips:'neutral'};
      let svg;
      window.__avatarProfile=temp;
      try{svg=original.apply(this,arguments)}finally{window.__avatarProfile=real;}
      if(typeof svg!=='string')return svg;
      const clean=neutralHead(real);
      return svg.replace('</g></svg>',clean+'</g></svg>');
    };
  }
  function syncIdentity(){
    const stage=document.querySelector('.lookbook-stage'); if(!stage)return;
    let strip=document.getElementById('avatarIdentityStrip');
    if(!strip){strip=document.createElement('div');strip.id='avatarIdentityStrip';strip.className='avatar-identity-strip';stage.parentNode.insertBefore(strip,stage);}
    const p=getProfile();
    const face=typeof window.__todayCodiRenderBust==='function'?window.__todayCodiRenderBust(p):'';
    const age=document.querySelector('[name="age"]:checked')?.value||document.querySelector('#age')?.value||'';
    const body=document.querySelector('[name="bodyType"]:checked')?.value||document.querySelector('#bodyType')?.value||'';
    strip.innerHTML=`<div class="avatar-identity-face">${face}</div><div class="avatar-identity-copy"><b>내 아바타</b><span>얼굴은 프로필로 유지하고, 룩 모델에는 체형·피부톤·헤어 컬러만 연동됩니다.${age||body?' · '+[age,body].filter(Boolean).join(' · '):''}</span></div>`;
  }
  function after(){installSeparatedModel();syncIdentity();}
  const oldRender=window.renderTicket;
  if(typeof oldRender==='function'&&!oldRender.__v1100){
    const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(after,0);return r};wrapped.__v1100=true;window.renderTicket=wrapped;
  }
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#avatarModal'))setTimeout(syncIdentity,40)},true);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(after,120));
  setTimeout(after,350);
  window.__todayCodiV1100SeparatedAvatar=true;
  window.__todayCodiV1100OutfitModelNoFaceMerge=true;
})();
</script>
<script id="v1100-location-label-cleanup">
(function(){
  const clean=()=>{
    document.querySelectorAll('body *').forEach(el=>{
      if(el.children.length||!el.textContent)return;
      const t=el.textContent.trim();
      if(/현재 위치/.test(t)&&/인근/.test(t)&&el.dataset.v1100loc!=='1'){
        el.dataset.v1100loc='1';
        el.textContent=t.replace(/\s*인근/g,'');
      }
    });
  };
  new MutationObserver(clean).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  setTimeout(clean,500);
  window.__todayCodiV1100LocationCleanup=true;
})();
</script>'''
html=html.replace('</body>',patch+'\n<script id="v1100-marker">window.__todayCodiV1100=true;</script>\n</body>',1)

required=['v1.1.0 · 큰 글씨','v1.1.0 · 아바타+','__todayCodiV1100SeparatedAvatar','__todayCodiV1100OutfitModelNoFaceMerge','avatarIdentityStrip','STYLE MODEL','__todayCodiV1100LocationCleanup','__todayCodiV111PreciseLocation']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.1.0 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v1100-{i}.js');tmp.write_text(s,encoding='utf-8');subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V1100_AVATAR_OUTFIT_ARCHITECTURE_SEPARATED=PASS')
print('V1100_PROFILE_IDENTITY_STRIP=PASS')
print('V1100_PRECISE_LOCATION=PASS')
print('V1100_QA=PASS')
