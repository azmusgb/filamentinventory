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
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <es8311.h>
#include "AppModel.h"

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
  bool enabled(const AppConfig &config) const override { return config.weatherEnabled; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
private:
  uint32_t lastFetchMs_ = 0;
  uint32_t lastAlertFetchMs_ = 0;
  void fetchWeather(AppConfig &config, AppState &state);
  void fetchAlerts(AppConfig &config, AppState &state);
};

class BambuPlugin : public ServicePlugin {
public:
  BambuPlugin();
  const char *name() const override { return "Bambu"; }
  bool enabled(const AppConfig &config) const override { return config.bambuEnabled; }
  void begin(AppConfig &config, AppState &state) override;
  void loop(AppConfig &config, AppState &state) override;
  void onConfigChanged(AppConfig &config, AppState &state) override;
private:
  WiFiClientSecure tls_;
  PubSubClient mqtt_;
  AppConfig *config_ = nullptr;
  AppState *state_ = nullptr;
  uint32_t lastConnectAttemptMs_ = 0;
  uint32_t reconnectBackoffMs_ = 5000;
  static BambuPlugin *instance_;
  static void callbackStatic(char *topic, byte *payload, unsigned int length);
  void callback(char *topic, byte *payload, unsigned int length);
  bool connectMqtt();
  void requestPushAll();
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
               TimerPlugin &timers, HomeAssistantPlugin &homeAssistant);
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
  AppConfig *config_ = nullptr;
  AppState *state_ = nullptr;
  bool started_ = false;
  bool configChanged_ = false;
  bool rebootAfterResponse_ = false;
  uint32_t rebootAtMs_ = 0;

  void installRoutes();
  void sendRoot();
  void sendStatusJson();
  void handleWifiSave();
  void handleSettingsSave();
  void handleUpdateUpload();
  void handleUpdateFinished();
  void handleNotFound();
  String pageHeader(const char *title);
  String pageFooter();
  String htmlEscape(const String &value);
  String checked(bool value);
  String selected(bool value);
  void scheduleRestart(uint32_t delayMs = 900);
};
