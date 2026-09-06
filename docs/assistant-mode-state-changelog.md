# Assistant mode-state correction

This increment prevents the UI from claiming `Grounded model` merely because a private sync key exists. `Grounded model` now means a response for the active profile completed successfully and passed client-side grounding validation. Until that happens, a configured linked browser reports `Cloud ready`; provider or validation failures report `Local fallback`; offline/unlinked/unconfigured states remain `Grounded local`.
