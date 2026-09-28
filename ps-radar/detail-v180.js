(() => {
  'use strict';
  const VERSION='18.0.1';
  const STAGE=3;
  let currentId=null;
  let activeTab='summary';
  const esc=s=>typeof window.esc==='function'?window.esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>typeof window.won==='function'?window.won(v):Number(v||0).toLocaleString('ko-KR')+'원';
  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const byId=id=>games().find(g=>String(g.id)===String(id));
  const plus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);
  const days=v=>typeof daysUntil==='function'?daysUntil(v):(v?Math.ceil((new Date(v)-Date.now())/86400000):null);
  const history=g=>window.__PSRADAR_V178__?.collectPriceHistory?.(g)||[];
  const score=g=>window.__PSRADAR_V180_SCORE__?.psRadarScore?.(g)||{total:50,dims:{price:50,taste:50,rating:50,plus:50,freshness:50},reasons:[],verdict:'정보 확인'};
  const family=g=>window.__PSRADAR_V1783__?.editionFamily?.(g?.title)||g?.editionFamily||window.__PSRADAR_V180_DATA__?.norm?.(g?.title)||'';

  function forceCloseDetail(){
    currentId=null;
    activeTab='summary';
    const modal=document.getElementById('detailModal');
    if(!modal)return;
    modal.classList.remove('show','open','active');
    modal.setAttribute('aria-hidden','true');
    modal.style.pointerEvents='none';
    document.body.classList.remove('modal-open','no-scroll');
  }

  function relatedEditions(g){
    const key=family(g);if(!key||key.length<4)return [];
    return games().filter(x=>family(x)===key).filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i).slice(0,8);
  }

  function summaryPane(g){
    const s=score(g);
    const release=g.releaseDate?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric'}).format(new Date(g.releaseDate)):'발매일 확인 중';
    return `<div class="v180-score-hero"><div class="v180-score-ring">${s.total}</div><div class="v180-score-copy"><small>PS RADAR SCORE</small><h3>${esc(s.verdict)}</h3><p>${esc(s.reasons.join(' · ')||'가격·취향·평점·Plus·발매시점을 종합한 판단입니다.')}</p></div></div><div class="v180-dimensions"><div><small>가격매력</small><b>${s.dims.price}</b></div><div><small>취향적합</small><b>${s.dims.taste}</b></div><div><small>평점신뢰</small><b>${s.dims.rating}</b></div><div><small>Plus가치</small><b>${s.dims.plus}</b></div></div><div class="v180-facts"><span>${esc((g.platform||[]).join(' / ')||'PlayStation')}</span><span>${g.ko?'한국어 지원':'언어 확인'}</span><span>${esc(release)}</span>${Number(g.currentPrice)>0?`<span>${esc(money(g.currentPrice))}${Number(g.discountPercent)>0?` · -${Number(g.discountPercent)}%`:''}</span>`:''}</div>`;
  }

  function pricePane(g){
    const rows=history(g).slice(-12).reverse();
    const prices=rows.map(x=>Number(x.currentPrice)).filter(x=>Number.isFinite(x)&&x>0);
    const low=prices.length?Math.min(...prices):Number(g.radarLowPrice)||null;
    return `<div class="v180-plus-card"><h3>가격이력</h3><p>${low?`관측 최저 ${esc(money(low))}`:'가격 이력을 쌓는 중입니다.'}</p></div><div class="v180-history-rows">${rows.length?rows.map(x=>`<div><span><b>${esc(String(x.at||'').slice(0,10)||'관측')}</b><small>${Number(x.discountPercent)>0?`-${Number(x.discountPercent)}%`:x.plusIncluded?'PS Plus':'정가'}</small></span><em>${Number(x.currentPrice)>0?esc(money(x.currentPrice)):x.plusIncluded?'PS Plus':'가격 미확인'}</em></div>`).join(''):'<p>아직 충분한 가격 이력이 없습니다.</p>'}</div>`;
  }

  function plusPane(g){
    if(!plus(g))return `<div class="v180-plus-card"><h3>현재 PS Plus 미포함</h3><p>구매 판단은 가격과 할인 이력을 중심으로 계산합니다.</p></div>`;
    const d=days(g.plusEndsAt);const tier=typeof plusName==='function'?plusName(g.plusTier||g.tier):g.plusTier||g.tier||'PS Plus';
    const urgent=d!==null&&d>=0&&d<=14;
    return `<div class="v180-plus-card ${urgent?'warn':''}"><h3>${esc(tier)}로 플레이 가능</h3><p>${d===null?'종료일은 아직 공식 확인되지 않았습니다.':d<0?'표시된 종료일이 지났습니다. 최신 상태를 다시 확인하세요.':d===0?'오늘 혜택 종료 예정입니다.':`${d}일 뒤 혜택 종료 예정입니다.`} ${urgent?'구매 전 먼저 플레이하거나 라이브러리 추가를 권합니다.':'구매 전 구독 혜택을 먼저 확인하세요.'}</p></div>`;
  }

  function editionPane(g){
    const rows=relatedEditions(g);if(rows.length<2)return '<div class="v180-plus-card"><h3>에디션 비교</h3><p>같은 게임 계열로 확실하게 식별되는 다른 에디션이 없습니다.</p></div>';
    const purch=rows.filter(x=>Number(x.currentPrice)>0).sort((a,b)=>Number(a.currentPrice)-Number(b.currentPrice));const cheapest=purch[0];
    return `<div class="v180-plus-card"><h3>에디션 비교</h3><p>상품명과 게임 ID가 같은 계열로 확인되는 경우만 비교합니다.</p></div><div class="v180-edition-rows">${rows.map(x=>{const delta=cheapest&&Number(x.currentPrice)>0?Number(x.currentPrice)-Number(cheapest.currentPrice):null;return `<button data-v180-edition="${esc(x.id)}"><span><b>${esc(x.title)}</b><small>${esc((x.platform||[]).join(' / ')||'PlayStation')}${x.ko?' · 한국어':''}</small>${delta===0?'<div class="v180-edition-value">현재 비교군 최저가</div>':delta>0?`<div class="v180-edition-value">최저가 대비 +${esc(money(delta))}</div>`:''}</span><em>${Number(x.currentPrice)>0?esc(money(x.currentPrice)):plus(x)?'PS Plus':'가격 확인'}</em></button>`;}).join('')}</div>`;
  }

  function pane(g,tab){return tab==='price'?pricePane(g):tab==='plus'?plusPane(g):tab==='edition'?editionPane(g):summaryPane(g);}

  function renderShell(){
    const host=document.getElementById('detailContent');const g=byId(currentId);if(!host||!g)return;
    host.querySelectorAll('.v178-price-panel,.v178-ownership').forEach(x=>x.classList.add('v180-superseded'));
    let shell=host.querySelector('.v180-detail-shell');if(!shell){shell=document.createElement('section');shell.className='v180-detail-shell';host.appendChild(shell);}
    shell.innerHTML=`<div class="v180-detail-tabs" role="tablist"><button class="${activeTab==='summary'?'active':''}" data-v180-detail-tab="summary">요약</button><button class="${activeTab==='price'?'active':''}" data-v180-detail-tab="price">가격이력</button><button class="${activeTab==='plus'?'active':''}" data-v180-detail-tab="plus">PS Plus</button><button class="${activeTab==='edition'?'active':''}" data-v180-detail-tab="edition">에디션</button></div><div class="v180-detail-pane">${pane(g,activeTab)}</div>`;
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('#closeDetail')){forceCloseDetail();return;}
    const src=e.target.closest?.('[data-v176-open],[data-id],.detailbtn');
    const id=src?.dataset?.v176Open||src?.dataset?.id||src?.closest?.('[data-id]')?.dataset?.id;
    if(id){currentId=String(id);activeTab='summary';setTimeout(renderShell,120);setTimeout(renderShell,420);}
    const tab=e.target.closest?.('[data-v180-detail-tab]');if(tab){activeTab=tab.dataset.v180DetailTab;renderShell();return;}
    const ed=e.target.closest?.('[data-v180-edition]');if(ed&&typeof openDetail==='function'){currentId=String(ed.dataset.v180Edition);activeTab='edition';openDetail(currentId);setTimeout(renderShell,160);}
  },true);
  const start=()=>{const h=document.getElementById('detailContent');if(h)new MutationObserver(()=>setTimeout(renderShell,0)).observe(h,{childList:true,subtree:false});};
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_DETAIL__={VERSION,STAGE,renderShell,relatedEditions,forceCloseDetail,get currentId(){return currentId;}};
})();
