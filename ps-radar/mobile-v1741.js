(() => {
  'use strict';

  const dealFilter = { minDiscount: 0, maxPrice: null };
  const pendingArt = new Set();
  const rejectedArt = new Set();
  const trustedArtIds = new Set(['ninjagaiden','hinterberg','sniper','mlb26']);
  let sanitizedMarker = '';

  const isPromoGame = g => g?.storeVerified === true || g?.priceStatus === 'verified' || g?.type === 'promo' || (Array.isArray(g?.categories) && g.categories.includes('promo'));
  const isPromoView = () => (typeof state !== 'undefined' && state.view === 'promo') || document.body.dataset.page === 'promo';
  const cleanImageUrl = (value='') => {
    try { const u = new URL(value); u.search=''; u.hash=''; return u.href; }
    catch { return String(value || '').split('?')[0]; }
  };

  function cleanDisplayTitle(value='') {
    let s = String(value || '').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/\s+/g,' ').trim();
    const language = /(?:한국어|영어|일본어|중국어|간체자|번체자|Korean|English|Japanese|Chinese)/i;
    for (let pass=0; pass<3 && s.endsWith(')'); pass++) {
      let depth = 0, open = -1;
      for (let i=s.length-1; i>=0; i--) {
        if (s[i] === ')') depth++;
        else if (s[i] === '(') {
          depth--;
          if (depth === 0) { open = i; break; }
        }
      }
      if (open < 0) break;
      const tail = s.slice(open + 1, -1);
      if (!language.test(tail)) break;
      s = s.slice(0, open).trim();
    }
    return s.replace(/\s+/g,' ').trim();
  }

  function canonicalTitle(value='') {
    return cleanDisplayTitle(value).toLowerCase().replace(/[™®]/g,'').replace(/\b(?:ps4|ps5)\b/gi,'').replace(/[^a-z0-9가-힣]+/g,'');
  }

  function normalizeDealTitles() {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return 0;
    let changed = 0;
    for (const g of state.games) {
      if (!isPromoGame(g) || !g?.title) continue;
      const clean = cleanDisplayTitle(g.title);
      if (clean && clean !== g.title) {
        if (!g.storeTitle) g.storeTitle = g.title;
        g.title = clean;
        changed++;
      }
    }
    return changed;
  }

  function sanitizeImageCollisions() {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return 0;
    const marker = `${state.dealsGeneratedAt || 'seed'}|${state.games.length}`;
    if (marker === sanitizedMarker) return 0;
    sanitizedMarker = marker;

    const groups = new Map();
    for (const g of state.games) {
      if (!isPromoGame(g) || !g?.image || trustedArtIds.has(String(g.id))) continue;
      const key = cleanImageUrl(g.image);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    }

    let removed = 0;
    for (const [image, games] of groups) {
      if (games.length < 2) continue;
      const titles = [...new Set(games.map(g => canonicalTitle(g.title)).filter(Boolean))];
      const stores = [...new Set(games.map(g => String(g.store || '').split('?')[0]).filter(Boolean))];
      if (titles.length < 2 || stores.length < 2) continue;
      const oneFamily = titles.every((a, i) => titles.every((b, j) => i === j || (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a)))));
      if (oneFamily) continue;
      rejectedArt.add(image);
      for (const g of games) {
        g.rejectedImage = g.image;
        g.image = null;
        try { localStorage.removeItem(`psradar-art-v174-${g.id}`); } catch (_) {}
        removed++;
      }
    }
    return removed;
  }

  function prepareDealData() {
    normalizeDealTitles();
    sanitizeImageCollisions();
  }

  function currentGame(id) {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return null;
    return state.games.find(g => String(g.id) === String(id)) || null;
  }

  function requestOfficialArt(g) {
    if (!g || g.image || !g.id || !g.store || pendingArt.has(String(g.id))) return;
    if (!window.AndroidBridge || typeof window.AndroidBridge.resolveStoreImage !== 'function') return;
    if (!/^https:\/\/store\.playstation\.com\//i.test(g.store) || !/\/(?:product|concept)\//i.test(g.store)) return;
    pendingArt.add(String(g.id));
    try { window.AndroidBridge.resolveStoreImage(String(g.id), String(g.store)); }
    catch (_) { pendingArt.delete(String(g.id)); }
  }

  const previousSetImage = window.__PSRADAR_SET_IMAGE__;
  window.__PSRADAR_SET_IMAGE__ = (id, url) => {
    pendingArt.delete(String(id));
    const clean = cleanImageUrl(url);
    if (!id || !/^https:\/\//i.test(String(url || '')) || rejectedArt.has(clean)) return;
    if (typeof previousSetImage === 'function') previousSetImage(id, url);
    else {
      const g = currentGame(id);
      if (g) g.image = url;
      try { localStorage.setItem(`psradar-art-v174-${id}`, url); } catch (_) {}
      if (typeof renderGames === 'function') renderGames();
    }
  };

  if (typeof filteredGames === 'function') {
    const baseFilteredGames = filteredGames;
    filteredGames = function() {
      prepareDealData();
      let arr = baseFilteredGames();
      if (!isPromoView()) return arr;
      if (dealFilter.minDiscount > 0) arr = arr.filter(g => Number(g.discountPercent) >= dealFilter.minDiscount);
      if (dealFilter.maxPrice !== null && Number.isFinite(Number(dealFilter.maxPrice))) arr = arr.filter(g => Number(g.currentPrice) <= Number(dealFilter.maxPrice));
      return arr;
    };
  }

  function setSelect(id, value) {
    const el = document.querySelector(id);
    if (el) el.value = value;
  }

  function resetDealFilters() {
    dealFilter.minDiscount = 0;
    dealFilter.maxPrice = null;
    if (typeof state !== 'undefined') {
      state.content = 'all'; state.platform = 'all'; state.tier = 'all'; state.genre = 'all'; state.korean = 'all'; state.sort = 'default';
    }
    setSelect('#contentType','all'); setSelect('#platform','all'); setSelect('#tier','all'); setSelect('#genre','all'); setSelect('#korean','all'); setSelect('#sort','default');
  }

  function activeFilterCount() {
    if (typeof state === 'undefined') return 0;
    return [dealFilter.minDiscount > 0, dealFilter.maxPrice !== null, state.platform !== 'all', state.korean === 'yes', state.genre !== 'all', state.sort !== 'default'].filter(Boolean).length;
  }

  function filterButton(label, action, value, active=false) {
    return `<button type="button" class="deal-qf${active?' active':''}" data-deal-action="${action}" data-deal-value="${value}">${label}</button>`;
  }

  function ensureFilterBar() {
    let bar = document.querySelector('#dealQuickFilters');
    if (!bar) {
      bar = document.createElement('section');
      bar.id = 'dealQuickFilters';
      bar.className = 'deal-filter-shell';
      const target = document.querySelector('#resultsSection');
      if (target?.parentNode) target.parentNode.insertBefore(bar, target);
      bar.addEventListener('click', e => {
        const btn = e.target.closest('[data-deal-action]');
        if (!btn) return;
        const action = btn.dataset.dealAction, value = btn.dataset.dealValue;
        if (action === 'reset') resetDealFilters();
        if (action === 'platform') {
          state.platform = state.platform === value ? 'all' : value;
          setSelect('#platform', state.platform);
        }
        if (action === 'discount') dealFilter.minDiscount = dealFilter.minDiscount === Number(value) ? 0 : Number(value);
        if (action === 'price') dealFilter.maxPrice = dealFilter.maxPrice === Number(value) ? null : Number(value);
        if (action === 'korean') {
          state.korean = state.korean === 'yes' ? 'all' : 'yes';
          setSelect('#korean', state.korean);
        }
        if (action === 'sort') {
          state.sort = state.sort === value ? 'default' : value;
          setSelect('#sort', state.sort);
        }
        if (action === 'detail') {
          document.querySelector('#filterBtn')?.click();
          return;
        }
        if (typeof resetVisible === 'function') resetVisible();
        if (typeof renderGames === 'function') renderGames();
      });
    }
    return bar;
  }

  function updateFilterBar() {
    const bar = ensureFilterBar();
    if (!bar) return;
    bar.hidden = !isPromoView();
    if (bar.hidden || typeof state === 'undefined') return;
    const count = activeFilterCount();
    bar.innerHTML = `<div class="deal-filter-head"><div><b>할인 빠른 필터</b><span>${count ? `${count}개 조건 적용 중` : '원하는 조건만 바로 골라보세요'}</span></div><button type="button" class="deal-filter-detail" data-deal-action="detail" data-deal-value="1">세부 필터</button></div><div class="deal-filter-scroll">${filterButton('전체','reset','all',count===0)}${filterButton('PS5','platform','PS5',state.platform==='PS5')}${filterButton('PS4','platform','PS4',state.platform==='PS4')}${filterButton('50%↑','discount','50',dealFilter.minDiscount===50)}${filterButton('70%↑','discount','70',dealFilter.minDiscount===70)}${filterButton('90%↑','discount','90',dealFilter.minDiscount===90)}${filterButton('한국어','korean','yes',state.korean==='yes')}${filterButton('1만원↓','price','10000',dealFilter.maxPrice===10000)}${filterButton('2만원↓','price','20000',dealFilter.maxPrice===20000)}${filterButton('할인율순','sort','discount',state.sort==='discount')}${filterButton('가격순','sort','price',state.sort==='price')}</div>`;
  }

  function hydrateVisibleMissingArt() {
    if (!isPromoView()) return;
    let issued = 0;
    document.querySelectorAll('#grid .card[data-id]').forEach(card => {
      if (issued >= 10) return;
      const g = currentGame(card.dataset.id);
      if (!g || g.image || card.querySelector('.cover-image')) return;
      requestOfficialArt(g); issued++;
    });
  }

  if (typeof renderGames === 'function') {
    const baseRenderGames = renderGames;
    renderGames = function() {
      prepareDealData();
      baseRenderGames();
      updateFilterBar();
      hydrateVisibleMissingArt();
    };
  }

  const bodyObserver = new MutationObserver(() => {
    updateFilterBar();
    if (isPromoView() && typeof renderGames === 'function') queueMicrotask(() => renderGames());
  });

  window.addEventListener('DOMContentLoaded', () => {
    prepareDealData();
    ensureFilterBar();
    updateFilterBar();
    bodyObserver.observe(document.body, {attributes:true, attributeFilter:['data-page']});
    document.querySelector('#applyFilter')?.addEventListener('click', () => queueMicrotask(() => { updateFilterBar(); if (typeof renderGames === 'function') renderGames(); }));
    document.addEventListener('click', e => {
      if (e.target.closest?.('.navbtn[data-page="promo"]')) setTimeout(() => { updateFilterBar(); hydrateVisibleMissingArt(); }, 50);
    }, true);
    [300,900,1800].forEach(ms => setTimeout(() => { prepareDealData(); updateFilterBar(); if (isPromoView() && typeof renderGames === 'function') renderGames(); }, ms));
  });

  window.__PSRADAR_V1741__ = { cleanDisplayTitle, prepareDealData, resetDealFilters };
})();