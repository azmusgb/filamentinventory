#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import apply_workshop_instrument_ui_v1 as ui

# Reuse the reviewed Instrument UI transformation against the v11.24 Audio
# Console identity. Only the expected/prototype build identity changes; visual
# behavior and security checks remain owned by the v1 applicator.
ui.EXPECTED_LABEL = 'Smart Home v11.24 Audio Console RC1'
ui.PROTOTYPE_LABEL = 'Smart Home v11.24 Instrument UI Prototype + Audio Console'
ui.EXPECTED_PROFILE = 'audio-console'
ui.PROTOTYPE_PROFILE = 'instrument-ui-audio-console-prototype'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit('refusing to modify reconstructed source without --apply')
    ui.apply(Path(args.repo).resolve())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
