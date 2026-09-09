#!/usr/bin/env python3
"""Add an authenticated, explicit reveal path for the Bambu LAN access code.

The credential is never added to ordinary status/config JSON. The browser requests
it only after the user presses Reveal/Copy, and the response is no-store.
"""
from __future__ import annotations
import argparse
from pathlib import Path

class PatchError(RuntimeError): pass

def once(text, old, new, label):
    n=text.count(old)
    if n != 1: raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old,new,1)

def patch(repo: Path):
    webp=repo/'src'/'web_server.cpp'
    text=webp.read_text(encoding='utf-8')
    marker='// Get printer config for a specific slot (multi-printer tabs)\n'
    handler=r'''// Explicit credential reveal. This route is registered through SECURE_GET below,
// so normal portal session authentication applies. Keep the access code out of
// /status, /printer/config, diagnostics and page source.
static void handlePrinterAccessCode() {
  uint8_t slot = 0;
  if (server.hasArg("slot")) slot = server.arg("slot").toInt();
  if (slot >= MAX_ACTIVE_PRINTERS) {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid printer slot\"}");
    return;
  }
  const PrinterConfig& cfg = printers[slot].config;
  if (cfg.mode != CONN_LOCAL || !cfg.accessCode[0]) {
    server.sendHeader("Cache-Control", "no-store");
    server.send(404, "application/json", "{\"status\":\"error\",\"message\":\"No LAN access code is configured for this printer\"}");
    return;
  }
  JsonDocument doc;
  doc["status"] = "ok";
  doc["slot"] = slot;
  doc["accessCode"] = cfg.accessCode;
  String json;
  serializeJson(doc, json);
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("Pragma", "no-cache");
  server.send(200, "application/json", json);
}

'''
    text=once(text,marker,handler+marker,'credential handler')
    # Portal-auth patches convert sensitive GETs to SECURE_GET. Require that macro
    # so this feature can never silently land as a public route.
    anchor='SECURE_GET("/printer/config", handlePrinterConfig);'
    if anchor not in text:
        legacy='server.on("/printer/config", HTTP_GET, handlePrinterConfig);'
        if legacy in text:
            raise PatchError('portal auth missing: /printer/config is not SECURE_GET')
        raise PatchError('printer config route anchor missing')
    text=once(text,anchor,anchor+'\n  SECURE_GET("/printer/access-code", handlePrinterAccessCode);','secure route')
    webp.write_text(text,encoding='utf-8')

    jsp=repo/'web'/'app.js'
    js=jsp.read_text(encoding='utf-8')
    js += r'''

/* ============ Workshop OS RC11 · Printer credentials ============ */
(function(){
  var revealTimer = null;
  function conceal(){
    var v=document.getElementById('wsPrinterAccessValue');
    if(v){ v.textContent='••••••••'; v.dataset.revealed='0'; }
  }
  function credentialCard(){
    var sec=document.getElementById('sec-printer');
    if(!sec || document.getElementById('wsPrinterCredentials')) return;
    var card=document.createElement('div');
    card.id='wsPrinterCredentials'; card.className='card';
    card.innerHTML='<h3>Credentials</h3><div class="hint">LAN Direct credential stored on this Workshop OS device.</div>'+
      '<div class="kv" style="margin-top:12px"><span>Printer Access Code</span><strong id="wsPrinterAccessValue" data-revealed="0">••••••••</strong></div>'+
      '<div class="btn-row" style="margin-top:12px"><button type="button" class="secondary" id="wsRevealAccess">Reveal</button><button type="button" class="secondary" id="wsCopyAccess">Copy</button></div>'+
      '<div class="hint" style="margin-top:10px">Different from the Workshop OS Portal Code. Conceals automatically after 30 seconds.</div>';
    sec.appendChild(card);
    document.getElementById('wsRevealAccess').addEventListener('click',function(){fetchAccess(false);});
    document.getElementById('wsCopyAccess').addEventListener('click',function(){fetchAccess(true);});
  }
  function fetchAccess(copy){
    fetch('/printer/access-code?slot='+encodeURIComponent(typeof currentSlot==='number'?currentSlot:0),{cache:'no-store',credentials:'same-origin'})
      .then(function(r){if(!r.ok) return r.json().catch(function(){return {};}).then(function(d){throw new Error(d.message||'Access code unavailable');}); return r.json();})
      .then(function(d){
        if(!d.accessCode) throw new Error('Access code unavailable');
        var v=document.getElementById('wsPrinterAccessValue'); if(v){v.textContent=d.accessCode;v.dataset.revealed='1';}
        clearTimeout(revealTimer); revealTimer=setTimeout(conceal,30000);
        if(copy && navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(d.accessCode).then(function(){showToast('Printer access code copied');},function(){showToast('Code revealed — copy it manually');});
        } else if(copy) showToast('Code revealed — copy it manually');
      }).catch(function(e){showToast(e.message||'Access code unavailable');});
  }
  credentialCard();
  var oldLoad=loadSection;
  loadSection=function(id){ if(id!=='printer') conceal(); oldLoad(id); if(id==='printer') credentialCard(); };
})();
'''
    jsp.write_text(js,encoding='utf-8')
    print('Workshop OS RC11 printer credential reveal applied')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--repo',required=True); ap.add_argument('--apply',action='store_true'); a=ap.parse_args()
    if not a.apply: raise SystemExit('refusing to modify source without --apply')
    patch(Path(a.repo).resolve())
if __name__=='__main__': main()
