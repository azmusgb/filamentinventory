# Print Readiness acceptance checklist

This checklist separates implemented behavior from validation and acceptance.

- [x] Missing required quantity has an explicit fail-closed result class in code.
- [x] Invalid/non-positive required quantity is not converted to a usable `0 g` requirement.
- [x] Unit regressions cover missing, blank, invalid, zero, positive, and planning behavior.
- [ ] Exact-head CI passes for the implementation branch/PR.
- [ ] Deploy-preview smoke/browser validation passes for the exact head where applicable.
- [ ] Post-merge `main` CI passes for the exact merge SHA.
- [ ] Production smoke passes for the exact deployed merge SHA.
- [ ] First-class `PrintRequirement` provenance is implemented and migrated.
- [ ] Roadmap-level Print Readiness acceptance is recorded against the evidence/uncertainty contract.

Checking an earlier stage must not imply later stages.
