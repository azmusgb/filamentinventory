#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Smart Home v11.23 physical Network / Locale / Layout Expert controls"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"{label}: start anchor missing")
    b = text.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f"{label}: end anchor missing")
    if text.find(start, a + 1) >= 0:
        raise SystemExit(f"{label}: start anchor is not unique")
    return text[:a] + replacement + text[b:]


NETWORK_EXPERT = r'''// ---------------------------------------------------------------------------
// Smart Home v11.23 physical Network / Locale / Layout Expert controls
// ---------------------------------------------------------------------------
static const uint8_t HUB_NETWORK_PAGE_COUNT = 4;
uint8_t g_networkSettingsPage = 0;
bool g_networkEditLoaded = false;
bool g_networkEditDhcp = true;
uint8_t g_networkEditField = 0;
uint8_t g_networkEditOctet = 0;
uint8_t g_networkEditValues[4][4] = {{0}};

static bool hubIpv4AllZero(const uint8_t v[4]) {
  return v[0] == 0 && v[1] == 0 && v[2] == 0 && v[3] == 0;
}

static bool hubParseIpv4(const char* text, uint8_t out[4]) {
  if (!text || !text[0]) return false;
  unsigned a=0,b=0,c=0,d=0; char tail=0;
  if (sscanf(text, "%u.%u.%u.%u%c", &a,&b,&c,&d,&tail) != 4) return false;
  if (a>255 || b>255 || c>255 || d>255) return false;
  out[0]=(uint8_t)a; out[1]=(uint8_t)b; out[2]=(uint8_t)c; out[3]=(uint8_t)d;
  return true;
}

static void hubIpv4FromAddress(const IPAddress& ip, uint8_t out[4]) {
  for (uint8_t i=0;i<4;i++) out[i]=ip[i];
}

static void hubFormatIpv4(const uint8_t v[4], char* out, size_t len) {
  snprintf(out,len,"%u.%u.%u.%u",v[0],v[1],v[2],v[3]);
}

static void hubLoadNetworkEdit() {
  g_networkEditDhcp = netSettings.useDHCP;
  const char* stored[4] = {netSettings.staticIP,netSettings.gateway,netSettings.subnet,netSettings.dns};
  for(uint8_t i=0;i<4;i++) {
    if(hubParseIpv4(stored[i],g_networkEditValues[i])) continue;
    if(WiFi.status()==WL_CONNECTED) {
      if(i==0) hubIpv4FromAddress(WiFi.localIP(),g_networkEditValues[i]);
      else if(i==1) hubIpv4FromAddress(WiFi.gatewayIP(),g_networkEditValues[i]);
      else if(i==2) hubIpv4FromAddress(WiFi.subnetMask(),g_networkEditValues[i]);
      else hubIpv4FromAddress(WiFi.dnsIP(),g_networkEditValues[i]);
    } else memset(g_networkEditValues[i],0,4);
  }
  g_networkEditField=0;
  g_networkEditOctet=0;
  g_networkEditLoaded=true;
}

static const char* hubNetworkFieldLabel(uint8_t field) {
  static const char* labels[] = {"IP ADDRESS","GATEWAY","SUBNET","DNS"};
  return labels[field%4U];
}

static const char* hubTimezoneLabel() {
  size_t count=0;
  const TimezoneRegion* regions=getSupportedTimezones(&count);
  if(!regions || count==0) return "UNAVAILABLE";
  const uint8_t idx=resolveTimezoneIndex(netSettings.timezoneStr);
  return regions[idx<count?idx:0].name;
}

static void hubStepTimezone(bool reverse) {
  size_t count=0;
  const TimezoneRegion* regions=getSupportedTimezones(&count);
  if(!regions || count==0) return;
  uint16_t idx=resolveTimezoneIndex(netSettings.timezoneStr);
  idx=reverse?(uint16_t)((idx+count-1U)%count):(uint16_t)((idx+1U)%count);
  netSettings.timezoneIndex=(uint8_t)idx;
  strlcpy(netSettings.timezoneStr,regions[idx].posixString,sizeof(netSettings.timezoneStr));
  saveSettings();
  configTzTime(netSettings.timezoneStr,"pool.ntp.org","time.nist.gov");
  buzzerPlay(BUZZ_CLICK);g_dirty=true;
}

static bool hubStaticNetworkValid() {
  if(g_networkEditDhcp) return true;
  return !hubIpv4AllZero(g_networkEditValues[0]) &&
         !hubIpv4AllZero(g_networkEditValues[1]) &&
         !hubIpv4AllZero(g_networkEditValues[2]);
}

static void hubCommitNetworkAndRestart() {
  if(!hubStaticNetworkValid()) { buzzerPlay(BUZZ_CLICK); g_dirty=true; return; }
  netSettings.useDHCP=g_networkEditDhcp;
  char value[20];
  hubFormatIpv4(g_networkEditValues[0],value,sizeof(value));strlcpy(netSettings.staticIP,value,sizeof(netSettings.staticIP));
  hubFormatIpv4(g_networkEditValues[1],value,sizeof(value));strlcpy(netSettings.gateway,value,sizeof(netSettings.gateway));
  hubFormatIpv4(g_networkEditValues[2],value,sizeof(value));strlcpy(netSettings.subnet,value,sizeof(netSettings.subnet));
  hubFormatIpv4(g_networkEditValues[3],value,sizeof(value));strlcpy(netSettings.dns,value,sizeof(netSettings.dns));
  saveSettings();
  buzzerPlay(BUZZ_CLICK);
  delay(300);
  ESP.restart();
}

static const char* hubRotationLabel() {
  static char value[8];
  snprintf(value,sizeof(value),"R%u",(unsigned)(dispSettings.rotation&3U));
  return value;
}

'''

NETWORK_DRAW = r'''static void drawNetworkEssentials(bool full) {
  (void)full;
  if(!g_networkEditLoaded) hubLoadNetworkEdit();
  const int16_t W=tft.width();
  const uint8_t page=(uint8_t)(g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT);
  tft.fillScreen(UI_BG);
  const char* title=page==0?"ESSENTIALS":page==1?"TIME & LOCALE":page==2?"ADDRESS EDIT":"REVIEW";
  drawHeader("NETWORK",title,3);
  uiBottomNav(3,nullptr);

  if(page==0) {
    char mdnsDetail[48];
    if(netSettings.mdnsEnabled) snprintf(mdnsDetail,sizeof(mdnsDetail),"%s.local • restart applies",netSettings.hostname);
    else strlcpy(mdnsDetail,"Local hostname advertisement off",sizeof(mdnsDetail));
    uiDisplaySettingCard(hubMoreRect(0),"STARTUP IP",netSettings.showIPAtStartup?"ON":"OFF","Show IP after Wi-Fi connects",UI_BLUE);
    uiDisplaySettingCard(hubMoreRect(1),"CLOCK FORMAT",netSettings.use24h?"24 HOUR":"12 HOUR","Display time convention",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"DATE FORMAT",hubDateFormatLabel(netSettings.dateFormat),"Tap next / hold previous",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"mDNS",netSettings.mdnsEnabled?"ON":"OFF",mdnsDetail,UI_GREEN);
  } else if(page==1) {
    uiDisplaySettingCard(hubMoreRect(0),"TIMEZONE",hubTimezoneLabel(),"Tap next / hold previous",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"CLOCK FORMAT",netSettings.use24h?"24 HOUR":"12 HOUR","Local clock convention",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"DATE FORMAT",hubDateFormatLabel(netSettings.dateFormat),"Tap next / hold previous",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"HOSTNAME","PORTAL","Free text stays browser-only",UI_GREEN,false);
  } else if(page==2) {
    char octet[20];
    snprintf(octet,sizeof(octet),"%s · %u/4",hubNetworkFieldLabel(g_networkEditField),(unsigned)g_networkEditOctet+1U);
    char value[8];snprintf(value,sizeof(value),"%u",(unsigned)g_networkEditValues[g_networkEditField][g_networkEditOctet]);
    uiDisplaySettingCard(hubMoreRect(0),"IP ASSIGNMENT",g_networkEditDhcp?"DHCP":"STATIC","Stage only • apply from Review",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"FIELD",hubNetworkFieldLabel(g_networkEditField),"Tap next / hold previous",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"OCTET",octet,"Tap next / hold previous",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"VALUE",value,"Tap +1 / hold +10",UI_GREEN);
  } else {
    char ip[20],gw[20],sn[20],dns[20];
    hubFormatIpv4(g_networkEditValues[0],ip,sizeof(ip));hubFormatIpv4(g_networkEditValues[1],gw,sizeof(gw));
    hubFormatIpv4(g_networkEditValues[2],sn,sizeof(sn));hubFormatIpv4(g_networkEditValues[3],dns,sizeof(dns));
    uiDisplaySettingCard(hubMoreRect(0),g_networkEditDhcp?"MODE":"IP",g_networkEditDhcp?"DHCP":ip,g_networkEditDhcp?"Addressing provided by network":"Staged static address",UI_ORANGE);
    uiDisplaySettingCard(hubMoreRect(1),"GATEWAY",g_networkEditDhcp?"AUTO":gw,"Staged gateway",UI_CYAN);
    uiDisplaySettingCard(hubMoreRect(2),"SUBNET",g_networkEditDhcp?"AUTO":sn,"Staged subnet",UI_PURPLE);
    uiDisplaySettingCard(hubMoreRect(3),"DNS",g_networkEditDhcp?"AUTO":dns,hubStaticNetworkValid()?"Hold bottom button to apply + restart":"Static values incomplete",hubStaticNetworkValid()?UI_GREEN:UI_RED,hubStaticNetworkValid());
  }

  HubRect pager=hubDisplayPagerRect();
  if(hubLandscape()) {
    uiPanelFill(8,210,W-156,54);
    const char* detail=page==0?"Timezone and guarded addressing are available on next pages":page==1?"Timezone applies immediately • credentials remain portal-only":page==2?"Edit staged numeric address • nothing changes until Review": "Short press cycles • HOLD to save network + reboot";
    uiDrawFit(detail,20,237,W-184,FONT_SMALL,ML_DATUM,UI_DIM,UI_PANEL_2);
  } else {
    uiPanelFill(10,306,W-20,108);
    uiDrawFit("NETWORK EXPERT",20,319,W-40,FONT_SMALL,TL_DATUM,UI_BLUE,UI_PANEL_2);
    uiDrawFit(page==3?"HOLD to save network + reboot":"Physical numeric settings • secrets stay in portal",20,344,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);
  }
  uiActionButton(pager,page==3?"HOLD APPLY":"NEXT >",page==3?UI_ORANGE:UI_BLUE);
  hubMarkFrameDirty();g_dirty=false;
}

'''


def apply(repo: Path) -> None:
    hub_path=repo/'src'/'smart_hub.cpp'; web_path=repo/'src'/'web_server.cpp'; build_path=repo/'include'/'smart_home_build.h'
    for p in (hub_path,web_path,build_path):
        if not p.exists(): raise SystemExit(f"missing reconstructed source: {p}")
    hub=hub_path.read_text(encoding='utf-8'); web=web_path.read_text(encoding='utf-8'); build=build_path.read_text(encoding='utf-8')
    if MARKER in hub:
        if 'SMART_HOME_VERSION "v11.23"' not in build: raise SystemExit('v11.23 marker exists but build identity is not v11.23')
        print('v11.23 Network / Locale / Layout Expert already applied'); return
    if 'SMART_HOME_VERSION "v11.22"' not in build: raise SystemExit('v11.23 patch requires reconstructed v11.22 Display Expert source')

    build=replace_once(build,'#define SMART_HOME_VERSION "v11.22"','#define SMART_HOME_VERSION "v11.23"','version')
    build=replace_once(build,'#define SMART_HOME_PROFILE "display-expert"','#define SMART_HOME_PROFILE "network-locale-layout"','profile')
    build=replace_once(build,'#define SMART_HOME_BUILD_LABEL "Smart Home v11.22 Display Expert RC1"','#define SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC1"','label')

    hub=replace_once(hub,'#include "settings.h"','#include "settings.h"\n#include "timezones.h"','timezone include')
    hub=replace_once(hub,'bool g_networkSettingsView = false;','bool g_networkSettingsView = false;\n'+NETWORK_EXPERT,'network expert state/helpers')

    start='static void drawNetworkEssentials(bool full) {'
    end='static void uiHealthDot('
    hub=replace_between(hub,start,end,NETWORK_DRAW,'network renderer')

    hub=replace_once(hub,
        '    uiDisplaySettingCard(hubMoreRect(3), "ROTATION", "v11.23",\n                         "Guarded touch remap comes next", UI_GREEN, false);',
        '    uiDisplaySettingCard(hubMoreRect(3), "ROTATION", hubRotationLabel(),\n                         "Hold to rotate clockwise", UI_GREEN);',
        'rotation card')
    hub=replace_once(hub,
        '    "Clock footer and AMS tray labels; rotation remains v11.23"',
        '    "Clock footer, AMS labels and guarded rotation"',
        'display extras footer')
    hub=replace_once(hub,
        '''        }else{\n          if(i==0){dispSettings.showClockInfo=!dispSettings.showClockInfo;hubPersistDisplayExpert();}\n          else if(i==1){dispSettings.amsTrayTypes=!dispSettings.amsTrayTypes;hubPersistDisplayExpert();}\n          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n        }''',
        '''        }else{\n          if(i==0){dispSettings.showClockInfo=!dispSettings.showClockInfo;hubPersistDisplayExpert();}\n          else if(i==1){dispSettings.amsTrayTypes=!dispSettings.amsTrayTypes;hubPersistDisplayExpert();}\n          else if(i==3&&longPress){dispSettings.rotation=(uint8_t)((dispSettings.rotation+1U)%4U);hubPersistDisplayExpert();}\n          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n        }''',
        'guarded rotation touch')

    old='''    if(g_networkSettingsView){\n      if(hubDisplayPagerRect().contains(x,y)){g_networkSettingsView=false;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){\n        if(i==0)netSettings.showIPAtStartup=!netSettings.showIPAtStartup;\n        else if(i==1)netSettings.use24h=!netSettings.use24h;\n        else if(i==2)netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+(longPress?5U:1U))%6U);\n        else netSettings.mdnsEnabled=!netSettings.mdnsEnabled;\n        saveSettings();g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;\n      }\n      return true;\n    }'''
    new='''    if(g_networkSettingsView){\n      if(!g_networkEditLoaded)hubLoadNetworkEdit();\n      if(hubDisplayPagerRect().contains(x,y)){\n        if(g_networkSettingsPage==3&&longPress){hubCommitNetworkAndRestart();return true;}\n        g_networkSettingsPage=(uint8_t)((g_networkSettingsPage+1U)%HUB_NETWORK_PAGE_COUNT);g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;\n      }\n      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){\n        if(g_networkSettingsPage==0){\n          if(i==0)netSettings.showIPAtStartup=!netSettings.showIPAtStartup;\n          else if(i==1)netSettings.use24h=!netSettings.use24h;\n          else if(i==2)netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+(longPress?5U:1U))%6U);\n          else netSettings.mdnsEnabled=!netSettings.mdnsEnabled;\n          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;\n        }else if(g_networkSettingsPage==1){\n          if(i==0)hubStepTimezone(longPress);\n          else if(i==1){netSettings.use24h=!netSettings.use24h;saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n          else if(i==2){netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+(longPress?5U:1U))%6U);saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n        }else if(g_networkSettingsPage==2){\n          if(i==0){g_networkEditDhcp=!g_networkEditDhcp;}\n          else if(i==1){g_networkEditField=(uint8_t)((g_networkEditField+(longPress?3U:1U))%4U);}\n          else if(i==2){g_networkEditOctet=(uint8_t)((g_networkEditOctet+(longPress?3U:1U))%4U);}\n          else{uint16_t step=longPress?10U:1U;g_networkEditValues[g_networkEditField][g_networkEditOctet]=(uint8_t)((g_networkEditValues[g_networkEditField][g_networkEditOctet]+step)%256U);}\n          buzzerPlay(BUZZ_CLICK);g_dirty=true;\n        }else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}\n        return true;\n      }\n      return true;\n    }'''
    hub=replace_once(hub,old,new,'network expert touch')

    hub=replace_once(hub,
        'if(hubSystemNetworkCardRect().contains(x,y)){g_audioSettingsView=false;g_networkSettingsView=true;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}',
        'if(hubSystemNetworkCardRect().contains(x,y)){g_audioSettingsView=false;g_networkSettingsView=true;g_networkSettingsPage=0;g_networkEditLoaded=false;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}',
        'network entry reset')
    hub=replace_once(hub,
        '''  if (strcmp(pageName, "system-network") == 0) {\n    setPage(SCREEN_HUB_SYSTEM);\n    g_audioSettingsView = false;\n    g_audioSettingsPage = 0;\n    g_networkSettingsView = true;\n    g_dirty = true;\n    return true;\n  }''',
        '''  static const char* const kNetworkPages[] = {\n    "system-network", "system-time-locale", "system-network-address", "system-network-review"\n  };\n  for(uint8_t i=0;i<HUB_NETWORK_PAGE_COUNT;i++) {\n    if(strcmp(pageName,kNetworkPages[i])==0) {\n      setPage(SCREEN_HUB_SYSTEM);\n      g_audioSettingsView=false;g_audioSettingsPage=0;\n      g_networkSettingsView=true;g_networkSettingsPage=i;g_networkEditLoaded=false;\n      g_dirty=true;return true;\n    }\n  }''',
        'capture network pages')

    web=replace_once(web,
        '    {"id":"system-network","label":"Network Essentials","group":"System"},',
        '    {"id":"system-network","label":"Network Essentials","group":"System"},\n    {"id":"system-time-locale","label":"Network - Time & Locale","group":"Network Expert"},\n    {"id":"system-network-address","label":"Network - Address Editor","group":"Network Expert"},\n    {"id":"system-network-review","label":"Network - Address Review","group":"Network Expert"},',
        'capture catalog network expert')

    for body,needles,label in [
        (build,['SMART_HOME_VERSION "v11.23"','SMART_HOME_PROFILE "network-locale-layout"','Smart Home v11.23 Network Locale Layout RC1'],'build'),
        (hub,[MARKER,'g_networkSettingsPage','hubStepTimezone','hubCommitNetworkAndRestart','system-time-locale','system-network-address','system-network-review','Hold to rotate clockwise','dispSettings.rotation=(uint8_t)((dispSettings.rotation+1U)%4U)'],'hub'),
        (web,['system-time-locale','system-network-address','system-network-review'],'web')]:
        for n in needles:
            if n not in body: raise SystemExit(f'{label}: missing {n}')

    build_path.write_text(build,encoding='utf-8'); hub_path.write_text(hub,encoding='utf-8'); web_path.write_text(web,encoding='utf-8')


def main() -> int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    apply(Path(a.repo).resolve());print('Smart Home v11.23 Network / Locale / Layout Expert applied');return 0

if __name__=='__main__': raise SystemExit(main())
