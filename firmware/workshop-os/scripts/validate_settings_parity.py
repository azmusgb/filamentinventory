#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_DIR = ROOT / "docs" / "settings-capability-registry"
ALLOWED = {"PHYSICAL", "PHYSICAL-EXPERT", "PORTAL-INPUT", "BOARD-N/A"}

FUNC_RE_TEMPLATE = r"(?:static\s+)?(?:void|bool|String|int|uint\w*|size_t)\s+{name}\s*\([^)]*\)\s*\{{"


class ContractError(RuntimeError):
    pass


def load_registry() -> dict:
    index_path = REGISTRY_DIR / "index.json"
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except FileNotFoundError as e:
        raise ContractError(f"missing registry index: {index_path}") from e
    except json.JSONDecodeError as e:
        raise ContractError(f"invalid registry index JSON: {e}") from e

    settings = []
    files = data.get("categoryFiles")
    if not isinstance(files, list) or not files:
        raise ContractError("registry index requires non-empty categoryFiles")
    for name in files:
        path = REGISTRY_DIR / name
        try:
            category = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as e:
            raise ContractError(f"missing registry category: {path}") from e
        except json.JSONDecodeError as e:
            raise ContractError(f"invalid registry category {path}: {e}") from e
        chunk = category.get("settings")
        if not isinstance(chunk, list):
            raise ContractError(f"{path}: settings must be an array")
        settings.extend(chunk)
    data["settings"] = settings
    return data


def function_body(text: str, name: str) -> str:
    rx = re.compile(FUNC_RE_TEMPLATE.format(name=re.escape(name)))
    m = rx.search(text)
    if not m:
        raise ContractError(f"source function not found: {name}")
    i = m.end()
    depth = 1
    while i < len(text) and depth:
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    if depth:
        raise ContractError(f"unterminated source function: {name}")
    return text[m.end(): i - 1]


def require_physical_evidence(item: dict, sid: str) -> None:
    evidence = item.get("physicalEvidence")
    if not isinstance(evidence, list) or not evidence:
        raise ContractError(f"{sid}: implemented physical setting requires physicalEvidence")
    for marker in evidence:
        if not isinstance(marker, str) or not marker:
            raise ContractError(f"{sid}: physicalEvidence markers must be non-empty strings")


def validate_static(data: dict) -> None:
    if data.get("schemaVersion") != 1:
        raise ContractError("schemaVersion must be 1")
    if data.get("target") != "ws_lcd_350":
        raise ContractError("registry target must be ws_lcd_350")

    declared = set(data.get("allowedClassifications", []))
    if declared != ALLOWED:
        raise ContractError(
            f"allowedClassifications drift: expected {sorted(ALLOWED)}, got {sorted(declared)}"
        )

    non_settings = data.get("nonSettingMutationRoutes")
    if not isinstance(non_settings, dict) or not non_settings:
        raise ContractError("nonSettingMutationRoutes must be a non-empty object")

    route_meta = data.get("routeMetaFields", {})
    if not isinstance(route_meta, dict):
        raise ContractError("routeMetaFields must be an object")

    settings = data.get("settings")
    if not isinstance(settings, list) or not settings:
        raise ContractError("settings must be a non-empty array")

    ids: set[str] = set()
    bindings_seen: dict[tuple[str, str], str] = {}
    setting_routes: set[str] = set()

    for item in settings:
        sid = item.get("id")
        if not isinstance(sid, str) or not sid:
            raise ContractError("every setting requires a non-empty id")
        if sid in ids:
            raise ContractError(f"duplicate setting id: {sid}")
        ids.add(sid)

        cls = item.get("classification")
        if cls not in ALLOWED:
            raise ContractError(f"{sid}: invalid classification {cls!r}")

        implemented = item.get("implementedOnDevice")
        if not isinstance(implemented, bool):
            raise ContractError(f"{sid}: implementedOnDevice must be boolean")

        if cls == "PHYSICAL":
            if not implemented:
                raise ContractError(f"{sid}: PHYSICAL must be implementedOnDevice=true")
            require_physical_evidence(item, sid)
        elif cls == "PHYSICAL-EXPERT":
            if implemented:
                require_physical_evidence(item, sid)
            else:
                if not item.get("plannedRelease"):
                    raise ContractError(
                        f"{sid}: unimplemented PHYSICAL-EXPERT requires plannedRelease"
                    )
                if not item.get("reason"):
                    raise ContractError(
                        f"{sid}: unimplemented PHYSICAL-EXPERT requires reason"
                    )
        elif cls == "PORTAL-INPUT":
            if implemented:
                raise ContractError(f"{sid}: PORTAL-INPUT cannot be implementedOnDevice=true")
            if not item.get("reason"):
                raise ContractError(f"{sid}: PORTAL-INPUT requires reason")
        elif cls == "BOARD-N/A":
            if implemented:
                raise ContractError(f"{sid}: BOARD-N/A cannot be implementedOnDevice=true")
            if not item.get("boardReason"):
                raise ContractError(f"{sid}: BOARD-N/A requires boardReason")

        bindings = item.get("browserBindings")
        if not isinstance(bindings, list) or not bindings:
            raise ContractError(f"{sid}: browserBindings must be non-empty")
        for binding in bindings:
            route = binding.get("route")
            keys = binding.get("keys")
            if not isinstance(route, str) or not route.startswith("/"):
                raise ContractError(f"{sid}: invalid route {route!r}")
            if route in non_settings:
                raise ContractError(f"{sid}: route {route} is also marked non-setting")
            if not isinstance(keys, list) or not keys:
                raise ContractError(f"{sid}: route {route} requires non-empty keys")
            setting_routes.add(route)
            for key in keys:
                if not isinstance(key, str) or not key:
                    raise ContractError(f"{sid}: invalid browser key {key!r}")
                token = (route, key)
                prev = bindings_seen.get(token)
                if prev:
                    raise ContractError(
                        f"browser binding {route}:{key} owned by both {prev} and {sid}"
                    )
                bindings_seen[token] = sid

    for route, fields in route_meta.items():
        if route not in setting_routes:
            raise ContractError(f"routeMetaFields references non-setting route: {route}")
        if not isinstance(fields, list):
            raise ContractError(f"{route}: routeMetaFields must be an array")
        for field in fields:
            if not isinstance(field, str) or not field:
                raise ContractError(f"{route}: invalid meta field {field!r}")

    overlap = setting_routes & set(non_settings)
    if overlap:
        raise ContractError(f"routes classified as both setting and non-setting: {sorted(overlap)}")

    print(f"Settings parity registry static contract: PASS ({len(settings)} logical settings)")


def parse_post_routes(web: str) -> dict[str, str]:
    routes: dict[str, str] = {}
    for m in re.finditer(
        r"(?:SECURE_POST|PUBLIC_POST)\(\s*\"([^\"]+)\"\s*,\s*([A-Za-z0-9_]+)\s*\)",
        web,
    ):
        routes[m.group(1)] = m.group(2)
    for m in re.finditer(
        r"server\.on\(\s*\"([^\"]+)\"\s*,\s*HTTP_POST\s*,\s*([A-Za-z0-9_]+)\s*\)",
        web,
    ):
        routes[m.group(1)] = m.group(2)
    return routes


def direct_arg_keys(body: str) -> set[str]:
    keys = set(re.findall(r'server\.(?:hasArg|arg)\(\s*"([^"]+)"', body))
    keys.update(re.findall(r'ledColorArg\(\s*"([^"]+)"', body))

    for m in re.finditer(
        r"const char\*\s+\w+\s*\[[^\]]+\]\s*=\s*\{([^}]+)\}", body
    ):
        keys.update(re.findall(r'"([^"]+)"', m.group(1)))

    for prefix in re.findall(r'readSlotArg\(\s*"([^"]+)"', body):
        keys.add(prefix + "*")
    return keys


def route_setting_keys(web: str, route: str, handler: str) -> set[str]:
    body = function_body(web, handler)

    if route == "/apply":
        form = function_body(web, "readDisplayFromForm")
        keys = direct_arg_keys(form)
        for prefix in re.findall(r'readGaugeColorsFromForm\(\s*"([^"]+)"', form):
            keys.update({prefix + "_a", prefix + "_l", prefix + "_v"})
        keys.update(re.findall(r'readGaugeLabelFromForm\(\s*"([^"]+)"', form))
        return keys

    if route == "/save/toggle":
        keys = set(re.findall(r'key\s*==\s*"([^"]+)"', body))
        keys.update({"key", "val"})
        return keys

    return direct_arg_keys(body)


def parse_build_version(build: str) -> tuple[int, int, int]:
    m = re.search(r'SMART_HOME_VERSION\s+"v(\d+)\.(\d+)(?:\.(\d+))?"', build)
    if not m:
        raise ContractError("reconstructed source does not expose SMART_HOME_VERSION")
    return int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)


def validate_against_source(data: dict, repo: Path) -> None:
    web_path = repo / "src" / "web_server.cpp"
    hub_path = repo / "src" / "smart_hub.cpp"
    build_path = repo / "include" / "smart_home_build.h"
    for path in (web_path, hub_path, build_path):
        if not path.exists():
            raise ContractError(f"reconstructed source missing: {path}")

    web = web_path.read_text(encoding="utf-8", errors="replace")
    hub = hub_path.read_text(encoding="utf-8", errors="replace")
    build = build_path.read_text(encoding="utf-8", errors="replace")

    version = parse_build_version(build)
    if version < (11, 20, 0):
        raise ContractError(
            f"settings parity audit expects reconstructed v11.20+ source, got v{version[0]}.{version[1]}.{version[2]}"
        )

    post_routes = parse_post_routes(web)
    actual_routes = set(post_routes)

    registry_by_route: dict[str, set[str]] = defaultdict(set)
    for item in data["settings"]:
        for binding in item["browserBindings"]:
            registry_by_route[binding["route"]].update(binding["keys"])

    setting_routes = set(registry_by_route)
    non_setting_routes = set(data["nonSettingMutationRoutes"])
    expected_routes = setting_routes | non_setting_routes

    added_routes = sorted(actual_routes - expected_routes)
    removed_routes = sorted(expected_routes - actual_routes)
    if added_routes or removed_routes:
        raise ContractError(
            "POST route inventory drift: "
            f"unclassified={added_routes or 'none'} "
            f"missing={removed_routes or 'none'}"
        )

    route_meta = {
        route: set(fields) for route, fields in data.get("routeMetaFields", {}).items()
    }

    for route in sorted(setting_routes):
        actual = route_setting_keys(web, route, post_routes[route])
        expected = registry_by_route[route] | route_meta.get(route, set())
        extra = sorted(actual - expected)
        missing = sorted(expected - actual)
        if extra or missing:
            raise ContractError(
                f"{route}: browser-field inventory drift: "
                f"unclassified={extra or 'none'} missing={missing or 'none'}"
            )

    for item in data["settings"]:
        if not item.get("implementedOnDevice"):
            continue
        if item["classification"] not in {"PHYSICAL", "PHYSICAL-EXPERT"}:
            continue
        for marker in item["physicalEvidence"]:
            if marker not in hub:
                raise ContractError(
                    f"{item['id']}: physical evidence missing from smart_hub.cpp: {marker}"
                )

    print(
        "Settings parity reconstructed-source contract: PASS "
        f"(v{version[0]}.{version[1]}.{version[2]}, "
        f"{len(setting_routes)} settings routes, {len(non_setting_routes)} non-setting POST routes)"
    )


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Validate the WS350 browser-setting capability registry."
    )
    ap.add_argument(
        "--repo",
        help="Optional reconstructed BambuHelper source root for route/key/evidence validation.",
    )
    args = ap.parse_args()

    try:
        data = load_registry()
        validate_static(data)
        if args.repo:
            validate_against_source(data, Path(args.repo).resolve())
    except ContractError as e:
        raise SystemExit(f"SETTINGS PARITY CONTRACT FAILED: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
