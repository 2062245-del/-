import fs from 'node:fs/promises';
const root='ps-radar/data/';
const read=async n=>JSON.parse(await fs.readFile(root+n,'utf8'));
const [catalog,store,deals,meta]=await Promise.all(['catalog-auto.json','store-auto.json','deals-auto.json','game-info-v229.json'].map(read));
const metaById=new Map(meta.items.map(x=>[x.id,x]));
const stores=new Map(store.items.map(x=>[String(x.conceptId),x]));
const excluded=/(체험판|demo\b|trial\b|시즌\s*패스|season\s*pass|사운드트랙|soundtrack|스킨|skin\b|의상|costume|코인|coins?\b|포인트|points?\b|게임머니|virtual currency|아바타|avatar)/i;
const approved=new Map();const reject={platform:0,type:0,price:0,rating:0,unknown:0};
function add(g,kind){
 if(!g.productId?.includes('PPSA')){reject.platform++;return;}
 if(excluded.test(g.title)||!['base','edition','expansion'].includes(kind)){reject.type++;return;}
 if(!(g.currentPrice>0)){reject.price++;return;}
 if(!(g.rating>=4&&g.ratingCount>=500)){reject.rating++;return;}
 if(!g.releaseDate){reject.unknown++;return;}
 const release=Date.parse(g.releaseDate);if(!Number.isFinite(release)||release>Date.now()){reject.unknown++;return;}
 const item={...g,kind,platform:['PS5'],currentPrice:Number(g.currentPrice),originalPrice:Number(g.originalPrice||g.currentPrice),discountPercent:Number(g.discountPercent)||0,genre:g.genre||[],catalogGroupId:g.conceptId?'concept:'+g.conceptId:'product:'+g.productId,releasedConfirmed:true};
 approved.set(g.productId,item);
}
for(const c of catalog.items){const s=stores.get(String(c.conceptId));if(!s||s.marketStatus!=='available-kr')continue;add({...c,...s,title:s.storeProductName||c.title,image:c.image,releaseDate:c.releaseDate,genre:c.genre},'base');}
for(const d of deals.items){const m=metaById.get(d.id);if(!m)continue;
 const kind=m.topCategory==='GAME'&&['FULL_GAME','GAME_BUNDLE'].includes(m.classification)?'base':m.topCategory==='GAME'&&m.classification==='PREMIUM_EDITION'?'edition':m.topCategory==='ADD_ON'&&m.classification==='LEVEL'?'expansion':'unknown';
 add({...d,productId:m.productId,releaseDate:m.releaseDate,rating:m.rating,ratingCount:m.ratingCount,genre:m.genres,classification:m.classification,fetchedAt:d.fetchedAt||deals.generatedAt,saleEndsAt:m.saleEndsAt||d.saleEndsAt},kind);
}
const items=[...approved.values()];
const out={generatedAt:new Date().toISOString(),source:'existing-official-store-data',coverage:'partial-plus-catalog-and-discount-products',policy:{ps5:true,minRating:4,minRatingCount:500,include:['base','edition','expansion'],unclassified:'excluded'},health:{safeToMerge:items.length>=100,itemCount:items.length,normalPrice:items.filter(x=>!x.discountPercent).length,discounted:items.filter(x=>x.discountPercent>0).length,expansions:items.filter(x=>x.kind==='expansion').length,rejected:reject},items};
if(!out.health.safeToMerge)throw new Error('Catalog safety threshold failed');
await fs.writeFile(root+'catalog-curated-v231.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out.health));
