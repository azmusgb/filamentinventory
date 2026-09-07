# v11.23 RC2 security hardening

The mergeable v11.23 candidate preserves the accepted v11.20 portal/session boundary **throughout the active reconstruction path**, not only in the final compiled source.

An early RC2 hardware iteration historically bundled a station-mode trusted-LAN bypass with otherwise useful touch/layout changes. That experiment is retained only as historical provenance. The active firmware gate now uses `apply_smart_home_touch_ux_v11_23_rc2_secure.py`, which reuses only the touch/layout transformation and never invokes the legacy security or browser bypass patchers.

The physical-touch finalization is applied through `apply_smart_home_touch_ux_v11_23_rc2_finalize_secure.py`, which supplies only the inert compatibility marker required by the historical finalizer and immediately restores the secure marker. It never introduces an auth bypass, browser banner, or LAN-open build flag.

The later `apply_smart_home_auth_restore_v11_23_rc2.py` remains in the stack as defense-in-depth and idempotent normalization. It is no longer relied on to repair an intentionally insecure active stage.

Active/final v11.23 candidate requirements:

- normal station-mode management requires the boot-scoped portal-code session at every active reconstruction stage;
- mutating requests retain the existing same-origin check;
- AP/setup/recovery authorization remains route-scoped;
- `WORKSHOP_OS_TEMP_LAN_OPEN` must never appear in active reconstructed source;
- `if (!isAPMode()) return true;` must never appear in active reconstructed security policy;
- the browser must never receive the historical trusted-LAN bypass banner;
- the secure touch validator runs immediately after touch application and again after physical-touch finalization;
- the final authenticated-boundary validator runs again before settings parity, JavaScript validation, native builds, or packaging;
- framebuffer capture uses an authenticated cookie established through `/login`;
- capture credentials are entered without echo and sent to curl over stdin;
- the obsolete no-code physical-acceptance helper is not tracked or packaged;
- the packaged firmware artifact does not include the historical insecure patch helper;
- native WS350 and shared-display builds run only after all authenticated-boundary checks pass.

This boundary makes the historical development-only authentication relaxation non-executable in the current candidate path rather than merely removing it at the end.
