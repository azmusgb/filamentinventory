#pragma once

#include <Arduino.h>

// Arduino-ESP32 does not expose GNU timegm(). This UTC conversion is based on
// the proleptic Gregorian civil-date algorithm and does not mutate the process TZ.
inline time_t waveshareTimegm(struct tm *tmv) {
  int y = tmv->tm_year + 1900;
  unsigned m = static_cast<unsigned>(tmv->tm_mon + 1);
  unsigned d = static_cast<unsigned>(tmv->tm_mday);
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned mp = m > 2 ? m - 3 : m + 9;
  const unsigned doy = (153 * mp + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const int64_t days = static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(doe) - 719468;
  return static_cast<time_t>(days * 86400LL + tmv->tm_hour * 3600LL + tmv->tm_min * 60LL + tmv->tm_sec);
}
#ifndef timegm
#define timegm waveshareTimegm
#endif

static constexpr uint32_t CONFIG_SCHEMA_VERSION = 4;
static constexpr char FW_VERSION[] = "1.0.1";
static constexpr char DEFAULT_DEVICE_NAME[] = "Waveshare Home";
static constexpr char SETUP_AP_NAME[] = "WaveshareHome-Setup";

struct TimezoneEntry {
  const char *id;
  const char *label;
  const char *posix;
};

static constexpr TimezoneEntry TIMEZONES[] = {
  {"UTC", "UTC", "UTC0"},
  {"America/New_York", "US Eastern", "EST5EDT,M3.2.0/2,M11.1.0/2"},
  {"America/Chicago", "US Central", "CST6CDT,M3.2.0/2,M11.1.0/2"},
  {"America/Denver", "US Mountain", "MST7MDT,M3.2.0/2,M11.1.0/2"},
  {"America/Phoenix", "Arizona", "MST7"},
  {"America/Los_Angeles", "US Pacific", "PST8PDT,M3.2.0/2,M11.1.0/2"},
  {"America/Anchorage", "Alaska", "AKST9AKDT,M3.2.0/2,M11.1.0/2"},
  {"Pacific/Honolulu", "Hawaii", "HST10"},
  {"Europe/London", "London", "GMT0BST,M3.5.0/1,M10.5.0/2"},
  {"Europe/Berlin", "Central Europe", "CET-1CEST,M3.5.0/2,M10.5.0/3"},
  {"Australia/Sydney", "Sydney", "AEST-10AEDT,M10.1.0/2,M4.1.0/3"},
};
static constexpr size_t TIMEZONE_COUNT = sizeof(TIMEZONES) / sizeof(TIMEZONES[0]);

enum class ThemeMode : uint8_t { Midnight = 0, Oled = 1, HighContrast = 2 };
enum class HeroMode : uint8_t { Auto = 0, Printer = 1, Weather = 2, Calendar = 3, Filament = 4, System = 5 };
enum class HomeCard : uint8_t { Controls = 0, Today = 1, Printer = 2, Filament = 3, Weather = 4, System = 5, Timers = 6, Attention = 7 };
enum class AlertSeverity : uint8_t { Info = 0, Attention = 1, Urgent = 2 };
enum class AmbientDisplayMode : uint8_t { Auto = 0, Clock = 1, Printer = 2, Workshop = 3, Minimal = 4 };
enum class AirMode : uint8_t { Off = 0, Manual = 1, Auto = 2, PostPrint = 3 };

struct AppConfig {
  uint32_t schemaVersion = CONFIG_SCHEMA_VERSION;
  char deviceName[40] = "Waveshare Home";
  char timezoneId[32] = "America/New_York";
  char timezonePosix[80] = "EST5EDT,M3.2.0/2,M11.1.0/2";
  uint8_t brightness = 82;
  uint8_t ambientBrightness = 18;
  uint16_t ambientTimeoutSec = 120;
  ThemeMode theme = ThemeMode::Midnight;
  HeroMode heroMode = HeroMode::Auto;
  HomeCard homeCards[3] = {HomeCard::Controls, HomeCard::Today, HomeCard::System};

  bool weatherEnabled = false;
  float weatherLatitude = 0.0f;
  float weatherLongitude = 0.0f;
  char weatherLocation[48] = "";
  bool severeWeatherEnabled = true;

  bool bambuEnabled = false;
  char bambuHost[64] = "";
  char bambuSerial[40] = "";
  char bambuAccessCode[40] = "";

  bool filamentEnabled = false;
  char filamentEndpoint[160] = "https://filamentinventory.netlify.app/api/sync";
  char filamentProfile[12] = "Bill";
  char filamentSyncKey[132] = "";

  bool homeAssistantEnabled = false;
  char homeAssistantUrl[160] = "";
  char homeAssistantToken[256] = "";
  char haEntityIds[4][80] = {{0}};
  char haEntityLabels[4][40] = {{0}};
  char haSceneId[80] = "";
  char haSceneLabel[40] = "Scene";
  char haAutomationId[80] = "";
  char haAutomationLabel[40] = "Automation";

  bool calendarEnabled = false;
  char calendarIcsUrl[256] = "";

  bool audioEnabled = true;
  uint8_t audioVolume = 55;
  bool workshopEnabled = true;
  bool workshopSensorEnabled = false;
  bool presenceEnabled = false;
  bool dryerEnabled = true;
  AirMode airMode = AirMode::Auto;
  AmbientDisplayMode ambientMode = AmbientDisplayMode::Auto;
  uint8_t postPrintFilterMinutes = 15;
  float pm25Alert = 20.0f;
  float vocAlert = 250.0f;
  float humidityAlert = 45.0f;

  // 0=manual, 1=notify, 2=auto-install stable. Preview channel is never auto-installed.
  uint8_t updateMode = 1;
  uint8_t updateChannel = 1; // 0=stable, 1=preview/RC
  uint16_t updateCheckMinutes = 360;
};

struct WeatherState {
  bool configured = false;
  bool online = false;
  float temperatureC = 0;
  float apparentC = 0;
  float highC = 0;
  float lowC = 0;
  int precipitationPercent = 0;
  int weatherCode = -1;
  char condition[32] = "Not configured";
  bool severeAlert = false;
  char alertSeverity[20] = "";
  char alertHeadline[120] = "";
  uint32_t updatedMs = 0;
};

struct BambuDiscoveredPrinter {
  bool valid = false;
  bool candidateOnly = false;
  char name[48] = "";
  char model[32] = "";
  char host[24] = "";
  char serial[40] = "";
  char version[32] = "";
  int signal = 0;
  uint32_t lastSeenMs = 0;
};

struct AmsSlotState {
  bool loaded = false;
  bool active = false;
  char material[24] = "";
  char color[12] = "";
  char name[32] = "";
  int remainingPercent = -1;
};

struct PrinterState {
  bool configured = false;
  bool online = false;
  bool printing = false;
  bool error = false;
  char status[28] = "Not configured";
  char stage[40] = "";
  char jobName[80] = "";
  char displayName[48] = "";
  char model[32] = "";
  char firmware[32] = "";
  char host[24] = "";
  char serial[40] = "";
  uint8_t progress = 0;
  int remainingMinutes = 0;
  float nozzleC = 0;
  float nozzleTargetC = 0;
  float bedC = 0;
  float bedTargetC = 0;
  float chamberC = 0;
  int currentLayer = 0;
  int totalLayers = 0;
  int speedLevel = 0;
  int speedPercent = 100;
  int partFan = 0;
  int auxFan = 0;
  int chamberFan = 0;
  int wifiSignal = 0;
  int amsLoadedSlots = 0;
  int activeTray = -1;
  int amsHumidity = -1;
  AmsSlotState amsSlots[4];
  uint32_t errorCode = 0;
  uint32_t updatedMs = 0;
  uint32_t connectedMs = 0;
};

struct FilamentState {
  bool configured = false;
  bool online = false;
  int totalSpools = 0;
  int loadedSpools = 0;
  int lowSpools = 0;
  int emptySpools = 0;
  int unknownSpools = 0;
  char profile[12] = "Bill";
  char updatedAt[40] = "";
  uint32_t updatedMs = 0;
};

struct HomeAssistantEntityState {
  bool configured = false;
  bool online = false;
  char entityId[80] = "";
  char label[40] = "";
  char value[40] = "";
};

struct HomeAssistantState {
  bool configured = false;
  bool online = false;
  HomeAssistantEntityState entities[4];
  uint32_t updatedMs = 0;
};

struct CalendarState {
  bool configured = false;
  bool online = false;
  bool hasNext = false;
  char nextTitle[96] = "No upcoming event";
  char nextWhen[48] = "";
  time_t nextEpoch = 0;
  uint32_t updatedMs = 0;
};

struct TimerState {
  bool active = false;
  bool fired = false;
  char label[32] = "Timer";
  uint32_t durationSec = 0;
  uint32_t startedMs = 0;
  uint32_t endMs = 0;
};

struct AlertItem {
  bool active = false;
  AlertSeverity severity = AlertSeverity::Info;
  char source[24] = "System";
  char title[64] = "";
  char detail[120] = "";
};

struct EnvironmentState {
  bool online = false;
  bool stale = true;
  bool presence = false;
  float temperatureC = 0;
  float humidity = 0;
  float pm25 = 0;
  float voc = 0;
  float co2 = 0;
  char source[32] = "Not connected";
  uint32_t updatedMs = 0;
};

struct DryerState {
  bool running = false;
  bool completed = false;
  char material[32] = "";
  uint16_t targetC = 0;
  uint32_t durationSec = 0;
  uint32_t remainingSec = 0;
  uint32_t startedMs = 0;
};

struct WorkshopState {
  bool enabled = true;
  bool sensorConfigured = false;
  bool presenceConfigured = false;
  bool dryerConfigured = true;
  bool filterRequested = false;
  AirMode airMode = AirMode::Auto;
  uint32_t postFilterUntilMs = 0;
  char filterReason[64] = "";
  EnvironmentState environment;
  DryerState dryer;
};

struct ActivityItem {
  bool valid = false;
  time_t epoch = 0;
  uint32_t ms = 0;
  char source[24] = "";
  char title[64] = "";
  char detail[96] = "";
};

struct VoiceState {
  bool microphoneAvailable = false;
  bool listening = false;
  char lastCommand[64] = "";
  char status[48] = "Microphone not configured";
};

struct SystemState {
  bool recoveryMode = false;
  bool stableBoot = false;
  bool setupApActive = false;
  bool webReady = false;
  bool otaInProgress = false;
  bool otaReadyToReboot = false;
  bool audioReady = false;
  char otaStatus[32] = "Idle";
  char otaError[96] = "";
  uint32_t bootAttempts = 0;
  uint32_t bootCount = 0;
  char resetReason[32] = "Unknown";
  char ip[24] = "Offline";
  char ssid[40] = "";
  int rssi = 0;
  uint32_t freeHeap = 0;
  uint32_t freePsram = 0;
  uint32_t uptimeSec = 0;
  uint32_t watchdogFeeds = 0;
  uint32_t otaBytes = 0;
  uint32_t otaTotal = 0;

  bool updateAvailable = false;
  bool updateCheckInProgress = false;
  char updateVersion[32] = "";
  char updateStatus[48] = "Not checked";
  char updateError[120] = "";
  char updateFirmwareUrl[320] = "";
  char updateSha256[65] = "";
  uint32_t updateSize = 0;
  uint32_t updateCheckedMs = 0;
};

struct AppState {
  WeatherState weather;
  PrinterState printer;
  FilamentState filament;
  HomeAssistantState homeAssistant;
  CalendarState calendar;
  TimerState timers[4];
  WorkshopState workshop;
  VoiceState voice;
  ActivityItem activity[12];
  uint8_t activityCount = 0;
  AlertItem alerts[10];
  uint8_t alertCount = 0;
  SystemState system;
};

inline const char *heroModeName(HeroMode mode) {
  switch (mode) {
    case HeroMode::Printer: return "Printer";
    case HeroMode::Weather: return "Weather";
    case HeroMode::Calendar: return "Calendar";
    case HeroMode::Filament: return "Filament";
    case HeroMode::System: return "System";
    default: return "Auto";
  }
}

inline const char *themeName(ThemeMode mode) {
  switch (mode) {
    case ThemeMode::Oled: return "OLED Black";
    case ThemeMode::HighContrast: return "High Contrast";
    default: return "Midnight";
  }
}

inline const char *homeCardName(HomeCard card) {
  switch (card) {
    case HomeCard::Controls: return "Controls";
    case HomeCard::Today: return "Today";
    case HomeCard::Printer: return "Printer";
    case HomeCard::Filament: return "Filament";
    case HomeCard::Weather: return "Weather";
    case HomeCard::System: return "System";
    case HomeCard::Timers: return "Timers";
    case HomeCard::Attention: return "Attention";
    default: return "System";
  }
}
