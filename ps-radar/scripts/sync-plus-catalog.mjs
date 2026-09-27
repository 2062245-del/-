import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const SOURCE = 'https://www.playstation.com/ko-kr/ps-plus/games/';
const OUT = path.resolve('ps-radar/data/catalog-auto.json');
const DEBUG = path.resolve('ps-radar/data/catalog-auto-debug.json');
const KINDS = [
  { key:'catalog', label:'게임 카탈로그', tier:'Extra', type:'catalog', min:40, category:'GAME_CATALOG' },
  { key:'classic', label:'클래식 카탈로그', tier:'Deluxe', type:'classic', min:10, category:'CLASSICS_CATALOG' }
];

const uiNoise = new Set([
  '개요','PlayStation Plus의 새로운 소식','모든 게임(A-Z)','PlayStation Plus에 가입하세요','게임 카탈로그','클래식 카탈로그','월간 게임','게임 체험판',
  '다음 게임을 찾아보세요','정기 구독 서비스 플랜 선택하기','디럭스(Deluxe)','스페셜','에센셜','가입하기','자세히 보기','더 보기',
  '모든 PlayStation Plus 게임','전문가 가이드에서 훌륭한 게임을 발견하세요','게임 체험판*','설명','description'
]);
const stopPhrases = ['정기 구독 서비스 플랜 선택하기','전문가 가이드에서 훌륭한 게임을 발견하세요','PlayStation Plus에 가입하세요'];
const normalize = (s='') => String(s).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const keyTitle = (s='') => normalize(s).toLowerCase().replace(/[™®©]/g,'').replace(/\b(?:ps4|ps5)\b/gi,'').replace(/[^a-z0-9가-힣]+/g,'');
const slugId = (type,title) => `${type}-auto-${crypto.createHash('sha1').update(title).digest('hex').slice(0,12)}`;
const storeSearch = (title) => `https://store.playstation.com/ko-kr/search/${encodeURIComponent(title)}`;
const fingerprint = titles => crypto.createHash('sha256').update(titles.map(keyTitle).sort().join('|')).digest('hex');

function plausibleTitle(line){
  if(!line || line.length < 2 || line.length > 180) return false;
  if(uiNoise.has(line) || stopPhrases.some(x => line.includes(x))) return false;
  if(/^[A-Z]$/.test(line)) return false;
  if(/^(https?:|쿠키|개인정보|법적|지원|회사 소개|접근성|사이트맵)/i.test(line)) return false;
  if(/^(PlayStation Plus|PS Plus)\s*(디럭스|스페셜|에센셜)?$/i.test(line)) return false;
  if(/^[*•·|]+$/.test(line)) return false;
  return true;
}

function parseAlphabetList(text){
  const lines=String(text).split(/\r?\n/).map(normalize).filter(Boolean);
  const starts=[]; for(let i=0;i<lines.length;i++) if(lines[i]==='A') starts.push(i);
  const candidates=[];
  for(const start of starts){
    const titles=[]; const letters=['A']; let lastLetter='A';
    for(let i=start+1;i<Math.min(lines.length,start+5000);i++){
      const line=lines[i];
      if(stopPhrases.some(x=>line.includes(x))) break;
      if(/^[A-Z]$/.test(line)){
        const c=line.charCodeAt(0), prev=lastLetter.charCodeAt(0);
        if(c>=prev&&c<=90){if(line!==lastLetter)letters.push(line);lastLetter=line;continue;}
        if(c<prev)break;
      }
      if(plausibleTitle(line))titles.push(line);
    }
    const dedup=[]; const seen=new Set();
    for(const t of titles){const k=keyTitle(t);if(!k||seen.has(k))continue;seen.add(k);dedup.push(t);}
    candidates.push({start,letters:[...new Set(letters)],titles:dedup,score:dedup.length+letters.length*4});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]||{start:-1,letters:[],titles:[],score:0};
}

async function dismissOverlays(page){
  for(const label of ['모두 허용','동의','Accept All','Accept','닫기']){
    const loc=page.getByRole('button',{name:label,exact:true});
    if(await loc.count())try{await loc.first().click({timeout:1200});await page.waitForTimeout(250);}catch{}
  }
}

async function collectForKind(page,kind){
  const url=`${SOURCE}?category=${encodeURIComponent(kind.category)}`;
  const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(6500);
  await dismissOverlays(page);
  await page.waitForTimeout(800);
  const text=await page.locator('body').innerText();
  const parsed=parseAlphabetList(text);
  const selected=await page.locator('[class*="select_current-value-content"]').allInnerTexts().catch(()=>[]);
  const h3=await page.locator('h2,h3').allInnerTexts().catch(()=>[]);
  return {titles:parsed.titles,letters:parsed.letters,score:parsed.score,url:page.url(),httpStatus:res?.status()||null,selected:selected.map(normalize).filter(Boolean).slice(0,12),headings:h3.map(normalize).filter(Boolean).slice(0,30),fingerprint:fingerprint(parsed.titles)};
}

function buildItems(kind,titles){
  return titles.map(title=>({id:slugId(kind.type,title),title,type:kind.type,categories:[kind.type],tier:kind.tier,platform:[],genre:[],ko:null,desc:kind.type==='catalog'?'PlayStation Plus 게임 카탈로그 공식 A-Z 목록에서 자동 확인된 타이틀입니다.':'PlayStation Plus 클래식 카탈로그 공식 A-Z 목록에서 자동 확인된 타이틀입니다.',price:kind.type==='classic'?'PS Plus 디럭스':'PS Plus 스페셜',tag:'PlayStation Plus 공식 A-Z',store:storeSearch(title),image:null,discoverySource:`${SOURCE}?category=${kind.category}`,discoveredAt:new Date().toISOString(),confidence:90,dataQuality:'official-list'}));
}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({locale:'ko-KR',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
page.setDefaultTimeout(6000);
const diagnostics={source:SOURCE,startedAt:new Date().toISOString(),sections:{},network:[],consoleErrors:[]};
page.on('console',msg=>{if(msg.type()==='error'&&diagnostics.consoleErrors.length<80)diagnostics.consoleErrors.push(msg.text().slice(0,500));});
page.on('response',res=>{
  const req=res.request(); const type=req.resourceType(); const url=res.url();
  if(diagnostics.network.length>=180)return;
  if(['xhr','fetch'].includes(type)||res.status()>=400||/graphql|api\//i.test(url)){
    diagnostics.network.push({status:res.status(),type,url:url.slice(0,1800),method:req.method(),postData:(req.postData()||'').slice(0,2500)});
  }
});
try{
  const all=[];
  for(const kind of KINDS){
    const result=await collectForKind(page,kind);
    diagnostics.sections[kind.key]={label:kind.label,category:kind.category,count:result.titles.length,letters:result.letters,url:result.url,httpStatus:result.httpStatus,selected:result.selected,headings:result.headings,fingerprint:result.fingerprint};
    for(const item of buildItems(kind,result.titles))all.push(item);
  }
  const fingerprints=KINDS.map(k=>diagnostics.sections[k.key]?.fingerprint).filter(Boolean);
  const categoriesDistinct=new Set(fingerprints).size===fingerprints.length;
  const urlsCorrect=KINDS.every(k=>String(diagnostics.sections[k.key]?.url||'').includes(`category=${k.category}`));
  const counts=Object.fromEntries(KINDS.map(k=>[k.key,diagnostics.sections[k.key]?.count||0]));
  const thresholdsOk=KINDS.every(k=>counts[k.key]>=k.min);
  const dedup=new Map();
  for(const item of all){const k=keyTitle(item.title),prev=dedup.get(k);if(!prev){dedup.set(k,item);continue;}const cats=[...new Set([...(prev.categories||[prev.type]),...(item.categories||[item.type])])];const preferred=prev.type==='catalog'?prev:item.type==='catalog'?item:prev;dedup.set(k,{...preferred,categories:cats,tier:cats.includes('catalog')?'Extra':preferred.tier});}
  const catKeys=new Set(all.filter(x=>x.type==='catalog').map(x=>keyTitle(x.title))); const classicKeys=new Set(all.filter(x=>x.type==='classic').map(x=>keyTitle(x.title))); const overlap=[...catKeys].filter(x=>classicKeys.has(x)).length;
  const safeToMerge=thresholdsOk&&categoriesDistinct&&urlsCorrect;
  const payload={generatedAt:new Date().toISOString(),source:'playstation-plus-official-browser',sourceUrl:SOURCE,health:{safeToMerge,counts,thresholds:Object.fromEntries(KINDS.map(k=>[k.key,k.min])),categoriesDistinct,urlsCorrect,overlap,itemCount:dedup.size},items:[...dedup.values()]};
  await fs.mkdir(path.dirname(OUT),{recursive:true});
  await fs.writeFile(DEBUG,JSON.stringify(diagnostics,null,2)+'\n','utf8');
  if(!safeToMerge){console.error('Safety checks failed:',JSON.stringify(payload.health));process.exitCode=2;}
  else{await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');console.log('PS Plus catalog sync OK',JSON.stringify(payload.health));}
} finally {await browser.close();}
