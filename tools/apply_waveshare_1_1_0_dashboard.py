from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
CPP = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.cpp'
CSS = ROOT / 'firmware/waveshare-home/web/dashboard.css'

app = APP.read_text()
app = app.replace('static constexpr char FW_VERSION[] = "1.0.11";', 'static constexpr char FW_VERSION[] = "1.1.0";', 1)
APP.write_text(app)

cpp = CPP.read_text()
css = CSS.read_text().strip()

# Replace the monolithic escaped CSS block with a maintainable raw-string embed sourced from dashboard.css.
pattern = re.compile(r'''String WebDashboard::pageHeader\(const char \*title\) \{.*?return s;\n\}''', re.S)
replacement = f'''String WebDashboard::pageHeader(const char *title) {{
  String s;
  s.reserve(15000);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><meta charset='utf-8'><meta name='theme-color' content='#06090d'><meta name='apple-mobile-web-app-capable' content='yes'><meta name='apple-mobile-web-app-status-bar-style' content='black-translucent'><title>");
  s += title;
  s += F("</title><style>");
  s += F(R"WHCSS({css})WHCSS");
  s += F("</style></head><body><div class='wrap'>");
  return s;
}}'''
cpp, n = pattern.subn(replacement, cpp, count=1)
if n != 1:
    raise SystemExit(f'pageHeader replacement failed: {n}')

cpp = cpp.replace("<span class='eyebrow'>ESP32-S3 command center</span>", "<span class='eyebrow'>LOCAL DEVICE OS</span>", 1)
cpp = cpp.replace("One polished surface for the device, workshop and printer.", "Your workshop, printer and device — operational at a glance.", 1)
cpp = cpp.replace("Configure integrations, monitor runtime health, control workshop services and update firmware without leaving the local network.", "A local-first command center that prioritizes what needs attention, keeps common controls one tap away, and exposes deep diagnostics only when you need them.", 1)
cpp = cpp.replace("<a href='#home'>Overview</a><a href='#wifi'>Wi-Fi</a><a href='#device'>Device</a><a href='#integrations'>Integrations</a><a href='#workshop'>Workshop</a><a href='#ota'>Updates</a><a href='#recovery'>Recovery</a>", "<a href='#home'>Overview</a><a href='#now'>Now</a><a href='#wifi'>Network</a><a href='#device'>Experience</a><a href='#integrations'>Integrations</a><a href='#workshop'>Workshop</a><a href='#ota'>Updates</a><a href='#recovery'>Recovery</a>", 1)

# Insert a synthesized Now bento after the four system metrics.
needle = '''  s += F("<div class='card metric-card'><span class='metric-label'>Attention</span><div class='metric' id='liveAlerts'>"); s += state_->alertCount; s += F("</div><div class='metric-sub'>active alerts</div></div></div>");'''
insert = needle + '''

  s += F("<section id='now' class='command-grid' aria-label='Current operating state'>");
  s += F("<div class='card command-card primary'><span class='metric-label'>Weather now</span><span class='command-status "); s += state_->weather.online ? "" : "off"; s += F("'></span><div class='command-value' id='nowWeather'>");
  if (state_->weather.online) { s += String(state_->weather.temperatureC * 9.0f / 5.0f + 32.0f, 0); s += F("°F"); } else s += F("Unavailable");
  s += F("</div><div class='command-detail'>"); s += htmlEscape(state_->weather.condition); if (state_->weather.online) { s += F(" • H "); s += String(state_->weather.highC * 9.0f / 5.0f + 32.0f, 0); s += F("° / L "); s += String(state_->weather.lowC * 9.0f / 5.0f + 32.0f, 0); s += F("° • rain "); s += state_->weather.precipitationPercent; s += F("%"); } s += F("</div></div>");

  s += F("<div class='card command-card'><span class='metric-label'>Printer</span><span class='command-status "); s += state_->printer.online ? "" : "off"; s += F("'></span><div class='command-value' id='nowPrinter'>");
  if (!config_->bambuEnabled) s += F("Not set up"); else if (!state_->printer.online) s += F("Offline"); else if (state_->printer.printing) { s += state_->printer.progress; s += F("%"); } else s += htmlEscape(state_->printer.status);
  s += F("</div><div class='command-detail'>"); if (state_->printer.printing) { s += htmlEscape(state_->printer.jobName); s += F(" • "); s += state_->printer.remainingMinutes; s += F(" min left"); } else if (state_->printer.online) { s += htmlEscape(state_->printer.displayName); if (strlen(state_->printer.model)) { s += F(" • "); s += htmlEscape(state_->printer.model); } } else s += F("Bambu LAN status"); s += F("</div></div>");

  s += F("<div class='card command-card'><span class='metric-label'>Workshop air</span><span class='command-status "); s += state_->workshop.environment.online && !state_->workshop.environment.stale ? "" : "off"; s += F("'></span><div class='command-value' id='nowWorkshop'>");
  if (state_->workshop.environment.online && !state_->workshop.environment.stale) { s += String(state_->workshop.environment.humidity, 0); s += F("% RH"); } else s += F("No sensor");
  s += F("</div><div class='command-detail'>"); if (state_->workshop.environment.online) { s += F("PM2.5 "); s += String(state_->workshop.environment.pm25, 1); s += F(" • VOC "); s += String(state_->workshop.environment.voc, 0); } else { s += F("Air mode: "); const char *airNowOverview[]={"Off","Manual","Auto","Post-print"}; s += airNowOverview[(int)config_->airMode]; } s += F("</div></div>");

  s += F("<div class='card command-card'><span class='metric-label'>Audio</span><span class='command-status "); s += state_->system.audioReady && config_->audioEnabled ? "" : "off"; s += F("'></span><div class='command-value' id='nowAudio'>"); s += config_->audioEnabled ? String(config_->audioVolume) + "%" : String("Off"); s += F("</div><div class='command-detail'>"); s += state_->system.audioReady ? F("ES8311 ready • persistent volume") : F("Audio hardware not ready"); s += F("</div></div></section>");'''
if needle not in cpp:
    raise SystemExit('metrics insertion point not found')
cpp = cpp.replace(needle, insert, 1)

# Give major sections concise context so the page reads like a product, not a settings dump.
cpp = cpp.replace("<span class='section-chip'>LAN</span></div>", "<span class='section-chip'>LAN</span></div><p class='section-intro'>Connectivity, signal health and recovery controls for the local control plane.</p>", 1)
cpp = cpp.replace("<span class='section-chip'>DISPLAY</span></div>", "<span class='section-chip'>DISPLAY</span></div><p class='section-intro'>Shape how the touchscreen behaves, what the home surface prioritizes, and how quickly it enters ambient mode.</p>", 1)
cpp = cpp.replace("<span class='section-chip'>LOCAL + CLOUD</span></div>", "<span class='section-chip'>LOCAL + CLOUD</span></div><p class='section-intro'>Connect the services that enrich the dashboard while keeping the device useful when the internet is unavailable.</p>", 1)

CPP.write_text(cpp)
print('Applied Waveshare Home 1.1.0 dashboard redesign')
