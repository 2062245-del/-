import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base='https://www.playstation.com/bin/imagic/gameslist?locale=ko-kr&categoryList=';
const lists=['plus-games-list','plus-classics-list','plus-monthly-games-list'];
const out={generatedAt:new Date().toISOString(),lists:{}};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'ko-KR'});
const page=await context.newPage();
try{
  await page.goto('https://www.playstation.com/ko-kr/ps-plus/games/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(2500);
  for(const name of lists){
    const url=base+encodeURIComponent(name);
    const res=await context.request.get(url,{timeout:60000,headers:{accept:'application/json,text/plain,*/*',referer:'https://www.playstation.com/ko-kr/ps-plus/games/'}});
    const text=await res.text();
    let parsed=null;try{parsed=JSON.parse(text);}catch{}
    const summarize=(v,depth=0)=>{
      if(depth>4)return typeof v;
      if(Array.isArray(v))return {type:'array',length:v.length,sample:v.slice(0,3).map(x=>summarize(x,depth+1))};
      if(v&&typeof v==='object'){
        const r={};for(const k of Object.keys(v).slice(0,30))r[k]=summarize(v[k],depth+1);return r;
      }
      return v;
    };
    out.lists[name]={status:res.status(),contentType:res.headers()['content-type']||'',bytes:Buffer.byteLength(text),summary:parsed?summarize(parsed):null,rawSample:text.slice(0,120000)};
  }
}finally{await browser.close();}
await fs.writeFile('ps-radar/data/gameslist-inspect.json',JSON.stringify(out,null,2)+'\n','utf8');
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.lists).map(([k,v])=>[k,{status:v.status,bytes:v.bytes,contentType:v.contentType}]))));
