#include "Services.h"
#include <Wire.h>
#include <math.h>
#include <esp_err.h>

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
constexpr uint32_t BAMBU_DISCOVERY_MS = 9000UL;
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
  state.system.bootCount = prefs_.getUInt("count", 0) + 1;
  prefs_.putUInt("count", state.system.bootCount);
  state.system.bootAttempts = prefs_.getUInt("attempts", 0) + 1;
  prefs_.putUInt("attempts", state.system.bootAttempts);
  copyText(state.system.resetReason, sizeof(state.system.resetReason), resetReasonText(esp_reset_reason()));
  pinMode(0, INPUT_PULLUP);
  delay(4);
  recoveryRequested_ = state.system.bootAttempts >= 3 || digitalRead(0) == LOW;
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
  if (!stableMarked_ && millis() - bootMs_ >= STABLE_BOOT_MS) markStable(state);
}

void BootGuard::markStable(AppState &state) {
  prefs_.putUInt("attempts", 0);
  stableMarked_ = true;
  state.system.stableBoot = true;
  esp_ota_mark_app_valid_cancel_rollback();
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


bool BambuPlugin::startDiscovery() {
  if (WiFi.status() != WL_CONNECTED) return false;
  discoveryUdp_.stop();
  discoveredCount_ = 0;
  for (auto &item : discovered_) item = BambuDiscoveredPrinter{};
  if (!discoveryUdp_.beginMulticast(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_PORT)) return false;
  discoveryRunning_ = true;
  discoveryStartedMs_ = millis();
  const char *probe = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:2021\r\nMAN: \"ssdp:discover\"\r\nST: urn:bambulab-com:device:3dprinter:1\r\nMX: 3\r\n\r\n";
  discoveryUdp_.beginPacketMulticast(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_PORT, WiFi.localIP());
  discoveryUdp_.write(reinterpret_cast<const uint8_t *>(probe), strlen(probe));
  discoveryUdp_.endPacket();
  return true;
}

int BambuPlugin::findDiscovered(const char *serial, const char *host) const {
  for (uint8_t i = 0; i < discoveredCount_; ++i) {
    if (serial && *serial && !strcmp(discovered_[i].serial, serial)) return i;
    if (host && *host && !strcmp(discovered_[i].host, host)) return i;
  }
  return -1;
}

void BambuPlugin::parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp) {
  auto value = [&](const char *key) -> String {
    String needle = String(key) + ":";
    int start = packet.indexOf(needle);
    if (start < 0) return String();
    start += needle.length();
    while (start < packet.length() && (packet[start] == ' ' || packet[start] == '\t')) start++;
    int end = packet.indexOf('\n', start);
    if (end < 0) end = packet.length();
    String out = packet.substring(start, end);
    out.trim();
    return out;
  };
  String serial = value("DevSerial");
  String host = value("Location");
  if (!host.length()) host = remoteIp.toString();
  host.replace("http://", ""); host.replace("https://", "");
  int slash = host.indexOf('/'); if (slash >= 0) host = host.substring(0, slash);
  int colon = host.indexOf(':'); if (colon >= 0) host = host.substring(0, colon);
  String nt = value("NT");
  if (!serial.length() && nt.indexOf("bambulab") < 0 && packet.indexOf("Bambu") < 0 && packet.indexOf("DevModel") < 0) return;
  int index = findDiscovered(serial.c_str(), host.c_str());
  if (index < 0) {
    if (discoveredCount_ >= 6) return;
    index = discoveredCount_++;
  }
  auto &d = discovered_[index];
  d.valid = true;
  copyText(d.host, sizeof(d.host), host);
  copyText(d.serial, sizeof(d.serial), serial);
  copyText(d.name, sizeof(d.name), value("DevName"));
  copyText(d.model, sizeof(d.model), value("DevModel"));
  copyText(d.version, sizeof(d.version), value("DevVersion"));
  d.signal = value("DevSignal").toInt();
  d.lastSeenMs = millis();
}

void BambuPlugin::pollDiscovery() {
  if (!discoveryRunning_) return;
  int size = discoveryUdp_.parsePacket();
  while (size > 0) {
    String packet;
    packet.reserve(size + 1);
    while (discoveryUdp_.available()) packet += static_cast<char>(discoveryUdp_.read());
    parseDiscoveryPacket(packet, discoveryUdp_.remoteIP());
    size = discoveryUdp_.parsePacket();
  }
  if (millis() - discoveryStartedMs_ >= BAMBU_DISCOVERY_MS) {
    discoveryRunning_ = false;
    discoveryUdp_.stop();
  }
}

bool BambuPlugin::useDiscovered(AppConfig &config, AppState &state, uint8_t index) {
  const BambuDiscoveredPrinter *d = discovered(index);
  if (!d || !d->valid) return false;
  copyText(config.bambuHost, sizeof(config.bambuHost), d->host);
  copyText(config.bambuSerial, sizeof(config.bambuSerial), d->serial);
  config.bambuEnabled = true;
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

void BambuPlugin::loop(AppConfig &config, AppState &state) {
  if (WiFi.status() == WL_CONNECTED) pollDiscovery();
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
      for (JsonObject tray : trays) {
        const char *type = tray["tray_type"] | "";
        const char *color = tray["tray_color"] | "";
        if (strlen(type) || strlen(color)) p.amsLoadedSlots++;
      }
      if (unit.containsKey("humidity")) p.amsHumidity = unit["humidity"] | p.amsHumidity;
    }
    String active = ams["tray_now"] | "-1";
    p.activeTray = active.toInt();
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
  int code = http.GET();
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
  s.reserve(3500);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><meta charset='utf-8'><title>");
  s += title;
  s += F("</title><style>:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}body{margin:0;background:#05090d;color:#eef5f8}.wrap{max-width:920px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.badge{padding:7px 10px;border:1px solid #23404c;border-radius:999px;color:#7ee7a7;background:#0a1712}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.card{background:#0a1218;border:1px solid #1d3440;border-radius:16px;padding:16px;margin:12px 0}h1{font-size:28px;margin:4px 0}h2{font-size:17px;margin:0 0 12px}h3{font-size:14px;color:#8fa3ad;text-transform:uppercase;letter-spacing:.08em}p,small{color:#9fb0b8}label{display:block;font-size:13px;color:#a9bbc3;margin:10px 0 5px}input,select,button{box-sizing:border-box;width:100%;padding:11px;border-radius:10px;border:1px solid #294653;background:#081117;color:#eef5f8}input[type=checkbox]{width:auto;margin-right:8px}button,.btn{display:inline-block;text-decoration:none;text-align:center;background:#173a27;border-color:#2f7950;color:#dfffea;font-weight:650;cursor:pointer}.danger{background:#36151a;border-color:#74303b}.muted{background:#101d24;border-color:#294653}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{font-size:24px;font-weight:700}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a{color:#8fcef9;text-decoration:none}.status{font-size:12px;color:#84e6a7}.warn{color:#ffc184}hr{border:0;border-top:1px solid #1a313c;margin:18px 0}@media(max-width:600px){.row{grid-template-columns:1fr}}</style></head><body><div class='wrap'>");
  return s;
}

String WebDashboard::pageFooter() {
  return F("<p><small>Waveshare Home • local device dashboard</small></p></div></body></html>");
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

void WebDashboard::loop(AppConfig &, AppState &) {
  if (started_) server_.handleClient();
  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();
}

void WebDashboard::installRoutes() {
  server_.on("/", HTTP_GET, [this]() { sendRoot(); });
  server_.on("/api/status", HTTP_GET, [this]() { sendStatusJson(); });
  server_.on("/wifi", HTTP_POST, [this]() { handleWifiSave(); });
  server_.on("/settings", HTTP_POST, [this]() { handleSettingsSave(); });
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
  server_.on("/generate_204", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/hotspot-detect.html", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/connecttest.txt", HTTP_ANY, [this]() { sendRoot(); });
  server_.on("/ncsi.txt", HTTP_ANY, [this]() { sendRoot(); });
  server_.onNotFound([this]() { handleNotFound(); });
}

void WebDashboard::sendRoot() {
  if (!config_ || !state_) return;
  String s = pageHeader("Waveshare Home");
  s.reserve(24000);
  s += F("<div class='top'><div><h1>Waveshare Home</h1><p>Command center, integrations and recovery console</p></div><span class='badge'>");
  s += WiFi.status() == WL_CONNECTED ? "ONLINE" : (connectivity_.setupApActive() ? "SETUP" : "OFFLINE");
  s += F("</span></div><div class='nav'><a href='#wifi'>Wi-Fi</a><a href='#device'>Device</a><a href='#integrations'>Integrations</a><a href='#ota'>OTA</a><a href='/api/status'>JSON status</a></div>");

  s += F("<div class='grid'><div class='card'><h3>Network</h3><div class='metric'>");
  s += WiFi.status() == WL_CONNECTED ? htmlEscape(WiFi.SSID()) : String(SETUP_AP_NAME);
  s += F("</div><p>IP "); s += state_->system.ip; s += F(" • RSSI "); s += state_->system.rssi; s += F(" dBm</p></div>");
  s += F("<div class='card'><h3>System</h3><div class='metric'>"); s += FW_VERSION; s += F("</div><p>"); s += state_->system.resetReason; s += F(" • "); s += state_->system.uptimeSec / 60; s += F(" min uptime</p></div>");
  s += F("<div class='card'><h3>Attention</h3><div class='metric'>"); s += state_->alertCount; s += F("</div><p>active alerts</p></div></div>");

  s += F("<div class='card' id='wifi'><h2>Wi-Fi management</h2>");
  if (connectivity_.setupApActive()) {
    int n = WiFi.scanNetworks(false, true);
    s += F("<p class='warn'>Setup AP is active. Select a 2.4 GHz network.</p><form method='post' action='/wifi'><label>Network</label><select name='ssid'>");
    for (int i = 0; i < n; ++i) { s += F("<option value='"); s += htmlEscape(WiFi.SSID(i)); s += F("'>"); s += htmlEscape(WiFi.SSID(i)); s += F(" ("); s += WiFi.RSSI(i); s += F(" dBm)</option>"); }
    s += F("</select><label>Password</label><input type='password' name='password' autocomplete='current-password'><button type='submit'>Connect Wi-Fi</button></form>");
  } else {
    s += F("<p>SSID <strong>"); s += htmlEscape(WiFi.SSID()); s += F("</strong><br>IP "); s += WiFi.localIP().toString(); s += F("<br>RSSI "); s += WiFi.RSSI(); s += F(" dBm</p><div class='row'><form method='post' action='/wifi/reconnect'><button>Reconnect</button></form><form method='post' action='/wifi/forget'><button class='danger'>Forget Wi-Fi</button></form></div>");
  }
  s += F("</div>");

  s += F("<form method='post' action='/settings'><div class='card' id='device'><h2>Device settings</h2><div class='row'><div><label>Device name</label><input name='deviceName' maxlength='39' value='"); s += htmlEscape(config_->deviceName); s += F("'></div><div><label>Timezone</label><select name='timezone'>");
  for (size_t i = 0; i < TIMEZONE_COUNT; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected(!strcmp(config_->timezoneId, TIMEZONES[i].id)); s += F(">"); s += TIMEZONES[i].label; s += F("</option>"); }
  s += F("</select></div></div><div class='row'><div><label>Brightness %</label><input type='number' min='5' max='100' name='brightness' value='"); s += config_->brightness; s += F("'></div><div><label>Ambient brightness %</label><input type='number' min='5' max='60' name='ambientBrightness' value='"); s += config_->ambientBrightness; s += F("'></div></div><div class='row'><div><label>Ambient timeout seconds</label><input type='number' min='30' max='3600' name='ambientTimeoutSec' value='"); s += config_->ambientTimeoutSec; s += F("'></div><div><label>Theme</label><select name='theme'>");
  for (int i = 0; i < 3; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->theme == i); s += F(">"); s += themeName((ThemeMode)i); s += F("</option>"); }
  s += F("</select></div></div><label>NOW card source</label><select name='heroMode'>");
  for (int i = 0; i < 6; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->heroMode == i); s += F(">"); s += heroModeName((HeroMode)i); s += F("</option>"); }
  s += F("</select><div class='row'>");
  for (int c = 0; c < 3; ++c) { s += F("<div><label>Home card "); s += c + 1; s += F("</label><select name='card"); s += c; s += F("'>"); for (int i = 0; i < 8; ++i) { s += F("<option value='"); s += i; s += F("'"); s += selected((int)config_->homeCards[c] == i); s += F(">"); s += homeCardName((HomeCard)i); s += F("</option>"); } s += F("</select></div>"); }
  s += F("</div></div>");

  s += F("<div class='card' id='integrations'><h2>Integrations</h2><h3>Weather</h3><label><input type='checkbox' name='weatherEnabled'"); s += checked(config_->weatherEnabled); s += F(">Enable weather</label><div class='row'><input name='weatherLocation' placeholder='Location label' value='"); s += htmlEscape(config_->weatherLocation); s += F("'><input name='weatherLat' placeholder='Latitude' value='"); s += String(config_->weatherLatitude, 5); s += F("'></div><div class='row'><input name='weatherLon' placeholder='Longitude' value='"); s += String(config_->weatherLongitude, 5); s += F("'><label><input type='checkbox' name='weatherAlerts'"); s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label></div><hr>");

  s += F("<h3 id='bambu'>Bambu Lab</h3>");
  s += F("<div class='card' style='margin:8px 0;background:#071015'><div class='top'><div><strong>");
  s += strlen(state_->printer.displayName) ? htmlEscape(state_->printer.displayName) : (strlen(config_->bambuHost) ? htmlEscape(config_->bambuHost) : String("No printer selected"));
  s += F("</strong><p>"); s += state_->printer.online ? "Connected via local MQTT" : (state_->printer.configured ? "Configured • waiting for MQTT" : "Not configured"); s += F("</p></div><span class='badge'>"); s += state_->printer.online ? "ONLINE" : "OFFLINE"; s += F("</span></div>");
  if (state_->printer.online) {
    s += F("<div class='grid'><div><h3>Status</h3><div class='metric'>"); s += htmlEscape(state_->printer.status); s += F("</div><p>"); s += htmlEscape(state_->printer.jobName); s += F("</p></div><div><h3>Progress</h3><div class='metric'>"); s += state_->printer.progress; s += F("%</div><p>"); s += state_->printer.remainingMinutes; s += F(" min remaining</p></div></div>");
    s += F("<p>Nozzle "); s += String(state_->printer.nozzleC,1); s += F(" / "); s += String(state_->printer.nozzleTargetC,1); s += F(" C • Bed "); s += String(state_->printer.bedC,1); s += F(" / "); s += String(state_->printer.bedTargetC,1); s += F(" C • Chamber "); s += String(state_->printer.chamberC,1); s += F(" C<br>Layer "); s += state_->printer.currentLayer; s += F(" / "); s += state_->printer.totalLayers; s += F(" • Speed "); s += state_->printer.speedPercent; s += F("% • AMS slots "); s += state_->printer.amsLoadedSlots; s += F(" • Active tray "); s += state_->printer.activeTray; s += F(" • AMS humidity "); s += state_->printer.amsHumidity; s += F("<br>Fans: part "); s += state_->printer.partFan; s += F(" • aux "); s += state_->printer.auxFan; s += F(" • chamber "); s += state_->printer.chamberFan; s += F(" • Error 0x"); s += String(state_->printer.errorCode, HEX); s += F("</p>");
  }
  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");
  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Scanning for Bambu SSDP announcements… refresh this page in a few seconds.</p>");
  if (bambu_.discoveredCount()) { s += F("<label>Discovered printers</label>"); for (uint8_t i=0;i<bambu_.discoveredCount();++i) { const auto *d=bambu_.discovered(i); if(!d) continue; s += F("<form method='post' action='/bambu/use' class='card' style='margin:6px 0'><input type='hidden' name='index' value='"); s += i; s += F("'><strong>"); s += htmlEscape(strlen(d->name)?d->name:d->model); s += F("</strong><p>"); s += htmlEscape(d->model); s += F(" • "); s += htmlEscape(d->host); s += F("<br>Serial "); s += htmlEscape(d->serial); if(strlen(d->version)){s += F(" • FW "); s += htmlEscape(d->version);} s += F("</p><button type='submit'>Use this printer</button></form>"); } }
  s += F("<label><input type='checkbox' name='bambuEnabled'"); s += checked(config_->bambuEnabled); s += F(">Enable local MQTT monitoring</label><div class='row'><div><label>Printer IP / host</label><input name='bambuHost' value='"); s += htmlEscape(config_->bambuHost); s += F("'></div><div><label>Printer serial</label><input name='bambuSerial' value='"); s += htmlEscape(config_->bambuSerial); s += F("'></div></div><label>LAN access code</label><input type='password' name='bambuAccessCode' placeholder='Leave blank to keep saved code'><p><small>Discovery fills IP and serial automatically. The printer's LAN access code is still required for MQTT telemetry.</small></p><hr>");

  s += F("<h3>Filament Inventory</h3><label><input type='checkbox' name='filamentEnabled'"); s += checked(config_->filamentEnabled); s += F(">Enable cloud inventory</label><label>Sync endpoint</label><input name='filamentEndpoint' value='"); s += htmlEscape(config_->filamentEndpoint); s += F("'><div class='row'><select name='filamentProfile'><option"); s += selected(!strcmp(config_->filamentProfile, "Bill")); s += F(">Bill</option><option"); s += selected(!strcmp(config_->filamentProfile, "Aimee")); s += F(">Aimee</option></select><input type='password' name='filamentSyncKey' placeholder='Private sync key; blank keeps saved'></div><hr>");

  s += F("<h3>Home Assistant</h3><label><input type='checkbox' name='haEnabled'"); s += checked(config_->homeAssistantEnabled); s += F(">Enable Home Assistant</label><input name='haUrl' placeholder='http://homeassistant.local:8123' value='"); s += htmlEscape(config_->homeAssistantUrl); s += F("'><label>Long-lived access token</label><input type='password' name='haToken' placeholder='Blank keeps saved token'>");
  for (int i = 0; i < 4; ++i) { s += F("<div class='row'><input name='haEntity"); s += i; s += F("' placeholder='entity id' value='"); s += htmlEscape(config_->haEntityIds[i]); s += F("'><input name='haLabel"); s += i; s += F("' placeholder='label' value='"); s += htmlEscape(config_->haEntityLabels[i]); s += F("'></div>"); }
  s += F("<div class='row'><input name='haSceneId' placeholder='scene.movie_night' value='"); s += htmlEscape(config_->haSceneId); s += F("'><input name='haSceneLabel' placeholder='Scene label' value='"); s += htmlEscape(config_->haSceneLabel); s += F("'></div><div class='row'><input name='haAutomationId' placeholder='automation.example' value='"); s += htmlEscape(config_->haAutomationId); s += F("'><input name='haAutomationLabel' placeholder='Automation label' value='"); s += htmlEscape(config_->haAutomationLabel); s += F("'></div><hr>");

  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'"); s += checked(config_->calendarEnabled); s += F(">Enable ICS calendar</label><input name='calendarIcsUrl' placeholder='Private ICS URL' value='"); s += htmlEscape(config_->calendarIcsUrl); s += F("'><hr><h3>Audio</h3><label><input type='checkbox' name='audioEnabled'"); s += checked(config_->audioEnabled); s += F(">Enable ES8311 speaker</label><label>Volume</label><input type='number' min='0' max='100' name='audioVolume' value='"); s += config_->audioVolume; s += F("'><button type='submit'>Save settings</button></div></form>");

  s += F("<div class='card'><h2>Actions</h2><div class='grid'><form method='post' action='/audio/test'><button class='muted'>Test speaker</button></form><form method='post' action='/timer/start'><input type='hidden' name='seconds' value='300'><input type='hidden' name='label' value='5 minute timer'><button class='muted'>Start 5 min timer</button></form><form method='post' action='/ha/scene'><button class='muted'>Run configured scene</button></form><form method='post' action='/ha/automation'><button class='muted'>Trigger automation</button></form></div></div>");

  s += F("<div class='card' id='ota'><h2>OTA firmware update</h2><p>Upload the compiled <code>WaveshareHome-firmware.bin</code>. OTA writes the inactive app partition and restarts only after validation.</p><form method='POST' action='/update' enctype='multipart/form-data'><input type='file' name='firmware' accept='.bin' required><button type='submit'>Install firmware</button></form></div>");

  s += F("<div class='card'><h2>Recovery & reset</h2><p>Reset reason: <strong>"); s += state_->system.resetReason; s += F("</strong> • Boot attempts: "); s += state_->system.bootAttempts; s += F("</p><div class='row'><form method='post' action='/restart'><button class='muted'>Restart device</button></form><form method='post' action='/factory'><input type='hidden' name='confirm' value='ERASE'><button class='danger'>Factory reset settings</button></form></div></div>");
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
  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();
  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();
  doc["filament"]["online"] = state_->filament.online;
  doc["filament"]["total"] = state_->filament.totalSpools;
  doc["filament"]["loaded"] = state_->filament.loadedSpools;
  doc["filament"]["low"] = state_->filament.lowSpools;
  doc["calendar"]["online"] = state_->calendar.online;
  doc["calendar"]["next"] = state_->calendar.nextTitle;
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
  config_->schemaVersion = CONFIG_SCHEMA_VERSION;
  store_.save(*config_);
  configChanged_ = true;
  server_.sendHeader("Location", "/", true);
  server_.send(303, "text/plain", "Saved");
}

void WebDashboard::handleUpdateUpload() {
  HTTPUpload &upload = server_.upload();
  if (upload.status == UPLOAD_FILE_START) {
    state_->system.otaInProgress = true;
    state_->system.otaBytes = 0;
    state_->system.otaTotal = upload.totalSize;
    if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) Update.printError(Serial);
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) Update.printError(Serial);
    state_->system.otaBytes += upload.currentSize;
  } else if (upload.status == UPLOAD_FILE_END) {
    if (!Update.end(true)) Update.printError(Serial);
    state_->system.otaInProgress = false;
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    state_->system.otaInProgress = false;
  }
}

void WebDashboard::handleUpdateFinished() {
  bool ok = !Update.hasError();
  server_.send(ok ? 200 : 500, "text/html", ok ? "<html><body style='font-family:sans-serif;background:#05090d;color:white;padding:24px'><h2>Update installed</h2><p>Restarting into the new firmware...</p></body></html>" : "OTA update failed");
  if (ok) scheduleRestart(1200);
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
