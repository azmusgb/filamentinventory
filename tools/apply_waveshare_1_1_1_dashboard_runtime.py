from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
CPP = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.cpp'
JS = ROOT / 'firmware/waveshare-home/web/dashboard.js'
CSS = ROOT / 'firmware/waveshare-home/web/dashboard.css'

app = APP.read_text()
if 'FW_VERSION[] = "1.1.0"' not in app:
    raise SystemExit('Expected 1.1.0 firmware source')
app = app.replace('FW_VERSION[] = "1.1.0"', 'FW_VERSION[] = "1.1.1"', 1)
APP.write_text(app)

cpp = CPP.read_text()
js = JS.read_text().strip()
css = CSS.read_text().strip()

# Replace the fragile inline-JavaScript audio block with semantic data attributes.
audio_pattern = re.compile(r'''  s \+= F\("<h3>Calendar</h3>.*?<button type='submit'>Save settings</button></div></form>"\);''', re.S)
audio_block = '''  s += F("<h3>Calendar</h3><label><input type='checkbox' name='calendarEnabled'"); s += checked(config_->calendarEnabled); s += F(">Enable ICS calendar</label><input name='calendarIcsUrl' placeholder='Private ICS URL' value='"); s += htmlEscape(config_->calendarIcsUrl); s += F("'><hr><h3>Audio</h3><label><input type='checkbox' name='audioEnabled'"); s += checked(config_->audioEnabled); s += F(">Enable ES8311 speaker</label><p><small>Persistent device volume. Presets update the slider; Save settings makes the selected level the boot default.</small></p><label>Volume <strong id='audioVolumeValue'>"); s += config_->audioVolume; s += F("%</strong></label><input id='audioVolume' type='range' min='0' max='100' step='1' name='audioVolume' value='"); s += config_->audioVolume; s += F("'><div class='grid audio-presets'><button type='button' class='muted' data-audio-volume='0'>Mute 0%</button><button type='button' class='muted' data-audio-volume='25'>Low 25%</button><button type='button' class='muted' data-audio-volume='55'>Default 55%</button><button type='button' class='muted' data-audio-volume='75'>High 75%</button><button type='button' class='muted' data-audio-volume='100'>Max 100%</button></div><button type='submit'>Save settings</button></div></form>");'''
cpp, n = audio_pattern.subn(audio_block, cpp, count=1)
if n != 1:
    raise SystemExit(f'audio block replacement failed: {n}')

# Maintain CSS and JS as normal web files, then embed them as raw strings for a single firmware image.
header_pattern = re.compile(r'''String WebDashboard::pageHeader\(const char \*title\) \{.*?return s;\n\}''', re.S)
header = f'''String WebDashboard::pageHeader(const char *title) {{
  String s;
  s.reserve(15000);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><meta charset='utf-8'><meta name='theme-color' content='#06090d'><meta name='apple-mobile-web-app-capable' content='yes'><meta name='apple-mobile-web-app-status-bar-style' content='black-translucent'><title>");
  s += title;
  s += F("</title><style>");
  s += F(R"WHCSS({css})WHCSS");
  s += F("</style></head><body><div class='wrap'>");
  return s;
}}'''
cpp, n = header_pattern.subn(header, cpp, count=1)
if n != 1:
    raise SystemExit(f'pageHeader replacement failed: {n}')

footer_pattern = re.compile(r'''String WebDashboard::pageFooter\(\) \{.*?\n\}\n\nvoid WebDashboard::begin''', re.S)
footer = f'''String WebDashboard::pageFooter() {{
  String s;
  s.reserve(12000);
  s += F("<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><div id='consoleToast' style='position:fixed;right:16px;bottom:86px;z-index:90;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;border:1px solid #31515d;background:rgba(7,18,24,.96);box-shadow:0 18px 55px rgba(0,0,0,.42);color:#dcecf1;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s'></div><script>");
  s += F(R"WHJS({js})WHJS");
  s += F("</script></div></body></html>");
  return s;
}}

void WebDashboard::begin'''
cpp, n = footer_pattern.subn(footer, cpp, count=1)
if n != 1:
    raise SystemExit(f'pageFooter replacement failed: {n}')

# Make common non-destructive commands app-like without leaving the page.
for route in ('/update/check', '/wifi/reconnect', '/audio/test'):
    cpp = cpp.replace(f"<form method='post' action='{route}'>", f"<form method='post' action='{route}' data-async='1'>")

# Expose audio runtime state to the client-side dashboard.
needle = '  doc["system"]["audioReady"] = state_->system.audioReady;\n'
if needle not in cpp:
    raise SystemExit('audio status JSON insertion point not found')
cpp = cpp.replace(needle, needle + '  doc["audio"]["enabled"] = config_->audioEnabled;\n  doc["audio"]["volume"] = config_->audioVolume;\n  doc["audio"]["ready"] = state_->system.audioReady;\n', 1)

CPP.write_text(cpp)
print('Applied Waveshare Home 1.1.1 dashboard runtime extraction and compile fix')
