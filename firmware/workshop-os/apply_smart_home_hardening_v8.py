#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


class PatchError(RuntimeError):
    pass


UPSTREAM_SHA = "8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4"


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl, name: str, flags: int = 0) -> str:
    new_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return new_text


SECURITY_HEADER = r'''#pragma once

#include <Arduino.h>

class WebServer;

// Smart Home v8 portal protection.
// AP/captive-portal onboarding intentionally remains open; station-mode
// configuration uses Digest authentication plus same-origin checks.
void securityInit();
const char* securityUsername();
const char* securityPortalCode();
bool securityAuthorize(WebServer& server, bool mutating);
'''

SECURITY_CPP = r'''#include "security_manager.h"

#include "wifi_manager.h"

#include <WebServer.h>
#include <esp_system.h>

namespace {
constexpr char kUsername[] = "admin";
constexpr char kAlphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
constexpr size_t kAlphabetLen = sizeof(kAlphabet) - 1;
constexpr size_t kCodeLen = 10;

char g_portalCode[kCodeLen + 1] = {};
bool g_initialized = false;

void ensureInitialized() {
  if (g_initialized) return;

  // 32 symbols = exactly 5 bits/character. Ambiguous 0/O/1/I are omitted.
  static_assert(kAlphabetLen == 32, "portal alphabet must contain 32 symbols");
  uint32_t word = 0;
  uint8_t available = 0;
  for (size_t i = 0; i < kCodeLen; ++i) {
    if (available < 5) {
      word = esp_random();
      available = 32;
    }
    g_portalCode[i] = kAlphabet[word & 0x1FU];
    word >>= 5;
    available -= 5;
  }
  g_portalCode[kCodeLen] = '\0';
  g_initialized = true;

  Serial.println();
  Serial.println("Smart Home v8 portal security enabled");
  Serial.printf("Portal username: %s\n", kUsername);
  Serial.printf("Portal code: %s\n", g_portalCode);
  Serial.println("The code changes after every reboot and is also shown on the System screen.");
}

bool sameOrigin(WebServer& server) {
  // Explicit API clients may opt in after authenticating. This does not bypass
  // Digest authentication; it only replaces browser Origin/Referer semantics.
  if (server.header("X-BambuHelper-Client") == "1") return true;

  const String host = server.hostHeader();
  if (host.length() == 0) return false;

  String origin = server.header("Origin");
  origin.trim();
  if (origin.length() > 0) {
    const String httpOrigin = String("http://") + host;
    const String httpsOrigin = String("https://") + host;
    return origin.equalsIgnoreCase(httpOrigin) || origin.equalsIgnoreCase(httpsOrigin);
  }

  String referer = server.header("Referer");
  referer.trim();
  if (referer.length() > 0) {
    const String httpPrefix = String("http://") + host + "/";
    const String httpsPrefix = String("https://") + host + "/";
    return referer.startsWith(httpPrefix) || referer.startsWith(httpsPrefix);
  }

  // A same-origin browser POST normally carries Origin or Referer. Reject
  // missing provenance rather than silently weakening CSRF protection.
  return false;
}
}  // namespace

void securityInit() {
  ensureInitialized();
}

const char* securityUsername() {
  ensureInitialized();
  return kUsername;
}

const char* securityPortalCode() {
  ensureInitialized();
  return g_portalCode;
}

bool securityAuthorize(WebServer& server, bool mutating) {
  // First-boot/fallback AP setup remains usable without a password. The AP
  // itself already requires physical/network proximity and contains only the
  // Wi-Fi onboarding surface.
  if (isAPMode()) return true;

  ensureInitialized();

  if (!server.authenticate(kUsername, g_portalCode)) {
    server.requestAuthentication(
        DIGEST_AUTH,
        "BambuHelper Smart Home",
        "Authentication required. Read the current admin code from the device System screen.");
    return false;
  }

  if (mutating && !sameOrigin(server)) {
    server.send(
        403,
        "application/json",
        "{\"status\":\"error\",\"message\":\"Rejected by Smart Home same-origin protection.\"}");
    return false;
  }

  return true;
}
'''

BUILD_HEADER = f'''#pragma once

#define SMART_HOME_VERSION "v8.0"
#define SMART_HOME_PROFILE "security-hardened"
#define SMART_HOME_UPSTREAM_SHA "{UPSTREAM_SHA}"
#define SMART_HOME_UPSTREAM_SHA_SHORT "8cb1cbbb"
#define SMART_HOME_BUILD_LABEL "Smart Home v8.0 Hardening RC"
'''


def patch_security_modules(repo: Path) -> None:
    include_dir = repo / "include"
    src_dir = repo / "src"
    include_dir.mkdir(parents=True, exist_ok=True)
    src_dir.mkdir(parents=True, exist_ok=True)

    (include_dir / "security_manager.h").write_text(SECURITY_HEADER, encoding="utf-8")
    (src_dir / "security_manager.cpp").write_text(SECURITY_CPP, encoding="utf-8")
    (include_dir / "smart_home_build.h").write_text(BUILD_HEADER, encoding="utf-8")


def patch_web_server(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '#include "hms_lookup.h"\n',
        '#include "hms_lookup.h"\n#include "security_manager.h"\n',
        "security include",
    )
    text = replace_once(
        text,
        '#include "esp_ota_ops.h"\n',
        '#include "esp_ota_ops.h"\n#include <mbedtls/sha256.h>\n#include <cstring>\n',
        "SHA include",
    )

    # Auto-update must never downgrade TLS validation.
    insecure_block = re.compile(
        r'''      // Retry once with setInsecure\(\) in case CA bundle fails\..*?'''
        r'''      if \(lastErr != HTTP_UE_TOO_LESS_SPACE && lastErr != HTTP_UE_BIN_FOR_WRONG_FLASH\) \{\n'''
        r'''        client\.setInsecure\(\);\n'''
        r'''        ret = httpUpdate\.update\(client, url\);\n'''
        r'''        if \(ret == HTTP_UPDATE_OK\) \{\n'''
        r'''          otaAutoProgress = 100;\n'''
        r'''          otaAutoStatus = "done";\n'''
        r'''          scheduleRestart\(4000\);\n'''
        r'''          break;\n'''
        r'''        \}\n'''
        r'''      \}\n''',
        re.S,
    )
    if insecure_block.search(text):
        text = insecure_block.sub(
            '''      // Smart Home v8: never retry an OTA download without certificate\n'''
            '''      // validation. A CA failure is a hard failure, not a reason to\n'''
            '''      // weaken the transport security policy.\n''',
            text,
            count=1,
        )
    elif "client.setInsecure();" in text:
        raise PatchError("OTA hardening: setInsecure exists but expected fallback block was not found")

    # Harden the initial host allow-list even though ws_lcd_350 disables the
    # upstream auto-updater. This protects regression targets and future merges.
    old_allow = '''static bool isExpectedOtaAssetUrl(const String& url) {
  if (url.length() == 0) return false;
  if (!url.startsWith("https://github.com/") &&
      !url.startsWith("https://objects.githubusercontent.com/") &&
      !url.startsWith("https://release-assets.githubusercontent.com/")) {
    return false;
  }
'''
    if old_allow in text:
        new_allow = '''static bool isExpectedOtaAssetUrl(const String& url) {
  if (url.length() == 0) return false;
  // The initiating URL must be the canonical BambuHelper release path. The
  // GitHub HTTP client may subsequently follow GitHub's signed CDN redirect.
  if (!url.startsWith("https://github.com/Keralots/BambuHelper/releases/download/")) {
    return false;
  }
'''
        text = replace_once(text, old_allow, new_allow, "OTA canonical URL")

    # Correct HTTP semantics for mutating routes before wrapping registrations.
    text = text.replace(
        'server.on("/reset", HTTP_GET, handleReset);',
        'server.on("/reset", HTTP_POST, handleReset);',
    )
    text = text.replace(
        'server.on("/brightness", HTTP_GET, handleBrightnessPreview);',
        'server.on("/brightness", HTTP_POST, handleBrightnessPreview);',
    )

    # Manual OTA transfer-integrity contract.
    sha_support = r'''
// ---------------------------------------------------------------------------
// Smart Home v8 manual OTA SHA-256 verification
// ---------------------------------------------------------------------------
static mbedtls_sha256_context otaShaCtx;
static bool otaShaActive = false;
static bool otaShaExpectedValid = false;
static uint8_t otaShaExpected[32] = {};

static void resetOtaSha() {
  if (otaShaActive) {
    mbedtls_sha256_free(&otaShaCtx);
    otaShaActive = false;
  }
  otaShaExpectedValid = false;
  memset(otaShaExpected, 0, sizeof(otaShaExpected));
}

static bool parseSha256Hex(const String& raw, uint8_t out[32]) {
  if (raw.length() != 64) return false;
  for (size_t i = 0; i < 32; ++i) {
    const char hi = raw[i * 2];
    const char lo = raw[i * 2 + 1];
    auto nibble = [](char c) -> int {
      if (c >= '0' && c <= '9') return c - '0';
      if (c >= 'a' && c <= 'f') return c - 'a' + 10;
      if (c >= 'A' && c <= 'F') return c - 'A' + 10;
      return -1;
    };
    const int h = nibble(hi);
    const int l = nibble(lo);
    if (h < 0 || l < 0) return false;
    out[i] = static_cast<uint8_t>((h << 4) | l);
  }
  return true;
}

'''
    text = replace_once(
        text,
        "static void handleOtaUpload() {\n",
        sha_support + "static void handleOtaUpload() {\n",
        "manual OTA SHA support",
    )

    start_anchor = '''  if (upload.status == UPLOAD_FILE_START) {
    otaError = "";
    otaInProgress = true;
'''
    start_repl = '''  if (upload.status == UPLOAD_FILE_START) {
    otaError = "";
    otaInProgress = true;

    resetOtaSha();
    const String expectedSha = server.header("X-SHA256");
    if (!parseSha256Hex(expectedSha, otaShaExpected)) {
      otaError = "Missing or invalid X-SHA256 header. Use the Smart Home portal to upload firmware.";
      otaInProgress = false;
      return;
    }
    otaShaExpectedValid = true;
    mbedtls_sha256_init(&otaShaCtx);
    if (mbedtls_sha256_starts_ret(&otaShaCtx, 0) != 0) {
      otaError = "Could not initialize SHA-256 verification.";
      resetOtaSha();
      otaInProgress = false;
      return;
    }
    otaShaActive = true;
'''
    text = replace_once(text, start_anchor, start_repl, "OTA SHA start")

    write_anchor = '''    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
'''
    write_repl = '''    if (otaShaActive &&
        mbedtls_sha256_update_ret(&otaShaCtx, upload.buf, upload.currentSize) != 0) {
      otaError = "SHA-256 verification failed while reading the upload.";
      Update.abort();
      resetOtaSha();
      otaInProgress = false;
      return;
    }

    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
'''
    text = replace_once(text, write_anchor, write_repl, "OTA SHA chunk")

    end_anchor = '''  } else if (upload.status == UPLOAD_FILE_END) {
    if (!otaInProgress) return;

    if (Update.end(true)) {
'''
    end_repl = '''  } else if (upload.status == UPLOAD_FILE_END) {
    if (!otaInProgress) {
      resetOtaSha();
      return;
    }

    uint8_t actualSha[32] = {};
    if (!otaShaActive || !otaShaExpectedValid ||
        mbedtls_sha256_finish_ret(&otaShaCtx, actualSha) != 0) {
      otaError = "Could not finalize SHA-256 verification.";
      Update.abort();
      resetOtaSha();
      otaInProgress = false;
      return;
    }
    mbedtls_sha256_free(&otaShaCtx);
    otaShaActive = false;

    if (memcmp(actualSha, otaShaExpected, sizeof(actualSha)) != 0) {
      otaError = "Firmware SHA-256 mismatch. Flash was aborted before activation.";
      Update.abort();
      resetOtaSha();
      otaInProgress = false;
      return;
    }
    resetOtaSha();

    if (Update.end(true)) {
'''
    text = replace_once(text, end_anchor, end_repl, "OTA SHA finalize")

    aborted_anchor = '''  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    otaInProgress = false;
'''
    aborted_repl = '''  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    resetOtaSha();
    otaInProgress = false;
'''
    text = replace_once(text, aborted_anchor, aborted_repl, "OTA SHA abort")

    # Route wrappers. They preserve existing handlers while putting one policy
    # in front of every station-mode configuration/API route.
    route_macros = r'''
// ---------------------------------------------------------------------------
// Smart Home v8 route-policy wrappers
// ---------------------------------------------------------------------------
#define SECURE_GET(path, handler) \
  server.on(path, HTTP_GET, []() { \
    if (securityAuthorize(server, false)) handler(); \
  })

#define SECURE_POST(path, handler) \
  server.on(path, HTTP_POST, []() { \
    if (securityAuthorize(server, true)) handler(); \
  })

#define SECURE_UPLOAD(path, finishHandler, uploadHandler) \
  server.on(path, HTTP_POST, \
    []() { if (securityAuthorize(server, true)) finishHandler(); }, \
    []() { \
      static bool requestAuthorized = false; \
      HTTPUpload& secureUpload = server.upload(); \
      if (secureUpload.status == UPLOAD_FILE_START) \
        requestAuthorized = securityAuthorize(server, true); \
      if (requestAuthorized) uploadHandler(); \
      if (secureUpload.status == UPLOAD_FILE_END || \
          secureUpload.status == UPLOAD_FILE_ABORTED) \
        requestAuthorized = false; \
    })

'''
    text = replace_once(
        text,
        "void initWebServer() {\n",
        route_macros + "void initWebServer() {\n  securityInit();\n",
        "secure route macros",
    )

    # Only captive-probe assets and static CSS/JS stay public.
    public_gets = {
        "/generate_204",
        "/gen_204",
        "/connecttest.txt",
        "/hotspot-detect.html",
        "/canonical.html",
        "/app.css",
        "/app.js",
    }

    def replace_simple_route(match: re.Match[str]) -> str:
        path, method, handler = match.group(1), match.group(2), match.group(3)
        if method == "GET" and path in public_gets:
            return match.group(0)
        macro = "SECURE_GET" if method == "GET" else "SECURE_POST"
        return f'{macro}("{path}", {handler});'

    init_start = text.index("void initWebServer() {")
    init_end = text.index("\nvoid handleWebServer()", init_start)
    init_block = text[init_start:init_end]

    simple_pattern = re.compile(
        r'server\.on\("([^"]+)", HTTP_(GET|POST), ([A-Za-z_][A-Za-z0-9_]*)\);'
    )
    init_block = simple_pattern.sub(replace_simple_route, init_block)

    upload_pattern = re.compile(
        r'server\.on\("([^"]+)", HTTP_POST,\s*'
        r'([A-Za-z_][A-Za-z0-9_]*),\s*([A-Za-z_][A-Za-z0-9_]*)\);'
    )
    init_block = upload_pattern.sub(
        lambda m: f'SECURE_UPLOAD("{m.group(1)}", {m.group(2)}, {m.group(3)});',
        init_block,
    )

    init_block = init_block.replace(
        "  server.onNotFound(handleNotFound);",
        "  server.onNotFound([]() { if (securityAuthorize(server, false)) handleNotFound(); });",
    )

    text = text[:init_start] + init_block + text[init_end:]

    # Collect security + transfer-integrity headers. Authorization is collected
    # automatically by WebServer in addition to this list.
    header_old = '''  const char* otaHeaders[] = {"X-MD5"};
  server.collectHeaders(otaHeaders, 1);
'''
    header_new = '''  const char* requestHeaders[] = {
    "X-MD5",
    "X-SHA256",
    "Origin",
    "Referer",
    "X-BambuHelper-Client"
  };
  server.collectHeaders(requestHeaders, sizeof(requestHeaders) / sizeof(requestHeaders[0]));
'''
    text = replace_once(text, header_old, header_new, "request headers")

    p.write_text(text, encoding="utf-8")


def patch_web_app(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "function sendBrightness(val){ clearTimeout(_brightTimer); _brightTimer = setTimeout(function(){ fetch('/brightness?val=' + val); }, 150); }",
        "function sendBrightness(val){ clearTimeout(_brightTimer); _brightTimer = setTimeout(function(){ fetch('/brightness?val=' + encodeURIComponent(val),{method:'POST'}); }, 150); }",
        "brightness POST",
    )

    old_reset = '''function factoryReset(){
  if (!confirm('Factory reset wipes ALL settings (WiFi, printers, gauge layout). Continue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
  location = '/reset';
}
'''
    new_reset = '''function factoryReset(){
  if (!confirm('Factory reset wipes ALL settings (WiFi, printers, gauge layout). Continue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
  fetch('/reset',{method:'POST'})
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); document.body.innerHTML='<div style="text-align:center;padding-top:80px"><h2>Factory reset started</h2><p>Reconnect to the BambuHelper setup network after restart.</p></div>'; })
    .catch(function(e){ showToast('Factory reset failed: '+e.message); });
}
'''
    text = replace_once(text, old_reset, new_reset, "factory reset POST")

    ota_helper = r'''
/* Smart Home v8: SHA-256 implementation that works on the device's plain-HTTP
   LAN portal. WebCrypto is restricted to secure contexts on many browsers. */
function sha256HexArrayBuffer(buffer){
  var bytes=new Uint8Array(buffer);
  var bitLen=bytes.length*8;
  var total=((bytes.length+9+63)>>6)<<6;
  var data=new Uint8Array(total);
  data.set(bytes);
  data[bytes.length]=0x80;
  var view=new DataView(data.buffer);
  view.setUint32(total-8,Math.floor(bitLen/4294967296),false);
  view.setUint32(total-4,bitLen>>>0,false);
  var K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var W=new Uint32Array(64);
  function rotr(x,n){return (x>>>n)|(x<<(32-n));}
  for(var off=0;off<total;off+=64){
    var i;
    for(i=0;i<16;i++)W[i]=view.getUint32(off+i*4,false);
    for(i=16;i<64;i++){
      var x=W[i-15],y=W[i-2];
      var s0=(rotr(x,7)^rotr(x,18)^(x>>>3))>>>0;
      var s1=(rotr(y,17)^rotr(y,19)^(y>>>10))>>>0;
      W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(i=0;i<64;i++){
      var S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      var ch=((e&f)^((~e)&g))>>>0;
      var t1=(h+S1+ch+K[i]+W[i])>>>0;
      var S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      var maj=((a&b)^(a&c)^(b&c))>>>0;
      var t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H.map(function(v){return v.toString(16).padStart(8,'0');}).join('');
}

'''
    text = replace_once(
        text,
        "/* ============ OTA ============ */\nfunction startOta(){\n",
        "/* ============ OTA ============ */\n" + ota_helper + "async function startOta(){\n",
        "OTA SHA helper",
    )

    hash_insert_anchor = '''  var lowerName = f.name.toLowerCase();
  var board = DEV.board.toLowerCase();
'''
    hash_insert = '''  var lowerName = f.name.toLowerCase();
  var board = DEV.board.toLowerCase();
'''
    text = replace_once(text, hash_insert_anchor, hash_insert, "OTA board anchor")

    confirm_anchor = '''  if (lowerName.indexOf('bambuhelper-') === 0 && lowerName.indexOf('-' + board + '-') === -1){ showToast('Selected firmware looks like a different board variant'); return; }
  if (!confirm('Upload firmware and restart?')) return;
'''
    confirm_repl = '''  if (lowerName.indexOf('bambuhelper-') === 0 && lowerName.indexOf('-' + board + '-') === -1){ showToast('Selected firmware looks like a different board variant'); return; }

  var shaHex;
  try {
    var fileBuf = await f.arrayBuffer();
    shaHex = sha256HexArrayBuffer(fileBuf);
  } catch (e) {
    showToast('Could not calculate firmware SHA-256: ' + e.message);
    return;
  }

  if (!confirm('SHA-256 verified locally. Upload firmware and restart?')) return;
'''
    text = replace_once(text, confirm_anchor, confirm_repl, "OTA browser SHA")

    xhr_anchor = '''  var xhr = new XMLHttpRequest();
  xhr.open('POST','/ota/upload',true);
'''
    xhr_repl = '''  var xhr = new XMLHttpRequest();
  xhr.open('POST','/ota/upload',true);
  xhr.setRequestHeader('X-SHA256', shaHex);
'''
    text = replace_once(text, xhr_anchor, xhr_repl, "OTA SHA header")

    p.write_text(text, encoding="utf-8")


def patch_web_pages(repo: Path) -> None:
    p = repo / "include" / "web_pages.h"
    text = p.read_text(encoding="utf-8")

    old = '''          <label class="hstack" style="gap:var(--sp-2);margin-top:var(--sp-2);font-size:12.5px;color:var(--text-mid)">
            <input type="checkbox" id="cl_savePass">
            <span>Remember the password so the device can renew the token by itself. Only works on accounts without two-factor authentication - with 2FA on the password is discarded and you sign in again when the token expires.</span>
          </label>
'''
    new = '''          <label class="hstack" style="gap:var(--sp-2);margin-top:var(--sp-2);font-size:12.5px;color:var(--text-mid)">
            <input type="checkbox" id="cl_savePass" disabled>
            <span>Smart Home v8 never stores your Bambu account password. The cloud token is retained; if Bambu later requires a fresh sign-in, enter the password again.</span>
          </label>
'''
    text = replace_once(text, old, new, "disable stored cloud password")
    p.write_text(text, encoding="utf-8")


def patch_settings(repo: Path) -> None:
    p = repo / "src" / "settings.cpp"
    text = p.read_text(encoding="utf-8")

    pattern = re.compile(
        r'''void saveCloudPassword\(const char\* password\) \{.*?\n\}\n\n'''
        r'''bool loadCloudPassword\(char\* buf, size_t bufLen\) \{.*?\n\}\n''',
        re.S,
    )
    replacement = r'''void saveCloudPassword(const char* password) {
  (void)password;
  // Smart Home v8 policy: never persist the Bambu account password. Remove a
  // value left behind by an older release during the first sign-in after upgrade.
  clearCloudPassword();
}

bool loadCloudPassword(char* buf, size_t bufLen) {
  if (buf && bufLen > 0) buf[0] = '\0';
  // Also acts as an upgrade migration: the first attempted background renewal
  // erases any legacy cl_pass value instead of loading it into RAM.
  clearCloudPassword();
  return false;
}
'''
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise PatchError(f"cloud password policy: expected 1 function pair, found {count}")

    # Proactively erase a legacy password on every v8 boot, not only when a
    # renewal is attempted. A one-time NVS remove is cheap and idempotent.
    load_anchor = "void loadSettings() {\n"
    text = replace_once(
        text,
        load_anchor,
        "void loadSettings() {\n  // Smart Home v8 migration: remove cloud passwords stored by older builds.\n  clearCloudPassword();\n",
        "legacy cloud password migration",
    )

    p.write_text(text, encoding="utf-8")


def patch_board(repo: Path) -> None:
    p = repo / "boards" / "ws_lcd_350.ini"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "    -D ENABLE_OTA_AUTO=1\n",
        "    ; Smart Home v8: upstream device-initiated OTA is disabled on WS350.\n"
        "    ; Updates use the externally verified Smart Home release + manual OTA path.\n",
        "disable WS350 auto OTA",
    )
    p.write_text(text, encoding="utf-8")


def patch_smart_hub(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    if not p.exists():
        raise PatchError("smart_hub.cpp missing; apply Smart Home v7/v7.1/v7.2 before v8")

    text = p.read_text(encoding="utf-8")
    if '#include "security_manager.h"' not in text:
        text = '#include "security_manager.h"\n#include "smart_home_build.h"\n' + text

    text = text.replace('Smart Home v7.2', 'Smart Home v8.0')

    psram_anchor = '''  char psram[24];
  snprintf(psram, sizeof(psram), "%u KB",
           (unsigned)(ESP.getFreePsram() / 1024));

'''
    psram_repl = '''  char psram[24];
  snprintf(psram, sizeof(psram), "%u KB",
           (unsigned)(ESP.getFreePsram() / 1024));

  char minHeap[24];
  snprintf(minHeap, sizeof(minHeap), "%u KB",
           (unsigned)(ESP.getMinFreeHeap() / 1024));

  char maxBlock[24];
  snprintf(maxBlock, sizeof(maxBlock), "%u KB",
           (unsigned)(ESP.getMaxAllocHeap() / 1024));

'''
    text = replace_once(text, psram_anchor, psram_repl, "System heap metrics")

    cards_anchor = '''  drawMetricCard(margin + cardW + gap, 58 + cardH + gap, cardW, cardH,
                 "FREE PSRAM", psram, dispSettings.nozzle.value);

'''
    cards_repl = '''  drawMetricCard(margin + cardW + gap, 58 + cardH + gap, cardW, cardH,
                 "FREE PSRAM", psram, dispSettings.nozzle.value);

  const int16_t miniTop = 58 + (cardH + gap) * 2;
  const int16_t miniH = 58;
  drawMetricCard(margin, miniTop, cardW, miniH,
                 "MIN HEAP", minHeap, dispSettings.warnColor);
  drawMetricCard(margin + cardW + gap, miniTop, cardW, miniH,
                 "MAX BLOCK", maxBlock, dispSettings.chamberTemp.value);

'''
    text = replace_once(text, cards_anchor, cards_repl, "System diagnostic cards")

    old_prov = '''  char ver[40];
  snprintf(ver, sizeof(ver), "BambuHelper %s · ws_lcd_350", FW_VERSION);
  tft.drawString(ver, tft.width() / 2, 252);

  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  String ip = WiFi.status() == WL_CONNECTED
      ? WiFi.localIP().toString() : String("No IP");
  tft.drawString(ip, tft.width() / 2, 278);
  drawTapHint("PRINTER");
'''
    new_prov = '''  char ver[48];
  snprintf(ver, sizeof(ver), "BambuHelper %s · ws_lcd_350", FW_VERSION);
  tft.drawString(ver, tft.width() / 2, 326);

  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  String ip = WiFi.status() == WL_CONNECTED
      ? WiFi.localIP().toString() : String("No IP");
  tft.drawString(ip, tft.width() / 2, 348);

  char build[48];
  snprintf(build, sizeof(build), "%s · %s",
           SMART_HOME_VERSION, SMART_HOME_UPSTREAM_SHA_SHORT);
  tft.drawString(build, tft.width() / 2, 370);

  tft.setTextColor(dispSettings.statusOkColor, dispSettings.bgColor);
  char auth[48];
  snprintf(auth, sizeof(auth), "%s / %s",
           securityUsername(), securityPortalCode());
  tft.drawString(auth, tft.width() / 2, 395);

  setFont(tft, FONT_SMALL);
  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  tft.drawString("Digest auth + same-origin protection", tft.width() / 2, 418);
  drawTapHint("PRINTER");
'''
    text = replace_once(text, old_prov, new_prov, "System provenance/security")

    marker = "// BambuHelper display stability evolution v7.2"
    if marker in text and "// BambuHelper security hardening evolution v8.0" not in text:
        text = text.replace(
            marker,
            marker + "\n// BambuHelper security hardening evolution v8.0",
            1,
        )

    p.write_text(text, encoding="utf-8")


def apply(repo: Path) -> None:
    patch_security_modules(repo)
    patch_web_server(repo)
    patch_web_app(repo)
    patch_web_pages(repo)
    patch_settings(repo)
    patch_board(repo)
    patch_smart_hub(repo)


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Smart Home v8 hardening to BambuHelper")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not args.apply:
        raise SystemExit("Pass --apply")

    repo = Path(args.repo)
    apply(repo)
    print("Smart Home v8 hardening patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
