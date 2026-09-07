# Unified Filament Inventory + Workshop OS Monorepo Migration

Status: **MIGRATION PLAN — NOT YET AUTHORITATIVE**

This document records the deliberate migration from two active repositories to one canonical product repository without weakening inventory truth, firmware recovery, evidence provenance, household isolation, or physical acceptance discipline.

## Canonical target

`azmusgb/filamentinventory` becomes the single canonical repository for the complete workshop product.

The existing PWA/cloud application remains at the repository root during the first migration stage so the current Netlify production path is not disrupted.

Workshop OS is imported under:

`firmware/workshop-os/`

The former `azmusgb/bambuhelper-smart-display` repository remains intact and writable during migration, then becomes read-only/archive material only after the cutover gates below pass.

## Authority after cutover

One repository does not mean one undifferentiated subsystem. Authority remains explicit by directory:

- root application / cloud / domain modules: inventory, spool identity, evidence, household/member semantics, ownership/sharing, placement, usage/activity, print readiness, forecasting, Grounded Assistant, PWA and device-facing data contract;
- `firmware/workshop-os/`: WS350 firmware, touchscreen UX, printer controls, hardware integrations, audio/mic/BLE, networking, OTA, recovery and physical acceptance;
- `contracts/` or equivalent shared package: versioned redacted device contract between inventory/cloud and firmware;
- `docs/`: product-wide architecture, release and recovery documentation.

No firmware code may become authoritative for inventory truth. No cloud/PWA code may invent physical device state.

## Migration principles

1. Preserve Git history from both repositories. Do not copy files into a new folder and discard provenance.
2. Preserve the currently deployed Filament Inventory root layout until Netlify/build-path migration is explicitly validated.
3. Import Workshop OS into `firmware/workshop-os/` without changing its accepted/candidate release state.
4. Preserve the current Workshop OS recovery/full-image process and all accepted artifact identities.
5. Preserve candidate separation. v11.23 RC2, v11.24 Audio, and later Instrument UI/auto-orientation work remain candidates until their own exact-head and physical gates pass.
6. Recreate firmware CI at the monorepo root because nested `.github/workflows` files do not execute as repository workflows.
7. Add path filters so PWA-only changes do not unnecessarily build firmware and firmware-only changes do not unnecessarily run production web smoke tests.
8. Do not archive the former firmware repository until the monorepo can reconstruct, build and package the same firmware from exact source and the rollback path has been proven.
9. Do not delete historical Waveshare Home/recovery material during the migration.
10. Keep release states distinct: implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable.

## Proposed top-level shape

```text
filamentinventory/
  .github/workflows/
    ci.yml
    production-smoke.yml
    firmware-validate.yml
    firmware-candidate.yml
    firmware-release-gate.yml

  firmware/
    workshop-os/
      [preserved Workshop OS source/history]

  contracts/
    device/

  docs/
    architecture/
    recovery/
    release/

  [existing PWA/cloud files remain at root initially]
```

A later cleanup may move the web application under `apps/web/`, but only after Netlify, service-worker paths, offline behavior, production smoke, and deployed routing are proven against the new location.

## Required cutover gates

The migration is not complete until all of the following are evidenced:

- both repository histories are reachable from the unified repository history;
- the current Filament Inventory production build and Netlify deployment remain unchanged or are intentionally migrated and revalidated;
- the current PWA CI passes from the monorepo;
- firmware reconstruction passes from `firmware/workshop-os/`;
- native `ws_lcd_350` build passes;
- shared `jc3248w535` regression build passes;
- Full and OTA artifacts are reproduced and hashed;
- firmware release/acceptance documentation points to the monorepo exact SHA;
- current accepted WS350 recovery image and rollback procedure are preserved;
- candidate physical-acceptance state is not promoted by the repository move itself;
- source-of-truth tests confirm no inventory authority moved into firmware;
- device contract remains versioned, redacted and profile-scoped;
- former firmware repository is marked superseded/read-only only after the preceding gates pass.

## Candidate preservation

The repository merge must not flatten the Workshop OS release train into `main` merely because code is being relocated.

At migration time:

- import the accepted/current Workshop OS `main` lineage into the unified `main` migration branch;
- preserve v11.23 RC2 and v11.24 Audio as explicit candidate branches in the unified repository;
- preserve the Instrument UI + Audio + QMI8658 auto-orientation work as a later prototype/candidate branch until its physical acceptance scope is defined and passed.

## Recommended cutover sequence

1. Freeze unrelated repository cleanup during the migration window.
2. Create a migration branch from `filamentinventory/main`.
3. Import `bambuhelper-smart-display` history under `firmware/workshop-os/` using a history-preserving subtree/filter-repo migration, not a squash/copy.
4. Re-home and adapt Workshop OS workflows to root `.github/workflows/` with `working-directory: firmware/workshop-os` and path filters.
5. Update repository-boundary and roadmap documents to identify this repository as the only active authority after cutover.
6. Recreate the current firmware candidate branches in the unified repository against the imported firmware subtree.
7. Run PWA, cloud, firmware, security, artifact, recovery and candidate validation.
8. Merge the migration only after the exact migration head is green.
9. Validate production web deployment from unified `main`.
10. Validate that future Workshop OS candidate builds originate from unified `main`/candidate branches.
11. Mark `azmusgb/bambuhelper-smart-display` superseded/read-only and keep it for historical links and recovery provenance.

## Non-goals

The repository migration itself does not:

- accept v11.23 RC2 or v11.24;
- prove QMI8658 physical axis mapping;
- change spool identity, quantity, ownership, placement or evidence;
- migrate Bill/Aimee directly to the final Household/Member model;
- change Grounded Assistant acceptance state;
- change WS350 credentials, recovery layout or OTA semantics;
- delete historical recovery artifacts.
