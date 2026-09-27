(() => {
  'use strict';

  const VERSION = '17.6.0';
  const owned = new Set(JSON.parse(localStorage.getItem('psradar-owned') || '[]'));
  let recent = JSON.parse(localStorage.getItem('psradar-recent') || '[]');
  if (!Array.isArray(recent)) recent = [];
  let plusMode = 'catalog';
  let myMode = 'wishlist';
  let upcomingItems = [];

  const esc176 = s => typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const merged = g => typeof mergeGame === 'function' ? mergeGame(g) : g;
  const allGames = () => (typeof state !== 'undefined' && Array.isArray(state.games)) ? state.games.map(merged) : [];
  const hasPlus = g => typeof hasPlusBenefit === 'function' ? hasPlusBenefit(g) : !!g?.plusIncluded || ['catalog','monthly','classic'].includes(g?.type);
  const priceValid = g => window.__PSRADAR_V1742__?.validDealPrice ? window.__PSRADAR_V1742__.validDealPrice(g) : Number(g?.currentPrice)>0;
  const isDeal = g => Number(g?.discountPercent)>0 && priceValid(g);
  const money = v => typeof won === 'function' ? won(v) : Number(v).toLocaleString('ko-KR')+'원';

  function saveOwned(){localStorage.setItem('psradar-owned',JSON.stringify([...owned]));}
  function saveRecent(){localStorage.setItem('psradar-recent',JSON.stringify(recent.slice(0,30)));}

  function legacyHomeCleanup(){
    ['stats','curationGrid','decisionStrip','personalStrip','radarStrip','feedStrip','catalogTimeline'].forEach(id=>{
      const el=document.getElementById(id); const section=el?.closest('.home-block'); if(section)section.classList.add('v176-legacy-home');
    });
  }

  function ensureDashboard(){
    let host=document.getElementById('v176Dashboard');
    if(host)return host;
    host=document.createElement('section');
    host.id='v176Dashboard'; host.className='home-block v176-dashboard';
    const hero=document.querySelector('.hero.home-block');
    if(hero?.parentNode)hero.insertAdjacentElement('afterend',host);
    return host;
  }

  function endingPlusGames(){
    return allGames().map(g=>({...g,_d:typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null}))
      .filter(g=>hasPlus(g)&&g._d!==null&&g._d>=0&&g._d<=14)
      .sort((a,b)=>a._d-b._d);
  }

  function wishBenefitGames(){
    if(typeof wish==='undefined')return [];
    return allGames().filter(g=>wish.has(g.id)&&(isDeal(g)||hasPlus(g))).sort((a,b)=>(Number(b.discountPercent)||0)-(Number(a.discountPercent)||0));
  }

  function decisionGames(){
    const wishlist=wishBenefitGames();
    const pool=wishlist.length?wishlist:allGames().filter(isDeal);
    return pool.map(g=>({g,score:typeof radarScore==='function'?radarScore(g):Number(g.discountPercent)||0}))
      .sort((a,b)=>b.score-a.score||(Number(b.g.discountPercent)||0)-(Number(a.g.discountPercent)||0)).slice(0,4).map(x=>x.g);
  }

  function gameMini(g){
    const discount=Number(g.discountPercent)||0;
    const price=isDeal(g)?money(g.currentPrice):(hasPlus(g)?'PS Plus 포함':'가격 확인');
    const reason=discount?`${discount}% 할인`:hasPlus(g)?'PS Plus 혜택':g.ko?'한국어 지원':'추천';
    const image=g.image?`<img src="${esc176(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="v176-mini-placeholder">PS</span>';
    return `<button class="v176-game-mini" data-v176-open="${esc176(g.id)}"><span class="v176-mini-art">${image}</span><span class="v176-mini-copy"><b>${esc176(g.title)}</b><small>${esc176(reason)} · ${esc176(price)}</small></span><span class="v176-mini-arrow">›</span></button>`;
  }

  function nextUpcoming(){
    const now=new Date(); now.setHours(0,0,0,0);
    return upcomingItems.map(x=>{
      const d=x.releaseDate?new Date(`${String(x.releaseDate).slice(0,10)}T00:00:00`):null;
      const days=d&&!Number.isNaN(d.getTime())?Math.ceil((d-now)/86400000):null;
      return {...x,_days:days};
    }).filter(x=>x._days===null||x._days>=0).sort((a,b)=>(a._days??99999)-(b._days??99999)).slice(0,2);
  }

  function weeklyRows(){
    const rows=[];
    const monthly=allGames().filter(g=>g.type==='monthly'||g.categories?.includes?.('monthly')).slice(0,2);
    if(monthly.length)rows.push({label:'이번 달 PS Plus',text:monthly.map(x=>x.title).join(' · '),page:'catalog'});
    for(const x of nextUpcoming())rows.push({label:x._days===0?'오늘 출시':x._days!==null?`출시 D-${x._days}`:'발매예정',text:x.title,page:'upcoming'});
    const feed=(typeof state!=='undefined'&&Array.isArray(state.feed)?state.feed:[])[0];
    if(feed)rows.push({label:'공식 업데이트',text:feed.title||feed.name||'PlayStation 새소식',page:'home'});
    return rows.slice(0,4);
  }

  function renderDashboard(){
    const host=ensureDashboard(); if(!host||typeof state==='undefined')return;
    const deals=allGames().filter(isDeal).length;
    const ending=endingPlusGames().length;
    const wishBenefits=wishBenefitGames().length;
    const decisions=decisionGames();
    const weekly=weeklyRows();
    host.innerHTML=`
      <section class="v176-panel v176-today">
        <div class="v176-head"><div><small>TODAY</small><h3>오늘의 변화</h3></div><span>${window.__PSRADAR_V175__?.remoteState?.lastSuccessAt?'원격 데이터 연결':'내장 데이터'}</span></div>
        <div class="v176-metrics">
          <button data-v176-page="promo"><strong>${deals.toLocaleString('ko-KR')}</strong><span>현재 할인</span></button>
          <button data-v176-plus="ending"><strong>${ending}</strong><span>Plus 종료임박</span></button>
          <button data-v176-page="wishlist"><strong>${wishBenefits}</strong><span>찜 혜택</span></button>
        </div>
      </section>
      <section class="v176-panel">
        <div class="v176-head"><div><small>NOW</small><h3>지금 볼 게임</h3></div><button class="v176-text-btn" data-v176-page="promo">할인 전체 ›</button></div>
        <div class="v176-game-list">${decisions.length?decisions.map(gameMini).join(''):'<p class="v176-empty">할인·혜택 데이터를 확인하고 있습니다.</p>'}</div>
      </section>
      <section class="v176-panel">
        <div class="v176-head"><div><small>THIS WEEK</small><h3>이번 주 PlayStation</h3></div><button class="v176-text-btn" data-v176-page="upcoming">발매예정 ›</button></div>
        <div class="v176-week-list">${weekly.length?weekly.map(r=>`<button data-v176-page="${r.page}"><span>${esc176(r.label)}</span><b>${esc176(r.text)}</b><em>›</em></button>`).join(''):'<p class="v176-empty">이번 주 정보를 확인하고 있습니다.</p>'}</div>
      </section>`;
  }

  async function loadUpcoming176(){
    try{const r=await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok){const j=await r.json();upcomingItems=Array.isArray(j.items)?j.items:[];}}catch(_){}
    renderDashboard();
  }

  function ensureContextTabs(){
    let host=document.getElementById('v176ContextTabs');
    if(!host){host=document.createElement('div');host.id='v176ContextTabs';host.className='v176-context-tabs';document.querySelector('#resultsSection')?.insertAdjacentElement('beforebegin',host);}
    return host;
  }

  function setPlusMode(mode){
    plusMode=mode;
    if(typeof state==='undefined')return;
    state.quick='none';state.content='all';
    if(mode==='monthly')state.view='monthly';
    else if(mode==='classic'){state.view='catalog';state.content='classic';}
    else if(mode==='ending'){state.view='all';}
    else state.view='catalog';
    if(typeof resetVisible==='function')resetVisible();
    if(typeof renderGames==='function')renderGames();
    updateContextTabs();
  }

  function setMyMode(mode){
    myMode=mode;
    if(typeof state==='undefined')return;
    state.quick='none';state.content='all';state.view=(mode==='wishlist'||mode==='alerts')?'wishlist':'all';
    if(typeof resetVisible==='function')resetVisible();
    if(typeof renderGames==='function')renderGames();
    updateContextTabs();
  }

  function updateContextTabs(){
    const host=ensureContextTabs(); if(!host)return;
    const page=document.body.dataset.page;
    if(page==='catalog'){
      host.hidden=false;host.innerHTML=`<div class="v176-segments" role="tablist" aria-label="PS Plus"><button class="${plusMode==='monthly'?'active':''}" data-plus-mode="monthly">월간 게임</button><button class="${plusMode==='catalog'?'active':''}" data-plus-mode="catalog">게임 카탈로그</button><button class="${plusMode==='classic'?'active':''}" data-plus-mode="classic">클래식</button><button class="${plusMode==='ending'?'active':''}" data-plus-mode="ending">종료 예정</button></div>`;
      const title=document.querySelector('[data-page-title]');if(title)title.textContent='PS Plus';
      const desc=document.querySelector('[data-page-desc]');if(desc)desc.textContent='월간 게임, 카탈로그, 클래식과 종료 예정 혜택을 한곳에서 확인합니다.';
    }else if(page==='wishlist'){
      host.hidden=false;host.innerHTML=`<div class="v176-segments" role="tablist" aria-label="MY"><button class="${myMode==='wishlist'?'active':''}" data-my-mode="wishlist">찜</button><button class="${myMode==='alerts'?'active':''}" data-my-mode="alerts">가격알림</button><button class="${myMode==='owned'?'active':''}" data-my-mode="owned">보유게임</button><button class="${myMode==='recent'?'active':''}" data-my-mode="recent">최근 본</button></div>`;
      const title=document.querySelector('[data-page-title]');if(title)title.textContent='MY';
      const desc=document.querySelector('[data-page-desc]');if(desc)desc.textContent='찜, 가격 알림, 보유 게임과 최근 본 게임을 관리합니다.';
    }else host.hidden=true;
  }

  if(typeof filteredGames==='function'){
    const baseFiltered176=filteredGames;
    filteredGames=function(){
      let arr=baseFiltered176(); const page=document.body.dataset.page;
      if(page==='catalog'&&plusMode==='ending'){
        arr=allGames().filter(g=>{const d=typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null;return hasPlus(g)&&d!==null&&d>=0&&d<=30;}).sort((a,b)=>(daysUntil(a.plusEndsAt)??999)-(daysUntil(b.plusEndsAt)??999));
      }
      if(page==='wishlist'){
        if(myMode==='owned')arr=allGames().filter(g=>owned.has(g.id));
        else if(myMode==='recent'){
          const order=new Map(recent.map((id,i)=>[String(id),i]));arr=allGames().filter(g=>order.has(String(g.id))).sort((a,b)=>order.get(String(a.id))-order.get(String(b.id)));
        }else if(myMode==='alerts')arr=allGames().filter(g=>typeof wish!=='undefined'&&wish.has(g.id)).sort((a,b)=>Number(isDeal(b))-Number(isDeal(a))||(Number(b.discountPercent)||0)-(Number(a.discountPercent)||0));
      }
      return arr;
    };
  }

  function decorateCards(){
    document.querySelectorAll('#grid .card[data-id]').forEach(card=>{
      const id=String(card.dataset.id||'');if(!id)return;
      let btn=card.querySelector('.v176-owned');
      if(!btn){btn=document.createElement('button');btn.type='button';btn.className='v176-owned';const row=card.querySelector('.row');row?.insertBefore(btn,row.querySelector('.detailbtn'));}
      if(btn){btn.dataset.ownedId=id;btn.classList.toggle('active',owned.has(id));btn.textContent=owned.has(id)?'✓ 보유':'보유';}
    });
  }

  function updateSurfaceState(){
    if(typeof state==='undefined')return;
    const page=document.body.dataset.page;
    const active=page==='home'&&(state.query?.trim()||state.genre!=='all'||state.korean!=='all'||state.content!=='all'||state.quick!=='none');
    document.body.classList.toggle('home-discovery-active',!!active);
    updateContextTabs();decorateCards();
    if(page==='home')renderDashboard();
  }

  if(typeof renderGames==='function'){
    const baseRenderGames176=renderGames;
    renderGames=function(){baseRenderGames176();queueMicrotask(updateSurfaceState);};
  }
  if(typeof render==='function'){
    const baseRender176=render;
    render=function(){baseRender176();queueMicrotask(()=>{updateSurfaceState();renderDashboard();});};
  }

  document.addEventListener('click',e=>{
    const plus=e.target.closest?.('[data-plus-mode]');if(plus){setPlusMode(plus.dataset.plusMode);return;}
    const my=e.target.closest?.('[data-my-mode]');if(my){setMyMode(my.dataset.myMode);return;}
    const ownedBtn=e.target.closest?.('[data-owned-id]');if(ownedBtn){e.preventDefault();e.stopPropagation();const id=String(ownedBtn.dataset.ownedId);owned.has(id)?owned.delete(id):owned.add(id);saveOwned();decorateCards();if(document.body.dataset.page==='wishlist'&&myMode==='owned'&&typeof renderGames==='function')renderGames();return;}
    const detail=e.target.closest?.('.detailbtn');if(detail){const id=detail.closest?.('.card[data-id]')?.dataset?.id;if(id){recent=[String(id),...recent.filter(x=>String(x)!==String(id))].slice(0,30);saveRecent();}}
    const open=e.target.closest?.('[data-v176-open]');if(open){const g=allGames().find(x=>String(x.id)===String(open.dataset.v176Open));if(g&&typeof openDetail==='function')openDetail(g);return;}
    const pageBtn=e.target.closest?.('[data-v176-page]');if(pageBtn){const target=pageBtn.dataset.v176Page;document.querySelector(`.navbtn[data-page="${CSS.escape(target)}"]`)?.click();return;}
    const ending=e.target.closest?.('[data-v176-plus="ending"]');if(ending){document.querySelector('.navbtn[data-page="catalog"]')?.click();setTimeout(()=>setPlusMode('ending'),80);}
  },true);

  const pageObserver176=new MutationObserver(()=>{updateContextTabs();updateSurfaceState();});
  window.addEventListener('DOMContentLoaded',()=>{
    legacyHomeCleanup();ensureDashboard();ensureContextTabs();updateContextTabs();renderDashboard();loadUpcoming176();
    pageObserver176.observe(document.body,{attributes:true,attributeFilter:['data-page']});
    [500,1400,3000].forEach(ms=>setTimeout(()=>{updateSurfaceState();renderDashboard();},ms));
  });

  window.__PSRADAR_V176__={VERSION,setPlusMode,setMyMode,owned,recent,renderDashboard};
})();
