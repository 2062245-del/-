import fs from 'node:fs';
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const need=(c,m)=>{if(!c)throw new Error(m)};
const data=read('ps-radar/data-v180.js');
const score=read('ps-radar/score-v180.js');
const detail=read('ps-radar/detail-v180.js');
const filters=read('ps-radar/filters-v180.js');
const library=read('ps-radar/library-v180.js');
const briefing=read('ps-radar/briefing-v180.js');
const meta=JSON.parse(read('ps-radar/data/game-meta-v180.json')||'{"health":{},"items":[]}');
const release=JSON.parse(read('ps-radar/data/deal-release-v180.json')||'{"health":{},"items":[]}');
need(data.includes("STAGE=1"),'stage1 runtime missing');
for(const t of ['canonicalGameId','releaseDateSource','identityConfidence','canonicalKey','coverage'])need(data.includes(t),`stage1 missing ${t}`);
need(meta.health?.safeToMerge===true,'stage1 game metadata not safe');
need(Number(meta.health?.itemCount)>=400,'stage1 metadata unexpectedly small');
need(release.health?.safeToMerge===true,'verified PS Store release cache not safe');
need(Number(release.health?.coveragePercent)>=95,`verified deal release coverage too low: ${release.health?.coveragePercent}`);
need(Number(meta.health?.dealReleaseDateCount)>=1500,`deal release dates unexpectedly low: ${meta.health?.dealReleaseDateCount}`);
need(Number(meta.health?.officialHtmlDates)>=1500,`official PS Store release dates unexpectedly low: ${meta.health?.officialHtmlDates}`);
console.log('[v18 stage 1] PASS - canonical IDs and authoritative release-date crosswalk',meta.health);
console.log('[v18 release cache] PASS',release.health);
let stage=1;
if(score){stage=2;for(const t of ['psRadarScore','priceScore','tasteScore','ratingScore','plusScore','scoreReasons'])need(score.includes(t),`stage2 missing ${t}`);console.log('[v18 stage 2] PASS - unified PS Radar Score');}
if(detail){stage=3;for(const t of ['data-v180-detail-tab','요약','가격이력','PS Plus','에디션'])need(detail.includes(t),`stage3 missing ${t}`);console.log('[v18 stage 3] PASS - tabbed detail UX');}
if(filters){stage=4;for(const t of ['psradar-filter-presets','내 필터','savePreset','applyPreset'])need(filters.includes(t),`stage4 missing ${t}`);console.log('[v18 stage 4] PASS - saved filters');}
if(library){stage=5;for(const t of ['플레이 예정','플레이 중','완료','backlogStatus','editionValue','plusPriority','curationGroups'])need(library.includes(t),`stage5 missing ${t}`);console.log('[v18 stage 5] PASS - backlog, curation, editions, Plus risk');}
if(briefing){stage=6;for(const t of ['오늘의 브리핑','찜 게임 가격하락','Plus 종료임박','이번 주 출시','오늘 사기 좋은 게임'])need(briefing.includes(t),`stage6 missing ${t}`);console.log('[v18 stage 6] PASS - daily briefing home');}
console.log(`V180_STATIC_PASS stage=${stage}`);
