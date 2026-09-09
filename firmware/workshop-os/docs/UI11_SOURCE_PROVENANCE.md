# Workshop OS v11.26 UI11 source provenance

This branch consolidates the buildable source recipe for the already-published `workshop-os-v11.26-ui11-cupertino` hardware candidate onto the current `main` lineage before any UI12 work.

## Boundary

The published v11.26 candidate binary remains authoritative by exact artifact identity in `releases/device-update.json` and is not rebuilt or replaced by this source consolidation. Stable remains `production-workshop-os-v11.19.1`.

The source recipe was preserved from historical branch head:

`54e045f9fcf1ca237f850c7cbbc0bf79ac2f89e0`

Required patch scripts, UI fragments, CSS layers, and local/build scripts are copied by existing Git blob identity from that historical source. This avoids merging the historical 203-commit RC chain wholesale while retaining the reconstructable implementation.

## Reconstruction

`scripts/run_rc10_local.sh` reconstructs pinned upstream `8cb1cbbb6d3c175af91989e8ebe1bbdcbe848ac4` through v11.25 RC10. `apply_workshop_os_cupertino_ui_v11_26_ui11.py` then applies UI11, and `scripts/build_ui11_macos_production.sh` provides the production build recipe.

This source consolidation is implementation/provenance work only. It does not establish build, runtime, production, physical-acceptance, accepted, or stable status for any newly produced binary.
