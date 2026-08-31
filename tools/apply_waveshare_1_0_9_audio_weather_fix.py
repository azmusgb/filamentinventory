from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"
CPP = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Version bump.
app = APP.read_text()
app = replace_once(
    app,
    'static constexpr char FW_VERSION[] = "1.0.8";',
    'static constexpr char FW_VERSION[] = "1.0.9";',
    'firmware version',
)
APP.write_text(app)

cpp = CPP.read_text()

# Use the same TCA9554 instance already initialized by the application so the
# speaker power-amplifier enable line can be asserted without disturbing the
# LCD/reset expander state.
cpp = replace_once(
    cpp,
    '#include <Wire.h>\n',
    '#include <Wire.h>\n#include "TCA9554.h"\n\nextern TCA9554 ioExpander;\n',
    'TCA9554 include/extern',
)

old_audio = '''bool AudioService::begin(const AppConfig &config, AppState &state) {
  volume_ = config.audioVolume;
  if (!config.audioEnabled) {
    state.system.audioReady = false;
    return false;
  }

  handle_ = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
  if (!handle_) {
    state.system.audioReady = false;
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
    state.system.audioReady = false;
    return false;
  }
  es8311_voice_volume_set(handle_, volume_, nullptr);
  es8311_microphone_config(handle_, false);

  i2s_.setPins(I2S_BCLK, I2S_LRCK, I2S_DOUT, I2S_DIN, I2S_MCLK);
  ready_ = i2s_.begin(I2S_MODE_STD, AUDIO_SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT,
                      I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  state.system.audioReady = ready_;
  return ready_;
}'''

new_audio = '''bool AudioService::begin(const AppConfig &config, AppState &state) {
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
}'''
cpp = replace_once(cpp, old_audio, new_audio, 'AudioService::begin')

old_chirp = '''void AudioService::chirp(uint16_t frequency, uint16_t durationMs) {
  if (!ready_ || volume_ == 0) return;
  constexpr int FRAMES = 128;
  int16_t samples[FRAMES * 2];
  const uint32_t totalFrames = (AUDIO_SAMPLE_RATE * durationMs) / 1000UL;
  uint32_t produced = 0;
  while (produced < totalFrames) {
    const int frames = min<uint32_t>(FRAMES, totalFrames - produced);
    for (int i = 0; i < frames; ++i) {
      const float phase = 2.0f * PI * frequency * (produced + i) / AUDIO_SAMPLE_RATE;
      int16_t sample = static_cast<int16_t>(sinf(phase) * 7000.0f);
      samples[i * 2] = sample;
      samples[i * 2 + 1] = sample;
    }
    i2s_.write(reinterpret_cast<uint8_t *>(samples), frames * 2 * sizeof(int16_t));
    produced += frames;
  }
}'''

new_chirp = '''void AudioService::chirp(uint16_t frequency, uint16_t durationMs) {
  if (!ready_ || volume_ == 0) return;
  constexpr int FRAMES = 128;
  int16_t samples[FRAMES * 2];
  const uint32_t totalFrames = (AUDIO_SAMPLE_RATE * durationMs) / 1000UL;
  uint32_t produced = 0;
  while (produced < totalFrames) {
    const int frames = min<uint32_t>(FRAMES, totalFrames - produced);
    for (int i = 0; i < frames; ++i) {
      const uint32_t frame = produced + i;
      const float phase = 2.0f * PI * frequency * frame / AUDIO_SAMPLE_RATE;
      const float attack = min(1.0f, frame / (AUDIO_SAMPLE_RATE * 0.012f));
      const float remaining = static_cast<float>(totalFrames - frame);
      const float release = min(1.0f, remaining / (AUDIO_SAMPLE_RATE * 0.018f));
      const float envelope = min(attack, release);
      const int16_t sample = static_cast<int16_t>(sinf(phase) * 16000.0f * envelope);
      samples[i * 2] = sample;
      samples[i * 2 + 1] = sample;
    }
    i2s_.write(reinterpret_cast<uint8_t *>(samples), frames * 2 * sizeof(int16_t));
    produced += frames;
    delay(0);
  }

  // Push a short silence tail so the codec/I2S DMA drains the entire tone.
  memset(samples, 0, sizeof(samples));
  i2s_.write(reinterpret_cast<uint8_t *>(samples), sizeof(samples));
}'''
cpp = replace_once(cpp, old_chirp, new_chirp, 'AudioService::chirp')

old_route = 'server_.on("/audio/test", HTTP_POST, [this]() { audio_.chirp(); server_.send(200, "text/plain", "Audio test played"); });'
new_route = '''server_.on("/audio/test", HTTP_POST, [this]() {
    if (!audio_.ready()) {
      server_.send(503, "text/plain", "Speaker is not initialized. Ensure ES8311 speaker is enabled, save settings, then restart the device.");
      return;
    }
    audio_.chirp(660, 220);
    delay(70);
    audio_.chirp(880, 260);
    server_.send(200, "text/plain", "Speaker test played: two-tone 660/880 Hz");
  });'''
cpp = replace_once(cpp, old_route, new_route, 'audio test route')

# Weather: never feed a potentially encoded/partial network stream directly to
# ArduinoJson. Request identity encoding, materialize the full body, validate
# it is JSON, and surface Open-Meteo's own error reason when present.
old_weather_request = '''  http.addHeader("User-Agent", "WaveshareHome/1.0.8 ESP32-S3");
  http.addHeader("Accept", "application/json");
  http.addHeader("Accept-Encoding", "identity");
  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, http.getStream());
    if (!error && !doc["current"].isNull() && !doc["daily"].isNull()) {'''

new_weather_request = '''  http.addHeader("User-Agent", "WaveshareHome/1.0.9 ESP32-S3");
  http.addHeader("Accept", "application/json");
  http.addHeader("Accept-Encoding", "identity");
  http.addHeader("Connection", "close");
  esp_task_wdt_reset();
  delay(0);
  int code = http.GET();
  esp_task_wdt_reset();
  delay(0);
  String body = http.getString();
  body.trim();
  esp_task_wdt_reset();
  if (code == HTTP_CODE_OK) {
    JsonDocument doc;
    DeserializationError error = body.length() ? deserializeJson(doc, body) : DeserializationError::EmptyInput;
    if (!error && !doc["current"].isNull() && !doc["daily"].isNull()) {'''
cpp = replace_once(cpp, old_weather_request, new_weather_request, 'weather request/body parse')

old_weather_error = '''    } else {
      state.weather.online = false;
      String message = String("Forecast JSON error: ") + (error ? error.c_str() : "missing current/daily data");
      copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
    }
  } else {
    state.weather.online = false;
    String message = String("Open-Meteo HTTP ") + code;
    copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
  }
  http.end();'''

new_weather_error = '''    } else {
      state.weather.online = false;
      String message;
      if (!body.length()) {
        message = "Forecast response was empty";
      } else if (body[0] != '{' && body[0] != '[') {
        message = "Forecast response was not JSON";
      } else {
        JsonDocument errorDoc;
        if (!deserializeJson(errorDoc, body) && errorDoc["reason"].is<const char *>()) {
          message = String("Open-Meteo: ") + errorDoc["reason"].as<const char *>();
        } else {
          message = String("Forecast JSON error: ") + (error ? error.c_str() : "missing current/daily data");
        }
      }
      copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
    }
  } else {
    state.weather.online = false;
    String message = String("Open-Meteo HTTP ") + code;
    if (body.length() && body[0] == '{') {
      JsonDocument errorDoc;
      if (!deserializeJson(errorDoc, body) && errorDoc["reason"].is<const char *>()) {
        message += String(": ") + errorDoc["reason"].as<const char *>();
      }
    }
    copyText(state.weather.lastError, sizeof(state.weather.lastError), message);
  }
  http.end();'''
cpp = replace_once(cpp, old_weather_error, new_weather_error, 'weather error handling')

CPP.write_text(cpp)

print('Applied Waveshare Home 1.0.9 audio + weather fixes')
