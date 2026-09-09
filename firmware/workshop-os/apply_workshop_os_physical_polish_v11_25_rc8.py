#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC8 physical-screen polish after final RC7.

RC8 is a presentation/interaction layer only. It preserves RC7 portal auth,
printer command semantics, inventory isolation, persistence, OTA/recovery, and
hardware I/O while tightening the 480x320 physical touchscreen experience.
"""
from __future__ import annotations

import argparse
from pathlib import Path


class PatchError(RuntimeError):
    pass


def load(path: Path) -> str:
    if not path.exists():
        raise PatchError(f"missing {path}")
    return path.read_text(encoding="utf-8")


def once(text: str, old: str, new: str, label: str) -> str:
    count=text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected one anchor, found {count}")
    return text.replace(old,new,1)


def block_end(text: str, start: int) -> int:
    i=text.find("{",start)
    if i<0: raise PatchError("opening brace missing")
    depth=0;string=None;escape=False;line_comment=False;block_comment=False
    while i<len(text):
        c=text[i];n=text[i+1] if i+1<len(text) else ""
        if line_comment:
            if c=="\n": line_comment=False
        elif block_comment:
            if c=="*" and n=="/": block_comment=False;i+=1
        elif string:
            if escape: escape=False
            elif c=="\\": escape=True
            elif c==string: string=None
        elif c=="/" and n=="/": line_comment=True;i+=1
        elif c=="/" and n=="*": block_comment=True;i+=1
        elif c in ('"',"'"): string=c
        elif c=="{": depth+=1
        elif c=="}":
            depth-=1
            if depth==0:return i+1
        i+=1
    raise PatchError("unterminated block")


def replace_block(text: str, signature: str, replacement: str, label: str) -> str:
    start=text.find(signature)
    if start<0 or text.find(signature,start+1)>=0:
        raise PatchError(f"{label}: signature missing/non-unique")
    return text[:start]+replacement.rstrip()+text[block_end(text,start):]


def replace_between(text: str, start_anchor: str, end_anchor: str, replacement: str, label: str) -> str:
    start=text.find(start_anchor)
    if start<0 or text.find(start_anchor,start+1)>=0:
        raise PatchError(f"{label}: start anchor missing/non-unique")
    end=text.find(end_anchor,start)
    if end<0:
        raise PatchError(f"{label}: end anchor missing")
    return text[:start]+replacement.rstrip()+"\n    "+text[end:]


def sections(root: Path) -> dict[str,str]:
    values:dict[str,str]={}
    d=root/"firmware"/"ui-v11.25-rc8"
    for path in d.glob("*.cppfrag"):
        text=load(path)
        for line in text.splitlines():
            if line.startswith("@@") and line.endswith("@@") and not line.startswith("@@END_"):
                name=line[2:-2];end=f"@@END_{name}@@"
                if end not in text: raise PatchError(f"{path.name}: missing {end}")
                values[name]=text.split(line,1)[1].split(end,1)[0].strip("\n")
    required={"FINGERPRINT_HELPERS","HEADER","BOTTOM_NAV","HOME","PRINTER","WORKSHOP","MORE","SYSTEM","NETWORK","HOLD_PROGRESS"}
    missing=required-set(values)
    if missing: raise PatchError(f"missing RC8 fragments: {sorted(missing)}")
    return values


HOME_RECT='''static HubRect hubHomeRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()) {
    if(i==1) return hr(8,44,312,146);
    if(i==0) return hr(8,198,152,62);
    if(i==2) return hr(168,198,152,62);
    return hr(0,0,0,0);
  }
  if(i==1) return hr(8,44,W-16,150);
  if(i==0) return hr(8,202,W-16,64);
  if(i==2) return hr(8,274,W-16,64);
  return hr(0,0,0,0);
}'''

WORKSHOP_RECT='''static HubRect hubWorkshopActionRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()){const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;return hr(m+i*(cw+g),212,cw,48);}
  const int16_t m=8,g=8,cw=(W-2*m-g)/2;return hr(m+(i%2)*(cw+g),328+(i/2)*56,cw,48);
}'''

TOOLS_PRESET='''static HubRect hubToolsPresetRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()){const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;return hr(m+i*(cw+g),140,cw,48);}
  const int16_t m=18,g=8,cw=(W-2*m-g)/2;return hr(m+(i%2)*(cw+g),222+(i/2)*56,cw,48);
}'''

TOOLS_ACTION='''static HubRect hubToolsActionRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()){const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;return hr(m+i*(cw+g),198,cw,54);}
  const int16_t m=12,g=6,cw=(W-2*m-g)/2;return hr(m+(i%2)*(cw+g),334+(i/2)*54,cw,48);
}'''

DISPLAY_PAGER='''static HubRect hubDisplayPagerRect() {
  const int16_t W=tft.width();
  if(hubLandscape()) return hr(W-140,207,132,48);
  return hr(18,356,W-36,48);
}'''

SYSTEM_AUDIO_RECT='''static HubRect hubSystemAudioSettingsEntryRect() {
  return hr(0,0,0,0);
}'''

SYSTEM_BACK_RECT='''static HubRect hubSystemSubBackRect() {
  const int16_t W=tft.width();
  if(hubLandscape()) return hr(8,207,132,48);
  const int16_t g=6,m=18,w=(W-2*m-g)/2;
  return hr(m,356,w,48);
}'''

SYSTEM_NEXT_RECT='''static HubRect hubSystemSubNextRect() {
  const int16_t W=tft.width();
  if(hubLandscape()) return hubDisplayPagerRect();
  const int16_t g=6,m=18,w=(W-2*m-g)/2;
  return hr(m+w+g,356,w,48);
}'''

SYSTEM_ACTION_RECT='''static HubRect hubSystemActionRect(uint8_t i) {
  (void)i;
  return hr(0,0,0,0);
}'''

SYSTEM_NETWORK_RECT='''static HubRect hubSystemNetworkCardRect() {
  const int16_t W=tft.width();
  return hubLandscape()?hr(236,44,236,80):hr(8,132,W-16,80);
}'''

NETWORK_TOUCH='''if(g_networkSettingsView){
      if(!g_networkEditLoaded)hubLoadNetworkEdit();
      const uint8_t page=(uint8_t)(g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT);
      if(page<=3){
        if(hubRc2HitRef(x,y,20,82,440,132)){
          if(page==0)netSettings.showIPAtStartup=!netSettings.showIPAtStartup;
          else if(page==1)netSettings.use24h=!netSettings.use24h;
          else if(page==2)netSettings.dateFormat=(uint8_t)((netSettings.dateFormat+1U)%6U);
          else netSettings.mdnsEnabled=!netSettings.mdnsEnabled;
          saveSettings();buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,258,110,52)){
          if(page==0){g_networkSettingsView=false;g_networkSettingsPage=0;g_networkEditLoaded=false;}
          else g_networkSettingsPage=(uint8_t)(page-1U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,360,258,110,52)){g_networkSettingsPage=(uint8_t)(page+1U);buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(page==4){
        if(hubRc2HitRef(x,y,20,202,210,48)){hubStepTimezone(true);return true;}
        if(hubRc2HitRef(x,y,250,202,210,48)){hubStepTimezone(false);return true;}
        if(hubRc2HitRef(x,y,10,258,110,52)){g_networkSettingsPage=3;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,360,258,110,52)){g_networkSettingsPage=5;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(page==5){
        if(hubRc2HitRef(x,y,10,102,130,48)){g_networkEditDhcp=!g_networkEditDhcp;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,150,102,70,48)){g_networkEditField=(uint8_t)((g_networkEditField+3U)%4U);g_networkEditOctet=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,400,102,70,48)){g_networkEditField=(uint8_t)((g_networkEditField+1U)%4U);g_networkEditOctet=0;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        for(uint8_t i=0;i<4;i++)if(hubRc2HitRef(x,y,(int16_t)(10+i*117),156,(i==3)?109:108,48)){g_networkEditOctet=i;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        int16_t delta=0;
        if(hubRc2HitRef(x,y,10,210,108,48))delta=-10;else if(hubRc2HitRef(x,y,127,210,108,48))delta=-1;else if(hubRc2HitRef(x,y,244,210,108,48))delta=1;else if(hubRc2HitRef(x,y,361,210,109,48))delta=10;
        if(delta){int16_t value=(int16_t)g_networkEditValues[g_networkEditField][g_networkEditOctet]+delta;if(value<0)value=0;if(value>255)value=255;g_networkEditValues[g_networkEditField][g_networkEditOctet]=(uint8_t)value;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,10,264,110,48)){g_networkSettingsPage=4;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,360,264,110,48)){g_networkSettingsPage=6;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        return true;
      }
      if(page==6){
        if(hubRc2HitRef(x,y,10,252,105,56)){g_networkSettingsPage=5;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;}
        if(hubRc2HitRef(x,y,125,252,105,56)){hubNetworkDiscardEdit();g_networkSettingsPage=0;return true;}
        if(hubRc2HitRef(x,y,240,252,230,56)){if(longPress&&hubStaticNetworkValid())hubCommitNetworkAndRestart();else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}return true;}
        return true;
      }
      return true;
    }'''


def patch(repo: Path) -> None:
    root=Path(__file__).resolve().parent;f=sections(root)
    build_path=repo/"include"/"smart_home_build.h";build=load(build_path)
    build=once(build,'#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC7 Touch-First UX Overhaul"','#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 RC8 Physical UI Polish"',"RC8 build label")
    build=once(build,'#define SMART_HOME_PROFILE "touch-first-ux"','#define SMART_HOME_PROFILE "physical-ui-polish"',"RC8 profile")
    build=once(build,'#define WORKSHOP_OS_UI_SCHEMA "UI7"','#define WORKSHOP_OS_UI_SCHEMA "UI8"',"RC8 schema")
    if "WORKSHOP_OS_V11_25_UI_RC8" not in build:build+='\n#define WORKSHOP_OS_V11_25_UI_RC8 1\n'
    build_path.write_text(build,encoding="utf-8")

    hub_path=repo/"src"/"smart_hub.cpp";hub=load(hub_path)
    for signature,key in [
        ("static const char* hubV1125UiFingerprint(uint8_t page)","FINGERPRINT_HELPERS"),
        ("static void drawHeader(","HEADER"),("static void uiBottomNav(","BOTTOM_NAV"),
        ("static void drawHome(bool full) {","HOME"),("static void drawPrinter(bool full) {","PRINTER"),
        ("static void drawWorkshop(bool full) {","WORKSHOP"),("static void drawMore(bool full) {","MORE"),
        ("static void drawSystem(bool full) {","SYSTEM"),("static void drawNetworkEssentials(bool full) {","NETWORK"),
        ("void smartHubUpdateHoldProgress(uint16_t rawX, uint16_t rawY, uint32_t holdMs)","HOLD_PROGRESS")]:
        hub=replace_block(hub,signature,f[key],key)

    hub=once(hub,"static int16_t hubNavH() { return 52; }","static int16_t hubNavH() { return 54; }","nav height")
    hub=once(hub,"static int16_t hubHeaderH() { return 40; }","static int16_t hubHeaderH() { return 36; }","header height")
    hub=replace_block(hub,"static HubRect hubHomeRect(uint8_t i)",HOME_RECT,"home touch geometry")
    hub=replace_block(hub,"static HubRect hubWorkshopActionRect(uint8_t i)",WORKSHOP_RECT,"workshop actions")
    hub=replace_block(hub,"static HubRect hubToolsPresetRect(uint8_t i)",TOOLS_PRESET,"tools presets")
    hub=replace_block(hub,"static HubRect hubToolsActionRect(uint8_t i)",TOOLS_ACTION,"tools actions")
    hub=replace_block(hub,"static HubRect hubDisplayPagerRect()",DISPLAY_PAGER,"display pager")
    hub=replace_block(hub,"static HubRect hubSystemAudioSettingsEntryRect()",SYSTEM_AUDIO_RECT,"system audio entry")
    hub=replace_block(hub,"static HubRect hubSystemSubBackRect()",SYSTEM_BACK_RECT,"system back")
    hub=replace_block(hub,"static HubRect hubSystemSubNextRect()",SYSTEM_NEXT_RECT,"system next")
    hub=replace_block(hub,"static HubRect hubSystemActionRect(uint8_t i)",SYSTEM_ACTION_RECT,"system action geometry")
    hub=replace_block(hub,"static HubRect hubSystemNetworkCardRect()",SYSTEM_NETWORK_RECT,"system network geometry")
    hub=once(hub,"static const uint8_t HUB_NETWORK_PAGE_COUNT = 4;","static const uint8_t HUB_NETWORK_PAGE_COUNT = 7;","network page count")
    start='if(g_networkSettingsView){\n      if(!g_networkEditLoaded)hubLoadNetworkEdit();\n      const uint8_t page=(uint8_t)(g_networkSettingsPage%HUB_NETWORK_PAGE_COUNT);'
    end='if(hubSystemAudioSettingsEntryRect().contains(x,y))'
    hub=replace_between(hub,start,end,NETWORK_TOUCH,"network touch wizard")

    copy=(("\"AMS telemetry from printer\"","\"AMS connected\""),("\"Driver and wiring stay in portal\"","\"Advanced setup is in the portal\""),("\"LED hardware wiring stays in portal\"","\"Advanced setup is in the portal\""),("\"Plug IP, type and outlet stay in portal\"","\"Advanced setup is in the portal\""),("\"Hardware mode in portal\"","\"Advanced setup in portal\""),("\"Wiring and RGB setup\"","\"Advanced setup\""))
    for old,new in copy:hub=hub.replace(old,new)

    if hub.count("securityPortalCode()")<2:raise PatchError("RC8 lost portal-code visibility")
    if "TEST / NO CODE" in hub:raise PatchError("RC8 reintroduced insecure no-code copy")
    for forbidden in ("matchSpoolByColor","matchSpoolByMaterial","resolveSpool"):
        if forbidden in hub:raise PatchError(f"forbidden inventory inference present: {forbidden}")
    for must in ("UI8-H","UI8-P","UI8-W","UI8-M","UI8-S","KEEP HOLDING","HOLD TO APPLY","NO PRINTER","Connect a printer to begin","Portal > Diagnostics"):
        if must not in hub:raise PatchError(f"missing RC8 UX marker: {must}")
    hub_path.write_text(hub,encoding="utf-8")
    print("Workshop OS v11.25 RC8 Physical UI Polish applied")


def main() -> int:
    ap=argparse.ArgumentParser();ap.add_argument("--repo",required=True);ap.add_argument("--apply",action="store_true");args=ap.parse_args()
    if not args.apply:raise SystemExit("refusing to modify source without --apply")
    patch(Path(args.repo).resolve());return 0

if __name__=="__main__":raise SystemExit(main())
