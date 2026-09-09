#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Workshop OS v11.23 RC2 touch UX and temporary trusted-LAN portal bypass"


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def replace_braced_block(text: str, start: str, replacement: str, label: str) -> str:
    pos = text.find(start)
    if pos < 0:
        fail(f"{label}: start anchor missing")
    brace = text.find("{", pos)
    if brace < 0:
        fail(f"{label}: opening brace missing")
    depth = 0
    in_string = False
    quote = ""
    escape = False
    for i in range(brace, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == quote:
                in_string = False
            continue
        if c in ("'", '"'):
            in_string = True
            quote = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[:pos] + replacement + text[i + 1 :]
    fail(f"{label}: closing brace missing")


def get_braced_block(text: str, start: str, label: str) -> tuple[int, int, str]:
    pos = text.find(start)
    if pos < 0:
        fail(f"{label}: start anchor missing")
    brace = text.find("{", pos)
    if brace < 0:
        fail(f"{label}: opening brace missing")
    depth = 0
    in_string = False
    quote = ""
    escape = False
    for i in range(brace, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == quote:
                in_string = False
            continue
        if c in ("'", '"'):
            in_string = True
            quote = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return pos, i + 1, text[pos:i + 1]
    fail(f"{label}: closing brace missing")


TOUCH_HELPERS = r'''
// ---------------------------------------------------------------------------
// Workshop OS v11.23 RC2 touch UX and temporary trusted-LAN portal bypass
// ---------------------------------------------------------------------------
static int16_t hubRc2SX(int16_t x) {
  return (int16_t)((int32_t)x * tft.width() / 480);
}
static int16_t hubRc2SY(int16_t y) {
  return (int16_t)((int32_t)y * tft.height() / 320);
}
static bool hubRc2HitRef(int16_t tx, int16_t ty,
                         int16_t x, int16_t y, int16_t w, int16_t h) {
  const int16_t sx=hubRc2SX(x), sy=hubRc2SY(y);
  const int16_t sw=hubRc2SX(w), sh=hubRc2SY(h);
  return tx>=sx && tx<(sx+sw) && ty>=sy && ty<(sy+sh);
}
static void hubRc2ButtonRef(int16_t x, int16_t y, int16_t w, int16_t h,
                            const char* label, uint16_t accent,
                            bool enabled=true) {
  const int16_t sx=hubRc2SX(x), sy=hubRc2SY(y);
  const int16_t sw=hubRc2SX(w), sh=hubRc2SY(h);
  const uint16_t fill=enabled?UI_PANEL_2:UI_PANEL;
  const uint16_t ink=enabled?UI_TEXT:UI_DIM;
  tft.fillRoundRect(sx,sy,sw,sh,8,fill);
  tft.drawRoundRect(sx,sy,sw,sh,8,enabled?accent:UI_BORDER);
  uiDrawFit(label,sx+6,sy+(sh/2),sw-12,FONT_BODY,ML_DATUM,ink,fill);
}
static void hubRc2CardRef(int16_t x, int16_t y, int16_t w, int16_t h,
                          const char* title, const char* value,
                          const char* detail, uint16_t accent) {
  const int16_t sx=hubRc2SX(x), sy=hubRc2SY(y);
  const int16_t sw=hubRc2SX(w), sh=hubRc2SY(h);
  tft.fillRoundRect(sx,sy,sw,sh,8,UI_PANEL_2);
  tft.drawRoundRect(sx,sy,sw,sh,8,UI_BORDER);
  uiDrawFit(title,sx+8,sy+12,sw-16,FONT_SMALL,TL_DATUM,accent,UI_PANEL_2);
  uiDrawFit(value,sx+8,sy+(sh/2),sw-16,FONT_BODY,ML_DATUM,UI_TEXT,UI_PANEL_2);
  if(detail && detail[0])
    uiDrawFit(detail,sx+8,sy+sh-10,sw-16,FONT_SMALL,BL_DATUM,UI_DIM,UI_PANEL_2);
}
static void hubRc2PageIndicator(uint8_t page, uint8_t count) {
  char label[20];
  snprintf(label,sizeof(label),"%u / %u",(unsigned)page+1U,(unsigned)count);
  const int16_t sx=hubRc2SX(202), sy=hubRc2SY(42);
  const int16_t sw=hubRc2SX(76), sh=hubRc2SY(20);
  tft.fillRoundRect(sx,sy,sw,sh,9,UI_PANEL_2);
  uiDrawFit(label,sx+4,sy+(sh/2),sw-8,FONT_SMALL,ML_DATUM,UI_DIM,UI_PANEL_2);
}
static void hubNetworkDiscardEdit() {
  g_networkEditLoaded=false;
  hubLoadNetworkEdit();
  buzzerPlay(BUZZ_CLICK);
  g_dirty=true;
}

'''

NETWORK_DRAW_RC2 = r'''static void drawNetworkEssentials(bool full) {
  (void)full;
  if(!g_networkEditLoaded) hubLoadNetworkEdit();
  const uint8_t page=(uint8_t)(g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT);
  tft.fillScreen(UI_BG);
  const char* title=page==0?"ESSENTIALS":page==1?"TIME & LOCALE":page==2?"ADDRESS EDIT":"REVIEW";
  drawHeader("NETWORK",title,3);
  hubRc2PageIndicator(page,HUB_NETWORK_PAGE_COUNT);

  if(page==0) {
    hubRc2CardRef(10,70,225,82,"STARTUP IP",
                  netSettings.showIPAtStartup?"ON":"OFF",
                  "Tap to toggle",UI_BLUE);
    hubRc2CardRef(245,70,225,82,"CLOCK FORMAT",
                  netSettings.use24h?"24 HOUR":"12 HOUR",
                  "Tap to toggle",UI_CYAN);
    hubRc2CardRef(10,160,225,82,"DATE FORMAT",
                  hubDateFormatLabel(netSettings.dateFormat),
                  "Tap to cycle",UI_PURPLE);
    hubRc2CardRef(245,160,225,82,"mDNS",
                  netSettings.mdnsEnabled?"ON":"OFF",
                  "Hostname remains browser-only",UI_GREEN);
    hubRc2ButtonRef(10,270,110,40,"< BACK",UI_DIM);
    hubRc2ButtonRef(360,270,110,40,"NEXT >",UI_BLUE);
  } else if(page==1) {
    hubRc2CardRef(10,68,460,68,"TIMEZONE",hubTimezoneLabel(),
                  "Use explicit PREV / NEXT",UI_ORANGE);
    hubRc2ButtonRef(10,145,135,48,"< PREV",UI_ORANGE);
    hubRc2ButtonRef(335,145,135,48,"NEXT >",UI_ORANGE);
    hubRc2CardRef(10,202,225,54,"CLOCK FORMAT",
                  netSettings.use24h?"24 HOUR":"12 HOUR",
                  "Tap to toggle",UI_CYAN);
    hubRc2CardRef(245,202,225,54,"DATE FORMAT",
                  hubDateFormatLabel(netSettings.dateFormat),
                  "Tap to cycle",UI_PURPLE);
    uiDrawFit("Timezone changes apply immediately. Wi-Fi credentials stay browser-only.",
              hubRc2SX(18),hubRc2SY(263),hubRc2SX(444),
              FONT_SMALL,ML_DATUM,UI_DIM,UI_BG);
    hubRc2ButtonRef(10,280,110,30,"< BACK",UI_DIM);
    hubRc2ButtonRef(360,280,110,30,"NEXT >",UI_BLUE);
  } else if(page==2) {
    hubRc2ButtonRef(10,62,460,28,"STAGED - NOT APPLIED",UI_ORANGE);
    hubRc2ButtonRef(10,96,130,44,
                    g_networkEditDhcp?"MODE: DHCP":"MODE: STATIC",UI_ORANGE);
    hubRc2ButtonRef(150,96,70,44,"< FIELD",UI_CYAN);
    hubRc2ButtonRef(225,96,170,44,hubNetworkFieldLabel(g_networkEditField),UI_CYAN);
    hubRc2ButtonRef(400,96,70,44,"FIELD >",UI_CYAN);

    char v0[8],v1[8],v2[8],v3[8];
    snprintf(v0,sizeof(v0),"%u",(unsigned)g_networkEditValues[g_networkEditField][0]);
    snprintf(v1,sizeof(v1),"%u",(unsigned)g_networkEditValues[g_networkEditField][1]);
    snprintf(v2,sizeof(v2),"%u",(unsigned)g_networkEditValues[g_networkEditField][2]);
    snprintf(v3,sizeof(v3),"%u",(unsigned)g_networkEditValues[g_networkEditField][3]);
    hubRc2ButtonRef(10,150,108,48,v0,g_networkEditOctet==0?UI_ORANGE:UI_BLUE);
    hubRc2ButtonRef(127,150,108,48,v1,g_networkEditOctet==1?UI_ORANGE:UI_BLUE);
    hubRc2ButtonRef(244,150,108,48,v2,g_networkEditOctet==2?UI_ORANGE:UI_BLUE);
    hubRc2ButtonRef(361,150,109,48,v3,g_networkEditOctet==3?UI_ORANGE:UI_BLUE);

    hubRc2ButtonRef(10,208,108,48,"-10",UI_PURPLE);
    hubRc2ButtonRef(127,208,108,48,"-1",UI_PURPLE);
    hubRc2ButtonRef(244,208,108,48,"+1",UI_GREEN);
    hubRc2ButtonRef(361,208,109,48,"+10",UI_GREEN);
    hubRc2ButtonRef(10,270,110,40,"< BACK",UI_DIM);
    hubRc2ButtonRef(360,270,110,40,"REVIEW >",UI_BLUE);
  } else {
    char ip[20],gw[20],sn[20],dns[20];
    hubFormatIpv4(g_networkEditValues[0],ip,sizeof(ip));
    hubFormatIpv4(g_networkEditValues[1],gw,sizeof(gw));
    hubFormatIpv4(g_networkEditValues[2],sn,sizeof(sn));
    hubFormatIpv4(g_networkEditValues[3],dns,sizeof(dns));
    hubRc2ButtonRef(10,58,460,28,"STAGED CONFIGURATION - REVIEW BEFORE APPLY",UI_ORANGE);
    hubRc2CardRef(10,92,225,62,g_networkEditDhcp?"MODE":"IP",
                  g_networkEditDhcp?"DHCP":ip,
                  g_networkEditDhcp?"Addressing from network":"Static address",UI_ORANGE);
    hubRc2CardRef(245,92,225,62,"GATEWAY",
                  g_networkEditDhcp?"AUTO":gw,"",UI_CYAN);
    hubRc2CardRef(10,162,225,62,"SUBNET",
                  g_networkEditDhcp?"AUTO":sn,"",UI_PURPLE);
    hubRc2CardRef(245,162,225,62,"DNS",
                  g_networkEditDhcp?"AUTO":dns,
                  hubStaticNetworkValid()?"Ready to apply":"Static values incomplete",
                  hubStaticNetworkValid()?UI_GREEN:UI_RED);
    hubRc2ButtonRef(10,252,105,56,"< BACK",UI_DIM);
    hubRc2ButtonRef(125,252,105,56,"DISCARD",UI_RED);
    hubRc2ButtonRef(240,252,230,56,"HOLD APPLY + RESTART",
                    hubStaticNetworkValid()?UI_ORANGE:UI_RED,
                    hubStaticNetworkValid());
  }

  hubMarkFrameDirty();
  g_dirty=false;
}'''

NETWORK_TOUCH_RC2 = r'''    if(g_networkSettingsView){
      if(!g_networkEditLoaded)hubLoadNetworkEdit();
      const uint8_t page=(uint8_t)(g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT);

      if(page==0){
        if(hubRc2HitRef(x,y,10,70,225,82)){
          netSettings.showIPAtStartup=!netSettings.showIPAtStartup;
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,245,70,225,82)){
          netSettings.use24h=!netSettings.use24h;
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,160,225,82)){
          netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+1U)%6U);
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,245,160,225,82)){
          netSettings.mdnsEnabled=!netSettings.mdnsEnabled;
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,270,110,40)){
          g_networkSettingsView=false;g_networkSettingsPage=0;g_networkEditLoaded=false;
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,360,270,110,40)){
          g_networkSettingsPage=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        return true;
      }

      if(page==1){
        if(hubRc2HitRef(x,y,10,145,135,48)){
          hubStepTimezone(true);return true;
        }
        if(hubRc2HitRef(x,y,335,145,135,48)){
          hubStepTimezone(false);return true;
        }
        if(hubRc2HitRef(x,y,10,202,225,54)){
          netSettings.use24h=!netSettings.use24h;
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,245,202,225,54)){
          netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+1U)%6U);
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,280,110,30)){
          g_networkSettingsPage=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,360,280,110,30)){
          g_networkSettingsPage=2;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        return true;
      }

      if(page==2){
        if(hubRc2HitRef(x,y,10,96,130,44)){
          g_networkEditDhcp=!g_networkEditDhcp;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,150,96,70,44)){
          g_networkEditField=(uint8_t)((g_networkEditField+3U)%4U);
          g_networkEditOctet=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,400,96,70,44)){
          g_networkEditField=(uint8_t)((g_networkEditField+1U)%4U);
          g_networkEditOctet=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        for(uint8_t i=0;i<4;i++){
          if(hubRc2HitRef(x,y,(int16_t)(10+i*117),150,(i==3)?109:108,48)){
            g_networkEditOctet=i;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
          }
        }
        int16_t delta=0;
        if(hubRc2HitRef(x,y,10,208,108,48))delta=-10;
        else if(hubRc2HitRef(x,y,127,208,108,48))delta=-1;
        else if(hubRc2HitRef(x,y,244,208,108,48))delta=1;
        else if(hubRc2HitRef(x,y,361,208,109,48))delta=10;
        if(delta){
          int16_t value=(int16_t)g_networkEditValues[g_networkEditField][g_networkEditOctet]+delta;
          if(value<0)value=0;
          if(value>255)value=255;
          g_networkEditValues[g_networkEditField][g_networkEditOctet]=(uint8_t)value;
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,270,110,40)){
          g_networkSettingsPage=1;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,360,270,110,40)){
          g_networkSettingsPage=3;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        return true;
      }

      if(page==3){
        if(hubRc2HitRef(x,y,10,252,105,56)){
          g_networkSettingsPage=2;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,125,252,105,56)){
          hubNetworkDiscardEdit();g_networkSettingsPage=0;return true;
        }
        if(hubRc2HitRef(x,y,240,252,230,56)){
          if(longPress&&hubStaticNetworkValid())hubCommitNetworkAndRestart();
          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}
          return true;
        }
        return true;
      }
      return true;
    }'''


def patch_build(repo: Path) -> None:
    p=repo/"include"/"smart_home_build.h"
    text=p.read_text(encoding="utf-8")
    text=replace_once(
        text,
        '#define SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC1"',
        '#define SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC2"',
        "RC2 build label",
    )
    text=replace_once(
        text,
        '#define SMART_HOME_PROFILE "network-locale-layout"',
        '#define SMART_HOME_PROFILE "network-touch-ux"',
        "RC2 profile",
    )
    anchor='#define SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC2"\n'
    insert='#define WORKSHOP_OS_TEMP_LAN_OPEN 1\n#define WORKSHOP_OS_RC2_TOUCH_UX 1\n'
    text=replace_once(text,anchor,anchor+insert,"RC2 build flags")
    text += f"\n// {MARKER}\n"
    p.write_text(text,encoding="utf-8")


def patch_security(repo: Path) -> None:
    p=repo/"src"/"security_manager.cpp"
    text=p.read_text(encoding="utf-8")
    if '#include "smart_home_build.h"' not in text:
        text=replace_once(
            text,
            '#include "wifi_manager.h"\n',
            '#include "smart_home_build.h"\n#include "wifi_manager.h"\n',
            "build include",
        )

    session = '''bool securitySessionValid(WebServer& server) {
#if defined(WORKSHOP_OS_TEMP_LAN_OPEN) && WORKSHOP_OS_TEMP_LAN_OPEN
  // Temporary trusted-LAN development mode: normal station-mode management
  // does not require the rotating portal code. AP/setup/recovery boundaries
  // remain governed by securityAuthorize().
  if (!isAPMode()) return true;
#endif
  ensureInitialized();
  return cookieMatches(server);
}'''
    text=replace_braced_block(
        text,
        "bool securitySessionValid(WebServer& server)",
        session,
        "session policy",
    )

    start,end,auth=get_braced_block(
        text,
        "bool securityAuthorize(WebServer& server, bool mutating)",
        "authorize policy",
    )
    marker='  ensureInitialized();'
    if marker not in auth:
        fail("authorize policy: ensureInitialized anchor missing")
    lan_open = '''  ensureInitialized();

#if defined(WORKSHOP_OS_TEMP_LAN_OPEN) && WORKSHOP_OS_TEMP_LAN_OPEN
  // Temporary trusted-LAN development mode. Keep same-origin protection on
  // every mutation even though the station-mode login challenge is bypassed.
  if (!isAPMode()) {
    if (mutating && !sameOrigin(server)) {
      server.send(403, "application/json",
          "{\\"status\\":\\"error\\",\\"message\\":\\"Rejected by Workshop OS same-origin protection.\\"}");
      return false;
    }
    return true;
  }
#endif'''
    auth=auth.replace(marker,lan_open,1)
    text=text[:start]+auth+text[end:]
    p.write_text(text,encoding="utf-8")


def patch_browser(repo: Path) -> None:
    p=repo/"web"/"app.js"
    text=p.read_text(encoding="utf-8")
    if "v1123Rc2LanOpenBanner" not in text:
        anchor="function v1120Ws350Safety(){"
        banner=r'''function v1123Rc2LanOpenBanner(){
  var style=document.createElement('style');
  style.textContent='.v1123rc2-banner{margin:10px 0 16px;padding:11px 14px;border:1px solid rgba(255,176,32,.55);border-radius:10px;background:rgba(255,176,32,.10);font-size:12.5px;line-height:1.45}.v1123rc2-banner strong{color:#ffb020}';
  document.head.appendChild(style);
  var main=document.querySelector('main')||document.body;
  if(main&&!document.getElementById('v1123Rc2LanOpen')){
    var banner=document.createElement('div');
    banner.id='v1123Rc2LanOpen';
    banner.className='v1123rc2-banner';
    banner.innerHTML='<strong>TEMPORARY TRUSTED-LAN MODE</strong> · Portal-code login is bypassed on normal Wi-Fi for v11.23 RC2. Same-origin mutation protection and AP/recovery boundaries remain active.';
    main.insertBefore(banner,main.firstChild);
  }
}
setTimeout(v1123Rc2LanOpenBanner,0);

'''
        text=replace_once(text,anchor,banner+anchor,"LAN-open browser banner")
    p.write_text(text,encoding="utf-8")


def patch_hub(repo: Path) -> None:
    p=repo/"src"/"smart_hub.cpp"
    text=p.read_text(encoding="utf-8")
    text=replace_once(
        text,
        "static void drawNetworkEssentials(bool full) {",
        TOUCH_HELPERS+"static void drawNetworkEssentials(bool full) {",
        "RC2 touch helper insertion",
    )
    text=replace_braced_block(
        text,
        "static void drawNetworkEssentials(bool full)",
        NETWORK_DRAW_RC2,
        "RC2 network renderer",
    )

    start,end,_=get_braced_block(
        text,
        "    if(g_networkSettingsView){",
        "RC2 network touch block",
    )
    text=text[:start]+NETWORK_TOUCH_RC2+text[end:]

    start,end,block=get_braced_block(
        text,
        "    if(g_displayExperienceView){",
        "display touch block",
    )
    if "const bool hubRc2Reverse" not in block:
        open_brace=block.find("{")
        block=(
            block[:open_brace+1]
            +"\n      const bool hubRc2Reverse=(x<tft.width()/2);"
            +block[open_brace+1:]
        )
        block=block.replace("longPress","hubRc2Reverse")
        block=block.replace("i==3&&hubRc2Reverse","i==3&&longPress")
    text=text[:start]+block+text[end:]

    text=text.replace("Tap next / hold previous","< PREV  |  NEXT >")
    text=text.replace("Tap next / hold prev","< PREV  |  NEXT >")
    text=text.replace("Hold to rotate clockwise","HOLD TO ROTATE CLOCKWISE")
    p.write_text(text,encoding="utf-8")


def apply(repo: Path) -> None:
    build=repo/"include"/"smart_home_build.h"
    if not build.exists():
        fail(f"missing reconstructed source: {build}")
    text=build.read_text(encoding="utf-8")
    if MARKER in text:
        print("v11.23 RC2 touch UX already applied")
        return
    if 'SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC1"' not in text:
        fail("v11.23 RC2 patch requires reconstructed v11.23 RC1 source")

    patch_build(repo)
    patch_security(repo)
    patch_browser(repo)
    patch_hub(repo)
    print("Workshop OS v11.23 Network Locale Layout RC2 touch UX applied")


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",default=".")
    ap.add_argument("--apply",action="store_true")
    args=ap.parse_args()
    repo=Path(args.repo).resolve()
    if not args.apply:
        print("v11.23 RC2 touch UX patch ready. Use --apply to modify reconstructed source.")
        return 0
    apply(repo)
    return 0


if __name__=="__main__":
    raise SystemExit(main())
