# Smart Home v9.1 Reliability RC1

## Purpose

v9.1 hardens the device workflow around the two areas that matter most before broader UI expansion: firmware update reliability and Bambu printer discovery.

## OTA improvements

- explicit application-upload transaction state on the device
- authenticated `/ota/manual/status` endpoint
- SHA-256 remains mandatory before activation
- definitive JSON acceptance response before reboot
- longer reboot grace period so the response can leave the ESP32 TCP stack
- browser tracks whether every firmware byte was transferred
- transport loss after a complete transfer is treated as a reboot/confirmation transition, not an immediate generic failure
- device-side error states remain visible when the device stayed online and rejected the image
- artifact includes `WaveshareHome-firmware.bin` as an application-only alias for the built OTA image

## Printer discovery improvements

- passive SSDP listening remains the primary discovery mechanism
- scan window increases to 16 seconds
- periodic active SSDP probes reduce time-to-first-result on printers that answer M-SEARCH
- unrelated SSDP devices are filtered unless Bambu-specific headers are present
- UDP remote address is used as a fallback when a valid Bambu announcement lacks a usable Location IP
- existing stale-scan browser guards, per-slot configuration and manual setup remain intact

## Preserved behavior

- four printer slots where supported
- LAN + cloud configuration
- printer IP, serial and access code
- gauge layout and remote monitor profiles
- chamber-light controls and automation
- v9 command-center visual layer
- portal session authentication
- secret-safe settings export

## Release status

Automated build/validation must pass before physical acceptance. Physical OTA, reboot/reconnect and same-LAN printer discovery are still required on a real WS LCD 3.5 device before promotion beyond RC1.
