from pathlib import Path

ROOT = Path('firmware/waveshare-home/WaveshareHome')
app_model = ROOT / 'AppModel.h'
services_h = ROOT / 'Services.h'
services_cpp = ROOT / 'Services.cpp'
ino = ROOT / 'WaveshareHome.ino'

# 1) Version bump
text = app_model.read_text()
old = 'static constexpr char FW_VERSION[] = "1.0.0-rc12";'
new = 'static constexpr char FW_VERSION[] = "1.0.0-rc13";'
if old not in text:
    raise SystemExit('FW_VERSION rc12 marker not found')
app_model.write_text(text.replace(old, new, 1))

# 2) BootGuard API: explicit recovery escape without factory reset/NVS erase.
text = services_h.read_text()
old = '''class BootGuard {
public:
  bool begin(AppState &state);
  void loop(AppState &state);
  void markStable(AppState &state);
  bool recoveryRequested() const { return recoveryRequested_; }
private:
'''
new = '''class BootGuard {
public:
  bool begin(AppState &state);
  void loop(AppState &state);
  void markStable(AppState &state);
  void clearRecovery(AppState &state);
  bool recoveryRequested() const { return recoveryRequested_; }
private:
'''
if old not in text:
    raise SystemExit('BootGuard declaration marker not found')
services_h.write_text(text.replace(old, new, 1))

# 3) Replace the old every-boot counter with a version-aware pending-boot guard.
text = services_cpp.read_text()
old = '''bool BootGuard::begin(AppState &state) {
  prefs_.begin("boot-guard", false);
  state.system.bootCount = prefs_.getUInt("count", 0) + 1;
  prefs_.putUInt("count", state.system.bootCount);
  state.system.bootAttempts = prefs_.getUInt("attempts", 0) + 1;
  prefs_.putUInt("attempts", state.system.bootAttempts);
  copyText(state.system.resetReason, sizeof(state.system.resetReason), resetReasonText(esp_reset_reason()));
  pinMode(0, INPUT_PULLUP);
  delay(4);
  recoveryRequested_ = state.system.bootAttempts >= 3 || digitalRead(0) == LOW;
  state.system.recoveryMode = recoveryRequested_;
  bootMs_ = millis();

  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = 8000;
  cfg.idle_core_mask = (1U << portNUM_PROCESSORS) - 1U;
  cfg.trigger_panic = true;
  esp_err_t rc = esp_task_wdt_reconfigure(&cfg);
  if (rc != ESP_OK) esp_task_wdt_init(&cfg);
  esp_task_wdt_add(nullptr);
  return recoveryRequested_;
}

void BootGuard::loop(AppState &state) {
  esp_task_wdt_reset();
  state.system.watchdogFeeds++;
  state.system.uptimeSec = millis() / 1000UL;
  state.system.freeHeap = ESP.getFreeHeap();
  state.system.freePsram = ESP.getFreePsram();
  if (!stableMarked_ && millis() - bootMs_ >= STABLE_BOOT_MS) markStable(state);
}

void BootGuard::markStable(AppState &state) {
  prefs_.putUInt("attempts", 0);
  stableMarked_ = true;
  state.system.stableBoot = true;
  esp_ota_mark_app_valid_cancel_rollback();
}
'''
new = '''bool BootGuard::begin(AppState &state) {
  prefs_.begin("boot-guard", false);

  const esp_reset_reason_t resetReason = esp_reset_reason();
  copyText(state.system.resetReason, sizeof(state.system.resetReason), resetReasonText(resetReason));

  state.system.bootCount = prefs_.getUInt("count", 0) + 1;
  prefs_.putUInt("count", state.system.bootCount);

  // A firmware upgrade is a new validation epoch. Never inherit a stale
  // failure counter from an older image into freshly installed firmware.
  const String storedFirmware = prefs_.getString("fw", "");
  const bool sameFirmware = storedFirmware == FW_VERSION;
  const bool previousBootPending = prefs_.getBool("pending", false);
  uint32_t failedBoots = prefs_.getUInt("attempts", 0);

  if (!sameFirmware) {
    failedBoots = 0;
    prefs_.putString("fw", FW_VERSION);
  } else if (!previousBootPending) {
    failedBoots = 0;
  } else {
    // Only crash-class resets count toward boot-loop recovery. Normal OTA/
    // software restarts, power cycles and external reset presses should not
    // manufacture a boot loop merely because they occur before 45 seconds.
    const bool crashReset =
        resetReason == ESP_RST_PANIC ||
        resetReason == ESP_RST_INT_WDT ||
        resetReason == ESP_RST_TASK_WDT ||
        resetReason == ESP_RST_WDT ||
        resetReason == ESP_RST_BROWNOUT;
    if (crashReset) ++failedBoots;
  }

  state.system.bootAttempts = failedBoots;
  prefs_.putUInt("attempts", failedBoots);
  prefs_.putBool("pending", true);

  pinMode(0, INPUT_PULLUP);
  delay(4);
  recoveryRequested_ = failedBoots >= 3 || digitalRead(0) == LOW;
  state.system.recoveryMode = recoveryRequested_;
  bootMs_ = millis();

  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = 8000;
  cfg.idle_core_mask = (1U << portNUM_PROCESSORS) - 1U;
  cfg.trigger_panic = true;
  esp_err_t rc = esp_task_wdt_reconfigure(&cfg);
  if (rc != ESP_OK) esp_task_wdt_init(&cfg);
  esp_task_wdt_add(nullptr);
  return recoveryRequested_;
}

void BootGuard::loop(AppState &state) {
  esp_task_wdt_reset();
  state.system.watchdogFeeds++;
  state.system.uptimeSec = millis() / 1000UL;
  state.system.freeHeap = ESP.getFreeHeap();
  state.system.freePsram = ESP.getFreePsram();
  if (!stableMarked_ && !state.system.recoveryMode && millis() - bootMs_ >= STABLE_BOOT_MS) markStable(state);
}

void BootGuard::markStable(AppState &state) {
  // Safe mode intentionally disables integrations. It must never validate an
  // OTA image simply because the reduced recovery environment stayed alive.
  if (state.system.recoveryMode) return;
  prefs_.putUInt("attempts", 0);
  prefs_.putBool("pending", false);
  prefs_.putString("fw", FW_VERSION);
  stableMarked_ = true;
  state.system.stableBoot = true;
  esp_ota_mark_app_valid_cancel_rollback();
}

void BootGuard::clearRecovery(AppState &state) {
  // Give this exact firmware one clean normal-boot attempt without touching
  // user configuration, Wi-Fi credentials, or other NVS namespaces. If the
  // image truly crash-loops, crash-class resets will accumulate again and
  // recovery mode will return automatically.
  prefs_.putUInt("attempts", 0);
  prefs_.putBool("pending", false);
  prefs_.putString("fw", FW_VERSION);
  recoveryRequested_ = false;
  stableMarked_ = false;
  state.system.bootAttempts = 0;
  state.system.recoveryMode = false;
}
'''
if old not in text:
    raise SystemExit('BootGuard implementation marker not found')
services_cpp.write_text(text.replace(old, new, 1))

# 4) Recovery screen becomes actionable rather than trapping the user in a
# generic restart cycle.
text = ino.read_text()
old = '''static void createRecovery() {
  screenRecovery = lv_obj_create(nullptr); styleScreen(screenRecovery); label(screenRecovery, "RECOVERY", &lv_font_montserrat_20, C_RED, 14, 22);
  label(screenRecovery, "Safe mode is active", &lv_font_montserrat_20, C_TEXT, 14, 72, 292);
  recoveryBody = wrapLabel(screenRecovery, "Boot-loop protection disabled integrations. Wi-Fi setup and the web dashboard remain available so you can inspect diagnostics or install known-good firmware.", &lv_font_montserrat_14, C_MUTED, 14, 116, 292);
  button(screenRecovery, "Wi-Fi", 12, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  button(screenRecovery, "System", 166, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_GREEN);
  button(screenRecovery, "Restart", 12, 366, 296, 48, [](lv_event_t*){ ESP.restart(); }, nullptr, C_ORANGE);
}
'''
new = '''static void createRecovery() {
  screenRecovery = lv_obj_create(nullptr); styleScreen(screenRecovery); label(screenRecovery, "RECOVERY", &lv_font_montserrat_20, C_RED, 14, 22);
  label(screenRecovery, "Safe mode is active", &lv_font_montserrat_20, C_TEXT, 14, 72, 292);
  recoveryBody = wrapLabel(screenRecovery, "Boot-loop protection paused integrations. A new firmware version starts with a clean validation epoch. Try Normal Boot clears only the boot-loop counter; Wi-Fi and settings are preserved.", &lv_font_montserrat_14, C_MUTED, 14, 116, 292);
  button(screenRecovery, "Wi-Fi", 12, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::Wifi)), C_BLUE);
  button(screenRecovery, "System", 166, 296, 142, 54, navEvent, reinterpret_cast<void *>(static_cast<intptr_t>(ScreenId::System)), C_GREEN);
  button(screenRecovery, "Try normal boot", 12, 366, 296, 48, [](lv_event_t*){ bootGuard.clearRecovery(state); delay(80); ESP.restart(); }, nullptr, C_ORANGE);
}
'''
if old not in text:
    raise SystemExit('Recovery screen marker not found')
ino.write_text(text.replace(old, new, 1))

print('rc13 recovery guard hardening applied')
