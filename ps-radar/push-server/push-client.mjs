/* Call enablePush({apiBase,rules}) only from a user's Enable push button. */
const DEVICE_KEY='psr2-push-device-v1';
function device(){let d;try{d=JSON.parse(localStorage.getItem(DEVICE_KEY));}catch{}if(!d?.id||!d?.token){const bytes=crypto.getRandomValues(new Uint8Array(32));d={id:crypto.randomUUID(),token:btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};localStorage.setItem(DEVICE_KEY,JSON.stringify(d));}return d;}
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
function endpoint(base,path){const u=new URL(base);if(u.protocol!=='https:')throw new Error('HTTPS push server required');return u.origin+path;}
async function call(base,path,method,payload){const d=device();const response=await fetch(endpoint(base,path),{method,headers:{Authorization:'Bearer '+d.token,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('푸시 서버 연결 실패 ('+response.status+')');return response.json();}
export async function enablePush({apiBase,rules}){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('이 환경은 웹 푸시를 지원하지 않습니다. Chrome에서 열어 주세요.');
 if(Notification.permission==='denied')throw new Error('브라우저 설정에서 알림 차단을 해제해 주세요.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('알림 권한이 허용되지 않았습니다.');
 const response=await fetch(endpoint(apiBase,'/public-key'),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('푸시 서버를 확인할 수 없습니다.');const {publicKey}=await response.json();
 const registration=await navigator.serviceWorker.register('./push-sw.js',{scope:'./'});await navigator.serviceWorker.ready;
 const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
 try{await call(apiBase,'/devices/'+device().id,'PUT',{subscription:subscription.toJSON(),rules});localStorage.setItem('psr2-push-api',new URL(apiBase).origin);return {connected:true};}catch(error){throw new Error(error.message+' · 구독은 생성됐지만 서버 등록을 다시 시도해야 합니다.');}
}
export async function syncPushRules({apiBase,rules}){const registration=await navigator.serviceWorker.getRegistration('./');const subscription=await registration?.pushManager.getSubscription();if(!subscription)return {connected:false};await call(apiBase,'/devices/'+device().id,'PUT',{subscription:subscription.toJSON(),rules});return {connected:true};}
export async function disablePush(apiBase){await call(apiBase,'/devices/'+device().id,'DELETE');const registration=await navigator.serviceWorker.getRegistration('./');await (await registration?.pushManager.getSubscription())?.unsubscribe();localStorage.removeItem('psr2-push-api');}
export async function testPush(apiBase){return call(apiBase,'/devices/'+device().id,'POST');}
