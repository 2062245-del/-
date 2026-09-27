import fs from 'node:fs/promises';

const FILE = 'ps-radar/data/deals-auto.json';
const MAX_ITEMS = Number(process.env.PSRADAR_ART_MAX_ITEMS || 240);
const CONCURRENCY = Math.max(1, Number(process.env.PSRADAR_ART_CONCURRENCY || 8));
const TIMEOUT = Number(process.env.PSRADAR_ART_TIMEOUT_MS || 8000);

const payload = JSON.parse(await fs.readFile(FILE, 'utf8'));
if (!Array.isArray(payload?.items)) throw new Error('deals-auto.json items missing');

function isStoreProduct(url='') {
  return /^https:\/\/store\.playstation\.com\//i.test(url) && /\/(?:product|concept)\//i.test(url);
}
function normalize(value='') {
  let out = String(value).replace(/\\u002F/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').trim();
  if (out.startsWith('//')) out='https:'+out;
  return out;
}
function isOfficialImage(value='') {
  try {
    const u=new URL(normalize(value));
    if(u.protocol!=='https:') return false;
    const h=u.hostname.toLowerCase();
    return h==='image.api.playstation.com' || h.endsWith('.playstation.com') || h.endsWith('.playstation.net') || h==='gmedia.playstation.com';
  } catch { return false; }
}
function pickImage(html='') {
  const meta = [
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i
  ];
  for(const re of meta){const m=html.match(re);if(m&&isOfficialImage(m[1]))return normalize(m[1]);}
  const cdn = html.match(/https:(?:\\\/|\/){2}(?:image\.api|gmedia)\.playstation\.com[^"'<>\s]+/i);
  return cdn&&isOfficialImage(cdn[0])?normalize(cdn[0]):null;
}
async function fetchArt(item) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT);
  try{
    const r=await fetch(item.store,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36','accept-language':'ko-KR,ko;q=0.9,en;q=0.7','accept':'text/html,application/xhtml+xml'}});
    if(!r.ok)return {item,error:`HTTP ${r.status}`};
    const html=(await r.text()).slice(0,3_500_000);
    return {item,image:pickImage(html)};
  }catch(err){return {item,error:err.name||err.message||'fetch'};}
  finally{clearTimeout(timer);}
}

const candidates=payload.items.filter(x=>!x.image&&isStoreProduct(x.store)).slice(0,MAX_ITEMS);
let cursor=0, filled=0, failed=0;
async function worker(){
  while(true){
    const i=cursor++; if(i>=candidates.length)return;
    const result=await fetchArt(candidates[i]);
    if(result.image){
      result.item.image=result.image;
      result.item.imageStatus='official-product-page-v177';
      result.item.imageVerifiedAt=new Date().toISOString();
      filled++;
    }else failed++;
    if((i+1)%25===0||i+1===candidates.length)console.log(`Artwork hydration ${i+1}/${candidates.length}: filled=${filled}, failed=${failed}`);
  }
}
await Promise.all(Array.from({length:Math.min(CONCURRENCY,candidates.length||1)},worker));
payload.health={...(payload.health||{}),artHydrationVersion:'17.7',artHydrationCandidates:candidates.length,artHydrationFilled:filled,artHydrationFailed:failed,artHydrationCap:MAX_ITEMS};
await fs.writeFile(FILE,JSON.stringify(payload,null,2)+'\n');
console.log('v17.7 official artwork hydration complete',{candidates:candidates.length,filled,failed});
