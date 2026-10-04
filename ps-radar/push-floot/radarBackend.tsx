import {db} from "./db";
import {sql} from "kysely";
import {createHash} from "node:crypto";
import {sendPushNotifications} from "@floot/push";
function validSubscription(s:any){
 try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)&&typeof s.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87,88}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{22,24}$/.test(s.keys.auth);}catch{return false;}
}
function validateRules(rules:any[]){
 if(!Array.isArray(rules)||rules.length>100)throw new Error('Up to 100 rules');
 const seen=new Set();return rules.map(r=>{if(!r||!/^([A-Z]{2}[0-9]{4}-[A-Z]{4}[0-9]{5}_[A-Z0-9]{2}-[A-Z0-9_]{1,40})$/.test(r.productId)||seen.has(r.productId))throw new Error('Invalid product');seen.add(r.productId);
 const target=Number(r.target),threshold=Number(r.threshold);if(!Number.isInteger(target)||target<0||target>10000000||![0,30,50,70,80,90].includes(threshold))throw new Error('Invalid price rule');
 return {productId:r.productId,enabled:r.enabled===true,target,threshold,low:r.low===true,start:r.start===true,end:r.end===true};});
}
function evaluate(g:any,r:any,prev:any,now=Date.now()){
 const price=Number(g.currentPrice),discount=Number(g.discountPercent)||0,fetched=Date.parse(g.fetchedAt);
 if(!r.enabled||g.upcoming||g.priceNeedsVerification||String(g.priceStatus||"").startsWith("rejected")||!Number.isFinite(fetched)||now-fetched>172800000||fetched>now+300000||prev&&fetched<prev.fetched||!(price>0)||discount<0||discount>=100)return {events:[],next:prev};
 const events:any[]=[];const add=(kind:string,message:string,cycle:any)=>events.push({kind,message,id:r.productId+'|'+kind+'|'+cycle,title:g.title,price,discount,observedAt:g.fetchedAt,productId:r.productId});
 if(r.target&&price<=r.target&&(!prev||prev.price>r.target||prev.target!==r.target))add('target','목표 가격 이하 도달',r.target+':'+price+':'+fetched);
 if(r.low&&prev&&price<prev.low)add('low','관측 최저가 갱신',price);
 if(r.start&&prev&&prev.discount===0&&discount>0)add('start','할인 시작',fetched+':'+price);
 if(r.threshold&&discount>=r.threshold&&(!prev||prev.discount<r.threshold||prev.threshold!==r.threshold))add('threshold','할인율 '+r.threshold+'% 이상 도달',r.threshold+':'+discount+':'+fetched);
 const end=Date.parse(g.saleEndsAt);if(r.end&&discount>0&&end>now&&end-now<=86400000)add('end','할인 종료까지 24시간 이내',end);
 return {events,next:{price,discount,low:Math.min(prev?.low||Infinity,price),target:r.target,threshold:r.threshold,fetched}};
}

const catalogURL="https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/catalog-app-v232.json";
const appURL="https://2062245-del.github.io/-/ps-radar/preview-v2/";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function radarBackend(action:string,b:any={}):Promise<any>{
 if(action==="config")return {ok:true,version:"2.3.5",publicKey:"BFUTAtc02GNrziMyQ8DRrSFoCbXQBQ0VYizFjsnd60p71v9KPP-jcn6KJJuHyizIxqavbtBRKajMGqnVMcqmo_o"};
 if(action==="tick"){
  const claim=await db.updateTable("radarRuns").set({ranAt:new Date()}).where("id","=","prices").where("ranAt","<",new Date(Date.now()-19*60000)).returning("id").executeTakeFirst();
  if(!claim)return {ok:true,skipped:true};
  try{
   const response=await fetch(catalogURL,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("Catalog unavailable");const data=await response.json();if(!data.health?.safeToMerge)throw new Error("Unsafe catalog");
   const products=new Map<string,any>((data.items||[]).map((g:any)=>[g.productId,g]));
   const devices=await db.selectFrom("radarDevices").selectAll().execute();
   for(const device of devices){const samples:any=device.samples||{};const rules:any[]=device.rules as any[];
    await db.transaction().execute(async trx=>{for(const rule of rules){const g=products.get(rule.productId);if(!g)continue;const result=evaluate(g,rule,samples[rule.productId]);if(result.next)samples[rule.productId]=result.next;
     for(const e of result.events){const id=hash(device.id+"|"+e.id);await trx.insertInto("radarNotices").values({id,deviceId:device.id,payload:e}).onConflict(oc=>oc.column("id").doNothing()).execute();}}
     await trx.updateTable("radarDevices").set({samples}).where("id","=",device.id).execute();
    });
   }
   const pending=await db.selectFrom("radarNotices").selectAll().where("sent","=",false).where("attempts","<",5).where("createdAt",">",new Date(Date.now()-172800000)).limit(100).execute();let sent=0;
   for(const n of pending){const d=devices.find(d=>d.id===n.deviceId);const e:any=n.payload;const g=products.get(e.productId);const r:any=(d?.rules as any[])?.find(r=>r.productId===e.productId&&r.enabled);
    if(!d||!r||!g||!evaluate(g,{...r,target:0,threshold:0},null).next||g.currentPrice!==e.price||["low","start","end"].includes(e.kind)&&!r[e.kind]||e.kind==="target"&&(!r.target||g.currentPrice>r.target)||e.kind==="threshold"&&(!r.threshold||g.discountPercent<r.threshold)||e.kind==="end"&&!(Date.parse(g.saleEndsAt)>Date.now())){await db.updateTable("radarNotices").set({sent:true}).where("id","=",n.id).execute();continue;}
    const result=await sendPushNotifications([d.subscription as any],{title:"PS Radar · "+e.message,body:e.title+" · "+Number(e.price).toLocaleString("ko-KR")+"원",tag:n.id,url:appURL+"?product="+encodeURIComponent(e.productId),data:e});
    await db.updateTable("radarNotices").set({sent:result[0]?.success===true,attempts:n.attempts+1}).where("id","=",n.id).execute();if(result[0]?.success)sent++;
    if(result[0]?.gone)await db.deleteFrom("radarDevices").where("id","=",d.id).execute();
   }
   return {ok:true,checked:devices.length,sent};
  }catch(error){throw error;}
 }
 if(!/^[0-9a-f-]{36}$/.test(b.id||"")||!/^[A-Za-z0-9_-]{43}$/.test(b.token||""))throw new Error("Unauthorized");
 const tokenHash=hash(b.token);const existing=await db.selectFrom("radarDevices").selectAll().where("id","=",b.id).executeTakeFirst();
 if(existing&&existing.tokenHash!==tokenHash)throw new Error("Unauthorized");
 if(action==="save"){
  if(!validSubscription(b.subscription))throw new Error("Invalid subscription");const rules=validateRules(b.rules);
  if(!existing){const count=await db.selectFrom("radarDevices").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();if(count.n>=1000)throw new Error("Capacity reached");}
  const written=await db.insertInto("radarDevices").values({id:b.id,tokenHash,subscription:b.subscription,rules}).onConflict(oc=>oc.column("id").doUpdateSet({subscription:b.subscription,rules,updatedAt:new Date()}).where("radarDevices.tokenHash","=",tokenHash)).returning("id").executeTakeFirst();if(!written)throw new Error("Unauthorized");return {ok:true,ruleCount:rules.length};
 }
 if(!existing)throw new Error("Device not registered");
 if(action==="disable"){await db.deleteFrom("radarDevices").where("id","=",b.id).execute();return {ok:true};}
 if(action==="test"){if(Date.now()-new Date(existing.updatedAt).getTime()<10000)throw new Error("10초 후 다시 시도해 주세요");await db.updateTable("radarDevices").set({updatedAt:new Date()}).where("id","=",b.id).execute();const result=await sendPushNotifications([existing.subscription as any],{title:"PS Radar",body:"푸시 연결 테스트 · 앱을 닫아도 가격 알림을 받을 수 있습니다",tag:"test-"+crypto.randomUUID(),url:appURL,data:{message:"푸시 연결 테스트"}});if(!result[0]?.success)throw new Error("Push delivery rejected");return {ok:true};}
 throw new Error("Unknown action");
}