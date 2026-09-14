// CHORDIO Print Layout Preview v43
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

  function balanceInitialColumns(layout){
    const cols=getColumns(layout);
    if(cols.length!==3) return;
    const sections=allSections(layout);
    if(sections.length<2) return;

    // Start with every section in column 1 so the browser can measure the
    // real rendered height of each complete section (controls + lyrics + chords).
    sections.forEach(sec=>cols[0].appendChild(sec));
    normalizeColumnOrders(layout);

    const totalHeight=cols[0].scrollHeight;
    if(!totalHeight) return;
    const target=totalHeight/3;
    let colIndex=0;
    let currentHeight=0;

    sections.forEach((sec, index)=>{
      const h=sec.getBoundingClientRect().height || sec.offsetHeight || 0;
      const remaining=sections.length-index-1;
      const columnsLeft=3-colIndex;
      const mustMove=colIndex<2 && currentHeight>0 && currentHeight+h>target && remaining>=columnsLeft-1;

      if(mustMove){
        colIndex+=1;
        currentHeight=0;
      }
      cols[colIndex].appendChild(sec);
      currentHeight += h;
    });
    normalizeColumnOrders(layout);
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
      sec.dataset.column='1';
      sec.dataset.order=String(idx);
      createControls(sec,layout);
    });

    content.appendChild(layout);

    // Start with a balanced three-column layout for both print modes.
    // Service Print uses height-aware sequential packing; Standalone uses
    // the same initial packing and then preserves every manual C1/C2/C3/↑/↓
    // edit exactly as the user leaves it.
    balanceInitialColumns(layout);
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

  // ---------------------------------------------------------
  // SERVICE PRINT: PAGE / COLUMN / BLOCK ORGANIZER
  // Each song is a stack of physical print pages. Every header
  // block (title/artist/key/passing chord) and every lyric section
  // can be moved independently to any page and column.
  // ---------------------------------------------------------
  function directChildren(el, selector){ return Array.from(el.children).filter(x=>x.matches(selector)); }

  function serviceBlocks(article){
    let host=article.querySelector(':scope > .wh-service-print-pages');
    if(!host){
      host=document.createElement('div');
      host.className='wh-service-print-pages';
      article.appendChild(host);
    }
    return host;
  }

  function pageColumns(page){ return Array.from(page.querySelectorAll(':scope > .wh-service-print-page-grid > .wh-service-print-col')); }
  function pages(article){ return Array.from(serviceBlocks(article).querySelectorAll(':scope > .wh-service-print-page')); }

  function bindPage(page,article){
    const del=page.querySelector('.wh-service-delete-page');
    if(del && !del.dataset.bound){
      del.dataset.bound='1';
      del.addEventListener('click',e=>{
        e.preventDefault(); e.stopPropagation();
        const ps=pages(article);
        if(ps.length<=1){ alert('A song must keep at least one print page.'); return; }
        const blocks=Array.from(page.querySelectorAll('.wh-service-print-block'));
        const fallback=ps[Math.max(0,ps.indexOf(page)-1)];
        blocks.forEach(b=>pageColumns(fallback)[0].appendChild(b));
        page.remove(); renumberPages(article);
      });
    }
  }

  function addPage(article){
    const host=serviceBlocks(article), page=document.createElement('section');
    page.className='wh-service-print-page';
    page.dataset.page=String(pages(article).length+1);
    page.innerHTML='<div class="wh-service-print-page-bar"><strong>PRINT PAGE <span class="wh-service-print-page-number"></span></strong><button type="button" class="wh-service-delete-page">Delete Page</button></div><div class="wh-service-print-page-grid"><div class="wh-service-print-col" data-col="1"></div><div class="wh-service-print-col" data-col="2"></div><div class="wh-service-print-col" data-col="3"></div></div>';
    host.appendChild(page);
    bindPage(page,article);
    renumberPages(article);
    return page;
  }

  function renumberPages(article){
    pages(article).forEach((p,i)=>{p.dataset.page=String(i+1); const n=p.querySelector('.wh-service-print-page-number'); if(n)n.textContent=String(i+1);});
    article.querySelectorAll('.wh-service-print-block').forEach(b=>updateBlockControls(b,article));
  }

  function blockTitle(block){ return block.dataset.blockLabel || block.querySelector('.section-title')?.textContent?.trim() || block.querySelector('h1')?.textContent?.trim() || 'Content'; }

  function updateBlockControls(block,article){
    const c=block.querySelector(':scope > .wh-service-block-controls'); if(!c)return;
    c.querySelector('.wh-service-block-name').textContent=blockTitle(block);
    const sel=c.querySelector('select'); sel.innerHTML=pages(article).map((p,i)=>`<option value="${i+1}">Page ${i+1}</option>`).join('');
    const parent=block.parentElement; const page=parent?.closest('.wh-service-print-page'); const col=parent?.dataset.col;
    if(page) sel.value=page.dataset.page;
    c.querySelectorAll('[data-service-col]').forEach(btn=>{const a=btn.dataset.serviceCol===String(col);btn.classList.toggle('active',a);btn.setAttribute('aria-pressed',a?'true':'false');});
  }

  function moveBlock(block, pageNo, colNo, article){
    const ps=pages(article); let page=ps[Number(pageNo)-1];
    while(!page){ page=addPage(article); }
    const col=pageColumns(page)[Number(colNo)-1]; if(!col)return;
    col.appendChild(block); block.dataset.page=String(pageNo); block.dataset.column=String(colNo); updateBlockControls(block,article);
  }

  function moveBlockOrder(block,delta){
    const parent=block.parentElement; if(!parent)return;
    const items=Array.from(parent.children).filter(x=>x.classList.contains('wh-service-print-block'));
    const i=items.indexOf(block), n=i+delta; if(i<0||n<0||n>=items.length)return;
    if(delta<0)parent.insertBefore(block,items[n]); else parent.insertBefore(block,items[n].nextSibling);
  }

  function bindBlock(block,article){
    if(block.querySelector(':scope > .wh-service-block-controls')){updateBlockControls(block,article);return;}
    const c=document.createElement('div'); c.className='wh-service-block-controls';
    c.innerHTML='<span class="wh-service-block-name"></span><select title="Move to print page"></select><button type="button" data-service-col="1">C1</button><button type="button" data-service-col="2">C2</button><button type="button" data-service-col="3">C3</button><button type="button" data-service-move="up">↑</button><button type="button" data-service-move="down">↓</button>';
    block.insertBefore(c,block.firstChild);
    c.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;e.preventDefault();e.stopPropagation();if(b.dataset.serviceCol){const page=block.closest('.wh-service-print-page')?.dataset.page||'1';moveBlock(block,page,b.dataset.serviceCol,article);}else if(b.dataset.serviceMove){moveBlockOrder(block,b.dataset.serviceMove==='up'?-1:1);}});
    c.querySelector('select').addEventListener('change',e=>{const col=block.dataset.column||'1';moveBlock(block,e.target.value,col,article);});
    updateBlockControls(block,article);
  }

  function makeServiceOrganizer(article){
    const host=serviceBlocks(article);
    if(host.dataset.ready==='1'){renumberPages(article);return;}
    host.dataset.ready='1';
    const header=article.querySelector(':scope > .service-print-song-header');
    const content=article.querySelector(':scope > .service-print-content');
    const initial=[];
    if(header){
      const meta=header.querySelector('.service-print-song-meta');
      if(meta){meta.classList.add('wh-service-print-block');meta.dataset.blockLabel='SONG TITLE / ARTIST / KEY';initial.push(meta);}
      const passing=header.querySelector('.service-print-passing');
      if(passing){
        const items=Array.from(passing.querySelectorAll('.service-print-passing-item'));
        items.forEach((item,i)=>{item.classList.add('wh-service-print-block');item.dataset.blockLabel=item.querySelector('b')?.textContent?.replace(':','').trim()||`PASSING CHORD ${i+1}`;initial.push(item);});
        passing.remove();
      }
      header.remove();
    }
    const sections=content ? Array.from(content.querySelectorAll(':scope > .song-section')) : [];
    sections.forEach(sec=>{sec.classList.add('wh-service-print-block');sec.dataset.blockLabel=sec.querySelector('.section-title')?.textContent?.trim()||'LYRICS';initial.push(sec);});
    if(content)content.remove();
    addPage(article);
    const first=pages(article)[0], cols=pageColumns(first);
    initial.forEach((block,i)=>{cols[i<3?i:2].appendChild(block);});
    initial.forEach(b=>bindBlock(b,article));
    renumberPages(article);
  }

  function prepareService(root){
    showAll(root);
    root.querySelectorAll('.service-print-song').forEach(article=>makeServiceOrganizer(article));
    const toolbar=document.getElementById('whPrintPreview')?.querySelector('.wh-print-preview-toolbar');
    if(toolbar && !toolbar.querySelector('#whServiceAddPage')){
      const b=document.createElement('button'); b.id='whServiceAddPage'; b.type='button'; b.textContent='＋ New Page'; b.title='Add a new printable page to the selected song';
      b.onclick=()=>{ const active=document.querySelector('.wh-service-print-page:hover') || root.querySelector('.wh-service-print-song .wh-service-print-page:last-child'); if(active){ const article=active.closest('.service-print-song'); addPage(article); }};
      toolbar.querySelector('.wh-print-preview-actions')?.insertBefore(b,toolbar.querySelector('#whPrintDo'));
      const help=toolbar.querySelector('.wh-print-preview-help'); if(help)help.textContent='Arrange every song before printing. Move SONG TITLE / ARTIST / KEY, PASSING CHORDS, Verse, Chorus, Bridge and other sections to any page and Column 1/2/3. Add or delete pages as needed.';
    }
  }

  function prepare(root){
    if(root.querySelector('.service-print-song')){ prepareService(root); return; }
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
