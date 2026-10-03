import fs from 'node:fs/promises';
import {callOfficial,actualPurchasePrice} from './store-api-v232.mjs';
const file='ps-radar/data/store-catalog-v232.json',data=JSON.parse(await fs.readFile(file,'utf8'));
const discovery=JSON.parse(await fs.readFile('ps-radar/data/store-discovery-v232.json','utf8'));
const published=new Set(data.items.filter(x=>x.releasedConfirmed).map(x=>x.conceptId));
const wasUpcoming=new Set((data.upcoming||[]).filter(x=>x.kind!=='expansion').map(x=>x.conceptId));
const pool=discovery.items.filter(x=>!published.has(x.conceptId)||wasUpcoming.has(x.conceptId));
const publisherAllow=/(Sony|SIE|Ubisoft|Rockstar|Take.Two|2K|Electronic Arts|EA Swiss|Bandai|CAPCOM|Square Enix|SEGA|KONAMI|Bethesda|Microsoft|Warner|NEXON|Pearl Abyss|Remedy|505 Games|Focus|Devolver|Supergiant|Team17|THQ|Koei|KOEI|CD PROJEKT|Deep Silver|Neowiz|NEOWIZ|Arc System|Marvel)/i;
const excluded=/(체험판|demo\b|trial\b|시즌\s*패스|season\s*pass|사운드트랙|soundtrack|스킨|skin\b|의상|costume|코인|coins?\b|포인트|points?\b|아바타|avatar)/i;
const items=[],released=[],failures=[];let cursor=0;
async function metadata(pid){
 const r=await fetch('https://store.playstation.com/ko-kr/product/'+pid,{headers:{'accept-language':'ko-KR'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('HTML HTTP '+r.status);
 const h=await r.text(),j=JSON.parse(h.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]||'{}');const p={};
 for(const b of Object.values(j.props?.pageProps?.batarangs||{}))for(const m of String(b.text||'').matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)){try{Object.assign(p,JSON.parse(m[1]).cache?.['Product:'+pid]||{});}catch{}}
 return p;
}
await Promise.all(Array.from({length:8},async()=>{while(true){const i=cursor++;if(i>=pool.length)return;const row=pool[i];try{
 const c=(await callOfficial('price',row.conceptId,2)).data?.conceptRetrieve;if(!c)throw new Error('Missing concept');
 const date=c.releaseDate?.value,preorder=c.defaultProduct?.webctas?.some(x=>/PRE.?ORDER/i.test(x.type||''));
 const future=Date.parse(date)>Date.now();if(!future&&!preorder&&!wasUpcoming.has(row.conceptId))continue;
 // Upcoming concepts return no editionSelections; use the official concept product list.
 for(const e of c.products||[]){
  if(!e.id.includes('PPSA')||excluded.test(e.name||''))continue;
  const p=await metadata(e.id);if(p.topCategory!=='GAME'||!['FULL_GAME','GAME_BUNDLE','PREMIUM_EDITION'].includes(p.storeDisplayClassification)||!publisherAllow.test(p.publisherName||''))continue;
  const releaseDate=p.releaseDate||date;if(!Number.isFinite(Date.parse(releaseDate)))continue;
  const live=(await callOfficial('productPrice',e.id,2)).data?.productRetrieve,price=actualPurchasePrice(live);if(!(price.currentPrice>0))continue;
  const isFuture=Date.parse(releaseDate)>Date.now(),isPreorder=live?.webctas?.some(x=>/PRE.?ORDER/i.test(x.type||'')),cart=live?.webctas?.some(x=>x.type==='ADD_TO_CART'&&x.price&&!x.price.isTiedToSubscription);
  if(!isFuture&&(!wasUpcoming.has(row.conceptId)||isPreorder||!cart))continue;
  const item={id:'store-'+e.id,productId:e.id,conceptId:row.conceptId,catalogGroupId:'concept:'+row.conceptId,title:e.name.replace(/\s*\((?:한국어|영어|일본어|중국어)[\s\S]*\)\s*$/,'').trim(),groupTitle:row.title,image:p.media?.find(x=>x.role==='EDITION_KEY_ART')?.url||row.image,store:'https://store.playstation.com/ko-kr/product/'+e.id,platform:p.platforms||['PS5'],genre:(p.localizedGenres||[]).map(x=>x.value),ko:/한국어/.test(e.name),kind:p.storeDisplayClassification==='PREMIUM_EDITION'?'edition':'base',edition:p.edition?.name||null,publisher:p.publisherName,releaseDate,rating:Number(p.starRating?.averageRating)||null,ratingCount:Number(p.starRating?.totalRatingsCount)||0,...price,saleEndsAt:price.saleEndsAt?new Date(Number(price.saleEndsAt)||price.saleEndsAt).toISOString():null,fetchedAt:new Date().toISOString(),upcoming:isFuture,releasedConfirmed:!isFuture&&cart&&!isPreorder,selectionEvidence:'established-publisher-upcoming',releaseEvidence:isFuture?'official-future-release-date':'official-release-date-and-add-to-cart'};
  (isFuture?items:released).push(item);data.links[row.conceptId]=[...new Set([...(data.links[row.conceptId]||[]),e.id])];
 }
 }catch(e){failures.push({conceptId:row.conceptId,error:String(e.message)});}if((i+1)%200===0)console.log('UPCOMING_CHECK',i+1,pool.length,items.length,failures.length);}}));
if(failures.length>pool.length*.1)throw new Error('Upcoming scan failure threshold');
data.upcoming=[...new Map([...items,...(data.upcoming||[]).filter(x=>x.kind==='expansion')].map(x=>[x.productId,x])).values()];
data.items=[...new Map([...data.items,...released].map(x=>[x.productId,x])).values()];data.health.upcomingCount=data.upcoming.length;data.health.itemCount=data.items.length;data.health.upcomingConceptsChecked=pool.length;data.upcomingFailures=failures;
await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('UPCOMING_COMPLETE',data.upcoming.length,'products',new Set(data.upcoming.map(x=>x.conceptId)).size,'games');
