/* Smart Home v11.7 Live State Integrity */
var v116LastStatusAt=0;
var v117PollTimer=null;
var v117WatchdogTimer=null;
var v117Polling=false;
var v117CommandBusy={light:false,pause:false};
var V117_STALE_MS=10000;

function v117WorkshopVisible(){
  var root=document.getElementById('sec-workshop');
  return !!root&&!root.hidden&&document.visibilityState!=='hidden';
}
function v117DisableUiOnly(){
  ['wkLightBtn','wk116PauseBtn','wk116PowerBtn'].forEach(function(id){
    var b=document.getElementById(id);
    if(b)b.disabled=true;
  });
}
function v117StateFresh(slot){
  slot=slot==null?v116CurrentSlot():slot;
  return slot===v116CurrentSlot()&&slot===v116WorkshopSlot&&v116LastStatusAt>0&&(Date.now()-v116LastStatusAt)<=V117_STALE_MS;
}
function v117FetchJson(url,timeoutMs){
  timeoutMs=Math.max(1000,Number(timeoutMs)||3500);
  var controller=typeof AbortController!=='undefined'?new AbortController():null;
  var options={cache:'no-store'};
  if(controller)options.signal=controller.signal;
  var timer=null;
  var timeout=new Promise(function(resolve,reject){
    timer=setTimeout(function(){
      if(controller){try{controller.abort()}catch(e){}}
      var err=new Error('Local device response timed out');
      err.name='TimeoutError';
      reject(err);
    },timeoutMs);
  });
  var request=fetch(url,options).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){
      if(!r.ok)throw new Error(j.message||('HTTP '+r.status));
      return j;
    });
  });
  return Promise.race([request,timeout]).then(function(value){
    if(timer)clearTimeout(timer);
    return value;
  },function(err){
    if(timer)clearTimeout(timer);
    if(err&&err.name==='AbortError')throw new Error('Local device response timed out');
    throw err;
  });
}
function v117MarkFresh(slot){
  if(slot!==v116CurrentSlot()||slot!==v116WorkshopSlot)return;
  v116LastStatusAt=Date.now();
  var root=document.getElementById('sec-workshop');
  if(root)root.classList.remove('is-stale');
}
function v117MarkStale(reason){
  var root=document.getElementById('sec-workshop');
  if(!root||root.hidden)return;
  v117DisableUiOnly();
  root.classList.add('is-stale');
  v116SetConnectionState(false,false,'STALE');
  v116Set('wkUpdated',reason||'Live state expired — refreshing…');
}
function v117WatchFreshness(){
  if(!v117WorkshopVisible())return;
  if(!v117StateFresh(v116CurrentSlot()))v117MarkStale('Live state expired — refreshing…');
}
function v117PollDelay(){
  var d=v103WorkshopData||{};
  return v116IsPrinting(d)?2500:6000;
}
function v117SchedulePoll(delay){
  if(v117PollTimer)clearTimeout(v117PollTimer);
  if(!v117Polling)return;
  v117PollTimer=setTimeout(v117PollNow,Math.max(250,Number(delay)||v117PollDelay()));
}
function v117PollNow(){
  if(!v117Polling||!v117WorkshopVisible())return;
  var result;
  try{result=v103RefreshWorkshop(false)}catch(e){v117MarkStale(e&&e.message?e.message:'Status refresh failed');v117SchedulePoll(1500);return}
  Promise.resolve(result).then(function(){
    if(v117Polling&&v117WorkshopVisible())v117SchedulePoll(v117PollDelay());
  },function(){
    if(v117Polling&&v117WorkshopVisible())v117SchedulePoll(1500);
  });
}
function v117StopWorkshopPolling(){
  v117Polling=false;
  if(v117PollTimer){clearTimeout(v117PollTimer);v117PollTimer=null}
  if(v117WatchdogTimer){clearInterval(v117WatchdogTimer);v117WatchdogTimer=null}
  if(window.v103WorkshopTimer){clearInterval(window.v103WorkshopTimer);window.v103WorkshopTimer=null}
}
function v117StartWorkshopPolling(){
  v117StopWorkshopPolling();
  v117Polling=true;
  if(!v117WorkshopVisible())return;
  if(!v117StateFresh(v116CurrentSlot())){
    v117DisableUiOnly();
    v116SetConnectionState(false,false,'SYNCING');
    v116Set('wkUpdated','Refreshing selected printer…');
  }
  v117WatchdogTimer=setInterval(v117WatchFreshness,1000);
  v117PollNow();
}
function v117HandleVisibility(){
  if(document.visibilityState==='hidden'){
    v117StopWorkshopPolling();
    return;
  }
  var root=document.getElementById('sec-workshop');
  if(root&&!root.hidden)v117StartWorkshopPolling();
}
document.addEventListener('visibilitychange',v117HandleVisibility);
setTimeout(function(){if(v117WorkshopVisible())v117StartWorkshopPolling()},0);
