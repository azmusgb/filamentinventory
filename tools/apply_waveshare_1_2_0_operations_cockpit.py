from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'firmware/waveshare-home/WaveshareHome/AppModel.h'
CPP = ROOT / 'firmware/waveshare-home/WaveshareHome/Services.cpp'
CSS = ROOT / 'firmware/waveshare-home/web/dashboard.css'
JS = ROOT / 'firmware/waveshare-home/web/dashboard.js'

app = APP.read_text()
if 'FW_VERSION[] = "1.1.1"' not in app:
    raise SystemExit('Expected 1.1.1 firmware source')
app = app.replace('FW_VERSION[] = "1.1.1"', 'FW_VERSION[] = "1.2.0"', 1)
APP.write_text(app)

css = CSS.read_text().strip()
ops_css = r'''
.ops-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin:13px 0}.ops-card{margin:0;min-height:220px}.attention-list{display:grid;gap:8px}.attention-item{display:grid;grid-template-columns:10px 1fr auto;gap:10px;align-items:start;padding:11px 12px;border:1px solid #203944;border-radius:13px;background:rgba(6,15,21,.7)}.attention-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;background:#6b8792}.attention-item.info .attention-dot{background:var(--accent2)}.attention-item.attention .attention-dot{background:var(--warn)}.attention-item.urgent{border-color:#633640;background:rgba(37,15,19,.74)}.attention-item.urgent .attention-dot{background:var(--danger);box-shadow:0 0 12px rgba(255,127,140,.38)}.attention-copy strong{font-size:12px}.attention-copy small{display:block;margin-top:3px}.attention-source{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted2);padding-top:2px}.nominal{display:flex;align-items:center;gap:11px;padding:18px;border:1px solid #24513d;background:rgba(8,32,23,.6);border-radius:14px}.nominal-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#153d2a;color:#a4f3c4;font-weight:900}.integration-health{display:grid;gap:8px}.integration-row{display:grid;grid-template-columns:10px 1fr auto;align-items:center;gap:10px;padding:10px 11px;border-radius:12px;border:1px solid #203943;background:#071219}.integration-row .health-dot{width:8px;height:8px;border-radius:50%;background:#667a83}.integration-row.online .health-dot{background:var(--accent);box-shadow:0 0 10px rgba(114,226,172,.32)}.integration-row.warn .health-dot{background:var(--warn)}.integration-name{font-size:12px;font-weight:740}.integration-state{font-size:10px;color:var(--muted);text-align:right}.cockpit-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.cockpit-actions button{width:auto;min-width:120px}.clock{font-variant-numeric:tabular-nums;color:var(--muted);font-size:11px;font-weight:700}.freshness{font-size:9px;color:var(--muted2);margin-top:8px}@media(max-width:860px){.ops-grid{grid-template-columns:1fr}}@media(max-width:480px){.attention-item,.integration-row{grid-template-columns:9px 1fr}.attention-source,.integration-state{grid-column:2;text-align:left;padding:0}}
'''.strip()
if '.ops-grid{' not in css:
    css += ops_css
CSS.write_text(css + '\n')

js = r'''(()=>{
  const $=id=>document.getElementById(id);
  const set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v};
  const fmt=u=>u<60?`${u}s`:u<3600?`${Math.floor(u/60)}m`:`${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m`;
  const fToF=c=>Math.round((Number(c)||0)*9/5+32);
  const airNames=['Off','Manual','Auto','Post-print'];
  let lastSyncAt=0;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast=(m,bad=false)=>{const t=$('consoleToast');if(!t)return;t.textContent=m;t.style.borderColor=bad?'#6a3840':'#31515d';t.style.color=bad?'#ffadb4':'#dcecf1';t.style.opacity='1';t.style.transform='translateY(0)';clearTimeout(window.__whToast);window.__whToast=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)'},4200)};
  function updateStatusDot(cardId,on,warn=false){const card=$(cardId)?.closest('.command-card');const dot=card?.querySelector('.command-status');if(!dot)return;dot.classList.toggle('off',!on);dot.classList.toggle('warn',!!warn)}
  function paintAttention(d){const box=$('attentionList');if(!box)return;const items=d.attention?.items||[];set('attentionCount',items.length);if(!items.length){box.innerHTML="<div class='nominal'><span class='nominal-icon'>✓</span><div><strong>All systems nominal</strong><small>No active device, printer, weather or workshop alerts.</small></div></div>";return}box.innerHTML=items.slice(0,8).map(a=>{const sev=['info','attention','urgent'][Number(a.severity)||0]||'info';return `<div class='attention-item ${sev}'><span class='attention-dot'></span><div class='attention-copy'><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></div><span class='attention-source'>${esc(a.source)}</span></div>`}).join('')}
  function integrationRow(name,x){let klass='',state='Not configured';if(x?.enabled||x?.configured){if(x?.online||x?.ready){klass='online';state='Online'}else{klass='warn';state=x?.configured?'Unavailable':'Enabled'}}return `<div class='integration-row ${klass}'><span class='health-dot'></span><span class='integration-name'>${esc(name)}</span><span class='integration-state'>${esc(state)}</span></div>`}
  function paintIntegrations(d){const box=$('integrationHealth');if(!box)return;const x=d.integrations||{};box.innerHTML=integrationRow('Weather',x.weather)+integrationRow('Bambu Lab',x.printer)+integrationRow('Filament inventory',x.filament)+integrationRow('Home Assistant',x.homeAssistant)+integrationRow('Calendar',x.calendar)+integrationRow('Speaker',x.audio)}
  function applyStatus(d){
    lastSyncAt=Date.now();set('liveFirmware',d.firmware);set('liveSsid',d.network?.connected?d.network.ssid:'Offline');set('liveIp',`${d.network?.ip||'Offline'} • ${d.network?.rssi??0} dBm`);set('liveUptime',fmt(d.system?.uptimeSec||0));set('liveAlerts',d.attention?.count??d.alerts??0);set('liveBoot',d.system?.stableBoot?'Stable':'Validating');set('liveSlot',`${d.ota?.runningPartition||'?'} → ${d.ota?.nextPartition||'?'}`);
    const otaPct=d.ota?.total?Math.min(100,Math.round((d.ota.bytes||0)*100/d.ota.total)):0;set('liveOta',d.ota?.inProgress?`${d.ota.status||'Updating'} • ${otaPct}%`:(d.updater?.error||d.updater?.status||'Idle'));set('liveWeather',d.weather?.online?`${fToF(d.weather.temperatureC)}°F • ${d.weather.condition}`:(d.weather?.condition||'Unavailable'));
    const online=$('liveOnline');if(online){online.textContent=d.network?.connected?'ONLINE':'OFFLINE';online.className=`pill ${d.network?.connected?'good':'bad'}`};const dot=$('liveDot');if(dot)dot.style.opacity=d.network?.connected?'1':'.35';
    if(d.weather?.online){set('nowWeather',`${fToF(d.weather.temperatureC)}°F`);const el=$('nowWeather')?.nextElementSibling;if(el)el.textContent=`${d.weather.condition} • H ${fToF(d.weather.highC)}° / L ${fToF(d.weather.lowC)}° • rain ${d.weather.precipitationPercent||0}%`;updateStatusDot('nowWeather',true,!!d.weather.severeAlert)}else{set('nowWeather','Unavailable');updateStatusDot('nowWeather',false)}
    if(d.printer?.online){set('nowPrinter',d.printer.progress>0?`${d.printer.progress}%`:(d.printer.status||'Ready'));const el=$('nowPrinter')?.nextElementSibling;if(el)el.textContent=d.printer.progress>0?`${d.printer.job||'Print'} • ${d.printer.remainingMinutes||0} min left`:`${d.printer.name||'Bambu Lab'}${d.printer.model?` • ${d.printer.model}`:''}`;updateStatusDot('nowPrinter',true,!!d.printer.errorCode)}else{set('nowPrinter',d.printer?.configured?'Offline':'Not set up');updateStatusDot('nowPrinter',false)}
    const env=d.workshop?.environment;if(env?.online&&!env.stale){set('nowWorkshop',`${Math.round(env.humidity||0)}% RH`);const el=$('nowWorkshop')?.nextElementSibling;if(el)el.textContent=`PM2.5 ${Number(env.pm25||0).toFixed(1)} • VOC ${Math.round(env.voc||0)}`;updateStatusDot('nowWorkshop',true)}else{set('nowWorkshop','No sensor');const el=$('nowWorkshop')?.nextElementSibling;if(el)el.textContent=`Air mode: ${airNames[d.workshop?.airMode||0]}`;updateStatusDot('nowWorkshop',false)}
    if(d.audio){set('nowAudio',d.audio.enabled?`${d.audio.volume}%`:'Off');updateStatusDot('nowAudio',!!d.audio.ready)}paintAttention(d);paintIntegrations(d);set('lastRefresh','Updated now')
  }
  let syncing=false;async function sync(manual=false){if(syncing)return;syncing=true;if(manual)set('lastRefresh','Refreshing…');try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`status ${r.status}`);applyStatus(await r.json())}catch(e){const on=$('liveOnline');if(on){on.textContent='STALE';on.className='pill warn'}set('lastRefresh','Refresh failed');if(manual)toast('Could not refresh device status',true)}finally{syncing=false}}
  function bindAudio(){const slider=$('audioVolume'),label=$('audioVolumeValue');if(slider&&label){const paint=()=>label.textContent=`${slider.value}%`;slider.addEventListener('input',paint);paint()}document.querySelectorAll('[data-audio-volume]').forEach(b=>b.addEventListener('click',()=>{if(!slider)return;slider.value=b.dataset.audioVolume;slider.dispatchEvent(new Event('input',{bubbles:true}))}))}
  function bindConfirm(){document.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('click',e=>{if(!confirm(el.dataset.confirm||'Continue?'))e.preventDefault()}))}
  function bindNav(){const links=[...document.querySelectorAll('.nav a[href^="#"]')];const map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));const obs=new IntersectionObserver(entries=>{const hit=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!hit)return;links.forEach(a=>a.classList.remove('active'));map.get(hit.target.id)?.classList.add('active')},{rootMargin:'-15% 0px -70% 0px',threshold:[0,.2,.5]});map.forEach((_,id)=>{const el=$(id);if(el)obs.observe(el)})}
  function bindAsyncActions(){document.querySelectorAll("form[data-async='1']").forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button');if(btn)btn.disabled=true;try{const r=await fetch(form.action,{method:(form.method||'POST').toUpperCase(),body:new FormData(form)});const text=await r.text();toast(text,!r.ok);await sync()}catch(err){toast('Request failed',true)}finally{if(btn)btn.disabled=false}}))}
  function clock(){const e=$('localClock');if(e)e.textContent=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());if(lastSyncAt&&$('lastRefresh')&&Date.now()-lastSyncAt>12000)set('lastRefresh',`Updated ${Math.floor((Date.now()-lastSyncAt)/1000)}s ago`)}
  bindAudio();bindConfirm();bindNav();bindAsyncActions();$('manualRefresh')?.addEventListener('click',()=>sync(true));sync();clock();setInterval(sync,5000);setInterval(clock,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();'''
JS.write_text(js + '\n')

cpp = CPP.read_text()

# Add clock to app bar and Attention navigation.
cpp = cpp.replace("<div class='status-cluster'><span id='liveDot'", "<div class='status-cluster'><span id='localClock' class='clock'></span><span id='liveDot'", 1)
cpp = cpp.replace("<a href='#now'>Now</a><a href='#wifi'>Network</a>", "<a href='#now'>Now</a><a href='#attention'>Attention</a><a href='#wifi'>Network</a>", 1)

# Insert Operations cockpit after Now cards.
needle = '''  s += F("<div class='card command-card'><span class='metric-label'>Audio</span><span class='command-status "); s += state_->system.audioReady && config_->audioEnabled ? "" : "off"; s += F("'></span><div class='command-value' id='nowAudio'>"); s += config_->audioEnabled ? String(config_->audioVolume) + "%" : String("Off"); s += F("</div><div class='command-detail'>"); s += state_->system.audioReady ? F("ES8311 ready • persistent volume") : F("Audio hardware not ready"); s += F("</div></div></section>");'''
if needle not in cpp:
    raise SystemExit('Now-card insertion point not found')
ops = needle + '''

  s += F("<section id='attention' class='ops-grid' aria-label='Operations cockpit'><div class='card ops-card'><div class='section-head'><div><span class='eyebrow'>ATTENTION CENTER</span><h2>What needs you</h2></div><span class='section-chip'><span id='attentionCount'>"); s += state_->alertCount; s += F("</span>&nbsp;ACTIVE</span></div><p class='section-intro'>Prioritized signals from the device, printer, weather, inventory and workshop.</p><div id='attentionList' class='attention-list'>");
  if (!state_->alertCount) { s += F("<div class='nominal'><span class='nominal-icon'>✓</span><div><strong>All systems nominal</strong><small>No active alerts right now.</small></div></div>"); }
  else { for (int i=0;i<state_->alertCount && i<8;i++){ auto &a=state_->alerts[i]; const char *sev=a.severity==AlertSeverity::Urgent?"urgent":(a.severity==AlertSeverity::Attention?"attention":"info"); s += F("<div class='attention-item "); s += sev; s += F("'><span class='attention-dot'></span><div class='attention-copy'><strong>"); s += htmlEscape(a.title); s += F("</strong><small>"); s += htmlEscape(a.detail); s += F("</small></div><span class='attention-source'>"); s += htmlEscape(a.source); s += F("</span></div>"); } }
  s += F("</div></div><div class='card ops-card'><div class='section-head'><div><span class='eyebrow'>INTEGRATION HEALTH</span><h2>Connected systems</h2></div><span class='section-chip'>LIVE</span></div><p class='section-intro'>One place to see which services are configured and actually reachable.</p><div id='integrationHealth' class='integration-health'></div><div class='cockpit-actions'><button id='manualRefresh' type='button' class='muted'>Refresh status</button><a class='btn ghost' href='/api/status'>Open JSON</a></div><div id='lastRefresh' class='freshness'>Waiting for live refresh…</div></div></section>");'''
cpp = cpp.replace(needle, ops, 1)

# Expand status API with detailed attention and integration health while keeping legacy alert count.
needle_json = '  doc["alerts"] = state_->alertCount;\n'
if needle_json not in cpp:
    raise SystemExit('Status JSON alert marker not found')
json_block = '''  doc["alerts"] = state_->alertCount;
  doc["attention"]["count"] = state_->alertCount;
  for(int i=0;i<state_->alertCount;i++){auto &a=state_->alerts[i];doc["attention"]["items"][i]["severity"]=(int)a.severity;doc["attention"]["items"][i]["source"]=a.source;doc["attention"]["items"][i]["title"]=a.title;doc["attention"]["items"][i]["detail"]=a.detail;}
  doc["integrations"]["weather"]["enabled"] = config_->weatherEnabled; doc["integrations"]["weather"]["configured"] = state_->weather.configured; doc["integrations"]["weather"]["online"] = state_->weather.online;
  doc["integrations"]["printer"]["enabled"] = config_->bambuEnabled; doc["integrations"]["printer"]["configured"] = state_->printer.configured; doc["integrations"]["printer"]["online"] = state_->printer.online;
  doc["integrations"]["filament"]["enabled"] = config_->filamentEnabled; doc["integrations"]["filament"]["configured"] = config_->filamentEnabled && strlen(config_->filamentEndpoint); doc["integrations"]["filament"]["online"] = state_->filament.online;
  doc["integrations"]["homeAssistant"]["enabled"] = config_->homeAssistantEnabled; doc["integrations"]["homeAssistant"]["configured"] = state_->homeAssistant.configured; doc["integrations"]["homeAssistant"]["online"] = state_->homeAssistant.online;
  doc["integrations"]["calendar"]["enabled"] = config_->calendarEnabled; doc["integrations"]["calendar"]["configured"] = state_->calendar.configured; doc["integrations"]["calendar"]["online"] = state_->calendar.online;
  doc["integrations"]["audio"]["enabled"] = config_->audioEnabled; doc["integrations"]["audio"]["configured"] = config_->audioEnabled; doc["integrations"]["audio"]["ready"] = state_->system.audioReady;
'''
cpp = cpp.replace(needle_json, json_block, 1)

# Re-embed maintainable CSS and JS source files.
css_now = CSS.read_text().strip()
js_now = JS.read_text().strip()
header_pattern = re.compile(r'''String WebDashboard::pageHeader\(const char \*title\) \{.*?return s;\n\}''', re.S)
header = f'''String WebDashboard::pageHeader(const char *title) {{
  String s;
  s.reserve(19000);
  s += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'><meta charset='utf-8'><meta name='theme-color' content='#06090d'><meta name='apple-mobile-web-app-capable' content='yes'><meta name='apple-mobile-web-app-status-bar-style' content='black-translucent'><title>");
  s += title;
  s += F("</title><style>");
  s += F(R"WHCSS({css_now})WHCSS");
  s += F("</style></head><body><div class='wrap'>");
  return s;
}}'''
cpp, n = header_pattern.subn(header, cpp, count=1)
if n != 1: raise SystemExit(f'pageHeader replacement failed: {n}')
footer_pattern = re.compile(r'''String WebDashboard::pageFooter\(\) \{.*?\n\}\n\nvoid WebDashboard::begin''', re.S)
footer = f'''String WebDashboard::pageFooter() {{
  String s;
  s.reserve(15000);
  s += F("<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><div id='consoleToast' style='position:fixed;right:16px;bottom:86px;z-index:90;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;border:1px solid #31515d;background:rgba(7,18,24,.96);box-shadow:0 18px 55px rgba(0,0,0,.42);color:#dcecf1;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s'></div><script>");
  s += F(R"WHJS({js_now})WHJS");
  s += F("</script></div></body></html>");
  return s;
}}

void WebDashboard::begin'''
cpp, n = footer_pattern.subn(footer, cpp, count=1)
if n != 1: raise SystemExit(f'pageFooter replacement failed: {n}')

CPP.write_text(cpp)
print('Applied Waveshare Home 1.2.0 operations cockpit')
