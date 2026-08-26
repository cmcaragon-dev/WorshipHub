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
    songs.forEach((song)=>{
      // For service print, the actual song content is inside .service-print-content.
      // For standalone print, #lyrics may have had its id removed by prepareContent.
      const content =
        song.querySelector('.service-print-content > .wh-print-source-content') ||
        song.querySelector('.service-print-content > .song') ||
        song.querySelector('.service-print-content > .wh-print-source-content') ||
        song.querySelector('.print-song-content > .wh-print-source-content') ||
        song.querySelector('.print-song-content > .song') ||
        song.querySelector('.wh-print-source-content.song') ||
        song.querySelector('.song');

      if(!content) return;

      let wrap=content.querySelector(':scope > .wh-print-layout');
      if(!wrap){
        const sections=Array.from(content.children).filter(el=>el.classList.contains('song-section'));
        if(!sections.length){
          console.warn('Print Preview: no song sections found in', content);
          return;
        }

        wrap=document.createElement('div');
        wrap.className='wh-print-layout';

        const cols=[];
        for(let i=0;i<3;i++){
          const c=document.createElement('div');
          c.className='wh-print-layout-col';
          c.dataset.col=String(i+1);
          cols.push(c);
          wrap.appendChild(c);
        }

        sections.forEach((sec,idx)=>{
          sec.classList.add('wh-print-layout-section');
          sec.dataset.sectionIndex=String(idx);
          sec.dataset.column='1';

          const oldControls=sec.querySelector(':scope > .wh-print-section-controls');
          if(oldControls) oldControls.remove();

          const controls=document.createElement('div');
          controls.className='wh-print-section-controls';
          const title=sec.querySelector(':scope > .section-title')?.textContent?.trim() || `Section ${idx+1}`;

          controls.innerHTML =
            '<span class="wh-print-section-label">'+esc(title)+'</span>'+
            '<button type="button" data-col="1" title="Column 1">C1</button>'+
            '<button type="button" data-col="2" title="Column 2">C2</button>'+
            '<button type="button" data-col="3" title="Column 3">C3</button>'+
            '<button type="button" data-move="up" title="Move section upward">↑</button>'+
            '<button type="button" data-move="down" title="Move section downward">↓</button>';

          sec.insertBefore(controls,sec.firstChild);

          controls.querySelectorAll('[data-col]').forEach(b=>{
            b.onclick=()=>{
              sec.dataset.column=b.dataset.col;
              renderLayout(wrap);
            };
          });
          controls.querySelector('[data-move="up"]').onclick=()=>moveSection(sec,-1,wrap);
          controls.querySelector('[data-move="down"]').onclick=()=>moveSection(sec,1,wrap);
        });

        // Move the sections into the first column, leaving the song header untouched.
        content.appendChild(wrap);
        sections.forEach(sec=>cols[0].appendChild(sec));
      }

      renderLayout(wrap);
    });
  }
  function moveSection(sec,delta,wrap){
    const sections=Array.from(wrap.querySelectorAll('.wh-print-layout-section'));
    const i=sections.indexOf(sec);
    const j=i+delta;
    if(i<0 || j<0 || j>=sections.length) return;

    const target=sections[j];
    if(delta<0){
      target.parentElement.insertBefore(sec,target);
    }else{
      target.parentElement.insertBefore(sec,target.nextSibling);
    }

    // Up/down is ordering only. Column placement remains unchanged.
    renderLayout(wrap);
  }
  function renderLayout(wrap){
    const cols=Array.from(wrap.querySelectorAll(':scope > .wh-print-layout-col'));
    const sections=Array.from(wrap.querySelectorAll(':scope > .wh-print-layout-col > .wh-print-layout-section'));

    sections.forEach(sec=>{
      const n=Math.max(1,Math.min(3,Number(sec.dataset.column)||1));
      const target=cols[n-1];
      if(sec.parentElement!==target) target.appendChild(sec);
    });

    const count=Math.max(1,Math.min(3,Number(document.getElementById('whPrintColumnCount')?.value||2)));
    cols.forEach((c,i)=>{
      c.style.display=i<count?'block':'none';
    });
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
        // Keep the preview open while printing. CSS exposes the paper and hides
        // only the toolbar/controls, so the actual preview content is printed.
        document.body.classList.add('wh-printing-from-preview');
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
    document.body.classList.remove('worshiphub-printing','worshiphub-service-printing','wh-printing-from-preview');
  }

  window.WorshipHubPrintPreview={open,close,prepareContent};
})();
