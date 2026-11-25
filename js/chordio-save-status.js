/* CHORDIO save status pill: "Saving…" -> "Saved" / "Couldn't save".
   window.chordioSaveStatus.track(promise)  — wraps any save; returns the same promise
   window.chordioSaveStatus.flash(text,type) — instant message (local settings etc.) */
(function(){
  "use strict";
  if(window.chordioSaveStatus)return;
  var pending=0,failed=0,hideT=null,pill=null;
  function ensure(){
    if(pill&&pill.isConnected)return pill;
    pill=document.createElement("div");
    pill.id="chordioSaveStatus";pill.setAttribute("role","status");pill.setAttribute("aria-live","polite");
    pill.innerHTML='<span class="css-dot" aria-hidden="true"></span><span class="css-text"></span>';
    (document.body||document.documentElement).appendChild(pill);
    return pill;
  }
  function show(state,text,ms){
    var p=ensure();clearTimeout(hideT);
    p.dataset.state=state;p.querySelector(".css-text").textContent=text;
    p.classList.add("show");
    if(ms)hideT=setTimeout(function(){p.classList.remove("show");},ms);
  }
  function settle(){
    if(pending>0)return;
    if(failed){failed=0;show("error","Couldn't save — check your connection and try again",5000);}
    else show("saved","Saved",1800);
  }
  function track(p){
    pending++;show("saving","Saving…");
    return Promise.resolve(p).then(function(v){pending--;settle();return v;},
      function(e){pending--;failed++;settle();throw e;});
  }
  function flash(text,type){show(type||"saved",text||"Saved",1800);}
  window.chordioSaveStatus={track:track,flash:flash};
})();
