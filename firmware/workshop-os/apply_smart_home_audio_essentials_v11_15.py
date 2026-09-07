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


AUDIO_UI=r'''static HubRect hubSystemAudioSettingsEntryRect() {
  const int16_t W=tft.width();
  return hubLandscape() ? hr(176,42,296,60) : hr(8,122,W-16,72);
}

static HubRect hubSystemSubBackRect() {
  const int16_t W=tft.width();
  if(hubLandscape()) return hr(8,213,132,42);
  const int16_t g=6,m=18,w=(W-2*m-g)/2;
  return hr(m,362,w,42);
}

static HubRect hubSystemSubNextRect() {
  const int16_t W=tft.width();
  if(hubLandscape()) return hubDisplayPagerRect();
  const int16_t g=6,m=18,w=(W-2*m-g)/2;
  return hr(m+w+g,362,w,42);
}

static const char* hubQuietHourLabel(uint8_t hour,char* out,size_t outLen,bool allowOff) {
  if(allowOff && hour==0){strlcpy(out,"OFF",outLen);return out;}
  snprintf(out,outLen,"%02u:00",(unsigned)(hour%24U));return out;
}

static uint8_t hubStepCooldownThreshold(uint8_t current,bool reverse) {
  int v=constrain((int)current,20,80);
  v=((v+2)/5)*5;
  v+=reverse?-5:5;
  if(v<20)v=80;
  if(v>80)v=20;
  return (uint8_t)v;
}

static void drawAudioSettings(bool full) {
  (void)full;
  const int16_t W=tft.width();
  const bool sound=g_audioSettingsPage==0;
  tft.fillScreen(UI_BG);
  drawHeader("AUDIO",sound?"SOUND":"COOLDOWN",3);
  uiBottomNav(3,nullptr);

  if(sound){
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
  }else{
    char threshold[16];snprintf(threshold,sizeof(threshold),"%u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
    uiDisplaySettingCard(hubMoreRect(0),"BED COOLDOWN",buzzerSettings.bedCooldownAlert?"ON":"OFF",
                         "Alert again when bed reaches threshold",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BED THRESHOLD",threshold,
                         "20-80 C • tap + / hold -",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"SPEAKER TEST","RUN",
                         "Play a short ES8311 chime",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"MIC ECHO","RUN",
                         "Listen 1 second and play it back",UI_GREEN);
  }

  HubRect back=hubSystemSubBackRect(),next=hubSystemSubNextRect();
  if(hubLandscape()){
    uiPanelFill(148,210,W-296,54);
    uiDrawFit(g_audioDiagMessage,158,237,W-316,FONT_SMALL,ML_DATUM,g_audioDiagColor,UI_PANEL_2);
  }else{
    uiPanelFill(10,306,W-20,48);
    uiDrawFit(g_audioDiagMessage,20,330,W-40,FONT_SMALL,ML_DATUM,g_audioDiagColor,UI_PANEL_2);
  }
  uiActionButton(back,"< SYSTEM",UI_BLUE);
  uiActionButton(next,sound?"COOLDOWN >":"SOUND >",UI_PURPLE);
  hubMarkFrameDirty();g_dirty=false;
}

'''


def patch(root: Path) -> None:
    rel='include/smart_home_build.h';t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v11.14"','#define SMART_HOME_VERSION "v11.15"','version')
    t=once(t,'#define SMART_HOME_PROFILE "network-essentials"','#define SMART_HOME_PROFILE "audio-essentials"','profile')
    t=once(t,'Smart Home v11.14 Network Essentials RC1','Smart Home v11.15 Audio Essentials RC1','label');save(root,rel,t)

    rel='src/smart_hub.cpp';t=load(root,rel)
    t=once(t,
           'bool g_networkSettingsView = false;\n',
           'bool g_networkSettingsView = false;\nbool g_audioSettingsView = false;\nuint8_t g_audioSettingsPage = 0;\n',
           'audio subview state')
    t=once(t,
           '  if (s != SCREEN_HUB_SYSTEM) g_networkSettingsView = false;\n',
           '  if (s != SCREEN_HUB_SYSTEM) { g_networkSettingsView = false; g_audioSettingsView = false; g_audioSettingsPage = 0; }\n',
           'System subview reset')
    t=once(t,
           'static HubRect hubSystemNetworkCardRect() {',
           AUDIO_UI+'static HubRect hubSystemNetworkCardRect() {',
           'audio UI insertion')
    t=once(t,
           'static void drawSystem(bool full) {\n  if(g_networkSettingsView){drawNetworkEssentials(full);return;}\n',
           'static void drawSystem(bool full) {\n  if(g_audioSettingsView){drawAudioSettings(full);return;}\n  if(g_networkSettingsView){drawNetworkEssentials(full);return;}\n',
           'audio subview renderer')

    old='''  if(cur==SCREEN_HUB_SYSTEM){\n    if(g_networkSettingsView){'''
    new='''  if(cur==SCREEN_HUB_SYSTEM){\n    if(g_audioSettingsView){\n      if(hubSystemSubBackRect().contains(x,y)){g_audioSettingsView=false;g_audioSettingsPage=0;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n      if(hubSystemSubNextRect().contains(x,y)){g_audioSettingsPage=(uint8_t)(g_audioSettingsPage?0:1);g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){\n        if(g_audioSettingsPage==0){\n          if(i==0){buzzerSettings.enabled=!buzzerSettings.enabled;saveBuzzerSettings();initBuzzer();setAudioDiag(buzzerSettings.enabled?"Event sounds enabled":"Event sounds muted",buzzerSettings.enabled?UI_GREEN:UI_DIM);}\n          else if(i==1){buzzerSettings.buttonClick=!buzzerSettings.buttonClick;saveBuzzerSettings();setAudioDiag(buzzerSettings.buttonClick?"Button clicks enabled":"Button clicks disabled",buzzerSettings.buttonClick?UI_GREEN:UI_DIM);}\n          else if(i==2){buzzerSettings.quietStartHour=hubStepHour(buzzerSettings.quietStartHour,longPress);saveBuzzerSettings();setAudioDiag(buzzerSettings.quietStartHour?"Quiet hours updated":"Quiet hours disabled",UI_PURPLE);}\n          else{buzzerSettings.quietEndHour=hubStepHour(buzzerSettings.quietEndHour,longPress);saveBuzzerSettings();setAudioDiag("Quiet end updated",UI_PURPLE);}\n        }else{\n          if(i==0){buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert;saveBuzzerSettings();setAudioDiag(buzzerSettings.bedCooldownAlert?"Bed cooldown alert enabled":"Bed cooldown alert disabled",buzzerSettings.bedCooldownAlert?UI_GREEN:UI_DIM);}\n          else if(i==1){buzzerSettings.bedCooldownThresholdC=hubStepCooldownThreshold(buzzerSettings.bedCooldownThresholdC,longPress);saveBuzzerSettings();setAudioDiag("Bed cooldown threshold updated",UI_CYAN);}\n          else if(i==2){if(buzzerIsPlaying()){setAudioDiag("Speaker busy • try again",UI_AMBER);}else{setAudioDiag("Speaker chime playing",UI_GREEN);drawAudioSettings(true);buzzerBackendApplyStep(1047);delay(90);buzzerBackendStop();delay(45);buzzerBackendApplyStep(1568);delay(130);buzzerBackendStop();setAudioDiag("Speaker test complete",UI_GREEN);}}\n          else{if(buzzerIsPlaying()){setAudioDiag("Wait for current sound",UI_AMBER);}else{setAudioDiag("Listening 1 second • speak now",UI_PURPLE);drawAudioSettings(true);int level=buzzerBackendMicEcho(1000);if(level<0)setAudioDiag("Mic echo unavailable",UI_RED);else if(level<2){char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • very quiet • try again",level);setAudioDiag(msg,UI_AMBER,level);}else{char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% • playback complete",level);setAudioDiag(msg,UI_GREEN,level);}}}\n        }\n        g_dirty=true;return true;\n      }\n      return true;\n    }\n    if(g_networkSettingsView){'''
    t=once(t,old,new,'audio touch subview')
    t=once(t,
           '    if(hubSystemNetworkCardRect().contains(x,y)){g_networkSettingsView=true;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n',
           '    if(hubSystemAudioSettingsEntryRect().contains(x,y)){g_networkSettingsView=false;g_audioSettingsView=true;g_audioSettingsPage=0;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n    if(hubSystemNetworkCardRect().contains(x,y)){g_audioSettingsView=false;g_networkSettingsView=true;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n',
           'audio settings entry')
    save(root,rel,t)

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.15"','SMART_HOME_PROFILE "audio-essentials"','Smart Home v11.15 Audio Essentials RC1'],
      'src/smart_hub.cpp':['g_audioSettingsView','g_audioSettingsPage','drawAudioSettings','hubSystemAudioSettingsEntryRect','hubSystemSubBackRect','hubSystemSubNextRect','EVENT SOUNDS','BUTTON CLICKS','QUIET START','QUIET END','BED COOLDOWN','BED THRESHOLD','SPEAKER TEST','MIC ECHO','buzzerSettings.buttonClick=!buzzerSettings.buttonClick','buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert','hubStepCooldownThreshold'],
    }
    for check_rel,needles in checks.items():
      body=load(root,check_rel)
      for needle in needles:
        if needle not in body: raise PatchError(f'{check_rel}: missing {needle}')


def main()->int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args();patch(Path(a.repo).resolve());print('Smart Home v11.15 Audio Essentials applied');return 0


if __name__=='__main__': raise SystemExit(main())
