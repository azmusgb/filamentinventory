# Smart Home v8.3 RC3 — Physical Acceptance

Release state: **SOFTWARE-VALIDATED / PHYSICAL-RETEST-REQUIRED**

Target: **Waveshare ESP32-S3-Touch-LCD-3.5 (`ws_lcd_350`)**  
Base: **BambuHelper v3.8.1 @ `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4`**

RC3 exists because physical testing of the earlier v8.3 candidate exposed two real defects:

- System-screen full-frame repaint/flicker.
- Safari/iOS repeated Digest-auth prompts, with manual OTA reaching about 98% and ending with `Update failed: unexpected response`.

RC2 removed the System full-frame repaint. RC3 removes browser-native Digest challenges, replaces them with a RAM-only session login, and pauses background polling for the duration of manual OTA.

## 1. Correct images

For an already-running BambuHelper / Smart Home device, use:

`BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v8.3-RC3-OTA.bin`

SHA-256:

`499a73a43dc27b0ccfea3688115bda11b0ef3d972a80ed6e9e0b0a90d97d67fc`

For USB first-install/recovery only:

`BambuHelper-ws_lcd_350-v3.8.1-Smart-Home-v8.3-RC3-Full.bin`

SHA-256:

`21adbffad9854271acb2a93b05fe6e0df7d6e24113276f1bbad7a17e46d8c737`

Never substitute a firmware image for another board target.

## 2. Boot / display stability

After RC3 boots:

- System header shows **Smart Home v8.3 RC3**.
- Leave System visible for at least 30 seconds.
- Telemetry may update, but the entire panel must not blank, pulse, roll, or rebuild visibly.
- Verify Home → Workshop → Custom → System → Printer → Home navigation.
- Confirm touch remains correctly mapped across the screen.

**PASS:** no System or Workshop full-frame flicker and no touch/navigation regression.

## 3. Portal session authentication

In normal station mode:

1. Browse to the device IP.
2. There must be **no native Safari/browser username-password dialog**.
3. The browser should redirect to the BambuHelper Smart Home sign-in page.
4. Enter only the current 10-character **PORTAL CODE** shown on the physical System screen.
5. After successful sign-in, browse between sections for several minutes.
6. Background polling must not cause another sign-in prompt.
7. Reboot the display: the old browser session must no longer authenticate and a new portal code must be generated.

The session token is random, RAM-only, `HttpOnly`, `SameSite=Strict`, and is invalidated by reboot/logout.

**PASS:** one portal-code sign-in per boot, with no repeating native-browser credential prompts.

## 4. Same-origin mutation protection

After session login:

- Normal configuration mutations from the portal succeed.
- An authenticated mutation without accepted Origin/Referer provenance is rejected.
- AP/captive onboarding remains usable when intentionally entered.

**PASS:** session authentication fixes browser usability without weakening CSRF protection.

## 5. Bambu connectivity

### LAN mode

Confirm printer state, progress, nozzle/bed/chamber telemetry, layer information, ETA and AMS data populate normally. If practical, briefly interrupt Wi-Fi and confirm recovery/reconnection.

### Cloud mode, if used

- Portal offers Bambu **email-code sign-in only**.
- It does not request or transmit a long-lived Bambu account password.
- Complete email-code authentication and verify token operation after a normal reboot.

**PASS:** printer/AMS functionality remains intact and cloud auth does not regress to password mode.

## 6. Secret-safe backup

Export settings JSON and verify:

- `_secretsIncluded` is `false`;
- Wi-Fi password is omitted/redacted;
- printer LAN access code is omitted/redacted;
- cloud identity is omitted/redacted;
- no Bambu account password is present.

Restore the redacted backup onto the already-provisioned device.

**PASS:** existing device secrets remain usable instead of being replaced with blanks. A fresh device is expected to require credentials again.

## 7. Manual OTA reliability — RC3 critical retest

From a browser that is already signed in to the RC3 portal:

1. Select a valid OTA image.
2. Browser computes SHA-256 before upload.
3. Background hardware/status polling stops while the ESP32 WebServer owns the long-running upload connection.
4. Upload reaches **100%**.
5. UI receives JSON success rather than `unexpected response`.
6. Device restarts automatically.
7. On reconnect, use the newly generated portal code because reboot invalidates the old RAM session.

RC3 also reports HTTP status/body details for failed OTA responses rather than hiding every non-JSON response behind `unexpected response`.

**PASS:** successful OTA returns a success response and automatic reboot occurs without a native auth challenge.

## 8. Runtime health

Observe the device for at least 15 minutes, preferably including active printer telemetry. Record:

- free heap;
- minimum free heap;
- maximum allocatable heap block;
- free PSRAM;
- Wi-Fi RSSI;
- reconnect behavior.

**PASS:** no continuous memory decline, allocation-failure loop, watchdog reset, UI lockup, or disappearing AMS state.

## 9. Recovery readiness

- Keep the RC3 Full image available before promotion.
- Incorrect/missing manual OTA SHA-256 must be rejected before activation.
- TLS must never fall back to `setInsecure()`.
- Existing alternate-slot/recovery mechanisms remain available.

## 10. Promotion decision

| Gate | Result |
|---|---|
| Boot / touch | RETEST |
| System + Workshop redraw stability | RETEST |
| Portal-code session auth / no Safari prompt storm | RETEST |
| Same-origin mutation protection | RETEST |
| Local printer + AMS telemetry | RETEST |
| Email-code cloud auth, if used | RETEST / N/A |
| Secret-safe export / restore | RETEST |
| Manual OTA SHA-256 + 100% success response | RETEST |
| Runtime heap / PSRAM stability | RETEST |
| Rollback / recovery readiness | RETEST |

Do not merge/promote PR #2 until the physical WS350 passes these gates.

**Release state: `SOFTWARE-VALIDATED / PHYSICAL-RETEST-REQUIRED`.**
