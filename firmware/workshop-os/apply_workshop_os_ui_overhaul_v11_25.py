#!/usr/bin/env python3
from pathlib import Path
import argparse

class PatchError(RuntimeError): pass

def load(p):
    if not p.exists(): raise PatchError(f'missing {p}')
    return p.read_text(encoding='utf-8')

def once(text,old,new,label):
    n=text.count(old)
    if n!=1: raise PatchError(f'{label}: expected one anchor, found {n}')
    return text.replace(old,new,1)

def block_end(text,start):
    i=text.find('{',start)
    if i<0: raise PatchError('opening brace missing')
    depth=0; string=None; esc=False; line=False; block=False
    while i<len(text):
        c=text[i]; n=text[i+1] if i+1<len(text) else ''
        if line:
            if c=='\n': line=False
        elif block:
            if c=='*' and n=='/': block=False; i+=1
        elif string:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==string: string=None
        elif c=='/' and n=='/': line=True; i+=1
        elif c=='/' and n=='*': block=True; i+=1
        elif c in ('"',"'"): string=c
        elif c=='{': depth+=1
        elif c=='}':
            depth-=1
            if depth==0:return i+1
        i+=1
    raise PatchError('unterminated block')

def replace_block(text,signature,replacement,label):
    start=text.find(signature)
    if start<0 or text.find(signature,start+1)>=0: raise PatchError(f'{label}: signature missing/non-unique')
    return text[:start]+replacement.rstrip()+text[block_end(text,start):]

def sections(root):
    vals={}
    frag=root/'firmware/ui-v11.25'
    for p in frag.glob('*.cppfrag'):
        text=load(p)
        for line in text.splitlines():
            if line.startswith('@@') and line.endswith('@@') and not line.startswith('@@END_'):
                name=line[2:-2]; end=f'@@END_{name}@@'; body=text.split(line,1)[1].split(end,1)[0].strip('\n'); vals[name]=body
    need={'PRIMARY_HELPERS','DRAW_HEADER','BOTTOM_NAV','HOME','PRINTER','WORKSHOP','MORE','SYSTEM','PRINTER_TOUCH','WORKSHOP_TOUCH','HOLD_PROGRESS_INSERT'}
    missing=need-set(vals)
    if missing: raise PatchError(f'missing fragments: {sorted(missing)}')
    return vals

def patch(root):
    f=sections(root)
    bp=root/'include/smart_home_build.h'; build=load(bp)
    build=once(build,'#define SMART_HOME_VERSION "v11.23"','#define SMART_HOME_VERSION "v11.25"','version')
    build=once(build,'#define SMART_HOME_PROFILE "network-touch-ux"','#define SMART_HOME_PROFILE "full-device-ui-overhaul"','profile')
    build=once(build,'#define SMART_HOME_BUILD_LABEL "Smart Home v11.23 Network Locale Layout RC2"','#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC1"','label')
    if 'WORKSHOP_OS_V11_25_UI_OVERHAUL' not in build: build+='\n#define WORKSHOP_OS_V11_25_UI_OVERHAUL 1\n'
    bp.write_text(build,encoding='utf-8')

    hp=root/'src/smart_hub.cpp'; t=load(hp)
    t=once(t,'bool g_toolsView = false;','bool g_toolsView = false;\nuint8_t g_printerMode = 0; // STATUS / AMS / CONTROL','mode state')
    t=once(t,'static int16_t hubNavH() { return 48; }','static int16_t hubNavH() { return 52; }','nav height')
    t=once(t,'static int16_t hubHeaderH() { return hubLandscape() ? 34 : 36; }','static int16_t hubHeaderH() { return 40; }','header height')

    old_home='''static HubRect hubHomeRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    if (i==0) return hr(8,136,306,78);       // materials
    if (i==1) return hr(322,136,W-330,78);   // printer
    if (i==2) return hr(8,222,148,42);       // network
    if (i==3) return hr(164,222,148,42);     // audio
    if (i==4) return hr(320,222,W-328,42);   // recovery
    return hr(8,42,W-16,86);                 // calm hero
  }
  if (i==0) return hr(8,144,W-16,108);
  if (i==1) return hr(8,260,W-16,76);
  const int16_t m=8,g=6,cw=(W-2*m-2*g)/3;
  if (i==2) return hr(m,344,cw,72);
  if (i==3) return hr(m+cw+g,344,cw,72);
  if (i==4) { const int16_t x=m+2*(cw+g); return hr(x,344,W-m-x,72); }
  return hr(8,44,W-16,92);
}'''
    new_home='''static HubRect hubHomeRect(uint8_t i) {
  const int16_t W=tft.width();
  if(hubLandscape()){
    if(i==0)return hr(8,176,148,84); if(i==1)return hr(8,48,304,120); if(i==2)return hr(164,176,148,84);
    if(i==3)return hr(320,48,W-328,120); if(i==4)return hr(320,176,W-328,84); return hr(8,48,304,120);
  }
  if(i==0)return hr(8,274,W-16,70); if(i==1)return hr(8,48,W-16,128); if(i==2)return hr(8,352,(W-24)/2,68);
  if(i==3)return hr(8,184,W-16,82); if(i==4)return hr(16+(W-24)/2,352,(W-24)/2,68); return hr(8,48,W-16,128);
}'''
    t=once(t,old_home,new_home,'home geometry')
    old_pr='''static HubRect hubPrinterActionRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    const int16_t x0=286,g=6,cw=(W-x0-8-g)/2;
    return hr(x0+(i%2)*(cw+g),146+(i/2)*58,cw,50);
  }
  const int16_t g=8,m=8,cw=(W-2*m-g)/2;
  return hr(m+(i%2)*(cw+g),380,cw,46);
}'''
    new_pr='''static HubRect hubPrinterActionRect(uint8_t i) {
  const int16_t W=tft.width(),m=8,g=8,cw=(W-2*m-g)/2;
  if(hubLandscape()) return hr(m+(i%2)*(cw+g),106+(i/2)*76,cw,68);
  return hr(m+(i%2)*(cw+g),106+(i/2)*72,cw,64);
}'''
    t=once(t,old_pr,new_pr,'printer geometry')
    old_ws='''static HubRect hubWorkshopActionRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;
    return hr(m+i*(cw+g),216,cw,48);
  }
  const int16_t m=18,g=8,cw=(W-2*m-g)/2;
  return hr(m+(i%2)*(cw+g),313+(i/2)*54,cw,46);
}'''
    new_ws='''static HubRect hubWorkshopActionRect(uint8_t i) {
  const int16_t W=tft.width(); if(hubLandscape()){const int16_t m=8,g=8,cw=(W-2*m-3*g)/4;return hr(m+i*(cw+g),208,cw,52);}
  const int16_t m=8,g=8,cw=(W-2*m-g)/2;return hr(m+(i%2)*(cw+g),344+(i/2)*68,cw,60);
}'''
    t=once(t,old_ws,new_ws,'workshop geometry')
    old_sys='''static HubRect hubSystemActionRect(uint8_t i) {
  const int16_t W=tft.width();
  if (hubLandscape()) {
    const int16_t x=186,g=6,cw=(276-2*g)/3;
    return hr(x+i*(cw+g),106,cw,44);
  }
  const int16_t g=6,m=18,cw=(W-2*m-2*g)/3;
  return hr(m+i*(cw+g),200,cw,44);
}'''
    new_sys='''static HubRect hubSystemActionRect(uint8_t i) {
  const int16_t W=tft.width(); if(hubLandscape()){const int16_t x=184,g=6,cw=(280-2*g)/3;return hr(x+i*(cw+g),104,cw,48);}
  const int16_t g=6,m=12,cw=(W-2*m-2*g)/3;return hr(m+i*(cw+g),196,cw,50);
}'''
    t=once(t,old_sys,new_sys,'system geometry')

    t=replace_block(t,'static void drawHeader(const char* title, const char* right, uint8_t page) {',f['DRAW_HEADER'],'header')
    t=replace_block(t,'static void uiBottomNav(uint8_t active, const char* nextPage) {',f['BOTTOM_NAV'],'nav')
    t=t.replace('static void drawHome(bool full) {',f['PRIMARY_HELPERS']+'\n\nstatic void drawHome(bool full) {',1)
    for sig,key in [('static void drawHome(bool full) {','HOME'),('static void drawPrinter(bool full) {','PRINTER'),('static void drawWorkshop(bool full) {','WORKSHOP'),('static void drawMore(bool full) {','MORE'),('static void drawSystem(bool full) {','SYSTEM'),('if(cur==SCREEN_HUB_PRINTER){','PRINTER_TOUCH'),('if(cur==SCREEN_HUB_WORKSHOP){','WORKSHOP_TOUCH')]:
        t=replace_block(t,sig,f[key],key)
    old_more='''    for(uint8_t i=0;i<4;i++)if(hubMoreRect(i).contains(x,y)){if(i==0)setPage(SCREEN_HUB_CUSTOM);else if(i==1)setPage(SCREEN_HUB_SYSTEM);else if(i==2){g_toolsView=false;g_displayExperienceView=true;g_displayExperiencePage=0;g_dirty=true;}else{g_displayExperienceView=false;g_displayExperiencePage=0;g_toolsView=true;g_dirty=true;}return true;}return true;}'''
    new_more=old_more.replace('hubMoreRect(i)','hubV1125MoreRect(i)')
    t=once(t,old_more,new_more,'More touch')
    needle='''  }else{
    lastKind=0;
    lastSegments=255;
    return;
  }

  // smartHubHandleTouch() commits when the gesture reaches 650 ms.'''
    repl='  }'+f['HOLD_PROGRESS_INSERT']+'''else{
    lastKind=0;
    lastSegments=255;
    return;
  }

  // smartHubHandleTouch() commits when the gesture reaches 650 ms.'''
    t=once(t,needle,repl,'stop hold branch')
    t=once(t,'hubRc2ButtonRef(bx,by,bw,bh,label,UI_ORANGE,true);','if(kind==3) hubV1125Action(hr(bx,by,bw,bh),label,UI_RED,true,true);\n  else hubRc2ButtonRef(bx,by,bw,bh,label,UI_ORANGE,true);','stop hold render')
    old='''  int16_t px=hubRc2SX((int16_t)(bx+12));
  int16_t py=hubRc2SY((int16_t)(by+bh-11));
  int16_t total=hubRc2SX((int16_t)(bw-24));
  int16_t gap=hubRc2SX(4); if(gap<2)gap=2;
  int16_t sh=hubRc2SY(5); if(sh<3)sh=3;'''
    new='''  int16_t px=kind==3?(int16_t)(bx+12):hubRc2SX((int16_t)(bx+12));
  int16_t py=kind==3?(int16_t)(by+bh-11):hubRc2SY((int16_t)(by+bh-11));
  int16_t total=kind==3?(int16_t)(bw-24):hubRc2SX((int16_t)(bw-24));
  int16_t gap=kind==3?4:hubRc2SX(4); if(gap<2)gap=2;
  int16_t sh=kind==3?5:hubRc2SY(5); if(sh<3)sh=3;'''
    t=once(t,old,new,'stop progress geometry')
    hp.write_text(t,encoding='utf-8')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    if not a.apply: raise SystemExit('Pass --apply')
    root=Path(a.repo).resolve();patch(root);print('Workshop OS v11.25 Full Device UI Overhaul RC1 applied')
if __name__=='__main__': main()
