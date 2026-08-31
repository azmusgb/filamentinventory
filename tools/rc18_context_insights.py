from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
model = root / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino = root / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'

m = model.read_text()
s = ino.read_text()

if '1.0.0-rc17' not in m and '1.0.0-rc18' not in m:
    raise SystemExit('Unexpected firmware version; rc17 or rc18 required')

m = m.replace('1.0.0-rc17', '1.0.0-rc18')

if 'screenInsights' not in s:
    s = s.replace('static lv_obj_t *screenActivity = nullptr;', 'static lv_obj_t *screenInsights = nullptr;\nstatic lv_obj_t *screenActivity = nullptr;', 1)
    s = s.replace('static lv_obj_t *activityBody = nullptr;', 'static lv_obj_t *insightsBody = nullptr;\nstatic lv_obj_t *activityBody = nullptr;', 1)
    s = s.replace('Timers, Printer, Filament, Workshop, Activity, Devices, System, Recovery, Ambient', 'Timers, Printer, Filament, Workshop, Insights, Activity, Devices, System, Recovery, Ambient', 1)
    s = s.replace('case ScreenId::Workshop: return screenWorkshop;', 'case ScreenId::Workshop: return screenWorkshop;\n    case ScreenId::Insights: return screenInsights;', 1)

    create_anchor = 'static void createActivity() {'
    create_block = r'''static void createInsights() {
  screenInsights = lv_obj_create(nullptr); styleScreen(screenInsights); addStatusBar(screenInsights, "INSIGHTS");
  insightsBody = wrapLabel(screenInsights, "Evaluating current context...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292);
  lv_obj_set_style_text_line_space(insightsBody, 5, 0);
  button(screenInsights, "Workshop", 12, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenInsights, "Devices", 114, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Devices)), C_BLUE);
  button(screenInsights, "Home", 216, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

'''
    if create_anchor not in s:
        raise SystemExit('createActivity anchor missing')
    s = s.replace(create_anchor, create_block + create_anchor, 1)
    s = s.replace('createWorkshop(); createActivity();', 'createWorkshop(); createInsights(); createActivity();', 1)

    refresh_anchor = 'static void refreshActivity() {'
    refresh_block = r'''static void refreshInsights() {
  if(!insightsBody) return;
  String b;
  int rank = 1;
  auto add = [&](const String &title, const String &detail) {
    b += String(rank++) + ". " + title + "\n";
    if(detail.length()) b += String("   ") + detail + "\n";
    b += "\n";
  };

  if(state.alertCount) {
    auto &a = state.alerts[0];
    if(a.severity == AlertSeverity::Urgent) add(String("URGENT • ") + a.title, a.detail);
  }
  if(state.system.updateAvailable) add(String("Update to ") + state.system.updateVersion, "Validated firmware is ready in the Update Center.");
  if(state.printer.error || state.printer.errorCode) add("Printer needs attention", state.printer.status);
  else if(state.printer.printing) add(String("Print ") + state.printer.progress + "% complete", formatMinutes(state.printer.remainingMinutes) + " remaining • " + state.printer.jobName);

  if(state.filament.online && state.filament.emptySpools > 0) add(String(state.filament.emptySpools) + " empty filament spool(s)", "Review inventory before the next print.");
  else if(state.filament.online && state.filament.lowSpools > 0) add(String(state.filament.lowSpools) + " low filament spool(s)", "Consider staging a replacement spool.");

  auto &env = state.workshop.environment;
  if(state.workshop.filterRequested) add("Air filtration requested", strlen(state.workshop.filterReason) ? state.workshop.filterReason : "Workshop automation requested filtration.");
  else if(env.online && !env.stale && env.pm25 >= config.pm25Alert) add("PM2.5 above target", String(env.pm25,1) + " vs " + String(config.pm25Alert,1) + " threshold");
  else if(env.online && !env.stale && env.voc >= config.vocAlert) add("VOC above target", String(env.voc,0) + " vs " + String(config.vocAlert,0) + " threshold");

  if(state.workshop.dryer.running) add(String("Drying ") + state.workshop.dryer.material, String(state.workshop.dryer.remainingSec/60UL) + " min remaining");
  if(state.weather.severeAlert) add("Weather alert", strlen(state.weather.alertHeadline) ? state.weather.alertHeadline : state.weather.condition);
  if(state.calendar.online && state.calendar.hasNext && state.calendar.nextEpoch > 0) {
    time_t now = time(nullptr);
    if(state.calendar.nextEpoch > now && state.calendar.nextEpoch - now <= 7200) add(String("Upcoming • ") + state.calendar.nextTitle, state.calendar.nextWhen);
  }

  if(rank == 1) {
    b = "ALL GOOD\n\nNo immediate actions are recommended.\n\n";
    if(!config.bambuEnabled && !config.weatherEnabled && !config.filamentEnabled && !config.homeAssistantEnabled && !config.calendarEnabled)
      b += "Next best step: connect an integration from the web dashboard.";
    else
      b += "The hub is watching printer, workshop, weather, inventory and system context for the next useful action.";
  }
  lv_label_set_text(insightsBody, b.c_str());
}

'''
    if refresh_anchor not in s:
        raise SystemExit('refreshActivity anchor missing')
    s = s.replace(refresh_anchor, refresh_block + refresh_anchor, 1)
    s = s.replace('refreshWorkshop(); refreshActivity();', 'refreshWorkshop(); refreshInsights(); refreshActivity();', 1)

    # Make the Home hero lead to context instead of a generic app grid.
    s = s.replace('reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Apps)))', 'reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Insights)))', 1)

    # Surface update/workshop context in the default system hero before generic Ready.
    old = 'else { title = config.deviceName; snprintf(value, sizeof(value), "Ready"); snprintf(detail, sizeof(detail), "%s • %lu min uptime", WiFi.status() == WL_CONNECTED ? "Online" : "Local mode", state.system.uptimeSec / 60UL); }'
    new = '''else if (state.system.updateAvailable) { title = "Update available"; snprintf(value, sizeof(value), "%s", state.system.updateVersion); snprintf(detail, sizeof(detail), "Open Insights or System to review"); }
      else if (state.workshop.filterRequested) { title = "Workshop air"; snprintf(value, sizeof(value), "Filter on"); snprintf(detail, sizeof(detail), "%s", strlen(state.workshop.filterReason) ? state.workshop.filterReason : "Automation active"); }
      else if (state.workshop.dryer.running) { title = "Filament dryer"; snprintf(value, sizeof(value), "%s", state.workshop.dryer.material); snprintf(detail, sizeof(detail), "%lu min remaining", (unsigned long)(state.workshop.dryer.remainingSec / 60UL)); }
      else { title = config.deviceName; snprintf(value, sizeof(value), "Ready"); snprintf(detail, sizeof(detail), "%s • %lu min uptime", WiFi.status() == WL_CONNECTED ? "Online" : "Local mode", state.system.uptimeSec / 60UL); }'''
    if old in s:
        s = s.replace(old, new, 1)

    # Add Insights to the app grid while keeping all operational surfaces reachable.
    apps_match = re.search(r'static void createApps\(\) \{.*?\n\}', s, re.S)
    if apps_match:
        block = apps_match.group(0)
        block = block.replace('{"Attention", ScreenId::Attention, C_RED}, {"Quick", ScreenId::Quick, C_BLUE}, {"Settings", ScreenId::Settings, C_PURPLE},', '{"Attention", ScreenId::Attention, C_RED}, {"Insights", ScreenId::Insights, C_PURPLE}, {"Quick", ScreenId::Quick, C_BLUE},\n    {"Activity", ScreenId::Activity, C_PURPLE}, {"Devices", ScreenId::Devices, C_BLUE}, {"Settings", ScreenId::Settings, C_PURPLE},')
        block = block.replace('{"System", ScreenId::System, C_GREEN}\n  };\n  for (int i = 0; i < 10; ++i)', '{"System", ScreenId::System, C_GREEN}\n  };\n  for (int i = 0; i < 13; ++i)')
        block = block.replace('58 + (i/3)*84, 92, 70', '54 + (i/3)*70, 92, 58')
        block = block.replace('button(screenApps, "Home", 114, 394, 194, 28', 'button(screenApps, "Home", 114, 402, 194, 24')
        s = s[:apps_match.start()] + block + s[apps_match.end():]

    # Add Insights shortcut to Quick if room exists; replace duplicate secondary Settings slot rather than growing beyond screen.
    quick_match = re.search(r'static void createQuick\(\) \{.*?\n\}', s, re.S)
    if quick_match:
        q = quick_match.group(0)
        if 'ScreenId::Insights' not in q:
            q = q.replace('button(screenQuick, "Activity",', 'button(screenQuick, "Insights", 216, 328, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Insights)), C_PURPLE);\n  button(screenQuick, "Activity",', 1)
            s = s[:quick_match.start()] + q + s[quick_match.end():]

model.write_text(m)
ino.write_text(s)
print('rc18 context insights applied')
