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


RECOVERY_HEADER = r'''#pragma once
#include <Arduino.h>
void recoveryBootProbe();
void recoveryTick();
void recoveryArmCandidateBoot();
bool recoverySafeModeActive();
void recoveryRequestSafeModeNextBoot();
void recoveryClearSafeMode();
uint8_t recoveryRapidBootCount();
uint8_t recoveryCandidateAttempts();
bool recoveryCandidatePending();
String recoveryCurrentSlot();
String recoveryKnownGoodSlot();
String recoveryFallbackSlot();
bool recoveryRollbackNow(String& message);
'''

RECOVERY_CPP = r'''#include "recovery_manager.h"
#include "wifi_manager.h"
#include <Preferences.h>
#include <esp_attr.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>

namespace {
constexpr uint32_t kRapidMagic = 0x52454334;
constexpr uint32_t kRapidClearMs = 15000;
constexpr uint32_t kCandidateHealthyMs = 25000;
constexpr uint8_t kCandidateMaxAttempts = 3;
constexpr char kNamespace[] = "bh_recovery";
RTC_DATA_ATTR uint32_t sRapidMagic = 0;
RTC_DATA_ATTR uint8_t sRapidCount = 0;
bool sSafeMode = false;
bool sRapidCleared = false;
bool sCandidatePending = false;
uint8_t sCandidateAttempts = 0;
String sFallbackLabel;
String sKnownGoodLabel;
Preferences prefs;

String runningLabel(){
  const esp_partition_t* p=esp_ota_get_running_partition();
  return p && p->label ? String(p->label) : String();
}
const esp_partition_t* byLabel(const String& label){
  if(!label.length()) return nullptr;
  return esp_partition_find_first(ESP_PARTITION_TYPE_APP,ESP_PARTITION_SUBTYPE_ANY,label.c_str());
}
bool switchTo(const esp_partition_t* target,String& message){
  if(!target){message="No bootable firmware partition was found";return false;}
  const esp_partition_t* run=esp_ota_get_running_partition();
  if(run && target->address==run->address){message="Requested firmware is already running";return false;}
  esp_app_desc_t d;
  if(esp_ota_get_partition_description(target,&d)!=ESP_OK){message="Target firmware slot is empty or unreadable";return false;}
  esp_err_t err=esp_ota_set_boot_partition(target);
  if(err!=ESP_OK){message=String("Firmware verification failed: ")+esp_err_to_name(err);return false;}
  message=String("Boot partition switched to ")+target->label;
  return true;
}
void loadState(){
  prefs.begin(kNamespace,false);
  sCandidatePending=prefs.getBool("candidate",false);
  sCandidateAttempts=prefs.getUChar("attempts",0);
  sFallbackLabel=prefs.getString("fallback","");
  sKnownGoodLabel=prefs.getString("known","");
  if(prefs.getBool("safe_next",false)){sSafeMode=true;prefs.remove("safe_next");}
  prefs.end();
}
void saveCandidate(){
  prefs.begin(kNamespace,false);
  prefs.putBool("candidate",sCandidatePending);
  prefs.putUChar("attempts",sCandidateAttempts);
  if(sFallbackLabel.length()) prefs.putString("fallback",sFallbackLabel); else prefs.remove("fallback");
  if(sKnownGoodLabel.length()) prefs.putString("known",sKnownGoodLabel);
  prefs.end();
}
void acceptCandidate(){
  sCandidatePending=false;sCandidateAttempts=0;sKnownGoodLabel=runningLabel();sFallbackLabel="";saveCandidate();
  esp_ota_mark_app_valid_cancel_rollback();
  Serial.printf("Recovery: candidate accepted as known-good (%s)\n",sKnownGoodLabel.c_str());
}
}

void recoveryBootProbe(){
  if(sRapidMagic!=kRapidMagic){sRapidMagic=kRapidMagic;sRapidCount=0;}
  if(sRapidCount<250) ++sRapidCount;
  if(sRapidCount>=3){sSafeMode=true;sRapidCount=0;Serial.println("Recovery: triple reset -> Safe Mode");}
  loadState();
  if(!sCandidatePending) return;
  if(sCandidateAttempts<250) ++sCandidateAttempts;
  saveCandidate();
  Serial.printf("Recovery: candidate boot attempt %u/%u\n",(unsigned)sCandidateAttempts,(unsigned)kCandidateMaxAttempts);
  if(sCandidateAttempts<kCandidateMaxAttempts) return;
  String why;
  if(switchTo(byLabel(sFallbackLabel),why)){
    prefs.begin(kNamespace,false);prefs.putBool("candidate",false);prefs.putUChar("attempts",0);prefs.putString("known",sFallbackLabel);prefs.remove("fallback");prefs.end();
    Serial.printf("Recovery: repeated candidate failure; %s\n",why.c_str());Serial.flush();delay(150);ESP.restart();
  }
  sSafeMode=true;
  Serial.printf("Recovery: rollback unavailable (%s); Safe Mode forced\n",why.c_str());
}
void recoveryTick(){
  uint32_t now=millis();
  if(!sRapidCleared && now>=kRapidClearMs){sRapidCount=0;sRapidCleared=true;}
  if(sCandidatePending && now>=kCandidateHealthyMs && (isWiFiConnected()||isAPMode())) acceptCandidate();
}
void recoveryArmCandidateBoot(){
  String current=runningLabel();
  prefs.begin(kNamespace,false);prefs.putBool("candidate",true);prefs.putUChar("attempts",0);prefs.putString("fallback",current);if(current.length())prefs.putString("known",current);prefs.end();
  sCandidatePending=true;sCandidateAttempts=0;sFallbackLabel=current;sKnownGoodLabel=current;
  Serial.printf("Recovery: OTA candidate armed; fallback=%s\n",current.c_str());
}
bool recoverySafeModeActive(){return sSafeMode;}
void recoveryRequestSafeModeNextBoot(){prefs.begin(kNamespace,false);prefs.putBool("safe_next",true);prefs.end();}
void recoveryClearSafeMode(){sSafeMode=false;prefs.begin(kNamespace,false);prefs.remove("safe_next");prefs.end();}
uint8_t recoveryRapidBootCount(){return sRapidCount;}
uint8_t recoveryCandidateAttempts(){return sCandidateAttempts;}
bool recoveryCandidatePending(){return sCandidatePending;}
String recoveryCurrentSlot(){return runningLabel();}
String recoveryKnownGoodSlot(){return sKnownGoodLabel;}
String recoveryFallbackSlot(){return sFallbackLabel;}
bool recoveryRollbackNow(String& message){
  const esp_partition_t* other=esp_ota_get_next_update_partition(nullptr);
  if(!switchTo(other,message)) return false;
  prefs.begin(kNamespace,false);prefs.putBool("candidate",false);prefs.putUChar("attempts",0);prefs.remove("fallback");prefs.end();
  sCandidatePending=false;sCandidateAttempts=0;sFallbackLabel="";return true;
}
'''

RECOVERY_WEB = r'''
// Smart Home v9.4 independent recovery console.
static bool recoveryMutationAllowed(){return securityAuthorize(server,true);}
static void handleRecoveryPage(){
  String h;h.reserve(7600);
  h+=F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='dark'><title>Waveshare Recovery</title><style>body{margin:0;background:#0b1016;color:#eef3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.w{max-width:620px;margin:auto;padding:24px}.brand{font-size:24px;font-weight:800}.sub{color:#9aa8b6;margin:6px 0 20px;line-height:1.45}.card{background:#141b23;border:1px solid #2b3743;border-radius:16px;padding:17px;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.kv{display:flex;justify-content:space-between;border-bottom:1px solid #25303a;padding:8px 0;gap:14px}.kv span:first-child{color:#91a0ad}button{width:100%;border:1px solid #3a4652;border-radius:10px;background:#202a34;color:#fff;padding:12px;font-weight:700;margin:5px 0}button.primary{border-color:#2f7ddd;background:#17375e}button.danger{border-color:#a34848;background:#4a2020}input[type=file]{width:100%;box-sizing:border-box;background:#0f151c;border:1px solid #36424e;border-radius:9px;padding:12px;color:#fff}#msg{min-height:22px;color:#9aa8b6;margin-top:9px;font-size:13px;white-space:pre-wrap}</style></head><body><div class='w'><div class='brand'>Waveshare Recovery</div><div class='sub'>Smart Home v9.4 independent recovery plane. This page does not use the normal portal JavaScript.</div><div class='card'><div id='status'>Loading...</div></div><div class='card'><b>Recovery actions</b><div class='grid'><button onclick=\"act('/recovery/touch')\">Force Touchscreen ON</button><button onclick=\"act('/recovery/reboot')\">Reboot Normally</button><button class='primary' onclick=\"act('/recovery/safe')\">Reboot to Safe Mode</button><button class='primary' onclick=\"act('/recovery/rollback')\">Boot Previous Firmware</button><button onclick=\"act('/recovery/reset-ui')\">Reset Display UI</button><button onclick=\"act('/recovery/reset-auth')\">Reset Portal Session</button><button class='danger' onclick=\"wifiReset()\">Reset Wi-Fi Only</button><button class='danger' onclick=\"factoryReset()\">Factory Reset</button></div></div><div class='card'><b>Application firmware recovery</b><p class='sub'>Use <b>WaveshareHome-firmware.bin</b> only. Never use Full.bin here.</p><input id='fw' type='file' accept='.bin'><button class='primary' onclick='uploadFw()'>Upload & Install</button><div id='msg'></div></div></div><script>function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}function refresh(){fetch('/recovery/status?_='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(d=>{var rows=[['Build',d.build],['Mode',d.safeMode?'SAFE MODE':'Normal / Development'],['IP',d.ip],['Touch',d.touch],['Running slot',d.runningSlot],['Known good',d.knownGood||'—'],['Fallback',d.fallback||'—'],['Candidate OTA',d.candidatePending?('pending · attempt '+d.candidateAttempts):'healthy'],['Rapid-reset count',d.rapidBootCount]];document.getElementById('status').innerHTML=rows.map(x=>'<div class=kv><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')}).catch(()=>document.getElementById('status').textContent='Status unavailable')}function act(u){var m=document.getElementById('msg');m.textContent='Working...';fetch(u,{method:'POST'}).then(r=>r.json()).then(d=>{m.textContent=d.message||d.status||'OK';setTimeout(refresh,400)}).catch(e=>m.textContent='Request failed: '+e)}function wifiReset(){if(confirm('Clear saved Wi-Fi and restart into Safe Mode? Printer settings are preserved.'))act('/recovery/reset-wifi')}function factoryReset(){if(confirm('Factory reset ALL settings?'))location.href='/reset'}async function uploadFw(){var f=document.getElementById('fw').files[0],m=document.getElementById('msg');if(!f){m.textContent='Choose WaveshareHome-firmware.bin first';return}if(f.name.toLowerCase().indexOf('full.bin')>=0){m.textContent='Rejected: Full.bin is not application firmware';return}m.textContent='Hashing...';var buf=await f.arrayBuffer();var dig=await crypto.subtle.digest('SHA-256',buf),a=Array.from(new Uint8Array(dig)),hex=a.map(b=>b.toString(16).padStart(2,'0')).join(''),fd=new FormData();fd.append('file',f,f.name);var x=new XMLHttpRequest();x.open('POST','/ota/upload',true);x.withCredentials=true;x.timeout=180000;x.setRequestHeader('X-SHA256',hex);x.upload.onprogress=e=>{if(e.lengthComputable)m.textContent='Uploading '+Math.floor(e.loaded*100/e.total)+'%'};x.onload=()=>{try{var d=JSON.parse(x.responseText);m.textContent=d.message||x.responseText}catch(e){m.textContent=x.responseText||'Upload complete'}};x.onerror=()=>m.textContent='Device may be rebooting. Reconnect and reopen /recovery.';x.send(fd)}refresh();setInterval(refresh,5000)</script></body></html>");
  server.sendHeader("Cache-Control","no-store");server.send(200,"text/html",h);
}
static void handleRecoveryStatus(){JsonDocument d;d["build"]=SMART_HOME_BUILD_LABEL;d["safeMode"]=recoverySafeModeActive();d["ip"]=isAPMode()?WiFi.softAPIP().toString():WiFi.localIP().toString();d["touch"]=buttonType==BTN_TOUCHSCREEN?"FT6336 · FORCED ON":"NOT READY";d["runningSlot"]=recoveryCurrentSlot();d["knownGood"]=recoveryKnownGoodSlot();d["fallback"]=recoveryFallbackSlot();d["candidatePending"]=recoveryCandidatePending();d["candidateAttempts"]=recoveryCandidateAttempts();d["rapidBootCount"]=recoveryRapidBootCount();String o;serializeJson(d,o);server.sendHeader("Cache-Control","no-store");server.send(200,"application/json",o);}
static void handleRecoveryTouch(){if(!recoveryMutationAllowed())return;buttonType=BTN_TOUCHSCREEN;saveButtonSettings();initButton();server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Touchscreen forced ON and reinitialized.\"}");}
static void handleRecoveryReboot(){if(!recoveryMutationAllowed())return;recoveryClearSafeMode();server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Restarting normally...\"}");scheduleRestart(900);}
static void handleRecoverySafeMode(){if(!recoveryMutationAllowed())return;recoveryRequestSafeModeNextBoot();server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Restarting into Recovery Safe Mode...\"}");scheduleRestart(900);}
static void handleRecoveryRollback(){if(!recoveryMutationAllowed())return;String m;if(!recoveryRollbackNow(m)){String o=String("{\"status\":\"error\",\"message\":\"")+m+"\"}";server.send(409,"application/json",o);return;}server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Previous firmware verified. Restarting...\"}");scheduleRestart(1200);}
static void handleRecoveryResetUi(){if(!recoveryMutationAllowed())return;defaultDisplaySettings(dispSettings);brightness=200;saveSettings();setBacklight(brightness);triggerDisplayTransition();server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Display/UI reset; printer and Wi-Fi preserved.\"}");}
static void handleRecoveryResetAuth(){if(!recoveryMutationAllowed())return;securityLogout(server);server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Portal session reset. Development unlock remains active.\"}");}
static void handleRecoveryResetWifi(){if(!recoveryMutationAllowed())return;wifiSSID[0]='\0';wifiPass[0]='\0';saveSettings();recoveryRequestSafeModeNextBoot();server.send(200,"application/json","{\"status\":\"ok\",\"message\":\"Wi-Fi cleared. Restarting into Safe Mode; printer settings preserved.\"}");scheduleRestart(900);}
'''


def patch_recovery_files(repo: Path) -> None:
    (repo / "src" / "recovery_manager.h").write_text(RECOVERY_HEADER, encoding="utf-8")
    (repo / "src" / "recovery_manager.cpp").write_text(RECOVERY_CPP, encoding="utf-8")


def patch_main(repo: Path) -> None:
    p=repo/"src"/"main.cpp";t=p.read_text(encoding="utf-8")
    t=replace_once(t,'#include "camera_client.h"\n','#include "camera_client.h"\n#include "recovery_manager.h"\n',"recovery include")
    t=replace_once(t,'  Serial.printf("\\n=== BambuHelper %s Starting ===\\n", FW_VERSION);\n\n  loadSettings();\n','  Serial.printf("\\n=== BambuHelper %s Starting ===\\n", FW_VERSION);\n  recoveryBootProbe();\n\n  loadSettings();\n',"recovery boot probe")
    t=replace_once(t,'  handleWebServer();\n  ssdpTick();','  handleWebServer();\n  recoveryTick();\n  ssdpTick();',"recovery loop tick")
    p.write_text(t,encoding="utf-8")


def patch_wifi(repo: Path) -> None:
    p=repo/"src"/"wifi_manager.cpp";t=p.read_text(encoding="utf-8")
    t=replace_once(t,'#include "improv_setup.h"\n','#include "improv_setup.h"\n#include "recovery_manager.h"\n',"wifi recovery include")
    t=replace_once(t,'  snprintf(ssidBuf, sizeof(ssidBuf), "%s%04X", WIFI_AP_PREFIX, mac);\n','  const char* prefix = recoverySafeModeActive() ? "Waveshare-Recovery-" : WIFI_AP_PREFIX;\n  snprintf(ssidBuf, sizeof(ssidBuf), "%s%04X", prefix, mac);\n',"recovery AP SSID")
    t=replace_once(t,'void startWiFiDuringSplash() {\n  if (strlen(wifiSSID) == 0) return;\n','void startWiFiDuringSplash() {\n  if (recoverySafeModeActive()) { Serial.println("Recovery: Safe Mode suppresses background STA connect"); return; }\n  if (strlen(wifiSSID) == 0) return;\n',"safe mode splash")
    t=replace_once(t,'void initWiFi() {\n  // If we have stored credentials, try STA mode\n','void initWiFi() {\n  if (recoverySafeModeActive()) { Serial.println("Recovery: starting isolated recovery AP"); startAP(); return; }\n  // If we have stored credentials, try STA mode\n',"safe mode wifi")
    p.write_text(t,encoding="utf-8")


def patch_web(repo: Path) -> None:
    p=repo/"src"/"web_server.cpp";t=p.read_text(encoding="utf-8")
    t=replace_once(t,'#include "clock_pong.h"\n','#include "clock_pong.h"\n#include "recovery_manager.h"\n#include "smart_home_build.h"\n',"recovery includes")
    t=replace_once(t,'  manualOtaPhase = "accepted";\n  manualOtaMessage = "Firmware accepted. Restarting";\n','  manualOtaPhase = "accepted";\n  manualOtaMessage = "Firmware accepted. Restarting";\n  recoveryArmCandidateBoot();\n',"candidate arm")
    t=replace_once(t,'// Captive portal: redirect any unknown request to root\n',RECOVERY_WEB+'// Captive portal: redirect any unknown request to root\n',"recovery handlers")
    a='  SECURE_GET("/ota/manual/status", handleManualOtaStatus);\n'
    r=a+'  server.on("/recovery", HTTP_GET, handleRecoveryPage);\n  server.on("/recovery/status", HTTP_GET, handleRecoveryStatus);\n  server.on("/recovery/touch", HTTP_POST, handleRecoveryTouch);\n  server.on("/recovery/reboot", HTTP_POST, handleRecoveryReboot);\n  server.on("/recovery/safe", HTTP_POST, handleRecoverySafeMode);\n  server.on("/recovery/rollback", HTTP_POST, handleRecoveryRollback);\n  server.on("/recovery/reset-ui", HTTP_POST, handleRecoveryResetUi);\n  server.on("/recovery/reset-auth", HTTP_POST, handleRecoveryResetAuth);\n  server.on("/recovery/reset-wifi", HTTP_POST, handleRecoveryResetWifi);\n'
    t=replace_once(t,a,r,"recovery routes")
    p.write_text(t,encoding="utf-8")


def patch_identity(repo: Path) -> None:
    p=repo/"web"/"app.js";t=p.read_text(encoding="utf-8")
    t=replace_once(t,"    pill.textContent = 'Smart Home v9.3 DEV';\n","    pill.textContent = 'Smart Home v9.4 DEV';\n","portal identity")
    t=replace_once(t,"    banner.innerHTML = '<strong>DEVELOPMENT MODE</strong> · Portal code is temporarily disabled on this WS350. Same-origin protection remains enabled for settings and OTA.';\n","    banner.innerHTML = '<strong>DEVELOPMENT MODE</strong> · Portal code is temporarily disabled. Recovery console: <b>/recovery</b>. Same-origin protection remains enabled for settings and OTA.';\n","recovery banner")
    p.write_text(t,encoding="utf-8")
    p=repo/"include"/"smart_home_build.h";t=p.read_text(encoding="utf-8")
    t=replace_once(t,'#define SMART_HOME_VERSION "v9.3"\n','#define SMART_HOME_VERSION "v9.4"\n',"version")
    t=replace_once(t,'#define SMART_HOME_PROFILE "development-unlocked-control-plane"\n','#define SMART_HOME_PROFILE "recovery-foundation-control-plane"\n',"profile")
    t=replace_once(t,'#define SMART_HOME_BUILD_LABEL "Smart Home v9.3 Development Unlocked RC1"\n','#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC1"\n',"label")
    p.write_text(t,encoding="utf-8")
    p=repo/"src"/"smart_hub.cpp";t=p.read_text(encoding="utf-8")
    t=replace_once(t,'    drawHeader("HOME", "v9.3 DEV", 0);\n','    drawHeader("HOME", "v9.4 DEV", 0);\n',"home")
    t=replace_once(t,'    drawHeader("SYSTEM", "v9.3 DEV", 3);\n','    drawHeader("SYSTEM", "v9.4 DEV", 3);\n',"system")
    t=replace_once(t,'  snprintf(build, sizeof(build), "DEV UNLOCKED • OTA + LAN discovery");\n','  snprintf(build, sizeof(build), "RECOVERY FOUNDATION • DEV UNLOCKED");\n',"system label")
    p.write_text(t,encoding="utf-8")


def apply(repo: Path) -> None:
    patch_recovery_files(repo);patch_main(repo);patch_wifi(repo);patch_web(repo);patch_identity(repo)


def main() -> int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',default='.');ap.add_argument('--apply',action='store_true');a=ap.parse_args();r=Path(a.repo).resolve()
    if not a.apply: print('Smart Home v9.4 Recovery Foundation patch ready. Use --apply.');return 0
    apply(r);print('Smart Home v9.4 Recovery Foundation applied');return 0


if __name__=='__main__': raise SystemExit(main())
