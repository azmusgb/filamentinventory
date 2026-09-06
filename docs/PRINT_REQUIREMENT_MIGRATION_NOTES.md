# PrintRequirement migration notes

The fail-closed quantity correction intentionally precedes the full provenance model.

A future `PrintRequirement` migration should be additive and preserve existing print-job fields while introducing stable requirement identity and evidence metadata. At minimum, the target should distinguish requirement grams, safety margin, source type, source timestamp, confidence/quality, job/model association, and whether a value was user-entered, slicer-derived, imported, or otherwise evidenced.

No migration should backfill unknown required grams by inference. Existing planned jobs with positive stored `modelGrams` / `requiredGrams` may be candidates for explicit migration only when the original stored value is itself valid evidence; unknown or absent requirements remain Unknown.
