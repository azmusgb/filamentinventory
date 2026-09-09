#!/usr/bin/env python3
"""Apply the v11.25 RC2 visual-delta pass after the RC1 overhaul.

RC1 was functionally correct but remained too visually close to the inherited
Workshop OS card grammar during physical review. RC2 deliberately changes the
visible hierarchy without changing printer/inventory authority or command
semantics.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(path: Path) -> str:
    if not path.is_file():
        raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")


def block_end(text: str, start: int) -> int:
    brace = text.find("{", start)
    if brace < 0:
        raise PatchError("opening brace missing")
    depth = 0
    string = None
    escape = False
    line_comment = False
    block_comment = False
    i = brace
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if c == "\n":
                line_comment = False
        elif block_comment:
            if c == "*" and n == "/":
                block_comment = False
                i += 1
        elif string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == string:
                string = None
        elif c == "/" and n == "/":
            line_comment = True
            i += 1
        elif c == "/" and n == "*":
            block_comment = True
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
    raise PatchError("unterminated braced block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


HOME_RECT = r'''static HubRect hubHomeRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()) {
    if(i==1) return hr(8,48,320,212);           // printer command center
    if(i==0) return hr(336,150,W-344,52);       // material / AMS telemetry
    if(i==2) return hr(336,210,W-344,50);       // network
    return hr(0,0,0,0);                         // no hidden Home targets
  }
  if(i==1) return hr(8,48,W-16,170);
  if(i==0) return hr(8,226,W-16,70);
  if(i==2) return hr(8,304,W-16,60);
  return hr(0,0,0,0);
}'''

CARD = r'''static void hubV1125Card(const HubRect& r,uint16_t rail=UI_BORDER_2,bool strong=false) {
  const uint16_t bg=strong?UI_PANEL_3:UI_PANEL;
  tft.fillRoundRect(r.x,r.y,r.w,r.h,4,bg);
  tft.drawRoundRect(r.x,r.y,r.w,r.h,4,strong?UI_BORDER:UI_BORDER_2);
  if(rail!=UI_BORDER_2 && rail!=UI_BORDER) tft.fillRect(r.x,r.y,4,r.h,rail);
}'''

MODE_TABS = r'''static void hubV1125ModeTabs() {
  static const char* labels[3]={"STATUS","AMS","CONTROL"};
  for(uint8_t i=0;i<3;i++) {
    HubRect r=hubV1125PrinterModeRect(i);
    const bool selected=g_printerMode==i;
    const uint16_t c=selected?UI_ORANGE:UI_MUTED;
    tft.fillRoundRect(r.x,r.y,r.w,r.h,4,selected?UI_PANEL_3:UI_PANEL_2);
    tft.drawRoundRect(r.x,r.y,r.w,r.h,4,selected?UI_ORANGE:UI_BORDER_2);
    if(selected)tft.fillRect(r.x,r.y+r.h-4,r.w,4,UI_ORANGE);
    uiDrawFit(labels[i],r.x+r.w/2,r.y+r.h/2-1,r.w-18,FONT_BODY,MC_DATUM,c,selected?UI_PANEL_3:UI_PANEL_2);
  }
}'''

HEADER = r'''static void drawHeader(const char* title, const char* right, uint8_t page) {
  (void)page;
  const int16_t W=tft.width(),HH=hubHeaderH();
  const bool online=WiFi.status()==WL_CONNECTED;
  tft.fillRect(0,0,W,HH,UI_BG);
  tft.fillRoundRect(8,7,30,26,4,UI_ORANGE);
  uiDrawFit("W",23,20,20,FONT_BODY,MC_DATUM,UI_BG,UI_ORANGE);
  uiDrawFit("WORKSHOP OS",47,6,132,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_BG);
  uiDrawFit(title?title:"HOME",47,22,hubLandscape()?245:164,FONT_BODY,TL_DATUM,UI_TEXT,UI_BG);
  const char* state=right&&right[0]?right:(online?"ONLINE":"OFFLINE");
  const uint16_t c=right&&right[0]?UI_ORANGE:(online?UI_GREEN:UI_RED);
  tft.fillCircle(W-84,20,4,c);
  uiDrawFit(state,W-12,20,62,FONT_SMALL,MR_DATUM,c,UI_BG);
  tft.fillRect(0,HH-2,W,2,UI_ORANGE);
}'''

BOTTOM_NAV = r'''static void uiBottomNav(uint8_t active, const char* nextPage) {
  (void)nextPage;
  const int16_t y=tft.height()-hubNavH(),W=tft.width();
  static const char* labels[4]={"HOME","PRINTER","WORKSHOP","MORE"};
  tft.fillRect(0,y,W,hubNavH(),UI_PANEL_2);
  tft.drawFastHLine(0,y,W,UI_BORDER_2);
  for(uint8_t i=0;i<4;i++) {
    HubRect r=hubNavRect(i);
    const bool selected=i==active;
    if(selected) {
      tft.fillRect(r.x+5,y+1,r.w-10,4,UI_ORANGE);
      tft.fillRoundRect(r.x+6,y+8,r.w-12,r.h-11,4,UI_PANEL_3);
    }
    uiDrawFit(labels[i],r.x+r.w/2,r.y+r.h/2+2,r.w-16,FONT_BODY,MC_DATUM,selected?UI_ORANGE:UI_MUTED,selected?UI_PANEL_3:UI_PANEL_2);
  }
}'''

HOME = r'''static void drawHome(bool full) {
  (void)full;
  const int16_t W=tft.width();
  const bool configured=isAnyPrinterConfigured();
  const PrinterSlot* p=configured?&displayedPrinter():nullptr;
  const BambuState* s=p?&p->state:nullptr;
  if(g_ambientEnabled&&g_ambientActive){drawAmbientHome(p,s);return;}
  tft.fillScreen(UI_BG);drawHeader("HOME",nullptr,0);uiBottomNav(0,nullptr);

  const uint16_t sc=hubV1125PrinterColor(s);
  if(hubLandscape()) {
    HubRect hero=hr(8,48,320,212),next=hr(336,48,W-344,94),material=hr(336,150,W-344,52),network=hr(336,210,W-344,50);
    hubV1125Card(hero,sc,true);
    uiDrawFit("PRINTER",hero.x+16,hero.y+14,100,FONT_SMALL,TL_DATUM,sc,UI_PANEL_3);
    uiDrawFit(hubV1125PrinterTitle(s),hero.x+16,hero.y+38,hero.w-32,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);
    uiDrawFit(p&&p->config.name[0]?p->config.name:(p?"Bambu printer":"No printer configured"),hero.x+16,hero.y+78,hero.w-32,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);
    if(s&&s->printing) {
      char pct[12],remain[20],meta[54];
      snprintf(pct,sizeof(pct),"%u%%",(unsigned)s->progress);
      formatDuration(s->remainingMinutes,remain,sizeof(remain));
      snprintf(meta,sizeof(meta),"%s left  |  L%u/%u",remain,(unsigned)s->layerNum,(unsigned)s->totalLayers);
      uiDrawFit(jobDisplayName(*s),hero.x+16,hero.y+112,hero.w-122,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_3);
      uiDrawFit(pct,hero.x+hero.w-16,hero.y+104,88,FONT_LARGE,TR_DATUM,UI_ORANGE,UI_PANEL_3);
      uiProgressBar(hero.x+16,hero.y+150,hero.w-32,s->progress,UI_ORANGE);
      uiDrawFit(meta,hero.x+16,hero.y+176,hero.w-32,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_3);
    } else {
      uiDrawFit(s&&s->connected?"Ready for the next job":"Printer telemetry unavailable",hero.x+16,hero.y+118,hero.w-32,FONT_BODY,TL_DATUM,s&&s->connected?UI_GREEN:UI_AMBER,UI_PANEL_3);
      uiDrawFit("Tap for Status / AMS / Control",hero.x+16,hero.y+166,hero.w-32,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);
    }

    uint16_t nc=UI_GREEN;const char* nt="ALL CLEAR";char nd[52]="Nothing needs attention";
    if(g_workshopTimerDone){nc=UI_AMBER;nt="TIMER DONE";strlcpy(nd,"Open Workshop",sizeof(nd));}
    else if(s&&uiHmsCount(*s)){nc=UI_AMBER;nt="ATTENTION";snprintf(nd,sizeof(nd),"%u printer alert%s",(unsigned)uiHmsCount(*s),uiHmsCount(*s)==1?"":"s");}
    else if(s&&!s->connected){nc=UI_AMBER;nt="CHECK PRINTER";strlcpy(nd,"Connection unavailable",sizeof(nd));}
    else if(WiFi.status()!=WL_CONNECTED){nc=UI_RED;nt="NETWORK OFFLINE";strlcpy(nd,"Check Wi-Fi",sizeof(nd));}
    else if(workshopTimerActive()){nc=UI_ORANGE;nt="TIMER RUNNING";workshopTimerText(nd,sizeof(nd));}
    hubV1125Card(next,nc,false);
    uiDrawFit("NEXT ACTION",next.x+10,next.y+10,next.w-20,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);
    uiDrawFit(nt,next.x+10,next.y+34,next.w-20,FONT_BODY,TL_DATUM,nc,UI_PANEL);
    uiDrawFit(nd,next.x+10,next.y+64,next.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);

    char mv[32]="Unknown";
    if(s&&s->ams.present&&s->ams.activeTray<4&&s->ams.trays[s->ams.activeTray].present){const AmsTray&t=s->ams.trays[s->ams.activeTray];snprintf(mv,sizeof(mv),"A%u  %s",(unsigned)s->ams.activeTray+1,t.type[0]?t.type:"FILAMENT");}
    hubV1125Card(material,UI_CYAN,false);
    uiDrawFit("MATERIAL",material.x+9,material.y+8,material.w-18,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);
    uiDrawFit(mv,material.x+9,material.y+30,material.w-18,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);

    const bool wifi=WiFi.status()==WL_CONNECTED;
    hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);
    uiDrawFit("NETWORK",network.x+9,network.y+7,network.w-18,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);
    uiDrawFit(wifi?"OPEN / TEST":"OFFLINE",network.x+9,network.y+28,network.w-18,FONT_BODY,TL_DATUM,wifi?UI_ORANGE:UI_RED,UI_PANEL);
  } else {
    HubRect hero=hr(8,48,W-16,170),material=hr(8,226,W-16,70),network=hr(8,304,W-16,60),next=hr(8,372,W-16,48);
    hubV1125Card(hero,sc,true);
    uiDrawFit("PRINTER",hero.x+14,hero.y+12,100,FONT_SMALL,TL_DATUM,sc,UI_PANEL_3);
    uiDrawFit(hubV1125PrinterTitle(s),hero.x+14,hero.y+40,hero.w-28,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);
    uiDrawFit(p&&p->config.name[0]?p->config.name:(p?"Bambu printer":"No printer configured"),hero.x+14,hero.y+84,hero.w-28,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);
    if(s&&s->printing)uiProgressBar(hero.x+14,hero.y+136,hero.w-28,s->progress,UI_ORANGE);
    hubV1125Card(material,UI_CYAN,false);uiDrawFit("MATERIAL / INVENTORY ID UNKNOWN",material.x+12,material.y+12,material.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(s&&s->ams.present?"Printer AMS telemetry available":"External / unreported",material.x+12,material.y+39,material.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
    const bool wifi=WiFi.status()==WL_CONNECTED;hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);uiDrawFit("NETWORK",network.x+12,network.y+10,network.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(wifi?"OPEN / TEST":"OFFLINE",network.x+12,network.y+34,network.w-24,FONT_BODY,TL_DATUM,wifi?UI_ORANGE:UI_RED,UI_PANEL);
    hubV1125Card(next,UI_ORANGE,false);uiDrawFit("Tap Printer for Status / AMS / Control",next.x+12,next.y+24,next.w-24,FONT_SMALL,ML_DATUM,UI_ORANGE,UI_PANEL);
  }
  hubMarkFrameDirty();g_dirty=false;
}'''


def patch(repo: Path) -> None:
    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = replace_once(
        build,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC1"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC2"',
        "RC2 build label",
    )
    if "WORKSHOP_OS_V11_25_UI_OVERHAUL_RC2" not in build:
        build += "\n#define WORKSHOP_OS_V11_25_UI_OVERHAUL_RC2 1\n"
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    hub = replace_block(hub, "static HubRect hubHomeRect(uint8_t i) {", HOME_RECT, "Home touch geometry")
    hub = replace_block(hub, "static void hubV1125Card(", CARD, "card grammar")
    hub = replace_block(hub, "static void hubV1125ModeTabs() {", MODE_TABS, "Printer mode tabs")
    hub = replace_block(hub, "static void drawHeader(const char* title, const char* right, uint8_t page) {", HEADER, "header")
    hub = replace_block(hub, "static void uiBottomNav(uint8_t active, const char* nextPage) {", BOTTOM_NAV, "bottom navigation")
    hub = replace_block(hub, "static void drawHome(bool full) {", HOME, "Home command center")
    hub_path.write_text(hub, encoding="utf-8")
    print("Workshop OS v11.25 Full Device UI Overhaul RC2 visual delta applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
