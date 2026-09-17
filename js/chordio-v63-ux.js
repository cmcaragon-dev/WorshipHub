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
        <div><span>QUICK ACTIONS</span></div>
      </div>
      <div class="chordio-quick-grid">
        <button type="button" data-quick="service" class="primary"><span class="quick-icon"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i></span><span>New Service</span></button>
        <button type="button" data-quick="songs"><span class="quick-icon"><i class="fa-solid fa-music" aria-hidden="true"></i></span><span>Songs</span></button>
        <button type="button" data-quick="multi"><span class="quick-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><span>Multi-Screen</span></button>
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
      <div class="chordio-sidebar-welcome-icon modern-wave-hand" aria-hidden="true">👋</div>
      <div class="chordio-sidebar-welcome-text"><div class="chordio-sidebar-welcome-label">HELLO, WELCOME</div><div id="userName" class="chordio-sidebar-welcome-name">User</div></div>
    </div>
    <div class="chordio-sidebar-actions">
      
      <button type="button" class="chordio-sidebar-action primary" data-sidebar-quick="service"><span class="quick-icon"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i></span><span>New Service</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="planner"><span class="quick-icon"><i class="fa-solid fa-list-check" aria-hidden="true"></i></span><span>Service Planner</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="multi"><span class="quick-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><span>Multi-Screen</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="songs"><span class="quick-icon"><i class="fa-solid fa-music" aria-hidden="true"></i></span><span>Songs</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="addsong"><span class="quick-icon"><i class="fa-solid fa-plus" aria-hidden="true"></i></span><span>Add Song</span></button>
      <div class="chordio-sidebar-divider"></div>
      <button type="button" id="settingsBtn" class="chordio-sidebar-action settings-action"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Settings</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="help"><span class="quick-icon"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></span><span>Help & Shortcuts</span></button>
      <button type="button" class="chordio-sidebar-action" data-sidebar-quick="import"><span class="quick-icon"><i class="fa-solid fa-link" aria-hidden="true"></i></span><span>Import Song</span></button>
      <div class="chordio-bible-day" aria-label="Bible Verse of the Day">
        <div class="chordio-bible-day-head"><i class="fa-solid fa-book-bible" aria-hidden="true"></i><span>BIBLE VERSE OF THE DAY</span></div>
        <div id="sidebarBibleVerseText" class="chordio-bible-day-text">“Trust in the LORD with all your heart.”</div>
        <div id="sidebarBibleVerseRef" class="chordio-bible-day-ref">Proverbs 3:5</div>
      </div>
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
      if(t==='help'){document.dispatchEvent(new KeyboardEvent('keydown',{key:'?',bubbles:true}));return;}
      if(t==='import') return document.getElementById('importSongBtn')?.click();
    });
    // Keep application hooks available without showing duplicate controls.
    const support=document.createElement('div'); support.className='chordio-hidden-support';
    support.innerHTML='<button id="servicePlannerBtn" type="button"></button><button id="addSongBtn" type="button"></button><button id="importSongBtn" type="button"></button>';
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
    const keys=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const flatMap={Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#'};
    const base=String(song?.originalKey||song?.key||'C').trim();
    const root=(base.match(/^[A-G](?:#|b)?/)||['C'])[0];
    const normalizedRoot=flatMap[root]||root;
    const minor=/m(?:in)?$/i.test(base) || /\bminor\b/i.test(base);
    const suffix=minor?'m':'';
    const selected=normalizedRoot+suffix;
    return keys.map(k=>({v:k+suffix,sel:k+suffix===selected}));
  }
  function openNewService(editService=null){
    let m=$('#chordioNewServiceModal');
    if(!m){
      m=document.createElement('div');m.id='chordioNewServiceModal';m.className='chordio-modal';
      m.innerHTML=`<div class="chordio-dialog chordio-service-creator"><div class="chordio-dialog-head"><div><span id="v63ServiceKicker">NEW SERVICE</span><h3 id="v63ServiceHeading">Create Service Planner</h3></div><button type="button" data-close>✕</button></div><div class="chordio-form-grid"><label>Service Title<input id="v63ServiceTitle" type="text" placeholder="e.g. Sunday Worship Service"></label><label>Service Date<input id="v63ServiceDate" type="date"></label></div><div class="v63-selected-head"><strong>SONGS</strong><span>Choose songs and set the preferred service key.</span></div><input id="v63SongSearch" class="v63-song-search" type="search" placeholder="Search title, artist, category or language..."><div id="v63SongList" class="v63-song-list"></div><div class="v63-create-footer"><span id="v63SongCount">0 songs selected</span><button data-close class="secondary">CANCEL</button><button id="v63SaveService" class="primary">✓ SAVE SERVICE</button></div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')});
      $$('[data-close]',m).forEach(b=>b.onclick=()=>m.classList.remove('show'));
      $('#v63SongSearch',m).addEventListener('input',()=>renderSongChoices(m, m._editService||null));
      $('#v63SaveService',m).onclick=saveNewService;
    }
    m._editService=editService||null;
    $('#v63ServiceKicker').textContent=editService?'EDIT SERVICE':'NEW SERVICE';
    $('#v63ServiceHeading').textContent=editService?'Edit Service Planner':'Create Service Planner';
    $('#v63SaveService').textContent=editService?'✓ SAVE CHANGES':'✓ SAVE SERVICE';
    $('#v63ServiceTitle').value=String(editService?.name||'');
    $('#v63ServiceDate').value=String(editService?.date||new Date().toISOString().slice(0,10));
    $('#v63SongSearch').value='';
    renderSongChoices(m, editService||null);
    m.classList.add('show');
    setTimeout(()=>$('#v63ServiceTitle')?.focus(),80);
  }
  function renderSongChoices(m, editService=null){
    const box=$('#v63SongList',m), q=String($('#v63SongSearch',m)?.value||'').toLowerCase();
    const source=Array.isArray(window.songs)?window.songs:[];
    const selected=Array.isArray(editService?.songs)?editService.songs:[];
    // Union the master library with songs already stored in this service so editing never hides a stored song.
    const byKey=new Map();
    [...source,...selected].forEach(s=>{if(!s)return;const key=String(s.id||s.file||s.title||'');if(key&&!byKey.has(key))byKey.set(key,s);});
    const list=[...byKey.values()].filter(s=>{const t=[s.title,s.artist,s.category,s.language].join(' ').toLowerCase();return !q||t.includes(q)}).filter(s=>s?.sections?.length||selected.some(x=>String(x.id||x.file||x.title)===String(s.id||s.file||s.title))).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    box.innerHTML=list.map(s=>{
      const id=esc(s.id||s.file||s.title);const keys=keysFor(s);const occurrences=selected.filter(x=>String(x.id||x.file||x.title)===String(s.id||s.file||s.title));
      const chosen=occurrences.length>0;const selectedKey=occurrences[0]?.serviceKey||occurrences[0]?.key||s.originalKey||s.key||'C';
      return `<div class="v63-song-choice" data-song-id="${id}"><label class="v63-song-check"><input type="checkbox" ${chosen?'checked':''}><span><strong>${esc(s.title||'Untitled')}</strong><small>${esc(s.artist||'')}${occurrences.length>1?` · ${occurrences.length} in service`:''}</small></span></label><select class="v63-song-key">${keys.map(k=>`<option value="${esc(k.v)}" ${String(k.v)===String(selectedKey)?'selected':''}>${esc(k.v)}</option>`).join('')}</select></div>`;
    }).join('')||'<div class="chordio-empty">No songs found.</div>';
    const updateCount=()=>{const n=$$('.v63-song-choice input:checked',box).length;$('#v63SongCount').textContent=`${n} song${n===1?'':'s'} selected`;};
    $$('.v63-song-choice input',box).forEach(i=>i.onchange=updateCount); updateCount();
  }
  async function saveNewService(){
    const m=$('#chordioNewServiceModal'), editService=m?m._editService:null;
    const title=String($('#v63ServiceTitle')?.value||'').trim(), date=$('#v63ServiceDate')?.value||'';
    if(!title)return toast('Enter a service title','error');
    const rows=$$('.v63-song-choice input:checked'); if(!rows.length)return toast('Add at least one song','error');
    const source=Array.isArray(window.songs)?window.songs:[];
    const selectedExisting=Array.isArray(editService?.songs)?editService.songs:[];
    const songsOut=rows.map(ch=>{const row=ch.closest('.v63-song-choice'), id=row.dataset.songId, s=source.find(x=>String(x.id||x.file||x.title)===id)||selectedExisting.find(x=>String(x.id||x.file||x.title)===id), originalKey=s?.originalKey||s?.key||'C', key=$('.v63-song-key',row)?.value||s?.serviceKey||originalKey;return {...JSON.parse(JSON.stringify(s||{})),id:s?.id||String(Date.now()+Math.random()),title:s?.title||'',artist:s?.artist||'',file:s?.file||'',category:s?.category||'',language:s?.language||'',key:s?.key||originalKey,originalKey,serviceKey:key,transpose:Number(s?.transpose||0),youtube:s?.youtube||'',customSong:s?.customSong===true,sections:Array.isArray(s?.sections)?JSON.parse(JSON.stringify(s.sections)):null,createdAt:s?.createdAt||null,updatedAt:new Date().toISOString()};});
    let ok=false;
    if(editService && typeof window.chordioUpdateService==='function') ok=await window.chordioUpdateService(editService.id,{name:title,date,songs:songsOut});
    else if(typeof window.chordioCreateService==='function') ok=await window.chordioCreateService({name:title,date,songs:songsOut});
    if(ok){m.classList.remove('show');toast(editService?'Service updated successfully':'Service saved successfully');}
  }
  function openEditService(service){if(service)openNewService(service);}

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
  window.chordioV63={openNewService,openEditService,openMultiPicker};
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


(function initSidebarBibleVerse(){
  const verses=[
    ['“Trust in the LORD with all your heart.”','Proverbs 3:5'],
    ['“The LORD is my shepherd; I shall not want.”','Psalm 23:1'],
    ['“I can do all things through Christ which strengtheneth me.”','Philippians 4:13'],
    ['“Be strong and of a good courage; be not afraid.”','Joshua 1:9'],
    ['“The LORD is good; his mercy is everlasting.”','Psalm 100:5'],
    ['“Commit thy works unto the LORD.”','Proverbs 16:3'],
    ['“Let all that ye do be done with charity.”','1 Corinthians 16:14']
  ];
  function render(){const now=new Date();const day=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000);const v=verses[((day%verses.length)+verses.length)%verses.length];const t=document.getElementById('sidebarBibleVerseText'),r=document.getElementById('sidebarBibleVerseRef');if(t)t.textContent=v[0];if(r)r.textContent=v[1];}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
