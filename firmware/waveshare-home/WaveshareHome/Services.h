#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <ESP_I2S.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <es8311.h>
#include "AppModel.h"

// The application owns the shared state object. Weather's inline location resolver
// updates its configuration state after converting a ZIP or City, State query to
// coordinates. This keeps the existing service ABI intact for OTA upgrades.
extern AppState state;

class ConfigStore {
public:
  bool begin();
  bool load(AppConfig &config);
  bool save(const AppConfig &config);
  void factoryReset();
private:
  Preferences prefs_;
};

class BootGuard {
public:
  bool begin(AppState &state);
  void loop(AppState &state);
  void markStable(AppState &state);
  bool recoveryRequested() const { return recoveryRequested_; }
private:
  Preferences prefs_;
  bool recoveryRequested_ = false;
  bool stableMarked_ = false;
  uint32_t bootMs_ = 0;
};

class ConnectivityService {
public:
  void begin(AppConfig &config, AppState &state);
  void loop(AppConfig &config, AppState &state);
  void reconnect();
  void forget();
  void startSetupAp(AppState &state);
  void stopSetupAp(AppState &state);
  bool setupApActive() const { return setupApActive_; }
  DNSServer &dns() { return dns_; }
private:
  DNSServer dns_;
  bool setupApActive_ = false;
  uint32_t connectStartedMs_ = 0;
  wl_status_t lastStatus_ = WL_NO_SHIELD;
};

class AudioService {
public:
  bool begin(const AppConfig &config, AppState &state);
  void setVolume(uint8_t volume);
  void chirp(uint16_t frequency = 880, uint16_t durationMs = 90);
  void alarm();
  bool ready() const { return ready_; }
private:
  I2SClass i2s_;
  es8311_handle_t handle_ = nullptr;
  bool ready_ = false;
  uint8_t volume_ = 55;
};

class ServicePlugin {
public:
  virtual ~ServicePlugin() = default;
  virtual const char *name() const = 0;
  virtual bool enabled(const AppConfig &config) const = 0;
  virtual void begin(AppConfig &config, AppState &state) = 0;
  virtual void loop(AppConfig &config, AppState &state) = 0;
  virtual void onConfigChanged(AppConfig &config, AppState &state) { begin(config, state); }
};

class WeatherPlugin : public ServicePlugin {
public:
  const char *name() const override { return "Weather"; }

  bool enabled(const AppConfig &config) const override {
    if (!config.weatherEnabled) return false;

    // Existing coordinate-based configuration remains fully supported.
    if (hasCoordinates(config)) {
      state.weather.configured = true;
      return true;
    }

    // New preferred path: resolve either a ZIP or "City, State" entered in
    // weatherLocation. Resolution only runs when connected and is throttled so
    // a temporary geocoding outage cannot hammer the public endpoint.
    if (!strlen(config.weatherLocation)) {
      state.weather.configured = false;
      strlcpy(state.weather.condition, "Enter ZIP or City, State", sizeof(state.weather.condition));
      return true;
    }

    if (WiFi.status() != WL_CONNECTED) return true;
    const uint32_t now = millis();
    if (!locationResolveAttempted_ || now - lastLocationResolveMs_ >= LOCATION_RETRY_MS) {
      locationResolveAttempted_ = true;
      lastLocationResolveMs_ = now;
      AppConfig &mutableConfig = const_cast<AppConfig &>(config);
      if (resolveLocation(mutableConfig)) {
        state.weather.configured = true;
        strlcpy(state.weather.condition, "Location resolved", sizeof(state.weather.condition));
      } else {
        state.weather.configured = false;
        strlcpy(state.weather.condition, "Location lookup failed", sizeof(state.weather.condition));
      }
    }
    return true;
  }

  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;

private:
  static constexpr uint32_t LOCATION_RETRY_MS = 15UL * 60UL * 1000UL;
  mutable uint32_t lastLocationResolveMs_ = 0;
  mutable bool locationResolveAttempted_ = false;
  uint32_t lastFetchMs_ = 0;
  uint32_t lastAlertFetchMs_ = 0;

  static bool hasCoordinates(const AppConfig &config) {
    return fabsf(config.weatherLatitude) > 0.0001f || fabsf(config.weatherLongitude) > 0.0001f;
  }

  static String urlEncode(const char *value) {
    String encoded;
    if (!value) return encoded;
    const char *hex = "0123456789ABCDEF";
    while (*value) {
      const uint8_t c = static_cast<uint8_t>(*value++);
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
        encoded += static_cast<char>(c);
      } else if (c == ' ') {
        encoded += "%20";
      } else {
        encoded += '%';
        encoded += hex[(c >> 4) & 0x0F];
        encoded += hex[c & 0x0F];
      }
    }
    return encoded;
  }

  static bool resolveLocation(AppConfig &config) {
    if (!strlen(config.weatherLocation) || WiFi.status() != WL_CONNECTED) return false;

    // Nominatim handles both US ZIP codes and City, State searches, so the
    // device can use one deterministic resolver while keeping manual lat/lon
    // available as an advanced fallback.
    String url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=";
    url += urlEncode(config.weatherLocation);

    WiFiClientSecure secure;
    secure.setInsecure();
    HTTPClient http;
    http.setConnectTimeout(5000);
    http.setTimeout(7000);
    if (!http.begin(secure, url)) return false;
    http.addHeader("User-Agent", "WaveshareHome/1.0 ESP32 weather location resolver");
    http.addHeader("Accept", "application/json");

    const int code = http.GET();
    if (code != HTTP_CODE_OK) {
      http.end();
      return false;
    }

    JsonDocument doc;
    const DeserializationError error = deserializeJson(doc, http.getStream());
    if (error || !doc.is<JsonArray>() || doc.as<JsonArray>().size() == 0) {
      http.end();
      return false;
    }

    JsonObject result = doc[0].as<JsonObject>();
    const char *lat = result["lat"] | "";
    const char *lon = result["lon"] | "";
    if (!strlen(lat) || !strlen(lon)) {
      http.end();
      return false;
    }

    const float resolvedLat = String(lat).toFloat();
    const float resolvedLon = String(lon).toFloat();
    if (fabsf(resolvedLat) < 0.0001f && fabsf(resolvedLon) < 0.0001f) {
      http.end();
      return false;
    }

    config.weatherLatitude = resolvedLat;
    config.weatherLongitude = resolvedLon;
    http.end();
    return true;
  }

  void fetchWeather(AppConfig &config, AppState &state);
  void fetchAlerts(AppConfig &config, AppState &state);
};

class BambuPlugin : public ServicePlugin {
public:
  BambuPlugin();
  const char *name() const override { return "Bambu"; }
  bool enabled(const AppConfig &config) const override { return config.bambuEnabled || discoveryRunning_; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
  void onConfigChanged(AppConfig &config, AppState &state) override;
  bool startDiscovery();
  bool discoveryRunning() const { return discoveryRunning_; }
  uint8_t discoveredCount() const { return discoveredCount_; }
  const BambuDiscoveredPrinter *discovered(uint8_t index) const { return index < discoveredCount_ ? &discovered_[index] : nullptr; }
  bool useDiscovered(AppConfig &config, AppState &state, uint8_t index);
  bool pausePrint();
  bool resumePrint();
  bool stopPrint();
  bool testConnection();
  uint32_t discoveryPackets() const { return discoveryPackets_; }
  uint32_t discoveryMatchedPackets() const { return discoveryMatchedPackets_; }
  const char *discoveryStatus() const { return discoveryStatus_; }
  int mqttState() { return mqtt_.state(); }
private:
  WiFiClientSecure tls_;
  PubSubClient mqtt_;
  WiFiUDP discoveryUdp_;
  AppConfig *config_ = nullptr;
  AppState *state_ = nullptr;
  uint32_t lastConnectAttemptMs_ = 0;
  uint32_t reconnectBackoffMs_ = 5000;
  bool discoveryRunning_ = false;
  uint32_t discoveryStartedMs_ = 0;
  uint32_t lastDiscoveryProbeMs_ = 0;
  uint32_t discoveryPackets_ = 0;
  uint32_t discoveryMatchedPackets_ = 0;
  char discoveryStatus_[96] = "Idle";
  BambuDiscoveredPrinter discovered_[6];
  uint8_t discoveredCount_ = 0;
  static BambuPlugin *instance_;
  static void callbackStatic(char *topic, byte *payload, unsigned int length);
  void callback(char *topic, byte *payload, unsigned int length);
  bool connectMqtt();
  void requestPushAll();
  bool sendPrintCommand(const char *command);
  void sendDiscoveryProbe();
  void pollDiscovery();
  void parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp);
  int findDiscovered(const char *serial, const char *host) const;
};

class FilamentPlugin : public ServicePlugin {
public:
  const char *name() const override { return "Filament"; }
  bool enabled(const AppConfig &config) const override { return config.filamentEnabled; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
private:
  uint32_t lastFetchMs_ = 0;
  void fetch(AppConfig &config, AppState &state);
};

class HomeAssistantPlugin : public ServicePlugin {
public:
  const char *name() const override { return "Home Assistant"; }
  bool enabled(const AppConfig &config) const override { return config.homeAssistantEnabled; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
  bool callScene(const AppConfig &config);
  bool callAutomation(const AppConfig &config);
private:
  uint32_t lastFetchMs_ = 0;
  void fetch(AppConfig &config, AppState &state);
  bool postService(const AppConfig &config, const char *domain, const char *service, const char *entityId);
};

class CalendarPlugin : public ServicePlugin {
public:
  const char *name() const override { return "Calendar"; }
  bool enabled(const AppConfig &config) const override { return config.calendarEnabled; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
private:
  uint32_t lastFetchMs_ = 0;
  void fetch(AppConfig &config, AppState &state);
  time_t parseIcsDate(const String &value);
};

class TimerPlugin : public ServicePlugin {
public:
  explicit TimerPlugin(AudioService &audio) : audio_(audio) {}
  const char *name() const override { return "Timers"; }
  bool enabled(const AppConfig &) const override { return true; }
  void begin(AppConfig &, AppState &) override {}
  void loop(AppConfig &config, AppState &state) override;
  int start(AppState &state, uint32_t seconds, const char *label = "Timer");
  void cancel(AppState &state, int index);
private:
  AudioService &audio_;
};

class ServiceManager {
public:
  void add(ServicePlugin *plugin);
  void begin(AppConfig &config, AppState &state);
  void loop(AppConfig &config, AppState &state);
  void configChanged(AppConfig &config, AppState &state);
private:
  ServicePlugin *plugins_[10] = {nullptr};
  uint8_t count_ = 0;
};

class AttentionEngine {
public:
  void update(const AppConfig &config, AppState &state);
private:
  void add(AppState &state, AlertSeverity severity, const char *source, const char *title, const char *detail);
};

class WebDashboard {
public:
  WebDashboard(ConfigStore &store, ConnectivityService &connectivity, AudioService &audio,
               TimerPlugin &timers, HomeAssistantPlugin &homeAssistant, BambuPlugin &bambu);
  void begin(AppConfig &config, AppState &state);
  void loop(AppConfig &config, AppState &state);
  bool configChanged() const { return configChanged_; }
  void clearConfigChanged() { configChanged_ = false; }
private:
  WebServer server_;
  ConfigStore &store_;
  ConnectivityService &connectivity_;
  AudioService &audio_;
  TimerPlugin &timers_;
  HomeAssistantPlugin &homeAssistant_;
  BambuPlugin &bambu_;
  AppConfig *config_ = nullptr;
  AppState *state_ = nullptr;
  bool started_ = false;
  bool configChanged_ = false;
  bool rebootAfterResponse_ = false;
  uint32_t rebootAtMs_ = 0;
  bool otaUploadStarted_ = false;
  bool otaUploadSucceeded_ = false;
  uint32_t lastSelfUpdateCheckMs_ = 0;
  bool selfUpdateInitialCheckDone_ = false;

  void installRoutes();
  void sendRoot();
  void sendStatusJson();
  void handleWifiSave();
  void handleSettingsSave();
  void handleUpdateUpload();
  void handleUpdateFinished();
  bool checkForSelfUpdate(bool force = false);
  bool installSelfUpdate();
  void handleNotFound();
  String pageHeader(const char *title);
  String pageFooter();
  String htmlEscape(const String &value);
  String checked(bool value);
  String selected(bool value);
  void scheduleRestart(uint32_t delayMs = 900);
};
