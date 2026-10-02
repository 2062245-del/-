import fs from 'node:fs/promises';

const DEALS_FILE = 'ps-radar/data/deals-auto.json';
const HISTORY_FILE = 'ps-radar/data/deal-history.json';
const TRENDS_FILE = 'ps-radar/data/deal-trends.json';
const PRICE_TOLERANCE = Number(process.env.PSRADAR_PRICE_TOLERANCE || 2.5);
const MAX_TIMELINE = Number(process.env.PSRADAR_MAX_TIMELINE || 64);

const cleanUrl = value => {
  try {
    const u = new URL(value);
    u.search = '';
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch { return String(value || '').split('?')[0].replace(/\/$/, ''); }
};
const titleKey = value => String(value || '')
  .toLowerCase()
  .replace(/\([^)]*(?:한국어|영어|일본어|중국어|korean|english|japanese|chinese)[^)]*\)/gi, ' ')
  .replace(/\b(?:ps4|ps5)\b|[™®]/gi, ' ')
  .replace(/[^a-z0-9가-힣]+/g, '');
function historyKey(item) {
  const store = cleanUrl(item?.store);
  return store || `title:${titleKey(item?.title) || item?.id || 'unknown'}`;
}
function validPrice(item) {
  if (String(item?.priceStatus || '').startsWith('rejected')) return false;
  const c = Number(item?.currentPrice), o = Number(item?.originalPrice), d = Number(item?.discountPercent);
  if (!(c > 0) || !(o > c) || !(d > 0 && d < 100)) return false;
  return Math.abs((1 - c / o) * 100 - d) <= PRICE_TOLERANCE;
}
const daysBetween = (a,b) => {
  const x=Date.parse(a), y=Date.parse(b);
  return Number.isFinite(x)&&Number.isFinite(y) ? Math.max(0, Math.round((y-x)/86400000)) : null;
};
const median = arr => {
  const x=arr.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if(!x.length) return null;
  const m=Math.floor(x.length/2);
  return x.length%2 ? x[m] : Math.round((x[m-1]+x[m])/2);
};
function normalizeTimeline(value){
  return Array.isArray(value) ? value.filter(x=>x&&x.at).map(x=>({
    at:String(x.at), active:x.active!==false,
    ...(Number.isFinite(Number(x.price))?{price:Number(x.price)}:{}),
    ...(Number.isFinite(Number(x.originalPrice))?{originalPrice:Number(x.originalPrice)}:{}),
    ...(Number.isFinite(Number(x.discount))?{discount:Number(x.discount)}:{}),
    ...(x.saleEndsAt?{saleEndsAt:String(x.saleEndsAt)}:{})
  })).slice(-MAX_TIMELINE) : [];
}
function pushChanged(timeline, snap){
  const last=timeline.at(-1);
  const same=last && last.active===snap.active &&
    (!snap.active || (Number(last.price)===Number(snap.price) && Number(last.originalPrice)===Number(snap.originalPrice) && Number(last.discount)===Number(snap.discount) && String(last.saleEndsAt||'')===String(snap.saleEndsAt||'')));
  if(!same) timeline.push(snap);
  return timeline.slice(-MAX_TIMELINE);
}
function cycleStats(timeline){
  const starts=[]; const cycles=[]; let current=null; let prevActive=false;
  for(const s of timeline){
    if(s.active){
      if(!prevActive){ current={startAt:s.at, points:[]}; cycles.push(current); starts.push(s.at); }
      current?.points.push(s);
    } else current=null;
    prevActive=!!s.active;
  }
  const activePoints=timeline.filter(x=>x.active&&Number(x.price)>0);
  const currentCycle=timeline.at(-1)?.active ? cycles.at(-1) : null;
  const previousCycle=currentCycle ? cycles.at(-2) : cycles.at(-1);
  const gaps=[]; for(let i=1;i<starts.length;i++){const d=daysBetween(starts[i-1],starts[i]); if(Number.isFinite(d))gaps.push(d);}
  const best = cyc => cyc?.points?.length ? {
    price:Math.min(...cyc.points.map(x=>Number(x.price)).filter(Number.isFinite)),
    discount:Math.max(...cyc.points.map(x=>Number(x.discount)).filter(Number.isFinite))
  } : null;
  const recentBest=cycles.slice(-4).map(best).filter(Boolean);
  let direction='insufficient';
  if(recentBest.length>=3){
    const ds=recentBest.map(x=>x.discount);
    const diff=ds.at(-1)-ds[0];
    direction=diff>=10?'improving':diff<=-10?'weakening':'flat';
  }
  return {
    changePoints:timeline.length,
    saleCycles:cycles.length,
    averageGapDays:gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null,
    medianDiscount:median(activePoints.map(x=>Number(x.discount))),
    medianSalePrice:median(activePoints.map(x=>Number(x.price))),
    currentCycleStartedAt:currentCycle?.startAt||null,
    previousCycleBestPrice:best(previousCycle)?.price??null,
    previousCycleBestDiscount:best(previousCycle)?.discount??null,
    recentDirection:direction,
    recentCycleBest:recentBest
  };
}

const deals = JSON.parse(await fs.readFile(DEALS_FILE, 'utf8'));
if (!Array.isArray(deals?.items)) throw new Error('deals-auto.json items missing');
let history = {version:2, generatedAt:null, source:'PS Radar observed history', items:{}};
let hadHistory = false;
try {
  const prior = JSON.parse(await fs.readFile(HISTORY_FILE, 'utf8'));
  if (prior && typeof prior.items === 'object' && Object.keys(prior.items).length) {
    history = {...history, ...prior, items:{...prior.items}};
    hadHistory = true;
  }
} catch (_) {}

const observedAt = deals.generatedAt || new Date().toISOString();
let tracked = 0, lows = 0, newDeals = 0, timelineChanges=0;
const liveKeys = new Set();

for (const item of deals.items) {
  const key = historyKey(item); if (!key) continue;
  liveKeys.add(key);
  const prev = history.items[key] || null;
  const isNew = hadHistory && !prev;
  let timeline=normalizeTimeline(prev?.timeline);
  const entry = {
    ...(prev || {}), key,
    id:item.id || prev?.id || null,
    title:item.title || prev?.title || '',
    store:cleanUrl(item.store) || prev?.store || '',
    firstSeenAt:prev?.firstSeenAt || observedAt,
    lastSeenAt:observedAt,
    observations:Number(prev?.observations || 0) + 1,
    seenSnapshots:Number(prev?.seenSnapshots || 0) + 1,
    active:true
  };
  if (validPrice(item)) {
    const current=Number(item.currentPrice), discount=Number(item.discountPercent), original=Number(item.originalPrice);
    const before=timeline.length;
    timeline=pushChanged(timeline,{at:observedAt,active:true,price:current,originalPrice:original,discount,...(item.saleEndsAt?{saleEndsAt:item.saleEndsAt}:{})});
    if(timeline.length!==before || JSON.stringify(timeline.at(-1))!==JSON.stringify(normalizeTimeline(prev?.timeline).at(-1))) timelineChanges++;
    entry.lastPrice=current; entry.lastDiscount=discount; entry.lastOriginalPrice=original;
    entry.lowestPrice=Number.isFinite(Number(prev?.lowestPrice)) ? Math.min(Number(prev.lowestPrice),current) : current;
    entry.highestDiscount=Math.max(Number(prev?.highestDiscount||0),discount);
    entry.priceObservations=Number(prev?.priceObservations||0)+1;
    if(!prev || current<Number(prev.lowestPrice??Infinity)) entry.lowestPriceObservedAt=observedAt;
    else entry.lowestPriceObservedAt=prev.lowestPriceObservedAt||observedAt;
    tracked++; if(current<=entry.lowestPrice*1.001) lows++;
    item.radarLowPrice=entry.lowestPrice; item.radarLowObservedAt=entry.lowestPriceObservedAt;
    item.radarObservations=entry.priceObservations; item.radarHighestDiscount=entry.highestDiscount;
    item.isRadarLow=current<=entry.lowestPrice*1.001; item.nearRadarLow=current<=entry.lowestPrice*1.05;
    item.radarLowDeltaPercent=entry.lowestPrice>0?Number((((current/entry.lowestPrice)-1)*100).toFixed(1)):null;
  } else {
    item.radarLowPrice=Number.isFinite(Number(prev?.lowestPrice))?Number(prev.lowestPrice):null;
    item.radarObservations=Number(prev?.priceObservations||0); item.isRadarLow=false; item.nearRadarLow=false;
  }
  entry.timeline=timeline;
  entry.trend=cycleStats(timeline);
  item.radarFirstSeenAt=entry.firstSeenAt; item.radarNewDeal=isNew;
  item.radarTrend=entry.trend;
  if(isNew)newDeals++;
  history.items[key]=entry;
}

for (const [key, oldEntry] of Object.entries(history.items)) {
  if(liveKeys.has(key)) continue;
  let timeline=normalizeTimeline(oldEntry.timeline);
  if(oldEntry.active!==false){
    timeline=pushChanged(timeline,{at:observedAt,active:false});
    history.items[key]={...oldEntry,active:false,lastEndedAt:observedAt,timeline,trend:cycleStats(timeline)};
    timelineChanges++;
  }
}

history.version=2; history.generatedAt=observedAt; history.initializedBaseline=history.initializedBaseline||!hadHistory;
history.itemCount=Object.keys(history.items).length; history.activeCount=liveKeys.size; history.validPriceCount=tracked;
history.newDealCount=newDeals; history.lowCount=lows; history.timelineChangeCount=timelineChanges;
const trendItems={};
for(const key of liveKeys){
  const e=history.items[key]; if(!e)continue;
  trendItems[key]={firstSeenAt:e.firstSeenAt,lastSeenAt:e.lastSeenAt,observations:e.observations,priceObservations:e.priceObservations||0,lowestPrice:e.lowestPrice??null,lowestPriceObservedAt:e.lowestPriceObservedAt??null,highestDiscount:e.highestDiscount??0,lastPrice:e.lastPrice??null,lastDiscount:e.lastDiscount??0,lastOriginalPrice:e.lastOriginalPrice??null,timeline:e.timeline||[],trend:e.trend||cycleStats(e.timeline||[])};
}
const trends={version:2,generatedAt:observedAt,source:'PS Radar compact deal trends',itemCount:Object.keys(trendItems).length,items:trendItems};
deals.health={...(deals.health||{}),dealHistoryVersion:2,observedHistoryCount:history.itemCount,observedActiveCount:history.activeCount,observedValidPriceCount:tracked,observedNewDealCount:newDeals,observedLowCount:lows,timelineChangeCount:timelineChanges};
await fs.writeFile(HISTORY_FILE,JSON.stringify(history,null,2)+'\n');
await fs.writeFile(TRENDS_FILE,JSON.stringify(trends)+'\n');
await fs.writeFile(DEALS_FILE,JSON.stringify(deals,null,2)+'\n');
console.log('PS Radar observed history v2 updated',{history:history.itemCount,active:history.activeCount,validPrices:tracked,newDeals,lows,timelineChanges,trends:trends.itemCount});
