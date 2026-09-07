#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_backend_header(repo: Path) -> None:
    p = repo / "src" / "button_touch_backend.h"
    text = p.read_text(encoding="utf-8")
    anchor = "TouchPoll touchPoll();\n\n#endif  // BUTTON_TOUCH_BACKEND_H\n"
    repl = """TouchPoll touchPoll();

#if defined(USE_FT6336)
// WS350/FT6336 health counters. These distinguish a configured touchscreen
// from a controller that is actually answering runtime polls.
uint32_t touchReadFailureCount();
uint32_t touchRecoveryCount();
uint32_t touchLastGoodPollMs();
#endif

#endif  // BUTTON_TOUCH_BACKEND_H
"""
    text = replace_once(text, anchor, repl, "touch health API")
    p.write_text(text, encoding="utf-8")


def patch_focaltech(repo: Path) -> None:
    p = repo / "src" / "button_touch_focaltech.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "static bool busReady = false;\nstatic bool seen = false;\n",
        """static bool busReady = false;
static bool seen = false;
static bool edgeDown = false;
static uint8_t consecutiveReadFailures = 0;
static uint32_t totalReadFailures = 0;
static uint32_t busRecoveryCount = 0;
static uint32_t lastGoodPollMs = 0;
static uint32_t lastRecoveryAttemptMs = 0;

#if defined(USE_FT6336)
static void ft6336RecoverBus() {
  // WS350 shares this I2C bus with the TCA9554 LCD-reset expander. Rebind the
  // same pins/clock only; never pulse LCD reset and never reset the FT6336.
  // This repairs a controller path that becomes unreadable after another I2C
  // user or transient bus fault without disturbing the rendered frame.
  const uint32_t now = millis();
  if (lastRecoveryAttemptMs && (uint32_t)(now - lastRecoveryAttemptMs) < 250) return;
  lastRecoveryAttemptMs = now;
  Wire.end();
  delay(2);
  Wire.begin(FT6336_SDA, FT6336_SCL);
  Wire.setClock(400000);
  busReady = true;
  ++busRecoveryCount;
  Serial.printf("FocalTech touch: I2C recovery #%lu on SDA=%d SCL=%d\\n",
                (unsigned long)busRecoveryCount, FT6336_SDA, FT6336_SCL);
}
#endif
""",
        "focaltech reliability state",
    )

    init_anchor = """void touchInit() {
#if defined(USE_FT6336)
"""
    init_repl = """void touchInit() {
  // Reinitialization must also reset the backend edge state. Recovery can call
  // initButton() at runtime, and retaining a stale held edge would make the UI
  // appear dead even after the bus/controller was successfully reinitialized.
  edgeDown = false;
  consecutiveReadFailures = 0;
  lastGoodPollMs = 0;
#if defined(USE_FT6336)
"""
    text = replace_once(text, init_anchor, init_repl, "touch init state reset")

    old_poll = """TouchPoll touchPoll() {
  if (!busReady) return {TouchEvent::Unavailable, false};
  uint8_t touchPoints = 0;
  if (!ft5x06ReadReg(FT5X06_TOUCH_POINTS_REG, touchPoints)) return {TouchEvent::Unavailable, false};
  if (!seen) {
    Serial.printf("FocalTech touch became responsive at runtime (addr 0x%02X)\\n", TOUCH_SLAVE_ADDRESS);
    seen = true;
  }
  // TD_STATUS low nibble = active touch points; mask off reserved high bits.
  const bool down = (touchPoints & 0x0F) > 0;
  if (down) {
    uint16_t x = 0, y = 0;
    if (ft5x06ReadPoint(x, y))
      return {TouchEvent::None, true, x, y, true};
  }
  return {TouchEvent::None, down};
}
"""
    new_poll = """TouchPoll touchPoll() {
  if (!busReady) {
#if defined(USE_FT6336)
    ft6336RecoverBus();
#endif
    return {TouchEvent::Unavailable, false};
  }

  uint8_t touchPoints = 0;
  if (!ft5x06ReadReg(FT5X06_TOUCH_POINTS_REG, touchPoints)) {
    ++totalReadFailures;
    if (consecutiveReadFailures < 255) ++consecutiveReadFailures;
#if defined(USE_FT6336)
    // A handful of failed reads is enough to prove the runtime path is unhealthy,
    // but not enough to justify a reboot or a display reset. Rebind I2C in-place.
    if (consecutiveReadFailures >= 3) {
      ft6336RecoverBus();
      consecutiveReadFailures = 0;
    }
#endif
    return {TouchEvent::Unavailable, false};
  }

  consecutiveReadFailures = 0;
  lastGoodPollMs = millis();
  if (!seen) {
    Serial.printf("FocalTech touch became responsive at runtime (addr 0x%02X)\\n", TOUCH_SLAVE_ADDRESS);
    seen = true;
  }

  // Capacitive FocalTech panels do not need the generic 50 ms GPIO debounce.
  // Convert the sampled level into explicit edges so even a short tap observed
  // for one loop iteration is accepted immediately. This matters on the richer
  // Smart Home renderer where a frame/service iteration can exceed the old
  // debounce window.
  const bool down = (touchPoints & 0x0F) > 0;
  uint16_t x = 0, y = 0;
  const bool hasPoint = down && ft5x06ReadPoint(x, y);

  if (down && !edgeDown) {
    edgeDown = true;
    return {TouchEvent::Pressed, true, x, y, hasPoint};
  }
  if (!down && edgeDown) {
    edgeDown = false;
    return {TouchEvent::Released, false};
  }
  return {TouchEvent::None, down, x, y, hasPoint};
}

#if defined(USE_FT6336)
uint32_t touchReadFailureCount() { return totalReadFailures; }
uint32_t touchRecoveryCount() { return busRecoveryCount; }
uint32_t touchLastGoodPollMs() { return lastGoodPollMs; }
#endif
"""
    text = replace_once(text, old_poll, new_poll, "edge-managed self-healing FocalTech polling")
    p.write_text(text, encoding="utf-8")


def patch_button(repo: Path) -> None:
    p = repo / "src" / "button.cpp"
    text = p.read_text(encoding="utf-8")

    old_init = """void initButton() {
  if (buttonType == BTN_DISABLED) return;
  sanitizeButtonPin();
  if (buttonType == BTN_TOUCHSCREEN) {
    touchInit();  // bus/pins + first probe live in the selected backend
    return;
  }
"""
    new_init = """void initButton() {
  // Reset the shared state for every initialization path, including capacitive
  // touch. Previously the touchscreen branch returned before clearing these
  // values, so /recovery/touch could reinitialize a healthy FT6336 while the
  // button layer remained logically stuck in its previous held/debounce state.
  lastRaw = false;
  stableState = false;
  lastChangeMs = 0;
  pressStartMs = 0;
  lastTouchPositionValid = false;

  if (buttonType == BTN_DISABLED) return;
  sanitizeButtonPin();
  if (buttonType == BTN_TOUCHSCREEN) {
    touchInit();  // bus/pins + first probe live in the selected backend
    return;
  }
"""
    text = replace_once(text, old_init, new_init, "reset touchscreen shared state")

    old_cache = """    if (tp.hasPosition) {
      lastTouchX = tp.x;
      lastTouchY = tp.y;
      lastTouchPositionValid = true;
    }
    // A failed bus/read must NOT disturb debounce or hold state - it is not a
"""
    new_cache = """    if (tp.hasPosition) {
      lastTouchX = tp.x;
      lastTouchY = tp.y;
      lastTouchPositionValid = true;
    } else if (tp.ev == TouchEvent::Pressed) {
      // Never route a new press using coordinates cached from an older touch.
      lastTouchPositionValid = false;
    }
    // A failed bus/read must NOT disturb debounce or hold state - it is not a
"""
    text = replace_once(text, old_cache, new_cache, "invalidate stale coordinate cache")

    p.write_text(text, encoding="utf-8")

    p = repo / "src" / "button.h"
    text = p.read_text(encoding="utf-8")
    anchor = "bool buttonGetTouchPosition(uint16_t* x, uint16_t* y);\n\n#endif // BUTTON_H\n"
    repl = """bool buttonGetTouchPosition(uint16_t* x, uint16_t* y);

#if defined(USE_FT6336)
uint32_t buttonTouchReadFailures();
uint32_t buttonTouchRecoveryCount();
uint32_t buttonTouchLastGoodPollMs();
#endif

#endif // BUTTON_H
"""
    text = replace_once(text, anchor, repl, "button touch health declarations")
    p.write_text(text, encoding="utf-8")

    p = repo / "src" / "button.cpp"
    text = p.read_text(encoding="utf-8")
    anchor = """uint32_t buttonPressCount() {
  return pressCounter;
}
"""
    repl = anchor + """
#if defined(USE_FT6336)
uint32_t buttonTouchReadFailures() { return touchReadFailureCount(); }
uint32_t buttonTouchRecoveryCount() { return touchRecoveryCount(); }
uint32_t buttonTouchLastGoodPollMs() { return touchLastGoodPollMs(); }
#endif
"""
    text = replace_once(text, anchor, repl, "button touch health wrappers")
    p.write_text(text, encoding="utf-8")


def patch_recovery_status(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    old_status = 'static void handleRecoveryStatus(){JsonDocument d;d["build"]=SMART_HOME_BUILD_LABEL;d["safeMode"]=recoverySafeModeActive();d["ip"]=isAPMode()?WiFi.softAPIP().toString():WiFi.localIP().toString();d["touch"]=buttonType==BTN_TOUCHSCREEN?"FT6336 · FORCED ON":"NOT READY";d["runningSlot"]=recoveryCurrentSlot();d["knownGood"]=recoveryKnownGoodSlot();d["fallback"]=recoveryFallbackSlot();d["candidatePending"]=recoveryCandidatePending();d["candidateAttempts"]=recoveryCandidateAttempts();d["webReady"]=recoveryWebReady();d["rapidBootCount"]=recoveryRapidBootCount();String o;serializeJson(d,o);server.sendHeader("Cache-Control","no-store");server.send(200,"application/json",o);}'
    new_status = '''static void handleRecoveryStatus(){JsonDocument d;d["build"]=SMART_HOME_BUILD_LABEL;d["safeMode"]=recoverySafeModeActive();d["ip"]=isAPMode()?WiFi.softAPIP().toString():WiFi.localIP().toString();d["touch"]=buttonType==BTN_TOUCHSCREEN?"FT6336 · FORCED ON":"NOT READY";
#if defined(USE_FT6336)
  const uint32_t touchLast=buttonTouchLastGoodPollMs();
  d["touchResponsive"]=touchLast>0 && (uint32_t)(millis()-touchLast)<2000;
  d["touchReadFailures"]=buttonTouchReadFailures();
  d["touchRecoveries"]=buttonTouchRecoveryCount();
  d["touchPresses"]=buttonPressCount();
#endif
  d["runningSlot"]=recoveryCurrentSlot();d["knownGood"]=recoveryKnownGoodSlot();d["fallback"]=recoveryFallbackSlot();d["candidatePending"]=recoveryCandidatePending();d["candidateAttempts"]=recoveryCandidateAttempts();d["webReady"]=recoveryWebReady();d["rapidBootCount"]=recoveryRapidBootCount();String o;serializeJson(d,o);server.sendHeader("Cache-Control","no-store");server.send(200,"application/json",o);}'''
    text = replace_once(text, old_status, new_status, "recovery touch health JSON")

    old_rows = "['IP',d.ip],['Touch',d.touch],['Running slot',d.runningSlot]"
    new_rows = "['IP',d.ip],['Touch',d.touch],['Touch health',d.touchResponsive===undefined?'—':(d.touchResponsive?'RESPONDING':'NO RECENT POLL')],['Touch presses',d.touchPresses===undefined?'—':d.touchPresses],['Touch read failures',d.touchReadFailures===undefined?'—':d.touchReadFailures],['Touch recoveries',d.touchRecoveries===undefined?'—':d.touchRecoveries],['Running slot',d.runningSlot]"
    text = replace_once(text, old_rows, new_rows, "recovery touch health rows")
    p.write_text(text, encoding="utf-8")


def patch_identity(repo: Path) -> None:
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    # The v9.7 interaction stack historically preserved the v9.4 recovery
    # provenance macros even though the interaction/layout code was newer. The
    # hardware regression investigation exposed that stale identity directly in
    # /recovery/status. v9.7.1 makes the composed firmware identity truthful.
    text = replace_once(text, '#define SMART_HOME_VERSION "v9.4"\n', '#define SMART_HOME_VERSION "v9.7.1"\n', "version")
    text = replace_once(text, '#define SMART_HOME_PROFILE "recovery-foundation-control-plane"\n', '#define SMART_HOME_PROFILE "interaction-layout-touch-reliability"\n', "profile")
    text = replace_once(text, '#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC3"\n', '#define SMART_HOME_BUILD_LABEL "Smart Home v9.7.1 Touch Reliability RC2"\n', "build label")
    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_backend_header(repo)
    patch_focaltech(repo)
    patch_button(repo)
    patch_recovery_status(repo)
    patch_identity(repo)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print("Smart Home v9.7.1 Touch Reliability patch ready. Use --apply.")
        return 0
    apply(repo)
    print("Smart Home v9.7.1 Touch Reliability applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
