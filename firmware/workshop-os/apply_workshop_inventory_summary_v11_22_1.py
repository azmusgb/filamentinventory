#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


MARKER = "Workshop OS v11.22.1 Inventory Summary RC1"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one anchor, found {count}"
        )
    return text.replace(old, new, 1)


def replace_count(
    text: str,
    old: str,
    new: str,
    expected: int,
    label: str,
) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{label}: expected exactly {expected} anchors, found {count}"
        )
    return text.replace(old, new)


def apply(repo: Path) -> None:
    hub_path = repo / "src" / "smart_hub.cpp"
    web_path = repo / "src" / "web_server.cpp"
    header_path = repo / "include" / "smart_hub.h"
    if not header_path.exists():
        header_path = repo / "src" / "smart_hub.h"

    build_path = repo / "include" / "smart_home_build.h"

    for path in (hub_path, web_path, header_path, build_path):
        if not path.exists():
            raise SystemExit(f"missing reconstructed source: {path}")

    hub = hub_path.read_text(encoding="utf-8")
    web = web_path.read_text(encoding="utf-8")
    header = header_path.read_text(encoding="utf-8")
    build = build_path.read_text(encoding="utf-8")

    if MARKER in hub:
        if 'SMART_HOME_VERSION "v11.22.1"' not in build:
            raise SystemExit(
                "inventory marker exists but build identity is not v11.22.1"
            )
        print("v11.22.1 Inventory Summary already applied")
        return

    if 'SMART_HOME_VERSION "v11.22"' not in build:
        raise SystemExit(
            "v11.22.1 patch requires reconstructed v11.22 source"
        )

    # ------------------------------------------------------------------
    # Build identity
    # ------------------------------------------------------------------
    build = replace_once(
        build,
        '#define SMART_HOME_VERSION "v11.22"',
        '#define SMART_HOME_VERSION "v11.22.1"',
        "version",
    )
    build = replace_once(
        build,
        '#define SMART_HOME_PROFILE "display-expert"',
        '#define SMART_HOME_PROFILE "inventory-summary"',
        "profile",
    )
    build = replace_once(
        build,
        '#define SMART_HOME_BUILD_LABEL "Smart Home v11.22 Display Expert RC1"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.22.1 Inventory Summary RC1"',
        "build label",
    )

    # ------------------------------------------------------------------
    # TLS CA bundle
    # ------------------------------------------------------------------
    hub = replace_once(
        hub,
        '#include <ctype.h>\n',
        '''#include <ctype.h>

extern const uint8_t rootca_crt_bundle_start[]
    asm("_binary_x509_crt_bundle_start");
''',
        "CA declaration",
    )

    # ------------------------------------------------------------------
    # Inventory state/config
    # ------------------------------------------------------------------
    state_block = r'''
// ---------------------------------------------------------------------------
// Workshop OS v11.22.1 Inventory Summary RC1
// Filament Inventory remains authoritative. Bambu AMS telemetry is never
// translated into canonical spool identity, quantity or placement.
// ---------------------------------------------------------------------------
enum InventoryFeedState : uint8_t {
  INV_NOT_CONFIGURED = 0,
  INV_LOADING,
  INV_CURRENT,
  INV_STALE,
  INV_OFFLINE,
  INV_AUTH_ERROR,
  INV_HTTP_ERROR,
  INV_INVALID_RESPONSE,
  INV_UNSUPPORTED_CONTRACT
};

struct InventorySummaryState {
  InventoryFeedState state;
  uint32_t spools;
  uint32_t loaded;
  uint32_t low;
  uint32_t unknown;
  uint32_t queue;
  int httpCode;
  unsigned long fetchedAtMs;
};

struct InventoryFeedConfig {
  char url[192];
  char profile[12];
  char syncKey[129];
};

InventoryFeedConfig g_inventoryCfg = {};
InventorySummaryState g_inventory = {};
bool g_inventoryView = false;
unsigned long g_inventoryLastAttemptMs = 0;

static const uint32_t INVENTORY_HTTP_LIMIT = 4096;
static const uint32_t INVENTORY_REFRESH_MS = 60000UL;

static bool inventoryProfileValid(const char* profile) {
  return profile &&
      (strcmp(profile, "Bill") == 0 || strcmp(profile, "Aimee") == 0);
}

static bool inventoryKeyValid(const char* key) {
  if (!key) return false;
  const size_t n = strlen(key);
  if (n < 32 || n > 128) return false;
  for (size_t i = 0; i < n; ++i) {
    const char c = key[i];
    if (!(isalnum((unsigned char)c) || c == '_' || c == '-'))
      return false;
  }
  return true;
}

static bool inventoryUrlValid(const char* url) {
  return url && strncmp(url, "https://", 8) == 0;
}

static bool inventoryConfigured() {
  return inventoryUrlValid(g_inventoryCfg.url) &&
         inventoryProfileValid(g_inventoryCfg.profile) &&
         inventoryKeyValid(g_inventoryCfg.syncKey);
}

static const char* inventoryStateLabel() {
  switch (g_inventory.state) {
    case INV_LOADING: return "LOADING";
    case INV_CURRENT: return "CURRENT";
    case INV_STALE: return "STALE";
    case INV_OFFLINE: return "OFFLINE";
    case INV_AUTH_ERROR: return "AUTH ERROR";
    case INV_HTTP_ERROR: return "UNAVAILABLE";
    case INV_INVALID_RESPONSE: return "INVALID";
    case INV_UNSUPPORTED_CONTRACT: return "UNSUPPORTED";
    default: return "NOT CONFIGURED";
  }
}

static void inventorySetFailure(InventoryFeedState state, int code = 0) {
  // Do not overwrite authoritative values with synthetic zeroes.
  // The UI renders counts only for CURRENT or STALE.
  g_inventory.state = state;
  g_inventory.httpCode = code;
  g_inventory.fetchedAtMs = millis();
  g_dirty = true;
}

static bool inventoryJsonUnsigned(JsonVariantConst value, uint32_t& out) {
  if (!value.is<uint32_t>() &&
      !value.is<unsigned long>() &&
      !value.is<unsigned int>() &&
      !value.is<int>()) return false;

  const long long n = value.as<long long>();
  if (n < 0 || n > 0xFFFFFFFFLL) return false;
  out = (uint32_t)n;
  return true;
}

static bool parseInventoryPayload(const String& body, int httpCode) {
  if (body.length() == 0 || body.length() > INVENTORY_HTTP_LIMIT) {
    inventorySetFailure(INV_INVALID_RESPONSE, httpCode);
    return false;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err || !doc.is<JsonObject>()) {
    inventorySetFailure(INV_INVALID_RESPONSE, httpCode);
    return false;
  }

  if (!doc["contractVersion"].is<int>()) {
    inventorySetFailure(INV_INVALID_RESPONSE, httpCode);
    return false;
  }

  if (doc["contractVersion"].as<int>() != 1) {
    inventorySetFailure(INV_UNSUPPORTED_CONTRACT, httpCode);
    return false;
  }

  if (!doc["stale"].is<bool>() || !doc["summary"].is<JsonObject>()) {
    inventorySetFailure(INV_INVALID_RESPONSE, httpCode);
    return false;
  }

  JsonObjectConst summary = doc["summary"].as<JsonObjectConst>();
  uint32_t spools, loaded, low, unknown, queue;

  if (!inventoryJsonUnsigned(summary["spools"], spools) ||
      !inventoryJsonUnsigned(summary["loaded"], loaded) ||
      !inventoryJsonUnsigned(summary["low"], low) ||
      !inventoryJsonUnsigned(summary["unknown"], unknown) ||
      !inventoryJsonUnsigned(summary["queue"], queue)) {
    inventorySetFailure(INV_INVALID_RESPONSE, httpCode);
    return false;
  }

  InventorySummaryState next = {};
  next.state = doc["stale"].as<bool>() ? INV_STALE : INV_CURRENT;
  next.spools = spools;
  next.loaded = loaded;
  next.low = low;
  next.unknown = unknown;
  next.queue = queue;
  next.httpCode = httpCode;
  next.fetchedAtMs = millis();

  // Publish only after the entire response has passed validation.
  g_inventory = next;
  g_dirty = true;
  return true;
}

static void fetchInventorySummary() {
  if (!inventoryConfigured()) {
    inventorySetFailure(INV_NOT_CONFIGURED);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    inventorySetFailure(INV_OFFLINE);
    return;
  }

  g_inventory.state = INV_LOADING;
  g_dirty = true;

  WiFiClientSecure client;
  client.setCACertBundle(rootca_crt_bundle_start);

  HTTPClient http;
  http.setConnectTimeout(3500);
  http.setTimeout(5000);

  if (!http.begin(client, String(g_inventoryCfg.url))) {
    inventorySetFailure(INV_HTTP_ERROR);
    return;
  }

  http.addHeader("X-Filament-Sync-Key", g_inventoryCfg.syncKey);
  http.addHeader("X-Filament-Profile", g_inventoryCfg.profile);

  const int code = http.GET();

  if (code == 401 || code == 403) {
    http.end();
    inventorySetFailure(INV_AUTH_ERROR, code);
    return;
  }

  if (code != 200) {
    http.end();
    inventorySetFailure(INV_HTTP_ERROR, code);
    return;
  }

  const int contentLength = http.getSize();
  if (contentLength > (int)INVENTORY_HTTP_LIMIT) {
    http.end();
    inventorySetFailure(INV_INVALID_RESPONSE, code);
    return;
  }

  String body = http.getString();
  http.end();
  parseInventoryPayload(body, code);
}

'''

    hub = replace_once(
        hub,
        'bool g_audioSettingsView = false;\nuint8_t g_audioSettingsPage = 0;\n',
        '''bool g_audioSettingsView = false;
uint8_t g_audioSettingsPage = 0;
''' + state_block,
        "inventory state insertion",
    )

    # ------------------------------------------------------------------
    # NVS persistence
    # ------------------------------------------------------------------
    hub = replace_once(
        hub,
        '''  String note = p.getString("note", "");
  safeCopy(g_workshopNote, sizeof(g_workshopNote), note.c_str());
''',
        '''  String note = p.getString("note", "");
  safeCopy(g_workshopNote, sizeof(g_workshopNote), note.c_str());

  String invUrl = p.getString("invUrl", "");
  String invProfile = p.getString("invProfile", "");
  String invKey = p.getString("invKey", "");
  safeCopy(g_inventoryCfg.url, sizeof(g_inventoryCfg.url), invUrl.c_str());
  safeCopy(g_inventoryCfg.profile, sizeof(g_inventoryCfg.profile), invProfile.c_str());
  safeCopy(g_inventoryCfg.syncKey, sizeof(g_inventoryCfg.syncKey), invKey.c_str());
  if (!inventoryConfigured()) g_inventory.state = INV_NOT_CONFIGURED;
''',
        "inventory NVS load",
    )

    hub = replace_once(
        hub,
        '''  p.putString("note", g_workshopNote);
  p.putUShort("timerMin", g_timerPresets[0]); // preserve the v11.1 key
''',
        '''  p.putString("note", g_workshopNote);
  p.putString("invUrl", g_inventoryCfg.url);
  p.putString("invProfile", g_inventoryCfg.profile);
  p.putString("invKey", g_inventoryCfg.syncKey);
  p.putUShort("timerMin", g_timerPresets[0]); // preserve the v11.1 key
''',
        "inventory NVS save",
    )

    # ------------------------------------------------------------------
    # Workshop subview geometry + rendering
    # ------------------------------------------------------------------
    draw_block = r'''
static HubRect hubInventoryBackRect() {
  const int16_t W = tft.width();
  if (hubLandscape()) return hr(8, 216, 132, 48);
  const int16_t g=8,m=18,w=(W-2*m-g)/2;
  return hr(m, 367, w, 46);
}

static HubRect hubInventoryRefreshRect() {
  const int16_t W = tft.width();
  if (hubLandscape()) return hr(W-140, 216, 132, 48);
  const int16_t g=8,m=18,w=(W-2*m-g)/2;
  return hr(m+w+g, 367, w, 46);
}

static void drawInventoryMetric(const HubRect& r,
                                const char* label,
                                uint32_t value,
                                uint16_t accent) {
  uiCard(r.x,r.y,r.w,r.h,accent,false);
  uiDrawFit(label,r.x+10,r.y+10,r.w-20,FONT_SMALL,TL_DATUM,accent,UI_PANEL);
  char valueText[16];
  snprintf(valueText,sizeof(valueText),"%lu",(unsigned long)value);
  uiDrawFit(valueText,r.x+10,r.y+31,r.w-20,FONT_LARGE,TL_DATUM,UI_TEXT,UI_PANEL);
}

static void drawInventorySummary(bool full) {
  (void)full;
  const int16_t W=tft.width();
  tft.fillScreen(UI_BG);
  drawHeader("FILAMENT INVENTORY",inventoryStateLabel(),2);
  uiBottomNav(2,nullptr);

  const bool valuesValid =
      g_inventory.state == INV_CURRENT || g_inventory.state == INV_STALE;

  if (!valuesValid) {
    HubRect card = hubLandscape()
        ? hr(8,48,W-16,150)
        : hr(8,60,W-16,270);

    uint16_t accent = UI_AMBER;
    if (g_inventory.state == INV_AUTH_ERROR ||
        g_inventory.state == INV_INVALID_RESPONSE ||
        g_inventory.state == INV_UNSUPPORTED_CONTRACT)
      accent = UI_RED;
    else if (g_inventory.state == INV_OFFLINE)
      accent = UI_DIM;

    uiCard(card.x,card.y,card.w,card.h,accent,true);
    uiSectionLabel(card.x+12,card.y+12,"INVENTORY FEED",accent,card.w-24);

    const char* title = inventoryStateLabel();
    const char* detail = "Counts unavailable";

    switch (g_inventory.state) {
      case INV_NOT_CONFIGURED:
        detail = "Configure the secure inventory feed in the local portal";
        break;
      case INV_LOADING:
        detail = "Reading authoritative inventory summary";
        break;
      case INV_OFFLINE:
        detail = "Wi-Fi unavailable; no cached values shown as current";
        break;
      case INV_AUTH_ERROR:
        detail = "Inventory credential or profile was rejected";
        break;
      case INV_HTTP_ERROR:
        detail = "Inventory service is unavailable";
        break;
      case INV_INVALID_RESPONSE:
        detail = "Feed response failed validation";
        break;
      case INV_UNSUPPORTED_CONTRACT:
        detail = "Device does not support this feed contract";
        break;
      default:
        break;
    }

    uiDrawFit(title,card.x+12,card.y+53,card.w-24,FONT_LARGE,TL_DATUM,
              accent,UI_PANEL);
    uiDrawFit(detail,card.x+12,card.y+91,card.w-24,FONT_BODY,TL_DATUM,
              UI_DIM,UI_PANEL);
  } else if (hubLandscape()) {
    const int16_t m=8,g=7;
    const int16_t cw=(W-2*m-4*g)/5;
    const int16_t y=58,h=122;

    drawInventoryMetric(hr(m+0*(cw+g),y,cw,h),
                        "SPOOLS",g_inventory.spools,UI_BLUE);
    drawInventoryMetric(hr(m+1*(cw+g),y,cw,h),
                        "LOADED",g_inventory.loaded,UI_GREEN);
    drawInventoryMetric(hr(m+2*(cw+g),y,cw,h),
                        "LOW",g_inventory.low,
                        g_inventory.low?UI_AMBER:UI_GREEN);
    drawInventoryMetric(hr(m+3*(cw+g),y,cw,h),
                        "UNKNOWN",g_inventory.unknown,
                        g_inventory.unknown?UI_AMBER:UI_GREEN);
    drawInventoryMetric(hr(m+4*(cw+g),y,cw,h),
                        "QUEUE",g_inventory.queue,UI_PURPLE);

    if (g_inventory.state == INV_STALE) {
      uiDrawFit("Authoritative feed is stale",
                12,190,W-24,FONT_SMALL,TL_DATUM,UI_AMBER,UI_BG);
    }
  } else {
    const int16_t m=12,g=8,cw=(W-2*m-g)/2,ch=92;
    drawInventoryMetric(hr(m,62,cw,ch),
                        "SPOOLS",g_inventory.spools,UI_BLUE);
    drawInventoryMetric(hr(m+cw+g,62,cw,ch),
                        "LOADED",g_inventory.loaded,UI_GREEN);
    drawInventoryMetric(hr(m,162,cw,ch),
                        "LOW",g_inventory.low,
                        g_inventory.low?UI_AMBER:UI_GREEN);
    drawInventoryMetric(hr(m+cw+g,162,cw,ch),
                        "UNKNOWN",g_inventory.unknown,
                        g_inventory.unknown?UI_AMBER:UI_GREEN);
    drawInventoryMetric(hr(m,262,W-2*m,82),
                        "QUEUE",g_inventory.queue,UI_PURPLE);
  }

  uiActionButton(hubInventoryBackRect(),"BACK",UI_DIM);
  uiActionButton(hubInventoryRefreshRect(),"REFRESH",UI_CYAN);

  hubMarkFrameDirty();
  g_dirty=false;
}

'''

    hub = replace_once(
        hub,
        'static void drawWorkshop(bool full) {\n',
        draw_block + 'static void drawWorkshop(bool full) {\n',
        "inventory draw insertion",
    )

    hub = replace_once(
        hub,
        '''static void drawWorkshop(bool full) {
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);''',
        '''static void drawWorkshop(bool full) {
  if(g_inventoryView){drawInventorySummary(full);return;}
  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);''',
        "Workshop inventory dispatch",
    )

    # Replace the duplicated Workshop LIGHT action in both portrait
    # and landscape layouts. Exactly two occurrences are expected.
    hub = replace_count(
        hub,
        '''const char* lab=i==0?(s.lightState==1?"LIGHT OFF":"LIGHT ON"):i==1?''',
        '''const char* lab=i==0?"INVENTORY":i==1?''',
        2,
        "Workshop inventory labels",
    )

    hub = replace_count(
        hub,
        '''const uint16_t c=i==0?UI_AMBER:i==1?''',
        '''const uint16_t c=i==0?UI_PURPLE:i==1?''',
        2,
        "Workshop inventory colors",
    )

    # ------------------------------------------------------------------
    # Subview ownership / navigation
    # ------------------------------------------------------------------
    hub = replace_once(
        hub,
        '''if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; g_displayExperiencePage = 0; }
  if (s != SCREEN_HUB_SYSTEM)''',
        '''if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; g_displayExperiencePage = 0; }
  if (s != SCREEN_HUB_WORKSHOP) g_inventoryView = false;
  if (s != SCREEN_HUB_SYSTEM)''',
        "inventory subview ownership",
    )

    old_touch = '''if(cur==SCREEN_HUB_WORKSHOP){for(uint8_t i=0;i<4;i++)if(hubWorkshopActionRect(i).contains(x,y)){if(i==0&&isAnyPrinterConfigured()){BambuState&s=displayedPrinter().state;if(s.connected){requestLightCommand(rotState.displayIndex,s.lightState!=1);buzzerPlay(BUZZ_CLICK);}g_dirty=true;}else if(i==1){setPage(SCREEN_HUB_MORE);g_displayExperienceView=false;g_toolsView=true;g_dirty=true;}else if(i==2)setPage(SCREEN_HUB_SYSTEM);else if(i==3)setPage(SCREEN_HUB_PRINTER);return true;}return true;}'''

    new_touch = '''if(cur==SCREEN_HUB_WORKSHOP){
    if(g_inventoryView){
      if(hubInventoryBackRect().contains(x,y)){
        g_inventoryView=false;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;
      }
      if(hubInventoryRefreshRect().contains(x,y)){
        g_inventoryLastAttemptMs=millis();
        fetchInventorySummary();
        buzzerPlay(BUZZ_CLICK);
        return true;
      }
      return true;
    }
    for(uint8_t i=0;i<4;i++)if(hubWorkshopActionRect(i).contains(x,y)){
      if(i==0){
        g_inventoryView=true;
        g_inventoryLastAttemptMs=0;
        g_dirty=true;
        if(g_inventory.fetchedAtMs==0) fetchInventorySummary();
      }else if(i==1){
        setPage(SCREEN_HUB_MORE);
        g_displayExperienceView=false;
        g_toolsView=true;
        g_dirty=true;
      }else if(i==2)setPage(SCREEN_HUB_SYSTEM);
      else if(i==3)setPage(SCREEN_HUB_PRINTER);
      return true;
    }
    return true;
  }'''

    hub = replace_once(
        hub,
        old_touch,
        new_touch,
        "Workshop touch routing",
    )

    # ------------------------------------------------------------------
    # Background refresh
    # ------------------------------------------------------------------
    service_anchor = '''void smartHubService() {
  if (!g_initialized) smartHubInit();
  unsigned long now = millis();
'''

    service_new = '''void smartHubService() {
  if (!g_initialized) smartHubInit();
  unsigned long now = millis();

  if (inventoryConfigured()) {
    const bool visible =
        getScreenState() == SCREEN_HUB_WORKSHOP && g_inventoryView;
    const bool due =
        g_inventory.fetchedAtMs == 0 ||
        now - g_inventory.fetchedAtMs >= INVENTORY_REFRESH_MS;
    const bool attemptReady =
        g_inventoryLastAttemptMs == 0 ||
        now - g_inventoryLastAttemptMs >= INVENTORY_REFRESH_MS;

    if (visible && due && attemptReady) {
      g_inventoryLastAttemptMs = now;
      fetchInventorySummary();
    }
  }
'''

    hub = replace_once(
        hub,
        service_anchor,
        service_new,
        "inventory service",
    )

    # ------------------------------------------------------------------
    # Public config/status API in smart_hub
    # ------------------------------------------------------------------
    api_block = r'''
bool smartHubInventorySaveConfig(const char* url,
                                 const char* profile,
                                 const char* syncKey,
                                 bool preserveExistingKey) {
  if (url && *url && !inventoryUrlValid(url)) return false;
  if (profile && *profile && !inventoryProfileValid(profile)) return false;

  if (!preserveExistingKey) {
    if (syncKey && *syncKey && !inventoryKeyValid(syncKey)) return false;
    safeCopy(g_inventoryCfg.syncKey,sizeof(g_inventoryCfg.syncKey),syncKey);
  }

  safeCopy(g_inventoryCfg.url,sizeof(g_inventoryCfg.url),url);
  safeCopy(g_inventoryCfg.profile,sizeof(g_inventoryCfg.profile),profile);

  if (!inventoryConfigured())
    g_inventory.state = INV_NOT_CONFIGURED;

  g_inventoryLastAttemptMs=0;
  g_inventory.fetchedAtMs=0;
  g_dirty=true;
  return prefsSave();
}

bool smartHubInventoryConfigured() {
  return inventoryConfigured();
}

bool smartHubInventoryCredentialConfigured() {
  return inventoryKeyValid(g_inventoryCfg.syncKey);
}

const char* smartHubInventoryUrl() {
  return g_inventoryCfg.url;
}

const char* smartHubInventoryProfile() {
  return g_inventoryCfg.profile;
}

const char* smartHubInventoryStatus() {
  return inventoryStateLabel();
}

int smartHubInventoryHttpCode() {
  return g_inventory.httpCode;
}

bool smartHubInventoryRefresh() {
  g_inventoryLastAttemptMs=millis();
  fetchInventorySummary();
  return g_inventory.state == INV_CURRENT ||
         g_inventory.state == INV_STALE;
}

'''

    hub = replace_once(
        hub,
        '''const SmartHubConfig& smartHubGetConfig() {
  return g_cfg;
}
''',
        api_block + '''const SmartHubConfig& smartHubGetConfig() {
  return g_cfg;
}
''',
        "inventory public API",
    )

    # Non-WS350 stubs.
    hub = replace_once(
        hub,
        '''const SmartHubConfig& smartHubGetConfig() { return g_cfg; }
bool smartHubSaveConfig(bool, const char*, uint16_t, uint16_t) { return false; }
''',
        '''bool smartHubInventorySaveConfig(const char*, const char*, const char*, bool) { return false; }
bool smartHubInventoryConfigured() { return false; }
bool smartHubInventoryCredentialConfigured() { return false; }
const char* smartHubInventoryUrl() { return ""; }
const char* smartHubInventoryProfile() { return ""; }
const char* smartHubInventoryStatus() { return "Not available"; }
int smartHubInventoryHttpCode() { return 0; }
bool smartHubInventoryRefresh() { return false; }
const SmartHubConfig& smartHubGetConfig() { return g_cfg; }
bool smartHubSaveConfig(bool, const char*, uint16_t, uint16_t) { return false; }
''',
        "inventory non-WS350 stubs",
    )

    # ------------------------------------------------------------------
    # Header declarations
    # ------------------------------------------------------------------
    header = replace_once(
        header,
        '''const char* smartHubCustomStatus();
bool smartHubCustomHealthy();
''',
        '''const char* smartHubCustomStatus();
bool smartHubCustomHealthy();

bool smartHubInventorySaveConfig(const char* url,
                                 const char* profile,
                                 const char* syncKey,
                                 bool preserveExistingKey);
bool smartHubInventoryConfigured();
bool smartHubInventoryCredentialConfigured();
const char* smartHubInventoryUrl();
const char* smartHubInventoryProfile();
const char* smartHubInventoryStatus();
int smartHubInventoryHttpCode();
bool smartHubInventoryRefresh();
''',
        "inventory header API",
    )

    # ------------------------------------------------------------------
    # Secure local portal handlers.
    # Credential is write-only: GET exposes only configured=true/false.
    # ------------------------------------------------------------------
    web_handlers = r'''
static void handleHubInventoryGet() {
  JsonDocument doc;
  doc["available"] = smartHubAvailable();
  doc["configured"] = smartHubInventoryConfigured();
  doc["credentialConfigured"] = smartHubInventoryCredentialConfigured();
  doc["url"] = smartHubInventoryUrl();
  doc["profile"] = smartHubInventoryProfile();
  doc["status"] = smartHubInventoryStatus();
  doc["httpCode"] = smartHubInventoryHttpCode();

  String out;
  serializeJson(doc,out);
  server.sendHeader("Cache-Control","no-store");
  server.send(200,"application/json",out);
}

static void handleHubInventorySave() {
  if (!smartHubAvailable()) {
    server.send(
        400,"application/json",
        "{\"status\":\"error\",\"message\":\"Workshop inventory is unavailable on this board\"}");
    return;
  }

  String url = server.hasArg("url") ? server.arg("url") : "";
  String profile = server.hasArg("profile") ? server.arg("profile") : "";
  const bool hasKey = server.hasArg("key");
  String key = hasKey ? server.arg("key") : "";

  if (!smartHubInventorySaveConfig(
          url.c_str(),
          profile.c_str(),
          key.c_str(),
          !hasKey)) {
    server.send(
        400,"application/json",
        "{\"status\":\"error\",\"message\":\"Use HTTPS, Bill or Aimee, and a valid private credential\"}");
    return;
  }

  server.sendHeader("Cache-Control","no-store");
  server.send(200,"application/json","{\"status\":\"ok\"}");
}

static void handleHubInventoryRefresh() {
  const bool ok = smartHubInventoryRefresh();
  JsonDocument doc;
  doc["status"] = ok ? "ok" : "error";
  doc["inventoryStatus"] = smartHubInventoryStatus();
  doc["httpCode"] = smartHubInventoryHttpCode();
  String out;
  serializeJson(doc,out);
  server.sendHeader("Cache-Control","no-store");
  server.send(ok ? 200 : 503,"application/json",out);
}

'''

    web = replace_once(
        web,
        '''static void handleHubShow() {
''',
        web_handlers + '''static void handleHubShow() {
''',
        "inventory portal handlers",
    )

    web = replace_once(
        web,
        '''  SECURE_GET("/hub/config", handleHubConfigGet);
  SECURE_POST("/hub/config", handleHubConfigSave);
''',
        '''  SECURE_GET("/hub/config", handleHubConfigGet);
  SECURE_POST("/hub/config", handleHubConfigSave);
  SECURE_GET("/hub/inventory", handleHubInventoryGet);
  SECURE_POST("/hub/inventory", handleHubInventorySave);
  SECURE_POST("/hub/inventory/refresh", handleHubInventoryRefresh);
''',
        "inventory portal routes",
    )

    # Marker is intentionally placed in generated firmware source so the
    # patcher remains idempotent.
    hub += f'\n// {MARKER}\n'

    hub_path.write_text(hub, encoding="utf-8")
    web_path.write_text(web, encoding="utf-8")
    header_path.write_text(header, encoding="utf-8")
    build_path.write_text(build, encoding="utf-8")

    print(f"Applied {MARKER}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="upstream")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not args.apply:
        raise SystemExit("pass --apply to modify reconstructed source")

    apply(Path(args.repo).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
