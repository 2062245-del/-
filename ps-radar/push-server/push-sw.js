/* Deploy beside preview-v2/index.html. No cache interception: online updates stay live. */
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{let data={title:'PS Radar',message:'새 가격 알림이 있습니다'};try{Object.assign(data,event.data.json());}catch{}
 const productId=/^[A-Z0-9_-]{10,80}$/.test(data.productId||'')?data.productId:null;
 await self.registration.showNotification(data.title||'PS Radar',{body:[data.message,data.price?Number(data.price).toLocaleString('ko-KR')+'원':''].filter(Boolean).join(' · '),tag:data.id||'ps-radar',data:{productId},requireInteraction:false});
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'psr-push',event:data});})());
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const target=new URL('./',self.registration.scope);const id=event.notification.data?.productId;if(/^[A-Z0-9_-]{10,80}$/.test(id||''))target.searchParams.set('product',id);
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)if(new URL(client.url).origin===target.origin&&new URL(client.url).pathname.startsWith(target.pathname)){await client.navigate(target.href);return client.focus();}return self.clients.openWindow(target.href);
})());});
