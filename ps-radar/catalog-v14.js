(() => {
  'use strict';

  let catalogPayload = null;
  let catalogMergedAt = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hasKind = (g, kind) => g?.type === kind || (Array.isArray(g?.categories) && g.categories.includes(kind));
  const cleanStore = (u='') => String(u).split('?')[0].replace(/\/$/,'');
  const conceptFromStore = (u='') => {
    const m=String(u).match(/\/concept\/(\d+)/i);
    return m ? m[1] : '';
  };

  function mergedCategories(a,b){
    return [...new Set([...(Array.isArray(a?.categories)?a.categories:(a?.type?[a.type]:[])),...(Array.isArray(b?.categories)?b.categories:(b?.type?[b.type]:[]))])];
  }

  function mergeCatalog(payload){
    if(!payload?.health?.safeToMerge || !Array.isArray(payload.items) || typeof state === 'undefined') return false;
    if(!Array.isArray(state.games)) state.games=[];

    const byConcept=new Map(), byStore=new Map(), byTitle=new Map();
    const indexGame=(g)=>{
      const cid=String(g?.conceptId||conceptFromStore(g?.store)||'');
      if(cid)byConcept.set(cid,g);
      const store=cleanStore(g?.store); if(store)byStore.set(store,g);
      if(typeof titleKey==='function'){const tk=titleKey(g?.title||'');if(tk)byTitle.set(tk,g);}
    };
    state.games.forEach(indexGame);

    for(const raw of payload.items){
      const d=typeof ensureGameDefaults==='function'?ensureGameDefaults(raw):raw;
      const cid=String(d.conceptId||conceptFromStore(d.store)||'');
      const match=(cid&&byConcept.get(cid)) || byStore.get(cleanStore(d.store)) || (typeof titleKey==='function'&&byTitle.get(titleKey(d.title||'')));
      if(match){
        const before={...match};
        const categories=mergedCategories(before,d);
        const manualPrimary=!String(before.id||'').startsWith('catalog-auto-');
        const richerStore=/\/product\//i.test(before.store||'')?before.store:(d.store||before.store||'');
        const merged={
          ...before,
          ...d,
          id:before.id||d.id,
          title:before.title||d.title,
          type:manualPrimary?(before.type||d.type):(before.type||d.type),
          tier:manualPrimary?(before.tier||d.tier):(d.tier||before.tier),
          categories,
          platform:[...new Set([...(before.platform||[]),...(d.platform||[])])],
          genre:[...new Set([...(before.genre||[]),...(d.genre||[])])],
          ko:typeof before.ko==='boolean'?before.ko:!!d.ko,
          languageStatus:before.ko===true?(before.languageStatus||'verified'):before.languageStatus||d.languageStatus||'unknown',
          desc:before.desc||d.desc,
          image:before.image||d.image||null,
          store:richerStore,
          c1:before.c1||d.c1,
          c2:before.c2||d.c2,
          catalogVerified:true,
          catalogVerifiedAt:payload.generatedAt
        };
        Object.assign(match,merged);
      } else {
        const item={...d,categories:mergedCategories({},d),catalogVerified:true,catalogVerifiedAt:payload.generatedAt};
        state.games.push(item); indexGame(item);
      }
    }

    state.catalogSource=payload.source||'unknown';
    state.catalogGeneratedAt=payload.generatedAt||null;
    state.catalogHealth=payload.health||null;
    catalogMergedAt=Date.now();
    return true;
  }

  function formatSync(v){
    if(!v)return '';
    const d=new Date(v); if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
  }

  function paintCatalogStatus(){
    const h=state?.catalogHealth;
    if(!h?.safeToMerge)return;
    const catalog=Number(h.counts?.catalog)||0, classic=Number(h.counts?.classic)||0;
    const s=document.querySelector('#sourceStatus');
    if(s)s.textContent=`PS Plus 공식 전체 목록 · 게임 ${catalog} · 클래식 ${classic}`;
    if(document.body.dataset.page==='catalog'){
      const box=document.querySelector('#pageCoverage');
      if(box){
        box.className='page-coverage complete';
        box.innerHTML=`<div><strong>공식 현재 목록 · 게임 카탈로그 ${catalog}개 · 클래식 ${classic}개</strong><span>PlayStation 공식 gameslist 기준 전체 스냅샷 · ${formatSync(state.catalogGeneratedAt)} 동기화</span></div><a href="https://www.playstation.com/ko-kr/ps-plus/games/" target="_blank" rel="noopener">공식 전체 목록 ↗</a>`;
      }
      const count=document.querySelector('#countText');
      const visible=typeof filteredGames==='function'?filteredGames().length:null;
      if(count&&Number.isFinite(visible))count.textContent=`${visible.toLocaleString('ko-KR')}개`;
    }
  }

  async function fetchCatalog(){
    try{
      const r=await fetch(`./data/catalog-auto.json?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`catalog-auto.json: ${r.status}`);
      const j=await r.json();
      if(!j?.health?.safeToMerge)throw new Error('catalog snapshot failed safety flag');
      return j;
    }catch(err){console.warn('PS Radar official catalog unavailable',err);return null;}
  }

  if(typeof hasPlusBenefit==='function'){
    hasPlusBenefit=function(g){return !!g?.plusIncluded || hasKind(g,'catalog') || hasKind(g,'classic') || hasKind(g,'monthly');};
  }
  if(typeof benefitTier==='function'){
    benefitTier=function(g){
      if(g?.plusTier)return g.plusTier;
      if(hasKind(g,'monthly'))return g.tier==='Essential'?'Essential':(g.tier||'Essential');
      if(hasKind(g,'classic'))return 'Deluxe';
      if(hasKind(g,'catalog'))return g.catalogTier||'Extra';
      return g?.tier||null;
    };
  }

  if(typeof setSync==='function'){
    const baseSetSync=setSync;
    setSync=function(mode){baseSetSync(mode);if(mode==='ok')queueMicrotask(paintCatalogStatus);};
  }

  if(typeof loadData==='function'){
    const baseLoadData=loadData;
    loadData=async function(manual=false){
      await baseLoadData(manual);
      if(!catalogPayload)catalogPayload=await fetchCatalog();
      if(catalogPayload&&mergeCatalog(catalogPayload)){
        if(typeof resetVisible==='function')resetVisible();
        if(typeof render==='function')render();
        paintCatalogStatus();
        if(manual&&typeof toast==='function')toast(`공식 전체 카탈로그 ${state.catalogHealth?.itemCount||0}개까지 새로고침했습니다.`);
      }
    };
  }

  const coverageObserver=new MutationObserver(()=>paintCatalogStatus());
  window.addEventListener('DOMContentLoaded',()=>{
    coverageObserver.observe(document.body,{childList:true,subtree:true});
  });

  (async()=>{
    catalogPayload=await fetchCatalog();
    if(!catalogPayload)return;
    for(let i=0;i<80;i++){
      if(typeof state!=='undefined'&&Array.isArray(state.games)&&state.games.length>0&&state.discoverySource!=='seed')break;
      await sleep(150);
    }
    if(mergeCatalog(catalogPayload)){
      if(typeof resetVisible==='function')resetVisible();
      if(typeof render==='function')render();
      paintCatalogStatus();
    }
  })();
})();
