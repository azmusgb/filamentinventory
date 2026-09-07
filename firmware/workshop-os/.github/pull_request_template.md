## Scope

<!-- What problem does this PR solve? Keep it narrow enough to audit. -->

## Behavior impact

- [ ] Documentation/provenance only
- [ ] Browser/portal behavior
- [ ] Physical display/touch behavior
- [ ] Printer command behavior
- [ ] Smart-plug/power behavior
- [ ] Audio/microphone behavior
- [ ] OTA/recovery behavior
- [ ] Release/download metadata
- [ ] Upstream baseline/dependency change

## Safety checklist

- [ ] No real credentials, printer access codes, portal codes, tokens, private keys, or household-specific secrets are included.
- [ ] No speculative printer command payloads were introduced.
- [ ] Printer/plug commands remain execution-time validated and fail closed when state/connectivity is stale.
- [ ] Destructive controls remain appropriately guarded.
- [ ] The change preserves printer-slot / smart-plug identity mapping.
- [ ] Generated build output, downloaded artifacts, ZIPs and ad-hoc root validation reports are not committed.

## Validation

- [ ] `Validate`
- [ ] `Release Gate`
- [ ] Static OTA portal integrity, if release/download assets changed
- [ ] Reusable `Workshop OS Firmware Gate`, if firmware/tooling/device contracts changed
- [ ] Native `ws_lcd_350` build
- [ ] Shared `jc3248w535` regression build
- [ ] Browser JavaScript validation where applicable
- [ ] Physical acceptance performed or explicitly marked as required
- [ ] Authenticated framebuffer capture compared when physical visual output changed

## Non-goals / preserved contracts

<!-- List important behavior this PR intentionally does not change. -->

## Acceptance evidence

<!-- Exact head SHA, CI run, screenshots/capture notes, physical test results, hashes, etc. -->
