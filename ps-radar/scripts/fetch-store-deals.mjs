import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const HUB = 'https://store.playstation.com/ko-kr/pages/deals/';
const OUT = 'ps-radar/data/deals-auto.json';
const FALLBACK_CAMPAIGNS = [
  'https://store.playstation.com/ko-kr/view/7bbceafe-bfa8-11ee-b375-5e45f4e139ac/5d1effb5-8dad-11ef-b578-8ab865f605f2',
  'https://store.playstation.com/ko-kr/category/05f796ea-3420-4946-9d14-b931c8a8f41b/1',
  'https://store.playstation.com/ko-kr/category/eaa6b38b-6a1b-4f27-8440-be113715dddb/1'
];
const MAX_CAMPAIGNS = Number(process.env.PSRADAR_MAX_CAMPAIGNS || 8);
const MAX_PAGES_PER_CAMPAIGN = Number(process.env.PSRADAR_MAX_PAGES_PER_CAMPAIGN || 60);
const MAX_TOTAL_PAGES = Number(process.env.PSRADAR_MAX_TOTAL_PAGES || 160);
const MIN_SAFE_ITEMS = Number(process.env.PSRADAR_MIN_SAFE_ITEMS || 20);
const MAX_EMPTY_STREAK = Number(process.env.PSRADAR_MAX_EMPTY_STREAK || 5);
const MIN_PREVIOUS_RATIO = Number(process.env.PSRADAR_MIN_PREVIOUS_RATIO || 0.25);

const cleanUrl = value => {
  try {
    const u = new URL(value);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return String(value || '').split('?')[0].replace(/\/$/, ''); }
};
const idFor = value => `deal-auto-${crypto.createHash('sha1').update(value).digest('hex').slice(0,16)}`;
const uniq = values => [...new Set(values.filter(Boolean))];
const campaignPrefix = url => {
  const u = new URL(url);
  const cat = u.pathname.match(/^(\/ko-kr\/category\/[0-9a-f-]+)/i);
  if (cat) return `${u.origin}${cat[1]}`;
  const view = u.pathname.match(/^(\/ko-kr\/view\/[0-9a-f-]+\/[0-9a-f-]+)/i);
  if (view) return `${u.origin}${view[1]}`;
  return cleanUrl(url);
};
const normalizeCampaign = href => {
  try {
    const u = new URL(href, HUB);
    if (u.hostname !== 'store.playstation.com') return null;
    if (!/^\/ko-kr\/(category|view)\//i.test(u.pathname)) return null;
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return null; }
};
const nonGameCampaign = title => /(?:게임별\s*추가\s*콘텐츠|추가\s*콘텐츠|add[- ]?on|dlc|아바타|캐릭터|게임\s*통화)/i.test(String(title || ''));
const campaignScore = campaign => {
  const text = `${campaign.title || ''} ${campaign.url || ''}`;
  let score = 0;
  if (/(?:세일|할인|프로모션|deal|sale|특가|혜택)/i.test(text)) score += 8;
  if (/\bPS5\b/i.test(text)) score += 4;
  if (/\bPS4\b/i.test(text)) score += 4;
  if (/모든\s*PS[45]\s*게임/i.test(text)) score += 2;
  if (nonGameCampaign(text)) score -= 50;
  return score;
};

async function waitSettled(page, ms = 900) {
  await page.waitForTimeout(ms);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(450);
  }
}

async function discoverCampaigns(page) {
  const found = [];
  try {
    await page.goto(HUB, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitSettled(page, 1800);
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => ({
      href: a.href,
      text: `${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`.trim()
    })));
    for (const x of links) {
      const url = normalizeCampaign(x.href);
      if (!url) continue;
      const text = x.text.toLowerCase();
      const likely = /세일|할인|프로모션|deal|sale|특가|혜택/.test(text);
      found.push({ url, likely });
    }
  } catch (err) {
    console.warn('Deals hub discovery failed:', err.message);
  }
  const likely = uniq(found.filter(x => x.likely).map(x => x.url));
  const all = uniq(found.map(x => x.url));
  return uniq([...likely, ...all, ...FALLBACK_CAMPAIGNS]).slice(0, MAX_CAMPAIGNS);
}

async function inspectCampaign(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (response && response.status() >= 400) return null;
    await waitSettled(page, 900);
    return await page.evaluate(() => {
      const body = document.body?.innerText || '';
      const totalMatch = body.match(/(?:\d[\d,]*\s*\/\s*)?(\d[\d,]*)개의\s*결과/) || body.match(/(\d[\d,]*)개의\s*결과/);
      const total = totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : null;
      const title = document.querySelector('h1,h2')?.textContent?.trim() || document.title;
      return { total, title };
    });
  } catch (err) {
    console.warn('Campaign inspect failed:', url, err.message);
    return null;
  }
}

async function scrapePage(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (response && response.status() >= 400) return { items: [], pageLinks: [], total: null };
  await waitSettled(page, 650);
  return page.evaluate(() => {
    const wonValues = text => [...text.matchAll(/\d{1,3}(?:,\d{3})*원/g)].map(m => Number(m[0].replace(/[^0-9]/g,''))).filter(Number.isFinite);
    const discountValue = text => {
      const m = text.match(/(?:-|\b)(\d{1,2})\s*%/) || text.match(/(\d{1,2})\s*%\s*할인/);
      const n = m ? Number(m[1]) : 0;
      return n > 0 && n < 100 ? n : 0;
    };
    const firstUsefulLine = text => (text || '').split('\n').map(x => x.trim()).find(x => x && !/^(PS[45]|게임 번들|제품판|프리미엄 에디션|추가 콘텐츠|추가 콘텐츠 팩|캐릭터|의상|레벨|시즌 패스|\d{1,3}% 할인|[-]?\d{1,3}%|[\d,]+원)$/.test(x)) || '';
    const nonGame = /(?:추가 콘텐츠|추가 콘텐츠 팩|캐릭터|의상|레벨|시즌 패스|맵 팩|화폐|아바타)/;
    const links = [...document.querySelectorAll('a[href*="/product/"],a[href*="/concept/"]')];
    const out = [];
    for (const a of links) {
      const href = (a.href || '').split('?')[0].replace(/\/$/, '');
      if (!href) continue;
      let node = a;
      let container = a;
      for (let i = 0; i < 7 && node?.parentElement; i++) {
        node = node.parentElement;
        const text = (node.innerText || '').trim();
        if (text.includes('원') && /%/.test(text)) container = node;
      }
      const text = (container.innerText || a.innerText || '').trim();
      const discountPercent = discountValue(text);
      if (!discountPercent) continue;
      if (nonGame.test(text) && !/(제품판|게임 번들|프리미엄 에디션)/.test(text)) continue;
      const prices = [...new Set(wonValues(text))];
      if (prices.length < 2) continue;
      const currentPrice = Math.min(...prices);
      const originalPrice = Math.max(...prices);
      if (!(originalPrice > currentPrice)) continue;
      const img = container.querySelector('img') || a.querySelector('img');
      const labelled = (a.getAttribute('aria-label') || '').trim();
      const imageAlt = (img?.getAttribute('alt') || '').replace(/^Image:\s*/i,'').trim();
      const linkText = (a.textContent || '').trim();
      const title = [labelled, linkText, imageAlt, firstUsefulLine(text)].find(x => x && x.length > 1 && !/^image$/i.test(x)) || '';
      if (!title || /^[\d,]+원$/.test(title)) continue;
      const platform = [];
      if (/\bPS5\b/.test(text)) platform.push('PS5');
      if (/\bPS4\b/.test(text)) platform.push('PS4');
      out.push({
        title,
        store: href,
        image: img?.currentSrc || img?.src || null,
        currentPrice,
        originalPrice,
        discountPercent,
        platform,
        ko: /한국어/.test(text)
      });
    }
    const body = document.body?.innerText || '';
    const totalMatch = body.match(/(?:\d[\d,]*\s*\/\s*)?(\d[\d,]*)개의\s*결과/) || body.match(/(\d[\d,]*)개의\s*결과/);
    const total = totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : null;
    const pageLinks = [...document.querySelectorAll('a[href]')].filter(a => /^\d+$/.test((a.textContent || '').trim())).map(a => a.href);
    return { items: out, pageLinks, total };
  });
}

function buildPageUrls(campaign, total) {
  const u = new URL(campaign);
  const cat = u.pathname.match(/^(\/ko-kr\/category\/[0-9a-f-]+)(?:\/(\d+))?\/?$/i);
  if (!cat || !Number.isFinite(total) || total <= 24) return [cleanUrl(campaign)];
  const pages = Math.min(MAX_PAGES_PER_CAMPAIGN, Math.ceil(total / 24));
  return Array.from({ length: pages }, (_, i) => `${u.origin}${cat[1]}/${i + 1}`);
}

let previousItemCount = 0;
try {
  const previous = JSON.parse(await fs.readFile(OUT, 'utf8'));
  previousItemCount = Array.isArray(previous?.items) ? previous.items.length : 0;
} catch {}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

const campaigns = await discoverCampaigns(page);
console.log('Campaign candidates:', campaigns.length, campaigns);
const allCampaignMeta = [];
for (const url of campaigns) {
  const info = await inspectCampaign(page, url);
  if (info) allCampaignMeta.push({ url, ...info });
}
allCampaignMeta.sort((a, b) => campaignScore(b) - campaignScore(a) || (Number(b.total) || 0) - (Number(a.total) || 0));
console.log('Campaign inspection:', allCampaignMeta.map(x => ({ title: x.title, total: x.total, score: campaignScore(x) })));

const skippedCampaigns = allCampaignMeta.filter(x => nonGameCampaign(x.title));
const campaignMeta = allCampaignMeta.filter(x => !nonGameCampaign(x.title));
console.log('Skipped non-game campaigns:', skippedCampaigns.map(x => x.title || x.url));
console.log('Eligible campaigns:', campaignMeta.map(x => x.title || x.url));

const collected = new Map();
let totalPages = 0;
const sourcePages = [];
const states = campaignMeta.map(campaign => ({
  campaign,
  prefix: campaignPrefix(campaign.url),
  queue: buildPageUrls(campaign.url, campaign.total),
  seen: new Set(),
  emptyStreak: 0,
  pagesScanned: 0,
  itemsSeen: 0,
  newUnique: 0,
  errors: 0,
  active: true,
  stoppedBy: null
}));

while (totalPages < MAX_TOTAL_PAGES && states.some(x => x.active)) {
  let progressed = false;
  for (const state of states) {
    if (totalPages >= MAX_TOTAL_PAGES) break;
    if (!state.active) continue;

    let next = null;
    while (state.queue.length && !next) {
      const candidate = cleanUrl(state.queue.shift());
      if (candidate && !state.seen.has(candidate)) next = candidate;
    }
    if (!next) {
      state.active = false;
      state.stoppedBy = state.stoppedBy || 'queue-empty';
      continue;
    }

    state.seen.add(next);
    state.pagesScanned++;
    totalPages++;
    progressed = true;

    try {
      const result = await scrapePage(page, next);
      sourcePages.push(next);
      const before = collected.size;
      for (const item of result.items) {
        const key = cleanUrl(item.store) || item.title.toLowerCase();
        const prev = collected.get(key);
        if (!prev || item.discountPercent > prev.discountPercent) collected.set(key, item);
      }
      const gained = collected.size - before;
      state.itemsSeen += result.items.length;
      state.newUnique += Math.max(0, gained);
      state.emptyStreak = result.items.length === 0 ? state.emptyStreak + 1 : 0;

      for (const href of result.pageLinks || []) {
        const clean = cleanUrl(href);
        if (clean.startsWith(state.prefix) && !state.seen.has(clean) && !state.queue.includes(clean)) state.queue.push(clean);
      }

      console.log(`[${totalPages}/${MAX_TOTAL_PAGES}]`, state.campaign.title || state.campaign.url, 'page items', result.items.length, 'gained', gained, 'unique', collected.size, 'empty streak', state.emptyStreak);

      if (state.emptyStreak >= MAX_EMPTY_STREAK) {
        state.active = false;
        state.stoppedBy = `empty-streak-${MAX_EMPTY_STREAK}`;
        console.log('Stopping low-yield campaign:', state.campaign.title || state.campaign.url, state.stoppedBy);
      } else if (state.pagesScanned >= MAX_PAGES_PER_CAMPAIGN) {
        state.active = false;
        state.stoppedBy = 'per-campaign-limit';
      } else if (buildPageUrls(state.campaign.url, state.campaign.total).length === 1 && (result.pageLinks || []).length === 0) {
        state.active = false;
        state.stoppedBy = 'single-page';
      } else if (state.queue.length === 0) {
        state.active = false;
        state.stoppedBy = 'queue-empty';
      }
    } catch (err) {
      state.errors++;
      console.warn('Page scrape failed:', next, err.message);
      if (state.errors >= 3) {
        state.active = false;
        state.stoppedBy = 'errors';
      }
    }
  }
  if (!progressed) break;
}

await browser.close();

const generatedAt = new Date().toISOString();
const items = [...collected.values()].map(raw => ({
  id: idFor(cleanUrl(raw.store) || raw.title),
  title: raw.title.replace(/\s+/g, ' ').trim(),
  type: 'regular',
  categories: ['promo'],
  platform: raw.platform,
  genre: [],
  ko: raw.ko,
  languageStatus: raw.ko ? 'verified-store-positive' : 'unknown',
  desc: 'PS Store 공식 프로모션에서 자동 확인한 할인 타이틀입니다.',
  image: raw.image,
  store: cleanUrl(raw.store),
  currentPrice: raw.currentPrice,
  originalPrice: raw.originalPrice,
  discountPercent: raw.discountPercent,
  saleEndsAt: null,
  priceStatus: 'verified',
  storeVerified: true,
  storeVerifiedAt: generatedAt,
  fetchedAt: generatedAt,
  dataQuality: 'verified'
})).filter(x => x.title && x.store && x.originalPrice > x.currentPrice && x.discountPercent > 0)
  .sort((a,b) => b.discountPercent - a.discountPercent || a.title.localeCompare(b.title, 'ko'));

const platformCounts = items.reduce((acc, item) => {
  if (!item.platform?.length) acc.unknown++;
  if (item.platform?.includes('PS5')) acc.PS5++;
  if (item.platform?.includes('PS4')) acc.PS4++;
  return acc;
}, { PS5: 0, PS4: 0, unknown: 0 });
const previousSafetyFloor = previousItemCount > 0 ? Math.floor(previousItemCount * MIN_PREVIOUS_RATIO) : 0;
const safetyFloor = Math.max(MIN_SAFE_ITEMS, previousSafetyFloor);
const campaignStats = states.map(state => ({
  url: state.campaign.url,
  title: state.campaign.title || null,
  total: state.campaign.total || null,
  pagesScanned: state.pagesScanned,
  itemsSeen: state.itemsSeen,
  newUnique: state.newUnique,
  stoppedBy: state.stoppedBy || (state.active ? 'global-limit' : null)
}));

const payload = {
  generatedAt,
  source: 'playstation-store-ko-deals-auto',
  sourceHub: HUB,
  campaigns: allCampaignMeta.map(x => ({ url: x.url, title: x.title || null, total: x.total || null, skippedAsNonGame: nonGameCampaign(x.title) })),
  campaignStats,
  health: {
    safeToMerge: items.length >= safetyFloor,
    itemCount: items.length,
    previousItemCount,
    safetyFloor,
    pagesScanned: totalPages,
    pageBudget: MAX_TOTAL_PAGES,
    campaignCount: campaignMeta.length,
    skippedCampaignCount: skippedCampaigns.length,
    maxEmptyStreak: MAX_EMPTY_STREAK,
    minSafeItems: MIN_SAFE_ITEMS,
    platformCounts
  },
  items
};

if (!payload.health.safeToMerge) {
  console.error(JSON.stringify(payload.health, null, 2));
  throw new Error(`Deal scrape safety check failed: ${items.length} items < safety floor ${safetyFloor}`);
}
await fs.mkdir('ps-radar/data', { recursive: true });
await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${OUT}: ${items.length} verified discounted items from ${totalPages} pages.`, platformCounts);
