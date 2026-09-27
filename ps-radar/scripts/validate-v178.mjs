import fs from 'node:fs';

const js=fs.readFileSync('ps-radar/product-v178.js','utf8');
const css=fs.readFileSync('ps-radar/product-v178.css','utf8');
const html=fs.readFileSync('ps-radar/index.html','utf8');
const m=js.match(/const STAGE\s*=\s*(\d+)/);
if(!m) throw new Error('v17.8 STAGE marker missing');
const stage=Number(m[1]);
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
  for(const t of ['editionFamily','v178-editions','plusPurchaseGuard','v178-owned-toggle'])has(js,t,`stage 3 missing ${t}`);
  console.log('[v17.8 stage 3] PASS - Plus guard, edition compare, ownership');
}
if(stage>=4){
  for(const t of ['tasteProfile','v178-personal-panel','v178-alert-center'])has(js,t,`stage 4 missing ${t}`);
  console.log('[v17.8 stage 4] PASS - taste recommendations and alert center');
}
if(stage>=5){
  for(const t of ['valueScore','firstDiscount','v178-curation-panel','v178-value-badge'])has(js,t,`stage 5 missing ${t}`);
  console.log('[v17.8 stage 5] PASS - value and curated discovery');
}
console.log(`V178_STATIC_PASS stage=${stage}`);
