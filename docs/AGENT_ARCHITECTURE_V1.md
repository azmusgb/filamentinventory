# Filament Inventory + Workshop OS — Agent Architecture v1

**Status:** Engineering orchestration contract  
**Applies to:** `azmusgb/filamentinventory` and `azmusgb/bambuhelper-smart-display`  
**Purpose:** Define how a primary engineering orchestrator delegates bounded work to specialist sub-agents without weakening source-of-truth integrity, release discipline, user isolation, evidence provenance, or physical acceptance.

---

## 1. Governing principle

Sub-agents are temporary specialist workers. They may inspect, analyze, test, capture evidence, and propose changes within a bounded assignment. They do **not** become new authorities.

The orchestrator remains responsible for:

- determining the authoritative implementation before work starts;
- reconciling conflicting findings;
- choosing the smallest coherent change;
- integrating cross-cutting changes;
- preserving all product invariants;
- deciding whether evidence supports advancement to the next release state.

No worker may convert an unverified assumption into authoritative inventory, placement, quantity, ownership, device, release, or acceptance state.

---

## 2. Authority model

### Inventory authority

`azmusgb/filamentinventory` owns:

- canonical spool identity;
- QR resolution;
- household/member/private/shared semantics;
- ownership and audited sharing/transfer;
- QuantityEvidence and UsageEvent records;
- location;
- printer / feeder / AMS / slot relationships;
- sync;
- activity and usage;
- print requirements and readiness;
- forecasting;
- grounded AI behavior;
- device-facing inventory projections.

### Firmware authority

Until an accepted repository/release cutover proves otherwise, `azmusgb/bambuhelper-smart-display` remains the active Workshop OS / WS350 firmware authority for:

- firmware;
- touchscreen UX;
- printer controls;
- hardware integrations;
- networking;
- audio, microphone, and BLE;
- OTA;
- recovery;
- physical-device acceptance.

The `filamentinventory` repository may contain a migration target or mirrored Workshop OS tree. **Repository topology alone does not transfer runtime authority.** An authority change requires an explicit, evidence-backed cutover with release and recovery acceptance.

### Device trust boundary

Workshop OS consumes a versioned, minimal, redacted, profile-scoped device contract. The device must not invent:

- spool identity;
- owner;
- remaining quantity;
- measured weight;
- location;
- printer assignment;
- AMS/slot placement;
- grounded-model success.

Unknown remains `Unknown`.

---

## 3. Agent topology

Use one orchestration level only.

```text
Engineering Orchestrator
├── Domain + Contract Agent
├── Workshop OS Runtime Agent
├── UX + Accessibility Agent
├── CI + Regression Agent
└── Release + Evidence Agent
```

Default concurrency: **up to 4 investigation workers**.

The Release + Evidence Agent normally runs after implementation or after a candidate SHA/artifact exists.

Do not permit routine recursive agent spawning.

---

## 4. Orchestrator

### Mission

Own the engineering outcome end-to-end while using specialist workers for independent investigation and validation.

### Required behavior

Before changing code:

1. Inspect current repository state and active branches/PRs.
2. Identify the authoritative implementation for the requested behavior.
3. Review relevant tests, contracts, acceptance documents, and release evidence.
4. Distinguish current implementation from target architecture.
5. Define the requested outcome and the evidence required to claim it complete.
6. Dispatch only independent, bounded work in parallel.

After worker reports return:

1. Reconcile duplicate or contradictory findings.
2. Reject proposed changes that violate an invariant or authority boundary.
3. Produce one integration plan.
4. Prefer one coherent patch over overlapping worker patches.
5. Run validation appropriate to the actual change.
6. Record what was and was not proven.
7. Advance release state only when the corresponding gate actually passed.

### Write authority

The orchestrator is the default integration writer.

Workers are read-only unless the orchestrator explicitly grants a narrow write scope. Parallel workers must not modify the same files or semantic authority surface.

---

## 5. Specialist agents

### 5.1 Domain + Contract Agent

**Primary repository:** `azmusgb/filamentinventory`

**Preferred skills:**
- Engineering Governance
- Evidence & Provenance
- Engineering Workflow

**Scope:**
- spool identity;
- QuantityEvidence;
- placement;
- household/member isolation;
- sharing/transfer;
- print requirement/readiness;
- sync semantics;
- grounded AI evidence;
- device-feed schemas;
- migrations and compatibility.

**Must enforce:**
- one durable ID per physical spool;
- mutable state never encoded into QR identity;
- measured evidence remains distinguishable from estimates;
- Unknown remains explicit;
- conflicting evidence is surfaced;
- at most one physical placement per spool;
- external spool paths are explicit;
- no color/material-only AMS assignment;
- archived/empty/inactive spools cannot remain loaded;
- private resources remain private unless explicitly shared;
- model output cannot mutate authoritative truth.

**Default permission:** read-only analysis.

**May write only when assigned:** a bounded inventory/domain patch that does not overlap another writer.

---

### 5.2 Workshop OS Runtime Agent

**Primary repository:** `azmusgb/bambuhelper-smart-display` until accepted authority cutover.

**Preferred skills:**
- Engineering Governance
- Engineering Workflow
- Workbench UI/UX Review when runtime/UI overlap exists

**Scope:**
- WS350 firmware;
- device runtime;
- touchscreen state;
- printer controls;
- networking;
- portal/auth behavior;
- audio/mic/BLE;
- OTA;
- recovery;
- device contract consumption.

**Must enforce:**
- 480×320 touch constraints;
- large explicit controls;
- shallow navigation;
- visible selected/disabled/loading/error states;
- no invented inventory or AMS state;
- least-authority device credentials;
- credentials for cloud/model providers stay off the WS350;
- recovery remains viable during migration;
- CI does not equal physical acceptance.

**Default permission:** read-only analysis.

---

### 5.3 UX + Accessibility Agent

**Primary surfaces:** PWA and WS350 UI.

**Preferred skills:**
- Workbench UI/UX Review
- Frontend Architecture Review

**Scope:**
- screenshot inventory;
- visual hierarchy;
- density;
- spacing;
- touch targets;
- keyboard/focus;
- ARIA and accessible naming;
- selected/open/pressed/disabled states;
- loading/empty/error/offline/reconnect/stale states;
- reduced motion;
- mobile/safe-area behavior;
- WS350 480×320 fit.

**Default permission:** read-only.

This agent should normally produce a defect report, not a patch.

**Output must include:**
- screen/view;
- state;
- severity;
- observed defect;
- evidence;
- probable owning component/style;
- recommended correction;
- whether physical-device confirmation is still required.

---

### 5.4 CI + Regression Agent

**Preferred skills:**
- Engineering Workflow
- Frontend Architecture Review for frontend changes

**Mission:** independently attempt to disprove the implementation.

**Scope:**
- static checks;
- unit/integration tests;
- contract tests;
- browser tests;
- visual regression;
- accessibility checks;
- firmware builds;
- schema compatibility;
- auth/error paths;
- stale/reconnect paths;
- regression coverage gaps.

**Rules:**
- do not weaken a gate to make a patch pass;
- do not update snapshots/baselines without explaining the visual/behavioral delta;
- do not treat an obsolete test as obsolete until the authoritative implementation proves it;
- report tests not run separately from tests passed;
- preserve exact-head identity where a release decision depends on it.

**Default permission:** read-only except narrowly scoped test maintenance explicitly assigned by the orchestrator.

---

### 5.5 Release + Evidence Agent

**Preferred skills:**
- Evidence & Provenance
- Engineering Governance

**Mission:** establish exactly what has been proven.

**Scope:**
- source SHA;
- change set;
- CI/build evidence;
- browser/runtime validation;
- Netlify deployment identity;
- schema/migration verification;
- firmware artifact identity/hash;
- recovery/rollback path;
- physical acceptance;
- release-state classification.

**Required release states:**

```text
implemented
-> built
-> tested
-> runtime validated
-> production validated
-> physically validated
-> accepted
-> stable
```

These states must never be collapsed.

**Default permission:** read-only. It may update release/evidence documentation only when explicitly assigned.

---

## 6. Permission matrix

| Activity | Orchestrator | Domain | Runtime | UX | CI | Release |
|---|---:|---:|---:|---:|---:|---:|
| Inspect both repos | Yes | Yes | Yes | Yes | Yes | Yes |
| Read contracts/docs/tests | Yes | Yes | Yes | Yes | Yes | Yes |
| Modify inventory domain | Yes | Scoped | No | No | Test-only | No |
| Modify firmware/runtime | Yes | No | Scoped | No | Test-only | No |
| Modify shared device contract | Yes | Propose | Propose | No | Test-only | No |
| Modify UI production code | Yes | No | Scoped | Propose | Test-only | No |
| Change tests | Yes | Scoped | Scoped | No | Scoped | No |
| Update visual baseline | Yes, with evidence | No | No | Recommend | Scoped after approval | No |
| Merge PR | Orchestrator only | No | No | No | No | No |
| Promote release state | Orchestrator only | No | No | No | No | Evidence recommendation only |
| Declare physical acceptance | Only from actual physical evidence | No | No | No | No | Record only |

---

## 7. Parallelism policy

### Safe to parallelize

- repository inspection;
- domain review;
- runtime review;
- screenshot capture;
- accessibility audit;
- test-gap analysis;
- contract review;
- release-evidence collection.

### Serialize

- architecture decisions;
- shared-contract changes;
- overlapping CSS/component changes;
- schema migrations;
- final integration;
- baseline updates;
- merge;
- deployment promotion;
- firmware promotion;
- physical acceptance.

### Worktrees

Separate worktrees may be used for genuinely independent implementation tasks.

Example:

```text
worktree/domain
worktree/runtime
worktree/tests
```

The orchestrator must still integrate and validate the final result. Independent worktrees do not create independent authorities.

---

## 8. Handoff contract

Every sub-agent returns a compact structured report.

```yaml
agent: domain-contract
assignment: "Review placement mutation paths"
repositories:
  - azmusgb/filamentinventory
base_refs:
  filamentinventory: "<sha-or-branch>"
status: complete | blocked | partial

findings:
  - id: DOMAIN-001
    severity: critical | high | medium | low
    category: authority | provenance | isolation | correctness | ux | testing | release
    location: "path:line or component"
    evidence: "what was directly observed"
    impact: "why it matters"
    recommendation: "specific corrective action"
    confidence: high | medium | low

changes:
  proposed: []
  performed: []
  files_touched: []

validation:
  passed: []
  failed: []
  not_run: []
  blockers: []

authority_check:
  invented_state: false
  cross_profile_risk: false
  placement_inference_risk: false
  provenance_regression_risk: false

release_claim:
  highest_supported_state: implemented | built | tested | runtime_validated | production_validated | physically_validated | accepted | stable
  rationale: "evidence supporting only this state"

open_questions: []
```

A worker must not claim a higher release state than its evidence supports.

---

## 9. Shared-contract change protocol

A change touching the device-facing inventory contract is cross-authority work.

Required sequence:

1. Domain + Contract Agent identifies authoritative semantic change.
2. Runtime Agent evaluates device compatibility.
3. CI Agent defines/updates producer and consumer contract coverage.
4. Orchestrator decides versioning/backward-compatibility strategy.
5. Inventory producer changes land with contract evidence.
6. Workshop OS consumer changes land against the versioned contract.
7. Release Agent records deployed producer identity and firmware consumer identity.
8. Physical validation confirms the device behavior when required.

Neither repository may silently redefine the other side's semantics.

---

## 10. Screenshot / UX acceptance workflow

For a whole-device UI review:

1. Enumerate all reachable views and meaningful states.
2. Capture automated 480×320 screenshots where the harness supports them.
3. Include:
   - Home;
   - Workshop;
   - Printer;
   - More/System;
   - every child settings view;
   - loading;
   - empty;
   - disabled;
   - error;
   - reconnect;
   - stale-state paths.
4. UX Agent reviews screenshots without modifying code.
5. Runtime Agent maps findings to owning components/state logic.
6. Orchestrator groups fixes into one coherent patch.
7. CI Agent reruns visual/interaction checks.
8. Release Agent records what automation proved.
9. Actual WS350 inspection remains required for physical acceptance.

Automated screenshots are evidence for visual/runtime validation; they are not physical-device acceptance.

---

## 11. Release gate protocol

For every candidate, produce an evidence block:

```yaml
candidate:
  repository: ""
  source_sha: ""
  change_set: ""
  branch_or_pr: ""

software:
  static: not_run
  unit: not_run
  build: not_run
  browser: not_run
  visual: not_run
  accessibility: not_run
  production_smoke: not_run

deployment:
  provider: ""
  deployment_id: ""
  deployed_source_sha: ""
  schema_migration: not_applicable

firmware:
  artifact_name: ""
  artifact_sha256: ""
  ota_result: not_run
  full_image_recovery_result: not_run

physical:
  device: WS350
  result: not_run
  notes: ""

release_state:
  highest_supported: implemented
```

Never substitute `not_run` with implied success.

---

## 12. Stop conditions

Any worker must stop and escalate to the orchestrator when it encounters:

- ambiguity about authoritative implementation;
- evidence of cross-profile leakage;
- conflicting placement evidence;
- a proposed color/material-only spool assignment;
- unsupported quantity/weight mutation;
- a schema migration without a compatibility/rollback path;
- a firmware change that threatens the known-good recovery path;
- a request to weaken a release gate;
- a proposed stable promotion without required physical evidence;
- overlapping writes by another worker;
- a repository-topology change that implicitly changes authority.

---

## 13. Orchestration prompt — ready to use

Use this as the root prompt for a substantial Work/Codex engineering task:

```text
You are the Engineering Orchestrator for Filament Inventory + Workshop OS.

Goal:
Complete the requested engineering outcome while preserving source-of-truth integrity,
evidence provenance, profile isolation, explicit physical placement, recovery, and
release discipline.

Before editing:
1. Inspect the actual repository state.
2. Identify the authoritative implementation.
3. Read relevant contracts, tests, release docs, and AGENTS.md.
4. Distinguish current implementation from target architecture.
5. Define completion evidence.

Delegate independent investigation to at most four parallel specialists:
- Domain + Contract
- Workshop OS Runtime
- UX + Accessibility
- CI + Regression

Use the Release + Evidence specialist after a candidate exists or when release status
must be established.

Sub-agents are read-only by default. Do not allow overlapping writers. The orchestrator
owns integration unless a worker receives an explicit, non-overlapping write scope.

Non-negotiable rules:
- Unknown stays Unknown.
- Never invent spool identity, owner, quantity, measured weight, location, printer
  assignment, AMS/slot placement, or device state.
- Never assign placement solely from color/material similarity.
- Preserve QuantityEvidence provenance and conflicting evidence.
- Preserve private-profile isolation.
- Keep cloud/provider credentials off the WS350.
- Preserve full-image recovery for incompatible partition migration.
- Never weaken tests or release gates to obtain a pass.
- Do not collapse implemented, built, tested, runtime validated, production validated,
  physically validated, accepted, and stable.
- Do not claim validation that did not actually run and pass.

After specialist reports:
1. Reconcile findings.
2. Select the smallest coherent implementation.
3. Apply one integrated change set.
4. Run relevant validation.
5. Record exact SHAs/artifact identities and failures/not-run checks.
6. State the highest release state actually supported by evidence.
7. If physical acceptance is required and has not occurred, say so explicitly.

Return:
- authoritative implementation identified;
- findings;
- changes made;
- validation performed;
- exact source/deployment/artifact identities where applicable;
- unresolved blockers;
- highest supported release state;
- next executable step.
```

---

## 14. Specialist prompts

### Domain + Contract

```text
Audit the requested change from the Filament Inventory authority perspective.
Focus only on identity, provenance, ownership/isolation, placement, readiness,
sync, grounded AI, and device-contract semantics relevant to the assignment.
Do not modify Workshop OS. Unknown must remain explicit. Report findings using
the Agent Architecture v1 handoff contract.
```

### Workshop OS Runtime

```text
Audit the requested change from the Workshop OS runtime perspective.
Focus on firmware, touchscreen state, printer controls, networking, OTA/recovery,
audio/mic/BLE, and device-contract consumption. Do not create inventory truth or
infer AMS placement. Treat automated validation separately from WS350 physical
acceptance. Report using the Agent Architecture v1 handoff contract.
```

### UX + Accessibility

```text
Perform a read-only product-level UX audit. Evaluate hierarchy, density, spacing,
touch targets, keyboard/focus, accessible naming, selected/disabled/loading/error
states, reduced motion, stale/offline/reconnect behavior, and 480x320 fit where
applicable. Return screen-by-screen defects with severity, evidence, owning
component/style when identifiable, and concrete corrections. Do not edit code.
```

### CI + Regression

```text
Independently attempt to disprove the candidate. Run the relevant static, unit,
contract, browser, visual, accessibility, build, schema, recovery, and error-path
checks available for this assignment. Do not weaken assertions or update baselines
without explicit evidence that the behavior change is intentional. Separate pass,
fail, and not-run results.
```

### Release + Evidence

```text
Establish exactly what this candidate has proven. Record exact source SHA, change
set, CI/build/browser evidence, deployment identity, migration status, firmware
artifact/hash, rollback/recovery evidence, and physical acceptance evidence where
applicable. Classify only the highest release state directly supported by evidence.
Never infer physical acceptance from CI or deployment.
```

---

## 15. Practical operating modes

### Mode A — Investigation only

Use parallel read-only agents. No code changes. Best for architecture reviews, large UI audits, release triage, and root-cause analysis.

### Mode B — Orchestrated implementation

Parallel investigation first, then one integrated implementation by the orchestrator, followed by independent CI/regression review.

### Mode C — Independent implementation worktrees

Use only when tasks are truly non-overlapping. Each worker receives an explicit file/semantic boundary. The orchestrator integrates and owns final validation.

### Mode D — Release certification

No feature work. Release + Evidence Agent verifies exact identity and evidence while CI/Regression independently checks gates. Physical-device evidence remains a separate gate.

---

## 16. Initial recommended deployment

Start with this configuration:

```text
max investigation workers: 4
default worker permissions: read-only
nested delegation: disabled
integration writer: orchestrator
release promotion authority: orchestrator
physical acceptance authority: recorded evidence from the actual WS350
```

Do not add more agents until repeated tasks show a real independent workstream that cannot be handled cleanly by the existing five roles.

---

## 17. Success criteria

This architecture is working when:

- parallel investigation reduces duplicated context and serial review time;
- workers return compact evidence rather than large unstructured narratives;
- domain and firmware boundaries remain explicit;
- one integrated patch is preferred over competing implementations;
- test agents catch regressions without weakening gates;
- release claims match actual evidence;
- physical acceptance remains distinct from automation;
- no worker can silently create authoritative inventory or device state;
- the project moves faster without trading away provenance, isolation, recovery, or acceptance quality.
