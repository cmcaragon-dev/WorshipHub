// WorshipHub Print Layout Preview v38
(function(){
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  function showAll(root){
    if(!root) return;
    root.querySelectorAll('[hidden]').forEach(e=>e.hidden=false);
    root.querySelectorAll('#lyrics,.wh-print-source-content,.service-print-content').forEach(e=>{
      e.removeAttribute('id'); e.style.cssText += ';display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important;position:static!important;transform:none!important;';
    });
    root.querySelectorAll('.song-section,.song-line,.section-title,.chord,.print-lyric-text').forEach(e=>{
      e.style.visibility='visible'; e.style.opacity='1';
      e.removeAttribute('contenteditable');
    });
  }

  function findContent(song){
    return song.querySelector('.service-print-content .wh-print-source-content') ||
           song.querySelector('.service-print-content .song') ||
           song.querySelector('.print-song-content .wh-print-source-content') ||
           song.querySelector('.print-song-content .song') ||
           song.querySelector('.wh-print-source-content.song') ||
           song.querySelector('.song') || song;
  }

  function sectionsFor(content){
    return Array.from(content.querySelectorAll(':scope > .song-section'));
  }

  function makeLayout(content){
    let layout=content.querySelector(':scope > .wh-print-layout');
    if(layout) return layout;
    const sections=sectionsFor(content);
    if(!sections.length) return null;
    layout=document.createElement('div');
    layout.className='wh-print-layout';
    for(let i=1;i<=3;i++){
      const col=document.createElement('div'); col.className='wh-print-layout-col'; col.dataset.col=String(i); layout.appendChild(col);
    }
    // Print output must be clean: no C1/C2/C3/up/down buttons in the song area.
    // Automatically distribute sections across exactly three equal-width columns.
    sections.forEach((sec,idx)=>{
      sec.classList.add('wh-print-layout-section');
      sec.dataset.column=String((idx % 3) + 1);
      sec.dataset.order=String(idx);
      // Keep section placement controls in Print Preview so the user can
      // still use C1/C2/C3 and Up/Down to arrange the song sections.
      // They are hidden only during the actual browser print operation.
    });
    content.appendChild(layout);
    const cols=Array.from(layout.children);
    sections.forEach((sec,idx)=>cols[idx % 3].appendChild(sec));
    return layout;
  }

  function allSections(layout){
    return Array.from(layout.querySelectorAll(':scope > .wh-print-layout-col > .wh-print-layout-section'));
  }
  function move(sec,delta,layout){
    const list=allSections(layout), i=list.indexOf(sec), j=i+delta;
    if(i<0||j<0||j>=list.length) return;
    const target=list[j];
    target.parentElement.insertBefore(sec,delta<0?target:target.nextSibling);
    // Re-render without changing selected columns.
    render(layout);
  }
  function render(layout){
    const cols=Array.from(layout.children);
    const sections=allSections(layout);
    // Always show exactly three equal-width columns for printing.
    cols.forEach(c=>{c.style.display='block'; c.dataset.active='1';});
    sections.forEach((sec,idx)=>{
      const target=cols[idx % 3];
      if(target && sec.parentElement!==target) target.appendChild(sec);
    });
  }

  function prepare(root){
    showAll(root);
    const songs=root.querySelectorAll('.service-print-song');
    const targets=songs.length?Array.from(songs):[root];
    targets.forEach(song=>{const content=findContent(song); const layout=makeLayout(content); if(layout) render(layout);});
  }

  function open(root){
    if(!root) return;
    let modal=document.getElementById('whPrintPreview');
    if(!modal){
      modal=document.createElement('div'); modal.id='whPrintPreview'; modal.className='wh-print-preview-overlay';
      modal.innerHTML=`<div class="wh-print-preview-card">
        <div class="wh-print-preview-toolbar"><strong>Print Preview</strong>
          <span class="wh-print-preview-help">Move complete Verse / Chorus / Bridge / Interlude sections to Column 1, 2 or 3. ↑ and ↓ change section order.</span>
          <label class="wh-print-column-count">Columns <select id="whPrintColumnCount"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option></select></label>
          <div class="wh-print-preview-actions"><button type="button" id="whPrintCancel">Close</button><button type="button" id="whPrintDo" class="primary">🖨 Print</button></div>
        </div><div class="wh-print-preview-paper" id="whPrintPreviewPaper"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('#whPrintCancel').onclick=close;
      if (modal.querySelector('#whPrintColumnCount')) modal.querySelector('#whPrintColumnCount').onchange=()=>modal.querySelectorAll('.wh-print-layout').forEach(render);
      modal.querySelector('#whPrintDo').onclick=()=>{
        document.body.classList.add('wh-printing-from-preview');
        window.print();
      };
      window.addEventListener('afterprint',()=>document.body.classList.remove('wh-printing-from-preview'));
    }
    const paper=modal.querySelector('#whPrintPreviewPaper'); paper.innerHTML=''; paper.appendChild(root);
    document.body.classList.add('wh-print-preview-open'); modal.classList.add('show');
    prepare(root);
  }
  function close(){
    document.body.classList.remove('wh-print-preview-open','wh-printing-from-preview','worshiphub-printing','worshiphub-service-printing');
    const modal=document.getElementById('whPrintPreview'); if(modal) modal.classList.remove('show');
    document.getElementById('worshipHubPrintRoot')?.remove(); document.getElementById('worshipHubServicePrintRoot')?.remove();
  }
  window.WorshipHubPrintPreview={open,close,prepareContent:showAll};
})();
