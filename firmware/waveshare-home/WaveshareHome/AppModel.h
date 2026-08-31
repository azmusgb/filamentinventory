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
static constexpr char FW_VERSION[] = "1.0.6";
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
};

static constexpr size_t TIMEZONE_COUNT = sizeof(TIMEZONES) / sizeof(TIMEZONES[0]);

enum class ThemeMode : uint8_t { Dark = 0, Light = 1, Auto = 2 };
enum class HeroMode : uint8_t { Auto = 0, Clock = 1, Printer = 2, Workshop = 3, Weather = 4, Minimal = 5 };
enum class HomeCard : uint8_t { Printer = 0, Filament = 1, Workshop = 2, Weather = 3, Calendar = 4, Timers = 5, HomeAssistant = 6, Activity = 7 };
enum class AirMode : uint8_t { Off = 0, Manual = 1, Auto = 2, PostPrint = 3 };
enum class AmbientDisplayMode : uint8_t { Auto = 0, Clock = 1, Printer = 2, Workshop = 3, Minimal = 4 };
enum class AlertSeverity : uint8_t { Info = 0, Attention = 1, Urgent = 2 };

enum class OperationalMode : uint8_t { Home = 0, PrintFocus = 1, WorkshopFocus = 2, Quiet = 3 };

struct AppConfig {
  uint32_t schemaVersion = CONFIG_SCHEMA_VERSION;
  char deviceName[48] = DEFAULT_DEVICE_NAME;
  char timezoneId[48] = "America/New_York";
  char timezonePosix[64] = "EST5EDT,M3.2.0/2,M11.1.0/2";
  uint8_t brightness = 82;
  uint8_t ambientBrightness = 18;
  uint16_t ambientTimeoutSec = 120;
  ThemeMode theme = ThemeMode::Dark;
  HeroMode heroMode = HeroMode::Auto;
  HomeCard homeCards[3] = {HomeCard::Printer, HomeCard::Filament, HomeCard::Workshop};

  bool weatherEnabled = false;
  float weatherLatitude = 0.0f;
  float weatherLongitude = 0.0f;
  char weatherLocation[64] = "";
  bool severeWeatherEnabled = true;

  bool bambuEnabled = false;
  char bambuHost[64] = "";
  char bambuSerial[48] = "";
  char bambuAccessCode[32] = "";

  bool filamentEnabled = false;
  char filamentEndpoint[160] = "https://filamentinventory.netlify.app/api/sync";
  char filamentProfile[32] = "Bill";
  char filamentSyncKey[64] = "";

  bool homeAssistantEnabled = false;
  char homeAssistantUrl[128] = "";
  char homeAssistantToken[192] = "";
  char haEntityIds[4][96] = {};
  char haEntityLabels[4][48] = {};
  char haSceneId[96] = "";
  char haSceneLabel[48] = "Scene";
  char haAutomationId[96] = "";
  char haAutomationLabel[48] = "Automation";

  bool calendarEnabled = false;
  char calendarIcsUrl[192] = "";

  bool audioEnabled = true;
  uint8_t audioVolume = 55;

  bool workshopEnabled = true;
  bool workshopSensorEnabled = false;
  bool presenceEnabled = false;
  bool dryerEnabled = true;
  AirMode airMode = AirMode::Auto;
  AmbientDisplayMode ambientMode = AmbientDisplayMode::Auto;
  uint16_t postPrintFilterMinutes = 15;
  float pm25Alert = 20.0f;
  float vocAlert = 250.0f;
  float humidityAlert = 45.0f;

  OperationalMode operationalMode = OperationalMode::Home;
  uint8_t updateMode = 1;
  uint8_t updateChannel = 1;
  uint16_t updateCheckMinutes = 360;
};

struct TimerState {
  bool active = false;
  bool fired = false;
  uint32_t durationSec = 0;
  uint32_t startedMs = 0;
  uint32_t endMs = 0;
  char label[32] = "Timer";
};

struct AlertItem {
  bool active = false;
  AlertSeverity severity = AlertSeverity::Info;
  char source[24] = "System";
  char title[64] = "";
  char detail[120] = "";
};

struct ActivityItem {
  char source[24] = "System";
  char title[64] = "";
  char detail[120] = "";
  time_t epoch = 0;
};

struct WeatherState {
  bool online = false;
  float temperatureC = 0;
  char condition[40] = "Not configured";
  bool severeAlert = false;
  char alertSeverity[20] = "";
  char alertHeadline[100] = "";
  uint32_t updatedMs = 0;
};

struct BambuAmsSlot {
  bool loaded = false;
  bool active = false;
  char material[20] = "";
  char name[32] = "";
  char color[12] = "";
  int remainingPercent = -1;
};

struct PrinterState {
  bool configured = false;
  bool online = false;
  bool printing = false;
  bool error = false;
  char name[48] = "";
  char model[32] = "";
  char host[64] = "";
  char serial[48] = "";
  char status[40] = "Not configured";
  char stage[64] = "";
  char job[80] = "";
  int progress = 0;
  int remainingMinutes = 0;
  float nozzleC = 0;
  float nozzleTargetC = 0;
  float bedC = 0;
  float bedTargetC = 0;
  float chamberC = 0;
  int layer = 0;
  int totalLayers = 0;
  int speedPercent = 100;
  int partFan = 0;
  int auxFan = 0;
  int chamberFan = 0;
  int amsLoadedSlots = 0;
  int activeTray = -1;
  int amsHumidity = -1;
  int errorCode = 0;
  uint32_t updatedMs = 0;
  BambuAmsSlot amsSlots[4];
};

struct PrinterDiscoveryState {
  bool running = false;
  uint8_t count = 0;
  uint32_t packets = 0;
  uint32_t matchedPackets = 0;
  uint32_t notifyPackets = 0;
  uint32_t responsePackets = 0;
  uint32_t packets1900 = 0;
  uint32_t packets1990 = 0;
  uint32_t packets2021 = 0;
  uint32_t probeSends = 0;
  uint8_t listenerMask = 0;
  uint32_t candidateChecks = 0;
  uint32_t candidateHits = 0;
  char lastRemote[48] = "";
  char lastStartLine[96] = "";
  char status[48] = "Idle";
  int mqttState = -1;
};

struct FilamentState {
  bool online = false;
  int totalSpools = 0;
  int loadedSpools = 0;
  int lowSpools = 0;
  int emptySpools = 0;
  uint32_t updatedMs = 0;
};

struct HomeAssistantEntity {
  bool online = false;
  char entityId[96] = "";
  char label[48] = "";
  char value[64] = "";
};

struct HomeAssistantState {
  bool configured = false;
  bool online = false;
  HomeAssistantEntity entities[4];
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

struct EnvironmentState {
  bool online = false;
  bool stale = true;
  char source[32] = "Not connected";
  float temperatureC = 0;
  float humidity = 0;
  float pm25 = 0;
  float voc = 0;
  float co2 = 0;
  bool presence = false;
  uint32_t updatedMs = 0;
};

struct DryerState {
  bool running = false;
  bool completed = false;
  char material[24] = "";
  float targetC = 0;
  uint32_t remainingSec = 0;
};

struct WorkshopState {
  bool enabled = true;
  AirMode airMode = AirMode::Auto;
  AmbientDisplayMode ambientMode = AmbientDisplayMode::Auto;
  bool filterRequested = false;
  char filterReason[80] = "";
  EnvironmentState environment;
  DryerState dryer;
};

struct SystemState {
  bool recoveryMode = false;
  bool stableBoot = false;
  char resetReason[32] = "Unknown";
  uint32_t uptimeSec = 0;
  uint32_t freeHeap = 0;
  uint32_t freePsram = 0;
  bool audioReady = false;

  bool otaCapable = false;
  char otaRunningPartition[16] = "";
  char otaNextPartition[16] = "";
  uint32_t otaNextCapacity = 0;
  bool otaInProgress = false;
  bool otaReadyToReboot = false;
  uint32_t otaBytes = 0;
  uint32_t otaTotal = 0;
  char otaStatus[48] = "Idle";
  char otaError[120] = "";

  bool updateAvailable = false;
  bool updateCheckInProgress = false;
  bool updateInstallQueued = false;
  char updateVersion[24] = "";
  char updateStatus[48] = "Idle";
  char updateError[120] = "";
  uint32_t updateSize = 0;
  char updateFirmwareUrl[256] = "";
  char updateSha256[72] = "";
  uint32_t updateCheckedMs = 0;
};

struct VoiceState {
  bool microphoneAvailable = false;
  char status[64] = "Microphone not configured";
  char lastCommand[80] = "";
};

struct AppState {
  SystemState system;
  WeatherState weather;
  PrinterState printer;
  PrinterDiscoveryState printerDiscovery;
  FilamentState filament;
  HomeAssistantState homeAssistant;
  CalendarState calendar;
  WorkshopState workshop;
  VoiceState voice;
  TimerState timers[4];
  AlertItem alerts[10];
  uint8_t alertCount = 0;
  ActivityItem activity[12];
  uint8_t activityCount = 0;
};
