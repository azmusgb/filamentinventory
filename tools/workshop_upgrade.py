from pathlib import Path


def r(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"missing pattern in {path}: {old[:80]!r}")
    p.write_text(s.replace(old, new, 1))


app = "firmware/waveshare-home/WaveshareHome/AppModel.h"
r(app, 'static constexpr uint32_t CONFIG_SCHEMA_VERSION = 3;', 'static constexpr uint32_t CONFIG_SCHEMA_VERSION = 4;')
r(app, 'static constexpr char FW_VERSION[] = "1.0.0-rc3";', 'static constexpr char FW_VERSION[] = "1.0.0-rc4";')
r(app, 'enum class AlertSeverity : uint8_t { Info = 0, Attention = 1, Urgent = 2 };', '''enum class AlertSeverity : uint8_t { Info = 0, Attention = 1, Urgent = 2 };
enum class AmbientDisplayMode : uint8_t { Auto = 0, Clock = 1, Printer = 2, Workshop = 3, Minimal = 4 };
enum class AirMode : uint8_t { Off = 0, Manual = 1, Auto = 2, PostPrint = 3 };''')
r(app, '''  bool audioEnabled = true;
  uint8_t audioVolume = 55;
};''', '''  bool audioEnabled = true;
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
};''')
r(app, '''struct PrinterState {
  bool configured = false;''', '''struct AmsSlotState {
  bool loaded = false;
  bool active = false;
  char material[24] = "";
  char color[12] = "";
  char name[32] = "";
  int remainingPercent = -1;
};

struct PrinterState {
  bool configured = false;''')
r(app, '''  int amsHumidity = -1;
  uint32_t errorCode = 0;''', '''  int amsHumidity = -1;
  AmsSlotState amsSlots[4];
  uint32_t errorCode = 0;''')
r(app, 'struct SystemState {', '''struct EnvironmentState {
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

struct SystemState {''')
r(app, '''  TimerState timers[4];
  AlertItem alerts[10];''', '''  TimerState timers[4];
  WorkshopState workshop;
  VoiceState voice;
  ActivityItem activity[12];
  uint8_t activityCount = 0;
  AlertItem alerts[10];''')

h = "firmware/waveshare-home/WaveshareHome/Services.h"
r(h, '''  bool useDiscovered(AppConfig &config, AppState &state, uint8_t index);
private:''', '''  bool useDiscovered(AppConfig &config, AppState &state, uint8_t index);
  bool pausePrint();
  bool resumePrint();
  bool stopPrint();
private:''')
r(h, '''  void requestPushAll();
  void pollDiscovery();''', '''  void requestPushAll();
  bool sendPrintCommand(const char *command);
  void pollDiscovery();''')

cpp = "firmware/waveshare-home/WaveshareHome/Services.cpp"
r(cpp, '  config.audioVolume = constrain((int)(doc["audio"]["volume"] | 55), 0, 100);', '''  config.audioVolume = constrain((int)(doc["audio"]["volume"] | 55), 0, 100);
  config.workshopEnabled = doc["workshop"]["enabled"] | true;
  config.workshopSensorEnabled = doc["workshop"]["sensorEnabled"] | false;
  config.presenceEnabled = doc["workshop"]["presenceEnabled"] | false;
  config.dryerEnabled = doc["workshop"]["dryerEnabled"] | true;
  config.airMode = static_cast<AirMode>(constrain((int)(doc["workshop"]["airMode"] | 2), 0, 3));
  config.ambientMode = static_cast<AmbientDisplayMode>(constrain((int)(doc["workshop"]["ambientMode"] | 0), 0, 4));
  config.postPrintFilterMinutes = constrain((int)(doc["workshop"]["postFilterMinutes"] | 15), 0, 120);
  config.pm25Alert = doc["workshop"]["pm25Alert"] | 20.0f;
  config.vocAlert = doc["workshop"]["vocAlert"] | 250.0f;
  config.humidityAlert = doc["workshop"]["humidityAlert"] | 45.0f;''')
r(cpp, '  doc["audio"]["volume"] = config.audioVolume;', '''  doc["audio"]["volume"] = config.audioVolume;
  doc["workshop"]["enabled"] = config.workshopEnabled;
  doc["workshop"]["sensorEnabled"] = config.workshopSensorEnabled;
  doc["workshop"]["presenceEnabled"] = config.presenceEnabled;
  doc["workshop"]["dryerEnabled"] = config.dryerEnabled;
  doc["workshop"]["airMode"] = static_cast<uint8_t>(config.airMode);
  doc["workshop"]["ambientMode"] = static_cast<uint8_t>(config.ambientMode);
  doc["workshop"]["postFilterMinutes"] = config.postPrintFilterMinutes;
  doc["workshop"]["pm25Alert"] = config.pm25Alert;
  doc["workshop"]["vocAlert"] = config.vocAlert;
  doc["workshop"]["humidityAlert"] = config.humidityAlert;''')
r(cpp, '''      for (JsonObject tray : trays) {
        const char *type = tray["tray_type"] | "";
        const char *color = tray["tray_color"] | "";
        if (strlen(type) || strlen(color)) p.amsLoadedSlots++;
      }''', '''      int localIndex = 0;
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
      }''')
r(cpp, '''    p.activeTray = active.toInt();
  }''', '''    p.activeTray = active.toInt();
    for (int i = 0; i < 4; ++i) p.amsSlots[i].active = (i == p.activeTray);
  }''')
marker = '''void BambuPlugin::requestPushAll() {
  if (!config_ || !mqtt_.connected()) return;
  String requestTopic = String("device/") + config_->bambuSerial + "/request";
  const char *payload = "{\\"pushing\\":{\\"sequence_id\\":\\"0\\",\\"command\\":\\"pushall\\"}}";
  mqtt_.publish(requestTopic.c_str(), payload);
}
'''
r(cpp, marker, marker + '''
bool BambuPlugin::sendPrintCommand(const char *command) {
  if (!config_ || !mqtt_.connected() || !command || !*command) return false;
  String topic = String("device/") + config_->bambuSerial + "/request";
  String payload = String("{\\"print\\":{\\"sequence_id\\":\\"0\\",\\"command\\":\\"") + command + "\\"}}";
  return mqtt_.publish(topic.c_str(), payload.c_str());
}
bool BambuPlugin::pausePrint() { return sendPrintCommand("pause"); }
bool BambuPlugin::resumePrint() { return sendPrintCommand("resume"); }
bool BambuPlugin::stopPrint() { return sendPrintCommand("stop"); }
''')

ino = "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"
r(ino, '#include "Services.h"', '#include "Services.h"\n#include "Workshop.h"')
r(ino, 'AttentionEngine attentionEngine;\nWebDashboard webDashboard', 'AttentionEngine attentionEngine;\nWorkshopService workshopService;\nActivityEngine activityEngine;\nWebDashboard webDashboard')
r(ino, '  serviceManager.add(&weatherPlugin);serviceManager.add(&bambuPlugin);serviceManager.add(&filamentPlugin);serviceManager.add(&homeAssistantPlugin);serviceManager.add(&calendarPlugin);serviceManager.add(&timerPlugin);', '  serviceManager.add(&weatherPlugin);serviceManager.add(&bambuPlugin);serviceManager.add(&filamentPlugin);serviceManager.add(&homeAssistantPlugin);serviceManager.add(&calendarPlugin);serviceManager.add(&timerPlugin);\n  workshopService.begin(config,state);')
r(ino, '  if(!state.system.recoveryMode)serviceManager.loop(config,state);', '  if(!state.system.recoveryMode)serviceManager.loop(config,state);\n  workshopService.loop(config,state); activityEngine.loop(state);\n  if(config.presenceEnabled && state.workshop.environment.presence){lastInteractionMs=millis(); if(ambientMode)wakeFromAmbient();}')
r(ino, 'if(!state.system.recoveryMode)serviceManager.configChanged(config,state);lastUiRefreshMs=0;', 'if(!state.system.recoveryMode)serviceManager.configChanged(config,state);workshopService.begin(config,state);lastUiRefreshMs=0;')

print("Workshop phase-one migration applied")
