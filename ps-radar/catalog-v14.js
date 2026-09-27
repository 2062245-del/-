(() => {
  'use strict';

  let catalogPayload = null;
  let storePayload = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hasKind = (g, kind) => g?.type === kind || (Array.isArray(g?.categories) && g.categories.includes(kind));
  const cleanStore = (u='') => String(u).split('?')[0].replace(/\/$/,'');
  const conceptFromStore = (u='') => {
    const m=String(u).match(/\/concept\/(\d+)/i);
    return m ? m[1] : '';
  };
  const titleKeySafe = (v='') => typeof titleKey==='function' ? titleKey(v) : String(v).toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
  const officialKorean = g => g?.ko===true && ['verified-store','verified-store-positive'].includes(g?.languageStatus);
  const verifiedCurrentSale = g => {
    const current=Number(g?.currentPrice), original=Number(g?.originalPrice), discount=Number(g?.discountPercent);
    if(!g?.storeVerified || g?.priceStatus!=='verified' || !Number.isFinite(current) || !Number.isFinite(original)) return false;
    if(!(original>current && current>=0 && discount>0)) return false;
    if(g?.saleEndsAt){const end=new Date(g.saleEndsAt).getTime();if(Number.isFinite(end)&&end<=Date.now())return false;}
    return true;
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
      const tk=titleKeySafe(g?.title||''); if(tk)byTitle.set(tk,g);
    };
    state.games.forEach(indexGame);

    for(const raw of payload.items){
      const d=typeof ensureGameDefaults==='function'?ensureGameDefaults(raw):raw;
      const cid=String(raw?.conceptId||d?.conceptId||conceptFromStore(raw?.store||d?.store)||'');
      const match=(cid&&byConcept.get(cid)) || byStore.get(cleanStore(raw?.store||d?.store)) || byTitle.get(titleKeySafe(raw?.title||d?.title||''));
      const incomingKo=typeof raw?.ko==='boolean'?raw.ko:null;
      const incomingLanguageStatus=raw?.languageStatus||'unknown';
      if(match){
        const before={...match};
        const categories=mergedCategories(before,d);
        const manualPrimary=!String(before.id||'').startsWith('catalog-auto-');
        const richerStore=/\/product\//i.test(before.store||'')?before.store:(d.store||before.store||'');
        let mergedKo=null;
        if(typeof before.ko==='boolean' && before.languageStatus!=='unknown') mergedKo=before.ko;
        else if(incomingKo!==null) mergedKo=incomingKo;
        else if(before.ko===true) mergedKo=true;
        const merged={
          ...before,
          ...d,
          id:before.id||d.id,
          title:before.title||d.title,
          type:before.type||d.type,
          tier:manualPrimary?(before.tier||d.tier):(d.tier||before.tier),
          categories,
          platform:[...new Set([...(before.platform||[]),...(d.platform||[])])],
          genre:[...new Set([...(before.genre||[]),...(d.genre||[])])],
          ko:mergedKo,
          languageStatus:before.languageStatus&&before.languageStatus!=='unknown'?before.languageStatus:incomingLanguageStatus,
          desc:before.desc||d.desc,
          image:before.image||d.image||null,
          store:richerStore,
          c1:before.c1||d.c1,
          c2:before.c2||d.c2,
          conceptId:cid||before.conceptId||d.conceptId||null,
          catalogVerified:true,
          catalogVerifiedAt:payload.generatedAt
        };
        Object.assign(match,merged);
      } else {
        const item={
          ...d,
          conceptId:cid||d.conceptId||null,
          ko:incomingKo,
          languageStatus:incomingLanguageStatus,
          categories:mergedCategories({},d),
          catalogVerified:true,
          catalogVerifiedAt:payload.generatedAt
        };
        state.games.push(item); indexGame(item);
      }
    }

    state.catalogSource=payload.source||'unknown';
    state.catalogGeneratedAt=payload.generatedAt||null;
    state.catalogHealth=payload.health||null;
    return true;
  }

  function mergeStoreEnrichment(payload){
    if(!payload?.health?.safeToMerge || !Array.isArray(payload.items) || typeof state==='undefined' || !Array.isArray(state.games)) return false;
    const byConcept=new Map(), byStore=new Map(), byTitle=new Map();
    for(const g of state.games){
      const cid=String(g?.conceptId||conceptFromStore(g?.store)||''); if(cid)byConcept.set(cid,g);
      const store=cleanStore(g?.store); if(store)byStore.set(store,g);
      const tk=titleKeySafe(g?.title||''); if(tk)byTitle.set(tk,g);
    }
    let mergedCount=0;
    for(const raw of payload.items){
      const cid=String(raw?.conceptId||conceptFromStore(raw?.store)||'');
      const match=(cid&&byConcept.get(cid)) || byStore.get(cleanStore(raw?.store)) || byTitle.get(titleKeySafe(raw?.title||''));
      if(!match) continue;
      const patch={storeVerified:true,storeVerifiedAt:raw.fetchedAt||payload.generatedAt||null};
      for(const key of ['store','productId','storeProductName','currentPrice','originalPrice','discountPercent','saleEndsAt','priceStatus','rating','ratingCount','plusIncluded','plusTier','marketStatus','fallbackReason']){
        if(raw[key]!==null && raw[key]!==undefined) patch[key]=raw[key];
      }
      if(['verified-store','verified-store-positive'].includes(raw.languageStatus) && typeof raw.ko==='boolean'){
        patch.ko=raw.ko;
        patch.languageStatus=raw.languageStatus;
        if(raw.screenLanguages)patch.screenLanguages=raw.screenLanguages;
      } else if(!match.languageStatus){
        patch.languageStatus='unknown';
      }
      Object.assign(match,patch);
      if(state.store instanceof Map){
        state.store.set(match.id,{...(state.store.get(match.id)||{}),...patch});
      }
      mergedCount++;
    }
    state.storeAutoSource=payload.source||'unknown';
    state.storeAutoGeneratedAt=payload.generatedAt||null;
    state.storeAutoHealth={...(payload.health||{}),mergedCount};
    return mergedCount>0;
  }

  function formatSync(v){
    if(!v)return '';
    const d=new Date(v); if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
  }

  function paintCatalogStatus(){
    if(typeof state==='undefined')return;
    const h=state.catalogHealth;
    if(!h?.safeToMerge)return;
    const catalog=Number(h.counts?.catalog)||0, classic=Number(h.counts?.classic)||0;
    const sh=state.storeAutoHealth;
    const enriched=sh?.safeToMerge?` · 가격 ${Number(sh.price||0).toLocaleString('ko-KR')} · 평점 ${Number(sh.rating||0).toLocaleString('ko-KR')}`:'';
    const sourceText=`PS Plus 공식 전체 목록 · 게임 ${catalog} · 클래식 ${classic}${enriched}`;
    const s=document.querySelector('#sourceStatus');
    if(s&&s.textContent!==sourceText)s.textContent=sourceText;

    if(document.body.dataset.page==='catalog'){
      const box=document.querySelector('#pageCoverage');
      if(box){
        const signature=`${catalog}|${classic}|${state.catalogGeneratedAt||''}|${sh?.price||0}|${sh?.rating||0}|${sh?.languageVerified||0}|${state.storeAutoGeneratedAt||''}`;
        if(box.dataset.catalogSignature!==signature){
          box.dataset.catalogSignature=signature;
          box.className='page-coverage complete';
          const storeLine=sh?.safeToMerge
            ? ` · Store 보강: 가격 ${Number(sh.price||0).toLocaleString('ko-KR')} · 평점 ${Number(sh.rating||0).toLocaleString('ko-KR')} · 한국어 공식 확인 ${Number(sh.languageVerified||0).toLocaleString('ko-KR')}`
            : '';
          box.innerHTML=`<div><strong>공식 현재 목록 · 게임 카탈로그 ${catalog}개 · 클래식 ${classic}개</strong><span>PlayStation 공식 gameslist 기준 전체 스냅샷 · ${formatSync(state.catalogGeneratedAt)} 동기화${storeLine}</span></div><a href="https://www.playstation.com/ko-kr/ps-plus/games/" target="_blank" rel="noopener">공식 전체 목록 ↗</a>`;
        }
      }
      const count=document.querySelector('#countText');
      const visible=typeof filteredGames==='function'?filteredGames().length:null;
      const countText=Number.isFinite(visible)?`${visible.toLocaleString('ko-KR')}개`:'';
      if(count&&countText&&count.textContent!==countText)count.textContent=countText;
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

  async function fetchStoreEnrichment(){
    try{
      const r=await fetch(`./data/store-auto.json?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`store-auto.json: ${r.status}`);
      const j=await r.json();
      if(!j?.health?.safeToMerge)throw new Error('Store enrichment failed safety flag');
      return j;
    }catch(err){console.warn('PS Radar Store enrichment unavailable',err);return null;}
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
  if(typeof filteredGames==='function'){
    const baseFilteredGames=filteredGames;
    filteredGames=function(){
      let games=baseFilteredGames();
      if(typeof state!=='undefined'&&state.korean==='yes')games=games.filter(officialKorean);
      if(typeof state!=='undefined'&&state.view==='promo')games=games.filter(verifiedCurrentSale);
      return games;
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
      if(catalogPayload)mergeCatalog(catalogPayload);
      if(!storePayload)storePayload=await fetchStoreEnrichment();
      if(storePayload)mergeStoreEnrichment(storePayload);
      if(catalogPayload||storePayload){
        if(typeof resetVisible==='function')resetVisible();
        if(typeof render==='function')render();
        paintCatalogStatus();
        if(manual&&typeof toast==='function'){
          const storeText=state.storeAutoHealth?.safeToMerge?` · 가격 ${state.storeAutoHealth.price||0} · 평점 ${state.storeAutoHealth.rating||0}`:'';
          toast(`공식 카탈로그 ${state.catalogHealth?.itemCount||0}개${storeText} 새로고침 완료`);
        }
      }
    };
  }

  const coverageObserver=new MutationObserver(()=>paintCatalogStatus());
  window.addEventListener('DOMContentLoaded',()=>{
    coverageObserver.observe(document.body,{childList:true,subtree:true});
  });

  (async()=>{
    [catalogPayload,storePayload]=await Promise.all([fetchCatalog(),fetchStoreEnrichment()]);
    if(!catalogPayload&&!storePayload)return;
    for(let i=0;i<80;i++){
      if(typeof state!=='undefined'&&Array.isArray(state.games)&&state.games.length>0&&state.discoverySource!=='seed')break;
      await sleep(150);
    }
    if(catalogPayload)mergeCatalog(catalogPayload);
    if(storePayload)mergeStoreEnrichment(storePayload);
    if(typeof resetVisible==='function')resetVisible();
    if(typeof render==='function')render();
    paintCatalogStatus();
  })();
})();
