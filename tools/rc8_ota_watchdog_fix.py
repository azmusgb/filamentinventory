from pathlib import Path

root = Path('firmware/waveshare-home/WaveshareHome')
app = root / 'AppModel.h'
svc = root / 'Services.cpp'

s = app.read_text()
s = s.replace('static constexpr char FW_VERSION[] = "1.0.0-rc7";', 'static constexpr char FW_VERSION[] = "1.0.0-rc8";')
app.write_text(s)

s = svc.read_text()

# Never perform background release-network work until the new image has survived
# the boot-guard validation window. This keeps OTA rollback deterministic.
s = s.replace(
'''  if (WiFi.status() == WL_CONNECTED && config.updateMode != 0 && !state.system.otaInProgress) {
    const uint32_t interval = (uint32_t)config.updateCheckMinutes * 60UL * 1000UL;
    const bool initialDue = !selfUpdateInitialCheckDone_ && millis() > 60000UL;''',
'''  if (state.system.stableBoot && WiFi.status() == WL_CONNECTED && config.updateMode != 0 && !state.system.otaInProgress) {
    const uint32_t interval = (uint32_t)config.updateCheckMinutes * 60UL * 1000UL;
    const bool initialDue = !selfUpdateInitialCheckDone_ && millis() > 90000UL;''')

# Browser OTA flash writes can monopolize the Arduino loop long enough to trip
# the task watchdog. Feed/yield on every upload chunk, including before/after
# the underlying flash write.
s = s.replace(
'''  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaUploadStarted_ || Update.hasError()) return;
    const size_t written = Update.write(upload.buf, upload.currentSize);
    state_->system.otaBytes += written;''',
'''  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaUploadStarted_ || Update.hasError()) return;
    esp_task_wdt_reset();
    delay(0);
    const size_t written = Update.write(upload.buf, upload.currentSize);
    esp_task_wdt_reset();
    delay(0);
    state_->system.otaBytes += written;''')

# Feed the watchdog around final image validation too.
s = s.replace(
'''    if (!state_->system.otaBytes) { Update.abort(); failOta("Firmware upload contained zero bytes"); return; }
    if (!Update.end(true)) {''',
'''    if (!state_->system.otaBytes) { Update.abort(); failOta("Firmware upload contained zero bytes"); return; }
    esp_task_wdt_reset();
    delay(0);
    if (!Update.end(true)) {''')

# Self-update HTTPS calls are intentionally manual/background-safe after stable
# boot. Yield before potentially blocking TLS requests and after JSON parsing.
s = s.replace('''  int code = http.GET();
  if (code != HTTP_CODE_OK) {''', '''  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);
  if (code != HTTP_CODE_OK) {''', 1)

svc.write_text(s)
