# PrintRequirement change summary

This change closes the zero-gram normalization gap identified in issue #106. The deterministic evaluator now refuses to make a Ready/Not Ready decision unless required grams are a positive numeric input.

Behavioral matrix:

- missing/blank -> `undetermined` / `required-quantity-missing`;
- non-numeric -> `undetermined` / `required-quantity-invalid`;
- zero/negative -> `undetermined` / `required-quantity-non-positive`;
- positive numeric -> existing readiness calculation with safety margin, reservations, quantity evidence, and placement logic.

No authoritative inventory facts or physical placement are created by this change.
