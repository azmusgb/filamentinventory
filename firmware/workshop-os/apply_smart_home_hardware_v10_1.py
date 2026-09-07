#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(repo: Path, rel: str) -> str:
    path = repo / rel
    if not path.exists():
        raise PatchError(f"missing required file: {rel}")
    return path.read_text()


def save(repo: Path, rel: str, text: str) -> None:
    (repo / rel).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_build(repo: Path) -> None:
    rel = "include/smart_home_build.h"
    text = load(repo, rel)
    text = replace_once(text, '#define SMART_HOME_VERSION "v10.0"', '#define SMART_HOME_VERSION "v10.1"', "build version")
    text = replace_once(text, '#define SMART_HOME_PROFILE "workshop-os-graphite-ember"', '#define SMART_HOME_PROFILE "workshop-os-hardware-audio"', "build profile")
    text = replace_once(text, '#define SMART_HOME_BUILD_LABEL "Smart Home v10.0 Workshop OS Theme RC1"', '#define SMART_HOME_BUILD_LABEL "Smart Home v10.1 Hardware + Audio RC1"', "build label")
    save(repo, rel, text)


def patch_board(repo: Path) -> None:
    rel = "boards/ws_lcd_350.ini"
    text = load(repo, rel)
    anchor = "    -D FT6336_SDA=8\n    -D FT6336_SCL=7\n"
    block = anchor + """    ; --- ES8311 speaker + onboard microphone (Waveshare factory pin map) ---
    -D BOARD_HAS_ES8311_AUDIO=1
    -D BOARD_HAS_MICROPHONE=1
    -D AUDIO_I2C_ADDR=0x18
    -D AUDIO_I2C_SDA=8
    -D AUDIO_I2C_SCL=7
    -D AUDIO_I2S_PORT=0
    -D AUDIO_I2S_MCLK=12
    -D AUDIO_I2S_BCLK=13
    -D AUDIO_I2S_LRC=15
    -D AUDIO_I2S_DIN=14
    -D AUDIO_I2S_DOUT=16
    -D AUDIO_PA_CTRL=-1
    ; Capability metadata only; driver activation is intentionally deferred.
    -D BOARD_HAS_BLE5=1
    -D BOARD_HAS_AXP2101_HW=1
    -D BOARD_HAS_PCF85063_HW=1
    -D BOARD_HAS_QMI8658_HW=1
    -D BOARD_HAS_TF_HW=1
"""
    save(repo, rel, replace_once(text, anchor, block, "WS350 hardware flags"))


def patch_buzzer(repo: Path) -> None:
    rel = "src/buzzer.cpp"
    text = load(repo, rel)
    old = "#if defined(BOARD_IS_WS350)\n  // ws_lcd_350 has no buzzer hardware and the GPIO backend drives the pin LOW"
    new = "#if defined(BOARD_IS_WS350) && !defined(BOARD_HAS_ES8311_AUDIO)\n  // Legacy GPIO fallback only. Production WS350 uses its onboard ES8311.\n  // The GPIO backend drives the pin LOW"
    save(repo, rel, replace_once(text, old, new, "WS350 buzzer guard"))


def patch_backend(repo: Path) -> None:
    rel = "src/buzzer_backend.h"
    text = load(repo, rel)
    anchor = "void buzzerBackendShutdown();\n"
    add = anchor + "\n#if defined(BOARD_HAS_MICROPHONE)\nint buzzerBackendMicLevel(uint16_t sampleMs);\n#endif\n"
    save(repo, rel, replace_once(text, anchor, add, "backend mic API"))

    rel = "src/buzzer_backend_es8311.cpp"
    text = load(repo, rel)
    text = replace_once(text,
        "void setAmpEnabled(bool on) {\n  if (gAmpEnabled == on) return;\n  digitalWrite(AUDIO_PA_CTRL, on ? HIGH : LOW);\n  gAmpEnabled = on;\n}",
        """void setAmpEnabled(bool on) {
  if (gAmpEnabled == on) return;
#if AUDIO_PA_CTRL >= 0
  digitalWrite(AUDIO_PA_CTRL, on ? HIGH : LOW);
#endif
  gAmpEnabled = on;
}""", "ES8311 no-PA support")
    text = replace_once(text,
        "  cfg.mode            = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);",
        """#if defined(AUDIO_I2S_DIN) && (AUDIO_I2S_DIN >= 0)
  cfg.mode            = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX);
#else
  cfg.mode            = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
#endif""", "ES8311 full duplex")
    text = replace_once(text,
        "  pins.data_in_num   = I2S_PIN_NO_CHANGE;",
        """#if defined(AUDIO_I2S_DIN) && (AUDIO_I2S_DIN >= 0)
  pins.data_in_num   = AUDIO_I2S_DIN;
#else
  pins.data_in_num   = I2S_PIN_NO_CHANGE;
#endif""", "ES8311 mic DIN")
    text = replace_once(text,
        "void buzzerBackendInit() {\n  pinMode(AUDIO_PA_CTRL, OUTPUT);\n  digitalWrite(AUDIO_PA_CTRL, LOW);",
        """void buzzerBackendInit() {
#if AUDIO_PA_CTRL >= 0
  pinMode(AUDIO_PA_CTRL, OUTPUT);
  digitalWrite(AUDIO_PA_CTRL, LOW);
#endif""", "ES8311 no-PA init")
    tail = """void buzzerBackendShutdown() {
  // Force immediate silence (skip envelope ramp)
  gCurrentGain = 0;
  gTargetGain = 0;
  gPhaseStep = 0;
  gCurrentFreq = 0;
  shutdownAudio();
}

#endif // BOARD_HAS_ES8311_AUDIO"""
    new_tail = """void buzzerBackendShutdown() {
  // Force immediate silence (skip envelope ramp)
  gCurrentGain = 0;
  gTargetGain = 0;
  gPhaseStep = 0;
  gCurrentFreq = 0;
  shutdownAudio();
}

#if defined(BOARD_HAS_MICROPHONE) && defined(AUDIO_I2S_DIN) && (AUDIO_I2S_DIN >= 0)
int buzzerBackendMicLevel(uint16_t sampleMs) {
  if (sampleMs < 80) sampleMs = 80;
  if (sampleMs > 1200) sampleMs = 1200;
  if (!ensureAudioRunning()) return -1;

  int16_t samples[128];
  int32_t peak = 0;
  uint32_t deadline = millis() + sampleMs;
  do {
    size_t bytesRead = 0;
    if (i2s_read((i2s_port_t)AUDIO_I2S_PORT, samples, sizeof(samples),
                 &bytesRead, pdMS_TO_TICKS(25)) != ESP_OK) return -1;
    size_t count = bytesRead / sizeof(samples[0]);
    for (size_t i = 0; i < count; ++i) {
      int32_t v = samples[i];
      if (v < 0) v = -v;
      if (v > peak) peak = v;
    }
    yield();
  } while ((int32_t)(deadline - millis()) > 0);

  if (gTargetGain == 0 && gCurrentGain == 0) gIdleStartMs = millis();
  int level = (int)((peak * 100L) / 32767L);
  return constrain(level, 0, 100);
}
#elif defined(BOARD_HAS_MICROPHONE)
int buzzerBackendMicLevel(uint16_t) { return -1; }
#endif

#endif // BOARD_HAS_ES8311_AUDIO"""
    save(repo, rel, replace_once(text, tail, new_tail, "ES8311 mic meter"))


def patch_web(repo: Path) -> None:
    rel = "src/web_template.cpp"
    text = load(repo, rel)
    anchor = """  if (strcmp(name, "ES8311_AUDIO") == 0) {
    // "1" for any board with built-in I2S audio (no GPIO pin selection needed)
#if defined(BOARD_HAS_ES8311_AUDIO) || defined(BOARD_HAS_NS4168_AUDIO)
    out = "1";
#else
    out = "0";
#endif
    return true;
  }
"""
    add = anchor + """  if (strcmp(name, "MICROPHONE") == 0) {
#if defined(BOARD_HAS_MICROPHONE)
    out = "1";
#else
    out = "0";
#endif
    return true;
  }
"""
    save(repo, rel, replace_once(text, anchor, add, "microphone placeholder"))

    rel = "include/web_pages.h"
    text = load(repo, rel)
    text = replace_once(text,
        '<div class="card-head"><div><h3>Buzzer</h3><p>Passive buzzer. Beeps on print complete and errors.</p></div></div>',
        '<div class="card-head"><div><h3>Sound &amp; microphone</h3><p>Event audio, quiet hours, speaker checks and onboard microphone diagnostics.</p></div></div>',
        "audio card heading")
    text = replace_once(text,
        '<div id="buzEs8311Info" class="help-text" style="display:none">Built-in I2S speaker. No GPIO configuration needed.</div>',
        '<div id="buzEs8311Info" class="help-text" style="display:none">Built-in ES8311 speaker. No buzzer GPIO configuration needed.</div>\n      <div id="micDiagRow" class="field" style="display:none"><label>Onboard microphone</label><div class="hstack" style="gap:var(--sp-2);align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-ghost btn-sm" onclick="testMicrophone()">Test onboard microphone</button><span id="micDiagStatus" class="mono small text-dim" role="status" aria-live="polite">Ready</span></div><span class="text-dim small">Local activity meter only; raw audio is not uploaded.</span></div>',
        "microphone diagnostic UI")
    text = replace_once(text,
        "<script>var DEV={board:'%BOARD%',fw:'%FW_VER%',flashMb:'%FLASHMB%',otaSlot:'%OTASLOT%',round:'%ISROUND%',es8311:'%ES8311_AUDIO%',hmsFull:'%HMSFULL%'};</script>",
        "<script>var DEV={board:'%BOARD%',fw:'%FW_VER%',flashMb:'%FLASHMB%',otaSlot:'%OTASLOT%',round:'%ISROUND%',es8311:'%ES8311_AUDIO%',mic:'%MICROPHONE%',hmsFull:'%HMSFULL%'};</script>",
        "browser device mic flag")
    save(repo, rel, text)

    rel = "web/app.js"
    text = load(repo, rel)
    old = """  document.getElementById('buzEs8311Info').style.display = (buzOn && isES8311) ? 'block' : 'none';
  var btnOn = document.getElementById('btntype').value !== '0';
"""
    new = """  document.getElementById('buzEs8311Info').style.display = (buzOn && isES8311) ? 'block' : 'none';
  var micRow = document.getElementById('micDiagRow');
  if (micRow) micRow.style.display = (buzOn && DEV.mic === '1') ? 'block' : 'none';
  var btnOn = document.getElementById('btntype').value !== '0';
"""
    text = replace_once(text, old, new, "toggle microphone row")
    anchor = "function saveRotation(){\n"
    fn = """function testMicrophone(){
  var status = document.getElementById('micDiagStatus');
  if (!status) return;
  status.textContent = 'Listening…';
  fetch('/audio/mic/test',{method:'POST'})
    .then(readJsonResponse)
    .then(function(d){
      if (d.status !== 'ok' || typeof d.level !== 'number') throw new Error(d.message || 'microphone unavailable');
      status.textContent = 'Input level ' + d.level + '%';
      showToast('Microphone input: ' + d.level + '%');
    })
    .catch(function(e){
      status.textContent = 'Test failed';
      showToast('Microphone test failed: ' + (e && e.message ? e.message : 'unavailable'));
      console.warn('testMicrophone:', e);
    });
}
""" + anchor
    save(repo, rel, replace_once(text, anchor, fn, "microphone JS"))

    rel = "src/web_server.cpp"
    text = load(repo, rel)
    text = replace_once(text, '#include "buzzer.h"\n', '#include "buzzer.h"\n#include "buzzer_backend.h"\n', "web backend include")
    status = """#if defined(BOARD_HAS_PSRAM) || defined(CONFIG_SPIRAM_SUPPORT)
  doc["psram_kb"] = ESP.getPsramSize() / 1024;
#else
  doc["psram_kb"] = 0;
#endif

  String json;
"""
    status_new = """#if defined(BOARD_HAS_PSRAM) || defined(CONFIG_SPIRAM_SUPPORT)
  doc["psram_kb"] = ESP.getPsramSize() / 1024;
#else
  doc["psram_kb"] = 0;
#endif
  JsonObject hw = doc["hardware"].to<JsonObject>();
#if defined(BOARD_HAS_ES8311_AUDIO)
  hw["audio"] = "ES8311";
#endif
#if defined(BOARD_HAS_MICROPHONE)
  hw["microphone"] = true;
#endif
#if defined(BOARD_HAS_BLE5)
  hw["bluetooth"] = "BLE 5 LE";
#endif
#if defined(BOARD_HAS_AXP2101_HW)
  hw["pmic"] = "AXP2101";
#endif
#if defined(BOARD_HAS_PCF85063_HW)
  hw["rtc"] = "PCF85063";
#endif
#if defined(BOARD_HAS_QMI8658_HW)
  hw["imu"] = "QMI8658";
#endif
#if defined(BOARD_HAS_TF_HW)
  hw["tfHardware"] = true;
#endif

  String json;
"""
    text = replace_once(text, status, status_new, "status hardware capabilities")
    handler_anchor = '\n// Parse an "#rrggbb" or "rrggbb" form value into 0xRRGGBB, falling back to the\n'
    mic_handler = """
static void handleAudioMicTest() {
#if defined(BOARD_HAS_MICROPHONE)
  int level = buzzerBackendMicLevel(350);
  if (level < 0) {
    server.send(503, "application/json", "{\\"status\\":\\"error\\",\\"message\\":\\"microphone unavailable\\"}");
    return;
  }
  JsonDocument doc;
  doc["status"] = "ok";
  doc["level"] = level;
  doc["kind"] = "activity";
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
#else
  server.send(404, "application/json", "{\\"status\\":\\"error\\",\\"message\\":\\"microphone not present\\"}");
#endif
}
"""
    text = replace_once(text, handler_anchor, mic_handler + handler_anchor, "microphone endpoint")
    text = replace_once(text, '  SECURE_POST("/buzzer/test", handleBuzzerTest);\n', '  SECURE_POST("/buzzer/test", handleBuzzerTest);\n  SECURE_POST("/audio/mic/test", handleAudioMicTest);\n', "microphone route")
    save(repo, rel, text)


def patch_system_ui(repo: Path) -> None:
    rel = "src/smart_hub.cpp"
    text = load(repo, rel)
    text = replace_once(text, '"TOUCH & RUNTIME"', '"INPUT & AUDIO"', "portrait system heading")
    text = replace_once(text, 'touchOk?"FT6336 responsive":"FT6336 needs attention"', 'touchOk?"FT6336 • ES8311 • microphone":"FT6336 needs attention"', "portrait system summary")
    text = replace_once(text, 'uiSectionLabel(touch.x+10,touch.y+8,"TOUCH",', 'uiSectionLabel(touch.x+10,touch.y+8,"INPUT / AUDIO",', "landscape system heading")
    save(repo, rel, text)


def verify(repo: Path) -> None:
    board = load(repo, "boards/ws_lcd_350.ini")
    backend = load(repo, "src/buzzer_backend_es8311.cpp")
    pages = load(repo, "include/web_pages.h")
    js = load(repo, "web/app.js")
    web = load(repo, "src/web_server.cpp")
    hub = load(repo, "src/smart_hub.cpp")
    build = load(repo, "include/smart_home_build.h")
    for n in ["BOARD_HAS_ES8311_AUDIO=1", "BOARD_HAS_MICROPHONE=1", "AUDIO_I2S_DIN=14", "AUDIO_PA_CTRL=-1", "BOARD_HAS_BLE5=1"]:
        if n not in board: raise PatchError(f"verify board missing {n}")
    for n in ["I2S_MODE_RX", "pins.data_in_num   = AUDIO_I2S_DIN", "buzzerBackendMicLevel", "AUDIO_PA_CTRL >= 0"]:
        if n not in backend: raise PatchError(f"verify backend missing {n}")
    for body, needle in [(pages, "Test onboard microphone"), (js, "function testMicrophone()"), (web, 'SECURE_POST("/audio/mic/test"'), (hub, "INPUT & AUDIO"), (build, '#define SMART_HOME_VERSION "v10.1"')]:
        if needle not in body: raise PatchError(f"verify missing {needle}")
    for needle in ["recoverySha256HexArrayBuffer", 'doc["hasAccessCode"]']:
        if needle not in web: raise PatchError(f"verify inherited web contract missing {needle}")
    if "strong ? UI_PANEL_3 : UI_PANEL" in hub:
        raise PatchError("verify: v10 strong-card mixed background regression")


def apply(repo: Path) -> None:
    patch_build(repo)
    patch_board(repo)
    patch_buzzer(repo)
    patch_backend(repo)
    patch_web(repo)
    patch_system_ui(repo)
    verify(repo)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        print("Smart Home v10.1 Hardware + Audio patch ready. Use --apply.")
        return 0
    apply(Path(args.repo).resolve())
    print("Smart Home v10.1 Hardware + Audio applied and verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
