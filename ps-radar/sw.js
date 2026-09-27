const CACHE='ps-radar-v14.1.0';
const STATIC=['./','./index.html','./styles.css','./ui-v13.css','./app.js','./ui-v13.js','./catalog-v14.js','./manifest.json','./data/games.json','./data/feed.json','./data/store.json','./data/discovery.json','./data/catalog-auto.json','./data/upcoming.json','./icons/icon.svg'];
const OPTIONAL=['./data/store-auto.json'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await c.addAll(STATIC);
  await Promise.all(OPTIONAL.map(async url=>{try{const r=await fetch(url,{cache:'no-store'});if(r.ok)await c.put(url,r);}catch{}}));
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/api/')){
    if(e.request.method==='GET' && (u.pathname.includes('/store')||u.pathname.includes('/feed')||u.pathname.includes('/discover'))){
      e.respondWith(fetch(e.request).catch(()=>u.pathname.includes('/store')?caches.match('./data/store.json'):u.pathname.includes('/discover')?caches.match('./data/discovery.json'):caches.match('./data/feed.json')));
    }
    return;
  }
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(c=>c||caches.match('./index.html'))));
});
self.addEventListener('push',event=>{
  let payload={title:'PS Radar',body:'관심 게임 정보가 변경되었습니다.',url:'./',tag:'psradar-watch'};
  try{payload={...payload,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(payload.title,{body:payload.body,tag:payload.tag||'psradar-watch',icon:'./icons/icon.svg',badge:'./icons/icon.svg',data:{url:payload.url||'./',...(payload.data||{})}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'./';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){c.navigate?.(target);return c.focus();}}
    return clients.openWindow?clients.openWindow(target):null;
  }));
});
