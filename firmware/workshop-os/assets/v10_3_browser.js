
/* Smart Home v10.3 browser Workshop workspace */
var v103WorkshopData={};
function v103Minutes(m){m=Number(m||0);if(!m)return '—';var h=Math.floor(m/60),r=m%60;return h?(h+'h '+String(r).padStart(2,'0')+'m'):(r+'m')}
function v103Set(id,text){var e=document.getElementById(id);if(e)e.textContent=text==null?'—':String(text)}
function v103RefreshWorkshop(manual){
  var root=document.getElementById('sec-workshop');if(!root)return;
  fetch('/status?slot='+(Number(currentSlot||0))+'&_='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){
    v103WorkshopData=d||{};var connected=!!d.connected,p=Number(d.progress||0);
    v103Set('wkState',connected?(d.state||'CONNECTED'):(d.configured?'OFFLINE':'SETUP'));v103Set('wkUpdated','Updated '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    var dot=document.getElementById('wkDot');if(dot)dot.className=connected?'ok':(d.configured?'bad':'warn');
    v103Set('wkProgress',p+'%');v103Set('wkProgressSub',connected?(d.state||'Printer connected'):'Printer unavailable');v103Set('wkRemaining',v103Minutes(d.remaining));v103Set('wkLayer',(Number(d.layer||0))+' / '+(Number(d.layers||0)));v103Set('wkChamber',d.chamber==null?'—':Math.round(Number(d.chamber))+'°C');
    v103Set('wkLightState',d.lightState===1?'On — tap to turn off':(d.lightState===0?'Off — tap to turn on':'State unavailable'));
    var ams=d.ams||{},trays=Array.isArray(ams.trays)?ams.trays:[],active=null;for(var i=0;i<trays.length;i++)if(trays[i].active){active=trays[i];break}
    if(!active&&ams.activeTray===254&&ams.externalPresent)active={type:ams.externalType||'External spool',remain:-1,color:ams.externalColor||'#8b949e',external:true};
    v103Set('wkAmsState',ams.present?((Number(ams.units||0))+' unit'+(Number(ams.units||0)===1?'':'s')):(ams.externalPresent?'External spool':'No AMS'));
    v103Set('wkLoadedName',active?(active.type||'Loaded filament'):'None loaded');v103Set('wkLoadedDetail',active?(active.external?'External spool':('AMS A'+(Number(active.slot)+1)+(Number(active.remain)>=0?' · '+active.remain+'% remaining':''))):'No active material reported');
    var spool=document.getElementById('wkLoadedSpool');if(spool)spool.style.setProperty('--spool-color',active&&active.color?active.color:'#59636e');
    var deck=document.getElementById('wkTrays');if(deck){if(!trays.length){deck.innerHTML='<div class="wk-empty">'+(ams.present?'AMS detected; no tray material data yet.':'No AMS tray data reported by the selected printer.')+'</div>'}else{deck.innerHTML=trays.map(function(tr){var remain=Number(tr.remain);return '<div class="wk-tray '+(tr.active?'active':'')+'"><span class="wk-tray-swatch" style="--tray-color:'+(tr.color||'#59636e')+'"></span><div><small>A'+(Number(tr.slot)+1)+'</small><strong>'+(tr.type||'Filament')+'</strong></div><span class="wk-remain">'+(remain>=0?remain+'%':'—')+'</span></div>'}).join('')}}
  }).catch(function(){v103Set('wkState','Unavailable');v103Set('wkUpdated','Device status could not be read');var dot=document.getElementById('wkDot');if(dot)dot.className='bad'});
}
function v103ToggleWorkshopLight(){var d=v103WorkshopData||{};if(typeof setLight!=='function')return;setLight(d.lightState===1?'off':'on');setTimeout(function(){v103RefreshWorkshop(false)},700)}

