(() => {
  'use strict';

  const VERSION = '17.4.2';
  const PRICE_TOLERANCE = 2.5;
  const dealFilter = { minDiscount: 0, maxPrice: null };
  const pendingArt = new Map();
  const failedArt = new Map();
  const trustedArtIds = new Set(['ninjagaiden','hinterberg','sniper','mlb26']);
  let sanitizedMarker = '';

  const isPromoGame = g => g?.storeVerified === true || String(g?.priceStatus || '').startsWith('verified') || g?.type === 'promo' || (Array.isArray(g?.categories) && g.categories.includes('promo'));
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

  function dealPriceError(g) {
    const current = Number(g?.currentPrice), original = Number(g?.originalPrice), discount = Number(g?.discountPercent);
    if (!(current > 0) || !(original > current) || !(discount > 0 && discount < 100)) return Infinity;
    return Math.abs((1 - current / original) * 100 - discount);
  }

  function validDealPrice(g) {
    if (!isPromoGame(g)) return true;
    if (String(g?.priceStatus || '').startsWith('rejected')) return false;
    return dealPriceError(g) <= PRICE_TOLERANCE;
  }

  function sanitizeDealPrices() {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return 0;
    let rejected = 0;
    for (const g of state.games) {
      if (!isPromoGame(g) || !(Number(g.discountPercent) > 0)) continue;
      if (validDealPrice(g)) {
        g.priceMathVerified = true;
        continue;
      }
      if (g.currentPrice !== null && g.currentPrice !== undefined) {
        if (g.rejectedCurrentPrice === undefined) g.rejectedCurrentPrice = g.currentPrice;
        g.currentPrice = null;
        g.priceStatus = 'rejected-client-math';
        g.priceMathVerified = false;
        rejected++;
      }
    }
    return rejected;
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
    const imageCount = state.games.reduce((n,g)=>n+(isPromoGame(g)&&g?.image?1:0),0);
    const marker = `${state.dealsGeneratedAt || 'seed'}|${state.games.length}|${imageCount}`;
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
    for (const [, games] of groups) {
      if (games.length < 2) continue;
      const titles = [...new Set(games.map(g => canonicalTitle(g.title)).filter(Boolean))];
      const stores = [...new Set(games.map(g => String(g.store || '').split('?')[0]).filter(Boolean))];
      if (titles.length < 2 || stores.length < 2) continue;
      const oneFamily = titles.every((a, i) => titles.every((b, j) => i === j || (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a)))));
      if (oneFamily) continue;
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
    sanitizeDealPrices();
    sanitizeImageCollisions();
  }

  function currentGame(id) {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return null;
    return state.games.find(g => String(g.id) === String(id)) || null;
  }

  function requestOfficialArt(g) {
    if (!g || g.image || !g.id || !g.store) return;
    if (!window.AndroidBridge || typeof window.AndroidBridge.resolveStoreImage !== 'function') return;
    if (!/^https:\/\/store\.playstation\.com\//i.test(g.store) || !/\/(?:product|concept)\//i.test(g.store)) return;
    const id = String(g.id), now = Date.now();
    const pendingAt = pendingArt.get(id) || 0;
    const failedAt = failedArt.get(id) || 0;
    if (now - pendingAt < 15000 || now - failedAt < 120000) return;
    pendingArt.set(id, now);
    try { window.AndroidBridge.resolveStoreImage(id, String(g.store)); }
    catch (_) { pendingArt.delete(id); failedArt.set(id, Date.now()); }
  }

  window.__PSRADAR_SET_IMAGE__ = (id, url) => {
    const key = String(id || '');
    pendingArt.delete(key);
    const clean = cleanImageUrl(url);
    if (!key || !/^https:\/\//i.test(String(url || '')) || !clean) return;
    const g = currentGame(key);
    if (!g) return;
    g.image = url;
    g.imageStatus = 'official-store-page-v1742';
    try { localStorage.setItem(`psradar-art-v174-${key}`, url); } catch (_) {}
    sanitizeImageCollisions();
    if (typeof renderGames === 'function') renderGames();
  };

  window.__PSRADAR_IMAGE_FAILED__ = id => {
    const key = String(id || '');
    pendingArt.delete(key);
    if (key) failedArt.set(key, Date.now());
  };

  if (typeof priceMarkup === 'function') {
    const basePriceMarkup = priceMarkup;
    priceMarkup = function(g) {
      if (isPromoGame(g) && Number(g?.discountPercent) > 0) {
        if (validDealPrice(g)) {
          const main = typeof won === 'function' ? `${won(g.currentPrice)} · ${Number(g.discountPercent)}%↓` : `${Number(g.currentPrice).toLocaleString('ko-KR')}원 · ${Number(g.discountPercent)}%↓`;
          const original = typeof won === 'function' ? won(g.originalPrice) : `${Number(g.originalPrice).toLocaleString('ko-KR')}원`;
          return { main, sub: `정가 ${original}${g.saleEndsAt && typeof formatDate === 'function' ? ` · ${formatDate(g.saleEndsAt)}까지` : ''}` };
        }
        return { main: `${Number(g.discountPercent)}% 할인`, sub: '판매가 재확인 중 · 잘못된 가격은 표시하지 않습니다' };
      }
      return basePriceMarkup(g);
    };
  }

  if (typeof radarScore === 'function') {
    const baseRadarScore = radarScore;
    radarScore = function(g) {
      if (!isPromoGame(g) || !(Number(g?.discountPercent) > 0)) return baseRadarScore(g);
      const discount = Math.max(0, Math.min(90, Number(g.discountPercent) || 0));
      let score = 18 + (discount / 90) * 42;
      const price = validDealPrice(g) ? Number(g.currentPrice) : null;
      if (Number.isFinite(price)) {
        if (price <= 5000) score += 18;
        else if (price <= 10000) score += 15;
        else if (price <= 20000) score += 11;
        else if (price <= 40000) score += 7;
        else score += 3;
      }
      if (g.ko) score += 8;
      const rating = Number(g.rating);
      if (Number.isFinite(rating) && rating > 0) score += Math.min(14, (rating / 5) * 14);
      if (g.storeVerified) score += 4;
      if (!validDealPrice(g)) score -= 10;
      return Math.round(Math.max(0, Math.min(100, score)));
    };
  }

  if (typeof purchaseAdvice === 'function') {
    const basePurchaseAdvice = purchaseAdvice;
    purchaseAdvice = function(g, historyOverride=null) {
      if (isPromoGame(g) && Number(g?.discountPercent) > 0 && !validDealPrice(g)) {
        return { action:'verify', label:'가격 확인', tone:'watch', priority:20, reason:'표시 할인율과 판매가 계산이 맞지 않아 가격을 다시 확인 중입니다.', low:null };
      }
      return basePurchaseAdvice(g, historyOverride);
    };
  }

  if (typeof filteredGames === 'function') {
    const baseFilteredGames = filteredGames;
    filteredGames = function() {
      prepareDealData();
      let arr = baseFilteredGames();
      if (!isPromoView()) return arr;
      if (dealFilter.minDiscount > 0) arr = arr.filter(g => Number(g.discountPercent) >= dealFilter.minDiscount);
      if (dealFilter.maxPrice !== null && Number.isFinite(Number(dealFilter.maxPrice))) {
        arr = arr.filter(g => validDealPrice(g) && Number(g.currentPrice) > 0 && Number(g.currentPrice) <= Number(dealFilter.maxPrice));
      }
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
    document.body.classList.toggle('promo-filter-visible', !bar.hidden);
    if (bar.hidden || typeof state === 'undefined') return;
    const count = activeFilterCount();
    bar.innerHTML = `<div class="deal-filter-head"><div><b>할인 빠른 필터</b><span>${count ? `${count}개 조건 적용 중` : '원하는 조건만 바로 골라보세요'}</span></div><button type="button" class="deal-filter-detail" data-deal-action="detail" data-deal-value="1">세부 필터</button></div><div class="deal-filter-scroll">${filterButton('전체','reset','all',count===0)}${filterButton('PS5','platform','PS5',state.platform==='PS5')}${filterButton('PS4','platform','PS4',state.platform==='PS4')}${filterButton('50%↑','discount','50',dealFilter.minDiscount===50)}${filterButton('70%↑','discount','70',dealFilter.minDiscount===70)}${filterButton('90%↑','discount','90',dealFilter.minDiscount===90)}${filterButton('한국어','korean','yes',state.korean==='yes')}${filterButton('1만원↓','price','10000',dealFilter.maxPrice===10000)}${filterButton('2만원↓','price','20000',dealFilter.maxPrice===20000)}${filterButton('할인율순','sort','discount',state.sort==='discount')}${filterButton('가격순','sort','price',state.sort==='price')}</div>`;
  }

  function hydrateVisibleMissingArt() {
    if (!isPromoView()) return;
    let issued = 0;
    document.querySelectorAll('#grid .card[data-id]').forEach(card => {
      if (issued >= 24) return;
      const g = currentGame(card.dataset.id);
      if (!g || g.image || card.querySelector('.cover-image')) return;
      requestOfficialArt(g);
      issued++;
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
    if (isPromoView()) setTimeout(hydrateVisibleMissingArt, 80);
  });

  window.addEventListener('DOMContentLoaded', () => {
    prepareDealData();
    ensureFilterBar();
    updateFilterBar();
    bodyObserver.observe(document.body, {attributes:true, attributeFilter:['data-page']});
    document.querySelector('#applyFilter')?.addEventListener('click', () => queueMicrotask(() => { updateFilterBar(); if (typeof renderGames === 'function') renderGames(); }));
    document.addEventListener('click', e => {
      if (e.target.closest?.('.navbtn[data-page="promo"]')) setTimeout(() => { updateFilterBar(); hydrateVisibleMissingArt(); }, 80);
    }, true);
    [300,900,1800,3500].forEach(ms => setTimeout(() => { prepareDealData(); updateFilterBar(); if (isPromoView() && typeof renderGames === 'function') renderGames(); }, ms));
  });

  window.__PSRADAR_V1741__ = { version: VERSION, cleanDisplayTitle, prepareDealData, resetDealFilters, validDealPrice, dealPriceError };
  window.__PSRADAR_V1742__ = window.__PSRADAR_V1741__;
})();