import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const ROOT='ps-radar/data';
const read=async(name,fallback={})=>{try{return JSON.parse(await fs.readFile(`${ROOT}/${name}`,'utf8'));}catch{return fallback;}};
const norm=v=>String(v||'').toLowerCase()
  .replace(/\([^)]*(?:한국어|영어|일본어|중국어|ps4|ps5)[^)]*\)/gi,' ')
  .replace(/[™®]/g,' ')
  .replace(/\b(?:ps4|ps5|digital\s+deluxe|deluxe|ultimate|gold|complete|premium|standard|collector'?s?|special|anniversary|game\s+of\s+the\s+year|goty)\s*(?:edition)?\b/gi,' ')
  .replace(/(?:디지털\s*)?(?:디럭스|얼티밋|골드|컴플리트|프리미엄|스탠다드|컬렉터즈?|스페셜|애니버서리)\s*(?:에디션)?/gi,' ')
  .replace(/\b(?:edition|bundle|pack)\b/gi,' ')
  .replace(/에디션|번들|패키지|제품판/gi,' ')
  .replace(/[^a-z0-9가-힣]+/g,'').trim();
const productFromStore=url=>String(url||'').match(/\/product\/([^/?#]+)/i)?.[1]||null;
const conceptFromStore=url=>String(url||'').match(/\/concept\/(\d+)/i)?.[1]||null;
const hash=v=>crypto.createHash('sha1').update(String(v)).digest('hex').slice(0,16);

const [catalog,store,upcoming,deals,dealRelease]=await Promise.all([
  read('catalog-auto.json',{items:[]}),read('store-auto.json',{items:[]}),read('upcoming.json',{items:[]}),read('deals-auto.json',{items:[]}),read('deal-release-v180.json',{items:[],health:null})
]);
const releaseById=new Map((dealRelease.items||[]).filter(x=>x?.id&&x?.releaseDate).map(x=>[String(x.id),x]));
const releaseByProduct=new Map((dealRelease.items||[]).filter(x=>x?.productId&&x?.releaseDate).map(x=>[String(x.productId),x]));
const authoritative=[...(catalog.items||[]),...(store.items||[]),...(upcoming.items||[])];
const byProduct=new Map(),byConcept=new Map(),byFamily=new Map();
for(const x of authoritative){
  const product=String(x.productId||productFromStore(x.store)||'');
  const concept=String(x.conceptId||conceptFromStore(x.store)||'');
  const family=norm(x.title||x.storeProductName);
  if(product)byProduct.set(product,x);
  if(concept)byConcept.set(concept,x);
  if(family){if(!byFamily.has(family))byFamily.set(family,[]);byFamily.get(family).push(x);}
}
function resolve(raw){
  const product=String(raw.productId||productFromStore(raw.store)||'');
  const concept=String(raw.conceptId||conceptFromStore(raw.store)||'');
  const family=norm(raw.title);
  let match=null,method='none',confidence=0;
  if(product&&byProduct.has(product)){match=byProduct.get(product);method='product-id';confidence=100;}
  else if(concept&&byConcept.has(concept)){match=byConcept.get(concept);method='concept-id';confidence=98;}
  else if(family&&byFamily.get(family)?.length===1){match=byFamily.get(family)[0];method='title-family';confidence=88;}
  const officialRelease=releaseById.get(String(raw.id||''))||releaseByProduct.get(product)||null;
  const releaseDate=raw.releaseDate||officialRelease?.releaseDate||match?.releaseDate||null;
  const releaseDateSource=raw.releaseDate?'source-item':officialRelease?.releaseDate?'playstation-store-product-html':match?.releaseDate?method:null;
  const canonicalProduct=product||match?.productId||productFromStore(match?.store)||null;
  const canonicalConcept=concept||match?.conceptId||conceptFromStore(match?.store)||null;
  const canonicalSeed=canonicalConcept?`concept:${canonicalConcept}`:canonicalProduct?`product:${canonicalProduct}`:`title:${family}`;
  return {
    id:String(raw.id||''),title:raw.title||match?.title||'',canonicalGameId:`game-${hash(canonicalSeed)}`,
    editionFamily:family,productId:canonicalProduct,conceptId:canonicalConcept,
    releaseDate,releaseDateSource,
    identityMethod:method,identityConfidence:confidence
  };
}
const sources=[...(catalog.items||[]),...(store.items||[]),...(deals.items||[])];
const seen=new Map();
for(const raw of sources){
  const meta=resolve(raw);if(!meta.id)continue;
  const prev=seen.get(meta.id);
  if(!prev||meta.identityConfidence>prev.identityConfidence||(!prev.releaseDate&&meta.releaseDate))seen.set(meta.id,meta);
}
const items=[...seen.values()];
const dealIds=new Set((deals.items||[]).map(x=>String(x.id)));
const dealMeta=items.filter(x=>dealIds.has(x.id));
const officialHtmlDates=items.filter(x=>x.releaseDateSource==='playstation-store-product-html').length;
const health={
  safeToMerge:items.length>400,itemCount:items.length,
  releaseDateCount:items.filter(x=>x.releaseDate).length,
  identifiedCount:items.filter(x=>x.identityMethod!=='none'||x.productId||x.conceptId).length,
  dealCount:dealMeta.length,dealReleaseDateCount:dealMeta.filter(x=>x.releaseDate).length,
  officialHtmlDates,
  dealReleaseCacheSafe:dealRelease.health?.safeToMerge===true,
  dealReleaseCoveragePercent:Number(dealRelease.health?.coveragePercent)||0,
  productMatches:items.filter(x=>x.identityMethod==='product-id').length,
  conceptMatches:items.filter(x=>x.identityMethod==='concept-id').length,
  titleMatches:items.filter(x=>x.identityMethod==='title-family').length
};
const payload={generatedAt:new Date().toISOString(),source:'ps-radar-authoritative-crosswalk',health,items};
await fs.writeFile(`${ROOT}/game-meta-v180.json`,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('V180_GAME_META',health);
if(!health.safeToMerge)process.exitCode=2;
