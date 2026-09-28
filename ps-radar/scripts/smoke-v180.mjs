import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForFunction(()=>window.__PSRADAR_V180_BRIEFING__?.STAGE===6&&window.__PSRADAR_V180_DATA__?.STAGE===1,{timeout:15000});
await page.waitForTimeout(1800);
const meta=await page.evaluate(()=>window.__PSRADAR_V180_DATA__.coverage());
if(!(meta.total>400&&meta.dated>0&&meta.identified>0))throw new Error(`metadata coverage invalid ${JSON.stringify(meta)}`);

async function go(target){await page.locator(`.bottomnav .navbtn[data-page="${target}"]`).click();await page.waitForFunction(p=>document.body.dataset.page===p,target,{timeout:5000});await page.waitForTimeout(180);const active=await page.locator('.bottomnav .navbtn.active').count();if(active!==1)throw new Error(`active tabs ${active} on ${target}`);}
for(const t of ['catalog','promo','wishlist','upcoming','home'])await go(t);

await go('promo');await page.waitForTimeout(600);
const cards=page.locator('#grid .card[data-id]');if(await cards.count()===0)throw new Error('no promo cards');
if(await page.locator('#grid .v180-score').count()===0)throw new Error('PS Radar score badge missing');
await cards.first().locator('.detailbtn').click();
await page.waitForSelector('.v180-detail-shell',{timeout:5000});
for(const tab of ['summary','price','plus','edition']){await page.locator(`[data-v180-detail-tab="${tab}"]`).click();await page.waitForTimeout(100);if(await page.locator(`[data-v180-detail-tab="${tab}"].active`).count()!==1)throw new Error(`detail tab failed ${tab}`);}
await page.locator('[data-v180-detail-tab="summary"]').click();
await page.waitForSelector('[data-v180-set-backlog="planned"]');
await page.locator('[data-v180-set-backlog="planned"]').click();
const backlog=await page.evaluate(()=>JSON.parse(localStorage.getItem('psradar-backlog-v180')||'{}'));
if(!Object.values(backlog).includes('planned'))throw new Error('backlog save failed');
await page.locator('#closeDetail').click();

await page.locator('#filterBtn').click();await page.waitForSelector('#v180SaveFilter');
await page.selectOption('#platform','PS5');await page.selectOption('#sort','release');
await page.locator('#applyFilter').click();await page.waitForTimeout(100);
await page.locator('#filterBtn').click();await page.locator('#v180SaveFilter').click();
const presets=await page.evaluate(()=>window.__PSRADAR_V180_FILTERS__.presets());
if(!presets.length||presets[0].filter.sort!=='release'||presets[0].filter.platform!=='PS5')throw new Error(`saved filter failed ${JSON.stringify(presets)}`);
await page.locator('#closeDrawer').click();

await go('wishlist');await page.waitForTimeout(200);
if(await page.locator('#v180LibraryTools:not([hidden])').count()!==1)throw new Error('library tools missing');
await go('home');await page.waitForTimeout(400);
for(const sel of ['#v180Briefing','#v180Curation','#v178PersonalPanel'])if(await page.locator(sel).count()!==1)throw new Error(`home module missing ${sel}`);
const score=await page.evaluate(()=>{const g=state.games.map(x=>typeof mergeGame==='function'?mergeGame(x):x).find(x=>x.currentPrice||x.plusIncluded);return g?window.__PSRADAR_V180_SCORE__.psRadarScore(g):null;});
if(!score||!Number.isFinite(score.total)||score.total<0||score.total>100||!score.dims)throw new Error(`score invalid ${JSON.stringify(score)}`);
if(errors.length)throw new Error(`page errors: ${errors.join(' | ')}`);
console.log('V180_BROWSER_PASS',{meta,score:score.total,presets:presets.length});
await browser.close();
