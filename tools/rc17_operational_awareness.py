from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
model=root/'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino=root/'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
m=model.read_text(); s=ino.read_text()
if '1.0.0-rc16' not in m and '1.0.0-rc17' not in m:
    raise SystemExit('Unexpected firmware version; rc16 or rc17 required')
m=m.replace('1.0.0-rc16','1.0.0-rc17')
if 'screenActivity' not in s:
    s=s.replace('static lv_obj_t *screenSystem = nullptr;','static lv_obj_t *screenActivity = nullptr;\nstatic lv_obj_t *screenDevices = nullptr;\nstatic lv_obj_t *screenSystem = nullptr;')
    s=s.replace('static lv_obj_t *systemBody = nullptr;','static lv_obj_t *activityBody = nullptr;\nstatic lv_obj_t *devicesBody = nullptr;\nstatic lv_obj_t *systemBody = nullptr;')
    s=s.replace('Timers, Printer, Filament, Workshop, System, Recovery, Ambient','Timers, Printer, Filament, Workshop, Activity, Devices, System, Recovery, Ambient')
    s=s.replace('case ScreenId::Workshop: return screenWorkshop;','case ScreenId::Workshop: return screenWorkshop;\n    case ScreenId::Activity: return screenActivity;\n    case ScreenId::Devices: return screenDevices;')
    anchor='static void createSystem() {'
    block=r'''static void createActivity() {
  screenActivity = lv_obj_create(nullptr); styleScreen(screenActivity); addStatusBar(screenActivity, "ACTIVITY");
  activityBody = wrapLabel(screenActivity, "No recent activity", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(activityBody, 5, 0);
  button(screenActivity, "Devices", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  button(screenActivity, "Home", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

static void createDevices() {
  screenDevices = lv_obj_create(nullptr); styleScreen(screenDevices); addStatusBar(screenDevices, "DEVICES");
  devicesBody = wrapLabel(screenDevices, "Inspecting device health...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(devicesBody, 5, 0);
  button(screenDevices, "Activity", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Activity)), C_PURPLE);
  button(screenDevices, "Home", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

'''
    if anchor not in s: raise SystemExit('createSystem anchor missing')
    s=s.replace(anchor,block+anchor,1)
    s=s.replace('createWorkshop(); createSystem();','createWorkshop(); createActivity(); createDevices(); createSystem();')
    refresh_anchor='static void refreshSystem() {'
    refresh=r'''static void refreshActivity() {
  if(!activityBody) return;
  String b;
  if(!state.activityCount) b = "No recent activity.\n\nEvents from updates, printing, workshop automation and alerts will appear here.";
  else {
    for(uint8_t i=0;i<state.activityCount && i<8;i++) {
      auto &a=state.activity[i]; if(!a.valid) continue;
      b += String(a.source)+"  •  "+a.title+"\n";
      if(strlen(a.detail)) b += String(a.detail)+"\n";
      b += "\n";
    }
  }
  lv_label_set_text(activityBody,b.c_str());
}

static void refreshDevices() {
  if(!devicesBody) return;
  String b="ONBOARD\n";
  b += String("Display + touch     ")+"Ready\n";
  b += String("Audio / ES8311     ")+(state.system.audioReady?"Ready":"Unavailable")+"\n";
  b += String("Wi-Fi              ")+(WiFi.status()==WL_CONNECTED?"Connected":"Offline")+"\n\nINTEGRATIONS\n";
  b += String("Weather            ")+(config.weatherEnabled?(state.weather.online?"Online":state.weather.configured?"Unavailable":"Needs setup"):"Disabled")+"\n";
  b += String("Bambu printer      ")+(config.bambuEnabled?(state.printer.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Filament inventory ")+(config.filamentEnabled?(state.filament.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Home Assistant     ")+(config.homeAssistantEnabled?(state.homeAssistant.online?"Online":"Offline"):"Disabled")+"\n";
  b += String("Calendar           ")+(config.calendarEnabled?(state.calendar.online?"Online":"Offline"):"Disabled")+"\n\nWORKSHOP\n";
  auto &e=state.workshop.environment;
  b += String("Environment sensor ")+(e.online?(e.stale?"Stale":"Live"):"Not connected")+"\n";
  b += String("Presence           ")+(config.presenceEnabled?(e.online?(e.presence?"Detected":"Clear"):"Not connected"):"Disabled")+"\n";
  b += String("Dryer              ")+(config.dryerEnabled?(state.workshop.dryer.running?"Running":"Ready"):"Disabled");
  lv_label_set_text(devicesBody,b.c_str());
}

'''
    if refresh_anchor not in s: raise SystemExit('refreshSystem anchor missing')
    s=s.replace(refresh_anchor,refresh+refresh_anchor,1)
    s=s.replace('refreshFilament(); refreshWorkshop(); refreshSystem();','refreshFilament(); refreshWorkshop(); refreshActivity(); refreshDevices(); refreshSystem();')
    # Evolve Quick: add operational views while preserving existing controls.
    mquick=re.search(r'static void createQuick\(\) \{.*?\n\}',s,re.S)
    if mquick:
        q=mquick.group(0)
        if 'Activity' not in q:
            q=q.replace('button(screenQuick, "Home",', 'button(screenQuick, "Activity", 12, 328, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Activity)), C_PURPLE);\n  button(screenQuick, "Devices", 114, 328, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);\n  button(screenQuick, "Home",')
            s=s[:mquick.start()]+q+s[mquick.end():]
model.write_text(m); ino.write_text(s)
print('rc17 operational awareness applied')
