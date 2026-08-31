from pathlib import Path
import re

ROOT = Path('firmware/waveshare-home/WaveshareHome')
app_model = ROOT / 'AppModel.h'
services_h = ROOT / 'Services.h'
services_cpp = ROOT / 'Services.cpp'
ino = ROOT / 'WaveshareHome.ino'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return new_text

# 1) Version bump.
text = app_model.read_text()
text = replace_once(
    text,
    'static constexpr char FW_VERSION[] = "1.0.0-rc13";',
    'static constexpr char FW_VERSION[] = "1.0.0-rc14";',
    'firmware version',
)
app_model.write_text(text)

# 2) Discovery is a first-class maintenance service. It must continue to run
# while Bambu monitoring is disabled and while the device is in Recovery Mode.
text = services_h.read_text()
text = replace_once(
    text,
    '  bool startDiscovery();\n  bool discoveryRunning() const { return discoveryRunning_; }',
    '  bool startDiscovery();\n  void serviceDiscovery();\n  bool discoveryRunning() const { return discoveryRunning_; }',
    'public discovery service API',
)
text = replace_once(
    text,
    '  WiFiUDP discoveryUdp_;\n',
    '  WiFiUDP discoveryUdp_;\n  WiFiUDP discoveryUdpLegacy_;\n  bool discoveryPrimaryReady_ = false;\n  bool discoveryLegacyReady_ = false;\n',
    'dual discovery sockets',
)
services_h.write_text(text)

# 3) Bambu discovery has historically used UDP 2021, with older/alternate
# announcements also referencing port 1990. Listen to both and scan for longer.
text = services_cpp.read_text()
text = replace_once(
    text,
    'constexpr uint16_t BAMBU_DISCOVERY_PORT = 2021;\nconstexpr uint32_t BAMBU_DISCOVERY_MS = 15000UL;',
    'constexpr uint16_t BAMBU_DISCOVERY_PORT = 2021;\nconstexpr uint16_t BAMBU_DISCOVERY_LEGACY_PORT = 1990;\nconstexpr uint32_t BAMBU_DISCOVERY_MS = 30000UL;',
    'discovery constants',
)

new_probe_and_start = r'''void BambuPlugin::sendDiscoveryProbe() {
  if (!discoveryRunning_ || WiFi.status() != WL_CONNECTED) return;

  WiFiUDP *tx = discoveryPrimaryReady_ ? &discoveryUdp_ : (discoveryLegacyReady_ ? &discoveryUdpLegacy_ : nullptr);
  if (!tx) return;

  const IPAddress local = WiFi.localIP();
  const IPAddress mask = WiFi.subnetMask();
  IPAddress directedBroadcast(255, 255, 255, 255);
  bool validMask = false;
  for (uint8_t i = 0; i < 4; ++i) {
    if (mask[i] != 0) validMask = true;
    directedBroadcast[i] = static_cast<uint8_t>((local[i] & mask[i]) | static_cast<uint8_t>(~mask[i]));
  }
  const IPAddress globalBroadcast(255, 255, 255, 255);
  const uint16_t ports[] = {BAMBU_DISCOVERY_PORT, BAMBU_DISCOVERY_LEGACY_PORT};
  const char *targets[] = {"ssdp:all", "urn:bambulab-com:device:3dprinter:1"};

  auto transmit = [&](const IPAddress &destination, uint16_t port, const String &payload) {
    if (!tx->beginPacket(destination, port)) return;
    tx->write(reinterpret_cast<const uint8_t *>(payload.c_str()), payload.length());
    tx->endPacket();
    delay(1);
  };

  for (uint16_t port : ports) {
    for (const char *target : targets) {
      String probe;
      probe.reserve(180);
      probe += "M-SEARCH * HTTP/1.1\r\n";
      probe += "HOST: 239.255.255.250:";
      probe += String(port);
      probe += "\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ";
      probe += target;
      probe += "\r\n\r\n";

      transmit(BAMBU_DISCOVERY_GROUP, port, probe);
      if (validMask) transmit(directedBroadcast, port, probe);
      if (!validMask || directedBroadcast != globalBroadcast) transmit(globalBroadcast, port, probe);
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
  discoveryPrimaryReady_ = false;
  discoveryLegacyReady_ = false;
  discoveredCount_ = 0;
  discoveryPackets_ = 0;
  discoveryMatchedPackets_ = 0;
  lastDiscoveryProbeMs_ = 0;
  for (auto &item : discovered_) item = BambuDiscoveredPrinter{};

  discoveryPrimaryReady_ = discoveryUdp_.beginMulticast(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_PORT);
  if (!discoveryPrimaryReady_) {
    discoveryUdp_.stop();
    discoveryPrimaryReady_ = discoveryUdp_.begin(BAMBU_DISCOVERY_PORT);
  }

  discoveryLegacyReady_ = discoveryUdpLegacy_.beginMulticast(BAMBU_DISCOVERY_GROUP, BAMBU_DISCOVERY_LEGACY_PORT);
  if (!discoveryLegacyReady_) {
    discoveryUdpLegacy_.stop();
    discoveryLegacyReady_ = discoveryUdpLegacy_.begin(BAMBU_DISCOVERY_LEGACY_PORT);
  }

  if (!discoveryPrimaryReady_ && !discoveryLegacyReady_) {
    copyText(discoveryStatus_, sizeof(discoveryStatus_), "Could not bind Bambu UDP 2021 or 1990");
    return false;
  }

  discoveryRunning_ = true;
  discoveryStartedMs_ = millis();
  char status[96];
  snprintf(status, sizeof(status), "Scanning Bambu LAN for 30s on UDP %s%s",
           discoveryPrimaryReady_ ? "2021" : "",
           discoveryLegacyReady_ ? (discoveryPrimaryReady_ ? "+1990" : "1990") : "");
  copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
  sendDiscoveryProbe();
  return true;
}

int BambuPlugin::findDiscovered'''

text = regex_once(
    text,
    r'void BambuPlugin::sendDiscoveryProbe\(\) \{.*?\n\}\n\nbool BambuPlugin::startDiscovery\(\) \{.*?\n\}\n\nint BambuPlugin::findDiscovered',
    new_probe_and_start,
    'probe/startDiscovery block',
)

new_poll = r'''void BambuPlugin::pollDiscovery() {
  if (!discoveryRunning_) return;

  auto drain = [&](WiFiUDP &udp, bool ready) {
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
      if (packet.length()) parseDiscoveryPacket(packet, remote);
      size = udp.parsePacket();
    }
  };

  drain(discoveryUdp_, discoveryPrimaryReady_);
  drain(discoveryUdpLegacy_, discoveryLegacyReady_);

  const uint32_t now = millis();
  if (now - lastDiscoveryProbeMs_ >= BAMBU_DISCOVERY_PROBE_MS) sendDiscoveryProbe();

  if (now - discoveryStartedMs_ >= BAMBU_DISCOVERY_MS) {
    discoveryRunning_ = false;
    discoveryUdp_.stop();
    discoveryUdpLegacy_.stop();
    discoveryPrimaryReady_ = false;
    discoveryLegacyReady_ = false;

    char status[96];
    if (discoveredCount_) {
      snprintf(status, sizeof(status), "Scan complete: found %u printer%s", discoveredCount_, discoveredCount_ == 1 ? "" : "s");
    } else if (discoveryMatchedPackets_) {
      snprintf(status, sizeof(status), "Scan complete: %lu Bambu packet%s matched but no usable printer record", (unsigned long)discoveryMatchedPackets_, discoveryMatchedPackets_ == 1 ? "" : "s");
    } else if (discoveryPackets_) {
      snprintf(status, sizeof(status), "Scan complete: %lu UDP packets seen, none identified as Bambu", (unsigned long)discoveryPackets_);
    } else {
      snprintf(status, sizeof(status), "No Bambu announcements on UDP 2021/1990; check same LAN or use manual IP");
    }
    copyText(discoveryStatus_, sizeof(discoveryStatus_), status);
  }
}

bool BambuPlugin::useDiscovered'''

text = regex_once(
    text,
    r'void BambuPlugin::pollDiscovery\(\) \{.*?\n\}\n\nbool BambuPlugin::useDiscovered',
    new_poll,
    'pollDiscovery block',
)

text = replace_once(
    text,
    'void BambuPlugin::loop(AppConfig &config, AppState &state) {\n  if (WiFi.status() == WL_CONNECTED) pollDiscovery();\n',
    'void BambuPlugin::serviceDiscovery() {\n  if (discoveryRunning_ && WiFi.status() == WL_CONNECTED) pollDiscovery();\n}\n\nvoid BambuPlugin::loop(AppConfig &config, AppState &state) {\n',
    'independent discovery loop',
)

text = text.replace(
    'Scanning for multicast, broadcast and passive Bambu LAN announcements… this page will refresh automatically.',
    'Scanning UDP 2021 + 1990 using passive announcements, multicast M-SEARCH and subnet broadcast… this page will refresh automatically.',
)
services_cpp.write_text(text)

# 4) Run printer discovery independently of the integration manager so the scan
# remains usable in Recovery Mode as a diagnostic and repair tool.
text = ino.read_text()
text = replace_once(
    text,
    '  lv_timer_handler();bootGuard.loop(state);connectivity.loop(config,state);webDashboard.loop(config,state);applyTimeConfiguration();',
    '  lv_timer_handler();bootGuard.loop(state);connectivity.loop(config,state);webDashboard.loop(config,state);bambuPlugin.serviceDiscovery();applyTimeConfiguration();',
    'main discovery service loop',
)
ino.write_text(text)

print('rc14 Bambu discovery hardening applied')
