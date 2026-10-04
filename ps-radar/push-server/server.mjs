import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import webpush from 'web-push';
import {validSubscription,validateRules,evaluate} from './policy.mjs';
const origin='https://2062245-del.github.io';
const catalogUrl='https://raw.githubusercontent.com/2062245-del/-/main/ps-radar/data/catalog-app-v232.json';
const required=['DATABASE_URL','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','CRON_SECRET'];
for(const key of required)if(!process.env[key])throw new Error('Missing configuration: '+key);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5});pool.on('error',()=>console.error('Database connection unavailable'));
webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
await pool.query(`CREATE TABLE IF NOT EXISTS psr_push_devices(id uuid PRIMARY KEY,token_hash text NOT NULL,subscription jsonb,rules jsonb NOT NULL DEFAULT '[]',samples jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS psr_push_outbox(device_id uuid REFERENCES psr_push_devices(id),event_id text,payload jsonb NOT NULL,sent_at timestamptz,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(device_id,event_id));`);
const hash=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const limits=new Map();
function rate(ip){const now=Date.now(),x=limits.get(ip);if(!x||x.until<now){limits.set(ip,{count:1,until:now+60000});if(limits.size>5000)for(const [k,v] of limits)if(v.until<now)limits.delete(k);return true;}return ++x.count<=30;}
async function body(req){let value='';for await(const c of req){value+=c;if(value.length>100000)throw new Error('Body too large');}return JSON.parse(value||'{}');}
async function tick(){
 const client=await pool.connect();let locked=false;
 try{locked=(await client.query('SELECT pg_try_advisory_lock(233004) AS ok')).rows[0].ok;if(!locked)return {busy:true};
 const resp=await fetch(catalogUrl,{signal:AbortSignal.timeout(30000)});if(!resp.ok)throw new Error('Catalog unavailable');const data=await resp.json();if(!data.health?.safeToMerge)throw new Error('Unsafe catalog');
 const products=new Map([...(data.items||[]),...(data.upcoming||[])].map(g=>[g.productId,g]));
 const devices=(await client.query('SELECT * FROM psr_push_devices WHERE subscription IS NOT NULL')).rows;
 for(const device of devices){const samples=device.samples||{};await client.query('BEGIN');try{for(const rule of device.rules){const g=products.get(rule.productId);if(!g)continue;const result=evaluate(g,rule,samples[rule.productId]);if(result.next)samples[rule.productId]=result.next;
 for(const e of result.events)await client.query('INSERT INTO psr_push_outbox(device_id,event_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[device.id,e.id,JSON.stringify(e)]);}
 await client.query('UPDATE psr_push_devices SET samples=$2 WHERE id=$1',[device.id,JSON.stringify(samples)]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}
 let sent=0;const pending=(await client.query(`SELECT o.*,d.subscription FROM psr_push_outbox o JOIN psr_push_devices d ON d.id=o.device_id WHERE o.sent_at IS NULL AND o.attempts<5 AND d.subscription IS NOT NULL AND o.created_at>now()-interval '48 hours' ORDER BY o.created_at LIMIT 100`)).rows;
 for(const e of pending){const device=devices.find(d=>d.id===e.device_id);const rule=device?.rules.find(r=>r.productId===e.payload.productId&&r.enabled);const current=products.get(e.payload.productId);if(!rule||!current||current.upcoming||current.priceNeedsVerification||Number(current.currentPrice)!==e.payload.price||e.payload.kind==='target'&&Number(current.currentPrice)>rule.target||e.payload.kind==='threshold'&&Number(current.discountPercent)<rule.threshold||e.payload.kind==='end'&&!(Date.parse(current.saleEndsAt)>Date.now()))continue;try{await webpush.sendNotification(e.subscription,JSON.stringify(e.payload),{TTL:3600,timeout:15000});await client.query('UPDATE psr_push_outbox SET sent_at=now(),attempts=attempts+1 WHERE device_id=$1 AND event_id=$2',[e.device_id,e.event_id]);sent++;}catch(error){await client.query('UPDATE psr_push_outbox SET attempts=attempts+1 WHERE device_id=$1 AND event_id=$2',[e.device_id,e.event_id]);if([404,410].includes(error.statusCode))await client.query('UPDATE psr_push_devices SET subscription=NULL WHERE id=$1',[e.device_id]);}}
 // Retain deduplication IDs; do not delete and re-send old end/low events.
 return {checked:devices.length,sent};
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(233004)');client.release();}
}
const server=http.createServer(async(req,res)=>{
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,PUT,POST,DELETE,OPTIONS','Vary':'Origin','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try{const path=new URL(req.url,'http://localhost').pathname;if(req.method==='OPTIONS'){send(204,{});return;}
 if(req.headers.origin&&req.headers.origin!==origin){send(403,{error:'Origin rejected'});return;}
 if(req.method==='GET'&&path==='/health'){send(200,{ok:true,version:'2.3.4'});return;}
 if(req.method==='GET'&&path==='/public-key'){send(200,{publicKey:process.env.VAPID_PUBLIC_KEY});return;}
 if(req.method==='POST'&&path==='/tick'){if(!equal(req.headers.authorization,'Bearer '+process.env.CRON_SECRET)){send(401,{error:'Unauthorized'});return;}send(200,await tick());return;}
 if(!rate(req.socket.remoteAddress)){send(429,{error:'Rate limited'});return;}
 const match=path.match(/^\/devices\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/);const token=req.headers.authorization?.replace(/^Bearer /,'');
 if(!match||!/^[A-Za-z0-9_-]{43}$/.test(token||'')){send(401,{error:'Unauthorized'});return;}
 const id=match[1],existing=(await pool.query('SELECT token_hash FROM psr_push_devices WHERE id=$1',[id])).rows[0];if(existing&&!equal(existing.token_hash,hash(token))){send(401,{error:'Unauthorized'});return;}
 if(req.method==='PUT'){const b=await body(req);if(!validSubscription(b.subscription)){send(400,{error:'Invalid push subscription'});return;}const rules=validateRules(b.rules);if(!existing&&(await pool.query('SELECT count(*)::int AS n FROM psr_push_devices')).rows[0].n>=1000){send(503,{error:'Registration capacity reached'});return;}
 const written=await pool.query(`INSERT INTO psr_push_devices(id,token_hash,subscription,rules) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,rules=excluded.rules,updated_at=now() WHERE psr_push_devices.token_hash=excluded.token_hash RETURNING id`,[id,hash(token),JSON.stringify(b.subscription),JSON.stringify(rules)]);if(!written.rowCount){send(401,{error:'Unauthorized'});return;}send(200,{ok:true,ruleCount:rules.length});return;}
 if(!existing){send(404,{error:'Device not registered'});return;}
 if(req.method==='DELETE'){await pool.query('UPDATE psr_push_devices SET subscription=NULL,rules=$2 WHERE id=$1',[id,'[]']);send(200,{ok:true});return;}
 if(req.method==='POST'){await webpush.sendNotification((await pool.query('SELECT subscription FROM psr_push_devices WHERE id=$1',[id])).rows[0].subscription,JSON.stringify({id:'test:'+Date.now(),title:'PS Radar',message:'푸시 연결 테스트',price:null}),{TTL:60,timeout:15000});send(200,{ok:true});return;}
 send(405,{error:'Method not allowed'});
 }catch(e){console.error('Push request failed',e.name);send(e.message==='Invalid price rule'||e.message==='Invalid product'||e.message==='Up to 100 rules'?400:503,{error:'Request could not be completed'});}
});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0');
process.on('SIGTERM',()=>server.close(()=>pool.end()));
