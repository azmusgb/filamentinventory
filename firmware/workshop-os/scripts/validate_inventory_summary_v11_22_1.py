#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def require(text: str, token: str, label: str) -> None:
    if token not in text:
        raise SystemExit(f"FAIL: missing {label}: {token}")


def forbid(text: str, token: str, label: str) -> None:
    if token in text:
        raise SystemExit(f"FAIL: forbidden {label}: {token}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="upstream")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()

    hub = (repo / "src" / "smart_hub.cpp").read_text(encoding="utf-8")
    web = (repo / "src" / "web_server.cpp").read_text(encoding="utf-8")
    build = (repo / "include" / "smart_home_build.h").read_text(encoding="utf-8")

    require(build, 'SMART_HOME_VERSION "v11.22.1"', "build version")
    require(build, 'SMART_HOME_PROFILE "inventory-summary"', "build profile")
    require(
        build,
        'SMART_HOME_BUILD_LABEL "Workshop OS v11.22.1 Inventory Summary RC1"',
        "build label",
    )

    require(hub, "InventorySummaryState", "inventory state model")
    require(hub, "g_inventoryView", "Workshop inventory subview")
    require(hub, "fetchInventorySummary", "inventory fetch")
    require(hub, "contractVersion", "contract validation")
    require(hub, '"X-Filament-Sync-Key"', "sync-key header")
    require(hub, '"X-Filament-Profile"', "profile header")
    require(hub, "setCACertBundle", "verified TLS CA bundle")
    require(hub, "INV_STALE", "explicit stale state")
    require(hub, "INV_AUTH_ERROR", "explicit auth state")
    require(hub, "INV_INVALID_RESPONSE", "invalid-response state")
    require(hub, "INV_UNSUPPORTED_CONTRACT", "contract-version state")
    require(hub, '"INVENTORY"', "Workshop inventory entry")
    require(hub, '"REFRESH"', "manual refresh")
    require(hub, '"BACK"', "explicit back control")

    # Inventory networking must never inherit the generic custom endpoint's
    # insecure TLS behavior.
    inventory_start = hub.find("fetchInventorySummary")
    if inventory_start < 0:
        raise SystemExit("FAIL: inventory fetch function not found")
    inventory_region = hub[inventory_start:inventory_start + 8000]
    forbid(inventory_region, "setInsecure()", "inventory insecure TLS")

    require(web, "handleHubInventoryGet", "inventory config/status GET")
    require(web, "handleHubInventorySave", "inventory config POST")
    require(web, 'SECURE_GET("/hub/inventory"', "secure inventory GET route")
    require(web, 'SECURE_POST("/hub/inventory"', "secure inventory POST route")

    # Compatibility credential must not be serialized back to portal clients.
    get_start = web.find("handleHubInventoryGet")
    save_start = web.find("handleHubInventorySave")
    if get_start < 0 or save_start < 0 or save_start <= get_start:
        raise SystemExit("FAIL: inventory portal handler boundaries not found")
    get_region = web[get_start:save_start]
    forbid(get_region, 'doc["key"]', "credential disclosure")
    forbid(get_region, 'doc["syncKey"]', "credential disclosure")
    forbid(get_region, 'doc["invKey"]', "credential disclosure")

    # Explicit authority boundary: do not derive inventory placement from AMS.
    inventory_tokens = [
        "g_inventory.summary.loaded",
        "summary[\"loaded\"]",
    ]
    if not any(token in hub for token in inventory_tokens):
        raise SystemExit("FAIL: loaded count is not read from inventory feed summary")

    print("Workshop OS v11.22.1 Inventory Summary contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
