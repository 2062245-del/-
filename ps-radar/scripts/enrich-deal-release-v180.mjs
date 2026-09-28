import fs from 'node:fs/promises';
import path from 'node:path';

const DEALS='ps-radar/data/deals-auto.json';
const OUT=process.env.RELEASE_OUT||'ps-radar/data/deal-release-v180.json';
const CONCURRENCY=Math.max(1,Math.min(12,Number(process.env.RELEASE_CONCURRENCY||6)));
const MAX_ATTEMPTS=Math.max(1,Math.min(4,Number(process.env.RELEASE_ATTEMPTS||2)));
const SHARD_COUNT=Math.max(1,Number(process.env.RELEASE_SHARD_COUNT||1));
const SHARD_INDEX=Math.max(0,Number(process.env.RELEASE_SHARD_INDEX||0));
const MIN_COVERAGE=Math.max(20,Math.min(100,Number(process.env.RELEASE_MIN_COVERAGE||70)));
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cleanUrl=v=>String(v||'').split('?')[0].replace(/\/$/,'');
const productId=u=>cleanUrl(u).match(/\/product\/([^/?#]+)/i)?.[1]||null;
const releasePatterns=[
  /"releaseDate"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[^"]+)"/i,
  /data-qa="gameInfo#releaseInformation#releaseDate-value"[^>]*>\s*([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})\s*</i
];
function parseRelease(html){
  const iso=html.match(releasePatterns[0])?.[1];
  if(iso){const d=new Date(iso);if(Number.isFinite(d.getTime()))return d.toISOString();}
  const m=html.match(releasePatterns[1]);
  if(m){const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));if(Number.isFinite(d.getTime()))return d.toISOString();}
  return null;
}
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return fallback;}}
async function fetchRelease(row){
  const url=cleanUrl(row.store);if(!productId(url))return {ok:false,skip:true,error:'not-product-url'};
  let last='';
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),18000);
    try{
      const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ko-KR'},signal:ac.signal});
      if(r.status===429||r.status>=500){last=`HTTP ${r.status}`;await sleep(700*attempt);continue;}
      if(!r.ok)return {ok:false,error:`HTTP ${r.status}`};
      const html=await r.text();const releaseDate=parseRelease(html);
      if(!releaseDate)return {ok:false,error:'releaseDate-not-found'};
      return {ok:true,item:{id:String(row.id),title:row.title||'',store:url,productId:productId(url),releaseDate,source:'playstation-store-product-html',fetchedAt:new Date().toISOString()}};
    }catch(e){last=String(e?.name==='AbortError'?'timeout':e?.message||e);if(attempt<MAX_ATTEMPTS)await sleep(600*attempt);}
    finally{clearTimeout(timer);}
  }
  return {ok:false,error:last||'fetch-failed'};
}

const deals=await readJson(DEALS,null);if(!deals?.health?.safeToMerge||!Array.isArray(deals.items))throw new Error('deals-auto.json unsafe');
const previous=SHARD_COUNT===1?await readJson(OUT,{items:[]}):{items:[]};
const cached=new Map((previous.items||[]).filter(x=>x?.id&&x?.releaseDate).map(x=>[String(x.id),x]));
const allCandidates=(deals.items||[]).filter(x=>x?.id&&productId(x.store));
const candidates=allCandidates.filter((_,i)=>i%SHARD_COUNT===SHARD_INDEX);
const pending=candidates.filter(x=>!cached.has(String(x.id)));
console.log('V180_RELEASE_START',{deals:deals.items.length,allCandidates:allCandidates.length,candidates:candidates.length,cached:cached.size,pending:pending.length,concurrency:CONCURRENCY,shardIndex:SHARD_INDEX,shardCount:SHARD_COUNT});
let cursor=0,ok=0,fail=0,skipped=0;const failures=[];
async function worker(workerId){
  await sleep(workerId*90);
  while(true){
    const i=cursor++;if(i>=pending.length)return;
    const row=pending[i];const r=await fetchRelease(row);
    if(r.ok){cached.set(String(row.id),r.item);ok++;}
    else{if(r.skip)skipped++;else fail++;if(failures.length<80)failures.push({id:row.id,title:row.title,error:r.error});}
    if((i+1)%50===0)console.log('V180_RELEASE_PROGRESS',{done:i+1,total:pending.length,ok,fail,skipped,shardIndex:SHARD_INDEX});
    await sleep(80);
  }
}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,pending.length))},(_,i)=>worker(i)));
const candidateIds=new Set(candidates.map(x=>String(x.id)));const items=[...cached.values()].filter(x=>candidateIds.has(String(x.id))).sort((a,b)=>String(a.title).localeCompare(String(b.title),'ko'));
const candidateCount=candidates.length;const coverage=candidateCount?Math.round(items.length/candidateCount*1000)/10:0;
const health={safeToMerge:items.length>=Math.min(50,candidateCount)&&coverage>=MIN_COVERAGE,dealCount:deals.items.length,allCandidateCount:allCandidates.length,candidateCount,itemCount:items.length,coveragePercent:coverage,fetchedNow:ok,failedNow:fail,skippedNow:skipped,shardIndex:SHARD_INDEX,shardCount:SHARD_COUNT};
const payload={generatedAt:new Date().toISOString(),source:'playstation-store-product-html',health,failures,items};
await fs.mkdir(path.dirname(OUT),{recursive:true});await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log('V180_RELEASE_DONE',health);
if(!health.safeToMerge)process.exitCode=2;
