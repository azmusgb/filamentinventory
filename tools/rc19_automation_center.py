from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
model = root / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino = root / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
m = model.read_text()
s = ino.read_text()

if '1.0.0-rc18' not in m and '1.0.0-rc19' not in m:
    raise SystemExit('Unexpected firmware version; rc18 or rc19 required')
m = m.replace('1.0.0-rc18', '1.0.0-rc19')

if 'screenAutomation' not in s:
    s = s.replace('static lv_obj_t *screenActivity = nullptr;', 'static lv_obj_t *screenAutomation = nullptr;\nstatic lv_obj_t *screenActivity = nullptr;')
    s = s.replace('static lv_obj_t *activityBody = nullptr;', 'static lv_obj_t *automationBody = nullptr;\nstatic lv_obj_t *activityBody = nullptr;')
    s = s.replace('Timers, Printer, Filament, Workshop, Insights, Activity, Devices, System, Recovery, Ambient',
                  'Timers, Printer, Filament, Workshop, Insights, Automation, Activity, Devices, System, Recovery, Ambient')
    s = s.replace('case ScreenId::Insights: return screenInsights;',
                  'case ScreenId::Insights: return screenInsights;\n    case ScreenId::Automation: return screenAutomation;')

    anchor = 'static void createActivity() {'
    block = r'''static void createAutomation() {
  screenAutomation = lv_obj_create(nullptr); styleScreen(screenAutomation); addStatusBar(screenAutomation, "AUTOMATION");
  automationBody = wrapLabel(screenAutomation, "Evaluating local rules...", &lv_font_montserrat_12, C_TEXT, 14, 54, 292); lv_obj_set_style_text_line_space(automationBody, 5, 0);
  button(screenAutomation, "Workshop", 12, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Workshop)), C_ORANGE);
  button(screenAutomation, "Insights", 114, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Insights)), C_PURPLE);
  button(screenAutomation, "Home", 216, 366, 92, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

'''
    if anchor not in s:
        raise SystemExit('createActivity anchor missing')
    s = s.replace(anchor, block + anchor, 1)
    s = s.replace('createInsights(); createActivity();', 'createInsights(); createAutomation(); createActivity();')

    refresh_anchor = 'static void refreshActivity() {'
    refresh = r'''static void refreshAutomation() {
  if(!automationBody) return;
  String b = "LOCAL RULES\n\n";
  auto &e = state.workshop.environment;

  b += String("Air quality guard     ");
  if(config.airMode != AirMode::Auto) b += "Standby (Air not Auto)";
  else if(!e.online) b += "Waiting for sensor";
  else if(e.pm25 > config.pm25Alert || e.voc > config.vocAlert) b += state.workshop.filterRequested ? "ACTIVE • filter requested" : "Threshold exceeded";
  else b += "Armed";
  b += "\n";

  b += String("Post-print filter    ");
  if(config.airMode != AirMode::PostPrint) b += "Standby";
  else if(state.workshop.filterRequested) b += "ACTIVE";
  else b += "Armed";
  b += "\n";

  b += String("Presence wake        ");
  if(!config.presenceEnabled) b += "Disabled";
  else if(!e.online) b += "Waiting for sensor";
  else b += e.presence ? "ACTIVE • occupied" : "Armed";
  b += "\n";

  b += String("Print context        ") + (state.printer.printing ? "ACTIVE • printer view prioritized" : "Armed") + "\n";
  b += String("Severe weather       ") + (!config.severeWeatherEnabled ? "Disabled" : state.weather.severeAlert ? "ACTIVE • alert surfaced" : "Armed") + "\n";
  b += String("OTA boot protection  ") + (state.system.stableBoot ? "Armed" : "ACTIVE • validating boot") + "\n\n";

  b += "DECISION\n";
  if(state.alertCount && state.alerts[0].severity == AlertSeverity::Urgent) b += String("Urgent: ") + state.alerts[0].title;
  else if(state.workshop.filterRequested) b += String("Filtering: ") + (strlen(state.workshop.filterReason) ? state.workshop.filterReason : "automation request");
  else if(state.printer.printing) b += String("Printing: ") + state.printer.progress + "% • " + formatMinutes(state.printer.remainingMinutes) + " left";
  else if(state.workshop.dryer.running) b += String("Drying ") + state.workshop.dryer.material + " • " + (state.workshop.dryer.remainingSec/60UL) + " min left";
  else b += "No intervention needed";

  lv_label_set_text(automationBody, b.c_str());
}

'''
    if refresh_anchor not in s:
        raise SystemExit('refreshActivity anchor missing')
    s = s.replace(refresh_anchor, refresh + refresh_anchor, 1)
    s = s.replace('refreshInsights(); refreshActivity();', 'refreshInsights(); refreshAutomation(); refreshActivity();')

    # Add Automation to Apps without destabilizing the existing grid logic.
    apps_match = re.search(r'static void createApps\(\) \{.*?\n\}', s, re.S)
    if apps_match:
        apps = apps_match.group(0)
        if 'ScreenId::Automation' not in apps:
            apps = apps.replace('{"Insights", ScreenId::Insights, C_PURPLE}', '{"Insights", ScreenId::Insights, C_PURPLE}, {"Automation", ScreenId::Automation, C_ORANGE}')
            # Make the loop derive the array size instead of relying on a stale hard-coded count.
            apps = re.sub(r'for \(int i = 0; i < \d+; \+\+i\)', 'for (size_t i = 0; i < sizeof(apps)/sizeof(apps[0]); ++i)', apps)
            s = s[:apps_match.start()] + apps + s[apps_match.end():]

    # Add quick access next to operational-awareness surfaces.
    quick_match = re.search(r'static void createQuick\(\) \{.*?\n\}', s, re.S)
    if quick_match:
        q = quick_match.group(0)
        if 'ScreenId::Automation' not in q:
            insertion = 'button(screenQuick, "Automation", 216, 274, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Automation)), C_ORANGE);\n  '
            pos = q.find('button(screenQuick, "Insights"')
            if pos >= 0:
                q = q[:pos] + insertion + q[pos:]
            s = s[:quick_match.start()] + q + s[quick_match.end():]

model.write_text(m)
ino.write_text(s)
print('rc19 automation center applied')
