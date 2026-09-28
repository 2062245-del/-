import fs from 'node:fs';

const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const js=read('ps-radar/product-v178.js');
const css=read('ps-radar/product-v178.css');
const own=read('ps-radar/ownership-v178.js');
const ownCss=read('ps-radar/ownership-v178.css');
const personal=read('ps-radar/personal-v178.js');
const value=read('ps-radar/value-v178.js');
const html=read('ps-radar/index.html');
const baseStage=Number(js.match(/const STAGE\s*=\s*(\d+)/)?.[1]||0);
const stage=value?5:personal?4:own?3:baseStage;
const need=(cond,msg)=>{if(!cond)throw new Error(msg)};
const has=(src,token,msg)=>need(src.includes(token),msg||`missing ${token}`);

has(html,'product-v178.css','v17.8 css not loaded');
has(html,'product-v178.js','v17.8 js not loaded');
need((html.match(/class="navbtn/g)||[]).length===5,'bottom navigation must have exactly 5 primary tabs');
has(js,'normalizeNav','stage 1 navigation guard missing');
has(js,'__PSRADAR_NAV_HEALTH__','stage 1 navigation health probe missing');
has(js,'v178-card-reason','stage 1 compact decision reason missing');
has(css,'.v178-compact-card','stage 1 compact card css missing');
console.log(`[v17.8 stage 1] PASS - home hierarchy, compact cards, navigation guard`);

if(stage>=2){
  for(const t of ['v178-price-panel','collectPriceHistory','decisionV2','v178-history-chart'])has(js,t,`stage 2 missing ${t}`);
  console.log('[v17.8 stage 2] PASS - price history and decision 2.0');
}
if(stage>=3){
  has(html,'ownership-v178.js','ownership module not loaded');
  has(html,'ownership-v178.css','ownership css not loaded');
  for(const t of ['editionFamily','v178-editions','plusPurchaseGuard','v178-owned-toggle'])has(own,t,`stage 3 missing ${t}`);
  has(ownCss,'.v178-plus-guard','stage 3 Plus guard style missing');
  console.log('[v17.8 stage 3] PASS - Plus guard, edition compare, ownership');
}
if(stage>=4){
  has(html,'personal-v178.js','personal module not loaded');
  for(const t of ['tasteProfile','v178-personal-panel','v178-alert-center'])has(personal,t,`stage 4 missing ${t}`);
  console.log('[v17.8 stage 4] PASS - taste recommendations and alert center');
}
if(stage>=5){
  has(html,'value-v178.js','value module not loaded');
  for(const t of ['valueScore','firstDiscount','v178-curation-panel','v178-value-badge'])has(value,t,`stage 5 missing ${t}`);
  console.log('[v17.8 stage 5] PASS - value and curated discovery');
}
console.log(`V178_STATIC_PASS stage=${stage}`);
