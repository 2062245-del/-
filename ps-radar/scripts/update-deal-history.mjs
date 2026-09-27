import fs from 'node:fs/promises';

const DEALS_FILE = 'ps-radar/data/deals-auto.json';
const HISTORY_FILE = 'ps-radar/data/deal-history.json';
const PRICE_TOLERANCE = Number(process.env.PSRADAR_PRICE_TOLERANCE || 2.5);

const cleanUrl = value => {
  try {
    const u = new URL(value);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return String(value || '').split('?')[0].replace(/\/$/, ''); }
};

const titleKey = value => String(value || '')
  .toLowerCase()
  .replace(/\([^)]*(?:한국어|영어|일본어|중국어|korean|english|japanese|chinese)[^)]*\)/gi, ' ')
  .replace(/\b(?:ps4|ps5)\b|[™®]/gi, ' ')
  .replace(/[^a-z0-9가-힣]+/g, '');

function historyKey(item) {
  const store = cleanUrl(item?.store);
  return store || `title:${titleKey(item?.title) || item?.id || 'unknown'}`;
}

function validPrice(item) {
  if (String(item?.priceStatus || '').startsWith('rejected')) return false;
  const c = Number(item?.currentPrice), o = Number(item?.originalPrice), d = Number(item?.discountPercent);
  if (!(c > 0) || !(o > c) || !(d > 0 && d < 100)) return false;
  return Math.abs((1 - c / o) * 100 - d) <= PRICE_TOLERANCE;
}

const deals = JSON.parse(await fs.readFile(DEALS_FILE, 'utf8'));
if (!Array.isArray(deals?.items)) throw new Error('deals-auto.json items missing');

let history = {version:1, generatedAt:null, source:'PS Radar observed history', items:{}};
let hadHistory = false;
try {
  const prior = JSON.parse(await fs.readFile(HISTORY_FILE, 'utf8'));
  if (prior && typeof prior.items === 'object' && Object.keys(prior.items).length) {
    history = {...history, ...prior, items:{...prior.items}};
    hadHistory = true;
  }
} catch (_) {}

const observedAt = deals.generatedAt || new Date().toISOString();
let tracked = 0, lows = 0, newDeals = 0;
const liveKeys = new Set();

for (const item of deals.items) {
  const key = historyKey(item);
  if (!key) continue;
  liveKeys.add(key);
  const prev = history.items[key] || null;
  const isNew = hadHistory && !prev;
  const entry = {
    ...(prev || {}),
    key,
    id:item.id || prev?.id || null,
    title:item.title || prev?.title || '',
    store:cleanUrl(item.store) || prev?.store || '',
    firstSeenAt:prev?.firstSeenAt || observedAt,
    lastSeenAt:observedAt,
    observations:Number(prev?.observations || 0) + 1,
    seenSnapshots:Number(prev?.seenSnapshots || 0) + 1,
    active:true
  };

  if (validPrice(item)) {
    const current = Number(item.currentPrice);
    const discount = Number(item.discountPercent);
    entry.lastPrice = current;
    entry.lastDiscount = discount;
    entry.lastOriginalPrice = Number(item.originalPrice);
    entry.lowestPrice = Number.isFinite(Number(prev?.lowestPrice)) ? Math.min(Number(prev.lowestPrice), current) : current;
    entry.highestDiscount = Math.max(Number(prev?.highestDiscount || 0), discount);
    entry.priceObservations = Number(prev?.priceObservations || 0) + 1;
    if (!prev || current < Number(prev.lowestPrice ?? Infinity)) entry.lowestPriceObservedAt = observedAt;
    else entry.lowestPriceObservedAt = prev.lowestPriceObservedAt || observedAt;

    item.radarLowPrice = entry.lowestPrice;
    item.radarLowObservedAt = entry.lowestPriceObservedAt;
    item.radarObservations = entry.priceObservations;
    item.radarHighestDiscount = entry.highestDiscount;
    item.isRadarLow = current <= entry.lowestPrice * 1.001;
    item.nearRadarLow = current <= entry.lowestPrice * 1.05;
    item.radarLowDeltaPercent = entry.lowestPrice > 0 ? Number((((current / entry.lowestPrice) - 1) * 100).toFixed(1)) : null;
    tracked++;
    if (item.isRadarLow) lows++;
  } else {
    item.radarLowPrice = Number.isFinite(Number(prev?.lowestPrice)) ? Number(prev.lowestPrice) : null;
    item.radarObservations = Number(prev?.priceObservations || 0);
    item.isRadarLow = false;
    item.nearRadarLow = false;
  }

  item.radarFirstSeenAt = entry.firstSeenAt;
  item.radarNewDeal = isNew;
  if (isNew) newDeals++;
  history.items[key] = entry;
}

for (const [key, entry] of Object.entries(history.items)) {
  if (!liveKeys.has(key) && entry.active !== false) history.items[key] = {...entry, active:false, lastEndedAt:observedAt};
}

history.version = 1;
history.generatedAt = observedAt;
history.initializedBaseline = history.initializedBaseline || !hadHistory;
history.itemCount = Object.keys(history.items).length;
history.activeCount = liveKeys.size;
history.validPriceCount = tracked;
history.newDealCount = newDeals;
history.lowCount = lows;

deals.health = {
  ...(deals.health || {}),
  dealHistoryVersion: 1,
  observedHistoryCount: history.itemCount,
  observedActiveCount: history.activeCount,
  observedValidPriceCount: tracked,
  observedNewDealCount: newDeals,
  observedLowCount: lows
};

await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2) + '\n');
await fs.writeFile(DEALS_FILE, JSON.stringify(deals, null, 2) + '\n');
console.log('PS Radar observed history updated', {
  history:history.itemCount, active:history.activeCount, validPrices:tracked, newDeals, lows, baseline:!hadHistory
});
