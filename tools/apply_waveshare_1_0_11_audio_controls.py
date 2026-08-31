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
app = replace_once(app, 'static constexpr char FW_VERSION[] = "1.0.10";', 'static constexpr char FW_VERSION[] = "1.0.11";', 'firmware version')
app = replace_once(app, 'static constexpr char SETUP_AP_NAME[] = "WaveshareHome-Setup";', 'static constexpr char SETUP_AP_NAME[] = "WaveshareHome-Setup";\nstatic constexpr uint8_t DEFAULT_AUDIO_VOLUME = 55;', 'audio default constant')
app = replace_once(app, 'uint8_t audioVolume = 55;', 'uint8_t audioVolume = DEFAULT_AUDIO_VOLUME;', 'audio config default')
APP.write_text(app)

cpp = CPP.read_text()
cpp = replace_once(cpp, 'config.audioVolume = constrain((int)(doc["audio"]["volume"] | 55), 0, 100);', 'config.audioVolume = constrain((int)(doc["audio"]["volume"] | DEFAULT_AUDIO_VOLUME), 0, 100);', 'persisted audio default')

old_test = '''  server_.on("/audio/test", HTTP_POST, [this]() {
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
  });'''
new_test = '''  server_.on("/audio/test", HTTP_POST, [this]() {
    if (!audio_.ready()) {
      server_.send(503, "text/plain", "Audio hardware initialization failed. Restart after enabling audio; if this persists, inspect ES8311/I2S diagnostics.");
      return;
    }
    if (config_->audioVolume == 0) {
      server_.send(409, "text/plain", "Speaker is muted (0%). Raise volume before testing.");
      return;
    }
    audio_.setVolume(config_->audioVolume);
    audio_.chirp(523, 500);
    delay(100);
    audio_.chirp(659, 500);
    delay(100);
    audio_.chirp(784, 650);
    server_.send(200, "text/plain", String("Speaker diagnostic sent at ") + config_->audioVolume + "% volume: C5/E5/G5. Confirm audible output.");
  });
  server_.on("/audio/volume", HTTP_POST, [this]() {
    const uint8_t volume = constrain(server_.arg("volume").toInt(), 0, 100);
    config_->audioVolume = volume;
    audio_.setVolume(volume);
    store_.save(*config_);
    server_.sendHeader("Location", "/#integrations", true);
    server_.send(303, "text/plain", String("Volume set to ") + volume + "%");
  });
  server_.on("/audio/default", HTTP_POST, [this]() {
    config_->audioVolume = DEFAULT_AUDIO_VOLUME;
    audio_.setVolume(DEFAULT_AUDIO_VOLUME);
    store_.save(*config_);
    server_.sendHeader("Location", "/#integrations", true);
    server_.send(303, "text/plain", String("Volume reset to default ") + DEFAULT_AUDIO_VOLUME + "%");
  });'''
cpp = replace_once(cpp, old_test, new_test, 'audio test and live volume routes')

old_save = '''  config_->audioEnabled = server_.hasArg("audioEnabled");
  config_->audioVolume = constrain(server_.arg("audioVolume").toInt(), 0, 100);'''
new_save = '''  config_->audioEnabled = server_.hasArg("audioEnabled");
  config_->audioVolume = constrain(server_.arg("audioVolume").toInt(), 0, 100);
  audio_.setVolume(config_->audioVolume);'''
cpp = replace_once(cpp, old_save, new_save, 'apply saved volume immediately')

old_ui = '''  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'"); s += checked(config_->calendarEnabled); s += F(">Enable ICS calendar</label><input name='calendarIcsUrl' placeholder='Private ICS URL' value='"); s += htmlEscape(config_->calendarIcsUrl); s += F("'><hr><h3>Audio</h3><label><input type='checkbox' name='audioEnabled'"); s += checked(config_->audioEnabled); s += F(">Enable ES8311 speaker</label><label>Volume</label><input type='number' min='0' max='100' name='audioVolume' value='"); s += config_->audioVolume; s += F("'><button type='submit'>Save settings</button></div></form>");'''
new_ui = '''  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'"); s += checked(config_->calendarEnabled); s += F(">Enable ICS calendar</label><input name='calendarIcsUrl' placeholder='Private ICS URL' value='"); s += htmlEscape(config_->calendarIcsUrl); s += F("'><hr><h3>Audio</h3><label><input type='checkbox' name='audioEnabled'"); s += checked(config_->audioEnabled); s += F(">Enable ES8311 speaker</label><p><small>Persistent default volume. Changes are applied immediately when the codec is active.</small></p><label>Volume <strong id='audioVolumeValue'>"); s += config_->audioVolume; s += F("%</strong></label><input id='audioVolume' type='range' min='0' max='100' step='1' name='audioVolume' value='"); s += config_->audioVolume; s += F("' oninput=\"document.getElementById('audioVolumeValue').textContent=this.value+'%'\"><div class='grid'><button type='button' class='muted' onclick=\"document.getElementById('audioVolume').value=0;document.getElementById('audioVolume').dispatchEvent(new Event('input'))\">Mute 0%</button><button type='button' class='muted' onclick=\"document.getElementById('audioVolume').value=25;document.getElementById('audioVolume').dispatchEvent(new Event('input'))\">Low 25%</button><button type='button' class='muted' onclick=\"document.getElementById('audioVolume').value=55;document.getElementById('audioVolume').dispatchEvent(new Event('input'))\">Default 55%</button><button type='button' class='muted' onclick=\"document.getElementById('audioVolume').value=75;document.getElementById('audioVolume').dispatchEvent(new Event('input'))\">High 75%</button><button type='button' class='muted' onclick=\"document.getElementById('audioVolume').value=100;document.getElementById('audioVolume').dispatchEvent(new Event('input'))\">Max 100%</button></div><button type='submit'>Save settings</button></div></form>");'''
cpp = replace_once(cpp, old_ui, new_ui, 'audio slider and presets UI')

old_actions = '''  s += F("<div class='card panel' id='actions'><div class='section-head'><div><span class='eyebrow'>QUICK CONTROL</span><h2>Actions</h2></div><span class='section-chip'>SHORTCUTS</span></div><div class='grid'><form method='post' action='/audio/test'><button class='muted'>Test speaker</button></form>'''
new_actions = '''  s += F("<div class='card panel' id='actions'><div class='section-head'><div><span class='eyebrow'>QUICK CONTROL</span><h2>Actions</h2></div><span class='section-chip'>SHORTCUTS</span></div><p><small>Speaker "); s += state_->system.audioReady ? "ready" : "not initialized"; s += F(" • volume "); s += config_->audioVolume; s += F("%</small></p><div class='grid'><form method='post' action='/audio/test'><button class='muted'>Test speaker</button></form><form method='post' action='/audio/volume'><input type='hidden' name='volume' value='0'><button class='muted'>Mute</button></form><form method='post' action='/audio/volume'><input type='hidden' name='volume' value='55'><button class='muted'>Default 55%</button></form><form method='post' action='/audio/volume'><input type='hidden' name='volume' value='100'><button class='muted'>Max 100%</button></form>'''
cpp = replace_once(cpp, old_actions, new_actions, 'quick audio controls')

CPP.write_text(cpp)
print('Applied Waveshare Home 1.0.11 audio volume controls')
