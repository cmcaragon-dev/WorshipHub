// WorshipHub print preview editor - v34
(function(){
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

  function prepareContent(root){
    if(!root) return;
    // Force the actual song content to be visible in preview. The normal song
    // page can hide #lyrics or use a generated display; print preview must use
    // the source markup as the authoritative print content.
    root.querySelectorAll('#lyrics').forEach(el=>{
      el.style.display='block';
      el.style.visibility='visible';
      el.style.height='auto';
      el.style.maxHeight='none';
      el.style.overflow='visible';
    });
    root.querySelectorAll('.service-print-content, .service-print-content #lyrics').forEach(el=>{
      el.style.display='block';
      el.style.visibility='visible';
      el.style.height='auto';
      el.style.maxHeight='none';
      el.style.overflow='visible';
    });

    // Make every song line directly editable. This preserves the exact HTML
    // chord spacing while allowing lyrics and chord text to be corrected.
    root.querySelectorAll('.song-line').forEach(line=>{
      line.contentEditable='true';
      line.classList.add('wh-print-editable-line');
      line.title='Edit chords and lyrics here. Preserve spaces to position chords.';
    });
    root.querySelectorAll('.chord').forEach(el=>{
      el.contentEditable='false';
      el.classList.add('wh-print-editable-chord');
      el.title='Chord position is controlled by spaces in this line';
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
