# Print Readiness correctness invariants

The deterministic Print Readiness path must preserve these invariants:

1. Required grams are authoritative input evidence, never a value inferred from a spool or model label.
2. Missing, invalid, zero, or negative required grams produce `Undetermined` and no spool recommendation.
3. Known inventory quantity is not sufficient to answer readiness when requirement quantity is unknown.
4. Unknown inventory quantity remains Unknown even when material/color match.
5. Estimated inventory may support provisional planning but not measured-authority start eligibility.
6. A planned/running job reserves its required grams; active commitments are deducted before another readiness decision.
7. A physical spool cannot run two tracked jobs simultaneously.
8. A printer cannot run two independently tracked jobs simultaneously.
9. Starting requires explicit loaded placement and current measured quantity evidence.
10. Completion records usage-derived remaining quantity as an estimate; it must not masquerade as a new scale measurement.
