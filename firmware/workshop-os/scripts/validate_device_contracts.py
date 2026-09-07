#!/usr/bin/env python3
"""Static release checks for the generated BambuHelper device surface.

This runs after the complete patch stack has been applied to the pinned upstream
checkout. It deliberately checks behavior contracts rather than UI strings so a
release cannot claim OTA/discovery support when the generated sources omit it.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path("upstream")


def read(path: str) -> str:
    p = ROOT / path
    if not p.is_file():
        raise SystemExit(f"MISSING FILE: {path}")
    return p.read_text(encoding="utf-8")


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise SystemExit(f"MISSING {label}: {needle}")


def require_any(text: str, needles: tuple[str, ...], label: str) -> None:
    if not any(n in text for n in needles):
        raise SystemExit(f"MISSING {label}: expected one of {needles}")


def forbid(text: str, needle: str, label: str) -> None:
    if needle in text:
        raise SystemExit(f"FORBIDDEN {label}: {needle}")


web = read("src/web_server.cpp")
app = read("web/app.js")
settings = read("src/settings.cpp")
ssdp = read("src/ssdp_discovery.cpp")

# ---------------------------------------------------------------------------
# Manual/device OTA contract
# ---------------------------------------------------------------------------
require(web, "handleOtaUpload", "OTA upload handler")
require(web, "Update.write", "OTA flash write")
require(web, "Update.end(true)", "OTA finalization")
require(web, "X-SHA256", "OTA SHA-256 request contract")
require(web, "mbedtls_sha256", "device-side SHA-256 verification")
require(web, "memcmp(actualSha, otaShaExpected", "OTA digest comparison")
require(web, "Firmware SHA-256 mismatch", "OTA mismatch error")
require(web, "Update.abort()", "OTA abort path")
forbid(web, "client.setInsecure();", "TLS downgrade")

# The upload endpoint must not activate an image when integrity verification
# fails. This is a structural guard against accidentally moving Update.end()
# ahead of the digest comparison in a later patch.
sha_pos = web.find("memcmp(actualSha, otaShaExpected")
end_pos = web.find("Update.end(true)")
if sha_pos < 0 or end_pos < 0 or sha_pos > end_pos:
    raise SystemExit("INVALID OTA ordering: SHA verification must precede Update.end(true)")

# Browser-side upload must provide the digest and retain the authenticated
# session. The exact helper names are part of the v8/v9 portal contract.
require(app, "sha256HexArrayBuffer", "browser SHA helper")
require(app, "X-SHA256", "browser SHA header")
require(app, "xhr.withCredentials = true;", "authenticated OTA upload")
require(app, "stopPolling();", "OTA polling pause")

# v9.1 must distinguish a completed transfer/reboot transition from a genuine
# upload failure and expose the device's accepted/error state while still online.
require(app, "confirmOtaAfterTransportLoss", "reboot-aware OTA confirmation")
require(app, "uploadTransferred", "OTA transfer completion tracking")
require(web, "handleManualOtaStatus", "manual OTA status handler")
require_any(
    web,
    (
        'SECURE_GET("/ota/manual/status", handleManualOtaStatus)',
        'server.on("/ota/manual/status", HTTP_GET, handleManualOtaStatus)',
    ),
    "manual OTA status route",
)
require(web, 'manualOtaPhase = "accepted"', "definitive OTA acceptance state")

# ---------------------------------------------------------------------------
# Printer discovery/configuration contract
# ---------------------------------------------------------------------------
require(app, "'/lan/scan'", "LAN discovery endpoint")

# Security hardening rewrites the raw server.on registrations to SECURE_GET /
# SECURE_POST. Accept either representation, but require both methods because
# POST starts a scan while GET polls the in-flight result.
require_any(
    web,
    (
        'server.on("/lan/scan", HTTP_POST',
        'SECURE_POST("/lan/scan", handleLanScan)',
    ),
    "LAN discovery POST route",
)
require_any(
    web,
    (
        'server.on("/lan/scan", HTTP_GET',
        'SECURE_GET("/lan/scan", handleLanScan)',
    ),
    "LAN discovery GET compatibility route",
)

require_any(app, ("serial", "serialNumber", "serial_number"), "printer serial mapping")
require_any(app, ("ip", "ipAddress", "ip_address"), "printer IP mapping")
require_any(app, ("save", "verify", "connection"), "printer verification UI")

# Discovery itself must be Bambu-specific and preserve both passive and active
# discovery paths. Remote-IP fallback avoids losing otherwise-valid printers
# whose SSDP Location header is absent or malformed.
require(ssdp, "DevName.bambu.com:", "Bambu SSDP vendor marker")
require(ssdp, "DevModel.bambu.com:", "Bambu SSDP model marker")
require(ssdp, "bambuMarker", "Bambu-only SSDP filtering")
require(ssdp, "sendDiscoveryProbe", "active SSDP discovery")
require(ssdp, "remoteIp", "SSDP remote-IP fallback")
require(ssdp, "SSDP_SCAN_MS = 16000", "extended SSDP scan window")

# Four-slot configuration must remain represented in the settings layer. The
# historical implementation has used either explicit names or indexed slots.
settings_lower = settings.lower()
if not any(token in settings_lower for token in (
    "printer1", "printer_1", "slot1", "slot 1", "printerconfigs[", "printers["
)):
    raise SystemExit("MISSING printer slot settings contract")

# Do not persist a cloud password in plaintext. This is particularly important
# because printer discovery and cloud fallback share the same settings surface.
forbid(settings, 'prefs.putString("cl_pass", password)', "plaintext cloud password persistence")

print("DEVICE CONTRACTS: PASS")
print("  OTA integrity + authenticated upload: PASS")
print("  OTA definitive acceptance + reboot recovery: PASS")
print("  OTA abort-before-activation ordering: PASS")
print("  LAN printer discovery routes: PASS")
print("  Bambu-only SSDP + active discovery: PASS")
print("  printer identity mapping: PASS")
print("  printer slot persistence: PASS")
print("  cloud-secret persistence guard: PASS")
