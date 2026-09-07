# Release Process

Workshop OS deliberately separates **accepted source baseline**, **current `main` state**, **active candidate**, and **static firmware download** state. Do not collapse these into one ambiguous version label.

## 1. Accepted source baseline

`releases/current.json` records the last firmware source that passed required real-device acceptance:

- accepted Workshop OS version;
- the firmware commit that was physically accepted;
- acceptance state/evidence;
- whether an active candidate exists;
- any unaccepted firmware delta already present on `main`;
- the separately managed static download channel.

The accepted firmware commit is the hardware baseline even when later documentation commits—or, exceptionally, an unaccepted firmware delta—exist on `main`.

## 2. Candidate creation

For firmware work:

1. branch from current `main`;
2. open one candidate PR to `main`;
3. update the reusable `.github/workflows/firmware-candidate.yml` only when the reconstruction recipe/baseline changes;
4. update `releases/current.json` to describe the candidate when a formal candidate is established;
5. do not create version-named workflow files.

Keep candidate binaries in Actions artifacts.

## 3. CI acceptance

Firmware candidates must pass the gates appropriate to their scope. The normal hardware gate includes:

- deterministic reconstruction from the pinned upstream baseline;
- device/safety contracts;
- current visual/rendered-fit contracts;
- browser JavaScript validation;
- native `ws_lcd_350` build;
- shared `jc3248w535` regression build;
- Full-image merge;
- OTA/full artifact packaging.

Failures in a contract gate are release blockers until explained and intentionally changed.

## 4. Physical acceptance

Changes that can affect the real panel, touch, speaker/microphone, recovery, authentication, printer commands, smart-plug power, settings persistence, or other hardware behavior require real-device acceptance.

Visual releases should use the authenticated WS350 framebuffer capture workflow and compare the complete required view set. Control changes must exercise the affected command in a disposable/safe scenario and confirm guard behavior as well as success behavior. Authentication changes must verify correct-code login, wrong-code rejection, logout/reboot invalidation, protected controls/OTA and Recovery AP access.

Record physical acceptance in the PR and current-version evidence doc before promotion.

## 5. Source promotion

The normal rule is: merge the accepted candidate to `main` only after required CI and physical gates are green. Then update `releases/current.json` so:

- `channel` is `accepted-source`;
- `version` is the accepted source version;
- `source.acceptedFirmwareCommit` identifies the physically accepted firmware commit;
- `source.physicalAcceptance` is `passed`;
- `candidate` is `null` until a new formal candidate exists.

### Merged-but-unaccepted exception

If a hardware-facing candidate is merged before physical acceptance, **do not relabel it as accepted**. Immediately make repository state explicit:

- keep the last physically accepted version/commit in `source`;
- set `candidate` to `null` if there is no longer an open candidate PR;
- record the code currently present on `main` in `mainState` with `status: merged-unaccepted`;
- record the originating PR/branch and exact merge commit;
- record CI results separately from `physicalAcceptance: pending`;
- do not promote its binaries into `release.json` / Netlify;
- complete physical acceptance or intentionally revert the unaccepted delta.

This is an exception/recovery state, not a normal promotion path.

## 6. Static download promotion

`release.json` / Netlify are a separate distribution decision. Do **not** automatically promote the newest accepted source into the static installer.

When intentionally promoting the download channel:

1. use binaries produced from an accepted exact head;
2. verify SHA-256/integrity metadata;
3. update Full and OTA paths together;
4. retain exactly one immediately previous physically accepted Full + OTA rollback pair;
5. remove older tracked binary generations in the same maintenance change;
6. run the static portal integrity gate.

## 7. Repository protection

`main` should use GitHub branch protection/rulesets so repository policy is enforced by the platform rather than documentation alone. Recommended minimums:

- require a pull request before merging;
- require the stable `merge-gate` status, which coordinates `Release Gate`, `Validate`, and the applicable firmware/static-installer workflows;
- keep the path classification current when adding canonical source or new build inputs, so firmware-facing changes cannot evade the reusable firmware gate;
- require branches to be up to date before merge;
- block force pushes and branch deletion;
- do not allow bypass of required checks for routine firmware promotion.

Physical acceptance remains a human hardware gate. Record it explicitly; CI cannot prove it.

## 8. Upstream synchronization

Repinning BambuHelper is its own candidate. Follow `docs/UPSTREAM_SYNC.md`; never mix a silent upstream repin into an unrelated feature or cleanup PR.

## 9. Emergency recovery

Recovery actions may temporarily bypass normal release cadence, but they do not erase the audit trail. Record what was flashed, why, the exact binary/hash when available, and restore the accepted metadata/workflow state after the emergency.
