from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
HDR = ROOT / "firmware/waveshare-home/WaveshareHome/Services.h"
MODEL = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected text for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one match for {label}, got {text.count(old)}")
    return text.replace(old, new, 1)


def replace_func(text: str, signature: str, next_signature: str, replacement: str, label: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"missing function {label}")
    end = text.find(next_signature, start)
    if end < 0:
        raise SystemExit(f"missing function terminator for {label}")
    return text[:start] + replacement.rstrip() + "\n\n" + text[end:]

model = MODEL.read_text()
model = replace_once(model,
    'static constexpr char FW_VERSION[] = "1.0.0-rc5";',
    'static constexpr char FW_VERSION[] = "1.0.0-rc6";',
    'firmware version')
MODEL.write_text(model)

hdr = HDR.read_text()
hdr = replace_once(hdr,
'''  bool pausePrint();
  bool resumePrint();
  bool stopPrint();
private:''',
'''  bool pausePrint();
  bool resumePrint();
  bool stopPrint();
  bool testConnection();
  uint32_t discoveryPackets() const { return discoveryPackets_; }
  uint32_t discoveryMatchedPackets() const { return discoveryMatchedPackets_; }
  const char *discoveryStatus() const { return discoveryStatus_; }
  int mqttState() const { return mqtt_.state(); }
private:''',
    'Bambu public diagnostics')

hdr = replace_once(hdr,
'''  bool discoveryRunning_ = false;
  uint32_t discoveryStartedMs_ = 0;
  BambuDiscoveredPrinter discovered_[6];''',
'''  bool discoveryRunning_ = false;
  uint32_t discoveryStartedMs_ = 0;
  uint32_t lastDiscoveryProbeMs_ = 0;
  uint32_t discoveryPackets_ = 0;
  uint32_t discoveryMatchedPackets_ = 0;
  char discoveryStatus_[96] = "Idle";
  BambuDiscoveredPrinter discovered_[6];''',
    'Bambu private diagnostics')

hdr = replace_once(hdr,
'''  bool sendPrintCommand(const char *command);
  void pollDiscovery();''',
'''  bool sendPrintCommand(const char *command);
  void sendDiscoveryProbe();
  void pollDiscovery();''',
    'Bambu probe helper')
HDR.write_text(hdr)

cpp = CPP.read_text()
cpp = replace_once(cpp,
    'constexpr uint32_t BAMBU_DISCOVERY_MS = 9000UL;',
    'constexpr uint32_t BAMBU_DISCOVERY_MS = 15000UL;\nconstexpr uint32_t BAMBU_DISCOVERY_PROBE_MS = 1800UL;',
    'discovery timings')

new_start = r'''void BambuPlugin::sendDiscoveryProbe() {
  if (!discoveryRunning_ || WiFi.status() != WL_CONNECTED) return;
  const char *probes[] = {
    "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:2021\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n",
    "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:2021\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:bambulab-com:device:3dprinter:1\r\n\r\n"
  };
  const IPAddress broadcast(255, 255, 255, 255);
  for (const char *probe : probes) {
    discoveryUdp_.beginPacket(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_PORT);
    discoveryUdp_.write(reinterpret_cast<const uint8_t *>(probe), strlen(probe));
    discoveryUdp_.endPacket();
    // Some routers suppress multicast replies while still forwarding broadcast.
    // Sending both is harmless and substantially improves discovery on consumer LANs.
    discoveryUdp_.beginPacket(broadcast, BAMBU_DISCOVERY_PORT);
    discoveryUdp_.write(reinterpret_cast<const uint8_t *>(probe), strlen(probe));
    discoveryUdp_.endPacket();
  }
  lastDiscoveryProbeMs_ = millis();
}

bool BambuPlugin::startDiscovery() {
  if (WiFi.status() != WL_CONNECTED) {
    copyText(discoveryStatus_, sizeof(discoveryStatus_), "Wi-Fi is offline");
    return false;
  }
  discoveryUdp_.stop();
  discoveredCount_ = 0;
  discoveryPackets_ = 0;
  discoveryMatchedPackets_ = 0;
  lastDiscoveryProbeMs_ = 0;
  for (auto &item : discovered_) item = BambuDiscoveredPrinter{};
  if (!discoveryUdp_.beginMulticast(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_PORT)) {
    copyText(discoveryStatus_, sizeof(discoveryStatus_), "Could not join Bambu discovery multicast");
    return false;
  }
  discoveryRunning_ = true;
  discoveryStartedMs_ = millis();
  copyText(discoveryStatus_, sizeof(discoveryStatus_), "Listening for Bambu LAN announcements");
  sendDiscoveryProbe();
  return true;
}'''
cpp = replace_func(cpp, 'bool BambuPlugin::startDiscovery() {', 'int BambuPlugin::findDiscovered', new_start, 'startDiscovery')

new_parse = r'''void BambuPlugin::parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp) {
  discoveryPackets_++;

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
  String serial = value("USN");
  String nt = value("NT");
  String modelCode = value("DevModel.bambu.com");
  String name = value("DevName.bambu.com");

  const bool looksBambu = packetLower.indexOf("bambu") >= 0 ||
                          packetLower.indexOf("devmodel.bambu.com") >= 0 ||
                          packetLower.indexOf("devname.bambu.com") >= 0 ||
                          nt.indexOf("bambulab") >= 0 || modelCode.length() > 0;
  if (!looksBambu) return;
  discoveryMatchedPackets_++;

  // Normalize common SSDP USN forms while preserving native Bambu serials.
  if (serial.startsWith("uuid:")) serial.remove(0, 5);
  int suffix = serial.indexOf("::");
  if (suffix > 0) serial = serial.substring(0, suffix);
  serial.trim();

  String host = value("Location");
  if (!host.length()) host = remoteIp.toString();
  host.replace("http://", ""); host.replace("https://", "");
  int slash = host.indexOf('/'); if (slash >= 0) host = host.substring(0, slash);
  int colon = host.indexOf(':'); if (colon >= 0) host = host.substring(0, colon);
  host.trim();
  if (!host.length()) host = remoteIp.toString();

  int index = findDiscovered(serial.c_str(), host.c_str());
  if (index < 0) {
    if (discoveredCount_ >= 6) return;
    index = discoveredCount_++;
  }

  auto &d = discovered_[index];
  d.valid = true;
  copyText(d.host, sizeof(d.host), host);
  copyText(d.serial, sizeof(d.serial), serial);
  copyText(d.name, sizeof(d.name), name);

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

  char status[96];
  snprintf(status, sizeof(status), "Found %u printer%s", discoveredCount_, discoveredCount_ == 1 ? "" : "s");
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
}'''
cpp = replace_func(cpp, 'void BambuPlugin::parseDiscoveryPacket', 'void BambuPlugin::pollDiscovery()', new_parse, 'parseDiscoveryPacket')

new_poll = r'''void BambuPlugin::pollDiscovery() {
  if (!discoveryRunning_) return;

  int size = discoveryUdp_.parsePacket();
  while (size > 0) {
    String packet;
    packet.reserve(size + 1);
    while (discoveryUdp_.available()) packet += static_cast<char>(discoveryUdp_.read());
    parseDiscoveryPacket(packet, discoveryUdp_.remoteIP());
    size = discoveryUdp_.parsePacket();
  }

  const uint32_t now = millis();
  if (now - lastDiscoveryProbeMs_ >= BAMBU_DISCOVERY_PROBE_MS) sendDiscoveryProbe();

  if (now - discoveryStartedMs_ >= BAMBU_DISCOVERY_MS) {
    discoveryRunning_ = false;
    discoveryUdp_.stop();
    char status[96];
    if (discoveredCount_) {
      snprintf(status, sizeof(status), "Scan complete: %u printer%s found", discoveredCount_, discoveredCount_ == 1 ? "" : "s");
    } else if (discoveryPackets_) {
      snprintf(status, sizeof(status), "Scan complete: %lu UDP packets seen, none identified as Bambu", (unsigned long)discoveryPackets_);
    } else {
      snprintf(status, sizeof(status), "Scan complete: no UDP replies; use manual IP/serial setup");
    }
    copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
  }
}'''
cpp = replace_func(cpp, 'void BambuPlugin::pollDiscovery()', 'bool BambuPlugin::useDiscovered', new_poll, 'pollDiscovery')

cpp = replace_once(cpp,
'''bool BambuPlugin::pausePrint() { return sendPrintCommand("pause"); }
bool BambuPlugin::resumePrint() { return sendPrintCommand("resume"); }
bool BambuPlugin::stopPrint() { return sendPrintCommand("stop"); }''',
'''bool BambuPlugin::pausePrint() { return sendPrintCommand("pause"); }
bool BambuPlugin::resumePrint() { return sendPrintCommand("resume"); }
bool BambuPlugin::stopPrint() { return sendPrintCommand("stop"); }
bool BambuPlugin::testConnection() {
  if (!config_ || !state_ || WiFi.status() != WL_CONNECTED || !state_->printer.configured) return false;
  if (mqtt_.connected()) return true;
  return connectMqtt();
}''',
    'Bambu connection test')

# Add test route immediately after printer-selection route.
needle = '''  server_.on("/bambu/pause", HTTP_POST, [this]() { bool ok=bambu_.pausePrint(); server_.send(ok?200:409,"text/plain",ok?"Pause requested":"Printer unavailable"); });'''
replacement = '''  server_.on("/bambu/test", HTTP_POST, [this]() {
    bool ok = bambu_.testConnection();
    String message = ok ? "Bambu MQTT connection successful" : String("Bambu MQTT connection failed (state ") + bambu_.mqttState() + "). Check IP, serial, LAN mode and access code.";
    server_.send(ok ? 200 : 502, "text/plain", message);
  });
''' + needle
cpp = replace_once(cpp, needle, replacement, 'Bambu test route')

old_weather = '''  s += F("<div class='card' id='integrations'><h2>Integrations</h2><h3>Weather</h3><label><input type='checkbox' name='weatherEnabled'"); s += checked(config_->weatherEnabled); s += F(">Enable weather</label><div class='row'><input name='weatherLocation' placeholder='Location label' value='"); s += htmlEscape(config_->weatherLocation); s += F("'><input name='weatherLat' placeholder='Latitude' value='"); s += String(config_->weatherLatitude, 5); s += F("'></div><div class='row'><input name='weatherLon' placeholder='Longitude' value='"); s += String(config_->weatherLongitude, 5); s += F("'><label><input type='checkbox' name='weatherAlerts'"); s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label></div><hr>");'''
new_weather = '''  s += F("<div class='card' id='integrations'><h2>Integrations</h2><h3>Weather</h3><label><input type='checkbox' name='weatherEnabled'"); s += checked(config_->weatherEnabled); s += F(">Enable weather</label><label>Location</label><input name='weatherLocation' placeholder='ZIP or City, State — e.g. 29710 or Lake Wylie, SC' value='"); s += htmlEscape(config_->weatherLocation); s += F("'><p><small>Latitude/longitude are no longer required. Waveshare Home resolves the location automatically. Manual coordinates remain available below as an advanced fallback.</small></p><details><summary>Advanced: manual coordinates</summary><div class='row'><div><label>Latitude</label><input name='weatherLat' placeholder='Auto' value='"); if (fabsf(config_->weatherLatitude) > 0.0001f) s += String(config_->weatherLatitude, 5); s += F("'></div><div><label>Longitude</label><input name='weatherLon' placeholder='Auto' value='"); if (fabsf(config_->weatherLongitude) > 0.0001f) s += String(config_->weatherLongitude, 5); s += F("'></div></div></details><label><input type='checkbox' name='weatherAlerts'"); s += checked(config_->severeWeatherEnabled); s += F(">NWS severe alerts</label><p class='status'>Weather status: "); s += htmlEscape(state_->weather.condition); s += F("</p><hr>");'''
cpp = replace_once(cpp, old_weather, new_weather, 'weather setup UI')

old_scan = '''  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");
  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Scanning for Bambu SSDP announcements… refresh this page in a few seconds.</p>");'''
new_scan = '''  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");
  s += F("<p class='status'>Discovery: "); s += htmlEscape(bambu_.discoveryStatus()); s += F(" • packets "); s += bambu_.discoveryPackets(); s += F(" • matched "); s += bambu_.discoveryMatchedPackets(); s += F("</p>");
  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Scanning for multicast, broadcast and passive Bambu LAN announcements… this page will refresh automatically.</p><script>setTimeout(()=>location.reload(),3000)</script>");'''
cpp = replace_once(cpp, old_scan, new_scan, 'Bambu scan diagnostics UI')

old_manual = '''  s += F("<label><input type='checkbox' name='bambuEnabled'"); s += checked(config_->bambuEnabled); s += F(">Enable local MQTT monitoring</label><div class='row'><div><label>Printer IP / host</label><input name='bambuHost' value='"); s += htmlEscape(config_->bambuHost); s += F("'></div><div><label>Printer serial</label><input name='bambuSerial' value='"); s += htmlEscape(config_->bambuSerial); s += F("'></div></div><label>LAN access code</label><input type='password' name='bambuAccessCode' placeholder='Leave blank to keep saved code'><p><small>Discovery fills IP and serial automatically. The printer's LAN access code is still required for MQTT telemetry.</small></p><hr>");'''
new_manual = '''  s += F("<label><input type='checkbox' name='bambuEnabled'"); s += checked(config_->bambuEnabled); s += F(">Enable local MQTT monitoring</label><div class='row'><div><label>Printer IP / host</label><input name='bambuHost' placeholder='e.g. 10.0.0.50' value='"); s += htmlEscape(config_->bambuHost); s += F("'></div><div><label>Printer serial</label><input name='bambuSerial' placeholder='Printer serial number' value='"); s += htmlEscape(config_->bambuSerial); s += F("'></div></div><label>LAN access code</label><input type='password' name='bambuAccessCode' placeholder='Leave blank to keep saved code'><p><small>Scan is optional. Manual IP + serial + LAN access code is a fully supported fallback. Save settings before testing the MQTT connection.</small></p><div class='row'><button type='submit'>Save settings</button><button class='muted' type='submit' formaction='/bambu/test' formmethod='post'>Test saved MQTT connection</button></div><p><small>Last MQTT state: "); s += bambu_.mqttState(); s += F(" (0 means connected).</small></p><hr>");'''
cpp = replace_once(cpp, old_manual, new_manual, 'Bambu manual/test UI')

# Expose useful discovery diagnostics in JSON status.
old_json = '''  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();
  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();'''
new_json = '''  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();
  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();
  doc["printerDiscovery"]["packets"] = bambu_.discoveryPackets();
  doc["printerDiscovery"]["matchedPackets"] = bambu_.discoveryMatchedPackets();
  doc["printerDiscovery"]["status"] = bambu_.discoveryStatus();
  doc["printerDiscovery"]["mqttState"] = bambu_.mqttState();'''
cpp = replace_once(cpp, old_json, new_json, 'Bambu JSON diagnostics')

CPP.write_text(cpp)
print("rc6 setup upgrade applied")
