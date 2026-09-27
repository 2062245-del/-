(() => {
  'use strict';

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const conceptFromStore=(u='')=>String(u).match(/\/concept\/(\d+)/i)?.[1]||'';
  const cidOf=g=>String(g?.conceptId||conceptFromStore(g?.store)||'');
  const catalogKind=g=>g?.type==='catalog'||g?.type==='classic'||g?.categories?.includes('catalog')||g?.categories?.includes('classic');

  async function loadJson(path){
    const r=await fetch(`${path}?v=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`${path}: ${r.status}`);
    return r.json();
  }

  function patchStore(game,raw,generatedAt){
    if(!game||!raw)return;
    const patch={storeVerified:true,storeVerifiedAt:raw.fetchedAt||generatedAt||null};
    for(const key of ['store','productId','storeProductName','currentPrice','originalPrice','discountPercent','saleEndsAt','priceStatus','rating','ratingCount','plusIncluded','plusTier','marketStatus','fallbackReason']){
      if(raw[key]!==null&&raw[key]!==undefined)patch[key]=raw[key];
    }
    if(['verified-store','verified-store-positive'].includes(raw.languageStatus)&&typeof raw.ko==='boolean'){
      patch.ko=raw.ko;patch.languageStatus=raw.languageStatus;
      if(raw.screenLanguages)patch.screenLanguages=raw.screenLanguages;
    }
    Object.assign(game,patch);
    if(typeof state!=='undefined'&&state.store instanceof Map&&game.id){
      state.store.set(game.id,{...(state.store.get(game.id)||{}),...patch});
    }
  }

  function enforce(catalog,store){
    if(typeof state==='undefined'||!Array.isArray(state.games)||!catalog?.health?.safeToMerge||!Array.isArray(catalog.items))return false;
    const officialIds=new Set(catalog.items.map(cidOf).filter(Boolean));
    const storeByConcept=new Map((store?.items||[]).map(x=>[cidOf(x),x]).filter(([k])=>k));
    const byConcept=new Map();
    for(const g of state.games){const cid=cidOf(g);if(cid&&!byConcept.has(cid))byConcept.set(cid,g);}

    let recovered=0;
    for(const raw of catalog.items){
      const cid=cidOf(raw);if(!cid)continue;
      let g=byConcept.get(cid);
      if(!g){
        const d=typeof ensureGameDefaults==='function'?ensureGameDefaults(raw):{...raw};
        g={...d,conceptId:cid,catalogVerified:true,catalogVerifiedAt:catalog.generatedAt,categories:[...new Set([...(d.categories||[]),d.type].filter(Boolean))]};
        state.games.push(g);byConcept.set(cid,g);recovered++;
      }else{
        g.catalogVerified=true;g.catalogVerifiedAt=catalog.generatedAt;
        g.conceptId=cid;
      }
      patchStore(g,storeByConcept.get(cid),store?.generatedAt);
    }

    let legacyPure=0,legacyMixed=0;
    for(const g of state.games){
      if(!catalogKind(g)||g.catalogVerified===true)continue;
      const categories=Array.isArray(g.categories)?g.categories:[];
      const otherCategories=categories.filter(x=>!['catalog','classic'].includes(x));
      const primaryCatalog=['catalog','classic'].includes(g.type);
      if(primaryCatalog&&otherCategories.length===0){
        g.catalogLegacyHidden=true;legacyPure++;
      }else{
        g.categories=otherCategories;
        g.catalogLegacy=true;legacyMixed++;
      }
    }

    const officialGames=state.games.filter(g=>g.catalogVerified===true&&officialIds.has(cidOf(g)));
    const uniqueConcepts=new Set(officialGames.map(cidOf).filter(Boolean));
    state.catalogIntegrity={
      expected:catalog.items.length,
      verifiedRecords:officialGames.length,
      uniqueConcepts:uniqueConcepts.size,
      recovered,
      legacyPure,
      legacyMixed,
      ok:uniqueConcepts.size===catalog.items.length
    };
    return state.catalogIntegrity.ok;
  }

  if(typeof filteredGames==='function'){
    const priorFilteredGames=filteredGames;
    filteredGames=function(){
      let games=priorFilteredGames().filter(g=>!g.catalogLegacyHidden);
      if(typeof state!=='undefined'&&state.view==='catalog')games=games.filter(g=>g.catalogVerified===true);
      return games;
    };
  }

  if(typeof hasPlusBenefit==='function'){
    const priorHasPlusBenefit=hasPlusBenefit;
    hasPlusBenefit=function(g){
      if(g?.catalogLegacyHidden)return false;
      if(g?.catalogVerified===true)return true;
      return priorHasPlusBenefit(g)&&!(g?.catalogLegacy===true);
    };
  }

  (async()=>{
    for(let i=0;i<100;i++){
      if(typeof state!=='undefined'&&Array.isArray(state.games)&&state.catalogHealth?.safeToMerge)break;
      await sleep(100);
    }
    try{
      const [catalog,store]=await Promise.all([loadJson('./data/catalog-auto.json'),loadJson('./data/store-auto.json').catch(()=>null)]);
      const ok=enforce(catalog,store);
      if(!ok)console.warn('PS Radar catalog integrity mismatch',state?.catalogIntegrity);
      if(typeof resetVisible==='function')resetVisible();
      if(typeof render==='function')render();
    }catch(err){console.warn('PS Radar catalog integrity check skipped',err);}
  })();
})();
