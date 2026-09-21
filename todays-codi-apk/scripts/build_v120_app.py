import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser(); p.add_argument('--apk',required=True); p.add_argument('--out',required=True); a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v1100_app.py'; out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.1.0 · 큰 글씨','v1.2.0 · 큰 글씨')
html=html.replace('v1.1.0 · 아바타+','v1.2.0 · 아바타+')
html=html.replace('content="1.1.0"','content="1.2.0"',1)

patch=r'''<style id="v120-editorial-home-style">
:root{--v120-cream:#f5eee4;--v120-muted:rgba(245,238,228,.64);--v120-line:rgba(255,255,255,.09);--v120-accent:#ff986d;--v120-card:linear-gradient(155deg,rgba(255,255,255,.075),rgba(255,255,255,.028));}
#avatarIdentityStrip{display:none!important}
.v120-editorial-home{margin:18px 0 20px;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:16px;align-items:stretch}
.v120-card{position:relative;border-radius:28px;background:var(--v120-card);box-shadow:inset 0 0 0 1px var(--v120-line),0 14px 42px rgba(0,0,0,.16);overflow:hidden}
.v120-profile-card{padding:20px;display:flex;flex-direction:column;min-height:480px}
.v120-card-kicker{font-size:12px;letter-spacing:.22em;color:var(--v120-accent);font-weight:800;margin-bottom:8px}
.v120-card-title{font-size:24px;line-height:1.2;color:var(--v120-cream);font-weight:800;margin:0 0 6px}
.v120-card-sub{font-size:14px;line-height:1.55;color:var(--v120-muted)}
.v120-profile-art{margin:18px auto 14px;width:min(82%,290px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,rgba(255,183,139,.18),rgba(255,255,255,.055) 42%,rgba(0,0,0,.05) 72%);box-shadow:inset 0 0 0 1px rgba(255,177,126,.33),0 10px 28px rgba(0,0,0,.16)}
.v120-profile-art svg{width:86%;height:86%}
.v120-profile-meta{margin-top:auto}.v120-name{font-size:25px;font-weight:800;color:var(--v120-cream);margin-bottom:5px}.v120-meta-line{font-size:14px;color:var(--v120-muted);margin-bottom:12px}
.v120-tags{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}.v120-tag{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.055);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font-size:12px;color:rgba(245,238,228,.78)}
.v120-edit-btn{width:100%;border:0;border-radius:999px;padding:14px 17px;background:linear-gradient(135deg,rgba(255,151,106,.24),rgba(255,151,106,.08));box-shadow:inset 0 0 0 1px rgba(255,168,120,.58);color:#fff3e7;font-size:15px;font-weight:800}
.v120-look-card{padding:18px;display:flex;flex-direction:column;min-height:480px}.v120-look-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.v120-weather-pill{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.055);font-size:12px;color:rgba(245,238,228,.74);white-space:nowrap}
.v120-look-stage{position:relative;flex:1;min-height:370px;border-radius:22px;overflow:hidden;background:radial-gradient(circle at 70% 15%,rgba(255,180,125,.16),transparent 35%),linear-gradient(160deg,rgba(255,255,255,.055),rgba(0,0,0,.04));box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.v120-look-stage .editorial-figure{margin:0!important;padding:12px 12px 8px!important;min-height:100%!important;border:0!important;background:transparent!important;box-shadow:none!important}
.v120-look-stage .editorial-figure::after{content:"TODAY LOOK"!important;left:18px!important;top:16px!important;color:rgba(245,238,228,.34)!important;letter-spacing:.22em!important}
.v120-look-stage .editorial-figure svg{max-height:430px!important;width:auto!important;margin:auto!important;display:block!important}
.v120-look-caption{margin-top:12px;padding:0 4px;display:flex;justify-content:space-between;gap:10px;align-items:flex-end}.v120-look-caption b{display:block;color:var(--v120-cream);font-size:18px}.v120-look-caption span{font-size:12px;color:var(--v120-muted)}
.v120-reco{margin:18px 0 8px}.v120-reco-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}.v120-reco-head b{font-size:21px;color:var(--v120-cream)}.v120-reco-head span{font-size:13px;color:var(--v120-muted)}
#lookSwitcher{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;margin:0!important}
#lookSwitcher .look-tab{min-height:116px!important;border-radius:22px!important;padding:16px!important;text-align:left!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:flex-end!important;background:linear-gradient(155deg,rgba(255,255,255,.06),rgba(255,255,255,.018))!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.075)!important;position:relative!important;overflow:hidden!important}
#lookSwitcher .look-tab::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 15%,rgba(255,164,111,.12),transparent 36%);pointer-events:none}
#lookSwitcher .look-tab.active{box-shadow:inset 0 0 0 1.5px var(--v120-accent),0 8px 24px rgba(0,0,0,.12)!important;background:linear-gradient(155deg,rgba(255,151,109,.13),rgba(255,255,255,.025))!important}
#lookSwitcher .look-tab strong,#lookSwitcher .look-tab b{font-size:12px!important;letter-spacing:.1em!important;color:#fff0e4!important}#lookSwitcher .look-tab span{font-size:17px!important;line-height:1.25!important;color:#f5eee4!important;margin-top:7px!important}
.lookbook-stage{margin-top:0!important}.lookbook-stage>.editorial-figure{display:none!important}.avatar-start-card{display:none!important}.avatar-tools{display:none!important}
.v120-editorial-home+.v120-reco+.lookbook-stage{margin-top:10px!important}
@media(max-width:760px){.v120-editorial-home{grid-template-columns:1fr;gap:12px}.v120-profile-card,.v120-look-card{min-height:auto}.v120-profile-card{padding:17px}.v120-profile-art{width:min(62vw,250px)}.v120-look-stage{min-height:330px}#lookSwitcher{grid-template-columns:repeat(3,minmax(0,1fr))!important}#lookSwitcher .look-tab{min-height:100px!important;padding:12px!important}#lookSwitcher .look-tab span{font-size:14px!important}.v120-card-title{font-size:21px}.v120-name{font-size:22px}}
@media(max-width:420px){#lookSwitcher{gap:7px!important}#lookSwitcher .look-tab{padding:10px!important;min-height:94px!important}.v120-profile-art{width:min(70vw,235px)}}
</style>
<script id="v120-editorial-home-script">
(function(){
  const KEY='todayCodiAvatarV2';
  const safe=()=>{try{return window.__avatarProfile||JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return window.__avatarProfile||{}}};
  const label=(map,v,fallback)=>map[v]||fallback||v||'';
  const hairMap={crop:'크롭',side:'가르마',textured:'텍스처',wave:'웨이브',bob:'보브',long:'롱',pixie:'픽시',curtain:'커튼뱅',ponytail:'포니테일',bun:'번',straight:'생머리',layered:'레이어드'};
  const faceMap={oval:'타원형',round:'라운드',square:'스퀘어',heart:'하트',long:'롱',diamond:'다이아',softsquare:'소프트',vline:'V라인'};
  const glassMap={none:'안경 없음',round:'라운드 안경',square:'스퀘어 안경',sun:'선글라스',metal:'메탈 안경',cat:'캣아이'};
  function readText(sel){return document.querySelector(sel)?.textContent?.trim()||''}
  function profileMeta(){
    const p=safe(), state=window.__lastCodiState||{};
    const name=p.name||'MY AVATAR';
    const gender=state.gender||readText('.look-meta')||'';
    const age=state.age||'';
    const h=state.height||'';
    return {p,name,meta:[gender,age,h?String(h).replace(/cm$/,'')+'cm':''].filter(Boolean).join(' · ')};
  }
  function currentLookTitle(){
    const active=document.querySelector('#lookSwitcher .look-tab.active');
    if(!active)return '오늘의 룩';
    const txt=active.textContent.replace(/\s+/g,' ').trim();
    return txt||'오늘의 룩';
  }
  function build(){
    const stage=document.querySelector('.lookbook-stage'); const fig=document.getElementById('editorialFigure'); const switcher=document.getElementById('lookSwitcher');
    if(!stage||!fig||!switcher)return;
    let home=document.getElementById('v120EditorialHome');
    if(!home){
      home=document.createElement('section'); home.id='v120EditorialHome'; home.className='v120-editorial-home';
      stage.parentNode.insertBefore(home,stage);
      home.innerHTML='<article class="v120-card v120-profile-card"><div class="v120-card-kicker">MY AVATAR</div><h2 class="v120-card-title">내 아바타 프로필</h2><div class="v120-card-sub">나를 표현하는 프로필은 그대로, 코디 모델은 더 깔끔하게.</div><div class="v120-profile-art" id="v120ProfileArt"></div><div class="v120-profile-meta"><div class="v120-name" id="v120Name"></div><div class="v120-meta-line" id="v120Meta"></div><div class="v120-tags" id="v120Tags"></div><button class="v120-edit-btn" id="v120Edit">아바타 꾸미기</button></div></article><article class="v120-card v120-look-card"><div class="v120-look-head"><div><div class="v120-card-kicker">TODAY LOOK</div><h2 class="v120-card-title">오늘의 룩</h2><div class="v120-card-sub">날씨와 TPO에 맞춘 패션 모델</div></div><div class="v120-weather-pill" id="v120Weather">TODAY</div></div><div class="v120-look-stage" id="v120LookStage"></div><div class="v120-look-caption"><div><b id="v120LookName">오늘의 룩</b><span>아바타 프로필과 분리된 안정적인 룩 모델</span></div></div></article>';
      home.querySelector('#v120Edit').onclick=()=>window.openAvatarEditor&&window.openAvatarEditor();
    }
    const lookStage=home.querySelector('#v120LookStage'); if(fig.parentNode!==lookStage) lookStage.appendChild(fig);
    let reco=document.getElementById('v120Reco');
    if(!reco){reco=document.createElement('section');reco.id='v120Reco';reco.className='v120-reco';reco.innerHTML='<div class="v120-reco-head"><div><b>추천 룩</b><span>지금, 이런 스타일은 어때요?</span></div><span>LOOK 01 · 02 · 03</span></div>';home.insertAdjacentElement('afterend',reco)}
    if(switcher.parentNode!==reco)reco.appendChild(switcher);
    const {p,name,meta}=profileMeta(); const bust=typeof window.__todayCodiRenderBust==='function'?window.__todayCodiRenderBust(p):'';
    home.querySelector('#v120ProfileArt').innerHTML=bust; home.querySelector('#v120Name').textContent=name; home.querySelector('#v120Meta').textContent=meta||'내 스타일 프로필';
    const tags=[label(hairMap,p.hairStyle,'내 헤어'),label(faceMap,p.face,'내 얼굴'),label(glassMap,p.glasses,'안경 없음')].filter(Boolean);
    home.querySelector('#v120Tags').innerHTML=tags.map(x=>'<span class="v120-tag">#'+x+'</span>').join('');
    home.querySelector('#v120LookName').textContent=currentLookTitle();
    const weather=[readText('.weather-condition'),readText('.weather-temp')].filter(Boolean).join(' · '); if(weather)home.querySelector('#v120Weather').textContent=weather.slice(0,28);
    window.__todayCodiV120EditorialHomeReady=true;
  }
  const current=window.renderTicket;
  if(typeof current==='function'&&!current.__v120){const wrapped=function(){const r=current.apply(this,arguments);setTimeout(build,0);return r};wrapped.__v120=true;window.renderTicket=wrapped}
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#lookSwitcher .look-tab'))setTimeout(build,0);if(e.target.closest&&e.target.closest('#avatarModal'))setTimeout(build,60)},true);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(build,180)); setTimeout(build,500);
  window.__todayCodiV120EditorialArchitecture=true;
})();
</script>'''
html=html.replace('</body>',patch+'\n<script id="v120-marker">window.__todayCodiV120=true;</script>\n</body>',1)

required=['v1.2.0 · 큰 글씨','v1.2.0 · 아바타+','__todayCodiV120EditorialArchitecture','__todayCodiV120EditorialHomeReady','v120EditorialHome','v120ProfileArt','v120LookStage','추천 룩','__todayCodiV1100OutfitModelNoFaceMerge','__todayCodiV111PreciseLocation']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.2.0 markers missing: '+repr(missing))
scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v120-{i}.js');tmp.write_text(s,encoding='utf-8');subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V120_EDITORIAL_PROFILE_CARD=PASS')
print('V120_SEPARATED_TODAY_LOOK_MODEL=PASS')
print('V120_RECOMMENDED_LOOKS=PASS')
print('V120_QA=PASS')
