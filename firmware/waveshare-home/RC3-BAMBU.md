# v1.0.0-rc3 Bambu management

This release upgrades local Bambu printer management with SSDP discovery, one-click selection, model mapping, richer MQTT telemetry, printer health/status attributes, and expanded touchscreen/web diagnostics.

Discovery recognizes real Bambu SSDP headers (`USN`, `DevName.bambu.com`, `DevModel.bambu.com`, `DevVersion.bambu.com`, `DevSignal.bambu.com`) and maps common model codes including P1S/P1P/A1/A1 mini/X1/X1C/X1E/H2D.

Manual host, serial, and LAN access-code configuration remain available as a fallback. LAN access code is still required to authenticate local MQTT telemetry.
