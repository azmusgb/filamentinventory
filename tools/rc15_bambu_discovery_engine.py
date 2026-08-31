from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
HDR = ROOT / "firmware/waveshare-home/WaveshareHome/Services.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker)) if start >= 0 else -1
    if start < 0 or end < 0 or end <= start:
        raise SystemExit(f"{label}: markers not found (start={start}, end={end})")
    return text[:start] + replacement + text[end:]


# ---------------------------------------------------------------------------
# App model / version
# ---------------------------------------------------------------------------
app = APP.read_text()
app = replace_once(
    app,
    'static constexpr char FW_VERSION[] = "1.0.0-rc14";',
    'static constexpr char FW_VERSION[] = "1.0.0-rc15";',
    "firmware version",
)
app = replace_once(
    app,
    '''struct BambuDiscoveredPrinter {\n  bool valid = false;\n''',
    '''struct BambuDiscoveredPrinter {\n  bool valid = false;\n  bool candidateOnly = false;\n''',
    "Bambu candidate marker",
)
APP.write_text(app)


# ---------------------------------------------------------------------------
# Bambu service API + diagnostics/state
# ---------------------------------------------------------------------------
hdr = HDR.read_text()
hdr = replace_once(
    hdr,
    '''  uint32_t discoveryPackets() const { return discoveryPackets_; }\n  uint32_t discoveryMatchedPackets() const { return discoveryMatchedPackets_; }\n  const char *discoveryStatus() const { return discoveryStatus_; }\n  int mqttState() { return mqtt_.state(); }\n''',
    '''  uint32_t discoveryPackets() const { return discoveryPackets_; }\n  uint32_t discoveryMatchedPackets() const { return discoveryMatchedPackets_; }\n  uint32_t discoveryPackets1900() const { return discoveryPackets1900_; }\n  uint32_t discoveryPackets1990() const { return discoveryPackets1990_; }\n  uint32_t discoveryPackets2021() const { return discoveryPackets2021_; }\n  uint32_t discoveryNotifyPackets() const { return discoveryNotifyPackets_; }\n  uint32_t discoveryResponsePackets() const { return discoveryResponsePackets_; }\n  uint32_t discoveryProbeSends() const { return discoveryProbeSends_; }\n  uint16_t discoveryCandidateChecks() const { return discoveryCandidateChecks_; }\n  uint8_t discoveryCandidateHits() const { return discoveryCandidateHits_; }\n  uint8_t discoveryListenerMask() const { return discoveryListenerMask_; }\n  const char *discoveryLastRemote() const { return discoveryLastRemote_; }\n  const char *discoveryLastStartLine() const { return discoveryLastStartLine_; }\n  const char *discoveryStatus() const { return discoveryStatus_; }\n  int mqttState() { return mqtt_.state(); }\n''',
    "Bambu diagnostic getters",
)

hdr = replace_once(
    hdr,
    '''  WiFiUDP discoveryUdp_;\n  WiFiUDP discoveryUdpLegacy_;\n  bool discoveryPrimaryReady_ = false;\n  bool discoveryLegacyReady_ = false;\n''',
    '''  WiFiUDP discoveryUdp_;       // UDP 2021 / Bambu Studio channel\n  WiFiUDP discoveryUdpLegacy_; // UDP 1990 / alternate notify channel\n  WiFiUDP discoveryUdpSsdp_;   // UDP 1900 / standard SSDP channel\n  bool discoveryPrimaryReady_ = false;\n  bool discoveryLegacyReady_ = false;\n  bool discoverySsdpReady_ = false;\n  bool discoverySleepCaptured_ = false;\n  bool discoverySleepWasEnabled_ = false;\n''',
    "Bambu discovery sockets",
)

hdr = replace_once(
    hdr,
    '''  uint32_t discoveryPackets_ = 0;\n  uint32_t discoveryMatchedPackets_ = 0;\n  char discoveryStatus_[96] = "Idle";\n  BambuDiscoveredPrinter discovered_[6];\n  uint8_t discoveredCount_ = 0;\n''',
    '''  uint32_t discoveryPackets_ = 0;\n  uint32_t discoveryMatchedPackets_ = 0;\n  uint32_t discoveryPackets1900_ = 0;\n  uint32_t discoveryPackets1990_ = 0;\n  uint32_t discoveryPackets2021_ = 0;\n  uint32_t discoveryNotifyPackets_ = 0;\n  uint32_t discoveryResponsePackets_ = 0;\n  uint32_t discoveryProbeSends_ = 0;\n  uint16_t discoveryCandidateChecks_ = 0;\n  uint8_t discoveryCandidateHits_ = 0;\n  uint8_t discoveryCandidateHost_ = 1;\n  uint8_t discoveryListenerMask_ = 0;\n  bool discoveryCandidateScanStarted_ = false;\n  char discoveryLastRemote_[24] = "";\n  char discoveryLastStartLine_[48] = "";\n  char discoveryStatus_[160] = "Idle";\n  BambuDiscoveredPrinter discovered_[8];\n  uint8_t discoveredCount_ = 0;\n''',
    "Bambu discovery diagnostic state",
)

hdr = replace_once(
    hdr,
    '''  void sendDiscoveryProbe();\n  void pollDiscovery();\n  void parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp);\n  int findDiscovered(const char *serial, const char *host) const;\n''',
    '''  void sendDiscoveryProbe();\n  void pollDiscovery();\n  void scanFallbackCandidate();\n  void finishDiscovery();\n  void restoreDiscoverySleep();\n  void parseDiscoveryPacket(const String &packet, const IPAddress &remoteIp, uint16_t localPort);\n  int findDiscovered(const char *serial, const char *host) const;\n''',
    "Bambu discovery private methods",
)
HDR.write_text(hdr)


# ---------------------------------------------------------------------------
# Discovery engine. Passive NOTIFY is primary. M-SEARCH is compatibility only.
# A non-blocking /24 TCP-8883 candidate sweep begins only after passive SSDP has
# had time to work. This gives us a useful fallback when multicast/broadcast is
# suppressed by an AP while keeping the UI/watchdog responsive.
# ---------------------------------------------------------------------------
cpp = CPP.read_text()
cpp = replace_once(
    cpp,
    '''constexpr uint16_t BAMBU_DISCOVERY_PORT = 2021;\nconstexpr uint16_t BAMBU_DISCOVERY_LEGACY_PORT = 1990;\nconstexpr uint32_t BAMBU_DISCOVERY_MS = 30000UL;\nconstexpr uint32_t BAMBU_DISCOVERY_PROBE_MS = 1800UL;\n''',
    '''constexpr uint16_t BAMBU_DISCOVERY_PORT = 2021;\nconstexpr uint16_t BAMBU_DISCOVERY_LEGACY_PORT = 1990;\nconstexpr uint16_t BAMBU_DISCOVERY_SSDP_PORT = 1900;\nconstexpr uint32_t BAMBU_DISCOVERY_MS = 35000UL;\nconstexpr uint32_t BAMBU_DISCOVERY_PROBE_MS = 7000UL;\nconstexpr uint32_t BAMBU_DISCOVERY_FALLBACK_MS = 11000UL;\nconstexpr uint16_t BAMBU_CANDIDATE_CONNECT_TIMEOUT_MS = 25;\n''',
    "Bambu discovery constants",
)

new_discovery = r'''void BambuPlugin::sendDiscoveryProbe() {
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

'''
cpp = replace_between(
    cpp,
    "void BambuPlugin::sendDiscoveryProbe() {",
    "bool BambuPlugin::useDiscovered(AppConfig &config, AppState &state, uint8_t index) {",
    new_discovery,
    "Bambu discovery engine",
)

# Ensure selecting an active-scan candidate does not falsely mark it configured.
old_use = '''bool BambuPlugin::useDiscovered(AppConfig &config, AppState &state, uint8_t index) {\n  const BambuDiscoveredPrinter *d = discovered(index);\n  if (!d || !d->valid) return false;\n  copyText(config.bambuHost, sizeof(config.bambuHost), d->host);\n  copyText(config.bambuSerial, sizeof(config.bambuSerial), d->serial);\n  config.bambuEnabled = true;\n'''
new_use = '''bool BambuPlugin::useDiscovered(AppConfig &config, AppState &state, uint8_t index) {\n  const BambuDiscoveredPrinter *d = discovered(index);\n  if (!d || !d->valid) return false;\n  copyText(config.bambuHost, sizeof(config.bambuHost), d->host);\n  if (d->serial[0]) copyText(config.bambuSerial, sizeof(config.bambuSerial), d->serial);\n  // A TCP-8883 hit is a candidate, not proof of Bambu identity. Require the\n  // user to supply/retain serial + LAN access code before enabling MQTT.\n  config.bambuEnabled = !d->candidateOnly && d->serial[0];\n'''
cpp = replace_once(cpp, old_use, new_use, "candidate-safe useDiscovered")

# ---------------------------------------------------------------------------
# Rich web diagnostics: make the scan explain itself instead of merely failing.
# ---------------------------------------------------------------------------
old_web = '''  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");\n  s += F("<p class='status'>Discovery: "); s += htmlEscape(bambu_.discoveryStatus()); s += F(" • packets "); s += bambu_.discoveryPackets(); s += F(" • matched "); s += bambu_.discoveryMatchedPackets(); s += F("</p>");\n  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Scanning UDP 2021 + 1990 using passive announcements, multicast M-SEARCH and subnet broadcast… this page will refresh automatically.</p><script>setTimeout(()=>location.reload(),3000)</script>");\n  if (bambu_.discoveredCount()) { s += F("<label>Discovered printers</label>"); for (uint8_t i=0;i<bambu_.discoveredCount();++i) { const auto *d=bambu_.discovered(i); if(!d) continue; s += F("<form method='post' action='/bambu/use' class='card' style='margin:6px 0'><input type='hidden' name='index' value='"); s += i; s += F("'><strong>"); s += htmlEscape(strlen(d->name)?d->name:d->model); s += F("</strong><p>"); s += htmlEscape(d->model); s += F(" • "); s += htmlEscape(d->host); s += F("<br>Serial "); s += htmlEscape(d->serial); if(strlen(d->version)){s += F(" • FW "); s += htmlEscape(d->version);} s += F("</p><button type='submit'>Use this printer</button></form>"); } }\n'''
new_web = '''  s += F("</div><form method='post' action='/bambu/scan'><button class='muted'>Scan local network for Bambu printers</button></form>");\n  s += F("<div class='card' style='margin:8px 0;background:#071015'><div class='section-head'><div><span class='eyebrow'>DISCOVERY ACTIVITY</span><h3>Bambu LAN detector</h3></div><span class='section-chip'>PASSIVE + FALLBACK</span></div>");\n  s += F("<p class='status'><strong>"); s += htmlEscape(bambu_.discoveryStatus()); s += F("</strong></p>");\n  s += F("<div class='grid'><div><small>UDP traffic</small><div class='metric'>"); s += bambu_.discoveryPackets(); s += F("</div><p>1900: "); s += bambu_.discoveryPackets1900(); s += F(" • 1990: "); s += bambu_.discoveryPackets1990(); s += F(" • 2021: "); s += bambu_.discoveryPackets2021(); s += F("</p></div>");\n  s += F("<div><small>Bambu activity</small><div class='metric'>"); s += bambu_.discoveryMatchedPackets(); s += F("</div><p>NOTIFY: "); s += bambu_.discoveryNotifyPackets(); s += F(" • responses: "); s += bambu_.discoveryResponsePackets(); s += F(" • probes sent: "); s += bambu_.discoveryProbeSends(); s += F("</p></div></div>");\n  s += F("<p><small>Listeners: "); if(bambu_.discoveryListenerMask()&0x01)s+=F("1900 "); if(bambu_.discoveryListenerMask()&0x02)s+=F("1990 "); if(bambu_.discoveryListenerMask()&0x04)s+=F("2021 "); s += F("• MQTT fallback checks "); s += bambu_.discoveryCandidateChecks(); s += F(" • hits "); s += bambu_.discoveryCandidateHits(); if(strlen(bambu_.discoveryLastRemote())){s += F("<br>Last UDP: ");s += htmlEscape(bambu_.discoveryLastRemote());s += F(" • ");s +=htmlEscape(bambu_.discoveryLastStartLine());} s += F("</small></p></div>");\n  if (bambu_.discoveryRunning()) s += F("<p class='warn'>Listening for native Bambu NOTIFY on UDP 1900 / 1990 / 2021. M-SEARCH is compatibility-only. If SSDP stays quiet, rc15 automatically sweeps the local /24 for TCP 8883 candidates without blocking the UI.</p><script>setTimeout(()=>location.reload(),2500)</script>");\n  if (bambu_.discoveredCount()) { s += F("<label>Discovered printers / LAN candidates</label>"); for (uint8_t i=0;i<bambu_.discoveredCount();++i) { const auto *d=bambu_.discovered(i); if(!d) continue; s += F("<form method='post' action='/bambu/use' class='card' style='margin:6px 0'><input type='hidden' name='index' value='"); s += i; s += F("'><strong>"); s += htmlEscape(strlen(d->name)?d->name:d->model); if(d->candidateOnly)s+=F(" • CANDIDATE"); s += F("</strong><p>"); s += htmlEscape(d->model); s += F(" • "); s += htmlEscape(d->host); if(strlen(d->serial)){s += F("<br>Serial "); s += htmlEscape(d->serial);} else {s += F("<br>Identity not proven — enter printer serial and LAN access code after selecting.");} if(strlen(d->version)){s += F(" • FW "); s += htmlEscape(d->version);} s += F("</p><button type='submit'>"); s += d->candidateOnly ? F("Use candidate IP") : F("Use this printer"); s += F("</button></form>"); } }\n'''
cpp = replace_once(cpp, old_web, new_web, "Bambu web discovery diagnostics")

old_json = '''  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();\n  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();\n  doc["printerDiscovery"]["packets"] = bambu_.discoveryPackets();\n  doc["printerDiscovery"]["matchedPackets"] = bambu_.discoveryMatchedPackets();\n  doc["printerDiscovery"]["status"] = bambu_.discoveryStatus();\n  doc["printerDiscovery"]["mqttState"] = bambu_.mqttState();\n'''
new_json = '''  doc["printerDiscovery"]["running"] = bambu_.discoveryRunning();\n  doc["printerDiscovery"]["count"] = bambu_.discoveredCount();\n  doc["printerDiscovery"]["packets"] = bambu_.discoveryPackets();\n  doc["printerDiscovery"]["matchedPackets"] = bambu_.discoveryMatchedPackets();\n  doc["printerDiscovery"]["notifyPackets"] = bambu_.discoveryNotifyPackets();\n  doc["printerDiscovery"]["responsePackets"] = bambu_.discoveryResponsePackets();\n  doc["printerDiscovery"]["packetsByPort"]["1900"] = bambu_.discoveryPackets1900();\n  doc["printerDiscovery"]["packetsByPort"]["1990"] = bambu_.discoveryPackets1990();\n  doc["printerDiscovery"]["packetsByPort"]["2021"] = bambu_.discoveryPackets2021();\n  doc["printerDiscovery"]["probeSends"] = bambu_.discoveryProbeSends();\n  doc["printerDiscovery"]["listenerMask"] = bambu_.discoveryListenerMask();\n  doc["printerDiscovery"]["candidateChecks"] = bambu_.discoveryCandidateChecks();\n  doc["printerDiscovery"]["candidateHits"] = bambu_.discoveryCandidateHits();\n  doc["printerDiscovery"]["lastRemote"] = bambu_.discoveryLastRemote();\n  doc["printerDiscovery"]["lastStartLine"] = bambu_.discoveryLastStartLine();\n  doc["printerDiscovery"]["status"] = bambu_.discoveryStatus();\n  doc["printerDiscovery"]["mqttState"] = bambu_.mqttState();\n'''
cpp = replace_once(cpp, old_json, new_json, "Bambu status JSON diagnostics")

CPP.write_text(cpp)
print("Applied rc15 Bambu passive discovery + active fallback + diagnostics")
