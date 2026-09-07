#!/usr/bin/env python3
from pathlib import Path
import base64, sys, zlib

root = Path(__file__).resolve().parent / '.bambuhelper-validation'
encoded = ''.join(
    (root / f'v11_2_workshop_tools_verified.part{i}.b64').read_text().strip()
    for i in range(8)
)
source = zlib.decompress(base64.b64decode(encoded))
exec(compile(source, str(root / 'v11_2_workshop_tools_verified.parts') + ':decoded', 'exec'))

# v11.2 broadens the v11.1 Home & Standby editor into Workshop Tools as well.
# Keep the generated source and visible save action aligned with that scope.
if '--apply' in sys.argv and '--repo' in sys.argv:
    repo = Path(sys.argv[sys.argv.index('--repo') + 1]).resolve()
    app_path = repo / 'web/app.js'
    app = app_path.read_text()
    if 'Save Home & Standby' in app:
        app_path.write_text(app.replace('Save Home & Standby', 'Save Workshop Experience'))
