// WorshipHub Print Layout Preview v43
// Preview controls (C1/C2/C3/↑/↓) remain available while arranging the print.
// The final browser print uses the exact edited column/order arrangement and hides only the controls.
(function(){
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  function showAll(root){
    if(!root) return;
    root.querySelectorAll('[hidden]').forEach(e=>e.hidden=false);
    root.querySelectorAll('#lyrics,.wh-print-source-content,.service-print-content').forEach(e=>{
      e.removeAttribute('id');
      e.style.cssText += ';display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important;position:static!important;transform:none!important;';
    });
    root.querySelectorAll('.song-section,.song-line,.section-title,.chord,.print-lyric-text').forEach(e=>{
      e.style.visibility='visible';
      e.style.opacity='1';
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

  function getLayout(content){
    return content.querySelector(':scope > .wh-print-layout');
  }

  function getColumns(layout){
    return Array.from(layout.querySelectorAll(':scope > .wh-print-layout-col'));
  }

  function allSections(layout){
    return getColumns(layout).flatMap(col=>Array.from(col.querySelectorAll(':scope > .wh-print-layout-section')));
  }

  function sectionLabel(sec){
    return String(sec.querySelector('.section-title')?.textContent || 'Section').trim();
  }

  function updateControlState(sec){
    const controls=sec.querySelector('.wh-print-section-controls');
    if(!controls) return;
    const current=String(sec.dataset.column || '1');
    controls.querySelectorAll('[data-print-column]').forEach(btn=>{
      const active=btn.dataset.printColumn===current;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function createControls(sec, layout){
    let controls=sec.querySelector(':scope > .wh-print-section-controls');
    if(!controls){
      controls=document.createElement('div');
      controls.className='wh-print-section-controls';
      controls.innerHTML=`
        <span class="wh-print-section-label"></span>
        <button type="button" data-print-column="1" title="Move this section to Column 1">C1</button>
        <button type="button" data-print-column="2" title="Move this section to Column 2">C2</button>
        <button type="button" data-print-column="3" title="Move this section to Column 3">C3</button>
        <button type="button" data-print-move="up" title="Move section up">↑</button>
        <button type="button" data-print-move="down" title="Move section down">↓</button>`;
      sec.insertBefore(controls,sec.firstChild);

      controls.addEventListener('click',event=>{
        const button=event.target.closest('button');
        if(!button) return;
        event.preventDefault();
        event.stopPropagation();
        if(button.dataset.printColumn){
          moveToColumn(sec,Number(button.dataset.printColumn),layout);
        } else if(button.dataset.printMove){
          moveWithinColumn(sec,button.dataset.printMove==='up'?-1:1,layout);
        }
      });
    }
    controls.querySelector('.wh-print-section-label').textContent=sectionLabel(sec);
    updateControlState(sec);
  }

  function moveToColumn(sec,column,layout){
    const cols=getColumns(layout);
    const target=cols[column-1];
    if(!target) return;
    sec.dataset.column=String(column);
    target.appendChild(sec);
    normalizeColumnOrders(layout);
    render(layout);
  }

  function moveWithinColumn(sec,delta,layout){
    const parent=sec.parentElement;
    if(!parent || !parent.classList.contains('wh-print-layout-col')) return;
    const items=Array.from(parent.querySelectorAll(':scope > .wh-print-layout-section'));
    const index=items.indexOf(sec);
    const next=index+delta;
    if(index<0 || next<0 || next>=items.length) return;
    if(delta<0) parent.insertBefore(sec,items[next]);
    else parent.insertBefore(sec,items[next].nextSibling);
    normalizeColumnOrders(layout);
    render(layout);
  }

  function normalizeColumnOrders(layout){
    getColumns(layout).forEach((col,colIndex)=>{
      Array.from(col.querySelectorAll(':scope > .wh-print-layout-section')).forEach((sec,idx)=>{
        sec.dataset.column=String(colIndex+1);
        sec.dataset.order=String(idx);
      });
    });
  }

  function makeLayout(content){
    let layout=getLayout(content);
    if(layout){
      getColumns(layout).forEach((col,colIndex)=>{
        Array.from(col.querySelectorAll(':scope > .wh-print-layout-section')).forEach(sec=>createControls(sec,layout));
      });
      return layout;
    }

    const sections=sectionsFor(content);
    if(!sections.length) return null;

    layout=document.createElement('div');
    layout.className='wh-print-layout';
    layout.dataset.columns='3';
    for(let i=1;i<=3;i++){
      const col=document.createElement('div');
      col.className='wh-print-layout-col';
      col.dataset.col=String(i);
      layout.appendChild(col);
    }

    sections.forEach((sec,idx)=>{
      sec.classList.add('wh-print-layout-section');
      sec.dataset.column=String((idx%3)+1);
      sec.dataset.order=String(Math.floor(idx/3));
      createControls(sec,layout);
      layout.children[idx%3].appendChild(sec);
    });

    content.appendChild(layout);
    normalizeColumnOrders(layout);
    return layout;
  }

  // IMPORTANT: never redistribute sections here. The DOM order/column placement
  // is the user's edited Print Preview layout and must be preserved for printing.
  function render(layout){
    layout.dataset.columns='3';
    getColumns(layout).forEach((col,colIndex)=>{
      col.style.display='block';
      col.dataset.active='1';
      Array.from(col.querySelectorAll(':scope > .wh-print-layout-section')).forEach(sec=>{
        sec.dataset.column=String(colIndex+1);
        updateControlState(sec);
      });
    });
  }

  function prepare(root){
    showAll(root);
    const songs=root.querySelectorAll('.service-print-song');
    const targets=songs.length?Array.from(songs):[root];
    targets.forEach(song=>{
      const content=findContent(song);
      const layout=makeLayout(content);
      if(layout) render(layout);
    });
  }

  function open(root){
    if(!root) return;
    let modal=document.getElementById('whPrintPreview');
    if(!modal){
      modal=document.createElement('div');
      modal.id='whPrintPreview';
      modal.className='wh-print-preview-overlay';
      modal.innerHTML=`<div class="wh-print-preview-card">
        <div class="wh-print-preview-toolbar"><strong>Print Preview</strong>
          <span class="wh-print-preview-help">Move each complete Verse / Chorus / Bridge / Interlude section with C1/C2/C3. Use ↑ and ↓ to change its order within the selected column.</span>
          <div class="wh-print-preview-actions"><button type="button" id="whPrintCancel">Close</button><button type="button" id="whPrintDo" class="primary">🖨 Print</button></div>
        </div><div class="wh-print-preview-paper" id="whPrintPreviewPaper"></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('#whPrintCancel').onclick=close;
      modal.querySelector('#whPrintDo').onclick=()=>{
        // Do NOT rebuild/reorder anything here. The exact DOM arrangement edited
        // in Preview is the arrangement that the browser will print.
        document.body.classList.add('wh-printing-from-preview');
        window.print();
      };
      window.addEventListener('afterprint',()=>document.body.classList.remove('wh-printing-from-preview'));
    }
    const paper=modal.querySelector('#whPrintPreviewPaper');
    paper.innerHTML='';
    paper.appendChild(root);
    document.body.classList.add('wh-print-preview-open');
    modal.classList.add('show');
    prepare(root);
  }

  function close(){
    document.body.classList.remove('wh-print-preview-open','wh-printing-from-preview','worshiphub-printing','worshiphub-service-printing');
    const modal=document.getElementById('whPrintPreview');
    if(modal) modal.classList.remove('show');
    document.getElementById('worshipHubPrintRoot')?.remove();
    document.getElementById('worshipHubServicePrintRoot')?.remove();
  }

  window.WorshipHubPrintPreview={open,close,prepareContent:showAll};
})();
