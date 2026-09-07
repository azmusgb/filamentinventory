#!/usr/bin/env python3
from pathlib import Path
import argparse


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old, new, 1)


def patch(repo: Path):
    # Build identity
    p = repo / 'include/smart_home_build.h'
    s = p.read_text()
    s = s.replace('#define SMART_HOME_VERSION "v11.3"', '#define SMART_HOME_VERSION "v11.4"')
    s = s.replace('#define SMART_HOME_PROFILE "printer-control"', '#define SMART_HOME_PROFILE "control-polish"')
    s = s.replace('Smart Home v11.3 Printer Control RC1', 'Smart Home v11.4 Control Polish RC1')
    p.write_text(s)

    # Fail-closed MQTT command semantics and centralized state validation.
    p = repo / 'src/bambu_mqtt.cpp'
    s = p.read_text()
    old = '''    // Drain manual pause/resume/stop requests on the MQTT task. If the\n    // printer is disconnected, leave the request queued; UI/API gating prevents\n    // new commands while offline, and this preserves task-safety during races.\n    if (g_printerCtrlReq[i] != PRINTER_CTRL_NONE && conns[i].mqtt && conns[i].mqtt->connected()) {\n      PrinterControlCommand command = (PrinterControlCommand)g_printerCtrlReq[i];\n      g_printerCtrlReq[i] = PRINTER_CTRL_NONE;\n      sendPrinterControl(conns[i], command);\n    }\n'''
    new = '''    // Manual pause/resume/stop commands are intentionally fail-closed. A\n    // destructive command must never sit in RAM and fire minutes later after a\n    // reconnect. Drain it once on the MQTT task; if the connection disappeared\n    // between UI validation and this point, drop it and require an explicit retry.\n    if (g_printerCtrlReq[i] != PRINTER_CTRL_NONE) {\n      PrinterControlCommand command = (PrinterControlCommand)g_printerCtrlReq[i];\n      g_printerCtrlReq[i] = PRINTER_CTRL_NONE;\n      if (conns[i].mqtt && conns[i].mqtt->connected()) sendPrinterControl(conns[i], command);\n      else MQTT_LOG("[%d] printer control %s DROPPED: MQTT offline", i, printerControlCommandName(command));\n    }\n'''
    s = replace_once(s, old, new, 'fail-closed printer command drain')

    old = '''bool requestPrinterControlCommand(uint8_t slot, PrinterControlCommand command) {\n  if (slot >= MAX_ACTIVE_PRINTERS || !isPrinterConfigured(slot)) return false;\n  if (command < PRINTER_CTRL_PAUSE || command > PRINTER_CTRL_STOP) return false;\n  g_printerCtrlReq[slot] = (uint8_t)command;\n  return true;\n}\n'''
    new = '''bool requestPrinterControlCommand(uint8_t slot, PrinterControlCommand command) {\n  if (slot >= MAX_ACTIVE_PRINTERS || !isPrinterConfigured(slot)) return false;\n  if (command < PRINTER_CTRL_PAUSE || command > PRINTER_CTRL_STOP) return false;\n  const BambuState& st = printers[slot].state;\n  if (!st.connected) return false;\n  const bool paused = st.gcodeStateId == GCODE_PAUSE;\n  const bool active = st.printing || paused;\n  if (command == PRINTER_CTRL_PAUSE && (!active || paused)) return false;\n  if (command == PRINTER_CTRL_RESUME && !paused) return false;\n  if (command == PRINTER_CTRL_STOP && !active) return false;\n  g_printerCtrlReq[slot] = (uint8_t)command;\n  return true;\n}\n'''
    s = replace_once(s, old, new, 'centralized printer control state validation')
    p.write_text(s)

    # Manual browser light commands should not queue silently while offline.
    p = repo / 'src/web_server.cpp'
    s = p.read_text()
    old = '''  if (!isPrinterConfigured(slot)) {\n    server.send(409, "application/json", "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}");\n    return;\n  }\n  String mode = server.hasArg("mode") ? server.arg("mode") : String();\n'''
    new = '''  if (!isPrinterConfigured(slot)) {\n    server.send(409, "application/json", "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer not configured\\\"}");\n    return;\n  }\n  if (!printers[slot].state.connected) {\n    server.send(409, "application/json", "{\\\"status\\\":\\\"error\\\",\\\"message\\\":\\\"printer offline\\\"}");\n    return;\n  }\n  String mode = server.hasArg("mode") ? server.arg("mode") : String();\n'''
    s = replace_once(s, old, new, 'offline light-command guard')
    p.write_text(s)

    # Physical control polish: real disabled rendering and transient feedback.
    p = repo / 'src/smart_hub.cpp'
    s = p.read_text()
    anchor = '''bool g_toolsView = false;\n\n\n// v9.7 built-in Custom widget deck.'''
    addition = '''bool g_toolsView = false;\n\n// v11.4 transient physical-control feedback. It is intentionally local-only:\n// the printer's next MQTT state remains the source of truth.\nint8_t g_printerFeedbackButton = -1;\nchar g_printerFeedbackText[18] = {0};\nunsigned long g_printerFeedbackUntilMs = 0;\n\nstatic void setPrinterFeedback(uint8_t button, const char* text, uint16_t ms=1500) {\n  g_printerFeedbackButton = (int8_t)button;\n  strlcpy(g_printerFeedbackText, text ? text : "", sizeof(g_printerFeedbackText));\n  g_printerFeedbackUntilMs = millis() + ms;\n  g_dirty = true;\n}\n\nstatic const char* printerFeedbackLabel(uint8_t button, const char* fallback) {\n  if (g_printerFeedbackButton >= 0 && (long)(g_printerFeedbackUntilMs - millis()) <= 0) {\n    g_printerFeedbackButton = -1;\n    g_printerFeedbackText[0] = '\\0';\n  }\n  return g_printerFeedbackButton == (int8_t)button ? g_printerFeedbackText : fallback;\n}\n\n// v9.7 built-in Custom widget deck.'''
    s = replace_once(s, anchor, addition, 'printer feedback globals')

    old = '''static void uiActionButton(const HubRect& r, const char* label, uint16_t accent, bool filled=false) {\n  const int16_t h = r.h < 44 ? 44 : r.h;\n  const bool primary=filled || accent==UI_ORANGE || accent==UI_AMBER;\n  const uint16_t edge=primary?UI_ORANGE:UI_BORDER;\n  const uint16_t bg=filled?UI_ORANGE:UI_PANEL_2;\n  tft.fillRoundRect(r.x + 1, r.y + 2, r.w, h, 10, 0x0000);\n  tft.fillRoundRect(r.x, r.y, r.w, h, 10, bg);\n  tft.drawRoundRect(r.x, r.y, r.w, h, 10, edge);\n  if (!filled) {\n    tft.fillRoundRect(r.x + 7, r.y + h / 2 - 8, 3, 16, 2, edge);\n    if(primary)tft.fillCircle(r.x+r.w-11,r.y+10,2,UI_ORANGE);\n  }\n  uiDrawFit(label, r.x + r.w / 2 + (filled ? 0 : 2), r.y + h / 2,\n            r.w - 24, FONT_SMALL, MC_DATUM, filled ? UI_BG : (primary?UI_ORANGE:UI_TEXT), bg);\n}\n'''
    new = '''static void uiActionButton(const HubRect& r, const char* label, uint16_t accent, bool filled=false) {\n  const int16_t h = r.h < 44 ? 44 : r.h;\n  const bool disabled = accent == UI_DIM;\n  const bool primary = !disabled && (filled || accent==UI_ORANGE || accent==UI_AMBER);\n  const uint16_t edge = disabled ? UI_BORDER_2 : (primary ? UI_ORANGE : UI_BORDER);\n  const uint16_t bg = filled && !disabled ? UI_ORANGE : UI_PANEL_2;\n  tft.fillRoundRect(r.x + 1, r.y + 2, r.w, h, 10, 0x0000);\n  tft.fillRoundRect(r.x, r.y, r.w, h, 10, bg);\n  tft.drawRoundRect(r.x, r.y, r.w, h, 10, edge);\n  if (!filled && !disabled) {\n    tft.fillRoundRect(r.x + 7, r.y + h / 2 - 8, 3, 16, 2, edge);\n    if(primary)tft.fillCircle(r.x+r.w-11,r.y+10,2,UI_ORANGE);\n  }\n  const uint16_t textColor = disabled ? UI_DIM : (filled ? UI_BG : (primary ? UI_ORANGE : UI_TEXT));\n  uiDrawFit(label, r.x + r.w / 2 + (filled ? 0 : 2), r.y + h / 2,\n            r.w - 24, FONT_SMALL, MC_DATUM, textColor, bg);\n}\n'''
    s = replace_once(s, old, new, 'disabled action button rendering')

    old = '''    uiActionButton(hubPrinterActionRect(0),s.lightState==1?"LIGHT OFF":"LIGHT ON",UI_AMBER);\n    uiActionButton(hubPrinterActionRect(1),paused?"RESUME":"PAUSE",active?(paused?UI_GREEN:UI_CYAN):UI_DIM);\n'''
    new = '''    const char* lightAction=s.lightState==1?"LIGHT OFF":"LIGHT ON";\n    const char* printAction=paused?"RESUME":"PAUSE";\n    uiActionButton(hubPrinterActionRect(0),printerFeedbackLabel(0,lightAction),s.connected?UI_AMBER:UI_DIM);\n    uiActionButton(hubPrinterActionRect(1),printerFeedbackLabel(1,printAction),active?(paused?UI_GREEN:UI_CYAN):UI_DIM);\n'''
    if s.count(old) != 2:
        raise RuntimeError(f'printer render group: expected 2 anchors, found {s.count(old)}')
    s = s.replace(old, new, 2)
    s = s.replace('uiActionButton(hubPrinterActionRect(3),active?"HOLD STOP":"STOP",active?UI_RED:UI_DIM);',
                  'uiActionButton(hubPrinterActionRect(3),printerFeedbackLabel(3,active?"HOLD STOP":"STOP"),active?UI_RED:UI_DIM);', 1)

    old = '''    if(hubPrinterActionRect(0).contains(x,y)){if(s.connected)requestLightCommand(slot,s.lightState!=1);g_dirty=true;return true;}\n    if(hubPrinterActionRect(1).contains(x,y)){if(s.connected&&active)requestPrinterControlCommand(slot,paused?PRINTER_CTRL_RESUME:PRINTER_CTRL_PAUSE);g_dirty=true;return true;}\n    if(hubLandscape()&&hubPrinterActionRect(2).contains(x,y)){setPage(SCREEN_HUB_WORKSHOP);return true;}\n    if(hubLandscape()&&hubPrinterActionRect(3).contains(x,y)){if(s.connected&&active&&longPress){requestPrinterControlCommand(slot,PRINTER_CTRL_STOP);buzzerPlay(BUZZ_CLICK);g_dirty=true;}return true;}\n'''
    new = '''    if(hubPrinterActionRect(0).contains(x,y)){\n      if(s.connected){requestLightCommand(slot,s.lightState!=1);setPrinterFeedback(0,"LIGHT SENT");buzzerPlay(BUZZ_CLICK);}\n      return true;\n    }\n    if(hubPrinterActionRect(1).contains(x,y)){\n      if(s.connected&&active){const bool ok=requestPrinterControlCommand(slot,paused?PRINTER_CTRL_RESUME:PRINTER_CTRL_PAUSE);if(ok){setPrinterFeedback(1,paused?"RESUME SENT":"PAUSE SENT");buzzerPlay(BUZZ_CLICK);}}\n      return true;\n    }\n    if(hubLandscape()&&hubPrinterActionRect(2).contains(x,y)){setPage(SCREEN_HUB_WORKSHOP);return true;}\n    if(hubLandscape()&&hubPrinterActionRect(3).contains(x,y)){\n      if(s.connected&&active&&longPress){if(requestPrinterControlCommand(slot,PRINTER_CTRL_STOP)){setPrinterFeedback(3,"STOP SENT",1800);buzzerPlay(BUZZ_CLICK);}}\n      else if(s.connected&&active){setPrinterFeedback(3,"HOLD TO STOP",1000);}\n      return true;\n    }\n'''
    s = replace_once(s, old, new, 'feedback-aware printer touch routing')

    old = 'if(cur==SCREEN_HUB_WORKSHOP){for(uint8_t i=0;i<4;i++)if(hubWorkshopActionRect(i).contains(x,y)){if(i==0&&isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;requestLightCommand(rotState.displayIndex,s.lightState!=1);g_dirty=true;}'
    new = 'if(cur==SCREEN_HUB_WORKSHOP){for(uint8_t i=0;i<4;i++)if(hubWorkshopActionRect(i).contains(x,y)){if(i==0&&isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;if(s.connected){requestLightCommand(rotState.displayIndex,s.lightState!=1);buzzerPlay(BUZZ_CLICK);}g_dirty=true;}'
    s = replace_once(s, old, new, 'workshop offline light guard')
    p.write_text(s)

    p = repo / 'web/app.js'
    s = p.read_text()
    marker = 'function v113PrinterCommand(cmd){'
    helper = '''function v114ControlBusy(busy){['v113Light','v113Pause','v113Stop'].forEach(function(id){var el=v113El(id);if(el)el.disabled=!!busy})}\n'''
    s = replace_once(s, marker, helper + marker, 'browser control busy helper')

    old = "function v113PrinterCommand(cmd){var slot=Number(window.currentSlot||0);if(cmd==='stop'&&!window.confirm('Stop the current print? This cannot be undone.'))return;var b=v113El('v113ControlStatus');if(b)b.textContent='Sending '+cmd+'…';v113Post('/printer/control',{slot:slot,command:cmd,confirm:cmd==='stop'?'STOP':''}).then(function(){if(b)b.textContent=cmd.charAt(0).toUpperCase()+cmd.slice(1)+' command sent';showToast('Printer command sent');setTimeout(v113RefreshControls,700)}).catch(function(e){if(b)b.textContent=e.message||'Command failed';showToast('Command failed')})}"
    new = "function v113PrinterCommand(cmd){var slot=Number(window.currentSlot||0);if(cmd==='stop'&&!window.confirm('Stop the current print? This cannot be undone.'))return;var b=v113El('v113ControlStatus');if(b)b.textContent='Sending '+cmd+'…';v114ControlBusy(true);v113Post('/printer/control',{slot:slot,command:cmd,confirm:cmd==='stop'?'STOP':''}).then(function(){if(b)b.textContent=cmd.charAt(0).toUpperCase()+cmd.slice(1)+' command sent';showToast('Printer command sent');setTimeout(v113RefreshControls,700)}).catch(function(e){if(b)b.textContent=e.message||'Command failed';showToast('Command failed')}).then(function(){setTimeout(function(){v114ControlBusy(false);v113RefreshControls()},450)})}"
    s = replace_once(s, old, new, 'browser printer command busy state')

    old = "function v113Light(mode){var slot=Number(window.currentSlot||0),b=v113El('v113ControlStatus');if(b)b.textContent='Turning light '+mode+'…';v113Post('/light/set',{slot:slot,mode:mode}).then(function(){if(b)b.textContent='Light command sent';setTimeout(v113RefreshControls,600)}).catch(function(e){if(b)b.textContent=e.message||'Light command failed'})}"
    new = "function v113Light(mode){var slot=Number(window.currentSlot||0),b=v113El('v113ControlStatus');if(b)b.textContent='Turning light '+mode+'…';v114ControlBusy(true);v113Post('/light/set',{slot:slot,mode:mode}).then(function(){if(b)b.textContent='Light command sent';setTimeout(v113RefreshControls,600)}).catch(function(e){if(b)b.textContent=e.message||'Light command failed'}).then(function(){setTimeout(function(){v114ControlBusy(false);v113RefreshControls()},450)})}"
    s = replace_once(s, old, new, 'browser light busy state')
    p.write_text(s)

    p = repo / 'web/app.css'
    s = p.read_text()
    s += '''\n\n/* Smart Home v11.4 Control Polish */\n.v113-controls button:disabled{opacity:.38;cursor:not-allowed;transform:none;box-shadow:none;filter:saturate(.4)}\n.v113-control-card button:focus-visible{outline:2px solid var(--accent,#ff8a3d);outline-offset:2px}\n'''
    p.write_text(s)

    print('Smart Home v11.4 Control Polish applied')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not args.apply:
        print('Use --apply to patch', repo)
        return
    patch(repo)

if __name__ == '__main__':
    main()
