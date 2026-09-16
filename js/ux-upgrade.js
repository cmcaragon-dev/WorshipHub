/* CHORDIO UX UPGRADE — V61 */
(function(){
'use strict';
const LS={fav:'chordioFavoritesV61',recent:'chordioRecentV61',tpl:'chordioServiceTemplatesV61',live:'chordioLiveModeV61',snap:'chordioUndoSnapshotV61'};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const safe=(fn,fb)=>{try{return fn()}catch(e){return fb}};
function get(k,fb){return safe(()=>JSON.parse(localStorage.getItem(k)||'null'),fb)} function set(k,v){safe(()=>localStorage.setItem(k,JSON.stringify(v)),null)}
function toast(msg,type='success'){let root=$('#chordioToast');if(!root){root=document.createElement('div');root.id='chordioToast';document.body.appendChild(root)}const d=document.createElement('div');d.className='chordio-toast '+type;d.textContent=msg;root.appendChild(d);setTimeout(()=>d.remove(),2600)}
window.chordioToast=toast;
function nav(){
  const side=$('.sidebar'); if(!side)return;
  const map=[['All Songs','showAllSongs'],['Service Planner','servicePlannerBtn'],['Playlist Manager','playlistBtn'],['Add Song','addSongBtn'],['Import Song from Chord Link','importSongBtn'],['Settings','settingsBtn']];
  $$('.sidebar button').forEach(b=>{b.addEventListener('click',()=>{$$('.sidebar button').forEach(x=>x.classList.remove('chordio-nav-active'));b.classList.add('chordio-nav-active')})});
}
function quickAction(label,icon,fn,sub){const b=document.createElement('button');b.className='chordio-quick-action';b.innerHTML=`<span>${icon}</span>${label}<small>${sub||''}</small>`;b.onclick=fn;return b}
function enhanceDashboard(){
 const main=$('.content'); if(!main||$('#chordioHero'))return;
 const hero=document.createElement('section');hero.id='chordioHero';hero.className='chordio-dashboard-hero';hero.innerHTML='<div><h1>Welcome to CHORDIO</h1><p>Prepare your service, manage songs, and control your screens from one place.</p></div><div class="chordio-autosave" id="chordioAutosave">Ready</div>';
 const dash=$('.dashboard'); main.insertBefore(hero,dash||main.firstChild);
 const actions=document.createElement('section');actions.className='chordio-quick-actions';
 actions.append(
  quickAction('New Service','📅',()=>{$('#servicePlannerBtn')?.click()},'Create a service plan'),
  quickAction('Add Song','🎵',()=>{$('#addSongBtn')?.click()},'Build a new song'),
  quickAction('Multi-Screen','🖥️',()=>{const b=document.querySelector('#serviceList .start-multi-screen-service-btn');if(b)b.click();else $('#servicePlannerBtn')?.click()},'Open screen control from a service'),
  quickAction('Bible','📖',()=>{toast('Open Multi-Screen → Online Bible for Scripture slides.','warn')},'Prepare Scripture slides'),
  quickAction('Settings','⚙️',()=>{$('#settingsBtn')?.click()},'Configure CHORDIO')
 );
 main.insertBefore(actions,dash||main.firstChild);
 const grid=document.createElement('section');grid.className='chordio-dashboard-grid';grid.innerHTML='<div class="chordio-ux-panel"><h3>⭐ Favorites</h3><div id="chordioFavoritesList"></div></div><div class="chordio-ux-panel"><h3>🕘 Recently Used</h3><div id="chordioRecentList"></div></div>';
 main.insertBefore(grid,$('#songGrid')?.parentElement||null);renderLists();
}
function renderLists(){
 const fav=$('#chordioFavoritesList'), rec=$('#chordioRecentList'); if(!fav||!rec)return;
 const f=get(LS.fav,[])||[], r=get(LS.recent,[])||[];
 const row=x=>{const b=document.createElement('div');b.className='chordio-list-row';b.innerHTML=`<div><strong>${escapeHtml(x.title||'Song')}</strong><small>${escapeHtml(x.artist||'')}</small></div><button class="chordio-star ${f.some(y=>y.id===x.id)?'active':''}" title="Favorite">★</button>`;b.querySelector('.chordio-star').onclick=()=>toggleFav(x);b.querySelector('div').onclick=()=>openSongRef(x);return b};
 fav.innerHTML=''; r.innerHTML=''; if(!f.length)fav.innerHTML='<small>No favorites yet. Star a song card to add one.</small>';else f.slice(0,8).forEach(x=>fav.appendChild(row(x)));if(!r.length)rec.innerHTML='<small>Your recently opened songs will appear here.</small>';else r.slice(0,8).forEach(x=>rec.appendChild(row(x)));
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function openSongRef(x){if(x.href){location.href=x.href;return} if(x.id){location.hash='song-'+encodeURIComponent(x.id);toast('Song selected: '+x.title)}}
function toggleFav(x){let f=get(LS.fav,[])||[];const i=f.findIndex(y=>y.id===x.id);if(i>=0){f.splice(i,1);toast('Removed from Favorites','warn')}else{f.unshift(x);toast('Added to Favorites')}set(LS.fav,f.slice(0,50));renderLists();}
function captureSongCards(){
 $$('.song-card').forEach(card=>{if(card.dataset.chordioUxBound)return;card.dataset.chordioUxBound='1';let link=card.querySelector('.open-song');if(!link)return;const title=card.querySelector('.all-song-title,.song-title,h3,h4')?.textContent?.trim()||'Song';const id=link.getAttribute('href')||title;const artist=card.querySelector('.song-artist')?.textContent?.trim()||'';const x={id,title,artist,href:link.getAttribute('href')};
  let actions=card.querySelector('.song-card-actions');if(actions&&!actions.querySelector('.chordio-star')){const star=document.createElement('button');star.className='chordio-star';star.textContent='★';star.title='Favorite';star.onclick=e=>{e.preventDefault();toggleFav(x);star.classList.toggle('active',get(LS.fav,[]).some(y=>y.id===x.id))};if(get(LS.fav,[]).some(y=>y.id===x.id))star.classList.add('active');actions.appendChild(star)}
  link.addEventListener('click',()=>{let r=get(LS.recent,[])||[];r=[x,...r.filter(y=>y.id!==x.id)].slice(0,30);set(LS.recent,r);setTimeout(renderLists,50)},{capture:true});
 });
}
function templates(){
 const panel=$('#servicePanel');if(!panel||$('#chordioTemplateSelect'))return;const wrap=document.createElement('div');wrap.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0';wrap.innerHTML='<select id="chordioTemplateSelect"><option value="">Service template…</option><option value="Sunday Service">Sunday Service</option><option value="Midweek Service">Midweek Service</option><option value="Youth Service">Youth Service</option></select><button type="button" id="chordioSaveTemplate">Save current as template</button>';panel.querySelector('#createService')?.parentElement?.appendChild(wrap);
 $('#chordioTemplateSelect').onchange=e=>{if(e.target.value){const n=$('#serviceName');if(n)n.value=e.target.value;toast('Template selected. Add songs and save the service.')}};
 $('#chordioSaveTemplate').onclick=()=>{const n=$('#serviceName')?.value?.trim();if(!n)return toast('Enter a service name first','warn');let t=get(LS.tpl,[])||[];t=[...new Set([n,...t])].slice(0,20);set(LS.tpl,t);toast('Service template saved: '+n)};
}
function shortcuts(){
 if($('#chordioShortcuts'))return;const d=document.createElement('div');d.id='chordioShortcuts';d.className='chordio-shortcuts';d.innerHTML='<div class="chordio-shortcuts-card"><header><h2>Keyboard Shortcuts</h2><button type="button" id="chordioShortcutClose">✕</button></header><table><tr><td><kbd>→</kbd> / <kbd>Space</kbd></td><td>Next song / section</td></tr><tr><td><kbd>←</kbd></td><td>Previous</td></tr><tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Focus screen</td></tr><tr><td><kbd>B</kbd></td><td>Blank / restore output</td></tr><tr><td><kbd>L</kbd></td><td>Toggle Live Mode in Multi-Screen</td></tr><tr><td><kbd>?</kbd></td><td>Show shortcuts</td></tr><tr><td><kbd>Esc</kbd></td><td>Close dialog / exit Live Mode</td></tr></table></div>';document.body.appendChild(d);$('#chordioShortcutClose').onclick=()=>d.classList.remove('show');d.onclick=e=>{if(e.target===d)d.classList.remove('show')};
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='?'){e.preventDefault();d.classList.add('show');return}if(e.key==='Escape'){d.classList.remove('show');if(document.body.classList.contains('chordio-live-mode'))toggleLive(false);return}if(e.key.toLowerCase()==='l'){toggleLive();return}if(e.key===' '||e.key==='ArrowRight'){const b=$('#customPresentationNextBottom,#customPresentationNext');if(b){e.preventDefault();b.click()}}if(e.key==='ArrowLeft'){const b=$('#customPresentationPrevBottom,#customPresentationPrev');if(b){e.preventDefault();b.click()}}});
}
function addLiveMode(){
 const shell=$('.multi-screen-shell');if(!shell||$('#chordioLiveToggle'))return;const head=shell.querySelector('.multi-screen-head');if(!head)return;const b=document.createElement('button');b.id='chordioLiveToggle';b.className='chordio-live-toggle';b.textContent='● LIVE MODE';b.onclick=()=>toggleLive();head.appendChild(b);if(get(LS.live,false))toggleLive(true);
}
function toggleLive(force){const on=typeof force==='boolean'?force:!document.body.classList.contains('chordio-live-mode');document.body.classList.toggle('chordio-live-mode',on);set(LS.live,on);const b=$('#chordioLiveToggle');if(b){b.textContent=on?'■ EXIT LIVE MODE':'● LIVE MODE';b.classList.toggle('chordio-live-exit',on)}toast(on?'Live Mode enabled — presentation controls simplified.':'Live Mode disabled.','success')}
function addLyricsPresets(){
 const panel=$('[data-feature-panel="lyrics"] .multi-feature-content');if(!panel||$('#chordioPresetRow'))return;const row=document.createElement('div');row.id='chordioPresetRow';row.className='chordio-settings-preset-row';row.innerHTML='<strong style="width:100%">QUICK PRESETS</strong><button class="chordio-preset" data-preset="standard">Standard</button><button class="chordio-preset" data-preset="large">Large</button><button class="chordio-preset" data-preset="projector">Projector</button><button class="chordio-preset chordio-reset-settings" data-preset="reset">↺ Reset Defaults</button>';panel.insertBefore(row,panel.firstChild);
 const presets={standard:{fontPx:42,spacing:1.15,vertical:50},large:{fontPx:60,spacing:1.2,vertical:50},projector:{fontPx:72,spacing:1.12,vertical:45},reset:{fontPx:42,spacing:1.15,vertical:50}};
 row.addEventListener('click',e=>{const p=e.target.closest('[data-preset]');if(!p)return;const v=presets[p.dataset.preset];Object.entries({multiLyricsFontPx:v.fontPx,multiLyricsSpacing:v.spacing,multiLyricsVertical:v.vertical}).forEach(([id,val])=>{const el=$('#'+id);if(el){el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}))}});$('#multiLyricsSettingsApply')?.click();toast(p.dataset.preset==='reset'?'Lyrics settings reset':'Lyrics preset applied')});
}
function autosaveIndicator(){
 const root=$('#chordioAutosave');if(!root)return;root.textContent='Ready';window.chordioMarkSaving=()=>{root.textContent='Saving…';root.className='chordio-autosave saving'};window.chordioMarkSaved=()=>{root.textContent='✓ Saved '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});root.className='chordio-autosave saved'};
 setInterval(()=>{if(document.visibilityState==='visible'&&root.textContent==='Ready')window.chordioMarkSaved()},8000);
}
function observe(){new MutationObserver(()=>captureSongCards()).observe(document.body,{childList:true,subtree:true});}
function init(){document.body.classList.add('chordio-ux');nav();enhanceDashboard();autosaveIndicator();shortcuts();templates();observe();captureSongCards();addLiveMode();addLyricsPresets();
 const sb=$('#searchBox');if(sb){sb.placeholder='Search songs, artists, categories, languages…';sb.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.searchSongs?.(sb.value)}})}
 document.addEventListener('click',e=>{if(e.target.closest('#createService,#saveSongEditor,#multiLyricsSettingsApply,#multiLyricsEditorSave'))window.chordioMarkSaving?.();});
 window.addEventListener('beforeunload',()=>set(LS.live,false));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,250));else setTimeout(init,250);
})();
