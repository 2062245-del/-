const DEVICE_KEY='psr2-push-device-v1';
function device(){let d;try{d=JSON.parse(localStorage.getItem(DEVICE_KEY));}catch{}if(!d?.id||!d?.token){const b=crypto.getRandomValues(new Uint8Array(32));d={id:crypto.randomUUID(),token:btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};localStorage.setItem(DEVICE_KEY,JSON.stringify(d));}return d;}
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export function isConnected(){return !!localStorage.getItem('psr2-push-api');}
async function base(){const r=await fetch('./push-config.json',{cache:'no-store'});if(!r.ok)throw new Error('알림 서버 설정을 확인할 수 없습니다');const c=await r.json();if(!c.apiBase)throw new Error('알림 서버 게시가 완료되면 사용할 수 있습니다');const u=new URL(c.apiBase);if(u.protocol!=='https:')throw new Error('HTTPS 서버가 필요합니다');return u.origin;}
async function call(action,payload={}){const api=await base(),d=device();const r=await fetch(api+'/_api/radar',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({json:{action,id:d.id,token:d.token,...payload}}),signal:AbortSignal.timeout(30000)});const v=(await r.json()).json;if(!r.ok)throw new Error(v.error||'알림 서버 연결 실패');return {api,...v};}
export async function enablePush(rules){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('Chrome에서 열어 푸시를 켜 주세요');
 const api=await base();
 const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('브라우저의 사이트 설정에서 알림을 허용해 주세요');
 const r=await fetch(api+'/_api/radar',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('알림 서버를 확인할 수 없습니다');const {publicKey}=(await r.json()).json;
 const registration=await navigator.serviceWorker.register('./push-sw.js',{scope:'./'});await navigator.serviceWorker.ready;
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
 await call('save',{subscription:subscription.toJSON(),rules});localStorage.setItem('psr2-push-api',api);return {connected:true};
}
export async function syncPushRules(rules){if(!isConnected())return {connected:false};const registration=await navigator.serviceWorker.getRegistration('./');const subscription=await registration?.pushManager.getSubscription();if(!subscription){localStorage.removeItem('psr2-push-api');return {connected:false};}await call('save',{subscription:subscription.toJSON(),rules});return {connected:true};}
export async function disablePush(){if(isConnected())await call('disable');const registration=await navigator.serviceWorker.getRegistration('./');await (await registration?.pushManager.getSubscription())?.unsubscribe();localStorage.removeItem('psr2-push-api');}
export async function testPush(){return call('test');}
