#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_ota_server(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    state_anchor = "static uint8_t otaShaExpected[32] = {};\n"
    state_repl = state_anchor + r'''
// Smart Home v9.1 manual OTA transaction state. This is intentionally RAM-only:
// it exists to let the browser distinguish an accepted firmware image from a
// transport disconnect while the ESP32 is transitioning into its reboot.
static String manualOtaPhase = "idle";
static String manualOtaMessage = "Ready for application firmware upload";
static size_t manualOtaBytes = 0;

'''
    text = replace_once(text, state_anchor, state_repl, "manual OTA state")

    start_anchor = '''  if (upload.status == UPLOAD_FILE_START) {
    otaError = "";
    otaInProgress = true;

    resetOtaSha();
'''
    start_repl = '''  if (upload.status == UPLOAD_FILE_START) {
    otaError = "";
    otaInProgress = true;
    manualOtaPhase = "receiving";
    manualOtaMessage = "Receiving firmware";
    manualOtaBytes = 0;

    resetOtaSha();
'''
    text = replace_once(text, start_anchor, start_repl, "manual OTA start state")

    write_anchor = '''    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
'''
    write_repl = '''    manualOtaBytes += upload.currentSize;
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
'''
    text = replace_once(text, write_anchor, write_repl, "manual OTA byte accounting")

    end_anchor = '''  } else if (upload.status == UPLOAD_FILE_END) {
    if (!otaInProgress) {
'''
    end_repl = '''  } else if (upload.status == UPLOAD_FILE_END) {
    manualOtaPhase = "verifying";
    manualOtaMessage = "Verifying firmware integrity";
    if (!otaInProgress) {
'''
    text = replace_once(text, end_anchor, end_repl, "manual OTA verification state")

    abort_anchor = '''  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    resetOtaSha();
    otaInProgress = false;
'''
    abort_repl = '''  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    resetOtaSha();
    otaInProgress = false;
    manualOtaPhase = "error";
    manualOtaMessage = "Firmware upload was aborted";
'''
    text = replace_once(text, abort_anchor, abort_repl, "manual OTA abort state")

    finish_old = '''static void handleOtaFinish() {
  if (otaError.length() > 0) {
    String msg = "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"" + otaError + "\\\"}";
    server.send(400, "application/json", msg);
    otaError = "";
    otaMqttReinitPending = true;  // failed update means no reboot - restore MQTT
    return;
  }
  server.send(200, "application/json",
    "{\\\"status\\\":\\\"ok\\\",\\\"message\\\":\\\"Update successful. Restarting...\\\"}");
  scheduleRestart(1500);
}
'''
    finish_new = r'''static void handleManualOtaStatus() {
  JsonDocument doc;
  doc["phase"] = manualOtaPhase;
  doc["message"] = manualOtaMessage;
  doc["inProgress"] = otaInProgress;
  doc["bytes"] = (uint32_t)manualOtaBytes;
  String json;
  serializeJson(doc, json);
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json);
}

static void handleOtaFinish() {
  if (otaError.length() > 0) {
    manualOtaPhase = "error";
    manualOtaMessage = otaError;
    String msg = "{\"status\":\"error\",\"phase\":\"error\",\"message\":\"" + otaError + "\"}";
    server.sendHeader("Cache-Control", "no-store");
    server.send(400, "application/json", msg);
    otaError = "";
    otaMqttReinitPending = true;  // failed update means no reboot - restore MQTT
    return;
  }

  // The image has passed SHA-256 validation and Update.end(true). Keep the
  // device alive long enough for the HTTP success response to leave the TCP
  // stack before restarting. Browser-side recovery still tolerates a transport
  // drop here, but a normal OTA should receive this definitive acceptance.
  manualOtaPhase = "accepted";
  manualOtaMessage = "Firmware accepted. Restarting";
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("Connection", "close");
  server.send(200, "application/json",
    "{\"status\":\"ok\",\"phase\":\"accepted\",\"message\":\"Firmware verified and accepted. Restarting...\",\"rebootInMs\":3500}");
  scheduleRestart(3500);
}
'''
    text = replace_once(text, finish_old, finish_new, "manual OTA definitive finish response")

    route_anchor = '  SECURE_UPLOAD("/ota/upload", handleOtaFinish, handleOtaUpload);\n'
    route_repl = route_anchor + '  SECURE_GET("/ota/manual/status", handleManualOtaStatus);\n'
    text = replace_once(text, route_anchor, route_repl, "manual OTA status route")

    p.write_text(text, encoding="utf-8")


def patch_ota_browser(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    start_anchor = "async function startOta(){\n"
    helper = r'''function confirmOtaAfterTransportLoss(stat){
  stat.style.color = 'var(--info)';
  stat.textContent = 'Firmware transferred. Confirming device acceptance...';
  var tries = 0;
  function probe(){
    tries++;
    var ctrl = new AbortController();
    var timeout = setTimeout(function(){ ctrl.abort(); }, 1800);
    fetch('/ota/manual/status?_=' + Date.now(), {
      cache:'no-store', credentials:'same-origin', signal:ctrl.signal
    }).then(function(r){
      clearTimeout(timeout);
      if (r.status === 401 || r.status === 403) throw new Error('session');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(d){
      if (d.phase === 'accepted'){
        stat.style.color = 'var(--success)';
        stat.textContent = d.message || 'Firmware accepted. Waiting for restart...';
        waitForReboot(stat);
        return;
      }
      if (d.phase === 'error'){
        stat.style.color = 'var(--danger)';
        stat.textContent = 'Update failed: ' + (d.message || 'device rejected firmware');
        startPolling(currentSection);
        return;
      }
      if (tries < 6){
        stat.textContent = 'Firmware transferred. Device is ' + (d.phase || 'processing') + '...';
        setTimeout(probe, 650);
        return;
      }
      stat.style.color = 'var(--danger)';
      stat.textContent = 'Update not accepted: device stayed online without confirming firmware.';
      startPolling(currentSection);
    }).catch(function(e){
      clearTimeout(timeout);
      // A network failure after every upload byte was sent is the expected
      // signature of the ESP32 leaving the network for its reboot. The existing
      // reboot watcher requires an offline -> online transition before reload.
      if (e && e.message === 'session'){
        stat.style.color = 'var(--danger)';
        stat.textContent = 'Update could not be confirmed because the portal session expired.';
        startPolling(currentSection);
      } else {
        waitForReboot(stat);
      }
    });
  }
  probe();
}

'''
    text = replace_once(text, start_anchor, helper + start_anchor, "OTA transport-loss confirmation helper")

    progress_anchor = '''  xhr.setRequestHeader('X-SHA256', shaHex);
  xhr.upload.onprogress = function(e){
'''
    progress_repl = '''  xhr.setRequestHeader('X-SHA256', shaHex);
  var uploadTransferred = false;
  xhr.upload.onprogress = function(e){
'''
    text = replace_once(text, progress_anchor, progress_repl, "OTA transfer completion flag")

    progress_done = '''      if (p >= 100){ stat.style.color = 'var(--info)'; stat.textContent = 'Flashing...'; }
'''
    progress_done_repl = '''      if (p >= 100){ uploadTransferred = true; stat.style.color = 'var(--info)'; stat.textContent = 'Verifying and flashing...'; }
'''
    text = replace_once(text, progress_done, progress_done_repl, "OTA progress accepted transition")

    errors_old = '''  xhr.onerror = function(){
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed: upload interrupted or connection lost';
    startPolling(currentSection);
  };
  xhr.ontimeout = function(){
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed: upload timed out';
    startPolling(currentSection);
  };
'''
    errors_new = '''  xhr.onerror = function(){
    if (uploadTransferred){ confirmOtaAfterTransportLoss(stat); return; }
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed before the firmware finished uploading.';
    startPolling(currentSection);
  };
  xhr.ontimeout = function(){
    if (uploadTransferred){ confirmOtaAfterTransportLoss(stat); return; }
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed: upload timed out before transfer completed.';
    startPolling(currentSection);
  };
  xhr.onabort = function(){
    if (uploadTransferred){ confirmOtaAfterTransportLoss(stat); return; }
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update cancelled before transfer completed.';
    startPolling(currentSection);
  };
'''
    text = replace_once(text, errors_old, errors_new, "OTA reboot-aware network error handling")

    p.write_text(text, encoding="utf-8")


def patch_printer_discovery(repo: Path) -> None:
    p = repo / "src" / "ssdp_discovery.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "static const uint32_t SSDP_SCAN_MS = 12000;\n",
        "static const uint32_t SSDP_SCAN_MS = 16000;\n",
        "SSDP reliability window",
    )

    text = replace_once(
        text,
        "static unsigned long s_scanStartMs = 0;\n",
        "static unsigned long s_scanStartMs = 0;\nstatic unsigned long s_lastProbeMs = 0;\n",
        "SSDP probe timestamp",
    )

    parse_old = '''// Parse one SSDP packet payload (already null-terminated in `buf`).
static void parsePacket(char* buf) {
  char serial[20] = {0};
  char loc[64]    = {0};
  char name[24]   = {0};
  char model[12]  = {0};

  char* save = nullptr;
'''
    parse_new = '''// Parse one SSDP packet payload (already null-terminated in `buf`).
// `remoteIp` is a trustworthy fallback when a valid Bambu announcement omits
// or mangles its Location header.
static void parsePacket(char* buf, const IPAddress& remoteIp) {
  const bool bambuMarker = strstr(buf, "DevName.bambu.com:") != nullptr ||
                           strstr(buf, "DevModel.bambu.com:") != nullptr;
  if (!bambuMarker) return;  // reject unrelated SSDP USNs on busy home networks

  char serial[20] = {0};
  char loc[64]    = {0};
  char name[24]   = {0};
  char model[12]  = {0};

  char* save = nullptr;
'''
    text = replace_once(text, parse_old, parse_new, "Bambu-only SSDP packet parsing")

    ip_old = '''  char ip[16] = {0};
  if (loc[0]) normalizeIp(loc, ip, sizeof(ip));
  upsertDevice(serial, ip, name, model);
}
'''
    ip_new = '''  char ip[16] = {0};
  if (loc[0]) normalizeIp(loc, ip, sizeof(ip));
  if (ip[0] == '\\0' && remoteIp != IPAddress((uint32_t)0)) {
    snprintf(ip, sizeof(ip), "%u.%u.%u.%u",
             remoteIp[0], remoteIp[1], remoteIp[2], remoteIp[3]);
  }
  upsertDevice(serial, ip, name, model);
}
'''
    text = replace_once(text, ip_old, ip_new, "SSDP remote-IP fallback")

    drain_old = '''    buf[n] = '\\0';
    parsePacket(buf);
'''
    drain_new = '''    buf[n] = '\\0';
    const IPAddress remoteIp = udp.remoteIP();
    parsePacket(buf, remoteIp);
'''
    text = replace_once(text, drain_old, drain_new, "SSDP remote-IP propagation")

    close_anchor = '''static void closeSockets() {
'''
    probe_support = r'''static void sendDiscoveryProbeOn(WiFiUDP& udp, uint16_t port) {
  static const char kSearch[] =
      "M-SEARCH * HTTP/1.1\r\n"
      "HOST: 239.255.255.250:1900\r\n"
      "MAN: \"ssdp:discover\"\r\n"
      "MX: 2\r\n"
      "ST: urn:bambulab-com:device:3dprinter:1\r\n\r\n";
  if (!udp.beginPacket(SSDP_GROUP, port)) return;
  udp.write(reinterpret_cast<const uint8_t*>(kSearch), strlen(kSearch));
  udp.endPacket();
}

static void sendDiscoveryProbe() {
  // Bambu firmware revisions have used more than one SSDP destination. Passive
  // listening remains authoritative; these small active probes simply reduce
  // the time-to-first-result when the printer supports M-SEARCH responses.
  sendDiscoveryProbeOn(s_udp2021, 1900);
  sendDiscoveryProbeOn(s_udp2021, 1990);
  sendDiscoveryProbeOn(s_udp2021, 2021);
}

'''
    text = replace_once(text, close_anchor, probe_support + close_anchor, "SSDP active discovery probe")

    start_old = '''  s_listening   = true;
  s_scanActive  = true;
  s_scanStartMs = millis();
  return opened;
'''
    start_new = '''  s_listening   = true;
  s_scanActive  = true;
  s_scanStartMs = millis();
  s_lastProbeMs = s_scanStartMs;
  sendDiscoveryProbe();
  return opened;
'''
    text = replace_once(text, start_old, start_new, "SSDP initial active probe")

    tick_old = '''void ssdpTick() {
  if (!s_scanActive) return;
  drainSocket(s_udp2021);
  drainSocket(s_udp1990);
  if (millis() - s_scanStartMs > SSDP_SCAN_MS) {
'''
    tick_new = '''void ssdpTick() {
  if (!s_scanActive) return;
  drainSocket(s_udp2021);
  drainSocket(s_udp1990);
  if (millis() - s_lastProbeMs >= 5000) {
    sendDiscoveryProbe();
    s_lastProbeMs = millis();
  }
  if (millis() - s_scanStartMs > SSDP_SCAN_MS) {
'''
    text = replace_once(text, tick_old, tick_new, "SSDP periodic active probe")

    p.write_text(text, encoding="utf-8")


def patch_build_identity(repo: Path) -> None:
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = text.replace('#define SMART_HOME_VERSION "v9.0"', '#define SMART_HOME_VERSION "v9.1"')
    text = text.replace('#define SMART_HOME_PROFILE "visual-command-center"', '#define SMART_HOME_PROFILE "reliable-control-plane"')
    text = text.replace('#define SMART_HOME_BUILD_LABEL "Smart Home v9.0 UI RC2"', '#define SMART_HOME_BUILD_LABEL "Smart Home v9.1 Reliability RC1"')
    if 'SMART_HOME_VERSION "v9.1"' not in text or 'Smart Home v9.1 Reliability RC1' not in text:
        raise PatchError("v9.1 build identity could not be applied")
    p.write_text(text, encoding="utf-8")


def validate(repo: Path) -> None:
    web = (repo / "src" / "web_server.cpp").read_text(encoding="utf-8")
    app = (repo / "web" / "app.js").read_text(encoding="utf-8")
    ssdp = (repo / "src" / "ssdp_discovery.cpp").read_text(encoding="utf-8")
    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")

    required = [
        (web, 'manualOtaPhase = "accepted"'),
        (web, 'SECURE_GET("/ota/manual/status", handleManualOtaStatus);'),
        (web, '"rebootInMs\\":3500'),
        (app, "confirmOtaAfterTransportLoss"),
        (app, "uploadTransferred = true"),
        (app, "xhr.onabort"),
        (ssdp, "sendDiscoveryProbe"),
        (ssdp, "remoteIp"),
        (ssdp, "bambuMarker"),
        (build, '#define SMART_HOME_VERSION "v9.1"'),
        (build, '#define SMART_HOME_PROFILE "reliable-control-plane"'),
    ]
    for body, needle in required:
        if needle not in body:
            raise PatchError(f"v9.1 reliability validation missing: {needle}")


def apply(repo: Path) -> None:
    patch_ota_server(repo)
    patch_ota_browser(repo)
    patch_printer_discovery(repo)
    patch_build_identity(repo)
    validate(repo)


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Smart Home v9.1 OTA + Bambu discovery reliability evolution")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v9.1 reliability patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
