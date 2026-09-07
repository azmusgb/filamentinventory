#!/usr/bin/env python3
from pathlib import Path
import argparse


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    if text.count(old) != 1:
        raise RuntimeError(f'non-unique anchor: {label} ({text.count(old)})')
    return text.replace(old, new, 1)


def patch(repo: Path):
    # --- Build identity -----------------------------------------------------
    p = repo / 'include/smart_home_build.h'
    s = p.read_text()
    s = s.replace('#define SMART_HOME_VERSION "v11.2"', '#define SMART_HOME_VERSION "v11.3"')
    s = s.replace('#define SMART_HOME_PROFILE "workshop-tools"', '#define SMART_HOME_PROFILE "printer-control"')
    s = s.replace('Smart Home v11.2 Workshop Tools RC1', 'Smart Home v11.3 Printer Control RC1')
    p.write_text(s)

    # --- MQTT command bus --------------------------------------------------
    p = repo / 'src/bambu_mqtt.h'
    s = p.read_text()
    anchor = 'void requestLightCommand(uint8_t slot, bool on);  // chamber light on/off; deferred + published on the MQTT context\n'
    addition = anchor + '''\n// Safe, deferred print-control commands. These are published from the MQTT\n// context just like the chamber-light command so PubSubClient is never called\n// from the touchscreen or web-server task.\nenum PrinterControlCommand : uint8_t {\n  PRINTER_CTRL_NONE = 0,\n  PRINTER_CTRL_PAUSE,\n  PRINTER_CTRL_RESUME,\n  PRINTER_CTRL_STOP\n};\nbool requestPrinterControlCommand(uint8_t slot, PrinterControlCommand command);\n'''
    s = replace_once(s, anchor, addition, 'bambu_mqtt.h printer control declarations')
    p.write_text(s)

    p = repo / 'src/bambu_mqtt.cpp'
    s = p.read_text()
    anchor = 'static volatile int8_t g_lightCmdReq[MAX_ACTIVE_PRINTERS];\n'
    addition = anchor + 'static volatile uint8_t g_printerCtrlReq[MAX_ACTIVE_PRINTERS];\n'
    s = replace_once(s, anchor, addition, 'printer command queue declaration')

    anchor = '''static bool sendLightCtrl(MqttConn& c, bool on) {\n  if (!c.mqtt) return false;\n\n  PrinterConfig& cfg = printers[c.slotIndex].config;\n  char topic[64];\n  snprintf(topic, sizeof(topic), "device/%s/request", cfg.serial);\n\n  MQTT_LOG("[%d] light %s -> %s", c.slotIndex, on ? "on" : "off", topic);\n  bool ok = sendLightCtrlNode(c, topic, "chamber_light", on);\n  // H2C/H2D have a second bar (chamber_light2) the app keeps in sync; control both.\n  if (printers[c.slotIndex].state.hasSecondLight)\n    ok &= sendLightCtrlNode(c, topic, "chamber_light2", on);\n  return ok;\n}\n'''
    addition = anchor + '''\nstatic const char* printerControlCommandName(PrinterControlCommand command) {\n  switch (command) {\n    case PRINTER_CTRL_PAUSE: return "pause";\n    case PRINTER_CTRL_RESUME: return "resume";\n    case PRINTER_CTRL_STOP: return "stop";\n    default: return nullptr;\n  }\n}\n\nstatic bool sendPrinterControl(MqttConn& c, PrinterControlCommand command) {\n  if (!c.mqtt) return false;\n  const char* name = printerControlCommandName(command);\n  if (!name) return false;\n  PrinterConfig& cfg = printers[c.slotIndex].config;\n  char topic[64];\n  snprintf(topic, sizeof(topic), "device/%s/request", cfg.serial);\n  char payload[128];\n  snprintf(payload, sizeof(payload),\n           "{\\\"print\\\":{\\\"sequence_id\\\":\\\"%u\\\",\\\"command\\\":\\\"%s\\\"}}",\n           c.pushallSeqId++, name);\n  MQTT_LOG("[%d] printer control %s -> %s", c.slotIndex, name, topic);\n  if (!c.mqtt->publish(topic, payload)) {\n    MQTT_LOG("[%d] printer control %s publish FAILED", c.slotIndex, name);\n    return false;\n  }\n  return true;\n}\n'''
    s = replace_once(s, anchor, addition, 'send printer control backend')

    s = s.replace('g_lightCmdReq[i] = -1;  // no pending light command\n',
                  'g_lightCmdReq[i] = -1;  // no pending light command\n    g_printerCtrlReq[i] = PRINTER_CTRL_NONE;\n')

    anchor = '''void requestLightCommand(uint8_t slot, bool on) {\n  if (slot >= MAX_ACTIVE_PRINTERS) return;\n  g_lightCmdReq[slot] = on ? 1 : 0;\n  // Turning the light on (manual or print-start) cancels any pending auto-off.\n  if (on) printers[slot].state.lightOffDueMs = 0;\n}\n'''
    addition = anchor + '''\nbool requestPrinterControlCommand(uint8_t slot, PrinterControlCommand command) {\n  if (slot >= MAX_ACTIVE_PRINTERS || !isPrinterConfigured(slot)) return false;\n  if (command < PRINTER_CTRL_PAUSE || command > PRINTER_CTRL_STOP) return false;\n  g_printerCtrlReq[slot] = (uint8_t)command;\n  return true;\n}\n'''
    s = replace_once(s, anchor, addition, 'request printer control API')

    anchor = '''    if (g_lightCmdReq[i] >= 0 && conns[i].mqtt && conns[i].mqtt->connected()) {\n      bool on = (g_lightCmdReq[i] == 1);\n      g_lightCmdReq[i] = -1;\n      sendLightCtrl(conns[i], on);\n    }\n'''
    addition = anchor + '''    // Drain manual pause/resume/stop requests on the MQTT task. If the\n    // printer is disconnected, leave the request queued; UI/API gating prevents\n    // new commands while offline, and this preserves task-safety during races.\n    if (g_printerCtrlReq[i] != PRINTER_CTRL_NONE && conns[i].mqtt && conns[i].mqtt->connected()) {\n      PrinterControlCommand command = (PrinterControlCommand)g_printerCtrlReq[i];\n      g_printerCtrlReq[i] = PRINTER_CTRL_NONE;\n      sendPrinterControl(conns[i], command);\n    }\n'''
    s = replace_once(s, anchor, addition, 'drain printer command queue')
    p.write_text(s)

    # --- Physical Printer control surface ---------------------------------
    p = repo / 'src/smart_hub.cpp'
    s = p.read_text()
    old = '''static HubRect hubPrinterActionRect(uint8_t i) {\n  const int16_t W=tft.width();\n  if (hubLandscape()) return hr(286,146+i*58,W-294,50);\n  const int16_t g=8,m=8,cw=(W-2*m-g)/2;\n  return hr(m+i*(cw+g),380,cw,46);\n}\n'''
    new = '''static HubRect hubPrinterActionRect(uint8_t i) {\n  const int16_t W=tft.width();\n  if (hubLandscape()) {\n    const int16_t x0=286,g=6,cw=(W-x0-8-g)/2;\n    return hr(x0+(i%2)*(cw+g),146+(i/2)*58,cw,50);\n  }\n  const int16_t g=8,m=8,cw=(W-2*m-g)/2;\n  return hr(m+(i%2)*(cw+g),380,cw,46);\n}\n'''
    s = replace_once(s, old, new, 'printer control geometry')

    old = 'drawTelemetryRail(hr(286,42,186,96),s);drawAmsCompact(hr(8,204,270,60),s);uiActionButton(hubPrinterActionRect(0),s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);uiActionButton(hubPrinterActionRect(1),"MATERIALS",UI_PURPLE);'
    new = '''drawTelemetryRail(hr(286,42,186,96),s);drawAmsCompact(hr(8,204,270,60),s);\n    const bool paused=(s.gcodeStateId==GCODE_PAUSE);\n    const bool active=s.printing||paused;\n    uiActionButton(hubPrinterActionRect(0),s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);\n    uiActionButton(hubPrinterActionRect(1),paused?"RESUME":"PAUSE",active?(paused?UI_GREEN:UI_CYAN):UI_DIM);\n    uiActionButton(hubPrinterActionRect(2),"MATERIALS",UI_PURPLE);\n    uiActionButton(hubPrinterActionRect(3),active?"HOLD STOP":"STOP",active?UI_RED:UI_DIM);'''
    s = replace_once(s, old, new, 'landscape printer control buttons')

    old = 'drawTelemetryRail(hr(8,217,W-16,60),s);drawAmsCompact(hr(8,285,W-16,87),s);uiActionButton(hubPrinterActionRect(0),s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);uiActionButton(hubPrinterActionRect(1),"MATERIALS",UI_PURPLE);'
    new = '''drawTelemetryRail(hr(8,217,W-16,60),s);drawAmsCompact(hr(8,285,W-16,87),s);\n    const bool paused=(s.gcodeStateId==GCODE_PAUSE);\n    const bool active=s.printing||paused;\n    uiActionButton(hubPrinterActionRect(0),s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);\n    uiActionButton(hubPrinterActionRect(1),paused?"RESUME":"PAUSE",active?(paused?UI_GREEN:UI_CYAN):UI_DIM);'''
    s = replace_once(s, old, new, 'portrait printer control buttons')

    old = 'if(cur==SCREEN_HUB_PRINTER){if(hubPrinterActionRect(0).contains(x,y)&&isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;requestLightCommand(rotState.displayIndex,s.lightState!=1);g_dirty=true;return true;}if(hubPrinterActionRect(1).contains(x,y)){setPage(SCREEN_HUB_WORKSHOP);return true;}return true;}'
    new = '''if(cur==SCREEN_HUB_PRINTER){\n    if(!isAnyPrinterConfigured())return true;\n    BambuState&s=displayedPrinter().state;const uint8_t slot=rotState.displayIndex;const bool paused=(s.gcodeStateId==GCODE_PAUSE);const bool active=s.printing||paused;\n    if(hubPrinterActionRect(0).contains(x,y)){if(s.connected)requestLightCommand(slot,s.lightState!=1);g_dirty=true;return true;}\n    if(hubPrinterActionRect(1).contains(x,y)){if(s.connected&&active)requestPrinterControlCommand(slot,paused?PRINTER_CTRL_RESUME:PRINTER_CTRL_PAUSE);g_dirty=true;return true;}\n    if(hubLandscape()&&hubPrinterActionRect(2).contains(x,y)){setPage(SCREEN_HUB_WORKSHOP);return true;}\n    if(hubLandscape()&&hubPrinterActionRect(3).contains(x,y)){if(s.connected&&active&&longPress){requestPrinterControlCommand(slot,PRINTER_CTRL_STOP);buzzerPlay(BUZZ_CLICK);g_dirty=true;}return true;}\n    return true;\n  }'''
    s = replace_once(s, old, new, 'printer touch control routing')
    p.write_text(s)

    # --- Web API -----------------------------------------------------------
    p = repo / 'src/web_server.cpp'
    s = p.read_text()
    anchor = '''static void handleLightSet() {\n  uint8_t slot = 0;\n  if (server.hasArg("slot")) slot = server.arg("slot").toInt();\n  if (slot >= MAX_ACTIVE_PRINTERS) slot = 0;\n  if (!isPrinterConfigured(slot)) {\n    server.send(409, "application/json", "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}");\n    return;\n  }\n  String mode = server.hasArg("mode") ? server.arg("mode") : String();\n  if (mode != "on" && mode != "off") {\n    server.send(400, "application/json", "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"mode must be on or off\\\"}");\n    return;\n  }\n  requestLightCommand(slot, mode == "on");\n  server.send(200, "application/json", "{\\\"status\\\":\\\"ok\\\"}");\n}\n'''
    addition = anchor + '''\n// Everyday printer remote control. STOP requires an explicit confirmation\n// token even after authentication so a stray browser/touch request cannot\n// cancel a print. State-specific validity is enforced here as well as in UI.\nstatic void handlePrinterControl() {\n  uint8_t slot = server.hasArg("slot") ? server.arg("slot").toInt() : 0;\n  if (slot >= MAX_ACTIVE_PRINTERS) slot = 0;\n  if (!isPrinterConfigured(slot)) { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}"); return; }\n  BambuState& st=printers[slot].state;\n  if (!st.connected) { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer offline\\\"}"); return; }\n  const String command=server.hasArg("command")?server.arg("command"):String();\n  const bool paused=(st.gcodeStateId==GCODE_PAUSE);\n  const bool active=st.printing||paused;\n  PrinterControlCommand code=PRINTER_CTRL_NONE;\n  if(command=="pause"&&active&&!paused)code=PRINTER_CTRL_PAUSE;\n  else if(command=="resume"&&paused)code=PRINTER_CTRL_RESUME;\n  else if(command=="stop"&&active){\n    if(!server.hasArg("confirm")||server.arg("confirm")!="STOP"){server.send(400,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"stop confirmation required\\\"}");return;}\n    code=PRINTER_CTRL_STOP;\n  } else { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"command not valid for current printer state\\\"}"); return; }\n  if(!requestPrinterControlCommand(slot,code)){server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"command not queued\\\"}");return;}\n  server.send(202,"application/json","{\\\"status\\\":\\\"queued\\\"}");\n}\n'''
    s = replace_once(s, anchor, addition, 'printer control web handler')
    s = replace_once(s, '  SECURE_POST("/light/set", handleLightSet);\n',
                     '  SECURE_POST("/light/set", handleLightSet);\n  SECURE_POST("/printer/control", handlePrinterControl);\n',
                     'printer control web route')
    p.write_text(s)

    # --- Browser Printer overview remote ----------------------------------
    p = repo / 'web/app.js'
    s = p.read_text()
    addition = r'''\n\n/* Smart Home v11.3 Printer Control */\nvar v113ControlTimer=null;\nfunction v113El(id){return document.getElementById(id)}\nfunction v113Post(path,data){var p=new URLSearchParams();Object.keys(data).forEach(function(k){p.append(k,data[k])});return fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.message||('HTTP '+r.status));return j})})}\nfunction v113PrinterCommand(cmd){var slot=Number(window.currentSlot||0);if(cmd==='stop'&&!window.confirm('Stop the current print? This cannot be undone.'))return;var b=v113El('v113ControlStatus');if(b)b.textContent='Sending '+cmd+'…';v113Post('/printer/control',{slot:slot,command:cmd,confirm:cmd==='stop'?'STOP':''}).then(function(){if(b)b.textContent=cmd.charAt(0).toUpperCase()+cmd.slice(1)+' command sent';showToast('Printer command sent');setTimeout(v113RefreshControls,700)}).catch(function(e){if(b)b.textContent=e.message||'Command failed';showToast('Command failed')})}\nfunction v113Light(mode){var slot=Number(window.currentSlot||0),b=v113El('v113ControlStatus');if(b)b.textContent='Turning light '+mode+'…';v113Post('/light/set',{slot:slot,mode:mode}).then(function(){if(b)b.textContent='Light command sent';setTimeout(v113RefreshControls,600)}).catch(function(e){if(b)b.textContent=e.message||'Light command failed'})}\nfunction v113EnsureControls(){var host=v113El('v96OverviewCards');if(!host||v113El('v113PrinterControl'))return;var card=document.createElement('div');card.id='v113PrinterControl';card.className='v113-control-card';card.innerHTML='<div class="v113-control-head"><div><span class="v96-eyebrow">PRINTER CONTROL</span><h3>Remote controls</h3><p>Direct controls for the selected printer. Stop is always confirmed.</p></div><span id="v113ControlStatus">Reading printer…</span></div><div class="v113-controls"><button id="v113Light" type="button" onclick="v113Light(this.dataset.mode||\'on\')">Light</button><button id="v113Pause" type="button" onclick="v113PrinterCommand(this.dataset.command||\'pause\')">Pause</button><button id="v113Stop" class="danger" type="button" onclick="v113PrinterCommand(\'stop\')">Stop print</button></div>';host.insertBefore(card,host.firstChild);v113RefreshControls();if(v113ControlTimer)clearInterval(v113ControlTimer);v113ControlTimer=setInterval(function(){var p=v113El('sec-printer');if(p&&p.style.display!=='none')v113RefreshControls()},2500)}\nfunction v113RefreshControls(){if(!v113El('v113PrinterControl')){v113EnsureControls();return}var slot=Number(window.currentSlot||0);fetch('/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){var connected=!!d.connected,state=String(d.state||'').toUpperCase(),paused=state==='PAUSE'||state==='PAUSED',active=!!d.printing||paused||state==='RUNNING'||state==='PRINTING';var l=v113El('v113Light'),p=v113El('v113Pause'),x=v113El('v113Stop'),s=v113El('v113ControlStatus');if(l){l.disabled=!connected;l.dataset.mode=Number(d.lightState)===1?'off':'on';l.textContent=Number(d.lightState)===1?'Turn light off':'Turn light on'}if(p){p.disabled=!connected||!active;p.dataset.command=paused?'resume':'pause';p.textContent=paused?'Resume print':'Pause print'}if(x)x.disabled=!connected||!active;if(s)s.textContent=connected?(active?(paused?'Print paused · controls ready':'Printing · controls ready'):'Printer ready · light control available'):'Printer offline'})['catch'](function(){var s=v113El('v113ControlStatus');if(s)s.textContent='Printer status unavailable'})}\n(function(){var boot=function(){var wait=setInterval(function(){if(v113El('v96OverviewCards')){clearInterval(wait);v113EnsureControls()}},250)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.nav-item[data-section="printer"]');if(b)setTimeout(v113EnsureControls,120)},true)}());\n'''
    s += addition
    p.write_text(s)

    p = repo / 'web/app.css'
    s = p.read_text()
    s += '''\n/* Smart Home v11.3 Printer Control */\n.v113-control-card{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));padding:18px;margin-bottom:14px}.v113-control-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.v113-control-head h3{margin:4px 0}.v113-control-head p{margin:0;color:var(--muted);font-size:12px}.v113-control-head>span{font-size:12px;color:var(--muted);text-align:right}.v113-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.v113-controls button{min-height:48px;border-radius:13px;border:1px solid var(--line);background:var(--card2);color:var(--ink);font-weight:750;cursor:pointer}.v113-controls button:hover:not(:disabled){transform:translateY(-1px);border-color:var(--accent)}.v113-controls button.danger{border-color:rgba(239,68,68,.45);color:#ffb4b4}.v113-controls button:disabled{opacity:.38;cursor:not-allowed}@media(max-width:700px){.v113-control-head{display:block}.v113-control-head>span{display:block;text-align:left;margin-top:8px}.v113-controls{grid-template-columns:1fr}}\n'''
    p.write_text(s)

    print('Smart Home v11.3 Printer Control applied')


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args=ap.parse_args()
    repo=Path(args.repo).resolve()
    if not args.apply:
        print('Use --apply to modify the reconstructed BambuHelper tree')
        return
    patch(repo)

if __name__ == '__main__': main()
