# Workshop OS v11.23 RC2 — Physical Acceptance

Use the authenticated `scripts/capture-ws350-views.zsh` helper for framebuffer evidence. Do not disable or bypass the portal session during acceptance.

## Preconditions

- device reports `Smart Home v11.23 Network Locale Layout RC2`;
- `safeMode=false`, `webReady=true`, touch responsive;
- normal station-mode management routes require a valid portal session;
- printer is in a safe state for UI testing.

## Touch / network checks

1. Network Expert pages expose obvious Back / Next controls.
2. Time & Locale exposes explicit Prev / Next timezone controls; change once and restore.
3. Address Editor visibly states `STAGED — NOT APPLIED`.
4. Select and alter an IPv4 octet, move to Review, then use Discard; persisted addressing must remain unchanged.
5. Short-tapping Apply must not persist or restart.
6. If deliberately testing Apply, use a known-safe network configuration and expect the display to restart/reconnect; the printer must not receive a print-control command.

## Rotation checks

1. Open Display → Extras → Rotation.
2. Confirm Current and Preview are distinct staged values.
3. Prev / Next changes Preview only.
4. Short-tap Commit must not persist.
5. Deliberate hold commits orientation and touch mapping together.
6. Restore the original rotation and verify touch alignment.

## Security / capture checks

1. Opening a protected route without a session must not provide normal-LAN management access.
2. Authenticate with the rotating physical portal code.
3. Run `scripts/capture-ws350-views.zsh <device-host-or-ip>`.
4. Capture all 32 deterministic views.
5. Verify the retained System image has the portal-code region redacted.
6. Verify no printer configuration/settings export exists in the capture bundle.

## Required result

- touch affordances fit the 480×320 physical screen;
- staged addressing is non-destructive before guarded Apply;
- rotation preview/commit is guarded and recoverable;
- portal/session authentication remains intact;
- no Light/Pause/Resume/Stop/Power regressions;
- Speaker/MIC ECHO, recovery, settings persistence, and OTA remain healthy.
