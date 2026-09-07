# Smart Home v9.1 Reliability RC1 — Physical Acceptance

This release exists to make the normal device workflow reliable before adding more feature surface.

## Automated gates

The v9.1 workflow must pass all of the following before the firmware is offered for physical testing:

- WS LCD 3.5 (`ws_lcd_350`) build
- shared 320×480 regression build
- SHA-256 protected browser OTA contract
- explicit OTA acceptance response before reboot
- reboot-aware browser transport handling
- authenticated manual OTA status endpoint
- session-auth and same-origin protections
- no TLS downgrade fallback
- no plaintext persisted Bambu cloud password
- Bambu-only SSDP filtering
- SSDP remote-IP fallback
- active SSDP discovery probes plus the passive listen window
- four-printer configuration contract
- Full image + application-only OTA image packaging
- `WaveshareHome-firmware.bin` application-image alias for the device recovery uploader

## Physical OTA acceptance

1. Confirm the device is online and the browser portal is authenticated.
2. Open the device update/recovery surface.
3. Select the v9.1 application image (`WaveshareHome-firmware.bin` or the identically hashed v9.1 OTA image).
4. Start the update.
5. Confirm upload progress reaches 100%.
6. Confirm the UI transitions to verification/flashing rather than reporting a generic connection failure.
7. Confirm the device reports acceptance or cleanly transitions into reboot detection.
8. Confirm the device disappears from the network and returns.
9. Confirm the browser reconnects to the new firmware rather than reloading the old build.
10. Confirm the System screen identifies **Smart Home v9.1 Reliability RC1**.

## Printer discovery acceptance

Test with a Bambu printer on the same normal LAN as the display.

1. Open **Printer Settings** and choose an unconfigured slot.
2. Choose **LAN Mode** and select **Scan local network**.
3. Confirm the scan remains active long enough to receive Bambu announcements.
4. Confirm unrelated SSDP devices do not appear as printers.
5. Confirm a discovered printer includes serial number and IP; name/model should populate when advertised.
6. Select the printer and verify the IP + serial fields are filled for the same slot that initiated the scan.
7. Save and verify the connection.
8. Repeat after changing printer slot during/after a scan to confirm stale results do not overwrite another slot.
9. If multicast is blocked, confirm the portal reports that limitation and manual IP/serial/access-code setup remains available.

## Configuration preservation

After OTA, confirm existing configuration remains intact:

- Wi-Fi and hostname
- up to four printer slots
- LAN/cloud connection modes
- gauge layouts and capability-aware options
- chamber-light rules
- display/standby preferences
- integrations and diagnostics settings

A physical pass is required before v9.1 can replace the prior release candidate.
