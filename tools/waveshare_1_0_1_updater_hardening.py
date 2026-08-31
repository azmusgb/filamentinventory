from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
HDR = ROOT / "firmware/waveshare-home/WaveshareHome/Services.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)


def replace_function(text: str, signature: str, replacement: str) -> str:
    start = text.find(signature)
    if start < 0:
        if replacement.strip() in text:
            return text
        raise SystemExit(f"function not found: {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"opening brace not found: {signature}")
    depth = 0
    i = brace
    in_string = False
    in_char = False
    escape = False
    while i < len(text):
        c = text[i]
        if escape:
            escape = False
        elif c == "\\" and (in_string or in_char):
            escape = True
        elif c == '"' and not in_char:
            in_string = not in_string
        elif c == "'" and not in_string:
            in_char = not in_char
        elif not in_string and not in_char:
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    return text[:start] + replacement.rstrip() + text[end:]
        i += 1
    raise SystemExit(f"closing brace not found: {signature}")


app = APP.read_text()
app = replace_once(
    app,
    'static constexpr char FW_VERSION[] = "1.0.0";',
    'static constexpr char FW_VERSION[] = "1.0.1";',
    "firmware version",
)
APP.write_text(app)

hdr = HDR.read_text()
hdr = replace_once(
    hdr,
    "  bool started_ = false;\n  bool configChanged_ = false;",
    "  bool started_ = false;\n  bool updateCheckRequested_ = false;\n  bool updateInstallRequested_ = false;\n  bool configChanged_ = false;",
    "async updater request flags",
)
HDR.write_text(hdr)

cpp = CPP.read_text()
cpp = replace_once(
    cpp,
    '#include <esp_err.h>\n',
    '#include <esp_err.h>\n#include <esp_heap_caps.h>\n',
    "PSRAM allocator include",
)

old_check = '''  server_.on("/update/check", HTTP_POST, [this]() {
    const bool ok = checkForSelfUpdate(true);
    // Always return to the rich dashboard. The updater card already exposes
    // the detailed success/error state, so users never land on a dead-end
    // plain-text HTTP error page.
    server_.sendHeader("Location", "/#ota", true);
    server_.send(303, "text/plain", ok ? "Update check complete" : state_->system.updateError);
  });'''
new_check = '''  server_.on("/update/check", HTTP_POST, [this]() {
    if (!state_ || state_->system.updateCheckInProgress || state_->system.otaInProgress) {
      server_.send(409, "text/plain", "Updater is busy");
      return;
    }
    updateCheckRequested_ = true;
    copyText(state_->system.updateStatus, sizeof(state_->system.updateStatus), "Check queued");
    state_->system.updateError[0] = '\\0';
    server_.send(202, "text/plain", "Update check queued");
  });'''
cpp = replace_once(cpp, old_check, new_check, "async /update/check")

old_install_tail = '''    server_.send(200, "text/plain", "Downloading and installing update. Device will restart when validation succeeds.");
    delay(60);
    if (installSelfUpdate()) scheduleRestart(1500);
  });'''
new_install_tail = '''    updateInstallRequested_ = true;
    copyText(state_->system.updateStatus, sizeof(state_->system.updateStatus), "Install queued");
    state_->system.updateError[0] = '\\0';
    server_.send(202, "text/plain", "Update install queued. Device will restart after validation.");
  });'''
cpp = replace_once(cpp, old_install_tail, new_install_tail, "async /update/install")

old_loop_head = '''void WebDashboard::loop(AppConfig &config, AppState &state) {
  if (started_) server_.handleClient();
  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();
'''
new_loop_head = '''void WebDashboard::loop(AppConfig &config, AppState &state) {
  if (started_) server_.handleClient();

  // Run slow GitHub/TLS work only after the HTTP response has been returned.
  // This keeps Safari/curl from interpreting a long synchronous handler as a
  // dropped connection and keeps the WebServer request stack out of OTA work.
  if (updateCheckRequested_ && !state.system.updateCheckInProgress && !state.system.otaInProgress) {
    updateCheckRequested_ = false;
    checkForSelfUpdate(true);
  }
  if (updateInstallRequested_ && !state.system.updateCheckInProgress && !state.system.otaInProgress) {
    updateInstallRequested_ = false;
    if (installSelfUpdate()) scheduleRestart(1500);
  }

  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();
'''
cpp = replace_once(cpp, old_loop_head, new_loop_head, "deferred updater work")

new_install = r'''bool WebDashboard::installSelfUpdate() {
  if (!state_ || WiFi.status() != WL_CONNECTED) return false;
  auto &sys = state_->system;
  if (!sys.updateAvailable || !strlen(sys.updateFirmwareUrl) || strlen(sys.updateSha256) != 64) return false;

  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  if (!next || sys.updateSize == 0 || sys.updateSize > next->size) {
    strlcpy(sys.updateError, "Update does not fit inactive OTA slot", sizeof(sys.updateError));
    return false;
  }

  // 1.0.1 deliberately separates TLS download from flash writing. On 1.0.0-rc14
  // real hardware, streaming HTTPS bytes directly into Update.write() panicked
  // the ESP32-S3. The board has 8 MB PSRAM, so stage the validated application
  // image there first, close TLS, then write the inactive OTA partition.
  uint8_t *image = static_cast<uint8_t *>(heap_caps_malloc(sys.updateSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!image) image = static_cast<uint8_t *>(malloc(sys.updateSize));
  if (!image) {
    strlcpy(sys.updateError, "Not enough memory to stage firmware", sizeof(sys.updateError));
    return false;
  }

  sys.otaInProgress = true;
  sys.otaReadyToReboot = false;
  sys.otaBytes = 0;
  sys.otaTotal = sys.updateSize;
  strlcpy(sys.otaStatus, "Downloading", sizeof(sys.otaStatus));
  sys.otaError[0] = '\0';
  sys.updateError[0] = '\0';

  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(7000);
  http.setTimeout(15000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(secure, sys.updateFirmwareUrl)) {
    strlcpy(sys.updateError, "Could not open firmware URL", sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome/1.0.1 ESP32-S3");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    String e = String("Firmware HTTP ") + code;
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    http.end();
    free(image);
    sys.otaInProgress = false;
    return false;
  }

  int length = http.getSize();
  if (length > 0 && static_cast<uint32_t>(length) != sys.updateSize) {
    strlcpy(sys.updateError, "Firmware size differs from manifest", sizeof(sys.updateError));
    http.end();
    free(image);
    sys.otaInProgress = false;
    return false;
  }

  mbedtls_sha256_context shaCtx;
  mbedtls_sha256_init(&shaCtx);
  mbedtls_sha256_starts(&shaCtx, 0);
  WiFiClient *stream = http.getStreamPtr();
  uint32_t offset = 0;
  uint32_t idleStarted = millis();
  bool ok = true;
  while (offset < sys.updateSize) {
    size_t available = stream->available();
    if (!available) {
      if (!http.connected() && offset < sys.updateSize) {
        strlcpy(sys.updateError, "Firmware download ended early", sizeof(sys.updateError));
        ok = false;
        break;
      }
      if (millis() - idleStarted > 15000UL) {
        strlcpy(sys.updateError, "Firmware download timed out", sizeof(sys.updateError));
        ok = false;
        break;
      }
      delay(2);
      esp_task_wdt_reset();
      continue;
    }
    idleStarted = millis();
    size_t want = min<size_t>(4096, min<size_t>(available, sys.updateSize - offset));
    int got = stream->readBytes(image + offset, want);
    if (got <= 0) {
      strlcpy(sys.updateError, "Firmware download read failed", sizeof(sys.updateError));
      ok = false;
      break;
    }
    mbedtls_sha256_update(&shaCtx, image + offset, got);
    offset += static_cast<uint32_t>(got);
    sys.otaBytes = offset;
    esp_task_wdt_reset();
    yield();
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&shaCtx, digest);
  mbedtls_sha256_free(&shaCtx);
  char digestHex[65];
  for (int i = 0; i < 32; ++i) sprintf(digestHex + i * 2, "%02x", digest[i]);
  digestHex[64] = '\0';
  String expected = sys.updateSha256;
  expected.toLowerCase();
  String actual = digestHex;
  actual.toLowerCase();
  if (!ok || offset != sys.updateSize || actual != expected) {
    if (ok) strlcpy(sys.updateError, "Firmware SHA-256 verification failed", sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  strlcpy(sys.otaStatus, "Writing", sizeof(sys.otaStatus));
  sys.otaBytes = 0;
  if (Update.isRunning()) Update.abort();
  Update.clearError();
  if (!Update.begin(sys.updateSize, U_FLASH)) {
    String e = String("Update.begin: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  uint32_t writtenTotal = 0;
  while (writtenTotal < sys.updateSize) {
    size_t chunk = min<size_t>(4096, sys.updateSize - writtenTotal);
    size_t written = Update.write(image + writtenTotal, chunk);
    if (written != chunk) {
      strlcpy(sys.updateError, Update.errorString(), sizeof(sys.updateError));
      Update.abort();
      free(image);
      sys.otaInProgress = false;
      strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
      return false;
    }
    writtenTotal += written;
    sys.otaBytes = writtenTotal;
    esp_task_wdt_reset();
    yield();
  }
  free(image);

  if (!Update.end(true)) {
    String e = String("Update.end: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }

  sys.otaInProgress = false;
  sys.otaReadyToReboot = true;
  sys.updateAvailable = false;
  strlcpy(sys.otaStatus, "Verified - restarting", sizeof(sys.otaStatus));
  strlcpy(sys.updateStatus, "Installed - restarting", sizeof(sys.updateStatus));
  return true;
}'''
cpp = replace_function(cpp, "bool WebDashboard::installSelfUpdate()", new_install)

cpp = replace_once(
    cpp,
    '  doc["updater"]["available"] = state_->system.updateAvailable;\n',
    '  doc["updater"]["available"] = state_->system.updateAvailable;\n  doc["updater"]["checkInProgress"] = state_->system.updateCheckInProgress || updateCheckRequested_;\n  doc["updater"]["installQueued"] = updateInstallRequested_;\n',
    "updater async telemetry",
)

CPP.write_text(cpp)
print("Waveshare Home 1.0.1 updater hardening applied")
