(() => {
  'use strict';
  const VERSION='18.0.0';
  const STAGE=1;
  let metaPayload={items:[],health:null};
  let byId=new Map();
  let applied=0;
  const norm=v=>String(v||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[™®]/g,' ').replace(/\b(?:ps4|ps5|digital\s+deluxe|deluxe|ultimate|gold|complete|premium|standard)\s*(?:edition)?\b/gi,' ').replace(/(?:디지털\s*)?(?:디럭스|얼티밋|골드|컴플리트|프리미엄|스탠다드)\s*(?:에디션)?/gi,' ').replace(/[^a-z0-9가-힣]+/g,'').trim();

  async function loadMeta(){
    try{
      const r=await fetch(`./data/game-meta-v180.json?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`meta ${r.status}`);
      const j=await r.json();
      if(!j?.health?.safeToMerge||!Array.isArray(j.items))throw new Error('unsafe game meta');
      metaPayload=j;byId=new Map(j.items.map(x=>[String(x.id),x]));
      applyMeta();
      return true;
    }catch(err){console.warn('PS Radar v18 metadata fallback',err);return false;}
  }

  function applyMeta(){
    if(typeof state==='undefined'||!Array.isArray(state.games)||!byId.size)return 0;
    let count=0;
    state.games=state.games.map(g=>{
      const m=byId.get(String(g.id));
      if(!m)return g;
      count++;
      return {...g,
        canonicalGameId:g.canonicalGameId||m.canonicalGameId||null,
        editionFamily:g.editionFamily||m.editionFamily||norm(g.title),
        productId:g.productId||m.productId||null,
        conceptId:g.conceptId||m.conceptId||null,
        releaseDate:g.releaseDate||m.releaseDate||null,
        releaseDateSource:g.releaseDateSource||m.releaseDateSource||null,
        identityMethod:g.identityMethod||m.identityMethod||null,
        identityConfidence:Number(g.identityConfidence||m.identityConfidence||0)
      };
    });
    applied=count;
    return count;
  }

  function canonicalKey(g){return g?.canonicalGameId||g?.conceptId&&`concept:${g.conceptId}`||g?.productId&&`product:${g.productId}`||`title:${norm(g?.title)}`;}
  function coverage(){
    const rows=typeof state!=='undefined'&&Array.isArray(state.games)?state.games:[];
    const dated=rows.filter(x=>x.releaseDate).length;
    const identified=rows.filter(x=>x.canonicalGameId||x.productId||x.conceptId).length;
    return {total:rows.length,dated,identified,applied,meta:metaPayload.health||null};
  }

  function start(){
    loadMeta();
    [700,1800,4000].forEach(ms=>setTimeout(()=>{applyMeta();},ms));
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_DATA__={VERSION,STAGE,loadMeta,applyMeta,canonicalKey,coverage,norm,get meta(){return metaPayload;}};
})();
