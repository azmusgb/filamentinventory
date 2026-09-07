#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path

class PatchError(RuntimeError):
    pass

def once(text: str, old: str, new: str, label: str) -> str:
    n=text.count(old)
    if n!=1:
        raise PatchError(f'{label}: expected 1 match, found {n}')
    return text.replace(old,new,1)

def asset(name: str) -> str:
    return (Path(__file__).resolve().parent/'assets'/name).read_text(encoding='utf-8')

def patch_build(repo: Path):
    p=repo/'include'/'smart_home_build.h'; t=p.read_text(encoding='utf-8')
    t=once(t,'#define SMART_HOME_VERSION "v10.3.1"','#define SMART_HOME_VERSION "v10.4"','version')
    t=once(t,'#define SMART_HOME_PROFILE "workshop-os-browser-screen-retention"','#define SMART_HOME_PROFILE "workshop-os-portal-ux"','profile')
    t=once(t,'#define SMART_HOME_BUILD_LABEL "Smart Home v10.3.1 Browser Workshop OS RC2"','#define SMART_HOME_BUILD_LABEL "Smart Home v10.4 Portal UX RC1"','label')
    p.write_text(t,encoding='utf-8')

def patch_web(repo: Path):
    js=repo/'web'/'app.js'; t=js.read_text(encoding='utf-8')
    marker='/* Smart Home v10.4 Portal UX */'
    if marker not in t:
        t += asset('v10_4_portal.js')
    js.write_text(t,encoding='utf-8')
    css=repo/'web'/'app.css'; c=css.read_text(encoding='utf-8')
    if marker not in c:
        c += asset('v10_4_portal.css')
    css.write_text(c,encoding='utf-8')

def verify(repo: Path):
    build=(repo/'include'/'smart_home_build.h').read_text(encoding='utf-8')
    js=(repo/'web'/'app.js').read_text(encoding='utf-8')
    css=(repo/'web'/'app.css').read_text(encoding='utf-8')
    main=(repo/'src'/'main.cpp').read_text(encoding='utf-8')
    hub=(repo/'src'/'smart_hub.cpp').read_text(encoding='utf-8')
    web=(repo/'src'/'web_server.cpp').read_text(encoding='utf-8')
    board=(repo/'boards'/'ws_lcd_350.ini').read_text(encoding='utf-8')
    def need(body,needle,label):
        if needle not in body: raise PatchError(f'missing {label}: {needle}')
    need(build,'#define SMART_HOME_VERSION "v10.4"','v10.4 version')
    need(build,'Smart Home v10.4 Portal UX RC1','v10.4 build label')
    for n in ['v104EnsureTopHealth','v104BuildSlotSwitcher','v104BuildSupportPanel','v104EnsurePrinterWorkspace','v104RefreshTopHealth','Advanced gauge configuration','Support &amp; advanced']:
        need(js,n,'portal UX')
    for n in ['.v104-top-health','.v104-slot-switcher','.v104-support-card','.v104-legacy-details','.v104-backend-slot','.v104-moved-action']:
        need(css,n,'portal CSS')
    need(main,'Smart Home v10.3.1 screen-retention contract.','Smart Home route ownership')
    need(main,'if (!smartHubShouldYieldToPrinter(printing))','Smart Home route guard')
    need(hub,'bool smartHubShouldYieldToPrinter(bool printing)','native Smart Home printer routing')
    need(web,'handleAudioMicTest','browser microphone diagnostic')
    for n in ['BOARD_HAS_ES8311_AUDIO=1','BOARD_HAS_MICROPHONE=1','AUDIO_I2S_DIN=14']:
        need(board,n,'WS350 audio hardware')

def apply(repo: Path):
    patch_build(repo); patch_web(repo); verify(repo)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--repo',default='.'); ap.add_argument('--apply',action='store_true'); args=ap.parse_args()
    repo=Path(args.repo).resolve()
    if not args.apply:
        print('Smart Home v10.4 Portal UX patch ready. Use --apply.')
        return 0
    apply(repo); print('Smart Home v10.4 Portal UX applied'); return 0

if __name__=='__main__':
    raise SystemExit(main())
