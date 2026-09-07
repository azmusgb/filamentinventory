# Workshop OS v11.22 Display Expert RC1

## Purpose

v11.22 converts the remaining safe, visually dense Display settings from portal-only configuration into a physical WS350 expert surface while preserving the v11.20 authentication boundary and all accepted v11.19.1 safety behavior.

This is a **hardware-facing candidate**, not an accepted release.

## Source stack

Reconstruction order remains deterministic:

1. pinned upstream BambuHelper `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4`;
2. accepted Workshop OS v11.19 baseline;
3. accepted v11.19.1 Physical Fit RC2 delta;
4. v11.20 Portal Auth RC1 delta;
5. v11.22 Display Expert RC1 delta.

No direct edits to upstream source are accepted outside the version-controlled patch chain.

## Physical pages added

Seven pages are appended to the existing seven-page Display Experience:

1. Theme
2. Gauge Colors
3. Gauge Scales
4. Gauge Behavior
5. Glow
6. Layout
7. Extras

The page count becomes 14 and the authenticated visual-capture catalog grows from 22 to 29 views.

## Input model

- tap = next / toggle / increment;
- long press = previous / decrement where reversible;
- all mutations write the existing authoritative settings objects and use the existing persistence path;
- no on-device text keyboard is introduced.

## Safety boundaries

- fixed alarm-state colors are not theme-editable;
- custom gauge labels remain portal input;
- display rotation remains deferred to v11.23 because touch remapping needs guarded recovery semantics;
- no speed, fan, temperature, or AMS printer command is introduced;
- printer/power controls remain fail-closed and selected-printer scoped;
- portal authentication and recovery boundaries from v11.20 are preserved.

## CI acceptance

The candidate must pass:

- normal `Validate`;
- stable repository `merge-gate`;
- deterministic reconstruction through v11.20;
- v11.20 portal-auth contracts;
- v11.22 Display Expert source contract;
- machine-enforced settings-parity registry against reconstructed v11.22;
- browser JavaScript syntax;
- native `ws_lcd_350` build;
- `jc3248w535` shared 320×480 regression build;
- full-image merge and artifact packaging.

CI proves reconstruction and compiled behavior contracts only. It does not replace physical acceptance.

## Required WS350 physical acceptance

Before promotion, validate on the real WS350:

- all 29 capture views render without clipping, overlap, sentinel leakage, or navigation regression;
- pager tap advances and pager hold moves backward across all 14 Display pages;
- every expert card mutates the intended setting and survives reboot;
- long-press reverse behavior works for palette/preset editors;
- theme presets never repaint fault/pause semantics into non-warning colors;
- gauge color selection covers all 12 groups and affects only the selected arc/label/value target;
- scale controls stay within documented ranges;
- layout toggles render correctly in both logical orientations supported by the current accepted physical geometry;
- split settings remain stable with one and two configured printers;
- Clock Info and AMS Tray Types persist and render correctly;
- Gauge Labels remain portal-only and Rotation remains non-editable;
- v11.20 login/logout/reboot/recovery authentication behavior still passes;
- Light / Pause / Resume / Stop / Power and OTA remain functional;
- no credential appears in retained captures, logs, or artifacts.

## Promotion dependency

v11.22 cannot become the accepted hardware baseline until the inherited v11.20 Portal Auth behavior has real-device acceptance evidence **and** the v11.22 Display Expert physical acceptance above passes.
