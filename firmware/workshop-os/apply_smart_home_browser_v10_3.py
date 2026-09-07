#!/usr/bin/env python3
from pathlib import Path

class PatchError(RuntimeError): pass
HERE=Path(__file__).resolve().parent

def load(root,rel):
    p=root/rel
    if not p.exists(): raise PatchError(f'missing {rel}')
    return p.read_text()
def save(root,rel,text): (root/rel).write_text(text)
def asset(name):
    p=HERE/'assets'/name
    if not p.exists(): p=HERE/name
    if not p.exists(): raise PatchError(f'missing asset {name}')
    return p.read_text()
def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise PatchError(f'{label}: expected one anchor, found {n}')
    return text.replace(old,new,1)
def between(text,start,end,replacement,label):
    a=text.find(start); b=text.find(end,a+len(start))
    if a<0 or b<0: raise PatchError(f'{label}: boundary missing')
    b+=len(end)
    return text[:a]+replacement+text[b:]

def patch(root:Path):
    rel='include/smart_home_build.h'; t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v10.2"','#define SMART_HOME_VERSION "v10.3"','version')
    t=once(t,'#define SMART_HOME_PROFILE "workshop-os-ui-polish"','#define SMART_HOME_PROFILE "workshop-os-browser"','profile')
    t=once(t,'#define SMART_HOME_BUILD_LABEL "Smart Home v10.2 Workshop UI Polish RC1"','#define SMART_HOME_BUILD_LABEL "Smart Home v10.3 Browser Workshop OS RC1"','label'); save(root,rel,t)

    rel='src/web_template.cpp'; t=load(root,rel)
    t=once(t,'#include "config.h"\n','#include "config.h"\n#include "smart_home_build.h"\n','build include')
    a='  if (strcmp(name, "ES8311_AUDIO") == 0) {'
    t=once(t,a,'  if (strcmp(name, "SMART_VER") == 0) { out = SMART_HOME_VERSION; return true; }\n\n'+a,'version token'); save(root,rel,t)

    rel='src/web_server.cpp'; t=load(root,rel)
    old='  doc["fan"] = st.coolingFanPct;\n  doc["layer"] = st.layerNum;\n  doc["layers"] = st.totalLayers;\n'
    new='''  doc["fan"] = st.coolingFanPct;
  doc["chamber"] = (int)st.chamberTemp;
  doc["remaining"] = st.remainingMinutes;
  doc["layer"] = st.layerNum;
  doc["layers"] = st.totalLayers;

  JsonObject ams = doc["ams"].to<JsonObject>();
  ams["present"] = st.ams.present;
  ams["units"] = st.ams.unitCount;
  ams["activeTray"] = st.ams.activeTray;
  ams["externalPresent"] = st.ams.vtPresent;
  if (st.ams.vtPresent) {
    ams["externalType"] = st.ams.vtType;
    char c[8]; rgb565ToHtml(st.ams.vtColorRgb565, c); ams["externalColor"] = c;
  }
  JsonArray trays = ams["trays"].to<JsonArray>();
  for (uint8_t i = 0; i < AMS_MAX_TRAYS; ++i) {
    const AmsTray& tr = st.ams.trays[i];
    if (!tr.present) continue;
    JsonObject jt = trays.add<JsonObject>();
    jt["slot"] = i; jt["type"] = tr.type; jt["remain"] = tr.remain;
    jt["active"] = (st.ams.activeTray == i);
    char c[8]; rgb565ToHtml(tr.colorRgb565, c); jt["color"] = c;
  }
'''
    t=once(t,old,new,'workshop status API'); save(root,rel,t)

    rel='include/web_pages.h'; t=load(root,rel)
    t=once(t,'<div class="mark">B</div>','<div class="mark">WH</div>','brand')
    t=once(t,'<span class="version-pill">Smart Home · %FW_VER%</span>','<span class="version-pill">Workshop OS · %SMART_VER%</span>','brand version')
    sidebar='''<aside class="sidebar" id="sidebar">
  <div class="portal-nav-brand"><span class="portal-nav-mark">WH</span><span><strong>Waveshare Home</strong><small>Local Workshop OS</small></span></div>
  <h4>Workspaces</h4>
  <button class="nav-item" type="button" data-section="home" aria-current="true"><span>Home</span><span class="nav-kicker">Live</span></button>
  <button class="nav-item" type="button" data-section="printer"><span>Printer</span></button>
  <button class="nav-item" type="button" data-section="workshop"><span>Workshop</span></button>
%HMS_NAV%
  <h4>Experience</h4>
  <button class="nav-item" type="button" data-section="display"><span>Display &amp; Experience</span></button>
  <button class="nav-item" type="button" data-section="hardware"><span>Sound &amp; Hardware</span></button>
  <h4>Connections</h4>
  <button class="nav-item" type="button" data-section="wifi"><span>Network &amp; Updates</span></button>
  <button class="nav-item" type="button" data-section="power"><span>Power &amp; Automation</span></button>
  <h4>System</h4>
  <button class="nav-item" type="button" data-section="diag"><span>Diagnostics</span></button>
  <button class="nav-item" type="button" data-section="advanced"><span>Advanced</span></button>
  <div class="sidebar-footer"><div><strong>Workshop OS %SMART_VER%</strong></div><div style="margin-top:2px">%BOARD% &middot; local-first</div><div style="margin-top:4px">BambuHelper %FW_VER% engine</div></div>
</aside>'''
    t=between(t,'<aside class="sidebar" id="sidebar">','</aside>',sidebar,'sidebar')
    t=once(t,'<h2>Your printer and Waveshare, operational at a glance.</h2>','<h2>Your workshop, printer and device — operational at a glance.</h2>','home title')
    t=once(t,'<p>Status first. Common actions stay one tap away; configuration and diagnostics remain available when you need them.</p>','<p>A local-first command center for printing, filament, device health and recovery. Everyday work stays up front; deep configuration stays organized behind it.</p>','home copy')
    t=once(t,'        <button type="button" class="btn btn-primary" onclick="ccVerifyPrinter()">Verify printer</button>\n        <button type="button" class="btn btn-ghost" onclick="ccScanPrinter()">Scan network</button>\n        <button type="button" class="btn btn-ghost" onclick="loadSection(\'display\')">Tune display</button>', '        <button type="button" class="btn btn-primary" onclick="loadSection(\'workshop\')">Open workshop</button>\n        <button type="button" class="btn btn-ghost" onclick="loadSection(\'printer\')">Printer</button>\n        <button type="button" class="btn btn-ghost" onclick="loadSection(\'diag\')">System health</button>','home actions')
    t=t.replace('<strong>Wi-Fi & system</strong><small>Network, backup, firmware</small>','<strong>Network & updates</strong><small>Wi-Fi, backup and firmware</small>')
    t=t.replace('<strong>Hardware</strong><small>Touch, buzzer, LEDs</small>','<strong>Sound & hardware</strong><small>Speaker, microphone, touch and LEDs</small>')
    t=t.replace('<strong>Power</strong><small>Tasmota and monitoring</small>','<strong>Power & automation</strong><small>Tasmota, monitoring and rules</small>')
    t=t.replace('<strong>Advanced</strong><small>Expert display behavior</small>','<strong>Advanced</strong><small>Expert controls and maintenance</small>')
    t=once(t,'<!-- ===== Section 1: Printer ===== -->',asset('v10_3_workshop.html')+'<!-- ===== Section 1: Printer ===== -->','workshop page')
    t=once(t,'<h2>Display</h2>\n    <p>Tune brightness, the clock, what happens after a print finishes, and how gauges look.</p>','<h2>Display &amp; Experience</h2>\n    <p>Shape the physical touchscreen experience: brightness, standby behavior, Smart Home pages, widgets and visual presentation.</p>','display title')
    t=once(t,'<h2>Hardware</h2>\n    <p>Board-specific configuration. Available options depend on which display device you flashed.</p>','<h2>Sound &amp; Hardware</h2>\n    <p>Speaker, onboard microphone, touch, LEDs and board-specific controls for this Waveshare device.</p>','hardware title')
    t=once(t,'<h2>WiFi &amp; System</h2>\n    <p>Network credentials, settings backup, firmware updates, factory reset.</p>','<h2>Network &amp; Updates</h2>\n    <p>Wi-Fi, IP configuration, settings backup and firmware updates. Recovery remains independently available.</p>','network title'); save(root,rel,t)

    rel='web/app.js'; t=load(root,rel)
    old="""var SECTION_LABELS = {
  home: 'Home',
  printer: 'Printer Settings',
  display: 'Display',
  errors: 'Printer Errors',
  hardware: 'Hardware',
  advanced: 'Advanced',
  wifi: 'WiFi & System',
  power: 'Power Monitoring',
  diag: 'Diagnostics'
};"""
    new="""var SECTION_LABELS = {
  home: 'Home',
  printer: 'Printer',
  workshop: 'Workshop',
  display: 'Display & Experience',
  errors: 'Printer Errors',
  hardware: 'Sound & Hardware',
  advanced: 'Advanced',
  wifi: 'Network & Updates',
  power: 'Power & Automation',
  diag: 'Diagnostics'
};"""; t=once(t,old,new,'labels')
    old='''  startPolling(id);
  if (id === 'home') { refreshCommandCenter(false); if (ccTimer) clearInterval(ccTimer); ccTimer = setInterval(function(){ refreshCommandCenter(false); }, 5000); }
}'''
    new='''  startPolling(id);
  if (ccTimer && id !== 'home') { clearInterval(ccTimer); ccTimer = null; }
  if (window.v103WorkshopTimer && id !== 'workshop') { clearInterval(window.v103WorkshopTimer); window.v103WorkshopTimer = null; }
  if (id === 'home') { refreshCommandCenter(false); if (ccTimer) clearInterval(ccTimer); ccTimer = setInterval(function(){ refreshCommandCenter(false); }, 5000); }
  if (id === 'workshop') { v103RefreshWorkshop(false); if (window.v103WorkshopTimer) clearInterval(window.v103WorkshopTimer); window.v103WorkshopTimer=setInterval(function(){v103RefreshWorkshop(false)},4000); }
}'''; t=once(t,old,new,'poll lifecycle')
    t=once(t,'/* ============ Boot ============ */',asset('v10_3_browser.js')+'/* ============ Boot ============ */','workshop JS'); save(root,rel,t)

    rel='web/app.css'; t=load(root,rel); save(root,rel,t+asset('v10_3_browser.css'))

    checks={'include/smart_home_build.h':['SMART_HOME_VERSION "v10.3"'],'include/web_pages.h':['id="sec-workshop"','Workspaces','Sound &amp; Hardware'],'web/app.js':['v103RefreshWorkshop',"workshop: 'Workshop'"],'web/app.css':['Smart Home v10.3 Browser Workshop OS'],'src/web_server.cpp':['JsonObject ams = doc["ams"]'],'src/web_template.cpp':['strcmp(name, "SMART_VER")']}
    for rel,needles in checks.items():
        body=load(root,rel)
        for n in needles:
            if n not in body: raise PatchError(f'{rel}: missing {n}')

def main():
    import argparse
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args();patch(Path(a.repo).resolve());print('Smart Home v10.3 Browser Workshop OS applied');return 0
if __name__=='__main__': raise SystemExit(main())
