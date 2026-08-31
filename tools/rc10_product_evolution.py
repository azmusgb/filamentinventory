from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
INO = ROOT / "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"
WF = ROOT / ".github/workflows/waveshare-home.yml"


def replace_func(text: str, name: str, next_name: str, body: str) -> str:
    pattern = rf"static void {re.escape(name)}\(\) \{{.*?\n\}}\n\n(?=static void {re.escape(next_name)}\()"
    new_text, count = re.subn(pattern, body.rstrip() + "\n\n", text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{name}: expected one function match, found {count}")
    return new_text

app = APP.read_text()
if 'FW_VERSION[] = "1.0.0-rc9"' in app:
    app = app.replace('FW_VERSION[] = "1.0.0-rc9"', 'FW_VERSION[] = "1.0.0-rc10"', 1)
elif 'FW_VERSION[] = "1.0.0-rc10"' not in app:
    raise SystemExit('Unexpected firmware version; rc9 or rc10 required')
APP.write_text(app)

ino = INO.read_text()

ino = replace_func(ino, "createQuick", "createSettings", r'''static void createQuick() {
  screenQuick = lv_obj_create(nullptr); styleScreen(screenQuick); addStatusBar(screenQuick, "QUICK CONTROL");
  button(screenQuick, "Brightness +", 12, 64, 142, 58, [](lv_event_t*){ config.brightness = config.brightness >= 100 ? 20 : min(100, (int)config.brightness + 10); configStore.save(config); applyBacklight(config.brightness); }, nullptr, C_GREEN);
  button(screenQuick, "Air mode", 166, 64, 142, 58, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_BLUE);
  button(screenQuick, "Ambient", 12, 134, 142, 58, [](lv_event_t*){ config.ambientMode=static_cast<AmbientDisplayMode>((static_cast<int>(config.ambientMode)+1)%5); configStore.save(config); }, nullptr, C_PURPLE);
  button(screenQuick, "5 min timer", 166, 134, 142, 58, [](lv_event_t*){ timerPlugin.start(state,300,"Quick 5 minute timer"); }, nullptr, C_ORANGE);
  button(screenQuick, "Pause print", 12, 204, 142, 58, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);
  button(screenQuick, "Resume print", 166, 204, 142, 58, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);
  button(screenQuick, "Attention", 12, 274, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Attention)), C_RED);
  button(screenQuick, "System", 166, 274, 142, 58, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_BLUE);
  button(screenQuick, "Home", 12, 350, 296, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)));
}''')

ino = replace_func(ino, "refreshToday", "refreshControls", r'''static void refreshToday() {
  if(todayWeather){
    char b[220];
    if(state.weather.online) {
      uint32_t ageMin = state.weather.updatedMs ? (millis()-state.weather.updatedMs)/60000UL : 0;
      snprintf(b,sizeof(b),"%s\n%.0f°F  %s\nFeels %.0f° • H %.0f° / L %.0f°\nRain %d%% • updated %lum ago",
               strlen(config.weatherLocation)?config.weatherLocation:"Weather",
               state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,
               state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent,(unsigned long)ageMin);
    } else if(!config.weatherEnabled) {
      snprintf(b,sizeof(b),"Weather off\nEnable it from the web dashboard");
    } else if(!state.weather.configured) {
      snprintf(b,sizeof(b),"Weather setup needed\n%s", strlen(state.weather.condition) ? state.weather.condition : "Set ZIP or City, State");
    } else {
      snprintf(b,sizeof(b),"Weather temporarily unavailable\n%s • Wi-Fi %s • auto retry enabled",
               strlen(config.weatherLocation)?config.weatherLocation:"Configured location",
               WiFi.status()==WL_CONNECTED?"online":"offline");
    }
    lv_label_set_text(todayWeather,b);
  }
  if(todayAgenda){
    char b[200];
    if(state.calendar.online&&state.calendar.hasNext) snprintf(b,sizeof(b),"NEXT\n%s\n%s",state.calendar.nextTitle,state.calendar.nextWhen);
    else snprintf(b,sizeof(b),config.calendarEnabled?"NEXT\nNo upcoming calendar event":"NEXT\nCalendar not configured");
    lv_label_set_text(todayAgenda,b);
  }
  if(todayTimer) {
    String t = remainingTimerText();
    if(state.printer.printing) t += String("\nPrint: ")+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes);
    lv_label_set_text(todayTimer,t.c_str());
  }
}''')

ino = replace_func(ino, "refreshPrinter", "refreshFilament", r'''static void refreshPrinter() {
  if(!printerBody)return; String b;
  if(!config.bambuEnabled) b="Bambu Lab not configured.\nUse the web dashboard to discover or enter a printer.";
  else if(!state.printer.online) b=String("PRINTER OFFLINE\n")+(strlen(state.printer.displayName)?state.printer.displayName:"Bambu Lab")+"\nHost "+config.bambuHost+"\nWaiting for local MQTT.";
  else {
    b=String(state.printer.displayName)+" • "+state.printer.status+"\n";
    b+=(strlen(state.printer.jobName)?state.printer.jobName:"No active job");
    b+=String("\nPROGRESS  ")+state.printer.progress+"%";
    if(state.printer.remainingMinutes>0) b+=String(" • ETA ")+formatMinutes(state.printer.remainingMinutes);
    b+=String("\nLAYER     ")+state.printer.currentLayer+" / "+state.printer.totalLayers;
    b+=String("\nTHERMAL   N ")+String(state.printer.nozzleC,0)+"°/"+String(state.printer.nozzleTargetC,0)+"° • B "+String(state.printer.bedC,0)+"°/"+String(state.printer.bedTargetC,0)+"°";
    b+=String("\nAIR       Chamber ")+String(state.printer.chamberC,0)+"° • Speed "+state.printer.speedPercent+"%";
    b+="\n\nAMS";
    if(state.printer.amsHumidity>=0) b+=String(" • RH ")+state.printer.amsHumidity;
    b+="\n";
    for(int i=0;i<4;i++){
      auto &s=state.printer.amsSlots[i];
      b+=String(i==state.printer.activeTray?"> ":"  ")+"A"+(i+1)+"  ";
      if(!s.loaded)b+="Empty";
      else { b+=strlen(s.material)?s.material:"Filament"; if(strlen(s.name)){b+=" • ";b+=s.name;} if(s.remainingPercent>=0){b+=" • ";b+=s.remainingPercent;b+="%";} }
      b+="\n";
    }
    if(state.printer.errorCode){b+="\nERROR 0x";b+=String(state.printer.errorCode,HEX);}
  }
  lv_label_set_text(printerBody,b.c_str());
}''')

ino = replace_func(ino, "refreshWorkshop", "refreshSystem", r'''static void refreshWorkshop() {
  if(!workshopBody)return;
  String b="WORKSHOP STATUS\n";
  b += state.printer.online ? (String("Printer • ")+state.printer.status+" • "+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)) : "Printer • offline / not configured";
  b += "\n\nENVIRONMENT\n";
  auto &e=state.workshop.environment;
  if(!e.online) b += "Sensor • not connected";
  else {
    b += String(e.source)+" • "+(e.stale?"STALE":"LIVE");
    b += String("\nTemp ")+String(e.temperatureC,1)+"°C • RH "+String(e.humidity,0)+"%";
    b += String("\nPM2.5 ")+String(e.pm25,1)+" • VOC "+String(e.voc,0)+" • CO2 "+String(e.co2,0);
    b += String("\nPresence ")+(e.presence?"detected":"clear");
  }
  b += "\n\nAIR\n"; b += airModeName(config.airMode); b += state.workshop.filterRequested ? String(" • FILTER ON\n")+state.workshop.filterReason : " • filter idle";
  b += "\n\nDRYER\n"; auto &d=state.workshop.dryer;
  if(d.running) b += String(d.material)+" • "+d.targetC+"°C • "+(d.remainingSec/60UL)+" min left";
  else b += d.completed?"Complete":"Idle";
  if(state.activityCount){ b+="\n\nRECENT\n"; b+=state.activity[0].source; b+=" • "; b+=state.activity[0].title; }
  lv_label_set_text(workshopBody,b.c_str());
}''')

ino = replace_func(ino, "refreshSystem", "refreshAmbient", r'''static void refreshSystem() {
  if(!systemBody)return; char b[760];
  snprintf(b,sizeof(b),"Firmware      %s\nPartition     %s\nBoot count     %lu\nBoot attempts  %lu\nReset reason   %s\nRecovery       %s\nStable boot    %s\nWatchdog       active\nUptime         %lu min\nFree heap      %lu KB\nFree PSRAM     %lu KB\nAudio          %s\nWi-Fi          %s\nIP             %s\nOTA            %s\nUpdater        %s%s%s",
    FW_VERSION,esp_ota_get_running_partition()?esp_ota_get_running_partition()->label:"unknown",
    (unsigned long)state.system.bootCount,(unsigned long)state.system.bootAttempts,state.system.resetReason,
    state.system.recoveryMode?"YES":"no",state.system.stableBoot?"yes":"pending",(unsigned long)(state.system.uptimeSec/60),
    (unsigned long)(state.system.freeHeap/1024),(unsigned long)(state.system.freePsram/1024),state.system.audioReady?"ES8311 ready":"unavailable",
    WiFi.status()==WL_CONNECTED?state.system.ssid:state.system.setupApActive?SETUP_AP_NAME:"offline",state.system.ip,
    state.system.otaInProgress?"installing":state.system.otaReadyToReboot?"ready to reboot":"idle",
    state.system.updateStatus,strlen(state.system.updateVersion)?" • ":"",strlen(state.system.updateVersion)?state.system.updateVersion:"");
  lv_label_set_text(systemBody,b);
}''')

ino = replace_func(ino, "refreshAmbient", "refreshUi", r'''static void refreshAmbient() {
  if(!ambientClock)return;
  struct tm info; char t[16]="--:--",d[40]="";
  if(getLocalTime(&info,5)){strftime(t,sizeof(t),"%l:%M %p",&info);if(t[0]==' ')memmove(t,t+1,strlen(t));strftime(d,sizeof(d),"%A, %B %e",&info);}
  lv_label_set_text(ambientClock,t);lv_label_set_text(ambientDate,d);
  String s; AmbientDisplayMode mode=config.ambientMode;
  if(mode==AmbientDisplayMode::Auto){
    if(state.alertCount&&state.alerts[0].severity!=AlertSeverity::Info) s=String(state.alerts[0].title)+"\n"+state.alerts[0].detail;
    else if(state.printer.printing) mode=AmbientDisplayMode::Printer;
    else if(state.workshop.environment.online) mode=AmbientDisplayMode::Workshop;
    else if(state.weather.online) s=String((int)round(state.weather.temperatureC*9/5+32))+"°F • "+state.weather.condition+"\n"+(strlen(config.weatherLocation)?config.weatherLocation:"Weather");
    else mode=AmbientDisplayMode::Clock;
  }
  if(mode==AmbientDisplayMode::Minimal) s="";
  else if(mode==AmbientDisplayMode::Printer) s=state.printer.online ? String(state.printer.displayName)+" • "+state.printer.progress+"%\n"+formatMinutes(state.printer.remainingMinutes)+" remaining • L"+state.printer.currentLayer+"/"+state.printer.totalLayers : "Printer offline";
  else if(mode==AmbientDisplayMode::Workshop){ auto &e=state.workshop.environment; s=String(state.workshop.filterRequested?"FILTER ON":"Workshop air idle")+"\n"+(e.online?String(e.temperatureC,0)+"°C • "+String(e.humidity,0)+"% RH • PM2.5 "+String(e.pm25,0):"Sensors not connected"); }
  else if(!s.length()) s=state.alertCount?String(state.alertCount)+" alert(s)\nTouch to wake":"Everything looks good\nTouch to wake";
  lv_label_set_text(ambientSummary,s.c_str());
}''')

INO.write_text(ino)

wf = WF.read_text()
wf = wf.replace('name: WaveshareHome-ESP32S3-rc7-fullflash', 'name: WaveshareHome-ESP32S3-${{ github.sha }}-fullflash')
WF.write_text(wf)

print('rc10 product evolution applied')
