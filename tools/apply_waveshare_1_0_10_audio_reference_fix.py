from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

app = APP.read_text()
app = replace_once(
    app,
    'static constexpr char FW_VERSION[] = "1.0.9";',
    'static constexpr char FW_VERSION[] = "1.0.10";',
    'firmware version',
)
APP.write_text(app)

cpp = CPP.read_text()
cpp = replace_once(
    cpp,
    '#include <Wire.h>\n#include "TCA9554.h"\n\nextern TCA9554 ioExpander;\n#include <math.h>',
    '#include <Wire.h>\n#include <math.h>',
    'remove speculative TCA9554 audio amp dependency',
)
cpp = replace_once(
    cpp,
    'constexpr uint32_t AUDIO_SAMPLE_RATE = 44100;',
    'constexpr uint32_t AUDIO_SAMPLE_RATE = 48000;\nconstexpr uint32_t AUDIO_MCLK_MULTIPLE = 256;',
    'Waveshare reference audio clock',
)
cpp = replace_once(
    cpp,
'''bool AudioService::begin(const AppConfig &config, AppState &state) {
  volume_ = config.audioVolume;
  state.system.audioReady = false;

  // Waveshare's board support enables the external speaker amplifier through
  // the TCA9554 expander before attempting codec playback. The previous Home
  // firmware configured ES8311/I2S but left the physical output stage off.
  ioExpander.pinMode1(2, OUTPUT);
  ioExpander.write1(2, config.audioEnabled ? 1 : 0);
  delay(20);

  if (!config.audioEnabled) {
    ready_ = false;
    return false;
  }

  handle_ = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
  if (!handle_) {
    ready_ = false;
    return false;
  }

  const es8311_clock_config_t clockCfg = {
    .mclk_inverted = false,
    .sclk_inverted = false,
    .mclk_from_mclk_pin = true,
    .mclk_frequency = AUDIO_SAMPLE_RATE * 256,
    .sample_frequency = AUDIO_SAMPLE_RATE
  };
  if (es8311_init(handle_, &clockCfg, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) {
    ready_ = false;
    return false;
  }
  if (es8311_voice_volume_set(handle_, volume_, nullptr) != ESP_OK ||
      es8311_microphone_config(handle_, false) != ESP_OK ||
      es8311_voice_mute(handle_, false) != ESP_OK) {
    ready_ = false;
    return false;
  }

  i2s_.setPins(I2S_BCLK, I2S_LRCK, I2S_DOUT, I2S_DIN, I2S_MCLK);
  ready_ = i2s_.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT,
                      I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  state.system.audioReady = ready_;
  return ready_;
}''',
'''bool AudioService::begin(const AppConfig &config, AppState &state) {
  volume_ = config.audioVolume;
  state.system.audioReady = false;
  ready_ = false;

  if (!config.audioEnabled) return false;

  // Match Waveshare's known-working ESP32-S3-Touch-LCD-3.5 audio reference:
  // ES8311 on I2C0, 48 kHz, 256x MCLK, 16-bit samples and the documented
  // BCLK/LRCK/SDOUT/MCLK GPIOs. Do not toggle unrelated TCA9554 outputs.
  handle_ = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
  if (!handle_) return false;

  const es8311_clock_config_t clockCfg = {
    .mclk_inverted = false,
    .sclk_inverted = false,
    .mclk_from_mclk_pin = true,
    .mclk_frequency = AUDIO_SAMPLE_RATE * AUDIO_MCLK_MULTIPLE,
    .sample_frequency = AUDIO_SAMPLE_RATE
  };
  if (es8311_init(handle_, &clockCfg, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) return false;
  if (es8311_voice_volume_set(handle_, volume_, nullptr) != ESP_OK) return false;
  if (es8311_microphone_config(handle_, false) != ESP_OK) return false;
  if (es8311_voice_mute(handle_, false) != ESP_OK) return false;

  i2s_.setPins(I2S_BCLK, I2S_LRCK, I2S_DOUT, I2S_DIN, I2S_MCLK);
  ready_ = i2s_.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT,
                      I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  state.system.audioReady = ready_;
  return ready_;
}''',
    'audio begin reference alignment',
)
cpp = replace_once(
    cpp,
'''  server_.on("/audio/test", HTTP_POST, [this]() {
    if (!audio_.ready()) {
      server_.send(503, "text/plain", "Speaker is not initialized. Ensure ES8311 speaker is enabled, save settings, then restart the device.");
      return;
    }
    audio_.chirp(660, 220);
    delay(70);
    audio_.chirp(880, 260);
    server_.send(200, "text/plain", "Speaker test played: two-tone 660/880 Hz");
  });''',
'''  server_.on("/audio/test", HTTP_POST, [this]() {
    if (!audio_.ready()) {
      server_.send(503, "text/plain", "Audio hardware initialization failed. Restart after enabling audio; if this persists, inspect ES8311/I2S diagnostics.");
      return;
    }
    const uint8_t savedVolume = config_->audioVolume;
    const uint8_t testVolume = max<uint8_t>(savedVolume, 85);
    audio_.setVolume(testVolume);
    audio_.chirp(523, 500);
    delay(100);
    audio_.chirp(659, 500);
    delay(100);
    audio_.chirp(784, 650);
    audio_.setVolume(savedVolume);
    server_.send(200, "text/plain", "Speaker diagnostic sent at 48 kHz: C5/E5/G5. Confirm audible output.");
  });''',
    'speaker diagnostic route',
)
CPP.write_text(cpp)
print('Applied Waveshare Home 1.0.10 audio reference fix')
