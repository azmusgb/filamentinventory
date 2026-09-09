#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC7 touch-first UX overhaul after secure RC6.

RC7 is presentation-only. It preserves printer command semantics, network/restart
safety guards, recovery, portal-code authentication, persistence, and device I/O.
It replaces the native presentation and normalizes copy across settings pages.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(path: Path) -> str:
    if not path.exists():
        raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def block_end(text: str, start: int) -> int:
    i = text.find("{", start)
    if i < 0: raise PatchError("opening brace missing")
    depth=0; string=None; escape=False; line_comment=False; block_comment=False
    while i < len(text):
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


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start=text.find(signature)
    if start<0 or text.find(signature,start+1)>=0:
        raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start]+replacement.rstrip()+text[block_end(text,start):]


def sections(source_root: Path) -> dict[str,str]:
    values: dict[str,str]={}
    fragment_dir=source_root/"firmware"/"ui-v11.25-rc7"
    for path in fragment_dir.glob("*.cppfrag"):
        text=load(path)
        for line in text.splitlines():
            if line.startswith("@@") and line.endswith("@@") and not line.startswith("@@END_"):
                name=line[2:-2]; end=f"@@END_{name}@@"
                if end not in text: raise PatchError(f"{path.name}: missing {end}")
                values[name]=text.split(line,1)[1].split(end,1)[0].strip("\n")
    required={"FINGERPRINT_HELPERS","CARD","MODE_TABS","ACTION","TELEMETRY","AMS_SLOT","HEADER","BOTTOM_NAV","HOME","PRINTER","WORKSHOP","MORE","SYSTEM"}
    missing=required-set(values)
    if missing: raise PatchError(f"missing RC7 fragments: {sorted(missing)}")
    return values


def replace_if_present(text: str, old: str, new: str) -> str:
    return text.replace(old,new) if old in text else text


def normalize_settings_copy(hub: str) -> str:
    replacements=(
        ('"< BACK"','"BACK"'),('"< PREV"','"PREV"'),('"NEXT >"','"NEXT"'),('"REVIEW >"','"REVIEW"'),
        ('"< FIELD"','"PREV FIELD"'),('"FIELD >"','"NEXT FIELD"'),('"HOLD APPLY + RESTART"','"HOLD TO APPLY"'),
        ('"STAGED CONFIGURATION - REVIEW BEFORE APPLY"','"REVIEW CHANGES"'),('"STAGED - NOT APPLIED"','"CHANGES NOT APPLIED"'),
        ('"Use explicit PREV / NEXT"','"Choose timezone"'),('"Tap to toggle"','"Tap to change"'),('"Tap to cycle"','"Tap to change"'),
        ('"Hostname remains browser-only"','"Local network name"'),
        ('"Timezone changes apply immediately. Wi-Fi credentials stay browser-only."','"Timezone saves immediately. Review network changes before apply."'),
        ('"Speaker · mic · events"','"Speaker, microphone and alerts"'),('"Screen · standby"','"Screen and standby"'),
        ('"Health · network"','"Network and device"'),('"Timers · utilities"','"Timers and utilities"'),
    )
    for old,new in replacements: hub=replace_if_present(hub,old,new)
    context_replacements=(
        ('"DISPLAY - QUICK"','"QUICK"'),('"DISPLAY - SCHEDULE"','"SCHEDULE"'),('"DISPLAY - BEHAVIOR"','"BEHAVIOR"'),
        ('"DISPLAY - VISUAL"','"VISUAL"'),('"DISPLAY - CLOCK"','"CLOCK"'),('"DISPLAY - ALERTS"','"ALERTS"'),
        ('"DISPLAY - SIGNALS"','"SIGNALS"'),('"DISPLAY - THEME"','"THEME"'),('"DISPLAY - GAUGE COLORS"','"COLORS"'),
        ('"DISPLAY - GAUGE SCALES"','"SCALES"'),('"DISPLAY - GAUGE BEHAVIOR"','"GAUGE"'),('"DISPLAY - GLOW"','"GLOW"'),
        ('"DISPLAY - LAYOUT"','"LAYOUT"'),('"DISPLAY - EXTRAS"','"EXTRAS"'),('"NETWORK - TIME & LOCALE"','"TIME"'),
        ('"NETWORK - ADDRESS EDITOR"','"ADDRESS"'),('"NETWORK - ADDRESS REVIEW"','"REVIEW"'),('"HARDWARE - SOUND"','"SOUND"'),
        ('"HARDWARE - COOLDOWN"','"COOLDOWN"'),('"HARDWARE - LED"','"LED"'),('"HARDWARE - FINISH"','"FINISH"'),
        ('"HARDWARE - ERROR"','"ERROR"'),('"HARDWARE - POWER"','"POWER"'),('"HARDWARE - AUTO OFF"','"AUTO OFF"'),
    )
    for old,new in context_replacements: hub=replace_if_present(hub,old,new)
    return hub


def sanitize_generated_source(repo: Path) -> None:
    path=repo/"src"/"settings.cpp"
    if not path.exists(): raise PatchError(f"missing {path}")
    data=path.read_bytes().replace(b"'\x00'",b"'\\0'")
    if b"\x00" in data: raise PatchError("settings.cpp still contains an embedded NUL byte")
    path.write_bytes(data)


def patch(repo: Path) -> None:
    source_root=Path(__file__).resolve().parent; f=sections(source_root); sanitize_generated_source(repo)
    build_path=repo/"include"/"smart_home_build.h"; build=load(build_path)
    build=once(build,'#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC6 Secure Physical Acceptance"','#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC7 Touch-First UX Overhaul"',"RC7 build label")
    build=once(build,'#define SMART_HOME_PROFILE "secure-physical-acceptance"','#define SMART_HOME_PROFILE "touch-first-ux"',"RC7 build profile")
    if "WORKSHOP_OS_V11_25_UI_RC7" not in build: build+="\n#define WORKSHOP_OS_V11_25_UI_RC7 1\n"
    if '#define WORKSHOP_OS_UI_SCHEMA "UI5"' in build: build=build.replace('#define WORKSHOP_OS_UI_SCHEMA "UI5"','#define WORKSHOP_OS_UI_SCHEMA "UI7"')
    elif "WORKSHOP_OS_UI_SCHEMA" not in build: build+='#define WORKSHOP_OS_UI_SCHEMA "UI7"\n'
    build_path.write_text(build,encoding="utf-8")

    hub_path=repo/"src"/"smart_hub.cpp"; hub=load(hub_path)
    for signature,key in [
        ("static const char* hubV1125UiFingerprint(uint8_t page)","FINGERPRINT_HELPERS"),("static void hubV1125Card(","CARD"),
        ("static void hubV1125ModeTabs() {","MODE_TABS"),("static void hubV1125Action(","ACTION"),
        ("static void hubV1125TelemetryColumn(","TELEMETRY"),("static void hubV1125AmsSlot(","AMS_SLOT"),
        ("static void drawHeader(","HEADER"),("static void uiBottomNav(","BOTTOM_NAV"),("static void drawHome(bool full) {","HOME"),
        ("static void drawPrinter(bool full) {","PRINTER"),("static void drawWorkshop(bool full) {","WORKSHOP"),
        ("static void drawMore(bool full) {","MORE"),("static void drawSystem(bool full) {","SYSTEM")]:
        hub=replace_block(hub,signature,f[key],key)
    hub=normalize_settings_copy(hub)
    if hub.count("securityPortalCode()")<2: raise PatchError("RC7 lost secure portal-code visibility")
    if "TEST / NO CODE" in hub: raise PatchError("RC7 reintroduced insecure no-code copy")
    for forbidden in ("matchSpoolByColor","matchSpoolByMaterial","resolveSpool"):
        if forbidden in hub: raise PatchError(f"forbidden firmware inventory inference present: {forbidden}")
    hub_path.write_text(hub,encoding="utf-8")

    css_path=repo/"web"/"app.css"; css=load(css_path); layer=load(source_root/"assets"/"v11_25_rc7_portal.css")
    marker="Workshop OS v11.25 RC7 Touch-First UX Overhaul"
    if marker not in css: css+="\n\n"+layer.rstrip()+"\n"
    css_path.write_text(css,encoding="utf-8")
    print("Workshop OS v11.25 RC7 Touch-First UX Overhaul applied")


def main() -> int:
    ap=argparse.ArgumentParser(); ap.add_argument("--repo",required=True); ap.add_argument("--apply",action="store_true"); args=ap.parse_args()
    if not args.apply: raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve()); return 0

if __name__=="__main__": raise SystemExit(main())
