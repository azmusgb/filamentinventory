# Workshop OS v11.24 Audio Console RC1

v11.24 turns the WS350 ES8311 speaker and onboard microphone into a practical local control surface rather than a pair of diagnostic buttons.

## Physical Audio Console

The System → Audio surface is organized into four explicit pages. Ordinary adjustments use visible directional actions; there are no hidden hold-to-reverse gestures.

### Output

- `VOLUME -10` / `VOLUME +10` — persistent 0–100% ES8311 DAC output level.
- `EVENT SOUNDS` — enable or mute Workshop OS event audio.
- `SPEAKER TEST` — direct local two-tone hardware check.

### Mic

- `MIC LEVEL` — 250 ms onboard-microphone activity sample with 0–100% feedback.
- `ECHO 1 SEC` — short record/playback loop.
- `ECHO 3 SEC` — medium record/playback loop.
- `ECHO 5 SEC` — PSRAM-backed five-second record/playback loop.

The echo path remains local. Audio is captured into temporary RAM/PSRAM, played through the onboard speaker, and released. It is not uploaded or persisted.

### Alerts

- `BUTTON CLICKS`
- `BED COOLDOWN`
- `THRESHOLD -5`
- `THRESHOLD +5`

### Quiet

- `QUIET START -1`
- `QUIET START +1`
- `QUIET END -1`
- `QUIET END +1`

## Hardware behavior

Speaker volume is stored in NVS as `buz_vol` and applied to the ES8311 DAC volume register. A live codec receives the new volume immediately; after an idle shutdown the next lazy codec initialization restores the saved level.

The inherited microphone implementation remains the owner of I2S RX/TX diagnostic handoff, DMA chunking, PSRAM allocation/fallback, mono selection and clipping protection. v11.24 only extends the bounded echo duration from the original short diagnostic window to a maximum of five seconds.

## Release boundary

v11.24 is stacked on the v11.23 RC2 Network / Locale / Layout candidate. It does not replace the physically accepted v11.22 source baseline until both the inherited v11.23 interaction changes and this audio delta pass physical acceptance.

## Physical acceptance

1. Verify 0%, 20%, 50%, 80% and 100% produce clearly different speaker output and that the selected level survives reboot.
2. Confirm Speaker Test remains clean after idle audio shutdown.
3. Confirm Mic Level reacts to speech and distinguishes a very quiet input.
4. Run 1s, 3s and 5s echo and confirm recording length and playback are correct.
5. Confirm audio capture is local-only and no recording remains after the operation/reboot.
6. Confirm Event Sounds, Button Clicks, Bed Cooldown and Quiet Hours still behave as configured.
7. Recheck touch, Network Expert, Display Expert, printer controls, recovery and OTA behavior.
