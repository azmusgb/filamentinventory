#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Workshop OS Instrument UI v1 QMI8658 auto orientation"


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing reconstructed source: {rel}")
    return p.read_text(encoding="utf-8")


def save(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old, new, 1)


def add_include(text: str, anchor: str, include: str, label: str) -> str:
    if include in text:
        return text
    return once(text, anchor, anchor + include, label)


AUTO_H = r'''#ifndef WORKSHOP_AUTO_ORIENTATION_H
#define WORKSHOP_AUTO_ORIENTATION_H

#include <Arduino.h>

// WS350-only runtime orientation driven by the onboard QMI8658 accelerometer.
// Persisted dispSettings.rotation remains the manual/fallback orientation.
uint8_t workshopEffectiveRotation();
void workshopAutoOrientationTick();
bool workshopAutoOrientationAvailable();
bool workshopAutoOrientationEnabled();
bool workshopAutoOrientationSetEnabled(bool enabled);
const char* workshopAutoOrientationStatus();

#endif
'''


AUTO_CPP = r'''#include "workshop_auto_orientation.h"

#include "button.h"
#include "display_ui.h"
#include "settings.h"

#if defined(BOARD_IS_WS350)
#include <Wire.h>
#endif

namespace {
#if defined(BOARD_IS_WS350)
static constexpr uint8_t QMI8658_ADDR = 0x6B; // Waveshare 3.5 first-party example
static constexpr uint8_t QMI_WHO_AM_I = 0x00;
static constexpr uint8_t QMI_CTRL1 = 0x02;
static constexpr uint8_t QMI_CTRL2 = 0x03;
static constexpr uint8_t QMI_CTRL5 = 0x06;
static constexpr uint8_t QMI_CTRL7 = 0x08;
static constexpr uint8_t QMI_STATUS0 = 0x2E;
static constexpr uint8_t QMI_AX_L = 0x35;
static constexpr uint8_t QMI_CHIP_ID = 0x05;

// 2 g range => 16384 LSB/g. 31.25 Hz ODR and LPF mode 3 are intentionally
// quiet for UI orientation. The product is not using gyro data here.
static constexpr int32_t ONE_G = 16384;
static constexpr int32_t GRAVITY_MIN = (ONE_G * 65) / 100;
static constexpr int32_t GRAVITY_MAX = (ONE_G * 135) / 100;
static constexpr int32_t DOMINANT_MIN = (ONE_G * 65) / 100;
static constexpr int32_t DOMINANCE_MARGIN = (ONE_G * 12) / 100;
static constexpr uint32_t SAMPLE_MS = 80;
static constexpr uint32_t STABLE_MS = 600;
static constexpr uint32_t AMBIGUITY_GRACE_MS = 150;
static constexpr uint16_t MIN_SAMPLES = 6;

// The exact 3.5-inch mounting direction still requires physical acceptance.
// Keep this single constant explicit so a hardware finding is one coherent
// correction rather than a scatter of axis inversions. 1 = 90 degrees CW.
static constexpr uint8_t QMI_TO_DISPLAY_QUARTER_TURNS = 1;

static bool g_probeAttempted = false;
static bool g_sensorReady = false;
static int8_t g_runtimeRotation = -1;
static uint32_t g_lastSampleMs = 0;
static int32_t g_fx = 0, g_fy = 0, g_fz = 0;
static bool g_filterValid = false;
static int8_t g_candidate = -1;
static uint32_t g_candidateSinceMs = 0;
static uint32_t g_candidateLastSupportedMs = 0;
static uint16_t g_candidateSamples = 0;

static int32_t abs32(int32_t v) { return v < 0 ? -v : v; }

static bool qmiWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(QMI8658_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission(true) == 0;
}

static bool qmiRead(uint8_t reg, uint8_t* out, size_t len) {
  if (!out || !len) return false;
  Wire.beginTransmission(QMI8658_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  const size_t got = Wire.requestFrom(QMI8658_ADDR, (uint8_t)len, (uint8_t)true);
  if (got != len) return false;
  for (size_t i=0; i<len; ++i) out[i] = (uint8_t)Wire.read();
  return true;
}

static bool qmiInit() {
  if (g_probeAttempted) return g_sensorReady;
  g_probeAttempted = true;

  uint8_t id = 0;
  if (!qmiRead(QMI_WHO_AM_I, &id, 1) || id != QMI_CHIP_ID) {
    Serial.printf("Workshop auto orientation: QMI8658 unavailable (WHO_AM_I=0x%02X)\n", id);
    return false;
  }

  // Auto-increment, accel 2g @31.25 Hz, accel LPF mode 3, accel only.
  if (!qmiWrite(QMI_CTRL1, 0x40) ||
      !qmiWrite(QMI_CTRL2, 0x08) ||
      !qmiWrite(QMI_CTRL5, 0x07) ||
      !qmiWrite(QMI_CTRL7, 0x01)) {
    Serial.println("Workshop auto orientation: QMI8658 configuration failed");
    return false;
  }

  g_sensorReady = true;
  Serial.println("Workshop auto orientation: QMI8658 ready");
  return true;
}

static bool qmiReadAccel(int32_t& x, int32_t& y, int32_t& z) {
  uint8_t status = 0;
  if (!qmiRead(QMI_STATUS0, &status, 1) || (status & 0x01U) == 0) return false;
  uint8_t b[6] = {0};
  if (!qmiRead(QMI_AX_L, b, sizeof(b))) return false;
  const int16_t rx = (int16_t)((uint16_t)b[1] << 8 | b[0]);
  const int16_t ry = (int16_t)((uint16_t)b[3] << 8 | b[2]);
  const int16_t rz = (int16_t)((uint16_t)b[5] << 8 | b[4]);
  x = rx; y = ry; z = rz;
  return true;
}

static void resetCandidate() {
  g_candidate = -1;
  g_candidateSinceMs = 0;
  g_candidateLastSupportedMs = 0;
  g_candidateSamples = 0;
}

static bool plausibleGravity(int32_t x, int32_t y, int32_t z) {
  const int64_t mag2 = (int64_t)x*x + (int64_t)y*y + (int64_t)z*z;
  return mag2 >= (int64_t)GRAVITY_MIN*GRAVITY_MIN &&
         mag2 <= (int64_t)GRAVITY_MAX*GRAVITY_MAX;
}

static int8_t classifySensorRotation(bool& ambiguous) {
  const int32_t ax = abs32(g_fx), ay = abs32(g_fy);
  const int32_t dominant = ax > ay ? ax : ay;
  const int32_t secondary = ax > ay ? ay : ax;
  ambiguous = false;
  if (dominant < DOMINANT_MIN) return -1; // flat or not held upright enough
  if (dominant - secondary < DOMINANCE_MARGIN) {
    ambiguous = true;
    return -1;
  }
  if (ax > ay) return g_fx > 0 ? 3 : 1; // sensor 270 / 90
  return g_fy > 0 ? 0 : 2;              // sensor 0 / 180
}

static void commitRuntimeRotation(uint8_t sensorRotation) {
  const uint8_t next = (uint8_t)((sensorRotation + QMI_TO_DISPLAY_QUARTER_TURNS) & 3U);
  if (g_runtimeRotation == (int8_t)next) return;
  g_runtimeRotation = (int8_t)next;
  Serial.printf("Workshop auto orientation: runtime rotation R%u\n", (unsigned)next);
  // Runtime-only: apply panel + touch geometry but deliberately do not save.
  applyDisplaySettings();
}
#endif
} // namespace

uint8_t workshopEffectiveRotation() {
#if defined(BOARD_IS_WS350)
  if (dispSettings.autoOrientation && g_sensorReady && g_runtimeRotation >= 0)
    return (uint8_t)g_runtimeRotation;
#endif
  return (uint8_t)(dispSettings.rotation & 3U);
}

bool workshopAutoOrientationAvailable() {
#if defined(BOARD_IS_WS350)
  return qmiInit();
#else
  return false;
#endif
}

bool workshopAutoOrientationEnabled() {
#if defined(BOARD_IS_WS350)
  return dispSettings.autoOrientation;
#else
  return false;
#endif
}

bool workshopAutoOrientationSetEnabled(bool enabled) {
#if defined(BOARD_IS_WS350)
  if (enabled && !qmiInit()) return false;
  if (dispSettings.autoOrientation == enabled) return true;
  dispSettings.autoOrientation = enabled;
  if (!enabled) {
    g_runtimeRotation = -1;
    g_filterValid = false;
    resetCandidate();
  }
  saveSettings();
  applyDisplaySettings();
  return true;
#else
  (void)enabled;
  return false;
#endif
}

const char* workshopAutoOrientationStatus() {
#if defined(BOARD_IS_WS350)
  if (!g_probeAttempted) qmiInit();
  if (!g_sensorReady) return "QMI8658 NOT FOUND";
  if (!dispSettings.autoOrientation) return "QMI8658 READY";
  if (g_runtimeRotation < 0) return "AUTO - WAITING STABLE";
  static char label[24];
  snprintf(label, sizeof(label), "AUTO - R%u", (unsigned)g_runtimeRotation);
  return label;
#else
  return "NOT SUPPORTED";
#endif
}

void workshopAutoOrientationTick() {
#if defined(BOARD_IS_WS350)
  if (!dispSettings.autoOrientation || !qmiInit()) return;
  // Never rotate under a held finger. A touch that began in one geometry must
  // finish in that geometry.
  if (isButtonHeld()) return;

  const uint32_t now = millis();
  if (now - g_lastSampleMs < SAMPLE_MS) return;
  g_lastSampleMs = now;

  int32_t x=0,y=0,z=0;
  if (!qmiReadAccel(x,y,z) || !plausibleGravity(x,y,z)) {
    g_filterValid = false;
    resetCandidate();
    return;
  }

  if (!g_filterValid) {
    g_fx=x; g_fy=y; g_fz=z; g_filterValid=true;
  } else {
    g_fx=(g_fx*3+x)/4; g_fy=(g_fy*3+y)/4; g_fz=(g_fz*3+z)/4;
  }

  bool ambiguous=false;
  const int8_t observed=classifySensorRotation(ambiguous);
  if (observed < 0) {
    if (!ambiguous || g_candidate < 0 || now-g_candidateLastSupportedMs > AMBIGUITY_GRACE_MS)
      resetCandidate();
    return;
  }

  const uint8_t effectiveNow = workshopEffectiveRotation();
  const uint8_t displayObserved = (uint8_t)((observed + QMI_TO_DISPLAY_QUARTER_TURNS) & 3U);
  if (displayObserved == effectiveNow) {
    resetCandidate();
    return;
  }

  if (observed != g_candidate) {
    g_candidate = observed;
    g_candidateSinceMs = now;
    g_candidateLastSupportedMs = now;
    g_candidateSamples = 1;
    return;
  }

  g_candidateLastSupportedMs = now;
  if (g_candidateSamples < 0xFFFFU) ++g_candidateSamples;
  if (g_candidateSamples < MIN_SAMPLES || now-g_candidateSinceMs < STABLE_MS) return;

  commitRuntimeRotation((uint8_t)observed);
  resetCandidate();
#endif
}
'''


def patch_settings(root: Path) -> None:
    rel = "src/settings.h"
    text = load(root, rel)
    if "bool     autoOrientation;" not in text:
        text = once(
            text,
            "  uint8_t  rotation;       // 0, 1, 2, 3 (x90 degrees)\n",
            "  uint8_t  rotation;       // 0, 1, 2, 3 (x90 degrees)\n"
            "  bool     autoOrientation; // WS350 QMI8658 runtime orientation; rotation remains manual fallback\n",
            "DisplaySettings autoOrientation field",
        )
        save(root, rel, text)

    rel = "src/settings.cpp"
    text = load(root, rel)
    if "ds.autoOrientation = false;" not in text:
        text = once(text, "  ds.rotation = 0;\n", "  ds.rotation = 0;\n  ds.autoOrientation = false;\n", "autoOrientation default")
    if 'prefs.getBool("dsp_arot"' not in text:
        text = once(
            text,
            '  dispSettings.rotation = prefs.getUChar("dsp_rot", def.rotation);\n',
            '  dispSettings.rotation = prefs.getUChar("dsp_rot", def.rotation);\n'
            '  dispSettings.autoOrientation = prefs.getBool("dsp_arot", def.autoOrientation);\n',
            "autoOrientation load",
        )
    if 'prefs.putBool("dsp_arot"' not in text:
        text = once(
            text,
            '  prefs.putUChar("dsp_rot", dispSettings.rotation);\n',
            '  prefs.putUChar("dsp_rot", dispSettings.rotation);\n'
            '  prefs.putBool("dsp_arot", dispSettings.autoOrientation);\n',
            "autoOrientation save",
        )
    save(root, rel, text)


def patch_effective_rotation(root: Path) -> None:
    # Rendering/layout code must consume effective orientation. Persistence and
    # web configuration intentionally keep using dispSettings.rotation.
    targets = (
        "src/display_ui.cpp",
        "src/display_split.cpp",
        "src/camera_client.cpp",
        "src/display_gauges.cpp",
    )
    for rel in targets:
        text = load(root, rel)
        if '"workshop_auto_orientation.h"' not in text:
            # Every target includes settings.h in the current authoritative line.
            text = add_include(text, '#include "settings.h"\n', '#include "workshop_auto_orientation.h"\n', f"{rel} auto-orientation include")
        text = text.replace("dispSettings.rotation", "workshopEffectiveRotation()")
        save(root, rel, text)

    rel = "src/display_ui.cpp"
    text = load(root, rel)
    if "workshopAutoOrientationTick();" not in text:
        text = once(
            text,
            "void updateDisplay() {\n",
            "void updateDisplay() {\n  workshopAutoOrientationTick();\n",
            "orientation tick",
        )
    save(root, rel, text)


def patch_rotation_modal(root: Path) -> None:
    rel = "src/smart_hub.cpp"
    text = load(root, rel)
    if MARKER in text:
        return
    text = add_include(text, '#include "settings.h"\n', '#include "workshop_auto_orientation.h"\n', "smart hub auto-orientation include")

    old_draw = r'''static void hubRc2DrawRotationPreview() {
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY","ROTATION",3);
  hubRc2CardRef(10,66,225,70,"CURRENT",hubRotationLabel(),
                "Persisted orientation",UI_CYAN);
  hubRc2CardRef(245,66,225,70,"PREVIEW",hubRc2RotationValueLabel(g_rotationPreviewValue),
                "Staged - not applied",UI_ORANGE);
  hubRc2ButtonRef(10,146,460,40,"GUARDED - TOUCH MAPPING CHANGES WITH ROTATION",UI_ORANGE);
  hubRc2ButtonRef(10,196,220,52,"< PREV",UI_CYAN);
  hubRc2ButtonRef(250,196,220,52,"NEXT >",UI_CYAN);
  hubRc2ButtonRef(10,258,140,52,"CANCEL",UI_DIM);
  hubRc2ButtonRef(160,258,310,52,"HOLD TO COMMIT ROTATION",UI_ORANGE);
  hubMarkFrameDirty();
  g_dirty=false;
}'''
    new_draw = r'''static void hubRc2DrawRotationPreview() {
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY","ROTATION",3);
  const bool autoOn=workshopAutoOrientationEnabled();
  char effective[8];snprintf(effective,sizeof(effective),"R%u",(unsigned)workshopEffectiveRotation());
  hubRc2CardRef(10,66,225,70,"MANUAL BASE",hubRotationLabel(),
                "Persisted fallback",UI_CYAN);
  hubRc2CardRef(245,66,225,70,autoOn?"EFFECTIVE":"PREVIEW",
                autoOn?effective:hubRc2RotationValueLabel(g_rotationPreviewValue),
                autoOn?workshopAutoOrientationStatus():"Staged - not applied",autoOn?UI_GREEN:UI_ORANGE);
  hubRc2ButtonRef(10,146,220,42,autoOn?"AUTO ORIENT: ON":"AUTO ORIENT: OFF",
                  autoOn?UI_GREEN:UI_CYAN,workshopAutoOrientationAvailable());
  hubRc2ButtonRef(250,146,220,42,workshopAutoOrientationStatus(),
                  workshopAutoOrientationAvailable()?UI_GREEN:UI_RED,false);
  hubRc2ButtonRef(10,196,220,52,"< PREV",UI_CYAN,!autoOn);
  hubRc2ButtonRef(250,196,220,52,"NEXT >",UI_CYAN,!autoOn);
  hubRc2ButtonRef(10,258,140,52,"CANCEL",UI_DIM);
  hubRc2ButtonRef(160,258,310,52,"HOLD COMMIT MANUAL",UI_ORANGE,!autoOn);
  hubMarkFrameDirty();
  g_dirty=false;
}'''
    text = once(text, old_draw, new_draw, "rotation modal renderer")

    old_touch = r'''      if(g_rotationPreviewMode){
        if(hubRc2HitRef(x,y,10,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+3U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,250,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+1U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,258,140,52)){
          g_rotationPreviewMode=false;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,160,258,310,52)){
          if(longPress){
            dispSettings.rotation=(uint8_t)(g_rotationPreviewValue&3U);
            g_rotationPreviewMode=false;
            hubPersistDisplayExpert();
          }else{
            buzzerPlay(BUZZ_CLICK);g_dirty=true;
          }
          return true;
        }
        return true;
      }'''
    new_touch = r'''      if(g_rotationPreviewMode){
        if(hubRc2HitRef(x,y,10,146,220,42)){
          if(workshopAutoOrientationSetEnabled(!workshopAutoOrientationEnabled())){
            g_rotationPreviewValue=(uint8_t)(dispSettings.rotation&3U);
            buzzerPlay(BUZZ_CLICK);g_dirty=true;
          }else{
            buzzerPlay(BUZZ_CLICK);g_dirty=true;
          }
          return true;
        }
        if(!workshopAutoOrientationEnabled()&&hubRc2HitRef(x,y,10,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+3U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(!workshopAutoOrientationEnabled()&&hubRc2HitRef(x,y,250,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+1U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,258,140,52)){
          g_rotationPreviewMode=false;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(!workshopAutoOrientationEnabled()&&hubRc2HitRef(x,y,160,258,310,52)){
          if(longPress){
            dispSettings.rotation=(uint8_t)(g_rotationPreviewValue&3U);
            g_rotationPreviewMode=false;
            hubPersistDisplayExpert();
          }else{
            buzzerPlay(BUZZ_CLICK);g_dirty=true;
          }
          return true;
        }
        return true;
      }'''
    text = once(text, old_touch, new_touch, "rotation modal touch")
    text += f"\n// {MARKER}\n"
    save(root, rel, text)


def write_module(root: Path) -> None:
    save(root, "src/workshop_auto_orientation.h", AUTO_H)
    save(root, "src/workshop_auto_orientation.cpp", AUTO_CPP)


def assert_secure(root: Path) -> None:
    combined = "\n".join(load(root, rel) for rel in (
        "include/smart_home_build.h", "src/security_manager.cpp", "web/app.js"))
    for forbidden in (
        "WORKSHOP_OS_TEMP_LAN_OPEN",
        "TEMPORARY TRUSTED-LAN MODE",
        "if (!isAPMode()) return true;",
        "v1123Rc2LanOpenBanner",
    ):
        if forbidden in combined:
            raise PatchError(f"auto orientation refuses insecure reconstruction: {forbidden}")


def verify(root: Path) -> None:
    assert_secure(root)
    build = load(root, "include/smart_home_build.h")
    if "Instrument UI Prototype" not in build:
        raise PatchError("auto orientation must be applied after Instrument UI v1")
    settings_h = load(root, "src/settings.h")
    settings_cpp = load(root, "src/settings.cpp")
    hub = load(root, "src/smart_hub.cpp")
    auto = load(root, "src/workshop_auto_orientation.cpp")
    for needle in (
        "bool     autoOrientation;",
        'prefs.getBool("dsp_arot"',
        'prefs.putBool("dsp_arot"',
    ):
        if needle not in settings_h + settings_cpp:
            raise PatchError(f"settings invariant missing: {needle}")
    for needle in (
        "QMI8658_ADDR = 0x6B",
        "QMI_CHIP_ID = 0x05",
        "STABLE_MS = 600",
        "isButtonHeld()",
        "applyDisplaySettings();",
        "Runtime-only: apply panel + touch geometry but deliberately do not save",
    ):
        if needle not in auto:
            raise PatchError(f"orientation invariant missing: {needle}")
    if "saveSettings();\n  applyDisplaySettings();" in auto.split("static void commitRuntimeRotation",1)[-1].split("#endif",1)[0]:
        raise PatchError("runtime orientation must not persist automatic rotation")
    for rel in ("src/display_ui.cpp","src/display_split.cpp","src/camera_client.cpp","src/display_gauges.cpp"):
        body=load(root,rel)
        if "dispSettings.rotation" in body:
            raise PatchError(f"{rel}: rendering still bypasses effective orientation")
        if "workshopEffectiveRotation()" not in body:
            raise PatchError(f"{rel}: effective orientation not consumed")
    for needle in (
        MARKER,
        "AUTO ORIENT: ON",
        "AUTO ORIENT: OFF",
        "HOLD COMMIT MANUAL",
        "workshopAutoOrientationSetEnabled",
    ):
        if needle not in hub:
            raise PatchError(f"rotation modal invariant missing: {needle}")


def apply(root: Path) -> None:
    assert_secure(root)
    build = load(root, "include/smart_home_build.h")
    if "Smart Home v11.23 Instrument UI Prototype" not in build:
        raise PatchError("QMI8658 auto orientation requires Instrument UI v1 reconstructed source")
    patch_settings(root)
    write_module(root)
    patch_effective_rotation(root)
    patch_rotation_modal(root)
    verify(root)
    print("Workshop Instrument UI v1 QMI8658 auto orientation applied")


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args=ap.parse_args()
    if not args.apply:
        raise SystemExit("refusing to modify reconstructed source without --apply")
    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
