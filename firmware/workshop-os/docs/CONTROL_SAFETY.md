# Printer and Power Control Safety Contract

Workshop OS is allowed to become a richer control surface only when control behavior stays explicit, fail-closed and auditable.

## Core rules

### 1. One command authority

Physical touch handlers and browser endpoints may request commands, but MQTT publication belongs to the established command/task boundary. Do not add a second ad-hoc MQTT publishing path from UI code.

### 2. Revalidate at execution time

A UI state that was valid when tapped may be stale by the time a queued command executes. Command execution must re-check:

- selected printer slot / target identity;
- configured/connected state;
- command applicability to current printer state;
- smart-plug mapping where applicable;
- MQTT availability for printer commands.

### 3. Fail closed on disconnect

Pause, Resume, Stop and other stateful printer commands must not remain queued across an MQTT disconnect and unexpectedly publish after reconnect. If the required connection/state disappears, discard the request and report failure/disabled state.

### 4. Destructive actions are guarded

- Stop/cancel requires deliberate confirmation; on the physical device this is a long-press/hold interaction.
- Printer power-off uses the mapped plug for the selected printer and retains its guarded confirmation workflow.
- Power-off while printing must present a stronger warning/confirmation than idle power-off.

A browser confirmation alone is not enough for a destructive endpoint; server-side confirmation/state checks remain authoritative.

### 5. Identity is explicit

Never route a command by an ambiguous display label or stale UI index when a stable printer slot/plug mapping exists. A printer power action resolves the plug mapped to that printer; it is not an arbitrary raw outlet selector disguised as printer control.

### 6. Disabled means unavailable

Offline, stale or inapplicable controls should look disabled and reject requests. Avoid controls that appear actionable but silently no-op or queue work for later.

### 7. Feedback is part of safety

Show command-request/sent/failure state clearly enough that the operator does not repeatedly tap a control because nothing visibly happened. Avoid presenting request submission as proof the printer executed the command; live telemetry remains the authority for resulting state.

### 8. No speculative command families

Do not add speed, fan, temperature, AMS manipulation or other Bambu command families from guessed payloads. A control becomes eligible only when the backend/protocol path is demonstrated and model/state compatibility can be bounded.

## Existing accepted command tier

The v11.19.1 accepted source includes the proven/guarded paths for:

- chamber light on/off;
- Pause / Resume;
- guarded Stop;
- mapped smart-plug printer Power;
- related power automation/auto-off behavior.

These contracts are preserved by the reusable firmware gate.

## Required validation for control changes

A control PR should include:

1. source-level contract checks for allowed and rejected states;
2. browser endpoint/auth/confirmation validation where exposed;
3. native WS350 and shared-target compilation;
4. physical enabled/disabled-state inspection;
5. a safe successful command test;
6. a rejection/fail-closed test (offline, stale, invalid state, short hold, etc.);
7. confirmation that unrelated printer configuration persists across reboot/update.

If a control touches smart-plug power, also verify the correct printer-to-plug mapping and the active-print warning path.
