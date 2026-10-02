import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const DEALS_FILE='ps-radar/data/deals-auto.json';
const HISTORY_FILE='ps-radar/data/deal-history.json';
const TRENDS_FILE='ps-radar/data/deal-trends.json';
const REPORT_FILE='ps-radar/data/git-history-backfill-report.json';
const MAX_TIMELINE=96;
const PRICE_TOLERANCE=2.5;

const cleanUrl=value=>{try{const u=new URL(value);u.search='';u.hash='';return u.href.replace(/\/$/,'')}catch{return String(value||'').split('?')[0].replace(/\/$/,'')}};
const titleKey=value=>String(value||'').toLowerCase().replace(/\([^)]*(?:한국어|영어|일본어|중국어|korean|english|japanese|chinese)[^)]*\)/gi,' ').replace(/\b(?:ps4|ps5)\b|[™®]/gi,' ').replace(/[^a-z0-9가-힣]+/g,'');
const historyKey=item=>cleanUrl(item?.store)||`title:${titleKey(item?.title)||item?.id||'unknown'}`;
const validPrice=item=>{if(String(item?.priceStatus||'').startsWith('rejected'))return false;const c=Number(item?.currentPrice),o=Number(item?.originalPrice),d=Number(item?.discountPercent);return c>0&&o>c&&d>0&&d<100&&Math.abs((1-c/o)*100-d)<=PRICE_TOLERANCE};
const daysBetween=(a,b)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.round((y-x)/86400000)):null};
const median=arr=>{const x=arr.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!x.length)return null;const m=Math.floor(x.length/2);return x.length%2?x[m]:Math.round((x[m-1]+x[m])/2)};

function normalizePoint(x){
 if(!x?.at)return null;
 return {at:String(x.at),active:x.active!==false,...(Number.isFinite(Number(x.price))?{price:Number(x.price)}:{}),...(Number.isFinite(Number(x.originalPrice))?{originalPrice:Number(x.originalPrice)}:{}),...(Number.isFinite(Number(x.discount))?{discount:Number(x.discount)}:{}),...(x.saleEndsAt?{saleEndsAt:String(x.saleEndsAt)}:{}),...(x.source?{source:String(x.source)}:{})};
}
function compactTimeline(points){
 const sorted=points.map(normalizePoint).filter(Boolean).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const out=[];
 for(const p of sorted){
  const last=out.at(-1);
  const same=last&&last.active===p.active&&(!p.active||(Number(last.price)===Number(p.price)&&Number(last.originalPrice)===Number(p.originalPrice)&&Number(last.discount)===Number(p.discount)));
  if(same){if(String(p.at)>String(last.at)&&p.saleEndsAt)last.saleEndsAt=p.saleEndsAt;continue;}
  out.push(p);
 }
 return out.slice(-MAX_TIMELINE);
}
function cycleStats(timeline){
 const starts=[];const cycles=[];let current=null,prevActive=false;
 for(const s of timeline){
  if(s.active){if(!prevActive){current={startAt:s.at,points:[]};cycles.push(current);starts.push(s.at)}current?.points.push(s)}else current=null;
  prevActive=!!s.active;
 }
 const activePoints=timeline.filter(x=>x.active&&Number(x.price)>0);
 const currentCycle=timeline.at(-1)?.active?cycles.at(-1):null;
 const previousCycle=currentCycle?cycles.at(-2):cycles.at(-1);
 const gaps=[];for(let i=1;i<starts.length;i++){const d=daysBetween(starts[i-1],starts[i]);if(Number.isFinite(d))gaps.push(d)}
 const best=cyc=>cyc?.points?.length?{price:Math.min(...cyc.points.map(x=>Number(x.price)).filter(Number.isFinite)),discount:Math.max(...cyc.points.map(x=>Number(x.discount)).filter(Number.isFinite))}:null;
 const recentBest=cycles.slice(-4).map(best).filter(Boolean);
 let direction='insufficient';if(recentBest.length>=3){const ds=recentBest.map(x=>x.discount);const diff=ds.at(-1)-ds[0];direction=diff>=10?'improving':diff<=-10?'weakening':'flat'}
 return {changePoints:timeline.length,saleCycles:cycles.length,averageGapDays:gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null,medianDiscount:median(activePoints.map(x=>Number(x.discount))),medianSalePrice:median(activePoints.map(x=>Number(x.price))),currentCycleStartedAt:currentCycle?.startAt||null,previousCycleBestPrice:best(previousCycle)?.price??null,previousCycleBestDiscount:best(previousCycle)?.discount??null,recentDirection:direction,recentCycleBest:recentBest};
}
function git(args){return execFileSync('git',args,{encoding:'utf8',maxBuffer:1024*1024*120}).trim()}

const currentDeals=JSON.parse(await fs.readFile(DEALS_FILE,'utf8'));
const history=JSON.parse(await fs.readFile(HISTORY_FILE,'utf8'));
if(!Array.isArray(currentDeals?.items)||!history?.items)throw new Error('current PS Radar data missing');

const lines=git(['log','--reverse','--format=%H|%cI','--',DEALS_FILE]).split(/\r?\n/).filter(Boolean);
const commits=lines.map(line=>{const i=line.indexOf('|');return{sha:line.slice(0,i),commitAt:line.slice(i+1)}});
const snapshots=[];
for(const c of commits){
 try{
  const raw=git(['show',`${c.sha}:${DEALS_FILE}`]);
  const j=JSON.parse(raw);if(!Array.isArray(j?.items))continue;
  const at=j.generatedAt||c.commitAt;
  const valid=j.items.filter(validPrice);
  snapshots.push({sha:c.sha,at,items:j.items,valid,safe:j?.health?.safeToMerge===true&&valid.length>=1000});
 }catch(e){console.warn('skip snapshot',c.sha,String(e).slice(0,180))}
}
if(!snapshots.length)throw new Error('no historical deal snapshots found in git');

const backfill=new Map();
const previouslyActive=new Set();
let previousSafeCount=0;
for(const snap of snapshots){
 const currentKeys=new Set();
 for(const item of snap.valid){
  const key=historyKey(item);if(!key)continue;currentKeys.add(key);
  if(!backfill.has(key))backfill.set(key,[]);
  backfill.get(key).push({at:snap.at,active:true,price:Number(item.currentPrice),originalPrice:Number(item.originalPrice),discount:Number(item.discountPercent),...(item.saleEndsAt?{saleEndsAt:item.saleEndsAt}:{}),source:'git-backfill'});
 }
 if(snap.safe&&previousSafeCount>0&&snap.valid.length>=previousSafeCount*0.7){
  for(const key of previouslyActive){if(!currentKeys.has(key)){if(!backfill.has(key))backfill.set(key,[]);backfill.get(key).push({at:snap.at,active:false,source:'git-backfill'})}}
 }
 if(snap.safe){previouslyActive.clear();for(const k of currentKeys)previouslyActive.add(k);previousSafeCount=snap.valid.length}
}

let entriesTouched=0,pointsBefore=0,pointsAfter=0,gamesWith2Plus=0,gamesWithCycles2Plus=0;
for(const [key,points] of backfill){
 const entry=history.items[key];if(!entry)continue;
 const old=Array.isArray(entry.timeline)?entry.timeline:[];
 const merged=compactTimeline([...points,...old]);
 if(JSON.stringify(merged)!==JSON.stringify(old)){entriesTouched++;pointsBefore+=old.length;pointsAfter+=merged.length}
 entry.timeline=merged;entry.trend=cycleStats(merged);
 const activePrices=merged.filter(x=>x.active&&Number(x.price)>0);
 if(activePrices.length){
  entry.lowestPrice=Math.min(...activePrices.map(x=>Number(x.price)));
  entry.highestDiscount=Math.max(...activePrices.map(x=>Number(x.discount)||0));
  const lowPoint=activePrices.find(x=>Number(x.price)===entry.lowestPrice);if(lowPoint)entry.lowestPriceObservedAt=lowPoint.at;
 }
 entry.historyBackfill={source:'git',snapshotCount:snapshots.length,firstSnapshotAt:snapshots[0].at,lastSnapshotAt:snapshots.at(-1).at,updatedAt:new Date().toISOString()};
 if(entry.trend.changePoints>=2)gamesWith2Plus++;if(entry.trend.saleCycles>=2)gamesWithCycles2Plus++;
}

const trends={version:3,generatedAt:new Date().toISOString(),source:'PS Radar deal trends + git history backfill',itemCount:0,items:{}};
for(const item of currentDeals.items){
 const key=historyKey(item),e=history.items[key];if(!e)continue;
 if(validPrice(item)){
  item.radarLowPrice=e.lowestPrice??item.radarLowPrice??null;
  item.radarHighestDiscount=e.highestDiscount??item.radarHighestDiscount??0;
  item.radarLowObservedAt=e.lowestPriceObservedAt??item.radarLowObservedAt??null;
  item.isRadarLow=Number(item.currentPrice)>0&&Number(e.lowestPrice)>0?Number(item.currentPrice)<=Number(e.lowestPrice)*1.001:false;
  item.nearRadarLow=Number(item.currentPrice)>0&&Number(e.lowestPrice)>0?Number(item.currentPrice)<=Number(e.lowestPrice)*1.05:false;
  item.radarLowDeltaPercent=Number(e.lowestPrice)>0?Number((((Number(item.currentPrice)/Number(e.lowestPrice))-1)*100).toFixed(1)):null;
  item.radarTrend=e.trend||cycleStats(e.timeline||[]);
 }
 trends.items[key]={firstSeenAt:e.firstSeenAt,lastSeenAt:e.lastSeenAt,observations:e.observations,priceObservations:e.priceObservations||0,lowestPrice:e.lowestPrice??null,lowestPriceObservedAt:e.lowestPriceObservedAt??null,highestDiscount:e.highestDiscount??0,lastPrice:e.lastPrice??null,lastDiscount:e.lastDiscount??0,lastOriginalPrice:e.lastOriginalPrice??null,timeline:e.timeline||[],trend:e.trend||cycleStats(e.timeline||[]),historyBackfill:e.historyBackfill||null};
}
trends.itemCount=Object.keys(trends.items).length;
history.version=3;history.gitHistoryBackfill={generatedAt:new Date().toISOString(),snapshotCount:snapshots.length,safeSnapshotCount:snapshots.filter(x=>x.safe).length,firstSnapshotAt:snapshots[0].at,lastSnapshotAt:snapshots.at(-1).at,entriesTouched,pointsBefore,pointsAfter,gamesWith2Plus,gamesWithCycles2Plus};
currentDeals.health={...(currentDeals.health||{}),dealHistoryVersion:3,gitBackfillSnapshots:snapshots.length,gitBackfillEntries:entriesTouched,gitBackfillGamesWith2Plus:gamesWith2Plus};
const report={version:1,generatedAt:new Date().toISOString(),snapshotCount:snapshots.length,safeSnapshotCount:snapshots.filter(x=>x.safe).length,snapshots:snapshots.map(x=>({sha:x.sha,at:x.at,items:x.items.length,valid:x.valid.length,safe:x.safe})),entriesTouched,pointsBefore,pointsAfter,pointsAdded:Math.max(0,pointsAfter-pointsBefore),gamesWith2Plus,gamesWithCycles2Plus};
await fs.writeFile(HISTORY_FILE,JSON.stringify(history,null,2)+'\n');
await fs.writeFile(TRENDS_FILE,JSON.stringify(trends)+'\n');
await fs.writeFile(DEALS_FILE,JSON.stringify(currentDeals,null,2)+'\n');
await fs.writeFile(REPORT_FILE,JSON.stringify(report,null,2)+'\n');
console.log('PS Radar git history backfill complete',report);
