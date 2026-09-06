# Device inventory API contract v1

`GET /api/display-feed` is the stable device-facing read contract for Workshop OS and other constrained workshop displays.

## Authentication

Requests must include:

- `X-Filament-Sync-Key`: the private profile credential;
- `X-Filament-Profile`: exactly `Bill` or `Aimee`.

The credential pair resolves exactly one cloud namespace. The endpoint must never enumerate or combine profile stores.

Do not put either value in a query string.

## Response invariants

Contract version `1` is additive relative to the original display feed. Existing `title`, `subtitle`, `status`, `metrics`, `footer`, `generatedAt`, `sourceUpdatedAt` and `stale` fields remain stable.

The response also includes:

```json
{
  "contractVersion": 1,
  "capabilities": [
    "inventory-summary",
    "queue-summary",
    "staleness"
  ],
  "summary": {
    "spools": 42,
    "loaded": 4,
    "low": 3,
    "unknown": 2,
    "queue": 1
  }
}
```

`summary` uses numbers so firmware does not need to parse presentation strings from `metrics`.

## Evidence rules

Remaining quantity follows the inventory authority order:

1. measured `gross - tare`, when valid;
2. explicit usage-derived `estimatedRemainingGrams`;
3. `visualPercent` applied to nominal/start weight;
4. otherwise unknown.

Unknown must remain unknown. A spool with unknown remaining quantity is not automatically classified low.

Loaded state comes only from explicit placement state. Material/color similarity is never evidence that a spool is loaded in a particular AMS slot.

## Privacy boundary

v1 intentionally returns decision-level aggregates only. It must not expose:

- spool IDs;
- owner/profile names in the response body;
- brand/color/notes;
- printer identities;
- audit/history records;
- sync credentials;
- device metadata.

Record-level Assistant evidence should use a separately designed least-privilege endpoint rather than widening this summary contract casually.

## Compatibility

Consumers must ignore unknown additive fields.

Breaking semantic or shape changes require a new contract version. Do not repurpose an existing field with incompatible meaning.

## Future hardening

The current authentication intentionally reuses the existing private profile credential for compatibility. The target design is a device-scoped credential with explicit read/assistant capabilities and no sync mutation authority.
