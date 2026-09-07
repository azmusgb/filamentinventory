#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text()


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text)


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


LED_HELPERS_AND_AUDIO = r'''static const char* hubLedFinishModeLabel() {
  switch (ledSettings.finishMode) {
    case LED_FINISH_BREATHING: return "BREATHING";
    case LED_FINISH_HEARTBEAT: return "HEARTBEAT";
    default: return "OFF";
  }
}

static const char* hubLedDriverLabel() {
  switch (ledSettings.driver) {
    case LED_DRV_RGB: return "RGB";
    case LED_DRV_PIXEL: return "PIXEL";
    default: return "SINGLE";
  }
}

static uint16_t hubStepLedSeconds(uint16_t current, bool reverse, bool allowZero) {
  static const uint16_t finishVals[] = {5,15,30,60,120,300,600};
  static const uint16_t errorVals[]  = {0,5,10,30,60,120,300,600};
  const uint16_t* vals = allowZero ? errorVals : finishVals;
  const uint8_t count = allowZero ? 8U : 7U;
  uint8_t best = 0;
  uint32_t bestDiff = 0xFFFFFFFFUL;
  for(uint8_t i=0;i<count;i++){
    uint32_t d = current > vals[i] ? (uint32_t)(current-vals[i]) : (uint32_t)(vals[i]-current);
    if(d < bestDiff){bestDiff=d;best=i;}
  }
  best = (uint8_t)((best + (reverse ? count-1U : 1U)) % count);
  return vals[best];
}

static void hubPersistLed(const char* message, uint16_t color) {
  saveLedSettings();
  initLed();
  setAudioDiag(message,color);
}

static void drawAudioSettings(bool full) {
  (void)full;
  const int16_t W=tft.width();
  const uint8_t page=(uint8_t)(g_audioSettingsPage%5U);
  tft.fillScreen(UI_BG);
  drawHeader("HARDWARE",
             page==0?"SOUND":(page==1?"COOLDOWN":(page==2?"LED":(page==3?"FINISH":"ERROR"))),3);
  uiBottomNav(3,nullptr);

  if(page==0){
    char qs[12],qe[12];
    hubQuietHourLabel(buzzerSettings.quietStartHour,qs,sizeof(qs),true);
    hubQuietHourLabel(buzzerSettings.quietEndHour,qe,sizeof(qe),false);
    uiDisplaySettingCard(hubMoreRect(0),"EVENT SOUNDS",buzzerSettings.enabled?"ON":"OFF",
                         "Print, connection and device events",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BUTTON CLICKS",buzzerSettings.buttonClick?"ON":"OFF",
                         "Touch feedback sound",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"QUIET START",qs,
                         "OFF or tap +1h / hold -1h",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"QUIET END",qe,
                         buzzerSettings.quietStartHour?"Tap +1h / hold -1h":"Stored • Quiet Start is OFF",UI_GREEN);
  }else if(page==1){
    char threshold[16];snprintf(threshold,sizeof(threshold),"%u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
    uiDisplaySettingCard(hubMoreRect(0),"BED COOLDOWN",buzzerSettings.bedCooldownAlert?"ON":"OFF",
                         "Alert again when bed reaches threshold",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BED THRESHOLD",threshold,
                         "20-80 C • tap + / hold -",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"SPEAKER TEST","RUN",
                         "Play a short ES8311 chime",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"MIC ECHO","RUN",
                         "Listen 1 second and play it back",UI_GREEN);
  }else if(page==2){
    char br[16];snprintf(br,sizeof(br),"%u%%",(unsigned)hubLevelPct(ledSettings.brightness));
    uiDisplaySettingCard(hubMoreRect(0),"STATUS LED",ledSettings.enabled?"ON":"OFF",
                         "Master indicator output",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"LED BRIGHTNESS",br,
                         "0 / 25 / 50 / 75 / 100%",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"WHILE PRINTING",ledSettings.autoOnWhilePrinting?"AUTO":"NORMAL",
                         "Auto-on follows active printing",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"PAUSE BREATHING",ledSettings.pauseBreathing?"ON":"OFF",
                         "Slow breath during print pause",UI_GREEN);
  }else if(page==3){
    char secs[20],peak[16];
    snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.finishSeconds);
    snprintf(peak,sizeof(peak),"%u%%",(unsigned)hubLevelPct(ledSettings.finishBrightness));
    uiDisplaySettingCard(hubMoreRect(0),"FINISH EFFECT",hubLedFinishModeLabel(),
                         "Off / breathing / heartbeat",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"FINISH DURATION",secs,
                         "5-600 sec presets • hold reverse",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"FINISH PEAK",peak,
                         "Effect peak brightness",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"LED DRIVER",hubLedDriverLabel(),
                         "Read-only • wiring stays in portal",UI_GREEN);
  }else{
    char secs[20];
    if(ledSettings.errorStrobeSeconds==0)strlcpy(secs,"UNTIL CLEAR",sizeof(secs));
    else snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.errorStrobeSeconds);
    uiDisplaySettingCard(hubMoreRect(0),"ERROR STROBE",ledSettings.errorStrobe?"ON":"OFF",
                         "Fast indicator strobe on error",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"ERROR DURATION",secs,
                         "0 / 5-600 sec presets",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"LED DRIVER",hubLedDriverLabel(),
                         "Hardware mode is portal-managed",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"GPIO & COLORS","PORTAL",
                         "Expert wiring and RGB color setup",UI_GREEN);
  }

  HubRect back=hubSystemSubBackRect(),next=hubSystemSubNextRect();
  const char* nextLabel=page==0?"COOLDOWN >":(page==1?"LED >":(page==2?"FINISH >":(page==3?"ERROR >":"SOUND >")));
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
    t=once(t,'#define SMART_HOME_VERSION "v11.15"','#define SMART_HOME_VERSION "v11.16"','version')
    t=once(t,'#define SMART_HOME_PROFILE "audio-essentials"','#define SMART_HOME_PROFILE "led-essentials"','profile')
    t=once(t,'Smart Home v11.15 Audio Essentials RC1','Smart Home v11.16 LED Essentials RC1','label');save(root,rel,t)

    rel='src/smart_hub.cpp';t=load(root,rel)
    t=replace_between(t,
                      'static void drawAudioSettings(bool full) {',
                      'static HubRect hubSystemNetworkCardRect() {',
                      LED_HELPERS_AND_AUDIO,
                      'five-page hardware renderer')
    t=once(t,
           'if(hubSystemSubNextRect().contains(x,y)){g_audioSettingsPage=(uint8_t)(g_audioSettingsPage?0:1);g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}',
           'if(hubSystemSubNextRect().contains(x,y)){g_audioSettingsPage=(uint8_t)((g_audioSettingsPage+1U)%5U);g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}',
           'five-page hardware pager')

    old_touch=r'''        if(g_audioSettingsPage==0){
          if(i==0){buzzerSettings.enabled=!buzzerSettings.enabled;saveBuzzerSettings();initBuzzer();setAudioDiag(buzzerSettings.enabled?"Event sounds enabled":"Event sounds muted",buzzerSettings.enabled?UI_GREEN:UI_DIM);}
          else if(i==1){buzzerSettings.buttonClick=!buzzerSettings.buttonClick;saveBuzzerSettings();setAudioDiag(buzzerSettings.buttonClick?"Button clicks enabled":"Button clicks disabled",buzzerSettings.buttonClick?UI_GREEN:UI_DIM);}
          else if(i==2){buzzerSettings.quietStartHour=hubStepHour(buzzerSettings.quietStartHour,longPress);saveBuzzerSettings();setAudioDiag(buzzerSettings.quietStartHour?"Quiet hours updated":"Quiet hours disabled",UI_PURPLE);}
          else{buzzerSettings.quietEndHour=hubStepHour(buzzerSettings.quietEndHour,longPress);saveBuzzerSettings();setAudioDiag("Quiet end updated",UI_PURPLE);}
        }else{
          if(i==0){buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert;saveBuzzerSettings();setAudioDiag(buzzerSettings.bedCooldownAlert?"Bed cooldown alert enabled":"Bed cooldown alert disabled",buzzerSettings.bedCooldownAlert?UI_GREEN:UI_DIM);}
          else if(i==1){buzzerSettings.bedCooldownThresholdC=hubStepCooldownThreshold(buzzerSettings.bedCooldownThresholdC,longPress);saveBuzzerSettings();setAudioDiag("Bed cooldown threshold updated",UI_CYAN);}
          else if(i==2){if(buzzerIsPlaying()){setAudioDiag("Speaker busy • try again",UI_AMBER);}else{setAudioDiag("Speaker chime playing",UI_GREEN);drawAudioSettings(true);buzzerBackendApplyStep(1047);delay(90);buzzerBackendStop();delay(45);buzzerBackendApplyStep(1568);delay(130);buzzerBackendStop();setAudioDiag("Speaker test complete",UI_GREEN);}}
          else{if(buzzerIsPlaying()){setAudioDiag("Wait for current sound",UI_AMBER);}else{setAudioDiag("Listening 1 second • speak now",UI_PURPLE);drawAudioSettings(true);int level=buzzerBackendMicEcho(1000);if(level<0)setAudioDiag("Mic echo unavailable",UI_RED);else if(level<2){char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • very quiet • try again",level);setAudioDiag(msg,UI_AMBER,level);}else{char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • playback complete",level);setAudioDiag(msg,UI_GREEN,level);}}}
        }
'''
    new_touch=r'''        if(g_audioSettingsPage==0){
          if(i==0){buzzerSettings.enabled=!buzzerSettings.enabled;saveBuzzerSettings();initBuzzer();setAudioDiag(buzzerSettings.enabled?"Event sounds enabled":"Event sounds muted",buzzerSettings.enabled?UI_GREEN:UI_DIM);}
          else if(i==1){buzzerSettings.buttonClick=!buzzerSettings.buttonClick;saveBuzzerSettings();setAudioDiag(buzzerSettings.buttonClick?"Button clicks enabled":"Button clicks disabled",buzzerSettings.buttonClick?UI_GREEN:UI_DIM);}
          else if(i==2){buzzerSettings.quietStartHour=hubStepHour(buzzerSettings.quietStartHour,longPress);saveBuzzerSettings();setAudioDiag(buzzerSettings.quietStartHour?"Quiet hours updated":"Quiet hours disabled",UI_PURPLE);}
          else{buzzerSettings.quietEndHour=hubStepHour(buzzerSettings.quietEndHour,longPress);saveBuzzerSettings();setAudioDiag("Quiet end updated",UI_PURPLE);}
        }else if(g_audioSettingsPage==1){
          if(i==0){buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert;saveBuzzerSettings();setAudioDiag(buzzerSettings.bedCooldownAlert?"Bed cooldown alert enabled":"Bed cooldown alert disabled",buzzerSettings.bedCooldownAlert?UI_GREEN:UI_DIM);}
          else if(i==1){buzzerSettings.bedCooldownThresholdC=hubStepCooldownThreshold(buzzerSettings.bedCooldownThresholdC,longPress);saveBuzzerSettings();setAudioDiag("Bed cooldown threshold updated",UI_CYAN);}
          else if(i==2){if(buzzerIsPlaying()){setAudioDiag("Speaker busy • try again",UI_AMBER);}else{setAudioDiag("Speaker chime playing",UI_GREEN);drawAudioSettings(true);buzzerBackendApplyStep(1047);delay(90);buzzerBackendStop();delay(45);buzzerBackendApplyStep(1568);delay(130);buzzerBackendStop();setAudioDiag("Speaker test complete",UI_GREEN);}}
          else{if(buzzerIsPlaying()){setAudioDiag("Wait for current sound",UI_AMBER);}else{setAudioDiag("Listening 1 second • speak now",UI_PURPLE);drawAudioSettings(true);int level=buzzerBackendMicEcho(1000);if(level<0)setAudioDiag("Mic echo unavailable",UI_RED);else if(level<2){char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • very quiet • try again",level);setAudioDiag(msg,UI_AMBER,level);}else{char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • playback complete",level);setAudioDiag(msg,UI_GREEN,level);}}}
        }else if(g_audioSettingsPage==2){
          static const uint8_t ledLevels[]={0,64,128,192,255};
          if(i==0){ledSettings.enabled=!ledSettings.enabled;hubPersistLed(ledSettings.enabled?"Status LED enabled":"Status LED disabled",ledSettings.enabled?UI_GREEN:UI_DIM);}
          else if(i==1){ledSettings.brightness=hubStepPreset(ledSettings.brightness,ledLevels,5,longPress);hubPersistLed("LED brightness updated",UI_CYAN);}
          else if(i==2){ledSettings.autoOnWhilePrinting=!ledSettings.autoOnWhilePrinting;hubPersistLed("Print-follow behavior updated",UI_PURPLE);}
          else{ledSettings.pauseBreathing=!ledSettings.pauseBreathing;hubPersistLed("Pause breathing updated",UI_GREEN);}
        }else if(g_audioSettingsPage==3){
          static const uint8_t ledLevels[]={0,64,128,192,255};
          if(i==0){ledSettings.finishMode=(uint8_t)((ledSettings.finishMode+(longPress?2U:1U))%3U);hubPersistLed("Finish effect updated",UI_ORANGE);}
          else if(i==1){ledSettings.finishSeconds=hubStepLedSeconds(ledSettings.finishSeconds,longPress,false);hubPersistLed("Finish duration updated",UI_CYAN);}
          else if(i==2){ledSettings.finishBrightness=hubStepPreset(ledSettings.finishBrightness,ledLevels,5,longPress);hubPersistLed("Finish peak updated",UI_PURPLE);}
          else{setAudioDiag("Driver and wiring stay in portal",UI_DIM);}
        }else{
          if(i==0){ledSettings.errorStrobe=!ledSettings.errorStrobe;hubPersistLed("Error strobe updated",ledSettings.errorStrobe?UI_RED:UI_DIM);}
          else if(i==1){ledSettings.errorStrobeSeconds=hubStepLedSeconds(ledSettings.errorStrobeSeconds,longPress,true);hubPersistLed("Error duration updated",UI_CYAN);}
          else{setAudioDiag("LED hardware wiring stays in portal",UI_DIM);}
        }
'''
    t=once(t,old_touch,new_touch,'LED settings touch pages')
    save(root,rel,t)

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.16"','SMART_HOME_PROFILE "led-essentials"','Smart Home v11.16 LED Essentials RC1'],
      'src/smart_hub.cpp':['hubLedFinishModeLabel','hubLedDriverLabel','hubStepLedSeconds','hubPersistLed','STATUS LED','LED BRIGHTNESS','WHILE PRINTING','PAUSE BREATHING','FINISH EFFECT','FINISH DURATION','FINISH PEAK','ERROR STROBE','ERROR DURATION','GPIO & COLORS','saveLedSettings()','initLed()','ledSettings.errorStrobeSeconds=hubStepLedSeconds','(g_audioSettingsPage+1U)%5U'],
    }
    for check_rel,needles in checks.items():
      body=load(root,check_rel)
      for needle in needles:
        if needle not in body: raise PatchError(f'{check_rel}: missing {needle}')


def main()->int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args();patch(Path(a.repo).resolve());print('Smart Home v11.16 LED Essentials applied');return 0


if __name__=='__main__': raise SystemExit(main())
