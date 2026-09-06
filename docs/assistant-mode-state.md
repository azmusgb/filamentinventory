# Assistant transport state semantics

The Assistant mode badge describes what has actually been verified for the active private inventory profile. A configured transport or stored sync key is not treated as proof that a model response has succeeded.

- **Grounded local** — deterministic inventory engine is authoritative. This includes unlinked, offline, server-unconfigured, and health-unverified states.
- **Cloud ready** — private sync is linked and the production model transport is configured, but no validated model response has succeeded for the active profile in the current browser session.
- **Grounded model** — a model response has succeeded for the active profile and passed client-side grounding validation against the deterministic evidence slice.
- **Local fallback** — a model request failed or its response was rejected by grounding validation; the deterministic local answer was used instead.

Successful model state is profile-scoped and session-local. Profile changes, sync-key changes, page reloads, or transport failures cannot inherit or fabricate a prior profile's verified model state.
