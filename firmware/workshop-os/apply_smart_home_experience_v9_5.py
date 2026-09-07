#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse

class PatchError(RuntimeError):
    pass

def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise PatchError(f"{label}: start anchor not found")
    b = text.find(end, a)
    if b < 0:
        raise PatchError(f"{label}: end anchor not found")
    return text[:a] + replacement + text[b:]

def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {n}")
    return text.replace(old, new, 1)

HELPERS = r'''// ---------------------------------------------------------------------------
// Smart Home v9.5 smooth-render helpers
// ---------------------------------------------------------------------------
static uint32_t uiAmsSignature(const BambuState& s) {
  uint32_t sig = 2166136261u;
  sig = (sig ^ (uint8_t)(s.ams.present ? 1 : 0)) * 16777619u;
  sig = (sig ^ (uint8_t)s.ams.unitCount) * 16777619u;
  sig = (sig ^ (uint8_t)(s.ams.activeTray + 1)) * 16777619u;
  for (uint8_t i = 0; i < 4; i++) {
    const AmsTray& tr = s.ams.trays[i];
    sig = (sig ^ (uint8_t)(tr.present ? 1 : 0)) * 16777619u;
    sig = (sig ^ (uint16_t)tr.colorRgb565) * 16777619u;
    sig = (sig ^ (uint8_t)(tr.remain + 1)) * 16777619u;
    for (uint8_t j = 0; tr.type[j] && j < 8; j++)
      sig = (sig ^ (uint8_t)tr.type[j]) * 16777619u;
  }
  if (s.ams.present && s.ams.unitCount > 0) {
    const AmsUnit& u = s.ams.units[0];
    sig = (sig ^ (uint16_t)(u.temp * 10.0f + 0.5f)) * 16777619u;
    sig = (sig ^ (uint16_t)u.humidityRaw) * 16777619u;
    sig = (sig ^ (uint8_t)u.humidity) * 16777619u;
  }
  return sig;
}

static uint32_t uiTextSignature(const char* a, const char* b = nullptr,
                                const char* c = nullptr) {
  uint32_t sig = 2166136261u;
  const char* parts[3] = {a, b, c};
  for (uint8_t p = 0; p < 3; p++) {
    const char* s = parts[p];
    if (!s) continue;
    while (*s) sig = (sig ^ (uint8_t)*s++) * 16777619u;
    sig = (sig ^ 0xffu) * 16777619u;
  }
  return sig;
}

'''

HOME = r'''static void drawHome(bool full) {
  static bool initialized = false;
  static bool prevConfigured = false;
  static bool prevSetupWifi = false;
  static uint32_t prevSetupIp = 0xffffffffu;
  static uint8_t prevState = 0xff;
  static uint8_t prevProgress = 0xff;
  static uint16_t prevRemain = 0xffff;
  static uint16_t prevLayer = 0xffff;
  static uint16_t prevLayers = 0xffff;
  static int16_t prevNozzle = -32768;
  static int16_t prevBed = -32768;
  static int16_t prevChamber = -32768;
  static int16_t prevFan = -32768;
  static int8_t prevWifi = 127;
  static uint8_t prevSpeed = 0xff;
  static uint8_t prevAlerts = 0xff;
  static uint32_t prevAmsSig = 0xffffffffu;
  static uint32_t prevHeroTextSig = 0xffffffffu;

  const bool configured = isAnyPrinterConfigured();
  const bool layoutReset = full || !initialized || configured != prevConfigured;
  bool painted = false;

  if (layoutReset) {
    tft.fillScreen(UI_BG);
    drawHeader("HOME", "SMOOTH UI", 0);
    uiBottomNav(0, "WORKSHOP");
    initialized = true;
    prevConfigured = configured;
    prevState = prevProgress = prevSpeed = prevAlerts = 0xff;
    prevRemain = prevLayer = prevLayers = 0xffff;
    prevNozzle = prevBed = prevChamber = prevFan = -32768;
    prevWifi = 127;
    prevAmsSig = prevHeroTextSig = 0xffffffffu;
    painted = true;
  }

  const int16_t W = tft.width();
  if (!configured) {
    const bool wifiReady = WiFi.status() == WL_CONNECTED;
    const uint32_t ip = wifiReady ? (uint32_t)WiFi.localIP() : 0;
    if (layoutReset || wifiReady != prevSetupWifi || ip != prevSetupIp) {
      uiCard(10, 48, W - 20, 330, UI_ORANGE, true);
      uiPrinterArt(62, 84, 196, 150, UI_ORANGE);
      setFont(tft, FONT_LARGE);
      tft.setTextDatum(TC_DATUM);
      tft.setTextColor(UI_TEXT, UI_PANEL);
      tft.drawString("READY FOR A PRINTER", W / 2, 254);
      setFont(tft, FONT_SMALL);
      tft.setTextColor(UI_DIM, UI_PANEL);
      tft.drawString(wifiReady ? "Open the web portal and scan your LAN"
                               : "Connect WiFi, then open the web portal",
                     W / 2, 286);
      String setupAddress = wifiReady ? WiFi.localIP().toString()
                                      : String("WiFi setup required");
      setFont(tft, FONT_BODY);
      tft.setTextColor(wifiReady ? UI_GREEN : UI_AMBER, UI_PANEL);
      tft.drawString(setupAddress, W / 2, 312);
      uiPill(79, 342, 162, wifiReady ? "LAN SCAN READY" : "SETUP REQUIRED",
             wifiReady ? UI_GREEN : UI_AMBER);
      prevSetupWifi = wifiReady;
      prevSetupIp = ip;
      painted = true;
    }
    if (painted) markFrameDirty();
    g_dirty = false;
    return;
  }

  const PrinterSlot& p = displayedPrinter();
  const BambuState& s = p.state;
  const uint16_t stateColor = uiStateColor(s);
  char printerName[24], job[34];
  uiCopyShort(printerName, sizeof(printerName),
              p.config.name[0] ? p.config.name : "Bambu printer", 20);
  uiCopyShort(job, sizeof(job), jobDisplayName(s), 29);
  const uint32_t heroTextSig = uiTextSignature(printerName, job, stateText(s));
  const uint8_t state = (uint8_t)s.gcodeStateId;

  if (layoutReset || state != prevState || s.progress != prevProgress ||
      s.remainingMinutes != prevRemain || s.layerNum != prevLayer ||
      s.totalLayers != prevLayers || heroTextSig != prevHeroTextSig) {
    uiCard(8, 43, W - 16, 168, UI_ORANGE, true);
    setFont(tft, FONT_BODY);
    tft.setTextDatum(TL_DATUM);
    tft.setTextColor(UI_TEXT, UI_PANEL);
    tft.drawString(printerName, 20, 54);
    uiPill(W - 88, 50, 68, stateText(s), stateColor);
    setFont(tft, FONT_SMALL);
    tft.setTextColor(UI_DIM, UI_PANEL);
    tft.drawString(job, 20, 82);
    uiPrinterArt(22, 100, 126, 88, stateColor);
    uiProgressRing(250, 132, 43, s.progress, UI_ORANGE);
    char pct[12]; snprintf(pct, sizeof(pct), "%u%%", (unsigned)s.progress);
    setFont(tft, FONT_LARGE); tft.setTextDatum(MC_DATUM);
    tft.setTextColor(UI_TEXT, UI_PANEL); tft.drawString(pct, 250, 128);
    setFont(tft, FONT_SMALL); tft.setTextColor(UI_ORANGE, UI_PANEL);
    tft.drawString(s.printing ? "PRINTING" : stateText(s), 250, 151);
    char remain[18]; formatDuration(s.remainingMinutes, remain, sizeof(remain));
    char layer[20]; snprintf(layer, sizeof(layer), "L%u / %u",
      (unsigned)s.layerNum, (unsigned)s.totalLayers);
    setFont(tft, FONT_SMALL); tft.setTextDatum(BL_DATUM);
    tft.setTextColor(UI_DIM, UI_PANEL); tft.drawString("ETA", 20, 198);
    tft.setTextColor(UI_TEXT, UI_PANEL); tft.drawString(remain, 52, 198);
    tft.setTextDatum(BR_DATUM); tft.setTextColor(UI_DIM, UI_PANEL);
    tft.drawString(layer, W - 20, 198);
    prevState = state; prevProgress = s.progress; prevRemain = s.remainingMinutes;
    prevLayer = s.layerNum; prevLayers = s.totalLayers; prevHeroTextSig = heroTextSig;
    painted = true;
  }

  const int16_t tileY = 219, gap = 5;
  const int16_t tileW = (W - 16 - gap * 3) / 4;
  const int16_t noz = (int16_t)(s.nozzleTemp + 0.5f);
  const int16_t bed = (int16_t)(s.bedTemp + 0.5f);
  const int16_t chamber = (int16_t)(s.chamberTemp + 0.5f);
  const int16_t fan = (int16_t)s.coolingFanPct;
  char value[18];
  if (layoutReset || noz != prevNozzle) { snprintf(value,sizeof(value),"%d°",noz); uiMetric(8,tileY,tileW,58,"NOZZLE",value,UI_ORANGE); prevNozzle=noz; painted=true; }
  if (layoutReset || bed != prevBed) { snprintf(value,sizeof(value),"%d°",bed); uiMetric(8+(tileW+gap),tileY,tileW,58,"BED",value,UI_AMBER); prevBed=bed; painted=true; }
  if (layoutReset || chamber != prevChamber) { snprintf(value,sizeof(value),"%d°",chamber); uiMetric(8+(tileW+gap)*2,tileY,tileW,58,"CHAMBER",value,UI_BLUE); prevChamber=chamber; painted=true; }
  if (layoutReset || fan != prevFan) { snprintf(value,sizeof(value),"%d%%",fan); uiMetric(8+(tileW+gap)*3,tileY,tileW,58,"FAN",value,UI_CYAN); prevFan=fan; painted=true; }

  const uint32_t amsSig = uiAmsSignature(s);
  if (layoutReset || amsSig != prevAmsSig) {
    uiCard(8, 285, W - 16, 106, UI_PURPLE, false);
    uiSectionLabel(18, 295, "AMS / FILAMENT", UI_PURPLE);
    uint8_t trayCount = s.ams.present ? s.ams.unitCount * 4 : 0;
    if (trayCount > 4) trayCount = 4;
    if (trayCount == 0) {
      setFont(tft, FONT_BODY); tft.setTextDatum(MC_DATUM);
      tft.setTextColor(UI_DIM, UI_PANEL); tft.drawString("No AMS data", W / 2, 345);
    } else {
      const int16_t cell = (W - 28) / 4;
      for (uint8_t i = 0; i < 4; i++) {
        const AmsTray& tr = s.ams.trays[i]; int16_t cx = 20 + cell / 2 + i * cell;
        if (i < trayCount && tr.present) {
          uiSpool(cx,337,tr.colorRgb565,tr.remain,s.ams.activeTray==i);
          char type[9]; uiCopyShort(type,sizeof(type),tr.type,7);
          setFont(tft,FONT_SMALL); tft.setTextDatum(TC_DATUM);
          tft.setTextColor(UI_DIM,UI_PANEL); tft.drawString(type,cx,372);
        } else {
          tft.drawCircle(cx,337,18,UI_BORDER); setFont(tft,FONT_SMALL);
          tft.setTextDatum(MC_DATUM); tft.setTextColor(UI_MUTED,UI_PANEL); tft.drawString("—",cx,337);
        }
      }
    }
    prevAmsSig = amsSig; painted = true;
  }

  const int8_t wifi = s.wifiSignal;
  const uint8_t speed = s.speedLevel;
  const uint8_t alerts = uiHmsCount(s);
  if (layoutReset || wifi != prevWifi || speed != prevSpeed || alerts != prevAlerts) {
    uiPanelFill(8,399,W-16,32);
    char strip[64]; snprintf(strip,sizeof(strip),"WiFi %d dBm   •   %s   •   %u alert%s",
      (int)wifi,uiSpeedText(speed),(unsigned)alerts,alerts==1?"":"s");
    setFont(tft,FONT_SMALL); tft.setTextDatum(MC_DATUM);
    tft.setTextColor(alerts?UI_AMBER:UI_GREEN,UI_PANEL_2); tft.drawString(strip,W/2,415);
    prevWifi=wifi; prevSpeed=speed; prevAlerts=alerts; painted=true;
  }

  if (painted) markFrameDirty();
  g_dirty = false;
}

'''

WORKSHOP = r'''static void drawWorkshop(bool full) {
  static bool initialized = false;
  static bool prevConfigured = false;
  static uint8_t prevState = 0xff, prevHeroProgress = 0xff, prevPrintProgress = 0xff, prevSpeed = 0xff, prevAlerts = 0xff;
  static uint16_t prevRemain = 0xffff, prevLayer = 0xffff, prevLayers = 0xffff;
  static int16_t prevChamber = -32768, prevFan = -32768;
  static int8_t prevWifi = 127, prevLight = -99;
  static uint32_t prevAmsSig = 0xffffffffu;

  const bool configured = isAnyPrinterConfigured();
  const bool layoutReset = full || !initialized || configured != prevConfigured;
  bool painted = false;
  if (layoutReset) {
    tft.fillScreen(UI_BG);
    drawHeader("WORKSHOP", "LIVE HUB", 1);
    uiBottomNav(1, "CUSTOM");
    initialized = true; prevConfigured = configured;
    prevState=prevHeroProgress=prevPrintProgress=prevSpeed=prevAlerts=0xff;
    prevRemain=prevLayer=prevLayers=0xffff;
    prevChamber=prevFan=-32768; prevWifi=127; prevLight=-99; prevAmsSig=0xffffffffu;
    painted=true;
  }

  const int16_t W=tft.width();
  if (!configured) {
    if (layoutReset) {
      uiCard(10,48,W-20,350,UI_BLUE,true); setFont(tft,FONT_LARGE);
      tft.setTextDatum(MC_DATUM); tft.setTextColor(UI_TEXT,UI_PANEL); tft.drawString("WORKSHOP",W/2,120);
      setFont(tft,FONT_BODY); tft.setTextColor(UI_DIM,UI_PANEL); tft.drawString("Printer + AMS tools appear here",W/2,158);
      uiPrinterArt(62,196,196,130,UI_BLUE);
    }
    if (painted) markFrameDirty(); g_dirty=false; return;
  }

  const PrinterSlot& p=displayedPrinter(); const BambuState& s=p.state;
  const uint8_t state=(uint8_t)s.gcodeStateId; const uint16_t stateColor=uiStateColor(s);
  if (layoutReset || state!=prevState || s.progress!=prevHeroProgress) {
    uiCard(8,43,W-16,86,UI_ORANGE,true); setFont(tft,FONT_LARGE); tft.setTextDatum(TL_DATUM);
    tft.setTextColor(UI_ORANGE,UI_PANEL); tft.drawString("WORKSHOP",20,53);
    setFont(tft,FONT_SMALL); tft.setTextColor(UI_DIM,UI_PANEL); tft.drawString("Printer + AMS command center",20,83);
    uiPrinterArt(W-116,53,96,64,stateColor); char stateLine[28];
    snprintf(stateLine,sizeof(stateLine),"%s • %u%%",stateText(s),(unsigned)s.progress);
    uiPill(20,101,96,stateLine,stateColor); prevState=state; prevHeroProgress=s.progress; painted=true;
  }

  const int16_t colGap=7, colW=(W-16-colGap)/2;
  if (layoutReset || s.progress!=prevPrintProgress || s.remainingMinutes!=prevRemain || s.layerNum!=prevLayer || s.totalLayers!=prevLayers) {
    uiCard(8,137,colW,92,UI_ORANGE,false); uiSectionLabel(18,146,"PRINT",UI_ORANGE);
    char pct[12]; snprintf(pct,sizeof(pct),"%u%%",(unsigned)s.progress); setFont(tft,FONT_LARGE);
    tft.setTextDatum(TL_DATUM); tft.setTextColor(UI_ORANGE,UI_PANEL); tft.drawString(pct,18,168);
    char remain[18]; formatDuration(s.remainingMinutes,remain,sizeof(remain)); char line[22];
    snprintf(line,sizeof(line),"ETA %s",remain); setFont(tft,FONT_SMALL); tft.setTextColor(UI_DIM,UI_PANEL); tft.drawString(line,18,198);
    snprintf(line,sizeof(line),"Layer %u/%u",(unsigned)s.layerNum,(unsigned)s.totalLayers); tft.drawString(line,18,214);
    prevRemain=s.remainingMinutes; prevLayer=s.layerNum; prevLayers=s.totalLayers; prevPrintProgress=s.progress; painted=true;
  }

  const int16_t chamber=(int16_t)(s.chamberTemp+0.5f), fan=(int16_t)s.coolingFanPct; const int8_t wifi=s.wifiSignal;
  const int16_t rx=8+colW+colGap;
  if (layoutReset || chamber!=prevChamber || fan!=prevFan || wifi!=prevWifi) {
    uiCard(rx,137,colW,92,UI_CYAN,false); uiSectionLabel(rx+10,146,"ENVIRONMENT",UI_CYAN);
    char env[20]; snprintf(env,sizeof(env),"%d°C",chamber); setFont(tft,FONT_LARGE); tft.setTextDatum(TL_DATUM);
    tft.setTextColor(UI_BLUE,UI_PANEL); tft.drawString(env,rx+10,168); setFont(tft,FONT_SMALL); tft.setTextColor(UI_DIM,UI_PANEL);
    snprintf(env,sizeof(env),"Fan %d%%",fan); tft.drawString(env,rx+10,198); snprintf(env,sizeof(env),"WiFi %d dBm",(int)wifi); tft.drawString(env,rx+10,214);
    prevChamber=chamber; prevFan=fan; prevWifi=wifi; painted=true;
  }

  const uint32_t amsSig=uiAmsSignature(s);
  if (layoutReset || amsSig!=prevAmsSig) {
    uiCard(8,237,W-16,122,UI_PURPLE,false); uiSectionLabel(18,246,"MATERIAL DECK",UI_PURPLE);
    uint8_t trayCount=s.ams.present?s.ams.unitCount*4:0; if(trayCount>4)trayCount=4; const int16_t cell=(W-28)/4;
    for(uint8_t i=0;i<4;i++){int16_t cx=20+cell/2+i*cell; if(i<trayCount&&s.ams.trays[i].present){const AmsTray& tr=s.ams.trays[i];
      uiSpool(cx,294,tr.colorRgb565,tr.remain,s.ams.activeTray==i); char type[9];uiCopyShort(type,sizeof(type),tr.type,7);setFont(tft,FONT_SMALL);tft.setTextDatum(TC_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(type,cx,332);
    } else {tft.drawCircle(cx,294,19,UI_BORDER);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_MUTED,UI_PANEL);tft.drawString("—",cx,294);}}
    if(s.ams.present&&s.ams.unitCount>0){const AmsUnit& u=s.ams.units[0];char line[46];if(u.humidityRaw>0)snprintf(line,sizeof(line),"AMS %.1f°C  •  RH %u%%",u.temp,(unsigned)u.humidityRaw);else snprintf(line,sizeof(line),"AMS %.1f°C  •  humidity level %u",u.temp,(unsigned)u.humidity);setFont(tft,FONT_SMALL);tft.setTextDatum(BC_DATUM);tft.setTextColor(UI_CYAN,UI_PANEL);tft.drawString(line,W/2,352);}
    prevAmsSig=amsSig; painted=true;
  }

  const int8_t light=s.lightState; const uint8_t speed=s.speedLevel, alerts=uiHmsCount(s);
  if(layoutReset||light!=prevLight||speed!=prevSpeed||alerts!=prevAlerts){
    uiCard(8,367,W-16,64,UI_GREEN,false);uiSectionLabel(18,375,"LIVE STATUS",UI_GREEN);char lightText[16];strlcpy(lightText,light==1?"LIGHT ON":light==0?"LIGHT OFF":"LIGHT —",sizeof(lightText));
    uiPill(18,399,83,lightText,light==1?UI_AMBER:UI_DIM);uiPill(109,399,94,uiSpeedText(speed),UI_BLUE);char alertText[18];snprintf(alertText,sizeof(alertText),"%u ALERT%s",(unsigned)alerts,alerts==1?"":"S");uiPill(211,399,91,alertText,alerts?UI_AMBER:UI_GREEN);
    prevLight=light;prevSpeed=speed;prevAlerts=alerts;painted=true;
  }
  if(painted)markFrameDirty();g_dirty=false;
}

'''

CUSTOM = r'''static void drawCustom(bool full) {
  static bool initialized=false;
  static bool prevHasUrl=false;
  static uint32_t prevFeedSig=0xffffffffu;
  static uint8_t prevProgress=0xff;
  static int16_t prevNozzle=-32768,prevBed=-32768;
  static int8_t prevWifi=127;
  static uint16_t prevUptimeMin=0xffff;
  const bool hasUrl=g_cfg.customUrl[0]!=0;
  const bool layoutReset=full||!initialized||hasUrl!=prevHasUrl;
  bool painted=false;
  if(layoutReset){tft.fillScreen(UI_BG);drawHeader("CUSTOM",hasUrl?(g_custom.healthy?"LIVE FEED":"WIDGETS"):"WIDGET DECK",2);uiBottomNav(2,"SYSTEM");initialized=true;prevHasUrl=hasUrl;prevFeedSig=0xffffffffu;prevProgress=0xff;prevNozzle=prevBed=-32768;prevWifi=127;prevUptimeMin=0xffff;painted=true;}
  const int16_t W=tft.width();

  if(!hasUrl){
    const bool configured=isAnyPrinterConfigured();
    const BambuState* sp=configured?&displayedPrinter().state:nullptr;
    const uint8_t progress=sp?sp->progress:0;
    const int16_t nozzle=sp?(int16_t)(sp->nozzleTemp+0.5f):0;
    const int16_t bed=sp?(int16_t)(sp->bedTemp+0.5f):0;
    const int8_t wifi=WiFi.status()==WL_CONNECTED?WiFi.RSSI():-100;
    const uint16_t uptimeMin=(uint16_t)(millis()/60000UL);
    if(layoutReset){
      uiCard(8,45,W-16,78,UI_PURPLE,true);setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("MY WIDGETS",20,57);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("Built-in live deck • custom JSON feed optional",20,91);
    }
    const int16_t gap=8,margin=8,cardW=(W-margin*2-gap)/2,cardH=104,top=134;
    if(layoutReset||progress!=prevProgress){char v[16];snprintf(v,sizeof(v),"%u%%",(unsigned)progress);uiMetric(margin,top,cardW,cardH,"PRINT PROGRESS",configured?v:"—",UI_ORANGE,configured?(sp->printing?"active job":"printer ready"):"configure printer");prevProgress=progress;painted=true;}
    if(layoutReset||nozzle!=prevNozzle){char v[16];snprintf(v,sizeof(v),"%d°C",nozzle);uiMetric(margin+cardW+gap,top,cardW,cardH,"NOZZLE",configured?v:"—",UI_CYAN,configured?stateText(*sp):"offline");prevNozzle=nozzle;painted=true;}
    if(layoutReset||bed!=prevBed){char v[16];snprintf(v,sizeof(v),"%d°C",bed);uiMetric(margin,top+cardH+gap,cardW,cardH,"BED",configured?v:"—",UI_AMBER,"live thermal");prevBed=bed;painted=true;}
    if(layoutReset||wifi!=prevWifi||uptimeMin!=prevUptimeMin){char v[18];snprintf(v,sizeof(v),"%d dBm",(int)wifi);char sub[24];snprintf(sub,sizeof(sub),"uptime %uh %02um",(unsigned)(uptimeMin/60),(unsigned)(uptimeMin%60));uiMetric(margin+cardW+gap,top+cardH+gap,cardW,cardH,"DEVICE",WiFi.status()==WL_CONNECTED?v:"Offline",UI_GREEN,sub);prevWifi=wifi;prevUptimeMin=uptimeMin;painted=true;}
    if(layoutReset){uiCard(8,358,W-16,61,UI_BLUE,false);uiSectionLabel(18,367,"CUSTOMIZE",UI_BLUE);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("Web portal → Home → Customize widgets",18,394);}
    if(painted)markFrameDirty();g_dirty=false;return;
  }

  uint32_t feedSig=uiTextSignature(g_custom.title,g_custom.subtitle,g_custom.footer);
  feedSig=(feedSig^(uint8_t)(g_custom.valid?1:0))*16777619u; feedSig=(feedSig^(uint8_t)(g_custom.healthy?1:0))*16777619u; feedSig=(feedSig^(uint16_t)g_custom.httpCode)*16777619u;
  for(uint8_t i=0;i<4;i++){feedSig^=uiTextSignature(g_custom.metrics[i].label,g_custom.metrics[i].value);feedSig*=16777619u;}
  if(!layoutReset && !g_dirty && feedSig==prevFeedSig)return;
  tft.fillRect(0,39,W,tft.height()-82,UI_BG);
  if(!g_custom.valid){
    uiCard(8,45,W-16,374,UI_AMBER,true);tft.fillCircle(W/2,112,32,UI_WARN_BG);tft.drawCircle(W/2,112,32,UI_AMBER);setFont(tft,FONT_LARGE);tft.setTextDatum(MC_DATUM);tft.setTextColor(UI_AMBER,UI_WARN_BG);tft.drawString("!",W/2,112);setFont(tft,FONT_BODY);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("CUSTOM FEED OFFLINE",W/2,168);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);char msg[48];uiCopyShort(msg,sizeof(msg),g_custom.message,42);tft.drawString(msg,W/2,198);tft.drawString("BambuHelper retries automatically",W/2,222);uiPill(96,258,128,"AUTO RETRY",UI_AMBER);
  } else {
    uiCard(8,45,W-16,92,UI_PURPLE,true);setFont(tft,FONT_LARGE);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);char title[30];uiCopyShort(title,sizeof(title),g_custom.title,25);tft.drawString(title,20,57);setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);char sub[42];uiCopyShort(sub,sizeof(sub),g_custom.subtitle,38);tft.drawString(sub,20,88);uiPill(218,103,82,g_custom.healthy?"LIVE":"FEED",g_custom.healthy?UI_GREEN:UI_AMBER);
    const uint16_t accents[4]={UI_CYAN,UI_ORANGE,UI_GREEN,UI_PURPLE};const int16_t gap=8,margin=8,cardW=(W-margin*2-gap)/2,cardH=96,top=146;
    for(uint8_t i=0;i<4;i++){int16_t x=margin+(i%2)*(cardW+gap),y=top+(i/2)*(cardH+gap);const char* label=i<g_custom.metricCount?g_custom.metrics[i].label:"WIDGET";const char* value=i<g_custom.metricCount?g_custom.metrics[i].value:"—";uiCard(x,y,cardW,cardH,accents[i],false);tft.fillCircle(x+23,y+24,11,i==0?UI_CYAN_BG:i==1?UI_WARN_BG:i==2?UI_GREEN_BG:UI_PURP_BG);tft.fillCircle(x+23,y+24,4,accents[i]);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(label&&*label?label:"WIDGET",x+43,y+14);setFont(tft,FONT_LARGE);tft.setTextColor(accents[i],UI_PANEL);char val[22];uiCopyShort(val,sizeof(val),value,17);tft.drawString(val,x+13,y+53);}
    uiCard(8,354,W-16,65,UI_BLUE,false);uiSectionLabel(18,363,"FEED STATUS",UI_BLUE);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);const char* foot=g_custom.footer[0]?g_custom.footer:g_custom.status;char footer[48];uiCopyShort(footer,sizeof(footer),foot&&*foot?foot:"Endpoint healthy",42);tft.drawString(footer,18,389);char http[18];snprintf(http,sizeof(http),"HTTP %d",g_custom.httpCode);tft.setTextDatum(TR_DATUM);tft.setTextColor(UI_GREEN,UI_PANEL);tft.drawString(http,W-18,389);
  }
  prevFeedSig=feedSig;painted=true;if(painted)markFrameDirty();g_dirty=false;
}

'''

SYSTEM = r'''static void drawSystem(bool full) {
  static bool initialized=false;
  static bool prevWifiUp=false;
  static int prevRssi=999;
  static uint32_t prevIp=0xffffffffu;
  static uint16_t prevUptimeMin=0xffff;
  static uint16_t prevFreeHeap=0xffff,prevMinHeap=0xffff,prevMaxBlock=0xffff,prevPsram=0xffff;
  static unsigned long lastMemorySample=0;
  const bool layoutReset=full||!initialized;
  bool painted=false;
  if(layoutReset){
    tft.fillScreen(UI_BG);drawHeader("SYSTEM","SMOOTH UI",3);uiBottomNav(3,"PRINTER");initialized=true;
    prevRssi=999;prevIp=0xffffffffu;prevUptimeMin=0xffff;prevFreeHeap=prevMinHeap=prevMaxBlock=prevPsram=0xffff;lastMemorySample=0;painted=true;
    const int16_t W=tft.width();uiCard(8,143,W-16,72,UI_PURPLE,false);uiShield(29,178,UI_PURPLE);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("PORTAL CODE",52,153);setFont(tft,FONT_LARGE);tft.setTextColor(UI_PURPLE,UI_PANEL);tft.drawString(securityPortalCode(),52,174);setFont(tft,FONT_SMALL);tft.setTextColor(UI_GREEN,UI_PANEL);tft.drawString("RAM session • rotates on reboot",52,198);
    uiCard(8,364,W-16,67,UI_ORANGE,false);setFont(tft,FONT_SMALL);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString("FIRMWARE",18,374);setFont(tft,FONT_BODY);tft.setTextColor(UI_TEXT,UI_PANEL);char ver[48];snprintf(ver,sizeof(ver),"BambuHelper %s • %s",FW_VERSION,SMART_HOME_VERSION);tft.drawString(ver,18,391);setFont(tft,FONT_SMALL);tft.setTextColor(UI_ORANGE,UI_PANEL);tft.drawString("RECOVERY • SMOOTH WIDGETS • DEV",18,414);
  }
  const int16_t W=tft.width();const bool wifiUp=WiFi.status()==WL_CONNECTED;const int rssi=wifiUp?WiFi.RSSI():-100;const uint32_t ip=wifiUp?(uint32_t)WiFi.localIP():0;const uint16_t uptimeMin=(uint16_t)(millis()/60000UL);
  if(layoutReset||wifiUp!=prevWifiUp||rssi!=prevRssi||ip!=prevIp||uptimeMin!=prevUptimeMin){
    uiCard(8,43,W-16,92,wifiUp?UI_GREEN:UI_RED,true);uiWifiGlyph(20,57,rssi);setFont(tft,FONT_BODY);tft.setTextDatum(TL_DATUM);tft.setTextColor(UI_TEXT,UI_PANEL);tft.drawString("WiFi & Network",57,53);uiPill(219,50,81,wifiUp?"CONNECTED":"OFFLINE",wifiUp?UI_GREEN:UI_RED);char wifi[24];snprintf(wifi,sizeof(wifi),wifiUp?"%d dBm":"Offline",rssi);setFont(tft,FONT_LARGE);tft.setTextColor(wifiUp?UI_GREEN:UI_RED,UI_PANEL);tft.drawString(wifi,20,87);String ips=wifiUp?WiFi.localIP().toString():String("No IP");setFont(tft,FONT_SMALL);tft.setTextColor(UI_DIM,UI_PANEL);tft.drawString(ips,20,116);char uptime[24];snprintf(uptime,sizeof(uptime),"%uh %02um",(unsigned)(uptimeMin/60),(unsigned)(uptimeMin%60));tft.setTextDatum(TR_DATUM);tft.drawString(uptime,W-20,116);prevWifiUp=wifiUp;prevRssi=rssi;prevIp=ip;prevUptimeMin=uptimeMin;painted=true;
  }
  const unsigned long now=millis();
  if(layoutReset||lastMemorySample==0||now-lastMemorySample>=10000UL){
    const uint16_t freeHeap=(uint16_t)(ESP.getFreeHeap()/1024),minHeap=(uint16_t)(ESP.getMinFreeHeap()/1024),maxBlock=(uint16_t)(ESP.getMaxAllocHeap()/1024),psram=(uint16_t)(ESP.getFreePsram()/1024);
    const int16_t gap=7,cw=(W-16-gap)/2;char b[20];
    if(layoutReset||freeHeap!=prevFreeHeap){snprintf(b,sizeof(b),"%u KB",(unsigned)freeHeap);uiMetric(8,223,cw,63,"FREE HEAP",b,UI_CYAN);prevFreeHeap=freeHeap;painted=true;}
    if(layoutReset||minHeap!=prevMinHeap){snprintf(b,sizeof(b),"%u KB",(unsigned)minHeap);uiMetric(8+cw+gap,223,cw,63,"MIN HEAP",b,UI_AMBER);prevMinHeap=minHeap;painted=true;}
    if(layoutReset||maxBlock!=prevMaxBlock){snprintf(b,sizeof(b),"%u KB",(unsigned)maxBlock);uiMetric(8,293,cw,63,"MAX BLOCK",b,UI_BLUE);prevMaxBlock=maxBlock;painted=true;}
    if(layoutReset||psram!=prevPsram){snprintf(b,sizeof(b),"%u KB",(unsigned)psram);uiMetric(8+cw+gap,293,cw,63,"PSRAM FREE",b,UI_PURPLE);prevPsram=psram;painted=true;}
    lastMemorySample=now;
  }
  if(painted)markFrameDirty();g_dirty=false;
}

'''

BROWSER_JS = r'''

/* Smart Home v9.5 customizable browser widgets */
var CC_WIDGET_KEY='waveshare_widgets_v95';
var CC_WIDGET_IDS=['live','printer','display','device','quick'];
function ccWidgetPrefs(){try{var v=JSON.parse(localStorage.getItem(CC_WIDGET_KEY)||'null');if(v&&Array.isArray(v.visible))return v;}catch(e){}return{visible:CC_WIDGET_IDS.slice()}}
function ccSaveWidgetPrefs(p){try{localStorage.setItem(CC_WIDGET_KEY,JSON.stringify(p))}catch(e){}}
function ccApplyWidgetPrefs(){var p=ccWidgetPrefs();CC_WIDGET_IDS.forEach(function(id){var e=document.querySelector('[data-cc-widget="'+id+'"]');if(e)e.hidden=p.visible.indexOf(id)<0});}
function ccToggleWidget(id,on){var p=ccWidgetPrefs(),i=p.visible.indexOf(id);if(on&&i<0)p.visible.push(id);if(!on&&i>=0)p.visible.splice(i,1);ccSaveWidgetPrefs(p);ccApplyWidgetPrefs()}
function ccToggleWidgetEditor(){var e=document.getElementById('ccWidgetEditor');if(e)e.hidden=!e.hidden}
function ccInstallWidgetEditor(){
  var sec=document.getElementById('sec-home'),grid=sec&&sec.querySelector('.cc-grid');if(!grid||document.getElementById('ccWidgetEditor'))return;
  var existing=grid.querySelectorAll('.cc-panel');var ids=['printer','display','device','quick'];for(var i=0;i<existing.length&&i<ids.length;i++)existing[i].setAttribute('data-cc-widget',ids[i]);
  var live=document.createElement('div');live.className='card cc-panel cc-live-widget';live.setAttribute('data-cc-widget','live');live.innerHTML='<div class="cc-panel-head"><div><span class="cc-label">LIVE PRINT</span><h3 id="ccLiveName">Selected printer</h3></div><span class="cc-live-state" id="ccLiveState">Checking…</span></div><div class="cc-progress-track"><span id="ccLiveBar"></span></div><div class="cc-live-metrics"><div><span>Progress</span><strong id="ccLiveProgress">—</strong></div><div><span>Nozzle</span><strong id="ccLiveNozzle">—</strong></div><div><span>Bed</span><strong id="ccLiveBed">—</strong></div><div><span>Layer</span><strong id="ccLiveLayer">—</strong></div></div><div class="cc-panel-actions"><button type="button" class="cc-action" onclick="loadSection(\'printer\')"><strong>Printer setup</strong><span>Connection & gauges</span></button><button type="button" class="cc-action" onclick="ccVerifyPrinter()"><strong>Verify now</strong><span>Test connection</span></button></div>';
  grid.insertBefore(live,grid.firstChild);
  var hero=sec.querySelector('.cc-actions');if(hero){var b=document.createElement('button');b.type='button';b.className='btn btn-ghost';b.textContent='Customize widgets';b.onclick=ccToggleWidgetEditor;hero.appendChild(b)}
  var editor=document.createElement('div');editor.id='ccWidgetEditor';editor.className='cc-widget-editor';editor.hidden=true;editor.innerHTML='<div><span class="cc-label">CUSTOMIZE HOME</span><strong>Choose dashboard widgets</strong><p>Saved in this browser. Device settings are unchanged.</p></div><div class="cc-widget-toggles">'+[['live','Live print'],['printer','Printer'],['display','Smart display'],['device','Device health'],['quick','Quick control']].map(function(x){return '<label><input type="checkbox" data-widget="'+x[0]+'"> '+x[1]+'</label>'}).join('')+'</div>';
  var attention=document.getElementById('ccAttention');if(attention&&attention.parentNode)attention.parentNode.insertBefore(editor,attention.nextSibling);
  var p=ccWidgetPrefs();editor.querySelectorAll('input[data-widget]').forEach(function(c){c.checked=p.visible.indexOf(c.dataset.widget)>=0;c.onchange=function(){ccToggleWidget(c.dataset.widget,c.checked)}});ccApplyWidgetPrefs();
}
function ccRefreshLiveWidget(){
  if(!document.querySelector('[data-cc-widget="live"]')||document.querySelector('[data-cc-widget="live"]').hidden)return;
  fetch('/status?slot='+(Number(currentSlot||0)),{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
    ccText('ccLiveName',d.name||('Printer '+(Number(currentSlot||0)+1)));ccText('ccLiveState',d.connected?(d.state||'Connected'):'Offline');var p=Number(d.progress||0);ccText('ccLiveProgress',p+'%');ccText('ccLiveNozzle',d.nozzle==null?'—':Math.round(Number(d.nozzle))+'°');ccText('ccLiveBed',d.bed==null?'—':Math.round(Number(d.bed))+'°');ccText('ccLiveLayer',(d.layer||0)+' / '+(d.layers||0));var bar=document.getElementById('ccLiveBar');if(bar)bar.style.width=Math.max(0,Math.min(100,p))+'%';
  }).catch(function(){ccText('ccLiveState','Unavailable')});
}
setTimeout(function(){ccInstallWidgetEditor();ccRefreshLiveWidget()},0);
'''

BROWSER_CSS = r'''

/* Smart Home v9.5 customizable browser widgets */
.cc-widget-editor{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 18px;margin:-4px 0 16px;border:1px solid var(--line);border-radius:14px;background:var(--bg-sub)}
.cc-widget-editor[hidden]{display:none!important}.cc-widget-editor strong{display:block;margin-top:3px}.cc-widget-editor p{margin:3px 0 0;color:var(--text-dim);font-size:11px}.cc-widget-toggles{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.cc-widget-toggles label{font-size:11px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--bg-elev);cursor:pointer}.cc-live-widget{grid-column:span 2}.cc-live-state{font-size:11px;color:var(--success);font-weight:600}.cc-progress-track{height:9px;border-radius:999px;background:var(--bg-sub);overflow:hidden;margin:14px 0}.cc-progress-track span{display:block;height:100%;width:0;background:var(--accent);border-radius:inherit;transition:width .25s ease}.cc-live-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cc-live-metrics>div{padding:10px;border:1px solid var(--line-soft);border-radius:10px;background:var(--bg-sub)}.cc-live-metrics span,.cc-live-metrics strong{display:block}.cc-live-metrics span{font-size:10px;color:var(--text-dim)}.cc-live-metrics strong{font-size:15px;margin-top:3px}@media(max-width:900px){.cc-live-widget{grid-column:auto}.cc-widget-editor{align-items:flex-start;flex-direction:column}.cc-widget-toggles{justify-content:flex-start}}@media(max-width:560px){.cc-live-metrics{grid-template-columns:1fr 1fr}}
'''

def patch_hub(repo: Path) -> None:
    p=repo/'src'/'smart_hub.cpp'; text=p.read_text(encoding='utf-8')
    marker='// Smart Home v9.5 smooth-render helpers'
    if marker in text: return
    text=replace_once(text,'static void drawHome(bool full) {',HELPERS+'static void drawHome(bool full) {','smooth helper insertion')
    text=replace_between(text,'static void drawHome(bool full) {','static void drawWorkshop(bool full) {',HOME+'static void drawWorkshop(bool full) {','home differential renderer')
    text=text.replace('static void drawWorkshop(bool full) {static void drawWorkshop(bool full) {','static void drawWorkshop(bool full) {',1)
    text=replace_between(text,'static void drawWorkshop(bool full) {','static void drawCustom(bool full) {',WORKSHOP+'static void drawCustom(bool full) {','workshop differential renderer')
    text=text.replace('static void drawCustom(bool full) {static void drawCustom(bool full) {','static void drawCustom(bool full) {',1)
    text=replace_between(text,'static void drawCustom(bool full) {','static void drawSystem(bool full) {',CUSTOM+'static void drawSystem(bool full) {','custom widget deck renderer')
    text=text.replace('static void drawSystem(bool full) {static void drawSystem(bool full) {','static void drawSystem(bool full) {',1)
    text=replace_between(text,'static void drawSystem(bool full) {','} // namespace',SYSTEM+'} // namespace','system differential renderer')
    text=text.replace('} // namespace} // namespace','} // namespace',1)
    p.write_text(text,encoding='utf-8')

def patch_browser(repo: Path) -> None:
    p=repo/'web'/'app.js'; text=p.read_text(encoding='utf-8')
    if 'CC_WIDGET_KEY' not in text:
        text=replace_once(text,'/* ============ Boot ============ */',BROWSER_JS+'\n/* ============ Boot ============ */','browser widget JS')
        text=replace_once(text,"  setTimeout(ccPrinterSnapshot,650);\n}","  setTimeout(ccPrinterSnapshot,650);\n  ccRefreshLiveWidget();\n}",'live widget refresh hook')
    p.write_text(text,encoding='utf-8')
    p=repo/'web'/'app.css'; css=p.read_text(encoding='utf-8')
    if 'Smart Home v9.5 customizable browser widgets' not in css: css += BROWSER_CSS
    p.write_text(css,encoding='utf-8')

def apply(repo: Path) -> None:
    patch_hub(repo);patch_browser(repo)
    hub=(repo/'src'/'smart_hub.cpp').read_text(encoding='utf-8')
    for need in ['SMOOTH UI','uiAmsSignature','MY WIDGETS','lastMemorySample','prevHeroTextSig']:
        if need not in hub: raise PatchError('missing smooth-widget contract: '+need)
    app=(repo/'web'/'app.js').read_text(encoding='utf-8')
    for need in ['CC_WIDGET_KEY','Customize widgets','ccRefreshLiveWidget']:
        if need not in app: raise PatchError('missing browser widget contract: '+need)

def main() -> int:
    ap=argparse.ArgumentParser(description='Apply Smart Home smooth widgets experience on v9.4 RC3')
    ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    if not args.apply: raise SystemExit('Pass --apply')
    apply(Path(args.repo));print('Smart Home smooth widgets experience applied on v9.4 RC3')
    return 0
if __name__=='__main__': raise SystemExit(main())
