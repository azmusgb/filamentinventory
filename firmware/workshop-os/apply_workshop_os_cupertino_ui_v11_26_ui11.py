#!/usr/bin/env python3
"""Apply finished Workshop OS v11.26 UI11 presentation after validated RC10."""
from __future__ import annotations
import argparse
from pathlib import Path
from apply_workshop_os_cupertino_ui_v11_25_rc10 import load, once, replace_block, PatchError

def sections(root: Path):
    vals={}; d=root/'firmware'/'ui-v11.26-ui11'
    for p in d.glob('*.cppfrag'):
        text=load(p)
        for line in text.splitlines():
            if line.startswith('@@') and line.endswith('@@') and not line.startswith('@@END_'):
                name=line[2:-2]; end=f'@@END_{name}@@'
                if end not in text: raise PatchError(f'{p.name}: missing {end}')
                vals[name]=text.split(line,1)[1].split(end,1)[0].strip('\n')
    required={'FINGERPRINT_HELPERS','CARD','MODE_TABS','ACTION','TELEMETRY','AMS_SLOT','HEADER','BOTTOM_NAV','HOME','PRINTER'}
    missing=required-set(vals)
    if missing: raise PatchError(f'missing UI11 fragments: {sorted(missing)}')
    return vals

def patch(repo: Path):
    root=Path(__file__).resolve().parent; f=sections(root)
    bp=repo/'include'/'smart_home_build.h'; b=load(bp)
    b=once(b,'#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC10 Cupertino UI"','#define SMART_HOME_BUILD_LABEL "Workshop OS v11.26 UI11 Cupertino"','UI11 build label')
    b=once(b,'#define SMART_HOME_PROFILE "cupertino-ui"','#define SMART_HOME_PROFILE "cupertino-ui11"','UI11 profile')
    b=once(b,'#define WORKSHOP_OS_UI_SCHEMA "UI10"','#define WORKSHOP_OS_UI_SCHEMA "UI11"','UI11 schema')
    if 'WORKSHOP_OS_V11_26_UI11' not in b: b+='\n#define WORKSHOP_OS_V11_26_UI11 1\n'
    bp.write_text(b,encoding='utf-8')
    hp=repo/'src'/'smart_hub.cpp'; h=load(hp)
    for sig,key in (("static const char* hubV1125UiFingerprint(uint8_t page)",'FINGERPRINT_HELPERS'),('static void hubV1125Card(','CARD'),('static void hubV1125ModeTabs() {','MODE_TABS'),('static void hubV1125Action(','ACTION'),('static void hubV1125TelemetryColumn(','TELEMETRY'),('static void hubV1125AmsSlot(','AMS_SLOT'),('static void drawHeader(','HEADER'),('static void uiBottomNav(','BOTTOM_NAV'),('static void drawHome(bool full) {','HOME'),('static void drawPrinter(bool full) {','PRINTER')): h=replace_block(h,sig,f[key],key)
    for marker in ('UI11-H','UI11-P','UI11-W','UI11-M','UI11-S','AMS telemetry - inventory identity remains explicit','Hold to Stop','securityPortalCode()'):
        if marker not in h: raise PatchError(f'missing UI11/inherited marker: {marker}')
    for anchor in ('static int16_t hubHeaderH() { return 36; }','static int16_t hubNavH() { return 54; }','static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;','Keep Holding','Hold to Apply'):
        if anchor not in h: raise PatchError(f'lost interaction anchor: {anchor}')
    if 'TEST / NO CODE' in h: raise PatchError('insecure no-code copy present')
    for bad in ('matchSpoolByColor','matchSpoolByMaterial','resolveSpool'):
        if bad in h: raise PatchError(f'forbidden inventory inference: {bad}')
    hp.write_text(h,encoding='utf-8'); print('Workshop OS v11.26 UI11 Cupertino applied')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    if not a.apply: raise SystemExit('refusing to modify source without --apply')
    patch(Path(a.repo).resolve())
if __name__=='__main__': main()
