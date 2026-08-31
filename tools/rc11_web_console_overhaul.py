#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
MODEL = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"

services = SERVICES.read_text()
model = MODEL.read_text()

old_version = 'static constexpr char FW_VERSION[] = "1.0.0-rc10";'
new_version = 'static constexpr char FW_VERSION[] = "1.0.0-rc11";'
if old_version not in model:
    raise SystemExit("rc11 migration expected rc10 firmware version")
model = model.replace(old_version, new_version, 1)

header_footer_pattern = re.compile(
    r'String WebDashboard::pageHeader\(const char \*title\) \{.*?\n\}\n\nString WebDashboard::pageFooter\(\) \{.*?\n\}',
    re.S,
)

header_footer = r'''String WebDashboard::pageHeader(const char *title) {
  String s;
  s.reserve(10500);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><meta charset='utf-8'><meta name='theme-color' content='#071117'><title>");
  s += title;
  s += F("</title><style>"
    ":root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;--bg:#05090d;--panel:#0a131a;--panel2:#0d1820;--line:#1c3440;--line2:#294b58;--text:#eef6f8;--muted:#93a8b2;--accent:#76e6ad;--accent2:#6fc8ff;--warn:#ffc477;--danger:#ff7d88;--shadow:0 20px 60px rgba(0,0,0,.34)}"
    "*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 12% -10%,#123341 0,transparent 34%),radial-gradient(circle at 90% 4%,#102a23 0,transparent 26%),linear-gradient(180deg,#05090d,#071016 55%,#05090d);color:var(--text);min-height:100vh}body:before{content:'';position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,black,transparent 70%)}"
    ".wrap{max-width:1180px;margin:auto;padding:22px 22px 72px;position:relative}.appbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:4px 0 14px}.brand{display:flex;align-items:center;gap:13px}.mark{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#153f4d,#103328);border:1px solid #326272;box-shadow:inset 0 1px rgba(255,255,255,.12),0 10px 28px rgba(0,0,0,.35);font-weight:900;letter-spacing:-.04em}.brand h1{font-size:25px;margin:2px 0 0;letter-spacing:-.035em}.eyebrow{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#78a9ba}.subtle{color:var(--muted)}"
    ".status-cluster{display:flex;align-items:center;gap:8px}.live-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px rgba(118,230,173,.1),0 0 18px rgba(118,230,173,.65);animation:pulse 2.2s infinite}.pill,.section-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid #284955;background:rgba(13,28,35,.78);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#b8cbd2}.pill.good{color:#95f0bb;border-color:#2f6650;background:#0b2119}.pill.warn{color:#ffd295;border-color:#654d2b;background:#241b0c}.pill.bad{color:#ffa3aa;border-color:#66343b;background:#241015}"
    ".nav{position:sticky;top:10px;z-index:20;display:flex;gap:6px;overflow-x:auto;padding:7px;margin:0 0 15px;border:1px solid rgba(53,85,98,.62);background:rgba(7,16,22,.88);backdrop-filter:blur(18px);border-radius:15px;box-shadow:0 14px 40px rgba(0,0,0,.25);scrollbar-width:none}.nav::-webkit-scrollbar{display:none}.nav a{flex:0 0 auto;color:#a9c0ca;text-decoration:none;padding:9px 12px;border-radius:10px;font-size:12px;font-weight:700}.nav a:hover,.nav a.active{background:#132630;color:#effcff}.nav .json{margin-left:auto;color:#7dcdf9}"
    ".hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(270px,.75fr);gap:14px;padding:22px;border:1px solid #23414e;border-radius:22px;background:linear-gradient(135deg,rgba(14,34,43,.96),rgba(7,18,24,.92) 60%,rgba(11,35,27,.86));box-shadow:var(--shadow);overflow:hidden;position:relative}.hero:after{content:'';position:absolute;width:260px;height:260px;border-radius:50%;right:-95px;top:-130px;background:radial-gradient(circle,rgba(111,200,255,.18),transparent 68%);pointer-events:none}.hero h2{font-size:30px;line-height:1.03;letter-spacing:-.045em;margin:7px 0 10px;max-width:640px}.hero p{max-width:680px;margin:0 0 16px}.hero-actions{display:flex;gap:8px;flex-wrap:wrap}.hero-actions form{margin:0}.hero-actions button{width:auto;min-width:130px}.health{border:1px solid #24404a;border-radius:16px;padding:8px 14px;background:rgba(3,10,14,.35);align-self:stretch;display:flex;flex-direction:column;justify-content:center}.health-row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid rgba(58,85,96,.38);font-size:12px;color:var(--muted)}.health-row:last-child{border:0}.health-row strong{color:var(--text);text-align:right}"
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.metrics{margin:13px 0}.card{background:linear-gradient(180deg,rgba(13,24,32,.96),rgba(8,17,23,.96));border:1px solid var(--line);border-radius:18px;padding:17px;margin:12px 0;box-shadow:0 12px 32px rgba(0,0,0,.18);scroll-margin-top:84px}.panel{position:relative;overflow:hidden}.panel:before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(var(--accent2),transparent 65%);opacity:.55}.metric-card{margin:0;min-height:116px}.metric-label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:#7797a5;font-weight:800}.metric{font-size:25px;line-height:1.08;font-weight:790;letter-spacing:-.035em;margin-top:8px}.metric-sub{color:#809aa5;font-size:12px;margin-top:8px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.section-head h2{font-size:20px;margin:2px 0 0;letter-spacing:-.025em}.section-head h3{margin:1px 0 0}.section-chip{padding:6px 9px}"
    "h1,h2,h3,strong{color:var(--text)}h2{font-size:18px;margin:0 0 12px}h3{font-size:12px;color:#8ba7b2;text-transform:uppercase;letter-spacing:.11em;margin-top:18px}p,small{color:var(--muted);line-height:1.52}a{color:#8fd6ff}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#b9d8e5;background:#071016;border:1px solid #18313c;border-radius:7px;padding:2px 6px}hr{border:0;border-top:1px solid #18313c;margin:20px 0}"
    "label{display:block;font-size:12px;color:#a8bbc3;margin:11px 0 6px;font-weight:650}input,select,button{font:inherit;box-sizing:border-box;width:100%;min-height:44px;padding:11px 12px;border-radius:11px;border:1px solid #294653;background:#071117;color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s,transform .15s,background .15s}input:focus,select:focus{border-color:#4b8da3;box-shadow:0 0 0 3px rgba(89,161,188,.12)}input[type=checkbox]{width:auto;min-height:auto;margin-right:8px;accent-color:#61d69a}input[type=file]{padding:8px}button,.btn{display:inline-block;text-decoration:none;text-align:center;background:linear-gradient(180deg,#1e5739,#173f2c);border-color:#347a54;color:#e5fff0;font-weight:760;cursor:pointer;box-shadow:inset 0 1px rgba(255,255,255,.08)}button:hover{transform:translateY(-1px);border-color:#4f9a6d}button:active{transform:translateY(0)}button:disabled{opacity:.55;cursor:not-allowed}.danger{background:linear-gradient(180deg,#481a21,#34141a);border-color:#7b3641}.muted{background:linear-gradient(180deg,#142630,#0e1c23);border-color:#2d4b58;color:#d4e4ea}.ghost{background:transparent;border-color:#2b4652}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
    ".status{font-size:12px;color:#8deab2}.warn{color:var(--warn)}.notice{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border-radius:14px;margin:13px 0;border:1px solid #544329;background:#21190c}.notice.error{border-color:#60333a;background:#211015}.notice strong{display:block;margin-bottom:2px}.notice-icon{font-weight:900;color:var(--warn)}.notice.error .notice-icon{color:var(--danger)}"
    "details{border:1px solid #1b3440;border-radius:12px;padding:0 12px;background:#071016;margin:9px 0}summary{cursor:pointer;padding:11px 0;color:#b7c9d0;font-size:12px;font-weight:700}details[open] summary{border-bottom:1px solid #17313c;margin-bottom:10px}.ota-flow{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:10px;border:1px solid #1d3b46;border-radius:13px;background:#071117;margin:10px 0 14px;scrollbar-width:none}.ota-flow span{white-space:nowrap;padding:8px 10px;border-radius:9px;background:#0e2028;border:1px solid #25424e;color:#bad0d8;font-size:11px;font-weight:700}.ota-flow b{color:#527985}.file-zone{border:1px dashed #37606f;border-radius:14px;padding:14px;background:#071219;margin-top:10px}.file-zone small{display:block;margin-top:3px}progress{appearance:none;width:100%;height:10px;border:0;border-radius:999px;overflow:hidden;background:#071117;margin-top:12px}progress::-webkit-progress-bar{background:#071117}progress::-webkit-progress-value{background:linear-gradient(90deg,#43b6ff,#6fe6aa)}progress::-moz-progress-bar{background:linear-gradient(90deg,#43b6ff,#6fe6aa)}"
    ".footer{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#6f8791;font-size:11px;padding:16px 3px}.footer a{text-decoration:none}.kbd{border:1px solid #29434f;background:#081117;border-radius:6px;padding:2px 5px;font-size:10px}.spin{display:inline-block;animation:spin 1s linear infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}@keyframes spin{to{transform:rotate(360deg)}}"
    "@media(max-width:760px){.wrap{padding:14px 14px 94px}.appbar{align-items:flex-start}.brand .eyebrow{display:none}.brand h1{font-size:22px}.mark{width:40px;height:40px}.status-cluster{padding-top:5px}.hero{grid-template-columns:1fr;padding:18px}.hero h2{font-size:25px}.health{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.health-row:nth-last-child(-n+2){border-bottom:0}.metrics{grid-template-columns:1fr 1fr}.metric-card{min-height:104px}.row{grid-template-columns:1fr}.nav{position:fixed;left:10px;right:10px;bottom:10px;top:auto;margin:0;padding:6px;z-index:50;border-radius:17px}.nav a{padding:10px 12px}.nav .json{margin-left:0}.card{scroll-margin-top:16px}.footer{padding-bottom:2px}}"
    "@media(max-width:430px){.metrics{grid-template-columns:1fr 1fr}.metric{font-size:21px}.hero-actions button{width:100%}.hero-actions form{width:100%}.health{grid-template-columns:1fr}.health-row{border-bottom:1px solid rgba(58,85,96,.38)!important}.health-row:last-child{border:0!important}}"
    "</style></head><body><div class='wrap'>");
  return s;
}

String WebDashboard::pageFooter() {
  return F("<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><script>(()=>{const $=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v},fmt=u=>{if(u<60)return u+'s';if(u<3600)return Math.floor(u/60)+'m';return Math.floor(u/3600)+'h '+Math.floor((u%3600)/60)+'m'};async function sync(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;const d=await r.json();set('liveFirmware',d.firmware);set('liveSsid',d.network.connected?d.network.ssid:'Offline');set('liveIp',d.network.ip+' • '+d.network.rssi+' dBm');set('liveUptime',fmt(d.system.uptimeSec));set('liveAlerts',d.alerts);set('liveBoot',d.system.stableBoot?'Stable':'Validating');set('liveSlot',(d.ota.runningPartition||'?')+' → '+(d.ota.nextPartition||'?'));set('liveOta',d.updater.error?d.updater.error:(d.updater.status||'Idle'));set('liveWeather',d.weather.online?(Math.round(d.weather.temperatureC*10)/10)+' °C • '+d.weather.condition:d.weather.condition);const on=$('liveOnline');if(on){on.textContent=d.network.connected?'ONLINE':'OFFLINE';on.className='pill '+(d.network.connected?'good':'bad')}const dot=$('liveDot');if(dot)dot.style.background=d.network.connected?'var(--accent)':'var(--danger)'}catch(e){const on=$('liveOnline');if(on){on.textContent='UNREACHABLE';on.className='pill bad'}}}sync();setInterval(sync,5000);const links=[...document.querySelectorAll('.nav a[href^="#"]')],targets=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}}),{rootMargin:'-25% 0px -65% 0px'});targets.forEach(t=>io.observe(t))}})()</script></div></body></html>");
}'''

services, n = header_footer_pattern.subn(header_footer, services, count=1)
if n != 1:
    raise SystemExit(f"page header/footer: expected exactly one match, found {n}")

intro_pattern = re.compile(
    r'  String s = pageHeader\("Waveshare Home"\);.*?(?=  s \+= F\("<div class=\'card\' id=\'wifi\')',
    re.S,
)

intro = r'''  String s = pageHeader("Waveshare Home");
  s.reserve(38000);
  const bool networkOnline = WiFi.status() == WL_CONNECTED;
  s += F("<div class='appbar' id='home'><div class='brand'><div class='mark'>WH</div><div><span class='eyebrow'>ESP32-S3 command center</span><h1>Waveshare Home</h1></div></div><div class='status-cluster'><span id='liveDot' class='live-dot'></span><span id='liveOnline' class='pill ");
  s += networkOnline ? "good'>ONLINE" : "bad'>OFFLINE";
  s += F("</span></div></div>");
  s += F("<nav class='nav' aria-label='Dashboard sections'><a href='#home'>Overview</a><a href='#wifi'>Wi-Fi</a><a href='#device'>Device</a><a href='#integrations'>Integrations</a><a href='#workshop'>Workshop</a><a href='#ota'>Updates</a><a href='#recovery'>Recovery</a><a class='json' href='/api/status'>JSON</a></nav>");

  s += F("<section class='hero'><div><span class='eyebrow'>LOCAL CONTROL PLANE</span><h2>One polished surface for the device, workshop and printer.</h2><p>Configure integrations, monitor runtime health, control workshop services and update firmware without leaving the local network.</p><div class='hero-actions'><form method='post' action='/update/check'><button type='submit'>Check for update</button></form><form method='post' action='/wifi/reconnect'><button type='submit' class='muted'>Reconnect Wi-Fi</button></form><form method='post' action='/audio/test'><button type='submit' class='ghost'>Test speaker</button></form></div></div><div class='health'><div class='health-row'><span>Boot guard</span><strong id='liveBoot'>");
  s += state_->system.stableBoot ? "Stable" : "Validating";
  s += F("</strong></div><div class='health-row'><span>OTA slots</span><strong id='liveSlot'>");
  { const esp_partition_t *r=esp_ota_get_running_partition(); const esp_partition_t *n=esp_ota_get_next_update_partition(nullptr); s += r?r->label:"?"; s += F(" → "); s += n?n->label:"?"; }
  s += F("</strong></div><div class='health-row'><span>Updater</span><strong id='liveOta'>");
  s += strlen(state_->system.updateError) ? htmlEscape(state_->system.updateError) : htmlEscape(state_->system.updateStatus);
  s += F("</strong></div><div class='health-row'><span>Weather</span><strong id='liveWeather'>");
  s += state_->weather.online ? String(state_->weather.temperatureC,1)+" °C • "+htmlEscape(state_->weather.condition) : htmlEscape(state_->weather.condition);
  s += F("</strong></div></div></section>");

  s += F("<div class='grid metrics'><div class='card metric-card'><span class='metric-label'>Network</span><div class='metric' id='liveSsid'>");
  s += networkOnline ? htmlEscape(WiFi.SSID()) : String(SETUP_AP_NAME);
  s += F("</div><div class='metric-sub' id='liveIp'>"); s += state_->system.ip; s += F(" • "); s += state_->system.rssi; s += F(" dBm</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Firmware</span><div class='metric' id='liveFirmware'>"); s += FW_VERSION; s += F("</div><div class='metric-sub'>dual-slot OTA enabled</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Uptime</span><div class='metric' id='liveUptime'>"); s += state_->system.uptimeSec / 60; s += F("m</div><div class='metric-sub'>last reset: "); s += htmlEscape(state_->system.resetReason); s += F("</div></div>");
  s += F("<div class='card metric-card'><span class='metric-label'>Attention</span><div class='metric' id='liveAlerts'>"); s += state_->alertCount; s += F("</div><div class='metric-sub'>active alerts</div></div></div>");

  if (strlen(state_->system.updateError)) {
    s += F("<div class='notice error'><div class='notice-icon'>!</div><div><strong>Updater needs attention</strong><span>"); s += htmlEscape(state_->system.updateError); s += F("</span><br><small>Your running firmware remains untouched unless an image passes validation.</small></div></div>");
  } else if (!state_->system.stableBoot) {
    s += F("<div class='notice'><div class='notice-icon'>•</div><div><strong>Boot validation in progress</strong><span>The current image will be marked stable after the boot-guard window completes.</span></div></div>");
  }

'''

services, n = intro_pattern.subn(intro, services, count=1)
if n != 1:
    raise SystemExit(f"sendRoot intro: expected exactly one match, found {n}")

replacements = {
    "<div class='card' id='wifi'><h2>Wi-Fi management</h2>": "<div class='card panel' id='wifi'><div class='section-head'><div><span class='eyebrow'>CONNECTIVITY</span><h2>Wi-Fi</h2></div><span class='section-chip'>LAN</span></div>",
    "<div class='card' id='device'><h2>Device settings</h2>": "<div class='card panel' id='device'><div class='section-head'><div><span class='eyebrow'>PERSONALIZATION</span><h2>Device experience</h2></div><span class='section-chip'>DISPLAY</span></div>",
    "<div class='card' id='integrations'><h2>Integrations</h2><h3>Weather</h3>": "<div class='card panel' id='integrations'><div class='section-head'><div><span class='eyebrow'>CONNECTED SERVICES</span><h2>Integrations</h2></div><span class='section-chip'>LOCAL + CLOUD</span></div><h3>Weather</h3>",
    "<h3 id='workshop'>Workshop</h3>": "<h3 id='workshop-config'>Workshop</h3>",
    "<div class='card' id='workshop'><h2>Workshop status</h2>": "<div class='card panel' id='workshop'><div class='section-head'><div><span class='eyebrow'>AMBIENT WORKSHOP</span><h2>Workshop status</h2></div><span class='section-chip'>LIVE STATE</span></div>",
    "<div class='card'><h2>Actions</h2>": "<div class='card panel' id='actions'><div class='section-head'><div><span class='eyebrow'>QUICK CONTROL</span><h2>Actions</h2></div><span class='section-chip'>SHORTCUTS</span></div>",
    "<div class='card' id='ota'><h2>OTA firmware update</h2>": "<div class='card panel' id='ota'><div class='section-head'><div><span class='eyebrow'>FIRMWARE LIFECYCLE</span><h2>Updates & OTA</h2></div><span class='section-chip'>DUAL SLOT</span></div>",
    "<div class='card'><h2>Recovery & reset</h2>": "<div class='card panel' id='recovery'><div class='section-head'><div><span class='eyebrow'>DEVICE SAFETY</span><h2>Recovery & reset</h2></div><span class='section-chip'>GUARDED</span></div>",
}
for old, new in replacements.items():
    if old not in services:
        raise SystemExit(f"missing UI anchor: {old[:70]}")
    services = services.replace(old, new, 1)

ota_heading = "<h3>Device-managed updates</h3><p>Status: <strong>"
ota_rich = "<div class='section-head'><div><span class='eyebrow'>DEVICE-MANAGED OTA</span><h3>Update pipeline</h3></div><span class='pill good'>SHA-256 VERIFIED</span></div><div class='ota-flow'><span>GitHub release</span><b>→</b><span>Digest + size</span><b>→</b><span>Inactive slot</span><b>→</b><span>Boot guard</span></div><p>Status: <strong>"
if ota_heading not in services:
    raise SystemExit("OTA heading anchor not found")
services = services.replace(ota_heading, ota_rich, 1)

manual_text = "<hr><p>Manual browser OTA remains available. Choose only <code>WaveshareHome-firmware.bin</code>. Do not upload the merged, bootloader, or partition binary here.</p>"
manual_rich = "<hr><div class='section-head'><div><span class='eyebrow'>MANUAL FALLBACK</span><h3>Browser firmware upload</h3></div><span class='section-chip'>RECOVERY PATH</span></div><div class='file-zone'><strong>Application firmware only</strong><small>Choose <code>WaveshareHome-firmware.bin</code>. Never use merged, bootloader or partition images here.</small></div>"
if manual_text not in services:
    raise SystemExit("manual OTA copy anchor not found")
services = services.replace(manual_text, manual_rich, 1)

SERVICES.write_text(services)
MODEL.write_text(model)
print("Applied rc11 rich web console overhaul")
