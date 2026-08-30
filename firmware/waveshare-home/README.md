# Waveshare Home

Touch-first home dashboard firmware for the **Waveshare ESP32-S3-Touch-LCD-3.5** (320x480, ST7796, FT6336/FT6X36).

## Included in v0.1

- Home dashboard
- Today / agenda view
- Controls / rooms view
- Apps library
- Attention center
- Quick panel
- Touch navigation
- Adaptive clock placeholder
- Waveshare-specific display, touch, IO-expander, and PSRAM initialization

The first build intentionally uses safe demo data. Live integrations (weather, calendar, home automation, Bambu, filament inventory) are the next layer and do not block validating the UI shell on hardware.

## Arduino dependencies

- ESP32 core >= 3.2.0
- LVGL 8.4.0
- GFX Library for Arduino 1.5.5
- SensorLib 0.3.1
- TCA9554 0.1.2

## Flashing

Use the generated `WaveshareHome-firmware.bin` with the app offset `0x10000`, or use the merged image when provided by CI.

Keep a known-good recovery firmware available before flashing custom firmware.
