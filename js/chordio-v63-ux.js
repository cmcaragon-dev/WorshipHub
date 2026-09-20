/* CHORDIO V63 — cleaner dashboard, New Service creator, visual screen tiles, editor drag */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast=(msg,type='success')=>{let st=$('#chordioToastStack');if(!st){st=document.createElement('div');st.id='chordioToastStack';document.body.appendChild(st)}const el=document.createElement('div');el.className='chordio-toast '+type;el.textContent=msg;st.appendChild(el);setTimeout(()=>el.remove(),3200)};

  function buildSidebarQuickActions(){
    const side=document.querySelector('.sidebar');
    if(!side || side.dataset.chordioV65Sidebar==='1') return;
    side.dataset.chordioV65Sidebar='1';
    side.innerHTML=`<button type="button" class="chordio-mobile-sidebar-toggle" aria-label="Open menu" aria-expanded="false">☰</button><div class="chordio-sidebar-welcome">
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
      if(b.disabled || b.getAttribute('aria-disabled')==='true') return;
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
    const mobileToggle=side.querySelector('.chordio-mobile-sidebar-toggle');
    mobileToggle?.addEventListener('click',()=>{
      const open=document.body.classList.toggle('chordio-sidebar-open');
      mobileToggle.setAttribute('aria-expanded',String(open));
    });
    side.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      if(window.matchMedia('(max-width: 700px)').matches && b!==mobileToggle && !b.disabled){
        document.body.classList.remove('chordio-sidebar-open');
        mobileToggle?.setAttribute('aria-expanded','false');
      }
    }));
    window.addEventListener('worshiphub:permissions-updated',ev=>{
      const admin=!!ev.detail?.isAdmin;
      side.querySelectorAll('[data-sidebar-quick="addsong"],[data-sidebar-quick="import"],#settingsBtn').forEach(b=>{
        b.disabled=!admin;
        b.setAttribute('aria-disabled',String(!admin));
        b.classList.toggle('permission-disabled',!admin);
      });
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
  function cloneServiceSongs(songs){
    return Array.isArray(songs) ? JSON.parse(JSON.stringify(songs)) : [];
  }

  function serviceIdentity(song){
    return String(song?.id || song?.file || song?.title || "").trim().toLowerCase();
  }

  function serviceSongCountLocal(songs, song){
    const key=serviceIdentity(song);
    return (Array.isArray(songs)?songs:[]).filter(x=>serviceIdentity(x)===key).length;
  }

  function makeServiceOccurrence(song, existing){
    const s=JSON.parse(JSON.stringify(song||{}));
    const originalKey=s.originalKey||s.key||'C';
    const serviceKey=existing?.serviceKey||existing?.key||originalKey;
    return {
      ...s,
      id: existing?.id || s.id || String(Date.now()+Math.random()),
      title:s.title||'',
      artist:s.artist||'',
      file:s.file||'',
      category:s.category||'',
      language:s.language||'',
      key:s.key||originalKey,
      originalKey,
      serviceKey,
      transpose:Number(existing?.transpose ?? s.transpose ?? 0),
      youtube:s.youtube||'',
      customSong:s.customSong===true,
      sections:Array.isArray(s.sections)?JSON.parse(JSON.stringify(s.sections)):null,
      createdAt:existing?.createdAt||s.createdAt||null,
      presentationNote:existing?.presentationNote ?? s.presentationNote ?? '',
      updatedAt:new Date().toISOString()
    };
  }

  function ensureServiceEditorStyles(){
    if($('#chordio-service-editor-modern-style')) return;
    const st=document.createElement('style'); st.id='chordio-service-editor-modern-style';
    st.textContent=`
      #chordioNewServiceModal .chordio-service-creator{width:min(820px,96vw)!important;max-height:92vh!important;overflow:hidden!important;display:flex!important;flex-direction:column!important}
      #chordioNewServiceModal .v64-service-body{overflow:auto;min-height:0}
      #chordioNewServiceModal .v64-section{padding:16px 22px 0}
      #chordioNewServiceModal .v64-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
      #chordioNewServiceModal .v64-section-title strong{font-size:11px;letter-spacing:.12em;color:#263644}
      #chordioNewServiceModal .v64-section-title span{font-size:11px;color:#7b8791}
      #chordioNewServiceModal .v64-selected-songs{display:flex;flex-direction:column;gap:8px}
      #chordioNewServiceModal .v64-selected-song{display:grid;grid-template-columns:34px minmax(0,1fr) 112px 38px;align-items:center;gap:12px;padding:12px 13px;border:1px solid #e1e7ec;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fafb);box-shadow:0 2px 7px rgba(15,31,46,.04)}
      #chordioNewServiceModal .v64-selected-song-num{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#edf1f4;color:#52616d;font-size:11px;font-weight:900}
      #chordioNewServiceModal .v64-selected-song-info{min-width:0;display:flex;flex-direction:column;gap:3px}
      #chordioNewServiceModal .v64-selected-song-info strong{font-size:14px;color:#172635;line-height:1.3;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
      #chordioNewServiceModal .v64-selected-song-info small{font-size:11px;color:#7b8791;line-height:1.25;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
      #chordioNewServiceModal .v64-song-key{width:100%;padding:9px 10px;border:1px solid #d4dde4;border-radius:9px;background:#fff;color:#172635;font-weight:700}
      #chordioNewServiceModal .v64-service-note{width:100%;padding:7px 9px;border:1px solid #d4dde4;border-radius:8px;background:#fff;color:#172635;font-size:11px;outline:none}
      #chordioNewServiceModal .v64-service-note::placeholder{color:#98a3ad}
      #chordioNewServiceModal .v64-service-note:focus{border-color:#c9a62e;box-shadow:0 0 0 2px rgba(201,166,46,.12)}
      #chordioNewServiceModal .v64-remove-song{width:34px;height:34px;border:1px solid #e1cfd0;border-radius:9px;background:#fff;color:#a34747;cursor:pointer;font-size:14px}
      #chordioNewServiceModal .v64-remove-song:hover{background:#fff3f3;border-color:#c98b8b}
      #chordioNewServiceModal .v64-add-song-wrap{padding:12px 0 17px}
      #chordioNewServiceModal .v64-add-song-main{width:100%;min-height:44px;border:1px dashed #c5a33c;border-radius:11px;background:#fffaf0;color:#8c6900;font-weight:900;cursor:pointer;letter-spacing:.01em}
      #chordioNewServiceModal .v64-add-song-main:hover{background:#fff5d8;border-color:#b58a00;transform:translateY(-1px)}
      #chordioNewServiceModal .v64-empty{padding:20px;border:1px dashed #d9e0e5;border-radius:11px;text-align:center;color:#7b8791;background:#fafcfd}
      #chordioNewServiceModal .v64-picker{position:absolute;inset:0;z-index:3;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(7,15,24,.45);backdrop-filter:blur(2px)}
      #chordioNewServiceModal .v64-picker.show{display:flex}
      #chordioNewServiceModal .v64-picker-card{width:min(650px,94vw);max-height:78vh;display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:15px;box-shadow:0 24px 70px rgba(0,0,0,.25)}
      #chordioNewServiceModal .v64-picker-head{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid #e5eaee}
      #chordioNewServiceModal .v64-picker-head strong{font-size:14px;color:#172635}
      #chordioNewServiceModal .v64-picker-head small{display:block;margin-top:3px;color:#7b8791;font-size:10px}
      #chordioNewServiceModal .v64-picker-close{width:32px;height:32px;border:0;border-radius:8px;background:#eef1f4;cursor:pointer}
      #chordioNewServiceModal .v64-picker-search{margin:12px 15px 8px;padding:10px 12px;border:1px solid #d7dfe6;border-radius:9px;outline:none;font-size:13px}
      #chordioNewServiceModal .v64-picker-list{overflow:auto;padding:0 15px 14px}
      #chordioNewServiceModal .v64-picker-row{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:12px;align-items:center;padding:10px 2px;border-bottom:1px solid #edf0f3}
      #chordioNewServiceModal .v64-picker-info{min-width:0;display:flex;flex-direction:column;gap:3px}
      #chordioNewServiceModal .v64-picker-info strong{font-size:13px;color:#172635;white-space:normal;overflow-wrap:anywhere;word-break:break-word}
      #chordioNewServiceModal .v64-picker-info small{font-size:10px;color:#7b8791;white-space:normal;overflow-wrap:anywhere}
      #chordioNewServiceModal .v64-picker-add{min-height:35px;border:1px solid #c9a62e;border-radius:8px;background:#fffaf0;color:#876600;font-weight:900;cursor:pointer}
      #chordioNewServiceModal .v64-picker-add:hover{background:#fff1bf}
      #chordioNewServiceModal .v64-picker-add:disabled{border-color:#dfe4e8;background:#f2f4f5;color:#9aa4ac;cursor:not-allowed}
      #chordioNewServiceModal .v64-create-footer{flex:none!important}
      @media(max-width:650px){#chordioNewServiceModal .v64-selected-song{grid-template-columns:30px minmax(0,1fr) 92px 34px;gap:8px;padding:10px}.v64-selected-song-num{width:26px!important;height:26px!important}.v64-song-key{font-size:12px!important}.v64-picker-row{grid-template-columns:1fr 80px}}
    `;
    document.head.appendChild(st);
  }

  function openNewService(editService=null){
    ensureServiceEditorStyles();
    let m=$('#chordioNewServiceModal');
    if(!m){
      m=document.createElement('div');m.id='chordioNewServiceModal';m.className='chordio-modal';
      m.innerHTML=`<div class="chordio-dialog chordio-service-creator">
        <div class="chordio-dialog-head"><div><span id="v63ServiceKicker">NEW SERVICE</span><h3 id="v63ServiceHeading">Create Service Planner</h3></div><button type="button" data-close>✕</button></div>
        <div class="v64-service-body">
          <div class="chordio-form-grid"><label>Service Title<input id="v63ServiceTitle" type="text" placeholder="e.g. Sunday Worship Service"></label><label>Service Date<input id="v63ServiceDate" type="date"></label></div>
          <div class="v64-section"><div class="v64-section-title"><strong>SONGS</strong><span id="v64SongCountLabel">0 songs</span></div>
            <div id="v63SelectedSongs" class="v63-selected-songs v64-selected-songs"></div>
            <div class="v64-add-song-wrap"><button id="v64AddSongButton" type="button" class="v64-add-song-main">＋ ADD SONG</button></div>
          </div>
        </div>
        <div class="v63-create-footer"><span id="v63SongCount">0 songs selected</span><button data-close class="secondary">CANCEL</button><button id="v63SaveService" class="primary">✓ SAVE SERVICE</button></div>
        <div id="v64SongPicker" class="v64-picker"><div class="v64-picker-card">
          <div class="v64-picker-head"><div><strong>ADD SONG TO SERVICE</strong><small>Select a song to add. The same song may be added up to 3 times.</small></div><button type="button" class="v64-picker-close">✕</button></div>
          <input id="v64PickerSearch" class="v64-picker-search" type="search" placeholder="Search song title, artist, category or language...">
          <div id="v64PickerList" class="v64-picker-list"></div>
        </div></div>
      </div>`;
      document.body.appendChild(m);
      m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')});
      $$('[data-close]',m).forEach(b=>b.onclick=()=>m.classList.remove('show'));
      $('#v64AddSongButton',m).onclick=()=>{$('#v64SongPicker',m).classList.add('show');renderSongPicker(m);setTimeout(()=>$('#v64PickerSearch',m)?.focus(),50)};
      $('.v64-picker-close',m).onclick=()=>$('#v64SongPicker',m).classList.remove('show');
      $('#v64PickerSearch',m).addEventListener('input',()=>renderSongPicker(m));
      $('#v63SaveService',m).onclick=saveNewService;
    }
    m._editService=editService||null;
    m._draftSongs=cloneServiceSongs(editService?.songs);
    $('#v63ServiceKicker').textContent=editService?'EDIT SERVICE':'NEW SERVICE';
    $('#v63ServiceHeading').textContent=editService?'Edit Service Planner':'Create Service Planner';
    $('#v63SaveService').textContent=editService?'✓ SAVE CHANGES':'✓ SAVE SERVICE';
    $('#v63ServiceTitle').value=String(editService?.name||'');
    $('#v63ServiceDate').value=String(editService?.date||new Date().toISOString().slice(0,10));
    $('#v64SongPicker').classList.remove('show');
    renderSelectedSongs(m);
    m.classList.add('show');
    setTimeout(()=>$('#v63ServiceTitle')?.focus(),80);
  }

  function renderSelectedSongs(m){
    const selected=Array.isArray(m._draftSongs)?m._draftSongs:[];
    const box=$('#v63SelectedSongs',m);
    box.innerHTML=selected.length ? selected.map((s,i)=>{
      const keys=keysFor(s), current=s.serviceKey||s.key||s.originalKey||'C';
      return `<div class="v64-selected-song" data-occurrence-index="${i}">
        <span class="v64-selected-song-num">${i+1}</span>
        <div class="v64-selected-song-info"><strong>${esc(s.title||'Untitled')}</strong><small>${esc(s.artist||'')}</small><input class="v64-service-note" data-occurrence-note="${i}" type="text" maxlength="160" value="${esc(s.presentationNote||'')}" placeholder="Service note (optional)"></div>
        <select class="v64-song-key" data-occurrence-key="${i}" title="Service Key">${keys.map(k=>`<option value="${esc(k.v)}" ${String(k.v)===String(current)?'selected':''}>${esc(k.v)}</option>`).join('')}</select>
        <button type="button" class="v64-remove-song" data-remove-occurrence="${i}" title="Remove this copy">✕</button>
      </div>`;
    }).join('') : '<div class="v64-empty">No songs added yet.<br>Click <b>＋ ADD SONG</b> below to choose songs.</div>';
    box.querySelectorAll('[data-occurrence-key]').forEach(sel=>sel.onchange=()=>{const i=Number(sel.dataset.occurrenceKey);if(m._draftSongs?.[i]){m._draftSongs[i].serviceKey=sel.value;m._draftSongs[i].key=sel.value;}});
    box.querySelectorAll('[data-occurrence-note]').forEach(input=>input.addEventListener('input',()=>{const i=Number(input.dataset.occurrenceNote);if(m._draftSongs?.[i])m._draftSongs[i].presentationNote=String(input.value||'').trim();}));
    box.querySelectorAll('[data-remove-occurrence]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.removeOccurrence);m._draftSongs.splice(i,1);renderSelectedSongs(m);renderSongPicker(m)});
    const n=selected.length;
    $('#v63SongCount').textContent=`${n} song${n===1?'':'s'} selected`;
    $('#v64SongCountLabel').textContent=`${n} song${n===1?'':'s'}`;
  }

  function renderSongPicker(m){
    const box=$('#v64PickerList',m); if(!box)return;
    const q=String($('#v64PickerSearch',m)?.value||'').toLowerCase();
    const source=Array.isArray(window.songs)?window.songs:[];
    const selected=Array.isArray(m._draftSongs)?m._draftSongs:[];
    const byKey=new Map(); [...source,...selected].forEach(s=>{if(s){const k=serviceIdentity(s);if(k&&!byKey.has(k))byKey.set(k,s)}});
    const list=[...byKey.values()].filter(s=>{const t=[s.title,s.artist,s.category,s.language].join(' ').toLowerCase();return !q||t.includes(q)}).filter(s=>s?.sections?.length||selected.some(x=>serviceIdentity(x)===serviceIdentity(s))).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    box.innerHTML=list.length?list.map(s=>{const id=esc(s.id||s.file||s.title),count=serviceSongCountLocal(selected,s),maxed=count>=3;return `<div class="v64-picker-row"><div class="v64-picker-info"><strong>${esc(s.title||'Untitled')}</strong><small>${esc(s.artist||'')}${count?` · ${count}/3 added`:''}</small></div><button type="button" class="v64-picker-add" data-add-song="${id}" ${maxed?'disabled':''}>${maxed?'✓ 3 ADDED':'＋ ADD'}</button></div>`}).join(''):'<div class="v64-empty">No songs found.</div>';
    box.querySelectorAll('[data-add-song]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.addSong;const song=source.find(x=>String(x.id||x.file||x.title)===id)||selected.find(x=>serviceIdentity(x)===String(id).toLowerCase());if(!song)return;const count=serviceSongCountLocal(m._draftSongs,song);if(count>=3){toast('A song can only be added 3 times to one service','error');return;}m._draftSongs.push(makeServiceOccurrence(song));renderSelectedSongs(m);renderSongPicker(m);});
  }

  async function saveNewService(){
    const m=$('#chordioNewServiceModal'), editService=m?m._editService:null;
    const title=String($('#v63ServiceTitle')?.value||'').trim(), date=$('#v63ServiceDate')?.value||'';
    if(!title)return toast('Enter a service title','error');
    const draft=Array.isArray(m?._draftSongs)?m._draftSongs:[];
    if(!draft.length)return toast('Add at least one song','error');
    const songsOut=cloneServiceSongs(draft).map(s=>({...s,updatedAt:new Date().toISOString()}));
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
  function init(){buildSidebarQuickActions();improveScreenPreview();addEditorDrag();}
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

/* CHORDIO V66 — New Service Add Song picker: full, uncropped panel */
(function(){
  const css=document.createElement('style');
  css.id='chordio-v66-add-song-picker-fix';
  css.textContent=`
    #chordioNewServiceModal .chordio-service-creator{overflow:visible!important}
    #chordioNewServiceModal .v64-picker{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-height:none!important;z-index:2147483000!important;padding:24px!important;box-sizing:border-box!important;background:rgba(7,15,24,.48)!important}
    #chordioNewServiceModal .v64-picker-card{width:min(760px,94vw)!important;max-width:760px!important;height:min(78vh,760px)!important;max-height:calc(100vh - 48px)!important;min-height:320px!important;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;margin:auto!important}
    #chordioNewServiceModal .v64-picker-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:0 18px 18px!important}
    #chordioNewServiceModal .v64-picker-row{min-height:52px!important}
  `;
  document.head.appendChild(css);
})();
