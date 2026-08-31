#include "Services.h"
#include <Wire.h>
#include <math.h>
#include <esp_err.h>
#include <esp_heap_caps.h>
#include <mbedtls/sha256.h>

namespace {
constexpr uint32_t WIFI_AP_DELAY_MS = 10000UL;
constexpr uint32_t STABLE_BOOT_MS = 45000UL;
constexpr uint32_t WEATHER_INTERVAL_MS = 10UL * 60UL * 1000UL;
constexpr uint32_t WEATHER_ALERT_INTERVAL_MS = 5UL * 60UL * 1000UL;
constexpr uint32_t FILAMENT_INTERVAL_MS = 3UL * 60UL * 1000UL;
constexpr uint32_t HA_INTERVAL_MS = 30UL * 1000UL;
constexpr uint32_t CALENDAR_INTERVAL_MS = 5UL * 60UL * 1000UL;
constexpr uint32_t AUDIO_SAMPLE_RATE = 44100;
constexpr uint16_t BAMBU_DISCOVERY_PORT = 2021;
constexpr uint16_t BAMBU_DISCOVERY_LEGACY_PORT = 1990;
constexpr uint16_t BAMBU_DISCOVERY_SSDP_PORT = 1900;
constexpr uint32_t BAMBU_DISCOVERY_MS = 35000UL;
constexpr uint32_t BAMBU_DISCOVERY_PROBE_MS = 7000UL;
constexpr uint32_t BAMBU_DISCOVERY_FALLBACK_MS = 11000UL;
constexpr uint16_t BAMBU_CANDIDATE_CONNECT_TIMEOUT_MS = 25;
const IPAddress BAMBU_DISCOVERY_GROUP(239, 255, 255, 250);
constexpr int I2S_MCLK = 12;
constexpr int I2S_BCLK = 13;
constexpr int I2S_LRCK = 15;
constexpr int I2S_DOUT = 16;
constexpr int I2S_DIN = 14;

void copyText(char *dst, size_t size, const String &value) {
  if (!dst || size == 0) return;
  strlcpy(dst, value.c_str(), size);
}

void copyText(char *dst, size_t size, const char *value) {
  if (!dst || size == 0) return;
  strlcpy(dst, value ? value : "", size);
}

String resetReasonText(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "Power on";
    case ESP_RST_EXT: return "External reset";
    case ESP_RST_SW: return "Software restart";
    case ESP_RST_PANIC: return "Panic / crash";
    case ESP_RST_INT_WDT: return "Interrupt watchdog";
    case ESP_RST_TASK_WDT: return "Task watchdog";
    case ESP_RST_WDT: return "Watchdog";
    case ESP_RST_DEEPSLEEP: return "Deep sleep";
    case ESP_RST_BROWNOUT: return "Brownout";
    case ESP_RST_SDIO: return "SDIO";
    default: return "Unknown";
  }
}

String weatherCodeText(int code) {
  if (code == 0) return "Clear";
  if (code == 1) return "Mostly clear";
  if (code == 2) return "Partly cloudy";
  if (code == 3) return "Cloudy";
  if (code == 45 || code == 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}

bool beginHttp(HTTPClient &http, WiFiClientSecure &secure, const String &url) {
  http.setConnectTimeout(3500);
  http.setTimeout(5000);
  if (url.startsWith("https://")) {
    secure.setInsecure();
    return http.begin(secure, url);
  }
  return http.begin(url);
}

uint8_t parseHomeCard(const String &value) {
  int n = value.toInt();
  return static_cast<uint8_t>(constrain(n, 0, 7));
}

uint8_t parseHero(const String &value) {
  int n = value.toInt();
  return static_cast<uint8_t>(constrain(n, 0, 5));
}

uint8_t parseTheme(const String &value) {
  int n = value.toInt();
  return static_cast<uint8_t>(constrain(n, 0, 2));
}


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
}  // namespace

// ---------- ConfigStore ----------

bool ConfigStore::begin() {
  return prefs_.begin("home-config", false);
}

bool ConfigStore::load(AppConfig &config) {
  String json = prefs_.getString("json", "");
  if (json.isEmpty()) {
    config = AppConfig{};
    save(config);
    return true;
  }

  JsonDocument doc;
  if (deserializeJson(doc, json)) {
    config = AppConfig{};
    save(config);
    return false;
  }

  config = AppConfig{};
  config.schemaVersion = doc["schema"] | CONFIG_SCHEMA_VERSION;
  copyText(config.deviceName, sizeof(config.deviceName), doc["deviceName"] | DEFAULT_DEVICE_NAME);
  copyText(config.timezoneId, sizeof(config.timezoneId), doc["timezoneId"] | "America/New_York");
  copyText(config.timezonePosix, sizeof(config.timezonePosix), doc["timezonePosix"] | "EST5EDT,M3.2.0/2,M11.1.0/2");
  config.brightness = constrain((int)(doc["brightness"] | 82), 5, 100);
  config.ambientBrightness = constrain((int)(doc["ambientBrightness"] | 18), 5, 60);
  config.ambientTimeoutSec = constrain((int)(doc["ambientTimeoutSec"] | 120), 30, 3600);
  config.theme = static_cast<ThemeMode>(constrain((int)(doc["theme"] | 0), 0, 2));
  config.heroMode = static_cast<HeroMode>(constrain((int)(doc["heroMode"] | 0), 0, 5));
  for (int i = 0; i < 3; ++i) config.homeCards[i] = static_cast<HomeCard>(constrain((int)(doc["homeCards"][i] | i), 0, 7));

  config.weatherEnabled = doc["weather"]["enabled"] | false;
  config.weatherLatitude = doc["weather"]["lat"] | 0.0f;
  config.weatherLongitude = doc["weather"]["lon"] | 0.0f;
  copyText(config.weatherLocation, sizeof(config.weatherLocation), doc["weather"]["location"] | "");
  config.severeWeatherEnabled = doc["weather"]["alerts"] | true;

  config.bambuEnabled = doc["bambu"]["enabled"] | false;
  copyText(config.bambuHost, sizeof(config.bambuHost), doc["bambu"]["host"] | "");
  copyText(config.bambuSerial, sizeof(config.bambuSerial), doc["bambu"]["serial"] | "");
  copyText(config.bambuAccessCode, sizeof(config.bambuAccessCode), doc["bambu"]["accessCode"] | "");

  config.filamentEnabled = doc["filament"]["enabled"] | false;
  copyText(config.filamentEndpoint, sizeof(config.filamentEndpoint), doc["filament"]["endpoint"] | "https://filamentinventory.netlify.app/api/sync");
  copyText(config.filamentProfile, sizeof(config.filamentProfile), doc["filament"]["profile"] | "Bill");
  copyText(config.filamentSyncKey, sizeof(config.filamentSyncKey), doc["filament"]["syncKey"] | "");

  config.homeAssistantEnabled = doc["ha"]["enabled"] | false;
  copyText(config.homeAssistantUrl, sizeof(config.homeAssistantUrl), doc["ha"]["url"] | "");
  copyText(config.homeAssistantToken, sizeof(config.homeAssistantToken), doc["ha"]["token"] | "");
  for (int i = 0; i < 4; ++i) {
    copyText(config.haEntityIds[i], sizeof(config.haEntityIds[i]), doc["ha"]["entities"][i]["id"] | "");
    copyText(config.haEntityLabels[i], sizeof(config.haEntityLabels[i]), doc["ha"]["entities"][i]["label"] | "");
  }
  copyText(config.haSceneId, sizeof(config.haSceneId), doc["ha"]["sceneId"] | "");
  copyText(config.haSceneLabel, sizeof(config.haSceneLabel), doc["ha"]["sceneLabel"] | "Scene");
  copyText(config.haAutomationId, sizeof(config.haAutomationId), doc["ha"]["automationId"] | "");
  copyText(config.haAutomationLabel, sizeof(config.haAutomationLabel), doc["ha"]["automationLabel"] | "Automation");

  config.calendarEnabled = doc["calendar"]["enabled"] | false;
  copyText(config.calendarIcsUrl, sizeof(config.calendarIcsUrl), doc["calendar"]["icsUrl"] | "");
  config.audioEnabled = doc["audio"]["enabled"] | true;
  config.audioVolume = constrain((int)(doc["audio"]["volume"] | 55), 0, 100);
  config.workshopEnabled = doc["workshop"]["enabled"] | true;
  config.workshopSensorEnabled = doc["workshop"]["sensorEnabled"] | false;
  config.presenceEnabled = doc["workshop"]["presenceEnabled"] | false;
  config.dryerEnabled = doc["workshop"]["dryerEnabled"] | true;
  config.airMode = static_cast<AirMode>(constrain((int)(doc["workshop"]["airMode"] | 2), 0, 3));
  config.ambientMode = static_cast<AmbientDisplayMode>(constrain((int)(doc["workshop"]["ambientMode"] | 0), 0, 4));
  config.postPrintFilterMinutes = constrain((int)(doc["workshop"]["postFilterMinutes"] | 15), 0, 120);
  config.pm25Alert = doc["workshop"]["pm25Alert"] | 20.0f;
  config.vocAlert = doc["workshop"]["vocAlert"] | 250.0f;
  config.humidityAlert = doc["workshop"]["humidityAlert"] | 45.0f;
  config.updateMode = constrain((int)(doc["updates"]["mode"] | 1), 0, 2);
  config.updateChannel = constrain((int)(doc["updates"]["channel"] | 1), 0, 1);
  config.updateCheckMinutes = constrain((int)(doc["updates"]["checkMinutes"] | 360), 15, 1440);

  if (config.schemaVersion < CONFIG_SCHEMA_VERSION) {
    config.schemaVersion = CONFIG_SCHEMA_VERSION;
    save(config);
  }
  return true;
}

bool ConfigStore::save(const AppConfig &config) {
  JsonDocument doc;
  doc["schema"] = CONFIG_SCHEMA_VERSION;
  doc["deviceName"] = config.deviceName;
  doc["timezoneId"] = config.timezoneId;
  doc["timezonePosix"] = config.timezonePosix;
  doc["brightness"] = config.brightness;
  doc["ambientBrightness"] = config.ambientBrightness;
  doc["ambientTimeoutSec"] = config.ambientTimeoutSec;
  doc["theme"] = static_cast<uint8_t>(config.theme);
  doc["heroMode"] = static_cast<uint8_t>(config.heroMode);
  for (int i = 0; i < 3; ++i) doc["homeCards"][i] = static_cast<uint8_t>(config.homeCards[i]);

  doc["weather"]["enabled"] = config.weatherEnabled;
  doc["weather"]["lat"] = config.weatherLatitude;
  doc["weather"]["lon"] = config.weatherLongitude;
  doc["weather"]["location"] = config.weatherLocation;
  doc["weather"]["alerts"] = config.severeWeatherEnabled;

  doc["bambu"]["enabled"] = config.bambuEnabled;
  doc["bambu"]["host"] = config.bambuHost;
  doc["bambu"]["serial"] = config.bambuSerial;
  doc["bambu"]["accessCode"] = config.bambuAccessCode;

  doc["filament"]["enabled"] = config.filamentEnabled;
  doc["filament"]["endpoint"] = config.filamentEndpoint;
  doc["filament"]["profile"] = config.filamentProfile;
  doc["filament"]["syncKey"] = config.filamentSyncKey;

  doc["ha"]["enabled"] = config.homeAssistantEnabled;
  doc["ha"]["url"] = config.homeAssistantUrl;
  doc["ha"]["token"] = config.homeAssistantToken;
  for (int i = 0; i < 4; ++i) {
    doc["ha"]["entities"][i]["id"] = config.haEntityIds[i];
    doc["ha"]["entities"][i]["label"] = config.haEntityLabels[i];
  }
  doc["ha"]["sceneId"] = config.haSceneId;
  doc["ha"]["sceneLabel"] = config.haSceneLabel;
  doc["ha"]["automationId"] = config.haAutomationId;
  doc["ha"]["automationLabel"] = config.haAutomationLabel;

  doc["calendar"]["enabled"] = config.calendarEnabled;
  doc["calendar"]["icsUrl"] = config.calendarIcsUrl;
  doc["audio"]["enabled"] = config.audioEnabled;
  doc["audio"]["volume"] = config.audioVolume;
  doc["workshop"]["enabled"] = config.workshopEnabled;
  doc["workshop"]["sensorEnabled"] = config.workshopSensorEnabled;
  doc["workshop"]["presenceEnabled"] = config.presenceEnabled;
  doc["workshop"]["dryerEnabled"] = config.dryerEnabled;
  doc["workshop"]["airMode"] = static_cast<uint8_t>(config.airMode);
  doc["workshop"]["ambientMode"] = static_cast<uint8_t>(config.ambientMode);
  doc["workshop"]["postFilterMinutes"] = config.postPrintFilterMinutes;
  doc["workshop"]["pm25Alert"] = config.pm25Alert;
  doc["workshop"]["vocAlert"] = config.vocAlert;
  doc["workshop"]["humidityAlert"] = config.humidityAlert;
  doc["updates"]["mode"] = config.updateMode;
  doc["updates"]["channel"] = config.updateChannel;
  doc["updates"]["checkMinutes"] = config.updateCheckMinutes;

  String out;
  serializeJson(doc, out);
  return prefs_.putString("json", out) == out.length();
}

void ConfigStore::factoryReset() {
  prefs_.clear();
}

// ---------- BootGuard ----------

bool BootGuard::begin(AppState &state) {
  prefs_.begin("boot-guard", false);

  const esp_reset_reason_t resetReason = esp_reset_reason();
  copyText(state.system.resetReason, sizeof(state.system.resetReason), resetReasonText(resetReason));

  state.system.bootCount = prefs_.getUInt("count", 0) + 1;
  prefs_.putUInt("count", state.system.bootCount);

  // A firmware upgrade is a new validation epoch. Never inherit a stale
  // failure counter from an older image into freshly installed firmware.
  const String storedFirmware = prefs_.getString("fw", "");
  const bool sameFirmware = storedFirmware == FW_VERSION;
  const bool previousBootPending = prefs_.getBool("pending", false);
  uint32_t failedBoots = prefs_.getUInt("attempts", 0);

  if (!sameFirmware) {
    failedBoots = 0;
    prefs_.putString("fw", FW_VERSION);
  } else if (!previousBootPending) {
    failedBoots = 0;
  } else {
    // Only crash-class resets count toward boot-loop recovery. Normal OTA/
    // software restarts, power cycles and external reset presses should not
    // manufacture a boot loop merely because they occur before 45 seconds.
    const bool crashReset =
        resetReason == ESP_RST_PANIC ||
        resetReason == ESP_RST_INT_WDT ||
        resetReason == ESP_RST_TASK_WDT ||
        resetReason == ESP_RST_WDT ||
        resetReason == ESP_RST_BROWNOUT;
    if (crashReset) ++failedBoots;
  }

  state.system.bootAttempts = failedBoots;
  prefs_.putUInt("attempts", failedBoots);
  prefs_.putBool("pending", true);

  pinMode(0, INPUT_PULLUP);
  delay(4);
  recoveryRequested_ = failedBoots >= 3 || digitalRead(0) == LOW;
  state.system.recoveryMode = recoveryRequested_;
  bootMs_ = millis();

  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = 8000;
  cfg.idle_core_mask = (1U << portNUM_PROCESSORS) - 1U;
  cfg.trigger_panic = true;
  esp_err_t rc = esp_task_wdt_reconfigure(&cfg);
  if (rc != ESP_OK) esp_task_wdt_init(&cfg);
  esp_task_wdt_add(nullptr);
  return recoveryRequested_;
}

void BootGuard::loop(AppState &state) {
  esp_task_wdt_reset();
  state.system.watchdogFeeds++;
  state.system.uptimeSec = millis() / 1000UL;
  state.system.freeHeap = ESP.getFreeHeap();
  state.system.freePsram = ESP.getFreePsram();
  if (!stableMarked_ && !state.system.recoveryMode && millis() - bootMs_ >= STABLE_BOOT_MS) markStable(state);
}

void BootGuard::markStable(AppState &state) {
  // Safe mode intentionally disables integrations. It must never validate an
  // OTA image simply because the reduced recovery environment stayed alive.
  if (state.system.recoveryMode) return;
  prefs_.putUInt("attempts", 0);
  prefs_.putBool("pending", false);
  prefs_.putString("fw", FW_VERSION);
  stableMarked_ = true;
  state.system.stableBoot = true;
  esp_ota_mark_app_valid_cancel_rollback();
}

void BootGuard::clearRecovery(AppState &state) {
  // Give this exact firmware one clean normal-boot attempt without touching
  // user configuration, Wi-Fi credentials, or other NVS namespaces. If the
  // image truly crash-loops, crash-class resets will accumulate again and
  // recovery mode will return automatically.
  prefs_.putUInt("attempts", 0);
  prefs_.putBool("pending", false);
  prefs_.putString("fw", FW_VERSION);
  recoveryRequested_ = false;
  stableMarked_ = false;
  state.system.bootAttempts = 0;
  state.system.recoveryMode = false;
}

// ---------- Connectivity ----------

void ConnectivityService::begin(AppConfig &, AppState &state) {
  WiFi.persistent(true);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("waveshare-home");
  WiFi.begin();
  connectStartedMs_ = millis();
  lastStatus_ = WiFi.status();
  state.system.setupApActive = false;
}

void ConnectivityService::loop(AppConfig &, AppState &state) {
  const wl_status_t status = WiFi.status();
  if (status == WL_CONNECTED) {
    copyText(state.system.ip, sizeof(state.system.ip), WiFi.localIP().toString());
    copyText(state.system.ssid, sizeof(state.system.ssid), WiFi.SSID());
    state.system.rssi = WiFi.RSSI();
    if (setupApActive_) stopSetupAp(state);
  } else {
    copyText(state.system.ip, sizeof(state.system.ip), setupApActive_ ? WiFi.softAPIP().toString() : "Offline");
    state.system.ssid[0] = '\0';
    state.system.rssi = 0;
    if (!setupApActive_ && millis() - connectStartedMs_ >= WIFI_AP_DELAY_MS) startSetupAp(state);
  }
  if (setupApActive_) dns_.processNextRequest();
  lastStatus_ = status;
}

void ConnectivityService::reconnect() {
  connectStartedMs_ = millis();
  WiFi.reconnect();
}

void ConnectivityService::forget() {
  WiFi.disconnect(true, true);
  connectStartedMs_ = millis() - WIFI_AP_DELAY_MS;
}

void ConnectivityService::startSetupAp(AppState &state) {
  if (setupApActive_) return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(SETUP_AP_NAME);
  dns_.start(53, "*", WiFi.softAPIP());
  setupApActive_ = true;
  state.system.setupApActive = true;
  copyText(state.system.ip, sizeof(state.system.ip), WiFi.softAPIP().toString());
}

void ConnectivityService::stopSetupAp(AppState &state) {
  if (!setupApActive_) return;
  dns_.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  setupApActive_ = false;
  state.system.setupApActive = false;
}

// ---------- Audio ----------

bool AudioService::begin(const AppConfig &config, AppState &state) {
  volume_ = config.audioVolume;
  if (!config.audioEnabled) {
    state.system.audioReady = false;
    return false;
  }

  handle_ = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
  if (!handle_) {
    state.system.audioReady = false;
    return false;
  }
  const es8311_clock_config_t clockCfg = {
    .mclk_inverted = false,
    .sclk_inverted = false,
    .mclk_from_mclk_pin = true,
    .mclk_frequency = AUDIO_SAMPLE_RATE * 256,
    .sample_frequency = AUDIO_SAMPLE_RATE
  };
  if (es8311_init(handle_, &clockCfg, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) {
    state.system.audioReady = false;
    return false;
  }
  es8311_voice_volume_set(handle_, volume_, nullptr);
  es8311_microphone_config(handle_, false);

  i2s_.setPins(I2S_BCLK, I2S_LRCK, I2S_DOUT, I2S_DIN, I2S_MCLK);
  ready_ = i2s_.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT,
                      I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  state.system.audioReady = ready_;
  return ready_;
}

void AudioService::setVolume(uint8_t volume) {
  volume_ = constrain(volume, 0, 100);
  if (handle_) es8311_voice_volume_set(handle_, volume_, nullptr);
}

void AudioService::chirp(uint16_t frequency, uint16_t durationMs) {
  if (!ready_ || volume_ == 0) return;
  constexpr int FRAMES = 128;
  int16_t samples[FRAMES * 2];
  const uint32_t totalFrames = (AUDIO_SAMPLE_RATE * durationMs) / 1000UL;
  uint32_t produced = 0;
  while (produced < totalFrames) {
    const int frames = min<uint32_t>(FRAMES, totalFrames - produced);
    for (int i = 0; i < frames; ++i) {
      const float phase = 2.0f * PI * frequency * (produced + i) / AUDIO_SAMPLE_RATE;
      int16_t sample = static_cast<int16_t>(sinf(phase) * 7000.0f);
      samples[i * 2] = sample;
      samples[i * 2 + 1] = sample;
    }
    i2s_.write(reinterpret_cast<uint8_t *>(samples), frames * 2 * sizeof(int16_t));
    produced += frames;
  }
}

void AudioService::alarm() {
  chirp(880, 120);
  delay(50);
  chirp(1175, 140);
}

// ---------- Weather ----------

void WeatherPlugin::begin(AppConfig &config, AppState &state) {
  state.weather.configured = config.weatherEnabled &&
    (fabsf(config.weatherLatitude) > 0.0001f || fabsf(config.weatherLongitude) > 0.0001f);
  state.weather.online = false;
  lastFetchMs_ = 0;
  lastAlertFetchMs_ = 0;
}

void WeatherPlugin::loop(AppConfig &config, AppState &state) {
  if (!enabled(config) || !state.weather.configured || WiFi.status() != WL_CONNECTED) return;
  if (lastFetchMs_ == 0 || millis() - lastFetchMs_ >= WEATHER_INTERVAL_MS) fetchWeather(config, state);
  if (config.severeWeatherEnabled && (lastAlertFetchMs_ == 0 || millis() - lastAlertFetchMs_ >= WEATHER_ALERT_INTERVAL_MS)) fetchAlerts(config, state);
}

void WeatherPlugin::fetchWeather(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  String url = "https://api.open-meteo.com/v1/forecast?latitude=" + String(config.weatherLatitude, 5) +
    "&longitude=" + String(config.weatherLongitude, 5) +
    "&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto";
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, url)) return;
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getStream())) {
      state.weather.temperatureC = doc["current"]["temperature_2m"] | 0.0f;
      state.weather.apparentC = doc["current"]["apparent_temperature"] | 0.0f;
      state.weather.weatherCode = doc["current"]["weather_code"] | -1;
      state.weather.highC = doc["daily"]["temperature_2m_max"][0] | 0.0f;
      state.weather.lowC = doc["daily"]["temperature_2m_min"][0] | 0.0f;
      state.weather.precipitationPercent = doc["daily"]["precipitation_probability_max"][0] | 0;
      copyText(state.weather.condition, sizeof(state.weather.condition), weatherCodeText(state.weather.weatherCode));
      state.weather.online = true;
      state.weather.updatedMs = millis();
    }
  } else {
    state.weather.online = false;
  }
  http.end();
}

void WeatherPlugin::fetchAlerts(AppConfig &config, AppState &state) {
  lastAlertFetchMs_ = millis();
  state.weather.severeAlert = false;
  state.weather.alertHeadline[0] = '\0';
  String url = "https://api.weather.gov/alerts/active?point=" + String(config.weatherLatitude, 5) + "," + String(config.weatherLongitude, 5);
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, url)) return;
  http.addHeader("User-Agent", "WaveshareHome/1.0 (ESP32 Home Hub)");
  http.addHeader("Accept", "application/geo+json");
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getStream())) {
      JsonArray features = doc["features"].as<JsonArray>();
      if (!features.isNull() && features.size() > 0) {
        JsonObject props = features[0]["properties"].as<JsonObject>();
        String severity = props["severity"] | "Unknown";
        String event = props["event"] | "Weather alert";
        String headline = props["headline"] | event;
        state.weather.severeAlert = true;
        copyText(state.weather.alertSeverity, sizeof(state.weather.alertSeverity), severity);
        copyText(state.weather.alertHeadline, sizeof(state.weather.alertHeadline), headline);
      }
    }
  }
  http.end();
}

// ---------- Bambu ----------

BambuPlugin *BambuPlugin::instance_ = nullptr;

BambuPlugin::BambuPlugin() : mqtt_(tls_) {
  instance_ = this;
  tls_.setInsecure();
  mqtt_.setCallback(callbackStatic);
  mqtt_.setBufferSize(16384);
  mqtt_.setKeepAlive(30);
}


void BambuPlugin::sendDiscoveryProbe() {
  if (!discoveryRunning_ || WiFi.status() != WL_CONNECTED) return;

  // Bambu printers primarily announce themselves with NOTIFY. Some firmware
  // generations/helpers answer M-SEARCH, so retain a standards-correct probe as
  // a compatibility path. HOST stays :1900 regardless of destination port.
  WiFiUDP *tx = discoverySsdpReady_ ? &discoveryUdpSsdp_
                    : (discoveryPrimaryReady_ ? &discoveryUdp_ : &discoveryUdpLegacy_);
  if (!tx) return;

  const char *targets[] = {"urn:bambulab-com:device:3dprinter:1", "ssdp:all"};
  const uint16_t ports[] = {BAMBU_DISCOVERY_SSDP_PORT, BAMBU_DISCOVERY_LEGACY_PORT, BAMBU_DISCOVERY_PORT};
  for (const char *target : targets) {
    String probe;
    probe.reserve(176);
    probe += "M-SEARCH * HTTP/1.1\r\n";
    probe += "HOST: 239.255.255.250:1900\r\n";
    probe += "MAN: \"ssdp:discover\"\r\n";
    probe += "MX: 2\r\nST: ";
    probe += target;
    probe += "\r\n\r\n";
    for (uint16_t port : ports) {
      if (tx->beginPacket(BAMBU_DISCOVERY_GROUP, port)) {
        tx->write(reinterpret_cast<const uint8_t *>(probe.c_str()), probe.length());
        if (tx->endPacket()) discoveryProbeSends_++;
      }
      delay(1);
    }
  }
  lastDiscoveryProbeMs_ = millis();
}

bool BambuPlugin::startDiscovery() {
  if (WiFi.status() != WL_CONNECTED) {
    copyText(discoveryStatus_, sizeof(discoveryStatus_), "Wi-Fi is offline");
    return false;
  }

  discoveryUdp_.stop();
  discoveryUdpLegacy_.stop();
  discoveryUdpSsdp_.stop();
  discoveryPrimaryReady_ = false;
  discoveryLegacyReady_ = false;
  discoverySsdpReady_ = false;
  discoveryListenerMask_ = 0;
  discoveredCount_ = 0;
  discoveryPackets_ = 0;
  discoveryMatchedPackets_ = 0;
  discoveryPackets1900_ = 0;
  discoveryPackets1990_ = 0;
  discoveryPackets2021_ = 0;
  discoveryNotifyPackets_ = 0;
  discoveryResponsePackets_ = 0;
  discoveryProbeSends_ = 0;
  discoveryCandidateChecks_ = 0;
  discoveryCandidateHits_ = 0;
  discoveryCandidateHost_ = 1;
  discoveryCandidateScanStarted_ = false;
  discoveryLastRemote_[0] = 0;
  discoveryLastStartLine_[0] = 0;
  lastDiscoveryProbeMs_ = 0;
  for (auto &item : discovered_) item = BambuDiscoveredPrinter{};

  // ESP32 modem sleep can make multicast reception unreliable on some APs.
  // Temporarily disable it only for the discovery window, then restore it.
  discoverySleepWasEnabled_ = WiFi.getSleep();
  discoverySleepCaptured_ = true;
  WiFi.setSleep(false);
  delay(20);

  auto bindListener = [&](WiFiUDP &udp, uint16_t port) -> bool {
    bool ok = udp.beginMulticast(BAMBU_DISCOVERY_GROUP, port);
    if (!ok) {
      udp.stop();
      ok = udp.begin(port);
    }
    return ok;
  };

  discoveryPrimaryReady_ = bindListener(discoveryUdp_, BAMBU_DISCOVERY_PORT);
  discoveryLegacyReady_ = bindListener(discoveryUdpLegacy_, BAMBU_DISCOVERY_LEGACY_PORT);
  discoverySsdpReady_ = bindListener(discoveryUdpSsdp_, BAMBU_DISCOVERY_SSDP_PORT);
  if (discoverySsdpReady_) discoveryListenerMask_ |= 0x01;
  if (discoveryLegacyReady_) discoveryListenerMask_ |= 0x02;
  if (discoveryPrimaryReady_) discoveryListenerMask_ |= 0x04;

  if (!discoveryListenerMask_) {
    restoreDiscoverySleep();
    copyText(discoveryStatus_, sizeof(discoveryStatus_), "Could not bind UDP 1900, 1990 or 2021");
    return false;
  }

  discoveryRunning_ = true;
  discoveryStartedMs_ = millis();
  char status[160];
  snprintf(status, sizeof(status), "Listening for Bambu NOTIFY on %s%s%s; passive discovery first",
           discoverySsdpReady_ ? "1900" : "",
           discoveryLegacyReady_ ? (discoverySsdpReady_ ? "+1990" : "1990") : "",
           discoveryPrimaryReady_ ? (discoverySsdpReady_ || discoveryLegacyReady_ ? "+2021" : "2021") : "");
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
  sendDiscoveryProbe();
  return true;
}

int BambuPlugin::findDiscovered(const char *serial, const char *host) const {
  for (uint8_t i = 0; i < discoveredCount_; ++i) {
    if (serial && *serial && discovered_[i].serial[0] && !strcasecmp(discovered_[i].serial, serial)) return i;
    if (host && *host && !strcmp(discovered_[i].host, host)) return i;
  }
  return -1;
}

void BambuPlugin::parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp, uint16_t localPort) {
  discoveryPackets_++;
  if (localPort == BAMBU_DISCOVERY_SSDP_PORT) discoveryPackets1900_++;
  else if (localPort == BAMBU_DISCOVERY_LEGACY_PORT) discoveryPackets1990_++;
  else if (localPort == BAMBU_DISCOVERY_PORT) discoveryPackets2021_++;

  copyText(discoveryLastRemote_, sizeof(discoveryLastRemote_), remoteIp.toString());
  int firstEnd = packet.indexOf('\n');
  String firstLine = firstEnd >= 0 ? packet.substring(0, firstEnd) : packet;
  firstLine.trim();
  copyText(discoveryLastStartLine_, sizeof(discoveryLastStartLine_), firstLine);

  String firstUpper = firstLine;
  firstUpper.toUpperCase();
  if (firstUpper.startsWith("NOTIFY ")) discoveryNotifyPackets_++;
  if (firstUpper.startsWith("HTTP/1.")) discoveryResponsePackets_++;

  auto value = [&](const char *key) -> String {
    String lowerPacket = packet;
    lowerPacket.toLowerCase();
    String needle = String(key) + ":";
    needle.toLowerCase();
    int start = lowerPacket.indexOf(needle);
    if (start < 0) return String();
    start += needle.length();
    while (start < packet.length() && (packet[start] == ' ' || packet[start] == '\t')) start++;
    int end = packet.indexOf('\n', start);
    if (end < 0) end = packet.length();
    String out = packet.substring(start, end);
    out.trim();
    if (out.endsWith("\r")) out.remove(out.length() - 1);
    return out;
  };

  String packetLower = packet;
  packetLower.toLowerCase();
  String nt = value("NT");
  String st = value("ST");
  String service = nt.length() ? nt : st;
  String serviceLower = service;
  serviceLower.toLowerCase();
  String modelCode = value("DevModel.bambu.com");
  String name = value("DevName.bambu.com");
  String serial = value("DevSerial.bambu.com");
  if (!serial.length()) serial = value("USN");

  const bool looksBambu = serviceLower.indexOf("urn:bambulab-com:device:3dprinter:1") >= 0 ||
                          packetLower.indexOf("devmodel.bambu.com") >= 0 ||
                          packetLower.indexOf("devname.bambu.com") >= 0 ||
                          packetLower.indexOf("devconnect.bambu.com") >= 0;
  if (!looksBambu) return;
  discoveryMatchedPackets_++;

  if (serial.startsWith("uuid:")) serial.remove(0, 5);
  int suffix = serial.indexOf("::");
  if (suffix > 0) serial = serial.substring(0, suffix);
  serial.trim();

  // Sender IP is authoritative for LAN discovery. Location is kept as a
  // secondary fallback because real Bambu NOTIFY packets may carry a bare IP.
  String host = remoteIp.toString();
  if (remoteIp == IPAddress(0, 0, 0, 0)) host = value("Location");
  host.replace("http://", "");
  host.replace("https://", "");
  int slash = host.indexOf('/');
  if (slash >= 0) host = host.substring(0, slash);
  int colon = host.indexOf(':');
  if (colon >= 0) host = host.substring(0, colon);
  host.trim();
  if (!host.length()) host = value("Location");

  int index = findDiscovered(serial.c_str(), host.c_str());
  if (index < 0) {
    if (discoveredCount_ >= 8) return;
    index = discoveredCount_++;
  }

  auto &d = discovered_[index];
  d.valid = true;
  d.candidateOnly = false;
  copyText(d.host, sizeof(d.host), host);
  copyText(d.serial, sizeof(d.serial), serial);
  copyText(d.name, sizeof(d.name), name.length() ? name : String("Bambu Lab printer"));

  String modelName = modelCode;
  if (modelCode == "C12") modelName = "P1S";
  else if (modelCode == "C11") modelName = "P1P";
  else if (modelCode == "N1") modelName = "A1 mini";
  else if (modelCode == "N2S") modelName = "A1";
  else if (modelCode == "BL-P001" || modelCode == "3DPrinter-X1-Carbon") modelName = "X1 Carbon";
  else if (modelCode == "BL-P002" || modelCode == "3DPrinter-X1") modelName = "X1";
  else if (modelCode == "C13") modelName = "X1E";
  else if (modelCode == "O1D") modelName = "H2D";
  copyText(d.model, sizeof(d.model), modelName.length() ? modelName : String("Bambu printer"));
  copyText(d.version, sizeof(d.version), value("DevVersion.bambu.com"));
  d.signal = value("DevSignal.bambu.com").toInt();
  d.lastSeenMs = millis();

  char status[160];
  snprintf(status, sizeof(status), "Found %u Bambu printer%s via passive LAN announcement",
           discoveredCount_, discoveredCount_ == 1 ? "" : "s");
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
}

void BambuPlugin::scanFallbackCandidate() {
  if (!discoveryRunning_ || !discoveryCandidateScanStarted_ || WiFi.status() != WL_CONNECTED) return;
  if (discoveryCandidateHost_ == 0 || discoveryCandidateHost_ >= 255) return;

  const IPAddress local = WiFi.localIP();
  uint8_t hostByte = discoveryCandidateHost_++;
  if (hostByte == 0 || hostByte == 255 || hostByte == local[3]) return;

  IPAddress candidateIp(local[0], local[1], local[2], hostByte);
  discoveryCandidateChecks_++;
  WiFiClient candidate;
  bool open = candidate.connect(candidateIp, 8883, BAMBU_CANDIDATE_CONNECT_TIMEOUT_MS);
  if (!open) {
    candidate.stop();
    return;
  }
  candidate.stop();
  discoveryCandidateHits_++;

  String host = candidateIp.toString();
  if (findDiscovered(nullptr, host.c_str()) >= 0 || discoveredCount_ >= 8) return;
  auto &d = discovered_[discoveredCount_++];
  d = BambuDiscoveredPrinter{};
  d.valid = true;
  d.candidateOnly = true;
  copyText(d.host, sizeof(d.host), host);
  copyText(d.name, sizeof(d.name), "LAN MQTT candidate");
  copyText(d.model, sizeof(d.model), "TCP 8883 open");
  d.lastSeenMs = millis();

  char status[160];
  snprintf(status, sizeof(status), "SSDP quiet; found %u TCP-8883 LAN candidate%s while scanning local /24",
           discoveryCandidateHits_, discoveryCandidateHits_ == 1 ? "" : "s");
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
}

void BambuPlugin::restoreDiscoverySleep() {
  if (!discoverySleepCaptured_) return;
  WiFi.setSleep(discoverySleepWasEnabled_);
  discoverySleepCaptured_ = false;
}

void BambuPlugin::finishDiscovery() {
  discoveryRunning_ = false;
  discoveryUdp_.stop();
  discoveryUdpLegacy_.stop();
  discoveryUdpSsdp_.stop();
  discoveryPrimaryReady_ = false;
  discoveryLegacyReady_ = false;
  discoverySsdpReady_ = false;
  restoreDiscoverySleep();

  char status[160];
  if (discoveryMatchedPackets_ && discoveredCount_) {
    snprintf(status, sizeof(status), "Complete: %u printer%s; %lu Bambu / %lu UDP packets",
             discoveredCount_, discoveredCount_ == 1 ? "" : "s",
             (unsigned long)discoveryMatchedPackets_, (unsigned long)discoveryPackets_);
  } else if (discoveryMatchedPackets_) {
    snprintf(status, sizeof(status), "Bambu traffic arrived (%lu packets) but metadata was incomplete",
             (unsigned long)discoveryMatchedPackets_);
  } else if (discoveryCandidateHits_) {
    snprintf(status, sizeof(status), "No Bambu SSDP received; %u TCP-8883 candidate%s found. Select a candidate and enter serial + LAN code",
             discoveryCandidateHits_, discoveryCandidateHits_ == 1 ? "" : "s");
  } else if (discoveryPackets_) {
    snprintf(status, sizeof(status), "%lu UDP packet%s received, none were Bambu; verify printer LAN mode and same subnet",
             (unsigned long)discoveryPackets_, discoveryPackets_ == 1 ? "" : "s");
  } else {
    snprintf(status, sizeof(status), "No Bambu broadcast/multicast and no TCP-8883 candidate; check same LAN, guest/AP isolation or VLANs");
  }
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
}

void BambuPlugin::pollDiscovery() {
  if (!discoveryRunning_) return;

  auto drain = [&](WiFiUDP &udp, bool ready, uint16_t localPort) {
    if (!ready) return;
    int size = udp.parsePacket();
    while (size > 0) {
      const IPAddress remote = udp.remoteIP();
      String packet;
      packet.reserve(static_cast<size_t>(size) + 1U);
      while (size-- > 0) {
        const int c = udp.read();
        if (c >= 0) packet += static_cast<char>(c);
      }
      if (packet.length()) parseDiscoveryPacket(packet, remote, localPort);
      size = udp.parsePacket();
    }
  };

  drain(discoveryUdpSsdp_, discoverySsdpReady_, BAMBU_DISCOVERY_SSDP_PORT);
  drain(discoveryUdpLegacy_, discoveryLegacyReady_, BAMBU_DISCOVERY_LEGACY_PORT);
  drain(discoveryUdp_, discoveryPrimaryReady_, BAMBU_DISCOVERY_PORT);

  const uint32_t now = millis();
  if (now - lastDiscoveryProbeMs_ >= BAMBU_DISCOVERY_PROBE_MS) sendDiscoveryProbe();

  if (!discoveryMatchedPackets_ && !discoveryCandidateScanStarted_ &&
      now - discoveryStartedMs_ >= BAMBU_DISCOVERY_FALLBACK_MS) {
    discoveryCandidateScanStarted_ = true;
    copyText(discoveryStatus_, sizeof(discoveryStatus_),
             "No Bambu NOTIFY yet; keeping passive listeners open and probing local /24 for MQTT 8883 candidates");
  }

  // One host per main-loop iteration keeps the display, web server and watchdog
  // responsive while still completing a /24 sweep within the scan window.
  if (!discoveryMatchedPackets_) scanFallbackCandidate();

  if (now - discoveryStartedMs_ >= BAMBU_DISCOVERY_MS) finishDiscovery();
}

bool BambuPlugin::useDiscovered(AppConfig &config, AppState &state, uint8_t index) {
  const BambuDiscoveredPrinter *d = discovered(index);
  if (!d || !d->valid) return false;
  copyText(config.bambuHost, sizeof(config.bambuHost), d->host);
  if (d->serial[0]) copyText(config.bambuSerial, sizeof(config.bambuSerial), d->serial);
  // A TCP-8883 hit is a candidate, not proof of Bambu identity. Require the
  // user to supply/retain serial + LAN access code before enabling MQTT.
  config.bambuEnabled = !d->candidateOnly && d->serial[0];
  copyText(state.printer.displayName, sizeof(state.printer.displayName), d->name);
  copyText(state.printer.model, sizeof(state.printer.model), d->model);
  copyText(state.printer.firmware, sizeof(state.printer.firmware), d->version);
  copyText(state.printer.host, sizeof(state.printer.host), d->host);
  copyText(state.printer.serial, sizeof(state.printer.serial), d->serial);
  begin(config, state);
  return true;
}

void BambuPlugin::begin(AppConfig &config, AppState &state) {
  config_ = &config;
  state_ = &state;
  state.printer.configured = config.bambuEnabled && strlen(config.bambuHost) && strlen(config.bambuSerial) && strlen(config.bambuAccessCode);
  if (!state.printer.configured) {
    state.printer.online = false;
    copyText(state.printer.status, sizeof(state.printer.status), "Not configured");
  }
  if (mqtt_.connected()) mqtt_.disconnect();
  mqtt_.setServer(config.bambuHost, 8883);
  reconnectBackoffMs_ = 5000;
  lastConnectAttemptMs_ = 0;
}

void BambuPlugin::onConfigChanged(AppConfig &config, AppState &state) {
  begin(config, state);
}

void BambuPlugin::serviceDiscovery() {
  if (discoveryRunning_ && WiFi.status() == WL_CONNECTED) pollDiscovery();
}

void BambuPlugin::loop(AppConfig &config, AppState &state) {
  if (!config.bambuEnabled || !state.printer.configured || WiFi.status() != WL_CONNECTED) return;
  if (!mqtt_.connected()) {
    state.printer.online = false;
    if (lastConnectAttemptMs_ == 0 || millis() - lastConnectAttemptMs_ >= reconnectBackoffMs_) {
      lastConnectAttemptMs_ = millis();
      if (connectMqtt()) reconnectBackoffMs_ = 5000;
      else reconnectBackoffMs_ = min<uint32_t>(60000, reconnectBackoffMs_ * 2);
    }
    return;
  }
  mqtt_.loop();
}

void BambuPlugin::callbackStatic(char *topic, byte *payload, unsigned int length) {
  if (instance_) instance_->callback(topic, payload, length);
}

void BambuPlugin::callback(char *, byte *payload, unsigned int length) {
  if (!state_) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;
  JsonObject print = doc["print"].as<JsonObject>();
  if (print.isNull()) return;

  PrinterState &p = state_->printer;
  p.online = true;
  String status = print["gcode_state"] | p.status;
  copyText(p.status, sizeof(p.status), status);
  String upper = status;
  upper.toUpperCase();
  p.printing = upper == "RUNNING" || upper == "PRINTING" || upper == "PREPARE";
  p.progress = constrain((int)(print["mc_percent"] | p.progress), 0, 100);
  p.remainingMinutes = print["mc_remaining_time"] | p.remainingMinutes;
  p.nozzleC = print["nozzle_temper"] | p.nozzleC;
  p.nozzleTargetC = print["nozzle_target_temper"] | p.nozzleTargetC;
  p.bedC = print["bed_temper"] | p.bedC;
  p.bedTargetC = print["bed_target_temper"] | p.bedTargetC;
  p.chamberC = print["chamber_temper"] | p.chamberC;
  p.speedLevel = print["spd_lvl"] | p.speedLevel;
  p.speedPercent = print["spd_mag"] | p.speedPercent;
  p.partFan = String(print["cooling_fan_speed"] | String(p.partFan)).toInt();
  p.auxFan = String(print["big_fan1_speed"] | String(p.auxFan)).toInt();
  p.chamberFan = String(print["big_fan2_speed"] | String(p.chamberFan)).toInt();
  p.wifiSignal = print["wifi_signal"] | p.wifiSignal;
  String stage = print["mc_print_stage"] | p.stage;
  if (stage.length()) copyText(p.stage, sizeof(p.stage), stage);
  p.currentLayer = print["layer_num"] | p.currentLayer;
  p.totalLayers = print["total_layer_num"] | p.totalLayers;
  String job = print["subtask_name"] | p.jobName;
  if (job.length()) copyText(p.jobName, sizeof(p.jobName), job);
  p.errorCode = print["print_error"] | p.errorCode;
  p.error = p.errorCode != 0;

  JsonObject ams = print["ams"].as<JsonObject>();
  if (!ams.isNull()) {
    p.amsLoadedSlots = 0;
    JsonArray units = ams["ams"].as<JsonArray>();
    for (JsonObject unit : units) {
      JsonArray trays = unit["tray"].as<JsonArray>();
      int localIndex = 0;
      for (JsonObject tray : trays) {
        const char *type = tray["tray_type"] | "";
        const char *color = tray["tray_color"] | "";
        int idx = localIndex++;
        if (idx < 4) {
          auto &slot = p.amsSlots[idx];
          slot.loaded = strlen(type) || strlen(color);
          copyText(slot.material, sizeof(slot.material), type);
          copyText(slot.color, sizeof(slot.color), color);
          copyText(slot.name, sizeof(slot.name), tray["tray_sub_brands"] | "");
          if (!tray["remain"].isNull()) slot.remainingPercent = tray["remain"] | -1;
        }
        if (strlen(type) || strlen(color)) p.amsLoadedSlots++;
      }
      if (unit.containsKey("humidity")) p.amsHumidity = unit["humidity"] | p.amsHumidity;
    }
    String active = ams["tray_now"] | "-1";
    p.activeTray = active.toInt();
    for (int i = 0; i < 4; ++i) p.amsSlots[i].active = (i == p.activeTray);
  }
  if (p.connectedMs == 0) p.connectedMs = millis();
  p.updatedMs = millis();
}

bool BambuPlugin::connectMqtt() {
  if (!config_ || !state_) return false;
  uint64_t chip = ESP.getEfuseMac();
  char clientId[40];
  snprintf(clientId, sizeof(clientId), "WaveshareHome-%04X", (uint16_t)(chip & 0xFFFF));
  if (!mqtt_.connect(clientId, "bblp", config_->bambuAccessCode)) return false;
  String reportTopic = String("device/") + config_->bambuSerial + "/report";
  mqtt_.subscribe(reportTopic.c_str());
  state_->printer.online = true;
  state_->printer.connectedMs = millis();
  copyText(state_->printer.host, sizeof(state_->printer.host), config_->bambuHost);
  copyText(state_->printer.serial, sizeof(state_->printer.serial), config_->bambuSerial);
  requestPushAll();
  return true;
}

void BambuPlugin::requestPushAll() {
  if (!config_ || !mqtt_.connected()) return;
  String requestTopic = String("device/") + config_->bambuSerial + "/request";
  const char *payload = "{\"pushing\":{\"sequence_id\":\"0\",\"command\":\"pushall\"}}";
  mqtt_.publish(requestTopic.c_str(), payload);
}

bool BambuPlugin::sendPrintCommand(const char *command) {
  if (!config_ || !mqtt_.connected() || !command || !*command) return false;
  String topic = String("device/") + config_->bambuSerial + "/request";
  String payload = String("{\"print\":{\"sequence_id\":\"0\",\"command\":\"") + command + "\"}}";
  return mqtt_.publish(topic.c_str(), payload.c_str());
}
bool BambuPlugin::pausePrint() { return sendPrintCommand("pause"); }
bool BambuPlugin::resumePrint() { return sendPrintCommand("resume"); }
bool BambuPlugin::stopPrint() { return sendPrintCommand("stop"); }
bool BambuPlugin::testConnection() {
  if (!config_ || !state_ || WiFi.status() != WL_CONNECTED || !state_->printer.configured) return false;
  if (mqtt_.connected()) return true;
  return connectMqtt();
}

// ---------- Filament Inventory ----------

void FilamentPlugin::begin(AppConfig &config, AppState &state) {
  state.filament.configured = config.filamentEnabled && strlen(config.filamentEndpoint) && strlen(config.filamentSyncKey);
  copyText(state.filament.profile, sizeof(state.filament.profile), config.filamentProfile);
  state.filament.online = false;
  lastFetchMs_ = 0;
}

void FilamentPlugin::loop(AppConfig &config, AppState &state) {
  if (!enabled(config) || !state.filament.configured || WiFi.status() != WL_CONNECTED) return;
  if (lastFetchMs_ == 0 || millis() - lastFetchMs_ >= FILAMENT_INTERVAL_MS) fetch(config, state);
}

void FilamentPlugin::fetch(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, config.filamentEndpoint)) return;
  http.addHeader("X-Filament-Sync-Key", config.filamentSyncKey);
  http.addHeader("X-Filament-Profile", config.filamentProfile);
  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);
  if (code != HTTP_CODE_OK) {
    state.filament.online = false;
    http.end();
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, http.getStream())) {
    state.filament.online = false;
    http.end();
    return;
  }
  JsonArray spools = doc["state"]["spools"].as<JsonArray>();
  int total = 0, loaded = 0, low = 0, empty = 0, unknown = 0;
  for (JsonObject spool : spools) {
    const char *archivedAt = spool["archivedAt"] | "";
    if (strlen(archivedAt)) continue;
    total++;
    String placement = spool["placementState"] | "Stored";
    if (placement == "Loaded") loaded++;

    float remaining = -1.0f;
    bool grossKnown = !spool["gross"].isNull();
    bool tareKnown = !spool["tare"].isNull();
    if (grossKnown && tareKnown) {
      float gross = spool["gross"].as<float>();
      float tare = spool["tare"].as<float>();
      if (gross >= tare) remaining = max(0.0f, gross - tare);
    } else if (!spool["estimatedRemainingGrams"].isNull()) {
      remaining = max(0.0f, spool["estimatedRemainingGrams"].as<float>());
    } else if (!spool["visualPercent"].isNull()) {
      float nominal = spool["startWeight"] | 1000.0f;
      remaining = max(0.0f, nominal * spool["visualPercent"].as<float>() / 100.0f);
    }
    float threshold = spool["reorderThreshold"] | 250.0f;
    if (remaining < 0) unknown++;
    else if (remaining <= 0.1f) empty++;
    else if (remaining <= threshold) low++;
  }

  state.filament.totalSpools = total;
  state.filament.loadedSpools = loaded;
  state.filament.lowSpools = low;
  state.filament.emptySpools = empty;
  state.filament.unknownSpools = unknown;
  state.filament.online = true;
  state.filament.updatedMs = millis();
  copyText(state.filament.updatedAt, sizeof(state.filament.updatedAt), doc["meta"]["updatedAt"] | "");
  http.end();
}

// ---------- Home Assistant ----------

void HomeAssistantPlugin::begin(AppConfig &config, AppState &state) {
  state.homeAssistant.configured = config.homeAssistantEnabled && strlen(config.homeAssistantUrl) && strlen(config.homeAssistantToken);
  state.homeAssistant.online = false;
  lastFetchMs_ = 0;
}

void HomeAssistantPlugin::loop(AppConfig &config, AppState &state) {
  if (!enabled(config) || !state.homeAssistant.configured || WiFi.status() != WL_CONNECTED) return;
  if (lastFetchMs_ == 0 || millis() - lastFetchMs_ >= HA_INTERVAL_MS) fetch(config, state);
}

void HomeAssistantPlugin::fetch(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  String base = config.homeAssistantUrl;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  bool anySuccess = false;
  for (int i = 0; i < 4; ++i) {
    auto &entity = state.homeAssistant.entities[i];
    copyText(entity.entityId, sizeof(entity.entityId), config.haEntityIds[i]);
    copyText(entity.label, sizeof(entity.label), strlen(config.haEntityLabels[i]) ? config.haEntityLabels[i] : config.haEntityIds[i]);
    entity.configured = strlen(config.haEntityIds[i]) > 0;
    if (!entity.configured) continue;

    WiFiClientSecure secure;
    HTTPClient http;
    String url = base + "/api/states/" + config.haEntityIds[i];
    if (!beginHttp(http, secure, url)) continue;
    http.addHeader("Authorization", String("Bearer ") + config.homeAssistantToken);
    http.addHeader("Content-Type", "application/json");
    int code = http.GET();
    if (code == HTTP_CODE_OK) {
      JsonDocument doc;
      if (!deserializeJson(doc, http.getStream())) {
        copyText(entity.value, sizeof(entity.value), doc["state"] | "unknown");
        if (!strlen(config.haEntityLabels[i])) {
          const char *friendly = doc["attributes"]["friendly_name"] | config.haEntityIds[i];
          copyText(entity.label, sizeof(entity.label), friendly);
        }
        entity.online = true;
        anySuccess = true;
      }
    } else entity.online = false;
    http.end();
  }
  state.homeAssistant.online = anySuccess;
  state.homeAssistant.updatedMs = millis();
}

bool HomeAssistantPlugin::postService(const AppConfig &config, const char *domain, const char *service, const char *entityId) {
  if (!strlen(config.homeAssistantUrl) || !strlen(config.homeAssistantToken) || !entityId || !strlen(entityId)) return false;
  String base = config.homeAssistantUrl;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  String url = base + "/api/services/" + domain + "/" + service;
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, url)) return false;
  http.addHeader("Authorization", String("Bearer ") + config.homeAssistantToken);
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"entity_id\":\"") + entityId + "\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

bool HomeAssistantPlugin::callScene(const AppConfig &config) {
  return postService(config, "scene", "turn_on", config.haSceneId);
}

bool HomeAssistantPlugin::callAutomation(const AppConfig &config) {
  return postService(config, "automation", "trigger", config.haAutomationId);
}

// ---------- Calendar ----------

void CalendarPlugin::begin(AppConfig &config, AppState &state) {
  state.calendar.configured = config.calendarEnabled && strlen(config.calendarIcsUrl);
  state.calendar.online = false;
  lastFetchMs_ = 0;
}

void CalendarPlugin::loop(AppConfig &config, AppState &state) {
  if (!enabled(config) || !state.calendar.configured || WiFi.status() != WL_CONNECTED) return;
  if (lastFetchMs_ == 0 || millis() - lastFetchMs_ >= CALENDAR_INTERVAL_MS) fetch(config, state);
}

time_t CalendarPlugin::parseIcsDate(const String &raw) {
  String value = raw;
  int colon = value.indexOf(':');
  if (colon >= 0) value = value.substring(colon + 1);
  value.trim();
  if (value.length() < 8) return 0;
  struct tm tmv = {};
  tmv.tm_year = value.substring(0, 4).toInt() - 1900;
  tmv.tm_mon = value.substring(4, 6).toInt() - 1;
  tmv.tm_mday = value.substring(6, 8).toInt();
  tmv.tm_hour = value.length() >= 11 ? value.substring(9, 11).toInt() : 12;
  tmv.tm_min = value.length() >= 13 ? value.substring(11, 13).toInt() : 0;
  tmv.tm_sec = value.length() >= 15 ? value.substring(13, 15).toInt() : 0;
  tmv.tm_isdst = -1;
  if (value.endsWith("Z")) return timegm(&tmv);
  return mktime(&tmv);
}

void CalendarPlugin::fetch(AppConfig &config, AppState &state) {
  lastFetchMs_ = millis();
  WiFiClientSecure secure;
  HTTPClient http;
  if (!beginHttp(http, secure, config.calendarIcsUrl)) return;
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    state.calendar.online = false;
    http.end();
    return;
  }
  String body = http.getString();
  http.end();
  if (body.length() > 180000) {
    state.calendar.online = false;
    return;
  }

  const time_t now = time(nullptr);
  time_t bestEpoch = 0;
  String bestTitle;
  bool inEvent = false;
  String title;
  time_t start = 0;
  int pos = 0;
  while (pos < body.length()) {
    int end = body.indexOf('\n', pos);
    if (end < 0) end = body.length();
    String line = body.substring(pos, end);
    line.trim();
    pos = end + 1;
    if (line == "BEGIN:VEVENT") {
      inEvent = true;
      title = "Event";
      start = 0;
    } else if (line == "END:VEVENT") {
      if (inEvent && start >= now - 60 && (bestEpoch == 0 || start < bestEpoch)) {
        bestEpoch = start;
        bestTitle = title;
      }
      inEvent = false;
    } else if (inEvent && line.startsWith("SUMMARY:")) {
      title = line.substring(8);
      title.replace("\\,", ",");
      title.replace("\\n", " ");
    } else if (inEvent && line.startsWith("DTSTART")) {
      start = parseIcsDate(line);
    }
  }

  state.calendar.online = true;
  state.calendar.hasNext = bestEpoch > 0;
  state.calendar.nextEpoch = bestEpoch;
  if (bestEpoch > 0) {
    copyText(state.calendar.nextTitle, sizeof(state.calendar.nextTitle), bestTitle);
    struct tm local;
    localtime_r(&bestEpoch, &local);
    char when[48];
    strftime(when, sizeof(when), "%a %b %e, %l:%M %p", &local);
    copyText(state.calendar.nextWhen, sizeof(state.calendar.nextWhen), when);
  } else {
    copyText(state.calendar.nextTitle, sizeof(state.calendar.nextTitle), "No upcoming event");
    state.calendar.nextWhen[0] = '\0';
  }
  state.calendar.updatedMs = millis();
}

// ---------- Timers ----------

int TimerPlugin::start(AppState &state, uint32_t seconds, const char *label) {
  for (int i = 0; i < 4; ++i) {
    if (!state.timers[i].active) {
      state.timers[i].active = true;
      state.timers[i].fired = false;
      state.timers[i].durationSec = seconds;
      state.timers[i].startedMs = millis();
      state.timers[i].endMs = millis() + seconds * 1000UL;
      copyText(state.timers[i].label, sizeof(state.timers[i].label), label);
      return i;
    }
  }
  return -1;
}

void TimerPlugin::cancel(AppState &state, int index) {
  if (index < 0 || index >= 4) return;
  state.timers[index] = TimerState{};
}

void TimerPlugin::loop(AppConfig &config, AppState &state) {
  for (auto &timer : state.timers) {
    if (!timer.active || timer.fired) continue;
    if ((int32_t)(millis() - timer.endMs) >= 0) {
      timer.fired = true;
      timer.active = false;
      if (config.audioEnabled) audio_.alarm();
    }
  }
}

// ---------- Service manager ----------

void ServiceManager::add(ServicePlugin *plugin) {
  if (plugin && count_ < 10) plugins_[count_++] = plugin;
}

void ServiceManager::begin(AppConfig &config, AppState &state) {
  for (uint8_t i = 0; i < count_; ++i) plugins_[i]->begin(config, state);
}

void ServiceManager::loop(AppConfig &config, AppState &state) {
  for (uint8_t i = 0; i < count_; ++i) {
    if (plugins_[i]->enabled(config)) plugins_[i]->loop(config, state);
  }
}

void ServiceManager::configChanged(AppConfig &config, AppState &state) {
  for (uint8_t i = 0; i < count_; ++i) plugins_[i]->onConfigChanged(config, state);
}

// ---------- Attention ----------

void AttentionEngine::add(AppState &state, AlertSeverity severity, const char *source, const char *title, const char *detail) {
  if (state.alertCount >= 10) return;
  AlertItem &item = state.alerts[state.alertCount++];
  item.active = true;
  item.severity = severity;
  copyText(item.source, sizeof(item.source), source);
  copyText(item.title, sizeof(item.title), title);
  copyText(item.detail, sizeof(item.detail), detail);
}

void AttentionEngine::update(const AppConfig &config, AppState &state) {
  for (auto &alert : state.alerts) alert = AlertItem{};
  state.alertCount = 0;
  if (state.system.recoveryMode) add(state, AlertSeverity::Urgent, "System", "Recovery mode", "Boot-loop protection is active. Review diagnostics or install known-good firmware.");
  if (WiFi.status() != WL_CONNECTED) add(state, AlertSeverity::Attention, "Network", "Wi-Fi offline", state.system.setupApActive ? "Setup access point is available." : "Local controls remain available.");
  if (config.weatherEnabled && state.weather.severeAlert) {
    AlertSeverity severity = (!strcmp(state.weather.alertSeverity, "Extreme") || !strcmp(state.weather.alertSeverity, "Severe")) ? AlertSeverity::Urgent : AlertSeverity::Attention;
    add(state, severity, "Weather", "Weather alert", state.weather.alertHeadline);
  }
  if (config.bambuEnabled && state.printer.error) add(state, AlertSeverity::Urgent, "Printer", "Printer error", "The Bambu printer is reporting an active error.");
  else if (config.bambuEnabled && state.printer.configured && !state.printer.online) add(state, AlertSeverity::Attention, "Printer", "Printer offline", "Local MQTT connection is unavailable.");
  if (config.filamentEnabled && state.filament.online && (state.filament.lowSpools + state.filament.emptySpools) > 0) {
    char detail[100];
    snprintf(detail, sizeof(detail), "%d low • %d empty", state.filament.lowSpools, state.filament.emptySpools);
    add(state, state.filament.emptySpools ? AlertSeverity::Attention : AlertSeverity::Info, "Filament", "Inventory needs attention", detail);
  }
  if (config.homeAssistantEnabled && state.homeAssistant.configured && !state.homeAssistant.online) add(state, AlertSeverity::Info, "Home", "Home Assistant unavailable", "Configured entities could not be refreshed.");
  if (config.calendarEnabled && state.calendar.configured && !state.calendar.online) add(state, AlertSeverity::Info, "Calendar", "Calendar unavailable", "The configured ICS feed could not be refreshed.");
  for (auto &timer : state.timers) if (timer.fired) add(state, AlertSeverity::Attention, "Timer", "Timer complete", timer.label);
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
}

// ---------- Web dashboard ----------

WebDashboard::WebDashboard(ConfigStore &store, ConnectivityService &connectivity, AudioService &audio,
                           TimerPlugin &timers, HomeAssistantPlugin &homeAssistant, BambuPlugin &bambu)
  : server_(80), store_(store), connectivity_(connectivity), audio_(audio), timers_(timers), homeAssistant_(homeAssistant), bambu_(bambu) {}

String WebDashboard::htmlEscape(const String &value) {
  String out = value;
  out.replace("&", "&amp;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  out.replace("\"", "&quot;");
  return out;
}

String WebDashboard::checked(bool value) { return value ? " checked" : ""; }
String WebDashboard::selected(bool value) { return value ? " selected" : ""; }

String WebDashboard::pageHeader(const char *title) {
  String s;
  s.reserve(10500);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><meta charset='utf-8'><meta name='theme-color' content='#071117'><title>");
  s += title;
  s += F("</title><style>"
    ":root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;--bg:#05090d;--panel:#0a131a;--panel2:#0d1820;--line:#1c3440;--line2:#294b58;--text:#eef6f8;--muted:#93a8b2;--accent:#76e6ad;--accent2:#6fc8ff;--warn:#ffc477;--danger:#ff7d88;--shadow:0 20px 60px rgba(0,0,0,.34)}"
    "*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 12% -10%,#123341 0,transparent 34%),radial-gradient(circle at 90% 4%,#102a23 0,transparent 26%),linear-gradient(180deg,#05090d,#071016 55%,#05090d);color:var(--text);min-height:100vh}body:before{content:'';position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,black,transparent 70%)}"
    ".wrap{max-width:1180px;margin:auto;padding:22px 22px 72px;position:relative}.appbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:4px 0 14px}.brand{display:flex;align-items:center;gap:13px}.mark{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#153f4d,#103328);border:1px solid #326272;box-shadow:inset 0 1px rgba(255,255,255,.12),0 10px 28px rgba(0,0,0,.35);font-weight:900;letter-spacing:-.04em}.brand h1{font-size:25px;margin:2px 0 0;letter-spacing:-.035em}.eyebrow{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#78a9ba}.subtle{color:var(--muted)}"
    ".status-cluster{display:flex;align-items:center;gap:8px}.live-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(118,230,173,.1),0 0 18px rgba(118,230,173,.65);animation:pulse 2.2s infinite}.pill,.section-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #284955;background:rgba(13,28,35,.78);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#b8cbd2}.pill.good{color:#95f0bb;border-color:#2f6650;background:#0b2119}.pill.warn{color:#ffd295;border-color:#654d2b;background:#241b0c}.pill.bad{color:#ffa3aa;border-color:#66343b;background:#241015}"
    ".nav{position:sticky;top:10px;z-index:20;display:flex;gap:6px;overflow-x:auto;padding:7px;margin:0 0 15px;border:1px solid rgba(53,85,98,.62);background:rgba(7,16,22,.88);backdrop-filter:blur(18px);border-radius:15px;box-shadow:0 14px 40px rgba(0,0,0,.25);scrollbar-width:none}.nav::-webkit-scrollbar{display:none}.nav a{flex:0 0 auto;color:#a9c0ca;text-decoration:none;padding:9px 12px;border-radius:10px;font-size:12px;font-weight:700}.nav a:hover,.nav a.active{background:#132630;color:#effcff}.nav .json{margin-left:auto;color:#7dcdf9}"
    ".hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(270px,.75fr);gap:14px;padding:22px;border:1px solid #23414e;border-radius:22px;background:linear-gradient(135deg,rgba(14,34,43,.96),rgba(7,18,24,.92) 60%,rgba(11,35,27,.86));box-shadow:var(--shadow);overflow:hidden;position:relative}.hero:after{content:'';position:absolute;width:260px;height:260px;border-radius:50%;right:-95px;top:-130px;background:radial-gradient(circle,rgba(111,200,255,.18),transparent 68%);pointer-events:none}.hero h2{font-size:30px;line-height:1.03;letter-spacing:-.045em;margin:7px 0 10px;max-width:640px}.hero p{max-width:680px;margin:0 0 16px}.hero-actions{display:flex;gap:8px;flex-wrap:wrap}.hero-actions form{margin:0}.hero-actions button{width:auto;min-width:130px}.health{border:1px solid #24404a;border-radius:16px;padding:8px 14px;background:rgba(3,10,14,.35);align-self:stretch;display:flex;flex-direction:column;justify-content:center}.health-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(58,85,96,.38);font-size:12px;color:var(--muted)}.health-row:last-child{border:0}.health-row strong{color:var(--text);text-align:right}"
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.metrics{margin:13px 0}.card{background:linear-gradient(180deg,rgba(13,24,32,.96),rgba(8,17,23,.96));border:1px solid var(--line);border-radius:18px;padding:17px;margin:12px 0;box-shadow:0 12px 32px rgba(0,0,0,.18);scroll-margin-top:84px}.panel{position:relative;overflow:hidden}.panel:before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(var(--accent2),transparent 65%);opacity:.55}.metric-card{margin:0;min-height:116px}.metric-label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#7797a5;font-weight:800}.metric{font-size:25px;line-height:1.08;font-weight:790;letter-spacing:-.035em;margin-top:8px}.metric-sub{color:#809aa5;font-size:12px;margin-top:8px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.section-head h2{font-size:20px;margin:2px 0 0;letter-spacing:-.025em}.section-head h3{margin:1px 0 0}.section-chip{padding:6px 9px}"
    "h1,h2,h3,strong{color:var(--text)}h2{font-size:18px;margin:0 0 12px}h3{font-size:12px;color:#8ba7b2;text-transform:uppercase;letter-spacing:.11em;margin-top:18px}p,small{color:var(--muted);line-height:1.52}a{color:#8fd6ff}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#b9d8e5;background:#071016;border:1px solid #18313c;border-radius:7px;padding:2px 6px}hr{border:0;border-top:1px solid #18313c;margin:20px 0}"
    "label{display:block;font-size:12px;color:#a8bbc3;margin:11px 0 6px;font-weight:650}input,select,button{font:inherit;box-sizing:border-box;width:100%;min-height:44px;padding:11px 12px;border-radius:11px;border:1px solid #294653;background:#071117;color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s,transform .15s,background .15s}input:focus,select:focus{border-color:#4b8da3;box-shadow:0 0 0 3px rgba(89,161,188,.12)}input[type=checkbox]{width:auto;min-height:auto;margin-right:8px;accent-color:#61d69a}input[type=file]{padding:8px}button,.btn{display:inline-block;text-decoration:none;text-align:center;background:linear-gradient(180deg,#1e5739,#173f2c);border-color:#347a54;color:#e5fff0;font-weight:760;cursor:pointer;box-shadow:inset 0 1px rgba(255,255,255,.08)}button:hover{transform:translateY(-1px);border-color:#4f9a6d}button:active{transform:translateY(0)}button:disabled{opacity:.55;cursor:not-allowed}.danger{background:linear-gradient(180deg,#481a21,#34141a);border-color:#7b3641}.muted{background:linear-gradient(180deg,#142630,#0e1c23);border-color:#2d4b58;color:#d4e4ea}.ghost{background:transparent;border-color:#2b4652}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
    ".status{font-size:12px;color:#8deab2}.warn{color:var(--warn)}.notice{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border-radius:14px;margin:13px 0;border:1px solid #544329;background:#21190c}.notice.error{border-color:#60333a;background:#211015}.notice strong{display:block;margin-bottom:2px}.notice-icon{font-weight:900;color:var(--warn)}.notice.error .notice-icon{color:var(--danger)}"
    "details{border:1px solid #1b3440;border-radius:12px;padding:0 12px;background:#071016;margin:9px 0}summary{cursor:pointer;padding:11px 0;color:#b7c9d0;font-size:12px;font-weight:700}details[open] summary{border-bottom:1px solid #17313c;margin-bottom:10px}.ota-flow{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:10px;border:1px solid #1d3b46;border-radius:13px;background:#071117;margin:10px 0 14px;scrollbar-width:none}.ota-flow span{white-space:nowrap;padding:8px 10px;border-radius:9px;background:#0e2028;border:1px solid #25424e;color:#bad0d8;font-size:11px;font-weight:700}.ota-flow b{color:#527985}.file-zone{border:1px dashed #37606f;border-radius:14px;padding:14px;background:#071219;margin-top:10px}.file-zone small{display:block;margin-top:3px}progress{appearance:none;width:100%;height:10px;border:0;border-radius:999px;overflow:hidden;background:#071117;margin-top:12px}progress::-webkit-progress-bar{background:#071117}progress::-webkit-progress-value{background:linear-gradient(90deg,#43b6ff,#6fe6aa)}progress::-moz-progress-bar{background:linear-gradient(90deg,#43b6ff,#6fe6aa)}"
    ".footer{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#6f8791;font-size:11px;padding:16px 3px}.footer a{text-decoration:none}.kbd{border:1px solid #29434f;background:#081117;border-radius:6px;padding:2px 5px;font-size:10px}.spin{display:inline-block;animation:spin 1s linear infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}@keyframes spin{to{transform:rotate(360deg)}}"
    "@media(max-width:760px){.wrap{padding:14px 14px 94px}.appbar{align-items:flex-start}.brand .eyebrow{display:none}.brand h1{font-size:22px}.mark{width:40px;height:40px}.status-cluster{padding-top:5px}.hero{grid-template-columns:1fr;padding:18px}.hero h2{font-size:25px}.health{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.health-row:nth-last-child(-n+2){border-bottom:0}.metrics{grid-template-columns:1fr 1fr}.metric-card{min-height:104px}.row{grid-template-columns:1fr}.nav{position:fixed;left:10px;right:10px;bottom:10px;top:auto;margin:0;padding:6px;z-index:50;border-radius:17px}.nav a{padding:10px 12px}.nav .json{margin-left:0}.card{scroll-margin-top:16px}.footer{padding-bottom:2px}}"
    "@media(max-width:430px){.metrics{grid-template-columns:1fr 1fr}.metric{font-size:21px}.hero-actions button{width:100%}.hero-actions form{width:100%}.health{grid-template-columns:1fr}.health-row{border-bottom:1px solid rgba(58,85,96,.38)!important}.health-row:last-child{border:0!important}}"
    "</style></head><body><div class='wrap'>");
  return s;
}

String WebDashboard::pageFooter() {
  return String(R"WHFOOTER(<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><div id='consoleToast' style='position:fixed;right:16px;bottom:86px;z-index:90;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;border:1px solid #31515d;background:rgba(7,18,24,.96);box-shadow:0 18px 55px rgba(0,0,0,.42);color:#dcecf1;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s'></div><script>(()=>{const $=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v},fmt=u=>{if(u<60)return u+'s';if(u<3600)return Math.floor(u/60)+'m';return Math.floor(u/3600)+'h '+Math.floor((u%3600)/60)+'m'},toast=(m,bad=false)=>{const t=$('consoleToast');if(!t)return;t.textContent=m;t.style.borderColor=bad?'#6a3840':'#31515d';t.style.color=bad?'#ffadb4':'#dcecf1';t.style.opacity='1';t.style.transform='translateY(0)';clearTimeout(window.__whToast);window.__whToast=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)'},5000)};async function sync(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return null;const d=await r.json();set('liveFirmware',d.firmware);set('liveSsid',d.network.connected?d.network.ssid:'Offline');set('liveIp',d.network.ip+' • '+d.network.rssi+' dBm');set('liveUptime',fmt(d.system.uptimeSec));set('liveAlerts',d.alerts);set('liveBoot',d.system.stableBoot?'Stable':'Validating');set('liveSlot',(d.ota.runningPartition||'?')+' → '+(d.ota.nextPartition||'?'));const otaPct=d.ota&&d.ota.total?Math.min(100,Math.round((d.ota.bytes||0)*100/d.ota.total)):0;set('liveOta',d.ota&&d.ota.inProgress?(d.ota.status+' • '+otaPct+'%'):(d.updater.error?d.updater.error:(d.updater.status||'Idle')));set('liveWeather',d.weather.online?(Math.round(d.weather.temperatureC*10)/10)+' °C • '+d.weather.condition:d.weather.condition);const on=$('liveOnline');if(on){on.textContent=d.network.connected?'ONLINE':'OFFLINE';on.className='pill '+(d.network.connected?'good':'bad')}const dot=$('liveDot');if(dot)dot.style.background=d.network.connected?'var(--accent)':'var(--danger)';return d}catch(e){const on=$('liveOnline');if(on){on.textContent='UNREACHABLE';on.className='pill bad'}return null}}let syncTimer=0,lastState=null;const scheduleSync=(delay)=>{clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{const d=await sync();if(d)lastState=d;const ota=d&&d.ota&&d.ota.inProgress;const next=ota?1000:(document.hidden?30000:(d?5000:15000));scheduleSync(next)},delay)};sync().then(d=>{if(d)lastState=d;scheduleSync(5000)});document.addEventListener('visibilitychange',()=>scheduleSync(document.hidden?30000:250));document.addEventListener('submit',e=>{const b=e.submitter;if(!b)return;const msg=b.dataset.confirm;if(msg&&!window.confirm(msg)){e.preventDefault();return}if(b.dataset.locked==='1'){e.preventDefault();return}if(b.classList.contains('danger')||b.formAction.endsWith('/update/install')){b.dataset.locked='1';setTimeout(()=>{b.disabled=true},0)}},true);document.querySelectorAll("form[action='/update/check'],form[action='/update/install']").forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const install=f.action.endsWith('/update/install'),b=f.querySelector('button'),old=b?b.textContent:'';if(b){b.disabled=true;b.textContent=install?'Starting update…':'Checking GitHub…'}toast(install?'Starting secure device update…':'Checking GitHub releases…');try{await fetch(f.action,{method:'POST',body:new FormData(f),cache:'no-store'});if(install){toast('Update started. The device will validate, switch OTA slots and restart.');setTimeout(sync,1800)}else{const d=await sync();if(d&&d.updater&&d.updater.error)toast(d.updater.error,true);else if(d&&d.updater&&d.updater.available)toast('Update available: '+d.updater.latestVersion);else toast('Update check complete. '+(d&&d.updater?d.updater.status:''))}}catch(err){toast(install?'Device connection changed; it may be restarting.':'Update check could not complete.',!install)}finally{if(!install&&b){b.disabled=false;b.textContent=old}}}));const links=[...document.querySelectorAll('.nav a[href^="#"]')],targets=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}}),{rootMargin:'-25% 0px -65% 0px'});targets.forEach(t=>io.observe(t))}})()</script></div></body></html>)WHFOOTER");
}

void WebDashboard::begin(AppConfig &config, AppState &state) {
  config_ = &config;
  state_ = &state;
  if (!started_) {
    installRoutes();
    server_.begin();
    started_ = true;
  }
  state.system.webReady = true;
}

void WebDashboard::loop(AppConfig &config, AppState &state) {
  if (started_) server_.handleClient();

  // Run slow GitHub/TLS work only after the HTTP response has been returned.
  // This keeps Safari/curl from interpreting a long synchronous handler as a
  // dropped connection and keeps the WebServer request stack out of OTA work.
  if (updateCheckRequested_ && !state.system.updateCheckInProgress && !state.system.otaInProgress) {
    updateCheckRequested_ = false;
    checkForSelfUpdate(true);
  }
  if (updateInstallRequested_ && !state.system.updateCheckInProgress && !state.system.otaInProgress) {
    updateInstallRequested_ = false;
    if (installSelfUpdate()) scheduleRestart(1500);
  }

  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();

  if (state.system.stableBoot && WiFi.status() == WL_CONNECTED && config.updateMode != 0 && !state.system.otaInProgress) {
    const uint32_t interval = (uint32_t)config.updateCheckMinutes * 60UL * 1000UL;
    const bool initialDue = !selfUpdateInitialCheckDone_ && millis() > 90000UL;
    const bool periodicDue = selfUpdateInitialCheckDone_ && millis() - lastSelfUpdateCheckMs_ >= interval;
    if (initialDue || periodicDue) {
      selfUpdateInitialCheckDone_ = true;
      lastSelfUpdateCheckMs_ = millis();
      if (checkForSelfUpdate(true) && config.updateMode == 2 && config.updateChannel == 0 && state.system.updateAvailable) {
        installSelfUpdate();
      }
    }
  }
}

void WebDashboard::installRoutes() {
  server_.on("/", HTTP_GET, [this]() { sendRoot(); });
  server_.on("/api/status", HTTP_GET, [this]() { sendStatusJson(); });
  server_.on("/wifi", HTTP_POST, [this]() { handleWifiSave(); });
  server_.on("/settings", HTTP_POST, [this]() { handleSettingsSave(); });
  server_.on("/weather/save", HTTP_POST, [this]() {
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
  server_.on("/bambu/scan", HTTP_POST, [this]() {
    if (!bambu_.startDiscovery()) { server_.send(409, "text/plain", "Wi-Fi must be online to scan"); return; }
    server_.sendHeader("Location", "/#bambu", true);
    server_.send(303, "text/plain", "Scanning");
  });
  server_.on("/bambu/use", HTTP_POST, [this]() {
    int index = server_.arg("index").toInt();
    if (!bambu_.useDiscovered(*config_, *state_, index)) { server_.send(404, "text/plain", "Discovered printer not found"); return; }
    store_.save(*config_); configChanged_ = true;
    server_.sendHeader("Location", "/#bambu", true);
    server_.send(303, "text/plain", "Printer selected");
  });
  server_.on("/bambu/test", HTTP_POST, [this]() {
    bool ok = bambu_.testConnection();
    String message = ok ? "Bambu MQTT connection successful" : String("Bambu MQTT connection failed (state ") + bambu_.mqttState() + "). Check IP, serial, LAN mode and access code.";
    server_.send(ok ? 200 : 502, "text/plain", message);
  });
  server_.on("/bambu/pause", HTTP_POST, [this]() { bool ok=bambu_.pausePrint(); server_.send(ok?200:409,"text/plain",ok?"Pause requested":"Printer unavailable"); });
  server_.on("/bambu/resume", HTTP_POST, [this]() { bool ok=bambu_.resumePrint(); server_.send(ok?200:409,"text/plain",ok?"Resume requested":"Printer unavailable"); });
  server_.on("/bambu/stop", HTTP_POST, [this]() { if(server_.arg("confirm")!="STOP"){server_.send(400,"text/plain","STOP confirmation required");return;} bool ok=bambu_.stopPrint(); server_.send(ok?200:409,"text/plain",ok?"Stop requested":"Printer unavailable"); });
  server_.on("/api/sensor", HTTP_POST, [this]() {
    auto &e=state_->workshop.environment; copyText(e.source,sizeof(e.source),server_.arg("source").length()?server_.arg("source"):"External sensor");
    e.temperatureC=server_.arg("temperatureC").toFloat(); e.humidity=server_.arg("humidity").toFloat(); e.pm25=server_.arg("pm25").toFloat(); e.voc=server_.arg("voc").toFloat(); e.co2=server_.arg("co2").toFloat();
    e.presence=server_.arg("presence")=="1"||server_.arg("presence")=="true"||server_.arg("presence")=="on"; e.online=true; e.stale=false; e.updatedMs=millis();
    server_.send(200,"application/json","{\"ok\":true}");
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
    copyText(state_->voice.status,sizeof(state_->voice.status),result); String out=String("{\"ok\":")+(ok?"true":"false")+",\"result\":\""+result+"\"}"; server_.send(ok?200:400,"application/json",out);
  });
  server_.on("/wifi/reconnect", HTTP_POST, [this]() { connectivity_.reconnect(); server_.send(200, "text/plain", "Reconnect requested"); });
  server_.on("/wifi/forget", HTTP_POST, [this]() { connectivity_.forget(); server_.send(200, "text/plain", "Wi-Fi forgotten. Join WaveshareHome-Setup."); });
  server_.on("/restart", HTTP_POST, [this]() { server_.send(200, "text/plain", "Restarting"); scheduleRestart(); });
  server_.on("/factory", HTTP_POST, [this]() {
    if (server_.arg("confirm") != "ERASE") { server_.send(400, "text/plain", "Confirmation required"); return; }
    store_.factoryReset(); connectivity_.forget(); server_.send(200, "text/plain", "Factory settings cleared. Restarting."); scheduleRestart();
  });
  server_.on("/audio/test", HTTP_POST, [this]() { audio_.chirp(); server_.send(200, "text/plain", "Audio test played"); });
  server_.on("/timer/start", HTTP_POST, [this]() {
    uint32_t sec = constrain(server_.arg("seconds").toInt(), 1, 86400);
    int slot = timers_.start(*state_, sec, server_.arg("label").length() ? server_.arg("label").c_str() : "Timer");
    server_.send(slot >= 0 ? 200 : 409, "text/plain", slot >= 0 ? String("Timer started in slot ") + slot : "All timer slots are in use");
  });
  server_.on("/timer/cancel", HTTP_POST, [this]() { timers_.cancel(*state_, server_.arg("index").toInt()); server_.send(200, "text/plain", "Timer cancelled"); });
  server_.on("/ha/scene", HTTP_POST, [this]() { server_.send(homeAssistant_.callScene(*config_) ? 200 : 502, "text/plain", "Scene request sent"); });
  server_.on("/ha/automation", HTTP_POST, [this]() { server_.send(homeAssistant_.callAutomation(*config_) ? 200 : 502, "text/plain", "Automation request sent"); });
  server_.on("/update", HTTP_POST, [this]() { handleUpdateFinished(); }, [this]() { handleUpdateUpload(); });
  server_.on("/update/check", HTTP_POST, [this]() {
    if (!state_ || state_->system.updateCheckInProgress || state_->system.otaInProgress) {
      server_.send(409, "text/plain", "Updater is busy");
      return;
    }
    updateCheckRequested_ = true;
    copyText(state_->system.updateStatus, sizeof(state_->system.updateStatus), "Check queued");
    state_->system.updateError[0] = '\0';
    server_.send(202, "text/plain", "Update check queued");
  });
  server_.on("/update/install", HTTP_POST, [this]() {
    if (!state_->system.updateAvailable) {
      copyText(state_->system.updateError, sizeof(state_->system.updateError), "No newer update is ready to install");
      server_.sendHeader("Location", "/#ota", true);
      server_.send(303, "text/plain", state_->system.updateError);
      return;
    }
    updateInstallRequested_ = true;
    copyText(state_->system.updateStatus, sizeof(state_->system.updateStatus), "Install queued");
    state_->system.updateError[0] = '\0';
    server_.send(202, "text/plain", "Update install queued. Device will restart after validation.");
  });
  server_.on("/generate_204", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/hotspot-detect.html", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/connecttest.txt", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/ncsi.txt", HTTP_ANY, [this]() { sendRoot(); });
  server_.onNotFound([this]() { handleNotFound(); });
}

void WebDashboard::sendRoot() {
  if (!config_ || !state_) return;
  String s = pageHeader("Waveshare Home");
  s.reserve(38000);
  const bool networkOnline = WiFi.status() == WL_CONNECTED;
  s += F("<div class='appbar' id='home'><div class='brand'><div class='mark'>WH</div><div><span class='eyebrow'>ESP32-S3 command center</span><h1>Waveshare Home</h1></div></div><div class='status-cluster'><span id='liveDot' class='live-dot'></span><span id='liveOnline' class='pill ");
  s += networkOnline ? "good'>ONLINE" : "bad'>OFFLINE";
  s += F("</span></div></div>");
  s += F("<nav class='nav' aria-label='Dashboard sections'><a href='#home'>Overview</a><a href='#wifi'>Wi-Fi</a><a href='#device'>Device</a><a href='#integrations'>Integrations</a><a href='#workshop'>Workshop</a><a href='#ota'>Updates</a><a href='#recovery'>Recovery</a><a class='json' href='/api/status'>JSON</a></nav>");

  s += F("<section class='hero'><div><span class='eyebrow'>LOCAL CONTROL PLANE</span><h2>One polished surface for the device, workshop and printer.</h2><p>Configure integrations, monitor runtime health, control workshop services and update firmware without leaving the local network.</p><div class='hero-actions'><form method='post' action='/update/check'><button type='submit'>Check for update</button></form><form method='post' action='/wifi/reconnect'><button type='submit' class='muted'>Reconnect Wi-Fi</button></form><form method='post' action='/audio/test'><button type='submit' class='ghost'>Test speaker</button></form></div></div><div class='health'><div class='health-row'><span>Boot guard</span><strong id='liveBoot'>");
  s += state_->system.stableBoot ? "Stable" : "Validating";
  s += F("</strong></div><div class='health-row'><span>OTA slots</span><strong id='liveSlot'>");
  { const esp_partition_t *r=esp_ota_get_running_partition(); const esp_partition_t *n=esp_ota_get_next_update_partition(nullptr); s += r?r->label:"?"; s += F(" → "); s += n?n->label:"?"; }
  s += F("</strong></div><div class='health-row'><span>Updater</span><strong id='liveOta'>");
  s += strlen(state_->system.updateError) ? htmlEscape(state_->system.updateError) : htmlEscape(state_->system.updateStatus);
  s += F("</strong></div><div class='health-row'><span>Weather</span><strong id='liveWeather'>");
  s += state_->weather.online ? String(state_->weather.temperatureC,1)+" °C • "+htmlEscape(state_->weather.condition) : htmlEscape(state_->weather.condition);
  s += F("</strong></div></div></section>");

  s += F("<div class='grid metrics'><div class='card metric-card'><span class='metric-label'>Network</span><div class='metric' id='liveSsid'>");
  s += networkOnline ? htmlEscape(WiFi.SSID()) : String(SETUP_AP_NAME);
  s += F("</div><div class='metric-sub' id='liveIp'>"); s += state_->system.ip; s += F(" • "); s += state_->system.rssi; s += F(" dBm</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Firmware</span><div class='metric' id='liveFirmware'>"); s += FW_VERSION; s += F("</div><div class='metric-sub'>dual-slot OTA enabled</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Uptime</span><div class='metric' id='liveUptime'>"); s += state_->system.uptimeSec / 60; s += F("m</div><div class='metric-sub'>last reset: "); s += htmlEscape(state_->system.resetReason); s += F("</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Attention</span><div class='metric' id='liveAlerts'>"); s += state_->alertCount; s += F("</div><div class='metric-sub'>active alerts</div></div></div>");

  if (strlen(state_->system.updateError)) {
    s += F("<div class='notice error'><div class='notice-icon'>!</div><div><strong>Updater needs attention</strong><span>"); s += htmlEscape(state_->system.updateError); s += F("</span><br><small>Your running firmware remains untouched unless an image passes validation.</small></div></div>");
  } else if (!state_->system.stableBoot) {
    s += F("<div class='notice'><div class='notice-icon'>•</div><div><strong>Boot validation in progress</strong><span>The current image will be marked stable after the boot-guard window completes.</span></div></div>");
  }

  s += F("<div class='card panel' id='wifi'><div class='section-head'><div><span class='eyebrow'>CONNECTIVITY</span><h2>Wi-Fi</h2></div><span class='section-chip'>LAN</span></div>");
  if (connectivity_.setupApActive()) {
    int n = WiFi.scanNetworks(false, true);
    s += F("<p class='warn'>Setup AP is active. Select a 2.4 GHz network.</p><form method='post' action='/wifi'><label>Network</label><select name='ssid'>");
    for (int i = 0; i < n; ++i) { s += F("<option value='"); s += htmlEscape(WiFi.SSID(i)); s += F("'>"); s += htmlEscape(WiFi.SSID(i)); s += F(" ("); s += WiFi.RSSI(i); s += F(" dBm)</option>"); }
    s += F("</select><label>Password</label><input type='password' name='password' autocomplete='current-password'><button type='submit'>Connect Wi-Fi</button></form>");
  } else {
    s += F("<p>SSID <strong>"); s += htmlEscape(WiFi.SSID()); s += F("</strong><br>IP "); s += WiFi.localIP().toString(); s += F("<br>RSSI "); s += WiFi.RSSI(); s += F(" dBm</p><div class='row'><form method='post' action='/wifi/reconnect'><button>Reconnect</button></form><form method='post' action='/wifi/forget'><button class='danger' data-confirm='Forget the saved Wi-Fi network?'>Forget Wi-Fi</button></form></div>");
  }
  s += F("</div>");

  s += F("<form method='post' action='/settings'><div class='card panel' id='device'><div class='section-head'><div><span class='eyebrow'>PERSONALIZATION</span><h2>Device experience</h2></div><span class='section-chip'>DISPLAY</span></div><div class='row'><div><label>Device name</label><input name='deviceName' maxlength='39' value='"); s += htmlEscape(config_->deviceName); s += F("'></div><div><label>Timezone</label><select name='timezone'>");
  for (size_t i = 0; i < TIMEZONE_COUNT; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected(!strcmp(config_->timezoneId, TIMEZONES[i].id)); s += F(">"); s += TIMEZONES[i].label; s += F("</option>"); }
  s += F("</select></div></div><div class='row'><div><label>Brightness %</label><input type='number' min='5' max='100' name='brightness' value='"); s += config_->brightness; s += F("'></div><div><label>Ambient brightness %</label><input type='number' min='5' max='60' name='ambientBrightness' value='"); s += config_->ambientBrightness; s += F("'></div></div><div class='row'><div><label>Ambient timeout seconds</label><input type='number' min='30' max='3600' name='ambientTimeoutSec' value='"); s += config_->ambientTimeoutSec; s += F("'></div><div><label>Theme</label><select name='theme'>");
  for (int i = 0; i < 3; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->theme == i); s += F(">"); s += themeName((ThemeMode)i); s += F("</option>"); }
  s += F("</select></div></div><label>NOW card source</label><select name='heroMode'>");
  for (int i = 0; i < 6; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->heroMode == i); s += F(">"); s += heroModeName((HeroMode)i); s += F("</option>"); }
  s += F("</select><div class='row'>");
  for (int c = 0; c < 3; ++c) { s += F("<div><label>Home card "); s += c + 1; s += F("</label><select name='card"); s += c; s += F("'>"); for (int i = 0; i < 8; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->homeCards[c] == i); s += F(">"); s += homeCardName((HomeCard)i); s += F("</option>"); } s += F("</select></div>"); }
  s += F("</div></div>");

  s += F("<div class='card panel' id='integrations'><div class='section-head'><div><span class='eyebrow'>CONNECTED SERVICES</span><h2>Integrations</h2></div><span class='section-chip'>LOCAL + CLOUD</span></div><h3>Weather</h3><label><input type='checkbox' name='weatherEnabled'"); s += checked(config_->weatherEnabled); s += F(">Enable weather</label><label>Location</label><input name='weatherLocation' placeholder='ZIP or City, State — e.g. 29710 or Lake Wylie, SC' value='"); s += htmlEscape(config_->weatherLocation); s += F("'><p><small>Latitude/longitude are no longer required. Waveshare Home resolves the location automatically. Manual coordinates remain available below as an advanced fallback.</small></p><details><summary>Advanced: manual coordinates</summary><div class='row'><div><label>Latitude</label><input name='weatherLat' placeholder='Auto' value='"); if (fabsf(config_->weatherLatitude) > 0.0001f) s += String(config_->weatherLatitude, 5); s += F("'></div><div><label>Longitude</label><input name='weatherLon' placeholder='Auto' value='"); if (fabsf(config_->weatherLongitude) > 0.0001f) s += String(config_->weatherLongitude, 5); s += F("'></div></div></details><label><input type='checkbox' name='weatherAlerts'"); s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label><p class='status'>Weather status: "); s += htmlEscape(state_->weather.condition); s += F("</p><div class='row'><button type='submit' formaction='/weather/save'>Save weather</button><button type='submit' formaction='/weather/save' name='resolve' value='1' class='muted'>Save & resolve now</button></div><hr>");

  s += F("<h3 id='bambu'>Bambu Lab</h3>");
  s += F("<div class='card' style='margin:8px 0;background:#071015'><div class='top'><div><strong>");
  s += strlen(state_->printer.displayName) ? htmlEscape(state_->printer.displayName) : (strlen(config_->bambuHost) ? htmlEscape(config_->bambuHost) : String("No printer selected"));
  s += F("</strong><p>"); s += state_->printer.online ? "Connected via local MQTT" : (state_->printer.configured ? "Configured • waiting for MQTT" : "Not configured"); s += F("</p></div><span class='badge'>"); s += state_->printer.online ? "ONLINE" : "OFFLINE"; s += F("</span></div>");
  if (state_->printer.online) {
    s += F("<div class='grid'><div><h3>Status</h3><div class='metric'>"); s += htmlEscape(state_->printer.status); s += F("</div><p>"); s += htmlEscape(state_->printer.jobName); s += F("</p></div><div><h3>Progress</h3><div class='metric'>"); s += state_->printer.progress; s += F("%</div><p>"); s += state_->printer.remainingMinutes; s += F(" min remaining</p></div></div>");
    s += F("<p>Nozzle "); s += String(state_->printer.nozzleC,1); s += F(" / "); s += String(state_->printer.nozzleTargetC,1); s += F(" C • Bed "); s += String(state_->printer.bedC,1); s += F(" / "); s += String(state_->printer.bedTargetC,1); s += F(" C • Chamber "); s += String(state_->printer.chamberC,1); s += F(" C<br>Layer "); s += state_->printer.currentLayer; s += F(" / "); s += state_->printer.totalLayers; s += F(" • Speed "); s += state_->printer.speedPercent; s += F("% • AMS slots "); s += state_->printer.amsLoadedSlots; s += F(" • Active tray "); s += state_->printer.activeTray; s += F(" • AMS humidity "); s += state_->printer.amsHumidity; s += F("<br>Fans: part "); s += state_->printer.partFan; s += F(" • aux "); s += state_->printer.auxFan; s += F(" • chamber "); s += state_->printer.chamberFan; s += F(" • Error 0x"); s += String(state_->printer.errorCode, HEX); s += F("</p>");
  }
  if (state_->printer.online) {
    s += F("<div class='grid'>");
    for(int i=0;i<4;i++){ auto &slot=state_->printer.amsSlots[i]; s += F("<div class='card' style='margin:4px 0'><strong>AMS A"); s += i+1; s += state_->printer.activeTray==i?F(" • ACTIVE</strong>"):F("</strong>"); s += F("<p>"); if(!slot.loaded)s+=F("Empty"); else {s+=htmlEscape(slot.material); if(strlen(slot.name)){s+=F(" • ");s+=htmlEscape(slot.name);} if(slot.remainingPercent>=0){s+=F("<br>");s+=slot.remainingPercent;s+=F("% remaining");}} s+=F("</p></div>"); }
    s += F("</div><div class='grid'><button type='submit' class='muted' formaction='/bambu/pause' formmethod='post' formnovalidate>Pause</button><button type='submit' formaction='/bambu/resume' formmethod='post' formnovalidate>Resume</button><div><input name='confirm' placeholder='Type STOP to confirm'><button type='submit' class='danger' formaction='/bambu/stop' formmethod='post' formnovalidate data-confirm='Stop the active print?'>Stop print</button></div></div>");
  }
  s += F("</div><button type='submit' class='muted' formaction='/bambu/scan' formmethod='post' formnovalidate>Scan local network for Bambu printers</button>");
  s += F("<div class='card' style='margin:8px 0;background:#071015'><div class='section-head'><div><span class='eyebrow'>DISCOVERY ACTIVITY</span><h3>Bambu LAN detector</h3></div><span class='section-chip'>PASSIVE + FALLBACK</span></div>");
  s += F("<p class='status'><strong>"); s += htmlEscape(bambu_.discoveryStatus()); s += F("</strong></p>");
  s += F("<div class='grid'><div><small>UDP traffic</small><div class='metric'>"); s += bambu_.discoveryPackets(); s += F("</div><p>1900: "); s += bambu_.discoveryPackets1900(); s += F(" • 1990: "); s += bambu_.discoveryPackets1990(); s += F(" • 2021: "); s += bambu_.discoveryPackets2021(); s += F("</p></div>");
  s += F("<div><small>Bambu activity</small><div class='metric'>"); s += bambu_.discoveryMatchedPackets(); s += F("</div><p>NOTIFY: "); s += bambu_.discoveryNotifyPackets(); s += F(" • responses: "); s += bambu_.discoveryResponsePackets(); s += F(" • probes sent: "); s += bambu_.discoveryProbeSends(); s += F("</p></div></div>");
  s += F("<p><small>Listeners: "); if(bambu_.discoveryListenerMask()&0x01)s+=F("1900 "); if(bambu_.discoveryListenerMask()&0x02)s+=F("1990 "); if(bambu_.discoveryListenerMask()&0x04)s+=F("2021 "); s += F("• MQTT fallback checks "); s += bambu_.discoveryCandidateChecks(); s += F(" • hits "); s += bambu_.discoveryCandidateHits(); if(strlen(bambu_.discoveryLastRemote())){s += F("<br>Last UDP: ");s += htmlEscape(bambu_.discoveryLastRemote());s += F(" • ");s +=htmlEscape(bambu_.discoveryLastStartLine());} s += F("</small></p></div>");
  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Listening for native Bambu NOTIFY on UDP 1900 / 1990 / 2021. M-SEARCH is compatibility-only. If SSDP stays quiet, rc15 automatically sweeps the local /24 for TCP 8883 candidates without blocking the UI.</p><script>setTimeout(()=>location.reload(),2500)</script>");
  if (bambu_.discoveredCount()) { s += F("<label>Discovered printers / LAN candidates</label>"); for (uint8_t i=0;i<bambu_.discoveredCount();++i) { const auto *d=bambu_.discovered(i); if(!d) continue; s += F("<div class='card' style='margin:6px 0'><strong>"); s += htmlEscape(strlen(d->name)?d->name:d->model); if(d->candidateOnly)s+=F(" • CANDIDATE"); s += F("</strong><p>"); s += htmlEscape(d->model); s += F(" • "); s += htmlEscape(d->host); if(strlen(d->serial)){s += F("<br>Serial "); s += htmlEscape(d->serial);} else {s += F("<br>Identity not proven — enter printer serial and LAN access code after selecting.");} if(strlen(d->version)){s += F(" • FW "); s += htmlEscape(d->version);} s += F("</p><button type='submit' name='index' value='"); s += i; s += F("' formaction='/bambu/use' formmethod='post' formnovalidate>"); s += d->candidateOnly ? F("Use candidate IP") : F("Use this printer"); s += F("</button></div>"); } }
  s += F("<label><input type='checkbox' name='bambuEnabled'"); s += checked(config_->bambuEnabled); s += F(">Enable local MQTT monitoring</label><div class='row'><div><label>Printer IP / host</label><input name='bambuHost' placeholder='e.g. 10.0.0.50' value='"); s += htmlEscape(config_->bambuHost); s += F("'></div><div><label>Printer serial</label><input name='bambuSerial' placeholder='Printer serial number' value='"); s += htmlEscape(config_->bambuSerial); s += F("'></div></div><label>LAN access code</label><input type='password' name='bambuAccessCode' placeholder='Leave blank to keep saved code'><p><small>Scan is optional. Manual IP + serial + LAN access code is a fully supported fallback. Save settings before testing the MQTT connection.</small></p><div class='row'><button type='submit'>Save settings</button><button class='muted' type='submit' formaction='/bambu/test' formmethod='post'>Test saved MQTT connection</button></div><p><small>Last MQTT state: "); s += bambu_.mqttState(); s += F(" (0 means connected).</small></p><hr>");

  s += F("<h3>Filament Inventory</h3><label><input type='checkbox' name='filamentEnabled'"); s += checked(config_->filamentEnabled); s += F(">Enable cloud inventory</label><label>Sync endpoint</label><input name='filamentEndpoint' value='"); s += htmlEscape(config_->filamentEndpoint); s += F("'><div class='row'><select name='filamentProfile'><option"); s += selected(!strcmp(config_->filamentProfile, "Bill")); s += F(">Bill</option><option"); s += selected(!strcmp(config_->filamentProfile, "Aimee")); s += F(">Aimee</option></select><input type='password' name='filamentSyncKey' placeholder='Private sync key; blank keeps saved'></div><hr>");

  s += F("<h3>Home Assistant</h3><label><input type='checkbox' name='haEnabled'"); s += checked(config_->homeAssistantEnabled); s += F(">Enable Home Assistant</label><input name='haUrl' placeholder='http://homeassistant.local:8123' value='"); s += htmlEscape(config_->homeAssistantUrl); s += F("'><label>Long-lived access token</label><input type='password' name='haToken' placeholder='Blank keeps saved token'>");
  for (int i = 0; i < 4; ++i) { s += F("<div class='row'><input name='haEntity"); s += i; s += F("' placeholder='entity id' value='"); s += htmlEscape(config_->haEntityIds[i]); s += F("'><input name='haLabel"); s += i; s += F("' placeholder='label' value='"); s += htmlEscape(config_->haEntityLabels[i]); s += F("'></div>"); }
  s += F("<div class='row'><input name='haSceneId' placeholder='scene.movie_night' value='"); s += htmlEscape(config_->haSceneId); s += F("'><input name='haSceneLabel' placeholder='Scene label' value='"); s += htmlEscape(config_->haSceneLabel); s += F("'></div><div class='row'><input name='haAutomationId' placeholder='automation.example' value='"); s += htmlEscape(config_->haAutomationId); s += F("'><input name='haAutomationLabel' placeholder='Automation label' value='"); s += htmlEscape(config_->haAutomationLabel); s += F("'></div><hr>");

  s += F("<h3 id='workshop-config'>Workshop</h3><label><input type='checkbox' name='workshopEnabled'"); s += checked(config_->workshopEnabled); s += F(">Enable Workshop</label><div class='row'><label><input type='checkbox' name='workshopSensorEnabled'"); s += checked(config_->workshopSensorEnabled); s += F(">External environment sensor</label><label><input type='checkbox' name='presenceEnabled'"); s += checked(config_->presenceEnabled); s += F(">Presence-aware display</label></div><label><input type='checkbox' name='dryerEnabled'"); s += checked(config_->dryerEnabled); s += F(">Enable dryer manager</label><div class='row'><div><label>Ambient mode</label><select name='ambientMode'>");
  const char *ambientNames[]={"Auto","Clock","Printer","Workshop","Minimal"}; for(int i=0;i<5;i++){s+=F("<option value='");s+=i;s+=F("'");s+=selected((int)config_->ambientMode==i);s+=F(">");s+=ambientNames[i];s+=F("</option>");}
  s += F("</select></div><div><label>Air/filter mode</label><select name='airMode'>"); const char *airNames[]={"Off","Manual","Auto","Post-print"}; for(int i=0;i<4;i++){s+=F("<option value='");s+=i;s+=F("'");s+=selected((int)config_->airMode==i);s+=F(">");s+=airNames[i];s+=F("</option>");} s+=F("</select></div></div><div class='row'><div><label>Post-print filter minutes</label><input type='number' min='0' max='120' name='postFilterMinutes' value='");s+=config_->postPrintFilterMinutes;s+=F("'></div><div><label>Humidity alert %</label><input type='number' min='1' max='100' name='humidityAlert' value='");s+=String(config_->humidityAlert,0);s+=F("'></div></div><div class='row'><div><label>PM2.5 alert</label><input type='number' step='0.1' name='pm25Alert' value='");s+=String(config_->pm25Alert,1);s+=F("'></div><div><label>VOC alert</label><input type='number' step='1' name='vocAlert' value='");s+=String(config_->vocAlert,0);s+=F("'></div></div><hr>");

  s += F("<h3>Updates</h3><div class='row'><div><label>Mode</label><select name='updateMode'><option value='0'"); s += selected(config_->updateMode==0); s += F(">Manual</option><option value='1'"); s += selected(config_->updateMode==1); s += F(">Notify me</option><option value='2'"); s += selected(config_->updateMode==2); s += F(">Auto-install stable</option></select></div><div><label>Channel</label><select name='updateChannel'><option value='0'"); s += selected(config_->updateChannel==0); s += F(">Stable</option><option value='1'"); s += selected(config_->updateChannel==1); s += F(">Preview / RC</option></select></div></div><label>Check interval (minutes)</label><input type='number' min='15' max='1440' name='updateCheckMinutes' value='"); s += config_->updateCheckMinutes; s += F("'><p><small>Preview builds can notify and install manually. Automatic installation is intentionally limited to the stable channel.</small></p><hr>");

  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'"); s += checked(config_->calendarEnabled); s += F(">Enable ICS calendar</label><input name='calendarIcsUrl' placeholder='Private ICS URL' value='"); s += htmlEscape(config_->calendarIcsUrl); s += F("'><hr><h3>Audio</h3><label><input type='checkbox' name='audioEnabled'"); s += checked(config_->audioEnabled); s += F(">Enable ES8311 speaker</label><label>Volume</label><input type='number' min='0' max='100' name='audioVolume' value='"); s += config_->audioVolume; s += F("'><button type='submit'>Save settings</button></div></form>");

  s += F("<div class='card panel' id='workshop'><div class='section-head'><div><span class='eyebrow'>AMBIENT WORKSHOP</span><h2>Workshop status</h2></div><span class='section-chip'>LIVE STATE</span></div><div class='grid'><div><h3>Environment</h3><p>"); if(state_->workshop.environment.online){auto &e=state_->workshop.environment;s+=String(e.temperatureC,1)+" C • "+String(e.humidity,0)+"% RH<br>PM2.5 "+String(e.pm25,1)+" • VOC "+String(e.voc,0)+" • CO2 "+String(e.co2,0)+" ppm<br>Presence "+(e.presence?"yes":"no")+(e.stale?" • STALE":" • LIVE");} else s+=F("No sensor connected"); s+=F("</p></div><div><h3>Air management</h3><p>Mode "); const char *airNow[]={"Off","Manual","Auto","Post-print"};s+=airNow[(int)config_->airMode];s+=F("<br>Filter request: ");s+=state_->workshop.filterRequested?"ON":"idle";if(strlen(state_->workshop.filterReason)){s+=F("<br>");s+=htmlEscape(state_->workshop.filterReason);}s+=F("</p></div></div><div class='grid'>"); for(int i=0;i<4;i++){s+=F("<form method='post' action='/air/mode'><input type='hidden' name='mode' value='");s+=i;s+=F("'><button class='muted'>");s+=airNow[i];s+=F("</button></form>");}s+=F("</div><hr><h3>Dryer</h3><p>");if(state_->workshop.dryer.running){s+=htmlEscape(state_->workshop.dryer.material);s+=F(" • ");s+=state_->workshop.dryer.targetC;s+=F(" C • ");s+=state_->workshop.dryer.remainingSec/60UL;s+=F(" min remaining");}else s+=state_->workshop.dryer.completed?"Complete":"Idle";s+=F("</p><form method='post' action='/dryer/start'><div class='row'><input name='material' value='PETG' placeholder='Material'><input type='number' name='temperatureC' value='55' min='30' max='90'></div><label>Duration minutes</label><input type='number' name='minutes' value='360' min='1' max='1440'><button>Start dryer timer</button></form><form method='post' action='/dryer/stop'><button class='danger' data-confirm='Stop the active dryer timer?'>Stop dryer</button></form><hr><h3>External sensor ingest</h3><p><small>POST telemetry to <code>/api/sensor</code> with source, temperatureC, humidity, pm25, voc, co2 and presence.</small></p><h3>Voice / command framework</h3><p>");s+=htmlEscape(state_->voice.status);s+=F("</p><form method='post' action='/api/voice'><input name='command' placeholder='e.g. pause printer, air auto, start 5 minute timer'><button class='muted'>Run command</button></form><hr><h3>Recent activity</h3>");if(!state_->activityCount)s+=F("<p>No activity yet.</p>");else{for(int i=0;i<state_->activityCount && i<6;i++){auto &a=state_->activity[i];if(!a.valid)continue;s+=F("<p><strong>");s+=htmlEscape(a.title);s+=F("</strong><br><small>");s+=htmlEscape(a.source);if(strlen(a.detail)){s+=F(" • ");s+=htmlEscape(a.detail);}s+=F("</small></p>");}}s+=F("</div>");

  s += F("<div class='card panel' id='actions'><div class='section-head'><div><span class='eyebrow'>QUICK CONTROL</span><h2>Actions</h2></div><span class='section-chip'>SHORTCUTS</span></div><div class='grid'><form method='post' action='/audio/test'><button class='muted'>Test speaker</button></form><form method='post' action='/timer/start'><input type='hidden' name='seconds' value='300'><input type='hidden' name='label' value='5 minute timer'><button class='muted'>Start 5 min timer</button></form><form method='post' action='/ha/scene'><button class='muted'>Run configured scene</button></form><form method='post' action='/ha/automation'><button class='muted'>Trigger automation</button></form></div></div>");

  {
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
    s += F("<div class='card panel' id='ota'><div class='section-head'><div><span class='eyebrow'>FIRMWARE LIFECYCLE</span><h2>Updates & OTA</h2></div><span class='section-chip'>DUAL SLOT</span></div>");
    s += F("<p>Current firmware <strong>"); s += FW_VERSION; s += F("</strong><br>Running slot <strong>"); s += running ? running->label : "unknown"; s += F("</strong> • Next slot <strong>"); s += next ? next->label : "unavailable"; s += F("</strong>");
    if (next) { s += F(" • capacity "); s += next->size / 1024UL; s += F(" KB"); }
    s += F("</p>");
    if (!next) s += F("<p class='warn'>OTA partition unavailable. Install the merged firmware once over USB to provision the dual-slot partition table.</p>");
    s += F("<div class='section-head'><div><span class='eyebrow'>DEVICE-MANAGED OTA</span><h3>Update pipeline</h3></div><span class='pill good'>SHA-256 VERIFIED</span></div><div class='ota-flow'><span>GitHub release</span><b>→</b><span>Digest + size</span><b>→</b><span>Inactive slot</span><b>→</b><span>Boot guard</span></div><p>Status: <strong>"); s += htmlEscape(state_->system.updateStatus); s += F("</strong>"); if (strlen(state_->system.updateVersion)) { s += F(" • latest "); s += htmlEscape(state_->system.updateVersion); } if (strlen(state_->system.updateError)) { s += F("<br><span class='warn'>"); s += htmlEscape(state_->system.updateError); s += F("</span>"); } s += F("</p><div class='grid'><form method='post' action='/update/check'><button class='muted'>Check for update</button></form>"); if (state_->system.updateAvailable) { s += F("<form method='post' action='/update/install'><button>Download & install "); s += htmlEscape(state_->system.updateVersion); s += F("</button></form>"); } s += F("</div><p><small>The device downloads only the release firmware binary, verifies GitHub release size and SHA-256 digest, writes the inactive OTA slot, then reboots through the existing boot guard.</small></p>");
    s += F("<p><small>Policy: "); const char *updateModes[]={"Manual","Notify me","Auto-install stable"}; s += updateModes[config_->updateMode]; s += F(" • Channel: "); s += config_->updateChannel ? "Preview / RC" : "Stable"; s += F("</small></p>");
    s += F("<hr><div class='section-head'><div><span class='eyebrow'>MANUAL FALLBACK</span><h3>Browser firmware upload</h3></div><span class='section-chip'>RECOVERY PATH</span></div><div class='file-zone'><strong>Application firmware only</strong><small>Choose <code>WaveshareHome-firmware.bin</code>. Never use merged, bootloader or partition images here.</small></div>");
    s += F("<form id='otaForm' method='POST' action='/update' enctype='multipart/form-data'><input id='otaFile' type='file' name='firmware' accept='.bin' required><button id='otaButton' type='submit'>Install firmware</button></form><progress id='otaProgress' max='100' value='0' style='width:100%;margin-top:12px'></progress><p id='otaMessage'>");
    s += htmlEscape(state_->system.otaStatus);
    if (strlen(state_->system.otaError)) { s += F(" • "); s += htmlEscape(state_->system.otaError); }
    s += F("</p><script>(()=>{const f=document.getElementById('otaForm'),p=document.getElementById('otaProgress'),m=document.getElementById('otaMessage'),b=document.getElementById('otaButton');f.addEventListener('submit',e=>{e.preventDefault();const file=document.getElementById('otaFile').files[0];if(!file)return;if(file.name.indexOf('firmware.bin')<0){m.textContent='Use WaveshareHome-firmware.bin, not the merged image.';return;}b.disabled=true;m.textContent='Uploading '+file.name+'...';const x=new XMLHttpRequest();x.open('POST','/update');x.upload.onprogress=v=>{if(v.lengthComputable){const n=Math.round(v.loaded*100/v.total);p.value=n;m.textContent='Uploading '+n+'%';}};x.onload=()=>{m.textContent=x.responseText||('HTTP '+x.status);if(x.status>=200&&x.status<300){p.value=100;m.textContent+=' Reconnecting after restart...';setTimeout(()=>location.reload(),7000);}else b.disabled=false;};x.onerror=()=>{m.textContent='Upload connection failed. Device may still be reachable; refresh and check OTA status.';b.disabled=false;};x.send(new FormData(f));});})()</script></div>");
  }

  s += F("<div class='card panel' id='recovery'><div class='section-head'><div><span class='eyebrow'>DEVICE SAFETY</span><h2>Recovery & reset</h2></div><span class='section-chip'>GUARDED</span></div><p>Reset reason: <strong>"); s += state_->system.resetReason; s += F("</strong> • Boot attempts: "); s += state_->system.bootAttempts; s += F("</p><div class='row'><form method='post' action='/restart'><button class='muted'>Restart device</button></form><form method='post' action='/factory'><input type='hidden' name='confirm' value='ERASE'><button class='danger'>Factory reset settings</button></form></div></div>");
  s += pageFooter();
  server_.send(200, "text/html; charset=utf-8", s);
}

void WebDashboard::sendStatusJson() {
  JsonDocument doc;
  doc["firmware"] = FW_VERSION;
  doc["device"] = config_->deviceName;
  doc["network"]["connected"] = WiFi.status() == WL_CONNECTED;
  doc["network"]["ssid"] = state_->system.ssid;
  doc["network"]["ip"] = state_->system.ip;
  doc["network"]["rssi"] = state_->system.rssi;
  doc["network"]["setupAp"] = state_->system.setupApActive;
  doc["system"]["recovery"] = state_->system.recoveryMode;
  doc["system"]["stableBoot"] = state_->system.stableBoot;
  doc["system"]["resetReason"] = state_->system.resetReason;
  doc["system"]["uptimeSec"] = state_->system.uptimeSec;
  doc["system"]["freeHeap"] = state_->system.freeHeap;
  doc["system"]["freePsram"] = state_->system.freePsram;
  doc["system"]["audioReady"] = state_->system.audioReady;
  {
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
    doc["ota"]["capable"] = next != nullptr;
    doc["ota"]["runningPartition"] = running ? running->label : "unknown";
    doc["ota"]["nextPartition"] = next ? next->label : "unavailable";
    doc["ota"]["nextCapacity"] = next ? next->size : 0;
    doc["ota"]["inProgress"] = state_->system.otaInProgress;
    doc["ota"]["readyToReboot"] = state_->system.otaReadyToReboot;
    doc["ota"]["bytes"] = state_->system.otaBytes;
    doc["ota"]["total"] = state_->system.otaTotal;
    doc["ota"]["percent"] = state_->system.otaTotal ? (uint32_t)((uint64_t)state_->system.otaBytes * 100ULL / state_->system.otaTotal) : 0;
    doc["ota"]["status"] = state_->system.otaStatus;
    doc["ota"]["error"] = state_->system.otaError;
  doc["updater"]["mode"] = config_->updateMode;
  doc["updater"]["channel"] = config_->updateChannel;
  doc["updater"]["available"] = state_->system.updateAvailable;
  doc["updater"]["checkInProgress"] = state_->system.updateCheckInProgress || updateCheckRequested_;
  doc["updater"]["installQueued"] = updateInstallRequested_;
  doc["updater"]["checkInProgress"] = state_->system.updateCheckInProgress || updateCheckRequested_;
  doc["updater"]["installQueued"] = updateInstallRequested_;
  doc["updater"]["latestVersion"] = state_->system.updateVersion;
  doc["updater"]["status"] = state_->system.updateStatus;
  doc["updater"]["error"] = state_->system.updateError;
  doc["updater"]["size"] = state_->system.updateSize;
  }
  doc["weather"]["online"] = state_->weather.online;
  doc["weather"]["temperatureC"] = state_->weather.temperatureC;
  doc["weather"]["condition"] = state_->weather.condition;
  doc["weather"]["alert"] = state_->weather.severeAlert ? state_->weather.alertHeadline : "";
  doc["printer"]["configured"] = state_->printer.configured;
  doc["printer"]["online"] = state_->printer.online;
  doc["printer"]["name"] = state_->printer.displayName;
  doc["printer"]["model"] = state_->printer.model;
  doc["printer"]["host"] = config_->bambuHost;
  doc["printer"]["serial"] = config_->bambuSerial;
  doc["printer"]["status"] = state_->printer.status;
  doc["printer"]["stage"] = state_->printer.stage;
  doc["printer"]["job"] = state_->printer.jobName;
  doc["printer"]["progress"] = state_->printer.progress;
  doc["printer"]["remainingMinutes"] = state_->printer.remainingMinutes;
  doc["printer"]["nozzleC"] = state_->printer.nozzleC;
  doc["printer"]["nozzleTargetC"] = state_->printer.nozzleTargetC;
  doc["printer"]["bedC"] = state_->printer.bedC;
  doc["printer"]["bedTargetC"] = state_->printer.bedTargetC;
  doc["printer"]["chamberC"] = state_->printer.chamberC;
  doc["printer"]["layer"] = state_->printer.currentLayer;
  doc["printer"]["totalLayers"] = state_->printer.totalLayers;
  doc["printer"]["speedPercent"] = state_->printer.speedPercent;
  doc["printer"]["partFan"] = state_->printer.partFan;
  doc["printer"]["auxFan"] = state_->printer.auxFan;
  doc["printer"]["chamberFan"] = state_->printer.chamberFan;
  doc["printer"]["amsLoadedSlots"] = state_->printer.amsLoadedSlots;
  doc["printer"]["activeTray"] = state_->printer.activeTray;
  doc["printer"]["amsHumidity"] = state_->printer.amsHumidity;
  doc["printer"]["errorCode"] = state_->printer.errorCode;
  doc["printer"]["updatedMs"] = state_->printer.updatedMs;
  for(int i=0;i<4;i++){auto &slot=state_->printer.amsSlots[i];doc["printer"]["amsSlots"][i]["loaded"]=slot.loaded;doc["printer"]["amsSlots"][i]["active"]=slot.active;doc["printer"]["amsSlots"][i]["material"]=slot.material;doc["printer"]["amsSlots"][i]["name"]=slot.name;doc["printer"]["amsSlots"][i]["color"]=slot.color;doc["printer"]["amsSlots"][i]["remainingPercent"]=slot.remainingPercent;}
  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();
  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();
  doc["printerDiscovery"]["packets"] = bambu_.discoveryPackets();
  doc["printerDiscovery"]["matchedPackets"] = bambu_.discoveryMatchedPackets();
  doc["printerDiscovery"]["notifyPackets"] = bambu_.discoveryNotifyPackets();
  doc["printerDiscovery"]["responsePackets"] = bambu_.discoveryResponsePackets();
  doc["printerDiscovery"]["packetsByPort"]["1900"] = bambu_.discoveryPackets1900();
  doc["printerDiscovery"]["packetsByPort"]["1990"] = bambu_.discoveryPackets1990();
  doc["printerDiscovery"]["packetsByPort"]["2021"] = bambu_.discoveryPackets2021();
  doc["printerDiscovery"]["probeSends"] = bambu_.discoveryProbeSends();
  doc["printerDiscovery"]["listenerMask"] = bambu_.discoveryListenerMask();
  doc["printerDiscovery"]["candidateChecks"] = bambu_.discoveryCandidateChecks();
  doc["printerDiscovery"]["candidateHits"] = bambu_.discoveryCandidateHits();
  doc["printerDiscovery"]["lastRemote"] = bambu_.discoveryLastRemote();
  doc["printerDiscovery"]["lastStartLine"] = bambu_.discoveryLastStartLine();
  doc["printerDiscovery"]["status"] = bambu_.discoveryStatus();
  doc["printerDiscovery"]["mqttState"] = bambu_.mqttState();
  doc["filament"]["online"] = state_->filament.online;
  doc["filament"]["total"] = state_->filament.totalSpools;
  doc["filament"]["loaded"] = state_->filament.loadedSpools;
  doc["filament"]["low"] = state_->filament.lowSpools;
  doc["calendar"]["online"] = state_->calendar.online;
  doc["calendar"]["next"] = state_->calendar.nextTitle;
  doc["workshop"]["enabled"] = config_->workshopEnabled;
  doc["workshop"]["airMode"] = (int)config_->airMode;
  doc["workshop"]["ambientMode"] = (int)config_->ambientMode;
  doc["workshop"]["filterRequested"] = state_->workshop.filterRequested;
  doc["workshop"]["filterReason"] = state_->workshop.filterReason;
  auto &env=state_->workshop.environment; doc["workshop"]["environment"]["online"]=env.online;doc["workshop"]["environment"]["stale"]=env.stale;doc["workshop"]["environment"]["source"]=env.source;doc["workshop"]["environment"]["temperatureC"]=env.temperatureC;doc["workshop"]["environment"]["humidity"]=env.humidity;doc["workshop"]["environment"]["pm25"]=env.pm25;doc["workshop"]["environment"]["voc"]=env.voc;doc["workshop"]["environment"]["co2"]=env.co2;doc["workshop"]["environment"]["presence"]=env.presence;
  auto &dryer=state_->workshop.dryer;doc["workshop"]["dryer"]["running"]=dryer.running;doc["workshop"]["dryer"]["completed"]=dryer.completed;doc["workshop"]["dryer"]["material"]=dryer.material;doc["workshop"]["dryer"]["targetC"]=dryer.targetC;doc["workshop"]["dryer"]["remainingSec"]=dryer.remainingSec;
  doc["voice"]["microphoneAvailable"]=state_->voice.microphoneAvailable;doc["voice"]["status"]=state_->voice.status;doc["voice"]["lastCommand"]=state_->voice.lastCommand;
  for(int i=0;i<state_->activityCount;i++){auto &a=state_->activity[i];if(!a.valid)continue;doc["activity"][i]["source"]=a.source;doc["activity"][i]["title"]=a.title;doc["activity"][i]["detail"]=a.detail;doc["activity"][i]["epoch"]=(long long)a.epoch;}
  doc["alerts"] = state_->alertCount;
  String out;
  serializeJson(doc, out);
  server_.send(200, "application/json", out);
}

void WebDashboard::handleWifiSave() {
  String ssid = server_.arg("ssid");
  String password = server_.arg("password");
  if (!ssid.length()) { server_.send(400, "text/plain", "SSID required"); return; }
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  server_.send(200, "text/html", "<html><body style='font-family:sans-serif;background:#05090d;color:white;padding:24px'><h2>Connecting...</h2><p>The device is joining your Wi-Fi. This setup network may disappear. Reopen the device by its new IP or waveshare-home.local.</p></body></html>");
}

void WebDashboard::handleSettingsSave() {
  if (!config_) return;
  if (server_.hasArg("deviceName")) copyText(config_->deviceName, sizeof(config_->deviceName), server_.arg("deviceName"));
  int tz = constrain(server_.arg("timezone").toInt(), 0, (int)TIMEZONE_COUNT - 1);
  copyText(config_->timezoneId, sizeof(config_->timezoneId), TIMEZONES[tz].id);
  copyText(config_->timezonePosix, sizeof(config_->timezonePosix), TIMEZONES[tz].posix);
  config_->brightness = constrain(server_.arg("brightness").toInt(), 5, 100);
  config_->ambientBrightness = constrain(server_.arg("ambientBrightness").toInt(), 5, 60);
  config_->ambientTimeoutSec = constrain(server_.arg("ambientTimeoutSec").toInt(), 30, 3600);
  config_->theme = static_cast<ThemeMode>(parseTheme(server_.arg("theme")));
  config_->heroMode = static_cast<HeroMode>(parseHero(server_.arg("heroMode")));
  for (int i = 0; i < 3; ++i) config_->homeCards[i] = static_cast<HomeCard>(parseHomeCard(server_.arg(String("card") + i)));

  config_->weatherEnabled = server_.hasArg("weatherEnabled");
  config_->severeWeatherEnabled = server_.hasArg("weatherAlerts");
  config_->weatherLatitude = server_.arg("weatherLat").toFloat();
  config_->weatherLongitude = server_.arg("weatherLon").toFloat();
  copyText(config_->weatherLocation, sizeof(config_->weatherLocation), server_.arg("weatherLocation"));

  config_->bambuEnabled = server_.hasArg("bambuEnabled");
  copyText(config_->bambuHost, sizeof(config_->bambuHost), server_.arg("bambuHost"));
  copyText(config_->bambuSerial, sizeof(config_->bambuSerial), server_.arg("bambuSerial"));
  if (server_.arg("bambuAccessCode").length()) copyText(config_->bambuAccessCode, sizeof(config_->bambuAccessCode), server_.arg("bambuAccessCode"));

  config_->filamentEnabled = server_.hasArg("filamentEnabled");
  copyText(config_->filamentEndpoint, sizeof(config_->filamentEndpoint), server_.arg("filamentEndpoint"));
  copyText(config_->filamentProfile, sizeof(config_->filamentProfile), server_.arg("filamentProfile"));
  if (server_.arg("filamentSyncKey").length()) copyText(config_->filamentSyncKey, sizeof(config_->filamentSyncKey), server_.arg("filamentSyncKey"));

  config_->homeAssistantEnabled = server_.hasArg("haEnabled");
  copyText(config_->homeAssistantUrl, sizeof(config_->homeAssistantUrl), server_.arg("haUrl"));
  if (server_.arg("haToken").length()) copyText(config_->homeAssistantToken, sizeof(config_->homeAssistantToken), server_.arg("haToken"));
  for (int i = 0; i < 4; ++i) {
    copyText(config_->haEntityIds[i], sizeof(config_->haEntityIds[i]), server_.arg(String("haEntity") + i));
    copyText(config_->haEntityLabels[i], sizeof(config_->haEntityLabels[i]), server_.arg(String("haLabel") + i));
  }
  copyText(config_->haSceneId, sizeof(config_->haSceneId), server_.arg("haSceneId"));
  copyText(config_->haSceneLabel, sizeof(config_->haSceneLabel), server_.arg("haSceneLabel"));
  copyText(config_->haAutomationId, sizeof(config_->haAutomationId), server_.arg("haAutomationId"));
  copyText(config_->haAutomationLabel, sizeof(config_->haAutomationLabel), server_.arg("haAutomationLabel"));

  config_->calendarEnabled = server_.hasArg("calendarEnabled");
  copyText(config_->calendarIcsUrl, sizeof(config_->calendarIcsUrl), server_.arg("calendarIcsUrl"));
  config_->audioEnabled = server_.hasArg("audioEnabled");
  config_->audioVolume = constrain(server_.arg("audioVolume").toInt(), 0, 100);
  config_->workshopEnabled = server_.hasArg("workshopEnabled");
  config_->workshopSensorEnabled = server_.hasArg("workshopSensorEnabled");
  config_->presenceEnabled = server_.hasArg("presenceEnabled");
  config_->dryerEnabled = server_.hasArg("dryerEnabled");
  config_->ambientMode = static_cast<AmbientDisplayMode>(constrain(server_.arg("ambientMode").toInt(),0,4));
  config_->airMode = static_cast<AirMode>(constrain(server_.arg("airMode").toInt(),0,3));
  config_->postPrintFilterMinutes = constrain(server_.arg("postFilterMinutes").toInt(),0,120);
  config_->pm25Alert = max(0.0f,server_.arg("pm25Alert").toFloat());
  config_->vocAlert = max(0.0f,server_.arg("vocAlert").toFloat());
  config_->humidityAlert = constrain(server_.arg("humidityAlert").toFloat(),1.0f,100.0f);
  config_->updateMode = constrain(server_.arg("updateMode").toInt(),0,2);
  config_->updateChannel = constrain(server_.arg("updateChannel").toInt(),0,1);
  config_->updateCheckMinutes = constrain(server_.arg("updateCheckMinutes").toInt(),15,1440);
  config_->schemaVersion = CONFIG_SCHEMA_VERSION;
  store_.save(*config_);
  configChanged_ = true;
  server_.sendHeader("Location", "/", true);
  server_.send(303, "text/plain", "Saved");
}

bool WebDashboard::checkForSelfUpdate(bool force) {
  if (!config_ || !state_ || WiFi.status() != WL_CONNECTED) return false;
  auto &sys = state_->system;
  if (sys.updateCheckInProgress || sys.otaInProgress) return false;
  if (!force && sys.updateCheckedMs && millis() - sys.updateCheckedMs < 60000UL) return true;

  sys.updateCheckInProgress = true;
  sys.updateError[0] = '\0';
  strlcpy(sys.updateStatus, "Checking GitHub", sizeof(sys.updateStatus));

  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(9000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  const bool stableChannel = config_->updateChannel == 0;
  String api = stableChannel
    ? "https://api.github.com/repos/azmusgb/filamentinventory/releases/latest"
    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=1";
  if (!http.begin(secure, api)) {
    strlcpy(sys.updateError, "Could not open GitHub release API", sizeof(sys.updateError));
    sys.updateCheckInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  http.addHeader("Accept", "application/vnd.github+json");
  http.addHeader("Accept-Encoding", "identity");
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

  String releasePayload = http.getString();
  http.end();
  if (!releasePayload.length()) {
    strlcpy(sys.updateError, "Empty GitHub release response", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
  JsonDocument releases;
  DeserializationError err = deserializeJson(releases, releasePayload);
  if (err) {
    String e = String("GitHub JSON: ") + err.c_str();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
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

  String version = release["tag_name"] | "";
  version.replace("waveshare-v", "");
  version.replace("v", "");
  String firmwareUrl;
  String firmwareDigest;
  uint32_t firmwareSize = 0;
  for (JsonObject asset : release["assets"].as<JsonArray>()) {
    String name = asset["name"] | "";
    if (name == "WaveshareHome-firmware.bin") {
      // Use GitHub's API asset URL instead of browser_download_url. The API host
      // is already proven reachable by the release check and avoids a separate
      // github.com manifest request before OTA begins.
      firmwareUrl = asset["url"] | "";
      firmwareDigest = asset["digest"] | "";
      firmwareSize = asset["size"] | 0;
    }
  }
  if (!version.length() || !firmwareUrl.length()) {
    strlcpy(sys.updateError, "Release is missing firmware asset", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
  if (firmwareDigest.startsWith("sha256:")) firmwareDigest.remove(0, 7);
  firmwareDigest.toLowerCase();
  if (firmwareDigest.length() != 64 || firmwareSize == 0) {
    strlcpy(sys.updateError, "Firmware asset lacks GitHub SHA-256 or size", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  String sha = firmwareDigest;
  uint32_t size = firmwareSize;
  strlcpy(sys.updateVersion, version.c_str(), sizeof(sys.updateVersion));
  strlcpy(sys.updateFirmwareUrl, firmwareUrl.c_str(), sizeof(sys.updateFirmwareUrl));
  strlcpy(sys.updateSha256, sha.c_str(), sizeof(sys.updateSha256));
  sys.updateSize = size;
  sys.updateCheckedMs = millis();
  sys.updateAvailable = compareFirmwareVersions(version, String(FW_VERSION)) > 0;
  strlcpy(sys.updateStatus, sys.updateAvailable ? "Update available" : "Up to date", sizeof(sys.updateStatus));
  if (!sys.updateAvailable && compareFirmwareVersions(version, String(FW_VERSION)) < 0) strlcpy(sys.updateStatus, "Current firmware is newer", sizeof(sys.updateStatus));
  sys.updateCheckInProgress = false;
  return true;
}

bool WebDashboard::installSelfUpdate() {
  if (!state_ || WiFi.status() != WL_CONNECTED) return false;
  auto &sys = state_->system;
  if (!sys.updateAvailable || !strlen(sys.updateFirmwareUrl) || strlen(sys.updateSha256) != 64) return false;

  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  if (!next || sys.updateSize == 0 || sys.updateSize > next->size) {
    strlcpy(sys.updateError, "Update does not fit inactive OTA slot", sizeof(sys.updateError));
    return false;
  }

  // 1.0.1 deliberately separates TLS download from flash writing. On 1.0.0-rc14
  // real hardware, streaming HTTPS bytes directly into Update.write() panicked
  // the ESP32-S3. The board has 8 MB PSRAM, so stage the validated application
  // image there first, close TLS, then write the inactive OTA partition.
  uint8_t *image = static_cast<uint8_t *>(heap_caps_malloc(sys.updateSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!image) image = static_cast<uint8_t *>(malloc(sys.updateSize));
  if (!image) {
    strlcpy(sys.updateError, "Not enough memory to stage firmware", sizeof(sys.updateError));
    return false;
  }

  sys.otaInProgress = true;
  sys.otaReadyToReboot = false;
  sys.otaBytes = 0;
  sys.otaTotal = sys.updateSize;
  strlcpy(sys.otaStatus, "Downloading", sizeof(sys.otaStatus));
  sys.otaError[0] = '\0';
  sys.updateError[0] = '\0';

  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(7000);
  http.setTimeout(15000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(secure, sys.updateFirmwareUrl)) {
    strlcpy(sys.updateError, "Could not open firmware URL", sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome/1.0.1 ESP32-S3");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    String e = String("Firmware HTTP ") + code;
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    http.end();
    free(image);
    sys.otaInProgress = false;
    return false;
  }

  int length = http.getSize();
  if (length > 0 && static_cast<uint32_t>(length) != sys.updateSize) {
    strlcpy(sys.updateError, "Firmware size differs from manifest", sizeof(sys.updateError));
    http.end();
    free(image);
    sys.otaInProgress = false;
    return false;
  }

  mbedtls_sha256_context shaCtx;
  mbedtls_sha256_init(&shaCtx);
  mbedtls_sha256_starts(&shaCtx, 0);
  WiFiClient *stream = http.getStreamPtr();
  uint32_t offset = 0;
  uint32_t idleStarted = millis();
  bool ok = true;
  while (offset < sys.updateSize) {
    size_t available = stream->available();
    if (!available) {
      if (!http.connected() && offset < sys.updateSize) {
        strlcpy(sys.updateError, "Firmware download ended early", sizeof(sys.updateError));
        ok = false;
        break;
      }
      if (millis() - idleStarted > 15000UL) {
        strlcpy(sys.updateError, "Firmware download timed out", sizeof(sys.updateError));
        ok = false;
        break;
      }
      delay(2);
      esp_task_wdt_reset();
      continue;
    }
    idleStarted = millis();
    size_t want = min<size_t>(4096, min<size_t>(available, sys.updateSize - offset));
    int got = stream->readBytes(image + offset, want);
    if (got <= 0) {
      strlcpy(sys.updateError, "Firmware download read failed", sizeof(sys.updateError));
      ok = false;
      break;
    }
    mbedtls_sha256_update(&shaCtx, image + offset, got);
    offset += static_cast<uint32_t>(got);
    sys.otaBytes = offset;
    esp_task_wdt_reset();
    yield();
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&shaCtx, digest);
  mbedtls_sha256_free(&shaCtx);
  char digestHex[65];
  for (int i = 0; i < 32; ++i) sprintf(digestHex + i * 2, "%02x", digest[i]);
  digestHex[64] = '\0';
  String expected = sys.updateSha256;
  expected.toLowerCase();
  String actual = digestHex;
  actual.toLowerCase();
  if (!ok || offset != sys.updateSize || actual != expected) {
    if (ok) strlcpy(sys.updateError, "Firmware SHA-256 verification failed", sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  strlcpy(sys.otaStatus, "Writing", sizeof(sys.otaStatus));
  sys.otaBytes = 0;
  if (Update.isRunning()) Update.abort();
  Update.clearError();
  if (!Update.begin(sys.updateSize, U_FLASH)) {
    String e = String("Update.begin: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  uint32_t writtenTotal = 0;
  while (writtenTotal < sys.updateSize) {
    size_t chunk = min<size_t>(4096, sys.updateSize - writtenTotal);
    size_t written = Update.write(image + writtenTotal, chunk);
    if (written != chunk) {
      strlcpy(sys.updateError, Update.errorString(), sizeof(sys.updateError));
      Update.abort();
      free(image);
      sys.otaInProgress = false;
      strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
      return false;
    }
    writtenTotal += written;
    sys.otaBytes = writtenTotal;
    esp_task_wdt_reset();
    yield();
  }
  free(image);

  if (!Update.end(true)) {
    String e = String("Update.end: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  sys.otaInProgress = false;
  sys.otaReadyToReboot = true;
  sys.updateAvailable = false;
  strlcpy(sys.otaStatus, "Verified - restarting", sizeof(sys.otaStatus));
  strlcpy(sys.updateStatus, "Installed - restarting", sizeof(sys.updateStatus));
  return true;
}

void WebDashboard::handleUpdateUpload() {
  HTTPUpload &upload = server_.upload();
  auto failOta = [this](const char *message) {
    state_->system.otaInProgress = false;
    state_->system.otaReadyToReboot = false;
    otaUploadSucceeded_ = false;
    copyText(state_->system.otaStatus, sizeof(state_->system.otaStatus), "Failed");
    copyText(state_->system.otaError, sizeof(state_->system.otaError), message);
    Serial.printf("OTA failed: %s\n", message);
  };

  if (upload.status == UPLOAD_FILE_START) {
    otaUploadStarted_ = false;
    otaUploadSucceeded_ = false;
    state_->system.otaInProgress = true;
    state_->system.otaReadyToReboot = false;
    state_->system.otaBytes = 0;
    state_->system.otaTotal = 0;
    state_->system.otaError[0] = '\0';
    copyText(state_->system.otaStatus, sizeof(state_->system.otaStatus), "Preparing");

    if (!upload.filename.endsWith(".bin")) { failOta("Selected file is not a .bin firmware image"); return; }
    const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
    if (!next) { failOta("No inactive OTA partition. Install the merged image over USB once."); return; }

    if (Update.isRunning()) Update.abort();
    Update.clearError();
    if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) {
      String err = String("Update.begin: ") + Update.errorString();
      failOta(err.c_str());
      return;
    }
    otaUploadStarted_ = true;
    copyText(state_->system.otaStatus, sizeof(state_->system.otaStatus), "Uploading");
    Serial.printf("OTA start: %s -> %s (%u bytes capacity)\n", upload.filename.c_str(), next->label, (unsigned)next->size);
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaUploadStarted_ || Update.hasError()) return;
    esp_task_wdt_reset();
    delay(0);
    const size_t written = Update.write(upload.buf, upload.currentSize);
    esp_task_wdt_reset();
    delay(0);
    state_->system.otaBytes += written;
    if (written != upload.currentSize) {
      String err = String("Flash write: ") + Update.errorString();
      Update.abort();
      otaUploadStarted_ = false;
      failOta(err.c_str());
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    if (!otaUploadStarted_) {
      if (!strlen(state_->system.otaError)) failOta("OTA upload never started");
      return;
    }
    state_->system.otaTotal = state_->system.otaBytes;
    copyText(state_->system.otaStatus, sizeof(state_->system.otaStatus), "Validating");
    if (!state_->system.otaBytes) { Update.abort(); failOta("Firmware upload contained zero bytes"); return; }
    esp_task_wdt_reset();
    delay(0);
    if (!Update.end(true)) {
      String err = String("Validation: ") + Update.errorString();
      failOta(err.c_str());
      return;
    }
    otaUploadStarted_ = false;
    otaUploadSucceeded_ = true;
    state_->system.otaInProgress = false;
    state_->system.otaReadyToReboot = true;
    copyText(state_->system.otaStatus, sizeof(state_->system.otaStatus), "Installed");
    Serial.printf("OTA validated: %u bytes. Restart pending.\n", (unsigned)state_->system.otaBytes);
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    if (Update.isRunning()) Update.abort();
    otaUploadStarted_ = false;
    failOta("Upload aborted by browser or connection");
  }
}

void WebDashboard::handleUpdateFinished() {
  const bool ok = otaUploadSucceeded_ && state_->system.otaReadyToReboot && !Update.hasError();
  if (ok) {
    server_.send(200, "text/plain", String("Update installed successfully (firmware ") + FW_VERSION + "). Restarting in 2 seconds.");
    scheduleRestart(2000);
    return;
  }
  String error = strlen(state_->system.otaError) ? state_->system.otaError : Update.errorString();
  server_.send(500, "text/plain", String("OTA update failed: ") + error);
}

void WebDashboard::handleNotFound() {
  if (connectivity_.setupApActive()) {
    server_.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
    server_.send(302, "text/plain", "Redirecting to setup");
  } else server_.send(404, "text/plain", "Not found");
}

void WebDashboard::scheduleRestart(uint32_t delayMs) {
  rebootAfterResponse_ = true;
  rebootAtMs_ = millis() + delayMs;
}
