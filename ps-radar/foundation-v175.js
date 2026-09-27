(() => {
  'use strict';

  const VERSION = '17.5.0';
  const REMOTE_BASE = 'https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/';
  const originalFetch = window.fetch.bind(window);
  const remoteState = { lastSuccessAt: null, lastFile: null, failures: 0 };
  const STATIC_DATA = new Set(['games.json','feed.json','store.json','store-auto.json','discovery.json','catalog-auto.json','deals-auto.json','upcoming.json']);

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
  }

  function mappedDataFile(input, init={}) {
    const method = String(init?.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET') return null;
    const raw = requestUrl(input);
    try {
      const u = new URL(raw, location.href);
      if (/\/api\/store$/i.test(u.pathname) && !u.searchParams.has('id')) return 'store-auto.json';
      if (/\/api\/feed$/i.test(u.pathname)) return 'feed.json';
      if (/\/api\/discover$/i.test(u.pathname)) return 'discovery.json';
      const m = u.pathname.match(/\/data\/([^/]+\.json)$/i);
      if (m && STATIC_DATA.has(m[1])) return m[1];
    } catch (_) {
      const m = raw.match(/(?:^|\/)data\/([^/?#]+\.json)/i);
      if (m && STATIC_DATA.has(m[1])) return m[1];
    }
    return null;
  }

  function localFallbackFor(file, original) {
    if (!file) return original;
    const raw = requestUrl(original);
    if (/\/api\//i.test(raw)) return `./data/${file}`;
    return original;
  }

  async function fetchWithTimeout(url, init={}, timeout=8500) {
    const controller = new AbortController();
    const upstream = init?.signal;
    const abort = () => controller.abort();
    if (upstream) {
      if (upstream.aborted) abort();
      else upstream.addEventListener('abort', abort, {once:true});
    }
    const timer = setTimeout(abort, timeout);
    try {
      return await originalFetch(url, {...init, cache:'no-store', signal:controller.signal});
    } finally {
      clearTimeout(timer);
      if (upstream) upstream.removeEventListener?.('abort', abort);
    }
  }

  window.fetch = async function psRadarRemoteFirst(input, init={}) {
    const file = mappedDataFile(input, init);
    if (!file || navigator.onLine === false) return originalFetch(localFallbackFor(file, input), init);
    const remote = `${REMOTE_BASE}${file}?v=${Date.now()}`;
    try {
      const response = await fetchWithTimeout(remote, init);
      if (response.ok) {
        remoteState.lastSuccessAt = new Date().toISOString();
        remoteState.lastFile = file;
        return response;
      }
      remoteState.failures += 1;
    } catch (_) {
      remoteState.failures += 1;
    }
    return originalFetch(localFallbackFor(file, input), init);
  };

  function safeToast(message) {
    try { if (typeof toast === 'function') toast(message); } catch (_) {}
  }

  function watchedItems() {
    if (typeof wish === 'undefined' || typeof state === 'undefined' || !Array.isArray(state.games)) return [];
    return [...wish].map(id => {
      const base = state.games.find(g => String(g.id) === String(id));
      if (!base) return {id:String(id)};
      const g = typeof mergeGame === 'function' ? mergeGame(base) : base;
      return {
        id:String(g.id || id),
        title:String(g.title || ''),
        store:String(g.store || ''),
        currentPrice:Number.isFinite(Number(g.currentPrice)) ? Number(g.currentPrice) : null,
        discountPercent:Number(g.discountPercent) || 0,
        plusIncluded:!!g.plusIncluded,
        plusTier:g.plusTier || g.tier || null
      };
    });
  }

  let syncWatchTimer = null;
  function syncNativeWatchlist() {
    if (!window.AndroidBridge || typeof window.AndroidBridge.syncWatchlist !== 'function') return;
    clearTimeout(syncWatchTimer);
    syncWatchTimer = setTimeout(() => {
      try { window.AndroidBridge.syncWatchlist(JSON.stringify(watchedItems())); } catch (_) {}
    }, 120);
  }

  function enableNativeNotifications() {
    if (!window.AndroidBridge || typeof window.AndroidBridge.enableNativeNotifications !== 'function') return false;
    try {
      syncNativeWatchlist();
      window.AndroidBridge.enableNativeNotifications();
      const badge = document.querySelector('#pushStatus');
      if (badge) { badge.textContent='백그라운드 감시 ON'; badge.classList.add('on'); }
      safeToast('찜 게임 가격·할인 변화를 백그라운드에서 확인하도록 설정했습니다.');
      return true;
    } catch (_) { return false; }
  }

  function installNativeHooks() {
    document.addEventListener('click', e => {
      if (e.target.closest?.('#notifyBtn') && window.AndroidBridge) {
        if (enableNativeNotifications()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
      if (e.target.closest?.('.heart')) setTimeout(syncNativeWatchlist, 40);
    }, true);
    syncNativeWatchlist();
  }

  let routingReady = false;
  let routingFromPop = false;
  const validPages = new Set(['home','catalog','monthly','promo','upcoming','wishlist','plus','my']);

  function pageFromHash() {
    const raw = String(location.hash || '').replace(/^#\/?/, '').split(/[?&]/)[0];
    return validPages.has(raw) ? raw : null;
  }

  function clickPage(page) {
    const target = document.querySelector(`.navbtn[data-page="${CSS.escape(page)}"]`);
    if (target) { target.click(); return true; }
    return false;
  }

  function installRouter() {
    const initial = document.body.dataset.page || pageFromHash() || 'home';
    history.replaceState({psRadar:true,page:initial},'',`#${initial}`);
    const observer = new MutationObserver(() => {
      if (!routingReady) return;
      const page = document.body.dataset.page || 'home';
      if (!validPages.has(page)) return;
      if (routingFromPop) { routingFromPop = false; return; }
      if (history.state?.page === page) return;
      history.pushState({psRadar:true,page},'',`#${page}`);
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['data-page']});
    window.addEventListener('popstate', e => {
      const page = validPages.has(e.state?.page) ? e.state.page : (pageFromHash() || 'home');
      if ((document.body.dataset.page || 'home') === page) return;
      routingFromPop = true;
      if (!clickPage(page)) {
        const home = document.querySelector('.navbtn[data-page="home"]');
        home?.click();
      }
      setTimeout(() => { routingFromPop = false; }, 180);
    });
    routingReady = true;
  }

  window.__PSRADAR_ANDROID_BACK__ = () => {
    const modal = document.querySelector('#detailModal');
    if (modal && modal.getAttribute('aria-hidden') !== 'true') {
      document.querySelector('#closeDetail')?.click();
      return true;
    }
    const drawer = document.querySelector('#drawer');
    if (drawer && drawer.getAttribute('aria-hidden') !== 'true') {
      document.querySelector('#closeDrawer')?.click();
      return true;
    }
    const page = document.body.dataset.page || 'home';
    if (page !== 'home') {
      if (history.length > 1) history.back();
      else clickPage('home');
      return true;
    }
    return false;
  };

  function dynamicMonth() {
    let d = null;
    try {
      const source = (typeof state !== 'undefined' && (state.catalogGeneratedAt || state.storeGeneratedAt || state.generatedAt)) || null;
      d = source ? new Date(source) : new Date();
      if (Number.isNaN(d.getTime())) d = new Date();
    } catch (_) { d = new Date(); }
    return d.getMonth() + 1;
  }

  function repairDynamicMonthLabels(root=document) {
    const month = dynamicMonth();
    root.querySelectorAll?.('#pageCoverage strong,#pageCoverage span').forEach(el => {
      if (!el.dataset.psRadarMonthTemplate) el.dataset.psRadarMonthTemplate = el.textContent;
      const template = el.dataset.psRadarMonthTemplate || el.textContent;
      if (/\d{1,2}월/.test(template)) el.textContent = template.replace(/\d{1,2}월/g, `${month}월`);
    });
  }

  function measureChrome() {
    const bottom = document.querySelector('.bottomnav');
    const top = document.querySelector('.topbar');
    const bh = bottom ? Math.ceil(bottom.getBoundingClientRect().height) : 76;
    const th = top ? Math.ceil(top.getBoundingClientRect().height) : 68;
    document.documentElement.style.setProperty('--ps-bottom-nav', `${bh + 18}px`);
    document.documentElement.style.setProperty('--ps-topbar', `${th + 6}px`);
  }

  function installLayoutObserver() {
    measureChrome();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measureChrome) : null;
    if (ro) {
      const bottom=document.querySelector('.bottomnav'), top=document.querySelector('.topbar');
      if (bottom) ro.observe(bottom);
      if (top) ro.observe(top);
    }
    window.addEventListener('resize',measureChrome,{passive:true});
    const mo = new MutationObserver(() => { repairDynamicMonthLabels(document); measureChrome(); });
    mo.observe(document.body,{subtree:true,childList:true});
  }

  window.addEventListener('DOMContentLoaded', () => {
    installNativeHooks();
    installRouter();
    installLayoutObserver();
    repairDynamicMonthLabels(document);
    if (window.AndroidBridge && typeof state !== 'undefined') {
      state.push = {...state.push, enabled:true, storage:'android-workmanager'};
      const badge=document.querySelector('#pushStatus');
      if (badge) badge.textContent='네이티브 감시 준비';
    }
  });

  window.addEventListener('online', () => safeToast('온라인 연결이 복구되었습니다. 새로고침하면 최신 데이터를 확인합니다.'));
  window.__PSRADAR_V175__ = {VERSION, REMOTE_BASE, remoteState, syncNativeWatchlist, repairDynamicMonthLabels, measureChrome};
})();
