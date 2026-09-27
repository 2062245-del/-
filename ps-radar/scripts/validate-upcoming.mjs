import fs from 'node:fs/promises';

const FILE='ps-radar/data/upcoming.json';
const payload=JSON.parse(await fs.readFile(FILE,'utf8'));
if(!Array.isArray(payload?.items))throw new Error('upcoming items missing');
const today=new Date();today.setHours(0,0,0,0);
let specific=0,list=0,invalid=0;

function classify(url=''){
  try{
    const u=new URL(url);
    if(!/(?:playstation\.com|store\.playstation\.com)$/i.test(u.hostname) && !u.hostname.endsWith('.playstation.com'))return 'external';
    if(/store\.playstation\.com$/i.test(u.hostname)&&/\/(?:product|concept)\//i.test(u.pathname))return 'product-page';
    if(/playstation\.com$/i.test(u.hostname)&&/\/games\/[^/]+\/?$/i.test(u.pathname))return 'game-page';
    return 'official-list';
  }catch{return 'invalid';}
}

for(const item of payload.items){
  const level=classify(item.store||payload.sourceUrl||'');
  item.verificationLevel=level;
  item.verifiedAt=payload.updatedAt||new Date().toISOString();
  if(level==='product-page'||level==='game-page'){item.dataQuality='verified';specific++;}
  else if(level==='official-list'){item.dataQuality='official-list';list++;}
  else{item.dataQuality='partial';invalid++;}
  if(item.releaseDate){
    const d=new Date(`${String(item.releaseDate).slice(0,10)}T00:00:00`);
    if(Number.isNaN(d.getTime()))throw new Error(`Invalid releaseDate: ${item.title} ${item.releaseDate}`);
    item.releaseDateStatus=d>=today?'future':'past';
  }else item.releaseDateStatus='unannounced';
}
payload.verification={version:'17.7',specificPageCount:specific,officialListCount:list,partialCount:invalid,checkedAt:new Date().toISOString()};
await fs.writeFile(FILE,JSON.stringify(payload,null,2)+'\n');
console.log('Upcoming verification grading complete',payload.verification);
