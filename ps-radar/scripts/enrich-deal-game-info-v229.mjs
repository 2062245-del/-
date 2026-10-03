import fs from 'node:fs/promises';
import path from 'node:path';

const DEALS='ps-radar/data/deals-auto.json';
const OUT=process.env.GAME_INFO_OUT||'ps-radar/data/game-info-v229.json';
const LIMIT=Math.max(1,Number(process.env.GAME_INFO_LIMIT||2520));
const MATCH=String(process.env.GAME_INFO_MATCH||'').trim().toLowerCase();
const CONCURRENCY=Math.max(1,Math.min(10,Number(process.env.GAME_INFO_CONCURRENCY||5)));
const SHARD_COUNT=Math.max(1,Number(process.env.GAME_INFO_SHARD_COUNT||1));
const SHARD_INDEX=Math.max(0,Number(process.env.GAME_INFO_SHARD_INDEX||0));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cleanUrl=v=>String(v||'').split('?')[0].replace(/\/$/,'');
const productIdFromUrl=u=>cleanUrl(u).match(/\/product\/([^/?#]+)/i)?.[1]||null;
const stripTags=s=>String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
function unescapeHtmlJson(s){return String(s||'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function findNextData(html){
  const m=String(html||'').match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!m)return null;
  try{return JSON.parse(m[1]);}catch{return null;}
}
function extractJsonScripts(text){
  const out=[];const re=/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;
  while((m=re.exec(String(text||'')))){try{out.push(JSON.parse(unescapeHtmlJson(m[1])));}catch{}}
  return out;
}
function mergeProductCaches(next,productId){
  const merged={};const sources=[];
  const b=next?.props?.pageProps?.batarangs||{};
  for(const [name,value] of Object.entries(b)){
    const text=value?.text;if(!text)continue;
    for(const j of extractJsonScripts(text)){
      const cache=j?.cache||{};const p=cache[`Product:${productId}`];
      if(p&&typeof p==='object'){
        Object.assign(merged,p);sources.push(name);
      }
    }
  }
  return {product:merged,sources:[...new Set(sources)]};
}
function parseLd(html){
  const re=/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m;
  while((m=re.exec(String(html||'')))){try{const j=JSON.parse(m[1]);if(j?.['@type']==='Product')return j;}catch{}}
  return null;
}
function captureQa(html,key){
  const re=new RegExp(`data-qa=["'][^"']*${key}[^"']*["'][^>]*>([\\s\\S]{0,700}?)<\\/[^>]+>`,'i');
  const m=String(html||'').match(re);return m?stripTags(m[1]):null;
}
function parseRelease(html,product){
  const direct=product?.releaseDate||product?.releaseDateTime||null;
  if(direct){const d=new Date(direct);if(Number.isFinite(d.getTime()))return d.toISOString();}
  const iso=String(html||'').match(/"releaseDate"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[^"]+)"/i)?.[1];
  if(iso){const d=new Date(iso);if(Number.isFinite(d.getTime()))return d.toISOString();}
  const m=String(html||'').match(/data-qa=["']gameInfo#releaseInformation#releaseDate-value["'][^>]*>\s*([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})\s*</i);
  if(m)return new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))).toISOString();
  return null;
}
function platformArray(p,fallback=[]){const a=Array.isArray(p?.platforms)?p.platforms:[];return [...new Set([...a,...fallback].filter(Boolean))];}
function descriptions(p,ld){
  const arr=Array.isArray(p?.descriptions)?p.descriptions:[];
  const short=arr.find(x=>x?.type==='SHORT')?.value||ld?.description||null;
  const long=arr.find(x=>x?.type==='LONG')?.value||null;
  return {shortDescription:short?stripTags(short):null,longDescription:long?stripTags(long):null};
}
function star(p){const r=p?.starRating||null;return {rating:Number.isFinite(Number(r?.averageRating))?Number(r.averageRating):null,ratingCount:Number.isFinite(Number(r?.totalRatingsCount))?Number(r.totalRatingsCount):null};}
function priceMeta(p){
  const ctas=Array.isArray(p?.webctas)?p.webctas:[];const price=ctas.find(x=>x?.price&&!x.price?.isTiedToSubscription)?.price||ctas.find(x=>x?.price)?.price||null;
  if(!price)return {saleEndsAt:null,lowestRecentPriceText:null};
  let saleEndsAt=null;if(price.endTime){const n=Number(price.endTime);const d=Number.isFinite(n)?new Date(n):new Date(price.endTime);if(Number.isFinite(d.getTime()))saleEndsAt=d.toISOString();}
  return {saleEndsAt,lowestRecentPriceText:price?.history?.lowestRecentPrice||null};
}
function featuresFromProduct(p){
  const out=[];const notices=p?.accessibilityNoticesByPlatform;
  if(notices&&typeof notices==='object')for(const [platform,list] of Object.entries(notices))for(const n of Array.isArray(list)?list:[])if(n?.type&&n?.value)out.push(`${platform}:${n.type}:${n.value}`);
  return [...new Set(out)].slice(0,40);
}
async function fetchOne(row){
  const url=cleanUrl(row.store),pid=productIdFromUrl(url);if(!pid)return {ok:false,skip:true,error:'not-product-url'};
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),22000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ko-KR'},signal:ac.signal});
    if(!r.ok)return {ok:false,error:`HTTP ${r.status}`};
    const html=await r.text(),next=findNextData(html),ld=parseLd(html);const {product:p,sources}=mergeProductCaches(next,pid);
    const releaseDate=parseRelease(html,p);
    const genres=(Array.isArray(p?.localizedGenres)?p.localizedGenres.map(x=>x?.value):[]).filter(Boolean);
    const edition=p?.edition?.name||null;
    const contentRating=p?.contentRating?.name||null;
    const publisher=p?.publisherName||p?.publisher||captureQa(html,'publisher-value')||captureQa(html,'publisher')||null;
    const qaGenre=captureQa(html,'genre-value')||captureQa(html,'genre');if(!genres.length&&qaGenre)genres.push(...qaGenre.split(/[,·]/).map(x=>x.trim()).filter(Boolean));
    const screenLanguages=[];
    const bodyText=stripTags(html);
    for(const m of bodyText.matchAll(/(?:PS5|PS4)\s*스크린\s*언어\s*:\s*([^:]{2,180}?)(?=PS5|PS4|음성|출시|퍼블리셔|장르|$)/g))screenLanguages.push(...m[1].split(',').map(x=>x.trim()).filter(Boolean));
    const desc=descriptions(p,ld),st=star(p),pm=priceMeta(p);
    return {ok:true,item:{
      id:String(row.id),title:row.title||'',productId:pid,store:url,
      releaseDate,publisher,genres:[...new Set(genres)],platforms:platformArray(p,row.platform||[]),edition,
      productType:p?.type||ld?.category||row.type||null,contentRating,
      ko:row.ko===true||/한국어/.test(String(p?.name||row.storeTitle||'')),screenLanguages:[...new Set(screenLanguages)],
      ...st,...pm,...desc,features:featuresFromProduct(p),
      classification:p?.storeDisplayClassification||null,topCategory:p?.topCategory||null,
      metadataSources:sources,source:'playstation-store-product-html-next-data',fetchedAt:new Date().toISOString()
    }};
  }catch(e){return {ok:false,error:e?.name==='AbortError'?'timeout':String(e?.message||e)};}
  finally{clearTimeout(timer);}
}

const deals=await readJson(DEALS,null);if(!deals?.health?.safeToMerge||!Array.isArray(deals.items))throw new Error('deals-auto.json unsafe');
const pool=(deals.items||[]).filter(x=>x?.id&&productIdFromUrl(x.store));
const filtered=MATCH?pool.filter(x=>`${x.title||''} ${x.store||''}`.toLowerCase().includes(MATCH)):pool;
const all=filtered.slice(0,LIMIT);
const candidates=all.filter((_,i)=>i%SHARD_COUNT===SHARD_INDEX);
let cursor=0,ok=0,fail=0,skipped=0;const items=[],failures=[];
async function worker(workerId){await sleep(workerId*120);while(true){const i=cursor++;if(i>=candidates.length)return;const row=candidates[i];const r=await fetchOne(row);if(r.ok){items.push(r.item);ok++;}else{if(r.skip)skipped++;else fail++;if(failures.length<120)failures.push({id:row.id,title:row.title,error:r.error});}if((i+1)%50===0)console.log('V229_GAME_INFO_PROGRESS',{done:i+1,total:candidates.length,ok,fail,skipped,shardIndex:SHARD_INDEX});await sleep(90);}}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,candidates.length))},(_,i)=>worker(i)));
items.sort((a,b)=>String(a.title).localeCompare(String(b.title),'ko'));
const coverage={release:items.filter(x=>x.releaseDate).length,genre:items.filter(x=>x.genres?.length).length,publisher:items.filter(x=>x.publisher).length,rating:items.filter(x=>x.rating).length,contentRating:items.filter(x=>x.contentRating).length,edition:items.filter(x=>x.edition).length,screenLanguages:items.filter(x=>x.screenLanguages?.length).length,saleEndsAt:items.filter(x=>x.saleEndsAt).length,description:items.filter(x=>x.longDescription||x.shortDescription).length};
const health={safeToMerge:items.length>=Math.min(20,Math.max(1,Math.floor(candidates.length*0.5))),candidateCount:candidates.length,itemCount:items.length,fetchedNow:ok,failedNow:fail,skippedNow:skipped,match:MATCH||null,shardIndex:SHARD_INDEX,shardCount:SHARD_COUNT,...coverage};
const payload={generatedAt:new Date().toISOString(),source:'playstation-store-product-html-next-data',health,failures,items};
await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('V229_GAME_INFO_DONE',health);
if(!health.safeToMerge)process.exitCode=2;
