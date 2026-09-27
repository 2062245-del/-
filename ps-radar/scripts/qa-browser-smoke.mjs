import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

const root=path.resolve('ps-radar');
const typeMap={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const harness=`<!doctype html><html><body><iframe id="app" style="width:390px;height:844px;border:0"></iframe><pre id="result">RUNNING</pre><script>
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result=document.querySelector('#result');
const tests=[];const errors=[];
const check=(name,ok,detail='')=>tests.push({name,ok:!!ok,detail});
window.addEventListener('error',e=>errors.push(String(e.message||e.error||'parent error')));
async function waitFor(fn,ms=10000){const until=Date.now()+ms;while(Date.now()<until){try{if(fn())return true;}catch{}await sleep(100);}return false;}
(async()=>{
 const f=document.querySelector('#app');
 f.src='/index.html?qa='+Date.now();
 await new Promise((resolve,reject)=>{f.onload=resolve;setTimeout(()=>reject(new Error('iframe load timeout')),12000);});
 const w=f.contentWindow,d=f.contentDocument;
 w.addEventListener('error',e=>errors.push(String(e.message||e.error||'app error')));
 w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason||'unhandled rejection')));
 const ready=await waitFor(()=>d.querySelectorAll('#grid .card').length>0&&/공식|PS Plus/.test(d.querySelector('#sourceStatus')?.textContent||''));
 check('initial data render',ready,d.querySelector('#sourceStatus')?.textContent||'');
 const menus=[...d.querySelectorAll('.navbtn[data-page]')];
 check('six page menus',menus.length===6,menus.map(x=>x.dataset.page).join(','));
 const expected={home:'홈',catalog:'PS Plus 카탈로그',monthly:'월간 게임',promo:'할인',upcoming:'발매예정',wishlist:'찜한 게임'};
 d.querySelector('.navbtn[data-page="home"]')?.click();await sleep(120);
 const firstCard=d.querySelector('#grid .card');
 const firstId=firstCard?.dataset.id||'';
 firstCard?.querySelector('.heart')?.click();await sleep(120);
 check('wishlist persistence',!!firstId&&JSON.parse(w.localStorage.getItem('psradar-wish')||'[]').includes(firstId),firstId);
 const detailBtn=d.querySelector('#grid .card .detailbtn');detailBtn?.click();await sleep(100);
 check('detail opens',d.querySelector('#detailModal')?.classList.contains('show'));
 d.querySelector('#closeDetail')?.click();await sleep(70);
 check('detail closes',!d.querySelector('#detailModal')?.classList.contains('show'));
 d.querySelector('#filterBtn')?.click();await sleep(70);
 check('filter drawer opens',d.querySelector('#drawer')?.classList.contains('show'));
 d.querySelector('#platform').value='PS5';d.querySelector('#applyFilter')?.click();await sleep(100);
 check('filter indicator',/필터\s+1/.test(d.querySelector('#filterBtn')?.textContent||''),d.querySelector('#filterBtn')?.textContent||'');
 d.querySelector('#platform').value='all';d.querySelector('#applyFilter')?.click();await sleep(100);
 for(const page of ['home','catalog','monthly','promo','upcoming','wishlist']){
   const b=d.querySelector('.navbtn[data-page="'+page+'"]');b?.click();await sleep(page==='upcoming'?250:150);
   check('page '+page,d.body.dataset.page===page,d.body.dataset.page||'');
   check('active '+page,!!d.querySelector('.navbtn[data-page="'+page+'"].active'));
   if(page!=='home')check('header '+page,!d.querySelector('#pageHeader')?.hidden,d.querySelector('[data-page-title]')?.textContent||'');
   if(page!=='home')check('title '+page,(d.querySelector('[data-page-title]')?.textContent||'')===expected[page],d.querySelector('[data-page-title]')?.textContent||'');
   if(page==='catalog'){
     const count=parseInt((d.querySelector('#countText')?.textContent||'0').replace(/[^0-9]/g,''),10)||0;
     check('catalog has data',count>=100,String(count));
     const before=d.querySelectorAll('#grid .card').length;const more=d.querySelector('#loadMoreBtn');
     check('catalog load more visible',!!more&&!more.hidden,String(before));
     more?.click();await sleep(100);const after=d.querySelectorAll('#grid .card').length;
     check('catalog load more works',after>before,String(before)+'->'+String(after));
   }
   if(page==='monthly')check('monthly has data',d.querySelectorAll('#grid .card').length>0,d.querySelector('#countText')?.textContent||'');
   if(page==='promo')check('promo renders',!!d.querySelector('#grid'),d.querySelector('#countText')?.textContent||'');
   if(page==='upcoming'){
     check('upcoming has data',d.querySelectorAll('#grid .upcoming-card').length>0,d.querySelector('#countText')?.textContent||'');
     check('upcoming hides filter',d.querySelector('#filterBtn')?.hidden===true);
   }
   if(page==='wishlist')check('wishlist shows saved item',d.querySelectorAll('#grid .card').length>0,d.querySelector('#countText')?.textContent||'');
 }
 const failed=tests.filter(x=>!x.ok);
 const fatalErrors=errors.filter(x=>!/404|favicon|ResizeObserver/i.test(x));
 const pass=failed.length===0&&fatalErrors.length===0;
 document.documentElement.dataset.qa=pass?'PASS':'FAIL';
 result.textContent=JSON.stringify({pass,failed,errors:fatalErrors,tests},null,2);
})().catch(err=>{document.documentElement.dataset.qa='FAIL';result.textContent=JSON.stringify({pass:false,error:String(err?.stack||err)},null,2);});
</script></body></html>`;

function safePath(urlPath){
  const raw=decodeURIComponent(urlPath.split('?')[0]);
  const p=raw==='/'?'index.html':raw.replace(/^\//,'');
  const full=path.resolve(root,p);
  return full.startsWith(root)?full:null;
}
const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/__qa')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(harness);return;}
  if(req.url?.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"static QA"}');return;}
  if(req.url?.startsWith('/sw.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");return;}
  const file=safePath(req.url||'/');
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':typeMap[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
});

const chromeCandidates=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
const chrome=chromeCandidates.find(c=>spawnSync('which',[c],{encoding:'utf8'}).status===0);
if(!chrome)throw new Error('Chrome/Chromium not found on runner');
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
const port=server.address().port;
const profile=path.join('/tmp',`ps-radar-qa-${process.pid}`);
const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--blink-settings=imagesEnabled=false',`--user-data-dir=${profile}`,'--virtual-time-budget=14000','--dump-dom',`http://127.0.0.1:${port}/__qa`];
let stdout='',stderr='';
try{
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('browser smoke timeout'));},30000);
    child.stdout.on('data',d=>stdout+=d);
    child.stderr.on('data',d=>stderr+=d);
    child.on('error',reject);
    child.on('close',c=>{clearTimeout(timer);resolve(c);});
  });
  if(code!==0)throw new Error(`Chrome exited ${code}: ${stderr.slice(-1200)}`);
  const pass=/data-qa="PASS"/.test(stdout);
  const match=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  const report=(match?.[1]||'').replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&');
  console.log('PS Radar browser QA',report||'(no report)');
  if(!pass)throw new Error('Browser menu smoke test failed');
} finally {
  server.close();
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150});}catch(err){console.warn('QA temp cleanup skipped:',err.code||err.message);}
}
