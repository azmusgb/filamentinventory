#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

MARKER = "Workshop Instrument UI v1 reference-synthesis prototype"
EXPECTED_LABEL = 'Smart Home v11.23 Network Locale Layout RC2'
PROTOTYPE_LABEL = 'Smart Home v11.23 Instrument UI Prototype'
EXPECTED_PROFILE = 'network-touch-ux'
PROTOTYPE_PROFILE = 'instrument-ui-prototype'


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing reconstructed source: {rel}")
    return p.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_braced_block(text: str, start: str, replacement: str, label: str) -> str:
    pos = text.find(start)
    if pos < 0:
        raise PatchError(f"{label}: start anchor missing")
    brace = text.find("{", pos)
    if brace < 0:
        raise PatchError(f"{label}: opening brace missing")
    depth = 0
    in_string = False
    quote = ""
    escape = False
    for i in range(brace, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == quote:
                in_string = False
            continue
        if c in ("'", '"'):
            in_string = True
            quote = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[:pos] + replacement + text[i + 1 :]
    raise PatchError(f"{label}: closing brace missing")


def replace_palette_const(text: str, name: str, value: int) -> str:
    # The unified hub palette is intentionally compile-time RGB565. Refuse to
    # guess if the authoritative implementation changes shape.
    pattern = re.compile(
        rf"((?:static\s+)?(?:constexpr\s+)?uint16_t\s+{re.escape(name)}\s*=\s*)0x[0-9A-Fa-f]+(\s*;)"
    )
    text, count = pattern.subn(rf"\g<1>0x{value:04X}\g<2>", text, count=1)
    if count != 1:
        raise PatchError(f"palette constant {name}: expected one RGB565 literal, found {count}")
    return text


HERO = r'''// Workshop Instrument UI v1 reference-synthesis prototype
static void uiSignatureHero(const HubRect& r,const PrinterSlot* p,const BambuState* s) {
  const uint16_t stateColor=uiSignatureHeroColor(s);
  uiCard(r.x,r.y,r.w,r.h,stateColor,true);

  // Accent is concentrated into one instrument rail rather than coloring the
  // whole card. This keeps alarm/attention semantics legible and calm.
  tft.fillRoundRect(r.x+6,r.y+8,4,r.h-16,2,stateColor);

  const char* title=uiSignatureHeroTitle(s);
  char context[100];
  if(workshopTimerActive()||g_workshopTimerDone){
    char tt[28];workshopTimerText(tt,sizeof(tt));snprintf(context,sizeof(context),"Timer • %s",tt);
  }else if(g_workshopNote[0]){
    snprintf(context,sizeof(context),"Note • %s",g_workshopNote);
  }else if(!s){
    strlcpy(context,"Add a printer when ready",sizeof(context));
  }else if(s->printing){
    char rem[22];formatDuration(s->remainingMinutes,rem,sizeof(rem));
    snprintf(context,sizeof(context),"%s left • %s",rem,p&&p->config.name[0]?p->config.name:"Printer");
  }else if(!s->connected){
    snprintf(context,sizeof(context),"%s • Check connection",p&&p->config.name[0]?p->config.name:"Printer");
  }else{
    snprintf(context,sizeof(context),"%s • Ready • %u material%s",p&&p->config.name[0]?p->config.name:"Printer",(unsigned)uiMaterialCount(*s),uiMaterialCount(*s)==1?"":"s");
  }

  if(hubLandscape() && s && s->printing){
    // Air-Orbit / CO2-display influence: one truthful radial metric. No fake
    // sparkline or estimated trend is drawn; the ring is BambuState::progress.
    const int16_t cx=r.x+58;
    const int16_t cy=r.y+(r.h/2);
    const int16_t radius=(r.h>=82)?30:24;
    const uint8_t segments=28;
    const uint8_t active=(uint8_t)(((uint16_t)s->progress*segments)/100U);
    for(uint8_t i=0;i<segments;i++){
      const float a=(-90.0f+(360.0f*(float)i/(float)segments))*0.0174532925f;
      const int16_t x=cx+(int16_t)(cosf(a)*radius);
      const int16_t y=cy+(int16_t)(sinf(a)*radius);
      tft.fillCircle(x,y,2,i<active?stateColor:UI_MUTED);
    }
    char pct[10];snprintf(pct,sizeof(pct),"%u%%",(unsigned)s->progress);
    uiDrawFit(pct,cx,cy-5,52,FONT_LARGE,MC_DATUM,UI_TEXT,UI_PANEL);
    uiDrawFit("PRINT",cx,cy+19,46,FONT_SMALL,MC_DATUM,UI_DIM,UI_PANEL);

    const int16_t tx=r.x+106;
    const int16_t tw=r.w-120;
    uiDrawFit(title,tx,r.y+14,tw,FONT_BODY,TL_DATUM,stateColor,UI_PANEL);
    uiDrawFit(context,tx,r.y+43,tw,FONT_SMALL,TL_DATUM,UI_TEXT,UI_PANEL);
    uiDrawFit("Live printer state",tx,r.y+r.h-12,tw,FONT_SMALL,BL_DATUM,UI_DIM,UI_PANEL);
  }else{
    // Airstation / 420-display influence: one dominant state, supporting line
    // below it, no equal-weight card clutter.
    uiDrawFit(title,r.x+18,r.y+17,r.w-36,hubLandscape()?FONT_LARGE:FONT_BODY,TL_DATUM,stateColor,UI_PANEL);
    uiDrawFit(context,r.x+18,r.y+53,r.w-36,FONT_SMALL,TL_DATUM,UI_TEXT,UI_PANEL);
  }
}
'''


DISPLAY_CARD = r'''static void uiDisplaySettingCard(const HubRect& r, const char* label,
                                 const char* value, const char* detail,
                                 uint16_t accent, bool active=true) {
  const uint16_t rail = active ? accent : UI_BORDER;
  const uint16_t labelColor = active ? accent : UI_MUTED;
  const uint16_t valueColor = active ? UI_TEXT : UI_DIM;
  const uint16_t detailColor = active ? UI_DIM : UI_MUTED;

  // Office/Ambient reference influence: a quiet raised tile with one value and
  // a narrow state rail. The configured value remains visible when inactive.
  tft.fillRoundRect(r.x,r.y,r.w,r.h,10,UI_PANEL_2);
  tft.drawRoundRect(r.x,r.y,r.w,r.h,10,UI_BORDER);
  tft.fillRoundRect(r.x+4,r.y+8,4,r.h-16,2,rail);

  const int16_t pad=14;
  const int16_t labelY=r.y+(hubLandscape()?10:13);
  const int16_t valueY=r.y+(hubLandscape()?34:45);
  const int16_t detailY=r.y+r.h-(hubLandscape()?11:14);
  uiDrawFit(label,r.x+pad,labelY,r.w-pad*2,FONT_SMALL,TL_DATUM,labelColor,UI_PANEL_2);
  uiDrawFit(value,r.x+pad,valueY,r.w-pad*2,FONT_LARGE,TL_DATUM,valueColor,UI_PANEL_2);
  uiDrawFit(detail,r.x+pad,detailY,r.w-pad*2,FONT_SMALL,BL_DATUM,detailColor,UI_PANEL_2);
}
'''


RC2_BUTTON = r'''static void hubRc2ButtonRef(int16_t x, int16_t y, int16_t w, int16_t h,
                            const char* label, uint16_t accent,
                            bool enabled=true) {
  const int16_t sx=hubRc2SX(x), sy=hubRc2SY(y);
  const int16_t sw=hubRc2SX(w), sh=hubRc2SY(h);
  const uint16_t fill=enabled?UI_PANEL_2:UI_PANEL;
  const uint16_t ink=enabled?UI_TEXT:UI_DIM;
  tft.fillRoundRect(sx,sy,sw,sh,10,fill);
  tft.drawRoundRect(sx,sy,sw,sh,10,enabled?UI_BORDER:UI_MUTED);
  if(enabled){
    // Active/off distinction without a full saturated tile: a wide bottom rail
    // preserves the large RC2 hit target while making direction obvious.
    tft.fillRoundRect(sx+10,sy+sh-5,sw-20,3,1,accent);
  }
  uiDrawFit(label,sx+7,sy+(sh/2)-1,sw-14,FONT_BODY,ML_DATUM,ink,fill);
}
'''


RC2_CARD = r'''static void hubRc2CardRef(int16_t x, int16_t y, int16_t w, int16_t h,
                          const char* title, const char* value,
                          const char* detail, uint16_t accent) {
  const int16_t sx=hubRc2SX(x), sy=hubRc2SY(y);
  const int16_t sw=hubRc2SX(w), sh=hubRc2SY(h);
  tft.fillRoundRect(sx,sy,sw,sh,10,UI_PANEL_2);
  tft.drawRoundRect(sx,sy,sw,sh,10,UI_BORDER);
  tft.fillRoundRect(sx+4,sy+8,4,sh-16,2,accent);
  uiDrawFit(title,sx+13,sy+11,sw-24,FONT_SMALL,TL_DATUM,accent,UI_PANEL_2);
  uiDrawFit(value,sx+13,sy+(sh/2),sw-24,FONT_BODY,ML_DATUM,UI_TEXT,UI_PANEL_2);
  if(detail&&detail[0])
    uiDrawFit(detail,sx+13,sy+sh-9,sw-24,FONT_SMALL,BL_DATUM,UI_DIM,UI_PANEL_2);
}
'''


def assert_secure_boundary(root: Path) -> None:
    combined = "\n".join(
        load(root, rel)
        for rel in ("include/smart_home_build.h", "src/security_manager.cpp", "web/app.js")
    )
    forbidden = (
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "TEMPORARY TRUSTED-LAN MODE",
        "if (!isAPMode()) return true;",
        "v1123Rc2LanOpenBanner",
    )
    for needle in forbidden:
        if needle in combined:
            raise PatchError(f"refusing visual prototype on insecure reconstruction: {needle}")


def patch_build(root: Path) -> None:
    rel = "include/smart_home_build.h"
    text = load(root, rel)
    if PROTOTYPE_LABEL in text:
        return
    text = replace_once(
        text,
        f'#define SMART_HOME_BUILD_LABEL "{EXPECTED_LABEL}"',
        f'#define SMART_HOME_BUILD_LABEL "{PROTOTYPE_LABEL}"\n#define WORKSHOP_OS_INSTRUMENT_UI_PROTOTYPE 1',
        "prototype build identity",
    )
    if f'#define SMART_HOME_PROFILE "{EXPECTED_PROFILE}"' in text:
        text = replace_once(
            text,
            f'#define SMART_HOME_PROFILE "{EXPECTED_PROFILE}"',
            f'#define SMART_HOME_PROFILE "{PROTOTYPE_PROFILE}"',
            "prototype profile",
        )
    save(root, rel, text)


def patch_hub(root: Path) -> None:
    rel = "src/smart_hub.cpp"
    text = load(root, rel)
    if MARKER in text:
        return

    # Dark precision-instrument palette, RGB565. Alarm roles remain distinct.
    palette = {
        "UI_BG": 0x0083,      # #071019
        "UI_PANEL": 0x08A4,   # #0C1721
        "UI_PANEL_2": 0x1106, # #122230
        "UI_BORDER": 0x2188,  # #223341
        "UI_TEXT": 0xF7BF,    # #F2F7FA
        "UI_DIM": 0x9536,     # #91A5B5
        "UI_MUTED": 0x4B0E,   # #4C6170
        "UI_CYAN": 0x2EBC,    # #28D7E5
        "UI_BLUE": 0x3C1E,    # #3B82F6
        "UI_GREEN": 0x3711,   # #35E38A
        "UI_AMBER": 0xFE08,   # #FFC247
        "UI_RED": 0xFACA,     # #FF5B57
        "UI_PURPLE": 0xBBBF,  # #B974FF
        "UI_ORANGE": 0xFC46,  # #FF8A34
    }
    for name, value in palette.items():
        text = replace_palette_const(text, name, value)

    text = replace_braced_block(
        text,
        "static void uiSignatureHero(const HubRect& r,const PrinterSlot* p,const BambuState* s) {",
        HERO,
        "home signature hero",
    )
    text = replace_braced_block(
        text,
        "static void uiDisplaySettingCard(const HubRect& r, const char* label,",
        DISPLAY_CARD,
        "display setting card",
    )
    text = replace_braced_block(
        text,
        "static void hubRc2ButtonRef(int16_t x, int16_t y, int16_t w, int16_t h,",
        RC2_BUTTON,
        "RC2 button renderer",
    )
    text = replace_braced_block(
        text,
        "static void hubRc2CardRef(int16_t x, int16_t y, int16_t w, int16_t h,",
        RC2_CARD,
        "RC2 card renderer",
    )
    save(root, rel, text)


def verify(root: Path) -> None:
    build = load(root, "include/smart_home_build.h")
    hub = load(root, "src/smart_hub.cpp")
    if PROTOTYPE_LABEL not in build or "WORKSHOP_OS_INSTRUMENT_UI_PROTOTYPE 1" not in build:
        raise PatchError("prototype build identity missing")
    for needle in (
        MARKER,
        "BambuState::progress",
        "Live printer state",
        "tft.fillRoundRect(r.x+4,r.y+8,4,r.h-16,2,rail)",
        "hubRc2ButtonRef",
        "hubRc2CardRef",
        "STAGED - NOT APPLIED",
        "HOLD APPLY + RESTART",
        "securityPortalCode()",
        "PORTAL ACCESS",
    ):
        if needle not in hub:
            raise PatchError(f"visual prototype invariant missing: {needle}")
    assert_secure_boundary(root)


def apply(root: Path) -> None:
    assert_secure_boundary(root)
    build = load(root, "include/smart_home_build.h")
    if PROTOTYPE_LABEL not in build and EXPECTED_LABEL not in build:
        raise PatchError("Workshop Instrument UI v1 requires final secure v11.23 RC2 reconstruction")
    patch_build(root)
    patch_hub(root)
    verify(root)
    print("Workshop Instrument UI v1 prototype applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="reconstructed BambuHelper source tree")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        print("Workshop Instrument UI v1 ready; pass --apply to modify reconstructed source")
        return 0
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
