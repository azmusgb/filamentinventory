#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

MARKER = "Workshop OS v11.24 Audio Console RC1"


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    path = root / rel
    if not path.exists():
        raise PatchError(f"missing reconstructed source: {rel}")
    return path.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def braced_bounds_at(text: str, start: int, label: str) -> tuple[int, int]:
    brace = text.find("{", start)
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
                return start, i + 1
    raise PatchError(f"{label}: closing brace missing")


def braced_bounds(text: str, start: str, label: str) -> tuple[int, int]:
    pos = text.find(start)
    if pos < 0:
        raise PatchError(f"{label}: start anchor missing")
    if text.find(start, pos + 1) >= 0:
        raise PatchError(f"{label}: start anchor is not unique")
    return braced_bounds_at(text, pos, label)


def replace_braced(text: str, start: str, replacement: str, label: str) -> str:
    a, b = braced_bounds(text, start, label)
    return text[:a] + replacement + text[b:]


def function_body(text: str, signature_fragment: str, label: str) -> tuple[int, int, str]:
    if signature_fragment != "int buzzerBackendMicEcho(":
        a, b = braced_bounds(text, signature_fragment, label)
        return a, b, text[a:b]

    matches = list(re.finditer(
        r"(?m)^[ \t]*int[ \t]+buzzerBackendMicEcho[ \t]*\([^;{]*\)[ \t]*\{",
        text,
    ))
    candidates: list[tuple[int, int, str]] = []
    for match in matches:
        a, b = braced_bounds_at(text, match.start(), label)
        block = text[a:b]
        if "1400" in block and (
            "MALLOC_CAP_SPIRAM" in block
            or "stopAudioTaskForDiagnostic" in block
            or "heap_caps_malloc" in block
        ):
            candidates.append((a, b, block))
    if len(candidates) != 1:
        raise PatchError(
            f"{label}: expected one PSRAM-backed definition with 1400 ms cap, "
            f"found {len(candidates)} from {len(matches)} definitions"
        )
    return candidates[0]


AUDIO_DRAW = r'''static void drawAudioSettings(bool full) {
  (void)full;
  const int16_t W=tft.width();
  const uint8_t page=(uint8_t)(g_audioSettingsPage%9U);
  static const char* titles[] = {"OUTPUT","MIC","ALERTS","QUIET","LED","FINISH","ERROR","POWER","AUTO OFF"};
  tft.fillScreen(UI_BG);
  drawHeader("HARDWARE",titles[page],3);
  uiBottomNav(3,nullptr);

  char value[24];
  if(page==0){
    snprintf(value,sizeof(value),"%u%%",(unsigned)buzzerSettings.volume);
    uiDisplaySettingCard(hubMoreRect(0),"VOLUME -10",value,
                         "Lower ES8311 speaker output",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(1),"VOLUME +10",value,
                         "Raise ES8311 speaker output",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"EVENT SOUNDS",buzzerSettings.enabled?"ON":"OFF",
                         "Print, connection and device events",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(3),"SPEAKER TEST","RUN",
                         "Play a local two-tone hardware check",UI_PURPLE);
  }else if(page==1){
    if(g_audioConsoleMicLevel>=0) snprintf(value,sizeof(value),"%d%%",g_audioConsoleMicLevel);
    else strlcpy(value,"RUN",sizeof(value));
    uiDisplaySettingCard(hubMoreRect(0),"MIC LEVEL",value,
                         "Sample onboard microphone for 250 ms",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(1),"ECHO 1 SEC","RUN",
                         "Record locally, then play through speaker",UI_GREEN);
    uiDisplaySettingCard(hubMoreRect(2),"ECHO 3 SEC","RUN",
                         "Longer local talkback check",UI_GREEN);
    uiDisplaySettingCard(hubMoreRect(3),"ECHO 5 SEC","RUN",
                         "PSRAM-backed five-second voice loop",UI_PURPLE);
  }else if(page==2){
    snprintf(value,sizeof(value),"%u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
    uiDisplaySettingCard(hubMoreRect(0),"BUTTON CLICKS",buzzerSettings.buttonClick?"ON":"OFF",
                         "Touch feedback sound",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(1),"BED COOLDOWN",buzzerSettings.bedCooldownAlert?"ON":"OFF",
                         "Alert when the bed reaches its threshold",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(2),"THRESHOLD -5",value,
                         "Lower cooldown temperature",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"THRESHOLD +5",value,
                         "Raise cooldown temperature",UI_GREEN);
  }else if(page==3){
    char qs[12],qe[12];
    hubQuietHourLabel(buzzerSettings.quietStartHour,qs,sizeof(qs),true);
    hubQuietHourLabel(buzzerSettings.quietEndHour,qe,sizeof(qe),false);
    uiDisplaySettingCard(hubMoreRect(0),"QUIET START -1",qs,
                         "Move start one hour earlier",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(1),"QUIET START +1",qs,
                         "Move start one hour later",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(2),"QUIET END -1",qe,
                         "Move end one hour earlier",UI_GREEN);
    uiDisplaySettingCard(hubMoreRect(3),"QUIET END +1",qe,
                         "Move end one hour later",UI_GREEN);
  }else if(page==4){
    char br[16];snprintf(br,sizeof(br),"%u%%",(unsigned)hubLevelPct(ledSettings.brightness));
    uiDisplaySettingCard(hubMoreRect(0),"STATUS LED",ledSettings.enabled?"ON":"OFF",
                         "Master indicator output",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"BRIGHTNESS -25",br,
                         "Lower status LED brightness",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"BRIGHTNESS +25",br,
                         "Raise status LED brightness",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(3),"PRINT AUTO",ledSettings.autoOnWhilePrinting?"ON":"OFF",
                         "Auto-on follows active printing",UI_PURPLE);
  }else if(page==5){
    char secs[20],peak[16];
    snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.finishSeconds);
    snprintf(peak,sizeof(peak),"%u%%",(unsigned)hubLevelPct(ledSettings.finishBrightness));
    uiDisplaySettingCard(hubMoreRect(0),"PAUSE BREATH",ledSettings.pauseBreathing?"ON":"OFF",
                         "Slow breath during print pause",UI_GREEN);
    uiDisplaySettingCard(hubMoreRect(1),"FINISH EFFECT",hubLedFinishModeLabel(),
                         "Tap to cycle effect",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(2),"FINISH DURATION",secs,
                         "Tap to cycle 5-600 sec",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(3),"FINISH PEAK",peak,
                         "Tap to raise/wrap brightness",UI_PURPLE);
  }else if(page==6){
    char secs[20];
    if(ledSettings.errorStrobeSeconds==0)strlcpy(secs,"UNTIL CLEAR",sizeof(secs));
    else snprintf(secs,sizeof(secs),"%u SEC",(unsigned)ledSettings.errorStrobeSeconds);
    uiDisplaySettingCard(hubMoreRect(0),"ERROR STROBE",ledSettings.errorStrobe?"ON":"OFF",
                         "Fast indicator strobe on error",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"ERROR DURATION",secs,
                         "Tap to cycle 0 / 5-600 sec",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"LED DRIVER",hubLedDriverLabel(),
                         "Read-only; wiring stays in portal",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"GPIO & COLORS","PORTAL",
                         "Expert wiring and RGB color setup",UI_GREEN);
  }else if(page==7){
    const uint8_t plug=hubPowerConfigPlug();
    if(plug==0xFF){
      uiDisplaySettingCard(hubMoreRect(0),"PLUG STATUS","NO SLOT","Selected printer has no plug slot",UI_MUTED);
      uiDisplaySettingCard(hubMoreRect(1),"POLL INTERVAL","N/A","No mapped plug for this printer",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"STATUS DISPLAY","N/A","Configure plug mapping in portal",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"BUTTON POWER",dispSettings.buttonPowerControl?"ON":"OFF","Global physical button option",UI_GREEN);
    }else{
      TasmotaSettings& ps=tasmotaSettings[plug];
      char poll[16],detail[48];snprintf(poll,sizeof(poll),"%u SEC",(unsigned)ps.pollInterval);
      snprintf(detail,sizeof(detail),"Plug %u - %s",(unsigned)(plug+1),ps.ip[0]?ps.ip:"set address in portal");
      uiDisplaySettingCard(hubMoreRect(0),"PLUG STATUS",ps.enabled?"ON":(ps.ip[0]?"OFF":"NEEDS IP"),detail,UI_ORANGE);
      uiDisplaySettingCard(hubMoreRect(1),"POLL INTERVAL",poll,"Tap to cycle 10-60 sec",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"STATUS DISPLAY",hubPowerDisplayModeLabel(ps.displayMode),"Tap: Alternate / Power / Layer",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"BUTTON POWER",dispSettings.buttonPowerControl?"ON":"OFF","Physical button power-control option",UI_GREEN);
    }
  }else{
    const uint8_t plug=hubPowerConfigPlug();
    if(plug==0xFF){
      uiDisplaySettingCard(hubMoreRect(0),"AUTO OFF","UNAVAILABLE","No mapped plug for selected printer",UI_MUTED);
      uiDisplaySettingCard(hubMoreRect(1),"AUTO OFF DELAY","N/A","Configure plug mapping in portal",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"CANCEL ON DOOR","N/A","No mapped power target",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"PLUG CONFIG","PORTAL","Configure printer/plug mapping",UI_GREEN);
    }else{
      TasmotaSettings& ps=tasmotaSettings[plug];
      char delay[20],detail[48];snprintf(delay,sizeof(delay),"%u MIN",(unsigned)ps.autoOffDelayMin);
      snprintf(detail,sizeof(detail),"%s - Plug %u",hubPowerTypeLabel(ps.plugType),(unsigned)(plug+1));
      uiDisplaySettingCard(hubMoreRect(0),"AUTO OFF",ps.autoOffEnabled?"ON":"OFF","Power down after print completion",UI_ORANGE);
      uiDisplaySettingCard(hubMoreRect(1),"AUTO OFF DELAY",delay,"Tap to cycle 1-240 min",UI_CYAN);
      uiDisplaySettingCard(hubMoreRect(2),"CANCEL ON DOOR",ps.autoOffCancelOnDoor?"ON":"OFF","Opening door cancels pending auto-off",UI_PURPLE);
      uiDisplaySettingCard(hubMoreRect(3),"PLUG CONFIG",detail,ps.ip[0]?ps.ip:"IP/type/outlet setup stays in portal",UI_GREEN);
    }
  }

  HubRect back=hubSystemSubBackRect(),next=hubSystemSubNextRect();
  const char* nextLabel=page==0?"MIC >":(page==1?"ALERTS >":(page==2?"QUIET >":(page==3?"LED >":(page==4?"FINISH >":(page==5?"ERROR >":(page==6?"POWER >":(page==7?"AUTO OFF >":"OUTPUT >")))))));
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
}'''


AUDIO_TOUCH = r'''    if(g_audioSettingsView){
      if(hubSystemSubBackRect().contains(x,y)){
        g_audioSettingsView=false;g_audioSettingsPage=0;g_audioConsoleMicLevel=-1;
        g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;
      }
      if(hubSystemSubNextRect().contains(x,y)){
        g_audioSettingsPage=(uint8_t)((g_audioSettingsPage+1U)%9U);
        g_audioConsoleMicLevel=-1;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;
      }
      for(uint8_t i=0;i<4;i++) if(hubMoreRect(i).contains(x,y)){
        const uint8_t page=(uint8_t)(g_audioSettingsPage%9U);
        if(page==0){
          if(i==0 || i==1){
            int v=(int)buzzerSettings.volume+(i==0?-10:10);
            if(v<0)v=0;if(v>100)v=100;
            buzzerSettings.volume=(uint8_t)v;
            saveBuzzerSettings();
#if defined(BOARD_HAS_ES8311_AUDIO)
            buzzerBackendSetVolume(buzzerSettings.volume);
#endif
            char msg[48];snprintf(msg,sizeof(msg),"Speaker volume %u%%",(unsigned)buzzerSettings.volume);
            setAudioDiag(msg,buzzerSettings.volume?UI_CYAN:UI_DIM);
          }else if(i==2){
            buzzerSettings.enabled=!buzzerSettings.enabled;saveBuzzerSettings();initBuzzer();
            setAudioDiag(buzzerSettings.enabled?"Event sounds enabled":"Event sounds muted",
                         buzzerSettings.enabled?UI_GREEN:UI_DIM);
          }else{
            if(buzzerIsPlaying()) setAudioDiag("Speaker busy - try again",UI_AMBER);
            else{
              setAudioDiag("Speaker chime playing",UI_GREEN);drawAudioSettings(true);
#if defined(BOARD_HAS_ES8311_AUDIO)
              buzzerBackendApplyStep(1047);delay(90);buzzerBackendStop();delay(45);
              buzzerBackendApplyStep(1568);delay(130);buzzerBackendStop();
#else
              buzzerPlay(BUZZ_CONNECTED);
#endif
              setAudioDiag("Speaker test complete",UI_GREEN);
            }
          }
        }else if(page==1){
#if defined(BOARD_HAS_MICROPHONE)
          if(buzzerIsPlaying()) setAudioDiag("Wait for current sound",UI_AMBER);
          else if(i==0){
            setAudioDiag("Sampling microphone...",UI_PURPLE);drawAudioSettings(true);
            int level=buzzerBackendMicLevel(250);
            g_audioConsoleMicLevel=level;
            if(level<0)setAudioDiag("Microphone unavailable",UI_RED);
            else if(level<2){char msg[48];snprintf(msg,sizeof(msg),"Mic %d%% - very quiet",level);setAudioDiag(msg,UI_AMBER,level);}
            else if(level>85){char msg[48];snprintf(msg,sizeof(msg),"Mic %d%% - very loud",level);setAudioDiag(msg,UI_AMBER,level);}
            else{char msg[48];snprintf(msg,sizeof(msg),"Mic %d%% - input detected",level);setAudioDiag(msg,UI_GREEN,level);}
          }else{
            const uint16_t recordMs=(i==1)?1000U:(i==2)?3000U:5000U;
            char listening[56];snprintf(listening,sizeof(listening),"Listening %u sec - speak now",(unsigned)(recordMs/1000U));
            setAudioDiag(listening,UI_PURPLE);drawAudioSettings(true);
            int level=buzzerBackendMicEcho(recordMs);
            g_audioConsoleMicLevel=level;
            if(level<0)setAudioDiag("Mic echo unavailable",UI_RED);
            else if(level<2){char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% - very quiet - try again",level);setAudioDiag(msg,UI_AMBER,level);}
            else{char msg[56];snprintf(msg,sizeof(msg),"Mic %d%% - playback complete",level);setAudioDiag(msg,UI_GREEN,level);}
          }
#else
          setAudioDiag("Microphone not available on this board",UI_DIM);
#endif
        }else if(page==2){
          if(i==0){
            buzzerSettings.buttonClick=!buzzerSettings.buttonClick;saveBuzzerSettings();
            setAudioDiag(buzzerSettings.buttonClick?"Button clicks enabled":"Button clicks disabled",
                         buzzerSettings.buttonClick?UI_GREEN:UI_DIM);
          }else if(i==1){
            buzzerSettings.bedCooldownAlert=!buzzerSettings.bedCooldownAlert;saveBuzzerSettings();
            setAudioDiag(buzzerSettings.bedCooldownAlert?"Bed cooldown alert enabled":"Bed cooldown alert disabled",
                         buzzerSettings.bedCooldownAlert?UI_GREEN:UI_DIM);
          }else{
            buzzerSettings.bedCooldownThresholdC=hubStepCooldownThreshold(
                buzzerSettings.bedCooldownThresholdC,i==2);
            saveBuzzerSettings();
            char msg[56];snprintf(msg,sizeof(msg),"Cooldown threshold %u C",(unsigned)buzzerSettings.bedCooldownThresholdC);
            setAudioDiag(msg,UI_CYAN);
          }
        }else if(page==3){
          if(i==0 || i==1){
            buzzerSettings.quietStartHour=hubStepHour(buzzerSettings.quietStartHour,i==0);
            saveBuzzerSettings();
            setAudioDiag(buzzerSettings.quietStartHour?"Quiet start updated":"Quiet hours disabled",UI_PURPLE);
          }else{
            buzzerSettings.quietEndHour=hubStepHour(buzzerSettings.quietEndHour,i==2);
            saveBuzzerSettings();setAudioDiag("Quiet end updated",UI_GREEN);
          }
        }else if(page==4){
          static const uint8_t ledLevels[]={0,64,128,192,255};
          if(i==0){
            ledSettings.enabled=!ledSettings.enabled;
            hubPersistLed(ledSettings.enabled?"Status LED enabled":"Status LED disabled",ledSettings.enabled?UI_GREEN:UI_DIM);
          }else if(i==1){
            ledSettings.brightness=hubStepPreset(ledSettings.brightness,ledLevels,5,true);
            hubPersistLed("LED brightness lowered",UI_CYAN);
          }else if(i==2){
            ledSettings.brightness=hubStepPreset(ledSettings.brightness,ledLevels,5,false);
            hubPersistLed("LED brightness raised",UI_CYAN);
          }else{
            ledSettings.autoOnWhilePrinting=!ledSettings.autoOnWhilePrinting;
            hubPersistLed("Print auto behavior updated",UI_PURPLE);
          }
        }else if(page==5){
          static const uint8_t ledLevels[]={0,64,128,192,255};
          if(i==0){
            ledSettings.pauseBreathing=!ledSettings.pauseBreathing;
            hubPersistLed("Pause breathing updated",UI_GREEN);
          }else if(i==1){
            ledSettings.finishMode=(uint8_t)((ledSettings.finishMode+1U)%3U);
            hubPersistLed("Finish effect updated",UI_ORANGE);
          }else if(i==2){
            ledSettings.finishSeconds=hubStepLedSeconds(ledSettings.finishSeconds,false,false);
            hubPersistLed("Finish duration updated",UI_CYAN);
          }else{
            ledSettings.finishBrightness=hubStepPreset(ledSettings.finishBrightness,ledLevels,5,false);
            hubPersistLed("Finish peak updated",UI_PURPLE);
          }
        }else if(page==6){
          if(i==0){
            ledSettings.errorStrobe=!ledSettings.errorStrobe;
            hubPersistLed("Error strobe updated",ledSettings.errorStrobe?UI_RED:UI_DIM);
          }else if(i==1){
            ledSettings.errorStrobeSeconds=hubStepLedSeconds(ledSettings.errorStrobeSeconds,false,true);
            hubPersistLed("Error duration updated",UI_CYAN);
          }else{
            setAudioDiag("LED hardware wiring stays in portal",UI_DIM);
          }
        }else if(page==7){
          const uint8_t plug=hubPowerConfigPlug();
          if(i==3){
            dispSettings.buttonPowerControl=!dispSettings.buttonPowerControl;
            hubPersistPower("Button power-control setting updated",UI_GREEN);
          }else if(plug==0xFF){
            setAudioDiag("Selected printer has no smart-plug slot",UI_AMBER);
          }else{
            TasmotaSettings& ps=tasmotaSettings[plug];
            if(i==0){
              if(!ps.enabled&&!ps.ip[0]) setAudioDiag("Set plug IP in portal before enabling",UI_AMBER);
              else{ps.enabled=!ps.enabled;hubPersistPower(ps.enabled?"Smart plug enabled":"Smart plug disabled",ps.enabled?UI_GREEN:UI_DIM);}
            }else if(i==1){
              ps.pollInterval=hubStepPowerPoll(ps.pollInterval,false);hubPersistPower("Power poll interval updated",UI_CYAN);
            }else{
              ps.displayMode=(uint8_t)((ps.displayMode+1U)%3U);hubPersistPower("Power status display updated",UI_PURPLE);
            }
          }
        }else{
          const uint8_t plug=hubPowerConfigPlug();
          if(plug==0xFF){
            setAudioDiag("Selected printer has no smart-plug slot",UI_AMBER);
          }else{
            TasmotaSettings& ps=tasmotaSettings[plug];
            if(i==0){
              ps.autoOffEnabled=!ps.autoOffEnabled;hubPersistPower(ps.autoOffEnabled?"Printer auto-off enabled":"Printer auto-off disabled",ps.autoOffEnabled?UI_GREEN:UI_DIM);
            }else if(i==1){
              ps.autoOffDelayMin=hubStepAutoOffDelay(ps.autoOffDelayMin,false);hubPersistPower("Auto-off delay updated",UI_CYAN);
            }else if(i==2){
              ps.autoOffCancelOnDoor=!ps.autoOffCancelOnDoor;hubPersistPower("Door-cancel setting updated",UI_PURPLE);
            }else{
              setAudioDiag("Plug IP, type and outlet stay in portal",UI_DIM);
            }
          }
        }
        g_dirty=true;return true;
      }
      return true;
    }'''


def patch_build(root: Path) -> None:
    rel="include/smart_home_build.h"
    text=load(root,rel)
    if MARKER in text:
        return
    text,n=re.subn(r'#define SMART_HOME_VERSION\s+"v11\.23"', '#define SMART_HOME_VERSION "v11.24"', text, count=1)
    if n!=1: raise PatchError("build version v11.23 anchor missing")
    text,n=re.subn(r'#define SMART_HOME_PROFILE\s+"[^"]+"', '#define SMART_HOME_PROFILE "audio-console"', text, count=1)
    if n!=1: raise PatchError("build profile anchor missing")
    if "Smart Home v11.23 Network Locale Layout RC2" not in text:
        raise PatchError("v11.23 RC2 build label missing")
    text=text.replace("Smart Home v11.23 Network Locale Layout RC2","Smart Home v11.24 Audio Console RC1",1)
    text += f"\n// {MARKER}\n"
    save(root,rel,text)


def patch_settings(root: Path) -> None:
    rel="src/settings.h";text=load(root,rel)
    old='''  bool bedCooldownAlert;          // play second alert when bed cools after print\n  uint8_t bedCooldownThresholdC;  // bed temperature threshold (20-80 C)\n};'''
    new='''  bool bedCooldownAlert;          // play second alert when bed cools after print\n  uint8_t bedCooldownThresholdC;  // bed temperature threshold (20-80 C)\n  uint8_t volume;                 // ES8311 speaker output 0-100; ignored by GPIO buzzers\n};'''
    text=replace_once(text,old,new,"BuzzerSettings volume field")
    save(root,rel,text)

    rel="src/settings.cpp";text=load(root,rel)
    text=replace_once(text,
        '  buzzerSettings.bedCooldownThresholdC = bct;\n',
        '  buzzerSettings.bedCooldownThresholdC = bct;\n  { uint8_t v=prefs.getUChar("buz_vol",75); if(v>100)v=75; buzzerSettings.volume=v; }\n',
        "load speaker volume")
    text=replace_once(text,
        '  prefs.putUChar("buz_bed_c", buzzerSettings.bedCooldownThresholdC);\n  prefs.end();\n',
        '  prefs.putUChar("buz_bed_c", buzzerSettings.bedCooldownThresholdC);\n  prefs.putUChar("buz_vol", buzzerSettings.volume<=100?buzzerSettings.volume:75);\n  prefs.end();\n',
        "save speaker volume")
    save(root,rel,text)


def patch_backend(root: Path) -> None:
    rel="src/buzzer_backend.h";text=load(root,rel)
    anchor='void buzzerBackendShutdown();\n'
    if 'buzzerBackendSetVolume' not in text:
        text=replace_once(text,anchor,anchor+'#if defined(BOARD_HAS_ES8311_AUDIO)\nvoid buzzerBackendSetVolume(uint8_t percent);\n#endif\n',"backend volume declaration")
    save(root,rel,text)

    rel="src/buzzer_backend_es8311.cpp";text=load(root,rel)
    text=text.replace('constexpr uint8_t  kCodecVolume    = 75;            // percent\n','',1)
    old='''  uint8_t vol = (kCodecVolume == 0) ? 0 : (uint8_t)(((kCodecVolume * 256) / 100) - 1);\n  if (!esWrite(ES_REG_DAC_32, vol)) return false;'''
    new='''  uint8_t pct = buzzerSettings.volume <= 100 ? buzzerSettings.volume : 75;\n  uint8_t vol = (pct == 0) ? 0 : (uint8_t)(((pct * 256U) / 100U) - 1U);\n  if (!esWrite(ES_REG_DAC_32, vol)) return false;'''
    text=replace_once(text,old,new,"dynamic ES8311 codec volume")

    a,b,echo=function_body(text,"int buzzerBackendMicEcho(","mic echo function")
    if "1400" not in echo:
        raise PatchError("mic echo 1400 ms safety cap not found")
    text=text[:a]+echo.replace("1400","5000")+text[b:]

    if 'void buzzerBackendSetVolume(uint8_t percent)' not in text:
        insert='''\nvoid buzzerBackendSetVolume(uint8_t percent) {\n  if(percent>100U)percent=100U;\n  buzzerSettings.volume=percent;\n  if(!gCodecReady)return;\n  const uint8_t vol=(percent==0U)?0U:(uint8_t)(((percent*256U)/100U)-1U);\n  esWrite(ES_REG_DAC_32,vol);\n}\n\n'''
        marker='#endif // BOARD_HAS_ES8311_AUDIO'
        if marker not in text: raise PatchError("ES8311 backend endif missing")
        text=text.replace(marker,insert+marker,1)
    save(root,rel,text)


def patch_hub(root: Path) -> None:
    rel="src/smart_hub.cpp";text=load(root,rel)
    if 'g_audioConsoleMicLevel' not in text:
        text=replace_once(text,'uint8_t g_audioSettingsPage = 0;\n',
                          'uint8_t g_audioSettingsPage = 0;\nint g_audioConsoleMicLevel = -1;\n',
                          "audio console state")
    text=replace_braced(text,'static void drawAudioSettings(bool full)',AUDIO_DRAW,"nine-page Hardware Console renderer")
    text=replace_braced(text,'    if(g_audioSettingsView){',AUDIO_TOUCH,"nine-page Hardware Console touch block")
    text += f"\n// {MARKER}\n"
    save(root,rel,text)


def patch_web(root: Path) -> None:
    rel="src/web_server.cpp";text=load(root,rel)
    a,b,fn=function_body(text,"static void handleSaveRotation()","save rotation handler")
    if 'server.hasArg("buzvol")' not in fn:
        anchor='  saveBuzzerSettings();\n'
        if anchor not in fn: raise PatchError("saveBuzzerSettings anchor missing in handleSaveRotation")
        fn=fn.replace(anchor,
            '  if(server.hasArg("buzvol")){ int v=server.arg("buzvol").toInt(); if(v<0)v=0; if(v>100)v=100; buzzerSettings.volume=(uint8_t)v; }\n'+anchor,1)
        text=text[:a]+fn+text[b:]
    status_anchor='  buz["bedCooldownThresholdC"] = buzzerSettings.bedCooldownThresholdC;\n'
    if status_anchor in text and 'buz["volume"]' not in text:
        text=text.replace(status_anchor,status_anchor+'  buz["volume"] = buzzerSettings.volume;\n',1)
    save(root,rel,text)


def patch(root: Path) -> None:
    build=load(root,"include/smart_home_build.h")
    if 'Smart Home v11.23 Network Locale Layout RC2' not in build and MARKER not in build:
        raise PatchError("v11.24 requires reconstructed v11.23 RC2 source")
    patch_build(root)
    patch_settings(root)
    patch_backend(root)
    patch_hub(root)
    patch_web(root)

    checks={
        "include/smart_home_build.h":["SMART_HOME_VERSION \"v11.24\"","SMART_HOME_PROFILE \"audio-console\"","Smart Home v11.24 Audio Console RC1"],
        "src/settings.h":["uint8_t volume;"],
        "src/settings.cpp":["buz_vol"],
        "src/buzzer_backend.h":["buzzerBackendSetVolume"],
        "src/buzzer_backend_es8311.cpp":["buzzerBackendSetVolume","ES_REG_DAC_32","5000"],
        "src/smart_hub.cpp":[
            "g_audioSettingsPage%9U","(g_audioSettingsPage+1U)%9U",
            "VOLUME -10","VOLUME +10","MIC LEVEL","ECHO 1 SEC","ECHO 3 SEC","ECHO 5 SEC",
            "THRESHOLD -5","THRESHOLD +5","QUIET START -1","QUIET END +1",
            "STATUS LED","FINISH EFFECT","ERROR STROBE","PLUG STATUS","AUTO OFF DELAY","CANCEL ON DOOR"
        ],
        "src/web_server.cpp":["buzvol","buz[\"volume\"]"],
    }
    for rel,needles in checks.items():
        body=load(root,rel)
        for needle in needles:
            if needle not in body: raise PatchError(f"{rel}: missing {needle}")
    print("Workshop OS v11.24 Audio Console RC1 applied")


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",required=True)
    ap.add_argument("--apply",action="store_true")
    args=ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve())
    return 0


if __name__=="__main__":
    raise SystemExit(main())
