#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_app(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "    var deadline = Date.now() + 13000;  // a hair past the device's 12s scan window\n",
        "    var deadline = Date.now() + 19000;  // server scans for 16s; allow transport + final poll margin\n",
        "browser LAN scan deadline",
    )

    old = '''function renderLanDevices(mode, sel, devs){
  if (devs.length === 0){ showToast('No printers found on the LAN. Same Wi-Fi/subnet required; or type it manually.'); return; }
  if (devs.length === 1){
    fillLanDevice(mode, devs[0]);
    showToast('Found ' + (devs[0].name || devs[0].serial) + (devs[0].model ? ' (' + devs[0].model + ')' : ''));
    return;
  }
  var ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'Select a printer (' + devs.length + ' found)...';
  sel.appendChild(ph);
  devs.forEach(function(dev){
    var o = document.createElement('option');
    o.value = (dev.serial || '').toUpperCase();
    o.setAttribute('data-ip', dev.ip || '');
    o.textContent = (dev.name || dev.serial) + (dev.model ? ' (' + dev.model + ')' : '') +
                    ' - ' + o.value + (dev.ip ? ' @ ' + dev.ip : '');
    sel.appendChild(o);
  });
  sel.style.display = '';
  showToast(devs.length + ' printers found - pick one');
}

function fillLanDevice(mode, dev){
  var serial = (dev.serial || '').toUpperCase();
  if (mode === 'lan'){
    document.getElementById('serial').value = serial;
    if (dev.ip) document.getElementById('ip').value = dev.ip;
  } else {
    document.getElementById('cl_serial').value = serial;
  }
  updatePrinterOnboarding();
}

function pickLanDevice(mode){
  var sel = document.getElementById(mode === 'lan' ? 'lan_devsel' : 'cl_devsel');
  if (!sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  fillLanDevice(mode, { serial: sel.value, ip: opt.getAttribute('data-ip') });
}
'''
    new = '''function v92DiscoveryCard(){
  var card = document.getElementById('v92DiscoveryResult');
  if (card) return card;
  var btn = document.getElementById('lan_scanBtn');
  if (!btn) return null;
  var field = btn.closest ? btn.closest('.field') : btn.parentElement;
  if (!field || !field.parentNode) return null;
  card = document.createElement('div');
  card.id = 'v92DiscoveryResult';
  card.className = 'v92-discovery';
  card.hidden = true;
  field.parentNode.insertBefore(card, field.nextSibling);
  return card;
}

function v92ShowDiscovery(dev, count){
  var card = v92DiscoveryCard();
  if (!card) return;
  if (!dev){ card.hidden = true; card.innerHTML = ''; return; }
  var title = dev.name || dev.serial || 'Bambu printer';
  var bits = [];
  if (dev.model) bits.push(dev.model);
  if (dev.ip) bits.push(dev.ip);
  if (dev.serial) bits.push(String(dev.serial).toUpperCase());
  card.hidden = false;
  card.innerHTML = '<strong>Detected: ' + esc(title) + '</strong>' +
    (bits.length ? '<div class="v92-discovery-meta">' + esc(bits.join(' · ')) + '</div>' : '') +
    '<div class="v92-discovery-next">Next: enter the LAN access code, then choose <strong>Save &amp; Verify</strong>.</div>';
  if (count && count > 1) card.querySelector('.v92-discovery-next').textContent =
    count + ' printers found. Select the printer you want to assign to this slot.';
}

function renderLanDevices(mode, sel, devs){
  if (devs.length === 0){
    v92ShowDiscovery(null);
    showToast('No Bambu printers found. Same Wi-Fi/subnet is required; you can still enter details manually.');
    return;
  }
  if (devs.length === 1){
    fillLanDevice(mode, devs[0]);
    v92ShowDiscovery(devs[0], 1);
    showToast('Printer discovered. Enter the LAN access code, then Save & Verify.');
    return;
  }
  var ph = document.createElement('option');
  ph.value = ''; ph.textContent = 'Select a printer (' + devs.length + ' found)...';
  sel.appendChild(ph);
  devs.forEach(function(dev){
    var o = document.createElement('option');
    o.value = (dev.serial || '').toUpperCase();
    o.setAttribute('data-ip', dev.ip || '');
    o.setAttribute('data-name', dev.name || '');
    o.setAttribute('data-model', dev.model || '');
    o.textContent = (dev.name || dev.serial) + (dev.model ? ' (' + dev.model + ')' : '') +
                    ' - ' + o.value + (dev.ip ? ' @ ' + dev.ip : '');
    sel.appendChild(o);
  });
  sel.style.display = '';
  v92ShowDiscovery({name: devs.length + ' Bambu printers'}, devs.length);
  showToast(devs.length + ' printers found - choose one for this slot');
}

function fillLanDevice(mode, dev){
  var serial = (dev.serial || '').toUpperCase();
  if (mode === 'lan'){
    document.getElementById('serial').value = serial;
    if (dev.ip) document.getElementById('ip').value = dev.ip;
    var name = document.getElementById('pname');
    if (name && dev.name){
      var current = name.value.trim();
      if (!current || /^My P1S$/i.test(current) || /^Bambu printer$/i.test(current))
        name.value = String(dev.name).substring(0, 23);
    }
  } else {
    document.getElementById('cl_serial').value = serial;
    var cloudName = document.getElementById('cl_pname');
    if (cloudName && dev.name && !cloudName.value.trim()) cloudName.value = String(dev.name).substring(0, 23);
  }
  v92ShowDiscovery(dev, 1);
  updatePrinterOnboarding();
  refreshGaugeProfileUi();
  refreshPrinterHealth(false);
}

function pickLanDevice(mode){
  var sel = document.getElementById(mode === 'lan' ? 'lan_devsel' : 'cl_devsel');
  if (!sel.value) return;
  var opt = sel.options[sel.selectedIndex];
  fillLanDevice(mode, {
    serial: sel.value,
    ip: opt.getAttribute('data-ip') || '',
    name: opt.getAttribute('data-name') || '',
    model: opt.getAttribute('data-model') || ''
  });
}
'''
    text = replace_once(text, old, new, "smart LAN discovery UX")

    tail_anchor = "setTimeout(loadSmartHubConfig, 0);\n\n/* BambuHelper smart display platform evolution v6 */\n"
    tail_new = r'''setTimeout(loadSmartHubConfig, 0);

/* ============ Smart Home v9.2 portal evolution ============ */
function v92PortalEvolution(){
  if (document.getElementById('v92EvolutionStyle')) return;

  var style = document.createElement('style');
  style.id = 'v92EvolutionStyle';
  style.textContent =
    '.v92-build-pill{margin-left:6px;border-color:rgba(249,115,22,.45)!important;color:#ff9b68!important;background:rgba(249,115,22,.10)!important}' +
    '.v92-discovery{margin-top:12px;padding:12px 14px;border:1px solid rgba(46,160,67,.45);border-radius:10px;background:rgba(46,160,67,.08);line-height:1.45}' +
    '.v92-discovery strong{color:var(--text)}' +
    '.v92-discovery-meta{margin-top:4px;color:var(--text-dim);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}' +
    '.v92-discovery-next{margin-top:7px;color:var(--success);font-size:12.5px}' +
    '.v92-hw-note{margin-top:6px;color:var(--text-dim);font-size:12px}';
  document.head.appendChild(style);

  var brand = document.querySelector('.brand');
  if (brand && !document.getElementById('smartHomeBuildPill')){
    var pill = document.createElement('span');
    pill.id = 'smartHomeBuildPill';
    pill.className = 'version-pill v92-build-pill';
    pill.textContent = 'Smart Home v9.2';
    brand.appendChild(pill);
  }

  var intro = document.querySelector('#sec-printer .section-intro p');
  var tabs = document.querySelectorAll('#printerTabs .tab-btn');
  if (intro && tabs.length){
    intro.textContent = 'Configure ' + tabs.length + ' printer slot' + (tabs.length === 1 ? '' : 's') +
      ' available on this hardware build. Each slot is independent - use LAN Direct or Bambu Cloud.';
    var note = document.createElement('div');
    note.className = 'v92-hw-note';
    note.textContent = 'Smart Home reports the slots this device can actually run instead of advertising unavailable capacity.';
    intro.parentNode.appendChild(note);
  }

  v92DiscoveryCard();
}
setTimeout(v92PortalEvolution, 0);

/* BambuHelper smart display platform evolution v6 */
'''
    text = replace_once(text, tail_anchor, tail_new, "v9.2 portal bootstrap")

    p.write_text(text, encoding="utf-8")


def patch_hub(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(text, '    drawHeader("HOME", "v9 UI", 0);\n',
                        '    drawHeader("HOME", "v9.2", 0);\n', "home build label")
    text = replace_once(text, '    drawHeader("SYSTEM", "v9 UI RC2", 3);\n',
                        '    drawHeader("SYSTEM", "v9.2", 3);\n', "system build label")

    no_printer_old = '''    setFont(tft, FONT_SMALL);
    tft.setTextColor(UI_DIM, UI_PANEL);
    tft.drawString("Open the web portal to configure Bambu LAN or cloud access",
                   W / 2, 289);
    tft.drawString("Then Home becomes your live print command center",
                   W / 2, 312);
    uiPill(91, 338, 138, "SETUP REQUIRED", UI_AMBER);
'''
    no_printer_new = '''    setFont(tft, FONT_SMALL);
    tft.setTextColor(UI_DIM, UI_PANEL);
    const bool setupWifiReady = WiFi.status() == WL_CONNECTED;
    tft.drawString(setupWifiReady ? "Open the web portal and scan your LAN"
                                  : "Connect WiFi, then open the web portal",
                   W / 2, 286);
    String setupAddress = setupWifiReady ? WiFi.localIP().toString()
                                         : String("WiFi setup required");
    setFont(tft, FONT_BODY);
    tft.setTextColor(setupWifiReady ? UI_GREEN : UI_AMBER, UI_PANEL);
    tft.drawString(setupAddress, W / 2, 312);
    uiPill(79, 342, 162, setupWifiReady ? "LAN SCAN READY" : "SETUP REQUIRED",
           setupWifiReady ? UI_GREEN : UI_AMBER);
'''
    text = replace_once(text, no_printer_old, no_printer_new, "touchscreen printer onboarding")

    old_ver = '''  char ver[44];
  snprintf(ver, sizeof(ver), "BambuHelper %s • Smart Home v9.0", FW_VERSION);
  tft.drawString(ver, 18, 391);
  setFont(tft, FONT_SMALL);
  tft.setTextColor(UI_ORANGE, UI_PANEL);
  char build[50];
  snprintf(build, sizeof(build), "UI RC2 • %s • session + SHA-256",
           SMART_HOME_UPSTREAM_SHA_SHORT);
  tft.drawString(build, 18, 414);
'''
    new_ver = '''  char ver[48];
  snprintf(ver, sizeof(ver), "BambuHelper %s • %s", FW_VERSION, SMART_HOME_VERSION);
  tft.drawString(ver, 18, 391);
  setFont(tft, FONT_SMALL);
  tft.setTextColor(UI_ORANGE, UI_PANEL);
  char build[54];
  snprintf(build, sizeof(build), "Smart Printer RC1 • OTA + LAN discovery");
  tft.drawString(build, 18, 414);
'''
    text = replace_once(text, old_ver, new_ver, "system provenance")

    p.write_text(text, encoding="utf-8")


def patch_build(repo: Path) -> None:
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(text, '#define SMART_HOME_VERSION "v9.1"\n',
                        '#define SMART_HOME_VERSION "v9.2"\n', "version")
    text = replace_once(text, '#define SMART_HOME_PROFILE "reliable-control-plane"\n',
                        '#define SMART_HOME_PROFILE "smart-printer-control-plane"\n', "profile")
    text = replace_once(text, '#define SMART_HOME_BUILD_LABEL "Smart Home v9.1 Reliability RC1"\n',
                        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.2 Smart Printer RC1"\n', "build label")
    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_app(repo)
    patch_hub(repo)
    patch_build(repo)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print('Smart Home v9.2 patch ready. Use --apply to modify the target tree.')
        return 0
    apply(repo)
    print('Smart Home v9.2 Smart Printer evolution applied')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
