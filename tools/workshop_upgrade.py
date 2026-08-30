from pathlib import Path


def r(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"missing pattern in {path}: {old[:100]!r}")
    p.write_text(s.replace(old, new, 1))


ino = "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"
r(ino, 'static lv_obj_t *screenFilament = nullptr;\nstatic lv_obj_t *screenSystem = nullptr;', 'static lv_obj_t *screenFilament = nullptr;\nstatic lv_obj_t *screenWorkshop = nullptr;\nstatic lv_obj_t *screenSystem = nullptr;')
r(ino, 'static lv_obj_t *filamentBody = nullptr;\nstatic lv_obj_t *systemBody = nullptr;', 'static lv_obj_t *filamentBody = nullptr;\nstatic lv_obj_t *workshopBody = nullptr;\nstatic lv_obj_t *systemBody = nullptr;')
r(ino, '  Timers, Printer, Filament, System, Recovery, Ambient\n};', '  Timers, Printer, Filament, Workshop, System, Recovery, Ambient\n};')
r(ino, '    case ScreenId::Filament: return screenFilament;\n    case ScreenId::System: return screenSystem;', '    case ScreenId::Filament: return screenFilament;\n    case ScreenId::Workshop: return screenWorkshop;\n    case ScreenId::System: return screenSystem;')

old_apps = '''  struct App { const char *name; ScreenId id; lv_color_t color; } apps[] = {
    {"Controls", ScreenId::Controls, C_GREEN}, {"Printer", ScreenId::Printer, C_GREEN}, {"Filament", ScreenId::Filament, C_BLUE},
    {"Today", ScreenId::Today, C_PURPLE}, {"Timers", ScreenId::Timers, C_ORANGE}, {"Attention", ScreenId::Attention, C_RED},
    {"Quick", ScreenId::Quick, C_BLUE}, {"Settings", ScreenId::Settings, C_PURPLE}, {"System", ScreenId::System, C_GREEN}
  };
  for (int i = 0; i < 9; ++i) button(screenApps, apps[i].name, 12 + (i%3)*102, 66 + (i/3)*104, 92, 88, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(apps[i].id)), apps[i].color);
  button(screenApps, "Home", 12, 392, 296, 30, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)));'''
new_apps = '''  struct App { const char *name; ScreenId id; lv_color_t color; } apps[] = {
    {"Workshop", ScreenId::Workshop, C_ORANGE}, {"Printer", ScreenId::Printer, C_GREEN}, {"Filament", ScreenId::Filament, C_BLUE},
    {"Controls", ScreenId::Controls, C_GREEN}, {"Today", ScreenId::Today, C_PURPLE}, {"Timers", ScreenId::Timers, C_ORANGE},
    {"Attention", ScreenId::Attention, C_RED}, {"Quick", ScreenId::Quick, C_BLUE}, {"Settings", ScreenId::Settings, C_PURPLE},
    {"System", ScreenId::System, C_GREEN}
  };
  for (int i = 0; i < 10; ++i) button(screenApps, apps[i].name, 12 + (i%3)*102, 58 + (i/3)*84, 92, 70, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(apps[i].id)), apps[i].color);
  button(screenApps, "Home", 114, 394, 194, 28, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)));'''
r(ino, old_apps, new_apps)

r(ino, '''  else if (action == 5) { config.heroMode = static_cast<HeroMode>((static_cast<int>(config.heroMode)+1)%6); }
  else if (action >= 10 && action <= 12)''', '''  else if (action == 5) { config.heroMode = static_cast<HeroMode>((static_cast<int>(config.heroMode)+1)%6); }
  else if (action == 6) { config.ambientMode = static_cast<AmbientDisplayMode>((static_cast<int>(config.ambientMode)+1)%5); }
  else if (action == 7) { config.airMode = static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode = config.airMode; }
  else if (action >= 10 && action <= 12)''')

old_settings = '''  button(screenSettings, "Theme", 12, 216, 142, 50, settingAction, reinterpret_cast<void *>(4), C_BLUE);
  button(screenSettings, "NOW source", 166, 216, 142, 50, settingAction, reinterpret_cast<void *>(5), C_GREEN);
  button(screenSettings, "Card 1", 12, 278, 92, 48, settingAction, reinterpret_cast<void *>(10));
  button(screenSettings, "Card 2", 114, 278, 92, 48, settingAction, reinterpret_cast<void *>(11));
  button(screenSettings, "Card 3", 216, 278, 92, 48, settingAction, reinterpret_cast<void *>(12));
  button(screenSettings, "Wi-Fi", 12, 340, 142, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  button(screenSettings, "Home", 166, 340, 142, 48, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);'''
new_settings = '''  button(screenSettings, "Theme", 12, 216, 92, 46, settingAction, reinterpret_cast<void *>(4), C_BLUE);
  button(screenSettings, "NOW", 114, 216, 92, 46, settingAction, reinterpret_cast<void *>(5), C_GREEN);
  button(screenSettings, "Ambient", 216, 216, 92, 46, settingAction, reinterpret_cast<void *>(6), C_PURPLE);
  button(screenSettings, "Air mode", 12, 274, 92, 46, settingAction, reinterpret_cast<void *>(7), C_ORANGE);
  button(screenSettings, "Card 1", 114, 274, 92, 46, settingAction, reinterpret_cast<void *>(10));
  button(screenSettings, "Card 2", 216, 274, 92, 46, settingAction, reinterpret_cast<void *>(11));
  button(screenSettings, "Card 3", 12, 332, 92, 46, settingAction, reinterpret_cast<void *>(12));
  button(screenSettings, "Workshop", 114, 332, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenSettings, "Home", 216, 332, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);'''
r(ino, old_settings, new_settings)

old_printer = '''static void createPrinter() {
  screenPrinter = lv_obj_create(nullptr); styleScreen(screenPrinter); addStatusBar(screenPrinter, "PRINTER");
  printerBody = wrapLabel(screenPrinter, "Bambu integration not configured", &lv_font_montserrat_14, C_TEXT, 14, 64, 292); lv_obj_set_style_text_line_space(printerBody, 9, 0);
  button(screenPrinter, "Settings", 12, 370, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Settings)));
  button(screenPrinter, "Home", 166, 370, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}'''
new_printer = '''static void createPrinter() {
  screenPrinter = lv_obj_create(nullptr); styleScreen(screenPrinter); addStatusBar(screenPrinter, "PRINTER");
  printerBody = wrapLabel(screenPrinter, "Bambu integration not configured", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(printerBody, 5, 0);
  button(screenPrinter, "Pause", 12, 304, 92, 46, [](lv_event_t*){ bambuPlugin.pausePrint(); }, nullptr, C_ORANGE);
  button(screenPrinter, "Resume", 114, 304, 92, 46, [](lv_event_t*){ bambuPlugin.resumePrint(); }, nullptr, C_GREEN);
  lv_obj_t *stop = button(screenPrinter, "Hold Stop", 216, 304, 92, 46, nullptr, nullptr, C_RED);
  lv_obj_add_event_cb(stop, [](lv_event_t*){ bambuPlugin.stopPrint(); }, LV_EVENT_LONG_PRESSED, nullptr);
  button(screenPrinter, "Workshop", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenPrinter, "Home", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}'''
r(ino, old_printer, new_printer)

insert_before_system = '''static void createSystem() {'''
workshop_create = '''static void createWorkshop() {
  screenWorkshop = lv_obj_create(nullptr); styleScreen(screenWorkshop); addStatusBar(screenWorkshop, "WORKSHOP");
  workshopBody = wrapLabel(screenWorkshop, "Workshop starting...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(workshopBody, 5, 0);
  button(screenWorkshop, "Air mode", 12, 304, 92, 46, [](lv_event_t*){ config.airMode=static_cast<AirMode>((static_cast<int>(config.airMode)+1)%4); state.workshop.airMode=config.airMode; configStore.save(config); }, nullptr, C_BLUE);
  button(screenWorkshop, "PETG dry", 114, 304, 92, 46, [](lv_event_t*){ workshopService.startDryer(state,"PETG",55,6UL*3600UL); }, nullptr, C_ORANGE);
  button(screenWorkshop, "Stop dryer", 216, 304, 92, 46, [](lv_event_t*){ workshopService.stopDryer(state); }, nullptr, C_RED);
  button(screenWorkshop, "Printer", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Printer)), C_GREEN);
  button(screenWorkshop, "Home", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

static void createSystem() {'''
r(ino, insert_before_system, workshop_create)
r(ino, 'createPrinter(); createFilament(); createSystem();', 'createPrinter(); createFilament(); createWorkshop(); createSystem();')

old_refresh_printer = '''static void refreshPrinter() {
  if(!printerBody)return; char b[520]; if(!config.bambuEnabled) snprintf(b,sizeof(b),"Bambu Lab integration is not configured.\\n\\nUse the web dashboard to enter the P1S IP address, serial number and LAN access code."); else if(!state.printer.online) snprintf(b,sizeof(b),"P1S OFFLINE\\n\\nConfigured host: %s\\nWaiting for local MQTT on port 8883.",config.bambuHost); else snprintf(b,sizeof(b),"P1S • %s\\n\\nJob       %s\\nProgress  %u%%\\nRemaining %s\\nLayer     %d / %d\\nNozzle    %.0f°C\\nBed       %.0f°C\\nAMS       %d loaded slots\\nHumidity  %d\\nError     %lu",state.printer.status,strlen(state.printer.jobName)?state.printer.jobName:"—",state.printer.progress,formatMinutes(state.printer.remainingMinutes).c_str(),state.printer.currentLayer,state.printer.totalLayers,state.printer.nozzleC,state.printer.bedC,state.printer.amsLoadedSlots,state.printer.amsHumidity,(unsigned long)state.printer.errorCode); lv_label_set_text(printerBody,b);
}'''
new_refresh_printer = '''static void refreshPrinter() {
  if(!printerBody)return; String b;
  if(!config.bambuEnabled) b="Bambu Lab integration is not configured.\\nUse the web dashboard to scan the LAN or enter printer credentials.";
  else if(!state.printer.online) b=String("PRINTER OFFLINE\\nHost: ")+config.bambuHost+"\\nWaiting for local MQTT.";
  else {
    b=String(state.printer.displayName)+" • "+state.printer.status+"\\n"+(strlen(state.printer.jobName)?state.printer.jobName:"—")+" • "+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)+"\\n";
    b+=String("Layer ")+state.printer.currentLayer+"/"+state.printer.totalLayers+" • N "+String(state.printer.nozzleC,0)+"°/"+String(state.printer.nozzleTargetC,0)+"° • B "+String(state.printer.bedC,0)+"°/"+String(state.printer.bedTargetC,0)+"°\\n";
    b+=String("Chamber ")+String(state.printer.chamberC,0)+"° • Speed "+state.printer.speedPercent+"% • AMS RH "+state.printer.amsHumidity+"\\n\\nAMS\\n";
    for(int i=0;i<4;i++){ auto &s=state.printer.amsSlots[i]; b+=String(i==state.printer.activeTray?"> ":"  ")+"A"+(i+1)+" "; if(!s.loaded)b+="Empty"; else { b+=strlen(s.material)?s.material:"Filament"; if(strlen(s.name)){b+=" ";b+=s.name;} if(s.remainingPercent>=0){b+=" • ";b+=s.remainingPercent;b+="%";} } b+="\\n"; }
    if(state.printer.errorCode){b+="Error 0x";b+=String(state.printer.errorCode,HEX);}
  }
  lv_label_set_text(printerBody,b.c_str());
}'''
r(ino, old_refresh_printer, new_refresh_printer)

r(ino, '''static void refreshSystem() {''', '''static void refreshWorkshop() {
  if(!workshopBody)return; String b="PRINTER\\n";
  b += state.printer.online ? (String(state.printer.status)+" • "+state.printer.progress+"% • "+formatMinutes(state.printer.remainingMinutes)) : "Offline / not configured";
  b += "\\n\\nENVIRONMENT\\n";
  auto &e=state.workshop.environment;
  if(!e.online) b += "No sensor connected";
  else { b += String(e.source)+" • "+(e.stale?"STALE":"LIVE")+"\\n"+String(e.temperatureC,1)+"°C • "+String(e.humidity,0)+"% RH • PM2.5 "+String(e.pm25,1)+"\\nVOC "+String(e.voc,0)+" • CO2 "+String(e.co2,0)+" ppm • Presence "+(e.presence?"yes":"no"); }
  b += "\\n\\nAIR  "; b += airModeName(config.airMode); b += state.workshop.filterRequested ? String(" • FILTER ON\\n")+state.workshop.filterReason : " • filter idle";
  b += "\\n\\nDRYER  "; auto &d=state.workshop.dryer; if(d.running){ b += String(d.material)+" • "+d.targetC+"°C • "+(d.remainingSec/60UL)+" min"; } else b += d.completed?"Complete":"Idle";
  if(state.activityCount){ b+="\\n\\nRECENT  "; b+=state.activity[0].title; }
  lv_label_set_text(workshopBody,b.c_str());
}

static void refreshSystem() {''')
r(ino, 'refreshPrinter(); refreshFilament(); refreshSystem(); refreshAmbient();', 'refreshPrinter(); refreshFilament(); refreshWorkshop(); refreshSystem(); refreshAmbient();')

r(ino, '''if(!settingsBody)return; char b[300]; snprintf(b,sizeof(b),"Brightness %u%% • Ambient %us @ %u%%\\nTimezone %s\\nTheme %s • NOW %s\\nCards: %s • %s • %s\\n\\nFull integration and secret configuration is available at http://%s/",config.brightness,config.ambientTimeoutSec,config.ambientBrightness,config.timezoneId,themeName(config.theme),heroModeName(config.heroMode),homeCardName(config.homeCards[0]),homeCardName(config.homeCards[1]),homeCardName(config.homeCards[2]),state.system.ip); lv_label_set_text(settingsBody,b);''', '''if(!settingsBody)return; char b[360]; snprintf(b,sizeof(b),"Brightness %u%% • dim %us @ %u%%\\nTimezone %s\\nTheme %s • NOW %s\\nAmbient %s • Air %s\\nCards: %s • %s • %s\\nWeb: http://%s/",config.brightness,config.ambientTimeoutSec,config.ambientBrightness,config.timezoneId,themeName(config.theme),heroModeName(config.heroMode),ambientModeName(config.ambientMode),airModeName(config.airMode),homeCardName(config.homeCards[0]),homeCardName(config.homeCards[1]),homeCardName(config.homeCards[2]),state.system.ip); lv_label_set_text(settingsBody,b);''')

old_ambient = '''  String s;if(state.alertCount&&state.alerts[0].severity!=AlertSeverity::Info)s=String(state.alerts[0].title)+"\\n"+state.alerts[0].detail;else if(state.printer.printing)s=String("P1S • ")+state.printer.progress+"%\\n"+formatMinutes(state.printer.remainingMinutes)+" remaining";else if(state.calendar.hasNext)s=String(state.calendar.nextTitle)+"\\n"+state.calendar.nextWhen;else if(state.weather.online)s=String((int)round(state.weather.temperatureC*9/5+32))+"°F • "+state.weather.condition+"\\nTouch to wake";else s="Everything looks good\\nTouch to wake"; lv_label_set_text(ambientSummary,s.c_str());'''
new_ambient = '''  String s; AmbientDisplayMode mode=config.ambientMode;
  if(mode==AmbientDisplayMode::Auto){ if(state.alertCount&&state.alerts[0].severity!=AlertSeverity::Info)s=String(state.alerts[0].title)+"\\n"+state.alerts[0].detail; else if(state.printer.printing)mode=AmbientDisplayMode::Printer; else if(state.workshop.environment.online)mode=AmbientDisplayMode::Workshop; else mode=AmbientDisplayMode::Clock; }
  if(mode==AmbientDisplayMode::Minimal) s="";
  else if(mode==AmbientDisplayMode::Printer) s=state.printer.online ? String(state.printer.displayName)+" • "+state.printer.progress+"%\\n"+formatMinutes(state.printer.remainingMinutes)+" remaining" : "Printer offline";
  else if(mode==AmbientDisplayMode::Workshop){ auto &e=state.workshop.environment; s=String("Workshop • ")+(state.workshop.filterRequested?"Filter on":"Air idle")+"\\n"+(e.online?String(e.temperatureC,0)+"°C • "+String(e.humidity,0)+"% RH • PM2.5 "+String(e.pm25,0):"Sensors not connected"); }
  else if(!s.length()) s=state.weather.online?String((int)round(state.weather.temperatureC*9/5+32))+"°F • "+state.weather.condition+"\\nTouch to wake":"Touch to wake";
  lv_label_set_text(ambientSummary,s.c_str());'''
r(ino, old_ambient, new_ambient)

cpp = "firmware/waveshare-home/WaveshareHome/Services.cpp"
r(cpp, '''  for (auto &timer : state.timers) if (timer.fired) add(state, AlertSeverity::Attention, "Timer", "Timer complete", timer.label);
}''', '''  for (auto &timer : state.timers) if (timer.fired) add(state, AlertSeverity::Attention, "Timer", "Timer complete", timer.label);
  if (config.workshopSensorEnabled) {
    auto &e = state.workshop.environment;
    if (!e.online || e.stale) add(state, AlertSeverity::Info, "Workshop", "Environment sensor unavailable", "Waiting for fresh workshop telemetry.");
    else {
      if (e.pm25 >= config.pm25Alert) add(state, AlertSeverity::Attention, "Workshop", "PM2.5 elevated", "Air filtration is recommended.");
      if (e.voc >= config.vocAlert) add(state, AlertSeverity::Attention, "Workshop", "VOC elevated", "Air filtration is recommended.");
      if (e.humidity >= config.humidityAlert) add(state, AlertSeverity::Info, "Workshop", "Humidity elevated", "Review filament storage conditions.");
    }
  }
  if (state.workshop.dryer.completed) add(state, AlertSeverity::Attention, "Dryer", "Drying complete", state.workshop.dryer.material);
}''')

route_anchor = '''  server_.on("/bambu/use", HTTP_POST, [this]() {
    int index = server_.arg("index").toInt();
    if (!bambu_.useDiscovered(*config_, *state_, index)) { server_.send(404, "text/plain", "Discovered printer not found"); return; }
    store_.save(*config_); configChanged_ = true;
    server_.sendHeader("Location", "/#bambu", true);
    server_.send(303, "text/plain", "Printer selected");
  });'''
route_new = route_anchor + '''
  server_.on("/bambu/pause", HTTP_POST, [this]() { bool ok=bambu_.pausePrint(); server_.send(ok?200:409,"text/plain",ok?"Pause requested":"Printer unavailable"); });
  server_.on("/bambu/resume", HTTP_POST, [this]() { bool ok=bambu_.resumePrint(); server_.send(ok?200:409,"text/plain",ok?"Resume requested":"Printer unavailable"); });
  server_.on("/bambu/stop", HTTP_POST, [this]() { if(server_.arg("confirm")!="STOP"){server_.send(400,"text/plain","STOP confirmation required");return;} bool ok=bambu_.stopPrint(); server_.send(ok?200:409,"text/plain",ok?"Stop requested":"Printer unavailable"); });
  server_.on("/api/sensor", HTTP_POST, [this]() {
    auto &e=state_->workshop.environment; copyText(e.source,sizeof(e.source),server_.arg("source").length()?server_.arg("source"):"External sensor");
    e.temperatureC=server_.arg("temperatureC").toFloat(); e.humidity=server_.arg("humidity").toFloat(); e.pm25=server_.arg("pm25").toFloat(); e.voc=server_.arg("voc").toFloat(); e.co2=server_.arg("co2").toFloat();
    e.presence=server_.arg("presence")=="1"||server_.arg("presence")=="true"||server_.arg("presence")=="on"; e.online=true; e.stale=false; e.updatedMs=millis();
    server_.send(200,"application/json","{\\"ok\\":true}");
  });
  server_.on("/dryer/start", HTTP_POST, [this]() { auto &d=state_->workshop.dryer; copyText(d.material,sizeof(d.material),server_.arg("material").length()?server_.arg("material"):"Filament"); d.targetC=constrain(server_.arg("temperatureC").toInt(),30,90); d.durationSec=(uint32_t)constrain(server_.arg("minutes").toInt(),1,1440)*60UL; d.remainingSec=d.durationSec; d.startedMs=millis(); d.running=true; d.completed=false; server_.sendHeader("Location","/#workshop",true); server_.send(303,"text/plain","Dryer started"); });
  server_.on("/dryer/stop", HTTP_POST, [this]() { state_->workshop.dryer.running=false; state_->workshop.dryer.remainingSec=0; server_.sendHeader("Location","/#workshop",true); server_.send(303,"text/plain","Dryer stopped"); });
  server_.on("/air/mode", HTTP_POST, [this]() { int m=constrain(server_.arg("mode").toInt(),0,3); config_->airMode=static_cast<AirMode>(m); state_->workshop.airMode=config_->airMode; store_.save(*config_); configChanged_=true; server_.sendHeader("Location","/#workshop",true); server_.send(303,"text/plain","Air mode updated"); });
  server_.on("/api/voice", HTTP_POST, [this]() {
    String cmd=server_.arg("command"); cmd.toLowerCase(); copyText(state_->voice.lastCommand,sizeof(state_->voice.lastCommand),cmd); String result="Command not recognized"; bool ok=false;
    if(cmd.indexOf("pause")>=0 && cmd.indexOf("printer")>=0){ok=bambu_.pausePrint();result=ok?"Printer pause requested":"Printer unavailable";}
    else if(cmd.indexOf("resume")>=0 && cmd.indexOf("printer")>=0){ok=bambu_.resumePrint();result=ok?"Printer resume requested":"Printer unavailable";}
    else if(cmd.indexOf("5")>=0 && cmd.indexOf("timer")>=0){ok=timers_.start(*state_,300,"Voice 5 minute timer")>=0;result=ok?"Five minute timer started":"Timer slots full";}
    else if(cmd.indexOf("scene")>=0){ok=homeAssistant_.callScene(*config_);result=ok?"Scene requested":"Scene unavailable";}
    else if(cmd.indexOf("automation")>=0){ok=homeAssistant_.callAutomation(*config_);result=ok?"Automation requested":"Automation unavailable";}
    else if(cmd.indexOf("air auto")>=0){config_->airMode=AirMode::Auto;state_->workshop.airMode=AirMode::Auto;store_.save(*config_);ok=true;result="Air mode set to Auto";}
    else if(cmd.indexOf("air off")>=0){config_->airMode=AirMode::Off;state_->workshop.airMode=AirMode::Off;store_.save(*config_);ok=true;result="Air mode set to Off";}
    copyText(state_->voice.status,sizeof(state_->voice.status),result); String out=String("{\\"ok\\":")+(ok?"true":"false")+",\\"result\\":\\""+result+"\\"}"; server_.send(ok?200:400,"application/json",out);
  });'''
r(cpp, route_anchor, route_new)

web_bambu_anchor = '''  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");'''
web_bambu_new = '''  if (state_->printer.online) {
    s += F("<div class='grid'>");
    for(int i=0;i<4;i++){ auto &slot=state_->printer.amsSlots[i]; s += F("<div class='card' style='margin:4px 0'><strong>AMS A"); s += i+1; s += state_->printer.activeTray==i?F(" • ACTIVE</strong>"):F("</strong>"); s += F("<p>"); if(!slot.loaded)s+=F("Empty"); else {s+=htmlEscape(slot.material); if(strlen(slot.name)){s+=F(" • ");s+=htmlEscape(slot.name);} if(slot.remainingPercent>=0){s+=F("<br>");s+=slot.remainingPercent;s+=F("% remaining");}} s+=F("</p></div>"); }
    s += F("</div><div class='grid'><form method='post' action='/bambu/pause'><button class='muted'>Pause</button></form><form method='post' action='/bambu/resume'><button>Resume</button></form><form method='post' action='/bambu/stop'><input type='hidden' name='confirm' value='STOP'><button class='danger' onclick=\"return confirm('Stop the current print?')\">Stop print</button></form></div>");
  }
  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");'''
r(cpp, web_bambu_anchor, web_bambu_new)

calendar_anchor = '''  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'");'''
workshop_html = '''  s += F("<h3 id='workshop'>Workshop</h3><label><input type='checkbox' name='workshopEnabled'"); s += checked(config_->workshopEnabled); s += F(">Enable Workshop</label><div class='row'><label><input type='checkbox' name='workshopSensorEnabled'"); s += checked(config_->workshopSensorEnabled); s += F(">External environment sensor</label><label><input type='checkbox' name='presenceEnabled'"); s += checked(config_->presenceEnabled); s += F(">Presence-aware display</label></div><label><input type='checkbox' name='dryerEnabled'"); s += checked(config_->dryerEnabled); s += F(">Enable dryer manager</label><div class='row'><div><label>Ambient mode</label><select name='ambientMode'>");
  const char *ambientNames[]={"Auto","Clock","Printer","Workshop","Minimal"}; for(int i=0;i<5;i++){s+=F("<option value='");s+=i;s+=F("'");s+=selected((int)config_->ambientMode==i);s+=F(">");s+=ambientNames[i];s+=F("</option>");}
  s += F("</select></div><div><label>Air/filter mode</label><select name='airMode'>"); const char *airNames[]={"Off","Manual","Auto","Post-print"}; for(int i=0;i<4;i++){s+=F("<option value='");s+=i;s+=F("'");s+=selected((int)config_->airMode==i);s+=F(">");s+=airNames[i];s+=F("</option>");} s+=F("</select></div></div><div class='row'><div><label>Post-print filter minutes</label><input type='number' min='0' max='120' name='postFilterMinutes' value='");s+=config_->postPrintFilterMinutes;s+=F("'></div><div><label>Humidity alert %</label><input type='number' min='1' max='100' name='humidityAlert' value='");s+=String(config_->humidityAlert,0);s+=F("'></div></div><div class='row'><div><label>PM2.5 alert</label><input type='number' step='0.1' name='pm25Alert' value='");s+=String(config_->pm25Alert,1);s+=F("'></div><div><label>VOC alert</label><input type='number' step='1' name='vocAlert' value='");s+=String(config_->vocAlert,0);s+=F("'></div></div><hr>");

  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'");'''
r(cpp, calendar_anchor, workshop_html)

actions_anchor = '''  s += F("<div class='card'><h2>Actions</h2><div class='grid'>'''
workshop_cards = '''  s += F("<div class='card' id='workshop'><h2>Workshop status</h2><div class='grid'><div><h3>Environment</h3><p>"); if(state_->workshop.environment.online){auto &e=state_->workshop.environment;s+=String(e.temperatureC,1)+" C • "+String(e.humidity,0)+"% RH<br>PM2.5 "+String(e.pm25,1)+" • VOC "+String(e.voc,0)+" • CO2 "+String(e.co2,0)+" ppm<br>Presence "+(e.presence?"yes":"no")+(e.stale?" • STALE":" • LIVE");} else s+=F("No sensor connected"); s+=F("</p></div><div><h3>Air management</h3><p>Mode "); const char *airNow[]={"Off","Manual","Auto","Post-print"};s+=airNow[(int)config_->airMode];s+=F("<br>Filter request: ");s+=state_->workshop.filterRequested?"ON":"idle";if(strlen(state_->workshop.filterReason)){s+=F("<br>");s+=htmlEscape(state_->workshop.filterReason);}s+=F("</p></div></div><div class='grid'>"); for(int i=0;i<4;i++){s+=F("<form method='post' action='/air/mode'><input type='hidden' name='mode' value='");s+=i;s+=F("'><button class='muted'>");s+=airNow[i];s+=F("</button></form>");}s+=F("</div><hr><h3>Dryer</h3><p>");if(state_->workshop.dryer.running){s+=htmlEscape(state_->workshop.dryer.material);s+=F(" • ");s+=state_->workshop.dryer.targetC;s+=F(" C • ");s+=state_->workshop.dryer.remainingSec/60UL;s+=F(" min remaining");}else s+=state_->workshop.dryer.completed?"Complete":"Idle";s+=F("</p><form method='post' action='/dryer/start'><div class='row'><input name='material' value='PETG' placeholder='Material'><input type='number' name='temperatureC' value='55' min='30' max='90'></div><label>Duration minutes</label><input type='number' name='minutes' value='360' min='1' max='1440'><button>Start dryer timer</button></form><form method='post' action='/dryer/stop'><button class='danger'>Stop dryer</button></form><hr><h3>External sensor ingest</h3><p><small>POST telemetry to <code>/api/sensor</code> with source, temperatureC, humidity, pm25, voc, co2 and presence.</small></p><h3>Voice / command framework</h3><p>");s+=htmlEscape(state_->voice.status);s+=F("</p><form method='post' action='/api/voice'><input name='command' placeholder='e.g. pause printer, air auto, start 5 minute timer'><button class='muted'>Run command</button></form><hr><h3>Recent activity</h3>");if(!state_->activityCount)s+=F("<p>No activity yet.</p>");else{for(int i=0;i<state_->activityCount && i<6;i++){auto &a=state_->activity[i];if(!a.valid)continue;s+=F("<p><strong>");s+=htmlEscape(a.title);s+=F("</strong><br><small>");s+=htmlEscape(a.source);if(strlen(a.detail)){s+=F(" • ");s+=htmlEscape(a.detail);}s+=F("</small></p>");}}s+=F("</div>");

  s += F("<div class='card'><h2>Actions</h2><div class='grid'>'''
r(cpp, actions_anchor, workshop_cards)

status_anchor = '''  doc["printer"]["updatedMs"] = state_->printer.updatedMs;'''
status_new = '''  doc["printer"]["updatedMs"] = state_->printer.updatedMs;
  for(int i=0;i<4;i++){auto &slot=state_->printer.amsSlots[i];doc["printer"]["amsSlots"][i]["loaded"]=slot.loaded;doc["printer"]["amsSlots"][i]["active"]=slot.active;doc["printer"]["amsSlots"][i]["material"]=slot.material;doc["printer"]["amsSlots"][i]["name"]=slot.name;doc["printer"]["amsSlots"][i]["color"]=slot.color;doc["printer"]["amsSlots"][i]["remainingPercent"]=slot.remainingPercent;}'''
r(cpp, status_anchor, status_new)
r(cpp, '''  doc["calendar"]["next"] = state_->calendar.nextTitle;
  doc["alerts"] = state_->alertCount;''', '''  doc["calendar"]["next"] = state_->calendar.nextTitle;
  doc["workshop"]["enabled"] = config_->workshopEnabled;
  doc["workshop"]["airMode"] = (int)config_->airMode;
  doc["workshop"]["ambientMode"] = (int)config_->ambientMode;
  doc["workshop"]["filterRequested"] = state_->workshop.filterRequested;
  doc["workshop"]["filterReason"] = state_->workshop.filterReason;
  auto &env=state_->workshop.environment; doc["workshop"]["environment"]["online"]=env.online;doc["workshop"]["environment"]["stale"]=env.stale;doc["workshop"]["environment"]["source"]=env.source;doc["workshop"]["environment"]["temperatureC"]=env.temperatureC;doc["workshop"]["environment"]["humidity"]=env.humidity;doc["workshop"]["environment"]["pm25"]=env.pm25;doc["workshop"]["environment"]["voc"]=env.voc;doc["workshop"]["environment"]["co2"]=env.co2;doc["workshop"]["environment"]["presence"]=env.presence;
  auto &dryer=state_->workshop.dryer;doc["workshop"]["dryer"]["running"]=dryer.running;doc["workshop"]["dryer"]["completed"]=dryer.completed;doc["workshop"]["dryer"]["material"]=dryer.material;doc["workshop"]["dryer"]["targetC"]=dryer.targetC;doc["workshop"]["dryer"]["remainingSec"]=dryer.remainingSec;
  doc["voice"]["microphoneAvailable"]=state_->voice.microphoneAvailable;doc["voice"]["status"]=state_->voice.status;doc["voice"]["lastCommand"]=state_->voice.lastCommand;
  for(int i=0;i<state_->activityCount;i++){auto &a=state_->activity[i];if(!a.valid)continue;doc["activity"][i]["source"]=a.source;doc["activity"][i]["title"]=a.title;doc["activity"][i]["detail"]=a.detail;doc["activity"][i]["epoch"]=(long long)a.epoch;}
  doc["alerts"] = state_->alertCount;''')

save_anchor = '''  config_->audioVolume = constrain(server_.arg("audioVolume").toInt(), 0, 100);'''
save_new = '''  config_->audioVolume = constrain(server_.arg("audioVolume").toInt(), 0, 100);
  config_->workshopEnabled = server_.hasArg("workshopEnabled");
  config_->workshopSensorEnabled = server_.hasArg("workshopSensorEnabled");
  config_->presenceEnabled = server_.hasArg("presenceEnabled");
  config_->dryerEnabled = server_.hasArg("dryerEnabled");
  config_->ambientMode = static_cast<AmbientDisplayMode>(constrain(server_.arg("ambientMode").toInt(),0,4));
  config_->airMode = static_cast<AirMode>(constrain(server_.arg("airMode").toInt(),0,3));
  config_->postPrintFilterMinutes = constrain(server_.arg("postFilterMinutes").toInt(),0,120);
  config_->pm25Alert = max(0.0f,server_.arg("pm25Alert").toFloat());
  config_->vocAlert = max(0.0f,server_.arg("vocAlert").toFloat());
  config_->humidityAlert = constrain(server_.arg("humidityAlert").toFloat(),1.0f,100.0f);'''
r(cpp, save_anchor, save_new)

print("Workshop phase-two surfaces applied")
