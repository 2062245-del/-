(() => {
  'use strict';
  const VERSION='17.8.0';
  const STAGE=4;
  const esc4=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  const allGames=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const readSet=(key)=>{try{return new Set((JSON.parse(localStorage.getItem(key)||'[]')||[]).map(String));}catch{return new Set();}};
  const wishlistIds=()=>{
    if(typeof wish!=='undefined'&&wish&&typeof wish[Symbol.iterator]==='function')return new Set([...wish].map(String));
    if(typeof state!=='undefined'&&state.wishlist&&typeof state.wishlist[Symbol.iterator]==='function')return new Set([...state.wishlist].map(String));
    return readSet('psradar-wishlist');
  };
  const ownedIds=()=>readSet('psradar-owned');
  const recentIds=()=>readSet('psradar-recent');
  const releaseAlertIds=()=>readSet('psradar-release-alerts');

  function genreTokens(g){
    const raw=[g?.genre,g?.category,g?.tags,g?.genres].flatMap(x=>Array.isArray(x)?x:[x]).filter(Boolean).join(' · ');
    return String(raw).split(/[·,/|]/).map(x=>x.trim()).filter(x=>x.length>=2).slice(0,8);
  }

  function tasteProfile(){
    const games=allGames();
    const wishIds=wishlistIds(),owned=ownedIds(),recent=recentIds();
    const weights=new Map();
    const touch=(id,weight)=>{
      const g=games.find(x=>String(x.id)===String(id));if(!g)return;
      genreTokens(g).forEach(t=>weights.set(t,(weights.get(t)||0)+weight));
    };
    wishIds.forEach(id=>touch(id,4));
    owned.forEach(id=>touch(id,3));
    recent.forEach(id=>touch(id,1));
    const top=[...weights.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,score])=>({name,score}));
    const interactions=new Set([...wishIds,...owned,...recent]).size;
    return {top,interactions,wishlist:wishIds.size,owned:owned.size,recent:recent.size};
  }

  function personalizedScore(g,profile=tasteProfile()){
    const owned=ownedIds(),wishIds=wishlistIds();
    if(owned.has(String(g.id))||wishIds.has(String(g.id)))return -999;
    const tokens=genreTokens(g);
    let fit=0;
    profile.top.forEach((p,i)=>{if(tokens.some(t=>t.toLowerCase()===p.name.toLowerCase()))fit+=Math.max(3,14-i*2);});
    const base=typeof recommendationScore==='function'?recommendationScore(g):50;
    if(g.ko)fit+=5;
    if(Number(g.discountPercent)>=40)fit+=4;
    if(Number(g.rating)>=4.5)fit+=5;
    return base+fit;
  }

  function recommendationReason(g,profile){
    const matches=profile.top.filter(p=>genreTokens(g).some(t=>t.toLowerCase()===p.name.toLowerCase())).map(p=>p.name).slice(0,2);
    const parts=[];
    if(matches.length)parts.push(`${matches.join(' · ')} 취향 신호`);
    if(g.ko)parts.push('한국어');
    if(Number(g.discountPercent)>=40)parts.push(`${Number(g.discountPercent)}% 할인`);
    if(Number(g.rating)>=4.5)parts.push(`평점 ${Number(g.rating).toFixed(1)}`);
    return parts.slice(0,3).join(' · ')||'찜·보유·최근 본 게임을 더 쌓으면 추천이 정교해집니다.';
  }

  function renderPersonalPanel(){
    let panel=document.getElementById('v178PersonalPanel');
    if(!panel){
      panel=document.createElement('section');panel.id='v178PersonalPanel';panel.className='section home-block v178-personal-panel';
      const anchor=document.getElementById('v176Dashboard')||document.getElementById('v177ContentHub')||document.querySelector('.quick-section');
      anchor?.insertAdjacentElement('afterend',panel);
    }
    const profile=tasteProfile();
    if(profile.interactions<3){
      panel.innerHTML=`<div class="v178-personal-head"><div><p>MY TASTE RADAR</p><h3>취향 레이더 준비 중</h3></div><span>${profile.interactions}/3</span></div><div class="v178-personal-empty"><b>게임 3개만 알려주세요.</b><p>찜, 보유게임 표시, 상세보기를 합쳐 3개 이상 쌓이면 장르 취향을 계산해 맞춤 추천을 시작합니다.</p></div>`;
      return;
    }
    const picks=allGames().map(g=>({g,score:personalizedScore(g,profile)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
    const taste=profile.top.slice(0,3).map(x=>x.name).join(' · ')||'취향 학습 중';
    panel.innerHTML=`<div class="v178-personal-head"><div><p>MY TASTE RADAR</p><h3>내 취향 추천</h3><small>${esc4(taste)}</small></div><span>${profile.interactions}개 신호</span></div><div class="v178-personal-grid">${picks.map(({g,score})=>`<button data-v178-personal-open="${esc4(g.id)}"><span class="v178-personal-art">${g.cover||g.image?`<img src="${esc4(g.cover||g.image)}" alt="" loading="lazy">`:'🎮'}</span><span><b>${esc4(g.title)}</b><small>${esc4(recommendationReason(g,profile))}</small></span><em>${Math.min(99,Math.round(score))}</em></button>`).join('')}</div>`;
  }

  function endingWishCount(){
    const ids=wishlistIds();
    return allGames().filter(g=>ids.has(String(g.id))&&g.plusEndsAt&&typeof daysUntil==='function'&&daysUntil(g.plusEndsAt)!==null&&daysUntil(g.plusEndsAt)>=0&&daysUntil(g.plusEndsAt)<=30).length;
  }

  function notificationState(){
    if(window.AndroidBridge)return 'Android 백그라운드 감시 지원';
    if(typeof Notification==='undefined')return '기기 알림 미지원';
    return Notification.permission==='granted'?'브라우저 알림 허용':Notification.permission==='denied'?'브라우저 알림 차단':'알림 권한 대기';
  }

  function renderAlertCenter(){
    let panel=document.getElementById('v178AlertCenter');
    if(!panel){
      panel=document.createElement('section');panel.id='v178AlertCenter';panel.className='v178-alert-center';
      document.getElementById('resultsSection')?.insertAdjacentElement('beforebegin',panel);
    }
    const active=document.body.dataset.page==='wishlist';panel.hidden=!active;if(!active)return;
    const priceCount=wishlistIds().size,releaseCount=releaseAlertIds().size,ending=endingWishCount();
    panel.innerHTML=`<div class="v178-alert-head"><div><p>MY RADAR</p><h3>알림 센터</h3></div><button id="v178EnableAlerts">🔔 알림 설정</button></div><div class="v178-alert-grid"><div><small>가격 감시</small><b>${priceCount}</b><span>찜 게임</span></div><div><small>출시 알림</small><b>${releaseCount}</b><span>발매예정</span></div><div class="${ending?'warn':''}"><small>Plus 종료 위험</small><b>${ending}</b><span>30일 이내</span></div></div><p>${esc4(notificationState())}</p>`;
  }

  function sync4(){renderPersonalPanel();renderAlertCenter();}

  document.addEventListener('click',e=>{
    const pick=e.target.closest?.('[data-v178-personal-open]');
    if(pick&&typeof openDetail==='function'){openDetail(pick.dataset.v178PersonalOpen);return;}
    if(e.target.closest?.('#v178EnableAlerts')){
      if(window.AndroidBridge&&typeof window.AndroidBridge.enableNativeNotifications==='function'){
        try{window.__PSRADAR_V175__?.syncNativeWatchlist?.();window.AndroidBridge.enableNativeNotifications();}catch(_){}
      }else document.getElementById('notifyBtn')?.click();
      setTimeout(renderAlertCenter,250);return;
    }
    if(e.target.closest?.('.heart,.v176-owned,[data-v178-owned-toggle],[data-release-alert],.detailbtn'))setTimeout(sync4,150);
  },true);

  const start=()=>{
    sync4();
    new MutationObserver(()=>{renderAlertCenter();}).observe(document.body,{attributes:true,attributeFilter:['data-page']});
    [500,1400,3000].forEach(ms=>setTimeout(sync4,ms));
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V1784__={VERSION,STAGE,tasteProfile,personalizedScore,renderAlertCenter};
})();
