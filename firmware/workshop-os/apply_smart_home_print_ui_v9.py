#!/usr/bin/env python3
from pathlib import Path
import argparse

class PatchError(RuntimeError): pass

def replace_once(t,a,b,n):
    c=t.count(a)
    if c!=1: raise PatchError(f"{n}: expected 1 match, found {c}")
    return t.replace(a,b,1)

HELPER = r'''
#if defined(BOARD_IS_WS350)
// Smart Home v9.0 UI RC2: dedicated portrait print dashboard for the
// Waveshare ESP32-S3-Touch-LCD-3.5.  The artwork is procedural so it remains
// sharp, tiny in flash and cheap to redraw; live values are repainted in
// isolated zones to avoid the visible full-frame blinking found during v8
// physical acceptance.
namespace {
static constexpr uint16_t V9P_BG      = 0x0042; // #060B10
static constexpr uint16_t V9P_PANEL   = 0x0883; // #0A1118
static constexpr uint16_t V9P_PANEL2  = 0x08C4; // #0E1822
static constexpr uint16_t V9P_BORDER  = 0x2187; // #22313F
static constexpr uint16_t V9P_ORANGE  = 0xFB44; // #FF6B23
static constexpr uint16_t V9P_GREEN   = 0x2F0F; // #2BE37D
static constexpr uint16_t V9P_CYAN    = 0x263B; // #26C6DA
static constexpr uint16_t V9P_BLUE    = 0x3CFF; // #3C9CFF
static constexpr uint16_t V9P_PURPLE  = 0xB35F; // #B06BFF
static constexpr uint16_t V9P_AMBER   = 0xFD84; // #FFB020
static constexpr uint16_t V9P_RED     = 0xF268; // #F04C46
static constexpr uint16_t V9P_TEXT    = 0xF7BF; // #F4F7FA
static constexpr uint16_t V9P_DIM     = 0x9515; // #91A0AD
static constexpr uint16_t V9P_MUTED   = 0x428B; // #40505E

static uint16_t v9pStateColor(const BambuState& s) {
  uint16_t c = stateBadgeColor(s);
  if (s.gcodeStateId == GCODE_RUNNING) return V9P_ORANGE;
  if (s.gcodeStateId == GCODE_PAUSE) return V9P_AMBER;
  if (s.gcodeStateId == GCODE_FAILED) return V9P_RED;
  if (s.gcodeStateId == GCODE_PREPARE) return V9P_BLUE;
  return c;
}

static void v9pCard(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t accent=V9P_BORDER) {
  tft.fillRoundRect(x, y, w, h, 10, V9P_PANEL);
  tft.drawRoundRect(x, y, w, h, 10, accent);
  int16_t lw = (w > 32) ? (w - 24) : 8;
  tft.drawFastHLine(x + 12, y + 1, lw, V9P_PANEL2);
}

static void v9pPill(int16_t x, int16_t y, const char* text, uint16_t c) {
  setFont(tft, FONT_SMALL);
  int16_t w = tft.textWidth(text) + 18;
  tft.fillRoundRect(x, y, w, 20, 10, V9P_PANEL2);
  tft.drawRoundRect(x, y, w, 20, 10, c);
  tft.fillCircle(x + 9, y + 10, 3, c);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(c, V9P_PANEL2);
  tft.drawString(text, x + 15, y + 10);
}

static void v9pProgressRing(int16_t cx, int16_t cy, int16_t r, uint8_t pct, uint16_t c) {
  const uint8_t segs = 28;
  const uint8_t on = (uint8_t)((uint16_t)pct * segs / 100);
  for (uint8_t i=0;i<segs;i++) {
    const float a = (-90.0f + (360.0f * i / segs)) * 0.0174532925f;
    const int16_t x = cx + (int16_t)(cosf(a) * r);
    const int16_t y = cy + (int16_t)(sinf(a) * r);
    tft.fillCircle(x, y, 3, i < on ? c : V9P_MUTED);
  }
  char b[8]; snprintf(b,sizeof(b),"%u%%",(unsigned)pct);
  tft.setTextDatum(MC_DATUM); setFont(tft,FONT_LARGE);
  tft.setTextColor(V9P_TEXT,V9P_PANEL); tft.drawString(b,cx,cy-2);
  setFont(tft,FONT_SMALL); tft.setTextColor(V9P_DIM,V9P_PANEL);
  tft.drawString("PRINT",cx,cy+17);
}

static void v9pPrinterArt(int16_t x, int16_t y) {
  // AMS canopy + four filament bays.
  tft.fillRoundRect(x+14,y,82,22,7,0x31A6);
  tft.drawRoundRect(x+14,y,82,22,7,V9P_BORDER);
  const uint16_t cols[4]={V9P_ORANGE,0xC618,V9P_GREEN,V9P_BLUE};
  for(int i=0;i<4;i++){
    int16_t sx=x+22+i*18;
    tft.fillCircle(sx,y+11,7,0x18E3);
    tft.drawCircle(sx,y+11,6,cols[i]);
    tft.fillCircle(sx,y+11,2,V9P_MUTED);
  }
  // Enclosure and glass chamber.
  tft.fillRoundRect(x+7,y+22,96,74,7,0x10E4);
  tft.drawRoundRect(x+7,y+22,96,74,7,V9P_MUTED);
  tft.fillRect(x+18,y+31,61,53,0x0863);
  tft.drawRect(x+18,y+31,61,53,V9P_BORDER);
  tft.drawFastVLine(x+82,y+32,48,V9P_BORDER);
  tft.fillRoundRect(x+84,y+37,13,20,3,0x1946);
  tft.fillCircle(x+90,y+43,2,V9P_GREEN);
  // Bed + stylized print silhouette.
  tft.drawLine(x+26,y+77,x+72,y+77,V9P_MUTED);
  tft.drawLine(x+31,y+73,x+67,y+73,V9P_BORDER);
  tft.fillTriangle(x+44,y+69,x+52,y+52,x+61,y+69,V9P_ORANGE);
  tft.fillRect(x+49,y+57,8,12,V9P_ORANGE);
  tft.drawLine(x+22,y+88,x+76,y+88,V9P_BORDER);
}

static void v9pMetric(int16_t x, int16_t y, int16_t w, const char* label,
                      const char* value, uint16_t c) {
  tft.fillRoundRect(x,y,w,61,8,V9P_PANEL);
  tft.drawRoundRect(x,y,w,61,8,V9P_BORDER);
  tft.fillRoundRect(x+7,y+7,7,7,3,c);
  tft.setTextDatum(TL_DATUM); setFont(tft,FONT_SMALL);
  tft.setTextColor(V9P_DIM,V9P_PANEL); tft.drawString(label,x+18,y+5);
  setFont(tft,FONT_LARGE); tft.setTextColor(c,V9P_PANEL);
  tft.drawString(value,x+8,y+24);
  // tiny graph-like accent, intentionally deterministic rather than fake data.
  int16_t gy=y+53;
  for(int i=0;i<5;i++) tft.drawLine(x+8+i*11,gy-(i&1?2:0),x+19+i*11,gy-(i%3),c);
}

static void v9pSpool(int16_t cx, int16_t cy, uint16_t filament, bool active, int8_t remain) {
  tft.fillCircle(cx,cy,19,active?V9P_ORANGE:V9P_MUTED);
  tft.fillCircle(cx,cy,17,0x18E3);
  tft.fillCircle(cx,cy,13,filament?filament:V9P_MUTED);
  for(int r=9;r<=13;r+=2) tft.drawCircle(cx,cy,r,filament?filament:V9P_DIM);
  tft.fillCircle(cx,cy,5,V9P_PANEL2);
  tft.drawCircle(cx,cy,5,V9P_MUTED);
  if(active) tft.drawCircle(cx,cy,21,V9P_ORANGE);
  if(remain>=0){ char b[8]; snprintf(b,sizeof(b),"%d%%",(int)remain); setFont(tft,FONT_SMALL);
    tft.setTextDatum(MC_DATUM); tft.setTextColor(active?V9P_ORANGE:V9P_TEXT,V9P_PANEL); tft.drawString(b,cx,cy+28); }
}

static void v9pBottomNav() {
  tft.fillRoundRect(8,438,304,34,11,V9P_PANEL2);
  tft.drawRoundRect(8,438,304,34,11,V9P_BORDER);
  const char* labels[4]={"HOME","PRINTER","WORKSHOP","SYSTEM"};
  const int16_t xs[4]={46,121,203,277};
  for(int i=0;i<4;i++){
    uint16_t c=(i==1)?V9P_ORANGE:V9P_DIM;
    if(i==1){tft.fillRoundRect(xs[i]-31,442,62,26,9,0x2103);tft.drawRoundRect(xs[i]-31,442,62,26,9,V9P_ORANGE);}
    tft.setTextDatum(MC_DATUM); setFont(tft,FONT_SMALL); tft.setTextColor(c,i==1?0x2103:V9P_PANEL2);
    tft.drawString(labels[i],xs[i],455);
  }
}

static void drawPrintingV9Ws350() {
  PrinterSlot& p = displayedPrinter();
  BambuState& s = p.state;
  const bool full = forceRedraw;
  static uint8_t pp=255;
  static int16_t pn=-32768,pb=-32768,pc=-32768,pfan=-32768;
  static uint16_t player=0xffff,ptotal=0xffff;
  static uint16_t prem=0xffff;
  static int8_t pactive=-99;
  static uint32_t pamsSig=0;
  static uint8_t pstate=255;
  static int8_t pwifi=127;

  if(full){
    tft.fillScreen(V9P_BG); markFrameDirty();
    // Header
    tft.fillRect(0,0,320,30,V9P_PANEL2);
    tft.drawFastHLine(0,29,320,V9P_BORDER);
    tft.fillRoundRect(8,5,20,20,6,V9P_ORANGE);
    tft.setTextDatum(MC_DATUM); setFont(tft,FONT_BODY); tft.setTextColor(TFT_WHITE,V9P_ORANGE); tft.drawString("B",18,15);
    tft.setTextDatum(ML_DATUM); tft.setTextColor(V9P_TEXT,V9P_PANEL2); tft.drawString("BambuHelper",34,15);
    setFont(tft,FONT_SMALL); tft.setTextDatum(MR_DATUM); tft.setTextColor(V9P_ORANGE,V9P_PANEL2); tft.drawString("v9 PRINT",312,15);

    // Static surfaces.
    v9pCard(8,36,304,116,V9P_ORANGE);
    v9pPrinterArt(18,48);
    for(int i=0;i<4;i++) v9pMetric(8+i*77,160,72,"--","--",V9P_DIM);
    v9pCard(8,229,304,108,V9P_BORDER);
    tft.setTextDatum(TL_DATUM); setFont(tft,FONT_BODY); tft.setTextColor(V9P_TEXT,V9P_PANEL); tft.drawString("AMS MATERIALS",18,237);
    v9pCard(8,345,304,42,V9P_BORDER);
    v9pCard(8,395,304,35,V9P_BORDER);
    v9pBottomNav();
  }

  // State pill + printer name.
  if(full || pstate != (uint8_t)s.gcodeStateId){
    tft.fillRect(130,43,174,28,V9P_PANEL);
    const char* name=(p.config.name[0]?p.config.name:"Bambu Printer");
    tft.setTextDatum(TL_DATUM); setFont(tft,FONT_BODY); tft.setTextColor(V9P_TEXT,V9P_PANEL);
    char nb[22]; strlcpy(nb,name,sizeof(nb)); tft.drawString(nb,134,44);
    v9pPill(134,66,stateBadgeText(s),v9pStateColor(s));
    pstate=(uint8_t)s.gcodeStateId; markFrameDirty();
  }

  if(full || pp!=s.progress){
    tft.fillRect(205,41,99,84,V9P_PANEL);
    v9pProgressRing(254,82,36,s.progress,V9P_ORANGE);
    pp=s.progress; markFrameDirty();
  }

  // Job name / ETA / layer inside hero.
  if(full || prem!=s.remainingMinutes || player!=s.layerNum || ptotal!=s.totalLayers){
    tft.fillRect(130,104,174,42,V9P_PANEL);
    setFont(tft,FONT_SMALL); tft.setTextDatum(TL_DATUM); tft.setTextColor(V9P_DIM,V9P_PANEL);
    const char* j=jobDisplayName(s); char jb[25]; strlcpy(jb,(j&&j[0])?j:"Waiting for job",sizeof(jb)); tft.drawString(jb,134,106);
    char eb[18]; if(s.remainingMinutes>0) snprintf(eb,sizeof(eb),"ETA %uh %02um",s.remainingMinutes/60,s.remainingMinutes%60); else strlcpy(eb,"ETA --",sizeof(eb));
    tft.setTextColor(V9P_ORANGE,V9P_PANEL); tft.drawString(eb,134,127);
    char lb[20]; snprintf(lb,sizeof(lb),"LAYER %u/%u",(unsigned)s.layerNum,(unsigned)s.totalLayers);
    tft.setTextDatum(TR_DATUM); tft.setTextColor(V9P_BLUE,V9P_PANEL); tft.drawString(lb,300,127);
    prem=s.remainingMinutes; player=s.layerNum; ptotal=s.totalLayers; markFrameDirty();
  }

  // Four telemetry cards.
  const int16_t noz=(int16_t)(s.nozzleTemp+0.5f), bed=(int16_t)(s.bedTemp+0.5f), ch=(int16_t)(s.chamberTemp+0.5f), fan=(int16_t)s.coolingFanPct;
  if(full || noz!=pn){char b[12];snprintf(b,sizeof(b),"%dC",noz);v9pMetric(8,160,72,"NOZZLE",b,V9P_ORANGE);pn=noz;markFrameDirty();}
  if(full || bed!=pb){char b[12];snprintf(b,sizeof(b),"%dC",bed);v9pMetric(85,160,72,"BED",b,V9P_AMBER);pb=bed;markFrameDirty();}
  if(full || ch!=pc){char b[12];snprintf(b,sizeof(b),"%dC",ch);v9pMetric(162,160,72,"CHAMBER",b,V9P_BLUE);pc=ch;markFrameDirty();}
  if(full || fan!=pfan){char b[12];snprintf(b,sizeof(b),"%d%%",fan);v9pMetric(239,160,72,"FAN",b,V9P_CYAN);pfan=fan;markFrameDirty();}

  // AMS signature: present/color/remain/type/active changes.
  uint32_t sig=(uint32_t)(uint8_t)s.ams.activeTray ^ ((uint32_t)s.ams.unitCount<<24);
  for(uint8_t i=0;i<4;i++){
    const AmsTray& tr=s.ams.trays[i];
    sig = (sig*16777619u) ^ tr.colorRgb565 ^ ((uint32_t)(uint8_t)(tr.remain+1)<<16) ^ (tr.present?0x80000000u:0u);
  }
  if(full || sig!=pamsSig || pactive!=s.ams.activeTray){
    tft.fillRect(14,258,292,72,V9P_PANEL);
    if(s.ams.present && s.ams.unitCount>0){
      for(uint8_t i=0;i<4;i++){
        const AmsTray& tr=s.ams.trays[i]; int16_t cx=48+i*73;
        if(tr.present){v9pSpool(cx,279,tr.colorRgb565,i==s.ams.activeTray,tr.remain);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(V9P_DIM,V9P_PANEL);tft.drawString(tr.type[0]?tr.type:"--",cx,323);}
        else {tft.drawCircle(cx,279,17,V9P_MUTED);setFont(tft,FONT_SMALL);tft.setTextDatum(MC_DATUM);tft.setTextColor(V9P_MUTED,V9P_PANEL);tft.drawString("EMPTY",cx,323);}
      }
    }else{
      setFont(tft,FONT_BODY);tft.setTextDatum(MC_DATUM);tft.setTextColor(V9P_DIM,V9P_PANEL);tft.drawString("AMS NOT DETECTED",160,290);
    }
    pamsSig=sig;pactive=s.ams.activeTray;markFrameDirty();
  }

  // Live status strip.
  if(full || pwifi!=s.wifiSignal){
    tft.fillRect(14,351,292,30,V9P_PANEL);
    char w[14];snprintf(w,sizeof(w),"WiFi %ddBm",s.wifiSignal);
    v9pPill(18,355,w,s.wifiSignal>-70?V9P_GREEN:V9P_AMBER);
    const char* sp=(s.speedLevel==1?"Silent":s.speedLevel==2?"Standard":s.speedLevel==3?"Sport":s.speedLevel==4?"Ludicrous":"Auto");
    v9pPill(124,355,sp,V9P_BLUE);
#if HAS_HMS_UI
    char hb[14];snprintf(hb,sizeof(hb),"HMS %u",(unsigned)s.hmsCount);v9pPill(220,355,hb,s.hmsCount?V9P_AMBER:V9P_GREEN);
#else
    v9pPill(220,355,"HEALTH OK",V9P_GREEN);
#endif
    pwifi=s.wifiSignal;markFrameDirty();
  }

  // Bottom context strip.
  if(full){
    tft.fillRect(14,401,292,23,V9P_PANEL);
    tft.setTextDatum(ML_DATUM);setFont(tft,FONT_SMALL);tft.setTextColor(V9P_DIM,V9P_PANEL);
    tft.drawString("LIVE PRINT COMMAND CENTER",20,412);
    tft.setTextDatum(MR_DATUM);tft.setTextColor(V9P_ORANGE,V9P_PANEL);tft.drawString("tap → Smart Home",300,412);
    markFrameDirty();
  }
}
} // namespace
#endif
'''

def apply(repo: Path):
    p=repo/'src'/'display_ui.cpp'; t=p.read_text(encoding='utf-8')
    anchor='#else\nstatic void drawPrinting() {\n  PrinterSlot& p = displayedPrinter();\n  BambuState& s = p.state;\n'
    repl='#else\n'+HELPER+'\nstatic void drawPrinting() {\n  PrinterSlot& p = displayedPrinter();\n  BambuState& s = p.state;\n#if defined(BOARD_IS_WS350)\n  if (!isLandscape()) { drawPrintingV9Ws350(); return; }\n#endif\n'
    t=replace_once(t,anchor,repl,'WS350 square print renderer')
    if 'LIVE PRINT COMMAND CENTER' not in t or 'drawPrintingV9Ws350' not in t: raise PatchError('print visual contract missing')
    p.write_text(t,encoding='utf-8')

    hub=repo/'src'/'smart_hub.cpp'; h=hub.read_text(encoding='utf-8')
    h=h.replace('v9 UI RC1','v9 UI RC2')
    h=h.replace('UI RC1','UI RC2')
    hub.write_text(h,encoding='utf-8')

    b=repo/'include'/'smart_home_build.h'; s=b.read_text(encoding='utf-8')
    s=replace_once(s,'#define SMART_HOME_BUILD_LABEL "Smart Home v9.0 UI RC1"','#define SMART_HOME_BUILD_LABEL "Smart Home v9.0 UI RC2"','build label')
    b.write_text(s,encoding='utf-8')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    if not a.apply: raise SystemExit('Pass --apply')
    apply(Path(a.repo));print('Smart Home v9.0 UI RC2 print-dashboard visual patch applied')
