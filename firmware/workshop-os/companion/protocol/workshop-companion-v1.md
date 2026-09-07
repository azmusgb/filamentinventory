# Workshop Companion protocol v1

## Goals

Workshop Companion v1 provides a narrow BLE orchestration plane between a Workshop OS WS350 and an iPhone. It is designed so a future firmware implementation can be added without changing the existing authenticated LAN management authority.

## Transport split

### BLE

Use BLE only for:

- service discovery and presence;
- non-secret device/bootstrap metadata;
- compact device events and phone responses;
- LAN handoff metadata;
- capability negotiation.

### Wi-Fi/LAN

Use the existing Workshop OS HTTP/session boundary for:

- authenticated management;
- printer/power mutations;
- images and thumbnails;
- microphone/audio payloads;
- firmware/OTA;
- larger telemetry or historical data.

BLE must never carry printer access credentials, Wi-Fi passwords, portal codes, inventory sync keys, or other long-lived secrets.

## GATT UUIDs

Protocol version: `1`

| Item | UUID | Direction |
|---|---|---|
| Companion service | `A3D10000-7A4B-4B82-9C52-57534F533530` | — |
| Bootstrap | `A3D10001-7A4B-4B82-9C52-57534F533530` | device → phone, read |
| Device event | `A3D10002-7A4B-4B82-9C52-57534F533530` | device → phone, notify |
| Phone command | `A3D10003-7A4B-4B82-9C52-57534F533530` | phone → device, write with response |
| Device state | `A3D10004-7A4B-4B82-9C52-57534F533530` | device → phone, read/notify |

The base UUID suffix encodes `WSOS50` for Workshop OS protocol ownership. UUIDs are protocol identifiers, not secrets.

## Advertisement

A future firmware implementation should advertise:

- the Companion service UUID;
- a short local name such as `Workshop-AB12`;
- no credentials or personally identifying data.

Do not place the local portal code, printer serial, printer access code, Wi-Fi SSID/password, or inventory credential in advertisement data.

## Bootstrap characteristic

UTF-8 JSON, target <= 180 bytes:

```json
{"v":1,"device":"ws350-ab12","name":"Workshop OS","host":"workshop.local","port":80,"tls":false,"auth":"portal-session"}
```

Required fields:

- `v`: protocol version;
- `device`: stable non-secret Workshop OS equipment identifier;
- `host`: LAN hostname or IP suitable for an authenticated handoff;
- `port`: LAN port;
- `tls`: whether the endpoint expects TLS;
- `auth`: must be `portal-session` for the current security model.

Bootstrap metadata locates the control plane. It does **not** authorize it.

## Message envelope

Device events and phone commands use compact UTF-8 JSON:

```json
{"v":1,"id":"42","t":"camera.request","p":{"mode":"photo"}}
```

Fields:

- `v`: protocol version, integer;
- `id`: sender-generated correlation token, string;
- `t`: message type;
- `p`: optional object payload.

Messages should remain <= 180 bytes in v1. Larger data belongs on Wi-Fi.

## Device → phone event types

### `hello`

Signals that the device is ready for companion negotiation.

Payload:

```json
{"caps":["camera-request","tts-request","notify","lan-handoff"]}
```

### `lan.handoff`

Requests that the phone refresh/read bootstrap metadata and establish the LAN session if available.

### `camera.request`

Requests a camera action in the companion app.

Payload fields:

- `mode`: `photo` in v1;
- `reason`: optional short human-readable reason.

This event never implies that iOS can capture while suspended/backgrounded. The phone must reply with a result state.

### `tts.request`

Requests iPhone text-to-speech or speech preparation.

Payload fields:

- `text`: short text only in v1;
- `voice`: optional voice hint.

Audio payload return is out of scope for BLE v1; future Wi-Fi transfer may carry generated audio.

### `notification.request`

Requests a local iPhone notification/presentation.

Payload fields:

- `title`;
- `body`;
- `level`: `info`, `attention`, or `critical-requested`.

The phone may downgrade presentation according to iOS permissions and policy.

### `ping`

Liveness request.

## Phone → device command types

### `hello`

Phone capability response.

Payload example:

```json
{"caps":["camera","tts","notify"],"app":"1.0"}
```

### `camera.result`

Payload:

- `state`: `completed`, `cancelled`, `permission-denied`, `foreground-required`, `unsupported`, or `failed`;
- `url`: optional authenticated/local Wi-Fi result URL, never a BLE image payload.

### `tts.result`

Payload:

- `state`: `completed`, `cancelled`, `permission-denied`, `foreground-required`, `unsupported`, or `failed`;
- `url`: optional authenticated/local Wi-Fi payload URL for a future audio transfer.

### `notification.result`

Payload:

- `state`: `completed`, `permission-denied`, `unsupported`, or `failed`.

### `lan.ready`

Signals that the app has a reachable LAN endpoint. It does not prove authentication.

Payload:

- `reachable`: boolean;
- `authenticated`: boolean.

### `pong`

Liveness response.

## Device state characteristic

UTF-8 JSON, target <= 180 bytes:

```json
{"v":1,"online":true,"phone":true,"lan":true,"session":false}
```

`session` means the phone reports that it holds a current Workshop OS authenticated LAN session. It must not contain the session cookie/token itself.

## Security requirements

1. No BLE command may directly execute printer/power mutation in v1.
2. No BLE characteristic may expose the Workshop OS portal code or authenticated cookie.
3. The app must treat LAN endpoint discovery and LAN authentication as separate states.
4. Protected actions must continue to use the Workshop OS portal/session and same-origin protections.
5. Destructive operations retain existing guarded-action semantics.
6. BLE pairing/bonding is useful transport hardening but is not, by itself, authorization for Workshop OS management.
7. Wi-Fi provisioning is excluded from v1 pending an authenticated enrollment design and physical acceptance.

## iOS lifecycle requirements

The companion app must represent these states explicitly:

- disconnected;
- scanning;
- BLE connected;
- LAN reachable;
- LAN authenticated;
- foreground required;
- permission denied;
- unsupported;
- failed.

Camera and microphone-related requests must fail clearly when iOS background/permission rules prevent execution.

## Firmware implementation gate

This specification and starter app may merge without physical acceptance because they do not alter firmware behavior. A future GATT-server implementation changes radio/runtime behavior and therefore requires:

- exact-head CI;
- native `ws_lcd_350` build;
- shared `jc3248w535` regression build or explicit board-N/A proof;
- memory/heap coexistence checks with Wi-Fi/MQTT/audio;
- real-device BLE discovery/connect/reconnect acceptance;
- verification that printer/Wi-Fi operation is unaffected when Bluetooth is unavailable or disabled.
