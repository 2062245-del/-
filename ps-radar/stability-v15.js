(() => {
  'use strict';

  const STATIC_HOST = location.hostname.endsWith('github.io') || location.hostname==='127.0.0.1' || location.hostname==='localhost' || location.protocol === 'file:';
  const verifiedCurrentSale = g => {
    const current=Number(g?.currentPrice), original=Number(g?.originalPrice), discount=Number(g?.discountPercent);
    if(!g?.storeVerified || g?.priceStatus!=='verified') return false;
    if(!Number.isFinite(current)||!Number.isFinite(original)||!(original>current&&current>=0&&discount>0)) return false;
    if(g?.saleEndsAt){const end=new Date(g.saleEndsAt).getTime();if(Number.isFinite(end)&&end<=Date.now())return false;}
    return true;
  };
  const officialKorean = g => g?.ko===true && ['verified-store','verified-store-positive'].includes(g?.languageStatus);

  if(STATIC_HOST){
    if(typeof fetchLive==='function') fetchLive=async()=>null;
    if(typeof hydrateGameProfile==='function') hydrateGameProfile=async()=>false;
    if(typeof loadPushConfig==='function'){
      loadPushConfig=async()=>{
        if(typeof state!=='undefined')state.push={...state.push,enabled:false,subscribed:false};
        if(typeof updatePushUI==='function')updatePushUI();
      };
    }
    if(typeof loadHistory==='function'){
      loadHistory=async id=>{
        const local=typeof readLocalHistory==='function'?readLocalHistory(id):[];
        if(typeof state!=='undefined'&&state.history instanceof Map)state.history.set(id,local);
        return local;
      };
    }
  }

  if(typeof renderStats==='function'){
    renderStats=function(){
      const games=state.games.map(mergeGame);
      const catalog=games.filter(g=>g?.type==='catalog'||g?.type==='classic'||g?.categories?.includes('catalog')||g?.categories?.includes('classic')).length;
      const deals=games.filter(verifiedCurrentSale).length;
      const ending=games.filter(g=>{const d1=daysUntil(g.saleEndsAt),d2=daysUntil(g.plusEndsAt);return (d1!==null&&d1>=0&&d1<=3)||(d2!==null&&d2>=0&&d2<=14);}).length;
      const wishDeals=games.filter(g=>wish.has(g.id)&&(verifiedCurrentSale(g)||g.plusIncluded||g?.categories?.includes('catalog')||g?.categories?.includes('monthly'))).length;
      const host=document.querySelector('#stats');if(!host)return;
      host.innerHTML=`<div class="stat"><strong>${catalog}</strong><span>Plus 카탈로그</span><em>게임 + 클래식</em></div><div class="stat"><strong>${deals}</strong><span>현재 할인</span><em>공식 Store 검증</em></div><div class="stat"><strong>${ending}</strong><span>종료 임박</span><em>놓치기 전에</em></div><div class="stat"><strong>${wishDeals}</strong><span>찜 혜택</span><em>${wish.size}개 관심</em></div>`;
    };
  }

  if(typeof curationGroups==='function'){
    const baseCurationGroups=curationGroups;
    curationGroups=function(){
      const groups=baseCurationGroups();
      const dealGroup=groups.find(g=>g.key==='deal');
      if(dealGroup){
        dealGroup.items=state.games.map(mergeGame).filter(g=>g.type!=='promo'&&verifiedCurrentSale(g)).sort((a,b)=>(b.discountPercent||0)-(a.discountPercent||0)||radarScore(b)-radarScore(a)).slice(0,4);
        dealGroup.empty='현재 공식 Store에서 검증된 할인 게임이 없습니다.';
      }
      return groups;
    };
  }

  function activeFilterCount(){
    if(typeof state==='undefined')return 0;
    return [state.content!=='all',state.platform!=='all',state.tier!=='all',state.genre!=='all',state.korean==='yes',state.sort!=='default'].filter(Boolean).length;
  }
  function updateFilterButton(){
    const btn=document.querySelector('#filterBtn');if(!btn)return;
    const count=activeFilterCount();
    const text=count?`필터 ${count}`:'필터';
    const hidden=document.body.dataset.page==='upcoming';
    const title=hidden?'발매예정 화면에서는 별도 필터를 사용하지 않습니다.':count?`${count}개 필터 적용 중`:'빠른 필터';
    if(btn.textContent!==text)btn.textContent=text;
    btn.classList.toggle('active-filter',count>0);
    if(btn.hidden!==hidden)btn.hidden=hidden;
    if(btn.title!==title)btn.title=title;
  }

  function updateCoverage(){
    if(typeof state==='undefined')return;
    const page=document.body.dataset.page;
    const box=document.querySelector('#pageCoverage');
    if(!box)return;
    const games=state.games.map(mergeGame);
    let cls='',html='';
    if(page==='monthly'){
      const n=games.filter(g=>g.type==='monthly'||g?.categories?.includes('monthly')).length;
      cls='page-coverage complete';
      html=`<div><strong>현재 월간 게임 ${n}개</strong><span>PS Plus 공식 월간 라인업 기준 · 자동 갱신 데이터</span></div><a href="https://www.playstation.com/ko-kr/ps-plus/whats-new/" target="_blank" rel="noopener">공식 새소식 ↗</a>`;
    } else if(page==='promo'){
      const n=games.filter(verifiedCurrentSale).length;
      cls='page-coverage partial';
      html=`<div><strong>현재 공식 검증 할인 ${n}개</strong><span>현재가가 정가보다 낮고 Store 검증을 통과한 타이틀만 표시합니다.</span></div><a href="https://store.playstation.com/ko-kr/pages/deals" target="_blank" rel="noopener">PS Store 할인 ↗</a>`;
    } else return;
    if(box.className!==cls)box.className=cls;
    if(box.innerHTML!==html)box.innerHTML=html;
  }

  function syncStoreAutoHistory(){
    if(typeof state==='undefined'||!state.storeAutoHealth?.safeToMerge||!state.storeAutoGeneratedAt)return false;
    const marker='psradar-store-auto-history-at';
    if(localStorage.getItem(marker)===state.storeAutoGeneratedAt)return true;
    const items=state.games.map(mergeGame).filter(g=>g.storeVerified&&g.id).map(g=>({
      id:g.id,currentPrice:g.currentPrice,originalPrice:g.originalPrice,discountPercent:g.discountPercent||0,plusIncluded:!!g.plusIncluded,plusTier:g.plusTier||null
    }));
    if(!items.length)return false;
    try{
      const changes=typeof detectChanges==='function'?detectChanges(items):[];
      if(changes.length)state.changes=[...changes,...(state.changes||[])].filter((x,i,a)=>a.findIndex(y=>`${y.id}|${y.kind}|${y.text}`===`${x.id}|${x.kind}|${x.text}`)===i).slice(0,20);
      if(typeof saveLocalHistory==='function')saveLocalHistory(items);
      let snap={};try{snap=JSON.parse(localStorage.getItem('psradar-store-snapshot')||'{}');}catch{}
      for(const x of items)snap[x.id]={currentPrice:x.currentPrice,discountPercent:x.discountPercent||0,plusIncluded:!!x.plusIncluded,plusTier:x.plusTier||null};
      localStorage.setItem('psradar-store-snapshot',JSON.stringify(snap));
      localStorage.setItem(marker,state.storeAutoGeneratedAt);
      if(typeof renderRadar==='function')renderRadar();
      return true;
    }catch(err){console.warn('Store history sync skipped',err);return false;}
  }

  function refreshChrome(){
    updateFilterButton();
    updateCoverage();
    if(typeof state!=='undefined'&&state.storeAutoGeneratedAt){
      const el=document.querySelector('#storeUpdated');
      const text=typeof formatDateTime==='function'?formatDateTime(state.storeAutoGeneratedAt):'';
      if(el&&el.textContent!==text)el.textContent=text;
    }
    syncStoreAutoHistory();
  }

  const pageObserver=new MutationObserver(refreshChrome);
  window.addEventListener('DOMContentLoaded',()=>{
    pageObserver.observe(document.body,{attributes:true,attributeFilter:['data-page']});
    document.querySelector('#applyFilter')?.addEventListener('click',()=>queueMicrotask(refreshChrome));
    document.querySelector('#clearBtn')?.addEventListener('click',()=>queueMicrotask(refreshChrome));
    document.addEventListener('click',e=>{if(e.target.closest?.('.navbtn[data-page]'))queueMicrotask(refreshChrome);},true);
    refreshChrome();
    let tries=0;const timer=setInterval(()=>{refreshChrome();if(syncStoreAutoHistory()||++tries>40)clearInterval(timer);},250);
  });

  window.__PSRADAR_QA__={verifiedCurrentSale,officialKorean,activeFilterCount};
})();
