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

    root.querySelectorAll('.song-line').forEach(line=>{
      line.contentEditable='true';
      line.classList.add('wh-print-editable-line');
      line.title='Edit this line. Keep spaces in the chord text to control exact chord position.';
    });
    root.querySelectorAll('.chord').forEach(el=>{
      el.contentEditable='true';
      el.classList.add('wh-print-editable-chord');
      el.title='Edit chord text/spaces to position it above the lyric.';
    });
    root.querySelectorAll('.print-lyric-text').forEach(el=>{
      el.contentEditable='true';
      el.classList.add('wh-print-editable-lyric');
    });
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
          <span class="wh-print-preview-help">Edit chords and lyrics below. Keep spaces before chords to control their exact position.</span>
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
