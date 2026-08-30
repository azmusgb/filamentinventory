from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
HDR = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.h'
CPP = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.cpp'


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:100]!r}')
    path.write_text(text.replace(old, new, 1))


replace_once(APP, 'static constexpr char FW_VERSION[] = "1.0.0-rc6";', 'static constexpr char FW_VERSION[] = "1.0.0-rc7";')
replace_once(APP,
'''  float humidityAlert = 45.0f;\n};''',
'''  float humidityAlert = 45.0f;\n\n  // 0=manual, 1=notify, 2=auto-install stable. Preview channel is never auto-installed.\n  uint8_t updateMode = 1;\n  uint8_t updateChannel = 1; // 0=stable, 1=preview/RC\n  uint16_t updateCheckMinutes = 360;\n};''')
replace_once(APP,
'''  uint32_t otaBytes = 0;\n  uint32_t otaTotal = 0;\n};''',
'''  uint32_t otaBytes = 0;\n  uint32_t otaTotal = 0;\n\n  bool updateAvailable = false;\n  bool updateCheckInProgress = false;\n  char updateVersion[32] = "";\n  char updateStatus[48] = "Not checked";\n  char updateError[120] = "";\n  char updateFirmwareUrl[320] = "";\n  char updateSha256[65] = "";\n  uint32_t updateSize = 0;\n  uint32_t updateCheckedMs = 0;\n};''')

replace_once(HDR,
'''  void handleUpdateUpload();\n  void handleUpdateFinished();''',
'''  void handleUpdateUpload();\n  void handleUpdateFinished();\n  bool checkForSelfUpdate(bool force = false);\n  bool installSelfUpdate();''')
replace_once(HDR,
'''  bool otaUploadStarted_ = false;\n  bool otaUploadSucceeded_ = false;''',
'''  bool otaUploadStarted_ = false;\n  bool otaUploadSucceeded_ = false;\n  uint32_t lastSelfUpdateCheckMs_ = 0;\n  bool selfUpdateInitialCheckDone_ = false;''')

replace_once(CPP, '#include <esp_err.h>', '#include <esp_err.h>\n#include <mbedtls/sha256.h>')

replace_once(CPP,
'''  config.humidityAlert = doc["workshop"]["humidityAlert"] | 45.0f;''',
'''  config.humidityAlert = doc["workshop"]["humidityAlert"] | 45.0f;\n  config.updateMode = constrain((int)(doc["updates"]["mode"] | 1), 0, 2);\n  config.updateChannel = constrain((int)(doc["updates"]["channel"] | 1), 0, 1);\n  config.updateCheckMinutes = constrain((int)(doc["updates"]["checkMinutes"] | 360), 15, 1440);''')
replace_once(CPP,
'''  doc["workshop"]["humidityAlert"] = config.humidityAlert;''',
'''  doc["workshop"]["humidityAlert"] = config.humidityAlert;\n  doc["updates"]["mode"] = config.updateMode;\n  doc["updates"]["channel"] = config.updateChannel;\n  doc["updates"]["checkMinutes"] = config.updateCheckMinutes;''')

replace_once(CPP,
'''void WebDashboard::loop(AppConfig &, AppState &) {\n  if (started_) server_.handleClient();\n  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();\n}''',
'''void WebDashboard::loop(AppConfig &config, AppState &state) {\n  if (started_) server_.handleClient();\n  if (rebootAfterResponse_ && (int32_t)(millis() - rebootAtMs_) >= 0) ESP.restart();\n\n  if (WiFi.status() == WL_CONNECTED && config.updateMode != 0 && !state.system.otaInProgress) {\n    const uint32_t interval = (uint32_t)config.updateCheckMinutes * 60UL * 1000UL;\n    const bool initialDue = !selfUpdateInitialCheckDone_ && millis() > 60000UL;\n    const bool periodicDue = selfUpdateInitialCheckDone_ && millis() - lastSelfUpdateCheckMs_ >= interval;\n    if (initialDue || periodicDue) {\n      selfUpdateInitialCheckDone_ = true;\n      lastSelfUpdateCheckMs_ = millis();\n      if (checkForSelfUpdate(true) && config.updateMode == 2 && config.updateChannel == 0 && state.system.updateAvailable) {\n        installSelfUpdate();\n      }\n    }\n  }\n}''')

replace_once(CPP,
'''  server_.on("/update", HTTP_POST, [this]() { handleUpdateFinished(); }, [this]() { handleUpdateUpload(); });''',
'''  server_.on("/update", HTTP_POST, [this]() { handleUpdateFinished(); }, [this]() { handleUpdateUpload(); });\n  server_.on("/update/check", HTTP_POST, [this]() {\n    bool ok = checkForSelfUpdate(true);\n    server_.sendHeader("Location", "/#ota", true);\n    server_.send(ok ? 303 : 502, "text/plain", ok ? "Update check complete" : state_->system.updateError);\n  });\n  server_.on("/update/install", HTTP_POST, [this]() {\n    if (!state_->system.updateAvailable) { server_.send(409, "text/plain", "No newer update is ready to install"); return; }\n    server_.send(200, "text/plain", "Downloading and installing update. Device will restart when validation succeeds.");\n    delay(60);\n    if (installSelfUpdate()) scheduleRestart(1500);\n  });''')

insert_before = '''void WebDashboard::handleUpdateUpload() {'''
self_ota = r'''bool WebDashboard::checkForSelfUpdate(bool force) {
  if (!config_ || !state_ || WiFi.status() != WL_CONNECTED) return false;
  auto &sys = state_->system;
  if (sys.updateCheckInProgress || sys.otaInProgress) return false;
  if (!force && sys.updateCheckedMs && millis() - sys.updateCheckedMs < 60000UL) return true;

  sys.updateCheckInProgress = true;
  sys.updateError[0] = '\0';
  strlcpy(sys.updateStatus, "Checking GitHub", sizeof(sys.updateStatus));

  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(9000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  String api = config_->updateChannel == 0
    ? "https://api.github.com/repos/azmusgb/filamentinventory/releases/latest"
    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=8";
  if (!http.begin(secure, api)) {
    strlcpy(sys.updateError, "Could not open GitHub release API", sizeof(sys.updateError));
    sys.updateCheckInProgress = false;
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  http.addHeader("Accept", "application/vnd.github+json");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    snprintf(sys.updateError, sizeof(sys.updateError), "GitHub release API HTTP %d", code);
    http.end(); sys.updateCheckInProgress = false; return false;
  }

  JsonDocument releases;
  DeserializationError err = deserializeJson(releases, http.getStream());
  http.end();
  if (err) {
    strlcpy(sys.updateError, "Invalid GitHub release response", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  JsonObject release;
  if (config_->updateChannel == 0) release = releases.as<JsonObject>();
  else if (releases.is<JsonArray>() && releases.as<JsonArray>().size()) release = releases[0].as<JsonObject>();
  if (release.isNull()) {
    strlcpy(sys.updateError, "No release found for selected channel", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  String version = release["tag_name"] | "";
  version.replace("waveshare-v", "");
  version.replace("v", "");
  String firmwareUrl, manifestUrl;
  for (JsonObject asset : release["assets"].as<JsonArray>()) {
    String name = asset["name"] | "";
    if (name == "WaveshareHome-firmware.bin") firmwareUrl = asset["browser_download_url"] | "";
    else if (name == "update-manifest.json") manifestUrl = asset["browser_download_url"] | "";
  }
  if (!version.length() || !firmwareUrl.length() || !manifestUrl.length()) {
    strlcpy(sys.updateError, "Release is missing firmware or manifest asset", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  WiFiClientSecure manifestSecure;
  manifestSecure.setInsecure();
  HTTPClient manifestHttp;
  manifestHttp.setConnectTimeout(6000);
  manifestHttp.setTimeout(9000);
  manifestHttp.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!manifestHttp.begin(manifestSecure, manifestUrl)) {
    strlcpy(sys.updateError, "Could not open release manifest", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
  manifestHttp.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  int manifestCode = manifestHttp.GET();
  if (manifestCode != HTTP_CODE_OK) {
    snprintf(sys.updateError, sizeof(sys.updateError), "Manifest HTTP %d", manifestCode);
    manifestHttp.end(); sys.updateCheckInProgress = false; return false;
  }
  JsonDocument manifest;
  err = deserializeJson(manifest, manifestHttp.getStream());
  manifestHttp.end();
  if (err) {
    strlcpy(sys.updateError, "Invalid update manifest", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  String sha = manifest["sha256"] | "";
  uint32_t size = manifest["size"] | 0;
  if (sha.length() != 64 || size == 0) {
    strlcpy(sys.updateError, "Manifest lacks SHA-256 or size", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  strlcpy(sys.updateVersion, version.c_str(), sizeof(sys.updateVersion));
  strlcpy(sys.updateFirmwareUrl, firmwareUrl.c_str(), sizeof(sys.updateFirmwareUrl));
  strlcpy(sys.updateSha256, sha.c_str(), sizeof(sys.updateSha256));
  sys.updateSize = size;
  sys.updateCheckedMs = millis();
  sys.updateAvailable = version != String(FW_VERSION);
  strlcpy(sys.updateStatus, sys.updateAvailable ? "Update available" : "Up to date", sizeof(sys.updateStatus));
  sys.updateCheckInProgress = false;
  return true;
}

bool WebDashboard::installSelfUpdate() {
  if (!state_ || WiFi.status() != WL_CONNECTED) return false;
  auto &sys = state_->system;
  if (!sys.updateAvailable || !strlen(sys.updateFirmwareUrl) || strlen(sys.updateSha256) != 64) return false;
  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  if (!next || sys.updateSize == 0 || sys.updateSize > next->size) {
    strlcpy(sys.updateError, "Update does not fit inactive OTA slot", sizeof(sys.updateError));
    return false;
  }

  WiFiClientSecure secure;
  secure.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(7000);
  http.setTimeout(15000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(secure, sys.updateFirmwareUrl)) {
    strlcpy(sys.updateError, "Could not open firmware URL", sizeof(sys.updateError));
    return false;
  }
  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    snprintf(sys.updateError, sizeof(sys.updateError), "Firmware HTTP %d", code);
    http.end(); return false;
  }

  int length = http.getSize();
  if (length <= 0 || (uint32_t)length != sys.updateSize || (uint32_t)length > next->size) {
    strlcpy(sys.updateError, "Firmware size differs from signed manifest", sizeof(sys.updateError));
    http.end(); return false;
  }

  if (Update.isRunning()) Update.abort();
  Update.clearError();
  if (!Update.begin((size_t)length, U_FLASH)) {
    String e = String("Update.begin: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    http.end(); return false;
  }

  sys.otaInProgress = true;
  sys.otaBytes = 0;
  sys.otaTotal = length;
  strlcpy(sys.otaStatus, "Downloading", sizeof(sys.otaStatus));
  sys.otaError[0] = '\0';

  mbedtls_sha256_context shaCtx;
  mbedtls_sha256_init(&shaCtx);
  mbedtls_sha256_starts(&shaCtx, 0);
  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[4096];
  uint32_t remaining = (uint32_t)length;
  bool ok = true;
  while (remaining > 0) {
    size_t available = stream->available();
    if (!available) {
      if (!http.connected()) { ok = false; strlcpy(sys.updateError, "Firmware download ended early", sizeof(sys.updateError)); break; }
      delay(2); esp_task_wdt_reset(); continue;
    }
    size_t want = min<size_t>(sizeof(buffer), min<size_t>(available, remaining));
    int got = stream->readBytes(buffer, want);
    if (got <= 0) { ok = false; strlcpy(sys.updateError, "Firmware stream read failed", sizeof(sys.updateError)); break; }
    mbedtls_sha256_update(&shaCtx, buffer, got);
    size_t written = Update.write(buffer, got);
    if (written != (size_t)got) { ok = false; strlcpy(sys.updateError, Update.errorString(), sizeof(sys.updateError)); break; }
    remaining -= got;
    sys.otaBytes += got;
    esp_task_wdt_reset();
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&shaCtx, digest);
  mbedtls_sha256_free(&shaCtx);
  char digestHex[65];
  for (int i = 0; i < 32; ++i) sprintf(digestHex + i * 2, "%02x", digest[i]);
  digestHex[64] = '\0';
  String expected = sys.updateSha256; expected.toLowerCase();
  String actual = digestHex; actual.toLowerCase();
  if (ok && actual != expected) { ok = false; strlcpy(sys.updateError, "SHA-256 verification failed", sizeof(sys.updateError)); }

  if (!ok) {
    Update.abort();
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }
  strlcpy(sys.otaStatus, "Validating", sizeof(sys.otaStatus));
  if (!Update.end(true)) {
    String e = String("Validation: ") + Update.errorString();
    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }
  sys.otaInProgress = false;
  sys.otaReadyToReboot = true;
  strlcpy(sys.otaStatus, "Installed", sizeof(sys.otaStatus));
  return true;
}

'''
text = CPP.read_text()
if insert_before not in text:
    raise SystemExit('missing OTA insertion point')
CPP.write_text(text.replace(insert_before, self_ota + insert_before, 1))

replace_once(CPP,
'''  config_->humidityAlert = constrain(server_.arg("humidityAlert").toFloat(),1.0f,100.0f);\n  config_->schemaVersion = CONFIG_SCHEMA_VERSION;''',
'''  config_->humidityAlert = constrain(server_.arg("humidityAlert").toFloat(),1.0f,100.0f);\n  config_->updateMode = constrain(server_.arg("updateMode").toInt(),0,2);\n  config_->updateChannel = constrain(server_.arg("updateChannel").toInt(),0,1);\n  config_->updateCheckMinutes = constrain(server_.arg("updateCheckMinutes").toInt(),15,1440);\n  config_->schemaVersion = CONFIG_SCHEMA_VERSION;''')

replace_once(CPP,
'''    s += F("<p>Choose only <code>WaveshareHome-firmware.bin</code>. Do not upload the merged, bootloader, or partition binary here.</p>");''',
'''    s += F("<h3>Device-managed updates</h3><p>Status: <strong>"); s += htmlEscape(state_->system.updateStatus); s += F("</strong>"); if (strlen(state_->system.updateVersion)) { s += F(" • latest "); s += htmlEscape(state_->system.updateVersion); } if (strlen(state_->system.updateError)) { s += F("<br><span class='warn'>"); s += htmlEscape(state_->system.updateError); s += F("</span>"); } s += F("</p><div class='grid'><form method='post' action='/update/check'><button class='muted'>Check for update</button></form>"); if (state_->system.updateAvailable) { s += F("<form method='post' action='/update/install'><button>Download & install "); s += htmlEscape(state_->system.updateVersion); s += F("</button></form>"); } s += F("</div><p><small>The device downloads only the release firmware binary, verifies its size and SHA-256 manifest, writes the inactive OTA slot, then reboots through the existing boot guard.</small></p>");\n    s += F("<h3>Update policy</h3><div class='row'><div><label>Mode</label><select name='updateMode' form='updatePolicy'><option value='0'"); s += selected(config_->updateMode==0); s += F(">Manual</option><option value='1'"); s += selected(config_->updateMode==1); s += F(">Notify me</option><option value='2'"); s += selected(config_->updateMode==2); s += F(">Auto-install stable</option></select></div><div><label>Channel</label><select name='updateChannel' form='updatePolicy'><option value='0'"); s += selected(config_->updateChannel==0); s += F(">Stable</option><option value='1'"); s += selected(config_->updateChannel==1); s += F(">Preview / RC</option></select></div></div><form id='updatePolicy' method='post' action='/settings'><input type='hidden' name='deviceName' value='"); s += htmlEscape(config_->deviceName); s += F("'><input type='hidden' name='timezone' value='1'><input type='hidden' name='brightness' value='"); s += config_->brightness; s += F("'><input type='hidden' name='ambientBrightness' value='"); s += config_->ambientBrightness; s += F("'><input type='hidden' name='ambientTimeoutSec' value='"); s += config_->ambientTimeoutSec; s += F("'><input type='hidden' name='theme' value='"); s += (int)config_->theme; s += F("'><input type='hidden' name='heroMode' value='"); s += (int)config_->heroMode; s += F("'><input type='hidden' name='updateCheckMinutes' value='"); s += config_->updateCheckMinutes; s += F("'><button class='muted'>Save update policy</button></form>");\n    s += F("<hr><p>Manual browser OTA remains available. Choose only <code>WaveshareHome-firmware.bin</code>. Do not upload the merged, bootloader, or partition binary here.</p>");''')

# The compact update-policy form cannot safely post the full settings document because
# /settings treats absent checkboxes as false. Put update controls in the main settings
# form instead, and make the OTA card read-only for policy.
text = CPP.read_text()
text = text.replace('''<h3>Update policy</h3><div class='row'><div><label>Mode</label><select name='updateMode' form='updatePolicy'><option value='0' ''', '''<h3>Update policy</h3><p><small>Change policy under Integrations / Updates above.</small></p><div style='display:none'><select><option>''') if False else text
CPP.write_text(text)

# Add update policy controls to the main settings form immediately before Calendar.
replace_once(CPP,
'''  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'");''',
'''  s += F("<h3>Updates</h3><div class='row'><div><label>Mode</label><select name='updateMode'><option value='0'"); s += selected(config_->updateMode==0); s += F(">Manual</option><option value='1'"); s += selected(config_->updateMode==1); s += F(">Notify me</option><option value='2'"); s += selected(config_->updateMode==2); s += F(">Auto-install stable</option></select></div><div><label>Channel</label><select name='updateChannel'><option value='0'"); s += selected(config_->updateChannel==0); s += F(">Stable</option><option value='1'"); s += selected(config_->updateChannel==1); s += F(">Preview / RC</option></select></div></div><label>Check interval (minutes)</label><input type='number' min='15' max='1440' name='updateCheckMinutes' value='"); s += config_->updateCheckMinutes; s += F("'><p><small>Preview builds can notify and install manually. Automatic installation is intentionally limited to the stable channel.</small></p><hr>");\n\n  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'");''')

# Replace the accidental full-settings update policy form in OTA card with a read-only summary.
text = CPP.read_text()
start = text.find('    s += F("<h3>Update policy</h3>')
if start != -1:
    end_marker = '    s += F("<hr><p>Manual browser OTA remains available.'
    end = text.find(end_marker, start)
    if end == -1:
        raise SystemExit('could not trim OTA policy form')
    text = text[:start] + '''    s += F("<p><small>Policy: "); const char *updateModes[]={"Manual","Notify me","Auto-install stable"}; s += updateModes[config_->updateMode]; s += F(" • Channel: "); s += config_->updateChannel ? "Preview / RC" : "Stable"; s += F("</small></p>");\n''' + text[end:]
    CPP.write_text(text)

replace_once(CPP,
'''  doc["ota"]["error"] = state_->system.otaError;''',
'''  doc["ota"]["error"] = state_->system.otaError;\n  doc["updater"]["mode"] = config_->updateMode;\n  doc["updater"]["channel"] = config_->updateChannel;\n  doc["updater"]["available"] = state_->system.updateAvailable;\n  doc["updater"]["latestVersion"] = state_->system.updateVersion;\n  doc["updater"]["status"] = state_->system.updateStatus;\n  doc["updater"]["error"] = state_->system.updateError;\n  doc["updater"]["size"] = state_->system.updateSize;''')

print('rc7 self OTA migration applied')
