import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const samples=[{
  id:'gt7-ps5',
  title:'그란 투리스모 7',
  conceptId:10000956,
  productId:'HP9000-PPSA01318_00-GT7STD0000000PS5',
  store:'https://store.playstation.com/ko-kr/product/HP9000-PPSA01318_00-GT7STD0000000PS5/'
}];
const out={generatedAt:new Date().toISOString(),samples:[]};

function collectPaths(value,path='',out=[]){
  if(out.length>900)return out;
  if(value==null)return out;
  if(Array.isArray(value)){
    value.slice(0,8).forEach((v,i)=>collectPaths(v,`${path}[${i}]`,out));
    return out;
  }
  if(typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      const p=path?`${path}.${k}`:k;
      if(/release|publisher|genre|platform|description|voice|language|player|online|vr|dual|feature|edition|classification|category|age|rating|media|name|display|sku|concept|product/i.test(k)){
        if(v==null||['string','number','boolean'].includes(typeof v))out.push({path:p,value:v});
        else if(Array.isArray(v)&&v.every(x=>x==null||['string','number','boolean'].includes(typeof x)))out.push({path:p,value:v.slice(0,20)});
      }
      collectPaths(v,p,out);
    }
  }
  return out;
}

const browser=await chromium.launch({headless:true});
try{
  for(const game of samples){
    const page=await browser.newPage({locale:'ko-KR',viewport:{width:1440,height:1200},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
    const network=[];
    page.on('response',async res=>{
      const req=res.request(); const url=res.url(); const type=req.resourceType();
      if(!['xhr','fetch'].includes(type))return;
      if(!/playstation|graphql|api\//i.test(url))return;
      if(network.length>=240)return;
      let body='',requestHeaders={},json=null;
      try{requestHeaders=await req.allHeaders();}catch{}
      try{
        const ct=res.headers()['content-type']||'';
        if(/json/.test(ct)){json=await res.json();body=JSON.stringify(json).slice(0,12000);}
        else if(/text/.test(ct))body=(await res.text()).slice(0,12000);
      }catch{}
      const safeHeaders=Object.fromEntries(Object.entries(requestHeaders).filter(([k])=>!['cookie','authorization'].includes(k.toLowerCase())));
      let op=null,vars=null,hash=null;
      try{
        const u=new URL(url); op=u.searchParams.get('operationName'); vars=u.searchParams.get('variables');
        const ext=JSON.parse(u.searchParams.get('extensions')||'{}'); hash=ext?.persistedQuery?.sha256Hash||null;
      }catch{}
      const metaPaths=json?collectPaths(json).slice(0,500):[];
      network.push({status:res.status(),type,method:req.method(),operationName:op,variables:vars,sha256Hash:hash,url,postData:(req.postData()||'').slice(0,8000),requestHeaders:safeHeaders,body,metaPaths});
    });
    let status=null, finalUrl=game.store;
    try{
      const res=await page.goto(game.store,{waitUntil:'domcontentloaded',timeout:90000}); status=res?.status()||null;
      await page.waitForTimeout(10000); finalUrl=page.url();
    }catch(err){network.push({error:String(err)});}
    const bodyText=await page.locator('body').innerText().catch(()=> '');
    const ld=await page.locator('script[type="application/ld+json"]').allTextContents().catch(()=>[]);
    const next=await page.locator('#__NEXT_DATA__').textContent().catch(()=>null);
    const interesting=bodyText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>/평점|별점|가격|원|언어|한국어|스크린|음성|플레이어|온라인|PS Plus|출시|발매|퍼블리셔|장르|에디션|VR|DualSense|등급|이용가/i.test(s)).slice(0,420);
    const graphql=network.filter(x=>/graphql\/v1\/op/i.test(x.url||''));
    const operations=[...new Map(graphql.filter(x=>x.operationName).map(x=>[x.operationName,{operationName:x.operationName,sha256Hash:x.sha256Hash,variables:x.variables,status:x.status,body:x.body?.slice(0,8000),metaPaths:x.metaPaths||[]}])).values()];
    console.log('PS Store metadata ops',JSON.stringify({title:game.title,status,finalUrl,operations:operations.map(x=>({operationName:x.operationName,sha256Hash:x.sha256Hash,variables:x.variables,status:x.status,metaPaths:x.metaPaths.filter(p=>/release|publisher|genre|platform|description|voice|language|player|online|vr|feature|edition|classification|category/i.test(p.path)).slice(0,120)}))},null,2));
    out.samples.push({id:game.id,title:game.title,conceptId:game.conceptId,productId:game.productId,status,finalUrl,interesting,operations,ld:ld.map(x=>x.slice(0,30000)),next:next?.slice(0,50000)||null});
    await page.close();
  }
} finally {await browser.close();}
await fs.writeFile('ps-radar/data/store-profile-inspect.json',JSON.stringify(out,null,2)+'\n');
console.log(`inspected ${out.samples.length} PS Store page`);
