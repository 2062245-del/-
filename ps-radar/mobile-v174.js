(() => {
  'use strict';

  const OFFICIAL_ART = {
    'ninjagaidenragebound': 'https://image.api.playstation.com/vulcan/ap/rnd/202504/1616/1d597e382b15add20c2278a6cf4e63b1436201a23df442b0.png',
    'dungeonsofhinterberg': 'https://image.api.playstation.com/vulcan/ap/rnd/202502/2416/0ec9feaba2eeb9ed52cc8ccdd6e432f09c1ea22fc06a7942.png',
    'snipereliteresistance': 'https://image.api.playstation.com/vulcan/ap/rnd/202408/1309/b026676dfa9d7639fef041a9f0ed4c6d076e2ad3647eae1c.png',
    'mlbtheshow26': 'https://image.api.playstation.com/vulcan/ap/rnd/202604/0320/d0f63858fdbc8466678f15fb5d68873b78fb5ee915117216.png'
  };

  const normalizeTitle = (v='') => {
    if (typeof titleKey === 'function') return titleKey(v);
    return String(v).toLowerCase().replace(/\([^)]*(?:한국어|영어|일본어|중국어)[^)]*\)/g,' ').replace(/\b(?:ps4|ps5)\b|[™®]/g,' ').replace(/[^a-z0-9가-힣]+/g,'').trim();
  };

  const imageCacheKey = id => `psradar-art-v174-${id}`;
  const validMoney = v => Number.isFinite(Number(v)) && Number(v) >= 0;
  const verifiedSale = g => {
    const current = Number(g?.currentPrice), original = Number(g?.originalPrice), discount = Number(g?.discountPercent);
    if (!Number.isFinite(current) || !Number.isFinite(original) || !(original > current && current >= 0 && discount > 0)) return false;
    if (g?.saleEndsAt) {
      const end = new Date(g.saleEndsAt).getTime();
      if (Number.isFinite(end) && end <= Date.now()) return false;
    }
    return g?.storeVerified === true || g?.priceStatus === 'verified' || g?.dataQuality === 'verified';
  };

  function artFor(g) {
    if (g?.image) return g.image;
    const cached = g?.id ? localStorage.getItem(imageCacheKey(g.id)) : '';
    if (cached) return cached;
    return OFFICIAL_ART[normalizeTitle(g?.title)] || '';
  }

  function applyKnownArt() {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return;
    for (const g of state.games) {
      if (!g.image) {
        const art = artFor(g);
        if (art) g.image = art;
      }
    }
  }

  function qualityScore(g) {
    let s = 0;
    if (g?.image) s += 120;
    if (verifiedSale(g)) s += 80;
    if (validMoney(g?.currentPrice)) s += 20;
    if (Number(g?.rating) > 0) s += 20;
    s += Math.min(30, Math.log10((Number(g?.ratingCount) || 0) + 1) * 8);
    if (g?.storeVerified) s += 15;
    if (g?.dataQuality === 'verified') s += 10;
    return s;
  }

  function dedupeTitles(items=[]) {
    const map = new Map();
    for (const source of items) {
      if (!source) continue;
      const g = {...source};
      if (!g.image) g.image = artFor(g) || null;
      const key = normalizeTitle(g.title) || String(g.id || g.store || Math.random());
      const prev = map.get(key);
      if (!prev) {
        map.set(key, g);
        continue;
      }
      const preferred = qualityScore(g) > qualityScore(prev) ? g : prev;
      const other = preferred === g ? prev : g;
      map.set(key, {
        ...preferred,
        image: preferred.image || other.image || null,
        currentPrice: validMoney(preferred.currentPrice) ? preferred.currentPrice : other.currentPrice,
        originalPrice: validMoney(preferred.originalPrice) ? preferred.originalPrice : other.originalPrice,
        discountPercent: Number(preferred.discountPercent) > 0 ? preferred.discountPercent : other.discountPercent,
        rating: Number(preferred.rating) > 0 ? preferred.rating : other.rating,
        ratingCount: Math.max(Number(preferred.ratingCount) || 0, Number(other.ratingCount) || 0),
        platform: [...new Set([...(preferred.platform || []), ...(other.platform || [])])]
      });
    }
    return [...map.values()];
  }

  function finalGames() {
    if (typeof state === 'undefined' || !Array.isArray(state.games)) return [];
    const merged = state.games.map(g => typeof mergeGame === 'function' ? mergeGame(g) : g)
      .filter(g => !g?.catalogLegacyHidden && g?.type !== 'promo');
    return dedupeTitles(merged);
  }

  function requestOfficialImage(g) {
    if (!g || g.image || !g.id || !g.store) return;
    const cached = localStorage.getItem(imageCacheKey(g.id));
    if (cached) {
      const target = state?.games?.find(x => x.id === g.id);
      if (target && !target.image) target.image = cached;
      return;
    }
    if (!window.AndroidBridge || typeof window.AndroidBridge.resolveStoreImage !== 'function') return;
    if (!/^https:\/\/store\.playstation\.com\//i.test(g.store)) return;
    if (!/\/(?:product|concept)\//i.test(g.store)) return;
    try { window.AndroidBridge.resolveStoreImage(String(g.id), String(g.store)); } catch (_) {}
  }

  window.__PSRADAR_SET_IMAGE__ = (id, url) => {
    if (!id || !/^https:\/\//i.test(String(url || ''))) return;
    try { localStorage.setItem(imageCacheKey(id), url); } catch (_) {}
    const target = typeof state !== 'undefined' && Array.isArray(state.games) ? state.games.find(x => String(x.id) === String(id)) : null;
    if (target) target.image = url;
    if (typeof renderCurations === 'function') renderCurations();
    if (document.body.dataset.page !== 'home' && typeof renderGames === 'function') renderGames();
  };

  if (typeof curationGroups === 'function') {
    curationGroups = function() {
      const games = finalGames();
      const recent = games.filter(g => g.catalogAddedAt || g.type === 'monthly' || g.type === 'latest')
        .sort((a,b) => String(b.catalogAddedAt || b.discoveredAt || '').localeCompare(String(a.catalogAddedAt || a.discoveredAt || '')) || (typeof radarScore === 'function' ? radarScore(b)-radarScore(a) : 0)).slice(0,4);
      const rated = games.filter(g => Number(g.rating) > 0)
        .sort((a,b) => (Number(b.rating)||0)-(Number(a.rating)||0) || (Number(b.ratingCount)||0)-(Number(a.ratingCount)||0)).slice(0,4);
      const deals = games.filter(verifiedSale)
        .sort((a,b) => (Number(b.discountPercent)||0)-(Number(a.discountPercent)||0) || (Number(a.currentPrice)||Infinity)-(Number(b.currentPrice)||Infinity)).slice(0,4);
      const ending = games.map(g => ({...g,_ending: typeof endingDays === 'function' ? endingDays(g) : null}))
        .filter(g => g._ending !== null && g._ending >= 0 && g._ending <= 30)
        .sort((a,b) => a._ending-b._ending).slice(0,4);
      return [
        {key:'new',title:'신규',eyebrow:'NEW',items:recent,empty:'최근 추가된 게임을 확인 중입니다.'},
        {key:'rating',title:'최고평점',eyebrow:'TOP RATED',items:rated,empty:'평점 데이터가 아직 충분하지 않습니다.'},
        {key:'deal',title:'할인추천',eyebrow:'DEALS',items:deals,empty:'현재 공식 Store에서 검증된 할인 게임이 없습니다.'},
        {key:'ending',title:'곧 종료',eyebrow:'ENDING',items:ending,empty:'30일 안에 종료 예정인 혜택이 없습니다.'}
      ];
    };
  }

  if (typeof curationMeta === 'function') {
    const originalCurationMeta = curationMeta;
    curationMeta = function(g, key) {
      if (key === 'deal') {
        if (verifiedSale(g)) {
          const discount = Math.round(Number(g.discountPercent) || 0);
          const current = typeof won === 'function' ? won(g.currentPrice) : `${Number(g.currentPrice).toLocaleString('ko-KR')}원`;
          return `-${discount}% · ${current}`;
        }
        return '가격 확인 중';
      }
      return originalCurationMeta(g, key);
    };
  }

  if (typeof renderCurations === 'function') {
    const originalRenderCurations = renderCurations;
    renderCurations = function() {
      applyKnownArt();
      originalRenderCurations();
      const groups = typeof curationGroups === 'function' ? curationGroups() : [];
      const byId = new Map();
      groups.forEach(group => (group.items || []).forEach(g => byId.set(String(g.id), g)));
      document.querySelectorAll('#curationGrid [data-id]').forEach(btn => {
        const g = byId.get(String(btn.dataset.id));
        const thumb = btn.querySelector('.curation-thumb');
        if (!thumb) return;
        const img = thumb.querySelector('img');
        if (img) {
          thumb.classList.remove('image-missing');
          img.addEventListener('error', () => {
            img.remove();
            thumb.classList.add('image-missing');
            requestOfficialImage(g);
          }, {once:true});
        } else {
          thumb.classList.add('image-missing');
          requestOfficialImage(g);
        }
      });
    };
  }

  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const card = img.closest('[data-id]');
    const id = card?.dataset?.id;
    if (!id || typeof state === 'undefined') return;
    const g = state.games.find(x => String(x.id) === String(id));
    if (g) requestOfficialImage(g);
  }, true);

  window.addEventListener('DOMContentLoaded', () => {
    applyKnownArt();
    document.body.classList.toggle('android-app', !!window.AndroidBridge);
    [350, 1200, 2600].forEach(ms => setTimeout(() => {
      applyKnownArt();
      if (typeof renderCurations === 'function') renderCurations();
    }, ms));
  });
})();
