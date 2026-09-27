import fs from 'node:fs/promises';
import path from 'node:path';

const CATALOG='ps-radar/data/catalog-auto.json';
const OUT='ps-radar/data/store-auto.json';
const BATCH_SIZE=Math.max(1,Number(process.env.BATCH_SIZE||474));
const CONCURRENCY=Math.max(1,Math.min(8,Number(process.env.CONCURRENCY||4)));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
const API='https://web.np.playstation.com/api/graphql/v1/op';
const OPS={
  rating:['wcaConceptStarRatingRetrive','6c476325b232d51aca55ce143d6f946860e22174a263967fbb9e1da4f78489fa'],
  price:['conceptRetrieveForCtasWithPrice','c47dab9bb8162ee451bc6f0d8c2e8738ab48c8dd7c50dbe2b30f441c1b8ca119']
};
const languageRe=/(한국어|영어|일본어|중국어(?:\(간체자\)|\(번체자\))?|프랑스어|독일어|스페인어|이탈리아어|포르투갈어|러시아어|폴란드어|태국어|아랍어|터키어|네덜란드어)/g;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
function endpoint(op,hash,conceptId){
  const q=new URLSearchParams({operationName:op,variables:JSON.stringify({conceptId:String(conceptId)}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:hash}})});
  return `${API}?${q}`;
}
async function callOfficial(opKey,conceptId,maxAttempts=5){
  const [op,hash]=OPS[opKey]; let last;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    try{
      const r=await fetch(endpoint(op,hash,conceptId),{headers:{accept:'application/json','accept-language':'ko-KR,ko;q=0.9,en;q=0.7',origin:'https://store.playstation.com',referer:'https://store.playstation.com/','user-agent':UA}});
      if(r.status===429||r.status>=500){last=new Error(`${op} HTTP ${r.status}`);await sleep(900*(attempt+1));continue;}
      if(!r.ok){const err=new Error(`${op} HTTP ${r.status}`);err.permanent=true;throw err;}
      const j=await r.json();
      if(j.errors?.length){const err=new Error(`${op}: ${j.errors[0]?.message||'GraphQL error'}`);err.permanent=true;throw err;}
      return j;
    }catch(err){last=err;if(err?.permanent)throw err;if(attempt<maxAttempts-1)await sleep(650*(attempt+1));}
  }
  throw last||new Error(`${op} failed`);
}

function extractLanguages(product){
  const text=[product?.name,...(product?.skus||[]).map(x=>x?.name)].filter(Boolean).join(' · ');
  const langs=[...new Set(text.match(languageRe)||[])];
  if(langs.includes('한국어'))return {ko:true,languageStatus:'verified-store-positive',screenLanguages:langs.join(' · '),languageEvidence:'product-or-sku-name'};
  return {ko:null,languageStatus:'unknown',screenLanguages:langs.length?langs.join(' · '):null,languageEvidence:langs.length?'non-authoritative-name-hint':null};
}
function actualPurchasePrice(product){
  const ctas=product?.webctas||[];
  const candidates=ctas.filter(c=>c?.price&&c.price.isTiedToSubscription!==true&&String(c.price.membershipType||'')!=='PS_PLUS');
  const cta=candidates.find(c=>c.type==='ADD_TO_CART')||candidates[0]||null;
  const p=cta?.price||null;
  if(!p)return {currentPrice:null,originalPrice:null,discountPercent:null,saleEndsAt:null,priceStatus:'unknown'};
  const original=finite(p.basePriceValue);
  let current=finite(p.discountedValue);
  if(current===null&&original!==null)current=original;
  if(original===0&&current===0)return {currentPrice:null,originalPrice:null,discountPercent:null,saleEndsAt:p.endTime||null,priceStatus:'unknown-zero-suppressed'};
  const discount=original!==null&&current!==null&&original>0&&current<original?Math.max(0,Math.min(100,Math.round((1-current/original)*100))):0;
  return {currentPrice:current,originalPrice:original,discountPercent:discount,saleEndsAt:p.endTime||null,priceStatus:current!==null?'verified':'unknown'};
}
function plusInfo(product,item){
  const ctas=product?.webctas||[];
  const included=ctas.some(c=>/PS_PLUS/.test(String(c?.price?.membershipType||''))||/PS_PLUS/.test(String(c?.type||''))||c?.price?.isTiedToSubscription===true);
  return {plusIncluded:included||item.type==='catalog'||item.type==='classic',plusTier:item.type==='classic'?'Deluxe':'Extra'};
}
async function enrich(item,maxAttempts=5){
  const [ratingPayload,pricePayload]=await Promise.all([callOfficial('rating',item.conceptId,maxAttempts),callOfficial('price',item.conceptId,maxAttempts)]);
  const rp=ratingPayload?.data?.conceptRetrieve?.defaultProduct||null;
  const pp=pricePayload?.data?.conceptRetrieve?.defaultProduct||null;
  if(!rp&&!pp)throw new Error('defaultProduct missing');
  const product=pp||rp;
  const rating=rp?.starRating||product?.starRating||null;
  return {
    id:item.id,conceptId:item.conceptId,productId:product?.id||item.productId||null,title:item.title,
    store:item.store,storeProductName:product?.name||rp?.name||null,
    ...actualPurchasePrice(pp),
    rating:finite(rating?.averageRating),ratingCount:finite(rating?.totalRatingsCount),
    ...extractLanguages(product||rp),
    ...plusInfo(pp||rp,item),
    verified:true,source:'playstation-store-official-graphql',fetchedAt:new Date().toISOString()
  };
}

const catalog=await readJson(CATALOG,null);
if(!catalog?.health?.safeToMerge||!Array.isArray(catalog.items))throw new Error('catalog-auto.json is not safe');
const previous=await readJson(OUT,{items:[]});
const prevByConcept=new Map((previous.items||[]).filter(x=>x.conceptId).map(x=>[String(x.conceptId),x]));
const target=catalog.items.filter(x=>x.conceptId&&x.store).slice(0,BATCH_SIZE);
if(!target.length)throw new Error('no catalog items eligible for Store enrichment');
const results=new Array(target.length); let cursor=0;

try{
  console.log(`PS Store preflight: ${target[0].title} / concept ${target[0].conceptId}`);
  results[0]={ok:true,item:await enrich(target[0],2)};
  cursor=1;
  console.log('PS Store preflight OK',JSON.stringify({title:results[0].item.title,price:results[0].item.currentPrice,rating:results[0].item.rating,languageStatus:results[0].item.languageStatus}));
}catch(err){
  console.error('PS Store preflight FAILED',JSON.stringify({title:target[0].title,conceptId:target[0].conceptId,error:String(err?.message||err)}));
  process.exit(2);
}

async function worker(workerId){
  await sleep(workerId*140);
  while(true){
    const i=cursor++; if(i>=target.length)return;
    const item=target[i];
    try{results[i]={ok:true,item:await enrich(item)};}
    catch(err){results[i]={ok:false,item,error:String(err?.message||err)};}
    await sleep(120);
  }
}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(0,target.length-cursor))},(_,i)=>worker(i)));
for(const r of results)if(r?.ok)prevByConcept.set(String(r.item.conceptId),r.item);
const all=[...prevByConcept.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'ko'));
const failed=results.filter(x=>x&&!x.ok);
const fresh=results.filter(x=>x?.ok).length;
const coverage={
  catalogTotal:catalog.items.length,targeted:target.length,fetchedNow:fresh,failedNow:failed.length,itemCount:all.length,
  price:all.filter(x=>x.currentPrice!==null&&x.currentPrice!==undefined).length,
  rating:all.filter(x=>x.rating!==null&&x.rating!==undefined).length,
  ratingCount:all.filter(x=>x.ratingCount!==null&&x.ratingCount!==undefined).length,
  languageVerified:all.filter(x=>x.languageStatus==='verified-store-positive').length,
  languageUnknown:all.filter(x=>x.languageStatus!=='verified-store-positive').length,
  koreanSupported:all.filter(x=>x.ko===true).length,
  falseZeroPrices:all.filter(x=>x.currentPrice===0&&x.originalPrice===0).length
};
const expected=Math.min(BATCH_SIZE,target.length);
const safeToMerge=all.length>=Math.min(100,expected)&&fresh>=Math.min(100,Math.ceil(expected*0.6))&&coverage.falseZeroPrices===0;
const payload={generatedAt:new Date().toISOString(),source:'playstation-store-official-graphql',languagePolicy:'positive-confirmation-only',health:{safeToMerge,...coverage},failures:failed.slice(0,40).map(x=>({title:x.item?.title,conceptId:x.item?.conceptId,error:x.error})),items:all};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('PS Store enrichment',JSON.stringify(payload.health));
if(!safeToMerge){console.error('enrichment safety threshold not met');process.exitCode=2;}
