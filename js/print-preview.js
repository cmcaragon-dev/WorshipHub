// WorshipHub print preview editor. Loaded by pages that include this file.
(function(){
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function open(root, options={}){
    if(!root) return;
    root.classList.add('wh-print-preview-root');
    document.body.classList.add('wh-print-preview-open');
    let modal=document.getElementById('whPrintPreview');
    if(!modal){
      modal=document.createElement('div'); modal.id='whPrintPreview'; modal.className='wh-print-preview-overlay';
      modal.innerHTML=`<div class="wh-print-preview-card"><div class="wh-print-preview-toolbar"><strong>Print Preview</strong><span class="wh-print-preview-help">Edit chord spacing/lyrics below, then print.</span><div class="wh-print-preview-actions"><button type="button" id="whPrintCancel">Close</button><button type="button" id="whPrintDo" class="primary">🖨 Print</button></div></div><div class="wh-print-preview-paper" id="whPrintPreviewPaper"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('#whPrintCancel').onclick=()=>close();
      modal.querySelector('#whPrintDo').onclick=()=>{ document.body.classList.remove('wh-print-preview-open'); document.body.classList.add('worshiphub-printing'); setTimeout(()=>window.print(),50); };
    }
    const paper=modal.querySelector('#whPrintPreviewPaper'); paper.innerHTML=''; paper.appendChild(root);
    paper.querySelectorAll('.chord').forEach(el=>{el.contentEditable='true';el.classList.add('wh-print-editable-chord');el.title='Edit chord spacing here';});
    paper.querySelectorAll('.print-lyric-text').forEach(el=>{el.contentEditable='true';});
    paper.querySelectorAll('.song-line').forEach(line=>{line.classList.add('wh-print-editable-line');});
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
    document.body.classList.remove('worshiphub-printing');
  }
  window.WorshipHubPrintPreview={open,close};
})();
