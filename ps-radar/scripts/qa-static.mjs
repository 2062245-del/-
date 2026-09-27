import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('ps-radar');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const assert=(cond,msg)=>{if(!cond)throw new Error(msg);};

for(const file of ['index.html','app.js','ui-v13.js','catalog-v14.js','stability-v15.js','sw.js','manifest.json','data/catalog-auto.json','data/store-auto.json','data/upcoming.json']){
  assert(fs.existsSync(path.join(root,file))&&fs.statSync(path.join(root,file)).size>0,`missing ${file}`);
}

const html=read('index.html');
const nav=(html.match(/<nav class="bottomnav"[\s\S]*?<\/nav>/)||[''])[0];
const pages=[...nav.matchAll(/data-page="([^"]+)"/g)].map(m=>m[1]);
const expected=['home','catalog','monthly','promo','upcoming','wishlist'];
assert(JSON.stringify(pages)===JSON.stringify(expected),`menu mismatch: ${pages.join(',')}`);
assert(html.includes('./stability-v15.js'),'stability layer not loaded');

const catalog=json('data/catalog-auto.json');
const store=json('data/store-auto.json');
const upcoming=json('data/upcoming.json');
assert(catalog.health?.safeToMerge,'catalog unsafe');
assert(store.health?.safeToMerge,'store unsafe');
assert(catalog.health?.itemCount===catalog.items?.length,'catalog item count mismatch');
assert(store.health?.itemCount===store.items?.length,'store item count mismatch');
assert(catalog.items.length>=400,`catalog too small: ${catalog.items.length}`);
assert(store.items.length>=400,`store too small: ${store.items.length}`);
assert((store.health?.falseZeroPrices||0)===0,'false zero price detected');
assert((store.health?.failedNow||0)<=20,`too many store failures: ${store.health.failedNow}`);

const dup=(items,keyFn)=>{
  const seen=new Map(),out=[];
  for(const x of items){const k=keyFn(x);if(!k)continue;seen.set(k,(seen.get(k)||0)+1);}
  for(const [k,n] of seen)if(n>1)out.push([k,n]);
  return out;
};
const dupCatalogIds=dup(catalog.items,x=>x.id);
const dupConcepts=dup(catalog.items,x=>String(x.conceptId||''));
const dupStoreIds=dup(store.items,x=>x.id);
assert(dupCatalogIds.length===0,`duplicate catalog ids: ${dupCatalogIds.slice(0,3).map(x=>x[0]).join(',')}`);
assert(dupConcepts.length===0,`duplicate catalog concept ids: ${dupConcepts.slice(0,3).map(x=>x[0]).join(',')}`);
assert(dupStoreIds.length===0,`duplicate store ids: ${dupStoreIds.slice(0,3).map(x=>x[0]).join(',')}`);

const conceptCatalog=new Set(catalog.items.map(x=>String(x.conceptId||'')).filter(Boolean));
const conceptStore=new Set(store.items.map(x=>String(x.conceptId||'')).filter(Boolean));
const matched=[...conceptCatalog].filter(x=>conceptStore.has(x)).length;
assert(matched>=Math.min(450,conceptCatalog.size),`store/catalog concept coverage too low: ${matched}/${conceptCatalog.size}`);

const images=catalog.items.filter(x=>x.image).length;
const storeLinks=store.items.filter(x=>/^https:\/\/store\.playstation\.com\/ko-kr\//.test(x.store||'')).length;
const currentSales=store.items.filter(x=>x.priceStatus==='verified'&&Number(x.originalPrice)>Number(x.currentPrice)&&Number(x.discountPercent)>0&&(!x.saleEndsAt||new Date(x.saleEndsAt).getTime()>Date.now())).length;
const korean=store.items.filter(x=>x.ko===true&&x.languageStatus==='verified-store-positive').length;
const upcomingDup=dup(upcoming.items||[],x=>String(x.title||'').toLowerCase().replace(/[^a-z0-9가-힣]+/g,''));
assert(upcomingDup.length===0,`duplicate upcoming titles: ${upcomingDup.slice(0,3).map(x=>x[0]).join(',')}`);
assert((upcoming.items||[]).length>0,'upcoming list empty');

const manifest=json('manifest.json');
assert(manifest.name==='PS Radar','manifest name stale');
assert(manifest.scope==='./','manifest scope invalid');
const sw=read('sw.js');
assert(sw.includes('stability-v15.js'),'service worker does not cache stability layer');
assert(sw.includes('store-auto.json'),'service worker does not cache store enrichment');
assert(sw.includes('ignoreSearch:true'),'service worker cache-busting fallback missing');

console.log('PS Radar QA static PASS',JSON.stringify({
  menus:pages.length,
  catalog:catalog.items.length,
  store:store.items.length,
  conceptCoverage:`${matched}/${conceptCatalog.size}`,
  images,
  storeLinks,
  prices:store.health?.price||0,
  ratings:store.health?.rating||0,
  korean,
  currentSales,
  upcoming:(upcoming.items||[]).length
}));
