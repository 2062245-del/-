(() => {
  'use strict';
  const VERSION='17.7.1';
  let upcomingByTitle=new Map();
  let decorateFrame=0;

  const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');

  function normalizeNavigation(){
    const page=document.body.dataset.page||'home';
    document.querySelectorAll('.bottomnav .navbtn[data-page]').forEach(btn=>{
      const active=btn.dataset.page===page;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    });
    const focused=document.activeElement;
    if(focused?.classList?.contains('navbtn')) focused.blur();
  }

  function releaseArt(item,title){
    const wrap=document.createElement('span');
    wrap.className='v1771-release-art';
    if(item?.image){
      const img=document.createElement('img');
      img.src=item.image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
      img.addEventListener('error',()=>{wrap.classList.add('missing');img.remove();wrap.textContent='PS';},{once:true});
      wrap.appendChild(img);
    }else{
      wrap.classList.add('missing');wrap.textContent='PS';
    }
    wrap.title=title||'';
    return wrap;
  }

  function decorateReleaseRows(){
    if(document.body.dataset.page!=='upcoming')return;
    document.querySelectorAll('.v177-release-row').forEach(row=>{
      if(row.querySelector('.v1771-release-art'))return;
      const title=row.querySelector('.v177-release-copy b')?.textContent?.trim()||'';
      const item=upcomingByTitle.get(key(title));
      row.insertBefore(releaseArt(item,title),row.firstChild);
    });
  }

  function compactUpcoming(){
    const active=document.body.dataset.page==='upcoming';
    document.body.classList.toggle('v1771-upcoming-compact',active);
    normalizeNavigation();
    if(!active)return;
    const coverage=document.querySelector('#pageCoverage');
    if(coverage)coverage.hidden=true;
    scheduleDecorate();
  }

  function scheduleDecorate(){
    if(decorateFrame)return;
    decorateFrame=requestAnimationFrame(()=>{decorateFrame=0;decorateReleaseRows();});
  }

  async function loadUpcoming(){
    try{
      const r=await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});
      if(r.ok){
        const j=await r.json();
        upcomingByTitle=new Map((Array.isArray(j.items)?j.items:[]).map(x=>[key(x.title),x]));
      }
    }catch(_){}
    scheduleDecorate();
  }

  const pageObserver=new MutationObserver(()=>compactUpcoming());
  const calendarObserver=new MutationObserver(()=>scheduleDecorate());

  window.addEventListener('DOMContentLoaded',()=>{
    normalizeNavigation();compactUpcoming();loadUpcoming();
    pageObserver.observe(document.body,{attributes:true,attributeFilter:['data-page']});
    const calendar=document.querySelector('#v177ReleaseCalendar');
    if(calendar)calendarObserver.observe(calendar,{childList:true,subtree:true});
  });

  window.__PSRADAR_V1771__={VERSION,normalizeNavigation,compactUpcoming};
})();