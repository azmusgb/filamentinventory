# Smart Home v9.7.1 Touch Reliability RC2 — Physical Acceptance

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**

Status: **PASS — physical touch regression resolved**

Validated OTA SHA-256: `2b097c9656cfd5ee743fb66235e1e9dc961227ad56f9949f37d0c37d7de84579`

Validated Full SHA-256: `7090e71cec16d2c1d5fca55ee503900d7f8c6d7e1307b5c2c0aeb3af7a312b19`

Source head: `bcc935d2723ba5651fa078ab76a89b6df2296923`

Merged by PR #20 at: `db42d224aff643bb11804d4aae6c389b424241b0`

GitHub Actions artifact: `bambuhelper-ws_lcd_350-smart-home-v9.7.1-touch-reliability-rc2` (artifact ID `9855864419`)

## Hardware evidence

The original regression was isolated with the recovery plane:

- Newer `app0` image booted and detected FT6336 at I2C `0x38`, but touch input did not work.
- `Boot Previous Firmware` switched to known-good `app1` and touch immediately worked.
- This ruled out a dead panel/controller and localized the problem to the newer input path.

After installing v9.7.1 through application OTA, `/recovery/status` reported:

```json
{
  "build": "Smart Home v9.7.1 Touch Reliability RC2",
  "safeMode": false,
  "ip": "10.0.0.124",
  "touch": "FT6336 · FORCED ON",
  "touchResponsive": true,
  "touchReadFailures": 0,
  "touchRecoveries": 0,
  "touchPresses": 1,
  "runningSlot": "app0",
  "knownGood": "app1",
  "candidatePending": false,
  "candidateAttempts": 0,
  "webReady": true,
  "rapidBootCount": 0
}
```

After repeated physical taps and Home / Printer / Workshop / More interaction, the same endpoint reported:

```text
touchResponsive=true
touchPresses=26
touchReadFailures=0
touchRecoveries=0
runningSlot=app0
knownGood=app1
```

Acceptance criteria therefore passed:

- [x] FT6336 is responsive at runtime.
- [x] Accepted touch count increases under repeated physical taps.
- [x] No FT6336 read failures observed during acceptance.
- [x] No FT6336 bus recoveries were required during acceptance.
- [x] New firmware runs from `app0`.
- [x] Known-good rollback remains preserved in `app1`.
- [x] Recovery control plane remains reachable.
- [x] Candidate state is healthy and not pending.
- [x] Web control plane is ready.

## Fix validated

v9.7.1 replaces the generic 50 ms GPIO-style debounce dependency for FT6336 with explicit capacitive press/release edges, resets stale touch state on reinitialization, invalidates stale coordinates, adds bounded FT6336 I2C self-recovery, and exposes runtime touch-health counters through `/recovery/status`.

## Result

**Physical touch acceptance: PASS.**

The v9.7.1 touch regression is closed. `app1` remains the preserved rollback slot.

Note: v9.7.2 Safari-safe recovery OTA is merged separately and still requires its browser upload path to be physically exercised before treating that incremental recovery-page change as physically accepted.
