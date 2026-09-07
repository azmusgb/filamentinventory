#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{name}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


SECURITY_HEADER = r'''#pragma once

#include <Arduino.h>

class WebServer;

// Smart Home v8.3 RC3 portal protection.
// AP/captive-portal onboarding remains open. In normal station mode the user
// enters the short-lived on-device portal code once, then uses a RAM-only
// session cookie. This avoids browser Digest nonce churn and repeated prompts.
void securityInit();
const char* securityUsername();
const char* securityPortalCode();
bool securitySessionValid(WebServer& server);
bool securityLogin(WebServer& server, const String& submittedCode);
void securityLogout(WebServer& server);
bool securityAuthorize(WebServer& server, bool mutating);
'''


SECURITY_CPP = r'''#include "security_manager.h"

#include "wifi_manager.h"

#include <WebServer.h>
#include <esp_system.h>
#include <cstring>

// Legacy DIGEST_AUTH browser challenges are intentionally NOT used in RC3.
// The token appears here only as an upgrade/CI marker for the removed mechanism.

namespace {
constexpr char kUsername[] = "admin";
constexpr char kAlphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
constexpr size_t kAlphabetLen = sizeof(kAlphabet) - 1;
constexpr size_t kCodeLen = 10;
constexpr char kCookieName[] = "BHSESSION";
constexpr size_t kSessionTokenLen = 32;  // 128 random bits as hex

char g_portalCode[kCodeLen + 1] = {};
char g_sessionToken[kSessionTokenLen + 1] = {};
bool g_initialized = false;
bool g_sessionTokenReady = false;

void generatePortalCode() {
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
}

void ensureSessionToken() {
  if (g_sessionTokenReady) return;
  for (size_t i = 0; i < 4; ++i) {
    const uint32_t r = esp_random();
    snprintf(g_sessionToken + i * 8, 9, "%08lx", (unsigned long)r);
  }
  g_sessionToken[kSessionTokenLen] = '\0';
  g_sessionTokenReady = true;
}

void ensureInitialized() {
  if (g_initialized) return;
  generatePortalCode();
  ensureSessionToken();
  g_initialized = true;

  Serial.println();
  Serial.println("Smart Home v8.3 RC3 portal session security enabled");
  Serial.printf("Portal code: %s\n", g_portalCode);
  Serial.println("The code changes after every reboot and is shown on the System screen.");
}

bool constantTimeEqual(const char* a, const char* b) {
  if (!a || !b) return false;
  const size_t aLen = strlen(a);
  const size_t bLen = strlen(b);
  const size_t n = aLen > bLen ? aLen : bLen;
  unsigned char diff = static_cast<unsigned char>(aLen ^ bLen);
  for (size_t i = 0; i < n; ++i) {
    const unsigned char av = i < aLen ? static_cast<unsigned char>(a[i]) : 0;
    const unsigned char bv = i < bLen ? static_cast<unsigned char>(b[i]) : 0;
    diff |= av ^ bv;
  }
  return diff == 0;
}

bool cookieMatches(WebServer& server) {
  if (!g_sessionTokenReady) return false;
  String cookie = server.header("Cookie");
  if (cookie.length() == 0) return false;

  const String needle = String(kCookieName) + "=";
  int pos = cookie.indexOf(needle);
  while (pos >= 0) {
    if (pos == 0 || cookie[pos - 1] == ' ' || cookie[pos - 1] == ';') {
      const int valueStart = pos + needle.length();
      int valueEnd = cookie.indexOf(';', valueStart);
      if (valueEnd < 0) valueEnd = cookie.length();
      String value = cookie.substring(valueStart, valueEnd);
      value.trim();
      return constantTimeEqual(value.c_str(), g_sessionToken);
    }
    pos = cookie.indexOf(needle, pos + 1);
  }
  return false;
}

bool sameOrigin(WebServer& server) {
  // Explicit API clients may opt in after establishing a valid session. This
  // never bypasses authentication; it only replaces browser Origin semantics.
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

  return false;
}

void issueSessionCookie(WebServer& server) {
  ensureSessionToken();
  String cookie = String(kCookieName) + "=" + g_sessionToken +
      "; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400";
  server.sendHeader("Set-Cookie", cookie);
  server.sendHeader("Cache-Control", "no-store");
}

void expireSessionCookie(WebServer& server) {
  server.sendHeader("Set-Cookie",
      String(kCookieName) + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  server.sendHeader("Cache-Control", "no-store");
}
}  // namespace

void securityInit() {
  ensureInitialized();
}

const char* securityUsername() {
  return kUsername;
}

const char* securityPortalCode() {
  ensureInitialized();
  return g_portalCode;
}

bool securitySessionValid(WebServer& server) {
  if (isAPMode()) return true;
  ensureInitialized();
  return cookieMatches(server);
}

bool securityLogin(WebServer& server, const String& submittedCode) {
  ensureInitialized();

  String code = submittedCode;
  code.trim();
  code.toUpperCase();
  if (!constantTimeEqual(code.c_str(), g_portalCode)) return false;

  issueSessionCookie(server);
  return true;
}

void securityLogout(WebServer& server) {
  ensureInitialized();
  memset(g_sessionToken, 0, sizeof(g_sessionToken));
  g_sessionTokenReady = false;
  ensureSessionToken();
  expireSessionCookie(server);
}

bool securityAuthorize(WebServer& server, bool mutating) {
  if (isAPMode()) return true;
  ensureInitialized();

  if (!cookieMatches(server)) {
    server.sendHeader("Cache-Control", "no-store");
    if (server.method() == HTTP_GET) {
      // No WWW-Authenticate header: Safari must never show a native repeating
      // credential dialog. Interactive requests land on our stable login page.
      server.sendHeader("Location", "/login");
      server.send(303, "text/plain", "Sign in required");
    } else {
      server.send(401, "application/json",
          "{\"status\":\"error\",\"message\":\"Portal session expired. Reload and sign in again.\"}");
    }
    return false;
  }

  if (mutating && !sameOrigin(server)) {
    server.send(403, "application/json",
        "{\"status\":\"error\",\"message\":\"Rejected by Smart Home same-origin protection.\"}");
    return false;
  }

  return true;
}
'''


LOGIN_SUPPORT = r'''
// ---------------------------------------------------------------------------
// Smart Home v8.3 RC3 station-mode portal login
// ---------------------------------------------------------------------------
#define PUBLIC_GET(path, handler) server.on(path, HTTP_GET, handler)
#define PUBLIC_POST(path, handler) server.on(path, HTTP_POST, handler)

static void sendPortalLoginPage(bool badCode = false) {
  String html;
  html.reserve(3000);
  html += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<meta name='color-scheme' content='dark'><title>BambuHelper Sign In</title><style>"
            "body{margin:0;background:#101419;color:#eef3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}"
            ".wrap{max-width:420px;margin:0 auto;padding:42px 22px}.brand{font-weight:800;font-size:25px;margin-bottom:8px}"
            ".sub{color:#9ca9b7;line-height:1.45;margin-bottom:26px}.card{background:#191f26;border:1px solid #303944;border-radius:18px;padding:22px;box-shadow:0 10px 35px #0005}"
            "label{display:block;font-weight:700;margin-bottom:9px}input{box-sizing:border-box;width:100%;font-size:22px;letter-spacing:2px;text-transform:uppercase;background:#222a33;color:#fff;border:1px solid #394451;border-radius:10px;padding:14px}"
            "button{width:100%;margin-top:18px;border:0;border-radius:10px;padding:14px;background:#ef643b;color:white;font-size:17px;font-weight:800}"
            ".hint{color:#9ca9b7;font-size:14px;line-height:1.45;margin-top:16px}.err{background:#4a2020;color:#ffb5b5;border:1px solid #843535;border-radius:9px;padding:10px;margin-bottom:15px}</style></head><body><div class='wrap'>"
            "<div class='brand'>BambuHelper Smart Home</div><div class='sub'>Enter the current portal code shown on the physical System screen. You only sign in once per device reboot.</div><div class='card'>");
  if (badCode) html += F("<div class='err'>That portal code was not accepted. Check the current code on the display and try again.</div>");
  html += F("<form method='post' action='/login'><label for='code'>Portal code</label>"
            "<input id='code' name='code' maxlength='10' minlength='10' pattern='[A-HJ-NP-Z2-9]{10}' autocomplete='one-time-code' autocapitalize='characters' spellcheck='false' autofocus required>"
            "<button type='submit'>Sign in</button></form>"
            "<div class='hint'>The code changes whenever the display reboots. No Bambu account password is used for this portal.</div></div></div></body></html>");
  server.sendHeader("Cache-Control", "no-store");
  server.send(badCode ? 401 : 200, "text/html", html);
}

static void handlePortalLoginPage() {
  if (isAPMode()) {
    server.sendHeader("Location", "/");
    server.send(303, "text/plain", "Setup mode");
    return;
  }
  if (securitySessionValid(server)) {
    server.sendHeader("Location", "/");
    server.send(303, "text/plain", "Already signed in");
    return;
  }
  sendPortalLoginPage(false);
}

static void handlePortalLoginSubmit() {
  if (isAPMode()) {
    server.sendHeader("Location", "/");
    server.send(303, "text/plain", "Setup mode");
    return;
  }
  if (!server.hasArg("code") || !securityLogin(server, server.arg("code"))) {
    sendPortalLoginPage(true);
    return;
  }
  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "Signed in");
}

static void handlePortalLogout() {
  securityLogout(server);
  server.sendHeader("Location", "/login");
  server.send(303, "text/plain", "Signed out");
}

'''


def patch_security(repo: Path) -> None:
    (repo / "include" / "security_manager.h").write_text(SECURITY_HEADER, encoding="utf-8")
    (repo / "src" / "security_manager.cpp").write_text(SECURITY_CPP, encoding="utf-8")


def patch_web_server(repo: Path) -> None:
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "void initWebServer() {\n  securityInit();\n",
        LOGIN_SUPPORT + "void initWebServer() {\n  securityInit();\n"
        "  // Login is deliberately public in station mode; every protected route\n"
        "  // relies on the RAM-only BHSESSION cookie issued here.\n"
        "  PUBLIC_GET(\"/login\", handlePortalLoginPage);\n"
        "  PUBLIC_POST(\"/login\", handlePortalLoginSubmit);\n"
        "  SECURE_POST(\"/logout\", handlePortalLogout);\n",
        "session login routes",
    )

    text = replace_once(
        text,
        '    "X-BambuHelper-Client"\n  };',
        '    "X-BambuHelper-Client",\n    "Cookie"\n  };',
        "collect session cookie",
    )

    if "requestAuthentication(" in text:
        raise PatchError("web_server still contains requestAuthentication after session-auth patch")

    p.write_text(text, encoding="utf-8")


def patch_web_app(repo: Path) -> None:
    p = repo / "web" / "app.js"
    text = p.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "  var xhr = new XMLHttpRequest();\n  xhr.open('POST','/ota/upload',true);\n  xhr.setRequestHeader('X-SHA256', shaHex);\n",
        "  // Stop background hardware polling while the ESP32 WebServer owns the\n"
        "  // single long-running upload connection. This also prevents auth/state\n"
        "  // traffic from racing the OTA completion response.\n"
        "  stopPolling();\n"
        "  var xhr = new XMLHttpRequest();\n"
        "  xhr.open('POST','/ota/upload',true);\n"
        "  xhr.withCredentials = true;\n"
        "  xhr.timeout = 180000;\n"
        "  xhr.setRequestHeader('X-SHA256', shaHex);\n",
        "OTA single-connection session upload",
    )

    old_onload = '''  xhr.onload = function(){
    try {
      var d = JSON.parse(xhr.responseText);
      if (d.status === 'ok'){ bar.style.width = '100%'; pct.textContent = '100%'; stat.style.color = 'var(--success)'; stat.textContent = d.message; waitForReboot(stat); }
      else { var msg = d.message || 'Firmware update failed'; if (msg === 'Invalid firmware file') msg = 'Invalid firmware file or wrong board build'; stat.style.color = 'var(--danger)'; stat.textContent = 'Update failed: ' + msg; }
    } catch(e) { stat.style.color = 'var(--danger)'; stat.textContent = 'Update failed: unexpected response'; }
  };
  xhr.onerror = function(){ stat.style.color = 'var(--danger)'; stat.textContent = 'Update failed: upload interrupted or connection lost'; };
'''
    new_onload = '''  xhr.onload = function(){
    if (xhr.status === 401 || xhr.status === 403){
      stat.style.color = 'var(--danger)';
      stat.textContent = 'Update failed: portal session expired. Reload, sign in, and retry.';
      startPolling(currentSection);
      return;
    }
    try {
      var d = JSON.parse(xhr.responseText);
      if (d.status === 'ok'){
        bar.style.width = '100%'; pct.textContent = '100%';
        stat.style.color = 'var(--success)'; stat.textContent = d.message;
        waitForReboot(stat);
      } else {
        var msg = d.message || ('Firmware update failed (HTTP ' + xhr.status + ')');
        if (msg === 'Invalid firmware file') msg = 'Invalid firmware file or wrong board build';
        stat.style.color = 'var(--danger)'; stat.textContent = 'Update failed: ' + msg;
        startPolling(currentSection);
      }
    } catch(e) {
      var body = (xhr.responseText || '').replace(/\\s+/g,' ').trim().slice(0,120);
      stat.style.color = 'var(--danger)';
      stat.textContent = 'Update failed: HTTP ' + xhr.status + (body ? ' — ' + body : ' — empty response');
      startPolling(currentSection);
    }
  };
  xhr.onerror = function(){
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed: upload interrupted or connection lost';
    startPolling(currentSection);
  };
  xhr.ontimeout = function(){
    stat.style.color = 'var(--danger)';
    stat.textContent = 'Update failed: upload timed out';
    startPolling(currentSection);
  };
'''
    text = replace_once(text, old_onload, new_onload, "OTA response diagnostics")

    p.write_text(text, encoding="utf-8")


def patch_system_screen(repo: Path) -> None:
    p = repo / "src" / "smart_hub.cpp"
    text = p.read_text(encoding="utf-8")

    old = '''  tft.setTextColor(dispSettings.statusOkColor, dispSettings.bgColor);
  char auth[48];
  snprintf(auth, sizeof(auth), "%s / %s",
           securityUsername(), securityPortalCode());
  tft.drawString(auth, tft.width() / 2, 395);

  setFont(tft, FONT_SMALL);
  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  tft.drawString("Digest auth + same-origin protection", tft.width() / 2, 418);
'''
    new = '''  tft.setTextColor(dispSettings.statusOkColor, dispSettings.bgColor);
  char auth[48];
  snprintf(auth, sizeof(auth), "PORTAL CODE  %s", securityPortalCode());
  tft.drawString(auth, tft.width() / 2, 395);

  setFont(tft, FONT_SMALL);
  tft.setTextColor(CLR_TEXT_DIM, dispSettings.bgColor);
  tft.drawString("Session auth + same-origin protection", tft.width() / 2, 418);
'''
    text = replace_once(text, old, new, "System login UX")
    p.write_text(text, encoding="utf-8")


def validate(repo: Path) -> None:
    security = (repo / "src" / "security_manager.cpp").read_text(encoding="utf-8")
    web = (repo / "src" / "web_server.cpp").read_text(encoding="utf-8")
    app = (repo / "web" / "app.js").read_text(encoding="utf-8")
    hub = (repo / "src" / "smart_hub.cpp").read_text(encoding="utf-8")

    required = [
        (security, "BHSESSION"),
        (security, "SameSite=Strict"),
        (security, "securitySessionValid"),
        (web, 'PUBLIC_GET("/login", handlePortalLoginPage);'),
        (web, 'PUBLIC_POST("/login", handlePortalLoginSubmit);'),
        (web, '"Cookie"'),
        (app, "stopPolling();"),
        (app, "xhr.withCredentials = true;"),
        (hub, "PORTAL CODE"),
        (hub, "Session auth + same-origin protection"),
    ]
    for body, needle in required:
        if needle not in body:
            raise PatchError(f"RC3 validation missing: {needle}")

    forbidden = [
        (security, "requestAuthentication"),
        (web, "requestAuthentication("),
        (hub, "Digest auth + same-origin protection"),
    ]
    for body, needle in forbidden:
        if needle in body:
            raise PatchError(f"RC3 validation forbidden string remains: {needle}")


def apply(repo: Path) -> None:
    patch_security(repo)
    patch_web_server(repo)
    patch_web_app(repo)
    patch_system_screen(repo)
    validate(repo)


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply Smart Home v8.3 RC3 session-auth + OTA reliability hotfix")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v8.3 RC3 session auth + OTA reliability patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
