# Filament Inventory

Filament Inventory is a mobile-first, local-first workshop inventory system for physical 3D-printing filament. Its job is to answer, from evidence:

> What filament exists, where is it, who can use it, what is loaded, how much remains, what needs attention, and can a print run now?

The PWA runs on iPhone, iPad, and desktop, with profile-scoped cloud sync, QR spool identity, Printer / AMS placement, quantity evidence, print readiness, activity/audit history, recovery snapshots, and a grounded inventory Assistant.

## Authority

This repository, `azmusgb/filamentinventory`, is authoritative for inventory-domain truth:

- spool identity and lifecycle;
- quantity evidence and remaining-filament calculations;
- private profile/household semantics;
- QR/intake and physical-spool workflows;
- Printer / AMS inventory relationships;
- sync, backup, recovery, audit, and usage history;
- print readiness and print-job planning;
- grounded inventory Assistant behavior;
- versioned device-facing inventory APIs.

The selected single-repository destination is `azmusgb/filamentinventory`, with Workshop OS in `firmware/workshop-os/`. Inventory/API code stays at its existing paths. Firmware owns device behavior; the inventory service owns physical inventory facts.

Migration is staged: the imported accepted source and original history are retained, while UI13 remains a separate physical-acceptance candidate. Existing device update endpoints and release channels stay in service until the monorepo release and recovery paths are validated. See [the migration record](docs/migration/2026-09-09/README.md) for exact provenance and cutover blockers.

The legacy `firmware/waveshare-home` tree retained here is historical/migration/recovery material. It is **not** a second active firmware product line.

See [`docs/REPOSITORY_BOUNDARIES.md`](docs/REPOSITORY_BOUNDARIES.md).

## Product invariants

The application must not silently invent physical truth.

- Unknown remains `Unknown`.
- A spool is not assigned to an AMS slot merely because color/material matches telemetry.
- Each physical spool has one durable canonical ID; QR codes resolve to that ID rather than encoding mutable state.
- One physical spool may occupy at most one `Printer -> Feeder/AMS -> Slot` placement.
- Archived/empty/inactive spools cannot remain loaded.
- Scale-backed quantity evidence is stronger than estimates; estimates must remain visibly estimated.
- Conflicting or stale evidence should be surfaced rather than silently discarded.
- Private inventory is private by default; cross-profile data leakage is a zero-tolerance defect.
- The LLM explains authoritative data; it does not create authoritative facts.

## Current implementation

### Private profile isolation

The live application currently supports two isolated private workspaces:

- `Bill`
- `Aimee`

They are separate routed local/cloud states, not filters over one combined live inventory. Each profile has isolated spool records, measurement history, audit history, backups, sync settings/keys, printer relationships, and cloud namespace.

This Bill/Aimee implementation is **transitional**. The target domain model is:

`Household -> Member -> Private/Shared Resources`

Future sharing and ownership transfer must be explicit and auditable; the current hard isolation must not be weakened during that migration.

### Quantity evidence

Current effective quantity is evidence-oriented and follows the canonical spool contract:

1. valid gross minus tare -> measured quantity;
2. usage-derived remaining estimate when available;
3. visual estimate;
4. otherwise `Unknown`.

Measurement history is retained separately. The target architecture is a first-class additive `QuantityEvidence` history with stable evidence IDs, provenance, source/observed timestamps, confidence, staleness, and conflict-safe synchronization. Until that migration is authoritative, legacy quantity fields and measurement logs remain compatibility inputs.

### Printer / AMS placement

Loaded placement is explicit and profile-scoped. Spools can be stored or loaded into a configured printer/feed path, including external/direct-spool feeders.

Placement writes are explicit physical actions. Slot conflicts are validated, and placement fields are reconciled atomically during concurrent sync so a merge cannot create a hybrid assignment.

### Physical spool workflow

QR labels contain a public application URL plus spool identity only; they do not contain private sync credentials.

Scanning/opening a spool converges on one physical-object workflow for:

- identify/verify;
- weigh;
- load/move/unload;
- QR labels;
- edit/details;
- archive/restore;
- print-related actions.

Existing authoritative mutation paths are reused rather than duplicated behind the physical-spool UI.

### Print readiness

Print Readiness is deterministic and answers `Can I print this now?` only when the requirement is evidenced.

Missing, blank, invalid, zero, or negative required grams return **Undetermined**. The engine does not invent required quantity from model name, material, color, or inventory state.

When a requirement is known, readiness considers quantity confidence, safety margin, material/color constraints, loaded state, reservations, and current print-job commitments.

### Grounded Assistant

The Assistant uses deterministic inventory evidence as its grounding boundary.

- provider credentials stay server-side;
- model output is validated against the active profile's evidence slice;
- fabricated evidence IDs and unsupported numeric claims are rejected;
- a configured transport is not reported as a successful grounded model response;
- deterministic local fallback remains authoritative when model transport or grounding fails;
- the WS350 never stores an OpenAI/provider key.

Grounded LLM behavioral acceptance remains a separate gate from implementation/configuration.

## Cloud sync and recovery

Cloud sync is both key-protected and profile-scoped. Requests include:

- `X-Filament-Sync-Key`
- `X-Filament-Profile`

The server derives cloud identity from profile + private key, keeping current private workspaces separate even when migrated devices began with the same legacy key value.

The sync path supports:

- concurrent spool reconciliation;
- atomic placement reconciliation;
- tombstone-aware deletion;
- measurement/audit/print-job history merge;
- bounded recovery snapshots;
- restore by snapshot revision;
- device activity metadata.

Recovery and rollback paths are part of correctness, not optional maintenance features.

## PWA / UX direction

Primary navigation stays compact and task-oriented. The product currently emphasizes Home, Inventory, Printer, Assistant, and Activity, with lower-frequency tools behind contextual actions or More.

UI changes are reviewed for hierarchy, density, touch targets, keyboard/focus behavior, accessibility, reduced motion, loading/empty/error states, offline/reconnect behavior, and stale-client recovery.

## Quality and release gates

Pull requests and pushes to `main` run the repository CI gate, including static validation, automated tests, production build/deploy-output validation, and browser interaction/visual regression. Successful `main` CI is followed by Production Smoke against the exact deployed commit.

Keep release states distinct:

`implemented -> built -> tested -> runtime validated -> production validated -> physically validated -> accepted -> stable`

CI does not prove WS350 physical acceptance. Deployment/configuration does not prove Grounded LLM behavioral success.

Repository governance still tracks enforcement of a protected/ruleset-gated `main`; until that GitHub setting is active, use PR-based changes and the existing `Validate` gate as the working discipline.

## Current roadmap / engineering docs

- [`docs/ROADMAP_STATUS_2026-09-06.md`](docs/ROADMAP_STATUS_2026-09-06.md) — current implementation vs acceptance state
- [`docs/REPOSITORY_BOUNDARIES.md`](docs/REPOSITORY_BOUNDARIES.md) — repository authority and firmware boundary
- [`docs/UNIFIED_MONOREPO_MIGRATION.md`](docs/UNIFIED_MONOREPO_MIGRATION.md) — history-preserved Workshop OS integration import and authority-cutover gates
- [`docs/DEVICE_API_CONTRACT_V1.md`](docs/DEVICE_API_CONTRACT_V1.md) — current device-facing inventory contract
- [`docs/GROUNDED_LLM_ACCEPTANCE_V1.md`](docs/GROUNDED_LLM_ACCEPTANCE_V1.md) — grounded-model acceptance protocol
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — engineering and release discipline
- [`SECURITY.md`](SECURITY.md) — credential/security handling

## Development

```bash
npm install
npx netlify dev
```

Run the complete local repository gate with:

```bash
npm run ci
```

Do not report a validation stage as passed unless it actually ran and passed on the source/build/deployment being described.
