const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  games: [], feed: [], store: new Map(), view: 'all', quick: 'none', content: 'all', query: '', platform: 'all', tier: 'all', genre: 'all', korean: 'all', sort: 'default',
  syncSource: 'seed', storeSource: 'seed', discoverySource: 'seed', generatedAt: null, storeGeneratedAt: null, discoveryGeneratedAt: null, feedHealth: null, storeHealth: null, discoveryHealth: null, changes: [],
  push: {enabled:false, publicKey:'', storage:'none', subscribed:false}, history: new Map(), events: [], visibleCount: 24, pageSize: 24
};
const wish = new Set(JSON.parse(localStorage.getItem('psradar-wish') || '[]'));
const chips = ['전체','RPG','액션','생존','스포츠','인디','한국어','할인중','체험판','신작'];
const chipMap = {액션:'Action',생존:'Survival',스포츠:'Sports',인디:'Indie',RPG:'RPG'};

function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function formatDate(v){if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return ''; return new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric'}).format(d);}
function formatDateTime(v){if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return ''; return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);}
function numericOrNull(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function won(v){const n=numericOrNull(v);return n===null?'':`${n.toLocaleString('ko-KR')}원`;}
function daysUntil(v){if(!v)return null; const ms=new Date(v).getTime()-Date.now(); if(!Number.isFinite(ms))return null; return Math.ceil(ms/86400000);}
function isFuture(v){return v && new Date(v).getTime()>Date.now();}
function isSale(g){return Number(g.discountPercent)>0 && (!g.saleEndsAt || isFuture(g.saleEndsAt));}
function plusName(t){return t==='Extra'?'PS Plus 스페셜':t==='Deluxe'?'PS Plus 디럭스':t==='Essential'?'PS Plus 에센셜':'PS Plus';}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
function localHistoryKey(id){return `psradar-history-${id}`;}
function readLocalHistory(id){try{return JSON.parse(localStorage.getItem(localHistoryKey(id))||'[]');}catch{return []}}
function saveLocalHistory(items){for(const x of items){const h=readLocalHistory(x.id);const point={at:new Date().toISOString(),currentPrice:numericOrNull(x.currentPrice),originalPrice:numericOrNull(x.originalPrice),discountPercent:Number(x.discountPercent)||0,plusIncluded:!!x.plusIncluded,plusTier:x.plusTier||null};const last=h[h.length-1];const changed=!last||last.currentPrice!==point.currentPrice||last.discountPercent!==point.discountPercent||last.plusIncluded!==point.plusIncluded||String(last.at).slice(0,10)!==String(point.at).slice(0,10);if(changed)localStorage.setItem(localHistoryKey(x.id),JSON.stringify([...h,point].slice(-90)));}}

async function loadJSON(url){
  if(window.__PSRADAR_EMBEDDED__){
    if(url.includes('games.json')) return window.__PSRADAR_EMBEDDED__.games;
    if(url.includes('feed.json')) return window.__PSRADAR_EMBEDDED__.feed;
    if(url.includes('store.json')) return window.__PSRADAR_EMBEDDED__.store;
    if(url.includes('discovery.json')) return window.__PSRADAR_EMBEDDED__.discovery;
  }
  const r = await fetch(`${url}?v=${Date.now()}`, {cache:'no-store'});
  if(!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function fetchLive(url, timeout=8000){
  if(window.__PSRADAR_EMBEDDED__) return null;
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  try{
    const r = await fetch(`${url}?t=${Date.now()}`, {cache:'no-store', signal:controller.signal});
    if(!r.ok) throw new Error(`${url}: ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}


function titleKey(v=''){return String(v).toLowerCase().replace(/\([^)]*(?:한국어|영어|일본어|중국어)[^)]*\)/g,' ').replace(/\b(?:ps4|ps5)\b|[™®]/g,' ').replace(/[^a-z0-9가-힣]+/g,'').trim();}
function ensureGameDefaults(g={}){
  const id=g.id||`game-${titleKey(g.title)||Math.random().toString(36).slice(2)}`;
  const seed=[...id].reduce((a,c)=>a+c.charCodeAt(0),0);
  return {...g,id,title:g.title||'제목 확인 중',type:g.type||'regular',tier:g.tier||null,platform:Array.isArray(g.platform)?g.platform:[],genre:Array.isArray(g.genre)?g.genre:[],ko:!!g.ko,desc:g.desc||'PlayStation 공식 데이터에서 자동 수집한 게임입니다.',price:g.price||'',tag:g.tag||'',c1:g.c1||`hsl(${seed%360} 48% 28%)`,c2:g.c2||`hsl(${(seed+73)%360} 54% 18%)`,store:g.store||''};
}
function mergeGameIndex(base=[], discovered=[]){
  const result=[]; const byStore=new Map(),byTitle=new Map();
  for(const raw of base){const g=ensureGameDefaults(raw);result.push(g);if(g.store)byStore.set(g.store.split('?')[0],g);byTitle.set(titleKey(g.title),g);}
  for(const raw of discovered){const d=ensureGameDefaults(raw);const match=(d.store&&byStore.get(d.store.split('?')[0]))||byTitle.get(titleKey(d.title));
    if(match){
      const preserve={id:match.id,title:match.title,type:match.type,tier:match.tier,genre:match.genre?.length?match.genre:d.genre,desc:match.desc||d.desc,c1:match.c1,c2:match.c2};
      Object.assign(match,d,preserve,{platform:[...new Set([...(match.platform||[]),...(d.platform||[])])],ko:match.ko||d.ko,store:match.store||d.store});
    }else{result.push(d);if(d.store)byStore.set(d.store.split('?')[0],d);byTitle.set(titleKey(d.title),d);}
  }
  return result;
}
function typeLabel(g){return ({catalog:'CATALOG',monthly:'MONTHLY',promo:'PROMO',trial:'TRIAL',classic:'CLASSIC',latest:'NEW'})[g.type]||'GAME';}
function typeDisplay(g){return ({catalog:'카탈로그',monthly:'월간',promo:'할인',trial:'체험판',classic:'클래식',latest:'신작'})[g.type]||g.tier||'게임';}
function typeBadgeClass(g){return g.type==='promo'?'sale':g.type==='monthly'?'monthly':g.type==='trial'?'trial':g.type==='latest'?'newbadge':'plus';}
function resetVisible(){state.visibleCount=state.pageSize||24;}

function mergeGame(g){return {...g,...(state.store.get(g.id)||{}),plusEndsAt:(state.store.get(g.id)||{}).plusEndsAt||g.plusEndsAt||null};}
function hasPlusBenefit(g){return !!g.plusIncluded || g.type==='catalog' || g.type==='monthly';}
function benefitTier(g){return g.plusTier||g.tier||null;}

function profileReady(g){return Boolean(g && (g.publisher||g.releaseDate||g.storeGenre||Number(g.playerCount)>0||Number(g.maxOnlinePlayers)>0));}
function profileCoverage(){
  const games=state.games.map(mergeGame).filter(g=>g.type!=='promo');
  const ready=games.filter(profileReady).length;
  return {ready,total:games.length,percent:games.length?Math.round((ready/games.length)*100):0};
}
function needsProfile(g){return g?.type!=='promo' && !profileReady(g) && /store\.playstation\.com\/ko-kr\//.test(g?.store||'');}
async function hydrateGameProfile(id){
  if(window.__PSRADAR_EMBEDDED__) return false;
  const base=state.games.find(g=>g.id===id); if(!base||!needsProfile(mergeGame(base))) return false;
  try{
    const r=await fetch(`/api/store?id=${encodeURIComponent(id)}&t=${Date.now()}`,{cache:'no-store'}); if(!r.ok)return false;
    const payload=await r.json(); const item=Array.isArray(payload?.items)?payload.items[0]:null; if(!item)return false;
    state.store.set(id,{...(state.store.get(id)||{}),...item});
    render(); return true;
  }catch{return false;}
}

function genreProfile(){
  const counts=new Map(); let total=0;
  for(const g of state.games){
    if(!wish.has(g.id)) continue;
    for(const genre of (g.genre||[])){
      if(genre==='Promo') continue;
      counts.set(genre,(counts.get(genre)||0)+1); total+=1;
    }
  }
  return {counts,total};
}
function radarScore(g){
  const rating=Number(g.rating); const ratingCount=Number(g.ratingCount)||0;
  const ratingPart=Number.isFinite(rating)?Math.max(0,Math.min(25,(rating/5)*25)):12;
  const confidencePart=Math.min(5,(Math.log10(ratingCount+1)/4)*5);
  const discount=Math.max(0,Math.min(75,Number(g.discountPercent)||0));
  const benefitPart=hasPlusBenefit(g)?28:(discount/75)*28;
  const koPart=g.ko?5:0;
  let freshPart=0;
  if(g.catalogAddedAt){const age=-daysUntil(g.catalogAddedAt); if(age>=0&&age<=30) freshPart=8*(1-age/30);}
  const profile=genreProfile(); let affinityPart=11;
  if(profile.total>0){const matched=(g.genre||[]).reduce((sum,x)=>sum+(profile.counts.get(x)||0),0);affinityPart=Math.min(22,(matched/profile.total)*22);}
  const ds=daysUntil(g.saleEndsAt),dp=daysUntil(g.plusEndsAt); let urgencyPart=0;
  if((ds!==null&&ds>=0&&ds<=7)||(dp!==null&&dp>=0&&dp<=14)) urgencyPart=7;
  const score=Math.round(Math.max(0,Math.min(100,ratingPart+confidencePart+benefitPart+koPart+freshPart+affinityPart+urgencyPart)));
  return score;
}
function radarScoreLabel(score){return score>=85?'강력 추천':score>=75?'추천':score>=60?'관심':'탐색';}
function recommendationReasons(g){
  const reasons=[]; const profile=genreProfile();
  if(hasPlusBenefit(g)) reasons.push(`${plusName(benefitTier(g))} 포함`);
  if(Number(g.discountPercent)>=30) reasons.push(`${g.discountPercent}% 할인`);
  if(Number(g.rating)>=4.5) reasons.push(`평점 ${Number(g.rating).toFixed(2)}`);
  if(g.ko) reasons.push('한국어 지원');
  if(profile.total>0){const hit=(g.genre||[]).filter(x=>profile.counts.has(x));if(hit.length)reasons.push(`${hit.slice(0,2).join(' · ')} 취향 일치`);}
  if(g.catalogAddedAt){const age=-daysUntil(g.catalogAddedAt);if(age>=0&&age<=14)reasons.push('카탈로그 신규');}
  return reasons.slice(0,2).join(' · ')||'평점·혜택·신선도 종합';
}
function topRecommendations(limit=4){
  const all=state.games.map(mergeGame).filter(g=>g.type!=='promo');
  const unwished=all.filter(g=>!wish.has(g.id));
  const pool=unwished.length>=limit?unwished:all;
  return pool.map(g=>({...g,_score:radarScore(g)})).sort((a,b)=>b._score-a._score).slice(0,limit);
}

function historicalLowInfo(g, historyOverride=null){
  const history=historyOverride || state.history.get(g.id) || readLocalHistory(g.id);
  const values=(history||[]).map(x=>Number(x.currentPrice)).filter(Number.isFinite);
  const current=Number(g.currentPrice); if(Number.isFinite(current)) values.push(current);
  return {low:values.length?Math.min(...values):null, observations:(history||[]).length};
}
function plusRisk(g){
  if(!hasPlusBenefit(g)) return {level:'none',label:'해당 없음',text:'현재 PS Plus 혜택 대상이 아닙니다.',days:null};
  const d=daysUntil(g.plusEndsAt);
  if(d===null) return {level:'unknown',label:'종료일 미공개',text:'공식 종료 일정이 확인되지 않았습니다.',days:null};
  if(d<0) return {level:'expired',label:'종료 경과',text:'표시된 종료일이 지났습니다. 최신 상태를 다시 확인하세요.',days:d};
  if(d<=3) return {level:'critical',label:'매우 높음',text:d===0?'오늘 혜택 종료 예정입니다.':`${d}일 뒤 혜택 종료 예정입니다.`,days:d};
  if(d<=7) return {level:'high',label:'높음',text:`${d}일 남았습니다. 우선 플레이/라이브러리 추가를 권합니다.`,days:d};
  if(d<=14) return {level:'watch',label:'주의',text:`${d}일 남았습니다. 플레이 계획을 앞당길 만합니다.`,days:d};
  if(d<=30) return {level:'scheduled',label:'일정 확인',text:`${d}일 뒤 종료 예정입니다.`,days:d};
  return {level:'low',label:'여유',text:`확인된 종료일까지 ${d}일 남았습니다.`,days:d};
}
function purchaseAdvice(g, historyOverride=null){
  const score=radarScore(g), risk=plusRisk(g), hist=historicalLowInfo(g,historyOverride);
  const current=Number(g.currentPrice), discount=Number(g.discountPercent)||0;
  const nearLow=Number.isFinite(current)&&Number.isFinite(hist.low)&&current<=hist.low*1.02;
  if(hasPlusBenefit(g)){
    if(g.type==='monthly'||benefitTier(g)==='Essential') return {action:'claim',label:'지금 받기',tone:risk.level==='critical'||risk.level==='high'?'urgent':'plus',priority:98+(risk.days!==null?Math.max(0,14-risk.days):0),reason:risk.days!==null&&risk.days<=14?risk.text:'PS Plus 에센셜 혜택으로 라이브러리에 추가할 수 있습니다.',low:hist.low};
    return {action:'play',label:'지금 플레이',tone:risk.level==='critical'||risk.level==='high'?'urgent':'plus',priority:92+(risk.days!==null?Math.max(0,14-risk.days):0),reason:risk.days!==null&&risk.days<=14?risk.text:`${plusName(benefitTier(g))} 포함. 구독 중이면 추가 구매보다 먼저 플레이해보세요.`,low:hist.low};
  }
  if(isSale(g)){
    if(nearLow&&discount>=25) return {action:'buy',label:'지금 사기',tone:'buy',priority:90+Math.min(10,discount/10),reason:`현재 ${discount}% 할인이며 관측 최저가 수준입니다.`,low:hist.low};
    if(discount>=50) return {action:'buy',label:'지금 사기',tone:'buy',priority:90+Math.min(10,discount/10),reason:`할인폭이 ${discount}%로 큽니다.${hist.observations>=2&&!nearLow?' 다만 역대 관측 최저가는 더 낮았습니다.':''}`,low:hist.low};
    if(Number.isFinite(hist.low)&&Number.isFinite(current)&&hist.observations>=2&&current>hist.low*1.15) return {action:'wait',label:'기다리기',tone:'wait',priority:58,reason:`현재가는 관측 최저가 ${won(hist.low)}보다 높습니다. 급하지 않다면 다음 할인을 기다려보세요.`,low:hist.low};
    if(discount>=30&&score>=75) return {action:'buy',label:'구매 추천',tone:'buy',priority:82+discount/10,reason:`${discount}% 할인에 추천점수 ${score}점입니다.`,low:hist.low};
    return {action:'watch',label:'할인 확인',tone:'watch',priority:65+discount/10,reason:`현재 ${discount}% 할인 중입니다. 종료일과 가격 이력을 함께 확인하세요.`,low:hist.low};
  }
  if(Number.isFinite(hist.low)&&Number.isFinite(current)&&hist.observations>=2&&current>hist.low*1.10) return {action:'wait',label:'기다리기',tone:'wait',priority:54,reason:`현재가는 관측 최저가 ${won(hist.low)}보다 높습니다. 찜해두고 가격 하락을 기다리는 편이 유리합니다.`,low:hist.low};
  if(Number.isFinite(current)) return {action:'wait',label:'기다리기',tone:'wait',priority:48,reason:hist.observations<2?'가격 이력이 더 쌓일 때까지 찜해두는 것을 권합니다.':'현재 뚜렷한 할인 혜택이 없습니다.',low:hist.low};
  return {action:'info',label:'정보 확인',tone:'watch',priority:40,reason:'가격 정보가 충분하지 않아 PS Store 확인이 필요합니다.',low:hist.low};
}
function similarityScore(a,b){
  const ga=new Set((a.genre||[]).filter(x=>x!=='Promo')), gb=new Set((b.genre||[]).filter(x=>x!=='Promo'));
  const overlap=[...ga].filter(x=>gb.has(x)).length, union=new Set([...ga,...gb]).size||1;
  let score=(overlap/union)*70;
  if((a.platform||[]).some(x=>(b.platform||[]).includes(x)))score+=12;
  if(a.ko&&b.ko)score+=6;
  if(benefitTier(a)&&benefitTier(a)===benefitTier(b))score+=5;
  score+=Math.min(7,Math.max(0,(Number(b.rating)||0)-3)*3.5);
  return score;
}
function similarGames(g,limit=3){
  return state.games.map(mergeGame).filter(x=>x.id!==g.id&&x.type!=='promo').map(x=>({...x,_similarity:similarityScore(g,x)})).filter(x=>x._similarity>0).sort((a,b)=>b._similarity-a._similarity||radarScore(b)-radarScore(a)).slice(0,limit);
}
function decisionItems(limit=4){
  return state.games.map(mergeGame).filter(g=>g.type!=='promo').map(g=>({...g,_advice:purchaseAdvice(g)})).sort((a,b)=>b._advice.priority-a._advice.priority||radarScore(b)-radarScore(a)).slice(0,limit);
}
function decisionMarkup(g,historyOverride=null){
  const a=purchaseAdvice(g,historyOverride), r=plusRisk(g), h=historicalLowInfo(g,historyOverride);
  const lowText=h.low!==null?(h.observations>=2?won(h.low):`${won(h.low)} · 이력 축적 중`):'이력 없음';
  return `<div class="decision-box ${a.tone}"><div class="decision-action"><small>PS Radar 판단</small><strong>${esc(a.label)}</strong></div><div class="decision-copy"><b>${esc(a.reason)}</b><span>관측 최저가 ${esc(lowText)}${hasPlusBenefit(g)?` · PS Plus 주의도 ${esc(r.label)}`:''}</span></div></div>`;
}
function similarMarkup(g){
  const items=similarGames(g,3); if(!items.length)return '';
  return `<div class="similar-box"><div class="similar-head"><b>비슷한 게임</b><span>장르 · 플랫폼 · 평점 기준</span></div><div class="similar-list">${items.map(x=>`<button class="similar-card" data-sim-id="${esc(x.id)}"><strong>${esc(x.title)}</strong><small>${esc((x.genre||[]).slice(0,2).join(' · '))} · 추천 ${radarScore(x)}</small><span>›</span></button>`).join('')}</div></div>`;
}

function profileModeText(g){
  const bits=[];
  if(Number(g.playerCount)>0) bits.push(`로컬 ${Number(g.playerCount)}명`);
  if(Number(g.maxOnlinePlayers)>0) bits.push(`온라인 최대 ${Number(g.maxOnlinePlayers)}명`);
  if(!bits.length) return '정보 확인 중';
  return bits.join(' · ');
}
function profileFeatureChips(g){
  const items=[];
  if(g.ps5Pro) items.push('PS5 Pro Enhanced');
  if(g.dualsense) items.push('DualSense 효과');
  if(g.gameHelp) items.push('게임 도움말');
  if(g.onlineOptional) items.push('온라인 선택 사항');
  if(g.onlineRequiresPlus) items.push('온라인 PS Plus 필요');
  if(Number(g.accessibilityCount)>0) items.push(`접근성 ${Number(g.accessibilityCount)}개`);
  return items;
}
function profileMarkup(g){
  const facts=[
    ['출시일',g.releaseDate?String(g.releaseDate).replaceAll('/','.'):'확인 중'],
    ['퍼블리셔',g.publisher||'확인 중'],
    ['장르',g.storeGenre||(g.genre||[]).join(' · ')||'확인 중'],
    ['플레이',profileModeText(g)],
    ['음성',g.voiceLanguages||'확인 중'],
    ['화면 언어',g.screenLanguages||(g.ko?'한국어 지원':'확인 중')]
  ];
  const chips=profileFeatureChips(g);
  return `<div class="profile-box"><div class="profile-head"><div><b>게임 프로필</b><span>PS Store 공식 표기 기반</span></div>${g.fetchedAt?`<small>${formatDateTime(g.fetchedAt)} 확인</small>`:''}</div><div class="profile-grid">${facts.map(([k,v])=>`<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>${chips.length?`<div class="feature-chips">${chips.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</div>`;
}
function mediaImages(g){
  const all=[g.image,...(Array.isArray(g.screenshots)?g.screenshots:[])].filter(Boolean);
  return [...new Set(all)].slice(0,7);
}
function mediaMarkup(g){
  const imgs=mediaImages(g);
  const trailer=g.trailer||`https://www.youtube.com/results?search_query=${encodeURIComponent(g.title+' official trailer PS5')}`;
  if(!imgs.length&&!trailer)return '';
  return `<div class="media-box"><div class="media-head"><div><b>미디어</b><span>${imgs.length>1?'이미지를 눌러 대표 화면 변경':'대표 이미지 · 트레일러'}</span></div><a href="${esc(trailer)}" target="_blank" rel="noopener">▶ 트레일러 보기</a></div>${imgs.length?`<div class="media-strip">${imgs.map((src,i)=>`<button class="media-shot ${i===0?'active':''}" data-shot="${esc(src)}" aria-label="이미지 ${i+1}"><img src="${esc(src)}" alt="${esc(g.title)} 이미지 ${i+1}" loading="lazy" /></button>`).join('')}</div>`:'<div class="media-empty">PS Store 이미지 확인 중</div>'}</div>`;
}
function externalMarkup(g){
  const q=encodeURIComponent(g.title);
  const meta=`https://www.metacritic.com/search/${q}/`;
  const hltb=`https://howlongtobeat.com/?q=${q}`;
  const opencritic=`https://opencritic.com/search/${q}`;
  return `<div class="external-box"><div class="external-head"><div><b>외부 평가 · 플레이타임</b><span>점수를 임의 합산하지 않고 원문 확인 링크로 제공합니다.</span></div></div><div class="external-links"><a href="${esc(meta)}" target="_blank" rel="noopener"><strong>Metacritic</strong><small>평론가·유저 평가 검색</small><span>↗</span></a><a href="${esc(opencritic)}" target="_blank" rel="noopener"><strong>OpenCritic</strong><small>리뷰 평가 검색</small><span>↗</span></a><a href="${esc(hltb)}" target="_blank" rel="noopener"><strong>HowLongToBeat</strong><small>메인·완주 플레이타임 검색</small><span>↗</span></a></div></div>`;
}

async function loadData(manual=false){
  setSync('loading');
  try{
    const baseGames = await loadJSON('./data/games.json');
    const [feedResult,storeResult,eventResult,discoveryResult] = await Promise.allSettled([fetchLive('/api/feed'),fetchLive('/api/store',11000),fetchLive('/api/events',7000),fetchLive('/api/discover',13000)]);
    let feed = feedResult.status==='fulfilled'?feedResult.value:null;
    let store = storeResult.status==='fulfilled'?storeResult.value:null;
    let discovery = discoveryResult.status==='fulfilled'?discoveryResult.value:null;
    const eventPayload = eventResult.status==='fulfilled'?eventResult.value:null;
    state.events = Array.isArray(eventPayload?.items)?eventPayload.items:[];
    if(!feed) feed = await loadJSON('./data/feed.json');
    if(!store) store = await loadJSON('./data/store.json');
    if(!discovery) discovery = await loadJSON('./data/discovery.json');

    state.games = mergeGameIndex(baseGames, discovery.items||[]);
    state.feed = feed.items || [];
    state.syncSource = feed.source || 'unknown'; state.generatedAt = feed.generatedAt || null; state.feedHealth = feed.health || null;
    state.storeSource = store.source || 'unknown'; state.storeGeneratedAt = store.generatedAt || null; state.storeHealth = store.health || null;
    state.discoverySource = discovery.source || 'unknown'; state.discoveryGeneratedAt = discovery.generatedAt || null; state.discoveryHealth = discovery.health || null;
    state.store = new Map((store.items||[]).map(x=>[x.id,x]));
    state.changes = detectChanges(store.items||[]);
    saveLocalHistory(store.items||[]);
    saveSnapshot(store.items||[]);
    resetVisible(); setSync('ok'); render();
    if(manual) toast(state.discoverySource==='official-discovery-live'?`공식 페이지에서 ${state.games.length}개 게임을 새로 확인했습니다.`:'새로고침 완료. 일부 대량 데이터는 내장 스냅샷을 사용합니다.');
  }catch(err){
    console.error(err); setSync('warn');
    if(manual) toast('새로고침에 실패했습니다. 오프라인 캐시를 확인해 주세요.');
  }
}

function detectChanges(items){
  let prev={}; try{prev=JSON.parse(localStorage.getItem('psradar-store-snapshot')||'{}');}catch{}
  const changes=[];
  for(const x of items){
    if(!wish.has(x.id) || !prev[x.id]) continue;
    const p=prev[x.id]; const g=state.games.find(v=>v.id===x.id); const title=g?.title||x.id;
    if(Number.isFinite(x.currentPrice)&&Number.isFinite(p.currentPrice)&&x.currentPrice<p.currentPrice) changes.push({id:x.id,kind:'price',title,text:`${won(p.currentPrice)} → ${won(x.currentPrice)}`});
    if((x.discountPercent||0)>(p.discountPercent||0)) changes.push({id:x.id,kind:'sale',title,text:`${x.discountPercent}% 할인 시작`});
    if(x.plusIncluded&&!p.plusIncluded) changes.push({id:x.id,kind:'plus',title,text:`${plusName(x.plusTier)} 포함`});
    if(!x.plusIncluded&&p.plusIncluded) changes.push({id:x.id,kind:'plus-out',title,text:`${plusName(p.plusTier||'Extra')} 제외`});
  }
  if(changes.length && 'Notification' in window && Notification.permission==='granted'){
    try{new Notification('PS Radar 관심 게임 변화', {body:`${changes[0].title}: ${changes[0].text}${changes.length>1?` 외 ${changes.length-1}건`:''}`});}catch{}
  }
  return changes;
}
function saveSnapshot(items){const obj={};for(const x of items)obj[x.id]={currentPrice:x.currentPrice,discountPercent:x.discountPercent||0,plusIncluded:!!x.plusIncluded,plusTier:x.plusTier||null};localStorage.setItem('psradar-store-snapshot',JSON.stringify(obj));}


async function loadPushConfig(){
  if(window.__PSRADAR_EMBEDDED__) return;
  try{
    const r=await fetch('/api/push-config',{cache:'no-store'}); if(!r.ok)return;
    const cfg=await r.json(); state.push={...state.push,...cfg};
    if('serviceWorker' in navigator && 'PushManager' in window){
      const reg=await navigator.serviceWorker.ready; const sub=await reg.pushManager.getSubscription(); state.push.subscribed=!!sub;
    }
    updatePushUI();
  }catch{updatePushUI();}
}
function updatePushUI(){
  const b=$('#notifyBtn'); if(!b)return;
  if(state.push.subscribed){b.textContent='🔔✓';b.title='백그라운드 알림 사용 중';}
  else if(state.push.enabled){b.textContent='🔔';b.title='백그라운드 알림 설정';}
  else {b.textContent='🔔';b.title='기기 알림';}
  const note=$('#pushStatus'); if(note){note.textContent=state.push.subscribed?'백그라운드 감시 ON':state.push.enabled?'푸시 알림 설정 가능':'로컬 알림 모드';note.classList.toggle('on',state.push.subscribed);}if(state.games.length&&$('#watchNote'))renderRadar();
}
async function syncPushSubscription(){
  if(!state.push.enabled || !('serviceWorker' in navigator) || !('PushManager' in window))return false;
  try{
    const reg=await navigator.serviceWorker.ready; const sub=await reg.pushManager.getSubscription();
    if(!sub)return false;
    await fetch('/api/push-subscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:sub.toJSON(),watchIds:[...wish]})});
    state.push.subscribed=true;updatePushUI();return true;
  }catch{return false;}
}
async function enableBackgroundPush(){
  if(!('Notification' in window)){toast('이 브라우저는 알림을 지원하지 않습니다.');return;}
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted'){toast('알림 권한이 허용되지 않았습니다.');return;}
  if(!state.push.enabled || !('serviceWorker' in navigator) || !('PushManager' in window)){
    toast('현재는 앱 실행 시 로컬 알림으로 동작합니다. 서버 푸시 환경을 연결하면 백그라운드 감시가 활성화됩니다.');return;
  }
  try{
    const reg=await navigator.serviceWorker.ready; let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(state.push.publicKey)});
    const r=await fetch('/api/push-subscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:sub.toJSON(),watchIds:[...wish]})});
    if(!r.ok)throw new Error('구독 저장 실패'); state.push.subscribed=true;updatePushUI();toast('백그라운드 알림이 켜졌습니다. 찜 게임 가격·할인·PS Plus 변화를 자동 감시합니다.');
  }catch(err){console.error(err);toast('푸시 설정에 실패했습니다. 로컬 알림은 계속 사용할 수 있습니다.');}
}
async function loadHistory(id){
  const local=readLocalHistory(id); if(window.__PSRADAR_EMBEDDED__){state.history.set(id,local);return local;}
  try{const r=await fetch(`/api/history?id=${encodeURIComponent(id)}`,{cache:'no-store'});const j=await r.json();const server=Array.isArray(j.items)?j.items:[];const merged=[...server,...local].sort((a,b)=>String(a.at).localeCompare(String(b.at)));const uniq=[];for(const x of merged){const last=uniq[uniq.length-1];if(!last||String(last.at).slice(0,13)!==String(x.at).slice(0,13)||last.currentPrice!==x.currentPrice||last.plusIncluded!==x.plusIncluded)uniq.push(x);}const final=uniq.slice(-90);state.history.set(id,final);return final;}catch{state.history.set(id,local);return local;}
}
function historyMarkup(history=[]){
  if(!history.length)return '<div class="history-empty">가격 이력이 아직 없습니다. 앱을 사용할수록 기록이 쌓입니다.</div>';
  const priced=history.filter(x=>numericOrNull(x.currentPrice)!==null);const values=priced.map(x=>numericOrNull(x.currentPrice));const min=values.length?Math.min(...values):null;const max=values.length?Math.max(...values):null;
  let spark='<div class="spark-empty">가격 데이터 대기 중</div>';
  if(values.length>=2){const w=520,h=92,pad=8,range=Math.max(1,max-min);const pts=priced.map((x,i)=>`${pad+(i/(priced.length-1))*(w-pad*2)},${pad+(1-(Number(x.currentPrice)-min)/range)*(h-pad*2)}`).join(' ');spark=`<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="가격 이력"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
  const latest=history.slice(-5).reverse().map(x=>`<li><span>${formatDate(x.at)}</span><b>${numericOrNull(x.currentPrice)!==null?won(x.currentPrice):x.plusIncluded?plusName(x.plusTier)+' 포함':'가격 미확인'}</b><em>${x.discountPercent?`-${x.discountPercent}%`:x.plusIncluded?'PLUS':'정가'}</em></li>`).join('');
  return `<div class="history-head"><b>가격 · 혜택 이력</b>${min!==null?`<span>관측 최저 ${won(min)}</span>`:''}</div>${spark}<ul class="history-list">${latest}</ul>`;
}

function setSync(mode){
  const b=$('#syncBadge'), sb=$('#storeBadge'), s=$('#sourceStatus');
  if(mode==='loading'){b.textContent='동기화';sb.textContent='가격 확인';b.className=sb.className='syncbadge';s.textContent='PlayStation 공식 데이터 확인 중';return;}
  if(mode==='warn'){b.textContent='오프라인';sb.textContent='오프라인';b.className=sb.className='syncbadge warn';s.textContent='오프라인 캐시 사용 중';return;}
  const feedLive=state.syncSource==='live-api', storeLive=state.storeSource==='store-live', discoveryLive=state.discoverySource==='official-discovery-live';
  b.textContent=feedLive?'LIVE':state.syncSource==='local-fallback'?'대체':'내장'; b.className=`syncbadge ${feedLive?'live':'ok'}`;
  sb.textContent=storeLive?'STORE LIVE':state.storeSource==='store-fallback'?'가격 대체':'가격 스냅샷'; sb.className=`syncbadge ${storeLive?'live':'ok'}`;
  const q=state.discoveryHealth; const quality=q?.verifiedCount!=null?` · 검증 ${q.verifiedCount}/${q.itemCount||state.games.length}`:'';
  s.textContent=discoveryLive?`공식 데이터 LIVE · ${state.games.length}개${quality}`:feedLive&&storeLive?'공식 소식 + PS Store 실시간 연결':feedLive||storeLive?'공식 데이터 일부 실시간 연결':`공식 정보 기반 내장 데이터 · ${state.games.length||0}개`; 
}

function renderChips(){
  $('#chips').innerHTML=chips.map((c,i)=>`<button class="chip ${i===0?'active':''}" data-chip="${c}">${c}</button>`).join('');
  $$('.chip').forEach(c=>c.addEventListener('click',()=>{
    $$('.chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
    const v=c.dataset.chip; state.quick='none'; state.genre='all'; state.korean='all'; state.content='all'; resetVisible();
    if(v==='한국어') state.korean='yes'; else if(v==='할인중') state.view='promo'; else if(v==='체험판'){state.view='all';state.content='trial';} else if(v==='신작'){state.view='all';state.content='latest';} else if(v!=='전체') state.genre=chipMap[v]||v;
    if(!['할인중'].includes(v)&&state.view==='promo') state.view='all';
    renderGames();
  }));
}

function filteredGames(){
  let arr=state.games.map(mergeGame).filter(g=>{
    if(state.view==='catalog'&&g.type!=='catalog')return false;
    if(state.view==='monthly'&&g.type!=='monthly')return false;
    if(state.view==='promo'&&!(g.type==='promo'||isSale(g)))return false;
    if(state.view==='wishlist'&&!wish.has(g.id))return false;
    if(state.content!=='all'&&g.type!==state.content)return false;
    if(state.quick==='new'&&!(g.catalogAddedAt||g.type==='monthly'||g.type==='latest'))return false;
    if(state.quick==='rating'&&!(Number(g.rating)>0))return false;
    if(state.quick==='deal'&&!isSale(g))return false;
    if(state.quick==='ending'){const d=endingDays(g);if(d===null||d>30)return false;}
    if(state.platform!=='all'&&!g.platform.includes(state.platform))return false;
    if(state.tier!=='all'&&g.tier!==state.tier&&g.plusTier!==state.tier)return false;
    if(state.genre!=='all'&&!g.genre.includes(state.genre))return false;
    if(state.korean==='yes'&&!g.ko)return false;
    const q=state.query.trim().toLowerCase();
    if(q){const hay=[g.title,g.desc,g.description,g.publisher,g.storeGenre,g.voiceLanguages,g.screenLanguages,g.type,g.tier,g.plusTier,...g.platform,...g.genre,g.ko?'한국어 한글':'',isSale(g)?'할인 세일':''].filter(Boolean).join(' ').toLowerCase(); if(!hay.includes(q))return false;}
    return true;
  });
  if(state.quick==='new') arr.sort((a,b)=>String(b.catalogAddedAt||b.discoveredAt||'').localeCompare(String(a.catalogAddedAt||a.discoveredAt||''))||radarScore(b)-radarScore(a));
  if(state.quick==='rating') arr.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(b.ratingCount)||0)-(Number(a.ratingCount)||0));
  if(state.quick==='deal') arr.sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0)||radarScore(b)-radarScore(a));
  if(state.quick==='ending') arr.sort((a,b)=>(endingDays(a)??9999)-(endingDays(b)??9999));
  if(state.sort==='discount') arr.sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0));
  if(state.sort==='rating') arr.sort((a,b)=>(b.rating||0)-(a.rating||0));
  if(state.sort==='price') arr.sort((a,b)=>(a.currentPrice??Infinity)-(b.currentPrice??Infinity));
  if(state.sort==='new') arr.sort((a,b)=>String(b.catalogAddedAt||'').localeCompare(String(a.catalogAddedAt||'')));
  if(state.sort==='score') arr.sort((a,b)=>radarScore(b)-radarScore(a));
  return arr;
}

function renderStats(){
  const games=state.games.map(mergeGame);
  const catalog=games.filter(g=>g.type==='catalog').length;
  const deals=games.filter(isSale).length;
  const ending=games.filter(g=>{const d1=daysUntil(g.saleEndsAt),d2=daysUntil(g.plusEndsAt);return (d1!==null&&d1>=0&&d1<=3)||(d2!==null&&d2>=0&&d2<=14);}).length;
  const wishDeals=games.filter(g=>wish.has(g.id)&&(isSale(g)||g.plusIncluded)).length;
  $('#stats').innerHTML=`
    <div class="stat"><strong>${catalog}</strong><span>카탈로그 등록</span><em>Extra / Deluxe</em></div>
    <div class="stat"><strong>${deals}</strong><span>현재 할인</span><em>PS Store</em></div>
    <div class="stat"><strong>${ending}</strong><span>종료 임박</span><em>놓치기 전에</em></div>
    <div class="stat"><strong>${wishDeals}</strong><span>찜 혜택</span><em>${wish.size}개 관심</em></div>`;
}



function endingDays(g){
  const values=[daysUntil(g.saleEndsAt),daysUntil(g.plusEndsAt)].filter(v=>v!==null&&v>=0);
  return values.length?Math.min(...values):null;
}
function curationGroups(){
  const games=state.games.map(mergeGame).filter(g=>g.type!=='promo');
  const recent=[...games].filter(g=>g.catalogAddedAt||g.type==='monthly'||g.type==='latest').sort((a,b)=>String(b.catalogAddedAt||b.discoveredAt||'').localeCompare(String(a.catalogAddedAt||a.discoveredAt||''))||radarScore(b)-radarScore(a)).slice(0,4);
  const rated=[...games].filter(g=>Number(g.rating)>0).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(b.ratingCount)||0)-(Number(a.ratingCount)||0)).slice(0,4);
  const deals=[...games].filter(isSale).sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0)||radarScore(b)-radarScore(a)).slice(0,4);
  const ending=[...games].map(g=>({...g,_ending:endingDays(g)})).filter(g=>g._ending!==null&&g._ending<=30).sort((a,b)=>a._ending-b._ending).slice(0,4);
  return [
    {key:'new',title:'신규',eyebrow:'NEW',items:recent,empty:'최근 추가 게임 데이터가 없습니다.'},
    {key:'rating',title:'최고평점',eyebrow:'TOP RATED',items:rated,empty:'평점 데이터가 아직 충분하지 않습니다.'},
    {key:'deal',title:'할인추천',eyebrow:'DEALS',items:deals,empty:'현재 감지된 할인 게임이 없습니다.'},
    {key:'ending',title:'곧 종료',eyebrow:'ENDING',items:ending,empty:'30일 안에 종료 예정인 혜택이 없습니다.'}
  ];
}
function curationMeta(g,key){
  if(key==='rating') return g.rating?`★ ${Number(g.rating).toFixed(2)} · ${Number(g.ratingCount||0).toLocaleString('ko-KR')}명`:'평점 확인 중';
  if(key==='deal') return isSale(g)?`${g.discountPercent}% 할인 · ${won(g.currentPrice)}`:'할인 확인 중';
  if(key==='ending'){const d=endingDays(g);return d===0?'오늘 종료':d!==null?`${d}일 남음`:'일정 확인';}
  return g.catalogAddedAt?`${formatDate(g.catalogAddedAt)} 추가`:g.type==='monthly'?'월간 게임':g.type==='latest'?'PS Store 최신':'최근 추가';
}
function activateCuration(key){
  state.quick=key; state.content='all'; state.sort='default'; state.view=key==='deal'?'promo':'all'; resetVisible();
  $$('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.view===state.view));
  renderGames();
  document.querySelector('#grid')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderCurations(){
  const host=$('#curationGrid'); if(!host)return;
  const groups=curationGroups();
  host.innerHTML=groups.map(group=>`<article class="curation-panel"><div class="curation-head"><div><span>${group.eyebrow}</span><b>${group.title}</b></div><button data-curation="${group.key}">전체 보기 ›</button></div><div class="curation-list">${group.items.length?group.items.map(g=>`<button class="curation-item" data-id="${esc(g.id)}"><span class="curation-thumb" style="--c1:${esc(g.c1)};--c2:${esc(g.c2)}">${g.image?`<img src="${esc(g.image)}" alt="" loading="lazy" />`:''}</span><span class="curation-copy"><strong>${esc(g.title)}</strong><small>${esc(curationMeta(g,group.key))}</small></span><span class="curation-arrow">›</span></button>`).join(''):`<div class="curation-empty">${group.empty}</div>`}</div></article>`).join('');
  $$('#curationGrid [data-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
  $$('#curationGrid [data-curation]').forEach(b=>b.addEventListener('click',()=>activateCuration(b.dataset.curation)));
  const cov=profileCoverage(); const label=$('#profileCoverage'); if(label){const live=state.discoverySource==='official-discovery-live'?'LIVE':'SNAPSHOT';label.textContent=`${state.games.length}개 · ${live} · 상세 ${cov.ready}/${cov.total}`;}
}
function renderDecisions(){
  const host=$('#decisionStrip'); if(!host)return; const items=decisionItems(4);
  host.innerHTML=items.length?items.map(g=>{const a=g._advice,r=plusRisk(g);return `<button class="decision-card ${a.tone}" data-id="${esc(g.id)}"><span class="decision-label">${esc(a.label)}</span><strong>${esc(g.title)}</strong><small>${esc(a.reason)}</small><em>${a.low!==null?`관측 최저 ${won(a.low)}`:hasPlusBenefit(g)?`${plusName(benefitTier(g))} 혜택`:'가격 이력 축적 중'}${hasPlusBenefit(g)&&r.days!==null?` · ${r.days}일 남음`:''}</em></button>`;}).join(''):'<div class="empty">판단할 게임 데이터가 아직 없습니다.</div>';
  $$('#decisionStrip [data-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
}

function renderPersonal(){
  const host=$('#personalStrip'), note=$('#personalNote'); if(!host)return;
  const recs=topRecommendations(4); const profile=genreProfile();
  host.innerHTML=recs.length?recs.map(g=>`<button class="recommend-card" data-id="${esc(g.id)}"><span class="score-orb"><b>${g._score}</b><small>RADAR</small></span><span class="recommend-copy"><strong>${esc(g.title)}</strong><small>${esc(recommendationReasons(g))}</small></span><span class="recommend-arrow">›</span></button>`).join(''):'<div class="empty">추천할 게임 데이터가 아직 없습니다.</div>';
  $$('#personalStrip [data-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
  if(note){
    if(profile.total){const top=[...profile.counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);note.textContent=`♥ 찜한 게임에서 ${top.join(' · ')} 취향을 감지해 추천합니다.`;}
    else note.textContent='♥를 눌러 관심 게임을 쌓으면 장르 취향이 추천 점수에 반영됩니다.';
  }
}
function catalogTimelineItems(){
  const out=[];
  for(const e of state.events||[]){
    if(!['plus-in','plus-out'].includes(e.kind))continue;
    out.push({at:e.at,title:e.title||e.id,kind:e.kind,tier:e.tier||null,id:e.id});
  }
  for(const g of state.games){
    if(g.type==='catalog'&&g.catalogAddedAt)out.push({at:g.catalogAddedAt,title:g.title,kind:'plus-in',tier:g.tier,id:g.id,seed:true});
  }
  const key=x=>`${x.kind}|${x.id}|${String(x.at).slice(0,10)}`;
  return [...new Map(out.map(x=>[key(x),x])).values()].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,12);
}
function renderCatalogTimeline(){
  const host=$('#catalogTimeline'); if(!host)return; const items=catalogTimelineItems();
  host.innerHTML=items.length?items.map(x=>`<button class="timeline-row ${x.kind==='plus-out'?'out':'in'}" data-id="${esc(x.id||'')}"><span class="timeline-date">${formatDate(x.at)}</span><span class="timeline-dot"></span><span class="timeline-copy"><b>${esc(x.title)}</b><small>${x.kind==='plus-out'?'PS Plus 카탈로그 제외':`${plusName(x.tier||'Extra')} 편입`}</small></span><span class="timeline-state">${x.kind==='plus-out'?'OUT':'IN'}</span></button>`).join(''):'<div class="empty">카탈로그 변화 이력이 아직 없습니다.</div>';
  $$('#catalogTimeline [data-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
}
function radarItems(){
  const games=state.games.map(mergeGame); const out=[];
  for(const c of state.changes.slice(0,3)) out.push({tone:'hot',icon:'↘',title:`${c.title} 변동`,text:c.text,id:c.id});
  for(const g of games.filter(x=>wish.has(x.id)&&isSale(x)).slice(0,3)) out.push({tone:'hot',icon:'%',title:`${g.title} 할인`,text:`${g.discountPercent}% · ${won(g.currentPrice)}`,id:g.id});
  for(const g of games){
    const ds=daysUntil(g.saleEndsAt); if(ds!==null&&ds>=0&&ds<=3) out.push({tone:'warn',icon:'⏳',title:`${g.title} 할인 종료 임박`,text:ds===0?'오늘 종료':`${ds}일 남음`,id:g.id});
    const dp=daysUntil(g.plusEndsAt); if(dp!==null&&dp>=0&&dp<=14) out.push({tone:'warn',icon:'−',title:`${g.title} PS Plus 종료 예정`,text:dp===0?'오늘 종료':`${dp}일 남음`,id:g.id});
  }
  const recent=games.filter(g=>{const d=daysUntil(g.catalogAddedAt); return g.catalogAddedAt && d!==null && d<=0 && d>=-14;}).slice(0,2);
  for(const g of recent) out.push({tone:'new',icon:'＋',title:`${g.title} 카탈로그 신규`,text:`${formatDate(g.catalogAddedAt)} 추가`,id:g.id});
  return [...new Map(out.map(x=>[`${x.title}|${x.text}`,x])).values()].slice(0,8);
}
function renderRadar(){
  const items=radarItems();
  $('#radarStrip').innerHTML=items.length?items.map(x=>`<button class="radar-card ${x.tone}" data-id="${esc(x.id||'')}"><span class="radar-icon">${x.icon}</span><span><b>${esc(x.title)}</b><small>${esc(x.text)}</small></span></button>`).join(''):'<div class="empty">현재 감지된 종료 임박·가격 변동이 없습니다.</div>';
  $$('#radarStrip [data-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
  $('#storeUpdated').textContent=state.storeGeneratedAt?formatDateTime(state.storeGeneratedAt):'';
  $('#watchNote').textContent=wish.size?(state.push.subscribed?`♥ 관심 게임 ${wish.size}개를 백그라운드에서도 감시합니다.`:`♥ 관심 게임 ${wish.size}개를 앱 실행 시 비교합니다. 🔔를 눌러 백그라운드 알림을 설정하세요.`):'관심 게임의 ♥를 눌러 가격·할인·PS Plus 편입 변화를 추적하세요.';
}

function kindLabel(k){return ({catalog:'카탈로그',monthly:'월간 게임',promotion:'프로모션','store-sale':'PS Store 세일',news:'공식 소식'})[k]||'공식 소식';}
function renderFeed(){
  const items=[...state.feed].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);
  $('#feedStrip').innerHTML=items.length?items.map(x=>`<article class="feed-card"><div><span class="kind">${kindLabel(x.kind)}</span><h4>${esc(x.title)}</h4><p>${esc(x.summary||'PlayStation 공식 업데이트입니다.')}</p></div><div class="feed-bottom"><time>${formatDate(x.date)}</time><a href="${esc(x.url)}" target="_blank" rel="noopener">공식 글 보기 →</a></div></article>`).join(''):'<div class="empty">공식 업데이트 데이터가 없습니다.</div>';
  const src=state.syncSource==='live-api'?'실시간':state.syncSource==='local-fallback'?'대체':'내장';
  $('#updated').textContent=state.generatedAt?`${src} · ${formatDateTime(state.generatedAt)}`:src;
}

function priceMarkup(g){
  if(g.type==='promo') return {main:g.price||'프로모션',sub:g.tag||''};
  if(g.plusIncluded){
    const purchase=numericOrNull(g.currentPrice)!==null?`구매가 ${won(g.currentPrice)}`:'';
    const sale=isSale(g)?` · ${g.discountPercent}% 할인`:'';
    return {main:`${plusName(g.plusTier||g.tier)} 포함`,sub:`${purchase}${sale}`.trim()};
  }
  if(isSale(g)) return {main:`${won(g.currentPrice)} · ${g.discountPercent}%↓`,sub:`정가 ${won(g.originalPrice)}${g.saleEndsAt?` · ${formatDate(g.saleEndsAt)}까지`:''}`};
  if(numericOrNull(g.currentPrice)!==null) return {main:won(g.currentPrice),sub:g.tag||''};
  return {main:g.price||'',sub:g.tag||''};
}

function renderGames(){
  const all=filteredGames(), arr=all.slice(0,state.visibleCount); const names={all:'추천 / 신규',catalog:'PS Plus 카탈로그',monthly:'월간 게임',promo:'할인 / 프로모션',wishlist:'찜한 게임'}; const quickNames={new:'신규 게임',rating:'최고평점',deal:'할인추천',ending:'곧 종료'}; const contentNames={trial:'게임 체험판',classic:'클래식 카탈로그',latest:'PS Store 신작'};
  $('#listTitle').textContent=contentNames[state.content]||quickNames[state.quick]||names[state.view]||'추천 / 신규'; $('#countText').textContent=all.length>arr.length?`${arr.length} / ${all.length}개`:`${all.length}개`;
  const grid=$('#grid'); grid.innerHTML='';
  const more=$('#loadMoreBtn'); if(more){more.hidden=all.length<=arr.length;more.textContent=`더 보기 · ${Math.min(state.pageSize,Math.max(0,all.length-arr.length))}개`;more.dataset.total=String(all.length);}
  if(!all.length){grid.innerHTML='<div class="empty">조건에 맞는 항목이 없습니다.</div>';return;}
  const tpl=$('#gameCardTpl');
  arr.forEach(g=>{
    const n=tpl.content.cloneNode(true); const card=n.querySelector('.card'); card.dataset.id=g.id;
    const cover=n.querySelector('.cover'); cover.style.setProperty('--c1',g.c1); cover.style.setProperty('--c2',g.c2);
    const img=n.querySelector('.cover-image'); if(g.image){img.src=g.image;img.alt=`${g.title} 커버`;cover.classList.add('has-image');} else img.remove();
    n.querySelector('.cover-kicker').textContent=typeLabel(g);
    n.querySelector('.cover-title').textContent=g.title; n.querySelector('.game-title').textContent=g.title; n.querySelector('.game-desc').textContent=g.desc;
    const flag=n.querySelector('.deal-flag'); if(isSale(g)){flag.textContent=`-${g.discountPercent}%`;flag.classList.add('show');} else if(g.plusIncluded){flag.textContent='PLUS';flag.classList.add('show','plus');}
    const meta=n.querySelector('.meta'); const typeClass=typeBadgeClass(g);
    meta.innerHTML=`<span class="badge ${typeClass}">${esc(typeDisplay(g))}</span>${g.platform.length?`<span class="badge ps">${esc(g.platform.join(' / '))}</span>`:''}${g.ko?'<span class="badge">한국어</span>':''}${g.dataQuality==='verified'?'<span class="badge quality">공식확인</span>':''}`;
    const rating=n.querySelector('.rating-line'); const score=radarScore(g); const advice=purchaseAdvice(g); rating.innerHTML=`<span class="score-pill">추천 ${score}</span><span class="advice-pill ${advice.tone}">${esc(advice.label)}</span>${g.rating?` ★ ${Number(g.rating).toFixed(2)} <span>${g.ratingCount?Number(g.ratingCount).toLocaleString('ko-KR')+'명 평가':''}</span>`:' <span>스토어 평점 확인 중</span>'}`;
    const p=priceMarkup(g); n.querySelector('.price').textContent=p.main; n.querySelector('.sub').textContent=p.sub;
    const heart=n.querySelector('.heart'); heart.dataset.id=g.id; heart.textContent=wish.has(g.id)?'♥':'♡'; heart.classList.toggle('on',wish.has(g.id));
    heart.addEventListener('click',(e)=>{e.stopPropagation();toggleWish(g.id);});
    n.querySelector('.detailbtn').addEventListener('click',(e)=>{e.stopPropagation();openDetail(g.id);});
    card.addEventListener('click',()=>openDetail(g.id)); grid.appendChild(n);
  });
}

function toggleWish(id){wish.has(id)?wish.delete(id):wish.add(id);localStorage.setItem('psradar-wish',JSON.stringify([...wish]));render();syncPushSubscription();}

async function openDetail(id,allowHydrate=true){
  const base=state.games.find(g=>g.id===id); if(!base)return;
  const g=mergeGame(base), p=priceMarkup(g), h=historicalLowInfo(g), r=plusRisk(g);
  const image=g.image?`<div class="detail-hero-wrap"><img class="detail-hero-img" src="${esc(g.image)}" alt="${esc(g.title)}" /></div>`:`<div class="detail-hero-fallback" style="--c1:${esc(g.c1)};--c2:${esc(g.c2)}"><b>${esc(g.title)}</b></div>`;
  const longDesc=g.description&&g.description!==g.desc?`<p class="detail-longdesc">${esc(g.description)}</p>`:'';
  $('#detailContent').innerHTML=`${image}<div class="detail-body"><div class="meta"><span class="badge ${typeBadgeClass(g)}">${esc(typeDisplay(g))}</span>${g.platform.length?`<span class="badge ps">${esc(g.platform.join(' / '))}</span>`:''}${g.ko?'<span class="badge">한국어</span>':''}</div><h2>${esc(g.title)}</h2><p class="detail-desc">${esc(g.desc)}</p>${longDesc}<div class="detail-price"><strong>${esc(p.main)}</strong><span>${esc(p.sub)}</span></div><div class="detail-grid"><div><small>스토어 평점</small><b>${g.rating?`★ ${Number(g.rating).toFixed(2)}`:'확인 중'}</b></div><div><small>평가 수</small><b>${g.ratingCount?`${Number(g.ratingCount).toLocaleString('ko-KR')}명`:'-'}</b></div><div><small>관측 최저가</small><b id="detailLow">${h.low!==null?won(h.low):'-'}</b></div><div><small>PS Plus 주의도</small><b class="risk-${esc(r.level)}">${hasPlusBenefit(g)?esc(r.label):'-'}</b></div></div>${profileMarkup(g)}${mediaMarkup(g)}<div id="decisionBox">${decisionMarkup(g)}</div><div class="score-box"><div><small>PS Radar 추천점수</small><strong>${radarScore(g)}<em>/100</em></strong></div><div><b>${radarScoreLabel(radarScore(g))}</b><span>${esc(recommendationReasons(g))}</span></div></div><div id="historyBox" class="history-box"><div class="history-empty">가격 이력 불러오는 중…</div></div>${similarMarkup(g)}${externalMarkup(g)}<div class="detail-actions"><button id="modalWish" class="secondary">${wish.has(g.id)?'♥ 찜 해제':'♡ 관심 게임 찜'}</button><a class="primary-link" href="${esc(g.store)}" target="_blank" rel="noopener">PS Store에서 보기</a></div></div>`;
  $('#modalWish').addEventListener('click',()=>{toggleWish(g.id);openDetail(g.id);});
  $$('#detailContent [data-sim-id]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.simId)));
  $$('#detailContent [data-shot]').forEach(b=>b.addEventListener('click',()=>{const hero=$('#detailContent .detail-hero-img');if(hero)hero.src=b.dataset.shot;$$('#detailContent [data-shot]').forEach(x=>x.classList.toggle('active',x===b));}));
  $('#detailModal').classList.add('show'); $('#detailModal').setAttribute('aria-hidden','false');
  const history=await loadHistory(g.id); const box=$('#historyBox'); if(box)box.innerHTML=historyMarkup(history);
  const low=historicalLowInfo(g,history); const lowEl=$('#detailLow'); if(lowEl)lowEl.textContent=low.low!==null?won(low.low):'-';
  const decision=$('#decisionBox'); if(decision)decision.innerHTML=decisionMarkup(g,history);
  if(allowHydrate&&needsProfile(g)){const updated=await hydrateGameProfile(g.id);if(updated)openDetail(g.id,false);}
}

function closeDetail(){$('#detailModal').classList.remove('show');$('#detailModal').setAttribute('aria-hidden','true');}

function render(){renderStats();renderCurations();renderDecisions();renderPersonal();renderRadar();renderFeed();renderCatalogTimeline();renderGames();setSync('ok');}
function setView(v){state.view=v; state.quick='none'; state.content='all'; resetVisible(); if($('#contentType'))$('#contentType').value='all'; $$('.navbtn').forEach(x=>x.classList.toggle('active',x.dataset.view===v));renderGames();window.scrollTo({top:0,behavior:'smooth'});}
function toast(msg){let t=document.createElement('div');t.textContent=msg;t.className='toast';document.body.appendChild(t);setTimeout(()=>t.remove(),2400);}

async function requestNotifications(){return enableBackgroundPush();}

function bind(){
  renderChips();
  $$('.navbtn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#search').addEventListener('input',e=>{state.query=e.target.value;resetVisible();renderGames();});
  $('#clearBtn').addEventListener('click',()=>{state.view='all';state.quick='none';state.content='all';state.query='';state.platform='all';state.tier='all';state.genre='all';state.korean='all';state.sort='default';resetVisible();$('#search').value='';$$('.chip').forEach((x,i)=>x.classList.toggle('active',i===0));$$('.navbtn').forEach((x,i)=>x.classList.toggle('active',i===0));['platform','tier','genre','korean','sort','contentType'].forEach(id=>{const el=$('#'+id);if(el)el.value=id==='sort'?'default':'all';});render();});
  $('#filterBtn').addEventListener('click',()=>{$('#drawer').classList.add('show');$('#drawer').setAttribute('aria-hidden','false');});
  $('#closeDrawer').addEventListener('click',closeDrawer); $('#drawer').addEventListener('click',e=>{if(e.target.id==='drawer')closeDrawer();});
  $('#applyFilter').addEventListener('click',()=>{state.quick='none';state.content=$('#contentType')?.value||'all';state.platform=$('#platform').value;state.tier=$('#tier').value;state.genre=$('#genre').value;state.korean=$('#korean').value;state.sort=$('#sort').value;resetVisible();closeDrawer();renderGames();});
  $('#refreshBtn').addEventListener('click',()=>loadData(true)); $('#notifyBtn').addEventListener('click',requestNotifications); $('#loadMoreBtn')?.addEventListener('click',()=>{state.visibleCount+=state.pageSize;renderGames();});
  $('#closeDetail').addEventListener('click',closeDetail); $('#detailModal').addEventListener('click',e=>{if(e.target.id==='detailModal')closeDetail();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeDetail();}});
}
function closeDrawer(){$('#drawer').classList.remove('show');$('#drawer').setAttribute('aria-hidden','true');}

bind();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(()=>loadPushConfig()).catch(console.warn);else loadPushConfig();
loadData();
