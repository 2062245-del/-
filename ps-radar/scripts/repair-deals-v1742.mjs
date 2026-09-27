import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const FILE = 'ps-radar/data/deals-auto.json';
const MAX_TOTAL_PAGES = Number(process.env.PSRADAR_REPAIR_MAX_PAGES || 160);
const MAX_PAGES_PER_CAMPAIGN = Number(process.env.PSRADAR_REPAIR_MAX_CAMPAIGN_PAGES || 60);
const DISCOUNT_TOLERANCE = Number(process.env.PSRADAR_PRICE_TOLERANCE || 2.5);

const cleanUrl = value => {
  try {
    const u = new URL(value);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return String(value || '').split('?')[0].replace(/\/$/, ''); }
};

function priceError(current, original, discount) {
  const c = Number(current), o = Number(original), d = Number(discount);
  if (!(c > 0) || !(o > c) || !(d > 0 && d < 100)) return Infinity;
  const implied = (1 - c / o) * 100;
  return Math.abs(implied - d);
}

function existingPriceIsValid(item) {
  return priceError(item.currentPrice, item.originalPrice, item.discountPercent) <= DISCOUNT_TOLERANCE;
}

function pageUrls(campaign) {
  const url = cleanUrl(campaign.url);
  try {
    const u = new URL(url);
    const cat = u.pathname.match(/^(\/ko-kr\/category\/[0-9a-f-]+)(?:\/(\d+))?\/?$/i);
    const total = Number(campaign.total) || 0;
    if (!cat || total <= 24) return [url];
    const count = Math.min(MAX_PAGES_PER_CAMPAIGN, Math.max(1, Math.ceil(total / 24)));
    return Array.from({ length: count }, (_, i) => `${u.origin}${cat[1]}/${i + 1}`);
  } catch {
    return [url];
  }
}

async function settle(page) {
  await page.waitForTimeout(550);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(320);
  }
}

async function scanPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (response && response.status() >= 400) return [];
  await settle(page);
  return page.evaluate((tolerance) => {
    const wonValues = text => [...String(text || '').matchAll(/\d{1,3}(?:,\d{3})*원/g)]
      .map(m => Number(m[0].replace(/[^0-9]/g, '')))
      .filter(n => Number.isFinite(n) && n > 0);
    const discountValue = text => {
      const m = String(text || '').match(/(?:-|\b)(\d{1,2})\s*%/) || String(text || '').match(/(\d{1,2})\s*%\s*할인/);
      const n = m ? Number(m[1]) : 0;
      return n > 0 && n < 100 ? n : 0;
    };
    const choosePair = (prices, discount) => {
      const unique = [...new Set(prices)].sort((a,b) => a-b);
      let best = null;
      for (const current of unique) {
        for (const original of unique) {
          if (!(original > current)) continue;
          const implied = (1 - current / original) * 100;
          const error = Math.abs(implied - discount);
          if (error > tolerance) continue;
          const candidate = { currentPrice: current, originalPrice: original, error, implied };
          if (!best || candidate.error < best.error - 0.001 || (Math.abs(candidate.error - best.error) < 0.001 && original > best.originalPrice)) best = candidate;
        }
      }
      return best;
    };
    const clean = href => String(href || '').split('?')[0].replace(/\/$/, '');
    const out = [];
    const links = [...document.querySelectorAll('a[href*="/product/"],a[href*="/concept/"]')];
    const seen = new Set();
    for (const a of links) {
      const store = clean(a.href);
      if (!store || seen.has(store)) continue;
      let node = a;
      let card = null;
      let text = '';
      let discountPercent = 0;
      let pair = null;
      for (let depth = 0; depth <= 7 && node; depth++, node = node.parentElement) {
        const candidateText = (node.innerText || '').trim();
        const discount = discountValue(candidateText);
        if (!discount) continue;
        const candidatePair = choosePair(wonValues(candidateText), discount);
        if (candidatePair) {
          card = node;
          text = candidateText;
          discountPercent = discount;
          pair = candidatePair;
          break;
        }
      }
      if (!card || !pair || !discountPercent) continue;
      seen.add(store);

      const directImage = a.querySelector('img');
      const cardImages = [...card.querySelectorAll('img')].map(img => img.currentSrc || img.src).filter(Boolean);
      const uniqueImages = [...new Set(cardImages)];
      const image = (directImage?.currentSrc || directImage?.src || (uniqueImages.length === 1 ? uniqueImages[0] : null)) || null;
      const imgAlt = (directImage?.getAttribute('alt') || '').replace(/^Image:\s*/i, '').trim();
      const label = (a.getAttribute('aria-label') || '').trim();
      const linkText = (a.textContent || '').trim();
      const title = [label, linkText, imgAlt].find(x => x && x.length > 1 && !/^image$/i.test(x)) || '';
      const platform = [];
      if (/\bPS5\b/.test(text)) platform.push('PS5');
      if (/\bPS4\b/.test(text)) platform.push('PS4');
      out.push({
        store,
        title,
        image,
        currentPrice: pair.currentPrice,
        originalPrice: pair.originalPrice,
        discountPercent,
        priceCrosscheckError: Number(pair.error.toFixed(3)),
        platform,
        ko: /한국어/.test(text)
      });
    }
    return out;
  }, DISCOUNT_TOLERANCE);
}

const payload = JSON.parse(await fs.readFile(FILE, 'utf8'));
if (!Array.isArray(payload?.items)) throw new Error('deals-auto.json items missing');
const campaigns = (payload.campaigns || []).filter(x => x?.url && !x.skippedAsNonGame);
if (!campaigns.length) throw new Error('No eligible campaigns available for price crosscheck');

const queues = campaigns.map(c => ({ campaign: c, urls: pageUrls(c), index: 0 }));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

const precise = new Map();
let pagesScanned = 0;
while (pagesScanned < MAX_TOTAL_PAGES && queues.some(q => q.index < q.urls.length)) {
  for (const q of queues) {
    if (pagesScanned >= MAX_TOTAL_PAGES) break;
    if (q.index >= q.urls.length) continue;
    const url = q.urls[q.index++];
    try {
      const rows = await scanPage(page, url);
      pagesScanned++;
      for (const row of rows) {
        const prev = precise.get(row.store);
        if (!prev || row.priceCrosscheckError < prev.priceCrosscheckError) precise.set(row.store, row);
      }
      console.log(`[repair ${pagesScanned}/${MAX_TOTAL_PAGES}]`, q.campaign.title || q.campaign.url, rows.length, 'precise rows', precise.size);
    } catch (err) {
      pagesScanned++;
      console.warn('Repair page failed:', url, err.message);
    }
  }
}
await browser.close();

let repaired = 0;
let rejected = 0;
let artworkRefilled = 0;
let alreadyValid = 0;
let unmatched = 0;
for (const item of payload.items) {
  const key = cleanUrl(item.store);
  const row = precise.get(key);
  if (row) {
    item.currentPrice = row.currentPrice;
    item.originalPrice = row.originalPrice;
    item.discountPercent = row.discountPercent;
    item.priceCrosscheckError = row.priceCrosscheckError;
    item.priceStatus = 'verified';
    item.priceVerifiedBy = 'listing-card-crosscheck-v1742';
    if (row.image) {
      if (!item.image || item.imageStatus === 'collision-removed') artworkRefilled++;
      item.image = row.image;
      item.imageStatus = 'listing-card-v1742';
    }
    if (row.platform?.length) item.platform = [...new Set([...(item.platform || []), ...row.platform])];
    if (row.ko) item.ko = true;
    repaired++;
    continue;
  }
  unmatched++;
  if (existingPriceIsValid(item)) {
    alreadyValid++;
    item.priceCrosscheckError = Number(priceError(item.currentPrice, item.originalPrice, item.discountPercent).toFixed(3));
    continue;
  }
  item.rejectedCurrentPrice = item.currentPrice;
  item.currentPrice = null;
  item.priceStatus = 'rejected-inconsistent';
  item.priceVerifiedBy = 'client-hide-until-refresh';
  rejected++;
}

payload.health = {
  ...(payload.health || {}),
  priceCrosscheckVersion: '17.4.2',
  priceCrosscheckPages: pagesScanned,
  priceCrosscheckRows: precise.size,
  priceCrosscheckRepaired: repaired,
  priceCrosscheckAlreadyValid: alreadyValid,
  priceCrosscheckRejected: rejected,
  priceCrosscheckUnmatched: unmatched,
  artworkRefilledV1742: artworkRefilled,
  priceTolerancePoints: DISCOUNT_TOLERANCE
};

await fs.writeFile(FILE, JSON.stringify(payload, null, 2) + '\n');
console.log('v17.4.2 crosscheck complete', payload.health);
