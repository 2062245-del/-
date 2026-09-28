(() => {
  'use strict';
  const VERSION='18.0.0';
  const STAGE=4;
  const KEY='psradar-filter-presets';
  const fields=['content','platform','tier','genre','korean','sort'];
  const presets=()=>{try{const p=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(p)?p:[];}catch{return [];}};
  const saveAll=p=>localStorage.setItem(KEY,JSON.stringify(p.slice(0,6)));
  const labelMap={all:'전체',PS5:'PS5',PS4:'PS4',yes:'한국어',discount:'할인율순',rating:'평점순',price:'가격순',new:'최근추가',release:'최신 발매 순',score:'추천점수순',catalog:'카탈로그',monthly:'월간',classic:'클래식',trial:'체험판',promo:'프로모션',Essential:'에센셜',Extra:'스페셜',Deluxe:'디럭스',Action:'액션',RPG:'RPG',Sports:'스포츠',Indie:'인디',Survival:'생존'};
  function currentFilter(){if(typeof state==='undefined')return null;return Object.fromEntries(fields.map(k=>[k,state[k]??(k==='sort'?'default':'all')]));}
  function presetLabel(f){const bits=[f.platform,f.korean,f.genre,f.sort].filter(x=>x&&x!=='all'&&x!=='default').map(x=>labelMap[x]||x);return bits.slice(0,3).join(' · ')||'기본 필터';}
  function syncControls(f){const ids={content:'contentType',platform:'platform',tier:'tier',genre:'genre',korean:'korean',sort:'sort'};Object.entries(ids).forEach(([k,id])=>{const el=document.getElementById(id);if(el&&[...el.options].some(x=>x.value===f[k]))el.value=f[k];});}
  function applyPreset(id){const p=presets().find(x=>x.id===id);if(!p||typeof state==='undefined')return false;fields.forEach(k=>state[k]=p.filter[k]);state.quick='none';syncControls(p.filter);if(typeof resetVisible==='function')resetVisible();if(typeof renderGames==='function')renderGames();renderPresets();return true;}
  function savePreset(){const filter=currentFilter();if(!filter)return;let rows=presets();const sig=JSON.stringify(filter);const duplicate=rows.find(x=>JSON.stringify(x.filter)===sig);if(duplicate){rows=[duplicate,...rows.filter(x=>x.id!==duplicate.id)];}else{rows=[{id:`f-${Date.now()}`,name:presetLabel(filter),filter,createdAt:new Date().toISOString()},...rows];}saveAll(rows);renderPresets();}
  function removePreset(id){saveAll(presets().filter(x=>x.id!==id));renderPresets();}
  function ensureUI(){
    const grid=document.querySelector('#drawer .filtergrid');if(!grid)return;
    let host=document.getElementById('v180FilterPresetWrap');
    if(!host){host=document.createElement('section');host.id='v180FilterPresetWrap';host.innerHTML='<div><b>내 필터</b><small>PS Plus·할인·검색에서 공통 사용</small></div><div id="v180FilterPresets" class="v180-filter-presets"></div>';grid.insertAdjacentElement('beforebegin',host);}
    let actions=document.getElementById('v180FilterActions');
    const apply=document.getElementById('applyFilter');
    if(!actions&&apply){actions=document.createElement('div');actions.id='v180FilterActions';actions.className='v180-filter-actions';actions.innerHTML='<button id="v180SaveFilter" type="button">현재 조건 저장</button>';apply.parentNode.insertBefore(actions,apply);actions.appendChild(apply);}
    renderPresets();
  }
  function renderPresets(){const host=document.getElementById('v180FilterPresets');if(!host)return;const rows=presets();host.innerHTML=rows.length?rows.map(x=>`<span><button data-v180-preset="${x.id}">${x.name}</button><button aria-label="필터 삭제" data-v180-remove-preset="${x.id}">×</button></span>`).join(''):'<small>저장된 필터가 없습니다.</small>';}
  document.addEventListener('click',e=>{const p=e.target.closest?.('[data-v180-preset]');if(p){applyPreset(p.dataset.v180Preset);return;}const r=e.target.closest?.('[data-v180-remove-preset]');if(r){removePreset(r.dataset.v180RemovePreset);return;}if(e.target.closest?.('#v180SaveFilter'))savePreset();if(e.target.closest?.('#filterBtn'))setTimeout(ensureUI,0);},true);
  const start=()=>{ensureUI();};if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.__PSRADAR_V180_FILTERS__={VERSION,STAGE,KEY,savePreset,applyPreset,removePreset,presets,currentFilter};
})();
