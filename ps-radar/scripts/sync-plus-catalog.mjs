import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const SOURCE = 'https://www.playstation.com/ko-kr/ps-plus/games/';
const OUT = path.resolve('ps-radar/data/catalog-auto.json');
const DEBUG = path.resolve('ps-radar/data/catalog-auto-debug.json');
const KINDS = [
  { key: 'catalog', label: '게임 카탈로그', tier: 'Extra', type: 'catalog', min: 40 },
  { key: 'classic', label: '클래식 카탈로그', tier: 'Deluxe', type: 'classic', min: 10 },
  { key: 'trial', label: '게임 체험판', tier: 'Deluxe', type: 'trial', min: 20 }
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
  const lines = String(text).split(/\r?\n/).map(normalize).filter(Boolean);
  const starts = [];
  for(let i=0;i<lines.length;i++) if(lines[i] === 'A') starts.push(i);
  const candidates = [];
  for(const start of starts){
    const titles=[]; const letters=[]; let lastLetter='A'; letters.push('A');
    for(let i=start+1;i<Math.min(lines.length,start+5000);i++){
      const line=lines[i];
      if(stopPhrases.some(x=>line.includes(x))) break;
      if(/^[A-Z]$/.test(line)){
        const c=line.charCodeAt(0), prev=lastLetter.charCodeAt(0);
        if(c>=prev && c<=90){ if(line!==lastLetter) letters.push(line); lastLetter=line; continue; }
        if(c<prev) break;
      }
      if(plausibleTitle(line)) titles.push(line);
    }
    const dedup=[]; const seen=new Set();
    for(const t of titles){const k=keyTitle(t); if(!k||seen.has(k))continue; seen.add(k);dedup.push(t);}
    candidates.push({start,letters:[...new Set(letters)],titles:dedup,score:dedup.length + letters.length*4});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0] || {start:-1,letters:[],titles:[],score:0};
}

async function dismissOverlays(page){
  const labels=['모두 허용','동의','Accept All','Accept','닫기'];
  for(const label of labels){
    const loc=page.getByRole('button',{name:label,exact:true});
    if(await loc.count()) try{await loc.first().click({timeout:1200}); await page.waitForTimeout(300);}catch{}
  }
}

async function collectForKind(page, kind){
  const attempts=[];
  const locators=[
    page.getByRole('tab',{name:kind.label,exact:true}),
    page.getByRole('button',{name:kind.label,exact:true}),
    page.getByRole('link',{name:kind.label,exact:true}),
    page.getByText(kind.label,{exact:true})
  ];
  for(const loc of locators){
    const count=Math.min(await loc.count(),6);
    for(let i=0;i<count;i++){
      const el=loc.nth(i);
      try{
        if(!(await el.isVisible())) continue;
        await el.scrollIntoViewIfNeeded();
        await el.click({timeout:2500});
        await page.waitForTimeout(1800);
        const text=await page.locator('body').innerText();
        const parsed=parseAlphabetList(text);
        attempts.push({titles:parsed.titles,letters:parsed.letters,score:parsed.score,via:`${await el.evaluate(n=>`${n.tagName}.${n.className||''}`)}`});
      }catch{}
    }
  }
  if(!attempts.length){
    const text=await page.locator('body').innerText();
    const parsed=parseAlphabetList(text);
    attempts.push({titles:parsed.titles,letters:parsed.letters,score:parsed.score,via:'body-fallback'});
  }
  attempts.sort((a,b)=>b.score-a.score);
  return {best:attempts[0],attempts:attempts.slice(0,8)};
}

function buildItems(kind,titles){
  return titles.map(title=>({
    id: slugId(kind.type,title), title, type: kind.type, categories:[kind.type], tier: kind.tier,
    platform:[], genre:[], ko:null,
    desc: kind.type==='catalog'?'PlayStation Plus 게임 카탈로그 공식 A-Z 목록에서 자동 확인된 타이틀입니다.':kind.type==='classic'?'PlayStation Plus 클래식 카탈로그 공식 A-Z 목록에서 자동 확인된 타이틀입니다.':'PlayStation Plus 디럭스 게임 체험판 공식 A-Z 목록에서 자동 확인된 타이틀입니다.',
    price: kind.type==='trial'?'게임 체험판':kind.type==='classic'?'PS Plus 디럭스':'PS Plus 스페셜',
    tag:'PlayStation Plus 공식 A-Z', store:storeSearch(title), image:null,
    discoverySource:SOURCE, discoveredAt:new Date().toISOString(), confidence:88, dataQuality:'official-list'
  }));
}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({locale:'ko-KR',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
page.setDefaultTimeout(5000);
const diagnostics={source:SOURCE,startedAt:new Date().toISOString(),sections:{},consoleErrors:[]};
page.on('console',msg=>{if(msg.type()==='error')diagnostics.consoleErrors.push(msg.text().slice(0,500));});
try{
  const res=await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:90000});
  diagnostics.httpStatus=res?.status()||null;
  await page.waitForTimeout(6500);
  await dismissOverlays(page);
  const all=[];
  for(const kind of KINDS){
    const result=await collectForKind(page,kind);
    diagnostics.sections[kind.key]={label:kind.label,count:result.best?.titles?.length||0,letters:result.best?.letters||[],via:result.best?.via||null,attempts:result.attempts.map(x=>({count:x.titles.length,letters:x.letters,via:x.via}))};
    for(const item of buildItems(kind,result.best?.titles||[])) all.push(item);
  }
  const dedup=new Map();
  for(const item of all){
    const k=keyTitle(item.title); const prev=dedup.get(k);
    if(!prev){dedup.set(k,item);continue;}
    const cats=[...new Set([...(prev.categories||[prev.type]),...(item.categories||[item.type])])];
    const preferred=prev.type==='catalog'?prev:item.type==='catalog'?item:prev;
    dedup.set(k,{...preferred,categories:cats,tier:cats.includes('catalog')?'Extra':preferred.tier});
  }
  const counts=Object.fromEntries(KINDS.map(k=>[k.key,diagnostics.sections[k.key]?.count||0]));
  const safeToMerge=KINDS.filter(k=>k.key!=='trial').every(k=>counts[k.key]>=k.min);
  const payload={
    generatedAt:new Date().toISOString(), source:'playstation-plus-official-browser', sourceUrl:SOURCE,
    health:{httpStatus:diagnostics.httpStatus,safeToMerge,counts,thresholds:Object.fromEntries(KINDS.map(k=>[k.key,k.min])),itemCount:dedup.size},
    items:[...dedup.values()]
  };
  await fs.mkdir(path.dirname(OUT),{recursive:true});
  await fs.writeFile(DEBUG,JSON.stringify(diagnostics,null,2)+'\n','utf8');
  if(!safeToMerge){
    console.error('Safety threshold not met:',JSON.stringify(payload.health));
    process.exitCode=2;
  } else {
    await fs.writeFile(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
    console.log('PS Plus catalog sync OK',JSON.stringify(payload.health));
  }
} finally {
  await browser.close();
}
