(() => {
  'use strict';

  const VERSION='17.8.1';

  function releaseTime(g){
    const raw=g?.releaseDate;
    if(!raw)return Number.NEGATIVE_INFINITY;
    const t=new Date(raw).getTime();
    return Number.isFinite(t)?t:Number.NEGATIVE_INFINITY;
  }

  function latestReleaseSort(items=[]){
    return [...items].sort((a,b)=>{
      const diff=releaseTime(b)-releaseTime(a);
      if(Number.isFinite(diff)&&diff!==0)return diff;
      const added=String(b?.catalogAddedAt||b?.discoveredAt||'').localeCompare(String(a?.catalogAddedAt||a?.discoveredAt||''));
      if(added!==0)return added;
      return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
    });
  }

  function ensureReleaseSortOption(){
    const select=document.getElementById('sort');
    if(!select||select.querySelector('option[value="release"]'))return;
    const option=document.createElement('option');
    option.value='release';
    option.textContent='최신 발매 순';
    const score=select.querySelector('option[value="score"]');
    score?select.insertBefore(option,score):select.appendChild(option);
  }

  if(typeof filteredGames==='function'){
    const baseFiltered1781=filteredGames;
    filteredGames=function(){
      const rows=baseFiltered1781();
      return typeof state!=='undefined'&&state.sort==='release'?latestReleaseSort(rows):rows;
    };
  }

  window.addEventListener('DOMContentLoaded',ensureReleaseSortOption);
  queueMicrotask(ensureReleaseSortOption);

  window.__PSRADAR_RELEASE_SORT__={VERSION,latestReleaseSort,releaseTime,ensureReleaseSortOption};
})();
