(() => {
  'use strict';

  const pageMeta = {
    home: {title:'홈', kicker:'PS RADAR', desc:'PlayStation 혜택과 추천 정보를 한눈에 확인합니다.', view:'all'},
    catalog: {title:'PS Plus 카탈로그', kicker:'CATALOG', desc:'게임 카탈로그와 클래식 카탈로그의 확인된 타이틀을 모아봅니다.', view:'catalog'},
    monthly: {title:'월간 게임', kicker:'MONTHLY', desc:'이번 달 PS Plus 월간 게임을 확인합니다.', view:'monthly'},
    promo: {title:'할인', kicker:'DEALS', desc:'PS Store에서 현재 확인된 할인과 프로모션을 모아봅니다.', view:'promo'},
    upcoming: {title:'발매예정', kicker:'UPCOMING', desc:'PlayStation 공식 출시 예정과 PS Store 예약구매 타이틀을 함께 확인합니다.', view:'upcoming'},
    wishlist: {title:'찜한 게임', kicker:'WISHLIST', desc:'관심 표시한 게임과 현재 혜택을 한곳에서 확인합니다.', view:'wishlist'}
  };

  let upcomingSeed = [];
  let paintingUpcoming = false;

  const localEsc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeEsc = typeof esc === 'function' ? esc : localEsc;
  const titleKeyV13 = (s='') => String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
  const gameHasType = (g,type) => g?.type===type || (Array.isArray(g?.categories)&&g.categories.includes(type));
  const dateText = (iso, fallback) => {
    if(!iso) return fallback || '출시일 미정';
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? (fallback || iso) : new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(d);
  };
  const gradientFor = (title='PS Radar') => {
    let n=0; for(const c of title)n=(n+c.charCodeAt(0)*17)%360;
    return [`hsl(${n} 46% 31%)`,`hsl(${(n+62)%360} 42% 17%)`];
  };
  const priceText = (g) => Number.isFinite(Number(g?.priceKRW)) && Number(g.priceKRW)>0 ? `${Number(g.priceKRW).toLocaleString('ko-KR')}원` : '가격 미정';
  const priceStateText = (g) => g?.priceStatus==='preorder' ? '예약구매' : g?.priceStatus==='released' ? '판매 중' : '공식 가격 미공개';

  /* 한 타이틀이 월간+카탈로그처럼 복수 혜택에 속하는 경우를 지원한다. */
  if(typeof filteredGames==='function'){
    filteredGames = function(){
      let arr=state.games.map(mergeGame).filter(g=>{
        if(state.view==='catalog'&&!(gameHasType(g,'catalog')||gameHasType(g,'classic')))return false;
        if(state.view==='monthly'&&!gameHasType(g,'monthly'))return false;
        if(state.view==='promo'&&!(gameHasType(g,'promo')||isSale(g)))return false;
        if(state.view==='wishlist'&&!wish.has(g.id))return false;
        if(state.content!=='all'&&!gameHasType(g,state.content))return false;
        if(state.quick==='new'&&!(g.catalogAddedAt||gameHasType(g,'monthly')||gameHasType(g,'latest')))return false;
        if(state.quick==='rating'&&!(Number(g.rating)>0))return false;
        if(state.quick==='deal'&&!isSale(g))return false;
        if(state.quick==='ending'){const d=endingDays(g);if(d===null||d>30)return false;}
        if(state.platform!=='all'&&!g.platform.includes(state.platform))return false;
        if(state.tier!=='all'&&g.tier!==state.tier&&g.plusTier!==state.tier&&g.catalogTier!==state.tier)return false;
        if(state.genre!=='all'&&!g.genre.includes(state.genre))return false;
        if(state.korean==='yes'&&!g.ko)return false;
        const q=state.query.trim().toLowerCase();
        if(q){const hay=[g.title,g.desc,g.description,g.publisher,g.storeGenre,g.voiceLanguages,g.screenLanguages,g.type,...(g.categories||[]),g.tier,g.plusTier,g.catalogTier,...g.platform,...g.genre,g.ko?'한국어 한글':'',isSale(g)?'할인 세일':''].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(q))return false;}
        return true;
      });
      if(state.quick==='new') arr.sort((a,b)=>String(b.catalogAddedAt||b.discoveredAt||'').localeCompare(String(a.catalogAddedAt||a.discoveredAt||''))||radarScore(b)-radarScore(a));
      if(state.quick==='rating') arr.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(b.ratingCount)||0)-(Number(a.ratingCount)||0));
      if(state.quick==='deal') arr.sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0)||radarScore(b)-radarScore(a));
      if(state.quick==='ending') arr.sort((a,b)=>(endingDays(a)??9999)-(endingDays(b)??9999));
      if(state.sort==='discount') arr.sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0));
      if(state.sort==='rating') arr.sort((a,b)=>(b.rating||0)-(a.rating||0));
      if(state.sort==='price') arr.sort((a,b)=>(a.currentPrice??Infinity)-(b.currentPrice??Infinity));
      if(state.sort==='new') arr.sort((a,b)=>String(b.catalogAddedAt||'').localeCompare(String(a.catalogAddedAt||'')));
      if(state.sort==='score') arr.sort((a,b)=>radarScore(b)-radarScore(a));
      return arr;
    };
  }

  if(typeof typeLabel==='function'){
    const baseTypeLabel=typeLabel;
    typeLabel=function(g){
      if(state?.view==='catalog'&&gameHasType(g,'catalog'))return 'CATALOG';
      if(state?.view==='monthly'&&gameHasType(g,'monthly'))return 'MONTHLY';
      return baseTypeLabel(g);
    };
  }
  if(typeof typeDisplay==='function'){
    const baseTypeDisplay=typeDisplay;
    typeDisplay=function(g){
      if(state?.view==='catalog'&&gameHasType(g,'catalog'))return '카탈로그';
      if(state?.view==='monthly'&&gameHasType(g,'monthly'))return '월간';
      return baseTypeDisplay(g);
    };
  }
  if(typeof typeBadgeClass==='function'){
    const baseTypeBadgeClass=typeBadgeClass;
    typeBadgeClass=function(g){
      if(state?.view==='catalog'&&gameHasType(g,'catalog'))return 'plus';
      if(state?.view==='monthly'&&gameHasType(g,'monthly'))return 'monthly';
      return baseTypeBadgeClass(g);
    };
  }
  if(typeof priceMarkup==='function'){
    const basePriceMarkup=priceMarkup;
    priceMarkup=function(g){
      if(state?.view==='catalog'&&gameHasType(g,'catalog')&&gameHasType(g,'monthly'))return {main:'PS Plus 스페셜 포함',sub:'월간 게임 동시 제공'};
      return basePriceMarkup(g);
    };
  }
  if(typeof renderStats==='function'){
    renderStats=function(){
      const games=state.games.map(mergeGame);
      const catalog=games.filter(g=>gameHasType(g,'catalog')||gameHasType(g,'classic')).length;
      const deals=games.filter(isSale).length;
      const ending=games.filter(g=>{const d1=daysUntil(g.saleEndsAt),d2=daysUntil(g.plusEndsAt);return (d1!==null&&d1>=0&&d1<=3)||(d2!==null&&d2>=0&&d2<=14);}).length;
      const wishDeals=games.filter(g=>wish.has(g.id)&&(isSale(g)||g.plusIncluded||gameHasType(g,'catalog')||gameHasType(g,'monthly'))).length;
      const host=document.querySelector('#stats'); if(!host)return;
      host.innerHTML=`<div class="stat"><strong>${catalog}</strong><span>Plus 카탈로그</span><em>게임 + 클래식</em></div><div class="stat"><strong>${deals}</strong><span>현재 할인</span><em>확인된 PS Store</em></div><div class="stat"><strong>${ending}</strong><span>종료 임박</span><em>놓치기 전에</em></div><div class="stat"><strong>${wishDeals}</strong><span>찜 혜택</span><em>${wish.size}개 관심</em></div>`;
    };
  }

  async function loadUpcoming(){
    try{
      const r = await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});
      if(r.ok){const j=await r.json(); upcomingSeed=Array.isArray(j?.items)?j.items:[];}
    }catch(err){console.warn('Upcoming seed unavailable',err);}
  }

  function combinedUpcoming(){
    const today = new Date(); today.setHours(0,0,0,0);
    const existing = (typeof state !== 'undefined' && Array.isArray(state.games)) ? state.games.map(g => typeof mergeGame==='function'?mergeGame(g):g) : [];
    const fromGames = existing.filter(g => {
      if(!g?.releaseDate) return false;
      const raw=String(g.releaseDate).slice(0,10).replaceAll('/','-');
      const d = new Date(`${raw}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).map(g => ({...g,releaseWindow:g.releaseWindow||null,dataQuality:g.dataQuality||'partial'}));
    const merged = new Map();
    [...fromGames,...upcomingSeed].forEach(g=>{
      const k=titleKeyV13(g.title); if(!k)return;
      const prev=merged.get(k)||{}; merged.set(k,{...prev,...g,title:g.title||prev.title});
    });
    return [...merged.values()].sort((a,b)=>{
      const ad=a.releaseDate?new Date(String(a.releaseDate).replaceAll('/','-')).getTime():Infinity;
      const bd=b.releaseDate?new Date(String(b.releaseDate).replaceAll('/','-')).getTime():Infinity;
      if(ad!==bd)return ad-bd;
      return String(a.title).localeCompare(String(b.title),'ko');
    });
  }

  function upcomingCard(g){
    const [c1,c2]=gradientFor(g.title);
    const image=g.image?`<img class="cover-image" src="${safeEsc(g.image)}" alt="${safeEsc(g.title)} 커버" loading="lazy" referrerpolicy="no-referrer" />`:'';
    const badges=[...(g.platform||[]).slice(0,2).map(x=>`<span class="badge ps">${safeEsc(x)}</span>`),g.ko===true?'<span class="badge">한국어</span>':'',g.dataQuality==='verified'?'<span class="badge quality">공식확인</span>':''].join('');
    const genres=(g.genre||[]).slice(0,2).join(' · ');
    const edition=g.edition?`<span class="upcoming-edition">${safeEsc(g.edition)}</span>`:'';
    const extras=Array.isArray(g.otherEditions)&&g.otherEditions.length?`<div class="edition-options">${g.otherEditions.map(e=>`<span>${safeEsc(e.label)} <b>${Number(e.priceKRW).toLocaleString('ko-KR')}원</b></span>`).join('')}</div>`:'';
    return `<article class="card upcoming-card"><div class="cover ${image?'has-image':'image-missing'}" style="--c1:${c1};--c2:${c2}">${image}<div class="cover-content"><span class="cover-kicker">UPCOMING</span><strong class="cover-title">${safeEsc(g.title)}</strong></div></div><div class="body"><div class="meta">${badges}</div><h4>${safeEsc(g.title)}</h4><p>${safeEsc(g.desc||'PlayStation 공식 출시 예정 타이틀입니다.')}</p><span class="release-date">◷ ${safeEsc(dateText(g.releaseDate,g.releaseWindow))}</span>${genres?`<div class="sub">${safeEsc(genres)}</div>`:''}<div class="upcoming-price"><strong>${safeEsc(priceText(g))}</strong><span>${safeEsc(priceStateText(g))}</span>${edition}</div>${extras}<a class="official-source" href="${safeEsc(g.store||'https://www.playstation.com/ko-kr/ps5/games/')}" target="_blank" rel="noopener">PlayStation 공식 정보 보기 →</a></div></article>`;
  }

  function renderUpcoming(){
    if(document.body.dataset.page!=='upcoming')return;
    const grid=document.querySelector('#grid'), title=document.querySelector('#listTitle'), count=document.querySelector('#countText'), more=document.querySelector('#loadMoreBtn');
    if(!grid)return;
    paintingUpcoming=true;
    const items=combinedUpcoming();
    if(title)title.textContent='발매예정 · 예약구매';
    if(count)count.textContent=`${items.length}개`;
    if(more)more.hidden=true;
    grid.innerHTML=items.length?items.map(upcomingCard).join(''):'<div class="empty">현재 확인된 발매예정 타이틀이 없습니다.</div>';
    if(!document.querySelector('#imagePolicyNote')){
      const note=document.createElement('p'); note.id='imagePolicyNote'; note.className='image-policy-note'; note.textContent='커버 이미지는 PlayStation 공식 상품/게임 페이지의 대표 이미지를 우선 사용하고, 직접 확인되지 않은 이미지는 임의로 대입하지 않습니다. 이미지가 없거나 차단되면 타이틀 기반 전용 플레이스홀더로 표시합니다.';
      grid.insertAdjacentElement('afterend',note);
    }
    patchImages(grid);
    queueMicrotask(()=>{paintingUpcoming=false;});
  }

  function coverageInfo(page){
    const games=(typeof state!=='undefined'&&Array.isArray(state.games))?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
    const gameCatalog=games.filter(g=>gameHasType(g,'catalog')).length;
    const classics=games.filter(g=>gameHasType(g,'classic')).length;
    const monthly=games.filter(g=>gameHasType(g,'monthly')).length;
    const deals=games.filter(g=>typeof isSale==='function'&&isSale(g)).length;
    const upcoming=combinedUpcoming().length;
    if(page==='catalog')return {tone:'complete',label:`9월 추가작: 게임 카탈로그 ${gameCatalog}/8 · 클래식 ${classics}/2`,detail:'이번 달 공식 추가 라인업은 반영 완료 · 상시 전체 카탈로그는 계속 확장 중',url:'https://www.playstation.com/ko-kr/ps-plus/games/',link:'공식 전체 A-Z'};
    if(page==='monthly')return {tone:'complete',label:`9월 월간 게임 ${monthly}/4`,detail:'이번 달 공식 월간 게임 라인업 반영 완료',url:'https://www.playstation.com/ko-kr/ps-plus/whats-new/',link:'공식 새소식'};
    if(page==='promo')return {tone:'partial',label:`현재 검증된 할인 ${deals}개`,detail:'PS Store 전체 프로모션 중 공식 가격·종료일을 확인한 항목부터 확대 중',url:'https://store.playstation.com/ko-kr/pages/deals',link:'PS Store 전체 할인'};
    if(page==='upcoming')return {tone:'partial',label:`출시예정·예약구매 ${upcoming}개`,detail:'공식 PS5 출시예정 + PS Store 예약구매를 병합 · 전체 예약구매 목록은 계속 확대 중',url:'https://store.playstation.com/ko-kr/pages/latest/',link:'PS Store 예약구매'};
    return null;
  }

  function renderCoverage(page){
    const ph=document.querySelector('#pageHeader'); if(!ph)return;
    let box=document.querySelector('#pageCoverage');
    if(page==='home'||page==='wishlist'){if(box)box.remove();return;}
    const info=coverageInfo(page); if(!info){if(box)box.remove();return;}
    if(!box){box=document.createElement('div');box.id='pageCoverage';box.className='page-coverage';ph.appendChild(box);}
    box.className=`page-coverage ${info.tone}`;
    box.innerHTML=`<div><strong>${safeEsc(info.label)}</strong><span>${safeEsc(info.detail)}</span></div><a href="${safeEsc(info.url)}" target="_blank" rel="noopener">${safeEsc(info.link)} ↗</a>`;
  }

  function setPage(page,{scroll=true}={}){
    const meta=pageMeta[page]||pageMeta.home;
    document.body.dataset.page=page;
    document.querySelectorAll('.navbtn[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    document.querySelectorAll('.home-block').forEach(el=>{el.hidden=page!=='home';});
    const ph=document.querySelector('#pageHeader');
    if(ph){ph.hidden=page==='home';ph.querySelector('[data-page-kicker]').textContent=meta.kicker;ph.querySelector('[data-page-title]').textContent=meta.title;ph.querySelector('[data-page-desc]').textContent=meta.desc;}
    const policy=document.querySelector('#imagePolicyNote'); if(policy)policy.remove();
    if(typeof state!=='undefined'){state.quick='none';state.content='all';state.view=meta.view==='upcoming'?'all':meta.view;if(typeof resetVisible==='function')resetVisible();}
    if(page==='upcoming')renderUpcoming();else if(typeof renderGames==='function')renderGames();
    renderCoverage(page);
    if(scroll)window.scrollTo({top:0,behavior:'smooth'});
  }

  function patchImages(root=document){
    root.querySelectorAll('.cover').forEach(cover=>{if(!cover.querySelector('img'))cover.classList.add('image-missing');});
    root.querySelectorAll('.curation-thumb').forEach(t=>{if(!t.querySelector('img'))t.classList.add('image-missing');});
    root.querySelectorAll('.cover-image,.curation-thumb img,.detail-hero-img').forEach(img=>{
      if(img.dataset.fallbackBound)return; img.dataset.fallbackBound='1'; img.referrerPolicy='no-referrer'; img.decoding='async';
      img.addEventListener('error',()=>{const cover=img.closest('.cover');if(cover){cover.classList.remove('has-image');cover.classList.add('image-missing');}const thumb=img.closest('.curation-thumb');if(thumb)thumb.classList.add('image-missing');img.remove();},{once:true});
    });
  }

  document.addEventListener('click',e=>{const btn=e.target.closest?.('.navbtn[data-page]');if(!btn)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();setPage(btn.dataset.page);},true);

  const observer=new MutationObserver(mutations=>{
    patchImages(document);
    if(document.body.dataset.page==='upcoming'&&!paintingUpcoming){const touchedGrid=mutations.some(m=>m.target?.id==='grid'||m.target?.closest?.('#grid'));if(touchedGrid)setTimeout(renderUpcoming,0);}
  });

  window.addEventListener('DOMContentLoaded',async()=>{await loadUpcoming();patchImages(document);observer.observe(document.body,{childList:true,subtree:true});setPage('home',{scroll:false});});
})();
