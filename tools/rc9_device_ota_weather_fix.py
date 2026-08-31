from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
SVC = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
INO = ROOT / "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_replace_once(text: str, pattern: str, repl: str, label: str) -> str:
    text2, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    return text2

# Version -----------------------------------------------------------------
app = APP.read_text()
app = replace_once(app, 'static constexpr char FW_VERSION[] = "1.0.0-rc8";',
                   'static constexpr char FW_VERSION[] = "1.0.0-rc9";', 'firmware version')
APP.write_text(app)

# Services / dashboard / self OTA ----------------------------------------
svc = SVC.read_text()

helper_anchor = '''uint8_t parseTheme(const String &value) {
  int n = value.toInt();
  return static_cast<uint8_t>(constrain(n, 0, 2));
}
'''
helper_code = helper_anchor + r'''

struct FirmwareVersionParts {
  int major = 0;
  int minor = 0;
  int patch = 0;
  int rc = -1;
  bool valid = false;
};

FirmwareVersionParts parseFirmwareVersion(String value) {
  value.trim();
  value.replace("waveshare-v", "");
  if (value.startsWith("v")) value.remove(0, 1);
  FirmwareVersionParts out;
  int dash = value.indexOf('-');
  String core = dash >= 0 ? value.substring(0, dash) : value;
  String suffix = dash >= 0 ? value.substring(dash + 1) : "";
  int p1 = core.indexOf('.');
  int p2 = p1 >= 0 ? core.indexOf('.', p1 + 1) : -1;
  if (p1 < 1 || p2 <= p1 + 1) return out;
  out.major = core.substring(0, p1).toInt();
  out.minor = core.substring(p1 + 1, p2).toInt();
  out.patch = core.substring(p2 + 1).toInt();
  if (suffix.length()) {
    if (!suffix.startsWith("rc")) return out;
    out.rc = suffix.substring(2).toInt();
    if (out.rc <= 0) return out;
  }
  out.valid = true;
  return out;
}

int compareFirmwareVersions(const String &a, const String &b) {
  FirmwareVersionParts av = parseFirmwareVersion(a);
  FirmwareVersionParts bv = parseFirmwareVersion(b);
  if (!av.valid || !bv.valid) return 0;
  if (av.major != bv.major) return av.major > bv.major ? 1 : -1;
  if (av.minor != bv.minor) return av.minor > bv.minor ? 1 : -1;
  if (av.patch != bv.patch) return av.patch > bv.patch ? 1 : -1;
  if (av.rc == bv.rc) return 0;
  if (av.rc < 0) return 1;
  if (bv.rc < 0) return -1;
  return av.rc > bv.rc ? 1 : -1;
}
'''
svc = replace_once(svc, helper_anchor, helper_code, 'version helpers')

# Add visible Weather save controls using a resilient match around the unique
# Weather status line rather than the exact generated String-builder layout.
weather_pattern = r'''s \+= checked\(config_->severeWeatherEnabled\);\s*s \+= F\(\">NWS severe alerts</label><p class='status'>Weather status: \"\);\s*s \+= htmlEscape\(state_->weather\.condition\);\s*s \+= F\(\"</p><hr>\"\);'''
weather_repl = '''s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label><p class='status'>Weather status: "); s += htmlEscape(state_->weather.condition); s += F("</p><div class='row'><button type='submit' formaction='/weather/save'>Save weather</button><button type='submit' formaction='/weather/save' name='resolve' value='1' class='muted'>Save & resolve now</button></div><hr>");'''
svc = regex_replace_once(svc, weather_pattern, weather_repl, 'weather save controls')

route_anchor = '''  server_.on("/settings", HTTP_POST, [this]() { handleSettingsSave(); });
'''
route_code = route_anchor + r'''  server_.on("/weather/save", HTTP_POST, [this]() {
    const String previousLocation = config_->weatherLocation;
    const String location = server_.arg("weatherLocation");
    config_->weatherEnabled = server_.hasArg("weatherEnabled");
    config_->severeWeatherEnabled = server_.hasArg("weatherAlerts");
    copyText(config_->weatherLocation, sizeof(config_->weatherLocation), location);

    const String latArg = server_.arg("weatherLat");
    const String lonArg = server_.arg("weatherLon");
    if (location != previousLocation) {
      config_->weatherLatitude = 0.0f;
      config_->weatherLongitude = 0.0f;
    }
    if (latArg.length() && lonArg.length()) {
      config_->weatherLatitude = latArg.toFloat();
      config_->weatherLongitude = lonArg.toFloat();
    }

    state_->weather.online = false;
    if (!config_->weatherEnabled) {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Off");
    } else if ((fabsf(config_->weatherLatitude) > 0.0001f || fabsf(config_->weatherLongitude) > 0.0001f)) {
      state_->weather.configured = true;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Saved; refreshing weather");
    } else if (strlen(config_->weatherLocation)) {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Resolving location...");
    } else {
      state_->weather.configured = false;
      copyText(state_->weather.condition, sizeof(state_->weather.condition), "Enter ZIP or City, State");
    }

    store_.save(*config_);
    configChanged_ = true;
    server_.sendHeader("Location", "/#integrations", true);
    server_.send(303, "text/plain", "Weather settings saved");
  });
'''
svc = replace_once(svc, route_anchor, route_code, 'weather save route')

old_release_block = r'''  String api = config_->updateChannel == 0
    ? "https://api.github.com/repos/azmusgb/filamentinventory/releases/latest"
    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=8";
  if (!http.begin(secure, api)) {
    strlcpy(sys.updateError, "Could not open GitHub release API", sizeof(sys.updateError));
    sys.updateCheckInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  http.addHeader("Accept", "application/vnd.github+json");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    snprintf(sys.updateError, sizeof(sys.updateError), "GitHub release API HTTP %d", code);
    http.end(); sys.updateCheckInProgress = false; return false;
  }

  JsonDocument releases;
  DeserializationError err = deserializeJson(releases, http.getStream());
  http.end();
  if (err) {
    strlcpy(sys.updateError, "Invalid GitHub release response", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  JsonObject release;
  if (config_->updateChannel == 0) release = releases.as<JsonObject>();
  else if (releases.is<JsonArray>() && releases.as<JsonArray>().size()) release = releases[0].as<JsonObject>();
  if (release.isNull()) {
    strlcpy(sys.updateError, "No release found for selected channel", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
'''
new_release_block = r'''  const bool stableChannel = config_->updateChannel == 0;
  String api = stableChannel
    ? "https://api.github.com/repos/azmusgb/filamentinventory/releases/latest"
    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=20";
  if (!http.begin(secure, api)) {
    strlcpy(sys.updateError, "Could not open GitHub release API", sizeof(sys.updateError));
    sys.updateCheckInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  http.addHeader("Accept", "application/vnd.github+json");
  int code = http.GET();
  if (stableChannel && code == HTTP_CODE_NOT_FOUND) {
    http.end();
    sys.updateAvailable = false;
    sys.updateVersion[0] = '\0';
    strlcpy(sys.updateStatus, "No stable release published", sizeof(sys.updateStatus));
    sys.updateError[0] = '\0';
    sys.updateCheckedMs = millis();
    sys.updateCheckInProgress = false;
    return true;
  }
  if (code != HTTP_CODE_OK) {
    snprintf(sys.updateError, sizeof(sys.updateError), "GitHub release API HTTP %d", code);
    http.end(); sys.updateCheckInProgress = false; return false;
  }

  JsonDocument releases;
  DeserializationError err = deserializeJson(releases, http.getStream());
  http.end();
  if (err) {
    strlcpy(sys.updateError, "Invalid GitHub release response", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  JsonObject release;
  if (stableChannel) {
    release = releases.as<JsonObject>();
  } else if (releases.is<JsonArray>()) {
    String bestVersion;
    for (JsonObject candidate : releases.as<JsonArray>()) {
      if (candidate["draft"] | false) continue;
      String candidateVersion = candidate["tag_name"] | "";
      candidateVersion.replace("waveshare-v", "");
      if (!parseFirmwareVersion(candidateVersion).valid) continue;
      if (!bestVersion.length() || compareFirmwareVersions(candidateVersion, bestVersion) > 0) {
        bestVersion = candidateVersion;
        release = candidate;
      }
    }
  }
  if (release.isNull()) {
    strlcpy(sys.updateError, "No compatible release found for selected channel", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
'''
svc = replace_once(svc, old_release_block, new_release_block, 'release selection')

svc = replace_once(
    svc,
    '  sys.updateAvailable = version != String(FW_VERSION);\n',
    '  sys.updateAvailable = compareFirmwareVersions(version, String(FW_VERSION)) > 0;\n',
    'version comparison')

svc = replace_once(
    svc,
    '  strlcpy(sys.updateStatus, sys.updateAvailable ? "Update available" : "Up to date", sizeof(sys.updateStatus));\n',
    '  strlcpy(sys.updateStatus, sys.updateAvailable ? "Update available" : "Up to date", sizeof(sys.updateStatus));\n  if (!sys.updateAvailable && compareFirmwareVersions(version, String(FW_VERSION)) < 0) strlcpy(sys.updateStatus, "Current firmware is newer", sizeof(sys.updateStatus));\n',
    'updater status')

SVC.write_text(svc)

# Touch UI weather semantics ------------------------------------------------
ino = INO.read_text()
old_today = '''static void refreshToday() {
  if(todayWeather){ char b[180]; if(state.weather.online) snprintf(b,sizeof(b),"%.0f°F  %s\\nFeels %.0f° • H %.0f° / L %.0f°\\nPrecipitation %d%%",state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent); else snprintf(b,sizeof(b),config.weatherEnabled?"Weather unavailable\\nCheck network or coordinates":"Weather not configured\\nUse the web dashboard to add location"); lv_label_set_text(todayWeather,b); }
'''
new_today = '''static void refreshToday() {
  if(todayWeather){
    char b[180];
    if(state.weather.online) {
      snprintf(b,sizeof(b),"%.0f°F  %s\\nFeels %.0f° • H %.0f° / L %.0f°\\nPrecipitation %d%%",state.weather.temperatureC*9/5+32,state.weather.condition,state.weather.apparentC*9/5+32,state.weather.highC*9/5+32,state.weather.lowC*9/5+32,state.weather.precipitationPercent);
    } else if(!config.weatherEnabled) {
      snprintf(b,sizeof(b),"Weather off\\nEnable it in the web dashboard");
    } else if(!state.weather.configured) {
      snprintf(b,sizeof(b),"Weather not configured\\n%s", strlen(state.weather.condition) ? state.weather.condition : "Set ZIP or City, State in dashboard");
    } else {
      snprintf(b,sizeof(b),"Weather temporarily unavailable\\nWi-Fi is %s • retrying automatically", WiFi.status()==WL_CONNECTED?"online":"offline");
    }
    lv_label_set_text(todayWeather,b);
  }
'''
ino = replace_once(ino, old_today, new_today, 'Today weather semantics')
INO.write_text(ino)

for path in (APP, SVC, INO):
    text = path.read_text()
    if '1.0.0-rc8' in text and path == APP:
        raise SystemExit('rc8 version remained in AppModel.h')

print('rc9 migration applied successfully')
