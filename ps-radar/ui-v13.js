(() => {
  'use strict';

  const pageMeta = {
    home: {title:'홈', kicker:'PS RADAR', desc:'PlayStation 혜택과 추천 정보를 한눈에 확인합니다.', view:'all'},
    catalog: {title:'PS Plus 카탈로그', kicker:'CATALOG', desc:'현재 게임 카탈로그에 포함된 타이틀을 모아봅니다.', view:'catalog'},
    monthly: {title:'월간 게임', kicker:'MONTHLY', desc:'이번 달 PS Plus 월간 게임을 확인합니다.', view:'monthly'},
    promo: {title:'할인', kicker:'DEALS', desc:'현재 확인된 할인과 프로모션을 모아봅니다.', view:'promo'},
    upcoming: {title:'발매예정', kicker:'UPCOMING', desc:'PlayStation 공식 출처에서 확인된 출시 예정 PS5 타이틀입니다.', view:'upcoming'},
    wishlist: {title:'찜한 게임', kicker:'WISHLIST', desc:'관심 표시한 게임과 현재 혜택을 한곳에서 확인합니다.', view:'wishlist'}
  };

  let upcomingSeed = [];
  let paintingUpcoming = false;

  const localEsc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const safeEsc = typeof esc === 'function' ? esc : localEsc;
  const titleKeyV13 = (s='') => String(s).toLowerCase().replace(/[^a-z0-9가-힣]+/g,'');
  const dateText = (iso, fallback) => {
    if(!iso) return fallback || '출시일 미정';
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? (fallback || iso) : new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(d);
  };
  const gradientFor = (title='PS Radar') => {
    let n=0; for(const c of title)n=(n+c.charCodeAt(0)*17)%360;
    return [`hsl(${n} 46% 31%)`,`hsl(${(n+62)%360} 42% 17%)`];
  };

  async function loadUpcoming(){
    try{
      const r = await fetch(`./data/upcoming.json?v=${Date.now()}`,{cache:'no-store'});
      if(r.ok){const j=await r.json(); upcomingSeed=Array.isArray(j?.items)?j.items:[];}
    }catch(err){console.warn('Upcoming seed unavailable',err);}
  }

  function combinedUpcoming(){
    const today = new Date(); today.setHours(0,0,0,0);
    const existing = (typeof state !== 'undefined' && Array.isArray(state.games)) ? state.games.map(g => typeof mergeGame==='function'?mergeGame(g):g) : [];
    const fromGames = existing.filter(g => {
      if(!g?.releaseDate) return false;
      const d = new Date(`${String(g.releaseDate).slice(0,10)}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).map(g => ({...g,releaseWindow:g.releaseWindow||null,dataQuality:g.dataQuality||'partial'}));
    const merged = new Map();
    [...fromGames,...upcomingSeed].forEach(g=>{
      const k=titleKeyV13(g.title); if(!k)return;
      const prev=merged.get(k)||{}; merged.set(k,{...prev,...g,title:g.title||prev.title});
    });
    return [...merged.values()].sort((a,b)=>{
      const ad=a.releaseDate?new Date(a.releaseDate).getTime():Infinity;
      const bd=b.releaseDate?new Date(b.releaseDate).getTime():Infinity;
      if(ad!==bd)return ad-bd;
      return String(a.title).localeCompare(String(b.title),'ko');
    });
  }

  function upcomingCard(g){
    const [c1,c2]=gradientFor(g.title);
    const image=g.image?`<img class="cover-image" src="${safeEsc(g.image)}" alt="${safeEsc(g.title)} 커버" loading="lazy" referrerpolicy="no-referrer" />`:'';
    const badges=[...(g.platform||[]).slice(0,2).map(x=>`<span class="badge ps">${safeEsc(x)}</span>`),g.ko===true?'<span class="badge">한국어</span>':'',g.dataQuality==='verified'?'<span class="badge quality">공식확인</span>':''].join('');
    const genres=(g.genre||[]).slice(0,2).join(' · ');
    return `<article class="card upcoming-card">
      <div class="cover ${image?'has-image':'image-missing'}" style="--c1:${c1};--c2:${c2}">${image}<div class="cover-content"><span class="cover-kicker">UPCOMING</span><strong class="cover-title">${safeEsc(g.title)}</strong></div></div>
      <div class="body"><div class="meta">${badges}</div><h4>${safeEsc(g.title)}</h4><p>${safeEsc(g.desc||'PlayStation 공식 출시 예정 타이틀입니다.')}</p><span class="release-date">◷ ${safeEsc(dateText(g.releaseDate,g.releaseWindow))}</span>${genres?`<div class="sub">${safeEsc(genres)}</div>`:''}<a class="official-source" href="${safeEsc(g.store||'https://www.playstation.com/ko-kr/ps5/games/')}" target="_blank" rel="noopener">PlayStation 공식 정보 보기 →</a></div>
    </article>`;
  }

  function renderUpcoming(){
    if(document.body.dataset.page!=='upcoming')return;
    const grid=document.querySelector('#grid'), title=document.querySelector('#listTitle'), count=document.querySelector('#countText'), more=document.querySelector('#loadMoreBtn');
    if(!grid)return;
    paintingUpcoming=true;
    const items=combinedUpcoming();
    if(title)title.textContent='발매예정 타이틀';
    if(count)count.textContent=`${items.length}개`;
    if(more)more.hidden=true;
    grid.innerHTML=items.length?items.map(upcomingCard).join(''):'<div class="empty">현재 확인된 발매예정 타이틀이 없습니다.</div>';
    if(!document.querySelector('#imagePolicyNote')){
      const note=document.createElement('p'); note.id='imagePolicyNote'; note.className='image-policy-note'; note.textContent='커버 이미지는 PlayStation 공식 상품/게임 페이지의 대표 이미지를 우선 사용하고, 직접 확인되지 않은 이미지는 임의로 대입하지 않습니다. 이미지가 없거나 차단되면 타이틀 기반 전용 플레이스홀더로 표시합니다.';
      grid.insertAdjacentElement('afterend',note);
    }
    patchImages(grid);
    queueMicrotask(()=>{paintingUpcoming=false;});
  }

  function setPage(page,{scroll=true}={}){
    const meta=pageMeta[page]||pageMeta.home;
    document.body.dataset.page=page;
    document.querySelectorAll('.navbtn[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    document.querySelectorAll('.home-block').forEach(el=>{el.hidden=page!=='home';});
    const ph=document.querySelector('#pageHeader');
    if(ph){
      ph.hidden=page==='home';
      ph.querySelector('[data-page-kicker]').textContent=meta.kicker;
      ph.querySelector('[data-page-title]').textContent=meta.title;
      ph.querySelector('[data-page-desc]').textContent=meta.desc;
    }
    const policy=document.querySelector('#imagePolicyNote'); if(policy)policy.remove();

    if(typeof state!=='undefined'){
      state.quick='none'; state.content='all'; state.view=meta.view==='upcoming'?'all':meta.view; if(typeof resetVisible==='function')resetVisible();
    }
    if(page==='upcoming') renderUpcoming();
    else if(typeof renderGames==='function') renderGames();
    if(scroll) window.scrollTo({top:0,behavior:'smooth'});
  }

  function patchImages(root=document){
    root.querySelectorAll('.cover').forEach(cover=>{if(!cover.querySelector('img'))cover.classList.add('image-missing');});
    root.querySelectorAll('.curation-thumb').forEach(t=>{if(!t.querySelector('img'))t.classList.add('image-missing');});
    root.querySelectorAll('.cover-image,.curation-thumb img,.detail-hero-img').forEach(img=>{
      if(img.dataset.fallbackBound)return; img.dataset.fallbackBound='1'; img.referrerPolicy='no-referrer'; img.decoding='async';
      img.addEventListener('error',()=>{
        const cover=img.closest('.cover'); if(cover){cover.classList.remove('has-image');cover.classList.add('image-missing');}
        const thumb=img.closest('.curation-thumb'); if(thumb)thumb.classList.add('image-missing');
        img.remove();
      },{once:true});
    });
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('.navbtn[data-page]'); if(!btn)return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    setPage(btn.dataset.page);
  },true);

  const observer=new MutationObserver(mutations=>{
    patchImages(document);
    if(document.body.dataset.page==='upcoming'&&!paintingUpcoming){
      const touchedGrid=mutations.some(m=>m.target?.id==='grid'||m.target?.closest?.('#grid'));
      if(touchedGrid)setTimeout(renderUpcoming,0);
    }
  });

  window.addEventListener('DOMContentLoaded',async()=>{
    await loadUpcoming();
    patchImages(document);
    observer.observe(document.body,{childList:true,subtree:true});
    setPage('home',{scroll:false});
  });
})();
