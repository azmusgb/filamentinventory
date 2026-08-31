from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
model=root/'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino=root/'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
m=model.read_text(); s=ino.read_text()
if '1.0.0-rc20' not in m and '1.0.0-rc21' not in m:
    raise SystemExit('Unexpected firmware version; rc20 or rc21 required')
m=m.replace('1.0.0-rc20','1.0.0-rc21')

if 'screenReadiness' not in s:
    s=s.replace('static lv_obj_t *screenSystem = nullptr;','static lv_obj_t *screenReadiness = nullptr;\nstatic lv_obj_t *screenSystem = nullptr;',1)
    s=s.replace('static lv_obj_t *systemBody = nullptr;','static lv_obj_t *readinessBody = nullptr;\nstatic lv_obj_t *systemBody = nullptr;',1)

    # Extend ScreenId using the current operational-screen family.
    s=s.replace('Activity, Devices, System, Recovery, Ambient','Activity, Devices, Readiness, System, Recovery, Ambient',1)
    s=s.replace('case ScreenId::Devices: return screenDevices;','case ScreenId::Devices: return screenDevices;\n    case ScreenId::Readiness: return screenReadiness;',1)

    anchor='static void createSystem() {'
    block=r'''static void createReadiness() {
  screenReadiness = lv_obj_create(nullptr); styleScreen(screenReadiness); addStatusBar(screenReadiness, "READINESS");
  readinessBody = wrapLabel(screenReadiness, "Evaluating setup...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);
  lv_obj_set_style_text_line_space(readinessBody, 5, 0);
  button(screenReadiness, "Devices", 12, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  button(screenReadiness, "Settings", 114, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)), C_PURPLE);
  button(screenReadiness, "Home", 216, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

'''
    if anchor not in s: raise SystemExit('createSystem anchor missing')
    s=s.replace(anchor,block+anchor,1)
    s=s.replace('createActivity(); createDevices(); createSystem();','createActivity(); createDevices(); createReadiness(); createSystem();',1)

    refresh_anchor='static void refreshSystem() {'
    refresh=r'''static void refreshReadiness() {
  if(!readinessBody) return;
  int configured=0, total=7;
  if(WiFi.status()==WL_CONNECTED) configured++;
  if(config.weatherEnabled && state.weather.configured) configured++;
  if(config.bambuEnabled && strlen(config.bambuHost)) configured++;
  if(config.filamentEnabled) configured++;
  if(config.calendarEnabled) configured++;
  if(config.homeAssistantEnabled) configured++;
  if(config.workshopEnabled) configured++;
  int score=(configured*100)/total;

  String b="SETUP READINESS  "+String(score)+"%\n\n";
  b += String(WiFi.status()==WL_CONNECTED?"✓":"○")+" Network           "+(WiFi.status()==WL_CONNECTED?"Connected":"Needs setup")+"\n";
  b += String(config.weatherEnabled&&state.weather.configured?"✓":"○")+" Weather           "+(config.weatherEnabled?(state.weather.configured?"Configured":"Needs location"):"Optional / off")+"\n";
  b += String(config.bambuEnabled&&strlen(config.bambuHost)?"✓":"○")+" Bambu printer     "+(config.bambuEnabled?(strlen(config.bambuHost)?"Configured":"Needs printer"):"Optional / off")+"\n";
  b += String(config.filamentEnabled?"✓":"○")+" Filament          "+(config.filamentEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.calendarEnabled?"✓":"○")+" Calendar          "+(config.calendarEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.homeAssistantEnabled?"✓":"○")+" Home Assistant    "+(config.homeAssistantEnabled?"Enabled":"Optional / off")+"\n";
  b += String(config.workshopEnabled?"✓":"○")+" Workshop          "+(config.workshopEnabled?"Enabled":"Disabled")+"\n\n";

  if(!state.system.stableBoot) b += "NEXT  Allow boot validation to complete.";
  else if(WiFi.status()!=WL_CONNECTED) b += "NEXT  Connect Wi-Fi from the setup portal.";
  else if(config.weatherEnabled&&!state.weather.configured) b += "NEXT  Set ZIP or City, State in Weather settings.";
  else if(config.bambuEnabled&&!strlen(config.bambuHost)) b += "NEXT  Scan for your Bambu printer or enter its IP.";
  else if(state.system.updateAvailable) b += String("NEXT  Firmware ")+state.system.updateVersion+" is available.";
  else b += "NEXT  Core setup is healthy. Add optional integrations when useful.";
  lv_label_set_text(readinessBody,b.c_str());
}

'''
    if refresh_anchor not in s: raise SystemExit('refreshSystem anchor missing')
    s=s.replace(refresh_anchor,refresh+refresh_anchor,1)
    s=s.replace('refreshActivity(); refreshDevices(); refreshSystem();','refreshActivity(); refreshDevices(); refreshReadiness(); refreshSystem();',1)

    # Add Readiness to Apps by inserting before System, preserving the existing grid.
    apps_match=re.search(r'static void createApps\(\) \{.*?\n\}',s,re.S)
    if apps_match:
        a=apps_match.group(0)
        if 'ScreenId::Readiness' not in a:
            a=a.replace('{"System", ScreenId::System, C_GREEN}', '{"Readiness", ScreenId::Readiness, C_BLUE}, {"System", ScreenId::System, C_GREEN}')
            a=a.replace('for (int i = 0; i < 10; ++i)', 'for (int i = 0; i < (int)(sizeof(apps)/sizeof(apps[0])); ++i)')
            s=s[:apps_match.start()]+a+s[apps_match.end():]

    # Put readiness into Quick if the surface exists.
    qmatch=re.search(r'static void createQuick\(\) \{.*?\n\}',s,re.S)
    if qmatch:
        q=qmatch.group(0)
        if 'ScreenId::Readiness' not in q:
            q=q.replace('button(screenQuick, "Home",', 'button(screenQuick, "Readiness", 216, 328, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Readiness)), C_BLUE);\n  button(screenQuick, "Home",',1)
            s=s[:qmatch.start()]+q+s[qmatch.end():]

model.write_text(m); ino.write_text(s)
print('rc21 readiness center applied')
