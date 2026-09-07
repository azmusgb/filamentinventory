#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, shutil
root=Path(__file__).resolve().parent
dist=root/'dist'
if dist.exists(): shutil.rmtree(dist)
dist.mkdir()
for name in ['index.html','styles.css','app.js','release.json']:
    shutil.copy2(root/name,dist/name)
release=json.loads((root/'release.json').read_text())
assert release['release']=='production-workshop-os-v11.19.1'
assert release['board']['id']=='ws_lcd_350'
def publish(path,size,sha,label):
    raw=(root/path).read_bytes(); actual=hashlib.sha256(raw).hexdigest()
    if len(raw)!=size: raise SystemExit(f'{label} size mismatch: {len(raw)}')
    if actual!=sha: raise SystemExit(f'{label} SHA mismatch: {actual}')
    out=dist/path; out.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(root/path,out)
    print('Verified and published',label,len(raw),actual)
for pid,p in release['profiles'].items():
    publish(p['file'],p['size'],p['sha256'],pid+' Full')
    if p.get('otaFile'): publish(p['otaFile'],p['otaSize'],p['otaSha256'],pid+' OTA')
