(() => {
  'use strict';
  const VERSION='18.0.0';
  const STAGE=6;
  let upcoming=[];
  const esc=s=>typeof window.esc==='function'?window.esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const score=g=>window.__PSRADAR_V180_SCORE__?.psRadarScore?.(g)||{total:50,verdict:'보기',reasons:[]};
  const wishIds=()=>{if(typeof wish!=='undefined'&&wish&&typeof wish[Symbol.iterator]==='function')return new Set([...wish].map(String));try{return new Set((JSON.parse(localStorage.getItem('psradar-wish')||'[]')||[]).map(String));}catch{return new Set();}};
  const history=g=>window.__PSRADAR_V178__?.collectPriceHistory?.(g)||[];
  function wishPriceDrops(){const ids=wishIds();return games().filter(g=>{if(!ids.has(String(g.id)))return false;const h=history(g).filter(x=>Number(x.currentPrice)>0);if(h.length<2)return false;const last=h[h.length-1],prev=h.slice(0,-1).reverse().find(x=>Number(x.currentPrice)>0);return prev&&Number(last.currentPrice)<Number(prev.currentPrice);});}
  function endingPlus(){return games().filter(g=>{const has=typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g.plusIncluded;if(!has||!g.plusEndsAt)return false;const d=typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null;return d!==null&&d>=0&&d<=14;});}
  function newDeals(){return games().filter(g=>g.radarNewDeal===true||g.isNewDeal===true);}
  function weekUpcoming(){const now=new Date();now.setHours(0,0,0,0);return upcoming.filter(x=>{if(!x.releaseDate)return false;const d=new Date(`${String(x.releaseDate).slice(0,10)}T00:00:00`);const diff=Math.ceil((d-now)/86400000);return diff>=0&&diff<=7;});}
  function buyPicks(){return games().map(g=>({g,s:score(g)})).filter(x=>x.s.total>=82&&!((typeof hasPlusBenefit==='function'?hasPlusBenefit(x.g):x.g.plusIncluded))).sort((a,b)=>b.s.total-a.s.total).slice(0,5);}

  function ensureHost(){let h=document.getElementById('v180Briefing');if(!h){h=document.createElement('section');h.id='v180Briefing';h.className='home-block v180-briefing';const hero=document.querySelector('.hero.home-block');hero?.insertAdjacentElement('afterend',h);}return h;}
  function renderBriefing(){const h=ensureHost();if(!h||document.body.dataset.page!=='home')return;const nd=newDeals(),drops=wishPriceDrops(),ending=endingPlus(),week=weekUpcoming(),picks=buyPicks();h.innerHTML=`<div class="v180-briefing-head"><div><p>DAILY BRIEFING</p><h3>오늘의 브리핑</h3></div><span>변화와 판단만 먼저</span></div><div class="v180-briefing-grid"><button data-v180-brief-page="promo"><strong>${nd.length}</strong><span>오늘 새 할인</span></button><button data-v180-brief-page="wishlist"><strong>${drops.length}</strong><span>찜 게임 가격하락</span></button><button data-v180-brief-page="catalog"><strong>${ending.length}</strong><span>Plus 종료임박</span></button><button data-v180-brief-page="upcoming"><strong>${week.length}</strong><span>이번 주 출시</span></button></div><div class="v180-briefing-picks"><b>오늘 사기 좋은 게임 ${picks.length}</b>${picks.length?picks.map(({g,s})=>`<button data-v180-brief-open="${esc(g.id)}"><strong>${esc(g.title)}</strong><span>${s.total}점 · ${esc(s.reasons.slice(0,2).join(' · ')||s.verdict)}</span></button>`).join(''):'<p>현재 검증 기준에서 강한 구매 후보가 없습니다.</p>'}</div>`;const old=document.getElementById('v176Dashboard');old?.classList.add('v180-secondary-dashboard');}
  async function loadUpcoming(){try{const r=await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok){const j=await r.json();upcoming=Array.isArray(j.items)?j.items:[];}}catch{}renderBriefing();}
  document.addEventListener('click',e=>{const p=e.target.closest?.('[data-v180-brief-page]');if(p){document.querySelector(`.navbtn[data-page="${CSS.escape(p.dataset.v180BriefPage)}"]`)?.click();return;}const o=e.target.closest?.('[data-v180-brief-open]');if(o&&typeof openDetail==='function')openDetail(o.dataset.v180BriefOpen);},true);
  const start=()=>{renderBriefing();loadUpcoming();new MutationObserver(()=>renderBriefing()).observe(document.body,{attributes:true,attributeFilter:['data-page']});[800,2000,4000].forEach(ms=>setTimeout(renderBriefing,ms));};
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_BRIEFING__={VERSION,STAGE,renderBriefing,newDeals,wishPriceDrops,endingPlus,weekUpcoming,buyPicks};
})();
