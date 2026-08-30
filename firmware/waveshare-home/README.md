# Waveshare Home

Touch-first home hub firmware for the **Waveshare ESP32-S3-Touch-LCD-3.5** (320x480, ST7796, FT6336/FT6X36).

## v0.2.0

This release evolves the validated v0.1 UI shell into an adaptive home-hub foundation.

### Experience

- Near-black, higher-contrast visual system tuned from the real 3.5-inch display
- Refined Home, Today, Controls, Apps, Attention, Quick Panel, and System screens
- Stronger hierarchy and reduced card/border noise
- Adaptive ambient mode after inactivity
- Touch-to-wake behavior
- Persistent brightness control with real PWM backlight output
- More honest empty/offline states instead of hard-coded demo telemetry

### Connectivity and system

- Wi-Fi onboarding through a captive portal named `WaveshareHome-Setup`
- Saved Wi-Fi credentials handled by WiFiManager
- NTP-backed time/date once connected
- Eastern US timezone/DST rule in the current build
- Online/offline state reflected in the UI
- Device diagnostics screen with firmware version, IP address, RSSI, heap, PSRAM, brightness, uptime, and audio-codec detection
- ES8311 presence check over I2C for speaker/audio hardware commissioning
- Persistent settings through ESP32 Preferences/NVS
- Graceful offline operation when Wi-Fi setup is skipped or unavailable

### App/service placeholders

The shell is ready for live service adapters without redesigning navigation:

- Weather
- Calendar/agenda
- Smart-home rooms/scenes/devices
- Bambu printer status/control
- Filament Inventory
- Timers
- Notifications/attention

These services intentionally show explicit unconfigured states until their real data sources are connected.

## Hardware target

- Waveshare ESP32-S3-Touch-LCD-3.5
- ESP32-S3R8
- 16 MB flash
- 8 MB PSRAM
- ST7796 320x480 LCD
- FT6336 / FT6X36 capacitive touch
- TCA9554 I/O expander
- ES8311 playback codec detection

## Arduino dependencies

- ESP32 core 3.2.0
- LVGL 8.4.0
- GFX Library for Arduino 1.5.5
- SensorLib 0.3.1
- TCA9554 0.1.2
- WiFiManager 2.0.17

## First boot

1. Flash `WaveshareHome-merged.bin` at address `0x0`.
2. Reboot the display.
3. If no saved Wi-Fi network can be reached, the device creates the setup network `WaveshareHome-Setup` for up to three minutes.
4. Join that network from a phone or computer and complete the Wi-Fi captive portal.
5. After joining the configured Wi-Fi network, the device synchronizes date/time by NTP.
6. Open **System** from Apps or Quick Panel to verify Wi-Fi, memory, audio-codec detection, and firmware version.

## Flashing from macOS

With `esptool` available in the active Python environment and the Waveshare attached as `/dev/cu.usbmodem101`:

```bash
python -m esptool \
  --chip esp32s3 \
  --port /dev/cu.usbmodem101 \
  --baud 460800 \
  write-flash 0x0 WaveshareHome-merged.bin
```

Use the current `/dev/cu.usbmodem*` path shown by `ls /dev/cu.*` if macOS assigns a different number.

## Current validation status

The v0.1 hardware baseline has been proven on the physical Waveshare unit: display initialization, portrait rendering, LVGL layout, and boot behavior are working. v0.2 should be treated as the next hardware acceptance build for Wi-Fi onboarding, brightness PWM, ambient mode, diagnostics, and live clock behavior.
