#!/usr/bin/env python3
from pathlib import Path
import argparse

MARKER = r'\n\n/* Smart Home v11.3 Printer Control */\n'


def patch(repo: Path):
    app_path = repo / 'web/app.js'
    text = app_path.read_text()
    pos = text.find(MARKER)
    if pos < 0:
        # Idempotent success if the corrected block is already present.
        if '/* Smart Home v11.3 Printer Control */' in text:
            print('Smart Home v11.3 browser serialization already corrected')
            return
        raise RuntimeError('missing v11.3 browser block marker')

    prefix = text[:pos]
    block = text[pos:]
    # The original patch used a Python raw string, so only this appended block
    # contains literal backslash-n separators. Convert those separators to
    # actual source newlines without touching escaped JavaScript string content.
    block = block.replace(r'\n', '\n')
    app_path.write_text(prefix + block)
    print('Smart Home v11.3 browser serialization fixed')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    if not args.apply:
        print('Use --apply to modify the reconstructed BambuHelper tree')
        return
    patch(Path(args.repo).resolve())


if __name__ == '__main__':
    main()
