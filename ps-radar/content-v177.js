(() => {
  'use strict';

  const VERSION='17.7.0';
  let contentMode='none';
  let upcoming=[];
  const releaseWatch=new Set(JSON.parse(localStorage.getItem('psradar-release-watch')||'[]'));
  const esc177=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const games=()=>typeof state!=='undefined'&&Array.isArray(state.games)?state.games.map(g=>typeof mergeGame==='function'?mergeGame(g):g):[];
  const priceOkay=g=>window.__PSRADAR_V1742__?.validDealPrice?window.__PSRADAR_V1742__.validDealPrice(g):Number(g?.currentPrice)>0;
  const sale=g=>Number(g?.discountPercent)>0&&priceOkay(g)&&(!g.saleEndsAt||new Date(g.saleEndsAt).getTime()>Date.now());
  const plus=g=>typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded||['catalog','monthly','classic'].includes(g?.type);
  const days=v=>typeof daysUntil==='function'?daysUntil(v):(v?Math.ceil((new Date(v)-Date.now())/86400000):null);
  const money=v=>typeof won==='function'?won(v):`${Number(v).toLocaleString('ko-KR')}원`;

  function observedLow(g){return sale(g)&&Number(g.radarLowPrice)>0&&Number(g.radarObservations)>0&&(g.isRadarLow||g.nearRadarLow);}
  function newDeal(g){return sale(g)&&g.radarNewDeal===true;}
  function endingSale(g){const d=days(g.saleEndsAt);return sale(g)&&d!==null&&d>=0&&d<=3;}
  function endingPlus(g){const d=days(g.plusEndsAt);return plus(g)&&d!==null&&d>=0&&d<=14;}
  function freeTrial(g){return g?.type==='trial'||g?.categories?.includes?.('trial')||Number(g?.currentPrice)===0||/무료|free/i.test(`${g?.tag||''} ${g?.desc||''}`);}
  function budgetPick(g){return sale(g)&&Number(g.currentPrice)<=10000&&((Number(g.rating)>=4.3&&Number(g.ratingCount)>=20)||(typeof radarScore==='function'&&radarScore(g)>=75));}
  function recentPlus(g){if(!g?.catalogAddedAt)return false;const d=-days(g.catalogAddedAt);return plus(g)&&d>=0&&d<=30;}

  const modes={
    'new-deals':{label:'오늘 새 할인',filter:newDeal,sort:(a,b)=>(Number(b.discountPercent)||0)-(Number(a.discountPercent)||0)},
    'radar-low':{label:'PS Radar 관측 최저',filter:observedLow,sort:(a,b)=>(Number(b.radarObservations)||0)-(Number(a.radarObservations)||0)||(Number(b.discountPercent)||0)-(Number(a.discountPercent)||0)},
    'ending-sale':{label:'할인 종료 임박',filter:endingSale,sort:(a,b)=>(days(a.saleEndsAt)??99)-(days(b.saleEndsAt)??99)},
    'plus-new':{label:'PS Plus 최근 추가',filter:recentPlus,sort:(a,b)=>String(b.catalogAddedAt||'').localeCompare(String(a.catalogAddedAt||''))},
    'free-trial':{label:'무료 · 체험 가능',filter:freeTrial,sort:(a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)},
    'under10k':{label:'1만원 이하 추천',filter:budgetPick,sort:(a,b)=>(typeof radarScore==='function'?radarScore(b)-radarScore(a):0)||(Number(a.currentPrice)||Infinity)-(Number(b.currentPrice)||Infinity)}
  };

  if(typeof filteredGames==='function'){
    const baseFiltered177=filteredGames;
    filteredGames=function(){
      if(contentMode!=='none'&&modes[contentMode]){
        const def=modes[contentMode];return games().filter(def.filter).sort(def.sort);
      }
      return baseFiltered177();
    };
  }

  if(typeof purchaseAdvice==='function'){
    const baseAdvice177=purchaseAdvice;
    purchaseAdvice=function(g,historyOverride=null){
      const base=baseAdvice177(g,historyOverride);
      if(!sale(g))return base;
      const obs=Number(g.radarObservations)||0,low=Number(g.radarLowPrice),cur=Number(g.currentPrice),bestDiscount=Number(g.radarHighestDiscount)||0,discount=Number(g.discountPercent)||0;
      if(obs>0&&low>0){
        const delta=((cur/low)-1)*100;
        if(g.isRadarLow&&discount>=40)return {action:'buy',label:'지금 사기',tone:'buy',priority:96,reason:`PS Radar 관측 최저 ${money(low)} · 현재 ${discount}% 할인 · 관측 ${obs}회`,low};
        if(g.nearRadarLow&&discount>=50)return {action:'buy',label:'지금 사기',tone:'buy',priority:91,reason:`관측 최저가에서 ${Math.max(0,delta).toFixed(1)}% 이내 · 현재 ${discount}% 할인`,low};
        if(delta>=15||(bestDiscount>=discount+20))return {action:'wait',label:'기다려도 됨',tone:'watch',priority:55,reason:`관측 최저 ${money(low)}${bestDiscount>discount?` · 관측 최대 ${bestDiscount}% 할인`:''}`,low};
      }
      if(plus(g))return {...base,label:base.label||'Plus로 플레이'};
      return base;
    };
  }

  function signal(g){
    if(!g)return '';
    if(observedLow(g))return `<span class="v177-signal low">${g.isRadarLow?'PS Radar 관측 최저':'관측 최저 근접'} · ${Number(g.radarObservations)||1}회 관측</span>`;
    if(endingSale(g))return `<span class="v177-signal urgent">할인 ${days(g.saleEndsAt)===0?'오늘 종료':`${days(g.saleEndsAt)}일 남음`}</span>`;
    if(newDeal(g))return '<span class="v177-signal new">새 할인</span>';
    return '';
  }

  function decorateSignals(){
    document.querySelectorAll('#grid .card[data-id]').forEach(card=>{
      const id=String(card.dataset.id||'');const g=games().find(x=>String(x.id)===id);const html=signal(g);
      let el=card.querySelector('.v177-signal');
      if(!html){el?.remove();return;}
      if(el){const tmp=document.createElement('div');tmp.innerHTML=html;el.replaceWith(tmp.firstElementChild);}
      else card.querySelector('.price-wrap')?.insertAdjacentHTML('afterbegin',html);
    });
  }

  function setMode(mode){
    contentMode=modes[mode]?mode:'none';
    if(typeof state!=='undefined'){state.quick='none';state.content='all';state.platform='all';state.genre='all';state.korean='all';state.sort='default';}
    if(typeof resetVisible==='function')resetVisible();
    if(typeof renderGames==='function')renderGames();
    setTimeout(()=>{
      const title=document.querySelector('#listTitle');if(title&&modes[contentMode])title.textContent=modes[contentMode].label;
      const count=document.querySelector('#countText');if(count&&modes[contentMode])count.textContent=`${filteredGames().length.toLocaleString('ko-KR')}개`;
    },0);
  }

  function ensureHub(){
    let host=document.getElementById('v177ContentHub');if(host)return host;
    host=document.createElement('section');host.id='v177ContentHub';host.className='home-block v177-hub';
    const dashboard=document.getElementById('v176Dashboard');dashboard?.insertAdjacentElement('afterend',host);return host;
  }
  function metric(mode){const def=modes[mode];return games().filter(def.filter).length;}
  function renderHub(){
    const host=ensureHub();if(!host||document.body.dataset.page!=='home')return;
    const cards=[
      ['new-deals','NEW','오늘 새 할인',metric('new-deals'),'새로 포착한 할인'],
      ['radar-low','LOW','관측 최저',metric('radar-low'),'PS Radar 가격 관측'],
      ['ending-sale','ENDING','곧 종료',metric('ending-sale'),'3일 안에 끝나는 할인'],
      ['plus-new','PLUS','최근 추가',metric('plus-new'),'PS Plus 최근 30일'],
      ['free-trial','FREE','무료·체험',metric('free-trial'),'부담 없이 시작'],
      ['under10k','VALUE','1만원 이하',metric('under10k'),'가격·평점·혜택 종합']
    ];
    host.innerHTML=`<div class="v177-hub-head"><div><small>RADAR PICKS</small><h3>놓치기 쉬운 혜택</h3></div><span>가격·Plus·종료일 기준</span></div><div class="v177-hub-grid">${cards.map(c=>`<button data-v177-mode="${c[0]}"><em>${c[1]}</em><strong>${c[3].toLocaleString('ko-KR')}</strong><b>${c[2]}</b><small>${c[4]}</small></button>`).join('')}</div>`;
  }

  function releaseD(date){if(!date)return null;const d=new Date(`${String(date).slice(0,10)}T00:00:00`);if(Number.isNaN(d.getTime()))return null;const now=new Date();now.setHours(0,0,0,0);return Math.ceil((d-now)/86400000);}
  function releaseGroup(item){
    if(!item.releaseDate)return '날짜 미정';
    const d=new Date(`${item.releaseDate}T00:00:00`),now=new Date();now.setHours(0,0,0,0);const dd=releaseD(item.releaseDate);
    if(dd!==null&&dd>=0&&dd<=7)return '이번 주';
    if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth())return '이번 달';
    const nm=new Date(now.getFullYear(),now.getMonth()+1,1);
    if(d.getFullYear()===nm.getFullYear()&&d.getMonth()===nm.getMonth())return '다음 달';
    return '그 이후';
  }
  function verificationLabel(item){return item.verificationLevel==='product-page'||item.verificationLevel==='game-page'?'개별 공식페이지 확인':item.verificationLevel==='official-list'||item.dataQuality==='official-list'?'공식 목록 확인':'정보 확인 중';}
  function syncReleaseWatch(){
    localStorage.setItem('psradar-release-watch',JSON.stringify([...releaseWatch]));
    if(window.AndroidBridge&&typeof window.AndroidBridge.syncReleaseWatchlist==='function'){
      const rows=upcoming.filter(x=>releaseWatch.has(String(x.id))).map(x=>({id:String(x.id),title:x.title,releaseDate:x.releaseDate||null,releaseWindow:x.releaseWindow||null,store:x.store||''}));
      try{window.AndroidBridge.syncReleaseWatchlist(JSON.stringify(rows));}catch(_){}
    }
  }
  function releaseRow(item){
    const d=releaseD(item.releaseDate);const dday=d===null?(item.releaseWindow||'일정 미정'):(d===0?'D-DAY':`D-${d}`);
    const date=item.releaseDate?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(new Date(`${item.releaseDate}T00:00:00`)):(item.releaseWindow||'출시일 미정');
    const watched=releaseWatch.has(String(item.id));
    return `<article class="v177-release-row"><div class="v177-dday">${esc177(dday)}</div><div class="v177-release-copy"><b>${esc177(item.title)}</b><span>${esc177(date)} · ${(item.platform||[]).join(' / ')||'PS5'}</span><small>${esc177(verificationLabel(item))}${Number(item.priceKRW)>0?` · ${esc177(money(item.priceKRW))}`:''}</small></div><button class="v177-release-watch ${watched?'active':''}" data-release-watch="${esc177(item.id)}">${watched?'✓ 알림':'출시 알림'}</button></article>`;
  }
  function ensureCalendar(){
    let host=document.getElementById('v177ReleaseCalendar');if(host)return host;
    host=document.createElement('section');host.id='v177ReleaseCalendar';host.className='v177-release-calendar';document.querySelector('#resultsSection')?.insertAdjacentElement('beforebegin',host);return host;
  }
  function renderCalendar(){
    const host=ensureCalendar();const active=document.body.dataset.page==='upcoming';host.hidden=!active;document.body.classList.toggle('v177-calendar-active',active);if(!active)return;
    const groups=['이번 주','이번 달','다음 달','그 이후','날짜 미정'];
    const html=groups.map(name=>{const items=upcoming.filter(x=>releaseGroup(x)===name).sort((a,b)=>String(a.releaseDate||'9999').localeCompare(String(b.releaseDate||'9999')));if(!items.length)return '';return `<section class="v177-release-group"><div class="v177-release-group-head"><h3>${name}</h3><span>${items.length}개</span></div>${items.map(releaseRow).join('')}</section>`;}).join('');
    host.innerHTML=`<div class="v177-calendar-head"><small>RELEASE CALENDAR</small><h2>출시 캘린더</h2><p>공식 개별 페이지와 공식 목록의 검증 수준을 구분해서 보여드립니다.</p></div>${html||'<p class="v177-empty">확인된 발매예정 정보가 없습니다.</p>'}`;
  }
  async function loadUpcoming(){
    try{const r=await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});if(r.ok){const j=await r.json();upcoming=Array.isArray(j.items)?j.items:[];}}catch(_){}
    renderCalendar();syncReleaseWatch();
  }

  if(typeof renderGames==='function'){
    const baseRender177=renderGames;
    renderGames=function(){baseRender177();queueMicrotask(()=>{decorateSignals();if(contentMode!=='none'&&modes[contentMode]){const t=document.querySelector('#listTitle');if(t)t.textContent=modes[contentMode].label;const c=document.querySelector('#countText');if(c)c.textContent=`${filteredGames().length.toLocaleString('ko-KR')}개`;}});};
  }
  if(typeof render==='function'){
    const baseRenderAll177=render;
    render=function(){baseRenderAll177();queueMicrotask(()=>{renderHub();decorateSignals();renderCalendar();});};
  }

  document.addEventListener('click',e=>{
    const modeBtn=e.target.closest?.('[data-v177-mode]');
    if(modeBtn){
      const mode=modeBtn.dataset.v177Mode;const nav=document.querySelector('.navbtn[data-page="promo"]');nav?.click();setTimeout(()=>setMode(mode),70);return;
    }
    const watch=e.target.closest?.('[data-release-watch]');
    if(watch){const id=String(watch.dataset.releaseWatch);releaseWatch.has(id)?releaseWatch.delete(id):releaseWatch.add(id);syncReleaseWatch();renderCalendar();return;}
    const nav=e.target.closest?.('.navbtn[data-page]');if(nav&&!e.target.closest?.('[data-v177-mode]'))contentMode='none';
  },true);

  const pageObserver=new MutationObserver(()=>{renderCalendar();if(document.body.dataset.page==='home')renderHub();});
  window.addEventListener('DOMContentLoaded',()=>{ensureHub();ensureCalendar();renderHub();loadUpcoming();pageObserver.observe(document.body,{attributes:true,attributeFilter:['data-page']});[700,1800,4000].forEach(ms=>setTimeout(()=>{renderHub();decorateSignals();renderCalendar();},ms));});
  window.__PSRADAR_V177__={VERSION,modes,setMode,renderHub,renderCalendar,releaseWatch};
})();
