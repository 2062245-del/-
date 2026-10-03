import fs from 'node:fs/promises';

const ROOT='ps-radar/data';
const read=async(name,fallback={})=>{try{return JSON.parse(await fs.readFile(`${ROOT}/${name}`,'utf8'));}catch{return fallback;}};
const productFromStore=u=>String(u||'').match(/\/product\/([^/?#]+)/i)?.[1]||null;
const cleanStore=u=>String(u||'').split('?')[0].replace(/\/$/,'');
const norm=v=>String(v||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[™®]/g,' ').replace(/[^a-z0-9가-힣]+/g,'').trim();
function editionFrom(...vals){
  const s=vals.filter(Boolean).join(' ');
  const rules=[
    [/디지털\s*디럭스|digital\s+deluxe/i,'디지털 디럭스'],[/디럭스|deluxe/i,'디럭스'],[/얼티밋|ultimate/i,'얼티밋'],[/골드|gold\s+edition/i,'골드'],[/프리미엄|premium/i,'프리미엄'],[/컴플리트|complete/i,'컴플리트'],[/스탠다드|standard/i,'스탠다드']
  ];
  for(const [re,label] of rules)if(re.test(s))return label;
  return null;
}
function productType(row){
  const s=`${row?.title||''} ${row?.storeProductName||''}`;
  if(/번들|bundle/i.test(s))return '게임 번들';
  if(/에디션|edition/i.test(s))return '게임 에디션';
  return '게임';
}

const [deals,releases,store]=await Promise.all([
  read('deals-auto.json',{items:[]}),read('deal-release-v180.json',{items:[]}),read('store-auto.json',{items:[]})
]);
if(!deals?.health?.safeToMerge||!Array.isArray(deals.items))throw new Error('deals-auto.json unsafe');
const releaseById=new Map(),releaseByProduct=new Map();
for(const x of releases.items||[]){if(x?.id)releaseById.set(String(x.id),x);if(x?.productId)releaseByProduct.set(String(x.productId),x);}
const storeByProduct=new Map(),storeByUrl=new Map(),storeByTitle=new Map();
for(const x of store.items||[]){
  const p=String(x.productId||productFromStore(x.store)||'');if(p)storeByProduct.set(p,x);
  if(x.store)storeByUrl.set(cleanStore(x.store),x);
  const n=norm(x.title||x.storeProductName);if(n&&!storeByTitle.has(n))storeByTitle.set(n,x);
}
let releaseCount=0,ratingCount=0,languageCount=0,genreCount=0,editionCount=0;
const items=(deals.items||[]).map(g=>{
  const productId=String(g.productId||productFromStore(g.store)||'')||null;
  const rel=releaseById.get(String(g.id))||(productId&&releaseByProduct.get(productId))||null;
  const st=(productId&&storeByProduct.get(productId))||storeByUrl.get(cleanStore(g.store))||storeByTitle.get(norm(g.title))||null;
  const releaseDate=g.releaseDate||rel?.releaseDate||st?.releaseDate||null;
  const genres=[...new Set([...(Array.isArray(g.genre)?g.genre:[]),...(Array.isArray(st?.genres)?st.genres:[]),...(Array.isArray(st?.localizedGenres)?st.localizedGenres.map(x=>typeof x==='string'?x:x?.value).filter(Boolean):[])])];
  const edition=st?.editionName||st?.edition?.name||editionFrom(st?.storeProductName,g.title)||null;
  if(releaseDate)releaseCount++;if(Number(st?.rating)>0)ratingCount++;if(st?.screenLanguages)languageCount++;if(genres.length)genreCount++;if(edition)editionCount++;
  return {
    id:String(g.id||''),title:g.title||'',productId,store:cleanStore(g.store),
    releaseDate,publisher:st?.publisher||null,genres,platforms:Array.isArray(g.platform)?g.platform:(Array.isArray(st?.platforms)?st.platforms:[]),
    edition,productType:st?.storeDisplayClassification||productType({...g,...st}),contentRating:st?.contentRating||null,
    ko:g.ko===true||st?.ko===true,languageStatus:g.languageStatus||st?.languageStatus||null,screenLanguages:st?.screenLanguages||null,voiceLanguages:st?.voiceLanguages||null,
    rating:Number(st?.rating)>0?Number(st.rating):null,ratingCount:Number(st?.ratingCount)>0?Number(st.ratingCount):null,
    plusIncluded:st?.plusIncluded===true,plusTier:st?.plusTier||null,
    description:st?.description||null,features:Array.isArray(st?.features)?st.features:[],onlinePlayers:st?.onlinePlayers??null,offlinePlayers:st?.offlinePlayers??null,
    psPlusOnlineRequired:st?.psPlusOnlineRequired??null,vr2:st?.vr2??null,dualSense:st?.dualSense??null,
    source:{release:rel?.source||null,store:st?.source||null},fetchedAt:st?.fetchedAt||rel?.fetchedAt||g.fetchedAt||null
  };
});
const health={safeToMerge:items.length>=2000,itemCount:items.length,releaseDateCount:releaseCount,ratingCount,languageCount,genreCount,editionCount,releaseCoveragePercent:items.length?Math.round(releaseCount/items.length*1000)/10:0};
const payload={generatedAt:new Date().toISOString(),source:'ps-radar-official-metadata-crosswalk-v228',health,items};
await fs.writeFile(`${ROOT}/deal-meta-v228.json`,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('V228_DEAL_META',health);
if(!health.safeToMerge)process.exitCode=2;
