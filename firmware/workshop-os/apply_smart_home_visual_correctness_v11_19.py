#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text, encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    b = text.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0:
        raise PatchError(f"{label}: boundary missing")
    return text[:a] + replacement + text[b:]


HERO = r'''static void uiSignatureHero(const HubRect& r,const PrinterSlot* p,const BambuState* s) {
  const uint16_t stateColor=uiSignatureHeroColor(s);
  uiCard(r.x,r.y,r.w,r.h,stateColor,true);
  const char* title=uiSignatureHeroTitle(s);
  uiDrawFit(title,r.x+14,r.y+16,r.w-28,hubLandscape()?FONT_LARGE:FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);

  // v11.19: the physical hero is deliberately two-line. The third idle helper
  // used in v11.18 competed with the state detail on the 86px landscape card.
  char context[100];
  if(workshopTimerActive()||g_workshopTimerDone){
    char tt[28];workshopTimerText(tt,sizeof(tt));snprintf(context,sizeof(context),"Timer • %s",tt);
  }else if(g_workshopNote[0]){
    snprintf(context,sizeof(context),"Note • %s",g_workshopNote);
  }else if(!s){
    strlcpy(context,"Add a printer when ready",sizeof(context));
  }else if(s->printing){
    char rem[22];formatDuration(s->remainingMinutes,rem,sizeof(rem));
    snprintf(context,sizeof(context),"%u%% • %s left • %s",(unsigned)s->progress,rem,p&&p->config.name[0]?p->config.name:"Printer");
  }else if(!s->connected){
    snprintf(context,sizeof(context),"%s • Check connection",p&&p->config.name[0]?p->config.name:"Printer");
  }else{
    snprintf(context,sizeof(context),"%s • Ready • %u material%s",p&&p->config.name[0]?p->config.name:"Printer",(unsigned)uiMaterialCount(*s),uiMaterialCount(*s)==1?"":"s");
  }
  uiDrawFit(context,r.x+14,r.y+51,r.w-28,FONT_SMALL,TL_DATUM,
            (workshopTimerActive()||g_workshopTimerDone)?uiExperienceAccent():UI_DIM,UI_PANEL);
}

'''


DISPLAY_CARD = r'''static void uiDisplaySettingCard(const HubRect& r, const char* label,
                                 const char* value, const char* detail,
                                 uint16_t accent, bool active=true) {
  // v11.19: preserve configurability while making parent-disabled settings
  // visibly "configured but inactive" instead of looking operational.
  const uint16_t cardAccent = active ? accent : UI_BORDER_2;
  const uint16_t labelColor = active ? accent : UI_MUTED;
  const uint16_t valueColor = active ? UI_TEXT : UI_DIM;
  const uint16_t detailColor = active ? UI_DIM : UI_MUTED;
  uiCard(r.x, r.y, r.w, r.h, cardAccent, false);
  const int16_t pad = 12;
  const int16_t labelY = r.y + (hubLandscape() ? 10 : 13);
  const int16_t valueY = r.y + (hubLandscape() ? 34 : 45);
  const int16_t detailY = r.y + (hubLandscape() ? 59 : 82);
  uiDrawFit(label, r.x + pad, labelY, r.w - pad * 2,
            FONT_SMALL, TL_DATUM, labelColor, UI_PANEL);
  uiDrawFit(value, r.x + pad, valueY, r.w - pad * 2,
            FONT_LARGE, TL_DATUM, valueColor, UI_PANEL);
  uiDrawFit(detail, r.x + pad, detailY, r.w - pad * 2,
            FONT_SMALL, TL_DATUM, detailColor, UI_PANEL);
}

'''


PRESET_HELPERS = r'''static bool hubQuarterPreset(uint8_t level, bool allowZero) {
  if (allowZero && level == 0) return true;
  return level == 64 || level == 128 || level == 192 || level == 255;
}

static void hubFormatPresetPct(uint8_t level, bool allowZero, char* out, size_t outLen) {
  if (!out || outLen == 0) return;
  const unsigned pct = (unsigned)hubLevelPct(level);
  if (hubQuarterPreset(level, allowZero)) snprintf(out, outLen, "%u%%", pct);
  else snprintf(out, outLen, "%u%% CUSTOM", pct);
}

'''


SYSTEM = r'''static void drawSystem(bool full) {
  if(g_audioSettingsView){drawAudioSettings(full);return;}
  if(g_networkSettingsView){drawNetworkEssentials(full);return;}
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);
  const bool wifi=WiFi.status()==WL_CONNECTED,touchOk=hubTouchHealthy(),recoveryOk=recoveryWebReady();
  const bool overall=wifi&&touchOk&&recoveryOk;
  drawHeader("SYSTEM",overall?"HEALTHY":"CHECK",3);uiBottomNav(3,nullptr);
  String ip=wifi?WiFi.localIP().toString():String("No IP");
  const char* portalCode=securityPortalCode();
  HubRect speakerBtn=hubSystemActionRect(0),micBtn=hubSystemActionRect(1),eventsBtn=hubSystemActionRect(2);

  if(!hubLandscape()){
    uiCard(8,44,W-16,70,overall?UI_GREEN:UI_AMBER,true);
    uiDrawFit(overall?"DEVICE HEALTHY":"CHECK DEVICE",20,57,W-40,FONT_BODY,TL_DATUM,overall?UI_GREEN:UI_AMBER,UI_PANEL);
    uiHealthDot(22,91,"Network",wifi);uiHealthDot(116,91,"Touch",touchOk,UI_CYAN);uiHealthDot(202,91,"Recovery",recoveryOk,UI_PURPLE);

    uiCard(8,122,W-16,132,UI_PURPLE,false);uiSectionLabel(18,132,"AUDIO LAB",UI_PURPLE,W-44);
    uiDrawFit("ES8311 speaker + mic",18,157,W-36,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
    uiDrawFit(g_audioDiagMessage,18,179,W-36,FONT_SMALL,TL_DATUM,g_audioDiagColor,UI_PANEL);
    if(g_audioDiagLevel>=0) uiProgressBar(18,190,W-36,(uint8_t)g_audioDiagLevel,UI_PURPLE);
    else uiDrawFit(buzzerSettings.enabled?"Event sounds active":"Event sounds muted",W-18,190,W-36,FONT_SMALL,BR_DATUM,buzzerSettings.enabled?UI_GREEN:UI_DIM,UI_PANEL);
    uiActionButton(speakerBtn,"SPEAKER",UI_AMBER);uiActionButton(micBtn,"MIC ECHO",UI_PURPLE);uiActionButton(eventsBtn,buzzerSettings.enabled?"EVENTS ON":"EVENTS OFF",buzzerSettings.enabled?UI_GREEN:UI_MUTED);

    uiCard(8,262,W-16,72,wifi?UI_BLUE:UI_RED,false);uiSectionLabel(18,272,"NETWORK",wifi?UI_BLUE:UI_RED,W-44);
    char line[48];snprintf(line,sizeof(line),wifi?"Wi-Fi • %d dBm":"Wi-Fi offline",wifi?WiFi.RSSI():-100);uiDrawFit(line,18,295,W-36,FONT_BODY,TL_DATUM,wifi?UI_TEXT:UI_RED,UI_PANEL);uiDrawFit(ip.c_str(),18,319,W-36,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);

    uiCard(8,342,W-16,78,recoveryOk?UI_GREEN:UI_AMBER,false);uiSectionLabel(18,352,"PORTAL ACCESS",recoveryOk?UI_GREEN:UI_AMBER,W-44);
    uiDrawFit(portalCode&&portalCode[0]?portalCode:"----------",18,375,W-36,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL);
    char portal[64];snprintf(portal,sizeof(portal),"%s • changes after reboot",ip.c_str());uiDrawFit(portal,18,404,W-36,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);
  }else{
    HubRect health=hr(8,42,160,222),audio=hr(176,42,296,116),network=hr(176,166,140,98),portal=hr(324,166,148,98);
    uiCard(health.x,health.y,health.w,health.h,overall?UI_GREEN:UI_AMBER,true);
    uiDrawFit(overall?"SYSTEM HEALTH":"CHECK DEVICE",health.x+12,health.y+14,health.w-24,FONT_SMALL,TL_DATUM,overall?UI_GREEN:UI_AMBER,UI_PANEL);
    uiDrawFit(overall?"Healthy":"Attention",health.x+12,health.y+38,health.w-24,FONT_LARGE,TL_DATUM,overall?UI_GREEN:UI_AMBER,UI_PANEL);
    uiHealthDot(health.x+15,health.y+92,"Network",wifi);uiHealthDot(health.x+15,health.y+124,"Touch",touchOk,UI_CYAN);uiHealthDot(health.x+15,health.y+156,"Recovery",recoveryOk,UI_PURPLE);
    char ver[40];snprintf(ver,sizeof(ver),"%s • %s",SMART_HOME_VERSION,recoveryOk?"Recovery OK":"Recovery check");
    uiDrawFit(ver,health.x+12,health.y+194,health.w-24,FONT_SMALL,TL_DATUM,recoveryOk?UI_GREEN:UI_AMBER,UI_PANEL);
    uiDrawFit("Workshop OS",health.x+12,health.y+214,health.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);

    uiCard(audio.x,audio.y,audio.w,audio.h,UI_PURPLE,false);uiSectionLabel(audio.x+10,audio.y+8,"AUDIO LAB",UI_PURPLE,audio.w-22);
    uiDrawFit("ES8311 speaker + mic",audio.x+10,audio.y+34,audio.w-20,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
    uiDrawFit(g_audioDiagMessage,audio.x+10,audio.y+57,audio.w-20,FONT_SMALL,TL_DATUM,g_audioDiagColor,UI_PANEL);
    uiActionButton(speakerBtn,"SPEAKER",UI_AMBER);uiActionButton(micBtn,"MIC ECHO",UI_PURPLE);uiActionButton(eventsBtn,buzzerSettings.enabled?"EVENTS ON":"EVENTS OFF",buzzerSettings.enabled?UI_GREEN:UI_MUTED);

    uiCard(network.x,network.y,network.w,network.h,wifi?UI_BLUE:UI_RED,false);uiSectionLabel(network.x+10,network.y+8,"NETWORK",wifi?UI_BLUE:UI_RED,network.w-22);
    char net[36];snprintf(net,sizeof(net),wifi?"%d dBm":"OFFLINE",wifi?WiFi.RSSI():-100);uiDrawFit(net,network.x+10,network.y+39,network.w-20,FONT_LARGE,TL_DATUM,wifi?UI_TEXT:UI_RED,UI_PANEL);uiDrawFit(ip.c_str(),network.x+10,network.y+75,network.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);

    uiCard(portal.x,portal.y,portal.w,portal.h,recoveryOk?UI_GREEN:UI_AMBER,false);uiSectionLabel(portal.x+10,portal.y+8,"PORTAL ACCESS",recoveryOk?UI_GREEN:UI_AMBER,portal.w-22);
    uiDrawFit(portalCode&&portalCode[0]?portalCode:"----------",portal.x+10,portal.y+37,portal.w-20,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
    uiDrawFit(ip.c_str(),portal.x+10,portal.y+66,portal.w-20,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);
    uiDrawFit("Changes after reboot",portal.x+10,portal.y+84,portal.w-20,FONT_SMALL,BL_DATUM,UI_MUTED,UI_PANEL);
  }
  hubMarkFrameDirty();g_dirty=false;
}

'''


AUDIO_SETTINGS = r'''static void drawAudioSettings(bool full) {
  (void)full;
  const int16_t W=tft.width();
  const uint8_t page=(uint8_t)(g_audioSettingsPage%7U);
  tft.fillScreen(UI_BG);
  drawHeader("HARDWARE",
             page==0?"SOUND":(page==1?"COOLDOWN":(page==2?"LED":(page==3?"FINISH":(page==4?"ERROR":(page==5?"POWER":"AUTO OFF"))))),3);
  uiBottomNav(3,nullptr);

  if(page==0){
    char qs[12],qe[12];
    hubQuietHourLabel(buzzerSettings.quietStartHour,qs,sizeof(qs),true);
    hubQuietHourLabel(buzzerSettings.quietEndHour,qe,sizeof(qe),false);
    const bool quietActive=buzzerSettings.quietStartHour!=0;
    uiDisplaySettingCard(hubMoreRect(0),"EVENT SOUNDS",buzzerSettings.enabled?"ON":"OFF","Print and device events",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BUTTON CLICKS",buzzerSettings.buttonClick?"ON":"OFF","Touch feedback",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"QUIET START",qs,"Tap +1h / hold -1h",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"QUIET END",qe,quietActive?"Tap +1h / hold -1h":"Configured • Quiet Start off",UI_GREEN,quietActive);
  }else if(page==1){
    char threshold[16];snprintf(threshold,sizeof(threshold),"%u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
    uiDisplaySettingCard(hubMoreRect(0),"BED COOLDOWN",buzzerSettings.bedCooldownAlert?"ON":"OFF","Alert at bed threshold",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BED THRESHOLD",threshold,buzzerSettings.bedCooldownAlert?"20-80 C • tap / hold":"Configured • Cooldown off",UI_CYAN,buzzerSettings.bedCooldownAlert);
    uiDisplaySettingCard(hubMoreRect(2),"SPEAKER TEST","RUN","Play ES8311 chime",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"MIC ECHO","RUN","Record 1 sec • play back",UI_GREEN);
  }else if(page==2){
    char br[20];hubFormatPresetPct(ledSettings.brightness,true,br,sizeof(br));
    const bool ledActive=ledSettings.enabled;
    uiDisplaySettingCard(hubMoreRect(0),"STATUS LED",ledActive?"ON":"OFF","Master indicator output",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"LED BRIGHTNESS",br,ledActive?"0 / 25 / 50 / 75 / 100":"Configured • Status LED off",UI_CYAN,ledActive);
    uiDisplaySettingCard(hubMoreRect(2),"WHILE PRINTING",ledSettings.autoOnWhilePrinting?"AUTO":"NORMAL",ledActive?"Follow active printing":"Configured • Status LED off",UI_PURPLE,ledActive);
    uiDisplaySettingCard(hubMoreRect(3),"PAUSE BREATHING",ledSettings.pauseBreathing?"ON":"OFF",ledActive?"Slow breath on pause":"Configured • Status LED off",UI_GREEN,ledActive);
  }else if(page==3){
    char secs[20],peak[20];
    snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.finishSeconds);
    hubFormatPresetPct(ledSettings.finishBrightness,true,peak,sizeof(peak));
    const bool finishActive=ledSettings.finishMode!=0;
    uiDisplaySettingCard(hubMoreRect(0),"FINISH EFFECT",hubLedFinishModeLabel(),"Off / breathe / heartbeat",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"FINISH DURATION",secs,finishActive?"5-600 sec • hold reverse":"Configured • Effect off",UI_CYAN,finishActive);
    uiDisplaySettingCard(hubMoreRect(2),"FINISH PEAK",peak,finishActive?"Effect peak brightness":"Configured • Effect off",UI_PURPLE,finishActive);
    uiDisplaySettingCard(hubMoreRect(3),"LED DRIVER",hubLedDriverLabel(),"Wiring stays in portal",UI_GREEN);
  }else if(page==4){
    char secs[20];
    if(ledSettings.errorStrobeSeconds==0)strlcpy(secs,"UNTIL CLEAR",sizeof(secs));else snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.errorStrobeSeconds);
    const bool errorActive=ledSettings.errorStrobe;
    uiDisplaySettingCard(hubMoreRect(0),"ERROR STROBE",errorActive?"ON":"OFF","Fast indicator strobe",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"ERROR DURATION",secs,errorActive?"0 / 5-600 sec presets":"Configured • Strobe off",UI_CYAN,errorActive);
    uiDisplaySettingCard(hubMoreRect(2),"LED DRIVER",hubLedDriverLabel(),"Hardware mode in portal",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"GPIO & COLORS","PORTAL","Wiring and RGB setup",UI_GREEN);
  }else{
    const uint8_t plug=hubPowerConfigPlug();
    if(plug==0xFF){
      uiDisplaySettingCard(hubMoreRect(0),"POWER SLOT","NONE","No mapped plug for printer",UI_MUTED);
      uiDisplaySettingCard(hubMoreRect(1),"SUPPORTED SLOTS","1-2","Plug N maps to printer N",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"SETUP","PORTAL","Configure printer / plug",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"POWER CONTROL","UNAVAILABLE","No mapped smart plug",UI_GREEN);
    }else{
      TasmotaSettings& ps=tasmotaSettings[plug];
      const bool plugConfigured=ps.ip[0]!=0;
      const bool plugOperational=plugConfigured&&ps.enabled;
      char plugIdentity[28];snprintf(plugIdentity,sizeof(plugIdentity),"%s • P%u",hubPowerTypeLabel(ps.plugType),(unsigned)(plug+1));
      if(page==5){
        char poll[16];snprintf(poll,sizeof(poll),"%u SEC",(unsigned)ps.pollInterval);
        uiDisplaySettingCard(hubMoreRect(0),"PLUG STATUS",plugConfigured?(ps.enabled?"ON":"OFF"):"IP REQUIRED",plugIdentity,UI_ORANGE,plugConfigured);
        uiDisplaySettingCard(hubMoreRect(1),"POLL INTERVAL",poll,plugOperational?"10-60 sec • tap / hold":"Configured • Plug inactive",UI_CYAN,plugOperational);
        uiDisplaySettingCard(hubMoreRect(2),"STATUS DISPLAY",hubPowerDisplayModeLabel(ps.displayMode),plugOperational?"Rotate Power / Layer":"Configured • Plug inactive",UI_PURPLE,plugOperational);
        uiDisplaySettingCard(hubMoreRect(3),"BUTTON POWER",dispSettings.buttonPowerControl?"ON":"OFF",plugOperational?"Physical power control":"Configured • Plug inactive",UI_GREEN,plugOperational);
      }else{
        char delay[20];snprintf(delay,sizeof(delay),"%u MIN",(unsigned)ps.autoOffDelayMin);
        const bool autoActive=ps.autoOffEnabled&&plugOperational;
        uiDisplaySettingCard(hubMoreRect(0),"AUTO OFF",ps.autoOffEnabled?"ON":"OFF",plugConfigured?"Power off after print":"IP required for auto off",UI_ORANGE,plugConfigured);
        uiDisplaySettingCard(hubMoreRect(1),"AUTO OFF DELAY",delay,autoActive?"1-240 min • hold reverse":"Configured • Auto Off inactive",UI_CYAN,autoActive);
        uiDisplaySettingCard(hubMoreRect(2),"CANCEL ON DOOR",ps.autoOffCancelOnDoor?"ON":"OFF",autoActive?"Door cancels pending off":"Configured • Auto Off inactive",UI_PURPLE,autoActive);
        uiDisplaySettingCard(hubMoreRect(3),"PLUG CONFIG",plugIdentity,plugConfigured?ps.ip:"IP REQUIRED",UI_GREEN,plugConfigured);
      }
    }
  }

  HubRect back=hubSystemSubBackRect(),next=hubSystemSubNextRect();
  const char* nextLabel=page==0?"COOLDOWN >":(page==1?"LED >":(page==2?"FINISH >":(page==3?"ERROR >":(page==4?"POWER >":(page==5?"AUTO OFF >":"SOUND >")))));
  if(hubLandscape()){
    uiPanelFill(148,210,W-296,54);
    uiDrawFit(g_audioDiagMessage,158,237,W-316,FONT_SMALL,ML_DATUM,g_audioDiagColor,UI_PANEL_2);
  }else{
    uiPanelFill(10,306,W-20,48);
    uiDrawFit(g_audioDiagMessage,20,330,W-40,FONT_SMALL,ML_DATUM,g_audioDiagColor,UI_PANEL_2);
  }
  uiActionButton(back,"< SYSTEM",UI_BLUE);
  uiActionButton(next,nextLabel,UI_PURPLE);
  hubMarkFrameDirty();g_dirty=false;
}

'''


MORE = r'''static void drawMore(bool full) {
  if (g_displayExperienceView) { drawDisplayExperience(full); return; }
  if (g_toolsView) { drawTools(full); return; }
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);drawHeader("MORE",nullptr,3);uiBottomNav(3,nullptr);
  const char* titles[4]={"CUSTOM","SYSTEM","DISPLAY","TOOLS"};
  const char* subs[4]={"Personal dashboard","Health & portal","Screen & standby","Timers & notes"};
  const uint16_t colors[4]={UI_PURPLE,UI_BLUE,UI_ORANGE,uiExperienceAccent()};
  for(uint8_t i=0;i<4;i++){
    HubRect r=hubMoreRect(i);uiCard(r.x,r.y,r.w,r.h,colors[i],false);
    if(hubLandscape()){
      uiMoreIcon(r,i,colors[i]);
      uiDrawFit(titles[i],r.x+46,r.y+17,r.w-72,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);
      uiDrawFit(subs[i],r.x+46,r.y+43,r.w-72,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL);
      const int16_t cx=r.x+r.w-18,cy=r.y+r.h/2;tft.drawLine(cx-3,cy-5,cx+2,cy,colors[i]);tft.drawLine(cx+2,cy,cx-3,cy+5,colors[i]);
    }else{
      uiMoreIcon(r,i,colors[i]);uiDrawFit(titles[i],r.x+12,r.y+47,r.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(subs[i],r.x+12,r.y+72,r.w-24,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit("OPEN",r.x+r.w-12,r.y+r.h-16,r.w-24,FONT_SMALL,BR_DATUM,colors[i],UI_PANEL);
    }
  }
  String ip=WiFi.status()==WL_CONNECTED?WiFi.localIP().toString():String("No IP");char build[40];snprintf(build,sizeof(build),"Workshop OS %s",SMART_HOME_VERSION);
  if(!hubLandscape()){
    uiPanelFill(10,306,W-20,109);uiDrawFit("THIS DEVICE",20,318,W-40,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);uiDrawFit(build,20,340,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);uiDrawFit(recoveryWebReady()?"Recovery ready":"Recovery starting",20,368,W-40,FONT_BODY,TL_DATUM,recoveryWebReady()?UI_GREEN:UI_AMBER,UI_PANEL_2);char net[72];snprintf(net,sizeof(net),"%s • Local control %s",ip.c_str(),recoveryWebReady()?"ready":"starting");uiDrawFit(net,20,394,W-40,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_2);
  }else{
    uiPanelFill(8,202,W-16,62);uiDrawFit("THIS DEVICE",18,212,90,FONT_SMALL,TL_DATUM,UI_PURPLE,UI_PANEL_2);uiDrawFit(build,18,229,210,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);uiPill(W-124,210,104,recoveryWebReady()?"RECOVERY OK":"RECOVERY START",recoveryWebReady()?UI_GREEN:UI_AMBER);char line[100];snprintf(line,sizeof(line),"%s • Local control %s",ip.c_str(),recoveryWebReady()?"ready":"starting");uiDrawFit(line,18,252,W-36,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL_2);
  }
  hubMarkFrameDirty();g_dirty=false;
}

'''


def patch(root: Path) -> None:
    rel = "include/smart_home_build.h"
    t = load(root, rel)
    t = once(t, '#define SMART_HOME_VERSION "v11.18"', '#define SMART_HOME_VERSION "v11.19"', 'version')
    t = once(t, '#define SMART_HOME_PROFILE "visual-capture"', '#define SMART_HOME_PROFILE "visual-correctness"', 'profile')
    t = once(t, '#define SMART_HOME_BUILD_LABEL "Smart Home v11.18 Visual Capture RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v11.19 Visual Correctness RC1"', 'build label')
    save(root, rel, t)

    rel = "src/smart_hub.cpp"
    t = load(root, rel)

    t = once(t, 'char g_audioDiagMessage[56] = "Speaker + microphone ready";',
             'char g_audioDiagMessage[56] = "Audio ready";', 'hardware footer default')

    t = replace_between(t, 'static void uiSignatureHero(const HubRect& r,const PrinterSlot* p,const BambuState* s) {',
                        'static void uiSignatureMaterialRail(const HubRect& r,const BambuState* s);', HERO,
                        'home hero')

    t = once(t,
        'if(present){uint16_t fc=tr->colorRgb565;if(fc==0)fc=0x1082;uiSpoolScaled(cx,top+21,fc,active,tr->remain,9);char meta[18];snprintf(meta,sizeof(meta),"%s %d%%",tr->type[0]?tr->type:"FIL",(int)tr->remain);uiDrawFit(meta,cx,r.y+r.h-7,cellW-4,FONT_SMALL,BC_DATUM,tr->remain>=0&&tr->remain<=15?UI_AMBER:UI_TEXT,UI_PANEL);}',
        'if(present){uint16_t fc=tr->colorRgb565;if(fc==0)fc=0x1082;uiSpoolScaled(cx,top+21,fc,active,tr->remain,9);char meta[18];if(tr->remain>=0)snprintf(meta,sizeof(meta),"%s %d%%",tr->type[0]?tr->type:"FIL",(int)tr->remain);else strlcpy(meta,tr->type[0]?tr->type:"FIL",sizeof(meta));uiDrawFit(meta,cx,r.y+r.h-7,cellW-4,FONT_SMALL,BC_DATUM,tr->remain>=0&&tr->remain<=15?UI_AMBER:UI_TEXT,UI_PANEL);}',
        'compact AMS sentinel')
    t = once(t,
        'char pct[10];snprintf(pct,sizeof(pct),"%d%%",(int)tr->remain);\n      uiDrawFit(pct,cx,r.y+r.h-9,cellW-4,FONT_BODY,BC_DATUM,\n                tr->remain>=0&&tr->remain<=15?UI_AMBER:(active?accent:UI_TEXT),UI_PANEL);',
        'char pct[10];if(tr->remain>=0)snprintf(pct,sizeof(pct),"%d%%",(int)tr->remain);else strlcpy(pct,"—",sizeof(pct));\n      uiDrawFit(pct,cx,r.y+r.h-9,cellW-4,FONT_BODY,BC_DATUM,\n                tr->remain>=0&&tr->remain<=15?UI_AMBER:(active?accent:UI_TEXT),UI_PANEL);',
        'expanded AMS sentinel')

    t = once(t,
        'if(loaded>=0){const AmsTray&t=s.ams.trays[loaded];snprintf(value,sizeof(value),"A%d • %s",(int)loaded+1,t.type[0]?t.type:"FILAMENT");snprintf(detail,sizeof(detail),"%s • %d%% remaining",uiFilamentColorName(t.colorRgb565),(int)t.remain);}else{strlcpy(value,"No AMS tray loaded",sizeof(value));strlcpy(detail,"External spool or idle material path",sizeof(detail));}',
        'if(loaded>=0){const AmsTray&t=s.ams.trays[loaded];snprintf(value,sizeof(value),"A%d • %s",(int)loaded+1,t.type[0]?t.type:"FILAMENT");if(t.remain>=0)snprintf(detail,sizeof(detail),"%s • %d%% remaining",uiFilamentColorName(t.colorRgb565),(int)t.remain);else snprintf(detail,sizeof(detail),"%s • remaining not reported",uiFilamentColorName(t.colorRgb565));}else{strlcpy(value,"No active AMS tray",sizeof(value));strlcpy(detail,"External spool or idle path",sizeof(detail));}',
        'portrait loaded material')
    t = once(t,
        'if(loaded>=0){const AmsTray&t=s.ams.trays[loaded];char slot[10],remain[16];snprintf(slot,sizeof(slot),"A%d",(int)loaded+1);snprintf(remain,sizeof(remain),"%d%%",(int)t.remain);uiDrawFit(slot,loadedCard.x+12,loadedCard.y+38,42,FONT_LARGE,TL_DATUM,UI_ORANGE,UI_PANEL);uiDrawFit(t.type[0]?t.type:"FILAMENT",loadedCard.x+12,loadedCard.y+72,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(uiFilamentColorName(t.colorRgb565),loadedCard.x+12,loadedCard.y+99,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit(remain,loadedCard.x+12,loadedCard.y+126,loadedCard.w-24,FONT_LARGE,TL_DATUM,t.remain<=15?UI_AMBER:UI_GREEN,UI_PANEL);}else{uiDrawFit("NO AMS TRAY",loadedCard.x+12,loadedCard.y+54,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit("External spool or idle",loadedCard.x+12,loadedCard.y+88,loadedCard.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);}',
        'if(loaded>=0){const AmsTray&t=s.ams.trays[loaded];char slot[10],remain[16];snprintf(slot,sizeof(slot),"A%d",(int)loaded+1);if(t.remain>=0)snprintf(remain,sizeof(remain),"%d%%",(int)t.remain);else strlcpy(remain,"—",sizeof(remain));uiDrawFit(slot,loadedCard.x+12,loadedCard.y+38,42,FONT_LARGE,TL_DATUM,UI_ORANGE,UI_PANEL);uiDrawFit(t.type[0]?t.type:"FILAMENT",loadedCard.x+12,loadedCard.y+72,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit(uiFilamentColorName(t.colorRgb565),loadedCard.x+12,loadedCard.y+99,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_DIM,UI_PANEL);uiDrawFit(remain,loadedCard.x+12,loadedCard.y+126,loadedCard.w-24,FONT_LARGE,TL_DATUM,t.remain>=0&&t.remain<=15?UI_AMBER:UI_GREEN,UI_PANEL);}else{uiDrawFit("NO ACTIVE TRAY",loadedCard.x+12,loadedCard.y+54,loadedCard.w-24,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL);uiDrawFit("External spool or idle",loadedCard.x+12,loadedCard.y+88,loadedCard.w-24,FONT_SMALL,TL_DATUM,UI_DIM,UI_PANEL);}',
        'landscape loaded material')

    old_chip = '''  if(hubLandscape()){\n    uiDrawFit(label,r.x+19,r.y+r.h/2,r.w/2-18,FONT_SMALL,ML_DATUM,UI_MUTED,UI_PANEL_2);\n    uiDrawFit(value,r.x+r.w-8,r.y+r.h/2,r.w/2-12,FONT_SMALL,MR_DATUM,dim?UI_DIM:c,UI_PANEL_2);\n  }else{'''
    new_chip = '''  if(hubLandscape()){\n    const int16_t valueW=58;\n    uiDrawFit(label,r.x+19,r.y+r.h/2,r.w-27-valueW,FONT_SMALL,ML_DATUM,UI_MUTED,UI_PANEL_2);\n    uiDrawFit(value,r.x+r.w-8,r.y+r.h/2,valueW,FONT_SMALL,MR_DATUM,dim?UI_DIM:c,UI_PANEL_2);\n  }else{'''
    t = once(t, old_chip, new_chip, 'home service chip widths')

    t = once(t, 'uiActionButton(hubPrinterActionRect(2),"MATERIALS",UI_PURPLE);',
             'uiActionButton(hubPrinterActionRect(2),"FILAMENT",UI_PURPLE);', 'printer filament action')

    t = replace_between(t, 'static void drawMore(bool full) {', 'static bool hubTouchHealthy() {', MORE, 'more screen')

    t = replace_between(t, 'static void uiDisplaySettingCard(const HubRect& r, const char* label,',
                        'static HubRect hubDisplayPagerRect() {', DISPLAY_CARD, 'display card state')

    anchor = '''static uint8_t hubLevelPct(uint8_t level) {\n  return (uint8_t)(((uint16_t)level * 100U + 127U) / 255U);\n}\n\n'''
    t = once(t, anchor, anchor + PRESET_HELPERS, 'preset value helpers')

    t = once(t, 'snprintf(mainValue, sizeof(mainValue), "%u%%", (unsigned)hubLevelPct(brightness));',
             'hubFormatPresetPct(brightness,false,mainValue,sizeof(mainValue));', 'main custom brightness')
    t = once(t, 'snprintf(standbyValue, sizeof(standbyValue), "%u%%",\n             (unsigned)hubLevelPct(dpSettings.screensaverBrightness));',
             'hubFormatPresetPct(dpSettings.screensaverBrightness,true,standbyValue,sizeof(standbyValue));', 'standby custom brightness')
    t = once(t, 'snprintf(nightValue, sizeof(nightValue), "%u%%",\n             (unsigned)hubLevelPct(dpSettings.nightBrightness));',
             'hubFormatPresetPct(dpSettings.nightBrightness,true,nightValue,sizeof(nightValue));', 'night custom brightness')

    t = once(t,
        'uiDisplaySettingCard(hubMoreRect(0), "NIGHT BRIGHTNESS", nightValue,\n                         nightDetail, UI_PURPLE);\n    uiDisplaySettingCard(hubMoreRect(1), "NIGHT START", startValue,\n                         "Tap +1h / hold -1h", UI_CYAN);\n    uiDisplaySettingCard(hubMoreRect(2), "NIGHT END", endValue,\n                         "Tap +1h / hold -1h", UI_CYAN);\n    uiDisplaySettingCard(hubMoreRect(3), "FINISH TIMEOUT", finishValue,\n                         finishDetail, UI_GREEN);',
        'uiDisplaySettingCard(hubMoreRect(0), "NIGHT BRIGHTNESS", nightValue,\n                         dpSettings.nightModeEnabled?"Tap + / hold -":"Configured • Night mode off", UI_PURPLE,dpSettings.nightModeEnabled);\n    uiDisplaySettingCard(hubMoreRect(1), "NIGHT START", startValue,\n                         dpSettings.nightModeEnabled?"Tap +1h / hold -1h":"Configured • Night mode off", UI_CYAN,dpSettings.nightModeEnabled);\n    uiDisplaySettingCard(hubMoreRect(2), "NIGHT END", endValue,\n                         dpSettings.nightModeEnabled?"Tap +1h / hold -1h":"Configured • Night mode off", UI_CYAN,dpSettings.nightModeEnabled);\n    uiDisplaySettingCard(hubMoreRect(3), "FINISH TIMEOUT", finishValue,\n                         finishDetail, UI_GREEN,!dpSettings.keepDisplayOn);',
        'display dependency styling')

    replacements = [
        ('"Keep print dashboard after completion"', '"Remain on Printer after finish"', 'keep print helper'),
        ('"Portal sentence lookup preference"', '"Look up HMS details online"', 'online lookup helper'),
        ('"Static IP, hostname and Wi-Fi credentials stay in the portal"', '"Advanced network setup stays in portal"', 'network footer'),
        ('"Safe device-side preferences • text and addressing remain in portal"', '"Safe controls here • advanced setup in portal"', 'network portrait footer'),
    ]
    for old, new, label in replacements:
        t = once(t, old, new, label)

    t = once(t,
        'uiDisplaySettingCard(hubMoreRect(1), "SEVERITY",\n                         dispSettings.hmsSeverityAll ? "ALL" : "IMPORTANT",\n                         dispSettings.hmsSeverityAll ? "Includes common severity" : "Important severity only",\n                         UI_CYAN);\n    uiDisplaySettingCard(hubMoreRect(2), "AUTO PRESENT",\n                         hubHmsAutoLabel(),\n                         "Badge / brief / hold", UI_PURPLE);\n    uiDisplaySettingCard(hubMoreRect(3), "ONLINE LOOKUP",\n                         dispSettings.hmsLookupOnline ? "ON" : "OFF",\n                         "Look up HMS details online", UI_GREEN);',
        'uiDisplaySettingCard(hubMoreRect(1), "SEVERITY",\n                         dispSettings.hmsSeverityAll ? "ALL" : "IMPORTANT",\n                         dispSettings.hmsEnabled?(dispSettings.hmsSeverityAll ? "Includes common severity" : "Important severity only"):"Configured • Errors off",\n                         UI_CYAN,dispSettings.hmsEnabled);\n    uiDisplaySettingCard(hubMoreRect(2), "AUTO PRESENT",\n                         hubHmsAutoLabel(),\n                         dispSettings.hmsEnabled?"Badge / brief / hold":"Configured • Errors off", UI_PURPLE,dispSettings.hmsEnabled);\n    uiDisplaySettingCard(hubMoreRect(3), "ONLINE LOOKUP",\n                         dispSettings.hmsLookupOnline ? "ON" : "OFF",\n                         dispSettings.hmsEnabled?"Look up HMS details online":"Configured • Errors off", UI_GREEN,dispSettings.hmsEnabled);',
        'alerts dependency styling')
    t = once(t,
        'uiDisplaySettingCard(hubMoreRect(0), "ERROR GLOW",\n                         (dispSettings.hmsAlertMask & 0x01U) ? "ON" : "OFF",\n                         "Edge-glow alert signal", UI_ORANGE);\n    uiDisplaySettingCard(hubMoreRect(1), "ERROR BUZZER",\n                         (dispSettings.hmsAlertMask & 0x02U) ? "ON" : "OFF",\n                         "Audible alert signal", UI_CYAN);\n    uiDisplaySettingCard(hubMoreRect(2), "ERROR LED",\n                         (dispSettings.hmsAlertMask & 0x04U) ? "ON" : "OFF",\n                         "Status LED alert signal", UI_PURPLE);\n    uiDisplaySettingCard(hubMoreRect(3), "WAKE DISPLAY",\n                         (dispSettings.hmsAlertMask & 0x08U) ? "ON" : "OFF",\n                         "Wake screen for new error", UI_GREEN);',
        'uiDisplaySettingCard(hubMoreRect(0), "ERROR GLOW",\n                         (dispSettings.hmsAlertMask & 0x01U) ? "ON" : "OFF",\n                         dispSettings.hmsEnabled?"Edge-glow alert signal":"Configured • Errors off", UI_ORANGE,dispSettings.hmsEnabled);\n    uiDisplaySettingCard(hubMoreRect(1), "ERROR BUZZER",\n                         (dispSettings.hmsAlertMask & 0x02U) ? "ON" : "OFF",\n                         dispSettings.hmsEnabled?"Audible alert signal":"Configured • Errors off", UI_CYAN,dispSettings.hmsEnabled);\n    uiDisplaySettingCard(hubMoreRect(2), "ERROR LED",\n                         (dispSettings.hmsAlertMask & 0x04U) ? "ON" : "OFF",\n                         dispSettings.hmsEnabled?"Status LED alert signal":"Configured • Errors off", UI_PURPLE,dispSettings.hmsEnabled);\n    uiDisplaySettingCard(hubMoreRect(3), "WAKE DISPLAY",\n                         (dispSettings.hmsAlertMask & 0x08U) ? "ON" : "OFF",\n                         dispSettings.hmsEnabled?"Wake screen for new error":"Configured • Errors off", UI_GREEN,dispSettings.hmsEnabled);',
        'signals dependency styling')

    t = replace_between(t, 'static void drawAudioSettings(bool full) {',
                        'static HubRect hubSystemNetworkCardRect() {', AUDIO_SETTINGS,
                        'hardware visual correctness')

    t = replace_between(t, 'static void drawSystem(bool full) {', '\n\n\n} // namespace', SYSTEM,
                        'system portal access')

    save(root, rel, t)

    checks = {
        "include/smart_home_build.h": [
            'SMART_HOME_VERSION "v11.19"',
            'SMART_HOME_PROFILE "visual-correctness"',
            'Smart Home v11.19 Visual Correctness RC1',
        ],
        "src/smart_hub.cpp": [
            'securityPortalCode()', 'PORTAL ACCESS', 'Changes after reboot',
            'hubFormatPresetPct', 'CUSTOM', 'bool active=true',
            'Configured • Night mode off', 'Configured • Status LED off',
            'Configured • Effect off', 'Configured • Strobe off',
            'Configured • Auto Off inactive', 'IP REQUIRED',
            'NO ACTIVE TRAY', 'Advanced network setup stays in portal',
            'FILAMENT', 'Audio ready', 'Screen & standby', 'Timers & notes',
            'smartHubCapturePrepare', 'smartHubCaptureRgbRow',
        ],
    }
    for check_rel, needles in checks.items():
        body = load(root, check_rel)
        for needle in needles:
            if needle not in body:
                raise PatchError(f"{check_rel}: missing {needle}")

    body = load(root, "src/smart_hub.cpp")
    forbidden = [
        'NO AMS TRAY',
        'No AMS tray loaded',
        'Keep print dashboard after completion',
        'Portal sentence lookup preference',
        'Static IP, hostname and Wi-Fi credentials stay in the portal',
        'ES8311 speaker + onboard microphone',
        'Brightness, standby & finish',
        'Timers, notes & legacy',
        'Speaker + microphone ready',
    ]
    for needle in forbidden:
        if needle in body:
            raise PatchError(f"visual contract regression still present: {needle}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Workshop OS v11.19 visual correctness")
    ap.add_argument("--repo", required=True, help="Reconstructed BambuHelper source tree")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    patch(Path(args.repo))
    print("Smart Home v11.19 Visual Correctness RC1 applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
