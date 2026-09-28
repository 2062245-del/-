(() => {
  'use strict';
  const VERSION='17.8.0';
  const STAGE=5;
  let cardFrame=0;
  const esc5=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const historyOf=g=>window.__PSRADAR_V178__?.collectPriceHistory?.(g)||[];
  const plus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);

  function firstDiscount(g){
    if(!(Number(g?.discountPercent)>0))return false;
    const h=historyOf(g).filter(x=>x&&x.at).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
    if(h.length<2)return false;
    const discounted=h.filter(x=>Number(x.discountPercent)>0);
    if(discounted.length!==1)return false;
    const latest=h[h.length-1],only=discounted[0];
    return only===latest||(
      Number(only.currentPrice)===Number(g.currentPrice)&&
      Number(only.discountPercent)===Number(g.discountPercent)&&
      h.slice(0,-1).some(x=>Number(x.discountPercent)===0&&Number(x.currentPrice)>0)
    );
  }

  function nearObservedLow(g){
    const d=window.__PSRADAR_V178__?.decisionV2?.(g);
    if(!d?.current||!d?.observedLow)return false;
    return ((d.current/d.observedLow)-1)*100<=5;
  }

  function valueScore(g){
    let score=38;
    const price=Number(g?.currentPrice),discount=Number(g?.discountPercent)||0,rating=Number(g?.rating)||0;
    if(plus(g))score+=24;
    else if(price>0&&price<=10000)score+=20;
    else if(price>0&&price<=20000)score+=14;
    else if(price>0&&price<=35000)score+=7;
    if(discount>=70)score+=18;else if(discount>=50)score+=13;else if(discount>=30)score+=7;
    if(rating>=4.7)score+=12;else if(rating>=4.4)score+=8;else if(rating>=4.0)score+=4;
    if(g?.ko)score+=6;
    if(nearObservedLow(g))score+=10;
    if(firstDiscount(g))score+=3;
    return Math.max(0,Math.min(99,Math.round(score)));
  }

  function valueReason(g){
    const p=[];
    if(plus(g))p.push('PS Plus');
    else if(Number(g.currentPrice)>0&&Number(g.currentPrice)<=10000)p.push('1만원 이하');
    if(nearObservedLow(g))p.push('관측 최저가 근접');
    if(Number(g.discountPercent)>=50)p.push(`${Number(g.discountPercent)}% 할인`);
    if(Number(g.rating)>=4.5)p.push(`평점 ${Number(g.rating).toFixed(1)}`);
    if(g.ko)p.push('한국어');
    if(firstDiscount(g))p.push('첫 관측 할인');
    return p.slice(0,3).join(' · ')||'가격·평점·혜택 종합';
  }

  function uniqueTop(list,n=4){
    const seen=new Set();return list.filter(g=>{const id=String(g.id);if(seen.has(id))return false;seen.add(id);return true;}).sort((a,b)=>valueScore(b)-valueScore(a)).slice(0,n);
  }

  function curationData(){
    const all=games();
    return [
      {key:'budget',icon:'₩',title:'1만원 이하 고평점',desc:'가격과 평점을 함께 본 가성비',items:uniqueTop(all.filter(g=>Number(g.currentPrice)>0&&Number(g.currentPrice)<=10000&&Number(g.rating)>=4.1))},
      {key:'low',icon:'↘',title:'최저가 근접',desc:'PS Radar 관측 최저가 +5% 이내',items:uniqueTop(all.filter(g=>Number(g.currentPrice)>0&&nearObservedLow(g)))},
      {key:'first',icon:'NEW',title:'첫 관측 할인',desc:'가격 이력으로 처음 확인된 할인만',items:uniqueTop(all.filter(firstDiscount))},
      {key:'plus',icon:'＋',title:'구매 전 Plus 확인',desc:'돈 쓰기 전에 먼저 플레이할 후보',items:uniqueTop(all.filter(plus))}
    ];
  }

  function itemMarkup(g){
    return `<button data-v178-value-open="${esc5(g.id)}"><span><b>${esc5(g.title)}</b><small>${esc5(valueReason(g))}</small></span><em>${valueScore(g)}</em></button>`;
  }

  function renderCuration(){
    let panel=document.getElementById('v178CurationPanel');
    if(!panel){
      panel=document.createElement('section');panel.id='v178CurationPanel';panel.className='section home-block v178-curation-panel';
      const anchor=document.getElementById('v178PersonalPanel')||document.getElementById('v176Dashboard')||document.querySelector('.quick-section');
      anchor?.insertAdjacentElement('afterend',panel);
    }
    const groups=curationData();
    panel.innerHTML=`<div class="v178-value-head"><div><p>VALUE RADAR</p><h3>오늘의 구매 힌트</h3></div><span>플레이시간 추정 없음</span></div><p class="v178-value-note">가격 · 할인율 · 평점 · 한국어 · PS Plus · 관측 최저가만 사용합니다.</p><div class="v178-curation-grid">${groups.map(x=>`<article class="${x.items.length?'':'empty'}"><header><i>${esc5(x.icon)}</i><span><b>${esc5(x.title)}</b><small>${esc5(x.desc)}</small></span></header><div>${x.items.length?x.items.map(itemMarkup).join(''):'<p>현재 검증 가능한 항목이 없습니다.</p>'}</div></article>`).join('')}</div>`;
  }

  function decorateValueBadges(){
    if(cardFrame)return;cardFrame=requestAnimationFrame(()=>{
      cardFrame=0;
      document.querySelectorAll('#grid .card[data-id]').forEach(card=>{
        const g=games().find(x=>String(x.id)===String(card.dataset.id));if(!g)return;
        let badge=card.querySelector('.v178-value-badge');
        if(!badge){badge=document.createElement('span');badge.className='v178-value-badge';card.querySelector('.meta')?.appendChild(badge);}
        const score=valueScore(g);badge.textContent=firstDiscount(g)?'첫 관측 할인':`가성비 ${score}`;
        badge.dataset.score=String(score);
      });
    });
  }

  function sync5(){renderCuration();decorateValueBadges();}
  document.addEventListener('click',e=>{
    const open=e.target.closest?.('[data-v178-value-open]');
    if(open&&typeof openDetail==='function')openDetail(open.dataset.v178ValueOpen);
  },true);
  const start=()=>{
    sync5();
    new MutationObserver(()=>{decorateValueBadges();}).observe(document.body,{attributes:true,attributeFilter:['data-page']});
    const grid=document.getElementById('grid');if(grid)new MutationObserver(decorateValueBadges).observe(grid,{childList:true});
    [500,1400,3000].forEach(ms=>setTimeout(sync5,ms));
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V1785__={VERSION,STAGE,valueScore,firstDiscount,curationData};
})();
