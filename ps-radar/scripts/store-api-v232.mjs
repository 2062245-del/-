import fs from 'node:fs/promises';
import path from 'node:path';

const CATALOG='ps-radar/data/catalog-auto.json';
const OUT='ps-radar/data/store-auto.json';
const BATCH_SIZE=Math.max(1,Number(process.env.BATCH_SIZE||474));
const CONCURRENCY=Math.max(1,Math.min(8,Number(process.env.CONCURRENCY||4)));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
const API='https://web.np.playstation.com/api/graphql/v1/op';
const STORE_HEADERS={
  accept:'application/json',
  'accept-language':'ko-KR',
  'content-type':'application/json',
  'apollographql-client-name':'@sie-private/web-commerce-anywhere',
  'apollographql-client-version':'3.46.0-6.0',
  'disable_query_whitelist':'false',
  origin:'https://store.playstation.com',
  referer:'https://store.playstation.com/',
  'user-agent':UA,
  'x-psn-app-ver':'@sie-private/web-commerce-anywhere/3.46.0-6.0-42971bfe01742f917b5db86972381a503b22f11e',
  'x-psn-store-locale-override':'ko-KR'
};
const OPS={
  rating:{op:'wcaConceptStarRatingRetrive',hash:'6c476325b232d51aca55ce143d6f946860e22174a263967fbb9e1da4f78489fa',variable:'conceptId'},
  price:{op:'conceptRetrieveForCtasWithPrice',hash:'c47dab9bb8162ee451bc6f0d8c2e8738ab48c8dd7c50dbe2b30f441c1b8ca119',variable:'conceptId'},
  editions:{op:'wcaConceptEditionsRetrive',hash:'569ddaade7bd7bd2ca84c0282f250b5a0c11afaf18ea0a392795c4a6e0355bb3',variable:'conceptId'},
  productRating:{op:'wcaProductStarRatingRetrive',hash:'799fa113378f699281e0eda3154c54e03d763f6a98ad9a1378d58b1c2cb76cec',variable:'productId'},
  productPrice:{op:'productRetrieveForCtasWithPrice',hash:'1f0ca607e170abbfb7d67bd76c9bbc97f21fe2e807be49e5fe764e14566cb605',variable:'productId'}
};
const languageRe=/(한국어|영어|일본어|중국어(?:\(간체자\)|\(번체자\))?|프랑스어|독일어|스페인어|이탈리아어|포르투갈어|러시아어|폴란드어|태국어|아랍어|터키어|네덜란드어)/g;
const rejectEditionRe=/(체험판|trial|demo|dlc|추가\s*콘텐츠|bundle|번들|upgrade|업그레이드|soundtrack|사운드트랙)/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
function endpoint(opKey,value){
  const cfg=OPS[opKey];
  const q=new URLSearchParams({operationName:cfg.op,variables:JSON.stringify({[cfg.variable]:String(value)}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:cfg.hash}})});
  return `${API}?${q}`;
}
async function callOfficial(opKey,value,maxAttempts=5){
  const cfg=OPS[opKey]; let last;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    try{
      const r=await fetch(endpoint(opKey,value),{headers:STORE_HEADERS,signal:AbortSignal.timeout(25000)});
      if(r.status===429||r.status>=500){last=new Error(`${cfg.op} HTTP ${r.status}`);await sleep(900*(attempt+1));continue;}
      if(!r.ok){
        const snippet=(await r.text().catch(()=>'' )).slice(0,500).replace(/\s+/g,' ');
        const err=new Error(`${cfg.op} HTTP ${r.status}${snippet?` · ${snippet}`:''}`);err.permanent=true;throw err;
      }
      const j=await r.json();
      if(j.errors?.length){const err=new Error(`${cfg.op}: ${j.errors[0]?.message||'GraphQL error'}`);err.permanent=true;throw err;}
      return j;
    }catch(err){last=err;if(err?.permanent)throw err;if(attempt<maxAttempts-1)await sleep(650*(attempt+1));}
  }
  throw last||new Error(`${cfg.op} failed`);
}
function titleKey(v=''){return String(v).toLowerCase().replace(/\([^)]*\)/g,' ').replace(/\b(?:ps4|ps5)\b|[™®'"・:]/g,' ').replace(/[^a-z0-9가-힣]+/g,'').trim();}
function errorText(settled){return settled?.status==='rejected'?String(settled.reason?.message||settled.reason||''):'';}

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
async function resolveProduct(item,maxAttempts){
  if(item.productId)return {productId:item.productId,reason:'catalog-product-id'};
  try{
    const j=await callOfficial('editions',item.conceptId,maxAttempts);
    const editions=j?.data?.editionSelectionsRetrieveByConceptId||[];
    if(!editions.length)return null;
    const wanted=titleKey(item.title);
    const clean=editions.filter(x=>x?.id&&!rejectEditionRe.test(String(x.name||'')));
    const pool=clean.length?clean:editions.filter(x=>x?.id);
    const exact=pool.find(x=>titleKey(x.name)===wanted);
    const similar=pool.find(x=>{const k=titleKey(x.name);return wanted&&k&&(k.includes(wanted)||wanted.includes(k));});
    const chosen=exact||similar||pool[0];
    return chosen?.id?{productId:chosen.id,reason:'concept-edition-fallback',productName:chosen.name||null}:null;
  }catch{return null;}
}
async function enrich(item,maxAttempts=5){
  const [conceptRating,conceptPrice]=await Promise.allSettled([
    callOfficial('rating',item.conceptId,maxAttempts),
    callOfficial('price',item.conceptId,maxAttempts)
  ]);
  let rp=conceptRating.status==='fulfilled'?conceptRating.value?.data?.conceptRetrieve?.defaultProduct||null:null;
  let pp=conceptPrice.status==='fulfilled'?conceptPrice.value?.data?.conceptRetrieve?.defaultProduct||null:null;
  let resolvedProductId=rp?.id||pp?.id||item.productId||null;
  let fallbackReason=null;
  const conceptErrors=[errorText(conceptRating),errorText(conceptPrice)].filter(Boolean);

  if(!rp||!pp){
    const resolved=await resolveProduct(item,maxAttempts);
    if(resolved?.productId){
      resolvedProductId=resolved.productId; fallbackReason=resolved.reason;
      const [productRating,productPrice]=await Promise.allSettled([
        callOfficial('productRating',resolvedProductId,maxAttempts),
        callOfficial('productPrice',resolvedProductId,maxAttempts)
      ]);
      const prp=productRating.status==='fulfilled'?productRating.value?.data?.productRetrieve||null:null;
      const ppp=productPrice.status==='fulfilled'?productPrice.value?.data?.productRetrieve||null:null;
      rp=rp||prp; pp=pp||ppp;
      if(productRating.status==='rejected')conceptErrors.push(errorText(productRating));
      if(productPrice.status==='rejected')conceptErrors.push(errorText(productPrice));
    }
  }

  if(!rp&&!pp){
    const unavailable=conceptErrors.some(x=>/Concept not available|not available for/i.test(x));
    if(unavailable){
      return {
        id:item.id,conceptId:item.conceptId,productId:resolvedProductId,title:item.title,store:item.store,
        storeProductName:null,currentPrice:null,originalPrice:null,discountPercent:null,saleEndsAt:null,priceStatus:'unavailable-kr',
        rating:null,ratingCount:null,ko:null,languageStatus:'unknown',screenLanguages:null,languageEvidence:null,
        ...plusInfo(null,item),marketStatus:'unavailable-kr',verified:true,source:'playstation-store-official-graphql',fetchedAt:new Date().toISOString()
      };
    }
    throw new Error(`Store product unresolved${conceptErrors.length?` · ${conceptErrors[0]}`:''}`);
  }

  const product=pp||rp;
  const rating=rp?.starRating||product?.starRating||null;
  const store=resolvedProductId?`https://store.playstation.com/ko-kr/product/${resolvedProductId}`:item.store;
  return {
    id:item.id,conceptId:item.conceptId,productId:resolvedProductId||product?.id||null,title:item.title,
    store,storeProductName:product?.name||rp?.name||null,
    ...actualPurchasePrice(pp),
    rating:finite(rating?.averageRating),ratingCount:finite(rating?.totalRatingsCount),
    ...extractLanguages(product||rp),
    ...plusInfo(pp||rp,item),
    marketStatus:'available-kr',fallbackReason,
    verified:true,source:'playstation-store-official-graphql',fetchedAt:new Date().toISOString()
  };
}


export {callOfficial,actualPurchasePrice,STORE_HEADERS};

