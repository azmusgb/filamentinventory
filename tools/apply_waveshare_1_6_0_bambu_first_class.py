from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
HDR = ROOT / "firmware/waveshare-home/WaveshareHome/Services.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
INO = ROOT / "firmware/waveshare-home/WaveshareHome/WaveshareHome.ino"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_block(text: str, start: str, end: str, replacement: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"{label}: start marker not found")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:i] + replacement + text[j:]


# ---------------------------------------------------------------------------
# AppModel.h — richer, explicit printer state + multi-AMS telemetry
# ---------------------------------------------------------------------------
app = APP.read_text()
app = replace_once(app, 'static constexpr char FW_VERSION[] = "1.5.0";',
                   'static constexpr char FW_VERSION[] = "1.6.0";', 'firmware version')
app = replace_once(
    app,
    'enum class AirMode : uint8_t { Off = 0, Manual = 1, Auto = 2, PostPrint = 3 };',
    '''enum class AirMode : uint8_t { Off = 0, Manual = 1, Auto = 2, PostPrint = 3 };
enum class PrinterActivity : uint8_t { Unknown = 0, Offline = 1, Idle = 2, Preparing = 3, Printing = 4, Paused = 5, Finished = 6, Failed = 7 };

inline const char *printerActivityName(PrinterActivity activity) {
  switch (activity) {
    case PrinterActivity::Offline: return "OFFLINE";
    case PrinterActivity::Idle: return "READY";
    case PrinterActivity::Preparing: return "PREPARING";
    case PrinterActivity::Printing: return "PRINTING";
    case PrinterActivity::Paused: return "PAUSED";
    case PrinterActivity::Finished: return "COMPLETE";
    case PrinterActivity::Failed: return "ERROR";
    default: return "UNKNOWN";
  }
}''',
    'printer activity enum')

old_ams = '''struct AmsSlotState {
  bool loaded = false;
  bool active = false;
  char material[24] = "";
  char color[12] = "";
  char name[32] = "";
  int remainingPercent = -1;
};'''
new_ams = '''struct AmsSlotState {
  bool loaded = false;
  bool active = false;
  uint8_t unitIndex = 0;
  uint8_t trayIndex = 0;
  char material[24] = "";
  char color[16] = "";
  char name[32] = "";
  int remainingPercent = -1;
};'''
app = replace_once(app, old_ams, new_ams, 'AMS slot model')

old_printer = '''struct PrinterState {
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
};'''
new_printer = '''struct PrinterState {
  bool configured = false;
  bool online = false;
  bool printing = false;
  bool paused = false;
  bool finished = false;
  bool failed = false;
  bool error = false;
  bool telemetryStale = true;
  PrinterActivity activity = PrinterActivity::Unknown;
  char status[28] = "Not configured";
  char connectionStatus[64] = "Not configured";
  char stage[40] = "";
  char jobName[80] = "";
  char displayName[48] = "";
  char model[32] = "";
  char firmware[32] = "";
  char host[24] = "";
  char serial[40] = "";
  char lastCommand[24] = "";
  char lastCommandResult[64] = "";
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
  uint8_t amsUnitCount = 0;
  uint8_t amsSlotCount = 0;
  int activeTray = -1;
  int amsHumidity = -1;
  AmsSlotState amsSlots[16];
  uint32_t errorCode = 0;
  uint32_t updatedMs = 0;
  uint32_t connectedMs = 0;
  uint32_t lastPushAllMs = 0;
  uint32_t lastCommandMs = 0;
  uint32_t telemetryMessages = 0;
  uint32_t reconnectCount = 0;
};'''
app = replace_once(app, old_printer, new_printer, 'printer state model')
APP.write_text(app)


# ---------------------------------------------------------------------------
# Services.h — telemetry freshness and command sequencing policy
# ---------------------------------------------------------------------------
hdr = HDR.read_text()
hdr = replace_once(
    hdr,
    '  uint32_t reconnectBackoffMs_ = 5000;',
    '''  uint32_t reconnectBackoffMs_ = 5000;
  uint32_t sequenceId_ = 1;
  static constexpr uint32_t TELEMETRY_STALE_MS = 30000UL;
  static constexpr uint32_t TELEMETRY_RECONNECT_MS = 90000UL;
  static constexpr uint32_t PUSHALL_REFRESH_MS = 20000UL;''',
    'Bambu reliability fields')
HDR.write_text(hdr)


# ---------------------------------------------------------------------------
# Services.cpp — reliable MQTT lifecycle, richer state, multi-AMS, commands
# ---------------------------------------------------------------------------
cpp = CPP.read_text()
cpp = replace_once(
    cpp,
    '  mqtt_.setKeepAlive(30);',
    '  mqtt_.setKeepAlive(30);\n  mqtt_.setSocketTimeout(5);',
    'MQTT socket timeout')

bambu_impl = r'''void BambuPlugin::begin(AppConfig &config, AppState &state) {
  config_ = &config;
  state_ = &state;
  state.printer.configured = config.bambuEnabled && strlen(config.bambuHost) && strlen(config.bambuSerial) && strlen(config.bambuAccessCode);
  state.printer.telemetryStale = true;
  if (!state.printer.configured) {
    state.printer.online = false;
    state.printer.activity = PrinterActivity::Unknown;
    copyText(state.printer.status, sizeof(state.printer.status), "Not configured");
    copyText(state.printer.connectionStatus, sizeof(state.printer.connectionStatus), "Not configured");
  } else {
    copyText(state.printer.connectionStatus, sizeof(state.printer.connectionStatus), "Configured - connecting");
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
  if (!config.bambuEnabled || !state.printer.configured) return;

  PrinterState &p = state.printer;
  const uint32_t now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    p.online = false;
    p.telemetryStale = true;
    p.activity = PrinterActivity::Offline;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "Wi-Fi offline");
    return;
  }

  if (!mqtt_.connected()) {
    p.online = false;
    p.telemetryStale = true;
    p.activity = PrinterActivity::Offline;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "MQTT reconnecting");
    if (lastConnectAttemptMs_ == 0 || now - lastConnectAttemptMs_ >= reconnectBackoffMs_) {
      lastConnectAttemptMs_ = now;
      if (connectMqtt()) reconnectBackoffMs_ = 5000;
      else reconnectBackoffMs_ = min<uint32_t>(60000, reconnectBackoffMs_ * 2);
    }
    return;
  }

  p.online = true;
  mqtt_.loop();

  if (!p.updatedMs) {
    p.telemetryStale = true;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "MQTT connected - waiting for telemetry");
    if (!p.lastPushAllMs || now - p.lastPushAllMs >= PUSHALL_REFRESH_MS) requestPushAll();
    return;
  }

  const uint32_t age = now - p.updatedMs;
  if (age > TELEMETRY_RECONNECT_MS) {
    p.telemetryStale = true;
    p.online = false;
    p.activity = PrinterActivity::Offline;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "Telemetry timed out - reconnecting");
    mqtt_.disconnect();
    lastConnectAttemptMs_ = 0;
    return;
  }

  if (age > TELEMETRY_STALE_MS) {
    p.telemetryStale = true;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "Telemetry stale - refreshing");
    if (!p.lastPushAllMs || now - p.lastPushAllMs >= PUSHALL_REFRESH_MS) requestPushAll();
  } else {
    p.telemetryStale = false;
    copyText(p.connectionStatus, sizeof(p.connectionStatus), "Live local MQTT telemetry");
  }
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

  // Command responses and telemetry share the report topic. Capture command
  // results without falsely treating an acknowledgement as fresh telemetry.
  String responseCommand = print["command"] | "";
  String responseResult = print["result"] | "";
  if (responseCommand.length() && responseResult.length() && strlen(p.lastCommand) &&
      !responseCommand.compareTo(p.lastCommand)) {
    copyText(p.lastCommandResult, sizeof(p.lastCommandResult), responseResult);
  }

  const bool telemetryPayload = print.containsKey("gcode_state") || print.containsKey("mc_percent") ||
                                print.containsKey("mc_remaining_time") || print.containsKey("nozzle_temper") ||
                                print.containsKey("bed_temper") || print.containsKey("layer_num") ||
                                print.containsKey("ams") || print.containsKey("print_error");
  if (!telemetryPayload) return;

  String status = print["gcode_state"] | p.status;
  copyText(p.status, sizeof(p.status), status);
  String upper = status;
  upper.toUpperCase();

  if (upper == "RUNNING" || upper == "PRINTING") p.activity = PrinterActivity::Printing;
  else if (upper == "PREPARE" || upper == "PREPARING") p.activity = PrinterActivity::Preparing;
  else if (upper == "PAUSE" || upper == "PAUSED") p.activity = PrinterActivity::Paused;
  else if (upper == "FINISH" || upper == "FINISHED" || upper == "COMPLETE" || upper == "COMPLETED") p.activity = PrinterActivity::Finished;
  else if (upper == "FAILED" || upper == "ERROR") p.activity = PrinterActivity::Failed;
  else if (upper == "IDLE" || upper == "READY") p.activity = PrinterActivity::Idle;
  else if (p.activity == PrinterActivity::Offline || p.activity == PrinterActivity::Unknown) p.activity = PrinterActivity::Idle;

  p.printing = p.activity == PrinterActivity::Printing || p.activity == PrinterActivity::Preparing;
  p.paused = p.activity == PrinterActivity::Paused;
  p.finished = p.activity == PrinterActivity::Finished;
  p.progress = constrain((int)(print["mc_percent"] | p.progress), 0, 100);
  p.remainingMinutes = max(0, (int)(print["mc_remaining_time"] | p.remainingMinutes));
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
  p.currentLayer = max(0, (int)(print["layer_num"] | p.currentLayer));
  p.totalLayers = max(0, (int)(print["total_layer_num"] | p.totalLayers));
  String job = print["subtask_name"] | p.jobName;
  if (job.length()) copyText(p.jobName, sizeof(p.jobName), job);
  p.errorCode = print["print_error"] | p.errorCode;
  p.error = p.errorCode != 0;
  if (p.error) p.activity = PrinterActivity::Failed;
  p.failed = p.activity == PrinterActivity::Failed || p.error;
  p.printing = p.activity == PrinterActivity::Printing || p.activity == PrinterActivity::Preparing;
  p.paused = p.activity == PrinterActivity::Paused;
  p.finished = p.activity == PrinterActivity::Finished;

  JsonObject ams = print["ams"].as<JsonObject>();
  if (!ams.isNull()) {
    for (auto &slot : p.amsSlots) slot = AmsSlotState{};
    p.amsLoadedSlots = 0;
    p.amsUnitCount = 0;
    p.amsSlotCount = 0;
    p.amsHumidity = -1;

    JsonArray units = ams["ams"].as<JsonArray>();
    int unitIndex = 0;
    for (JsonObject unit : units) {
      if (unitIndex >= 4) break;
      JsonArray trays = unit["tray"].as<JsonArray>();
      int localIndex = 0;
      for (JsonObject tray : trays) {
        if (localIndex >= 4) break;
        const int idx = unitIndex * 4 + localIndex;
        auto &slot = p.amsSlots[idx];
        slot.unitIndex = static_cast<uint8_t>(unitIndex);
        slot.trayIndex = static_cast<uint8_t>(localIndex);
        const char *type = tray["tray_type"] | "";
        const char *color = tray["tray_color"] | "";
        slot.loaded = strlen(type) || strlen(color);
        copyText(slot.material, sizeof(slot.material), type);
        copyText(slot.color, sizeof(slot.color), color);
        copyText(slot.name, sizeof(slot.name), tray["tray_sub_brands"] | "");
        if (!tray["remain"].isNull()) slot.remainingPercent = constrain((int)(tray["remain"] | -1), -1, 100);
        if (slot.loaded) p.amsLoadedSlots++;
        p.amsSlotCount = max<uint8_t>(p.amsSlotCount, static_cast<uint8_t>(idx + 1));
        localIndex++;
      }
      if (p.amsHumidity < 0 && unit.containsKey("humidity")) p.amsHumidity = unit["humidity"] | -1;
      unitIndex++;
    }
    p.amsUnitCount = static_cast<uint8_t>(unitIndex);

    String active = ams["tray_now"] | "-1";
    p.activeTray = active.toInt();
    for (int i = 0; i < 16; ++i) p.amsSlots[i].active = (i == p.activeTray);
  }

  if (p.connectedMs == 0) p.connectedMs = millis();
  p.updatedMs = millis();
  p.telemetryMessages++;
  p.telemetryStale = false;
  copyText(p.connectionStatus, sizeof(p.connectionStatus), "Live local MQTT telemetry");
}

bool BambuPlugin::connectMqtt() {
  if (!config_ || !state_) return false;
  uint64_t chip = ESP.getEfuseMac();
  char clientId[40];
  snprintf(clientId, sizeof(clientId), "WaveshareHome-%04X", (uint16_t)(chip & 0xFFFF));
  if (!mqtt_.connect(clientId, "bblp", config_->bambuAccessCode)) {
    state_->printer.online = false;
    state_->printer.telemetryStale = true;
    copyText(state_->printer.connectionStatus, sizeof(state_->printer.connectionStatus), "MQTT connection failed");
    return false;
  }
  String reportTopic = String("device/") + config_->bambuSerial + "/report";
  if (!mqtt_.subscribe(reportTopic.c_str())) {
    copyText(state_->printer.connectionStatus, sizeof(state_->printer.connectionStatus), "MQTT subscribe failed");
    mqtt_.disconnect();
    state_->printer.online = false;
    return false;
  }
  state_->printer.online = true;
  state_->printer.telemetryStale = true;
  state_->printer.connectedMs = millis();
  state_->printer.reconnectCount++;
  copyText(state_->printer.host, sizeof(state_->printer.host), config_->bambuHost);
  copyText(state_->printer.serial, sizeof(state_->printer.serial), config_->bambuSerial);
  copyText(state_->printer.connectionStatus, sizeof(state_->printer.connectionStatus), "MQTT connected - requesting telemetry");
  requestPushAll();
  return true;
}

void BambuPlugin::requestPushAll() {
  if (!config_ || !state_ || !mqtt_.connected()) return;
  String requestTopic = String("device/") + config_->bambuSerial + "/request";
  const uint32_t seq = sequenceId_++;
  char payload[128];
  snprintf(payload, sizeof(payload), "{\"pushing\":{\"sequence_id\":\"%lu\",\"command\":\"pushall\"}}", (unsigned long)seq);
  if (mqtt_.publish(requestTopic.c_str(), payload)) state_->printer.lastPushAllMs = millis();
}

bool BambuPlugin::sendPrintCommand(const char *command) {
  if (!config_ || !state_ || !command || !*command) return false;
  PrinterState &p = state_->printer;
  copyText(p.lastCommand, sizeof(p.lastCommand), command);
  p.lastCommandMs = millis();
  if (!mqtt_.connected()) {
    copyText(p.lastCommandResult, sizeof(p.lastCommandResult), "Not sent - printer MQTT offline");
    return false;
  }

  String topic = String("device/") + config_->bambuSerial + "/request";
  const uint32_t seq = sequenceId_++;
  char payload[144];
  snprintf(payload, sizeof(payload), "{\"print\":{\"sequence_id\":\"%lu\",\"command\":\"%s\"}}", (unsigned long)seq, command);
  const bool sent = mqtt_.publish(topic.c_str(), payload);
  copyText(p.lastCommandResult, sizeof(p.lastCommandResult), sent ? "Sent - awaiting printer state" : "MQTT publish failed");
  if (sent) requestPushAll();
  return sent;
}

bool BambuPlugin::pausePrint() { return sendPrintCommand("pause"); }
bool BambuPlugin::resumePrint() { return sendPrintCommand("resume"); }
bool BambuPlugin::stopPrint() { return sendPrintCommand("stop"); }
bool BambuPlugin::testConnection() {
  if (!config_ || !state_ || WiFi.status() != WL_CONNECTED || !state_->printer.configured) return false;
  if (mqtt_.connected()) {
    requestPushAll();
    return true;
  }
  return connectMqtt();
}

'''
cpp = replace_block(cpp, 'void BambuPlugin::begin(AppConfig &config, AppState &state) {',
                    '// ---------- Filament Inventory ----------', bambu_impl,
                    'Bambu implementation')

old_attention = '''  if (config.bambuEnabled && state.printer.error) add(state, AlertSeverity::Urgent, "Printer", "Printer error", "The Bambu printer is reporting an active error.");
  else if (config.bambuEnabled && state.printer.configured && !state.printer.online) add(state, AlertSeverity::Attention, "Printer", "Printer offline", "Local MQTT connection is unavailable.");'''
new_attention = '''  if (config.bambuEnabled && (state.printer.error || state.printer.failed)) add(state, AlertSeverity::Urgent, "Printer", "Printer error", "The Bambu printer is reporting an active failure or error.");
  else if (config.bambuEnabled && state.printer.configured && !state.printer.online) add(state, AlertSeverity::Attention, "Printer", "Printer offline", state.printer.connectionStatus);
  else if (config.bambuEnabled && state.printer.online && state.printer.telemetryStale) add(state, AlertSeverity::Attention, "Printer", "Printer telemetry stale", state.printer.connectionStatus);'''
cpp = replace_once(cpp, old_attention, new_attention, 'printer attention rules')

old_json_start = '''  doc["printer"]["configured"] = state_->printer.configured;
  doc["printer"]["online"] = state_->printer.online;
  doc["printer"]["printing"] = state_->printer.printing;'''
new_json_start = '''  doc["printer"]["configured"] = state_->printer.configured;
  doc["printer"]["online"] = state_->printer.online;
  doc["printer"]["printing"] = state_->printer.printing;
  doc["printer"]["paused"] = state_->printer.paused;
  doc["printer"]["finished"] = state_->printer.finished;
  doc["printer"]["failed"] = state_->printer.failed;
  doc["printer"]["activity"] = printerActivityName(state_->printer.activity);
  doc["printer"]["telemetryStale"] = state_->printer.telemetryStale;
  doc["printer"]["connectionStatus"] = state_->printer.connectionStatus;
  doc["printer"]["telemetryAgeMs"] = state_->printer.updatedMs ? millis() - state_->printer.updatedMs : 0;
  doc["printer"]["telemetryMessages"] = state_->printer.telemetryMessages;
  doc["printer"]["reconnectCount"] = state_->printer.reconnectCount;
  doc["printer"]["lastCommand"] = state_->printer.lastCommand;
  doc["printer"]["lastCommandResult"] = state_->printer.lastCommandResult;'''
cpp = replace_once(cpp, old_json_start, new_json_start, 'printer JSON health')
cpp = replace_once(
    cpp,
    '''  doc["printer"]["amsLoadedSlots"] = state_->printer.amsLoadedSlots;
  doc["printer"]["activeTray"] = state_->printer.activeTray;''',
    '''  doc["printer"]["amsLoadedSlots"] = state_->printer.amsLoadedSlots;
  doc["printer"]["amsUnitCount"] = state_->printer.amsUnitCount;
  doc["printer"]["amsSlotCount"] = state_->printer.amsSlotCount;
  doc["printer"]["activeTray"] = state_->printer.activeTray;''',
    'printer JSON AMS counts')
cpp = replace_once(
    cpp,
    '  for(int i=0;i<4;i++){auto &slot=state_->printer.amsSlots[i];doc["printer"]["amsSlots"][i]["loaded"]=slot.loaded;doc["printer"]["amsSlots"][i]["active"]=slot.active;doc["printer"]["amsSlots"][i]["material"]=slot.material;doc["printer"]["amsSlots"][i]["name"]=slot.name;doc["printer"]["amsSlots"][i]["color"]=slot.color;doc["printer"]["amsSlots"][i]["remainingPercent"]=slot.remainingPercent;}',
    '  for(int i=0;i<16;i++){auto &slot=state_->printer.amsSlots[i];doc["printer"]["amsSlots"][i]["unit"]=slot.unitIndex;doc["printer"]["amsSlots"][i]["tray"]=slot.trayIndex;doc["printer"]["amsSlots"][i]["loaded"]=slot.loaded;doc["printer"]["amsSlots"][i]["active"]=slot.active;doc["printer"]["amsSlots"][i]["material"]=slot.material;doc["printer"]["amsSlots"][i]["name"]=slot.name;doc["printer"]["amsSlots"][i]["color"]=slot.color;doc["printer"]["amsSlots"][i]["remainingPercent"]=slot.remainingPercent;}',
    'printer JSON AMS slots')

old_web_status = '''  s += F("</strong><p>"); s += state_->printer.online ? "Connected via local MQTT" : (state_->printer.configured ? "Configured • waiting for MQTT" : "Not configured"); s += F("</p></div><span class='badge'>"); s += state_->printer.online ? "ONLINE" : "OFFLINE"; s += F("</span></div>");'''
new_web_status = '''  s += F("</strong><p>"); s += state_->printer.configured ? htmlEscape(state_->printer.connectionStatus) : String("Not configured"); s += F("</p></div><span class='badge'>"); s += state_->printer.online ? (state_->printer.telemetryStale ? "STALE" : "LIVE") : "OFFLINE"; s += F("</span></div>");'''
cpp = replace_once(cpp, old_web_status, new_web_status, 'web printer connection state')

old_ams_web = '''    for(int i=0;i<4;i++){ auto &slot=state_->printer.amsSlots[i]; s += F("<div class='card' style='margin:4px 0'><strong>AMS A"); s += i+1; s += state_->printer.activeTray==i?F(" • ACTIVE</strong>"):F("</strong>"); s += F("<p>"); if(!slot.loaded)s+=F("Empty"); else {s+=htmlEscape(slot.material); if(strlen(slot.name)){s+=F(" • ");s+=htmlEscape(slot.name);} if(slot.remainingPercent>=0){s+=F("<br>");s+=slot.remainingPercent;s+=F("% remaining");}} s+=F("</p></div>"); }'''
new_ams_web = '''    int visibleAmsSlots = state_->printer.amsSlotCount ? min(16, (int)state_->printer.amsSlotCount) : 4;
    for(int i=0;i<visibleAmsSlots;i++){ auto &slot=state_->printer.amsSlots[i]; s += F("<div class='card' style='margin:4px 0'><strong>AMS "); s += slot.unitIndex+1; s += F("."); s += slot.trayIndex+1; s += (state_->printer.activeTray==i||slot.active)?F(" • ACTIVE</strong>"):F("</strong>"); s += F("<p>"); if(!slot.loaded)s+=F("Empty"); else {s+=htmlEscape(slot.material); if(strlen(slot.name)){s+=F(" • ");s+=htmlEscape(slot.name);} if(slot.remainingPercent>=0){s+=F("<br>");s+=slot.remainingPercent;s+=F("% remaining");}} s+=F("</p></div>"); }'''
cpp = replace_once(cpp, old_ams_web, new_ams_web, 'web multi-AMS rendering')

web_detail_anchor = '''    s += F("<p>Nozzle "); s += String(state_->printer.nozzleC,1);'''
web_detail_new = '''    s += F("<p><strong>"); s += printerActivityName(state_->printer.activity); s += F("</strong> • "); s += htmlEscape(state_->printer.connectionStatus); if(strlen(state_->printer.lastCommand)){s += F("<br>Last command: ");s += htmlEscape(state_->printer.lastCommand);s += F(" • ");s += htmlEscape(state_->printer.lastCommandResult);} s += F("</p>");
    s += F("<p>Nozzle "); s += String(state_->printer.nozzleC,1);'''
cpp = replace_once(cpp, web_detail_anchor, web_detail_new, 'web printer activity detail')
CPP.write_text(cpp)


# ---------------------------------------------------------------------------
# WaveshareHome.ino — touchscreen behavior mirrors the richer printer model
# ---------------------------------------------------------------------------
ino = INO.read_text()
new_refresh = r'''static void refreshPrinter() {
  if (!printerStateLabel || !printerJobLabel || !printerProgressLabel || !printerProgressBar) return;

  const bool enabled = config.bambuEnabled;
  const bool online = state.printer.online;
  const bool live = online && !state.printer.telemetryStale;
  const bool printing = live && state.printer.printing;
  const bool paused = live && state.printer.paused;
  const char *name = strlen(state.printer.displayName) ? state.printer.displayName : (strlen(state.printer.model) ? state.printer.model : "Bambu printer");

  String activity = !enabled ? "SETUP" : !online ? "OFFLINE" : state.printer.telemetryStale ? "STALE" : printerActivityName(state.printer.activity);
  String stateLine = String(name) + " • " + activity;
  lv_label_set_text(printerStateLabel, stateLine.c_str());
  lv_obj_set_style_text_color(printerStateLabel,
      state.printer.error || state.printer.failed ? C_RED :
      state.printer.telemetryStale ? C_ORANGE :
      printing ? C_GREEN : paused ? C_ORANGE : online ? C_BLUE : C_MUTED, 0);

  String job;
  if (!enabled) job = "Connect Bambu from web dashboard";
  else if (!online) job = state.printer.connectionStatus;
  else if (state.printer.telemetryStale) job = String(state.printer.connectionStatus) + "\nLast known: " + (strlen(state.printer.jobName) ? state.printer.jobName : state.printer.status);
  else if (strlen(state.printer.jobName)) job = state.printer.jobName;
  else job = state.printer.finished ? "Print complete" : "Ready for the next print";
  lv_label_set_text(printerJobLabel, job.c_str());

  char progress[16]; snprintf(progress, sizeof(progress), "%u%%", online ? state.printer.progress : 0);
  lv_label_set_text(printerProgressLabel, progress);
  String remaining;
  if (printing) remaining = formatMinutes(state.printer.remainingMinutes) + " remaining";
  else if (paused) remaining = String("Paused • ") + formatMinutes(state.printer.remainingMinutes) + " remaining";
  else if (live && state.printer.finished) remaining = "Print complete";
  else remaining = enabled ? String(state.printer.connectionStatus) : String("Not connected");
  lv_label_set_text(printerRemainingLabel, remaining.c_str());
  lv_bar_set_value(printerProgressBar, online ? state.printer.progress : 0, LV_ANIM_ON);

  char layer[96];
  if (online && state.printer.totalLayers > 0) snprintf(layer, sizeof(layer), "Layer %d / %d • Speed %d%%", state.printer.currentLayer, state.printer.totalLayers, state.printer.speedPercent);
  else snprintf(layer, sizeof(layer), "%s", enabled ? state.printer.connectionStatus : "Scan or configure a printer to begin");
  lv_label_set_text(printerLayerLabel, layer);

  char temp[32];
  if (online) snprintf(temp, sizeof(temp), "%.0f° / %.0f°", state.printer.nozzleC, state.printer.nozzleTargetC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerNozzleLabel, temp);
  if (online) snprintf(temp, sizeof(temp), "%.0f° / %.0f°", state.printer.bedC, state.printer.bedTargetC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerBedLabel, temp);
  if (online) snprintf(temp, sizeof(temp), "%.0f°", state.printer.chamberC); else snprintf(temp, sizeof(temp), "--°");
  lv_label_set_text(printerChamberLabel, temp);

  if (printerPauseButton) { if (printing) lv_obj_clear_state(printerPauseButton, LV_STATE_DISABLED); else lv_obj_add_state(printerPauseButton, LV_STATE_DISABLED); }
  if (printerResumeButton) { if (paused) lv_obj_clear_state(printerResumeButton, LV_STATE_DISABLED); else lv_obj_add_state(printerResumeButton, LV_STATE_DISABLED); }
  if (printerStopButton) { if (printing || paused) lv_obj_clear_state(printerStopButton, LV_STATE_DISABLED); else lv_obj_add_state(printerStopButton, LV_STATE_DISABLED); }

  // The 3.5-inch panel has four physical AMS tiles. If the active filament is
  // on AMS 2-4, pivot those four tiles to the active AMS unit rather than always
  // showing only AMS 1. The web API exposes all sixteen slots simultaneously.
  int amsBase = (state.printer.activeTray >= 4 && state.printer.activeTray < 16) ? (state.printer.activeTray / 4) * 4 : 0;
  for (int i = 0; i < 4; ++i) {
    if (!printerAmsLabels[i] || !printerAmsPanels[i]) continue;
    const int idx = amsBase + i;
    auto &slot = state.printer.amsSlots[idx];
    String text = String(slot.unitIndex + 1) + "." + String(slot.trayIndex + 1) + "\n";
    if (!online || idx >= state.printer.amsSlotCount || !slot.loaded) text += "Empty";
    else {
      text += strlen(slot.material) ? slot.material : "Loaded";
      if (slot.remainingPercent >= 0) text += " " + String(slot.remainingPercent) + "%";
    }
    lv_label_set_text(printerAmsLabels[i], text.c_str());
    const bool active = online && (state.printer.activeTray == idx || slot.active);
    lv_obj_set_style_border_color(printerAmsPanels[i], active ? C_GREEN : C_BORDER, 0);
    lv_obj_set_style_border_width(printerAmsPanels[i], active ? 2 : 1, 0);
    lv_obj_set_style_text_color(printerAmsLabels[i], active ? C_TEXT : C_MUTED, 0);
  }
}

'''
ino = replace_block(ino, 'static void refreshPrinter() {', 'static void refreshFilament() {', new_refresh, 'touchscreen printer refresh')
INO.write_text(ino)


# ---------------------------------------------------------------------------
# Final fail-fast validation
# ---------------------------------------------------------------------------
checks = {
    APP: ['FW_VERSION[] = "1.6.0"', 'PrinterActivity::Paused', 'AmsSlotState amsSlots[16]', 'telemetryStale'],
    HDR: ['TELEMETRY_STALE_MS', 'TELEMETRY_RECONNECT_MS', 'sequenceId_'],
    CPP: ['Telemetry timed out - reconnecting', 'amsUnitCount', 'lastCommandResult', 'visibleAmsSlots', 'mqtt_.setSocketTimeout(5)'],
    INO: ['const bool paused = live && state.printer.paused', 'int amsBase =', 'printerActivityName(state.printer.activity)'],
}
for path, markers in checks.items():
    text = path.read_text()
    for marker in markers:
        if marker not in text:
            raise SystemExit(f"validation failed: {marker!r} missing from {path}")

print("Waveshare Home 1.6.0 Bambu First-Class patch applied successfully")
