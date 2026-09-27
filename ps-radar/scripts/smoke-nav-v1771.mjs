import { chromium } from 'playwright';

const base = process.env.PSRADAR_SMOKE_URL || 'http://127.0.0.1:8765/';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:412,height:915}});
page.setDefaultTimeout(8000);

await page.route('https://raw.githubusercontent.com/**', route => route.abort());
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',msg=>{ if(msg.type()==='error') errors.push(msg.text()); });

await page.goto(base,{waitUntil:'domcontentloaded'});
await page.waitForSelector('.bottomnav .navbtn[data-page="upcoming"]');
await page.waitForFunction(()=>window.__PSRADAR_V1771__?.VERSION==='17.7.1');

const sequence=['upcoming','catalog','promo','wishlist','upcoming'];
for(let round=0;round<4;round++){
  for(const target of sequence){
    await page.locator(`.bottomnav .navbtn[data-page="${target}"]`).click();
    await page.waitForFunction(p=>document.body.dataset.page===p,target,{timeout:3000});
    const state=await page.evaluate(()=>({
      page:document.body.dataset.page,
      active:[...document.querySelectorAll('.bottomnav .navbtn.active')].map(x=>x.dataset.page),
      heartbeat:performance.now(),
      coverage:document.querySelector('#pageCoverage')?.textContent||''
    }));
    if(state.active.length!==1||state.active[0]!==target) throw new Error(`nav active mismatch at ${target}: ${JSON.stringify(state.active)}`);
    await page.waitForTimeout(80);
    const heartbeat2=await page.evaluate(()=>performance.now());
    if(!(heartbeat2>state.heartbeat)) throw new Error(`event loop stalled at ${target}`);
  }
}

await page.locator('.bottomnav .navbtn[data-page="catalog"]').click();
await page.waitForFunction(()=>document.body.dataset.page==='catalog');
const monthCheck=await page.evaluate(()=>({
  text:document.querySelector('#pageCoverage')?.textContent||'',
  active:document.querySelectorAll('.bottomnav .navbtn.active').length
}));
if(monthCheck.active!==1) throw new Error(`catalog active tab count=${monthCheck.active}`);
if(errors.length) throw new Error(`browser errors: ${errors.slice(0,5).join(' | ')}`);

console.log('NAV_FREEZE_REGRESSION_PASS', {rounds:4, transitions:sequence.length*4+1, monthCoverage:monthCheck.text.slice(0,120)});
await browser.close();
