# V8.4 Release Gate

This document separates automated software confidence from physical-device acceptance.

## Automated gate

- Repository contains no tracked `firmware/build/` output.
- Release manifests are valid JSON.
- Required production firmware assets exist.
- Validation workflow completes successfully.
- Release metadata identifies the intended channel and version.

## Physical gate

The following cannot be proven by CI and must be checked on the real WS LCD 3.5 device:

1. Cold boot reaches the expected Home/Standby experience.
2. Touch targets respond reliably and do not overlap.
3. Standby remains visually stable and does not continuously redraw.
4. Printer telemetry reflects the actual Bambu printer.
5. AMS/material information reflects the actual printer state.
6. Navigation survives repeated transitions and back/home use.
7. Wi-Fi reconnect works after a network interruption.
8. Reboot returns to a usable authenticated state.
9. OTA update completes and the device boots the intended image.
10. Recovery remains available if an update fails.

## Release states

`development` → source is being changed.

`rc` → automated validation passes; physical acceptance may still be pending.

`stable` → automated validation and physical acceptance are complete.

Never represent an RC as physically validated. Never overwrite a known-good recovery artifact merely to simplify the release tree.