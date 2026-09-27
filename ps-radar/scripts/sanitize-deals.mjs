import fs from 'node:fs/promises';

const FILE = 'ps-radar/data/deals-auto.json';
const languagePattern = /(?:한국어|영어|일본어|중국어|간체자|번체자|Korean|English|Japanese|Chinese)/i;

function cleanLanguageTail(value='') {
  let s = String(value || '').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/\s+/g,' ').trim();
  for (let pass=0; pass<3 && s.endsWith(')'); pass++) {
    let depth=0, open=-1;
    for (let i=s.length-1; i>=0; i--) {
      if (s[i]===')') depth++;
      else if (s[i]==='(') {
        depth--;
        if (depth===0) { open=i; break; }
      }
    }
    if (open<0) break;
    const tail=s.slice(open+1,-1);
    if (!languagePattern.test(tail)) break;
    s=s.slice(0,open).trim();
  }
  return s.replace(/\s+/g,' ').trim();
}

function imageKey(value='') {
  try { const u=new URL(value); u.search=''; u.hash=''; return u.href; }
  catch { return String(value || '').split('?')[0]; }
}

function titleKey(value='') {
  return cleanLanguageTail(value).toLowerCase().replace(/[™®]/g,'').replace(/\b(?:ps4|ps5)\b/gi,'').replace(/[^a-z0-9가-힣]+/g,'');
}

function sameFamily(a,b) {
  if (!a || !b) return false;
  return a===b || (a.length>5 && b.length>5 && (a.includes(b) || b.includes(a)));
}

const payload=JSON.parse(await fs.readFile(FILE,'utf8'));
if (!Array.isArray(payload?.items)) throw new Error('deals-auto.json items missing');

let titlesCleaned=0;
for (const item of payload.items) {
  const clean=cleanLanguageTail(item.title);
  if (clean && clean!==item.title) {
    item.storeTitle=item.title;
    item.title=clean;
    titlesCleaned++;
  }
}

const byImage=new Map();
for (const item of payload.items) {
  if (!item.image) continue;
  const key=imageKey(item.image);
  if (!key) continue;
  if (!byImage.has(key)) byImage.set(key,[]);
  byImage.get(key).push(item);
}

let collisionsRemoved=0;
let collisionGroups=0;
for (const [key, items] of byImage) {
  if (items.length<2) continue;
  const titles=[...new Set(items.map(x=>titleKey(x.title)).filter(Boolean))];
  const stores=[...new Set(items.map(x=>String(x.store||'').split('?')[0]).filter(Boolean))];
  if (titles.length<2 || stores.length<2) continue;
  const oneFamily=titles.every((a,i)=>titles.every((b,j)=>i===j || sameFamily(a,b)));
  if (oneFamily) continue;
  collisionGroups++;
  for (const item of items) {
    item.imageStatus='collision-removed';
    item.image=null;
    collisionsRemoved++;
  }
  console.log('Removed suspicious shared image:', key, 'items:', items.length, 'titles:', titles.slice(0,5));
}

payload.health={
  ...(payload.health||{}),
  titlesCleaned,
  imageCollisionGroupsRemoved:collisionGroups,
  imageCollisionsRemoved:collisionsRemoved
};

await fs.writeFile(FILE, JSON.stringify(payload,null,2)+'\n');
console.log(`Sanitized deals: titles cleaned=${titlesCleaned}, collision groups=${collisionGroups}, images removed=${collisionsRemoved}`);
