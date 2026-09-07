#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, zlib
from pathlib import Path

class PatchError(RuntimeError):
    pass

def once(text: str, old: str, new: str, label: str) -> str:
    n=text.count(old)
    if n!=1: raise PatchError(f"{label}: expected 1 match, found {n}")
    return text.replace(old,new,1)

def payload(name: str) -> str:
    p=Path(__file__).resolve().parent/'.bambuhelper-validation'/name
    return zlib.decompress(base64.b64decode(p.read_text().strip())).decode()

def replace_region(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a=text.find(start)
    if a<0: raise PatchError(f"{label}: start anchor not found")
    b=text.find(end,a+len(start))
    if b<0: raise PatchError(f"{label}: end anchor not found")
    return text[:a]+replacement+text[b:]

def patch_hub(repo: Path) -> None:
    p=repo/'src'/'smart_hub.cpp'; t=p.read_text()
    t=replace_region(t,'static void drawHeader(const char* title, const char* right, uint8_t page) {','\n\n} // namespace\n\nvoid smartHubInit() {',payload('v99-hub.zlib.b64'),'v99 display experience region')
    p.write_text(t)

def patch_build(repo: Path) -> None:
    p=repo/'include'/'smart_home_build.h'; t=p.read_text()
    t=once(t,'#define SMART_HOME_VERSION "v9.8"','#define SMART_HOME_VERSION "v9.9"','version')
    t=once(t,'#define SMART_HOME_PROFILE "unified-responsive-display"','#define SMART_HOME_PROFILE "display-experience"','profile')
    t=once(t,'#define SMART_HOME_BUILD_LABEL "Smart Home v9.8 Unified Display RC1"','#define SMART_HOME_BUILD_LABEL "Smart Home v9.9 Display Experience RC1"','build label')
    p.write_text(t)

def patch_web(repo: Path) -> None:
    p=repo/'web'/'app.js'; t=p.read_text()
    if 'Smart Home v9.9 Display Experience — physical/browser parity polish.' not in t:
        t += payload('v99-webjs.zlib.b64')
    p.write_text(t)
    p=repo/'web'/'app.css'; t=p.read_text()
    if 'Smart Home v9.9 Display Experience — physical/browser parity polish.' not in t:
        t += payload('v99-webcss.zlib.b64')
    p.write_text(t)

def verify(repo: Path) -> None:
    hub=(repo/'src'/'smart_hub.cpp').read_text(); app=(repo/'web'/'app.js').read_text(); css=(repo/'web'/'app.css').read_text(); build=(repo/'include'/'smart_home_build.h').read_text()
    for n in ['uiPageAccent','uiClockText','uiMaterialSlot','uiHomeStatusStrip','ALL SYSTEMS NORMAL','FIRMWARE & RECOVERY','DASHBOARD']:
        if n not in hub: raise PatchError('missing v9.9 hub invariant: '+n)
    for n in ['v99ScreenBody','v99Materials','v99StatusStrip','v99System']:
        if n not in app: raise PatchError('missing v9.9 browser invariant: '+n)
    for n in ['.v99-hero','.v99-materials','.v99-health','.landscape.page-system .v99-health']:
        if n not in css: raise PatchError('missing v9.9 css invariant: '+n)
    if 'Smart Home v9.9 Display Experience RC1' not in build: raise PatchError('v9.9 build identity missing')
    if 'return false;' not in hub[hub.find('bool smartHubShouldYieldToPrinter'):hub.find('void smartHubEnter',hub.find('bool smartHubShouldYieldToPrinter'))]: raise PatchError('native printer live surface contract lost')

def apply(repo: Path) -> None:
    patch_hub(repo); patch_build(repo); patch_web(repo); verify(repo)

def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument('--repo',default='.'); ap.add_argument('--apply',action='store_true'); args=ap.parse_args()
    if not args.apply:
        print('Smart Home v9.9 Display Experience patch ready. Use --apply.'); return 0
    apply(Path(args.repo).resolve()); print('Smart Home v9.9 Display Experience applied'); return 0

if __name__=='__main__': raise SystemExit(main())
