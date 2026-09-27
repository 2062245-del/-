import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const SOURCE_PAGE='https://www.playstation.com/ko-kr/ps-plus/games/';
const API_BASE='https://www.playstation.com/bin/imagic/gameslist?locale=ko-kr&categoryList=';
const OUT=path.resolve('ps-radar/data/catalog-auto.json');
const DEBUG=path.resolve('ps-radar/data/catalog-auto-debug.json');
const LISTS=[
  {key:'catalog',list:'plus-games-list',type:'catalog',tier:'Extra',min:100,label:'게임 카탈로그'},
  {key:'classic',list:'plus-classics-list',type:'classic',tier:'Deluxe',min:30,label:'클래식 카탈로그'}
];

const normalize=(s='')=>String(s).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const titleKey=(s='')=>normalize(s).toLowerCase().replace(/[™®©]/g,'').replace(/\b(?:ps4|ps5)\b/gi,'').replace(/[^a-z0-9가-힣]+/g,'');
const idFor=(type,identity)=>`${type}-auto-${crypto.createHash('sha1').update(String(identity)).digest('hex').slice(0,14)}`;
const fingerprint=items=>crypto.createHash('sha256').update(items.map(x=>`${x.conceptId||''}:${titleKey(x.title)}`).sort().join('|')).digest('hex');

const genreMap={
  ACTION:'Action',ADVENTURE:'Adventure',ROLE_PLAYING_GAMES:'RPG',SHOOTER:'Shooter',SPORTS:'Sports',SIMULATION:'Simulation',STRATEGY:'Strategy',
  PUZZLE:'Puzzle',FAMILY:'Family',CASUAL:'Casual',MUSIC_RHYTHM:'Music',RHYTHM_ACTION:'Music',RACING:'Racing',DRIVING_RACING:'Racing',
  FIGHTING:'Fighting',ARCADE:'Arcade',HORROR:'Horror',PARTY:'Party',BRAIN_TRAINING:'Puzzle'
};
function mapGenre(values=[]){
  return [...new Set((Array.isArray(values)?values:[]).map(v=>genreMap[v]||String(v).toLowerCase().split('_').map(x=>x?x[0].toUpperCase()+x.slice(1):'').join(' ')).filter(Boolean))];
}
function flattenPayload(payload){
  if(!Array.isArray(payload))throw new Error('gameslist payload is not an array');
  const items=[];let declared=0;
  for(const bucket of payload){
    if(!bucket||!Array.isArray(bucket.games))continue;
    declared+=Number(bucket.count)||0;
    for(const game of bucket.games)if(game&&game.name)items.push(game);
  }
  return {items,declared,buckets:payload.length};
}
function toGame(raw,meta,now){
  const title=normalize(raw.name)||normalize(raw.nameEn);
  const identity=raw.conceptId||raw.productId||titleKey(title);
  return {
    id:idFor(meta.type,identity),title,type:meta.type,categories:[meta.type],tier:meta.tier,
    platform:Array.isArray(raw.device)?raw.device.filter(x=>x==='PS4'||x==='PS5'):[],genre:mapGenre(raw.genre),ko:false,languageStatus:'unknown',
    desc:meta.type==='catalog'?'PlayStation Plus 게임 카탈로그 공식 목록에서 자동 확인된 타이틀입니다.':'PlayStation Plus 클래식 카탈로그 공식 목록에서 자동 확인된 타이틀입니다.',
    price:meta.type==='classic'?'PS Plus 디럭스':'PS Plus 스페셜',tag:'PlayStation Plus 공식 전체 목록',
    store:raw.conceptUrl||`https://store.playstation.com/ko-kr/search/${encodeURIComponent(title)}`,
    image:raw.imageUrl||null,releaseDate:raw.releaseDate||null,storeGenre:mapGenre(raw.genre).join(' · ')||null,
    productId:raw.productId||null,conceptId:raw.conceptId||null,ageRating:raw.ageRating?.description||null,streamingSupported:!!raw.streamingSupported,
    discoverySource:`${API_BASE}${meta.list}`,discoveredAt:now,confidence:100,dataQuality:'verified'
  };
}
function mergeSameTitle(items=[]){
  const byIdentity=new Map();
  for(const x of items){
    const k=x.conceptId?`concept:${x.conceptId}`:`title:${titleKey(x.title)}`;
    const prev=byIdentity.get(k);
    if(!prev){byIdentity.set(k,x);continue;}
    const cats=[...new Set([...(prev.categories||[prev.type]),...(x.categories||[x.type])])];
    const preferred=cats.includes('catalog')?(prev.type==='catalog'?prev:x):prev;
    byIdentity.set(k,{...preferred,categories:cats,platform:[...new Set([...(prev.platform||[]),...(x.platform||[])])],genre:[...new Set([...(prev.genre||[]),...(x.genre||[])])]});
  }
  return [...byIdentity.values()];
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'ko-KR',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
const page=await context.newPage();
const diagnostics={source:SOURCE_PAGE,startedAt:new Date().toISOString(),lists:{},errors:[]};
try{
  await page.goto(SOURCE_PAGE,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(1800);
  const now=new Date().toISOString();
  const all=[];
  for(const meta of LISTS){
    const url=API_BASE+encodeURIComponent(meta.list);
    const res=await context.request.get(url,{timeout:60000,headers:{accept:'application/json,text/plain,*/*',referer:SOURCE_PAGE}});
    const text=await res.text();
    if(!res.ok())throw new Error(`${meta.key} API ${res.status()}`);
    let payload;try{payload=JSON.parse(text);}catch{throw new Error(`${meta.key} API returned invalid JSON`);}
    const flat=flattenPayload(payload);
    const mapped=flat.items.map(x=>toGame(x,meta,now));
    const unique=mergeSameTitle(mapped);
    diagnostics.lists[meta.key]={label:meta.label,url,status:res.status(),bytes:Buffer.byteLength(text),buckets:flat.buckets,declared:flat.declared,rawCount:flat.items.length,uniqueCount:unique.length,fingerprint:fingerprint(unique),sample:unique.slice(0,5).map(x=>({title:x.title,conceptId:x.conceptId,platform:x.platform,genre:x.genre}))};
    all.push(...unique);
  }
  const merged=mergeSameTitle(all);
  const counts=Object.fromEntries(LISTS.map(x=>[x.key,diagnostics.lists[x.key]?.uniqueCount||0]));
  const thresholds=Object.fromEntries(LISTS.map(x=>[x.key,x.min]));
  const thresholdsOk=LISTS.every(x=>counts[x.key]>=x.min);
  const fps=LISTS.map(x=>diagnostics.lists[x.key]?.fingerprint).filter(Boolean);
  const categoriesDistinct=new Set(fps).size===LISTS.length;
  const declaredConsistent=LISTS.every(x=>{
    const d=diagnostics.lists[x.key];return d&&d.rawCount===d.declared;
  });
  const catKeys=new Set(all.filter(x=>x.type==='catalog').map(x=>x.conceptId||titleKey(x.title)));
  const classicKeys=new Set(all.filter(x=>x.type==='classic').map(x=>x.conceptId||titleKey(x.title)));
  const overlap=[...catKeys].filter(x=>classicKeys.has(x)).length;
  const safeToMerge=thresholdsOk&&categoriesDistinct&&declaredConsistent;
  const payload={
    generatedAt:now,source:'playstation-official-gameslist-api',sourcePage:SOURCE_PAGE,
    sources:Object.fromEntries(LISTS.map(x=>[x.key,API_BASE+x.list])),
    coverage:'official-current-snapshot',
    health:{safeToMerge,counts,thresholds,categoriesDistinct,declaredConsistent,overlap,itemCount:merged.length},
    items:merged
  };
  await fs.mkdir(path.dirname(OUT),{recursive:true});
  await fs.writeFile(DEBUG,JSON.stringify(diagnostics,null,2)+'\n','utf8');
  if(!safeToMerge){console.error('Safety checks failed',JSON.stringify(payload.health));process.exitCode=2;}
  else{
    await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
    console.log('PS Plus official catalog sync OK',JSON.stringify(payload.health));
  }
}catch(err){
  diagnostics.errors.push(String(err?.stack||err));
  await fs.mkdir(path.dirname(DEBUG),{recursive:true});
  await fs.writeFile(DEBUG,JSON.stringify(diagnostics,null,2)+'\n','utf8');
  throw err;
}finally{await browser.close();}
