(() => {
  'use strict';

  const VERSION = '17.8.0';
  const STAGE = 1;
  let decorateFrame = 0;
  let navFrame = 0;

  const getGames = () => (typeof state !== 'undefined' && Array.isArray(state.games))
    ? state.games.map(g => typeof mergeGame === 'function' ? mergeGame(g) : g)
    : [];
  const byId = id => getGames().find(g => String(g.id) === String(id));
  const esc178 = s => typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

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

  function decisionReason(g){
    if(!g) return '';
    try{
      if(typeof purchaseAdvice === 'function'){
        const a = purchaseAdvice(g);
        if(a?.reason) return String(a.reason);
      }
      if(typeof recommendationReasons === 'function') return recommendationReasons(g);
    }catch(_){}
    return '';
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
        const text = decisionReason(g);
        reason.textContent = text || (g.ko ? '한국어 지원 · 혜택/가격을 종합 확인' : '가격·평점·혜택을 종합 확인');
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
    syncSurface();
    [250, 900, 2200].forEach(ms => setTimeout(syncSurface, ms));
  }

  if(document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, {once:true});
  else start();

  window.__PSRADAR_V178__ = {VERSION, STAGE, normalizeNav, decorateCards, syncSurface};
})();
