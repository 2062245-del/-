import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

const root=path.resolve('ps-radar');
const typeMap={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function safePath(urlPath){
  const raw=decodeURIComponent(urlPath.split('?')[0]);
  const p=raw==='/'?'index.html':raw.replace(/^\//,'');
  const full=path.resolve(root,p);
  return full.startsWith(root)?full:null;
}
const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"static QA"}');return;}
  if(req.url?.startsWith('/sw.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");return;}
  const file=safePath(req.url||'/');
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':typeMap[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});

const chromeCandidates=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
const chromeBin=chromeCandidates.find(c=>spawnSync('which',[c],{encoding:'utf8'}).status===0);
if(!chromeBin)throw new Error('Chrome/Chromium not found on runner');
if(typeof WebSocket==='undefined')throw new Error('Node WebSocket API unavailable');

await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
const appPort=server.address().port;
const profile=path.join('/tmp',`ps-radar-cdp-${process.pid}`);
const url=`http://127.0.0.1:${appPort}/index.html?qa=${Date.now()}`;
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--blink-settings=imagesEnabled=false','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,url],{stdio:['ignore','ignore','pipe']});
let stderr='';let debugPort=null;
chrome.stderr.on('data',d=>{stderr+=d;const m=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);if(m)debugPort=Number(m[1]);});

async function waitFor(fn,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(120);}throw new Error('wait timeout');}
try{
  await waitFor(()=>debugPort,10000);
  const target=await waitFor(async()=>{
    const r=await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const list=await r.json();
    return list.find(x=>x.type==='page'&&String(x.url).includes('/index.html'))||null;
  },10000);
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();const runtimeErrors=[];
  ws.addEventListener('message',ev=>{
    const msg=JSON.parse(ev.data);
    if(msg.id&&pending.has(msg.id)){const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(new Error(msg.error.message)):resolve(msg.result);}
    if(msg.method==='Runtime.exceptionThrown')runtimeErrors.push(msg.params?.exceptionDetails?.text||'Runtime exception');
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Runtime.enable');
  await send('Page.enable');
  await waitFor(async()=>{
    const r=await send('Runtime.evaluate',{expression:`document.readyState==='complete' && document.querySelectorAll('#grid .card').length>0`,returnByValue:true});
    return r?.result?.value===true;
  },15000);

  const expression=`(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const tests=[];const check=(name,ok,detail='')=>tests.push({name,ok:!!ok,detail:String(detail??'')});
    const menus=[...document.querySelectorAll('.navbtn[data-page]')];
    check('six page menus',menus.length===6,menus.map(x=>x.dataset.page).join(','));
    const expected={home:'홈',catalog:'PS Plus 카탈로그',monthly:'월간 게임',promo:'할인',upcoming:'발매예정',wishlist:'찜한 게임'};
    document.querySelector('.navbtn[data-page="home"]')?.click();await sleep(120);
    check('home page',document.body.dataset.page==='home',document.body.dataset.page);
    const firstCard=document.querySelector('#grid .card');const firstId=firstCard?.dataset.id||'';
    firstCard?.querySelector('.heart')?.click();await sleep(120);
    check('wishlist persistence',!!firstId&&JSON.parse(localStorage.getItem('psradar-wish')||'[]').includes(firstId),firstId);
    document.querySelector('#grid .card .detailbtn')?.click();await sleep(100);
    check('detail opens',document.querySelector('#detailModal')?.classList.contains('show'));
    document.querySelector('#closeDetail')?.click();await sleep(70);
    check('detail closes',!document.querySelector('#detailModal')?.classList.contains('show'));
    document.querySelector('#filterBtn')?.click();await sleep(70);
    check('filter drawer opens',document.querySelector('#drawer')?.classList.contains('show'));
    document.querySelector('#platform').value='PS5';document.querySelector('#applyFilter')?.click();await sleep(100);
    check('filter indicator',/필터\\s+1/.test(document.querySelector('#filterBtn')?.textContent||''),document.querySelector('#filterBtn')?.textContent||'');
    document.querySelector('#platform').value='all';document.querySelector('#applyFilter')?.click();await sleep(100);
    for(const page of ['home','catalog','monthly','promo','upcoming','wishlist']){
      document.querySelector('.navbtn[data-page="'+page+'"]')?.click();await sleep(page==='upcoming'?250:160);
      check('page '+page,document.body.dataset.page===page,document.body.dataset.page||'');
      check('active '+page,!!document.querySelector('.navbtn[data-page="'+page+'"].active'));
      if(page!=='home')check('header '+page,!document.querySelector('#pageHeader')?.hidden,document.querySelector('[data-page-title]')?.textContent||'');
      if(page!=='home')check('title '+page,(document.querySelector('[data-page-title]')?.textContent||'')===expected[page],document.querySelector('[data-page-title]')?.textContent||'');
      if(page==='catalog'){
        const count=parseInt((document.querySelector('#countText')?.textContent||'0').replace(/[^0-9]/g,''),10)||0;
        check('catalog has data',count>=100,count);
        const before=document.querySelectorAll('#grid .card').length;const more=document.querySelector('#loadMoreBtn');
        check('catalog load more visible',!!more&&!more.hidden,before);
        more?.click();await sleep(100);const after=document.querySelectorAll('#grid .card').length;
        check('catalog load more works',after>before,String(before)+'->'+String(after));
      }
      if(page==='monthly')check('monthly has data',document.querySelectorAll('#grid .card').length>0,document.querySelector('#countText')?.textContent||'');
      if(page==='promo')check('promo renders',!!document.querySelector('#grid'),document.querySelector('#countText')?.textContent||'');
      if(page==='upcoming'){
        check('upcoming has data',document.querySelectorAll('#grid .upcoming-card').length>0,document.querySelector('#countText')?.textContent||'');
        check('upcoming hides filter',document.querySelector('#filterBtn')?.hidden===true);
      }
      if(page==='wishlist')check('wishlist shows saved item',document.querySelectorAll('#grid .card').length>0,document.querySelector('#countText')?.textContent||'');
    }
    const failed=tests.filter(x=>!x.ok);
    return {pass:failed.length===0,failed,tests,source:document.querySelector('#sourceStatus')?.textContent||'',count:document.querySelector('#countText')?.textContent||''};
  })()`;
  const evalResult=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  const report=evalResult?.result?.value;
  console.log('PS Radar browser QA',JSON.stringify({...report,runtimeErrors},null,2));
  if(!report?.pass||runtimeErrors.length)throw new Error('Browser menu smoke test failed');
  ws.close();
} finally {
  chrome.kill('SIGKILL');
  server.close();
}
