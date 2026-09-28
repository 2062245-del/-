import fs from 'node:fs/promises';
const deals=JSON.parse(await fs.readFile('ps-radar/data/deals-auto.json','utf8'));
const API='https://web.np.playstation.com/api/graphql/v1/op';
const cfg={op:'productRetrieveForCtasWithPrice',hash:'1f0ca607e170abbfb7d67bd76c9bbc97f21fe2e807be49e5fe764e14566cb605',variable:'productId'};
const headers={accept:'application/json','accept-language':'ko-KR','content-type':'application/json','apollographql-client-name':'@sie-private/web-commerce-anywhere','apollographql-client-version':'3.46.0-6.0',origin:'https://store.playstation.com',referer:'https://store.playstation.com/','user-agent':'Mozilla/5.0 Chrome/140 Safari/537.36','x-psn-app-ver':'@sie-private/web-commerce-anywhere/3.46.0-6.0-42971bfe01742f917b5db86972381a503b22f11e','x-psn-store-locale-override':'ko-KR'};
const productId=u=>String(u||'').match(/\/product\/([^/?#]+)/i)?.[1]||null;
function endpoint(id){const q=new URLSearchParams({operationName:cfg.op,variables:JSON.stringify({productId:id}),extensions:JSON.stringify({persistedQuery:{version:1,sha256Hash:cfg.hash}})});return `${API}?${q}`;}
function scan(obj,path='',out=[]){if(!obj||typeof obj!=='object')return out;for(const [k,v] of Object.entries(obj)){const p=path?`${path}.${k}`:k;if(/date|release|publish/i.test(k))out.push([p,v]);if(v&&typeof v==='object')scan(v,p,out);}return out;}
const rows=(deals.items||[]).filter(x=>productId(x.store)).slice(0,5);
console.log('PROBE_COUNT',rows.length);
for(const row of rows){
  const id=productId(row.store);console.log('\nPRODUCT',JSON.stringify({title:row.title,id,store:row.store}));
  try{const r=await fetch(endpoint(id),{headers});const j=await r.json();const p=j?.data?.productRetrieve||null;console.log('GRAPHQL_STATUS',r.status,'KEYS',p?Object.keys(p):null,'DATES',scan(p).slice(0,20));}catch(e){console.log('GRAPHQL_ERR',String(e));}
  try{const r=await fetch(row.store,{headers:{'user-agent':headers['user-agent'],'accept-language':'ko-KR'}});const html=await r.text();const hits=[...html.matchAll(/.{0,80}(?:releaseDate|release_date|datePublished|출시일|발매일).{0,140}/gi)].slice(0,8).map(x=>x[0].replace(/\s+/g,' '));console.log('HTML_STATUS',r.status,'LENGTH',html.length,'DATE_HITS',hits);}catch(e){console.log('HTML_ERR',String(e));}
}
