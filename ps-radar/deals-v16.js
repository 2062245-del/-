(() => {
  'use strict';

  let dealsPayload = null;
  let appliedAt = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cleanStore = (u='') => String(u).split('?')[0].replace(/\/$/,'');
  const keyTitle = (v='') => typeof titleKey==='function' ? titleKey(v) : String(v).toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');

  async function fetchDeals(){
    try{
      const r = await fetch(`./data/deals-auto.json?v=${Date.now()}`, {cache:'no-store'});
      if(!r.ok) throw new Error(`deals-auto.json: ${r.status}`);
      const j = await r.json();
      if(!j?.health?.safeToMerge || !Array.isArray(j.items)) throw new Error('Deals snapshot failed safety flag');
      return j;
    }catch(err){
      console.warn('PS Radar deals snapshot unavailable', err);
      return null;
    }
  }

  function mergeDeals(payload){
    if(!payload?.health?.safeToMerge || !Array.isArray(payload.items) || typeof state==='undefined' || !Array.isArray(state.games)) return false;
    const byStore=new Map(), byTitle=new Map();
    for(const g of state.games){
      const store=cleanStore(g?.store); if(store) byStore.set(store,g);
      const tk=keyTitle(g?.title||''); if(tk) byTitle.set(tk,g);
    }
    let merged=0, added=0;
    for(const raw of payload.items){
      const store=cleanStore(raw?.store);
      const tk=keyTitle(raw?.title||'');
      const match=(store&&byStore.get(store)) || (tk&&byTitle.get(tk));
      const patch={
        ...raw,
        storeVerified:true,
        priceStatus:'verified',
        storeVerifiedAt:raw.storeVerifiedAt||payload.generatedAt||null,
        categories:[...new Set([...(Array.isArray(raw.categories)?raw.categories:[]),'promo'])]
      };
      if(match){
        const before={...match};
        Object.assign(match, patch, {
          id:before.id||raw.id,
          title:before.title||raw.title,
          type:before.type||raw.type||'regular',
          categories:[...new Set([...(Array.isArray(before.categories)?before.categories:(before.type?[before.type]:[])),...patch.categories])],
          platform:[...new Set([...(before.platform||[]),...(raw.platform||[])])],
          genre:[...new Set([...(before.genre||[]),...(raw.genre||[])])],
          image:before.image||raw.image||null,
          desc:before.desc||raw.desc,
          ko:before.languageStatus&&before.languageStatus!=='unknown'?before.ko:(typeof raw.ko==='boolean'?raw.ko:before.ko),
          languageStatus:before.languageStatus&&before.languageStatus!=='unknown'?before.languageStatus:(raw.languageStatus||before.languageStatus||'unknown'),
          store:before.store||raw.store
        });
        if(state.store instanceof Map){
          state.store.set(match.id,{...(state.store.get(match.id)||{}),currentPrice:patch.currentPrice,originalPrice:patch.originalPrice,discountPercent:patch.discountPercent,saleEndsAt:patch.saleEndsAt,priceStatus:'verified',storeVerified:true,storeVerifiedAt:patch.storeVerifiedAt});
        }
        merged++;
      } else {
        const d = typeof ensureGameDefaults==='function' ? ensureGameDefaults({...patch,type:raw.type||'regular'}) : patch;
        state.games.push(d);
        if(store) byStore.set(store,d);
        if(tk) byTitle.set(tk,d);
        added++;
      }
    }
    state.dealsSource=payload.source||'unknown';
    state.dealsGeneratedAt=payload.generatedAt||null;
    state.dealsHealth={...(payload.health||{}),mergedCount:merged,addedCount:added};
    appliedAt=payload.generatedAt||String(Date.now());
    return merged+added>0;
  }

  function paintDealsStatus(){
    if(typeof state==='undefined') return;
    const page=document.body.dataset.page;
    const h=state.dealsHealth;
    if(page==='promo'&&h?.safeToMerge){
      const box=document.querySelector('#pageCoverage');
      if(box){
        const total=Number(h.itemCount)||0;
        const pages=Number(h.pagesScanned)||0;
        box.className='page-coverage complete';
        box.innerHTML=`<div><strong>PS Store 자동 할인 ${total.toLocaleString('ko-KR')}개</strong><span>공식 프로모션 페이지 ${pages.toLocaleString('ko-KR')}페이지 자동 확인 · ${state.dealsGeneratedAt&&typeof formatDateTime==='function'?formatDateTime(state.dealsGeneratedAt):'최신 동기화'}</span></div><a href="https://store.playstation.com/ko-kr/pages/deals/" target="_blank" rel="noopener">PS Store 할인 ↗</a>`;
      }
    }
  }

  function patchBrokenImages(){
    document.addEventListener('error', e=>{
      const img=e.target;
      if(!(img instanceof HTMLImageElement))return;
      if(!img.matches('.cover-image,.detail-hero-img,.media-shot img'))return;
      const cover=img.closest('.cover');
      if(cover){cover.classList.remove('has-image');cover.classList.add('image-missing');}
      img.remove();
    }, true);
  }

  function installNavBehavior(){
    if(typeof setView!=='function')return;
    setView=function(v){
      state.view=v;
      state.quick='none';
      state.content='all';
      if(typeof resetVisible==='function')resetVisible();
      if(document.querySelector('#contentType'))document.querySelector('#contentType').value='all';
      document.querySelectorAll('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
      if(typeof renderGames==='function')renderGames();
      const target=document.querySelector('#resultsSection')||document.querySelector('#grid');
      target?.scrollIntoView({behavior:'smooth',block:'start'});
      queueMicrotask(paintDealsStatus);
    };
  }

  async function applyDeals(){
    if(!dealsPayload) dealsPayload=await fetchDeals();
    if(!dealsPayload)return false;
    if(appliedAt===dealsPayload.generatedAt)return true;
    const ok=mergeDeals(dealsPayload);
    if(ok){
      if(typeof resetVisible==='function')resetVisible();
      if(typeof render==='function')render();
      paintDealsStatus();
    }
    return ok;
  }

  if(typeof loadData==='function'){
    const baseLoadData=loadData;
    loadData=async function(manual=false){
      await baseLoadData(manual);
      dealsPayload=await fetchDeals();
      appliedAt=null;
      const ok=await applyDeals();
      if(manual&&ok&&typeof toast==='function')toast(`PS Store 할인 ${state.dealsHealth?.itemCount||0}개 동기화 완료`);
    };
  }

  patchBrokenImages();
  installNavBehavior();

  window.addEventListener('DOMContentLoaded',()=>{
    document.addEventListener('click',e=>{
      if(e.target.closest?.('.navbtn[data-page="promo"]'))queueMicrotask(paintDealsStatus);
    },true);
  });

  (async()=>{
    dealsPayload=await fetchDeals();
    if(!dealsPayload)return;
    for(let i=0;i<100;i++){
      if(typeof state!=='undefined'&&Array.isArray(state.games)&&state.games.length>0&&state.discoverySource!=='seed')break;
      await sleep(120);
    }
    appliedAt=null;
    await applyDeals();
  })();

  window.__PSRADAR_DEALS__={fetchDeals,mergeDeals,paintDealsStatus};
})();
