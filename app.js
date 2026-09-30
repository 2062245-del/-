const $ = (id) => document.getElementById(id);
const FALLBACK_RATE = 0.052;
let vndToKrw = Number(localStorage.getItem('tm_fx_rate')) || FALLBACK_RATE;
let currentPhraseCategory = '기본';
let lastResult = { text:'', lang:'vi', pronunciation:'' };

const LANG = {
  ko:{name:'한국어', badge:'🇰🇷 한국어', locale:'ko-KR'},
  en:{name:'영어', badge:'🇺🇸 영어', locale:'en-US'},
  vi:{name:'베트남어', badge:'🇻🇳 베트남어', locale:'vi-VN'}
};

const PHRASES = [
  ['기본','안녕하세요','Xin chào'],['기본','감사합니다','Cảm ơn bạn'],['기본','죄송합니다','Xin lỗi'],['기본','도와주세요','Xin hãy giúp tôi'],
  ['공항','탑승구가 어디예요?','Cổng lên máy bay ở đâu?'],['공항','수하물 찾는 곳이 어디예요?','Khu nhận hành lý ở đâu?'],
  ['택시','이 주소로 가주세요','Vui lòng đưa tôi đến địa chỉ này'],['택시','미터기를 켜주세요','Vui lòng bật đồng hồ tính tiền'],['택시','여기에서 세워주세요','Vui lòng dừng ở đây'],
  ['호텔','체크인하고 싶어요','Tôi muốn nhận phòng'],['호텔','와이파이 비밀번호가 뭐예요?','Mật khẩu Wi-Fi là gì?'],['호텔','짐을 맡길 수 있나요?','Tôi có thể gửi hành lý ở đây không?'],
  ['식당','메뉴판을 보여주세요','Cho tôi xem thực đơn với'],['식당','고수는 빼주세요','Làm ơn đừng cho rau mùi'],['식당','맵지 않게 해주세요','Làm ơn đừng làm cay'],['식당','물 주세요','Cho tôi xin nước'],['식당','계산할게요','Cho tôi thanh toán'],
  ['쇼핑','이거 얼마예요?','Cái này bao nhiêu tiền?'],['쇼핑','조금 할인해 주실 수 있나요?','Có thể giảm giá một chút không?'],['쇼핑','카드 결제되나요?','Có thanh toán bằng thẻ được không?'],
  ['마사지','조금 약하게 해주세요','Làm nhẹ hơn một chút nhé'],['마사지','여기가 아파요','Chỗ này đau'],
  ['응급','가까운 병원이 어디예요?','Bệnh viện gần nhất ở đâu?'],['응급','경찰을 불러주세요','Vui lòng gọi cảnh sát'],['응급','지갑을 잃어버렸어요','Tôi bị mất ví']
];

const OPTIMIZED = new Map([
  ['ko|vi|안녕하세요','Xin chào'],['ko|vi|감사합니다','Cảm ơn'],['ko|vi|얼마예요?','Bao nhiêu tiền?'],['ko|vi|어디에 있나요?','Ở đâu?'],['ko|vi|도와주세요','Xin hãy giúp tôi'],
  ['ko|en|안녕하세요','Hello'],['ko|en|감사합니다','Thank you'],['ko|en|얼마예요?','How much is it?'],['ko|en|어디에 있나요?','Where is it?'],['ko|en|도와주세요','Please help me'],
  ['en|ko|nice to meet you','만나서 반가워요'],['en|ko|hello','안녕하세요'],['en|ko|thank you','감사합니다'],
  ['vi|ko|xin chào','안녕하세요'],['vi|ko|cảm ơn','감사합니다']
]);

const EN_FULL = new Map([
  ['hello','헬로'],['nice to meet you','나이스 투 미트 유'],['nice to meet you.','나이스 투 미트 유'],['thank you','땡큐'],['thank you.','땡큐'],
  ['how much is it?','하우 머치 이즈 잇?'],['how much is it','하우 머치 이즈 잇?'],['where is it?','웨어 이즈 잇?'],['where is it','웨어 이즈 잇?'],
  ['please help me','플리즈 헬프 미'],['please help me.','플리즈 헬프 미'],['where is the restroom?','웨어 이즈 더 레스트룸?'],['where is the restroom','웨어 이즈 더 레스트룸?'],
  ['i would like this','아이 우드 라이크 디스'],['can you help me?','캔 유 헬프 미?'],['can you help me','캔 유 헬프 미?']
]);
const EN_WORDS = {
  hello:'헬로',hi:'하이',nice:'나이스',to:'투',meet:'미트',you:'유',thank:'땡크',thanks:'땡스',please:'플리즈',help:'헬프',me:'미',
  how:'하우',much:'머치',is:'이즈',it:'잇',where:'웨어',the:'더',restroom:'레스트룸',bathroom:'배스룸',i:'아이',would:'우드',like:'라이크',this:'디스',that:'댓',
  can:'캔',we:'위',go:'고',here:'히어',there:'데어',water:'워터',hotel:'호텔',airport:'에어포트',taxi:'택시',card:'카드',cash:'캐시',price:'프라이스',
  sorry:'쏘리',good:'굿',morning:'모닝',night:'나이트',yes:'예스',no:'노',one:'원',two:'투',three:'쓰리',four:'포',five:'파이브'
};
const VI_FULL = new Map([
  ['xin chào','씬 짜오'],['cảm ơn','깜 언'],['bao nhiêu tiền?','바오 니에우 띠엔?'],['bao nhiêu tiền','바오 니에우 띠엔?'],['ở đâu?','어 더우?'],['ở đâu','어 더우?'],
  ['xin hãy giúp tôi','씬 하이 줍 또이'],['nhà vệ sinh ở đâu?','냐 베 씬 어 더우?'],['nhà vệ sinh ở đâu','냐 베 씬 어 더우?'],['tôi muốn cái này','또이 무온 까이 나이'],
  ['không cay','콩 까이'],['tính tiền giúp tôi','띤 띠엔 줍 또이']
]);
const VI_WORDS = {
  xin:'씬','chào':'짜오','cảm':'깜','ơn':'언','bao':'바오','nhiêu':'니에우','tiền':'띠엔','ở':'어','đâu':'더우','tôi':'또이','muốn':'무온','không':'콩','có':'꺼','vâng':'벙','được':'드억','giúp':'줍','hãy':'하이','với':'버이','bạn':'반','đi':'디','đến':'덴','đây':'더이','đó':'도','này':'나이','kia':'끼아','đường':'드엉','trái':'짜이','phải':'파이','thẳng':'탕','dừng':'증','xe':'쎄','taxi':'딱시','sân':'썬','bay':'바이','khách':'카익','sạn':'산','nhà':'냐','hàng':'항','ăn':'안','uống':'우옹','nước':'느억','cơm':'껌','phở':'퍼','cà':'까','phê':'페','bia':'비아','ngon':'응온','cay':'까이','ít':'잇','nhiều':'니에우','một':'못','hai':'하이','ba':'바','bốn':'본','năm':'남','sáu':'싸우','bảy':'바이','tám':'땀','chín':'찐','mười':'므어이','đồng':'동','nghìn':'응인','triệu':'찌에우','mua':'무아','bán':'반','giá':'자','rẻ':'제','đắt':'닷','hóa':'호아','đơn':'던','thẻ':'테','mặt':'맛','vệ':'베','sinh':'씬','bệnh':'베인','viện':'비엔','đau':'다우','thuốc':'투옥','tính':'띤','cho':'쩌','làm':'람','vui':'부이','lòng':'롱','gọi':'고이','cảnh':'까잉','sát':'쌋','mất':'멋','ví':'비','thanh':'타잉','toán':'또안','bật':'벗','đồng':'동','hồ':'호','phòng':'퐁'
};

function normalized(s){ return s.trim().toLowerCase().replace(/\s+/g,' '); }
function formatVnd(n){ return `${Math.round(Number(n)||0).toLocaleString('ko-KR')}₫`; }
function formatKrw(n){ return `${Math.round(Number(n)||0).toLocaleString('ko-KR')}원`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function pronunciation(text, lang){
  if(!text || lang==='ko') return '';
  const key = normalized(text);
  if(lang==='en'){
    if(EN_FULL.has(key)) return EN_FULL.get(key);
    const tokens = key.split(/\s+/); const out=[];
    for(const t of tokens){ const punct = /[?!.,]$/.test(t)?t.slice(-1):''; const core=t.replace(/[^a-z']/gi,'').toLowerCase(); if(!core) continue; if(!EN_WORDS[core]) return ''; out.push(EN_WORDS[core]+punct); }
    return out.join(' ');
  }
  if(lang==='vi'){
    if(VI_FULL.has(key)) return VI_FULL.get(key);
    const tokens = key.split(/\s+/); const out=[];
    for(const t of tokens){ const punct = /[?!.,]$/.test(t)?t.slice(-1):''; const core=t.replace(/[?!.,]/g,'').toLowerCase(); if(!core) continue; if(VI_WORDS[core]) out.push(VI_WORDS[core]+punct); else out.push(vietnameseApprox(core)+punct); }
    return out.join(' ').trim();
  }
  return '';
}

function vietnameseApprox(word){
  let n=word.toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const pairs=[['ngh','응'],['ng','응'],['nh','니'],['ch','치'],['tr','쯔'],['th','트'],['ph','프'],['kh','크'],['gi','지'],['qu','꾸']];
  let out='';
  for(let i=0;i<n.length;){ let hit=false; for(const [a,b] of pairs){ if(n.startsWith(a,i)){out+=b;i+=a.length;hit=true;break;} } if(hit) continue; const c=n[i++]; out+=({a:'아',b:'브',c:'끄',d:'드',e:'에',f:'프',g:'그',h:'흐',i:'이',j:'지',k:'끄',l:'르',m:'므',n:'느',o:'오',p:'브',q:'꾸',r:'르',s:'스',t:'뜨',u:'우',v:'브',w:'우',x:'쓰',y:'이'}[c]||''); }
  return out;
}

async function translate(){
  const text=$('sourceText').value.trim(); const from=$('sourceLang').value; const to=$('targetLang').value;
  if(!text){ setStatus('번역할 문장을 입력해 주세요.','error'); return; }
  if(from===to){ applyResult(text,to); setStatus('같은 언어라 원문을 그대로 표시했습니다.','success'); return; }
  const optKey=`${from}|${to}|${normalized(text)}`;
  if(OPTIMIZED.has(optKey)){ applyResult(OPTIMIZED.get(optKey),to); setStatus('여행회화 표현으로 바로 번역했습니다.','success'); return; }
  const phrase = PHRASES.find(p=>from==='ko'&&to==='vi'&&normalized(p[1])===normalized(text));
  if(phrase){ applyResult(phrase[2],to); setStatus('여행회화 표현으로 바로 번역했습니다.','success'); return; }
  if(!navigator.onLine){ setStatus('오프라인에서는 저장된 여행회화만 번역할 수 있습니다.','error'); return; }
  setStatus('번역 중…'); $('translateButton').disabled=true;
  try{
    const url=`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const r=await fetch(url,{headers:{'Accept':'application/json'}}); if(!r.ok) throw new Error('network');
    const data=await r.json(); const translated=data?.responseData?.translatedText;
    if(!translated) throw new Error('empty');
    applyResult(decodeEntities(translated),to); setStatus('온라인 번역 완료','success');
  }catch(e){ setStatus('번역 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.','error'); }
  finally{$('translateButton').disabled=false;}
}
function decodeEntities(s){ const t=document.createElement('textarea'); t.innerHTML=s; return t.value; }
function applyResult(text,lang){ const pron=pronunciation(text,lang); lastResult={text,lang,pronunciation:pron}; $('resultText').textContent=text; $('resultLangName').textContent=LANG[lang].name; $('pronunciation').textContent=pron; $('pronunciation').classList.toggle('hidden',!pron); $('resultArea').classList.remove('hidden'); updateBadge(); speak(text,lang); }
function setStatus(msg,type=''){ $('translationStatus').textContent=msg; $('translationStatus').className=`status-line ${type}`.trim(); }
function updateBadge(){ $('targetBadge').textContent=LANG[$('targetLang').value].badge; }

function speak(text,lang){ if(!('speechSynthesis'in window)||!text)return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang=LANG[lang]?.locale||lang; const voices=speechSynthesis.getVoices(); const prefix=u.lang.toLowerCase().slice(0,2); const candidates=voices.filter(v=>v.lang.toLowerCase().startsWith(prefix)); u.voice=candidates.find(v=>/premium|enhanced|siri/i.test(v.name))||candidates[0]||null; u.rate=lang==='vi'?0.9:0.94; speechSynthesis.speak(u); }

function initSpeechInput(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){ $('micButton').title='이 브라우저에서는 음성 입력을 지원하지 않습니다'; $('micButton').addEventListener('click',()=>setStatus('Safari 버전에 따라 음성 입력이 지원되지 않을 수 있습니다. 직접 입력해 주세요.','error')); return; }
  const rec=new Recognition(); rec.interimResults=false; rec.maxAlternatives=1;
  $('micButton').addEventListener('click',()=>{ rec.lang=LANG[$('sourceLang').value].locale; $('micButton').classList.add('listening'); try{rec.start();setStatus('듣고 있어요…')}catch(e){} });
  rec.onresult=(e)=>{ $('sourceText').value=e.results[0][0].transcript; setStatus('음성 입력 완료','success'); $('micButton').classList.remove('listening'); };
  rec.onerror=()=>{ setStatus('음성을 인식하지 못했습니다. 다시 말해 주세요.','error'); $('micButton').classList.remove('listening'); };
  rec.onend=()=> $('micButton').classList.remove('listening');
}

function renderPhrases(){
  const cats=[...new Set(PHRASES.map(p=>p[0]))]; $('phraseCategories').innerHTML=cats.map(c=>`<button class="chip ${c===currentPhraseCategory?'active':''}" data-cat="${c}">${c}</button>`).join('');
  $('phraseCategories').querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{currentPhraseCategory=b.dataset.cat;renderPhrases();});
  const rows=PHRASES.filter(p=>p[0]===currentPhraseCategory);
  $('phraseList').innerHTML=rows.map((p,i)=>{const pron=pronunciation(p[2],'vi');return `<article class="phrase-item"><div class="phrase-ko">${escapeHtml(p[1])}</div><div class="phrase-foreign">${escapeHtml(p[2])}</div><div class="phrase-pron">${escapeHtml(pron)}</div><div class="phrase-actions"><button data-speak="${i}">🔊 듣기</button><button data-show="${i}">🪧 보여주기</button><button data-use="${i}">번역창에 넣기</button></div></article>`;}).join('');
  $('phraseList').querySelectorAll('[data-speak]').forEach(b=>b.onclick=()=>speak(rows[+b.dataset.speak][2],'vi'));
  $('phraseList').querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>openShow(rows[+b.dataset.show][2],'vi',pronunciation(rows[+b.dataset.show][2],'vi')));
  $('phraseList').querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{ $('sourceLang').value='ko';$('targetLang').value='vi';$('sourceText').value=rows[+b.dataset.use][1];updateBadge();window.scrollTo({top:0,behavior:'smooth'});translate(); });
}

function openShow(text,lang,pron=''){ $('showLang').textContent=LANG[lang].badge; $('showText').textContent=text; $('showPronunciation').textContent=pron; $('showPronunciation').classList.toggle('hidden',!pron); $('showSpeak').onclick=()=>speak(text,lang); $('showDialog').showModal(); }

function walletLoad(){ try{return JSON.parse(localStorage.getItem('tm_wallet_v1'))||{start:0,expenses:[]};}catch{return{start:0,expenses:[]}} }
function walletSave(w){localStorage.setItem('tm_wallet_v1',JSON.stringify(w));}
function walletStats(w){const spent=w.expenses.reduce((s,e)=>s+e.amount,0);const startOfDay=new Date();startOfDay.setHours(0,0,0,0);const today=w.expenses.filter(e=>e.time>=startOfDay.getTime()).reduce((s,e)=>s+e.amount,0);const balance=w.start-spent;const pct=w.start>0?Math.max(0,Math.min(100,Math.round(Math.max(0,balance)*100/w.start))):0;return{spent,today,balance,pct};}
function renderWallet(){ const w=walletLoad(),s=walletStats(w); $('walletBalance').textContent=formatVnd(s.balance); $('walletBalanceKrw').textContent=`약 ${formatKrw(s.balance*vndToKrw)}`; $('walletToday').textContent=formatVnd(s.today); $('walletSpent').textContent=formatVnd(s.spent); $('walletProgress').style.width=`${s.pct}%`; $('walletProgressText').textContent=w.start>0?`시작 ${formatVnd(w.start)} · ${s.pct}% 남음`:'시작 금액을 설정해 주세요.'; $('startingAmount').value=w.start||''; $('expenseCount').textContent=`${w.expenses.length}건`; const rows=[...w.expenses].map((e,idx)=>({...e,idx})).reverse(); $('expenseHistory').innerHTML=rows.length?rows.slice(0,30).map(e=>`<div class="expense-row"><div class="expense-main"><strong>${escapeHtml(e.memo||'소비')}</strong><span>${new Date(e.time).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span></div><div class="expense-amount">-${formatVnd(e.amount)}</div><button type="button" class="delete-expense" data-del="${e.idx}">✕</button></div>`).join(''):'<div class="empty-state">아직 기록이 없습니다.</div>'; $('expenseHistory').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const ww=walletLoad();ww.expenses.splice(+b.dataset.del,1);walletSave(ww);renderWallet();}); }
function makeQuick(container,values,target){ $(container).innerHTML=values.map(([label,n])=>`<button type="button" data-val="${n}">${label}</button>`).join(''); $(container).querySelectorAll('[data-val]').forEach(b=>b.onclick=()=>{$(target).value=b.dataset.val; if(target==='fxVnd')updateFx();}); }
function addExpense(){ const amount=Number(String($('expenseAmount').value).replace(/,/g,'')); if(!amount||amount<0)return; const w=walletLoad(); w.expenses.push({time:Date.now(),amount:Math.round(amount),memo:$('expenseMemo').value.trim()});walletSave(w);$('expenseAmount').value='';$('expenseMemo').value='';renderWallet(); }

function updateFx(){ const n=Number(String($('fxVnd').value).replace(/,/g,''))||0; $('fxKrw').textContent=`≈ ${formatKrw(n*vndToKrw)}`; }
async function refreshRate(){ $('rateText').textContent='환율 확인 중…'; try{const r=await fetch('https://open.er-api.com/v6/latest/VND');const d=await r.json();const rate=Number(d?.rates?.KRW);if(!rate)throw 0;vndToKrw=rate;localStorage.setItem('tm_fx_rate',String(rate));$('rateText').textContent=`1₫ ≈ ${rate.toFixed(4)}원 · 온라인 환율`;renderWallet();updateFx();}catch{$('rateText').textContent=`1₫ ≈ ${vndToKrw.toFixed(4)}원 · 저장 환율`;}}

function networkUI(){ $('offlineBanner').classList.toggle('hidden',navigator.onLine); }
function initServiceWorker(){ if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{}); }

function init(){
  updateBadge();renderPhrases();initSpeechInput();networkUI();initServiceWorker();
  makeQuick('expenseQuick',[['50K',50000],['100K',100000],['200K',200000],['500K',500000]],'expenseAmount');
  makeQuick('startQuick',[['1M',1000000],['3M',3000000],['5M',5000000],['10M',10000000]],'startingAmount');
  makeQuick('fxQuick',[['50K',50000],['100K',100000],['500K',500000],['1M',1000000]],'fxVnd');
  refreshRate();
  $('translateButton').onclick=translate; $('sourceText').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')translate();});
  $('swapLang').onclick=()=>{const a=$('sourceLang').value;$('sourceLang').value=$('targetLang').value;$('targetLang').value=a;updateBadge();};
  $('targetLang').onchange=updateBadge;
  $('copyResult').onclick=async()=>{await navigator.clipboard?.writeText(lastResult.text);setStatus('번역문을 복사했습니다.','success');};
  $('speakResult').onclick=()=>speak(lastResult.text,lastResult.lang); $('showResult').onclick=()=>openShow(lastResult.text,lastResult.lang,lastResult.pronunciation);
  $('openWallet').onclick=()=>{renderWallet();$('walletDialog').showModal();}; $('openFx').onclick=()=>{$('fxDialog').showModal();updateFx();};
  $('installHelp').onclick=()=>$('installDialog').showModal(); $('phraseRefresh').onclick=()=>{currentPhraseCategory='기본';renderPhrases();};
  $('addExpense').onclick=addExpense; $('saveStartingAmount').onclick=()=>{const w=walletLoad();w.start=Math.max(0,Number(String($('startingAmount').value).replace(/,/g,''))||0);walletSave(w);renderWallet();};
  $('resetWallet').onclick=()=>{if(confirm('시작 금액과 모든 소비 내역을 초기화할까요?')){localStorage.removeItem('tm_wallet_v1');renderWallet();}};
  $('fxVnd').oninput=updateFx; $('refreshRate').onclick=refreshRate;
  window.addEventListener('online',()=>{networkUI();refreshRate();});window.addEventListener('offline',networkUI);
}
document.addEventListener('DOMContentLoaded',init);
