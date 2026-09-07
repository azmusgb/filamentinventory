#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def patch(root: Path) -> None:
    rel = Path("src/smart_hub.cpp")
    path = root / rel
    if not path.exists():
        raise PatchError(f"missing {rel}")

    text = path.read_text()
    include = '#include "led.h"'
    if include not in text:
        anchor = '#include "tasmota.h"'
        count = text.count(anchor)
        if count != 1:
            raise PatchError(f"LED header anchor: expected one {anchor}, found {count}")
        text = text.replace(anchor, anchor + '\n' + include, 1)
        path.write_text(text)

    verified = path.read_text()
    if verified.count(include) != 1:
        raise PatchError('smart_hub.cpp must contain exactly one #include "led.h"')
    if 'saveLedSettings();' not in verified or 'initLed();' not in verified:
        raise PatchError('v11.16 LED persistence/runtime apply contract missing')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    patch(Path(args.repo).resolve())
    print("Smart Home v11.16 LED header dependency fixed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
