(function(){
  'use strict';
  const V='1.0.3';
  const LABELS={
    skin:{'#F5DCC7':'라이트','#E7C3A5':'웜 라이트','#C9956B':'미디엄','#9A6546':'브론즈','#6A4332':'딥'},
    hair:{'#211C19':'블랙','#4B3429':'다크 브라운','#7A523B':'브라운','#A06E42':'라이트 브라운','#8B8D93':'애쉬'},
    hairStyle:{crop:'크롭',side:'사이드',textured:'텍스처',wave:'웨이브',bob:'보브',long:'롱',pixie:'픽시',curtain:'커튼',ponytail:'포니테일',bun:'번',straight:'스트레이트',layered:'레이어드'},
    face:{oval:'타원',round:'라운드',square:'스퀘어',heart:'하트',long:'긴 얼굴',diamond:'다이아',softsquare:'소프트 스퀘어',vline:'V라인'},
    eyes:{soft:'소프트',round:'라운드',sharp:'샤프',smile:'웃는 눈',almond:'아몬드',monolid:'무쌍',upturned:'업턴',downturned:'다운턴'},
    brows:{straight:'일자',arch:'아치',bold:'볼드',soft:'소프트',angled:'각진',thin:'슬림'},
    nose:{small:'미니멀',straight:'직선',defined:'선명',button:'버튼',round:'둥근',high:'높은 콧대'},
    lips:{smile:'미소',soft:'소프트',full:'볼륨',neutral:'뉴트럴',thin:'슬림',cupid:'큐피드'},
    glasses:{none:'없음',round:'라운드',square:'스퀘어',sun:'선글라스',metal:'메탈',cat:'캣아이'},
    scene:{studio:'스튜디오',city:'도시',cafe:'카페',park:'공원'}
  };
  const EXTRA={
    hairStyle:['pixie','curtain','ponytail','bun','straight','layered'],
    face:['long','diamond','softsquare','vline'],
    eyes:['almond','monolid','upturned','downturned'],
    brows:['soft','angled','thin'],
    nose:['button','round','high'],
    lips:['thin','cupid'],
    glasses:['metal','cat']
  };

  const css=document.createElement('style');
  css.id='avatar-v103-css';
  css.textContent=`
    .v103-badge{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:5px 9px;border-radius:999px;background:rgba(255,122,82,.12);box-shadow:inset 0 0 0 1px rgba(255,122,82,.35);font-size:12px;font-weight:800;color:#ff9a78;vertical-align:middle}
    .avatar-sheet{max-height:94vh!important;padding-bottom:28px!important}
    .avatar-preview-card{position:sticky;top:-18px;z-index:5;display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:center;margin:0 0 16px;padding:14px;border-radius:22px;background:rgba(24,21,18,.96);box-shadow:0 14px 36px rgba(0,0,0,.34),inset 0 0 0 1px rgba(255,255,255,.09);backdrop-filter:blur(14px)}
    .avatar-preview-visual{width:132px;height:132px;border-radius:19px;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,rgba(255,255,255,.10),rgba(255,255,255,.025));overflow:hidden}
    .avatar-preview-visual svg{width:118px;height:118px}.avatar-preview-copy b{display:block;font-size:18px;margin-bottom:5px}.avatar-preview-copy span{font-size:13px;line-height:1.55;color:rgba(247,241,230,.66)}
    .avatar-grid{gap:12px!important}.avatar-group{padding:16px!important}.avatar-group h4{font-size:15px!important;margin-bottom:12px!important}
    .avatar-options{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px!important}
    .avatar-option{position:relative;min-height:82px!important;border-radius:16px!important;padding:8px!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(255,255,255,.045)!important;color:#eee!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.09)!important;font-size:12px!important;line-height:1.2;text-align:center;overflow:visible}
    .avatar-option:hover{background:rgba(255,255,255,.075)!important}.avatar-option.active{background:rgba(255,122,82,.13)!important;color:#fff!important;box-shadow:inset 0 0 0 2px #ff8968,0 0 0 3px rgba(255,137,104,.10)!important}
    .avatar-option.active::after{content:'✓';position:absolute;right:6px;top:6px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#ff7a52;color:white;font-size:12px;font-weight:900;box-shadow:0 4px 10px rgba(0,0,0,.25)}
    .avatar-option-preview{width:48px;height:38px;display:grid;place-items:center}.avatar-option-preview svg{width:48px;height:38px;overflow:visible}.avatar-option-label{display:block;white-space:normal}
    .avatar-swatch{width:auto!important;height:auto!important;border-radius:16px!important;background:rgba(255,255,255,.045)!important}.avatar-swatch .avatar-option-preview{width:48px;height:48px}.avatar-swatch-dot{display:block;width:42px;height:42px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25),0 5px 12px rgba(0,0,0,.22)}
    .avatar-name{font-size:17px!important;padding:14px!important}.avatar-save{font-size:17px!important;padding:17px!important}.avatar-hint{font-size:14px!important}
    .lookbook-stage{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}.editorial-figure{min-height:390px!important}.look-switcher.inline-under-avatar{order:2;margin:8px 0 4px!important}.look-details{order:3;padding-top:8px!important}.avatar-tools{order:2;margin:6px 0 10px!important}
    .look-switcher.inline-under-avatar .look-tab{min-height:70px!important;padding:12px!important}.look-switcher.inline-under-avatar .look-tab span{font-size:13px!important}
    @media(max-width:560px){.avatar-preview-card{grid-template-columns:104px 1fr}.avatar-preview-visual{width:104px;height:104px}.avatar-preview-visual svg{width:94px;height:94px}.avatar-options{grid-template-columns:repeat(2,minmax(0,1fr))!important}.avatar-option{min-height:88px!important}.editorial-figure{min-height:350px!important}}
  `;
  document.head.appendChild(css);

  function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]))}
  function facePath(v){
    if(v==='round') return '<ellipse cx="24" cy="22" rx="13" ry="14"/>';
    if(v==='square') return '<rect x="11" y="8" width="26" height="29" rx="7"/>';
    if(v==='heart') return '<path d="M24 38C14 36 10 29 11 19C12 10 18 8 24 11C30 8 36 10 37 19C38 29 34 36 24 38Z"/>';
    if(v==='long') return '<ellipse cx="24" cy="22" rx="10.5" ry="16"/>';
    if(v==='diamond') return '<path d="M24 6C33 9 38 16 36 24C34 32 29 37 24 40C19 37 14 32 12 24C10 16 15 9 24 6Z"/>';
    if(v==='softsquare') return '<rect x="11" y="7" width="26" height="31" rx="11"/>';
    if(v==='vline') return '<path d="M24 40C15 35 11 29 11 18C11 9 18 7 24 10C30 7 37 9 37 18C37 29 33 35 24 40Z"/>';
    return '<ellipse cx="24" cy="22" rx="12" ry="15"/>';
  }
  function hairPath(v){
    const p={
      crop:'M11 18C12 6 36 6 37 18C30 13 19 13 11 18Z',side:'M11 19C12 7 35 5 38 18C30 12 26 12 20 14C16 15 13 17 11 19Z',textured:'M10 19Q12 7 17 10Q21 3 25 10Q30 3 33 11Q38 10 38 19Q30 13 24 14Q17 13 10 19Z',wave:'M10 20C7 7 18 3 25 6C35 2 41 10 37 24C33 16 30 13 24 13C18 13 14 16 10 20Z',bob:'M10 19C9 5 39 4 39 20L37 36Q32 39 29 34L35 20Q24 11 13 20L18 34Q14 40 11 34Z',long:'M10 20C9 5 39 3 40 20C39 31 41 42 36 48L31 43L35 20Q24 11 13 20L16 43L12 48C8 40 10 31 10 20Z',pixie:'M11 20Q11 8 18 9Q21 4 26 9Q31 5 36 11L38 19Q30 14 23 14Q16 15 11 20Z',curtain:'M10 20C10 6 38 4 39 20C33 14 28 12 24 13C18 12 14 15 10 20ZM24 8L24 22',ponytail:'M10 20C9 5 39 4 39 20C33 14 29 12 24 13C19 12 14 15 10 20ZM38 18Q49 23 43 36Q39 32 37 25',bun:'M11 20C11 7 37 6 38 20C31 14 18 14 11 20ZM24 7C18 7 17 1 24 0C31 1 30 7 24 7Z',straight:'M10 20C9 5 39 4 39 20L37 47H32L35 20Q24 11 13 20L16 47H11Z',layered:'M10 20C9 5 39 3 40 20L37 39Q34 46 30 42L33 27Q28 34 24 31Q20 35 15 28L18 42Q13 46 10 39Z'};
    return p[v]||p.side;
  }
  function featurePreview(key,v){
    const stroke='#eee';
    if(key==='face') return `<svg viewBox="0 0 48 44"><g fill="none" stroke="${stroke}" stroke-width="1.8">${facePath(v)}</g></svg>`;
    if(key==='hairStyle') return `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="25" rx="11" ry="14" fill="#d7b79e" opacity=".75"/><path d="${hairPath(v)}" fill="#42322b" stroke="#5c463b" stroke-width=".7"/></svg>`;
    if(key==='eyes'){
      const m={soft:'M10 23Q16 20 22 23M26 23Q32 20 38 23',round:'M16 23a2.8 2.8 0 1 0 .1 0M32 23a2.8 2.8 0 1 0 .1 0',sharp:'M10 24L22 20M26 20L38 24',smile:'M10 24Q16 18 22 24M26 24Q32 18 38 24',almond:'M9 23Q16 18 23 23Q16 27 9 23M25 23Q32 18 39 23Q32 27 25 23',monolid:'M10 23Q16 22 22 23M26 23Q32 22 38 23',upturned:'M10 24Q16 22 22 20M26 20Q32 22 38 24',downturned:'M10 21Q16 23 22 25M26 25Q32 23 38 21'};return `<svg viewBox="0 0 48 44"><path d="${m[v]||m.soft}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`;
    }
    if(key==='brows'){
      const m={straight:'M9 23L21 23M27 23L39 23',arch:'M9 24Q15 18 21 23M27 23Q33 18 39 24',bold:'M9 24L21 22M27 22L39 24',soft:'M9 24Q15 21 21 23M27 23Q33 21 39 24',angled:'M9 25L16 20L22 23M26 23L32 20L39 25',thin:'M10 23L21 22M27 22L38 23'};return `<svg viewBox="0 0 48 44"><path d="${m[v]||m.straight}" fill="none" stroke="${stroke}" stroke-width="${v==='bold'?3:1.8}" stroke-linecap="round"/></svg>`;
    }
    if(key==='nose'){
      const m={small:'M24 17L23 27L27 27',straight:'M24 14L23 28Q26 29 28 27',defined:'M24 14L21 27L25 30L29 27',button:'M24 18L23 27Q24 30 29 28',round:'M24 17Q20 27 24 30Q29 30 30 27',high:'M24 11L22 28L27 29'};return `<svg viewBox="0 0 48 44"><path d="${m[v]||m.small}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    if(key==='lips'){
      const m={smile:'M13 22Q24 31 35 22',soft:'M14 24Q24 27 34 24',full:'M13 24Q24 17 35 24Q24 32 13 24Z',neutral:'M15 24L33 24',thin:'M17 24Q24 25 31 24',cupid:'M13 25Q19 18 24 22Q29 18 35 25Q24 31 13 25Z'};return `<svg viewBox="0 0 48 44"><path d="${m[v]||m.smile}" ${['full','cupid'].includes(v)?'fill="#c9837e" opacity=".8"':'fill="none"'} stroke="${stroke}" stroke-width="1.7" stroke-linecap="round"/></svg>`;
    }
    if(key==='glasses') return `<svg viewBox="0 0 48 44"><text x="24" y="29" fill="${stroke}" font-size="20" text-anchor="middle">${v==='none'?'—':v==='round'?'○○':v==='square'?'□□':v==='sun'?'▰▰':v==='metal'?'◯─◯':'⌁⌁'}</text></svg>`;
    if(key==='scene') return `<svg viewBox="0 0 48 44"><text x="24" y="29" fill="${stroke}" font-size="19" text-anchor="middle">${{studio:'◻',city:'▥',cafe:'☕',park:'♧'}[v]||'◻'}</text></svg>`;
    return `<svg viewBox="0 0 48 44"><circle cx="24" cy="22" r="12" fill="none" stroke="${stroke}"/></svg>`;
  }

  function bustSvg(p){
    const skin=p.skin||'#E7C3A5', hair=p.hair||'#211C19', ink='#2b241d';
    const fp=facePath(p.face||'oval').replaceAll('/>',' fill="'+skin+'" stroke="'+skin+'"/>');
    let eyes=featurePreview('eyes',p.eyes||'soft').replace('<svg viewBox="0 0 48 44">','').replace('</svg>','');
    let brows=featurePreview('brows',p.brows||'straight').replace('<svg viewBox="0 0 48 44">','').replace('</svg>','');
    let nose=featurePreview('nose',p.nose||'small').replace('<svg viewBox="0 0 48 44">','').replace('</svg>','');
    let lips=featurePreview('lips',p.lips||'smile').replace('<svg viewBox="0 0 48 44">','').replace('</svg>','');
    const hp=hairPath(p.hairStyle||'side');
    return `<svg viewBox="0 0 48 52" aria-hidden="true"><g>${fp}</g><path d="${hp}" fill="${hair}"/><g transform="translate(0 2)" stroke="${ink}">${brows}${eyes}${nose}${lips}</g><path d="M10 52Q24 39 38 52Z" fill="#777"/></svg>`;
  }

  function addExtraOptions(modal){
    Object.entries(EXTRA).forEach(([key,vals])=>{
      const box=modal.querySelector(`.avatar-group[data-key="${key}"] .avatar-options`); if(!box)return;
      vals.forEach(v=>{if(box.querySelector(`[data-value="${v}"]`))return;const b=document.createElement('button');b.className='avatar-option';b.dataset.value=v;b.textContent=LABELS[key][v]||v;box.appendChild(b);});
    });
  }
  function decorate(modal){
    addExtraOptions(modal);
    modal.querySelectorAll('.avatar-group[data-key]').forEach(g=>{
      const key=g.dataset.key;
      g.querySelectorAll('.avatar-option').forEach(b=>{
        const v=b.dataset.value, label=(LABELS[key]&&LABELS[key][v])||b.title||b.textContent.trim()||v;
        b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',b.classList.contains('active')?'true':'false');
        if(/^#/.test(v)){
          b.classList.add('avatar-swatch');b.removeAttribute('style');
          b.innerHTML=`<span class="avatar-option-preview"><i class="avatar-swatch-dot" style="background:${esc(v)}"></i></span><span class="avatar-option-label">${esc(label)}</span>`;
        }else{
          b.innerHTML=`<span class="avatar-option-preview">${featurePreview(key,v)}</span><span class="avatar-option-label">${esc(label)}</span>`;
        }
      });
    });
    if(!modal.querySelector('.avatar-preview-card')){
      const nameGroup=modal.querySelector('.avatar-group');
      const card=document.createElement('div');card.className='avatar-preview-card';card.innerHTML='<div class="avatar-preview-visual" id="avatarLiveVisual"></div><div class="avatar-preview-copy"><b>바로 보면서 꾸미기</b><span>선택할 때마다 얼굴과 헤어가 즉시 바뀝니다.<br>선택된 항목은 주황색 테두리와 ✓로 표시됩니다.</span></div>';
      nameGroup?.insertAdjacentElement('beforebegin',card);
    }
    updatePreview(modal);
  }
  function updatePreview(modal){
    const p=window.__avatarProfile||{}; const el=modal.querySelector('#avatarLiveVisual');if(el)el.innerHTML=bustSvg(p);
    modal.querySelectorAll('.avatar-option').forEach(b=>{const g=b.closest('.avatar-group[data-key]'); if(!g)return; const active=String(p[g.dataset.key])===String(b.dataset.value);b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')});
  }

  const oldOpen=window.openAvatarEditor;
  window.openAvatarEditor=function(){oldOpen&&oldOpen();const m=document.getElementById('avatarModal');if(!m)return;decorate(m);requestAnimationFrame(()=>updatePreview(m));};
  const modal=document.getElementById('avatarModal');if(modal)decorate(modal);
  document.addEventListener('click',e=>{const b=e.target.closest?.('#avatarModal .avatar-option');if(b)setTimeout(()=>updatePreview(document.getElementById('avatarModal')),0)},true);

  function fixSave(){
    const m=document.getElementById('avatarModal');const save=m?.querySelector('.avatar-save');if(!save||save.dataset.v103)return;save.dataset.v103='1';
    save.onclick=()=>{
      const p={...(window.__avatarProfile||{}),name:m.querySelector('#avatarName')?.value.trim()||'MY AVATAR'};window.__avatarProfile=p;localStorage.setItem('todayCodiAvatarV2',JSON.stringify(p));m.classList.remove('open');
      if(window.__lastCodiState&&window.__lastCodiForecast)window.renderTicket(window.__lastCodiState,window.__lastCodiForecast);
      setTimeout(()=>{const fig=document.getElementById('editorialFigure'), sw=document.getElementById('lookSwitcher');if(fig&&sw){sw.classList.add('inline-under-avatar');fig.insertAdjacentElement('afterend',sw);const details=document.querySelector('.look-details');if(details&&sw.nextElementSibling!==details)sw.insertAdjacentElement('afterend',details);}document.getElementById('editorialFigure')?.scrollIntoView({behavior:'smooth',block:'start'});},60);
    };
  }
  fixSave();
  const oldOpen2=window.openAvatarEditor;window.openAvatarEditor=function(){oldOpen2();setTimeout(()=>{decorate(document.getElementById('avatarModal'));fixSave()},0)};

  const oldBuild=window.buildFigureSVG;
  window.buildFigureSVG=function(gender,palette,hasOuter,shortSleeve,bodyType,option={},outerText=''){
    const p=window.__avatarProfile||{};
    const map={hairStyle:{pixie:'crop',curtain:'side',ponytail:'long',bun:'bob',straight:'long',layered:'wave'},face:{long:'oval',diamond:'heart',softsquare:'square',vline:'heart'},eyes:{almond:'soft',monolid:'soft',upturned:'sharp',downturned:'soft'},brows:{soft:'straight',angled:'arch',thin:'straight'},nose:{button:'small',round:'small',high:'straight'},lips:{thin:'neutral',cupid:'full'},glasses:{metal:'round',cat:'square'}};
    const original={...p};Object.entries(map).forEach(([k,m])=>{if(m[p[k]])window.__avatarProfile={...window.__avatarProfile,[k]:m[p[k]]}});
    let svg=oldBuild(gender,palette,hasOuter,shortSleeve,bodyType,option,outerText);
    window.__avatarProfile=original;
    let extra='';
    if(p.hairStyle==='ponytail')extra+='<path d="M164 55 Q190 72 170 112" fill="none" stroke="'+(p.hair||'#211C19')+'" stroke-width="13" stroke-linecap="round"/>';
    if(p.hairStyle==='bun')extra+='<circle cx="130" cy="39" r="15" fill="'+(p.hair||'#211C19')+'"/>';
    if(p.hairStyle==='curtain')extra+='<path d="M130 42 L130 71" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>';
    if(p.face==='long')extra+='<path d="M104 74 Q130 116 156 74" fill="none" stroke="rgba(43,36,29,.10)"/>';
    if(p.face==='diamond')extra+='<path d="M103 70 Q130 111 157 70" fill="none" stroke="rgba(43,36,29,.11)"/>';
    if(p.eyes==='monolid')extra+='<path d="M116 73H126 M134 73H144" stroke="#2B241D" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>';
    if(p.eyes==='almond')extra+='<path d="M115 73 Q121 68 127 73 Q121 77 115 73 M133 73 Q139 68 145 73 Q139 77 133 73" fill="none" stroke="#2B241D" stroke-opacity=".55" stroke-width="1.3"/>';
    if(p.eyes==='downturned')extra+='<path d="M116 70 Q121 73 126 76 M134 76 Q139 73 144 70" fill="none" stroke="#2B241D" stroke-opacity=".55" stroke-width="1.4"/>';
    if(p.brows==='thin')extra+='<path d="M116 64L126 63 M134 63L144 64" stroke="#2B241D" stroke-opacity=".65" stroke-width=".8"/>';
    if(p.brows==='angled')extra+='<path d="M116 66L122 62L127 65 M133 65L138 62L144 66" fill="none" stroke="#2B241D" stroke-width="1.8"/>';
    if(p.nose==='button')extra+='<path d="M126 86 Q130 89 135 86" fill="none" stroke="#2B241D" stroke-opacity=".28" stroke-width="1.2"/>';
    if(p.lips==='cupid')extra+='<path d="M121 92 Q126 87 130 90 Q134 87 139 92 Q130 98 121 92Z" fill="#a55d58" fill-opacity=".38"/>';
    if(p.glasses==='metal')extra+='<circle cx="120" cy="72" r="8" fill="none" stroke="#8b8580" stroke-width="1"/><circle cx="140" cy="72" r="8" fill="none" stroke="#8b8580" stroke-width="1"/><path d="M128 72H132" stroke="#8b8580"/>';
    if(p.glasses==='cat')extra+='<path d="M111 67L128 65L126 78H113Z M132 65L149 67L147 78H134Z" fill="none" stroke="#2c2a28" stroke-width="1.6"/>';
    if(extra)svg=svg.replace('</g></svg>',extra+'</g></svg>');
    return svg;
  };

  function compactStudio(){
    const fig=document.getElementById('editorialFigure'),sw=document.getElementById('lookSwitcher'),details=document.querySelector('.look-details');if(!fig||!sw)return;
    sw.classList.add('inline-under-avatar');fig.insertAdjacentElement('afterend',sw);if(details)sw.insertAdjacentElement('afterend',details);
  }
  const prevRender=window.renderTicket;
  window.renderTicket=function(){const r=prevRender.apply(this,arguments);setTimeout(compactStudio,0);return r};
  setTimeout(compactStudio,100);

  const title=document.querySelector('.masthead h1');if(title&&!document.getElementById('v103Badge')){const b=document.createElement('span');b.id='v103Badge';b.className='v103-badge';b.textContent='v1.0.3 · 아바타+';title.appendChild(b)}
})();
