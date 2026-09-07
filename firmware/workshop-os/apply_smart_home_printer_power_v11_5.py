from pathlib import Path
import shutil, sys

def replace_once(text, old, new, label):
    c=text.count(old)
    if c!=1: raise RuntimeError(f'{label}: count={c}')
    return text.replace(old,new,1)

def patch(repo):
    repo=Path(repo)
    # build
    p=repo/'include/smart_home_build.h'; s=p.read_text()
    s=s.replace('#define SMART_HOME_VERSION "v11.4"','#define SMART_HOME_VERSION "v11.5"')
    s=s.replace('#define SMART_HOME_PROFILE "control-polish"','#define SMART_HOME_PROFILE "printer-power"')
    s=s.replace('Smart Home v11.4 Control Polish RC1','Smart Home v11.5 Printer Power RC1')
    p.write_text(s)

    # display ui public entry into proven power confirm modal
    p=repo/'src/display_ui.h'; s=p.read_text()
    anchor='bool powerConfirmGetView(PowerConfirmView* out);\n'
    add=anchor+'// Open the existing guarded smart-plug confirmation modal for a printer slot.\n// Returns false when no enabled plug is mapped to that printer.\nbool powerConfirmOpenForSlot(uint8_t slot);\n'
    s=replace_once(s,anchor,add,'display_ui power opener')
    p.write_text(s)

    # main wrapper
    p=repo/'src/main.cpp'; s=p.read_text()
    anchor='''static void openPowerConfirm(uint8_t slot) {\n  pcSlot = slot;\n  pcPlug = tasmotaControlPlugForSlot(slot);\n  TasmotaPlugStatsView v;\n  tasmotaGetStats(pcPlug, &v);\n  // Mirror the web-UI inference: Shelly/Kasa report relay state; Tasmota infers from watts.\n  bool currentOn = v.powerStateKnown ? v.powerOn : (v.online && v.watts > 0.5f);\n  pcDesiredOn      = !currentOn;\n  pcWasPrinting    = isPrintingGcodeState(printers[slot].state.gcodeStateId);\n  pcPriorScreen    = getScreenState();\n  pcPhase          = PC_WAIT_RELEASE;   // require a finger release before arming\n  pcPrevHeld       = true;\n  pcProgress       = 0.0f;\n  pcLastActivityMs = millis();\n  pcSendingDrawn   = false;\n  setScreenState(SCREEN_POWER_CONFIRM);\n}\n'''
    add=anchor+'''\nbool powerConfirmOpenForSlot(uint8_t slot) {\n  if (slot >= MAX_ACTIVE_PRINTERS || !isPrinterConfigured(slot)) return false;\n  uint8_t plug = tasmotaControlPlugForSlot(slot);\n  if (plug == 0xFF || !tasmotaSettings[plug].enabled) return false;\n  openPowerConfirm(slot);\n  return getScreenState() == SCREEN_POWER_CONFIRM;\n}\n'''
    s=replace_once(s,anchor,add,'main power modal wrapper')
    p.write_text(s)

    # smart hub tools power
    p=repo/'src/smart_hub.cpp'; s=p.read_text()
    s=replace_once(s,'#include "smart_hub.h"\n','#include "smart_hub.h"\n#include "display_ui.h"\n#include "tasmota.h"\n','smart hub power includes')
    old='''static HubRect hubToolsActionRect(uint8_t i) {\n  const int16_t W=tft.width();\n  if (hubLandscape()) {\n    const int16_t m=8,g=8,cw=(W-2*m-2*g)/3;\n    return hr(m+i*(cw+g),198,cw,54);\n  }\n  const int16_t m=12,g=6,cw=(W-2*m-2*g)/3;\n  return hr(m+i*(cw+g),348,cw,58);\n}\n'''
    new='''static HubRect hubToolsActionRect(uint8_t i) {\n  const int16_t W=tft.width();\n  if (hubLandscape()) {\n    const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;\n    return hr(m+i*(cw+g),198,cw,54);\n  }\n  const int16_t m=12,g=6,cw=(W-2*m-g)/2;\n  return hr(m+(i%2)*(cw+g),334+(i/2)*44,cw,38);\n}\n'''
    s=replace_once(s,old,new,'tools four-action geometry')

    old='''  const char* a0=workshopTimerActive()?"CANCEL":(g_workshopTimerDone?"DISMISS":(g_ambientEnabled?"AMBIENT ON":"AMBIENT OFF"));\n  uiActionButton(hubToolsActionRect(0),a0,workshopTimerActive()||g_workshopTimerDone?UI_AMBER:accent);\n  uiActionButton(hubToolsActionRect(1),"CLASSIC",UI_MUTED);\n  uiActionButton(hubToolsActionRect(2),"SYSTEM",UI_BLUE);\n'''
    new='''  const char* a0=workshopTimerActive()?"CANCEL":(g_workshopTimerDone?"DISMISS":(g_ambientEnabled?"AMBIENT ON":"AMBIENT OFF"));\n  uiActionButton(hubToolsActionRect(0),a0,workshopTimerActive()||g_workshopTimerDone?UI_AMBER:accent);\n  const uint8_t powerSlot=rotState.displayIndex;\n  const uint8_t powerPlug=tasmotaControlPlugForSlot(powerSlot);\n  bool powerMapped=(powerPlug!=0xFF);\n  bool powerOnline=false,powerOn=false;\n  if(powerMapped){TasmotaPlugStatsView pv;tasmotaGetStats(powerPlug,&pv);powerOnline=pv.online;powerOn=pv.powerStateKnown?pv.powerOn:(pv.online&&pv.watts>0.5f);}\n  const char* powerLabel=!powerMapped?"NO POWER":(!powerOnline?"POWER ?":(powerOn?"POWER OFF":"POWER ON"));\n  uiActionButton(hubToolsActionRect(1),powerLabel,powerMapped&&powerOnline?(powerOn?UI_RED:UI_GREEN):UI_DIM);\n  uiActionButton(hubToolsActionRect(2),"SYSTEM",UI_BLUE);\n  uiActionButton(hubToolsActionRect(3),"CLASSIC",UI_MUTED);\n'''
    s=replace_once(s,old,new,'tools power button')

    old='''      for(uint8_t i=0;i<3;i++)if(hubToolsActionRect(i).contains(x,y)){\n        if(i==0){if(workshopTimerActive()||g_workshopTimerDone)clearWorkshopTimer();else{g_ambientEnabled=!g_ambientEnabled;prefsSave();g_dirty=true;}}\n        else if(i==1)smartHubReturnToPrinter();\n        else setPage(SCREEN_HUB_SYSTEM);\n        return true;\n      }\n'''
    new='''      for(uint8_t i=0;i<4;i++)if(hubToolsActionRect(i).contains(x,y)){\n        if(i==0){if(workshopTimerActive()||g_workshopTimerDone)clearWorkshopTimer();else{g_ambientEnabled=!g_ambientEnabled;prefsSave();g_dirty=true;}}\n        else if(i==1){if(powerConfirmOpenForSlot(rotState.displayIndex))buzzerPlay(BUZZ_CLICK);else setPrinterFeedback(0,"POWER NOT MAPPED",1200);}\n        else if(i==2)setPage(SCREEN_HUB_SYSTEM);\n        else smartHubReturnToPrinter();\n        return true;\n      }\n'''
    s=replace_once(s,old,new,'tools power touch')
    p.write_text(s)

    # printer-scoped web power status/control API
    p=repo/'src/web_server.cpp'; s=p.read_text()
    anchor='''static void handlePrinterControl() {\n  uint8_t slot = server.hasArg("slot") ? server.arg("slot").toInt() : 0;\n  if (slot >= MAX_ACTIVE_PRINTERS) slot = 0;\n  if (!isPrinterConfigured(slot)) { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}"); return; }\n  BambuState& st=printers[slot].state;\n  if (!st.connected) { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer offline\\\"}"); return; }\n  const String command=server.hasArg("command")?server.arg("command"):String();\n  const bool paused=(st.gcodeStateId==GCODE_PAUSE);\n  const bool active=st.printing||paused;\n  PrinterControlCommand code=PRINTER_CTRL_NONE;\n  if(command=="pause"&&active&&!paused)code=PRINTER_CTRL_PAUSE;\n  else if(command=="resume"&&paused)code=PRINTER_CTRL_RESUME;\n  else if(command=="stop"&&active){\n    if(!server.hasArg("confirm")||server.arg("confirm")!="STOP"){server.send(400,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"stop confirmation required\\\"}");return;}\n    code=PRINTER_CTRL_STOP;\n  } else { server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"command not valid for current printer state\\\"}"); return; }\n  if(!requestPrinterControlCommand(slot,code)){server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"command not queued\\\"}");return;}\n  server.send(202,"application/json","{\\\"status\\\":\\\"queued\\\"}");\n}\n'''
    add=anchor+'''\nstatic void handlePrinterPowerStatus() {\n  uint8_t slot=server.hasArg("slot")?server.arg("slot").toInt():0;\n  if(slot>=MAX_ACTIVE_PRINTERS)slot=0;\n  JsonDocument doc;doc["slot"]=slot;\n  uint8_t plug=tasmotaControlPlugForSlot(slot);\n  const bool available=(plug!=0xFF&&tasmotaSettings[plug].enabled);\n  doc["available"]=available;\n  if(available){TasmotaPlugStatsView v;tasmotaGetStats(plug,&v);doc["plug"]=plug;doc["online"]=v.online;doc["stateKnown"]=v.powerStateKnown;doc["on"]=v.powerStateKnown?v.powerOn:(v.online&&v.watts>0.5f);doc["watts"]=v.watts;}\n  String json;serializeJson(doc,json);server.send(200,"application/json",json);\n}\n\nstatic void handlePrinterPower() {\n  uint8_t slot=server.hasArg("slot")?server.arg("slot").toInt():0;\n  if(slot>=MAX_ACTIVE_PRINTERS)slot=0;\n  if(!isPrinterConfigured(slot)){server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}");return;}\n  uint8_t plug=tasmotaControlPlugForSlot(slot);\n  if(plug==0xFF||!tasmotaSettings[plug].enabled){server.send(409,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"no power plug mapped to printer\\\"}");return;}\n  if(!server.hasArg("on")){server.send(400,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"missing on parameter\\\"}");return;}\n  const bool on=server.arg("on").toInt()!=0;\n  const bool printing=isPrintingGcodeState(printers[slot].state.gcodeStateId);\n  if(!on){\n    const String token=server.hasArg("confirm")?server.arg("confirm"):String();\n    const char* required=printing?"POWER OFF DURING PRINT":"POWER OFF";\n    if(token!=required){server.send(400,"application/json",printing?"{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printing: stronger power-off confirmation required\\\"}":"{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"power-off confirmation required\\\"}");return;}\n  }\n  if(tasmotaSetPower(plug,on))server.send(200,"application/json","{\\\"status\\\":\\\"ok\\\"}");\n  else server.send(502,"application/json","{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"power plug did not respond\\\"}");\n}\n'''
    s=replace_once(s,anchor,add,'printer power web handlers')
    s=replace_once(s,'  SECURE_POST("/printer/control", handlePrinterControl);\n','  SECURE_POST("/printer/control", handlePrinterControl);\n  SECURE_GET("/printer/power/status", handlePrinterPowerStatus);\n  SECURE_POST("/printer/power", handlePrinterPower);\n','printer power routes')
    p.write_text(s)

    # browser remote card power button + status
    p=repo/'web/app.js'; s=p.read_text()
    s=replace_once(s,"function v114ControlBusy(busy){['v113Light','v113Pause','v113Stop'].forEach(function(id){var el=v113El(id);if(el)el.disabled=!!busy})}","function v114ControlBusy(busy){['v113Light','v113Pause','v113Stop','v115Power'].forEach(function(id){var el=v113El(id);if(el)el.disabled=!!busy})}",'browser busy includes power')
    s=replace_once(s,"<button id=\"v113Stop\" class=\"danger\" type=\"button\" onclick=\"v113PrinterCommand(\\'stop\\')\">Stop print</button></div>'","<button id=\"v113Stop\" class=\"danger\" type=\"button\" onclick=\"v113PrinterCommand(\\'stop\\')\">Stop print</button><button id=\"v115Power\" type=\"button\" onclick=\"v115PrinterPower()\" disabled>Printer power</button></div>'",'browser power button')
    append=r'''\n\n/* Smart Home v11.5 Printer Power */\nvar v115PowerState={available:false,online:false,on:false,printing:false,busy:false};\nfunction v115RefreshPower(){var b=v113El('v115Power');if(!b)return;var slot=Number(window.currentSlot||0);Promise.all([fetch('/printer/power/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}),fetch('/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()})]).then(function(v){var p=v[0]||{},d=v[1]||{},state=String(d.state||'').toUpperCase();v115PowerState.available=!!p.available;v115PowerState.online=!!p.online;v115PowerState.on=!!p.on;v115PowerState.printing=!!d.printing||state==='RUNNING'||state==='PRINTING'||state==='PAUSE'||state==='PAUSED';b.disabled=!p.available||!p.online||v115PowerState.busy;b.textContent=!p.available?'Power not mapped':(!p.online?'Power plug offline':(p.on?'Power off':'Power on'));b.classList.toggle('danger',!!p.on);}).catch(function(){b.disabled=true;b.textContent='Power unavailable'})}\nfunction v115PrinterPower(){var b=v113El('v115Power'),s=v113El('v113ControlStatus'),st=v115PowerState;if(!b||!st.available||!st.online||st.busy)return;var desired=!st.on,token='';if(!desired){var msg=st.printing?'The printer is actively printing. Cutting power can damage the print and should only be used intentionally. Power off anyway?':'Power off the mapped printer plug?';if(!window.confirm(msg))return;token=st.printing?'POWER OFF DURING PRINT':'POWER OFF';}else if(!window.confirm('Power on the mapped printer plug?'))return;st.busy=true;v114ControlBusy(true);if(s)s.textContent=desired?'Powering printer on…':'Powering printer off…';v113Post('/printer/power',{slot:Number(window.currentSlot||0),on:desired?'1':'0',confirm:token}).then(function(){if(s)s.textContent=desired?'Printer power on sent':'Printer power off sent';showToast(desired?'Printer power on':'Printer power off');setTimeout(v115RefreshPower,900)}).catch(function(e){if(s)s.textContent=e.message||'Power command failed';showToast('Power command failed')}).then(function(){st.busy=false;setTimeout(function(){v114ControlBusy(false);v113RefreshControls();v115RefreshPower()},500)})}\n(function(){var old=v113RefreshControls;v113RefreshControls=function(){var r=old.apply(this,arguments);setTimeout(v115RefreshPower,80);return r};setTimeout(v115RefreshPower,600)})();\n'''
    s += append.replace('\\n','\n')
    p.write_text(s)

    # css
    p=repo/'web/app.css'; s=p.read_text(); s += '''\n\n/* Smart Home v11.5 Printer Power */\n.v113-controls{grid-template-columns:repeat(4,minmax(0,1fr))}\n.v113-controls #v115Power.danger{border-color:rgba(236,91,91,.58);color:#ffd1d1;background:rgba(146,34,34,.18)}\n@media(max-width:760px){.v113-controls{grid-template-columns:repeat(2,minmax(0,1fr))}}\n'''; p.write_text(s)

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--apply', action='store_true')
    args=ap.parse_args()
    if not args.apply:
        raise SystemExit('use --apply')
    patch(args.repo)
    print('Smart Home v11.5 Printer Power applied and verified')
