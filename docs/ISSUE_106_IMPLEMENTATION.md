# Issue #106 implementation note — PrintRequirement quantity must be known

Issue #106 identifies a correctness defect in deterministic print readiness: absent required grams could previously normalize to `0` and allow an otherwise valid measured spool to be classified Ready.

This branch changes the core contract so requirement quantity is classified before inventory evaluation. Missing/blank, invalid, and non-positive values all return `Undetermined`; only a positive numeric gram requirement enters candidate ranking and headroom calculations.

The change intentionally does not infer grams from any other field and does not change inventory quantity evidence precedence, reservations, placement, start eligibility, or completion accounting.

The final target remains a first-class `PrintRequirement` object with source/provenance. This fix is the smallest coherent fail-closed correction needed before that migration.
