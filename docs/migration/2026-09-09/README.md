# Filament Inventory + Workshop OS consolidation — 2026-09-09

Status: staged migration, not production release cutover.

## Current and target

The user authorized `azmusgb/filamentinventory` as the surviving repository, superseding the former two-repository target. The existing inventory/PWA/API paths remain authoritative for inventory. The existing `firmware/workshop-os/` subtree becomes the Workshop OS source destination; no parallel app or new domain implementation is introduced.

Imported source main still records accepted v11.22, static v11.19.1 and v7.2 rollback. It contains stale v11.23 candidate bookkeeping; the live source acceptance ledger instead identifies UI13. That discrepancy is preserved explicitly, not resolved by merging unaccepted UI13 into main. Candidate metadata and device-update publication are separate from accepted/stable state.

## Provenance

- Inventory base: `772f2481d027737fea3110a183fc188fb4655931`.
- Workshop OS main: `69aa36e33afe8bf83639b83315890592b4249591`.
- History-preserving subtree merge: `8a18907` (full SHA in manifest.json). Original source commits remain ancestors, not squashed copies.
- Accepted firmware source: `b6ff19e8617a8cceb380ea3c3621c54ea0048f11`, v11.22.
- Frozen UI13 source: `3672a6f0947af0c890a4f7a79c28b140c901425b`.
- Original [PR #109](https://github.com/azmusgb/bambuhelper-smart-display/pull/109) and [physical acceptance #111](https://github.com/azmusgb/bambuhelper-smart-display/issues/111) remain live and unaccepted.
- `source-refs.txt` inventories original refs. Source branches/tags are preserved under namespaced archive tags in the canonical repository, retaining their original objects without placing old repository layouts on active branches.
- No GitHub Releases existed at capture; `github-releases.json` records this. Release metadata, tracked firmware binaries, source history and original web/OTA endpoints must therefore all be retained.
- `manifest.json` hashes retained evidence and the all-ref recovery bundle. The local bundle is an additional recovery copy, not the only source-history preservation mechanism.

## UI13 evidence

The retained OTA is the original Actions artifact, not a rebuild. It is outside firmware installer directories and excluded from the PWA public-asset allowlist.

- OTA bytes: 2,334,176.
- OTA SHA-256: `8b7ab683879803b37669b675442bc40df4918a7c83947ddff187c9fb4935c0d0`.
- Original artifact ID: `10110277120`.
- Original ZIP SHA-256: `a1e02914b963849a66fcedb374205cbba5a3c95e3177ab8782187251fbc1aef2`.
- Original runs: Validate `34366597032`, static installer `34366597047`, Firmware Gate `34366597044`, UI13 `34366597025`, Release Gate `34366597023`.
- Those runs are source-repository evidence, not evidence for a new monorepo SHA. Physical acceptance remains pending.

## Validation and release paths

Root `CI` retains inventory validation, tests, production build and browser checks. `Workshop OS Firmware Validate` reconstructs the immutable BambuHelper tree, validates contracts/authentication, builds WS350 and the shared board, and packages Full/OTA test evidence. It checks out the exact recorded source SHA. `Workshop OS Release Validation` activates the source release-policy, static installer/hash, settings registry, Companion protocol and iOS compile checks at monorepo paths. Original nested workflows remain auditable provenance.

Existing `release.json`, `releases/current.json`, device manifests, installer URLs and artifact bytes retain their source meanings. No release/promotion job gains write permissions. Validate the existing installer with `cd firmware/workshop-os && python3 build.py`; output goes to its own `dist/`, separate from the PWA. Inventory device contract v1 and all private isolation/quantity semantics are unchanged.

## Cutover blockers

1. Pass monorepo exact-head CI, native builds, Companion compile, release and installer checks; preserve run/artifact IDs.
2. Complete exact-artifact UI13 physical acceptance before merging/promoting its candidate.
3. Validate future installer hosting/device update URLs and any secret/environment/ruleset migration. Current endpoints remain on the old repository; changing URLs requires compatibility and recovery verification.
4. Verify recovery/rollback from the intended canonical distribution. Cross-line migration remains Full at `0x0`, never OTA.
5. Configure protected/ruleset-gated main with required checks. At inspection GitHub reported main unprotected. No protection bypass or stable promotion is part of this migration.
6. Keep original issues/PRs live; linked snapshot evidence does not transfer their state. Reconcile remaining active candidate/backlog work deliberately.

Old repository deletion/archive is forbidden until these cutover requirements are satisfied. Its historical links and provenance must remain available afterward.

## Recovery

The migration is isolated on PR branches. Until merged, abandon the branch to return to the unchanged inventory base. After merge, revert monorepo integration changes through a reviewed revert while retaining history/archive refs. Existing production installer and OTA endpoints remain available throughout. Do not remove the retained Waveshare Home fullflash image, scripts, v7.2 rollback or accepted v11.19.1 binaries.
