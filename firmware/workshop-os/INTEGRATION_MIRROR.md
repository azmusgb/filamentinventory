# Workshop OS integration mirror

This directory is a history-preserved integration mirror of the authoritative Workshop OS repository:

- `azmusgb/bambuhelper-smart-display`

## What this mirror is for

Use this tree for:

- Filament Inventory / Workshop OS contract validation;
- unified product-level CI;
- source reconstruction and candidate comparison;
- native `ws_lcd_350` and shared-target regression builds in the integration repository;
- recovery and future architecture planning.

## What this mirror is not

This tree is **not** the current production firmware authority.

Do not use a merge or branch in this mirror alone to claim that Workshop OS has been physically validated, accepted, promoted, or stabilized. Authoritative candidate promotion, release provenance, OTA/recovery ownership, and physical WS350 acceptance remain in `azmusgb/bambuhelper-smart-display` unless the project authority model is explicitly changed.

## Current authoritative promotion train

1. `bambuhelper-smart-display` PR #76 — v11.23 Network / Locale / Layout Expert RC2 — physical acceptance pending.
2. `bambuhelper-smart-display` PR #77 — v11.24 Audio Console RC1 — blocked on #76 physical acceptance, then requires its own speaker/microphone acceptance.
3. Later Instrument UI / Auto Orient work remains implementation evidence until reconciled onto an accepted authoritative base and physically validated.

## Release-state rule

Keep these states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

Integration CI provides software evidence only. It does not substitute for real-device acceptance.
