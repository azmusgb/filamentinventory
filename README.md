# Filament Inventory

A mobile-first, local-first filament inventory PWA for iPhone, iPad, and desktop.

## v6 highlights

- Private device-pairing links using a URL fragment so the sync key is not sent in the page request
- Fresh-device onboarding now pulls cloud inventory directly instead of requiring a pre-existing local state
- Sync-key rotation that immediately revokes the previous key and forces other devices to re-pair
- Rotation sends only the new key's SHA-256 hash to the admin Function; the newly generated raw key stays in the browser
- Explicit cloud deletion with a typed confirmation phrase
- Automatic cloud JSON backup immediately before cloud deletion
- Separate `/api/sync-admin` Netlify Function with a stricter 10 requests/minute rate limit
- v5 cloud revision IDs, device activity, rolling snapshots, reversible restore, merge semantics, and deletion tombstones remain intact

## Security model

The main sync key is a high-entropy browser-generated capability. Normal sync sends it only to the same-origin `/api/sync` endpoint over HTTPS; the Function hashes it with SHA-256 to locate the private Netlify Blob.

A v6 pairing link places the key in the URL **fragment** (`#filament-sync=...`). Fragments are not included in HTTP requests. The app removes the fragment from the address bar before connecting. Treat a pairing link like a password because anyone who obtains it can join that cloud inventory until the key is rotated.

Key rotation authenticates with the current key, generates the replacement key in the browser, and sends only the replacement key's SHA-256 hash to `/api/sync-admin`. The server moves the current inventory and recovery snapshots to the new hashed location and deletes the old cloud scope.

## Cloud recovery

Rolling snapshots are preserved before cloud-changing syncs and restores. A restore first snapshots the current cloud state, making recovery reversible. Key rotation moves the retained snapshots to the new key scope.

## Local safety

Cloud deletion removes the cloud inventory and snapshots but does **not** remove the local browser inventory. The app downloads a final cloud JSON backup before requesting deletion.

## Inventory rule

Measured `gross - tare` weight is authoritative. Visual estimates are used only when a complete measurement is unavailable. Unknown remains unknown.

## Development

```bash
npm install
npx netlify dev
```

The site remains framework-free. `netlify/functions/sync.mts` provides normal sync and recovery. `netlify/functions/sync-admin.mts` provides key rotation and cloud deletion.
