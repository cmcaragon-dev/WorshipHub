/* CHORDIO V63 — cleaner dashboard, New Service creator, visual screen tiles, editor drag */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast=(msg,type='success')=>{let st=$('#chordioToastStack');if(!st){st=document.createElement('div');st.id='chordioToastStack';document.body.appendChild(st)}const el=document.createElement('div');el.className='chordio-toast '+type;el.textContent=msg;st.appendChild(el);setTimeout(()=>el.remove(),3200)};

  function buildDashboard(){
    const content=document.querySelector('.content');
    const stats=content?.querySelector('.dashboard');
    if(!content)return;
    // Remove any dashboard created by an earlier V62/V63 pass so only one Quick Actions panel can exist.
    document.querySelectorAll('.chordio-v62-dashboard,.chordio-v63-dashboard,#chordioModernLibrary').forEach(el=>el.remove());
    const box=document.createElement('section');
    box.className='chordio-v63-dashboard';
    box.id='chordioQuickActions';
    box.innerHTML=`<div class="chordio-quick">
      <div class="chordio-quick-head">
        <div><span>QUICK ACTIONS</span><h2>WorshipHub Controls</h2></div>
      </div>
      <div class="chordio-quick-grid">
        <button type="button" data-quick="service" class="primary"><span class="quick-icon"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i></span><span>New Service</span></button>
        <button type="button" data-quick="planner"><span class="quick-icon"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span><span>Service Planner</span></button>
        <button type="button" data-quick="multi"><span class="quick-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><span>Multi-Screen</span></button>
        <button type="button" data-quick="songs"><span class="quick-icon"><i class="fa-solid fa-music" aria-hidden="true"></i></span><span>Songs</span></button>
        <button type="button" data-quick="addsong"><span class="quick-icon"><i class="fa-solid fa-plus" aria-hidden="true"></i></span><span>Add Song</span></button>
      </div>
    </div>`;
    // Quick Actions belongs below the four dashboard statistics, not inside the stats grid.
    if(stats?.parentElement===content) stats.insertAdjacentElement('afterend',box);
    else content.insertBefore(box,content.firstChild||null);
    box.addEventListener('click',e=>{
      const b=e.target.closest('[data-quick]'); if(!b)return;
      const t=b.dataset.quick;
      if(t==='service') return openNewService();
      if(t==='planner') return document.getElementById('servicePlannerBtn')?.click();
      if(t==='songs') return window.showAllSongs?.();
      if(t==='addsong') return document.getElementById('addSongBtn')?.click();
      if(t==='multi') return openMultiPicker();
    });
  }

  function buildSidebarQuickActions(){
    const side=document.querySelector('.sidebar');
    if(!side || side.dataset.chordioV65Sidebar==='1') return;
    side.dataset.chordioV65Sidebar='1';
    side.innerHTML=`<div class="chordio-sidebar-welcome">
      <div class="chordio-sidebar-welcome-icon"><i class="fa-solid fa-hand-wave" aria-hidden="true"></i></div>
      <div class="chordio-sidebar-welcome-text"><div class="chordio-sidebar-welcome-label">HELLO, WELCOME</div><div id="userName" class="chordio-sidebar-welcome-name">User</div></div>
    </div>
    <div class="chordio-sidebar-actions">
      <div class="chordio-sidebar-kicker">QUICK ACTIONS</div>
      <button type="button" class="chordio-sidebar-action primary" data-sidebar-quick="service"><span class="quick-icon"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i></span><span>New Service</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="planner"><span class="quick-icon"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span><span>Service Planner</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="multi"><span class="quick-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><span>Multi-Screen</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="songs"><span class="quick-icon"><i class="fa-solid fa-music" aria-hidden="true"></i></span><span>Songs</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="addsong"><span class="quick-icon"><i class="fa-solid fa-plus" aria-hidden="true"></i></span><span>Add Song</span></button>
      <div class="chordio-sidebar-divider"></div>
      <button type="button" id="settingsBtn" class="chordio-sidebar-action settings-action"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Settings</span></button>
    </div>`;
    side.addEventListener('click',e=>{
      const b=e.target.closest('[data-sidebar-quick],#settingsBtn'); if(!b)return;
      if(b.id==='settingsBtn') return window.location.assign('settings.html');
      const t=b.dataset.sidebarQuick;
      if(t==='service') return openNewService();
      if(t==='planner') return document.getElementById('servicePlannerBtn')?.click();
      if(t==='multi') return openMultiPicker();
      if(t==='songs') return window.showAllSongs?.();
      if(t==='addsong') return document.getElementById('addSongBtn')?.click();
    });
    // Keep application hooks available without showing duplicate controls.
    const support=document.createElement('div'); support.className='chordio-hidden-support';
    support.innerHTML='<button id="servicePlannerBtn" type="button"></button><button id="addSongBtn" type="button"></button><button id="playlistBtn" type="button"></button><button id="importSongBtn" type="button"></button>';
    side.appendChild(support);
    support.querySelector('#servicePlannerBtn').onclick=()=>document.querySelector('#servicePanel')?.classList.add('show');
    support.querySelector('#addSongBtn').onclick=()=>document.querySelector('#songEditorPanel,#songEditor')?.classList.add('show');
  }

  function openMultiPicker(){
    let m=$('#chordioServicePicker'); if(!m){m=document.createElement('div');m.id='chordioServicePicker';m.className='chordio-modal';m.innerHTML=`<div class="chordio-dialog"><div class="chordio-dialog-head"><div><span>CHOOSE SERVICE</span><h3>Open Multi-Screen</h3></div><button type="button" data-close>✕</button></div><p class="chordio-dialog-help">Choose the Service Planner you want to control.</p><div id="chordioServicePickerList"></div></div>`;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')});m.querySelector('[data-close]').onclick=()=>m.classList.remove('show')}
    const list=Array.isArray(window.services)?window.services:[], box=$('#chordioServicePickerList');
    box.innerHTML=list.length?list.map(s=>`<button class="chordio-service-choice" data-service-choice="${esc(s.id)}"><span><strong>${esc(s.name||'Unnamed Service')}</strong><small>${esc(s.date||'')} · ${Array.isArray(s.songs)?s.songs.length:0} songs</small></span><b>OPEN →</b></button>`).join(''):'<div class="chordio-empty">No Service Planner created yet.</div>';
    $$('.chordio-service-choice',box).forEach(b=>b.onclick=()=>{const s=list.find(x=>String(x.id)===String(b.dataset.serviceChoice));if(!s)return;m.classList.remove('show');window.startMultiScreenService?.(s.id)});m.classList.add('show');
  }

  function keysFor(song){
    const keys=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; const base=String(song?.key||song?.originalKey||'C'); const root=(base.match(/^[A-G](?:#|b)?/)||['C'])[0]; const minor=/m/i.test(base); let idx=keys.indexOf(root.replace('b','#'));if(idx<0)idx=0; return keys.map((k,i)=>k+(minor?'m':'')).map((k,i)=>({v:k,sel:k===base}));
  }
  function openNewService(){
    let m=$('#chordioNewServiceModal'); if(!m){m=document.createElement('div');m.id='chordioNewServiceModal';m.className='chordio-modal';m.innerHTML=`<div class="chordio-dialog chordio-service-creator"><div class="chordio-dialog-head"><div><span>NEW SERVICE</span><h3>Create Service Planner</h3></div><button type="button" data-close>✕</button></div><div class="chordio-form-grid"><label>Service Title<input id="v63ServiceTitle" type="text" placeholder="e.g. Sunday Worship Service"></label><label>Service Date<input id="v63ServiceDate" type="date"></label></div><div class="v63-selected-head"><strong>ADD SONGS</strong><span>Choose songs and set the preferred service key.</span></div><input id="v63SongSearch" class="v63-song-search" type="search" placeholder="Search title, artist, category or language..."><div id="v63SongList" class="v63-song-list"></div><div class="v63-create-footer"><span id="v63SongCount">0 songs selected</span><button data-close class="secondary">CANCEL</button><button id="v63SaveService" class="primary">✓ SAVE SERVICE</button></div></div>`;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')});$$('[data-close]',m).forEach(b=>b.onclick=()=>m.classList.remove('show'));$('#v63SongSearch',m).addEventListener('input',()=>renderSongChoices(m));$('#v63SaveService',m).onclick=saveNewService;}
    $('#v63ServiceTitle').value=''; $('#v63ServiceDate').value=new Date().toISOString().slice(0,10); renderSongChoices(m); m.classList.add('show'); setTimeout(()=>$('#v63ServiceTitle')?.focus(),80);
  }
  function renderSongChoices(m){const box=$('#v63SongList',m), q=String($('#v63SongSearch',m)?.value||'').toLowerCase();const list=(Array.isArray(window.songs)?window.songs:[]).filter(s=>{const t=[s.title,s.artist,s.category,s.language].join(' ').toLowerCase();return !q||t.includes(q)}).filter(s=>s?.sections?.length).slice().sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    box.innerHTML=list.map(s=>{const id=esc(s.id||s.file||s.title);const keys=keysFor(s);return `<div class="v63-song-choice" data-song-id="${id}"><label class="v63-song-check"><input type="checkbox"><span><strong>${esc(s.title||'Untitled')}</strong><small>${esc(s.artist||'')}</small></span></label><select class="v63-song-key">${keys.map(k=>`<option value="${esc(k.v)}" ${k.sel?'selected':''}>${esc(k.v)}</option>`).join('')}</select></div>`}).join('')||'<div class="chordio-empty">No structured songs found.</div>';
    $$('.v63-song-choice input',box).forEach(i=>i.onchange=()=>{$('#v63SongCount').textContent=`${$$('.v63-song-choice input:checked',box).length} song${$$('.v63-song-choice input:checked',box).length===1?'':'s'} selected`});
  }
  async function saveNewService(){
    const title=String($('#v63ServiceTitle')?.value||'').trim(), date=$('#v63ServiceDate')?.value||''; if(!title)return toast('Enter a service title','error');
    const rows=$$('.v63-song-choice input:checked'); if(!rows.length)return toast('Add at least one song','error');
    const source=Array.isArray(window.songs)?window.songs:[]; const songsOut=rows.map(ch=>{const row=ch.closest('.v63-song-choice'), id=row.dataset.songId, s=source.find(x=>String(x.id||x.file||x.title)===id), key=$('.v63-song-key',row)?.value||s?.key||'';return {id:s.id||String(Date.now()+Math.random()),title:s.title||'',artist:s.artist||'',file:s.file||'',category:s.category||'',language:s.language||'',key:s.key||key,originalKey:s.originalKey||s.key||key,serviceKey:key,transpose:0,youtube:s.youtube||'',customSong:s.customSong===true,sections:Array.isArray(s.sections)?JSON.parse(JSON.stringify(s.sections)):null,createdAt:s.createdAt||null,updatedAt:s.updatedAt||null};});
    if(typeof window.chordioCreateService!=='function')return toast('Service save function is unavailable','error');
    const ok=await window.chordioCreateService({name:title,date,songs:songsOut}); if(ok){$('#chordioNewServiceModal').classList.remove('show');toast('Service saved successfully');}
  }

  function improveScreenPreview(){
    const root=$('#multiScreenControl'); if(!root)return;
    // V65: do not create the four Screen 1–4 selector squares above Screen Output Preview.
    root.querySelectorAll('.v63-preview-tiles,.v63-screen-tile').forEach(el=>el.remove());
    const cards=$$('.multi-screen-card',root);
    cards.forEach((card,i)=>{
      const n=i+1;
      card.querySelector('.v63-screen-tile')?.remove();
      card.classList.toggle('v63-disabled',!$(`#multiEnabled${n}`,card)?.checked);
    });
  }
  function addEditorDrag(){const root=$('#songEditorSections');if(!root)return;$$('.editor-section',root).forEach((sec,i)=>{sec.draggable=true;sec.classList.add('v63-draggable-section');if(!sec.dataset.v63bound){sec.dataset.v63bound='1';sec.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',String(i));sec.classList.add('v63-dragging')});sec.addEventListener('dragend',()=>sec.classList.remove('v63-dragging'));sec.addEventListener('dragover',e=>e.preventDefault());sec.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));const to=Number(sec.dataset.sectionIndex);if(from===to||!window.WorshipHubSongEditor?.moveSection)return;window.WorshipHubSongEditor.moveSection(from,to)});}})}
  function init(){buildDashboard();buildSidebarQuickActions();improveScreenPreview();addEditorDrag();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.chordioV63={openNewService,openMultiPicker};
})();

/* V63 retained operator controls from V62 */
(function(){
'use strict';
const liveKey='chordioLiveMode';
function toast(msg,type='success'){let box=document.getElementById('chordioToastStack');if(!box){box=document.createElement('div');box.id='chordioToastStack';document.body.appendChild(box)}const el=document.createElement('div');el.className='chordio-toast '+type;el.textContent=msg;box.appendChild(el);setTimeout(()=>el.remove(),2800)}
function live(){return localStorage.getItem(liveKey)==='true'}
function setLive(on){localStorage.setItem(liveKey,on?'true':'false');document.body.classList.toggle('chordio-live-mode',on);document.querySelectorAll('.chordio-live-toggle').forEach(b=>{b.classList.toggle('live',on);b.classList.remove('prepare');b.textContent='● LIVE';});toast(on?'LIVE MODE ON — presentation controls simplified':'LIVE MODE OFF — controls available',on?'success':'info')}
function bindLive(){const head=document.querySelector('#multiScreenControl .multi-screen-head');if(!head||document.getElementById('chordioLiveToggle'))return;const status=document.createElement('span');status.id='chordioAutosave';status.className='chordio-autosave';status.textContent='✓ Auto-save ready';head.appendChild(status);const b=document.createElement('button');b.id='chordioLiveToggle';b.className='chordio-live-toggle';b.type='button';b.title='Toggle Live Mode';b.onclick=()=>setLive(!live());head.appendChild(b);setLive(live())}
function shortcuts(){let m=document.getElementById('chordioShortcutHelp');if(!m){m=document.createElement('div');m.id='chordioShortcutHelp';m.className='chordio-modal';m.innerHTML='<div class="chordio-dialog"><div class="chordio-dialog-head"><div><span>KEYBOARD SHORTCUTS</span><h3>CHORDIO Controls</h3></div><button data-close>✕</button></div><div class="chordio-shortcuts"><div><kbd>←</kbd><span>Previous song</span></div><div><kbd>→</kbd><span>Next song</span></div><div><kbd>Space</kbd><span>Next</span></div><div><kbd>↑ / ↓</kbd><span>Previous / next section</span></div><div><kbd>B</kbd><span>Blank all outputs</span></div><div><kbd>L</kbd><span>Toggle Live Mode</span></div><div><kbd>?</kbd><span>Show this help</span></div></div></div>';document.body.appendChild(m);m.querySelector('[data-close]').onclick=()=>m.classList.remove('show')}m.classList.add('show')}
function bind(){bindLive();const root=document.getElementById('multiScreenControl');if(root&&!root.dataset.v63auto){root.dataset.v63auto='1';root.addEventListener('input',()=>{const s=document.getElementById('chordioAutosave');if(s)s.textContent='• Changes ready to save'});root.addEventListener('click',e=>{if(e.target.closest('button')){const s=document.getElementById('chordioAutosave');if(s)s.textContent='✓ Saved'}})}document.addEventListener('keydown',e=>{if(e.target.matches?.('input,textarea,select'))return;if(e.key==='?'){e.preventDefault();shortcuts();return}if(!document.getElementById('multiScreenControl')?.classList.contains('show'))return;if(e.key.toLowerCase()==='l'){e.preventDefault();setLive(!live());return}if(e.key.toLowerCase()==='b'){e.preventDefault();window.multiScreenBlackAll?.();return}if(live()&&e.key==='ArrowLeft'){e.preventDefault();document.getElementById('serviceSongPrevious')?.click()}if(live()&&(e.key==='ArrowRight'||e.key===' ')){e.preventDefault();document.getElementById('serviceSongNext')?.click()}if(live()&&e.key==='ArrowUp'){e.preventDefault();document.querySelector('#multiSectionButtons button.active')?.previousElementSibling?.click()}if(live()&&e.key==='ArrowDown'){e.preventDefault();document.querySelector('#multiSectionButtons button.active')?.nextElementSibling?.click()}})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();setInterval(bindLive,1200);
})();
(function(){
function presets(){document.querySelectorAll('[data-lyrics-preset]').forEach(b=>{if(b.dataset.v63preset)return;b.dataset.v63preset='1';b.onclick=()=>{const v={standard:[72,1.15,50],large:[90,1.1,50],projector:[100,1.05,50],reset:[100,1.15,50]}[b.dataset.lyricsPreset];if(!v)return;[['multiLyricsFontPx',v[0]],['multiLyricsSpacing',v[1]],['multiLyricsVertical',v[2]]].forEach(([id,x])=>{const el=document.getElementById(id);if(el)el.value=x});document.getElementById('multiLyricsSettingsApply')?.click()}})};setInterval(presets,1200);presets();
})();
