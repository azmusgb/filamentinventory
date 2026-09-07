#!/usr/bin/env python3
from pathlib import Path
import argparse

class PatchError(RuntimeError): pass
HERE=Path(__file__).resolve().parent

def load(root,rel):
    p=root/rel
    if not p.exists(): raise PatchError(f'missing {rel}')
    return p.read_text()
def save(root,rel,text): (root/rel).write_text(text)
def asset(name):
    p=HERE/'assets'/name
    if not p.exists(): raise PatchError(f'missing asset {name}')
    return p.read_text()
def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise PatchError(f'{label}: expected one anchor, found {n}')
    return text.replace(old,new,1)

def patch(root:Path):
    rel='include/smart_home_build.h';t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v11.6"','#define SMART_HOME_VERSION "v11.7"','version')
    t=once(t,'#define SMART_HOME_PROFILE "workshop-command-center"','#define SMART_HOME_PROFILE "workshop-live-state"','profile')
    t=once(t,'Smart Home v11.6 Workshop Command Center RC1','Smart Home v11.7 Live State Integrity RC1','label')
    save(root,rel,t)

    rel='web/app.js';t=load(root,rel)
    old="""  if (ccTimer && id !== 'home') { clearInterval(ccTimer); ccTimer = null; }
  if (window.v103WorkshopTimer && id !== 'workshop') { clearInterval(window.v103WorkshopTimer); window.v103WorkshopTimer = null; }
  if (id === 'home') { refreshCommandCenter(false); if (ccTimer) clearInterval(ccTimer); ccTimer = setInterval(function(){ refreshCommandCenter(false); }, 5000); }
  if (id === 'workshop') { v103RefreshWorkshop(false); if (window.v103WorkshopTimer) clearInterval(window.v103WorkshopTimer); window.v103WorkshopTimer=setInterval(function(){v103RefreshWorkshop(false)},4000); }
}"""
    new="""  if (ccTimer && id !== 'home') { clearInterval(ccTimer); ccTimer = null; }
  if (id !== 'workshop' && typeof v117StopWorkshopPolling === 'function') v117StopWorkshopPolling();
  if (id === 'home') { refreshCommandCenter(false); if (ccTimer) clearInterval(ccTimer); ccTimer = setInterval(function(){ refreshCommandCenter(false); }, 5000); }
  if (id === 'workshop' && typeof v117StartWorkshopPolling === 'function') v117StartWorkshopPolling();
}"""
    t=once(t,old,new,'Workshop poll lifecycle')

    old="""  fetch('/printer/power/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(p){
      if(!r.ok)throw new Error(p.message||('HTTP '+r.status));
      return p;
    });
  }).then(function(p){"""
    new="""  return v117FetchJson('/printer/power/status?slot='+slot+'&_='+Date.now(),3000).then(function(p){"""
    t=once(t,old,new,'power status timeout')

    old="""  fetch('/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  }).then(function(d){"""
    new="""  return v117FetchJson('/status?slot='+slot+'&_='+Date.now(),3500).then(function(d){"""
    t=once(t,old,new,'Workshop status timeout')

    t=once(t,'    v116WorkshopSlot=slot;\n    v103WorkshopData=d;','    v116WorkshopSlot=slot;\n    v103WorkshopData=d;\n    v117MarkFresh(slot);','freshness mark')
    t=once(t,"    v116Feedback(err.message||'Status unavailable',true);\n  });\n}","    v116Feedback(err.message||'Status unavailable',true);\n    v117MarkStale(err.message||'Status unavailable');\n  });\n}",'stale mark')

    t=once(t,'    if(light)light.disabled=!connected;','    if(light)light.disabled=!connected||v117CommandBusy.light||!v117StateFresh(slot);','light refresh lock')
    t=once(t,'      pause.disabled=!connected||!printing;','      pause.disabled=!connected||!printing||v117CommandBusy.pause||!v117StateFresh(slot);','pause refresh lock')
    t=once(t,'    b.disabled=!p.available||!p.online||v116PowerState.busy;','    b.disabled=!p.available||!p.online||v116PowerState.busy||!v117StateFresh(slot);','power refresh lock')

    t=once(t,'  if(v116WorkshopSlot!==slot||!d.connected||!b)return;\n  b.disabled=true;','  if(v116WorkshopSlot!==slot||!d.connected||!b||!v117StateFresh(slot)||v117CommandBusy.light)return;\n  v117CommandBusy.light=true;\n  b.disabled=true;','light command guard')
    t=once(t,"  v116Post('/light/set',{slot:slot,mode:d.lightState===1?'off':'on'}).then(function(){\n    if(slot!==v116CurrentSlot())return;","  v116Post('/light/set',{slot:slot,mode:d.lightState===1?'off':'on'}).then(function(){\n    v117CommandBusy.light=false;\n    if(slot!==v116CurrentSlot())return;",'light success unlock')
    t=once(t,"  }).catch(function(e){\n    if(slot!==v116CurrentSlot())return;\n    v116Feedback(e.message||'Light command failed',true);","  }).catch(function(e){\n    v117CommandBusy.light=false;\n    if(slot!==v116CurrentSlot())return;\n    v116Feedback(e.message||'Light command failed',true);",'light failure unlock')

    t=once(t,'  if(v116WorkshopSlot!==slot||!d.connected||!v116IsPrinting(d)||!b)return;','  if(v116WorkshopSlot!==slot||!d.connected||!v116IsPrinting(d)||!b||!v117StateFresh(slot)||v117CommandBusy.pause)return;','pause command guard')
    t=once(t,"  var cmd=v116IsPaused(d)?'resume':'pause';\n  b.disabled=true;","  var cmd=v116IsPaused(d)?'resume':'pause';\n  v117CommandBusy.pause=true;\n  b.disabled=true;",'pause busy')
    t=once(t,"  v116Post('/printer/control',{slot:slot,command:cmd}).then(function(){\n    if(slot!==v116CurrentSlot())return;","  v116Post('/printer/control',{slot:slot,command:cmd}).then(function(){\n    v117CommandBusy.pause=false;\n    if(slot!==v116CurrentSlot())return;",'pause success unlock')
    t=once(t,"  }).catch(function(e){\n    if(slot!==v116CurrentSlot())return;\n    v116Feedback(e.message||'Printer command failed',true);","  }).catch(function(e){\n    v117CommandBusy.pause=false;\n    if(slot!==v116CurrentSlot())return;\n    v116Feedback(e.message||'Printer command failed',true);",'pause failure unlock')

    t=once(t,'  if(!b||st.slot!==slot||v116WorkshopSlot!==slot||!st.available||!st.online||st.busy)return;','  if(!b||st.slot!==slot||v116WorkshopSlot!==slot||!st.available||!st.online||st.busy||!v117StateFresh(slot))return;','power freshness guard')

    if 'Smart Home v11.7 Live State Integrity' in t: raise PatchError('v11.7 JS already present')
    t=t+'\n'+asset('v11_7_live_state.js')
    save(root,rel,t)

    rel='web/app.css';t=load(root,rel)
    if 'Smart Home v11.7 Live State Integrity' in t: raise PatchError('v11.7 CSS already present')
    save(root,rel,t+'\n'+asset('v11_7_live_state.css'))

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.7"','workshop-live-state','Smart Home v11.7 Live State Integrity RC1'],
      'web/app.js':['v117FetchJson','V117_STALE_MS=10000','v117StartWorkshopPolling','v117StopWorkshopPolling','visibilitychange','v117StateFresh','v117CommandBusy.light','v117CommandBusy.pause',"return v117FetchJson('/status?slot='","return v117FetchJson('/printer/power/status?slot="],
      'web/app.css':['Smart Home v11.7 Live State Integrity','.wk116.is-stale'],
    }
    for rel,needles in checks.items():
      body=load(root,rel)
      for n in needles:
        if n not in body: raise PatchError(f'{rel}: missing {n}')
    if 'window.v103WorkshopTimer=setInterval(function(){v103RefreshWorkshop(false)},4000)' in load(root,'web/app.js'):
      raise PatchError('legacy fixed Workshop interval still present')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    patch(Path(a.repo).resolve());print('Smart Home v11.7 Live State Integrity applied');return 0
if __name__=='__main__': raise SystemExit(main())
