# Workshop Instrument UI v1 — reference synthesis

Status: **isolated design implementation branch**. This is not a release candidate, not physically accepted, and must not be merged into the active `#76 -> #77` promotion train before those hardware candidates complete their own gates.

Base: exact v11.23 RC2 candidate `757dd25d3921acd45b5d229c29d090d885914751`.

## Design goal

Make the WS350 read as a compact precision instrument rather than a desktop admin UI squeezed onto a 480×320 panel. Preserve the existing authoritative data, control semantics, portal/session boundary, guarded actions, deterministic capture model, and finger-first interaction contract.

## What was taken from the supplied references

### Air Orbit radial dashboard
- Use a restrained segmented ring only for a real primary metric, especially print progress.
- Keep color concentrated around live state rather than washing the whole screen in neon.
- Use cyan/purple as signature accents, not as additional semantic status colors.

### Gray smart-home dashboard
- Keep contextual grouped surfaces and shallow navigation.
- Do not inherit its low-contrast gray-on-gray hierarchy or equal weighting of every card.

### Airstation dashboard
- Adopt the strongest hierarchy in the reference set: one dominant state/value, secondary telemetry beneath or beside it, compact context, generous negative space.
- Prefer a glanceable answer before exposing details.

### Orange/blue home-control screen
- Borrow explicit active/inactive state treatment and large tile affordances.
- Keep semantic colors disciplined so active does not mean a different color on every screen.

### UDM network monitor
- Borrow technical confidence, compact status language, and restrained micro-instrument styling for diagnostics.
- Do not copy thin fonts, border-heavy chrome, or small touch targets.

### Ambient single-control screen
- Treat an active adjustment as a controller, not a dashboard: one value, one action focus, obvious Back/Cancel/Commit.
- This reinforces the v11.23 RC2 explicit-control direction.

### Office lighting grid
- Borrow large rounded touch tiles, unmistakable active/off states, and immediate scannability.
- Use this pattern for settings/action surfaces rather than relying on hidden gestures.

### Dense portrait weather station
- Borrow compact icon/label pairing and high information efficiency only where needed.
- Reject the density, mixed typography, and portrait-first composition for the normal WS350 experience.

### 420 air-quality monitor
- Borrow the one-number-first composition and subordinate side metrics.
- This is the primary reference for printer state hierarchy after Airstation.

### Round CO₂ display
- Borrow the minimal appliance-like confidence: one truthful live number, tiny trend/supporting state, almost no decorative chrome.
- Never fabricate a sparkline or trend when the product does not have evidence for one.

## Applied visual system

### Palette
The prototype keeps the existing semantic color roles but tightens them into a darker instrument palette:

- background: near-black navy `#071019`
- primary surface: `#0C1721`
- raised surface: `#122230`
- low-contrast border: `#223341`
- text: `#F2F7FA`
- secondary text: `#91A5B5`
- muted: `#4C6170`
- cyan: `#28D7E5`
- blue: `#3B82F6`
- green: `#35E38A`
- amber: `#FFC247`
- red: `#FF5B57`
- purple: `#B974FF`
- orange: `#FF8A34`

Color remains semantic: green healthy/ready, amber attention/staged, red fault/destructive, cyan/blue selected/connected, purple signature/secondary, orange active-print emphasis.

### Home hero
`uiSignatureHero()` is restyled around a dominant truthful state. During a print, the real progress value is shown in a segmented radial instrument. The rest of the hero is reduced to state, remaining time/context, and printer identity. Idle/offline states remain text-first rather than inventing a meaningless ring.

### Settings cards
`uiDisplaySettingCard()` uses a calm raised surface, a narrow accent rail, a small label, a larger value, and a subordinate detail line. Parent-disabled settings remain visibly inactive without losing their configured value.

### v11.23 RC2 Network controls
`hubRc2CardRef()` and `hubRc2ButtonRef()` inherit the same instrument surfaces and accent-rail language while preserving every existing hitbox and touch behavior. No control coordinate, Back/Next rule, staged-network rule, or guarded Apply behavior is changed.

## QMI8658 auto orientation

The prototype also adds optional **sensor-driven display orientation** for the WS350's onboard QMI8658 accelerometer.

Design rules:

- auto orientation is **off by default** until explicitly enabled on the physical Rotation screen;
- persisted `dispSettings.rotation` remains the durable manual/fallback orientation;
- automatic changes are runtime-only and never write NVS;
- the display and touch geometry are reapplied together through the existing display-settings path;
- rotation is deferred while a finger is held down so a gesture cannot begin in one coordinate system and finish in another;
- only stable gravity orientation is accepted: approximately 600 ms stable with multiple samples, low-pass filtering, dominance margin and an ambiguity grace period;
- a flat or near-diagonal device preserves the last confirmed orientation instead of guessing;
- the gyro is not required for normal rotation; the accelerometer is sufficient and cheaper;
- sensor failure is fail-safe: the device stays on the persisted manual orientation and reports `QMI8658 NOT FOUND`.

The QMI8658 uses the same WS350 I²C bus already brought up for the display-reset expander / FT6336 path. The prototype does not reinitialize that bus. The hardware-specific QMI-to-display quarter-turn correction is isolated in one constant. It is **implemented but not physically validated on this unit yet**, so the mapping cannot be called accepted until the real WS350 is rotated through all four orientations and touch alignment is checked in each.

The Rotation screen remains the manual recovery surface. With auto orientation off it still exposes Preview / Prev / Next / guarded manual commit. With auto orientation on it shows the effective runtime rotation and sensor status, while manual commit controls are disabled until auto mode is turned off.

## Deliberately unchanged

### System / portal credential screen
The System page is not moved in this prototype. Its portal-code position participates in the authenticated framebuffer redaction contract. Redesigning that surface requires a coordinated capture/redaction change and a new security validation pass; visual polish alone is not a sufficient reason to risk credential retention.

### Authoritative facts
No new printer, inventory, AMS, spool, quantity, ownership, location, or device fact is created. The segmented progress ring uses the existing real `BambuState::progress`; it does not synthesize a trend or estimate.

### Controls and safety
No printer command, power behavior, network mutation, authentication rule, or recovery behavior is changed. The only new persisted setting is the user's explicit Auto Orient preference; automatic orientation itself is runtime state.

## Release discipline

This branch is intentionally isolated as implementation evidence. Before promotion it must be replayed on the then-accepted post-v11.24 baseline, rebuilt through the canonical firmware gate, visually captured on a real WS350, checked for 480×320 fit and touch behavior, rotated physically through all four orientations, and accepted as a distinct hardware-facing delta.
