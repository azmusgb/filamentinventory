#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC3 premium UI/UX + portal CSS polish.

RC3 is a visual/interaction refinement stacked on RC2. It deliberately does not
change inventory authority, printer command semantics, recovery, or the temporary
station-LAN no-code test boundary used during physical acceptance.
"""
from __future__ import annotations

import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent

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
            if c == "\n": line_comment = False
        elif block_comment:
            if c == "*" and n == "/": block_comment = False; i += 1
        elif string:
            if escape: escape = False
            elif c == "\\": escape = True
            elif c == string: string = None
        elif c == "/" and n == "/": line_comment = True; i += 1
        elif c == "/" and n == "*": block_comment = True; i += 1
        elif c in ('"', "'"): string = c
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0 or text.find(signature, start + 1) >= 0:
        raise PatchError(f"{label}: missing/non-unique signature {signature}")
    return text[:start] + replacement.rstrip() + text[block_end(text, start):]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)

CARD = r'''static void hubV1125Card(const HubRect& r,uint16_t rail=UI_BORDER_2,bool strong=false) {
  const uint16_t bg=strong?UI_PANEL_3:UI_PANEL;
  tft.fillRoundRect(r.x+1,r.y+2,r.w,r.h,7,0x0000);
  tft.fillRoundRect(r.x,r.y,r.w,r.h,7,bg);
  tft.drawRoundRect(r.x,r.y,r.w,r.h,7,strong?UI_BORDER:UI_BORDER_2);
  tft.drawFastHLine(r.x+8,r.y+1,r.w-16,strong?UI_BORDER:UI_BORDER_2);
  if(rail!=UI_BORDER_2 && rail!=UI_BORDER){
    tft.fillRoundRect(r.x+1,r.y+10,3,r.h-20,2,rail);
  }
}'''

ACTION = r'''static void hubV1125Action(const HubRect& r,const char* label,uint16_t c,bool enabled=true,bool destructive=false) {
  const uint16_t edge=enabled?c:UI_BORDER_2;
  const uint16_t bg=enabled?UI_PANEL_2:UI_PANEL;
  tft.fillRoundRect(r.x,r.y,r.w,r.h,7,bg);
  tft.drawRoundRect(r.x,r.y,r.w,r.h,7,edge);
  if(enabled)tft.fillRect(r.x+1,r.y+r.h-4,r.w-2,3,edge);
  if(destructive&&enabled){tft.fillCircle(r.x+r.w-13,r.y+13,4,UI_RED);}
  uiDrawFit(label,r.x+r.w/2,r.y+r.h/2-1,r.w-22,FONT_BODY,MC_DATUM,enabled?UI_TEXT:UI_DIM,bg);
}'''

TELEMETRY = r'''static void hubV1125TelemetryColumn(const HubRect& r,const BambuState& s) {
  hubV1125Card(r,s.connected?UI_ORANGE:UI_BORDER_2,false);
  uiDrawFit("LIVE TELEMETRY",r.x+12,r.y+10,r.w-24,FONT_SMALL,TL_DATUM,s.connected?UI_ORANGE:UI_DIM,UI_PANEL);
  const char* labels[4]={"NOZZLE","BED","CHAMBER","FAN"};
  char vals[4][14];
  if(s.connected){
    snprintf(vals[0],sizeof(vals[0]),"%.0f°",s.nozzleTemp);
    snprintf(vals[1],sizeof(vals[1]),"%.0f°",s.bedTemp);
    snprintf(vals[2],sizeof(vals[2]),"%.0f°",s.chamberTemp);
    snprintf(vals[3],sizeof(vals[3]),"%u%%",(unsigned)s.coolingFanPct);
  }else for(uint8_t i=0;i<4;i++)strlcpy(vals[i],"—",sizeof(vals[i]));
  const int16_t gx=r.x+10, gy=r.y+32, gap=5;
  const int16_t cw=(r.w-20-gap)/2, ch=(r.h-40-gap)/2;
  for(uint8_t i=0;i<4;i++){
    const int16_t x=gx+(i%2)*(cw+gap), y=gy+(i/2)*(ch+gap);
    tft.fillRoundRect(x,y,cw,ch,5,UI_PANEL_2);
    tft.drawRoundRect(x,y,cw,ch,5,UI_BORDER_2);
    uiDrawFit(labels[i],x+8,y+7,cw-16,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL_2);
    uiDrawFit(vals[i],x+8,y+ch-9,cw-16,FONT_BODY,BL_DATUM,s.connected?UI_TEXT:UI_DIM,UI_PANEL_2);
  }
}'''

AMS_SLOT = r'''static void hubV1125AmsSlot(const HubRect& r,const AmsTray* tr,bool active,uint8_t index) {
  const bool present=tr&&tr->present;
  const uint16_t bg=active?UI_PANEL_3:UI_PANEL;
  tft.fillRoundRect(r.x,r.y,r.w,r.h,7,bg);
  tft.drawRoundRect(r.x,r.y,r.w,r.h,7,active?UI_ORANGE:UI_BORDER_2);
  if(active)tft.fillRect(r.x+1,r.y+r.h-4,r.w-2,3,UI_ORANGE);
  char slot[8];snprintf(slot,sizeof(slot),"A%u",(unsigned)(index+1));
  char remain[12];if(present&&tr->remain>=0)snprintf(remain,sizeof(remain),"%d%%",(int)tr->remain);else strlcpy(remain,"—",sizeof(remain));
  uiDrawFit(slot,r.x+10,r.y+9,34,FONT_BODY,TL_DATUM,active?UI_ORANGE:UI_MUTED,bg);
  uiDrawFit(remain,r.x+r.w-9,r.y+9,42,FONT_BODY,TR_DATUM,present?UI_TEXT:UI_DIM,bg);
  uint16_t filament=present?tr->colorRgb565:UI_BORDER;if(present&&filament==0)filament=0x1082;
  uiSpoolScaled(r.x+25,r.y+51,filament,active,present?tr->remain:-1,12);
  uiDrawFit(present&&tr->type[0]?tr->type:"EMPTY",r.x+47,r.y+39,r.w-56,FONT_BODY,TL_DATUM,present?UI_TEXT:UI_MUTED,bg);
  uiDrawFit(present?uiFilamentColorName(tr->colorRgb565):"No filament",r.x+47,r.y+65,r.w-56,FONT_SMALL,TL_DATUM,UI_DIM,bg);
}'''

HEADER = r'''static void drawHeader(const char* title, const char* right, uint8_t page) {
  (void)page;
  const int16_t W=tft.width(),HH=hubHeaderH();
  const bool online=WiFi.status()==WL_CONNECTED;
  tft.fillRect(0,0,W,HH,UI_BG);
  tft.fillRoundRect(8,7,28,26,6,UI_ORANGE);
  uiDrawFit("W",22,20,18,FONT_BODY,MC_DATUM,UI_BG,UI_ORANGE);
  uiDrawFit("WORKSHOP",44,7,88,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_BG);
  uiDrawFit(title?title:"HOME",44,22,hubLandscape()?245:170,FONT_BODY,TL_DATUM,UI_TEXT,UI_BG);
  const char* state=right&&right[0]?right:(online?"ONLINE":"OFFLINE");
  const uint16_t c=right&&right[0]?UI_ORANGE:(online?UI_GREEN:UI_RED);
  const int16_t pw=hubLandscape()?88:76;
  tft.fillRoundRect(W-pw-8,9,pw,22,6,UI_PANEL_2);
  tft.drawRoundRect(W-pw-8,9,pw,22,6,UI_BORDER_2);
  tft.fillCircle(W-pw+2,20,3,c);
  uiDrawFit(state,W-14,20,pw-24,FONT_SMALL,MR_DATUM,c,UI_PANEL_2);
  tft.drawFastHLine(8,HH-1,W-16,UI_BORDER_2);
}'''

BOTTOM_NAV = r'''static void uiBottomNav(uint8_t active, const char* nextPage) {
  (void)nextPage;
  const int16_t y=tft.height()-hubNavH(),W=tft.width();
  static const char* labels[4]={"HOME","PRINTER","WORKSHOP","MORE"};
  tft.fillRect(0,y,W,hubNavH(),UI_BG);
  tft.drawFastHLine(0,y,W,UI_BORDER_2);
  for(uint8_t i=0;i<4;i++){
    HubRect r=hubNavRect(i);const bool selected=i==active;
    if(selected){
      tft.fillRoundRect(r.x+5,r.y+7,r.w-10,r.h-12,7,UI_PANEL_3);
      tft.drawRoundRect(r.x+5,r.y+7,r.w-10,r.h-12,7,UI_ORANGE);
      tft.fillRect(r.x+16,r.y+7,r.w-32,3,UI_ORANGE);
    }
    uiDrawFit(labels[i],r.x+r.w/2,r.y+r.h/2+2,r.w-18,FONT_BODY,MC_DATUM,selected?UI_TEXT:UI_MUTED,selected?UI_PANEL_3:UI_BG);
  }
}'''

MODE_TABS = r'''static void hubV1125ModeTabs() {
  static const char* labels[3]={"STATUS","AMS","CONTROL"};
  for(uint8_t i=0;i<3;i++){
    HubRect r=hubV1125PrinterModeRect(i);const bool selected=g_printerMode==i;
    const uint16_t bg=selected?UI_PANEL_3:UI_PANEL_2;
    tft.fillRoundRect(r.x,r.y,r.w,r.h,6,bg);
    tft.drawRoundRect(r.x,r.y,r.w,r.h,6,selected?UI_ORANGE:UI_BORDER_2);
    if(selected)tft.fillRect(r.x+8,r.y+r.h-4,r.w-16,3,UI_ORANGE);
    uiDrawFit(labels[i],r.x+r.w/2,r.y+r.h/2-1,r.w-18,FONT_BODY,MC_DATUM,selected?UI_TEXT:UI_MUTED,bg);
  }
}'''

HOME = r'''static void drawHome(bool full) {
  (void)full;const int16_t W=tft.width();const bool configured=isAnyPrinterConfigured();
  const PrinterSlot* p=configured?&displayedPrinter():nullptr;const BambuState* s=p?&p->state:nullptr;
  if(g_ambientEnabled&&g_ambientActive){drawAmbientHome(p,s);return;}
  tft.fillScreen(UI_BG);drawHeader("HOME",nullptr,0);uiBottomNav(0,nullptr);
  const uint16_t sc=hubV1125PrinterColor(s);
  if(hubLandscape()){
    HubRect hero=hr(8,48,300,212),next=hr(316,48,W-324,92),material=hr(316,148,W-324,52),network=hr(316,208,W-324,52);
    hubV1125Card(hero,sc,true);
    uiDrawFit("PRINTER COMMAND CENTER",hero.x+15,hero.y+13,hero.w-30,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);
    uiDrawFit(hubV1125PrinterTitle(s),hero.x+15,hero.y+38,hero.w-30,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);
    uiDrawFit(p&&p->config.name[0]?p->config.name:(p?"Bambu printer":"No printer configured"),hero.x+15,hero.y+78,hero.w-30,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);
    if(s&&s->printing){char pct[12],remain[20],meta[52];snprintf(pct,sizeof(pct),"%u%%",(unsigned)s->progress);formatDuration(s->remainingMinutes,remain,sizeof(remain));snprintf(meta,sizeof(meta),"%s left / L%u of %u",remain,(unsigned)s->layerNum,(unsigned)s->totalLayers);uiDrawFit(jobDisplayName(*s),hero.x+15,hero.y+111,hero.w-116,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit(pct,hero.x+hero.w-15,hero.y+102,88,FONT_LARGE,TR_DATUM,UI_ORANGE,UI_PANEL_3);uiProgressBar(hero.x+15,hero.y+149,hero.w-30,s->progress,UI_ORANGE);uiDrawFit(meta,hero.x+15,hero.y+177,hero.w-30,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_3);}else{uiDrawFit(s&&s->connected?"Ready for the next job":"Telemetry unavailable",hero.x+15,hero.y+120,hero.w-30,FONT_BODY,TL_DATUM,s&&s->connected?UI_GREEN:UI_AMBER,UI_PANEL_3);uiDrawFit("Open Printer for status, AMS and controls",hero.x+15,hero.y+169,hero.w-30,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);}
    uint16_t nc=UI_GREEN;const char* nt="ALL CLEAR";char nd[48]="Nothing needs attention";
    if(g_workshopTimerDone){nc=UI_AMBER;nt="TIMER DONE";strlcpy(nd,"Open Workshop",sizeof(nd));}else if(s&&uiHmsCount(*s)){nc=UI_AMBER;nt="ATTENTION";snprintf(nd,sizeof(nd),"%u printer alert%s",(unsigned)uiHmsCount(*s),uiHmsCount(*s)==1?"":"s");}else if(s&&!s->connected){nc=UI_AMBER;nt="CHECK PRINTER";strlcpy(nd,"Connection unavailable",sizeof(nd));}else if(WiFi.status()!=WL_CONNECTED){nc=UI_RED;nt="NETWORK OFFLINE";strlcpy(nd,"Check Wi-Fi",sizeof(nd));}else if(workshopTimerActive()){nc=UI_ORANGE;nt="TIMER RUNNING";workshopTimerText(nd,sizeof(nd));}
    hubV1125Card(next,nc,false);uiDrawFit("NEXT ACTION",next.x+10,next.y+10,next.w-20,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(nt,next.x+10,next.y+34,next.w-20,FONT_BODY,TL_DATUM,nc,UI_PANEL);uiDrawFit(nd,next.x+10,next.y+63,next.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);
    char mv[30]="Unknown";if(s&&s->ams.present&&s->ams.activeTray<4&&s->ams.trays[s->ams.activeTray].present){const AmsTray&t=s->ams.trays[s->ams.activeTray];snprintf(mv,sizeof(mv),"A%u / %s",(unsigned)s->ams.activeTray+1,t.type[0]?t.type:"FILAMENT");}
    hubV1125Card(material,UI_ORANGE,false);uiDrawFit("MATERIAL",material.x+9,material.y+7,material.w-18,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(mv,material.x+9,material.y+29,material.w-18,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
    const bool wifi=WiFi.status()==WL_CONNECTED;hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);uiDrawFit("LOCAL ACCESS",network.x+9,network.y+7,network.w-18,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(wifi?"OPEN / TEST":"OFFLINE",network.x+9,network.y+29,network.w-18,FONT_BODY,TL_DATUM,wifi?UI_ORANGE:UI_RED,UI_PANEL);
  }else{
    HubRect hero=hr(8,48,W-16,170),material=hr(8,226,W-16,70),network=hr(8,304,W-16,60),next=hr(8,372,W-16,48);hubV1125Card(hero,sc,true);uiDrawFit("PRINTER COMMAND CENTER",hero.x+14,hero.y+12,hero.w-28,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(hubV1125PrinterTitle(s),hero.x+14,hero.y+40,hero.w-28,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit(p&&p->config.name[0]?p->config.name:(p?"Bambu printer":"No printer configured"),hero.x+14,hero.y+84,hero.w-28,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);if(s&&s->printing)uiProgressBar(hero.x+14,hero.y+136,hero.w-28,s->progress,UI_ORANGE);hubV1125Card(material,UI_ORANGE,false);uiDrawFit("MATERIAL / INVENTORY ID UNKNOWN",material.x+12,material.y+12,material.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(s&&s->ams.present?"Printer AMS telemetry available":"External / unreported",material.x+12,material.y+39,material.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);const bool wifi=WiFi.status()==WL_CONNECTED;hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);uiDrawFit("LOCAL ACCESS",network.x+12,network.y+10,network.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(wifi?"OPEN / TEST":"OFFLINE",network.x+12,network.y+34,network.w-24,FONT_BODY,TL_DATUM,wifi?UI_ORANGE:UI_RED,UI_PANEL);hubV1125Card(next,UI_ORANGE,false);uiDrawFit("Printer / AMS / Control",next.x+12,next.y+24,next.w-24,FONT_SMALL,ML_DATUM,UI_ORANGE,UI_PANEL);
  }
  hubMarkFrameDirty();g_dirty=false;
}'''

PRINTER = r'''static void drawPrinter(bool full) {
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("PRINTER",nullptr,1);uiBottomNav(1,nullptr);hubV1125ModeTabs();
  if(!isAnyPrinterConfigured()){HubRect r=hubLandscape()?hr(8,106,W-16,154):hr(8,106,W-16,306);hubV1125Card(r,UI_ORANGE,true);uiDrawFit("NO PRINTER CONFIGURED",r.x+16,r.y+34,r.w-32,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit("Use the local portal to add a printer",r.x+16,r.y+82,r.w-32,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);hubMarkFrameDirty();g_dirty=false;return;}
  const PrinterSlot&p=displayedPrinter();const BambuState&s=p.state;const uint16_t sc=hubV1125PrinterColor(&s);const bool paused=s.gcodeStateId==GCODE_PAUSE;const bool active=s.printing||paused;
  if(g_printerMode==HUB_PRINTER_STATUS){
    if(hubLandscape()){HubRect job=hr(8,106,292,154),live=hr(308,106,W-316,154);hubV1125Card(job,sc,true);uiDrawFit(s.printing?"ACTIVE JOB":"PRINTER STATUS",job.x+14,job.y+11,job.w-28,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(hubV1125PrinterTitle(&s),job.x+14,job.y+35,job.w-28,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit(p.config.name[0]?p.config.name:"Bambu printer",job.x+14,job.y+70,job.w-28,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);if(s.printing){char rem[20],meta[48],pct[12];formatDuration(s.remainingMinutes,rem,sizeof(rem));snprintf(meta,sizeof(meta),"%s left / L%u of %u",rem,(unsigned)s.layerNum,(unsigned)s.totalLayers);snprintf(pct,sizeof(pct),"%u%%",(unsigned)s.progress);uiDrawFit(jobDisplayName(s),job.x+14,job.y+97,job.w-92,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit(pct,job.x+job.w-14,job.y+93,64,FONT_BODY,TR_DATUM,UI_ORANGE,UI_PANEL_3);uiProgressBar(job.x+14,job.y+123,job.w-28,s.progress,UI_ORANGE);uiDrawFit(meta,job.x+14,job.y+144,job.w-28,FONT_SMALL,BL_DATUM,UI_DIM,UI_PANEL_3);}else uiDrawFit(s.connected?"No active print":"Telemetry unavailable",job.x+14,job.y+108,job.w-28,FONT_BODY,TL_DATUM,s.connected?UI_GREEN:UI_AMBER,UI_PANEL_3);hubV1125TelemetryColumn(live,s);}else{HubRect job=hr(8,106,W-16,154),live=hr(8,268,W-16,144);hubV1125Card(job,sc,true);uiDrawFit("PRINTER STATUS",job.x+14,job.y+12,job.w-28,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(hubV1125PrinterTitle(&s),job.x+14,job.y+38,job.w-28,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);uiDrawFit(p.config.name[0]?p.config.name:"Bambu printer",job.x+14,job.y+80,job.w-28,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_3);if(s.printing)uiProgressBar(job.x+14,job.y+137,job.w-28,s.progress,UI_ORANGE);hubV1125TelemetryColumn(live,s);}
  }else if(g_printerMode==HUB_PRINTER_AMS){
    if(hubLandscape()){const int16_t g=6,m=8,cw=(W-2*m-3*g)/4;uint8_t n=s.ams.present?s.ams.unitCount*4:0;if(n>4)n=4;for(uint8_t i=0;i<4;i++)hubV1125AmsSlot(hr(m+i*(cw+g),106,cw,106),(i<n)?&s.ams.trays[i]:nullptr,s.ams.present&&s.ams.activeTray==i,i);HubRect identity=hr(8,220,W-16,40);hubV1125Card(identity,UI_ORANGE,false);uiDrawFit("INVENTORY ID",identity.x+12,identity.y+12,92,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit("Unknown",identity.x+112,identity.y+12,74,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit("Printer telemetry only / no identity inferred",identity.x+194,identity.y+13,identity.w-206,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);}else{uint8_t n=s.ams.present?s.ams.unitCount*4:0;if(n>4)n=4;const int16_t g=8,m=8,cw=(W-2*m-g)/2,ch=110;for(uint8_t i=0;i<4;i++)hubV1125AmsSlot(hr(m+(i%2)*(cw+g),106+(i/2)*(ch+g),cw,ch),(i<n)?&s.ams.trays[i]:nullptr,s.ams.present&&s.ams.activeTray==i,i);HubRect identity=hr(8,342,W-16,70);hubV1125Card(identity,UI_ORANGE,false);uiDrawFit("INVENTORY SPOOL",identity.x+12,identity.y+12,identity.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit("Unknown",identity.x+12,identity.y+38,identity.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);}
  }else{
    const char* light=s.lightState==1?"LIGHT OFF":"LIGHT ON";const char* pause=paused?"RESUME":"PAUSE";const uint8_t plug=tasmotaControlPlugForSlot(rotState.displayIndex);const bool powerMapped=plug!=0xFF;
    if(hubLandscape())uiDrawFit("QUICK CONTROL",8,108,W-16,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_BG);
    for(uint8_t i=0;i<4;i++){HubRect r=hubPrinterActionRect(i);const char* label=i==0?printerFeedbackLabel(0,light):i==1?printerFeedbackLabel(1,pause):i==2?(powerMapped?"PRINTER POWER":"POWER NOT MAPPED"):printerFeedbackLabel(3,active?"HOLD STOP":"STOP");const bool enabled=i==0?s.connected:i==1?(s.connected&&active):i==2?powerMapped:(s.connected&&active);const uint16_t c=i==3?UI_RED:(i==2?UI_AMBER:UI_ORANGE);hubV1125Action(r,label,c,enabled,i==3);}
    if(hubLandscape())uiDrawFit("Stop requires a deliberate hold. Power remains separately guarded.",8,250,W-16,FONT_SMALL,BL_DATUM,UI_DIM,UI_BG);
  }
  hubMarkFrameDirty();g_dirty=false;
}'''

WORKSHOP = r'''static void drawWorkshop(bool full) {
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("WORKSHOP",nullptr,2);uiBottomNav(2,nullptr);const BambuState* s=isAnyPrinterConfigured()?&displayedPrinter().state:nullptr;
  if(hubLandscape()){HubRect timer=hr(8,48,276,90),note=hr(292,48,W-300,90),material=hr(8,146,W-16,54);const uint16_t tc=g_workshopTimerDone?UI_AMBER:(workshopTimerActive()?UI_ORANGE:UI_BORDER_2);hubV1125Card(timer,tc,true);uiDrawFit("WORKSHOP TIMER",timer.x+14,timer.y+11,timer.w-28,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);char tv[28];workshopTimerText(tv,sizeof(tv));uiDrawFit(workshopTimerActive()||g_workshopTimerDone?tv:"READY",timer.x+14,timer.y+37,timer.w-28,FONT_LARGE,TL_DATUM,g_workshopTimerDone?UI_AMBER:UI_TEXT,UI_PANEL_3);uiDrawFit(workshopTimerActive()?"Tools to manage":(g_workshopTimerDone?"Timer complete":"Presets ready"),timer.x+14,timer.y+77,timer.w-28,FONT_SMALL,BL_DATUM,UI_DIM,UI_PANEL_3);hubV1125Card(note,UI_BORDER_2,false);uiDrawFit("WORKSHOP NOTE",note.x+12,note.y+11,note.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(g_workshopNote[0]?g_workshopNote:"No note",note.x+12,note.y+39,note.w-24,FONT_BODY,TL_DATUM,g_workshopNote[0]?UI_TEXT:UI_DIM,UI_PANEL);hubV1125Card(material,UI_ORANGE,false);char value[48]="Unknown / external";char detail[68]="Inventory identity remains Unknown";if(s&&s->ams.present&&s->ams.activeTray<4&&s->ams.trays[s->ams.activeTray].present){const AmsTray&t=s->ams.trays[s->ams.activeTray];snprintf(value,sizeof(value),"A%u / %s",(unsigned)s->ams.activeTray+1,t.type[0]?t.type:"FILAMENT");if(t.remain>=0)snprintf(detail,sizeof(detail),"Printer telemetry %d%% / inventory ID Unknown",(int)t.remain);}uiDrawFit("MATERIAL PATH",material.x+12,material.y+10,100,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(value,material.x+122,material.y+10,150,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(detail,material.x+282,material.y+12,material.w-294,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);char timerLab[18];workshopTimerText(timerLab,sizeof(timerLab),true);for(uint8_t i=0;i<4;i++){const char* lab=i==0?(s&&s->lightState==1?"LIGHT OFF":"LIGHT ON"):i==1?(g_workshopTimerDone?"TIMER DONE":(workshopTimerActive()?timerLab:"TOOLS")):i==2?"SYSTEM":"PRINTER";const bool enabled=i!=0||(s&&s->connected);hubV1125Action(hubWorkshopActionRect(i),lab,i==1&&g_workshopTimerDone?UI_AMBER:UI_ORANGE,enabled,false);}}
  else{HubRect timer=hr(8,48,W-16,112),note=hr(8,168,W-16,80),material=hr(8,256,W-16,80);hubV1125Card(timer,workshopTimerActive()?UI_ORANGE:(g_workshopTimerDone?UI_AMBER:UI_BORDER_2),true);char tv[28];workshopTimerText(tv,sizeof(tv));uiDrawFit("WORKSHOP TIMER",timer.x+14,timer.y+12,timer.w-28,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(workshopTimerActive()||g_workshopTimerDone?tv:"READY",timer.x+14,timer.y+42,timer.w-28,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL_3);hubV1125Card(note,UI_BORDER_2,false);uiDrawFit("NOTE",note.x+12,note.y+12,note.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(g_workshopNote[0]?g_workshopNote:"No note",note.x+12,note.y+41,note.w-24,FONT_BODY,TL_DATUM,g_workshopNote[0]?UI_TEXT:UI_DIM,UI_PANEL);hubV1125Card(material,UI_ORANGE,false);uiDrawFit("MATERIAL PATH",material.x+12,material.y+12,material.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit("Inventory spool: Unknown",material.x+12,material.y+42,material.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);for(uint8_t i=0;i<4;i++){const char* lab=i==0?(s&&s->lightState==1?"LIGHT OFF":"LIGHT ON"):i==1?"TOOLS":i==2?"SYSTEM":"PRINTER";hubV1125Action(hubWorkshopActionRect(i),lab,UI_ORANGE,i!=0||(s&&s->connected),false);}}
  hubMarkFrameDirty();g_dirty=false;
}'''

MORE = r'''static void drawMore(bool full) {
  if(g_displayExperienceView){drawDisplayExperience(full);return;}if(g_toolsView){drawTools(full);return;}(void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("MORE",nullptr,3);uiBottomNav(3,nullptr);const char* titles[4]={"CUSTOM","SYSTEM","DISPLAY","TOOLS"};const char* subs[4]={"Personal dashboard","Health / network / access","Screen / standby / layout","Timers / workshop utilities"};for(uint8_t i=0;i<4;i++){HubRect r=hubV1125MoreRect(i);hubV1125Card(r,i==1?UI_ORANGE:UI_BORDER_2,false);tft.fillRoundRect(r.x+12,r.y+12,30,30,7,UI_PANEL_2);tft.drawRoundRect(r.x+12,r.y+12,30,30,7,UI_ORANGE);uiMoreIcon(hr(r.x+7,r.y+7,40,40),i,UI_ORANGE);if(hubLandscape()){uiDrawFit(titles[i],r.x+54,r.y+15,r.w-84,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(subs[i],r.x+54,r.y+43,r.w-84,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit(">",r.x+r.w-15,r.y+r.h/2,16,FONT_BODY,MR_DATUM,UI_ORANGE,UI_PANEL);}else{uiDrawFit(titles[i],r.x+12,r.y+54,r.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(subs[i],r.x+12,r.y+82,r.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);}}
  String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("No IP");char build[46];snprintf(build,sizeof(build),"Workshop OS %s",SMART_HOME_VERSION);if(hubLandscape()){HubRect d=hr(8,220,W-16,40);hubV1125Card(d,recoveryWebReady()?UI_GREEN:UI_AMBER,false);uiDrawFit(build,d.x+12,d.y+12,150,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(ip.c_str(),d.x+176,d.y+13,120,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit("ACCESS OPEN / TEST",d.x+d.w-12,d.y+13,150,FONT_SMALL,TR_DATUM,UI_ORANGE,UI_PANEL);}else{HubRect d=hr(10,326,W-20,86);hubV1125Card(d,recoveryWebReady()?UI_GREEN:UI_AMBER,false);uiDrawFit(build,d.x+12,d.y+12,d.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(ip.c_str(),d.x+12,d.y+42,d.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit("Access open / test",d.x+12,d.y+66,d.w-24,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL);}hubMarkFrameDirty();g_dirty=false;
}'''

SYSTEM = r'''static void drawSystem(bool full) {
  if(g_audioSettingsView){drawAudioSettings(full);return;}if(g_networkSettingsView){drawNetworkEssentials(full);return;}(void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);const bool wifi=WiFi.status()==WL_CONNECTED,touchOk=hubTouchHealthy(),recoveryOk=recoveryWebReady();const bool overall=wifi&&touchOk&&recoveryOk;drawHeader("SYSTEM",overall?"HEALTHY":"CHECK",3);uiBottomNav(3,nullptr);String ip=wifi?WiFi.localIP().toString():String("No IP");HubRect speakerBtn=hubSystemActionRect(0),micBtn=hubSystemActionRect(1),eventsBtn=hubSystemActionRect(2);
  if(hubLandscape()){HubRect health=hr(8,48,158,212),audio=hr(174,48,W-182,106),network=hr(174,162,142,98),portal=hr(324,162,W-332,98);hubV1125Card(health,overall?UI_GREEN:UI_AMBER,true);uiDrawFit("DEVICE HEALTH",health.x+12,health.y+11,health.w-24,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(overall?"Healthy":"Check",health.x+12,health.y+39,health.w-24,FONT_LARGE,TL_DATUM,overall?UI_GREEN:UI_AMBER,UI_PANEL_3);uiHealthDot(health.x+15,health.y+91,"Network",wifi);uiHealthDot(health.x+15,health.y+123,"Touch",touchOk,UI_ORANGE);uiHealthDot(health.x+15,health.y+155,"Recovery",recoveryOk,UI_ORANGE);char ver[30];snprintf(ver,sizeof(ver),"Workshop OS %s",SMART_HOME_VERSION);uiDrawFit(ver,health.x+12,health.y+190,health.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL_3);hubV1125Card(audio,UI_ORANGE,false);uiDrawFit("AUDIO / EVENTS",audio.x+12,audio.y+10,audio.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(g_audioDiagMessage,audio.x+12,audio.y+34,audio.w-24,FONT_BODY,TL_DATUM,g_audioDiagColor,UI_PANEL);hubV1125Action(speakerBtn,"SPEAKER",UI_ORANGE,true,false);hubV1125Action(micBtn,"MIC ECHO",UI_ORANGE,true,false);hubV1125Action(eventsBtn,buzzerSettings.enabled?"EVENTS ON":"EVENTS OFF",buzzerSettings.enabled?UI_GREEN:UI_ORANGE,true,false);hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);uiDrawFit("NETWORK",network.x+10,network.y+10,network.w-20,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);char net[24];snprintf(net,sizeof(net),wifi?"%d dBm":"OFFLINE",wifi?WiFi.RSSI():-100);uiDrawFit(net,network.x+10,network.y+36,network.w-20,FONT_LARGE,TL_DATUM,wifi?UI_TEXT:UI_RED,UI_PANEL);uiDrawFit(ip.c_str(),network.x+10,network.y+75,network.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);hubV1125Card(portal,UI_ORANGE,false);uiDrawFit("LOCAL ACCESS",portal.x+10,portal.y+10,portal.w-20,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit("OPEN",portal.x+10,portal.y+36,portal.w-20,FONT_LARGE,TL_DATUM,UI_ORANGE,UI_PANEL);uiDrawFit("TEST BUILD / NO CODE",portal.x+10,portal.y+75,portal.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);}
  else{HubRect health=hr(8,48,W-16,76),audio=hr(8,132,W-16,118),network=hr(8,258,W-16,72),portal=hr(8,338,W-16,74);hubV1125Card(health,overall?UI_GREEN:UI_AMBER,true);uiDrawFit("DEVICE HEALTH",health.x+12,health.y+12,health.w-24,FONT_SMALL,TL_DATUM,UI_ORANGE,UI_PANEL_3);uiDrawFit(overall?"Healthy":"Check device",health.x+12,health.y+39,health.w-24,FONT_LARGE,TL_DATUM,overall?UI_GREEN:UI_AMBER,UI_PANEL_3);hubV1125Card(audio,UI_ORANGE,false);uiDrawFit("AUDIO / EVENTS",audio.x+12,audio.y+12,audio.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(g_audioDiagMessage,audio.x+12,audio.y+42,audio.w-24,FONT_BODY,TL_DATUM,g_audioDiagColor,UI_PANEL);hubV1125Action(speakerBtn,"SPEAKER",UI_ORANGE,true,false);hubV1125Action(micBtn,"MIC ECHO",UI_ORANGE,true,false);hubV1125Action(eventsBtn,"EVENTS",buzzerSettings.enabled?UI_GREEN:UI_ORANGE,true,false);hubV1125Card(network,wifi?UI_GREEN:UI_RED,false);uiDrawFit("NETWORK",network.x+12,network.y+12,network.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit(ip.c_str(),network.x+12,network.y+40,network.w-24,FONT_BODY,TL_DATUM,wifi?UI_TEXT:UI_RED,UI_PANEL);hubV1125Card(portal,UI_ORANGE,false);uiDrawFit("LOCAL ACCESS",portal.x+12,portal.y+12,portal.w-24,FONT_SMALL,TL_DATUM,UI_MUTED,UI_PANEL);uiDrawFit("OPEN / TEST BUILD",portal.x+12,portal.y+42,portal.w-24,FONT_BODY,TL_DATUM,UI_ORANGE,UI_PANEL);}
  hubMarkFrameDirty();g_dirty=false;
}'''


def patch(repo: Path) -> None:
    build_path = repo / "include" / "smart_home_build.h"
    build = load(build_path)
    build = replace_once(build,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC2"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC3"',
        "RC3 build label")
    if "WORKSHOP_OS_V11_25_UI_OVERHAUL_RC3" not in build:
        build += "\n#define WORKSHOP_OS_V11_25_UI_OVERHAUL_RC3 1\n"
    build_path.write_text(build, encoding="utf-8")

    hub_path = repo / "src" / "smart_hub.cpp"
    hub = load(hub_path)
    for sig, repl, label in [
        ("static void hubV1125Card(", CARD, "card"),
        ("static void hubV1125Action(", ACTION, "action"),
        ("static void hubV1125TelemetryColumn(", TELEMETRY, "telemetry"),
        ("static void hubV1125AmsSlot(", AMS_SLOT, "AMS slot"),
        ("static void drawHeader(const char* title, const char* right, uint8_t page) {", HEADER, "header"),
        ("static void uiBottomNav(uint8_t active, const char* nextPage) {", BOTTOM_NAV, "bottom nav"),
        ("static void hubV1125ModeTabs() {", MODE_TABS, "mode tabs"),
        ("static void drawHome(bool full) {", HOME, "Home"),
        ("static void drawPrinter(bool full) {", PRINTER, "Printer"),
        ("static void drawWorkshop(bool full) {", WORKSHOP, "Workshop"),
        ("static void drawMore(bool full) {", MORE, "More"),
        ("static void drawSystem(bool full) {", SYSTEM, "System"),
    ]:
        hub = replace_block(hub, sig, repl, label)
    hub_path.write_text(hub, encoding="utf-8")

    css_path = repo / "web" / "app.css"
    css = load(css_path)
    marker = "Workshop OS v11.25 RC3 — premium portal polish"
    if marker in css:
        raise PatchError("RC3 portal CSS already applied")
    css_asset = load(HERE / "assets" / "v11_25_rc3_portal_polish.css")
    css_path.write_text(css.rstrip() + "\n\n" + css_asset.strip() + "\n", encoding="utf-8")
    print("Workshop OS v11.25 RC3 premium UI/UX + portal CSS applied")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if not a.apply:
        raise SystemExit("refusing to modify source without --apply")
    patch(Path(a.repo).resolve())
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
