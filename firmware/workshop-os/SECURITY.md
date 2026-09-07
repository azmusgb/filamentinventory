# Security Policy

Workshop OS is local-first firmware that can observe and issue commands to physical printers and mapped smart plugs. Security reports are treated as hardware-control issues, not ordinary UI bugs.

## Supported lines

| Surface | Status | Security handling |
| --- | --- | --- |
| Workshop OS v11.19.1 accepted source | Supported | Current accepted source baseline. |
| Workshop OS v11.20 Portal Auth RC1 | Active security candidate | Portal/session and AP-boundary hardening are validated here and still require physical WS350 acceptance before promotion. |
| Static installer v7.2 | Supported for the published download channel | Security-relevant installer/recovery defects should be assessed independently from source-line fixes. |
| Static rollback v7.1 | Recovery-only | Retained only as the immediate rollback image. |
| Historical RCs / archived manifests | Unsupported | Kept for provenance only. |

## Report privately when possible

Do **not** publish working credentials, device access codes, Wi-Fi passphrases, printer serials, private IP inventories, API tokens, exploit payloads, or other sensitive reproduction data in a public issue.

Use GitHub's private vulnerability reporting / Security Advisory flow if it is enabled for this repository. If a private reporting option is not available, open a minimal public issue stating that you have a security concern and need a private contact path; do not include exploit details or secrets.

## High-priority security classes

Please treat these as security-sensitive even when they look like functional bugs:

- authentication or session bypass in the local portal;
- an AP/setup/recovery mode that unintentionally grants broader admin authority;
- unauthorized printer control or smart-plug power control;
- command replay after disconnect/reconnect;
- a destructive command that bypasses state validation or confirmation;
- exposure of Wi-Fi credentials, Bambu access codes, portal codes, tokens, backups, or settings secrets;
- unsafe OTA/recovery behavior or rollback bypass;
- unauthenticated framebuffer/capture endpoints;
- credential-bearing screenshots, framebuffer bundles, diagnostics, logs, process arguments, or configuration exports;
- cross-printer command routing or incorrect printer-to-plug mapping;
- memory corruption reachable through network/touch input;
- supply-chain changes that alter the pinned upstream or build inputs without review.

## Portal/session expectations

For an authenticated Workshop OS source line:

- normal LAN management routes require the boot-scoped portal-code session;
- mutating requests retain same-origin protection in addition to authentication;
- logout and reboot invalidate prior portal sessions;
- the rotating portal code is intentionally shown on the physical System screen for the owner but must not be printed to Serial/log output;
- normal-LAN Recovery access is authenticated;
- **AP mode is not itself an authorization credential**;
- ordinary first-boot/fallback AP access is limited to captive Wi-Fi onboarding essentials unless the owner establishes a portal-code session;
- independent unauthenticated rescue access exists only in deliberate Recovery Safe Mode and is scoped to the dedicated recovery/status/actions plus application OTA/factory-reset surface;
- printer control, mapped printer power, settings export, debug and unrelated privileged surfaces must not become anonymously accessible merely because the device entered AP mode;
- portal-code login may remain available on AP so the owner can establish authenticated access to protected surfaces when needed;
- the portal credential must not be embedded in command-line arguments, shared captures, diagnostics, or support artifacts.

The pinned upstream setup/fallback AP currently uses a known default Wi-Fi password. That is an onboarding transport control, **not** a substitute for Workshop OS authorization. Changes that reintroduce blanket `isAPMode()` authorization are security regressions.

## Control-safety expectations

Security fixes must preserve the fail-closed control model documented in `docs/CONTROL_SAFETY.md`:

- commands are revalidated at execution time;
- stale/offline commands are discarded rather than delayed;
- destructive actions remain guarded;
- printer/plug identity is resolved explicitly;
- speculative command payloads are not introduced without a proven backend contract.

## Sensitive test data and captures

Use synthetic values in fixtures, docs, screenshots and bug reports. Never commit a real household SSID/password, printer access code, device portal code, cloud token, private key, or personally identifying device inventory.

The supported `scripts/capture-ws350-views.zsh` workflow must remain credential-safe:

- portal-code input is not echoed or passed in process arguments;
- cookie/login/raw-frame temporary files use restrictive permissions and are removed on normal exit and interruption;
- raw framebuffer bytes are kept only in a private temporary file outside the retained capture directory;
- the live System portal-code region is redacted **before** retained PPM or PNG output is written;
- printer configuration/settings exports are excluded because those models can contain access codes or other secrets;
- Release Gate must fail if these capture-safety invariants are weakened.

If a secret is committed accidentally, deleting it in a later commit is not sufficient. Rotate/revoke the credential first, then remove it from the active repository and evaluate whether history rewriting is warranted.
