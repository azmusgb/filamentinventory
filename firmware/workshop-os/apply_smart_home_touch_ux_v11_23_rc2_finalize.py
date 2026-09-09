#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "Workshop OS v11.23 RC2 physical touch finalization"


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_exact(text: str, old: str, new: str, label: str, expected: int = 1) -> str:
    count = text.count(old)
    if count != expected:
        fail(f"{label}: expected {expected} anchor(s), found {count}")
    return text.replace(old, new)


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


ROTATION_HELPERS = r'''

// ---------------------------------------------------------------------------
// Workshop OS v11.23 RC2 physical touch finalization
// ---------------------------------------------------------------------------
static bool g_rotationPreviewMode=false;
static uint8_t g_rotationPreviewValue=0;

static const char* hubRc2RotationValueLabel(uint8_t value) {
  static char label[8];
  snprintf(label,sizeof(label),"R%u",(unsigned)(value&3U));
  return label;
}

static void hubRc2OpenRotationPreview() {
  g_rotationPreviewValue=(uint8_t)(dispSettings.rotation&3U);
  g_rotationPreviewMode=true;
  buzzerPlay(BUZZ_CLICK);
  g_dirty=true;
}

static void hubRc2DrawRotationPreview() {
  tft.fillScreen(UI_BG);
  drawHeader("DISPLAY","ROTATION",3);
  hubRc2CardRef(10,66,225,70,"CURRENT",hubRotationLabel(),
                "Persisted orientation",UI_CYAN);
  hubRc2CardRef(245,66,225,70,"PREVIEW",hubRc2RotationValueLabel(g_rotationPreviewValue),
                "Staged - not applied",UI_ORANGE);
  hubRc2ButtonRef(10,146,460,40,"GUARDED - TOUCH MAPPING CHANGES WITH ROTATION",UI_ORANGE);
  hubRc2ButtonRef(10,196,220,52,"< PREV",UI_CYAN);
  hubRc2ButtonRef(250,196,220,52,"NEXT >",UI_CYAN);
  hubRc2ButtonRef(10,258,140,52,"CANCEL",UI_DIM);
  hubRc2ButtonRef(160,258,310,52,"HOLD TO COMMIT ROTATION",UI_ORANGE);
  hubMarkFrameDirty();
  g_dirty=false;
}
'''


def patch_network_geometry(hub: str) -> str:
    # Page 0 and Page 2 primary navigation: 40 px -> 52 px.
    hub=replace_exact(hub,
        'hubRc2ButtonRef(10,270,110,40,"< BACK",UI_DIM);',
        'hubRc2ButtonRef(10,258,110,52,"< BACK",UI_DIM);',
        'network Back target geometry',2)
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,10,270,110,40)',
        'hubRc2HitRef(x,y,10,258,110,52)',
        'network Back hit geometry',2)
    hub=replace_exact(hub,
        'hubRc2ButtonRef(360,270,110,40,"NEXT >",UI_BLUE);',
        'hubRc2ButtonRef(360,258,110,52,"NEXT >",UI_BLUE);',
        'network Next target geometry',1)
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,360,270,110,40)',
        'hubRc2HitRef(x,y,360,258,110,52)',
        'network Next hit geometry',2)
    hub=replace_exact(hub,
        'hubRc2ButtonRef(360,270,110,40,"REVIEW >",UI_BLUE);',
        'hubRc2ButtonRef(360,258,110,52,"REVIEW >",UI_BLUE);',
        'network Review target geometry')

    # Timezone controls and page navigation.
    hub=replace_exact(hub,
        'hubRc2ButtonRef(10,145,135,48,"< PREV",UI_ORANGE);',
        'hubRc2ButtonRef(10,142,135,54,"< PREV",UI_ORANGE);',
        'timezone Prev geometry')
    hub=replace_exact(hub,
        'hubRc2ButtonRef(335,145,135,48,"NEXT >",UI_ORANGE);',
        'hubRc2ButtonRef(335,142,135,54,"NEXT >",UI_ORANGE);',
        'timezone Next geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,10,145,135,48)',
        'hubRc2HitRef(x,y,10,142,135,54)',
        'timezone Prev hit geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,335,145,135,48)',
        'hubRc2HitRef(x,y,335,142,135,54)',
        'timezone Next hit geometry')
    hub=replace_exact(hub,
        'hubRc2CardRef(10,202,225,54,"CLOCK FORMAT",',
        'hubRc2CardRef(10,202,225,50,"CLOCK FORMAT",',
        'timezone clock card geometry')
    hub=replace_exact(hub,
        'hubRc2CardRef(245,202,225,54,"DATE FORMAT",',
        'hubRc2CardRef(245,202,225,50,"DATE FORMAT",',
        'timezone date card geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,10,202,225,54)',
        'hubRc2HitRef(x,y,10,202,225,50)',
        'timezone clock hit geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,245,202,225,54)',
        'hubRc2HitRef(x,y,245,202,225,50)',
        'timezone date hit geometry')
    info='''    uiDrawFit("Timezone changes apply immediately. Wi-Fi credentials stay browser-only.",
              hubRc2SX(18),hubRc2SY(263),hubRc2SX(444),
              FONT_SMALL,ML_DATUM,UI_DIM,UI_BG);
'''
    hub=replace_exact(hub,info,"",'timezone footer density')
    hub=replace_exact(hub,
        'hubRc2ButtonRef(10,280,110,30,"< BACK",UI_DIM);',
        'hubRc2ButtonRef(10,258,110,52,"< BACK",UI_DIM);',
        'timezone Back geometry')
    hub=replace_exact(hub,
        'hubRc2ButtonRef(360,280,110,30,"NEXT >",UI_BLUE);',
        'hubRc2ButtonRef(360,258,110,52,"NEXT >",UI_BLUE);',
        'timezone page Next geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,10,280,110,30)',
        'hubRc2HitRef(x,y,10,258,110,52)',
        'timezone Back hit geometry')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,360,280,110,30)',
        'hubRc2HitRef(x,y,360,258,110,52)',
        'timezone page Next hit geometry')

    # Address Editor: make the actual edit controls finger-sized.
    hub=replace_exact(hub,'hubRc2ButtonRef(10,96,130,44,','hubRc2ButtonRef(10,94,130,48,','address mode geometry')
    hub=replace_exact(hub,'hubRc2ButtonRef(150,96,70,44,"< FIELD",UI_CYAN);','hubRc2ButtonRef(150,94,70,48,"< FIELD",UI_CYAN);','address previous field geometry')
    hub=replace_exact(hub,'hubRc2ButtonRef(225,96,170,44,hubNetworkFieldLabel(g_networkEditField),UI_CYAN);','hubRc2ButtonRef(225,94,170,48,hubNetworkFieldLabel(g_networkEditField),UI_CYAN);','address field label geometry')
    hub=replace_exact(hub,'hubRc2ButtonRef(400,96,70,44,"FIELD >",UI_CYAN);','hubRc2ButtonRef(400,94,70,48,"FIELD >",UI_CYAN);','address next field geometry')
    hub=replace_exact(hub,'hubRc2HitRef(x,y,10,96,130,44)','hubRc2HitRef(x,y,10,94,130,48)','address mode hit geometry')
    hub=replace_exact(hub,'hubRc2HitRef(x,y,150,96,70,44)','hubRc2HitRef(x,y,150,94,70,48)','address previous field hit geometry')
    hub=replace_exact(hub,'hubRc2HitRef(x,y,400,96,70,44)','hubRc2HitRef(x,y,400,94,70,48)','address next field hit geometry')

    for x,w in ((10,108),(127,108),(244,108),(361,109)):
        hub=replace_exact(hub,
            f'hubRc2ButtonRef({x},150,{w},48,',
            f'hubRc2ButtonRef({x},148,{w},52,',
            f'address octet draw {x}')
    hub=replace_exact(hub,
        'hubRc2HitRef(x,y,(int16_t)(10+i*117),150,(i==3)?109:108,48)',
        'hubRc2HitRef(x,y,(int16_t)(10+i*117),148,(i==3)?109:108,52)',
        'address octet hit geometry')

    for x,w in ((10,108),(127,108),(244,108),(361,109)):
        hub=replace_exact(hub,
            f'hubRc2ButtonRef({x},208,{w},48,',
            f'hubRc2ButtonRef({x},202,{w},52,',
            f'address delta draw {x}')
        hub=replace_exact(hub,
            f'hubRc2HitRef(x,y,{x},208,{w},48)',
            f'hubRc2HitRef(x,y,{x},202,{w},52)',
            f'address delta hit {x}')

    return hub


def patch_rotation_preview(hub: str) -> str:
    anchor='''static void hubNetworkDiscardEdit() {
  g_networkEditLoaded=false;
  hubLoadNetworkEdit();
  buzzerPlay(BUZZ_CLICK);
  g_dirty=true;
}
'''
    hub=replace_exact(hub,anchor,anchor+ROTATION_HELPERS,'rotation helper insertion')

    draw_start='static void drawDisplayExperience(bool full) {'
    pos,end,block=get_braced_block(hub,draw_start,'display renderer')
    if 'g_rotationPreviewMode' not in block:
        block=block.replace(draw_start,draw_start+'\n  if(g_rotationPreviewMode){hubRc2DrawRotationPreview();return;}',1)
    hub=hub[:pos]+block+hub[end:]

    hub=replace_exact(hub,
        '''    uiDisplaySettingCard(hubMoreRect(3), "ROTATION", hubRotationLabel(),
                         "HOLD TO ROTATE CLOCKWISE", UI_GREEN);''',
        '''    uiDisplaySettingCard(hubMoreRect(3), "ROTATION", hubRotationLabel(),
                         "Tap to open guarded preview", UI_GREEN);''',
        'rotation Extras card')

    touch_start='    if(g_displayExperienceView){'
    pos,end,block=get_braced_block(hub,touch_start,'display touch block')
    opening=block.find('{')
    modal=r'''
      if(g_rotationPreviewMode){
        if(hubRc2HitRef(x,y,10,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+3U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,250,196,220,52)){
          g_rotationPreviewValue=(uint8_t)((g_rotationPreviewValue+1U)%4U);
          buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,10,258,140,52)){
          g_rotationPreviewMode=false;buzzerPlay(BUZZ_CLICK);g_dirty=true;return true;
        }
        if(hubRc2HitRef(x,y,160,258,310,52)){
          if(longPress){
            dispSettings.rotation=(uint8_t)(g_rotationPreviewValue&3U);
            g_rotationPreviewMode=false;
            hubPersistDisplayExpert();
          }else{
            buzzerPlay(BUZZ_CLICK);g_dirty=true;
          }
          return true;
        }
        return true;
      }
'''
    if 'if(g_rotationPreviewMode)' not in block:
        block=block[:opening+1]+modal+block[opening+1:]
    old='''          else if(i==3&&longPress){dispSettings.rotation=(uint8_t)((dispSettings.rotation+1U)%4U);hubPersistDisplayExpert();}
          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}'''
    new='''          else if(i==3){hubRc2OpenRotationPreview();}
          else{buzzerPlay(BUZZ_CLICK);g_dirty=true;}'''
    block=replace_exact(block,old,new,'rotation touch routing')
    hub=hub[:pos]+block+hub[end:]
    return hub


def apply(repo: Path) -> None:
    hub_path=repo/'src'/'smart_hub.cpp'
    build_path=repo/'include'/'smart_home_build.h'
    for path in (hub_path,build_path):
        if not path.exists():
            fail(f'missing reconstructed source: {path}')

    build=build_path.read_text(encoding='utf-8')
    if 'Smart Home v11.23 Network Locale Layout RC2' not in build:
        fail('RC2 finalization requires reconstructed v11.23 RC2 source')

    hub=hub_path.read_text(encoding='utf-8')
    if MARKER in hub:
        print('v11.23 RC2 physical touch finalization already applied')
        return
    if 'Workshop OS v11.23 RC2 touch UX and temporary trusted-LAN portal bypass' not in hub:
        fail('RC2 touch-UX base marker missing')

    hub=patch_network_geometry(hub)
    hub=patch_rotation_preview(hub)
    hub += f'\n// {MARKER}\n'
    hub_path.write_text(hub,encoding='utf-8')
    print('Workshop OS v11.23 RC2 physical touch finalization applied')


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo',required=True)
    ap.add_argument('--apply',action='store_true')
    args=ap.parse_args()
    if not args.apply:
        fail('refusing to modify source without --apply')
    apply(Path(args.repo).resolve())
    return 0


if __name__=='__main__':
    raise SystemExit(main())
