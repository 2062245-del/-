const CACHE='ps-radar-v15.1.0';
const STATIC=['./','./index.html','./styles.css','./ui-v13.css','./app.js','./ui-v13.js','./catalog-v14.js','./catalog-integrity-v15.js','./stability-v15.js','./manifest.json','./data/games.json','./data/feed.json','./data/store.json','./data/discovery.json','./data/catalog-auto.json','./data/store-auto.json','./data/upcoming.json','./icons/icon.svg'];

self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await c.addAll(STATIC);
  await self.skipWaiting();
})()));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const u=new URL(req.url);
  const sameOrigin=u.origin===self.location.origin;

  if(sameOrigin&&u.pathname.startsWith('/api/')){
    e.respondWith(fetch(req).then(r=>{
      if(r.ok)return r;
      if(u.pathname.includes('/store'))return caches.match('./data/store.json');
      if(u.pathname.includes('/discover'))return caches.match('./data/discovery.json');
      if(u.pathname.includes('/feed'))return caches.match('./data/feed.json');
      return r;
    }).catch(async()=>{
      if(u.pathname.includes('/store'))return (await caches.match('./data/store.json'))||Response.error();
      if(u.pathname.includes('/discover'))return (await caches.match('./data/discovery.json'))||Response.error();
      if(u.pathname.includes('/feed'))return (await caches.match('./data/feed.json'))||Response.error();
      return Response.error();
    }));
    return;
  }

  const cacheKey=sameOrigin?new Request(`${u.origin}${u.pathname}`,{method:'GET'}):req;
  e.respondWith((async()=>{
    try{
      const r=await fetch(req);
      if(sameOrigin&&r.ok){
        const c=await caches.open(CACHE);
        await c.put(cacheKey,r.clone());
      }
      return r;
    }catch{
      const cached=await caches.match(cacheKey,{ignoreSearch:true});
      if(cached)return cached;
      if(req.mode==='navigate')return (await caches.match('./index.html'))||Response.error();
      return Response.error();
    }
  })());
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
