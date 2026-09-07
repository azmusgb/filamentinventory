#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p=root/rel
    if not p.exists(): raise PatchError(f"missing {rel}")
    return p.read_text()


def save(root: Path, rel: str, text: str) -> None:
    (root/rel).write_text(text)


def once(text: str, old: str, new: str, label: str) -> str:
    n=text.count(old)
    if n!=1: raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old,new,1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a=text.find(start);b=text.find(end,a+len(start)) if a>=0 else -1
    if a<0 or b<0: raise PatchError(f"{label}: boundary missing")
    return text[:a]+replacement+text[b:]


POWER_HELPERS=r'''static uint8_t hubPowerConfigPlug() {
#if TASMOTA_PLUG_COUNT == 1
  return 0;
#else
  const uint8_t slot=rotState.displayIndex;
  return slot<TASMOTA_PLUG_COUNT?slot:0xFF;
#endif
}

static const char* hubPowerDisplayModeLabel(uint8_t mode) {
  switch(mode){case 1:return "POWER";case 2:return "LAYER";default:return "ALTERNATE";}
}

static const char* hubPowerTypeLabel(uint8_t type) {
  switch(type){case 1:return "SHELLY";case 2:return "KASA";case 3:return "SHELLY STRIP";default:return "TASMOTA";}
}

static uint8_t hubStepPowerPoll(uint8_t current,bool reverse) {
  int v=constrain((int)current,10,60);
  v=((v+5)/10)*10;
  v+=reverse?-10:10;
  if(v<10)v=60;
  if(v>60)v=10;
  return (uint8_t)v;
}

static uint8_t hubStepAutoOffDelay(uint8_t current,bool reverse) {
  static const uint8_t vals[]={1,5,10,15,30,60,120,240};
  uint8_t best=0;int bestDiff=1000;
  for(uint8_t i=0;i<8;i++){int d=abs((int)current-(int)vals[i]);if(d<bestDiff){bestDiff=d;best=i;}}
  best=(uint8_t)((best+(reverse?7U:1U))%8U);
  return vals[best];
}

static void hubPersistPower(const char* message,uint16_t color) {
  saveSettings();
  tasmotaInit();
  setAudioDiag(message,color);
}

'''


DRAW_AUDIO=r'''static void drawAudioSettings(bool full) {
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
    uiDisplaySettingCard(hubMoreRect(0),"EVENT SOUNDS",buzzerSettings.enabled?"ON":"OFF","Print, connection and device events",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BUTTON CLICKS",buzzerSettings.buttonClick?"ON":"OFF","Touch feedback sound",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"QUIET START",qs,"OFF or tap +1h / hold -1h",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"QUIET END",qe,buzzerSettings.quietStartHour?"Tap +1h / hold -1h":"Stored • Quiet Start is OFF",UI_GREEN);
  }else if(page==1){
    char threshold[16];snprintf(threshold,sizeof(threshold),"%u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
    uiDisplaySettingCard(hubMoreRect(0),"BED COOLDOWN",buzzerSettings.bedCooldownAlert?"ON":"OFF","Alert again when bed reaches threshold",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BED THRESHOLD",threshold,"20-80 C • tap + / hold -",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"SPEAKER TEST","RUN","Play a short ES8311 chime",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"MIC ECHO","RUN","Listen 1 second and play it back",UI_GREEN);
  }else if(page==2){
    char br[16];snprintf(br,sizeof(br),"%u%%",(unsigned)hubLevelPct(ledSettings.brightness));
    uiDisplaySettingCard(hubMoreRect(0),"STATUS LED",ledSettings.enabled?"ON":"OFF","Master indicator output",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"LED BRIGHTNESS",br,"0 / 25 / 50 / 75 / 100%",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"WHILE PRINTING",ledSettings.autoOnWhilePrinting?"AUTO":"NORMAL","Auto-on follows active printing",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"PAUSE BREATHING",ledSettings.pauseBreathing?"ON":"OFF","Slow breath during print pause",UI_GREEN);
  }else if(page==3){
    char secs[20],peak[16];
    snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.finishSeconds);
    snprintf(peak,sizeof(peak),"%u%%",(unsigned)hubLevelPct(ledSettings.finishBrightness));
    uiDisplaySettingCard(hubMoreRect(0),"FINISH EFFECT",hubLedFinishModeLabel(),"Off / breathing / heartbeat",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"FINISH DURATION",secs,"5-600 sec presets • hold reverse",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"FINISH PEAK",peak,"Effect peak brightness",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"LED DRIVER",hubLedDriverLabel(),"Read-only • wiring stays in portal",UI_GREEN);
  }else if(page==4){
    char secs[20];
    if(ledSettings.errorStrobeSeconds==0)strlcpy(secs,"UNTIL CLEAR",sizeof(secs));else snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.errorStrobeSeconds);
    uiDisplaySettingCard(hubMoreRect(0),"ERROR STROBE",ledSettings.errorStrobe?"ON":"OFF","Fast indicator strobe on error",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"ERROR DURATION",secs,"0 / 5-600 sec presets",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"LED DRIVER",hubLedDriverLabel(),"Hardware mode is portal-managed",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"GPIO & COLORS","PORTAL","Expert wiring and RGB color setup",UI_GREEN);
  }else{
    const uint8_t plug=hubPowerConfigPlug();
    if(plug==0xFF){
      uiDisplaySettingCard(hubMoreRect(0),"POWER SLOT","NONE","Selected printer has no plug slot",UI_MUTED);
      uiDisplaySettingCard(hubMoreRect(1),"SUPPORTED SLOTS","1-2","WS350 maps plug N to printer N",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"SETUP","PORTAL","Configure another printer/plug slot",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"POWER CONTROL","UNAVAILABLE","No mapped slot for this printer",UI_GREEN);
    }else{
      TasmotaSettings& ps=tasmotaSettings[plug];
      if(page==5){
        char poll[16],detail[48];snprintf(poll,sizeof(poll),"%u SEC",(unsigned)ps.pollInterval);
        snprintf(detail,sizeof(detail),"Plug %u • %s",(unsigned)(plug+1),ps.ip[0]?ps.ip:"address set in portal");
        uiDisplaySettingCard(hubMoreRect(0),"PLUG ENABLED",ps.enabled?"ON":(ps.ip[0]?"OFF":"NEEDS IP"),detail,UI_ORANGE);
        uiDisplaySettingCard(hubMoreRect(1),"POLL INTERVAL",poll,"10-60 sec • tap + / hold -",UI_CYAN);
        uiDisplaySettingCard(hubMoreRect(2),"STATUS DISPLAY",hubPowerDisplayModeLabel(ps.displayMode),"Alternate / Power / Layer",UI_PURPLE);
        uiDisplaySettingCard(hubMoreRect(3),"BUTTON POWER",dispSettings.buttonPowerControl?"ON":"OFF","Physical button power-control option",UI_GREEN);
      }else{
        char delay[20],detail[48];snprintf(delay,sizeof(delay),"%u MIN",(unsigned)ps.autoOffDelayMin);
        snprintf(detail,sizeof(detail),"%s • Plug %u",hubPowerTypeLabel(ps.plugType),(unsigned)(plug+1));
        uiDisplaySettingCard(hubMoreRect(0),"AUTO OFF",ps.autoOffEnabled?"ON":"OFF","Power down after print completion",UI_ORANGE);
        uiDisplaySettingCard(hubMoreRect(1),"AUTO OFF DELAY",delay,"1-240 min presets • hold reverse",UI_CYAN);
        uiDisplaySettingCard(hubMoreRect(2),"CANCEL ON DOOR",ps.autoOffCancelOnDoor?"ON":"OFF","Opening door cancels pending auto-off",UI_PURPLE);
        uiDisplaySettingCard(hubMoreRect(3),"PLUG CONFIG",detail,ps.ip[0]?ps.ip:"IP/type/outlet setup stays in portal",UI_GREEN);
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


def patch(root: Path) -> None:
    rel='include/smart_home_build.h';t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v11.16"','#define SMART_HOME_VERSION "v11.17"','version')
    t=once(t,'#define SMART_HOME_PROFILE "led-essentials"','#define SMART_HOME_PROFILE "power-automation"','profile')
    t=once(t,'Smart Home v11.16 LED Essentials RC1','Smart Home v11.17 Power Automation RC1','label');save(root,rel,t)

    rel='src/smart_hub.cpp';t=load(root,rel)
    anchor='static void drawAudioSettings(bool full) {'
    if 'static uint8_t hubPowerConfigPlug()' not in t:
      t=once(t,anchor,POWER_HELPERS+anchor,'power helpers')
    t=replace_between(t,'static void drawAudioSettings(bool full) {','static HubRect hubSystemNetworkCardRect() {',DRAW_AUDIO,'seven-page hardware renderer')
    t=once(t,'(g_audioSettingsPage+1U)%5U','(g_audioSettingsPage+1U)%7U','seven-page hardware pager')

    old_error=r'''        }else{
          if(i==0){ledSettings.errorStrobe=!ledSettings.errorStrobe;hubPersistLed("Error strobe updated",ledSettings.errorStrobe?UI_RED:UI_DIM);}
          else if(i==1){ledSettings.errorStrobeSeconds=hubStepLedSeconds(ledSettings.errorStrobeSeconds,longPress,true);hubPersistLed("Error duration updated",UI_CYAN);}
          else{setAudioDiag("LED hardware wiring stays in portal",UI_DIM);}
        }
'''
    new_error=r'''        }else if(g_audioSettingsPage==4){
          if(i==0){ledSettings.errorStrobe=!ledSettings.errorStrobe;hubPersistLed("Error strobe updated",ledSettings.errorStrobe?UI_RED:UI_DIM);}
          else if(i==1){ledSettings.errorStrobeSeconds=hubStepLedSeconds(ledSettings.errorStrobeSeconds,longPress,true);hubPersistLed("Error duration updated",UI_CYAN);}
          else{setAudioDiag("LED hardware wiring stays in portal",UI_DIM);}
        }else{
          const uint8_t plug=hubPowerConfigPlug();
          if(plug==0xFF){setAudioDiag("Selected printer has no smart-plug slot",UI_AMBER);}
          else{
            TasmotaSettings& ps=tasmotaSettings[plug];
            if(g_audioSettingsPage==5){
              if(i==0){if(!ps.enabled&&!ps.ip[0])setAudioDiag("Set plug IP in portal before enabling",UI_AMBER);else{ps.enabled=!ps.enabled;hubPersistPower(ps.enabled?"Smart plug enabled":"Smart plug disabled",ps.enabled?UI_GREEN:UI_DIM);}}
              else if(i==1){ps.pollInterval=hubStepPowerPoll(ps.pollInterval,longPress);hubPersistPower("Power poll interval updated",UI_CYAN);}
              else if(i==2){ps.displayMode=(uint8_t)((ps.displayMode+(longPress?2U:1U))%3U);hubPersistPower("Power status display updated",UI_PURPLE);}
              else{dispSettings.buttonPowerControl=!dispSettings.buttonPowerControl;hubPersistPower("Button power-control setting updated",UI_GREEN);}
            }else{
              if(i==0){ps.autoOffEnabled=!ps.autoOffEnabled;hubPersistPower(ps.autoOffEnabled?"Printer auto-off enabled":"Printer auto-off disabled",ps.autoOffEnabled?UI_GREEN:UI_DIM);}
              else if(i==1){ps.autoOffDelayMin=hubStepAutoOffDelay(ps.autoOffDelayMin,longPress);hubPersistPower("Auto-off delay updated",UI_CYAN);}
              else if(i==2){ps.autoOffCancelOnDoor=!ps.autoOffCancelOnDoor;hubPersistPower("Door-cancel setting updated",UI_PURPLE);}
              else{setAudioDiag("Plug IP, type and outlet stay in portal",UI_DIM);}
            }
          }
        }
'''
    t=once(t,old_error,new_error,'power automation touch pages')
    save(root,rel,t)

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.17"','SMART_HOME_PROFILE "power-automation"','Smart Home v11.17 Power Automation RC1'],
      'src/smart_hub.cpp':['hubPowerConfigPlug','hubPowerDisplayModeLabel','hubPowerTypeLabel','hubStepPowerPoll','hubStepAutoOffDelay','hubPersistPower','PLUG ENABLED','POLL INTERVAL','STATUS DISPLAY','BUTTON POWER','AUTO OFF','AUTO OFF DELAY','CANCEL ON DOOR','PLUG CONFIG','tasmotaInit()','ps.autoOffEnabled=!ps.autoOffEnabled','ps.autoOffCancelOnDoor=!ps.autoOffCancelOnDoor','dispSettings.buttonPowerControl=!dispSettings.buttonPowerControl','(g_audioSettingsPage+1U)%7U'],
      'src/web_server.cpp':['handlePrinterPowerStatus','handlePrinterPower'],
    }
    for check_rel,needles in checks.items():
      body=load(root,check_rel)
      for needle in needles:
        if needle not in body: raise PatchError(f'{check_rel}: missing {needle}')


def main()->int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args();patch(Path(a.repo).resolve());print('Smart Home v11.17 Power Automation applied');return 0


if __name__=='__main__': raise SystemExit(main())
