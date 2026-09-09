#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC10 Cupertino UI after RC9."""
from __future__ import annotations
import argparse
from pathlib import Path
from apply_workshop_os_printer_credentials_v11_25_rc11 import patch as patch_printer_credentials

class PatchError(RuntimeError): pass

def load(path: Path) -> str:
    if not path.exists(): raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")

def once(text, old, new, label):
    count=text.count(old)
    if count != 1: raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old,new,1)

def block_end(text,start):
    i=text.find("{",start)
    if i<0: raise PatchError("opening brace missing")
    depth=0; string=None; escape=False; line_comment=False; block_comment=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ""
        if line_comment:
            if c=="\n": line_comment=False
        elif block_comment:
            if c=="*" and n=="/": block_comment=False; i+=1
        elif string:
            if escape: escape=False
            elif c=="\\": escape=True
            elif c==string: string=None
        elif c=="/" and n=="/": line_comment=True; i+=1
        elif c=="/" and n=="*": block_comment=True; i+=1
        elif c in ('"',"'"): string=c
        elif c=="{": depth+=1
        elif c=="}":
            depth-=1
            if depth==0: return i+1
        i+=1
    raise PatchError("unterminated block")

def replace_block(text,signature,replacement,label):
    start=text.find(signature)
    if start<0 or text.find(signature,start+1)>=0: raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start]+replacement.rstrip()+text[block_end(text,start):]

def sections(source_root):
    values={}; fragment_dir=source_root/"firmware"/"ui-v11.25-rc10"
    for path in fragment_dir.glob("*.cppfrag"):
        text=load(path)
        for line in text.splitlines():
            if line.startswith("@@") and line.endswith("@@") and not line.startswith("@@END_"):
                name=line[2:-2]; end=f"@@END_{name}@@"
                if end not in text: raise PatchError(f"{path.name}: missing {end}")
                values[name]=text.split(line,1)[1].split(end,1)[0].strip("\n")
    required={"FINGERPRINT_HELPERS","CARD","MODE_TABS","ACTION","TELEMETRY","AMS_SLOT","HEADER","BOTTOM_NAV","HOME","PRINTER","WORKSHOP","MORE","SYSTEM"}
    missing=required-set(values)
    if missing: raise PatchError(f"missing RC10 fragments: {sorted(missing)}")
    return values

def patch(repo: Path):
    source_root=Path(__file__).resolve().parent; f=sections(source_root)
    build_path=repo/"include"/"smart_home_build.h"; build=load(build_path)
    build=once(build,'#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC9 Premium Appliance UI"','#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC10 Cupertino UI"',"RC10 build label")
    build=once(build,'#define SMART_HOME_PROFILE "premium-appliance-ui"','#define SMART_HOME_PROFILE "cupertino-ui"',"RC10 profile")
    build=once(build,'#define WORKSHOP_OS_UI_SCHEMA "UI9"','#define WORKSHOP_OS_UI_SCHEMA "UI10"',"RC10 UI schema")
    if "WORKSHOP_OS_V11_25_UI_RC10" not in build: build+='\n#define WORKSHOP_OS_V11_25_UI_RC10 1\n'
    build_path.write_text(build,encoding="utf-8")
    hub_path=repo/"src"/"smart_hub.cpp"; hub=load(hub_path)
    for signature,key in (("static const char* hubV1125UiFingerprint(uint8_t page)","FINGERPRINT_HELPERS"),("static void hubV1125Card(","CARD"),("static void hubV1125ModeTabs() {","MODE_TABS"),("static void hubV1125Action(","ACTION"),("static void hubV1125TelemetryColumn(","TELEMETRY"),("static void hubV1125AmsSlot(","AMS_SLOT"),("static void drawHeader(","HEADER"),("static void uiBottomNav(","BOTTOM_NAV"),("static void drawHome(bool full) {","HOME"),("static void drawPrinter(bool full) {","PRINTER"),("static void drawWorkshop(bool full) {","WORKSHOP"),("static void drawMore(bool full) {","MORE"),("static void drawSystem(bool full) {","SYSTEM")):
        hub=replace_block(hub,signature,f[key],key)
    if hub.count("securityPortalCode()")<2: raise PatchError("RC10 lost secure portal-code visibility")
    if "TEST / NO CODE" in hub: raise PatchError("RC10 reintroduced insecure no-code copy")
    for forbidden in ("matchSpoolByColor","matchSpoolByMaterial","resolveSpool"):
        if forbidden in hub: raise PatchError(f"forbidden inventory inference present: {forbidden}")
    for marker in ("UI10-H","UI10-P","UI10-W","UI10-M","UI10-S","C10_ACCENT","Settings","AMS telemetry - inventory identity remains explicit","Local Access"):
        if marker not in hub: raise PatchError(f"missing RC10 UX marker: {marker}")
    for anchor in ("static int16_t hubHeaderH() { return 36; }","static int16_t hubNavH() { return 54; }","static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;","Keep Holding","Hold to Apply"):
        if anchor not in hub: raise PatchError(f"RC10 lost inherited interaction anchor: {anchor}")
    hub_path.write_text(hub,encoding="utf-8")
    # The credential reveal is part of the running portal candidate, not a mockup.
    patch_printer_credentials(repo)
    print("Workshop OS v11.25 RC10 Cupertino UI applied")

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--repo",required=True); ap.add_argument("--apply",action="store_true"); args=ap.parse_args()
    if not args.apply: raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve())
    return 0
if __name__=="__main__": raise SystemExit(main())
