(() => {
  'use strict';

  const VERSION = '17.8.0';
  const STAGE = 2;
  let decorateFrame = 0;
  let navFrame = 0;
  let currentDetailId = null;

  const getGames = () => (typeof state !== 'undefined' && Array.isArray(state.games))
    ? state.games.map(g => typeof mergeGame === 'function' ? mergeGame(g) : g)
    : [];
  const byId = id => getGames().find(g => String(g.id) === String(id));
  const esc178 = s => typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money178 = v => typeof won === 'function' ? won(v) : `${Number(v||0).toLocaleString('ko-KR')}원`;

  function currentPage(){ return document.body?.dataset?.page || 'home'; }

  function normalizeNav(){
    if(navFrame) return;
    navFrame = requestAnimationFrame(() => {
      navFrame = 0;
      const page = currentPage();
      const buttons = [...document.querySelectorAll('.bottomnav .navbtn[data-page]')];
      buttons.forEach(btn => {
        const active = btn.dataset.page === page;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-current', active ? 'page' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });
      const active = buttons.filter(btn => btn.classList.contains('active'));
      if(active.length !== 1){
        buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
      }
    });
  }

  function collectPriceHistory(g){
    if(!g) return [];
    const fromState = (typeof state !== 'undefined' && state.history?.get?.(g.id)) || [];
    const fromLocal = typeof readLocalHistory === 'function' ? readLocalHistory(g.id) : [];
    const rows = [...fromState, ...fromLocal]
      .filter(x => x && (Number(x.currentPrice) > 0 || x.plusIncluded))
      .map(x => ({
        at: x.at || x.fetchedAt || new Date().toISOString(),
        currentPrice: Number(x.currentPrice) > 0 ? Number(x.currentPrice) : null,
        discountPercent: Number(x.discountPercent) || 0,
        plusIncluded: !!x.plusIncluded
      }))
      .sort((a,b) => String(a.at).localeCompare(String(b.at)));
    const unique=[];
    for(const row of rows){
      const last=unique[unique.length-1];
      const day=String(row.at).slice(0,10);
      if(!last || String(last.at).slice(0,10)!==day || last.currentPrice!==row.currentPrice || last.discountPercent!==row.discountPercent || last.plusIncluded!==row.plusIncluded) unique.push(row);
    }
    if(Number(g.currentPrice)>0){
      const point={at:new Date().toISOString(),currentPrice:Number(g.currentPrice),discountPercent:Number(g.discountPercent)||0,plusIncluded:!!g.plusIncluded};
      const last=unique[unique.length-1];
      if(!last || last.currentPrice!==point.currentPrice || last.discountPercent!==point.discountPercent || String(last.at).slice(0,10)!==String(point.at).slice(0,10)) unique.push(point);
    }
    return unique.slice(-90);
  }

  function decisionV2(g, history=collectPriceHistory(g)){
    const prices=history.map(x=>Number(x.currentPrice)).filter(x=>Number.isFinite(x)&&x>0);
    const current=Number(g?.currentPrice)>0?Number(g.currentPrice):null;
    const localLow=prices.length?Math.min(...prices):null;
    const radarLow=Number(g?.radarLowPrice)>0?Number(g.radarLowPrice):null;
    const low=[localLow,radarLow].filter(Number.isFinite).reduce((a,b)=>Math.min(a,b),Infinity);
    const observedLow=Number.isFinite(low)&&low!==Infinity?low:null;
    const discount=Math.max(0,Number(g?.discountPercent)||0);
    const bestDiscount=Math.max(discount,Number(g?.radarHighestDiscount)||0);
    const observations=Math.max(history.length,Number(g?.radarObservations)||0);
    const hasPlus=typeof hasPlusBenefit==='function'?hasPlusBenefit(g):!!g?.plusIncluded;
    const reasons=[];
    let label='지켜보기',tone='watch',score=58;

    if(hasPlus){
      label='Plus로 먼저 플레이';tone='plus';score=92;reasons.push('현재 PS Plus 혜택 대상');
    }else if(current&&observedLow){
      const delta=((current/observedLow)-1)*100;
      if(delta<=2&&discount>=40){label='지금 사기';tone='buy';score=94;reasons.push('관측 최저가 수준');}
      else if(delta<=7&&discount>=50){label='구매 적기';tone='buy';score=88;reasons.push(`관측 최저가 대비 +${Math.max(0,delta).toFixed(1)}%`);}
      else if(delta>=15||bestDiscount>=discount+15){label='기다려도 됨';tone='wait';score=52;reasons.push(`관측 최저 ${money178(observedLow)}`);}
      else {label=discount>=40?'조건부 구매':'조금 더 관찰';tone=discount>=40?'watch':'wait';score=discount>=40?74:61;reasons.push(`현재 ${discount}% 할인`);}
    }else if(discount>=60){label='지금 사기';tone='buy';score=86;reasons.push(`현재 ${discount}% 할인`);}
    else if(discount>=35){label='조건부 구매';tone='watch';score=72;reasons.push(`현재 ${discount}% 할인`);}
    else if(current){label='기다려도 됨';tone='wait';score=55;reasons.push('가격 이력 추가 관찰 권장');}

    if(bestDiscount>discount) reasons.push(`관측 최대 할인 ${bestDiscount}%`);
    if(g?.ko) reasons.push('한국어 지원');
    if(Number(g?.rating)>=4.5) reasons.push(`평점 ${Number(g.rating).toFixed(2)}`);
    const confidence=observations>=12?'높음':observations>=4?'보통':'초기';
    return {label,tone,score,reasons:reasons.slice(0,3),observedLow,observations,confidence,current,discount,bestDiscount};
  }

  function historyChart(history){
    const rows=history.filter(x=>Number(x.currentPrice)>0);
    if(rows.length<2) return '<div class="v178-history-empty">가격 이력이 더 쌓이면 변화 그래프가 표시됩니다.</div>';
    const values=rows.map(x=>Number(x.currentPrice));
    const min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min),w=560,h=128,p=10;
    const pts=rows.map((x,i)=>`${p+(i/(rows.length-1))*(w-p*2)},${p+(1-(Number(x.currentPrice)-min)/range)*(h-p*2)}`).join(' ');
    return `<svg class="v178-history-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="가격 변화 그래프"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function pricePanelMarkup(g){
    const history=collectPriceHistory(g);
    const d=decisionV2(g,history);
    const latest=history.slice(-4).reverse();
    const delta=d.current&&d.observedLow?((d.current/d.observedLow)-1)*100:null;
    return `<section class="v178-price-panel">
      <div class="v178-price-head"><div><small>PS RADAR DECISION 2.0</small><h3>${esc178(d.label)}</h3></div><span class="v178-decision-score ${esc178(d.tone)}">${d.score}</span></div>
      <div class="v178-decision-reasons">${d.reasons.map(x=>`<span>${esc178(x)}</span>`).join('')}</div>
      <div class="v178-price-metrics">
        <div><small>현재가</small><b>${d.current?esc178(money178(d.current)):'확인 중'}</b></div>
        <div><small>관측 최저</small><b>${d.observedLow?esc178(money178(d.observedLow)):'축적 중'}</b></div>
        <div><small>최저 대비</small><b>${delta===null?'—':`${delta<=0?'':'+ '}${delta.toFixed(1)}%`}</b></div>
        <div><small>판단 신뢰도</small><b>${esc178(d.confidence)} · ${d.observations}회</b></div>
      </div>
      ${historyChart(history)}
      <div class="v178-history-list">${latest.length?latest.map(x=>`<div><span>${esc178(String(x.at).slice(0,10))}</span><b>${x.currentPrice?esc178(money178(x.currentPrice)):(x.plusIncluded?'PS Plus':'가격 미확인')}</b><em>${x.discountPercent?`-${x.discountPercent}%`:x.plusIncluded?'PLUS':'정가'}</em></div>`).join(''):'<p>첫 가격 관측을 기록했습니다. 이후 가격이 바뀌면 이력이 누적됩니다.</p>'}</div>
    </section>`;
  }

  function decorateDetail(){
    const host=document.querySelector('#detailContent');
    if(!host||!currentDetailId||host.querySelector('.v178-price-panel')) return;
    const g=byId(currentDetailId);if(!g)return;
    host.insertAdjacentHTML('beforeend',pricePanelMarkup(g));
  }

  function decisionReason(g){
    if(!g) return '';
    const d=decisionV2(g);
    return `${d.label} · ${d.reasons.slice(0,2).join(' · ')}`;
  }

  function decorateCards(){
    if(decorateFrame) return;
    decorateFrame = requestAnimationFrame(() => {
      decorateFrame = 0;
      document.querySelectorAll('#grid .card[data-id]').forEach(card => {
        const g = byId(card.dataset.id);
        if(!g) return;
        card.classList.add('v178-compact-card');
        const rating = card.querySelector('.rating-line');
        if(!rating) return;
        let reason = card.querySelector('.v178-card-reason');
        if(!reason){
          reason = document.createElement('div');
          reason.className = 'v178-card-reason';
          rating.insertAdjacentElement('afterend', reason);
        }
        reason.textContent = decisionReason(g) || (g.ko ? '한국어 지원 · 혜택/가격을 종합 확인' : '가격·평점·혜택을 종합 확인');
      });
    });
  }

  function refineHome(){
    const dashboard = document.querySelector('#v176Dashboard');
    if(dashboard){
      dashboard.classList.add('v178-home-dashboard');
      dashboard.querySelectorAll('.v176-panel').forEach((panel, i) => panel.dataset.v178Priority = String(i + 1));
    }
    const hub = document.querySelector('#v177ContentHub');
    if(hub) hub.classList.add('v178-radar-picks');
  }

  function syncSurface(){
    normalizeNav();
    decorateCards();
    refineHome();
    document.body.classList.toggle('v178-home', currentPage() === 'home');
    document.body.classList.toggle('v178-list-page', currentPage() !== 'home');
  }

  function installDetailHooks(){
    document.addEventListener('click',e=>{
      const source=e.target.closest?.('[data-v176-open],[data-id],.detailbtn');
      const id=source?.dataset?.v176Open || source?.dataset?.id || source?.closest?.('[data-id]')?.dataset?.id;
      if(id){currentDetailId=String(id);setTimeout(decorateDetail,80);setTimeout(decorateDetail,350);}
    },true);
    const host=document.querySelector('#detailContent');
    if(host) new MutationObserver(()=>decorateDetail()).observe(host,{childList:true,subtree:false});
  }

  function installTransitionGuard(){
    let lastPage = currentPage();
    let lastChangeAt = performance.now();
    const observer = new MutationObserver(() => {
      const page = currentPage();
      if(page !== lastPage){
        lastPage = page;
        lastChangeAt = performance.now();
      }
      syncSurface();
    });
    observer.observe(document.body, {attributes:true, attributeFilter:['data-page']});

    document.addEventListener('click', e => {
      const nav = e.target.closest?.('.bottomnav .navbtn[data-page]');
      if(nav){
        document.documentElement.dataset.psRadarNavigating = '1';
        setTimeout(() => { delete document.documentElement.dataset.psRadarNavigating; normalizeNav(); }, 220);
      }
    }, true);

    window.__PSRADAR_NAV_HEALTH__ = () => ({
      page: currentPage(),
      activeTabs: [...document.querySelectorAll('.bottomnav .navbtn.active')].map(x => x.dataset.page),
      lastChangeMs: Math.round(performance.now() - lastChangeAt)
    });
  }

  function start(){
    if(!document.body) return;
    installTransitionGuard();
    installDetailHooks();
    syncSurface();
    [250, 900, 2200].forEach(ms => setTimeout(syncSurface, ms));
  }

  if(document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, {once:true});
  else start();

  window.__PSRADAR_V178__ = {VERSION, STAGE, normalizeNav, decorateCards, syncSurface, collectPriceHistory, decisionV2, decorateDetail};
})();
