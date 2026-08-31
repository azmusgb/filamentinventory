# Waveshare Home

Touch-first general-purpose Home Hub firmware for the **Waveshare ESP32-S3-Touch-LCD-3.5** (320×480, ST7796, FT6336/FT6X36).

The printer is an integration, not the identity of the device. The Home screen is designed around **NOW + NEXT + STATUS**, with live services feeding one shared state/attention model.

> **rc9 validation trigger:** rc9 adds dedicated Weather save/resolve controls, corrected Weather state semantics, semantic firmware-version comparison, and corrected Preview-channel GitHub release selection for device-managed OTA. This documentation-only change intentionally triggers the firmware build workflow after the automated rc9 migration commit.

> **rc8 validation:** OTA upload and self-update paths are hardened against ESP32 task-watchdog starvation. This documentation-only commit intentionally triggers the firmware validation workflow after the automated rc8 migration commit.

## v1.0.0-rc1

This is the first platform-scale build. It replaces hard-coded app demo state with service adapters, persistent configuration, recovery protection and browser administration.

### Platform foundation

- Modular service plug-in architecture (`ServicePlugin` + `ServiceManager`)
- Shared typed state model for system, weather, printer, filament, Home Assistant, calendar, timers and alerts
- Intelligent NOW card with Auto / Printer / Weather / Calendar / Filament / System modes
- Three user-selectable Home cards
- Midnight, OLED Black and High Contrast themes
- Dynamic status bars with clock, Wi-Fi state and alert count
- Context-aware ambient screen
- Real Attention Center generated from service/system state

### Timezone and clock

Timezone is no longer hard-coded. The device stores a selectable timezone and the corresponding POSIX DST rule. Included choices:

- UTC
- US Eastern
- US Central
- US Mountain
- Arizona
- US Pacific
- Alaska
- Hawaii
- London
- Central Europe
- Sydney

The web dashboard and touchscreen Settings page can change the clock configuration. NTP uses `pool.ntp.org` and `time.nist.gov`.

### Wi-Fi management

The device uses its own non-blocking Wi-Fi manager rather than blocking the LVGL render loop.

- Reuses saved ESP32 Wi-Fi credentials
- Shows SSID, RSSI and IP on the touchscreen
- Reconnect and Forget actions
- If Wi-Fi cannot connect, starts `WaveshareHome-Setup`
- Wildcard DNS captive portal for phone/Mac onboarding
- Wi-Fi scan and password form in the local dashboard
- Local UI continues running while offline

### Local web dashboard

When connected, open:

```text
http://<device-ip>/
```

When in setup mode, join `WaveshareHome-Setup` and open:

```text
http://192.168.4.1/
```

The dashboard provides:

- Wi-Fi setup / reconnect / forget
- Device name
- Timezone
- Brightness
- Ambient timeout and dim level
- Theme
- NOW-card behavior
- Three Home-card selections
- Weather configuration
- Bambu configuration
- Filament Inventory configuration
- Home Assistant configuration
- Calendar ICS configuration
- Audio enable / volume / speaker test
- Timer actions
- System JSON status at `/api/status`
- Browser OTA
- Restart and factory-reset controls

### OTA firmware updates

v1 uses a custom 16 MB dual-slot partition table:

- NVS
- OTA metadata
- 4 MB `app0`
- 4 MB `app1`
- remaining flash for SPIFFS

**Important:** the first move from v0.x to v1 must be flashed over USB using `WaveshareHome-merged.bin` at `0x0`, because the partition table changes.

After v1 is installed, normal firmware upgrades can be uploaded from the web dashboard using:

```text
WaveshareHome-firmware.bin
```

Do **not** upload the merged image to the OTA page. The merged image is for USB recovery/initial installation only.

### Crash-safe boot and recovery

- Persistent boot-attempt counter in NVS
- Task watchdog enabled
- Reset reason reported on System screen and web API
- Firmware marks itself stable after 45 seconds of successful runtime
- Three consecutive unstable starts enter Recovery Mode
- Holding the board **BOOT** button during startup also requests Recovery Mode
- Recovery Mode leaves display, Wi-Fi setup, diagnostics and OTA web administration available while integration plug-ins remain disabled
- Successful stable boot calls the ESP-IDF OTA validation API so future rollback-capable OTA workflows have a known-good application

### Weather

Weather uses Open-Meteo for current conditions and one-day forecast:

- Current temperature
- Feels-like temperature
- Condition
- Daily high / low
- Precipitation probability

For U.S. coordinates, the optional alert adapter checks the National Weather Service active-alert endpoint and promotes active alerts into the Attention Center.

### Bambu Lab P1S

Bambu integration uses the printer's local MQTT interface:

- TLS port 8883
- username `bblp`
- printer LAN access code
- printer serial-number topic
- print state
- job name
- progress
- remaining time
- nozzle / bed temperature
- current / total layers
- error code
- AMS loaded tray count
- active tray
- AMS humidity where supplied by the printer payload

The plug-in requests a full push payload after connection and uses reconnect backoff when the printer is unavailable.

### Filament Inventory

The firmware connects to this repository's production cloud sync API rather than a demo endpoint:

```text
https://filamentinventory.netlify.app/api/sync
```

It uses the existing private headers:

```text
X-Filament-Sync-Key
X-Filament-Profile: Bill | Aimee
```

The device reports:

- total live spools
- loaded spools
- low spools
- empty spools
- spools with unknown remaining quantity

Remaining quantity follows the same evidence order as the web inventory: measured gross/tare first, then usage estimate, then visual percentage.

### Home Assistant

Home Assistant is configured with a base URL and long-lived access token. The v1 plug-in supports:

- Four selected entity states on the Controls screen
- Friendly labels
- One configured Scene action
- One configured Automation action

This intentionally starts with a curated entity set instead of attempting to render every Home Assistant entity on a 320×480 screen.

### Calendar

The Calendar adapter accepts a private ICS feed URL and shows the next upcoming event. It handles UTC (`Z`) timestamps and local timestamps. It is intentionally a lightweight embedded parser rather than a complete RFC 5545 recurrence engine.

### Timers

- Four local timer slots
- Touchscreen quick timers: 5, 10 and 30 minutes
- Browser-created timer
- Remaining-time display
- ES8311 alert tone when a timer expires

### Audio

Audio uses the official Waveshare ES8311 example pin mapping for this exact board:

- I²C SDA: GPIO 8
- I²C SCL: GPIO 7
- I²S MCLK: GPIO 12
- I²S BCLK: GPIO 13
- I²S LRCK: GPIO 15
- I²S DOUT: GPIO 16
- I²S DIN: GPIO 14
- 44.1 kHz, 16-bit stereo

The firmware initializes the ES8311, supports volume control, a speaker-test chirp and timer alert tones.

## Hardware target

- Waveshare ESP32-S3-Touch-LCD-3.5
- ESP32-S3R8
- 16 MB flash
- 8 MB PSRAM
- ST7796 320×480 LCD
- FT6336 / FT6X36 capacitive touch
- TCA9554 I/O expander
- ES8311 playback codec
- supplied 6Ω / 1W speaker

## Build dependencies

The GitHub workflow pins:

- ESP32 Arduino core 3.2.0
- LVGL 8.4.0
- GFX Library for Arduino 1.5.5
- SensorLib 0.3.1
- TCA9554 0.1.2
- ArduinoJson 7.4.2
- PubSubClient 2.8
- official Waveshare `es8311` Arduino library from the ESP32-S3-Touch-LCD-3.5 repository

## First v1 installation from macOS

Download the current `WaveshareHome-ESP32S3-v1` Actions artifact and extract it. Then, with the display attached:

```bash
python -m esptool \
  --chip esp32s3 \
  --port /dev/cu.usbmodem101 \
  --baud 460800 \
  write-flash 0x0 WaveshareHome-merged.bin
```

Use the current `/dev/cu.usbmodem*` path shown by `ls /dev/cu.*` if macOS assigns a different port.

Because the v1 merged image installs a new OTA partition table, USB flashing is mandatory for this migration. Subsequent application-only upgrades can use the browser OTA page.

## Security notes

Integration credentials (Bambu access code, Filament Inventory sync key, Home Assistant token, private calendar URL) are stored locally in ESP32 NVS and password/token fields are not echoed back into the dashboard HTML.

The current embedded HTTPS clients use TLS encryption without CA-chain verification (`setInsecure()`) to accommodate local/self-signed endpoints and constrained-device certificate management. Treat the Home Hub and its configuration dashboard as trusted-LAN infrastructure. A future hardening pass should add pinned/root certificates and dashboard authentication before exposing the device beyond the local network.

## Current acceptance status

The physical hardware has already validated display initialization, portrait rendering, LVGL touch input, Wi-Fi captive provisioning and NTP time sync on the v0.2.1/v0.3 lineage. v1 retains that display/touch initialization path but significantly expands networking, partitions and integrations, so it must pass GitHub compile validation and then a fresh physical acceptance pass before being treated as production firmware.
