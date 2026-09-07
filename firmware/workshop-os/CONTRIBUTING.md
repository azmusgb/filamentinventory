# Contributing to Waveshare Workshop OS

Workshop OS controls real hardware. Contributions are welcome, but the bar for a UI tweak and the bar for a printer/power command are intentionally different.

## Start from the accepted source

- Base normal work on `main`.
- Keep **one active firmware candidate PR** to `main` at a time.
- Do not create a new version-specific Actions workflow. Update `.github/workflows/firmware-candidate.yml` in place when the candidate/baseline changes.
- Do not silently repin the upstream BambuHelper baseline. Follow `docs/UPSTREAM_SYNC.md`.

## Repository boundaries

The incremental `apply_smart_home_*.py` files, selected assets and `.bambuhelper-validation/` payloads are deterministic source inputs. Do not remove them merely because they look historical.

Do not commit:

- `.pio/` or other generated build directories;
- downloaded Actions artifacts or local ZIPs;
- ad-hoc validation reports in the repository root;
- real Wi-Fi credentials, printer access codes, portal codes, account tokens, private keys, device serial inventories, or other household-specific secrets;
- speculative Bambu command payloads copied from unverified examples.

## Printer/control changes

Read `docs/CONTROL_SAFETY.md` before changing any control path.

A new or modified command must have:

1. a proven backend/protocol path;
2. explicit printer-slot/plug identity resolution;
3. execution-time state/connectivity validation;
4. fail-closed behavior when state becomes stale or MQTT disconnects;
5. an appropriate confirmation/hold guard for destructive actions;
6. browser and physical UI behavior that share the same authority rather than diverging implementations;
7. source-level contract tests and real-hardware acceptance where the risk warrants it.

Do not add speed/fan/temperature/AMS manipulation merely because a payload can be guessed. Evidence comes before surface area.

## Validation tiers

### Documentation / provenance only

At minimum:

- `Validate`
- `Release Gate`
- static portal integrity when release/download metadata is touched

### Firmware, patch stack, device contract, visual or control changes

Require the reusable `Workshop OS Firmware Gate`, including:

- deterministic reconstruction;
- device/safety contracts;
- browser JavaScript validation;
- native `ws_lcd_350` build;
- shared `jc3248w535` regression build;
- Full-image merge and OTA packaging.

### Physical UI / touch / audio / recovery / control behavior

CI is necessary but not sufficient. Record the exact device acceptance scope in the PR. Use authenticated framebuffer capture when visual correctness is involved, and physically exercise any affected touch/audio/control path before promotion.

## Pull requests

Keep PRs narrow enough to audit. State:

- what changed;
- what did **not** change;
- whether firmware behavior changes;
- whether printer/power commands change;
- validation performed;
- physical acceptance required/performed;
- any upstream overlap;
- whether release/download metadata changes.

The repository PR template exists to make these distinctions explicit.
