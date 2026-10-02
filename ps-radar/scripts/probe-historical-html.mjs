import fs from 'node:fs/promises';

const targets=[
 {source:'psprices',url:'https://psprices.com/region-kr/game/4867346/geulan-tuliseumo-7-junggugeogancheja-hangugeo-taegugeo-yeongeo-junggugeobeoncheja'},
 {source:'psdeals',url:'https://psdeals.net/kr-store/game/2267934/%EA%B7%B8%EB%9E%80-%ED%88%AC%EB%A6%AC%EC%8A%A4%EB%AA%A8-7'}
];
const report={generatedAt:new Date().toISOString(),targets:[]};
for(const t of targets){
 const row={source:t.source,url:t.url,ok:false};
 try{
  const r=await fetch(t.url,{headers:{'user-agent':'Mozilla/5.0 PSRadarHistoricalProbe/1.0','accept-language':'ko-KR,ko;q=0.9,en;q=0.7'}});
  const html=await r.text(); row.status=r.status; row.bytes=html.length; row.ok=r.ok;
  row.matches=[...html.matchAll(/.{0,160}(?:priceHistory|price_history|history|lowestPrice|lowest_price|highestPrice|chart|series|discount).{0,320}/gi)].slice(0,100).map(m=>m[0]);
  row.scriptSrc=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/price|history|chart|api|game|app|main/i.test(x)).slice(0,80);
  row.jsonScripts=[...html.matchAll(/<script[^>]*(?:type=["']application\/json["']|id=["'][^"']*["'])[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>/price|history|lowest|discount|chart/i.test(x)).slice(0,20).map(x=>x.slice(0,30000));
  row.endpointCandidates=[...new Set([...html.matchAll(/https?:\\?\/\\?\/[^"]+/g)].map(m=>m[0].replace(/\\\//g,'/')).filter(x=>/api|price|history|chart|graph/i.test(x)).slice(0,100))];
 }catch(e){row.error=String(e?.stack||e)}
 report.targets.push(row);
}
await fs.mkdir('ps-radar/data',{recursive:true});
await fs.writeFile('ps-radar/data/historical-html-probe.json',JSON.stringify(report,null,2)+'\n');
console.log(report.targets.map(x=>({source:x.source,status:x.status,bytes:x.bytes,matches:x.matches?.length||0,json:x.jsonScripts?.length||0,endpoints:x.endpointCandidates?.length||0,error:x.error||null})));
