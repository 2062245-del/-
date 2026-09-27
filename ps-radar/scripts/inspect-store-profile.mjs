import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const catalog=JSON.parse(await fs.readFile('ps-radar/data/catalog-auto.json','utf8'));
const samples=(catalog.items||[]).filter(x=>x.store).slice(0,1);
const out={generatedAt:new Date().toISOString(),samples:[]};
const browser=await chromium.launch({headless:true});
try{
  for(const game of samples){
    const page=await browser.newPage({locale:'ko-KR',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'});
    const network=[];
    page.on('response',async res=>{
      const req=res.request(); const url=res.url(); const type=req.resourceType();
      if(!['xhr','fetch'].includes(type))return;
      if(!/playstation|graphql|api\//i.test(url))return;
      if(network.length>=160)return;
      let body='';
      try{const ct=res.headers()['content-type']||'';if(/json|text/.test(ct))body=(await res.text()).slice(0,16000);}catch{}
      network.push({status:res.status(),type,method:req.method(),url,postData:(req.postData()||'').slice(0,8000),body});
    });
    let status=null, finalUrl=game.store;
    try{
      const res=await page.goto(game.store,{waitUntil:'domcontentloaded',timeout:90000}); status=res?.status()||null;
      await page.waitForTimeout(8000); finalUrl=page.url();
    }catch(err){network.push({error:String(err)});}
    const bodyText=await page.locator('body').innerText().catch(()=> '');
    const ld=await page.locator('script[type="application/ld+json"]').allTextContents().catch(()=>[]);
    const next=await page.locator('#__NEXT_DATA__').textContent().catch(()=>null);
    const interesting=bodyText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).filter(s=>/평점|별점|가격|원|언어|한국어|스크린|음성|플레이어|온라인|PS Plus|출시|발매|퍼블리셔|장르/i.test(s)).slice(0,220);
    const graphql=network.filter(x=>/graphql\/v1\/op/i.test(x.url||''));
    console.log('PS Store sample',JSON.stringify({title:game.title,conceptId:game.conceptId,status,finalUrl,graphqlCalls:graphql.map(x=>({status:x.status,method:x.method,url:x.url,postData:x.postData,body:x.body?.slice(0,1200)}))},null,2));
    out.samples.push({id:game.id,title:game.title,conceptId:game.conceptId,productId:game.productId,status,finalUrl,interesting,ld:ld.map(x=>x.slice(0,20000)),next:next?.slice(0,30000)||null,network});
    await page.close();
  }
} finally {await browser.close();}
await fs.writeFile('ps-radar/data/store-profile-inspect.json',JSON.stringify(out,null,2)+'\n');
console.log(`inspected ${out.samples.length} PS Store page`);
