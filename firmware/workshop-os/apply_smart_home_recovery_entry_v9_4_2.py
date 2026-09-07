#!/usr/bin/env python3
from pathlib import Path
import argparse
import re


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def apply_recovery_entry(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '''static void handleRoot() {
  if (isAPMode()) {
    serveApPage();
  } else {
    serveMainPage();
  }
}
''',
        '''static void handleRoot() {
  // Safe Mode is a rescue environment, not first-time Wi-Fi onboarding. Make
  // the recovery console the unavoidable landing page so the owner never has
  // to remember a hidden path while repairing a broken candidate firmware.
  if (isAPMode() && recoverySafeModeActive()) {
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.sendHeader("Location", "/recovery");
    server.send(302, "text/plain", "");
    return;
  }
  if (isAPMode()) {
    serveApPage();
  } else {
    serveMainPage();
  }
}
''',
        "Safe Mode root recovery redirect",
    )

    old_location = 'server.sendHeader("Location", "http://192.168.4.1/");'
    count = text.count(old_location)
    if count != 2:
        raise PatchError(f"AP captive redirects: expected 2 matches, found {count}")
    text = text.replace(
        old_location,
        'server.sendHeader("Location", recoverySafeModeActive() ? "http://192.168.4.1/recovery" : "http://192.168.4.1/");',
    )

    text = replace_once(
        text,
        "var rows=[['Build',d.build],['Mode',d.safeMode?'SAFE MODE':'Normal / Development'],['IP',d.ip],['Touch',d.touch],['Running slot',d.runningSlot],['Known good',d.knownGood||'—'],['Fallback',d.fallback||'—'],['Candidate OTA',d.candidatePending?('pending · attempt '+d.candidateAttempts):'healthy'],['Rapid-reset count',d.rapidBootCount]];",
        "var rows=[['Build',d.build],['Mode',d.safeMode?'SAFE MODE':'Normal / Development'],['Auth','OFF · DEVELOPMENT'],['Web control plane',d.webReady?'READY':'STARTING'],['IP',d.ip],['Touch',d.touch],['Running slot',d.runningSlot],['Known good',d.knownGood||'—'],['Fallback',d.fallback||'—'],['Candidate OTA',d.candidatePending?('pending · attempt '+d.candidateAttempts):'healthy'],['Rapid-reset count',d.rapidBootCount]];",
        "recovery diagnostics rows",
    )

    # Anchor on visible text rather than C++ quote escaping. The recovery page
    # is embedded in a C++ string, so matching its escaped onclick syntax is
    # unnecessarily brittle across patch generations.
    text = replace_once(
        text,
        "Reset Portal Session</button>",
        "Reset Portal Session</button><a href='/settings/export'>Download Settings Backup</a>",
        "recovery settings backup link",
    )

    p.write_text(text, encoding="utf-8")

    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC2"\n',
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC3"\n',
        "RC3 build label",
    )
    p.write_text(text, encoding="utf-8")


def apply_command_center_markup(repo: Path) -> None:
    p = repo / "include" / "web_pages.h"
    text = p.read_text(encoding="utf-8")
    marker = "Smart Home RC3 browser command center"
    if marker in text:
        return

    text = replace_once(
        text,
        '<title>BambuHelper</title>',
        '<title>Waveshare Home</title>',
        "command center page title",
    )
    text = replace_once(
        text,
        '''    <span>BambuHelper</span>
    <span class="version-pill">%FW_VER%</span>''',
        '''    <span>Waveshare Home</span>
    <span class="version-pill">Smart Home · %FW_VER%</span>''',
        "command center brand",
    )
    text = replace_once(
        text,
        '<div class="section-title" id="sectionTitle">Printer Settings</div>',
        '<div class="section-title" id="sectionTitle">Home</div>',
        "command center initial title",
    )
    text = replace_once(
        text,
        '''<aside class="sidebar" id="sidebar">
  <h4>Configuration</h4>''',
        '''<aside class="sidebar" id="sidebar">
  <!-- Smart Home RC3 browser command center -->
  <h4>Overview</h4>
  <button class="nav-item" type="button" data-section="home" aria-current="true"><span>Home</span><span class="nav-kicker">Live</span></button>
  <h4>Configuration</h4>''',
        "command center sidebar home",
    )
    text = replace_once(
        text,
        '<button class="nav-item" type="button" data-section="printer" aria-current="true"><span>Printer</span></button>',
        '<button class="nav-item" type="button" data-section="printer"><span>Printer</span></button>',
        "command center printer nav state",
    )
    text = replace_once(
        text,
        '''  <div class="sidebar-footer">
    <div>BambuHelper</div>
    <div style="margin-top:2px">%BOARD% &middot; %FW_VER%</div>
  </div>''',
        '''  <div class="sidebar-footer">
    <div><strong>Waveshare Home</strong></div>
    <div style="margin-top:2px">%BOARD% &middot; Smart Home</div>
    <div style="margin-top:4px">BambuHelper %FW_VER% engine</div>
  </div>''',
        "command center sidebar identity",
    )

    home = r'''
<!-- ===== Smart Home RC3 browser command center ===== -->
<div class="section" id="sec-home" hidden>
  <div class="cc-hero">
    <div class="cc-hero-copy">
      <div class="cc-eyebrow">LOCAL DEVICE OS</div>
      <h2>Your printer and Waveshare, operational at a glance.</h2>
      <p>Status first. Common actions stay one tap away; configuration and diagnostics remain available when you need them.</p>
      <div class="cc-actions">
        <button type="button" class="btn btn-primary" onclick="ccVerifyPrinter()">Verify printer</button>
        <button type="button" class="btn btn-ghost" onclick="ccScanPrinter()">Scan network</button>
        <button type="button" class="btn btn-ghost" onclick="loadSection('display')">Tune display</button>
      </div>
    </div>
    <div class="cc-hero-status">
      <div class="cc-status-orb" id="ccStatusOrb"></div>
      <strong id="ccOverall">Checking…</strong>
      <span id="ccUpdated">Starting command center</span>
    </div>
  </div>

  <div class="cc-status-grid" role="status" aria-live="polite">
    <div class="cc-status-card">
      <span class="cc-label">DEVICE</span>
      <strong id="ccDevice">Online</strong>
      <small id="ccDeviceDetail">Waveshare control plane</small>
    </div>
    <div class="cc-status-card">
      <span class="cc-label">PRINTER</span>
      <strong id="ccPrinter">Checking…</strong>
      <small id="ccPrinterDetail">Selected printer slot</small>
    </div>
    <div class="cc-status-card">
      <span class="cc-label">FIRMWARE</span>
      <strong id="ccFirmware">Smart Home</strong>
      <small id="ccFirmwareDetail">Reading recovery plane</small>
    </div>
    <div class="cc-status-card">
      <span class="cc-label">RECOVERY</span>
      <strong id="ccRecovery">Ready</strong>
      <small id="ccRecoveryDetail">Independent recovery console</small>
    </div>
  </div>

  <div class="cc-attention" id="ccAttention">
    <div>
      <span class="cc-label">NEEDS ATTENTION</span>
      <strong id="ccAttentionTitle">Checking printer connection…</strong>
      <p id="ccAttentionText">Waveshare Home is validating the selected printer and device state.</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ccAttentionAction" onclick="ccVerifyPrinter()">Check connection</button>
  </div>

  <div class="cc-grid">
    <div class="card cc-panel">
      <div class="cc-panel-head">
        <div><span class="cc-label">PRINTER</span><h3 id="ccPrinterName">Printer 1</h3></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="loadSection('printer')">Manage</button>
      </div>
      <div class="cc-kv"><span>Connection</span><strong id="ccConnection">Checking…</strong></div>
      <div class="cc-kv"><span>Mode</span><strong id="ccMode">—</strong></div>
      <div class="cc-kv"><span>Address</span><strong class="mono" id="ccPrinterIp">—</strong></div>
      <div class="cc-panel-actions">
        <button type="button" class="cc-action" onclick="ccVerifyPrinter()"><strong>Verify</strong><span>Test the saved printer</span></button>
        <button type="button" class="cc-action" onclick="ccScanPrinter()"><strong>Discover</strong><span>Find printers on LAN</span></button>
      </div>
    </div>

    <div class="card cc-panel">
      <div class="cc-panel-head">
        <div><span class="cc-label">SMART DISPLAY</span><h3>Touchscreen experience</h3></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="loadSection('display')">Customize</button>
      </div>
      <div class="cc-kv"><span>Touch</span><strong id="ccTouch">Checking…</strong></div>
      <div class="cc-kv"><span>Smart pages</span><strong>Home → Workshop → Custom</strong></div>
      <div class="cc-kv"><span>Profile</span><strong id="ccProfile">Remote status</strong></div>
      <div class="cc-panel-actions">
        <button type="button" class="cc-action" onclick="loadSection('printer')"><strong>Gauge profile</strong><span>Choose a useful layout</span></button>
        <button type="button" class="cc-action" onclick="loadSection('display')"><strong>Brightness</strong><span>Screen and night mode</span></button>
      </div>
    </div>

    <div class="card cc-panel">
      <div class="cc-panel-head">
        <div><span class="cc-label">DEVICE</span><h3>Health & recovery</h3></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="refreshCommandCenter(true)">Refresh</button>
      </div>
      <div class="cc-kv"><span>Web control plane</span><strong id="ccWebReady">Checking…</strong></div>
      <div class="cc-kv"><span>Firmware slot</span><strong id="ccSlot">—</strong></div>
      <div class="cc-kv"><span>OTA candidate</span><strong id="ccCandidate">—</strong></div>
      <div class="cc-panel-actions">
        <button type="button" class="cc-action" onclick="loadSection('diag')"><strong>Diagnostics</strong><span>Logs and runtime details</span></button>
        <button type="button" class="cc-action" onclick="location.href='/recovery'"><strong>Recovery</strong><span>Repair, rollback, reset</span></button>
      </div>
    </div>

    <div class="card cc-panel cc-panel-compact">
      <div class="cc-panel-head">
        <div><span class="cc-label">QUICK CONTROL</span><h3>Common settings</h3></div>
      </div>
      <button type="button" class="cc-row-action" onclick="loadSection('wifi')"><span><strong>Wi-Fi & system</strong><small>Network, backup, firmware</small></span><span>›</span></button>
      <button type="button" class="cc-row-action" onclick="loadSection('hardware')"><span><strong>Hardware</strong><small>Touch, buzzer, LEDs</small></span><span>›</span></button>
      <button type="button" class="cc-row-action" onclick="loadSection('power')"><span><strong>Power</strong><small>Tasmota and monitoring</small></span><span>›</span></button>
      <button type="button" class="cc-row-action" onclick="loadSection('advanced')"><span><strong>Advanced</strong><small>Expert display behavior</small></span><span>›</span></button>
    </div>
  </div>
</div>

'''
    text = replace_once(
        text,
        '<!-- ===== Section 1: Printer ===== -->',
        home + '<!-- ===== Section 1: Printer ===== -->',
        "command center home section",
    )
    p.write_text(text, encoding="utf-8")


def apply_command_center_css(repo: Path) -> None:
    p = repo / "web" / "app.css"
    text = p.read_text(encoding="utf-8")
    marker = "/* Smart Home RC3 browser command center */"
    if marker in text:
        return
    text += r'''

/* Smart Home RC3 browser command center */
.nav-kicker{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--success);border:1px solid color-mix(in srgb,var(--success) 35%,transparent);background:color-mix(in srgb,var(--success) 10%,transparent);padding:2px 6px;border-radius:999px}
.main{max-width:1180px}
.cc-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:end;padding:28px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,var(--bg-elev),var(--bg-sub));box-shadow:var(--shadow);margin-bottom:18px;overflow:hidden;position:relative}
.cc-hero:after{content:"";position:absolute;width:220px;height:220px;right:-100px;top:-120px;border-radius:50%;background:var(--accent-soft);filter:blur(4px);pointer-events:none}
.cc-eyebrow,.cc-label{font-size:10px;font-weight:700;letter-spacing:.105em;color:var(--text-dim)}
.cc-hero h2{font-size:30px;line-height:1.08;letter-spacing:-.035em;margin:7px 0 10px;max-width:720px}
.cc-hero p{color:var(--text-mid);font-size:14px;max-width:680px;margin:0}
.cc-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}
.cc-hero-status{min-width:170px;display:grid;justify-items:end;gap:3px;z-index:1}
.cc-hero-status strong{font-size:18px}.cc-hero-status span{font-size:11px;color:var(--text-dim)}
.cc-status-orb{width:12px;height:12px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 5px color-mix(in srgb,var(--warn) 14%,transparent);margin-bottom:7px}
.cc-status-orb.ok{background:var(--success);box-shadow:0 0 0 5px color-mix(in srgb,var(--success) 14%,transparent)}
.cc-status-orb.bad{background:var(--danger);box-shadow:0 0 0 5px color-mix(in srgb,var(--danger) 14%,transparent)}
.cc-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.cc-status-card{background:var(--bg-elev);border:1px solid var(--line);border-radius:14px;padding:15px 16px;min-height:96px;display:flex;flex-direction:column;box-shadow:var(--shadow-sm)}
.cc-status-card strong{font-size:16px;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-status-card small{font-size:11px;color:var(--text-dim);margin-top:auto;padding-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-attention{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 18px;border-radius:14px;border:1px solid color-mix(in srgb,var(--warn) 36%,var(--line));background:color-mix(in srgb,var(--warn) 8%,var(--bg-elev));margin-bottom:16px}
.cc-attention.ok{border-color:color-mix(in srgb,var(--success) 30%,var(--line));background:color-mix(in srgb,var(--success) 7%,var(--bg-elev))}.cc-attention strong{display:block;font-size:14px;margin-top:3px}.cc-attention p{margin:2px 0 0;color:var(--text-mid);font-size:12px}
.cc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.cc-panel{margin:0;padding:18px}.cc-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:10px}.cc-panel-head h3{font-size:17px;margin:4px 0 0}.cc-panel-head .btn{margin:0}.cc-kv{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid var(--line-soft);font-size:12.5px}.cc-kv span{color:var(--text-mid)}.cc-kv strong{text-align:right;max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-panel-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.cc-action{border:1px solid var(--line);border-radius:10px;background:var(--bg-sub);padding:11px;text-align:left;cursor:pointer;color:var(--text);transition:transform 80ms,border-color var(--motion),background var(--motion)}.cc-action:hover{border-color:var(--text-dim);background:var(--bg-elev)}.cc-action:active{transform:translateY(1px)}.cc-action strong,.cc-action span{display:block}.cc-action strong{font-size:12.5px}.cc-action span{font-size:10.5px;color:var(--text-dim);margin-top:3px}.cc-panel-compact{display:flex;flex-direction:column}.cc-row-action{width:100%;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;border-top:1px solid var(--line-soft);background:transparent;color:var(--text);padding:11px 3px;cursor:pointer;text-align:left}.cc-row-action:hover{color:var(--accent)}.cc-row-action strong,.cc-row-action small{display:block}.cc-row-action strong{font-size:12.5px}.cc-row-action small{font-size:10.5px;color:var(--text-dim);margin-top:2px}.cc-row-action>span:last-child{font-size:22px;color:var(--text-dim)}
@media(max-width:900px){.cc-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-grid{grid-template-columns:1fr}.cc-hero{grid-template-columns:1fr}.cc-hero-status{justify-items:start}.main{max-width:100%}}
@media(max-width:560px){.cc-status-grid{grid-template-columns:1fr 1fr}.cc-hero{padding:20px}.cc-hero h2{font-size:25px}.cc-actions .btn{flex:1 1 45%}.cc-attention{align-items:flex-start;flex-direction:column}.cc-attention .btn{width:100%}.cc-panel-actions{grid-template-columns:1fr}}
'''
    p.write_text(text, encoding="utf-8")


def apply_command_center_js(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")
    marker = "/* Smart Home RC3 browser command center */"
    if marker in text:
        return

    text = replace_once(
        text,
        "var SECTION_LABELS = {\n",
        "var SECTION_LABELS = {\n  home: 'Home',\n",
        "command center section label",
    )
    text = replace_once(
        text,
        "document.title = 'BambuHelper - ' + title;",
        "document.title = 'Waveshare Home — ' + title;",
        "command center browser title",
    )

    sections_re = re.compile(r"var SECTIONS = \[([^\]]*)\];")
    m = sections_re.search(text)
    if not m:
        raise PatchError("command center section list: anchor missing")
    if "'home'" not in m.group(1):
        text = text[:m.start()] + "var SECTIONS = ['home'," + m.group(1).lstrip() + "];" + text[m.end():]

    text = replace_once(
        text,
        "var initId = 'printer';",
        "var initId = 'home';",
        "command center default section",
    )

    helpers = r'''

/* Smart Home RC3 browser command center */
var ccTimer = null;
function ccText(id,value){var e=document.getElementById(id);if(e)e.textContent=value==null?'—':String(value)}
function ccClass(id,name,on){var e=document.getElementById(id);if(e)e.classList.toggle(name,!!on)}
function ccPrinterSnapshot(){
  var status=document.getElementById('printerStatus'),health=document.getElementById('healthConnection'),mode=document.getElementById('healthMode'),name=document.getElementById('pname'),ip=document.getElementById('ip');
  var statusText=(health&&health.textContent&&health.textContent!=='Checking…')?health.textContent:(status?status.textContent:'Checking…');
  var lower=(statusText||'').toLowerCase();
  var connected=lower.indexOf('connected')>=0 && lower.indexOf('disconnected')<0;
  ccText('ccPrinter',connected?'Connected':statusText||'Not configured');
  ccText('ccConnection',statusText||'Checking…');
  ccText('ccMode',mode&&mode.textContent&&mode.textContent!=='—'?mode.textContent:(document.getElementById('connmode')&&document.getElementById('connmode').value==='local'?'LAN':'Cloud'));
  ccText('ccPrinterName',name&&name.value?name.value:'Printer '+(Number(currentSlot||0)+1));
  ccText('ccPrinterIp',ip&&ip.value?ip.value:'Not set');
  var att=document.getElementById('ccAttention'),btn=document.getElementById('ccAttentionAction');
  if(connected){
    if(att)att.classList.add('ok');
    ccText('ccAttentionTitle','Everything important is online');
    ccText('ccAttentionText','The selected printer is connected and the Waveshare control plane is responding.');
    if(btn){btn.textContent='Open printer';btn.onclick=function(){loadSection('printer')}}
  }else{
    if(att)att.classList.remove('ok');
    ccText('ccAttentionTitle','Printer connection needs attention');
    ccText('ccAttentionText','Verify the saved printer or scan the local network. Device and recovery services remain available.');
    if(btn){btn.textContent='Check connection';btn.onclick=ccVerifyPrinter}
  }
  return connected;
}
function refreshCommandCenter(manual){
  if(manual && typeof refreshPrinterHealth==='function')refreshPrinterHealth(true);
  if(typeof refreshTopStatusDots==='function')refreshTopStatusDots();
  var connected=ccPrinterSnapshot();
  fetch('/recovery/status?_='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){
    ccText('ccDevice','Online');
    ccText('ccDeviceDetail',d.ip||location.host);
    ccText('ccFirmware',d.build||'Smart Home v9.4');
    ccText('ccFirmwareDetail',d.safeMode?'Safe Mode':'Normal / Development');
    ccText('ccRecovery',d.safeMode?'SAFE MODE':'Ready');
    ccText('ccRecoveryDetail',d.safeMode?'Recovery environment active':'Independent console available');
    ccText('ccTouch',d.touch||'Unknown');
    ccText('ccWebReady',d.webReady?'READY':'STARTING');
    ccText('ccSlot',d.runningSlot||'—');
    ccText('ccCandidate',d.candidatePending?('Pending · attempt '+d.candidateAttempts):'Healthy');
    ccText('ccOverall',connected?'Operational':'Device online');
    ccText('ccUpdated','Updated '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    ccClass('ccStatusOrb','ok',true);ccClass('ccStatusOrb','bad',false);
  }).catch(function(){
    ccText('ccDevice','Attention');ccText('ccOverall','Recovery status unavailable');ccText('ccUpdated','Refresh to retry');
    ccClass('ccStatusOrb','ok',false);ccClass('ccStatusOrb','bad',true);
  });
  setTimeout(ccPrinterSnapshot,650);
}
function ccVerifyPrinter(){loadSection('printer');setTimeout(function(){if(typeof verifyPrinterSetup==='function')verifyPrinterSetup()},80)}
function ccScanPrinter(){loadSection('printer');setTimeout(function(){if(typeof scanLan==='function')scanLan('lan')},80)}

// Promote Home once after this UI evolution. Afterwards normal last-page
// persistence resumes so the browser still respects the owner's workflow.
try{if(!localStorage.getItem('waveshare_cc_rc3')){localStorage.setItem('bambu_section','home');localStorage.setItem('waveshare_cc_rc3','1')}}catch(e){}
'''
    text = replace_once(
        text,
        "/* ============ Boot ============ */",
        helpers + "\n/* ============ Boot ============ */",
        "command center helpers",
    )

    text = replace_once(
        text,
        "  startPolling(id);\n}",
        "  startPolling(id);\n  if (id === 'home') { refreshCommandCenter(false); if (ccTimer) clearInterval(ccTimer); ccTimer = setInterval(function(){ refreshCommandCenter(false); }, 5000); }\n}\n",
        "command center home polling",
    )
    text = replace_once(
        text,
        "function stopPolling(){\n",
        "function stopPolling(){\n  if (ccTimer) { clearInterval(ccTimer); ccTimer = null; }\n",
        "command center polling cleanup",
    )

    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    apply_recovery_entry(repo)
    apply_command_center_markup(repo)
    apply_command_center_css(repo)
    apply_command_center_js(repo)
    print("Smart Home v9.4 Recovery Foundation RC3 entry + browser command center applied")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
