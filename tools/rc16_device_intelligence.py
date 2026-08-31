from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
INO = ROOT / "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"

app = APP.read_text()
if 'FW_VERSION[] = "1.0.0-rc15"' in app:
    app = app.replace('FW_VERSION[] = "1.0.0-rc15"', 'FW_VERSION[] = "1.0.0-rc16"', 1)
elif 'FW_VERSION[] = "1.0.0-rc16"' not in app:
    raise SystemExit('rc16 migration expects rc15 or rc16 source')
APP.write_text(app)

ino = INO.read_text()

old_quick = '''static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addStatusBar(screenQuick, "QUICK");
  button(screenQuick, "Settings", 12, 72, 142, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_PURPLE);
  button(screenQuick, "Wi-Fi", 166, 72, 142, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  button(screenQuick, "Timers", 12, 158, 142, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Timers)), C_ORANGE);
  button(screenQuick, "Attention", 166, 158, 142, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Attention)), C_RED);
  button(screenQuick, "Speaker test", 12, 244, 142, 70, [](lv_event_t*){ audio.chirp(); }, nullptr, C_GREEN);
  button(screenQuick, "System", 166, 244, 142, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_GREEN);
  button(screenQuick, "Home", 12, 340, 296, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)));
}
'''
new_quick = '''static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addStatusBar(screenQuick, "QUICK CONTROL");
  button(screenQuick, "Brightness", 12, 62, 92, 58, [](lv_event_t*){ config.brightness=config.brightness>=100?30:config.brightness+10; configStore.save(config); applyBacklight(config.brightness); }, nullptr, C_BLUE);
  button(screenQuick, "Air mode", 114, 62, 92, 58, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_GREEN);
  button(screenQuick, "Ambient", 216, 62, 92, 58, [](lv_event_t*){ config.ambientMode=static_cast<AmbientDisplayMode>((static_cast<int>(config.ambientMode)+1)%5); configStore.save(config); }, nullptr, C_PURPLE);
  button(screenQuick, "5 min timer", 12, 132, 92, 58, [](lv_event_t*){ timerPlugin.start(state,300,"5 minute timer"); }, nullptr, C_ORANGE);
  button(screenQuick, "Pause", 114, 132, 92, 58, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);
  button(screenQuick, "Resume", 216, 132, 92, 58, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);
  button(screenQuick, "Workshop", 12, 202, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_BLUE);
  button(screenQuick, "Attention", 166, 202, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Attention)), C_RED);
  button(screenQuick, "System", 12, 272, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_PURPLE);
  button(screenQuick, "Settings", 166, 272, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_BLUE);
  button(screenQuick, "Home", 12, 348, 296, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}
'''
if old_quick in ino:
    ino = ino.replace(old_quick, new_quick, 1)
elif 'addStatusBar(screenQuick, "QUICK CONTROL")' not in ino:
    raise SystemExit('Quick Control block not found')

old_system = '''static void refreshSystem() {
  if(!systemBody)return; char b[620]; snprintf(b,sizeof(b),"Firmware      %s\\nBoot count     %lu\\nBoot attempts  %lu\\nReset reason   %s\\nRecovery       %s\\nStable boot    %s\\nWatchdog       active\\nUptime         %lu min\\nFree heap      %lu KB\\nFree PSRAM     %lu KB\\nAudio          %s\\nWi-Fi          %s\\nIP             %s\\nWeb dashboard  %s\\nOTA            %s",FW_VERSION,(unsigned long)state.system.bootCount,(unsigned long)state.system.bootAttempts,state.system.resetReason,state.system.recoveryMode?"YES":"no",state.system.stableBoot?"yes":"pending",(unsigned long)(state.system.uptimeSec/60),(unsigned long)(state.system.freeHeap/1024),(unsigned long)(state.system.freePsram/1024),state.system.audioReady?"ES8311 ready":"unavailable",WiFi.status()==WL_CONNECTED?state.system.ssid:state.system.setupApActive?SETUP_AP_NAME:"offline",state.system.ip,state.system.webReady?"ready":"starting",state.system.otaInProgress?"installing":"idle"); lv_label_set_text(systemBody,b);
}
'''
new_system = '''static void refreshSystem() {
  if(!systemBody)return;
  const esp_partition_t *running=esp_ota_get_running_partition();
  char b[760];
  snprintf(b,sizeof(b),"FIRMWARE  %s • %s\\nBoot %lu • stable %s • recovery %s\\nLast reset  %s\\n\\nNETWORK\\n%s • %s • %d dBm\\nWeb %s\\n\\nUPDATE CENTER\\nOTA %s • slot %s\\nUpdater %s\\nLatest %s%s\\n\\nDEVICE HEALTH\\nHeap %lu KB • PSRAM %lu KB\\nAudio %s • watchdog active\\nUptime %lu min",
    FW_VERSION,
    state.system.updateAvailable?"UPDATE READY":"CURRENT",
    (unsigned long)state.system.bootCount,
    state.system.stableBoot?"yes":"validating",
    state.system.recoveryMode?"YES":"no",
    state.system.resetReason,
    WiFi.status()==WL_CONNECTED?state.system.ssid:state.system.setupApActive?SETUP_AP_NAME:"offline",
    state.system.ip,state.system.rssi,
    state.system.webReady?"ready":"starting",
    state.system.otaInProgress?"installing":state.system.otaReadyToReboot?"ready to reboot":"idle",
    running?running->label:"unknown",
    strlen(state.system.updateStatus)?state.system.updateStatus:"Not checked",
    strlen(state.system.updateVersion)?state.system.updateVersion:"—",
    strlen(state.system.updateError)?" • ERROR":"",
    (unsigned long)(state.system.freeHeap/1024),(unsigned long)(state.system.freePsram/1024),
    state.system.audioReady?"ready":"unavailable",
    (unsigned long)(state.system.uptimeSec/60));
  lv_label_set_text(systemBody,b);
}
'''
if old_system in ino:
    ino = ino.replace(old_system, new_system, 1)
elif 'UPDATE CENTER' not in ino:
    raise SystemExit('System status block not found')

# Add richer Today context without adding a new screen: printer state becomes part of NEXT when active.
old_timer = '  if(todayTimer) lv_label_set_text(todayTimer,remainingTimerText().c_str());\n'
new_timer = '''  if(todayTimer) {
    String next = remainingTimerText();
    if(state.printer.printing) next += String("\\nPrinter ")+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)+" remaining";
    else if(state.workshop.dryer.running) next += String("\\nDryer ")+state.workshop.dryer.material+" • "+(state.workshop.dryer.remainingSec/60UL)+" min";
    lv_label_set_text(todayTimer,next.c_str());
  }
'''
if old_timer in ino:
    ino = ino.replace(old_timer, new_timer, 1)
elif 'state.workshop.dryer.running' not in ino:
    raise SystemExit('Today context anchor not found')

INO.write_text(ino)
print('rc16 device intelligence evolution applied')
