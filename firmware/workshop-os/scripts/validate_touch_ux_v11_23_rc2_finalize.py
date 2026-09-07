#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def need(body: str, marker: str, label: str) -> None:
    if marker not in body:
        raise SystemExit(f"V11.23 RC2 FINALIZE FAILED: missing {label}: {marker}")


def forbid(body: str, marker: str, label: str) -> None:
    if marker in body:
        raise SystemExit(f"V11.23 RC2 FINALIZE FAILED: forbidden {label}: {marker}")


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <reconstructed-repo>")
    repo=Path(sys.argv[1]).resolve()
    hub=(repo/'src/smart_hub.cpp').read_text(encoding='utf-8',errors='replace')
    web=(repo/'src/web_server.cpp').read_text(encoding='utf-8',errors='replace')

    for marker in [
        'Workshop OS v11.23 RC2 physical touch finalization',
        'g_rotationPreviewMode',
        'g_rotationPreviewValue',
        'hubRc2DrawRotationPreview',
        '"Tap to open guarded preview"',
        '"HOLD TO COMMIT ROTATION"',
        'hubRc2HitRef(x,y,10,196,220,52)',
        'hubRc2HitRef(x,y,250,196,220,52)',
        'hubRc2HitRef(x,y,10,258,140,52)',
        'hubRc2HitRef(x,y,160,258,310,52)',
        'else if(i==3){hubRc2OpenRotationPreview();}',
        'hubRc2ButtonRef(10,258,110,52,"< BACK",UI_DIM)',
        'hubRc2ButtonRef(10,142,135,54,"< PREV",UI_ORANGE)',
        'hubRc2ButtonRef(335,142,135,54,"NEXT >",UI_ORANGE)',
        'hubRc2ButtonRef(10,148,108,52,',
        'hubRc2ButtonRef(10,202,108,52,"-10",UI_PURPLE)',
    ]:
        need(hub,marker,'physical touch contract')

    for marker in [
        'hubRc2ButtonRef(10,280,110,30,"< BACK",UI_DIM)',
        'hubRc2ButtonRef(10,270,110,40,"< BACK",UI_DIM)',
        '"HOLD TO ROTATE CLOCKWISE"',
        'else if(i==3&&longPress){dispSettings.rotation=',
    ]:
        forbid(hub,marker,'superseded touch behavior')

    # Rotation is a modal interaction, not a new deterministic framebuffer page.
    # This deliberately keeps the established RC2 acceptance catalog at 32 views.
    forbid(web,'"display-rotation"','unexpected capture-catalog expansion')

    print('v11.23 RC2 physical touch finalization: PASS')
    print('Network primary navigation: enlarged explicit controls')
    print('Address octets/deltas: 52 px reference targets')
    print('Rotation: dedicated preview modal + guarded hold commit')
    print('Capture catalog: unchanged')
    return 0


if __name__=='__main__':
    raise SystemExit(main())
