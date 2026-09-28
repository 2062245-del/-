(() => {
  'use strict';
  const VERSION='18.0.0';
  const STAGE=5;
  const KEY='psradar-backlog-v180';
  let backlogMode='all';
  const esc=s=>typeof window.esc==='function'?window.esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>typeof window.won==='function'?window.won(v):Number(v||0).toLocaleString('ko-KR')+'원';
  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const score=g=>window.__PSRADAR_V180_SCORE__?.psRadarScore?.(g)||{total:50,dims:{taste:50}};
  const plus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);
  const keyFor=g=>window.__PSRADAR_V180_DATA__?.canonicalKey?.(g)||String(g?.id||'');
  function readBacklog(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}}
  function writeBacklog(v){localStorage.setItem(KEY,JSON.stringify(v));}
  function backlogStatus(g){return readBacklog()[keyFor(g)]||null;}
  function setBacklog(g,status){const all=readBacklog();const key=keyFor(g);if(!status)delete all[key];else all[key]=status;writeBacklog(all);syncLibrary();}
  const statusLabel=s=>s==='planned'?'플레이 예정':s==='playing'?'플레이 중':s==='done'?'완료':'';

  function plusPriority(g){
    if(!plus(g))return {level:'none',score:0,label:'Plus 미포함'};
    const d=typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null;const st=backlogStatus(g);
    let p=45;if(st==='playing')p+=25;else if(st==='planned')p+=18;
    if(d!==null&&d>=0){if(d<=3)p+=30;else if(d<=7)p+=24;else if(d<=14)p+=16;else if(d<=30)p+=8;}
    return {level:p>=85?'urgent':p>=70?'high':p>=55?'watch':'normal',score:Math.min(99,p),label:d===null?'종료일 미공개':d===0?'오늘 종료':d>=0?`${d}일 남음`:'종료일 경과'};
  }

  function editionValue(rows=[]){
    const purch=rows.filter(x=>Number(x.currentPrice)>0);
    if(!purch.length)return {cheapest:null,bestDiscount:null};
    const cheapest=[...purch].sort((a,b)=>Number(a.currentPrice)-Number(b.currentPrice))[0];
    const bestDiscount=[...purch].sort((a,b)=>(Number(b.discountPercent)||0)-(Number(a.discountPercent)||0)||Number(a.currentPrice)-Number(b.currentPrice))[0];
    return {cheapest,bestDiscount};
  }

  function firstDiscount(g){return window.__PSRADAR_V1785__?.firstDiscount?.(g)===true;}
  function nearLow(g){const d=window.__PSRADAR_V178__?.decisionV2?.(g);return !!(d?.current&&d?.observedLow&&((d.current/d.observedLow)-1)*100<=5);}
  function daysSinceRelease(g){if(!g.releaseDate)return null;const t=new Date(g.releaseDate).getTime();return Number.isFinite(t)?Math.floor((Date.now()-t)/86400000):null;}
  function curationGroups(){
    const all=games();
    const uniq=list=>{const seen=new Set();return list.filter(g=>{const k=keyFor(g);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>score(b).total-score(a).total).slice(0,4);};
    return [
      {key:'recent-deal',title:'최근 출시 + 큰 할인',desc:'출시 1년 이내 · 50% 이상 할인',items:uniq(all.filter(g=>{const d=daysSinceRelease(g);return d!==null&&d>=0&&d<=365&&Number(g.discountPercent)>=50;}))},
      {key:'rated-value',title:'평점 4.5+ · 2만원 이하',desc:'평점과 가격을 함께 만족',items:uniq(all.filter(g=>Number(g.rating)>=4.5&&Number(g.currentPrice)>0&&Number(g.currentPrice)<=20000))},
      {key:'plus-priority',title:'Plus 먼저 플레이',desc:'종료 일정과 내 백로그 반영',items:uniq(all.filter(g=>plusPriority(g).score>=70))},
      {key:'first-discount',title:'첫 관측 할인',desc:'가격 이력에서 처음 포착',items:uniq(all.filter(firstDiscount))},
      {key:'low-return',title:'관측 최저가 재진입',desc:'현재가가 관측 최저 +5% 이내',items:uniq(all.filter(nearLow))}
    ];
  }

  function ensureCuration(){
    let host=document.getElementById('v180Curation');if(!host){host=document.createElement('section');host.id='v180Curation';host.className='section home-block v180-curation';const a=document.getElementById('v178CurationPanel')||document.getElementById('v177ContentHub');a?.insertAdjacentElement('afterend',host);}return host;
  }
  function renderCuration(){const h=ensureCuration();if(!h||document.body.dataset.page!=='home')return;const groups=curationGroups();h.innerHTML=`<div class="v180-briefing-head"><div><p>SMART CURATION</p><h3>놓치면 아쉬운 게임</h3></div><span>검증 데이터만 사용</span></div><div class="v180-curation-grid">${groups.map(x=>`<article class="v180-curation-card"><h4>${esc(x.title)}</h4><p>${esc(x.desc)}</p><div class="v180-curation-list">${x.items.length?x.items.map(g=>`<button data-v180-library-open="${esc(g.id)}"><b>${esc(g.title)}</b><small>${score(g).total}점${Number(g.currentPrice)>0?` · ${esc(money(g.currentPrice))}`:''}</small></button>`).join(''):'<small>현재 조건에 맞는 검증 항목이 없습니다.</small>'}</div></article>`).join('')}</div>`;}

  function ensureLibraryTools(){
    let h=document.getElementById('v180LibraryTools');if(!h){h=document.createElement('div');h.id='v180LibraryTools';h.className='v180-library-tools';document.getElementById('v176ContextTabs')?.insertAdjacentElement('afterend',h);}
    const active=document.body.dataset.page==='wishlist';h.hidden=!active;if(!active)return;
    h.innerHTML=[['all','전체'],['planned','플레이 예정'],['playing','플레이 중'],['done','완료']].map(([k,l])=>`<button class="${backlogMode===k?'active':''}" data-v180-backlog-mode="${k}">${l}</button>`).join('');
  }

  function decorateCards(){const all=games(),map=new Map(all.map(g=>[String(g.id),g]));document.querySelectorAll('#grid .card[data-id]').forEach(card=>{const g=map.get(String(card.dataset.id));if(!g)return;let b=card.querySelector('.v180-backlog-badge');const st=backlogStatus(g);if(!st){b?.remove();return;}if(!b){b=document.createElement('span');b.className='v180-backlog-badge';card.querySelector('.meta')?.appendChild(b);}b.textContent=statusLabel(st);});}

  function decorateDetail(){
    const id=window.__PSRADAR_V180_DETAIL__?.currentId;const g=games().find(x=>String(x.id)===String(id));const pane=document.querySelector('.v180-detail-pane');if(!g||!pane)return;
    const active=document.querySelector('[data-v180-detail-tab].active')?.dataset?.v180DetailTab;
    if(active==='summary'&&!pane.querySelector('.v180-backlog')){
      const st=backlogStatus(g);pane.insertAdjacentHTML('beforeend',`<section class="v180-backlog"><b>내 플레이 상태</b><div class="v180-backlog-buttons"><button class="${st==='planned'?'active':''}" data-v180-set-backlog="planned">플레이 예정</button><button class="${st==='playing'?'active':''}" data-v180-set-backlog="playing">플레이 중</button><button class="${st==='done'?'active':''}" data-v180-set-backlog="done">완료</button></div></section>`);
    }
    if(active==='plus'&&!pane.querySelector('.v180-plus-priority')){const p=plusPriority(g);if(p.level!=='none')pane.insertAdjacentHTML('beforeend',`<div class="v180-plus-priority"><b>플레이 우선순위 ${p.score}</b><span>${esc(p.label)} · ${esc(statusLabel(backlogStatus(g))||'백로그 미지정')}</span></div>`);}
    if(active==='edition'&&!pane.querySelector('.v180-edition-insight')){const rows=window.__PSRADAR_V180_DETAIL__?.relatedEditions?.(g)||[];const v=editionValue(rows);if(v.cheapest)pane.insertAdjacentHTML('afterbegin',`<div class="v180-edition-insight">현재 비교군 최저가: <b>${esc(v.cheapest.title)} · ${esc(money(v.cheapest.currentPrice))}</b>${v.bestDiscount&&v.bestDiscount.id!==v.cheapest.id?` · 최대 할인: ${esc(v.bestDiscount.title)} -${Number(v.bestDiscount.discountPercent)||0}%`:''}</div>`);}
  }

  if(typeof filteredGames==='function'){
    const base=filteredGames;
    filteredGames=function(){let arr=base();if(document.body.dataset.page==='wishlist'&&backlogMode!=='all')arr=arr.filter(g=>backlogStatus(g)===backlogMode);return arr;};
  }

  function syncLibrary(){ensureLibraryTools();renderCuration();decorateCards();setTimeout(decorateDetail,0);if(document.body.dataset.page==='wishlist'&&typeof renderGames==='function')renderGames();}
  document.addEventListener('click',e=>{
    const mode=e.target.closest?.('[data-v180-backlog-mode]');if(mode){backlogMode=mode.dataset.v180BacklogMode;if(typeof resetVisible==='function')resetVisible();if(typeof renderGames==='function')renderGames();ensureLibraryTools();return;}
    const set=e.target.closest?.('[data-v180-set-backlog]');if(set){const id=window.__PSRADAR_V180_DETAIL__?.currentId;const g=games().find(x=>String(x.id)===String(id));if(g){const next=set.dataset.v180SetBacklog===backlogStatus(g)?null:set.dataset.v180SetBacklog;setBacklog(g,next);setTimeout(decorateDetail,20);}return;}
    const open=e.target.closest?.('[data-v180-library-open]');if(open&&typeof openDetail==='function'){openDetail(open.dataset.v180LibraryOpen);return;}
    if(e.target.closest?.('[data-v180-detail-tab],.detailbtn,[data-v176-open]'))setTimeout(decorateDetail,120);
  },true);
  const start=()=>{syncLibrary();new MutationObserver(()=>{ensureLibraryTools();renderCuration();decorateCards();decorateDetail();}).observe(document.body,{attributes:true,attributeFilter:['data-page']});const d=document.getElementById('detailContent');if(d)new MutationObserver(()=>setTimeout(decorateDetail,0)).observe(d,{childList:true,subtree:true});[700,1800,3600].forEach(ms=>setTimeout(syncLibrary,ms));};
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_LIBRARY__={VERSION,STAGE,backlogStatus,setBacklog,editionValue,plusPriority,curationGroups,get backlogMode(){return backlogMode;}};
})();
