import fs from 'node:fs/promises';
const file='ps-radar/data/store-catalog-v232.json',d=JSON.parse(await fs.readFile(file,'utf8'));
const nonGame=/(체험판|demo\b|trial\b|시즌\s*패스|season\s*pass|사운드트랙|soundtrack|스킨|skin\b|의상|costume|코인|coins?\b|포인트|points?\b|아바타|avatar|크레디트|가상\s*통화|currency|art.?book|아트북|오피셜\s*북|컴필레이션\s*앨범|디지털\s*앨범|디지털\s*아트|\bOST\b)/i;
const packIntent=/(확장|DLC|에피소드|Episode|챕터|Chapter|미션|Mission|캠페인|Campaign|Power Pack|Twin|Season\s*\d+|시즌\s*\d+|Ragnarok|라그나로크|Overture|오버추어)/i;
const rejected=[];
function accept(g){
 let reason=null;
 if(nonGame.test(g.title))reason='non-game-title';
 else if(g.kind!=='expansion'&&/업그레이드|upgrade\b/i.test(g.title))reason='upgrade-requires-existing-game';
 else if(g.kind==='expansion'&&g.expansionEvidence==='official-ADD_ON_PACK-gameplay-description'&&!packIntent.test(g.title))reason='ambiguous-pack-manual-review';
 if(reason){rejected.push({productId:g.productId,title:g.title,reason});return false;}
 g.title=String(g.title||'').replace(/\s*\((?:한국어|영어|일본어|중국어)[\s\S]*\)\s*$/,'').trim();
 return true;
}
d.items=d.items.filter(accept);d.upcoming=d.upcoming.filter(accept);
d.policy.productGate='official-classification-plus-content-intent; ambiguous-packs-excluded';
d.productGateReview=rejected;d.health.itemCount=d.items.length;d.health.upcomingCount=d.upcoming.length;d.health.normalPrice=d.items.filter(x=>!x.discountPercent).length;d.health.expansions=d.items.filter(x=>x.kind==='expansion').length;d.health.productGateRejected=rejected.length;
await fs.writeFile(file,JSON.stringify(d,null,2)+'\n');
console.log('PRODUCT_GATE',JSON.stringify(d.health));
