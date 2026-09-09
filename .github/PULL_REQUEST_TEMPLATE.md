## Purpose

<!-- What problem does this change solve? Keep the scope narrow and identify the authoritative implementation being changed. -->

## Change set

- 

## Authority / invariants

Check every applicable item.

- [ ] Filament Inventory remains the sole inventory authority.
- [ ] This does not create a competing WS350 firmware authority; Workshop OS lives in the canonical `azmusgb/filamentinventory` repository under `firmware/workshop-os/`.
- [ ] Unknown physical or quantity state remains `Unknown`; no authoritative state is inferred from color/material similarity.
- [ ] Canonical spool identity is preserved.
- [ ] One physical spool occupies at most one Printer → Feeder/AMS → Slot placement.
- [ ] Quantity evidence preserves method/source, timestamp, confidence/staleness where applicable.
- [ ] Bill/Aimee isolation is preserved; no cross-profile private data is introduced.
- [ ] Provider/device credentials are not exposed or broadened.
- [ ] Recovery/rollback behavior remains available for any migration or destructive change.

## Validation evidence

Do not mark a gate complete unless it actually ran and passed.

- [ ] Static validation
- [ ] Unit/integration tests
- [ ] Production build
- [ ] Deploy-output verification
- [ ] Browser interaction/visual regression, when UI is affected
- [ ] Exact-head CI
- [ ] Production validation, when applicable
- [ ] Physical WS350 validation, when applicable

Exact head SHA: `pending`

CI / deployment / artifact evidence:

- 

## Release state

Highest state actually reached by this change:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

Current state: **implemented**

## Migration / compatibility

<!-- Schema, local-storage, backup/import, sync, device contract, firmware partition, or rollback implications. Write “None” only after checking. -->

## Remaining gates / non-goals

- 
