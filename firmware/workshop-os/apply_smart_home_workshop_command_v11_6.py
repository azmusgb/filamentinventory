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
def between(text,start,end,replacement,label):
    a=text.find(start);b=text.find(end,a+len(start))
    if a<0 or b<0: raise PatchError(f'{label}: boundary missing')
    return text[:a]+replacement+text[b:]

def patch(root:Path):
    rel='include/smart_home_build.h';t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v11.5"','#define SMART_HOME_VERSION "v11.6"','version')
    t=once(t,'#define SMART_HOME_PROFILE "printer-power"','#define SMART_HOME_PROFILE "workshop-command-center"','profile')
    t=once(t,'Smart Home v11.5 Printer Power RC1','Smart Home v11.6 Workshop Command Center RC1','label');save(root,rel,t)

    rel='include/web_pages.h';t=load(root,rel)
    start='<!-- ===== Workshop workspace ===== -->';end='<!-- ===== Section 1: Printer ===== -->'
    t=between(t,start,end,asset('v11_6_workshop.html'), 'workshop markup');save(root,rel,t)

    rel='web/app.css';t=load(root,rel)
    if 'Smart Home v11.6 Workshop Command Center' in t: raise PatchError('v11.6 CSS already present')
    save(root,rel,t+'\n'+asset('v11_6_workshop.css'))

    rel='web/app.js';t=load(root,rel)
    if 'Smart Home v11.6 Workshop Command Center' in t: raise PatchError('v11.6 JS already present')
    save(root,rel,t+'\n'+asset('v11_6_workshop.js'))

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.6"','workshop-command-center'],
      'include/web_pages.h':['class="section wk116"','wk116-control-strip','wk116-dock','wk116PowerBtn'],
      'web/app.css':['Smart Home v11.6 Workshop Command Center','.wk116-grid','.wk116-control-strip'],
      'web/app.js':[
        'v116PauseResume','v116TogglePower','v116RenderTrays',
        "v116Post('/printer/control'", "v116Post('/printer/power'",
        'v116WorkshopSlot','v116StatusSeq','v116PowerSeq','v116PowerState.slot',
        "v116SetConnectionState(false,false,'SYNCING')",
        'slot!==v116CurrentSlot()','v116WorkshopSlot!==slot'
      ],
    }
    for rel,needles in checks.items():
      body=load(root,rel)
      for n in needles:
        if n not in body: raise PatchError(f'{rel}: missing {n}')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    patch(Path(a.repo).resolve());print('Smart Home v11.6 Workshop Command Center applied');return 0
if __name__=='__main__': raise SystemExit(main())
