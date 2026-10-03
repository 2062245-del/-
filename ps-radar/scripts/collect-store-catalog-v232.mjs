import {mergeUpcoming} from './catalog-release-policy-v232.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {callOfficial,actualPurchasePrice} from './store-api-v232.mjs';
const root='ps-radar/data/', now=new Date().toISOString();
const read=async(n,f={items:[]})=>{try{return JSON.parse(await fs.readFile(root+n,'utf8'));}catch{return f;}};
const previous=await read('store-catalog-v232.json');
const meta=await read('game-info-v229.json');
const known=new Map(meta.items.map(x=>[x.productId,x]));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul'});
const page=await context.newPage();
await page.goto('https://store.playstation.com/ko-kr/pages/browse',{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('.psw-product-tile',{timeout:60000});
await page.getByRole('button',{name:'정렬 및 필터 옵션',exact:false}).click();
const platformButton=page.getByRole('button',{name:/플랫폼에 대한 필터링/});
const ps5=page.locator('[id="targetPlatforms:PS5"]');
if(!await ps5.isVisible())await platformButton.click();
await ps5.click();
await page.waitForFunction(()=>document.querySelector('[id="targetPlatforms:PS5"]')?.getAttribute('aria-pressed')==='true');
await page.waitForTimeout(1200);
await page.waitForFunction(()=>/\d[\d,]*개의\s*결과/.test(document.body.innerText)&&document.querySelectorAll('.psw-product-tile').length>0,null,{timeout:60000});
const discovered=new Map();let total=0,pages=0;
while(true){
 const data=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('.psw-product-tile')].map(tile=>{const a=tile.querySelector('a[href*="/concept/"]');if(!a)return null;const img=tile.querySelector('img');return {conceptId:a.href.split('/').pop(),title:a.textContent.trim(),store:a.href,image:img?.currentSrc||img?.src||null,listingText:tile.innerText};}).filter(Boolean);
  const match=document.body.innerText.match(/(?:총\s*|\/)([\d,]+)개의\s*결과/);return {rows,total:match?Number(match[1].replaceAll(',','')):0};
 });
 if(!data.rows.length)throw new Error('Empty listing page; previous dataset preserved');
 total=data.total||total;pages++;for(const x of data.rows)discovered.set(x.conceptId,x);
 console.log('SCAN',pages,discovered.size,total);
 const next=page.getByRole('button',{name:'다음 페이지로 가기',exact:true});
 if(!await next.isEnabled())break;
 const first=data.rows[0].conceptId;await next.click();
 await page.waitForFunction(first=>{const a=document.querySelector('.psw-product-tile a[href*="/concept/"]');return a&&!a.href.endsWith('/'+first);},first,{timeout:60000});
 if(pages>500)throw new Error('Pagination limit exceeded');
}
await browser.close();
if(!(total>0)||discovered.size<total*.95)throw new Error(`Incomplete scan ${discovered.size}/${total}`);
await fs.writeFile(root+'store-discovery-v232.json',JSON.stringify({generatedAt:now,health:{safeToMerge:true,itemCount:discovered.size,total,pages},items:[...discovered.values()]},null,2)+'\n');
const pool=[...discovered.values()],products=[],upcoming=[],links={},failures=[];let cursor=0;
const excluded=/(체험판|demo\b|trial\b|시즌\s*패스|season\s*pass|사운드트랙|soundtrack|스킨|skin\b|의상|costume|코인|coins?\b|포인트|points?\b|아바타|avatar)/i;
const publisherAllow=/(Sony|SIE|Ubisoft|Rockstar|Take.Two|2K|Electronic Arts|EA Swiss|Bandai|CAPCOM|Square Enix|SEGA|KONAMI|Bethesda|Microsoft|Warner|NEXON|Pearl Abyss|Remedy|505 Games|Focus|Devolver|Supergiant|Team17|THQ|Koei|KOEI|CD PROJEKT|Deep Silver|Neowiz|NEOWIZ|Shin'en|Arc System)/i;
async function details(pid){
 const cached=known.get(pid);if(cached?.classification&&cached?.topCategory)return cached;
 const r=await fetch('https://store.playstation.com/ko-kr/product/'+pid,{headers:{'accept-language':'ko-KR'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Product HTML HTTP '+r.status);
 const html=await r.text();const next=JSON.parse(html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]||'{}');const p={};
 for(const b of Object.values(next.props?.pageProps?.batarangs||{}))for(const m of String(b.text||'').matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)){try{const j=JSON.parse(m[1]);Object.assign(p,j.cache?.['Product:'+pid]||{});}catch{}}
 return {classification:p.storeDisplayClassification,topCategory:p.topCategory,publisher:p.publisherName||p.publisher,releaseDate:p.releaseDate,genres:(p.localizedGenres||[]).map(x=>x.value),platforms:p.platforms,edition:p.edition?.name};
}
async function processConcept(row){
 const ratingResult=await callOfficial('rating',row.conceptId,2);const rp=ratingResult.data?.conceptRetrieve?.defaultProduct;const star=rp?.starRating;
 const rating=Number(star?.averageRating)||null,count=Number(star?.totalRatingsCount)||0;
 const qualified=(rating>=4&&count>=500)||(previous.upcoming||[]).some(x=>x.conceptId===row.conceptId);
 // The price query supplies official release date and all exact product relationships.
 const j=await callOfficial('price',row.conceptId,2);const c=j.data?.conceptRetrieve;if(!c)throw new Error('No concept');
 const release=c.releaseDate?.value;const future=Number.isFinite(Date.parse(release))&&Date.parse(release)>Date.now();
 links[row.conceptId]=(c.products||[]).map(x=>x.id);
 if(!qualified&&!future)return;
 const editions=await callOfficial('editions',row.conceptId,2);const selections=editions.data?.editionSelectionsRetrieveByConceptId||[];const es=selections.length?selections:(c.products||[]);
 for(const e of es){
  if(!/(PPSA|CUSA)/.test(e.id)||excluded.test(e.name||''))continue;
  const p=(await callOfficial('productPrice',e.id,2)).data?.productRetrieve;if(!p)continue;
  const price=actualPurchasePrice(p);if(!(price.currentPrice>0))continue;
  const m=await details(e.id);const kind=m.topCategory==='GAME'&&['FULL_GAME','GAME_BUNDLE'].includes(m.classification)?'base':m.topCategory==='GAME'&&m.classification==='PREMIUM_EDITION'?'edition':m.topCategory==='ADD_ON'&&m.classification==='LEVEL'?'expansion':null;
  if(!kind)continue;
  const pre=p.webctas?.some(x=>/PRE.?ORDER/i.test(x.type||x.action?.type||''));
  const date=m.releaseDate||release;if(!Number.isFinite(Date.parse(date)))continue;
  const isFuture=Date.parse(date)>Date.now();if(isFuture&&!(qualified||publisherAllow.test(m.publisher||'')))continue;
  const cart=p.webctas?.some(x=>x.type==='ADD_TO_CART'&&x.price&&!x.price.isTiedToSubscription);
  if(!isFuture&&(!qualified||pre||!cart))continue;
  const item={id:'store-'+e.id,productId:e.id,conceptId:row.conceptId,catalogGroupId:'concept:'+row.conceptId,title:e.name.replace(/\s*\((?:한국어|영어|일본어|중국어)[\s\S]*\)\s*$/,'').trim(),groupTitle:row.title,image:row.image,store:'https://store.playstation.com/ko-kr/product/'+e.id,platform:m.platforms?.length?m.platforms:[e.id.includes('PPSA')?'PS5':'PS4'],comparisonOnly:!e.id.includes('PPSA'),genre:m.genres||[],ko:/한국어/.test(e.name),kind,edition:e.edition?.name||m.edition||null,publisher:m.publisher||null,releaseDate:date,rating,ratingCount:count,...price,saleEndsAt:price.saleEndsAt?new Date(Number(price.saleEndsAt)||price.saleEndsAt).toISOString():null,fetchedAt:now,upcoming:isFuture,releasedConfirmed:!isFuture&&cart&&!pre,releaseEvidence:!isFuture?'official-add-to-cart-and-release-date':'official-future-release-date',source:'playstation-store-official-graphql'};
  (isFuture?upcoming:products).push(item);
 }
}
await Promise.all(Array.from({length:8},async()=>{while(true){const i=cursor++;if(i>=pool.length)return;try{await processConcept(pool[i]);}catch(e){failures.push({conceptId:pool[i].conceptId,error:String(e.message)});}if((i+1)%100===0)console.log('ENRICH',i+1,pool.length,products.length,upcoming.length,failures.length);}}));
const unique=a=>[...new Map(a.map(x=>[x.productId,x])).values()];const items=unique(products),futureItems=mergeUpcoming(previous.upcoming||[],unique(upcoming),items);
if(failures.length>pool.length*.1||items.length<100)throw new Error(`Enrichment unsafe: ${items.length} products, ${failures.length} failures`);
const payload={generatedAt:now,source:'playstation-store-all-ps5',coverage:'complete-discovery-filtered-enrichment',policy:{minRating:4,minRatingCount:500,upcoming:'established-publisher-or-qualified-rating'},health:{safeToMerge:true,discovered:pool.length,pages,total,completeDiscovery:true,itemCount:items.length,upcomingCount:futureItems.length,failures:failures.length,normalPrice:items.filter(x=>!x.discountPercent).length},links,failures,items,upcoming:futureItems};
await fs.writeFile(root+'store-catalog-v232.json',JSON.stringify(payload,null,2)+'\n');console.log('COMPLETE',JSON.stringify(payload.health));
