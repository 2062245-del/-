import fs from 'node:fs/promises';
import { chromium } from 'playwright';

// Triggered separately after the workflow file is present on the branch.
const targets = [
  {
    source: 'psprices',
    url: 'https://psprices.com/region-kr/game/4867346/geulan-tuliseumo-7-junggugeogancheja-hangugeo-taegugeo-yeongeo-junggugeobeoncheja'
  },
  {
    source: 'psdeals',
    url: 'https://psdeals.net/kr-store/game/2267934/%EA%B7%B8%EB%9E%80-%ED%88%AC%EB%A6%AC%EC%8A%A4%EB%AA%A8-7'
  }
];

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), targets: [] };

for (const target of targets) {
  const page = await browser.newPage({ locale: 'ko-KR' });
  const responses = [];
  page.on('response', r => {
    const u = r.url();
    if (/price|history|chart|graph|game|product|api/i.test(u)) {
      responses.push({ url: u, status: r.status(), contentType: r.headers()['content-type'] || '' });
    }
  });
  const row = { source: target.source, url: target.url, ok: false, responses: [], bodySnippets: [], scripts: [], resources: [] };
  try {
    const res = await page.goto(target.url, { waitUntil: 'networkidle', timeout: 90000 });
    row.httpStatus = res?.status() || null;
    row.title = await page.title();
    await page.waitForTimeout(1500);
    const body = (await page.locator('body').innerText()).replace(/\r/g, '');
    row.ok = true;
    row.bodySnippets = body.split('\n').filter(line => /price|가격|history|히스토리|최저|lowest|highest|원|₩/i.test(line)).slice(0, 160);
    row.resources = await page.evaluate(() => performance.getEntriesByType('resource').map(x => x.name).filter(x => /price|history|chart|graph|api|game|product/i.test(x)).slice(0, 250));
    row.scripts = await page.evaluate(() => Array.from(document.scripts).map((s, i) => ({i, src:s.src || '', text:(s.textContent || '').slice(0,150000)})).filter(x => /price|history|chart|graph|lowest|discount/i.test(x.src + ' ' + x.text)).map(x => ({i:x.i,src:x.src,text:x.text.slice(0,12000)})).slice(0,30));
    const html = await page.content();
    row.htmlMatches = [...html.matchAll(/.{0,120}(?:priceHistory|price_history|history|lowestPrice|lowest_price|chart|series).{0,220}/gi)].slice(0,60).map(m => m[0]);
  } catch (err) {
    row.error = String(err?.stack || err);
  }
  row.responses = responses.slice(0, 300);
  report.targets.push(row);
  await page.close();
}

await browser.close();
await fs.mkdir('ps-radar/data', { recursive: true });
await fs.writeFile('ps-radar/data/historical-source-probe.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.targets.map(x => ({source:x.source,ok:x.ok,status:x.httpStatus,responses:x.responses.length,scripts:x.scripts.length,matches:x.htmlMatches?.length||0,error:x.error||null})), null, 2));
