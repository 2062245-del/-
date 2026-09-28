import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__PSRADAR_V180_BRIEFING__?.STAGE===6&&window.__PSRADAR_V180_DATA__?.STAGE===1,{timeout:15000});
  await page.waitForTimeout(1800);
  const boot=await page.evaluate(()=>({url:location.href,page:document.body?.dataset?.page||null,nav:[...document.querySelectorAll('.navbtn[data-page]')].map(x=>({page:x.dataset.page,text:x.textContent.trim(),parent:x.parentElement?.className||''})),bottomnav:document.querySelectorAll('.bottomnav').length,bodyChildren:document.body?.children?.length||0}));
  console.log('V180_BOOT',boot);
  if(boot.nav.length!==5||boot.bottomnav!==1)throw new Error(`navigation DOM invalid at boot ${JSON.stringify(boot)}`);
  const meta=await page.evaluate(()=>window.__PSRADAR_V180_DATA__.coverage());
  if(!(meta.total>400&&meta.dated>0&&meta.identified>0))throw new Error(`metadata coverage invalid ${JSON.stringify(meta)}`);

  async function go(target){
    const selector=`.bottomnav .navbtn[data-page="${target}"]`;
    await page.waitForSelector(selector,{state:'attached',timeout:8000});
    const count=await page.locator(selector).count();if(count!==1)throw new Error(`nav selector count ${count} for ${target}`);
    try{await page.locator(selector).click({timeout:5000});}
    catch(err){
      const diag=await page.evaluate(t=>({target:t,page:document.body?.dataset?.page||null,active:[...document.querySelectorAll('.bottomnav .navbtn.active')].map(x=>x.dataset.page),drawer:document.getElementById('drawer')?.getAttribute('aria-hidden'),modal:document.getElementById('detailModal')?.getAttribute('aria-hidden')}),target);
      throw new Error(`nav click failed ${target}: ${err.message} / ${JSON.stringify(diag)}`);
    }
    await page.waitForFunction(p=>document.body.dataset.page===p,target,{timeout:5000});await page.waitForTimeout(180);
    const health=await page.evaluate(()=>window.__PSRADAR_NAV_HEALTH__?.());
    if(!health||health.activeTabs.length!==1||health.activeTabs[0]!==target)throw new Error(`nav health failed ${target}: ${JSON.stringify(health)}`);
  }
  for(let round=0;round<2;round++)for(const t of ['catalog','promo','wishlist','upcoming','home'])await go(t);

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
} finally {
  await browser.close();
}
