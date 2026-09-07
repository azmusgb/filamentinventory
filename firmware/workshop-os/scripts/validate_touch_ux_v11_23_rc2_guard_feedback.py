#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def need(body: str, marker: str, label: str) -> None:
    if marker not in body:
        raise SystemExit(f"V11.23 RC2 GUARD FEEDBACK FAILED: missing {label}: {marker}")


def forbid(body: str, marker: str, label: str) -> None:
    if marker in body:
        raise SystemExit(f"V11.23 RC2 GUARD FEEDBACK FAILED: forbidden {label}: {marker}")


def before(body: str, first: str, second: str, label: str) -> None:
    a = body.find(first)
    b = body.find(second)
    if a < 0 or b < 0 or a >= b:
        raise SystemExit(
            f"V11.23 RC2 GUARD FEEDBACK FAILED: declaration order {label}: "
            f"{first!r} must precede {second!r}"
        )


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} <reconstructed-repo>")
    repo = Path(sys.argv[1]).resolve()
    project = Path(__file__).resolve().parents[1]
    hub = (repo / 'src/smart_hub.cpp').read_text(encoding='utf-8', errors='replace')
    main_cpp = (repo / 'src/main.cpp').read_text(encoding='utf-8', errors='replace')
    header = (repo / 'src/smart_hub.h').read_text(encoding='utf-8', errors='replace')
    delta = (project / 'apply_smart_home_touch_ux_v11_23_rc2_guard_feedback.py').read_text(
        encoding='utf-8', errors='replace'
    )

    for marker in [
        'Workshop OS v11.23 RC2 guarded-action feedback',
        'Workshop OS v11.23 RC2 rotation preview declaration-order fix',
        'void smartHubUpdateHoldProgress(uint16_t rawX, uint16_t rawY, uint32_t holdMs)',
        'uint8_t segments=(uint8_t)((holdMs*5U+649U)/650U);',
        'kind=1;bx=240;by=252;bw=230;bh=56;label="HOLD APPLY";',
        'kind=2;bx=160;by=258;bw=310;bh=52;label="HOLD ROTATION";',
        'tft.fillRoundRect((int16_t)(px+i*(sw+gap)),py,sw,sh,2,c);',
        'smartHubUpdateHoldProgress(rawX,rawY,0);',
        'printerActive?"PRINTER ACTIVE - DISPLAY WILL RESTART"',
        '"Printer continues; display reconnects"',
        'printerActive?"HOLD APPLY - DISPLAY RESTART":"HOLD APPLY + RESTART"',
        'displayedPrinter().state.printing',
        'displayedPrinter().state.gcodeStateId==GCODE_PAUSE',
    ]:
        need(hub, marker, 'guarded-action source contract')

    # C++ declaration order is a real compile-time contract: the Display
    # renderer references both symbols before the full rotation-preview helper
    # implementation later in the translation unit.
    before(
        hub,
        'static bool g_rotationPreviewMode=false;',
        'static void drawDisplayExperience(bool full) {',
        'rotation preview state before display renderer',
    )
    before(
        hub,
        'static void hubRc2DrawRotationPreview();',
        'static void drawDisplayExperience(bool full) {',
        'rotation preview prototype before display renderer',
    )

    need(
        main_cpp,
        'if (hubTouchHasPoint) smartHubUpdateHoldProgress(hubTouchX, hubTouchY, d);',
        'live hold dispatch',
    )
    need(main_cpp, 'hubTouchMaxHoldMs >= 650', 'existing long-press threshold')
    need(
        header,
        'void smartHubUpdateHoldProgress(uint16_t rawX, uint16_t rawY, uint32_t holdMs);',
        'hold-feedback declaration',
    )

    # The reconstructed hub legitimately contains inherited printer-control
    # functions from accepted releases. The v11.23 guarded-feedback delta must
    # remain informational only, so inspect the delta that introduced this
    # behavior rather than rejecting inherited symbols elsewhere in smart_hub.cpp.
    for marker in [
        'requestPrinterControlCommand',
        'requestLightCommand',
        'requestPower',
        'tasmotaSetPower',
    ]:
        forbid(delta, marker, 'printer-control addition in guarded network feedback delta')

    print('v11.23 RC2 guarded-action feedback: PASS')
    print('Hold progress: 5 live segments tied to 650 ms commit threshold')
    print('Network Apply: active-printer display restart/reconnect warning')
    print('Rotation preview: declaration order compile-safe')
    print('Printer behavior: informational only; guarded-feedback delta adds no printer command')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
