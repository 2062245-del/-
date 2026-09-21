import argparse, hashlib, pathlib, re, subprocess

p=argparse.ArgumentParser()
p.add_argument('--apk',required=True)
p.add_argument('--out',required=True)
a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
old=base/'build_v110_app.py'
out=pathlib.Path(a.out)
subprocess.run(['python3',str(old),'--apk',a.apk,'--out',str(out)],check=True)
html=out.read_text(encoding='utf-8')
html=html.replace('v1.0.10 · 큰 글씨','v1.0.11 · 큰 글씨')
html=html.replace('v1.0.10 · 아바타+','v1.0.11 · 아바타+')
html=html.replace('content="1.0.10"','content="1.0.11"',1)

# Stop stacking avatar faces. The canonical avatar-aware buildFigureSVG that already exists
# before the v104 hotfix remains the only figure-face renderer.
start=html.find('  function patchFigureFace(){')
end=html.find('  function afterRender()',start)
if start<0 or end<0:
    raise SystemExit('v1.0.11 patchFigureFace target not found')
replacement='''  function patchFigureFace(){
    // v1.0.11: intentionally no wrapper around buildFigureSVG.
    // The canonical renderer already draws the avatar face once.
    window.__todayCodiAvatarV111CanonicalSingleFace=true;
  }\n'''
html=html[:start]+replacement+html[end:]

location_patch=r'''<script id="v111-precise-location">
(function(){
  async function fetchJson(url, timeout=5500){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeout);
    try{
      const r=await fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{'Accept':'application/json'}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    }finally{clearTimeout(timer)}
  }
  const tidy=v=>String(v||'').replace(/대한민국|South Korea|Republic of Korea/gi,'').replace(/\s+/g,' ').trim();
  const addUnique=(arr,v)=>{v=tidy(v);if(!v)return;const norm=v.replace(/특별시|광역시|특별자치시|특별자치도/g,'시');if(!arr.some(x=>x===v||x.replace(/특별시|광역시|특별자치시|특별자치도/g,'시')===norm))arr.push(v)};
  async function reverseDetailed(lat,lon){
    const parts=[];
    try{
      const u=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=ko`;
      const d=await fetchJson(u,5000);
      addUnique(parts,d.principalSubdivision);
      addUnique(parts,d.city);
      const admins=Array.isArray(d?.localityInfo?.administrative)?d.localityInfo.administrative:[];
      admins.slice().sort((a,b)=>(Number(a.adminLevel)||0)-(Number(b.adminLevel)||0)).forEach(x=>{
        const n=tidy(x?.name);
        if(/[가-힣]/.test(n)&&/(시|군|구|읍|면|동|리)$/.test(n)) addUnique(parts,n);
      });
      addUnique(parts,d.locality);
    }catch(e){console.warn('precise reverse geocode primary failed',e)}
    if(parts.length<2){
      try{
        const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=ko`;
        const d=await fetchJson(u,5000), a=d.address||{};
        [a.state,a.city||a.town||a.county,a.borough||a.city_district,a.suburb||a.quarter||a.neighbourhood||a.village].forEach(x=>addUnique(parts,x));
      }catch(e){console.warn('precise reverse geocode fallback failed',e)}
    }
    return parts.slice(0,4).join(' ');
  }
  const native=window.requestNativeLocationV2;
  if(typeof native==='function'){
    window.requestNativeLocationV2=async function(){
      const pos=await native();
      const current=tidy(pos.locationName||'');
      const coarse=!current || current.split(/\s+/).filter(Boolean).length<2 || /인근/.test(current);
      if(coarse){
        try{
          const better=await reverseDetailed(pos.coords.latitude,pos.coords.longitude);
          if(better) pos.locationName=better;
        }catch(e){}
      }
      return pos;
    };
    window.__todayCodiV111PreciseLocation=true;
  }
})();
</script>'''
html=html.replace('</body>',location_patch+'\n<script id="v111-marker">window.__todayCodiAvatarV111=true;</script>\n</body>',1)

required=['v1.0.11 · 큰 글씨','v1.0.11 · 아바타+','__todayCodiAvatarV111CanonicalSingleFace','__todayCodiV111PreciseLocation','__todayCodiAvatarV111','__todayCodiAvatarV109HairKeySync']
missing=[x for x in required if x not in html]
if missing: raise SystemExit('v1.0.11 markers missing: '+repr(missing))

# The final patchFigureFace must not wrap buildFigureSVG or inject another face.
face_block=html[html.find('  function patchFigureFace(){'):html.find('  function afterRender()',html.find('  function patchFigureFace(){'))]
forbidden=['const old=window.buildFigureSVG','__todayCodiRenderBust(p)','bust=','cover+bust','<rect x="94" y="20" width="72" height="82"']
found=[x for x in forbidden if x in face_block]
if found: raise SystemExit('v1.0.11 duplicate face path remains: '+repr(found))

scripts=re.findall(r'<script\b[^>]*>(.*?)</script>',html,re.S|re.I)
for i,s in enumerate(scripts):
    tmp=pathlib.Path(f'/tmp/today-codi-v111-{i}.js');tmp.write_text(s,encoding='utf-8')
    subprocess.run(['node','--check',str(tmp)],check=True)
out.write_text(html,encoding='utf-8')
digest=hashlib.sha256(out.read_bytes()).hexdigest()
print('APP_HTML_SHA256='+digest)
print('V111_CANONICAL_SINGLE_FACE=PASS')
print('V111_PRECISE_LOCATION_FALLBACK=PASS')
print('V111_QA=PASS')
