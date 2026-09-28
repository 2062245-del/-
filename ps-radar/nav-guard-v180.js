(()=>{
  'use strict';
  const VERSION='18.0.0';

  function closeTransientSurfaces(){
    const drawer=document.getElementById('drawer');
    if(drawer){
      drawer.classList.remove('show');
      drawer.setAttribute('aria-hidden','true');
    }
    const modal=document.getElementById('detailModal');
    if(modal && modal.getAttribute('aria-hidden')==='true'){
      modal.classList.remove('show','open','active');
      modal.style.pointerEvents='none';
    }
    document.body.classList.remove('drawer-open','modal-open','sheet-open','no-scroll');
  }

  function restoreModalHitTesting(){
    const modal=document.getElementById('detailModal');
    if(!modal) return;
    const sync=()=>{
      const hidden=modal.getAttribute('aria-hidden')!=='false';
      modal.style.pointerEvents=hidden?'none':'';
      if(hidden) modal.classList.remove('show','open','active');
    };
    new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['aria-hidden']});
    sync();
  }

  function install(){
    closeTransientSurfaces();
    restoreModalHitTesting();
    const nav=document.querySelector('.bottomnav');
    if(nav && !nav.dataset.v180Guard){
      nav.dataset.v180Guard='1';
      nav.addEventListener('pointerdown',(e)=>{
        if(e.target.closest('.navbtn')) closeTransientSurfaces();
      },true);
      nav.addEventListener('click',(e)=>{
        if(e.target.closest('.navbtn')) closeTransientSurfaces();
      },true);
    }
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden) closeTransientSurfaces();
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  window.__PSRADAR_NAV_GUARD__={version:VERSION,closeTransientSurfaces};
})();
