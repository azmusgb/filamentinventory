#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def load(root: Path, rel: str) -> str:
    p = root / rel
    if not p.exists():
        raise PatchError(f"missing {rel}")
    return p.read_text()


def save(root: Path, rel: str, text: str) -> None:
    (root / rel).write_text(text)


def once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise PatchError(f"{label}: expected one anchor, found {n}")
    return text.replace(old, new, 1)


NETWORK_UI = r'''static HubRect hubSystemNetworkCardRect() {
  const int16_t W=tft.width();
  return hubLandscape() ? hr(176,166,140,98) : hr(8,262,W-16,72);
}

static const char* hubDateFormatLabel(uint8_t fmt) {
  switch (fmt) {
    case 1: return "DD-MM-YYYY";
    case 2: return "MM/DD/YYYY";
    case 3: return "YYYY-MM-DD";
    case 4: return "DD MMM YYYY";
    case 5: return "MMM DD, YYYY";
    default:return "DD.MM.YYYY";
  }
}

static void drawNetworkEssentials(bool full) {
  (void)full;
  const int16_t W=tft.width();
  tft.fillScreen(UI_BG);
  drawHeader("NETWORK","ESSENTIALS",3);
  uiBottomNav(3,nullptr);

  char mdnsDetail[48];
  if(netSettings.mdnsEnabled)
    snprintf(mdnsDetail,sizeof(mdnsDetail),"%s.local • restart applies",netSettings.hostname);
  else
    strlcpy(mdnsDetail,"Local hostname advertisement off",sizeof(mdnsDetail));

  uiDisplaySettingCard(hubMoreRect(0),"STARTUP IP",
                       netSettings.showIPAtStartup?"ON":"OFF",
                       "Show IP after Wi-Fi connects",UI_BLUE);
  uiDisplaySettingCard(hubMoreRect(1),"CLOCK FORMAT",
                       netSettings.use24h?"24 HOUR":"12 HOUR",
                       "Display time convention",UI_CYAN);
  uiDisplaySettingCard(hubMoreRect(2),"DATE FORMAT",
                       hubDateFormatLabel(netSettings.dateFormat),
                       "Tap next / hold previous",UI_PURPLE);
  uiDisplaySettingCard(hubMoreRect(3),"mDNS",
                       netSettings.mdnsEnabled?"ON":"OFF",
                       mdnsDetail,UI_GREEN);

  HubRect back=hubDisplayPagerRect();
  if(hubLandscape()){
    uiPanelFill(8,210,W-156,54);
    uiDrawFit("Static IP, hostname and Wi-Fi credentials stay in the portal",20,237,W-184,FONT_SMALL,ML_DATUM,UI_DIM,UI_PANEL_2);
  }else{
    uiPanelFill(10,306,W-20,108);
    uiDrawFit("NETWORK ESSENTIALS",20,319,W-40,FONT_SMALL,TL_DATUM,UI_BLUE,UI_PANEL_2);
    uiDrawFit("Safe device-side preferences • text and addressing remain in portal",20,344,W-40,FONT_BODY,TL_DATUM,UI_TEXT,UI_PANEL_2);
  }
  uiActionButton(back,"< SYSTEM",UI_BLUE);
  hubMarkFrameDirty();
  g_dirty=false;
}

'''


def patch(root: Path) -> None:
    rel="include/smart_home_build.h"
    t=load(root,rel)
    t=once(t,'#define SMART_HOME_VERSION "v11.13"','#define SMART_HOME_VERSION "v11.14"','version')
    t=once(t,'#define SMART_HOME_PROFILE "alerts-hms"','#define SMART_HOME_PROFILE "network-essentials"','profile')
    t=once(t,'Smart Home v11.13 Alerts & HMS RC1','Smart Home v11.14 Network Essentials RC1','label')
    save(root,rel,t)

    rel="src/smart_hub.cpp"
    t=load(root,rel)
    t=once(t,
           'bool g_displayExperienceView = false;\nuint8_t g_displayExperiencePage = 0;\n',
           'bool g_displayExperienceView = false;\nuint8_t g_displayExperiencePage = 0;\nbool g_networkSettingsView = false;\n',
           'network subview state')
    t=once(t,
           '  if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; g_displayExperiencePage = 0; }\n',
           '  if (s != SCREEN_HUB_MORE) { g_toolsView = false; g_displayExperienceView = false; g_displayExperiencePage = 0; }\n  if (s != SCREEN_HUB_SYSTEM) g_networkSettingsView = false;\n',
           'network subview reset')
    t=once(t,
           'static void uiHealthDot(int16_t x,int16_t y,const char* label,bool ok,uint16_t goodColor=UI_GREEN) {',
           NETWORK_UI+'static void uiHealthDot(int16_t x,int16_t y,const char* label,bool ok,uint16_t goodColor=UI_GREEN) {',
           'network UI insertion')
    t=once(t,
           'static void drawSystem(bool full) {\n  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);',
           'static void drawSystem(bool full) {\n  if(g_networkSettingsView){drawNetworkEssentials(full);return;}\n  (void)full;const int16_t W=tft.width();tft.fillScreen(UI_BG);',
           'System network subview renderer')

    system_touch='''  if(cur==SCREEN_HUB_SYSTEM){\n    if(hubSystemActionRect(0).contains(x,y)){'''
    replacement='''  if(cur==SCREEN_HUB_SYSTEM){\n    if(g_networkSettingsView){\n      if(hubDisplayPagerRect().contains(x,y)){g_networkSettingsView=false;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n      for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){\n        if(i==0)netSettings.showIPAtStartup=!netSettings.showIPAtStartup;\n        else if(i==1)netSettings.use24h=!netSettings.use24h;\n        else if(i==2)netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+(longPress?5U:1U))%6U);\n        else netSettings.mdnsEnabled=!netSettings.mdnsEnabled;\n        saveSettings();g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;\n      }\n      return true;\n    }\n    if(hubSystemNetworkCardRect().contains(x,y)){g_networkSettingsView=true;g_dirty=true;buzzerPlay(BUZZ_CLICK);return true;}\n    if(hubSystemActionRect(0).contains(x,y)){'''
    t=once(t,system_touch,replacement,'System network touch routing')
    save(root,rel,t)

    checks={
      'include/smart_home_build.h':['SMART_HOME_VERSION "v11.14"','SMART_HOME_PROFILE "network-essentials"','Smart Home v11.14 Network Essentials RC1'],
      'src/smart_hub.cpp':['g_networkSettingsView','drawNetworkEssentials','hubSystemNetworkCardRect','hubDateFormatLabel','STARTUP IP','CLOCK FORMAT','DATE FORMAT','mDNS','< SYSTEM','netSettings.showIPAtStartup=!netSettings.showIPAtStartup','netSettings.use24h=!netSettings.use24h','netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+(longPress?5U:1U))%6U)','netSettings.mdnsEnabled=!netSettings.mdnsEnabled'],
    }
    for check_rel,needles in checks.items():
      body=load(root,check_rel)
      for needle in needles:
        if needle not in body: raise PatchError(f'{check_rel}: missing {needle}')


def main()->int:
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    patch(Path(a.repo).resolve());print('Smart Home v11.14 Network Essentials applied');return 0


if __name__=='__main__':
    raise SystemExit(main())
