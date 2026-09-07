#!/usr/bin/env python3
from pathlib import Path
import base64, sys, zlib

payload = Path(__file__).resolve().parent / '.bambuhelper-validation' / 'v10_5_physical.zlib.b64'
source = zlib.decompress(base64.b64decode(payload.read_text().strip()))
exec(compile(source, str(payload) + ':decoded', 'exec'))

# The v10.5 Home dashboard calls the existing hubTouchHealthy() helper earlier
# in smart_hub.cpp than its historical definition. Keep the large, validated
# payload stable and make the C++ declaration order explicit here.
if '--apply' in sys.argv and '--repo' in sys.argv:
    repo = Path(sys.argv[sys.argv.index('--repo') + 1])
    hub = repo / 'src' / 'smart_hub.cpp'
    text = hub.read_text(encoding='utf-8')
    declaration = 'static bool hubTouchHealthy();'
    anchor = '// ---------------------------------------------------------------------------\n// Smart Home v10.5 physical information architecture helpers\n// ---------------------------------------------------------------------------'
    if declaration not in text:
        if anchor not in text:
            raise RuntimeError('v10.5 touch-helper declaration anchor not found')
        text = text.replace(anchor, declaration + '\n\n' + anchor, 1)
        hub.write_text(text, encoding='utf-8')
    print('Smart Home v10.5 touch-helper declaration order fixed')
