# Workshop OS v11.19.1 — Physical Fit RC2

This release was intentionally limited to the two remaining physical text-fit defects found by the real v11.19 22-view WS350 framebuffer capture.

## Corrections

1. Workshop loaded-material empty state changes from the physically clipped `NO ACTIVE T...` rendering to `AMS IDLE`, with `External spool or idle` retained as context.
2. System Audio Lab action changes from the physically clipped `EVENTS...` rendering to `EVENTS`. Current state remains visible in the Audio Lab status text and button accent.
3. Adds a rendered-fit CI contract with conservative pixel envelopes for the exact controls that overflowed in v11.19.
4. Explicitly bans the known v11.19 overflow strings from the generated firmware source.

## Preserved behavior

- v11.19 portal code + IP on System
- AMS unknown/sentinel guard
- configured-but-inactive card styling
- `CUSTOM` persisted-value handling
- Power / Auto-Off consistency
- Home two-line hero
- simplified More summary
- authenticated 22-view framebuffer capture
- v11.17 fail-closed printer controls and stale-state behavior
- existing smart-plug slot mapping

No new feature family was introduced.

## Acceptance

**PASSED — 2026-09-03.** RC2 was recaptured across all 22 authenticated WS350 views, validated against the rendered-fit contracts, rebuilt on the native `ws_lcd_350` and shared `jc3248w535` targets, and promoted to `main` as the accepted v11.19.1 source line.
