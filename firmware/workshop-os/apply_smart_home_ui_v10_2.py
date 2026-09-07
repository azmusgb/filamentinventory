#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(repo: Path, rel: str) -> str:
    p = repo / rel
    if not p.exists():
        raise PatchError(f"missing required file: {rel}")
    return p.read_text()


def save(repo: Path, rel: str, text: str) -> None:
    (repo / rel).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_build(repo: Path) -> None:
    rel = "include/smart_home_build.h"
    text = load(repo, rel)
    text = replace_once(text, '#define SMART_HOME_VERSION "v10.1"', '#define SMART_HOME_VERSION "v10.2"', "build version")
    text = replace_once(text, '#define SMART_HOME_PROFILE "workshop-os-hardware-audio"', '#define SMART_HOME_PROFILE "workshop-os-ui-polish"', "build profile")
    text = replace_once(text, '#define SMART_HOME_BUILD_LABEL "Smart Home v10.1 Hardware + Audio RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v10.2 Workshop UI Polish RC1"', "build label")
    save(repo, rel, text)


def patch_smart_hub(repo: Path) -> None:
    rel = "src/smart_hub.cpp"
    text = load(repo, rel)

    text = replace_once(
        text,
        'static int16_t hubHeaderH() { return hubLandscape() ? 36 : 38; }',
        'static int16_t hubHeaderH() { return hubLandscape() ? 34 : 36; }',
        'compressed hub header height',
    )
    text = replace_once(
        text,
        '  uiDrawFit("WORKSHOP OS", 43, 28, hubLandscape() ? 180 : 110,\n            FONT_SMALL, ML_DATUM, UI_MUTED, UI_BG);',
        '  if (!hubLandscape()) uiDrawFit("WORKSHOP OS", 43, 27, 110,\n            FONT_SMALL, ML_DATUM, UI_MUTED, UI_BG);',
        'landscape header subtitle removal',
    )

    old_more_rect = '''static HubRect hubMoreRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;
    return hr(m+i*(cw+g),42,cw,104);
  }
  const int16_t m=10,g=10,cw=(W-2*m-g)/2,ch=116;
  return hr(m+(i%2)*(cw+g),52+(i/2)*(ch+10),cw,ch);
}'''
    new_more_rect = '''static HubRect hubMoreRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    const int16_t m=8,g=8,cw=(W-2*m-g)/2,ch=74;
    return hr(m+(i%2)*(cw+g),38+(i/2)*(ch+8),cw,ch);
  }
  const int16_t m=10,g=10,cw=(W-2*m-g)/2,ch=116;
  return hr(m+(i%2)*(cw+g),48+(i/2)*(ch+10),cw,ch);
}'''
    text = replace_once(text, old_more_rect, new_more_rect, '2x2 More geometry')

    old_nav = '''static void uiBottomNav(uint8_t active, const char* nextPage) {
  (void)nextPage;
  const int16_t y = tft.height() - hubNavH();
  tft.fillRect(0, y, tft.width(), hubNavH(), UI_BG);
  tft.drawFastHLine(8, y, tft.width() - 16, UI_BORDER_2);
  static const char* labels[] = { "HOME", "PRINTER", "WORKSHOP", "MORE" };
  for (uint8_t i = 0; i < 4; i++) {
    HubRect r = hubNavRect(i);
    const bool selected=i==active;
    const uint16_t c = selected ? UI_ORANGE : UI_MUTED;
    if (selected) {
      tft.fillRoundRect(r.x + 6, r.y + 4, r.w - 12, r.h - 8, 9, UI_PANEL_3);
      tft.drawRoundRect(r.x + 6, r.y + 4, r.w - 12, r.h - 8, 9, UI_GLOW);
      tft.fillRoundRect(r.x + r.w / 2 - 11, r.y + 3, 22, 3, 2, UI_ORANGE);
    }
    uiNavIcon(r.x + r.w / 2, r.y + 15, i, c);
    uiDrawFit(labels[i], r.x + r.w / 2, r.y + 30, r.w - 8,
              FONT_SMALL, TC_DATUM, c, selected ? UI_PANEL_3 : UI_BG);
  }
}'''
    new_nav = '''static void uiBottomNav(uint8_t active, const char* nextPage) {
  (void)nextPage;
  const int16_t y = tft.height() - hubNavH();
  tft.fillRect(0, y, tft.width(), hubNavH(), UI_BG);
  tft.fillRoundRect(8, y + 3, tft.width() - 16, hubNavH() - 6, 11, UI_PANEL_2);
  tft.drawRoundRect(8, y + 3, tft.width() - 16, hubNavH() - 6, 11, UI_BORDER_2);
  static const char* labels[] = { "HOME", "PRINTER", "WORKSHOP", "MORE" };
  for (uint8_t i = 0; i < 4; i++) {
    HubRect r = hubNavRect(i);
    const bool selected=i==active;
    const uint16_t c = selected ? UI_ORANGE : UI_MUTED;
    if (selected) {
      tft.fillRoundRect(r.x + 7, r.y + 5, r.w - 14, r.h - 10, 9, UI_PANEL_3);
      tft.drawRoundRect(r.x + 7, r.y + 5, r.w - 14, r.h - 10, 9, UI_ORANGE);
      tft.fillRoundRect(r.x + r.w / 2 - 13, r.y + 4, 26, 3, 2, UI_ORANGE);
    }
    uiNavIcon(r.x + r.w / 2, r.y + 15, i, c);
    uiDrawFit(labels[i], r.x + r.w / 2, r.y + 31, r.w - 10,
              FONT_SMALL, TC_DATUM, c, selected ? UI_PANEL_3 : UI_PANEL_2);
  }
}'''
    text = replace_once(text, old_nav, new_nav, 'OS dock navigation')

    old_more = '''static void drawMore(bool full) {
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("MORE","TOOLS & SETTINGS",3);uiBottomNav(3,nullptr);const char* titles[4]={"CUSTOM","SYSTEM","EDIT WIDGETS","CLASSIC PRINTER"};const char* subs[4]={"Personal dashboard","Health & recovery","Choose dashboard tiles","Full legacy surface"};const uint16_t colors[4]={UI_PURPLE,UI_BLUE,UI_ORANGE,UI_MUTED};
  for(uint8_t i=0;i<4;i++){HubRect r=hubMoreRect(i);uiCard(r.x,r.y,r.w,r.h,colors[i],false);uiMoreIcon(r,i,colors[i]);uiDrawFit(titles[i],r.x+12,r.y+47,r.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(subs[i],r.x+12,r.y+72,r.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit("OPEN ›",r.x+r.w-12,r.y+r.h-16,r.w-24,FONT_SMALL,BR_DATUM,colors[i],UI_PANEL);}
  String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("No IP"),kg=recoveryKnownGoodSlot();
  if(!hubLandscape()){uiPanelFill(10,310,W-20,105);uiDrawFit("THIS DEVICE",20,322,W-40,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);uiDrawFit(SMART_HOME_BUILD_LABEL,20,344,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);char line[80];snprintf(line,sizeof(line),"%s • running %s",recoveryWebReady()?"Recovery ready":"Recovery starting",recoveryCurrentSlot().c_str());uiDrawFit(line,20,372,W-40,FONT_SMALL,TL_DATUM,recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL_2);char net[80];snprintf(net,sizeof(net),"%s • fallback %s",ip.c_str(),kg.length()?kg.c_str():"—");uiDrawFit(net,20,396,W-40,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_2);}else{uiPanelFill(8,154,W-16,110);uiDrawFit("THIS DEVICE",20,166,W-40,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);uiDrawFit(SMART_HOME_BUILD_LABEL,20,188,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);char line[96];snprintf(line,sizeof(line),"%s • running %s • fallback %s • %s",recoveryWebReady()?"Recovery ready":"Recovery starting",recoveryCurrentSlot().c_str(),kg.length()?kg.c_str():"—",ip.c_str());uiDrawFit(line,20,219,W-40,FONT_SMALL,TL_DATUM,recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL_2);uiDrawFit("Advanced device controls remain in the browser portal",20,246,W-40,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_2);}
  hubMarkFrameDirty();g_dirty=false;
}'''
    new_more = '''static void drawMore(bool full) {
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("MORE","TOOLS",3);uiBottomNav(3,nullptr);
  const char* titles[4]={"CUSTOM","SYSTEM","EDIT","CLASSIC"};
  const char* subs[4]={"Personal dashboard","Health & recovery","Choose dashboard tiles","Legacy printer surface"};
  const uint16_t colors[4]={UI_PURPLE,UI_BLUE,UI_ORANGE,UI_MUTED};
  for(uint8_t i=0;i<4;i++){
    HubRect r=hubMoreRect(i);uiCard(r.x,r.y,r.w,r.h,colors[i],false);
    if(hubLandscape()){
      uiMoreIcon(r,i,colors[i]);
      uiDrawFit(titles[i],r.x+46,r.y+17,r.w-72,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
      uiDrawFit(subs[i],r.x+46,r.y+43,r.w-72,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);
      const int16_t cx=r.x+r.w-18,cy=r.y+r.h/2;
      tft.drawLine(cx-3,cy-5,cx+2,cy,colors[i]);tft.drawLine(cx+2,cy,cx-3,cy+5,colors[i]);
    }else{
      uiMoreIcon(r,i,colors[i]);
      uiDrawFit(titles[i],r.x+12,r.y+47,r.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
      uiDrawFit(subs[i],r.x+12,r.y+72,r.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);
      uiDrawFit("OPEN ›",r.x+r.w-12,r.y+r.h-16,r.w-24,FONT_SMALL,BR_DATUM,colors[i],UI_PANEL);
    }
  }
  String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("No IP"),kg=recoveryKnownGoodSlot();
  if(!hubLandscape()){
    uiPanelFill(10,306,W-20,109);uiDrawFit("THIS DEVICE",20,318,W-40,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);uiDrawFit(SMART_HOME_BUILD_LABEL,20,340,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);char line[80];snprintf(line,sizeof(line),"%s • running %s",recoveryWebReady()?"Recovery ready":"Recovery starting",recoveryCurrentSlot().c_str());uiDrawFit(line,20,368,W-40,FONT_SMALL,TL_DATUM,recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL_2);char net[80];snprintf(net,sizeof(net),"%s • fallback %s",ip.c_str(),kg.length()?kg.c_str():"—");uiDrawFit(net,20,392,W-40,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_2);
  }else{
    uiPanelFill(8,202,W-16,62);
    uiDrawFit("THIS DEVICE",18,212,90,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);
    uiDrawFit(SMART_HOME_BUILD_LABEL,18,229,250,FONT_SMALL,TL_DATUM,UI_TEXT,UI_PANEL_2);
    uiPill(W-132,210,112,recoveryWebReady()?"RECOVERY READY":"RECOVERY START",recoveryWebReady()?UI_GREEN:UI_AMBER);
    char line[120];snprintf(line,sizeof(line),"running %s • fallback %s • %s",recoveryCurrentSlot().c_str(),kg.length()?kg.c_str():"—",ip.c_str());
    uiDrawFit(line,18,250,W-36,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_2);
  }
  hubMarkFrameDirty();g_dirty=false;
}'''
    text = replace_once(text, old_more, new_more, 'More launcher redesign')

    old_ams = 'static void drawAmsCompact(const HubRect&r,const BambuState&s) {\n  uiCard(r.x,r.y,r.w,r.h,UI_BORDER,false);uiSectionLabel(r.x+10,r.y+8,"MATERIALS",UI_ORANGE,r.w-28);\n'
    new_ams = '''static void drawAmsCompact(const HubRect&r,const BambuState&s) {
  uiCard(r.x,r.y,r.w,r.h,UI_BORDER,false);uiSectionLabel(r.x+10,r.y+8,"AMS / FILAMENT",UI_ORANGE,r.w-28);
  if(s.ams.present && s.ams.activeTray<4){char loaded[20];snprintf(loaded,sizeof(loaded),"A%d LOADED",(int)s.ams.activeTray+1);uiDrawFit(loaded,r.x+r.w-10,r.y+8,r.w/2,FONT_SMALL,TR_DATUM,UI_ORANGE,UI_PANEL);}
'''
    text = replace_once(text, old_ams, new_ams, 'AMS loaded snapshot header')

    old_status = '''uiCard(status.x,status.y,status.w,status.h,uiStateColor(s),false);uiPrinterArtFamily(status.x+8,status.y+18,76,48,uiStateColor(s),p);uiDrawFit(s.printing?jobDisplayName(s):(s.connected?"Printer ready":"Printer offline"),status.x+92,status.y+18,status.w-104,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);char layer[36];if(s.printing)snprintf(layer,sizeof(layer),"Layer %u/%u • %s",(unsigned)s.layerNum,(unsigned)s.totalLayers,stateText(s));else snprintf(layer,sizeof(layer),"%s • WiFi %d dBm",stateText(s),(int)s.wifiSignal);uiDrawFit(layer,status.x+92,status.y+45,status.w-104,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);'''
    new_status = '''uiCard(status.x,status.y,status.w,status.h,uiStateColor(s),false);uiSectionLabel(status.x+10,status.y+8,"OPERATIONAL",uiStateColor(s),status.w-24);const int16_t mc=(status.w-20)/3;char mv0[20],mv1[20],mv2[20];snprintf(mv0,sizeof(mv0),"%s",s.connected?stateText(s):"OFFLINE");if(s.printing)snprintf(mv1,sizeof(mv1),"%u/%u",(unsigned)s.layerNum,(unsigned)s.totalLayers);else strlcpy(mv1,"READY",sizeof(mv1));uint8_t alerts=uiHmsCount(s);if(alerts)snprintf(mv2,sizeof(mv2),"%u ALERT%s",(unsigned)alerts,alerts==1?"":"S");else strlcpy(mv2,"ALL CLEAR",sizeof(mv2));const char* ml[3]={"STATE","LAYER","ATTENTION"};const char* vv[3]={mv0,mv1,mv2};for(uint8_t mi=0;mi<3;mi++){int16_t cx=status.x+10+mi*mc+mc/2;if(mi)tft.drawFastVLine(status.x+10+mi*mc,status.y+30,status.h-38,UI_BORDER);uiDrawFit(ml[mi],cx,status.y+31,mc-10,FONT_SMALL,TC_DATUM,UI_DIM,UI_PANEL);uiDrawFit(vv[mi],cx,status.y+51,mc-10,FONT_BODY,TC_DATUM,mi==2?(alerts?UI_AMBER:UI_GREEN):UI_TEXT,UI_PANEL);}'''
    text = replace_once(text, old_status, new_status, 'Workshop operational metrics')

    save(repo, rel, text)


def verify(repo: Path) -> None:
    build = load(repo, "include/smart_home_build.h")
    hub = load(repo, "src/smart_hub.cpp")
    for needle in [
        '#define SMART_HOME_VERSION "v10.2"',
        'Smart Home v10.2 Workshop UI Polish RC1',
    ]:
        if needle not in build:
            raise PatchError(f"verify build missing {needle}")
    for needle in [
        'const int16_t m=8,g=8,cw=(W-2*m-g)/2,ch=74;',
        'const char* titles[4]={"CUSTOM","SYSTEM","EDIT","CLASSIC"};',
        'Legacy printer surface',
        'uiPanelFill(8,202,W-16,62);',
        'AMS / FILAMENT',
        'A%d LOADED',
        '"OPERATIONAL"',
        'tft.fillRoundRect(8, y + 3, tft.width() - 16, hubNavH() - 6, 11, UI_PANEL_2);',
    ]:
        if needle not in hub:
            raise PatchError(f"verify hub missing {needle}")
    if 'GET STARTED' in hub:
        raise PatchError('verify forbidden GET STARTED label')
    for needle in ['INPUT & AUDIO', 'FT6336 • ES8311 • microphone']:
        if needle not in hub:
            raise PatchError(f"verify inherited UI missing {needle}")


def apply(repo: Path) -> None:
    patch_build(repo)
    patch_smart_hub(repo)
    verify(repo)
    print("Smart Home v10.2 Workshop UI Polish applied")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        parser.error('--apply is required')
    apply(Path(args.repo).resolve())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
