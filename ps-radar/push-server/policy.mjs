export function validSubscription(s){
 try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)&&typeof s.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87,88}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{22,24}$/.test(s.keys.auth);}catch{return false;}
}
export function validateRules(rules){
 if(!Array.isArray(rules)||rules.length>100)throw new Error('Up to 100 rules');
 const seen=new Set();return rules.map(r=>{if(!r||!/^([A-Z]{2}[0-9]{4}-[A-Z]{4}[0-9]{5}_[A-Z0-9]{2}-[A-Z0-9_]{1,40})$/.test(r.productId)||seen.has(r.productId))throw new Error('Invalid product');seen.add(r.productId);
 const target=Number(r.target),threshold=Number(r.threshold);if(!Number.isInteger(target)||target<0||target>10000000||![0,30,50,70,80,90].includes(threshold))throw new Error('Invalid price rule');
 return {productId:r.productId,enabled:r.enabled===true,target,threshold,low:r.low===true,start:r.start===true,end:r.end===true};});
}
export function evaluate(g,r,prev,now=Date.now()){
 const price=Number(g.currentPrice),discount=Number(g.discountPercent)||0,fetched=Date.parse(g.fetchedAt);
 if(!r.enabled||g.upcoming||g.priceNeedsVerification||!Number.isFinite(fetched)||now-fetched>172800000||fetched>now+300000||prev&&fetched<prev.fetched||!(price>0)||discount<0||discount>=100)return {events:[],next:prev};
 const events=[];const add=(kind,message,cycle)=>events.push({kind,message,id:r.productId+'|'+kind+'|'+cycle,title:g.title,price,discount,observedAt:g.fetchedAt,productId:r.productId});
 if(r.target&&price<=r.target&&(!prev||prev.price>r.target||prev.target!==r.target))add('target','목표 가격 이하 도달',r.target+':'+price+':'+fetched);
 if(r.low&&prev&&price<prev.low)add('low','관측 최저가 갱신',price);
 if(r.start&&prev&&prev.discount===0&&discount>0)add('start','할인 시작',fetched+':'+price);
 if(r.threshold&&discount>=r.threshold&&(!prev||prev.discount<r.threshold||prev.threshold!==r.threshold))add('threshold','할인율 '+r.threshold+'% 이상 도달',r.threshold+':'+discount+':'+fetched);
 const end=Date.parse(g.saleEndsAt);if(r.end&&discount>0&&end>now&&end-now<=86400000)add('end','할인 종료까지 24시간 이내',end);
 return {events,next:{price,discount,low:Math.min(prev?.low||Infinity,price),target:r.target,threshold:r.threshold,fetched}};
}
