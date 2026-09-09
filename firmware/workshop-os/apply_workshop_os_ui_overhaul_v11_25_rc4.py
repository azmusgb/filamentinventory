#!/usr/bin/env python3
"""Apply Workshop OS v11.25 RC4 product-polish presentation after RC3.

RC4 is a presentation/interaction refinement. It does not change inventory
or printer command authority, recovery behavior, or the temporary station-LAN
no-code boundary used only for physical acceptance.
"""
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

def sections(source_root):
    vals={}
    frag=source_root/'firmware/ui-v11.25-rc4'
    for p in frag.glob('*.cppfrag'):
        text=load(p)
        for line in text.splitlines():
            if line.startswith('@@') and line.endswith('@@') and not line.startswith('@@END_'):
                name=line[2:-2]; end=f'@@END_{name}@@'; body=text.split(line,1)[1].split(end,1)[0].strip('\n'); vals[name]=body
    need={'HOME_RECT','PRINTER_COLOR','CARD','MODE_TABS','ACTION','TELEMETRY','AMS_SLOT','HEADER','BOTTOM_NAV','HOME','PRINTER','WORKSHOP','MORE','SYSTEM'}
    missing=need-set(vals)
    if missing: raise PatchError(f'missing RC4 fragments: {sorted(missing)}')
    return vals

def patch(repo):
    source_root=Path(__file__).resolve().parent
    f=sections(source_root)
    bp=repo/'include/smart_home_build.h'; build=load(bp)
    build=once(build,
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC3"',
        '#define SMART_HOME_BUILD_LABEL "Workshop OS v11.25 Full Device UI Overhaul RC4 Product Polish"',
        'RC4 build label')
    if 'WORKSHOP_OS_V11_25_UI_OVERHAUL_RC4' not in build:
        build+='\n#define WORKSHOP_OS_V11_25_UI_OVERHAUL_RC4 1\n'
    bp.write_text(build,encoding='utf-8')

    hp=repo/'src/smart_hub.cpp'; hub=load(hp)
    # Theme tokens must be declared before drawHeader/uiBottomNav and all later RC4 renderers.
    pc=f['PRINTER_COLOR']; fn='static uint16_t hubV1125PrinterColor'
    ix=pc.find(fn)
    if ix<0: raise PatchError('RC4 printer color fragment missing function')
    tokens=pc[:ix].rstrip(); printer_color=pc[ix:]
    header_sig='static void drawHeader('
    if tokens not in hub:
        pos=hub.find(header_sig)
        if pos<0: raise PatchError('RC4 header anchor missing')
        hub=hub[:pos]+tokens+'\n\n'+hub[pos:]

    for sig,key,repl in [
        ('static HubRect hubHomeRect(uint8_t i) {','HOME_RECT',f['HOME_RECT']),
        ('static void hubV1125Card(','CARD',f['CARD']),
        ('static uint16_t hubV1125PrinterColor(','PRINTER_COLOR',printer_color),
        ('static void hubV1125ModeTabs() {','MODE_TABS',f['MODE_TABS']),
        ('static void hubV1125Action(','ACTION',f['ACTION']),
        ('static void hubV1125TelemetryColumn(','TELEMETRY',f['TELEMETRY']),
        ('static void hubV1125AmsSlot(','AMS_SLOT',f['AMS_SLOT']),
        ('static void drawHeader(','HEADER',f['HEADER']),
        ('static void uiBottomNav(','BOTTOM_NAV',f['BOTTOM_NAV']),
        ('static void drawHome(bool full) {','HOME',f['HOME']),
        ('static void drawPrinter(bool full) {','PRINTER',f['PRINTER']),
        ('static void drawWorkshop(bool full) {','WORKSHOP',f['WORKSHOP']),
        ('static void drawMore(bool full) {','MORE',f['MORE']),
        ('static void drawSystem(bool full) {','SYSTEM',f['SYSTEM']),
    ]:
        hub=replace_block(hub,sig,repl,key)
    hp.write_text(hub,encoding='utf-8')

    cp=repo/'web/app.css'; css=load(cp)
    marker='Workshop OS v11.25 RC4 Product Polish'
    if marker not in css:
        css+='\n\n'+load(source_root/'assets/v11_25_rc4_device.css')+'\n'
    cp.write_text(css,encoding='utf-8')
    print('Workshop OS v11.25 RC4 Product Polish applied')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--repo',required=True);ap.add_argument('--apply',action='store_true');a=ap.parse_args()
    if not a.apply: raise SystemExit('refusing to modify source without --apply')
    patch(Path(a.repo).resolve());return 0
if __name__=='__main__': raise SystemExit(main())
