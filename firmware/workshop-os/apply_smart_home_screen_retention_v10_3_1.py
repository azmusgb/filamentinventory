#!/usr/bin/env python3
from pathlib import Path
import argparse

class PatchError(RuntimeError):
    pass

def load(root: Path, rel: str) -> str:
    p=root/rel
    if not p.exists(): raise PatchError(f'missing {rel}')
    return p.read_text()

def save(root: Path, rel: str, text: str) -> None:
    (root/rel).write_text(text)

def once(text: str, old: str, new: str, label: str) -> str:
    n=text.count(old)
    if n!=1: raise PatchError(f'{label}: expected one anchor, found {n}')
    return text.replace(old,new,1)

def apply(root: Path) -> None:
    # Release identity.
    rel='include/smart_home_build.h'; t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v10.3"','#define SMART_HOME_VERSION "v10.3.1"','version')
    t=once(t,'#define SMART_HOME_PROFILE "workshop-os-browser"','#define SMART_HOME_PROFILE "workshop-os-browser-screen-retention"','profile')
    t=once(t,'#define SMART_HOME_BUILD_LABEL "Smart Home v10.3 Browser Workshop OS RC1"','#define SMART_HOME_BUILD_LABEL "Smart Home v10.3.1 Browser Workshop OS RC2"','label')
    save(root,rel,t)

    # Critical physical-screen routing fix. The upstream printer state machine
    # must not steal a Smart Home page merely because printer credentials become
    # valid. Smart Home owns Home / Printer / Workshop / More / Custom / System;
    # the explicit Classic Printer action is the escape hatch to legacy screens.
    rel='src/main.cpp'; t=load(root,rel)
    if '#include "smart_hub.h"' not in t:
        t=once(t,'#include "display_edge_glow.h"\n','#include "display_edge_glow.h"\n#include "smart_hub.h"\n','smart hub include')
    anchor='''  // Default activity for early-return paths (no printer / OTA / disconnected).\n  // handleDisplayedPrinterConnectedState() overrides for live-state branches.\n  ledSetActivity(LED_ACT_IDLE);\n'''
    guard='''  // Smart Home v10.3.1 screen-retention contract.\n  // Saving a Bambu access code changes printer configuration state, but it must\n  // never collapse the Workshop OS back to the upstream legacy screen machine.\n  // OTA remains allowed to preempt; all normal printer state is rendered by the\n  // native Smart Home pages until the user explicitly chooses Classic Printer.\n  if (smartHubIsScreen(current)) {\n    if (isOtaAutoInProgress()) {\n      if (current != SCREEN_OTA_UPDATE) setScreenState(SCREEN_OTA_UPDATE);\n      return;\n    }\n    const bool printing = isAnyPrinterConfigured() && anyPrinterPrinting();\n    if (!smartHubShouldYieldToPrinter(printing)) {\n      if (isAnyPrinterConfigured()) {\n        const BambuState& hs = displayedPrinter().state;\n        if (hs.printing)\n          ledSetActivity(hs.gcodeStateId == GCODE_PAUSE ? LED_ACT_PAUSED : LED_ACT_PRINTING);\n        else if (hs.gcodeStateId == GCODE_FINISH)\n          ledSetActivity(LED_ACT_FINISHED);\n        else if (hs.gcodeStateId == GCODE_FAILED)\n          ledSetActivity(LED_ACT_FAILED);\n        else\n          ledSetActivity(LED_ACT_IDLE);\n      }\n      return;\n    }\n  }\n'''
    if 'Smart Home v10.3.1 screen-retention contract.' not in t:
        t=once(t,anchor,anchor+'\n'+guard,'screen retention guard')
    save(root,rel,t)

    # Browser router must treat Workshop and Advanced as first-class persistent
    # destinations so a saved hash/last-page cannot silently fall back to Home.
    rel='web/app.js'; t=load(root,rel)
    t=once(t,"var SECTIONS = ['home','printer','display','hardware','wifi','power','diag'];","var SECTIONS = ['home','printer','workshop','display','hardware','wifi','power','diag','advanced'];",'browser section registry')
    save(root,rel,t)

    # Verification.
    main=load(root,'src/main.cpp'); app=load(root,'web/app.js'); build=load(root,'include/smart_home_build.h'); hub=load(root,'src/smart_hub.cpp')
    for n in ['Smart Home v10.3.1 screen-retention contract.','smartHubIsScreen(current)','smartHubShouldYieldToPrinter(printing)','SCREEN_OTA_UPDATE']:
        if n not in main: raise PatchError(f'main retention missing {n}')
    for n in ["'workshop'","'advanced'"]:
        if n not in app: raise PatchError(f'browser registry missing {n}')
    if '#define SMART_HOME_VERSION "v10.3.1"' not in build: raise PatchError('v10.3.1 identity missing')
    if 'return false;' not in hub or 'native Smart Home Printer is the normal live-print surface' not in hub:
        raise PatchError('v9.8 Smart Home route-ownership contract missing')

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--repo',required=True); ap.add_argument('--apply',action='store_true'); a=ap.parse_args()
    apply(Path(a.repo).resolve()); print('Smart Home v10.3.1 screen retention applied')
