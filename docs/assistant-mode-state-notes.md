# Assistant mode-state design notes

The presence of a sync key enables transport; it does not prove that transport has successfully produced a grounded answer. The UI therefore separates capability readiness from verified model execution.

The transport state machine is the single presentation authority. The Assistant view subscribes to `fi:llm-transport` and consumes the transport presentation object rather than independently deriving mode from `hasTransport()`.

A successful response is accepted only after profile consistency and client-side grounding validation pass. That success is recorded only for the active profile and only for the current page session. Any profile or sync-key transition clears verified model state.
