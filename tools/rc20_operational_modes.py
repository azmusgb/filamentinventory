from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
model = root / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
ino = root / 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'
m = model.read_text()
s = ino.read_text()

if '1.0.0-rc19' not in m and '1.0.0-rc20' not in m:
    raise SystemExit('Unexpected firmware version; rc19 or rc20 required')
m = m.replace('1.0.0-rc19', '1.0.0-rc20')

if 'screenModes' not in s:
    s = s.replace('static lv_obj_t *screenSystem = nullptr;', 'static lv_obj_t *screenModes = nullptr;\nstatic lv_obj_t *screenSystem = nullptr;', 1)
    s = s.replace('static lv_obj_t *systemBody = nullptr;', 'static lv_obj_t *modesBody = nullptr;\nstatic lv_obj_t *systemBody = nullptr;', 1)
    s = s.replace('Automation, System, Recovery, Ambient', 'Automation, Modes, System, Recovery, Ambient')
    s = s.replace('case ScreenId::Automation: return screenAutomation;', 'case ScreenId::Automation: return screenAutomation;\n    case ScreenId::Modes: return screenModes;', 1)

    anchor = 'static void createSystem() {'
    block = r'''static void applyOperationalMode(int mode) {
  if(mode == 0) { // Home / adaptive
    config.ambientMode = AmbientDisplayMode::Auto;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 1) { // Print focus
    config.ambientMode = AmbientDisplayMode::Printer;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 2) { // Workshop focus
    config.ambientMode = AmbientDisplayMode::Workshop;
    config.airMode = AirMode::Auto;
    config.audioEnabled = true;
  } else if(mode == 3) { // Quiet
    config.ambientMode = AmbientDisplayMode::Minimal;
    config.audioEnabled = false;
  }
  state.workshop.airMode = config.airMode;
  configStore.save(config);
  audio.setVolume(config.audioEnabled ? config.audioVolume : 0);
  lastUiRefreshMs = 0;
}

static void modeEvent(lv_event_t *e) {
  applyOperationalMode((int)reinterpret_cast<intptr_t>(lv_event_get_user_data(e)));
}

static void createModes() {
  screenModes = lv_obj_create(nullptr); styleScreen(screenModes); addStatusBar(screenModes, "MODES");
  modesBody = wrapLabel(screenModes, "Adaptive operating profiles", &lv_font_montserrat_12, C_MUTED, 14, 54, 292);
  button(screenModes, "Home", 12, 92, 142, 64, modeEvent, reinterpret_cast<void *>(0), C_GREEN);
  button(screenModes, "Print focus", 166, 92, 142, 64, modeEvent, reinterpret_cast<void *>(1), C_BLUE);
  button(screenModes, "Workshop", 12, 170, 142, 64, modeEvent, reinterpret_cast<void *>(2), C_ORANGE);
  button(screenModes, "Quiet", 166, 170, 142, 64, modeEvent, reinterpret_cast<void *>(3), C_PURPLE);
  button(screenModes, "Automation", 12, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Automation)), C_BLUE);
  button(screenModes, "Home screen", 166, 366, 142, 44, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Home)), C_GREEN);
}

'''
    if anchor not in s:
        raise SystemExit('createSystem anchor missing')
    s = s.replace(anchor, block + anchor, 1)
    s = s.replace('createAutomation(); createSystem();', 'createAutomation(); createModes(); createSystem();', 1)

    refresh_anchor = 'static void refreshSystem() {'
    refresh = r'''static void refreshModes() {
  if(!modesBody) return;
  String b = "CURRENT PROFILE\n";
  if(config.ambientMode == AmbientDisplayMode::Printer) b += "Print focus";
  else if(config.ambientMode == AmbientDisplayMode::Workshop) b += "Workshop focus";
  else if(config.ambientMode == AmbientDisplayMode::Minimal && !config.audioEnabled) b += "Quiet";
  else b += "Home / adaptive";
  b += "\n\nAmbient  "; b += ambientModeName(config.ambientMode);
  b += "\nAir      "; b += airModeName(config.airMode);
  b += "\nAudio    "; b += config.audioEnabled ? "On" : "Muted";
  b += "\n\nProfiles change only local display/audio/filter policy. They do not start or stop a print.";
  lv_label_set_text(modesBody, b.c_str());
}

'''
    if refresh_anchor not in s:
        raise SystemExit('refreshSystem anchor missing')
    s = s.replace(refresh_anchor, refresh + refresh_anchor, 1)
    s = s.replace('refreshAutomation(); refreshSystem();', 'refreshAutomation(); refreshModes(); refreshSystem();', 1)

    # Add Modes to Apps if room by replacing System entry with Modes + System and increasing loop count.
    apps_match = re.search(r'struct App \{ const char \*name; ScreenId id; lv_color_t color; \} apps\[\] = \{(.*?)\n  \};', s, re.S)
    if apps_match and '"Modes"' not in apps_match.group(1):
        body = apps_match.group(1)
        body = body.replace('{"System", ScreenId::System, C_GREEN}', '{"Modes", ScreenId::Modes, C_BLUE}, {"System", ScreenId::System, C_GREEN}')
        s = s[:apps_match.start(1)] + body + s[apps_match.end(1):]
        loop = re.search(r'for \(int i = 0; i < (\d+); \+\+i\) button\(screenApps', s)
        if loop:
            n = int(loop.group(1)) + 1
            s = s[:loop.start(1)] + str(n) + s[loop.end(1):]

    # Add Modes shortcut to Quick when possible.
    q = re.search(r'static void createQuick\(\) \{.*?\n\}', s, re.S)
    if q and '"Modes"' not in q.group(0):
        blockq = q.group(0)
        home_idx = blockq.rfind('button(screenQuick, "Home"')
        if home_idx >= 0:
            blockq = blockq[:home_idx] + 'button(screenQuick, "Modes", 216, 328, 92, 46, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Modes)), C_BLUE);\n  ' + blockq[home_idx:]
            s = s[:q.start()] + blockq + s[q.end():]

model.write_text(m)
ino.write_text(s)
print('rc20 operational modes applied')
