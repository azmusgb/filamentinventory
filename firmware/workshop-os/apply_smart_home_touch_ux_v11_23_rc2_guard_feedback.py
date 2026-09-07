#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Workshop OS v11.23 RC2 guarded-action feedback"
ORDER_MARKER = "Workshop OS v11.23 RC2 rotation preview declaration-order fix"


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 anchor, found {count}")
    return text.replace(old, new, 1)


HOLD_FEEDBACK = r'''
void smartHubUpdateHoldProgress(uint16_t rawX, uint16_t rawY, uint32_t holdMs) {
  static uint8_t lastKind=0;
  static uint8_t lastSegments=255;

  if(holdMs==0){
    lastKind=0;
    lastSegments=255;
    return;
  }
  if(!g_cfg.enabled||!smartHubIsScreen(getScreenState()))return;

  int16_t x=0,y=0;
  mapHubTouch(rawX,rawY,x,y);
  uint8_t kind=0;
  int16_t bx=0,by=0,bw=0,bh=0;
  const char* label=nullptr;

  if(g_networkSettingsView && (g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT)==3 &&
     hubStaticNetworkValid() && hubRc2HitRef(x,y,240,252,230,56)){
    kind=1;bx=240;by=252;bw=230;bh=56;label="HOLD APPLY";
  }else if(g_displayExperienceView && g_rotationPreviewMode &&
           hubRc2HitRef(x,y,160,258,310,52)){
    kind=2;bx=160;by=258;bw=310;bh=52;label="HOLD ROTATION";
  }else{
    lastKind=0;
    lastSegments=255;
    return;
  }

  // smartHubHandleTouch() commits when the gesture reaches 650 ms. Derive the
  // five visual segments from that exact same threshold so feedback and action
  // semantics cannot drift apart.
  uint8_t segments=(uint8_t)((holdMs*5U+649U)/650U);
  if(segments>5U)segments=5U;
  if(kind==lastKind && segments==lastSegments)return;
  lastKind=kind;
  lastSegments=segments;

  hubRc2ButtonRef(bx,by,bw,bh,label,UI_ORANGE,true);
  int16_t px=hubRc2SX((int16_t)(bx+12));
  int16_t py=hubRc2SY((int16_t)(by+bh-11));
  int16_t total=hubRc2SX((int16_t)(bw-24));
  int16_t gap=hubRc2SX(4); if(gap<2)gap=2;
  int16_t sh=hubRc2SY(5); if(sh<3)sh=3;
  int16_t sw=(int16_t)((total-gap*4)/5);
  if(sw<4)sw=4;
  for(uint8_t i=0;i<5;i++){
    const uint16_t c=(i<segments)?UI_TEXT:UI_BORDER;
    tft.fillRoundRect((int16_t)(px+i*(sw+gap)),py,sw,sh,2,c);
  }
  hubMarkFrameDirty();
}
'''


def fix_rotation_preview_declaration_order(text: str) -> str:
    """Move rotation-preview state/prototype ahead of the renderer that uses them."""
    if ORDER_MARKER in text:
        return text

    late = "static bool g_rotationPreviewMode=false;\n"
    if text.count(late) != 1:
        raise PatchError(
            f"rotation preview state: expected exactly 1 late definition, found {text.count(late)}"
        )
    text = text.replace(late, "", 1)

    anchor = "static void drawDisplayExperience(bool full) {"
    if text.count(anchor) != 1:
        raise PatchError(
            f"display renderer: expected exactly 1 anchor, found {text.count(anchor)}"
        )
    declarations = (
        "// v11.23 RC2 rotation preview is referenced by drawDisplayExperience before\n"
        "// its helper implementation later in this translation unit.\n"
        "static bool g_rotationPreviewMode=false;\n"
        "static void hubRc2DrawRotationPreview();\n\n"
    )
    text = text.replace(anchor, declarations + anchor, 1)
    text += f"\n// {ORDER_MARKER}\n"
    return text


def patch_header(repo: Path) -> None:
    p=repo/"src"/"smart_hub.h"
    text=p.read_text(encoding="utf-8")
    old="""bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress);\nbool smartHubIsNativePrinterScreen(ScreenState screen);\n"""
    new="""bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress);\n// Live guarded-action feedback. holdMs comes from buttonHoldDurationMs() and\n// uses the same 650 ms threshold as smartHubHandleTouch long-press dispatch.\nvoid smartHubUpdateHoldProgress(uint16_t rawX, uint16_t rawY, uint32_t holdMs);\nbool smartHubIsNativePrinterScreen(ScreenState screen);\n"""
    text=replace_once(text,old,new,"smart_hub hold-feedback declaration")
    p.write_text(text,encoding="utf-8")


def patch_main(repo: Path) -> None:
    p=repo/"src"/"main.cpp"
    text=p.read_text(encoding="utf-8")
    old="""      uint32_t d = buttonHoldDurationMs();\n      if (d > hubTouchMaxHoldMs) hubTouchMaxHoldMs = d;\n"""
    new="""      uint32_t d = buttonHoldDurationMs();\n      if (d > hubTouchMaxHoldMs) hubTouchMaxHoldMs = d;\n      if (hubTouchHasPoint) smartHubUpdateHoldProgress(hubTouchX, hubTouchY, d);\n"""
    text=replace_once(text,old,new,"main live hold-feedback dispatch")
    p.write_text(text,encoding="utf-8")


def patch_hub(repo: Path) -> None:
    p=repo/"src"/"smart_hub.cpp"
    text=p.read_text(encoding="utf-8")
    if MARKER in text:
        print("v11.23 RC2 guarded-action feedback already applied")
        return
    if "Workshop OS v11.23 RC2 physical touch finalization" not in text:
        raise PatchError("RC2 physical-touch finalization marker missing")

    # Make the disruptive consequence visible without implying any printer
    # command. The display may restart/disconnect; an active printer continues.
    old="""    hubFormatIpv4(g_networkEditValues[2],sn,sizeof(sn));\n    hubFormatIpv4(g_networkEditValues[3],dns,sizeof(dns));\n    hubRc2ButtonRef(10,58,460,28,\"STAGED CONFIGURATION - REVIEW BEFORE APPLY\",UI_ORANGE);\n"""
    new="""    hubFormatIpv4(g_networkEditValues[2],sn,sizeof(sn));\n    hubFormatIpv4(g_networkEditValues[3],dns,sizeof(dns));\n    const bool printerActive=isAnyPrinterConfigured() && displayedPrinter().state.connected &&\n                             (displayedPrinter().state.printing || displayedPrinter().state.gcodeStateId==GCODE_PAUSE);\n    hubRc2ButtonRef(10,58,460,28,\n                    printerActive?\"PRINTER ACTIVE - DISPLAY WILL RESTART\":\"STAGED CONFIGURATION - REVIEW BEFORE APPLY\",\n                    printerActive?UI_RED:UI_ORANGE);\n"""
    text=replace_once(text,old,new,"Network Review active-printer warning")

    old="""    hubRc2CardRef(245,162,225,62,\"DNS\",\n                  g_networkEditDhcp?\"AUTO\":dns,\n                  hubStaticNetworkValid()?\"Ready to apply\":\"Static values incomplete\",\n                  hubStaticNetworkValid()?UI_GREEN:UI_RED);\n"""
    new="""    hubRc2CardRef(245,162,225,62,\"DNS\",\n                  g_networkEditDhcp?\"AUTO\":dns,\n                  hubStaticNetworkValid()?(printerActive?\"Printer continues; display reconnects\":\"Ready to apply\"):\"Static values incomplete\",\n                  hubStaticNetworkValid()?(printerActive?UI_ORANGE:UI_GREEN):UI_RED);\n"""
    text=replace_once(text,old,new,"Network Review consequence detail")

    old="""    hubRc2ButtonRef(240,252,230,56,\"HOLD APPLY + RESTART\",\n                    hubStaticNetworkValid()?UI_ORANGE:UI_RED,\n                    hubStaticNetworkValid());\n"""
    new="""    hubRc2ButtonRef(240,252,230,56,\n                    printerActive?\"HOLD APPLY - DISPLAY RESTART\":\"HOLD APPLY + RESTART\",\n                    hubStaticNetworkValid()?UI_ORANGE:UI_RED,\n                    hubStaticNetworkValid());\n"""
    text=replace_once(text,old,new,"Network Review guarded action label")

    # Add live hold rendering immediately before the release-time handler. The
    # existing mapHubTouch() helper is already defined at this point.
    anchor="bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress) {\n"
    text=replace_once(text,anchor,HOLD_FEEDBACK+"\n"+anchor,"hold-feedback implementation")

    old="""bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress) {\n  if (!g_cfg.enabled || !smartHubIsScreen(getScreenState())) return false;\n"""
    new="""bool smartHubHandleTouch(uint16_t rawX, uint16_t rawY, bool longPress) {\n  smartHubUpdateHoldProgress(rawX,rawY,0);\n  if (!g_cfg.enabled || !smartHubIsScreen(getScreenState())) return false;\n"""
    text=replace_once(text,old,new,"release-time progress reset")

    # Disabled-build stub, if present in the reconstructed source.
    stub="bool smartHubHandleTouch(uint16_t, uint16_t, bool) { return false; }\n"
    if stub in text and "void smartHubUpdateHoldProgress(uint16_t, uint16_t, uint32_t) {}" not in text:
        text=text.replace(stub,stub+"void smartHubUpdateHoldProgress(uint16_t, uint16_t, uint32_t) {}\n",1)

    # The RC2 rotation-preview finalization inserts its state/helper later in
    # this translation unit, but drawDisplayExperience() consumes them earlier.
    # Normalize declaration order here so the v11.23 candidate compiles on its
    # own and downstream candidates inherit a sound base.
    text=fix_rotation_preview_declaration_order(text)

    text += f"\n// {MARKER}\n"
    p.write_text(text,encoding="utf-8")


def apply(repo: Path) -> None:
    build=repo/"include"/"smart_home_build.h"
    if not build.exists():
        raise PatchError(f"missing reconstructed source: {build}")
    if "Smart Home v11.23 Network Locale Layout RC2" not in build.read_text(encoding="utf-8"):
        raise PatchError("guarded-action feedback requires reconstructed v11.23 RC2")
    patch_header(repo)
    patch_main(repo)
    patch_hub(repo)
    print("Workshop OS v11.23 RC2 guarded-action feedback applied")


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",required=True)
    ap.add_argument("--apply",action="store_true")
    args=ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__=="__main__":
    raise SystemExit(main())
