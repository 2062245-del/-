import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const URL='https://store.playstation.com/ko-kr/pages/deals';
const out={generatedAt:new Date().toISOString(),url:URL,categories:[],graphql:[],links:[],bodyHints:[]};
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({locale:'ko-KR',viewport:{width:1440,height:1400},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
  const seenGraphql=new Set();
  page.on('response',async res=>{
    const req=res.request();
    if(!['xhr','fetch'].includes(req.resourceType()))return;
    const url=res.url();
    if(!/web\.np\.playstation\.com\/api\/graphql\/v1\/op/i.test(url))return;
    try{
      const u=new URL(url);
      const op=u.searchParams.get('operationName')||'';
      const variables=JSON.parse(u.searchParams.get('variables')||'{}');
      const extensions=JSON.parse(u.searchParams.get('extensions')||'{}');
      const hash=extensions?.persistedQuery?.sha256Hash||'';
      const key=`${op}|${JSON.stringify(variables)}|${hash}`;
      if(seenGraphql.has(key))return;seenGraphql.add(key);
      let body=null;
      try{body=await res.json();}catch{}
      out.graphql.push({status:res.status(),operationName:op,variables,hash,body});
    }catch{}
  });

  const nav=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:90000});
  out.status=nav?.status()||null;
  for(let i=0;i<12;i++){
    await page.mouse.wheel(0,1600);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);

  out.links=await page.locator('a[href]').evaluateAll(els=>[...new Set(els.map(a=>a.href).filter(Boolean))]);
  const categoryRe=/\/category\/([0-9a-f-]{20,})/i;
  for(const href of out.links){const m=href.match(categoryRe);if(m)out.categories.push({id:m[1],href});}
  out.categories=[...new Map(out.categories.map(x=>[x.id,x])).values()];
  const bodyText=await page.locator('body').innerText().catch(()=> '');
  out.bodyHints=bodyText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>/%|할인|세일|특가|혜택|게임/i.test(s)).slice(0,240);
  out.finalUrl=page.url();
  console.log('Deals inspect summary',JSON.stringify({status:out.status,finalUrl:out.finalUrl,categories:out.categories.length,graphql:out.graphql.map(x=>({operationName:x.operationName,variables:x.variables,hash:x.hash,status:x.status,topKeys:Object.keys(x.body?.data||{})}))},null,2));
} finally {await browser.close();}
await fs.writeFile('ps-radar/data/deals-inspect.json',JSON.stringify(out,null,2)+'\n','utf8');
