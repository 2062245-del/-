import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
await page.route('https://raw.githubusercontent.com/**',route=>route.abort());
await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForFunction(()=>window.__PSRADAR_V178__?.STAGE>=1,{timeout:15000});
await page.waitForTimeout(1800);

async function go(target){
  await page.locator(`.bottomnav .navbtn[data-page="${target}"]`).click();
  await page.waitForFunction(p=>document.body.dataset.page===p,target,{timeout:5000});
  await page.waitForTimeout(120);
  const health=await page.evaluate(()=>window.__PSRADAR_NAV_HEALTH__?.());
  if(!health||health.activeTabs.length!==1||health.activeTabs[0]!==target)throw new Error(`nav health failed ${target}: ${JSON.stringify(health)}`);
}

for(let round=0;round<3;round++){
  for(const target of ['upcoming','catalog','promo','wishlist','home']) await go(target);
}
await go('promo');
await page.waitForTimeout(700);
const cardCheck=await page.evaluate(()=>({
  cards:document.querySelectorAll('#grid .card[data-id]').length,
  reasons:document.querySelectorAll('#grid .card .v178-card-reason').length,
  stage:window.__PSRADAR_V178__?.STAGE
}));
if(cardCheck.cards>0&&cardCheck.reasons===0)throw new Error(`compact decision reasons missing: ${JSON.stringify(cardCheck)}`);
if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(' | ')}`);
console.log('V178_BROWSER_PASS',cardCheck);
await browser.close();
