/* CHORDIO minimalist print: window.chordioPrint.open({title,artist,key,sections:[{label,lines:[{chords,lyrics}]}]}) */
(function(){
  "use strict";
  var MM=96/25.4, RED="#c00000";
  var SIZES={S:9.5,M:11,L:13};
  var st={orient:"portrait",size:"M",cols:2};
  try{var o=localStorage.getItem("chordioPrintOrient");if(o==="landscape"||o==="portrait")st.orient=o;
      var z=localStorage.getItem("chordioPrintSize");if(SIZES[z])st.size=z;var c=localStorage.getItem("chordioPrintCols");if(c==="1"||c==="2"||c==="3")st.cols=Number(c);}catch(e){}
  var model=null, dlg=null;

  function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}

  var cw=0;
  function charWidthPx(pt){ // width of one monospace char in px at pt
    var s=el("span","cp-sheet","M".repeat(50));
    s.style.cssText="position:absolute;visibility:hidden;white-space:pre;overflow:visible;width:auto;height:auto;font-size:"+pt+"pt";
    document.body.appendChild(s);var w=s.getBoundingClientRect().width/50;s.remove();return w||pt*1.333*0.6;
  }

  // split one chord/lyric pair into chunks no wider than max chars, breaking at lyric spaces
  function wrap(chords,lyrics,max){
    var len=Math.max(chords.length,lyrics.length);
    if(len<=max)return [[chords,lyrics]];
    var out=[],pos=0;
    while(pos<len){
      var end=Math.min(len,pos+max);
      if(end<len){var cut=lyrics.lastIndexOf(" ",end);if(cut>pos+max*0.5)end=cut+1;}
      out.push([chords.slice(pos,end).replace(/\s+$/,""),lyrics.slice(pos,end).replace(/\s+$/,"")]);
      pos=end;
    }
    return out;
  }

  function layout(m,orient,sizeKey,colCount){
    var landscape=orient==="landscape";
    var W=(landscape?297:210)*MM, H=(landscape?209:296)*MM;
    var bodyW=W-28*MM, bodyH=H-(13+17)*MM;
    var cols=Math.max(1,Math.min(3,Number(colCount)||2)), gap=(cols===3?7:10)*MM;
    var colW=(bodyW-gap*(cols-1))/cols;
    var pt=SIZES[sizeKey];
    var maxChars=function(p){return Math.floor(colW/charWidthPx(p));};
    // shrink to fit the longest line, never below 8pt
    var longest=0;
    m.sections.forEach(function(s){s.lines.forEach(function(l){longest=Math.max(longest,(l.chords||"").replace(/\s+$/,"").length,(l.lyrics||"").replace(/\s+$/,"").length);});});
    while(pt>8&&maxChars(pt)<longest)pt-=0.5;
    var mc=Math.max(10,maxChars(pt));
    var lh=pt*1.333*1.32;            // px per row
    var headH=(20*1.333*1.15+11*1.333*1.3*(m.artist?2:1)+(m.artist?0:11*1.333*1.3)+3*MM+3*MM+5*MM);
    headH=Math.ceil(headH+6);

    // units: {h, nodes}
    var units=[];
    m.sections.forEach(function(s,si){
      var blocks=[];
      s.lines.forEach(function(l){
        var c=(l.chords||"").replace(/\s+$/,""),y=(l.lyrics||"").replace(/\s+$/,"");
        wrap(c,y,mc).forEach(function(p){blocks.push(p);});
      });
      units.push({kind:"label",text:s.label,h:lh,keep:true,top:si>0});
      blocks.forEach(function(p){
        var rows=(p[0].length?1:0)+(p[1].length?1:0);
        if(!rows)rows=1;
        units.push({kind:"line",chords:p[0],lyrics:p[1],h:rows*lh});
      });
    });

    var pages=[],cur=null,colIdx=0,used=0;
    function newPage(){
      var first=pages.length===0;
      cur={cols:[],avail:bodyH-(first?headH:0),first:first};
      for(var i=0;i<cols;i++)cur.cols.push([]);
      pages.push(cur);colIdx=0;used=0;
    }
    function nextCol(){colIdx++;used=0;if(colIdx>=cols)newPage();}
    newPage();
    for(var i=0;i<units.length;i++){
      var u=units[i];
      var gapH=(u.kind==="label"&&u.top&&used>0)?lh*0.9:0;
      var need=gapH+u.h;
      if(u.kind==="label"&&units[i+1])need+=units[i+1].h; // keep label with first line
      if(used+need>cur.avail&&used>0){nextCol();gapH=0;}
      if(gapH&&used>0){cur.cols[colIdx].push({kind:"gap",h:gapH});used+=gapH;}
      cur.cols[colIdx].push(u);used+=u.h;
    }
    return {pages:pages,pt:pt,lh:lh,orient:orient};
  }

  function songsOf(m){return Array.isArray(m.songs)&&m.songs.length?m.songs:[m];}
  function layoutAll(m,orient,sizeKey){
    var all=[];
    songsOf(m).forEach(function(sg){
      var r=layout(sg,orient,sizeKey,st.cols);
      r.pages.forEach(function(pg){all.push({pg:pg,song:sg,pt:r.pt,lh:r.lh});});
    });
    return {pages:all,orient:orient};
  }
  function renderPages(res){
    var frag=document.createDocumentFragment(),total=res.pages.length;
    res.pages.forEach(function(item,pi){
      var pg=item.pg,m=item.song;
      var rp={pt:item.pt,lh:item.lh,orient:res.orient};
      var sheet=el("div","cp-sheet "+rp.orient);
      var body=el("div","cp-body");
      if(pg.first){
        var head=el("div","cp-head");
        head.appendChild(el("div","cp-title",m.title));
        if(m.artist)head.appendChild(el("div","cp-artist",m.artist));
        var k=el("div","cp-key");k.appendChild(el("b",null,"Key: "));k.appendChild(document.createTextNode(m.key||"—"));
        head.appendChild(k);body.appendChild(head);
      }
      var cols=el("div","cp-cols");
      pg.cols.forEach(function(items){
        var c=el("div","cp-col");c.style.fontSize=rp.pt+"pt";c.style.lineHeight=rp.lh+"px";
        items.forEach(function(u){
          if(u.kind==="gap"){var g=el("span","cp-gap");g.style.height=u.h+"px";c.appendChild(g);}
          else if(u.kind==="label"){c.appendChild(el("div","cp-label",u.text));}
          else{
            if(u.chords)c.appendChild(el("div","cp-chords",u.chords));
            if(u.lyrics)c.appendChild(el("div","cp-lyrics",u.lyrics));
            if(!u.chords&&!u.lyrics)c.appendChild(el("div","cp-lyrics"," "));
          }
        });
        cols.appendChild(c);
      });
      body.appendChild(cols);sheet.appendChild(body);
      var foot=el("div","cp-foot");
      foot.appendChild(el("span",null,m.title));
      foot.appendChild(el("span",null,"Page "+(pi+1)+" of "+total));
      sheet.appendChild(foot);frag.appendChild(sheet);
    });
    return frag;
  }

  function build(){
    var res=layoutAll(model,st.orient,st.size);
    var doc=document.getElementById("chordioPrintDoc");
    if(!doc){doc=el("div");doc.id="chordioPrintDoc";document.body.appendChild(doc);}
    doc.innerHTML="";doc.appendChild(renderPages(res));
    var ps=document.getElementById("chordioPrintPageStyle");
    if(!ps){ps=el("style");ps.id="chordioPrintPageStyle";}
    ps.textContent="@page{size:A4 "+st.orient+";margin:0}";
    document.body.appendChild(ps); // last in body so it wins over legacy @page rules
    return res;
  }

  function refreshPreview(){
    var res=build();
    var view=dlg.querySelector(".cp-view");view.innerHTML="";
    var avail=Math.max(260,view.clientWidth-36);
    var pw=(st.orient==="landscape"?297:210)*MM;
    var z=Math.min(1,avail/pw);
    var pages=document.getElementById("chordioPrintDoc").children;
    Array.prototype.forEach.call(pages,function(p){
      var c=p.cloneNode(true);
      var wrap=el("div");wrap.style.cssText="width:"+(pw*z)+"px;height:"+(p.offsetHeight?0:0)+"px";
      c.style.transformOrigin="top left";c.style.transform="scale("+z+")";
      var h=(st.orient==="landscape"?209:296)*MM;
      wrap.style.height=(h*z)+"px";wrap.style.flex="none";wrap.appendChild(c);view.appendChild(wrap);
    });
    dlg.querySelector(".cp-count").textContent=res.pages.length+(res.pages.length===1?" page":" pages");
    dlg.querySelectorAll("[data-orient]").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.orient===st.orient?"true":"false");});
    dlg.querySelectorAll("[data-cols]").forEach(function(b){b.setAttribute("aria-pressed",Number(b.dataset.cols)===st.cols?"true":"false");});
    dlg.querySelectorAll("[data-size]").forEach(function(b){b.setAttribute("aria-pressed",b.dataset.size===st.size?"true":"false");});
  }

  function close(){
    if(dlg){dlg.remove();dlg=null;}
    document.removeEventListener("keydown",onKey,true);
    var d=document.getElementById("chordioPrintDoc");if(d)d.innerHTML="";
  }
  function onKey(e){if(e.key==="Escape"){e.stopPropagation();close();}}

  function doPrint(){
    build();
    document.body.classList.add("chordio-printing");
    var done=function(){document.body.classList.remove("chordio-printing");window.removeEventListener("afterprint",done);};
    window.addEventListener("afterprint",done);
    setTimeout(function(){window.print();setTimeout(function(){if(!/Mobi|Android/i.test(navigator.userAgent))done();},300);},60);
  }

  function open(m){
    model=m;close();
    dlg=el("div");dlg.id="chordioPrintDlg";dlg.setAttribute("role","dialog");dlg.setAttribute("aria-modal","true");dlg.setAttribute("aria-label",model.heading||"Print song");
    dlg.innerHTML='<div class="cp-card"><div class="cp-bar"><div class="cp-h"></div>'+
      '<div class="cp-grp">Page<span class="cp-seg"><button type="button" data-orient="portrait">Portrait</button><button type="button" data-orient="landscape">Landscape</button></span></div>'+
      '<div class="cp-grp">Columns<span class="cp-seg"><button type="button" data-cols="1">1</button><button type="button" data-cols="2">2</button><button type="button" data-cols="3">3</button></span></div>'+
      '<div class="cp-grp">Text<span class="cp-seg"><button type="button" data-size="S">Small</button><button type="button" data-size="M">Medium</button><button type="button" data-size="L">Large</button></span></div>'+
      '<span class="cp-count"></span><button type="button" class="cp-x">Cancel</button><button type="button" class="cp-go">Print</button></div>'+
      '<div class="cp-view"></div></div>';
    dlg.querySelector(".cp-h").textContent=m.heading||"Print song";
    document.body.appendChild(dlg);
    dlg.addEventListener("click",function(e){
      var t=e.target;
      if(t===dlg){close();return;}
      var b=t.closest&&t.closest("button");if(!b)return;
      if(b.dataset.orient){st.orient=b.dataset.orient;try{localStorage.setItem("chordioPrintOrient",st.orient);}catch(x){}refreshPreview();}
      else if(b.dataset.cols){st.cols=Number(b.dataset.cols);try{localStorage.setItem("chordioPrintCols",String(st.cols));}catch(x){}refreshPreview();}
      else if(b.dataset.size){st.size=b.dataset.size;try{localStorage.setItem("chordioPrintSize",st.size);}catch(x){}refreshPreview();}
      else if(b.classList.contains("cp-x"))close();
      else if(b.classList.contains("cp-go"))doPrint();
    });
    document.addEventListener("keydown",onKey,true);
    refreshPreview();
    dlg.querySelector(".cp-go").focus();
  }

  window.chordioPrint={open:open,_layout:layout};
})();
