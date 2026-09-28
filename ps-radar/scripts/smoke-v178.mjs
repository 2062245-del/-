import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
await page.route('https://raw.githubusercontent.com/**',route=>route.abort());
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForFunction(()=>window.__PSRADAR_V178__?.STAGE>=1,{timeout:15000});
await page.waitForTimeout(1800);

const stage=await page.evaluate(()=>Math.max(window.__PSRADAR_V178__?.STAGE||0,window.__PSRADAR_V1783__?.STAGE||0,window.__PSRADAR_V1784__?.STAGE||0,window.__PSRADAR_V1785__?.STAGE||0));

async function go(target){
  await page.locator(`.bottomnav .navbtn[data-page="${target}"]`).click();
  await page.waitForFunction(p=>document.body.dataset.page===p,target,{timeout:5000});
  await page.waitForTimeout(120);
  const health=await page.evaluate(()=>window.__PSRADAR_NAV_HEALTH__?.());
  if(!health||health.activeTabs.length!==1||health.activeTabs[0]!==target)throw new Error(`nav health failed ${target}: ${JSON.stringify(health)}`);
}

async function closeDetail(){
  const modal=page.locator('#detailModal');
  if(await modal.getAttribute('aria-hidden')!=='true'){
    const close=page.locator('#closeDetail');if(await close.count())await close.click();
    await page.waitForTimeout(120);
  }
}

for(let round=0;round<3;round++){
  for(const target of ['upcoming','catalog','promo','wishlist','home']) await go(target);
}
await go('promo');
await page.waitForTimeout(700);
const cardCheck=await page.evaluate(()=>({
  cards:document.querySelectorAll('#grid .card[data-id]').length,
  reasons:document.querySelectorAll('#grid .card .v178-card-reason').length
}));
if(cardCheck.cards>0&&cardCheck.reasons===0)throw new Error(`compact decision reasons missing: ${JSON.stringify(cardCheck)}`);

if(stage>=2&&cardCheck.cards>0){
  await page.locator('#grid .card[data-id] .detailbtn').first().click();
  await page.waitForSelector('#detailContent .v178-price-panel',{timeout:5000});
  const pricePanel=await page.locator('#detailContent .v178-price-panel').count();
  if(pricePanel!==1)throw new Error('Decision 2.0 panel missing');
  await closeDetail();
}

if(stage>=3){
  await go('promo');
  const tools=await page.locator('#v178ListTools:not([hidden]) #v178HideOwned').count();
  if(tools!==1)throw new Error('owned-game filter tool missing');
  await go('catalog');await page.waitForTimeout(500);
  const catalogCards=await page.locator('#grid .card[data-id]').count();
  if(catalogCards>0){
    await page.locator('#grid .card[data-id] .detailbtn').first().click();
    await page.waitForSelector('#detailContent .v178-ownership',{timeout:5000});
    const guard=await page.locator('#detailContent .v178-plus-guard').count();
    if(guard!==1)throw new Error('PS Plus purchase guard missing on catalog item');
    const own=await page.locator('#detailContent .v178-owned-toggle').count();
    if(own!==1)throw new Error('owned toggle missing');
    await closeDetail();
  }
}

if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(' | ')}`);
console.log('V178_BROWSER_PASS',{...cardCheck,stage});
await browser.close();
