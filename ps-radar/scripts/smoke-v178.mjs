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

async function verifyReleaseSort(target){
  await go(target);
  await page.locator('#filterBtn').click();
  await page.locator('#sort').selectOption('release');
  await page.locator('#applyFilter').click();
  await page.waitForTimeout(250);
  const probe=await page.evaluate(()=>{
    const rows=typeof filteredGames==='function'?filteredGames():[];
    const dated=rows.map(x=>({title:x.title||'',releaseDate:x.releaseDate||null,time:x.releaseDate?new Date(x.releaseDate).getTime():null})).filter(x=>Number.isFinite(x.time));
    let sorted=true;
    for(let i=1;i<dated.length;i++) if(dated[i-1].time<dated[i].time) sorted=false;
    return {sort:state.sort,view:state.view,count:rows.length,dated:dated.length,sorted,sample:dated.slice(0,3)};
  });
  if(probe.sort!=='release')throw new Error(`release sort not selected in ${target}: ${JSON.stringify(probe)}`);
  if(!probe.sorted)throw new Error(`release sort order invalid in ${target}: ${JSON.stringify(probe)}`);
  return probe;
}

for(let round=0;round<3;round++){
  for(const target of ['upcoming','catalog','promo','wishlist','home']) await go(target);
}
await go('promo');
await page.waitForTimeout(700);
const cardCheck=await page.evaluate(()=>({cards:document.querySelectorAll('#grid .card[data-id]').length,reasons:document.querySelectorAll('#grid .card .v178-card-reason').length}));
if(cardCheck.cards>0&&cardCheck.reasons===0)throw new Error(`compact decision reasons missing: ${JSON.stringify(cardCheck)}`);

if(stage>=2&&cardCheck.cards>0){
  await page.locator('#grid .card[data-id] .detailbtn').first().click();
  await page.waitForSelector('#detailContent .v178-price-panel',{timeout:5000});
  if(await page.locator('#detailContent .v178-price-panel').count()!==1)throw new Error('Decision 2.0 panel missing');
  await closeDetail();
}

if(stage>=3){
  await go('promo');
  if(await page.locator('#v178ListTools:not([hidden]) #v178HideOwned').count()!==1)throw new Error('owned-game filter tool missing');
  await go('catalog');await page.waitForTimeout(500);
  const catalogCards=await page.locator('#grid .card[data-id]').count();
  if(catalogCards>0){
    await page.locator('#grid .card[data-id] .detailbtn').first().click();
    await page.waitForSelector('#detailContent .v178-ownership',{timeout:5000});
    if(await page.locator('#detailContent .v178-plus-guard').count()!==1)throw new Error('PS Plus purchase guard missing on catalog item');
    if(await page.locator('#detailContent .v178-owned-toggle').count()!==1)throw new Error('owned toggle missing');
    await closeDetail();
  }
}

if(stage>=4){
  await go('home');await page.waitForTimeout(350);
  if(await page.locator('#v178PersonalPanel.v178-personal-panel').count()!==1)throw new Error('personal taste radar panel missing');
  const profile=await page.evaluate(()=>window.__PSRADAR_V1784__?.tasteProfile?.());
  if(!profile||typeof profile.interactions!=='number')throw new Error(`taste profile invalid: ${JSON.stringify(profile)}`);
  await go('wishlist');await page.waitForTimeout(250);
  if(await page.locator('#v178AlertCenter:not([hidden]).v178-alert-center').count()!==1)throw new Error('unified alert center missing');
  if(await page.locator('#v178AlertCenter .v178-alert-grid>div').count()!==3)throw new Error('alert center metrics incomplete');
}

if(stage>=5){
  await go('home');await page.waitForTimeout(350);
  if(await page.locator('#v178CurationPanel.v178-curation-panel').count()!==1)throw new Error('value curation panel missing');
  const option=await page.locator('#sort option[value="release"]').count();
  if(option!==1)throw new Error('latest release sort option missing');
  const synthetic=await page.evaluate(()=>window.__PSRADAR_V1785__?.latestReleaseSort?.([
    {title:'A',releaseDate:'2025-01-01'},{title:'B',releaseDate:'2026-01-01'},{title:'C'}
  ]).map(x=>x.title));
  if(JSON.stringify(synthetic)!==JSON.stringify(['B','A','C']))throw new Error(`latestReleaseSort helper failed: ${JSON.stringify(synthetic)}`);
  const plusSort=await verifyReleaseSort('catalog');
  const dealSort=await verifyReleaseSort('promo');
  console.log('RELEASE_SORT_PASS',{plusSort,dealSort});
}

if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(' | ')}`);
console.log('V178_BROWSER_PASS',{...cardCheck,stage});
await browser.close();
