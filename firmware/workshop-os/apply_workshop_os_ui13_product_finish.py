#!/usr/bin/env python3
"""Apply final UI13 product-finish polish after the appliance settings patch.

This layer intentionally does not rewrite historical RC/UI fragments. It only
changes the reconstructed UI13 product surface: status color becomes semantic,
disconnected/degraded state uses warning rather than destructive red, and the
result keeps one coherent visual language across Home, Printer and Settings.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def block_end(text: str, start: int) -> int:
    brace = text.find("{", start)
    if brace < 0:
        raise PatchError("opening brace missing")
    depth = 0
    string = None
    escape = False
    line = False
    block = False
    i = brace
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if line:
            if c == "\n":
                line = False
        elif block:
            if c == "*" and n == "/":
                block = False
                i += 1
        elif string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == string:
                string = None
        elif c == "/" and n == "/":
            line = True
            i += 1
        elif c == "/" and n == "*":
            block = True
            i += 1
        elif c in ('"', "'"):
            string = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"signature missing/non-unique: {signature}")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


HEADER = r'''static uint16_t hubUi13HeaderStateColor(const char* state,bool explicitState,bool online) {
  if(!explicitState) return online?C10_GREEN:C10_ORANGE;
  if(!state||!state[0]) return C10_MUTED;
  if(strcmp(state,"Online")==0||strcmp(state,"Connected")==0||strcmp(state,"Healthy")==0||
     strcmp(state,"Ready")==0||strcmp(state,"Printing")==0||strcmp(state,"OK")==0) return C10_GREEN;
  if(strcmp(state,"Offline")==0||strcmp(state,"Set Up")==0||strcmp(state,"Setup Required")==0||
     strcmp(state,"Unavailable")==0||strcmp(state,"Needs attention")==0||strcmp(state,"Check Device")==0||
     strcmp(state,"Starting")==0) return C10_ORANGE;
  if(strcmp(state,"Error")==0||strcmp(state,"Failed")==0) return C10_RED;
  if(strcmp(state,"Unknown")==0) return C10_MUTED;
  return C10_ACCENT;
}

static void drawHeader(const char* title,const char* right,uint8_t page) {
  const int16_t W=tft.width(),HH=hubHeaderH();
  const bool online=WiFi.status()==WL_CONNECTED;
  const bool explicitState=right&&right[0];
  tft.fillRect(0,0,W,HH,C10_BG);
  uiDrawFit(title?title:"Home",12,8,hubLandscape()?270:178,FONT_BODY,TL_DATUM,C10_TEXT,C10_BG);
  const char* state=explicitState?right:(online?"Online":"Offline");
  const uint16_t c=hubUi13HeaderStateColor(state,explicitState,online);
  const int16_t pw=hubLandscape()?104:90;
  tft.fillCircle(W-pw+4,18,4,c);
  uiDrawFit(state,W-12,18,pw-18,FONT_SMALL,MR_DATUM,c,C10_BG);
  (void)hubV1125UiFingerprint(page);
}'''


def apply(repo: Path) -> None:
    build = repo / "include" / "smart_home_build.h"
    if not build.is_file() or '#define WORKSHOP_OS_V11_28_UI13 1' not in build.read_text(encoding="utf-8"):
        raise PatchError("UI13 product finish requires reconstructed v11.28 UI13 source")
    path = repo / "src" / "smart_hub.cpp"
    text = path.read_text(encoding="utf-8")
    if "hubUi13HeaderStateColor" in text:
        raise PatchError("UI13 product finish already applied")

    text = replace_block(text, "static void drawHeader(const char* title,const char* right,uint8_t page) {", HEADER)
    text = once(
        text,
        "const uint16_t sc=!configured?C10_MUTED:(!online?C10_RED:(alert?C10_RED:(paused?C10_ORANGE:(printing?C10_ACCENT:C10_GREEN))));",
        "const uint16_t sc=!configured?C10_MUTED:(!online?C10_ORANGE:(alert?C10_RED:(paused?C10_ORANGE:(printing?C10_ACCENT:C10_GREEN))));",
        "Home disconnected semantic color",
    )
    text = once(
        text,
        "const uint16_t sc=!s.connected?C10_RED:(paused?C10_ORANGE:(s.printing?C10_ACCENT:C10_GREEN));",
        "const uint16_t sc=!s.connected?C10_ORANGE:(paused?C10_ORANGE:(s.printing?C10_ACCENT:C10_GREEN));",
        "Printer disconnected semantic color",
    )
    text = once(
        text,
        "hubV1125Card(r,s.connected?C10_GREEN:C10_RED,false);",
        "hubV1125Card(r,s.connected?C10_GREEN:C10_ORANGE,false);",
        "Telemetry disconnected semantic color",
    )

    path.write_text(text, encoding="utf-8")
    print("Workshop OS UI13 semantic product finish applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
