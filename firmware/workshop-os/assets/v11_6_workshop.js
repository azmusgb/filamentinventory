/* Smart Home v11.6 Workshop Command Center */
var v116PowerState={slot:-1,available:false,online:false,on:false,printing:false,busy:false};
var v116WorkshopSlot=-1;
var v116StatusSeq=0;
var v116PowerSeq=0;

function v116Set(id,text){
  var e=document.getElementById(id);
  if(e)e.textContent=text==null?'—':String(text);
}
function v116CurrentSlot(){
  var n=Number(window.currentSlot||0);
  return Number.isFinite(n)&&n>=0?Math.floor(n):0;
}
function v116Finite(value,fallback){
  var n=Number(value);
  return Number.isFinite(n)?n:fallback;
}
function v116Percent(value){
  return Math.max(0,Math.min(100,v116Finite(value,0)));
}
function v116SafeColor(value,fallback){
  var s=String(value||'').trim();
  if(/^[0-9a-fA-F]{6}$/.test(s)||/^[0-9a-fA-F]{8}$/.test(s))s='#'+s;
  if(/^#[0-9a-fA-F]{3}$/.test(s)||/^#[0-9a-fA-F]{4}$/.test(s)||/^#[0-9a-fA-F]{6}$/.test(s)||/^#[0-9a-fA-F]{8}$/.test(s))return s;
  return fallback||'#59636e';
}
function v116Post(path,data){
  var p=new URLSearchParams();
  Object.keys(data).forEach(function(k){p.append(k,data[k])});
  return fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){
      if(!r.ok)throw new Error(j.message||('HTTP '+r.status));
      return j;
    });
  });
}
function v116IsPaused(d){
  var s=String((d&&d.state)||'').toUpperCase();
  return s==='PAUSE'||s==='PAUSED';
}
function v116IsPrinting(d){
  var s=String((d&&d.state)||'').toUpperCase();
  return !!(d&&d.printing)||s==='RUNNING'||s==='PRINTING'||s==='PAUSE'||s==='PAUSED';
}
function v116StateLabel(d){
  if(!d.configured)return 'SETUP REQUIRED';
  if(!d.connected)return 'PRINTER OFFLINE';
  var s=String(d.state||'READY').toUpperCase();
  if(s==='FINISH'||s==='FINISHED')return 'PRINT COMPLETE';
  if(s==='IDLE')return 'READY';
  return s;
}
function v116JobLabel(d){
  if(!d.connected)return d.configured?'Printer unavailable':'Configure a printer';
  var s=String(d.state||'').toUpperCase();
  if(v116IsPrinting(d))return v116IsPaused(d)?'Print paused':'Print in progress';
  if(s==='FINISH'||s==='FINISHED')return 'Last print complete';
  return 'Ready for the next print';
}
function v116Feedback(text,bad){
  var e=document.getElementById('wk116Feedback');
  if(!e)return;
  e.textContent=text||'';
  e.style.color=bad?'var(--danger)':'var(--text-dim)';
}
function v116SetConnectionState(connected,configured,label){
  var chip=document.getElementById('wk116Connection');
  if(!chip)return;
  chip.className='wk116-live-chip '+(connected?'ok':(configured?'bad':'warn'));
  chip.textContent=label||(connected?'LOCAL · LIVE':(configured?'OFFLINE':'SETUP'));
}
function v116DisableControls(){
  var ids=['wkLightBtn','wk116PauseBtn','wk116PowerBtn'];
  ids.forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=true});
  v116PowerState.slot=-1;
  v116PowerState.available=false;
  v116PowerState.online=false;
  v116PowerState.busy=false;
}
function v116ClearChildren(node){
  while(node.firstChild)node.removeChild(node.firstChild);
}
function v116RenderTrays(ams){
  var deck=document.getElementById('wkTrays');
  if(!deck)return;
  var trays=Array.isArray(ams.trays)?ams.trays:[];
  v116ClearChildren(deck);
  if(!trays.length){
    var empty=document.createElement('div');
    empty.className='wk-empty';
    empty.textContent=ams.present?'AMS detected; waiting for material details.':'No AMS tray data reported.';
    deck.appendChild(empty);
    return;
  }
  trays.forEach(function(tr){
    tr=tr||{};
    var remain=v116Finite(tr.remain,-1);
    var slot=v116Finite(tr.slot,-1);
    var color=v116SafeColor(tr.color,'#59636e');
    var card=document.createElement('div');
    card.className='wk-tray'+(tr.active?' active':'');
    card.style.setProperty('--tray-color',color);

    var swatch=document.createElement('span');
    swatch.className='wk-tray-swatch';
    swatch.style.setProperty('--tray-color',color);
    swatch.setAttribute('aria-hidden','true');

    var copy=document.createElement('div');
    var small=document.createElement('small');
    small.textContent=(slot>=0?'A'+(slot+1):'A?')+(tr.active?' · ACTIVE':'');
    var strong=document.createElement('strong');
    strong.textContent=String(tr.type||'Filament');
    copy.appendChild(small);
    copy.appendChild(strong);

    var remaining=document.createElement('span');
    remaining.className='wk-remain';
    remaining.textContent=remain>=0?Math.max(0,Math.min(100,Math.round(remain)))+'%':'—';

    card.appendChild(swatch);
    card.appendChild(copy);
    card.appendChild(remaining);
    deck.appendChild(card);
  });
}
function v116RefreshPower(d,slot){
  var b=document.getElementById('wk116PowerBtn');
  if(!b)return;
  slot=slot==null?v116CurrentSlot():slot;
  var seq=++v116PowerSeq;
  fetch('/printer/power/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(p){
      if(!r.ok)throw new Error(p.message||('HTTP '+r.status));
      return p;
    });
  }).then(function(p){
    if(seq!==v116PowerSeq||slot!==v116CurrentSlot()||slot!==v116WorkshopSlot)return;
    v116PowerState.slot=slot;
    v116PowerState.available=!!p.available;
    v116PowerState.online=!!p.online;
    v116PowerState.on=!!p.on;
    v116PowerState.printing=v116IsPrinting(d);
    b.disabled=!p.available||!p.online||v116PowerState.busy;
    v116Set('wk116PowerLabel',!p.available?'Power not mapped':(p.on?'Power off':'Power on'));
    v116Set('wk116PowerHint',!p.available?'Map a smart plug in Power':(!p.online?'Plug offline':(p.on?'Printer outlet is on':'Printer outlet is off')));
  }).catch(function(){
    if(seq!==v116PowerSeq||slot!==v116CurrentSlot()||slot!==v116WorkshopSlot)return;
    v116PowerState.slot=-1;
    v116PowerState.available=false;
    v116PowerState.online=false;
    v116PowerState.busy=false;
    b.disabled=true;
    v116Set('wk116PowerLabel','Power unavailable');
    v116Set('wk116PowerHint','Could not read smart plug');
  });
}
function v103RefreshWorkshop(manual){
  var root=document.getElementById('sec-workshop');
  if(!root)return;
  var slot=v116CurrentSlot();
  var seq=++v116StatusSeq;
  if(slot!==v116WorkshopSlot){
    v103WorkshopData={};
    v116DisableControls();
    v116Set('wkUpdated','Syncing selected printer…');
    v116SetConnectionState(false,false,'SYNCING');
  }
  fetch('/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  }).then(function(d){
    if(seq!==v116StatusSeq||slot!==v116CurrentSlot())return;
    d=d||{};
    v116WorkshopSlot=slot;
    v103WorkshopData=d;
    var connected=!!d.connected;
    var p=v116Percent(d.progress);
    var paused=v116IsPaused(d);
    var printing=v116IsPrinting(d);

    v116Set('wkState',v116StateLabel(d));
    v116Set('wkUpdated','Updated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
    v116SetConnectionState(connected,!!d.configured);
    var dot=document.getElementById('wkDot');
    if(dot)dot.className=connected?'ok':(d.configured?'bad':'warn');

    v116Set('wkProgress',p+'%');
    v116Set('wkProgressSub',printing?(paused?'PAUSED':'CURRENT JOB'):'PRINTER STATUS');
    v116Set('wk116Job',v116JobLabel(d));
    var bar=document.getElementById('wk116ProgressBar');
    if(bar){
      bar.style.width=(printing||p?p:0)+'%';
      bar.parentElement.setAttribute('aria-valuenow',String(p));
      bar.parentElement.setAttribute('aria-valuetext',printing?(p+'% complete'):'No active print');
    }
    v116Set('wkRemaining',v103Minutes(d.remaining));
    var layer=v116Finite(d.layer,0),layers=v116Finite(d.layers,0);
    v116Set('wkLayer',Math.max(0,Math.round(layer))+' / '+Math.max(0,Math.round(layers)));
    var chamber=v116Finite(d.chamber,NaN);
    v116Set('wkChamber',Number.isFinite(chamber)?Math.round(chamber)+'°C':'—');
    v116Set('wk116Summary',connected?(printing?(paused?'Print paused — controls remain available locally.':'Printing now — material and controls are live below.'):'Printer ready — materials and local controls are available.'):(d.configured?'Printer is configured but currently offline.':'Configure your printer to unlock live Workshop controls.'));

    v116Set('wkLightState',d.lightState===1?'On':(d.lightState===0?'Off':'State unavailable'));
    v116Set('wk116LightLabel',d.lightState===1?'Light off':'Light on');
    var light=document.getElementById('wkLightBtn');
    if(light)light.disabled=!connected;

    var pause=document.getElementById('wk116PauseBtn');
    if(pause){
      pause.disabled=!connected||!printing;
      v116Set('wk116PauseLabel',paused?'Resume':'Pause');
      v116Set('wk116PauseHint',printing?(paused?'Continue print':'Pause safely'):'No active print');
    }

    var ams=d.ams||{};
    var trays=Array.isArray(ams.trays)?ams.trays:[];
    var active=null;
    for(var i=0;i<trays.length;i++)if(trays[i]&&trays[i].active){active=trays[i];break}
    if(!active&&ams.activeTray===254&&ams.externalPresent){
      active={type:ams.externalType||'External spool',remain:-1,color:ams.externalColor||'#8b949e',external:true};
    }
    var units=Math.max(0,Math.round(v116Finite(ams.units,0)));
    v116Set('wkAmsState',ams.present?(units+' AMS unit'+(units===1?'':'s')):(ams.externalPresent?'External spool':'No AMS'));
    var readyCount=trays.length;
    v116Set('wkLoadedEyebrow',active?'ACTIVE MATERIAL':(readyCount?'AMS READY':'MATERIAL STATUS'));
    v116Set('wkLoadedName',active?(active.type||'Loaded filament'):(readyCount?(readyCount+' material'+(readyCount===1?'':'s')+' ready'):'No material detected'));
    var activeSlot=v116Finite(active&&active.slot,-1);
    var activeRemain=v116Finite(active&&active.remain,-1);
    v116Set('wkLoadedDetail',active?(active.external?'External spool':((activeSlot>=0?'A'+(activeSlot+1):'AMS tray')+(activeRemain>=0?' · '+Math.max(0,Math.min(100,Math.round(activeRemain)))+'% remaining':''))):(readyCount?'AMS loaded · no tray currently feeding':'Printer has not reported material'));
    var spool=document.getElementById('wkLoadedSpool');
    if(spool)spool.style.setProperty('--spool-color',v116SafeColor(active&&active.color,'#59636e'));
    v116RenderTrays(ams);
    v116RefreshPower(d,slot);
    if(manual)v116Feedback('Workshop refreshed');
  }).catch(function(err){
    if(seq!==v116StatusSeq||slot!==v116CurrentSlot())return;
    v116WorkshopSlot=-1;
    v103WorkshopData={};
    v116DisableControls();
    v116Set('wkState','UNAVAILABLE');
    v116Set('wkUpdated','Device status could not be read');
    v116SetConnectionState(false,true);
    var dot=document.getElementById('wkDot');
    if(dot)dot.className='bad';
    v116Feedback(err.message||'Status unavailable',true);
  });
}
function v103ToggleWorkshopLight(){
  var slot=v116CurrentSlot();
  var d=v103WorkshopData||{},b=document.getElementById('wkLightBtn');
  if(v116WorkshopSlot!==slot||!d.connected||!b)return;
  b.disabled=true;
  v116Feedback(d.lightState===1?'Turning chamber light off…':'Turning chamber light on…');
  v116Post('/light/set',{slot:slot,mode:d.lightState===1?'off':'on'}).then(function(){
    if(slot!==v116CurrentSlot())return;
    v116Feedback('Light command sent');
    setTimeout(function(){if(slot===v116CurrentSlot())v103RefreshWorkshop(false)},500);
  }).catch(function(e){
    if(slot!==v116CurrentSlot())return;
    v116Feedback(e.message||'Light command failed',true);
    b.disabled=false;
  });
}
function v116PauseResume(){
  var slot=v116CurrentSlot();
  var d=v103WorkshopData||{},b=document.getElementById('wk116PauseBtn');
  if(v116WorkshopSlot!==slot||!d.connected||!v116IsPrinting(d)||!b)return;
  var cmd=v116IsPaused(d)?'resume':'pause';
  b.disabled=true;
  v116Feedback(cmd==='resume'?'Resuming print…':'Pausing print…');
  v116Post('/printer/control',{slot:slot,command:cmd}).then(function(){
    if(slot!==v116CurrentSlot())return;
    v116Feedback((cmd==='resume'?'Resume':'Pause')+' command sent');
    setTimeout(function(){if(slot===v116CurrentSlot())v103RefreshWorkshop(false)},650);
  }).catch(function(e){
    if(slot!==v116CurrentSlot())return;
    v116Feedback(e.message||'Printer command failed',true);
    b.disabled=false;
  });
}
function v116TogglePower(){
  var slot=v116CurrentSlot();
  var st=v116PowerState,b=document.getElementById('wk116PowerBtn');
  if(!b||st.slot!==slot||v116WorkshopSlot!==slot||!st.available||!st.online||st.busy)return;
  var desired=!st.on,token='';
  if(!desired){
    var msg=st.printing?'A print is active. Cutting power can damage the print. Power off anyway?':'Power off the mapped printer outlet?';
    if(!window.confirm(msg))return;
    token=st.printing?'POWER OFF DURING PRINT':'POWER OFF';
  }else if(!window.confirm('Power on the mapped printer outlet?'))return;
  st.busy=true;
  b.disabled=true;
  v116Feedback(desired?'Powering printer on…':'Powering printer off…');
  v116Post('/printer/power',{slot:slot,on:desired?1:0,confirm:token}).then(function(){
    if(slot!==v116CurrentSlot())return;
    v116Feedback(desired?'Printer power on command complete':'Printer power off command complete');
    st.busy=false;
    setTimeout(function(){if(slot===v116CurrentSlot())v103RefreshWorkshop(false)},700);
  }).catch(function(e){
    if(slot!==v116CurrentSlot())return;
    st.busy=false;
    b.disabled=false;
    v116Feedback(e.message||'Power command failed',true);
  });
}
