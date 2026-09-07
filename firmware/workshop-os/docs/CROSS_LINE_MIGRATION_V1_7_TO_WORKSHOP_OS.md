# Waveshare Home v1.7.0 → Workshop OS migration proof

This document records the repository-level compatibility evidence for migrating a WS350 from the frozen **Waveshare Home v1.7.0** line in `azmusgb/filamentinventory` to canonical **Workshop OS** in this repository.

It does not constitute physical acceptance. It establishes the safe installation policy before a real-device migration test.

## Finding

**A cross-line OTA migration must not be offered. The first migration to Workshop OS requires a full image written at flash offset `0x0` (USB/web-serial recovery style).**

The partition layouts are materially different.

### Waveshare Home v1.7.0

Source: `azmusgb/filamentinventory/firmware/waveshare-home/WaveshareHome/partitions.csv`

| Partition | Offset | Size |
| --- | ---: | ---: |
| NVS | `0x9000` | `0x5000` |
| OTA data | `0xE000` | `0x2000` |
| app0 | `0x10000` | `0x400000` (4 MiB) |
| app1 | `0x410000` | `0x400000` (4 MiB) |
| SPIFFS | `0x810000` | `0x7F0000` |

### Workshop OS / pinned BambuHelper WS350

The `ws_lcd_350` PlatformIO environment selects `partitions_16mb.csv`.

| Partition | Offset | Size |
| --- | ---: | ---: |
| NVS | `0x9000` | `0x5000` |
| OTA data | `0xE000` | `0x2000` |
| app0 | `0x10000` | `0x640000` (6.25 MiB) |
| app1 | `0x650000` | `0x640000` (6.25 MiB) |
| SPIFFS | `0xC90000` | `0x360000` |

The Workshop OS partition source itself states that changing this partition table requires a full USB flash because OTA cannot update the table.

## Consequences

The first migration cannot safely be implemented by uploading a Workshop OS application-only/OTA image from Waveshare Home v1.7.0 because:

1. `app1` begins at a different offset (`0x410000` vs `0x650000`);
2. both OTA application slot sizes differ materially;
3. the SPIFFS boundary moves from `0x810000` to `0xC90000`;
4. an application-only OTA write does not replace the flash partition table;
5. retained OTA metadata/NVS was created by a different firmware product line and must not be assumed compatible.

## Canonical migration policy

For a WS350 currently running Waveshare Home v1.7.0:

1. preserve/export any human-needed configuration values separately;
2. obtain the physically accepted Workshop OS **Full** image for `ws_lcd_350`;
3. put the board into the supported USB boot/download path;
4. write the Full image at `0x0` using the documented Workshop OS recovery/install tooling;
5. allow Workshop OS to initialize its own partition table and settings model;
6. re-provision Wi-Fi, printer access and inventory/device credentials through Workshop OS management flows rather than importing raw NVS bytes;
7. validate display/touch, Wi-Fi, printer telemetry/control, mapped power, recovery, audio/mic and inventory integration on the real device;
8. only after that full-flash migration has been physically accepted may ordinary Workshop OS application-only OTA updates be used.

## What must not be migrated as raw state

Do not copy raw NVS or OTA metadata from Waveshare Home into Workshop OS. Similar key names or offsets are not a compatibility contract.

Credentials/settings should be re-provisioned semantically through the target product. This avoids carrying forward stale schema values, boot counters, OTA state, portal/session data or firmware-specific configuration that Workshop OS did not create.

## Recovery requirement

Before declaring the migration path accepted, prove both directions needed for recovery operations:

- Workshop OS Full image can recover the WS350 from the v1.7.0 layout;
- the historical Waveshare Home v1.7.0 merged/full image remains available as a provenance/recovery artifact if an intentional rollback to the old product line is required during migration testing.

Cross-line rollback is likewise a **full-flash** operation, not an OTA downgrade.

## Assistant migration impact

This finding does not block porting the v1.7.0 Filament Inventory Assistant behavior into Workshop OS source. It only defines the installation boundary between the two firmware products.

The Assistant port remains gated behind accepted v11.23/v11.24 Workshop OS source and its own real-device acceptance.

## Remaining physical acceptance

Repository evidence proves the layouts are incompatible for cross-line OTA. The following still require the actual WS350:

- full-flash installation succeeds from the current device state;
- boot/display/touch are healthy after repartitioning;
- Workshop OS recovery path remains reachable;
- credentials can be re-provisioned cleanly;
- no unexpected flash/NVS residue changes runtime behavior;
- subsequent same-line Workshop OS OTA update succeeds.
