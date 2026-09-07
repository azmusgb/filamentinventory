#!/usr/bin/env python3
"""Materialize the immutable historical BambuHelper tree used by Workshop OS.

The exact commit is the Workshop OS source pin. GitHub's normal checkout path can
occasionally stop resolving an old detached commit, while the immutable root tree
and blob objects remain available. This helper reconstructs the text/source tree
from those Git objects and verifies every blob by Git SHA before use.

It intentionally excludes only binary payloads that cannot influence the Python
patch chain or native source build (prebuilt firmware, images, fonts, archives and
host executables). This is broader than a hand-picked source subset because some
historic Workshop OS applicators validate README/docs/release metadata too.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OWNER = "Keralots"
REPO = "BambuHelper"
PINNED_COMMIT = "8cb1cbbb6d3c175af919e8ebe1bbdcbe848ac4"
PINNED_TREE = "754c5506bdac08033f0cdc3439e4814acd2b4294"
API = "https://api.github.com"

# Exclude payloads that are not inputs to the source reconstruction/build. The
# path list remains intentionally small and extension-based so metadata/docs
# consumed by old patchers are not silently omitted.
BINARY_SUFFIXES = {
    ".bin", ".exe", ".dll", ".dylib", ".so", ".a", ".o", ".elf",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".pdf",
    ".ttf", ".otf", ".woff", ".woff2",
    ".zip", ".7z", ".rar", ".gz", ".tgz", ".tar", ".xz",
    ".mp3", ".wav", ".ogg", ".mp4", ".mov",
}
MAX_TEXT_BLOB_BYTES = 3_000_000


def selected(entry: dict) -> bool:
    path = entry.get("path", "")
    suffix = Path(path).suffix.lower()
    if suffix in BINARY_SUFFIXES:
        return False
    size = int(entry.get("size") or 0)
    return size <= MAX_TEXT_BLOB_BYTES


def request_json(url: str, token: str | None, attempts: int = 5) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "WorkshopOS-pinned-upstream-materializer/2",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, headers=headers), timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            last = exc
            if attempt + 1 == attempts:
                break
            time.sleep(1.25 * (attempt + 1))
    raise RuntimeError(f"GitHub API request failed for {url}: {last}")


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def fetch_blob(entry: dict, token: str | None) -> tuple[str, bytes, str, str]:
    path = entry["path"]
    expected = entry["sha"]
    mode = entry.get("mode", "100644")
    payload = request_json(entry["url"], token)
    if payload.get("sha") != expected:
        raise RuntimeError(
            f"{path}: blob identity changed: expected {expected}, got {payload.get('sha')}"
        )
    if payload.get("encoding") != "base64":
        raise RuntimeError(f"{path}: unsupported blob encoding {payload.get('encoding')!r}")
    data = base64.b64decode(payload["content"], validate=False)
    actual = git_blob_sha(data)
    if actual != expected:
        raise RuntimeError(f"{path}: blob SHA verification failed: {actual} != {expected}")
    return path, data, expected, mode


def materialize(dest: Path, token: str | None, workers: int) -> None:
    tree_url = f"{API}/repos/{OWNER}/{REPO}/git/trees/{PINNED_TREE}?recursive=1"
    tree = request_json(tree_url, token)
    if tree.get("sha") != PINNED_TREE:
        raise RuntimeError(
            f"root tree mismatch: expected {PINNED_TREE}, got {tree.get('sha')}"
        )
    if tree.get("truncated"):
        raise RuntimeError("GitHub returned a truncated pinned tree; refusing partial reconstruction")

    all_blobs = [item for item in tree.get("tree", []) if item.get("type") == "blob"]
    entries = [item for item in all_blobs if selected(item)]
    excluded = [item for item in all_blobs if not selected(item)]
    if not entries:
        raise RuntimeError("no source/text blobs selected from pinned tree")

    required = {
        "platformio.ini",
        "merge_bins.py",
        "README.md",
        "boards/ws_lcd_350.ini",
        "src/main.cpp",
        "src/settings.cpp",
        "src/settings.h",
        "src/display_ui.cpp",
        "src/button.cpp",
        "src/button.h",
        "src/web_server.cpp",
        "web/app.js",
        "web/app.css",
        "tools/gen_web_assets.py",
        "docs/index.html",
        "docs/styles.css",
        "docs/flasher.js",
    }
    paths = {entry["path"] for entry in entries}
    missing = sorted(required - paths)
    if missing:
        raise RuntimeError(f"pinned tree is missing required reconstruction inputs: {missing}")

    if dest.exists():
        if any(dest.iterdir()):
            raise RuntimeError(f"destination is not empty: {dest}")
    else:
        dest.mkdir(parents=True)

    print(f"Pinned upstream commit identity: {PINNED_COMMIT}")
    print(f"Pinned immutable tree: {PINNED_TREE}")
    print(f"Materializing {len(entries)}/{len(all_blobs)} verified source/text blobs with {workers} workers")
    print(f"Excluded binary/oversize blobs: {len(excluded)}")

    records: list[tuple[str, str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        future_map = {pool.submit(fetch_blob, entry, token): entry for entry in entries}
        for index, future in enumerate(concurrent.futures.as_completed(future_map), 1):
            path, data, sha, mode = future.result()
            target = dest / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            # Preserve executable bit for shell/python tooling when represented by
            # Git mode; normal CI invocation does not depend on it, but fidelity does.
            if mode == "100755":
                target.chmod(target.stat().st_mode | 0o111)
            records.append((path, sha, mode))
            if index % 50 == 0 or index == len(entries):
                print(f"  verified {index}/{len(entries)} blobs")

    manifest = "".join(
        f"{mode} {sha}  {path}\n" for path, sha, mode in sorted(records)
    ).encode("utf-8")
    subset_sha256 = hashlib.sha256(manifest).hexdigest()
    excluded_manifest = "".join(
        f"{item.get('mode','')} {item.get('sha','')} {item.get('size',0)}  {item.get('path','')}\n"
        for item in sorted(excluded, key=lambda x: x.get("path", ""))
    ).encode("utf-8")
    excluded_sha256 = hashlib.sha256(excluded_manifest).hexdigest()

    (dest / ".workshop-pinned-upstream.txt").write_text(
        "\n".join(
            [
                f"commit={PINNED_COMMIT}",
                f"tree={PINNED_TREE}",
                f"tree_blob_count={len(all_blobs)}",
                f"materialized_blobs={len(records)}",
                f"excluded_binary_or_oversize_blobs={len(excluded)}",
                f"selected_manifest_sha256={subset_sha256}",
                f"excluded_manifest_sha256={excluded_sha256}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (dest / ".workshop-pinned-upstream-excluded.txt").write_bytes(excluded_manifest)
    print(f"Selected manifest SHA256: {subset_sha256}")
    print(f"Excluded manifest SHA256: {excluded_sha256}")
    print("Immutable pinned upstream source/text materialization: PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dest", default="upstream")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if args.workers < 1 or args.workers > 16:
        raise SystemExit("--workers must be between 1 and 16")
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    try:
        materialize(Path(args.dest).resolve(), token, args.workers)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
