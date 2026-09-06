# Security policy

## Scope

Filament Inventory stores private inventory state and uses profile-scoped cloud synchronization. The repository is public; private credentials and workshop access secrets must never be committed, pasted into issues, or included in screenshots/logs without redaction.

## Never publish

Do not commit or post:

- `OPENAI_API_KEY` or provider credentials;
- Filament Inventory private sync keys;
- Bambu LAN access codes or other printer credentials;
- device-scoped tokens or future Workshop OS credentials;
- private Netlify environment values;
- passwords, session tokens, recovery secrets, or unredacted credential-bearing URLs.

Provider credentials remain server-side. The WS350 must not store an OpenAI/provider API key.

## Reporting a vulnerability

If a report requires a real credential, private inventory payload, or other sensitive reproduction data, do not place it in a public GitHub issue. Redact the secret and describe the behavior using synthetic identifiers/values where possible.

For ordinary non-secret defects, use the repository Bug / regression issue form.

## Security invariants

Security fixes must preserve the same product-truth rules as feature work:

- private profile data must not cross Bill/Aimee boundaries;
- unknown inventory/placement state must not be invented during recovery or error handling;
- authenticated device APIs should expose the minimum data/authority required;
- backup, snapshot, rollback, and recovery paths must not be removed until replacement paths are validated;
- validation claims must identify the exact source/build/deployment that actually passed.

## Supported line

The active Filament Inventory PWA/backend on `main` is the supported inventory software line.

WS350 / Workshop OS firmware is maintained in `azmusgb/bambuhelper-smart-display`. The `firmware/waveshare-home` tree retained here is historical/migration material and is not an active competing firmware product line.
