# Print requirement evidence — fail-closed baseline

Print Readiness answers `Can I print this now?` only when the required filament quantity is known from user/slicer/model evidence supplied to the deterministic readiness calculation.

## Current contract

`print-readiness-core.js` classifies the quantity input before evaluating inventory:

| Input | Quantity state | Readiness result |
| --- | --- | --- |
| missing / blank | `missing` | `undetermined` |
| non-numeric | `invalid` | `undetermined` |
| zero or negative | `non-positive` | `undetermined` |
| positive numeric grams | `known` | normal deterministic evaluation |

An `undetermined` result has no recommended spool, no candidate ranking, and no computed required/headroom quantity. The caller must obtain a positive slicer/model filament estimate before readiness can be decided.

This prevents a missing requirement from collapsing to `0 g` and accidentally producing a Ready result from otherwise valid measured inventory.

## Authority boundary

This is a fail-closed compatibility step, not the final `PrintRequirement` domain model.

The system still must not infer required grams from:

- model or job name;
- material or color;
- spool capacity;
- printer/AMS placement;
- previous prints unless an explicitly defined requirement-evidence workflow supplies that value.

Future first-class `PrintRequirement` provenance should preserve at least the required grams, source, source timestamp, confidence/quality where applicable, safety margin, and the print/job identity it belongs to.

## Regression coverage

`tests/print-requirement-evidence.test.mjs` locks the missing, blank, invalid, zero, valid-positive, and planning-fail-closed cases while the existing readiness suite continues to cover measured/estimated/Unknown inventory evidence, reservations, placement, start eligibility, and completion accounting.
