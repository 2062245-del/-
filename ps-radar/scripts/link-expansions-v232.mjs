import fs from 'node:fs/promises';
import {callOfficial,actualPurchasePrice} from './store-api-v232.mjs';
const file='ps-radar/data/store-catalog-v232.json';
const data=JSON.parse(await fs.readFile(file,'utf8'));if(!data.health?.safeToMerge)throw new Error('Unsafe catalog');
const excluded=/(체험판|demo\b|trial\b|시즌\s*패스|season\s*pass|사운드트랙|soundtrack|스킨|skin\b|의상|costume|코인|coins?\b|포인트|points?\b|아바타|avatar|크레디트|가상\s*통화|currency|token|v-bucks)/i;
const bases=[...new Map(data.items.filter(x=>x.kind==='base'&&!x.comparisonOnly).map(x=>[x.conceptId,x])).values()];
async function htmlCache(id){
 const r=await fetch('https://store.playstation.com/ko-kr/product/'+id,{headers:{'accept-language':'ko-KR'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('HTML HTTP '+r.status);
 const html=await r.text(),next=JSON.parse(html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]||'{}');const cache={},addonIds=[];
 for(const [name,b] of Object.entries(next.props?.pageProps?.batarangs||{}))for(const m of String(b.text||'').matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)){
  try{const j=JSON.parse(m[1]);for(const [k,v] of Object.entries(j.cache||{}))cache[k]={...cache[k],...v};
   if(name==='add-ons')for(const v of Object.values(j.cache?.ROOT_QUERY||{}))for(const x of v?.addOnProducts||[])if(x.__ref?.startsWith('Product:'))addonIds.push(x.__ref.slice(8));
  }catch{}
 }
 return {cache,addonIds:[...new Set(addonIds)]};
}
const additions=[],failures=[],pending=[];let cursor=0;
await Promise.all(Array.from({length:5},async()=>{while(true){const i=cursor++;if(i>=bases.length)return;const base=bases[i];try{
 const {cache,addonIds}=await htmlCache(base.productId);
 for(const pid of addonIds){
  const tile=cache['Product:'+pid];if(!pid.includes('PPSA')||excluded.test(tile?.name||''))continue;
  const own=await htmlCache(pid),p=own.cache['Product:'+pid];if(!p||p.topCategory!=='ADD_ON')continue;
  const description=(p.descriptions||[]).map(x=>x.value||'').join(' ');
  const level=p.storeDisplayClassification==='LEVEL';
  const pack=p.storeDisplayClassification==='ADD_ON_PACK'&&/(확장팩|확장\s*콘텐츠|스토리\s*DLC|캠페인|(?:새로운|신규|추가).{0,45}(?:스토리|지역|퀘스트|미션|레이스|보스))/i.test(description);
  if(!level&&!pack){pending.push({productId:pid,parent:base.conceptId,title:p.name,classification:p.storeDisplayClassification});continue;}
  const price=actualPurchasePrice((await callOfficial('productPrice',pid,2)).data?.productRetrieve);if(!(price.currentPrice>0))continue;
  const releaseDate=p.releaseDate;if(!Number.isFinite(Date.parse(releaseDate)))continue;
  const future=Date.parse(releaseDate)>Date.now();
  const item={...base,id:'store-'+pid,productId:pid,title:p.name.replace(/\s*\([^)]*(한국어|영어|중국어|일본어)[^)]*\)\s*$/,'').trim(),store:'https://store.playstation.com/ko-kr/product/'+pid,image:p.media?.find(x=>x.role==='EDITION_KEY_ART')?.url||tile.boxArt?.url||base.image,platform:p.platforms||['PS5'],kind:'expansion',edition:null,releaseDate,upcoming:future,releasedConfirmed:!future,rating:Number(p.starRating?.averageRating)||null,ratingCount:Number(p.starRating?.totalRatingsCount)||0,selectionEvidence:'qualified-parent-game',expansionEvidence:level?'official-LEVEL':'official-ADD_ON_PACK-gameplay-description',...price,saleEndsAt:price.saleEndsAt?new Date(Number(price.saleEndsAt)||price.saleEndsAt).toISOString():null,fetchedAt:new Date().toISOString()};
  additions.push(item);data.links[base.conceptId]=[...new Set([...(data.links[base.conceptId]||[]),pid])];
 }
 }catch(e){failures.push({productId:base.productId,error:String(e.message)});}if((i+1)%100===0)console.log('EXPANSIONS',i+1,bases.length,additions.length,failures.length);}}));
if(failures.length>bases.length*.2)throw new Error('Expansion linking failed safety threshold');
data.items=[...new Map([...data.items,...additions.filter(x=>!x.upcoming)].map(x=>[x.productId,x])).values()];
data.upcoming=[...new Map([...data.upcoming,...additions.filter(x=>x.upcoming)].map(x=>[x.productId,x])).values()];
data.health.itemCount=data.items.length;data.health.expansions=data.items.filter(x=>x.kind==='expansion').length;
data.health.expansionParentsChecked=bases.length-failures.length;data.expansionCoverage='official-product-add-ons-cache-first-48';data.expansionReview=pending;data.expansionFailures=failures;
await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');console.log('LINKED',data.health.expansions,'expansions');
