(() => {
  'use strict';
  const VERSION='18.0.1';
  const STAGE=2;
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
  const plus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);
  let tasteCache=null,tasteCacheAt=0;
  const rawTasteProfile=()=>window.__PSRADAR_V1784__?.tasteProfile?.()||{top:[],interactions:0};
  const tasteProfile=()=>{
    const now=Date.now();
    if(tasteCache&&now-tasteCacheAt<1000)return tasteCache;
    tasteCache=rawTasteProfile();tasteCacheAt=now;return tasteCache;
  };
  const invalidateTaste=()=>{tasteCache=null;tasteCacheAt=0;};
  const genres=g=>[g?.genre,g?.genres,g?.tags].flatMap(x=>Array.isArray(x)?x:[x]).filter(Boolean).map(x=>String(x).toLowerCase());
  const history=g=>window.__PSRADAR_V178__?.collectPriceHistory?.(g)||[];

  function priceScore(g){
    if(plus(g))return 92;
    const current=Number(g?.currentPrice),discount=Number(g?.discountPercent)||0;
    const d=window.__PSRADAR_V178__?.decisionV2?.(g,history(g));
    let score=35;
    if(discount>=70)score+=35;else if(discount>=50)score+=27;else if(discount>=30)score+=18;else if(discount>=15)score+=9;
    if(current>0&&current<=10000)score+=18;else if(current<=20000&&current>0)score+=12;else if(current<=35000&&current>0)score+=6;
    if(d?.observedLow&&current>0){const delta=((current/d.observedLow)-1)*100;if(delta<=2)score+=20;else if(delta<=7)score+=13;else if(delta>=20)score-=12;}
    return clamp(score);
  }

  function tasteScore(g,profile=tasteProfile()){
    const p=profile||{top:[],interactions:0};if(!p.interactions)return 55;
    const gs=genres(g);let raw=42;
    p.top.forEach((x,i)=>{if(gs.includes(String(x.name).toLowerCase()))raw+=Math.max(6,18-i*3);});
    if(g?.ko)raw+=6;
    return clamp(raw);
  }

  function ratingScore(g){
    const rating=Number(g?.rating),count=Number(g?.ratingCount)||0;
    if(!Number.isFinite(rating)||rating<=0)return 50;
    const quality=clamp((rating/5)*82);
    const confidence=clamp(Math.log10(count+1)/5*18,0,18);
    return clamp(quality+confidence);
  }

  function plusScore(g){
    if(plus(g)){
      const d=typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null;
      if(d!==null&&d>=0&&d<=7)return 96;
      if(d!==null&&d>=0&&d<=30)return 88;
      return 82;
    }
    return 58;
  }

  function freshnessScore(g){
    const release=g?.releaseDate?new Date(g.releaseDate).getTime():NaN;
    if(!Number.isFinite(release))return 55;
    const age=(Date.now()-release)/86400000;
    if(age<0)return 75;
    if(age<=30)return 92;
    if(age<=180)return 80;
    if(age<=365)return 68;
    return 52;
  }

  function scoreReasons(g,dims){
    const rows=[];
    if(plus(g))rows.push('PS Plus로 바로 플레이 가능');
    if(dims.price>=85)rows.push('가격 매력이 매우 높음');else if(dims.price>=72)rows.push('가격 조건이 좋음');
    if(dims.taste>=78)rows.push('내 취향 신호와 잘 맞음');
    if(dims.rating>=85)rows.push('평점과 평가수가 강함');
    if(g?.ko)rows.push('한국어 지원');
    if(Number(g?.discountPercent)>=50)rows.push(`${Number(g.discountPercent)}% 할인`);
    if(g?.releaseDate&&dims.freshness>=85)rows.push('최근 출시작');
    return rows.slice(0,4);
  }

  function psRadarScore(g,profile=tasteProfile()){
    const dims={price:priceScore(g),taste:tasteScore(g,profile),rating:ratingScore(g),plus:plusScore(g),freshness:freshnessScore(g)};
    const weights={price:.31,taste:.24,rating:.20,plus:.15,freshness:.10};
    const total=Math.round(Object.keys(weights).reduce((s,k)=>s+dims[k]*weights[k],0));
    const reasons=scoreReasons(g,dims);
    const verdict=plus(g)?'Plus로 먼저 플레이':total>=84?'지금 사기':total>=72?'구매 후보':total>=60?'조금 더 보기':'기다리기';
    return {total,dims,reasons,verdict};
  }

  function decorateScoreCards(){
    if(typeof state==='undefined'||!Array.isArray(state.games))return;
    const profile=tasteProfile();
    const map=new Map(state.games.map(g=>[String(g.id),typeof mergeGame==='function'?mergeGame(g):g]));
    document.querySelectorAll('#grid .card[data-id]').forEach(card=>{
      const g=map.get(String(card.dataset.id));if(!g)return;
      const s=psRadarScore(g,profile);
      let el=card.querySelector('.v180-score');
      if(!el){el=document.createElement('div');el.className='v180-score';card.querySelector('.meta')?.appendChild(el);}
      el.innerHTML=`<b>${s.total}</b><span>PS Radar</span>`;el.title=s.reasons.join(' · ');
    });
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('.heart,.v176-owned,[data-v178-owned-toggle],[data-v180-set-backlog],.detailbtn'))invalidateTaste();
  },true);
  window.addEventListener('storage',invalidateTaste);
  const start=()=>{decorateScoreCards();const grid=document.getElementById('grid');if(grid)new MutationObserver(decorateScoreCards).observe(grid,{childList:true});[700,1800,3600].forEach(ms=>setTimeout(decorateScoreCards,ms));};
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_SCORE__={VERSION,STAGE,psRadarScore,priceScore,tasteScore,ratingScore,plusScore,freshnessScore,scoreReasons,decorateScoreCards,tasteProfile,invalidateTaste};
})();
