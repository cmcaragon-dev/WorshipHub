/* CHORDIO V62 — Modern UX + Favorites/Recent + Service Picker + Live Mode */
(function(){
  const LS={fav:'chordioFavorites',recent:'chordioRecentSongs',live:'chordioLiveMode'};
  const get=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch(_){return d}};
  const set=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  function toast(msg,type='success'){
    let box=document.getElementById('chordioToastStack'); if(!box){box=document.createElement('div');box.id='chordioToastStack';document.body.appendChild(box)}
    const el=document.createElement('div');el.className='chordio-toast '+type;el.innerHTML=`<span>${type==='success'?'✓':type==='error'?'!':'i'}</span><div>${esc(msg)}</div>`;box.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show')); setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),220)},2600);
  }
  window.chordioToast=toast;
  function favIds(){return get(LS.fav,[]).map(String)}
  function recentIds(){return get(LS.recent,[]).map(String)}
  function isFav(id){return favIds().includes(String(id))}
  function toggleFav(song){
    const id=String(song?.id||''); if(!id)return;
    let a=favIds(); if(a.includes(id)){a=a.filter(x=>x!==id);toast('Removed from Favorites','info')}else{a.unshift(id);toast('Added to Favorites')}
    set(LS.fav,[...new Set(a)].slice(0,100)); decorateSongs(); renderLibraryPanels();
  }
  function markRecent(song){const id=String(song?.id||'');if(!id)return;let a=recentIds().filter(x=>x!==id);a.unshift(id);set(LS.recent,a.slice(0,20));renderLibraryPanels()}
  function findSong(id){return (window.songs||[]).find(s=>String(s?.id)===String(id))}
  window.chordioToggleFavorite=toggleFav;
  window.chordioMarkRecent=markRecent;
  function decorateSongs(){
    const grid=document.getElementById('songGrid');if(!grid)return;
    grid.querySelectorAll('.song-card').forEach(card=>{
      const id=card.dataset.songId; const song=findSong(id); if(!song)return;
      let b=card.querySelector('.chordio-favorite-btn');
      if(!b){b=document.createElement('button');b.type='button';b.className='chordio-favorite-btn';b.title='Favorite';b.setAttribute('aria-label','Favorite song');
        const title=card.querySelector('h3'); if(title) title.insertAdjacentElement('beforebegin',b);
        b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFav(song)});
      }
      b.innerHTML=isFav(id)?'★':'☆';b.classList.toggle('active',isFav(id));
      const open=card.querySelector('.open-song'); if(open && !open.dataset.recentBound){open.dataset.recentBound='1';open.addEventListener('click',()=>markRecent(song))}
    });
  }
  function panelCard(song,kind){
    if(!song)return '';
    const id=esc(song.id), title=esc(song.title||'Untitled Song'), artist=esc(song.artist||'—');
    return `<div class="chordio-library-item"><div><strong>${title}</strong><small>${artist}</small></div><div class="chordio-library-actions"><button type="button" data-lib-open="${id}">Open</button><button type="button" data-lib-fav="${id}" class="${isFav(id)?'active':''}">${isFav(id)?'★':'☆'}</button></div></div>`;
  }
  function renderLibraryPanels(){
    const favBox=document.getElementById('chordioFavoritesList'),recentBox=document.getElementById('chordioRecentList');
    const songs=window.songs||[];
    if(favBox){const arr=favIds().map(findSong).filter(Boolean).slice(0,6);favBox.innerHTML=arr.length?arr.map(s=>panelCard(s,'fav')).join(''):'<div class="chordio-empty">No favorite songs yet. Click ☆ on a song.</div>'}
    if(recentBox){const arr=recentIds().map(findSong).filter(Boolean).slice(0,6);recentBox.innerHTML=arr.length?arr.map(s=>panelCard(s,'recent')).join(''):'<div class="chordio-empty">Songs you open will appear here.</div>'}
    document.querySelectorAll('[data-lib-open]').forEach(b=>b.onclick=()=>{const s=findSong(b.dataset.libOpen);if(!s)return;markRecent(s);location.href=s.customSong?`custom-song.html?id=${encodeURIComponent(s.id)}`:(s.file||'#')});
    document.querySelectorAll('[data-lib-fav]').forEach(b=>b.onclick=()=>toggleFav(findSong(b.dataset.libFav)));
  }
  function addDashboard(){
    const content=document.querySelector('.content');if(!content||document.getElementById('chordioModernLibrary'))return;
    const wrap=document.createElement('section');wrap.id='chordioModernLibrary';wrap.innerHTML=`
      <div class="chordio-quick"><div class="chordio-quick-head"><div><span>QUICK ACTIONS</span><h2>Control Center</h2></div><p>Prepare your service, songs and presentation from one place.</p></div>
        <div class="chordio-quick-grid"><button data-quick="service">＋ New Service</button><button data-quick="planner">▣ Service Planner</button><button data-quick="multi">▣ Multi-Screen</button><button data-quick="songs">♫ Songs</button><button data-quick="bible">▤ Bible</button></div></div>
      <div class="chordio-library-grid"><section class="chordio-library-card"><div class="chordio-card-head"><h3>★ Favorites</h3><span id="chordioFavCount">0</span></div><div id="chordioFavoritesList"></div></section><section class="chordio-library-card"><div class="chordio-card-head"><h3>◷ Recently Used</h3><span id="chordioRecentCount">0</span></div><div id="chordioRecentList"></div></section></div>`;
    const h=content.querySelector('h2'); content.insertBefore(wrap,h||content.firstChild);
    wrap.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>quickAction(b.dataset.quick)));
    renderLibraryPanels();
  }
  function servicePicker(){
    let modal=document.getElementById('chordioServicePicker');if(modal){modal.classList.add('show');renderServicePicker();return}
    modal=document.createElement('div');modal.id='chordioServicePicker';modal.className='chordio-modal';modal.innerHTML=`<div class="chordio-dialog"><div class="chordio-dialog-head"><div><span>CHOOSE SERVICE</span><h3>Open Multi-Screen</h3></div><button type="button" data-close>✕</button></div><p class="chordio-dialog-help">Choose the Service Planner you want to control on the Multi-Screen page.</p><div id="chordioServicePickerList"></div></div>`;document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.classList.remove('show');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('show')});renderServicePicker();
  }
  function renderServicePicker(){const box=document.getElementById('chordioServicePickerList');if(!box)return;const list=Array.isArray(window.services)?window.services:[];box.innerHTML=list.length?list.map(s=>`<button class="chordio-service-choice" data-service-choice="${esc(s.id)}"><span><strong>${esc(s.name||'Unnamed Service')}</strong><small>${Array.isArray(s.songs)?s.songs.length:0} songs</small></span><b>OPEN →</b></button>`).join(''):'<div class="chordio-empty">No Service Planner created yet.</div>';box.querySelectorAll('[data-service-choice]').forEach(b=>b.onclick=()=>{const s=list.find(x=>String(x.id)===String(b.dataset.serviceChoice));if(!s)return;document.getElementById('chordioServicePicker')?.classList.remove('show');if(typeof window.startMultiScreenService==='function')window.startMultiScreenService(s.id);else toast('Multi-Screen service launcher is not available','error')})}
  function quickAction(type){
    if(type==='multi'){servicePicker();return}
    if(type==='songs'){document.querySelector('[onclick="showAllSongs()"]')?.click();return}
    if(type==='planner'){document.getElementById('servicePlannerBtn')?.click();return}
    if(type==='service'){document.getElementById('servicePlannerBtn')?.click();setTimeout(()=>document.getElementById('serviceName')?.focus(),250);return}
    if(type==='bible'){toast('Open a song and use Multi-Screen → Online Bible','info')}
  }
  function shortcutHelp(){
    let m=document.getElementById('chordioShortcutHelp');if(!m){m=document.createElement('div');m.id='chordioShortcutHelp';m.className='chordio-modal';m.innerHTML=`<div class="chordio-dialog"><div class="chordio-dialog-head"><div><span>KEYBOARD SHORTCUTS</span><h3>CHORDIO Controls</h3></div><button data-close>✕</button></div><div class="chordio-shortcuts"><div><kbd>←</kbd><span>Previous song</span></div><div><kbd>→</kbd><span>Next song</span></div><div><kbd>Space</kbd><span>Next</span></div><div><kbd>↑</kbd><span>Previous section</span></div><div><kbd>↓</kbd><span>Next section</span></div><div><kbd>1–4</kbd><span>Select / control screen</span></div><div><kbd>B</kbd><span>Blank all outputs</span></div><div><kbd>L</kbd><span>Toggle Live Mode</span></div><div><kbd>?</kbd><span>Show this help</span></div><div><kbd>Esc</kbd><span>Close current panel</span></div></div></div>`;document.body.appendChild(m);m.querySelector('[data-close]').onclick=()=>m.classList.remove('show')}
    m.classList.add('show');
  }
  window.chordioShortcutHelp=shortcutHelp;
  function liveState(){return localStorage.getItem(LS.live)==='true'}
  function setLive(on){localStorage.setItem(LS.live,on?'true':'false');document.body.classList.toggle('chordio-live-mode',on);document.querySelectorAll('.chordio-live-toggle').forEach(b=>{b.classList.toggle('live',on);b.classList.toggle('prepare',!on);b.innerHTML=on?'● LIVE':'○ PREPARE'});toast(on?'LIVE MODE ON — controls locked':'PREPARE MODE — controls unlocked',on?'success':'info')}
  function addMultiLive(){
    const head=document.querySelector('#multiScreenControl .multi-screen-head');if(!head||document.getElementById('chordioLiveToggle'))return;
    const status=document.createElement('span');status.id='chordioAutosave';status.className='chordio-autosave';status.textContent='✓ Auto-save ready';head.appendChild(status);
    const b=document.createElement('button');b.id='chordioLiveToggle';b.className='chordio-live-toggle';b.type='button';b.innerHTML='○ PREPARE';b.onclick=()=>setLive(!liveState());head.appendChild(b);setLive(liveState());
  }

  function bindLyricsPresets(){
    document.querySelectorAll('[data-lyrics-preset]').forEach(b=>{if(b.dataset.bound==='1')return;b.dataset.bound='1';b.onclick=async()=>{
      const type=b.dataset.lyricsPreset;const values={standard:{fontPx:72,spacing:1.15,vertical:50},large:{fontPx:90,spacing:1.1,vertical:50},projector:{fontPx:100,spacing:1.05,vertical:50},reset:{fontPx:100,spacing:1.15,vertical:50}}[type];if(!values)return;
      const ids=[['multiLyricsFontPx',values.fontPx],['multiLyricsSpacing',values.spacing],['multiLyricsVertical',values.vertical]];ids.forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.value=String(v)});
      document.getElementById('multiLyricsFontValue')?.replaceChildren(document.createTextNode(values.fontPx+' px'));document.getElementById('multiLyricsSpacingValue')?.replaceChildren(document.createTextNode(values.spacing.toFixed(2)));document.getElementById('multiLyricsVerticalValue')?.replaceChildren(document.createTextNode(values.vertical+'%'));
      const apply=document.getElementById('multiLyricsSettingsApply');apply?.click();const st=document.getElementById('chordioAutosave');if(st){st.textContent='✓ Saved';st.classList.add('saved');setTimeout(()=>{st.textContent='✓ Auto-save ready';st.classList.remove('saved')},1400)}
    }});
  }
  function bindAutosave(){
    const root=document.getElementById('multiScreenControl');if(!root||root.dataset.autoBound==='1')return;root.dataset.autoBound='1';
    root.addEventListener('input',()=>{const st=document.getElementById('chordioAutosave');if(st){st.textContent='• Changes ready to save';st.classList.remove('saved')}});
    root.addEventListener('click',e=>{if(e.target.closest('button')){const st=document.getElementById('chordioAutosave');if(st){st.textContent='✓ Saved';st.classList.add('saved');setTimeout(()=>{st.textContent='✓ Auto-save ready';st.classList.remove('saved')},1300)}}});
  }

  function observe(){addDashboard();decorateSongs();addMultiLive();bindLyricsPresets();bindAutosave();const grid=document.getElementById('songGrid');if(grid&&!grid.__uxObs){grid.__uxObs=new MutationObserver(()=>decorateSongs());grid.__uxObs.observe(grid,{childList:true,subtree:true})}renderLibraryPanels()}
  document.addEventListener('click',e=>{const open=e.target.closest?.('.open-song');if(open){const card=open.closest('.song-card');if(card)markRecent(findSong(card.dataset.songId))}});
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
    if(e.key==='?'){e.preventDefault();shortcutHelp();return}
    const multi=document.getElementById('multiScreenControl');
    if(multi?.classList.contains('show')){
      if(e.key.toLowerCase()==='l'){e.preventDefault();setLive(!liveState());return}
      if(e.key.toLowerCase()==='b'){e.preventDefault();if(typeof window.multiScreenBlackAll==='function')window.multiScreenBlackAll();return}
      if(['1','2','3','4'].includes(e.key)){const n=Number(e.key);document.querySelector(`[data-open-screen="${n}"]`)?.focus();return}
      if(liveState()&&e.key==='ArrowLeft'){e.preventDefault();document.getElementById('serviceSongPrevious')?.click();return}
      if(liveState()&&(e.key==='ArrowRight'||e.key===' ')){e.preventDefault();document.getElementById('serviceSongNext')?.click();return}
      if(liveState()&&e.key==='ArrowUp'){e.preventDefault();document.querySelector('#multiSectionButtons button.active')?.previousElementSibling?.click();return}
      if(liveState()&&e.key==='ArrowDown'){e.preventDefault();document.querySelector('#multiSectionButtons button.active')?.nextElementSibling?.click();return}
    }
  });
  window.addEventListener('load',()=>setTimeout(observe,350));setInterval(()=>{addMultiLive();bindLyricsPresets();bindAutosave();decorateSongs();renderLibraryPanels();const fc=document.getElementById('chordioFavCount'),rc=document.getElementById('chordioRecentCount');if(fc)fc.textContent=favIds().length;if(rc)rc.textContent=recentIds().length},1200);
})();
