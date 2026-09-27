(() => {
  'use strict';
  const VERSION='17.8.0';
  const STAGE=3;
  let detailId=null;
  let hideOwned=localStorage.getItem('psradar-hide-owned')==='1';

  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const esc3=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money3=v=>typeof won==='function'?won(v):`${Number(v||0).toLocaleString('ko-KR')}원`;
  const ownedIds=()=>{try{return new Set((JSON.parse(localStorage.getItem('psradar-owned')||'[]')||[]).map(String));}catch{return new Set();}};
  const isPlus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);

  function editionFamily(title=''){
    return String(title).toLowerCase()
      .replace(/\([^)]*(?:ps4|ps5|한국어|영어|일본어|중국어)[^)]*\)/gi,' ')
      .replace(/[™®]/g,' ')
      .replace(/\b(?:digital\s+deluxe|deluxe|ultimate|gold|complete|premium|standard|collector'?s?|special|anniversary|game\s+of\s+the\s+year|goty)\s*(?:edition)?\b/gi,' ')
      .replace(/(?:디지털\s*)?(?:디럭스|얼티밋|골드|컴플리트|프리미엄|스탠다드|컬렉터즈?|스페셜|애니버서리)\s*(?:에디션)?/gi,' ')
      .replace(/\b(?:edition|bundle|pack)\b/gi,' ')
      .replace(/에디션|번들|패키지/gi,' ')
      .replace(/[^a-z0-9가-힣]+/g,'')
      .trim();
  }

  function editionCandidates(g){
    const family=editionFamily(g?.title||'');
    if(family.length<4)return [];
    return games().filter(x=>editionFamily(x.title)===family).filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i).slice(0,5);
  }

  function plusPurchaseGuard(g){
    if(!isPlus(g))return '';
    const tier=g.plusTier||g.tier||'PS Plus';
    const ending=typeof daysUntil==='function'?daysUntil(g.plusEndsAt):null;
    const endText=ending!==null&&ending>=0?` · ${ending===0?'오늘 종료':`${ending}일 남음`}`:'';
    return `<div class="v178-plus-guard"><strong>구매 전 확인</strong><p>현재 ${esc3(typeof plusName==='function'?plusName(tier):tier)} 혜택으로 이용할 수 있습니다${esc3(endText)}. 구매하기 전에 구독 혜택으로 먼저 플레이할지 확인하세요.</p></div>`;
  }

  function editionsMarkup(g){
    const rows=editionCandidates(g);
    if(rows.length<2)return '';
    const sorted=[...rows].sort((a,b)=>(Number(a.currentPrice)||Infinity)-(Number(b.currentPrice)||Infinity));
    return `<section class="v178-editions"><div class="v178-own-head"><div><small>EDITION COMPARE</small><h3>에디션 비교</h3></div><span>${rows.length}개</span></div><div class="v178-edition-list">${sorted.map(x=>`<button data-v178-edition-id="${esc3(x.id)}" class="${String(x.id)===String(g.id)?'current':''}"><span><b>${esc3(x.title)}</b><small>${(x.platform||[]).join(' / ')||'PlayStation'}${x.ko?' · 한국어':''}</small></span><em>${Number(x.currentPrice)>0?esc3(money3(x.currentPrice)):(isPlus(x)?'PS Plus':'가격 확인')}</em>${Number(x.discountPercent)>0?`<i>-${Number(x.discountPercent)}%</i>`:''}</button>`).join('')}</div><p>상품명이 같은 계열로 명확히 식별되는 에디션만 비교합니다.</p></section>`;
  }

  function ownershipMarkup(g){
    const owned=ownedIds().has(String(g.id));
    return `<section class="v178-ownership"><div class="v178-own-head"><div><small>LIBRARY CHECK</small><h3>구매 중복 방지</h3></div><button class="v178-owned-toggle ${owned?'active':''}" data-v178-owned-toggle="${esc3(g.id)}">${owned?'✓ 보유 중':'보유게임으로 표시'}</button></div>${plusPurchaseGuard(g)}${editionsMarkup(g)}</section>`;
  }

  function decorateDetail3(){
    const host=document.querySelector('#detailContent');
    if(!host||!detailId||host.querySelector('.v178-ownership'))return;
    const g=games().find(x=>String(x.id)===String(detailId));if(!g)return;
    const anchor=host.querySelector('.v178-price-panel');
    if(anchor)anchor.insertAdjacentHTML('afterend',ownershipMarkup(g));else host.insertAdjacentHTML('beforeend',ownershipMarkup(g));
  }

  function decorateCardsOwned(){
    const owned=ownedIds();
    document.querySelectorAll('#grid .card[data-id]').forEach(card=>{
      const yes=owned.has(String(card.dataset.id));
      card.classList.toggle('v178-owned-card',yes);
      const btn=card.querySelector('.v176-owned');
      if(btn){btn.classList.toggle('active',yes);btn.textContent=yes?'✓ 보유':'보유';}
    });
  }

  function ensureListTools(){
    let host=document.getElementById('v178ListTools');
    if(!host){
      host=document.createElement('div');host.id='v178ListTools';host.className='v178-list-tools';
      document.querySelector('#resultsSection')?.insertAdjacentElement('beforebegin',host);
    }
    const active=document.body.dataset.page==='promo';host.hidden=!active;
    if(active)host.innerHTML=`<button id="v178HideOwned" class="${hideOwned?'active':''}">${hideOwned?'✓ ':''}보유게임 숨기기</button><span>이미 산 게임을 할인 목록에서 제외</span>`;
  }

  if(typeof filteredGames==='function'){
    const baseFiltered3=filteredGames;
    filteredGames=function(){
      let arr=baseFiltered3();
      const owned=ownedIds();
      if(document.body.dataset.page==='promo'&&hideOwned)arr=arr.filter(g=>!owned.has(String(g.id)));
      const ownedMode=document.querySelector('[data-my-mode="owned"].active');
      if(document.body.dataset.page==='wishlist'&&ownedMode)arr=games().filter(g=>owned.has(String(g.id)));
      return arr;
    };
  }

  document.addEventListener('click',e=>{
    const src=e.target.closest?.('[data-v176-open],[data-id],.detailbtn');
    const id=src?.dataset?.v176Open||src?.dataset?.id||src?.closest?.('[data-id]')?.dataset?.id;
    if(id){detailId=String(id);setTimeout(decorateDetail3,120);setTimeout(decorateDetail3,420);}

    const own=e.target.closest?.('[data-v178-owned-toggle]');
    if(own){
      e.preventDefault();
      const id=String(own.dataset.v178OwnedToggle),set=ownedIds();
      set.has(id)?set.delete(id):set.add(id);
      localStorage.setItem('psradar-owned',JSON.stringify([...set]));
      const old=document.querySelector('#detailContent .v178-ownership');old?.remove();decorateDetail3();decorateCardsOwned();
      if(typeof renderGames==='function')renderGames();
      return;
    }

    const edition=e.target.closest?.('[data-v178-edition-id]');
    if(edition){
      const g=games().find(x=>String(x.id)===String(edition.dataset.v178EditionId));
      if(g&&typeof openDetail==='function'){detailId=String(g.id);openDetail(g.id);setTimeout(decorateDetail3,150);}return;
    }

    if(e.target.closest?.('#v178HideOwned')){
      hideOwned=!hideOwned;localStorage.setItem('psradar-hide-owned',hideOwned?'1':'0');ensureListTools();if(typeof renderGames==='function')renderGames();return;
    }

    if(e.target.closest?.('.v176-owned'))setTimeout(()=>{decorateCardsOwned();if(typeof renderGames==='function')renderGames();},60);
  },true);

  function sync3(){ensureListTools();decorateCardsOwned();}
  const pageObserver=new MutationObserver(sync3);
  const start=()=>{
    sync3();
    pageObserver.observe(document.body,{attributes:true,attributeFilter:['data-page']});
    const detail=document.querySelector('#detailContent');if(detail)new MutationObserver(()=>decorateDetail3()).observe(detail,{childList:true,subtree:false});
    [300,1000,2400].forEach(ms=>setTimeout(sync3,ms));
  };
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V1783__={VERSION,STAGE,editionFamily,plusPurchaseGuard,ownedIds};
})();
