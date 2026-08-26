// WorshipHub print preview editor - v34
(function(){
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

  function prepareContent(root){
    if(!root) return;
    // The song pages contain an authoritative #lyrics source, but their normal
    // runtime may hide it and render a separate screen layout. Print preview
    // must never inherit that hidden state.
    root.querySelectorAll('#lyrics, .wh-print-source-content, .service-print-content').forEach(el=>{
      el.removeAttribute('id');
      el.style.display='block';
      el.style.visibility='visible';
      el.style.opacity='1';
      el.style.height='auto';
      el.style.maxHeight='none';
      el.style.overflow='visible';
      el.style.position='static';
      el.style.transform='none';
    });

    // Make section content explicitly visible and preserve the HTML chord spacing.
    root.querySelectorAll('.song-section, .song-line, .section-title, .chord, .print-lyric-text').forEach(el=>{
      el.style.visibility='visible';
      el.style.opacity='1';
    });

    // Print preview is a layout editor only: the song text/chords remain unchanged.
    root.querySelectorAll('.song-line, .chord, .print-lyric-text').forEach(el=>{
      el.removeAttribute('contenteditable');
    });
  }

  function getSongs(root){
    if(!root) return [];
    const serviceSongs=root.querySelectorAll('.service-print-song');
    if(serviceSongs.length) return Array.from(serviceSongs);
    return [root];
  }
  function prepareLayout(root){
    const songs=getSongs(root);
    songs.forEach((song,si)=>{
      const content=song.querySelector('.service-print-content, .print-song-content') || song;
      const sections=Array.from(content.querySelectorAll(':scope > .song-section'));
      if(!sections.length) return;
      let wrap=content.querySelector(':scope > .wh-print-layout');
      if(!wrap){
        wrap=document.createElement('div'); wrap.className='wh-print-layout';
        const cols=[];
        for(let i=0;i<3;i++){ const c=document.createElement('div'); c.className='wh-print-layout-col'; c.dataset.col=String(i+1); cols.push(c); wrap.appendChild(c); }
        sections.forEach((sec,idx)=>{
          sec.classList.add('wh-print-layout-section');
          sec.dataset.sectionIndex=String(idx);
          sec.dataset.column=String(idx===0?1:1);
          const controls=document.createElement('div'); controls.className='wh-print-section-controls';
          controls.innerHTML='<span class="wh-print-section-label">'+esc(sec.querySelector('.section-title')?.textContent?.trim()||'Section')+'</span>'+
            '<button type="button" data-col="1">C1</button><button type="button" data-col="2">C2</button><button type="button" data-col="3">C3</button>'+
            '<button type="button" data-move="up">↑</button><button type="button" data-move="down">↓</button>';
          sec.insertBefore(controls,sec.firstChild);
          controls.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{sec.dataset.column=b.dataset.col; renderLayout(wrap);});
          controls.querySelector('[data-move="up"]').onclick=()=>moveSection(sec,-1,wrap);
          controls.querySelector('[data-move="down"]').onclick=()=>moveSection(sec,1,wrap);
        });
        content.innerHTML=''; content.appendChild(wrap);
      }
      renderLayout(wrap);
    });
  }
  function moveSection(sec,delta,wrap){
    const col=sec.parentElement;
    const arr=Array.from(col.children).filter(x=>x.classList.contains('wh-print-layout-section'));
    const i=arr.indexOf(sec); const j=i+delta;
    if(i<0||j<0||j>=arr.length) return;
    if(delta<0) col.insertBefore(sec,arr[j]); else col.insertBefore(sec,arr[j].nextSibling);
  }
  function renderLayout(wrap){
    const sections=Array.from(wrap.querySelectorAll(':scope > .wh-print-layout-col > .wh-print-layout-section'));
    const cols=Array.from(wrap.querySelectorAll(':scope > .wh-print-layout-col'));
    sections.forEach(sec=>{ const target=cols[Math.max(0,Math.min(2,(Number(sec.dataset.column)||1)-1))]; if(sec.parentElement!==target) target.appendChild(sec); });
    cols.forEach((c,i)=>{c.style.display=(i<Number(document.getElementById('whPrintColumnCount')?.value||2))?'block':'none';});
  }
  function setColumnCount(n){
    document.querySelectorAll('.wh-print-layout').forEach(w=>renderLayout(w));
  }

  function open(root, options={}){
    if(!root) return;
    root.classList.add('wh-print-preview-root');
    document.body.classList.add('wh-print-preview-open');
    let modal=document.getElementById('whPrintPreview');
    if(!modal){
      modal=document.createElement('div');
      modal.id='whPrintPreview';
      modal.className='wh-print-preview-overlay';
      modal.innerHTML=`<div class="wh-print-preview-card">
        <div class="wh-print-preview-toolbar">
          <strong>Print Preview</strong>
          <span class="wh-print-preview-help">Arrange song sections before printing. Move Verse/Chorus/Bridge/Interlude to Column 1, Column 2, or reorder them. Song lyrics and chords are not edited here.</span><label class="wh-print-column-count">Columns <select id="whPrintColumnCount"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></label>
          <div class="wh-print-preview-actions">
            <button type="button" id="whPrintCancel">Close</button>
            <button type="button" id="whPrintDo" class="primary">🖨 Print</button>
          </div>
        </div>
        <div class="wh-print-preview-paper" id="whPrintPreviewPaper"></div>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#whPrintCancel').onclick=()=>close();
      modal.querySelector('#whPrintDo').onclick=()=>{
        document.body.classList.remove('wh-print-preview-open');
        // Preserve whichever print mode was requested.
        if(document.getElementById('worshipHubServicePrintRoot')){
          document.body.classList.add('worshiphub-service-printing');
        } else {
          document.body.classList.add('worshiphub-printing');
        }
        setTimeout(()=>window.print(),50);
      };
    }
    const paper=modal.querySelector('#whPrintPreviewPaper');
    paper.innerHTML='';
    paper.appendChild(root);
    prepareContent(root);
    prepareLayout(root);
    const selector=modal.querySelector('#whPrintColumnCount');
    if(selector){ selector.onchange=()=>setColumnCount(selector.value); }
    modal.classList.add('show');
  }

  function close(){
    const modal=document.getElementById('whPrintPreview');
    document.body.classList.remove('wh-print-preview-open');
    if(modal) modal.classList.remove('show');
    const root=document.getElementById('worshipHubPrintRoot');
    if(root){root.classList.remove('wh-print-preview-root');root.remove();}
    const service=document.getElementById('worshipHubServicePrintRoot');
    if(service){service.classList.remove('wh-print-preview-root');service.remove();}
    document.body.classList.remove('worshiphub-printing','worshiphub-service-printing');
  }

  window.WorshipHubPrintPreview={open,close,prepareContent};
})();
