# Repository hygiene

Workshop OS keeps its active repository surface intentionally small and auditable.

## Source that stays tracked

The incremental `apply_smart_home_*.py` patches, supporting `assets/`, reconstruction scripts and `.bambuhelper-validation/` payloads are **source inputs**. They remain under version control because the accepted firmware is deterministically reconstructed from the pinned BambuHelper baseline rather than stored as a flattened upstream fork.

Current-version acceptance evidence also remains tracked when it documents behavior that CI or physical validation depends on.

## Content that does not belong in the active surface

Do not commit:

- generated PlatformIO output;
- local ZIPs or downloaded Actions artifacts;
- temporary artifact directories;
- ad-hoc validation reports in the repository root;
- abandoned prototype application trees;
- obsolete per-version GitHub Actions workflows;
- historical RC manifests/reports in the active `releases/` namespace.

Use GitHub Actions artifacts for candidate binaries. Preserve historical textual provenance under `docs/archive/` and `releases/archive/`.

## Workflow policy

Exactly four workflow files are expected:

- `firmware-candidate.yml` — reusable WS350 + shared-target firmware gate;
- `validate.yml` — repository validation;
- `release-gate.yml` — accepted-source/release metadata validation;
- `release-main.yml` — static download portal integrity validation.

Do not add `bambuhelper-vX-...yml` release-specific workflows. Update `firmware-candidate.yml` in place when the accepted baseline or next candidate changes.

## Firmware retention

The Git repository is not the long-term binary archive. Keep only:

- the currently accepted static-download Full + OTA pair; and
- one immediately previous, physically accepted Full + OTA rollback pair.

At present that means v7.2 plus v7.1 rollback. New Workshop OS candidates stay in Actions artifacts until the static download channel is intentionally promoted.

Older generations remain recoverable from Git history and release provenance and should not be duplicated as tracked multi-megabyte binaries.

## Release state

`releases/current.json` is the machine-readable authority for the accepted source line and active candidate state. `release.json` is the machine-readable authority for the static installer/download channel. They are intentionally separate.
