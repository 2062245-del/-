import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const json = p => JSON.parse(read(p));
const must = (ok, msg) => { if (!ok) throw new Error(msg); };
const tokens = (text, required, scope) => {
  for (const token of required) must(text.includes(token), `${scope} missing: ${token}`);
};

const root = 'ps-radar';
const foundation = read(`${root}/foundation-v175.js`);
const ux = read(`${root}/ux-v176.js`);
const content = read(`${root}/content-v177.js`);
const index = read(`${root}/index.html`);
const main = read(`${root}/android/MainActivity.java`);
const worker = read(`${root}/android/DealWatchWorker.java`);
const css = [
  fs.existsSync(`${root}/ux-v176.css`) ? read(`${root}/ux-v176.css`) : '',
  fs.existsSync(`${root}/mobile-v1741.css`) ? read(`${root}/mobile-v1741.css`) : ''
].join('\n');
const deals = json(`${root}/data/deals-auto.json`);

function stage175() {
  tokens(foundation, [
    "17.5.0", 'REMOTE_BASE', 'history.pushState', 'popstate', 'currentMonthLabel',
    'getRemoteBaseUrl', 'syncRemoteData'
  ], 'v17.5 foundation');
  tokens(main, [
    'PUBLIC_DATA_BASE', 'REMOTE_BASE', 'WorkManager', 'PeriodicWorkRequest',
    'POST_NOTIFICATIONS', 'syncRemoteData', 'showWatchNotification'
  ], 'v17.5 MainActivity');
  tokens(worker, ['Worker', 'OkHttpClient', 'NotificationCompat', 'deals-auto.json'], 'v17.5 DealWatchWorker');
  console.log('[v17.5 Foundation] PASS - remote refresh, routing/back, dynamic month, native watch/notification foundations');
}

function stage176() {
  tokens(ux, ['17.6.0', 'contentSections', 'psplus', 'my', 'renderHomeSummary', 'compact'], 'v17.6 UX');
  const navBlock = index.match(/<nav class="bottomnav"[\s\S]*?<\/nav>/i)?.[0] || '';
  const navCount = (navBlock.match(/class="navbtn/g) || []).length;
  must(navCount === 5, `v17.6 bottom navigation must have exactly 5 tabs, got ${navCount}`);
  for (const label of ['홈','PS Plus','할인','발매예정','MY']) must(navBlock.includes(label), `v17.6 nav missing label: ${label}`);
  must(/safe-area-inset-bottom|--bottom-nav/i.test(css + index + ux), 'v17.6 safe-area/bottom navigation sizing missing');
  console.log('[v17.6 UX] PASS - 5-tab navigation, PS Plus hub, MY, compact cards, home summary, safe-area handling');
}

function stage177() {
  tokens(content, [
    '17.7.0', '오늘 새 할인', '역대 최저', '만원 이하', '무료·체험',
    '출시 캘린더', '살까 말까', 'valueDecision'
  ], 'v17.7 content');
  must(deals?.health?.safeToMerge === true, 'v17.7 deals safety flag is false');
  must(Array.isArray(deals.items) && deals.items.length >= 2000, `v17.7 deal count too small: ${deals?.items?.length || 0}`);

  let valid = 0, rejected = 0, badVisible = 0, withImage = 0;
  for (const x of deals.items) {
    if (x.image) withImage++;
    if (String(x.priceStatus || '').startsWith('rejected')) { rejected++; continue; }
    const c = Number(x.currentPrice), o = Number(x.originalPrice), d = Number(x.discountPercent);
    if (c > 0 && o > c && d > 0 && d < 100) {
      const err = Math.abs((1 - c / o) * 100 - d);
      if (err > 2.5) badVisible++;
      else valid++;
    }
  }
  must(badVisible === 0, `v17.7 visible price/discount mismatches: ${badVisible}`);
  const priced = valid + rejected;
  const confidence = priced ? valid / priced : 0;
  must(confidence >= 0.94, `v17.7 valid-price confidence too low: ${(confidence*100).toFixed(1)}%`);
  must(deals.health.contentSignals || content.includes('contentSignals'), 'v17.7 contentSignals missing');
  console.log(`[v17.7 Content] PASS - deals=${deals.items.length}, validPrices=${valid}, rejected=${rejected}, visibleMismatches=${badVisible}, priceConfidence=${(confidence*100).toFixed(1)}%, images=${withImage}`);
}

stage175();
stage176();
stage177();
console.log('[PS Radar v17.7 Final] ALL STAGES PASS');
