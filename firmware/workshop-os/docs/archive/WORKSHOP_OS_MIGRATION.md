# Workshop OS Migration

## Goal

Evolve BambuHelper into a local-first workshop control plane for the Waveshare ESP32 display.

## Migration stages

1. Preserve validated v7 printer experience.
2. Introduce service boundaries for printer, network, device, and updates.
3. Add dashboard cards with explicit states.
4. Add OTA release manifest validation.
5. Add hardware regression checklist.

## UX rules

- Prioritize current state over configuration.
- Keep deep diagnostics behind secondary navigation.
- Never block printer status with maintenance views.
- Every action needs success and failure feedback.
