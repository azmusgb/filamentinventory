from pathlib import Path

path = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
text = path.read_text()

old_check = '''  server_.on("/update/check", HTTP_POST, [this]() {
    bool ok = checkForSelfUpdate(true);
    server_.sendHeader("Location", "/#ota", true);
    server_.send(ok ? 303 : 502, "text/plain", ok ? "Update check complete" : state_->system.updateError);
  });'''
new_check = '''  server_.on("/update/check", HTTP_POST, [this]() {
    const bool ok = checkForSelfUpdate(true);
    // Always return to the rich dashboard. The updater card already exposes
    // the detailed success/error state, so users never land on a dead-end
    // plain-text HTTP error page.
    server_.sendHeader("Location", "/#ota", true);
    server_.send(303, "text/plain", ok ? "Update check complete" : state_->system.updateError);
  });'''
if old_check not in text:
    raise SystemExit('update/check route pattern not found')
text = text.replace(old_check, new_check, 1)

old_install = '''  server_.on("/update/install", HTTP_POST, [this]() {
    if (!state_->system.updateAvailable) { server_.send(409, "text/plain", "No newer update is ready to install"); return; }
    server_.send(200, "text/plain", "Downloading and installing update. Device will restart when validation succeeds.");
    delay(60);
    if (installSelfUpdate()) scheduleRestart(1500);
  });'''
new_install = '''  server_.on("/update/install", HTTP_POST, [this]() {
    if (!state_->system.updateAvailable) {
      copyText(state_->system.updateError, sizeof(state_->system.updateError), "No newer update is ready to install");
      server_.sendHeader("Location", "/#ota", true);
      server_.send(303, "text/plain", state_->system.updateError);
      return;
    }
    server_.send(200, "text/plain", "Downloading and installing update. Device will restart when validation succeeds.");
    delay(60);
    if (installSelfUpdate()) scheduleRestart(1500);
  });'''
if old_install not in text:
    raise SystemExit('update/install route pattern not found')
text = text.replace(old_install, new_install, 1)

old_footer = '''String WebDashboard::pageFooter() {
  return F("<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><script>(()=>{const $=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v},fmt=u=>{if(u<60)return u+'s';if(u<3600)return Math.floor(u/60)+'m';return Math.floor(u/3600)+'h '+Math.floor((u%3600)/60)+'m'};async function sync(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;const d=await r.json();set('liveFirmware',d.firmware);set('liveSsid',d.network.connected?d.network.ssid:'Offline');set('liveIp',d.network.ip+' • '+d.network.rssi+' dBm');set('liveUptime',fmt(d.system.uptimeSec));set('liveAlerts',d.alerts);set('liveBoot',d.system.stableBoot?'Stable':'Validating');set('liveSlot',(d.ota.runningPartition||'?')+' → '+(d.ota.nextPartition||'?'));set('liveOta',d.updater.error?d.updater.error:(d.updater.status||'Idle'));set('liveWeather',d.weather.online?(Math.round(d.weather.temperatureC*10)/10)+' °C • '+d.weather.condition:d.weather.condition);const on=$('liveOnline');if(on){on.textContent=d.network.connected?'ONLINE':'OFFLINE';on.className='pill '+(d.network.connected?'good':'bad')}const dot=$('liveDot');if(dot)dot.style.background=d.network.connected?'var(--accent)':'var(--danger)'}catch(e){const on=$('liveOnline');if(on){on.textContent='UNREACHABLE';on.className='pill bad'}}}sync();setInterval(sync,5000);const links=[...document.querySelectorAll('.nav a[href^="#"]')],targets=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}}),{rootMargin:'-25% 0px -65% 0px'});targets.forEach(t=>io.observe(t))}})()</script></div></body></html>");
}'''
new_footer = '''String WebDashboard::pageFooter() {
  return F("<div class='footer'><span>Waveshare Home • local-first control plane</span><span><a href='/api/status'>JSON status</a></span></div><div id='consoleToast' style='position:fixed;right:16px;bottom:86px;z-index:90;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:14px;border:1px solid #31515d;background:rgba(7,18,24,.96);box-shadow:0 18px 55px rgba(0,0,0,.42);color:#dcecf1;font-size:12px;font-weight:700;opacity:0;transform:translateY(8px);pointer-events:none;transition:.2s'></div><script>(()=>{const $=id=>document.getElementById(id),set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v},fmt=u=>{if(u<60)return u+'s';if(u<3600)return Math.floor(u/60)+'m';return Math.floor(u/3600)+'h '+Math.floor((u%3600)/60)+'m'},toast=(m,bad=false)=>{const t=$('consoleToast');if(!t)return;t.textContent=m;t.style.borderColor=bad?'#6a3840':'#31515d';t.style.color=bad?'#ffadb4':'#dcecf1';t.style.opacity='1';t.style.transform='translateY(0)';clearTimeout(window.__whToast);window.__whToast=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)'},5000)};async function sync(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;const d=await r.json();set('liveFirmware',d.firmware);set('liveSsid',d.network.connected?d.network.ssid:'Offline');set('liveIp',d.network.ip+' • '+d.network.rssi+' dBm');set('liveUptime',fmt(d.system.uptimeSec));set('liveAlerts',d.alerts);set('liveBoot',d.system.stableBoot?'Stable':'Validating');set('liveSlot',(d.ota.runningPartition||'?')+' → '+(d.ota.nextPartition||'?'));set('liveOta',d.updater.error?d.updater.error:(d.updater.status||'Idle'));set('liveWeather',d.weather.online?(Math.round(d.weather.temperatureC*10)/10)+' °C • '+d.weather.condition:d.weather.condition);const on=$('liveOnline');if(on){on.textContent=d.network.connected?'ONLINE':'OFFLINE';on.className='pill '+(d.network.connected?'good':'bad')}const dot=$('liveDot');if(dot)dot.style.background=d.network.connected?'var(--accent)':'var(--danger)';return d}catch(e){const on=$('liveOnline');if(on){on.textContent='UNREACHABLE';on.className='pill bad'}return null}}sync();setInterval(sync,5000);document.querySelectorAll("form[action='/update/check'],form[action='/update/install']").forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const install=f.action.endsWith('/update/install'),b=f.querySelector('button'),old=b?b.textContent:'';if(b){b.disabled=true;b.textContent=install?'Starting update…':'Checking GitHub…'}toast(install?'Starting secure device update…':'Checking GitHub releases…');try{const r=await fetch(f.action,{method:'POST',body:new FormData(f),cache:'no-store'});if(install){toast('Update started. The device will validate, switch OTA slots and restart.');setTimeout(sync,1800)}else{const d=await sync();if(d&&d.updater&&d.updater.error)toast(d.updater.error,true);else if(d&&d.updater&&d.updater.available)toast('Update available: '+d.updater.latestVersion);else toast('Update check complete. '+(d&&d.updater?d.updater.status:''))}}catch(err){toast(install?'Device connection changed; it may be restarting.':'Update check could not complete.',!install)}finally{if(!install&&b){b.disabled=false;b.textContent=old}}}));const links=[...document.querySelectorAll('.nav a[href^="#"]')],targets=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}}),{rootMargin:'-25% 0px -65% 0px'});targets.forEach(t=>io.observe(t))}})()</script></div></body></html>");
}'''
if old_footer not in text:
    raise SystemExit('pageFooter pattern not found')
text = text.replace(old_footer, new_footer, 1)

path.write_text(text)
print('rc12 web actions polish applied')
