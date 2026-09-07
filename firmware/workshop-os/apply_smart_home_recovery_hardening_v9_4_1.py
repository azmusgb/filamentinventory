#!/usr/bin/env python3
from pathlib import Path
import argparse


class PatchError(RuntimeError):
    pass


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise PatchError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def apply(repo: Path) -> None:
    # Safe Mode must remain on its recovery AP until the user deliberately exits.
    p = repo / "src" / "wifi_manager.cpp"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '''  if (apMode) {
    if (dnsServer) dnsServer->processNextRequest();

    // Pump the Improv-Serial listener if its setup window is still open.
''',
        '''  if (apMode) {
    if (dnsServer) dnsServer->processNextRequest();

    // Recovery Safe Mode is deliberately sticky. Do not probe the stored STA
    // network and silently abandon Waveshare-Recovery-XXXX while the owner is
    // repairing the device.
    if (recoverySafeModeActive()) return;

    // Pump the Improv-Serial listener if its setup window is still open.
''',
        "sticky recovery AP",
    )
    p.write_text(text, encoding="utf-8")

    # Candidate firmware is not known-good merely because Wi-Fi associated.
    # Require the web server to have initialized too, so a runtime regression
    # that strands the control plane is not promoted after 25 seconds.
    p = repo / "src" / "recovery_manager.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "void recoveryTick();\n",
        "void recoveryTick();\nvoid recoveryMarkWebReady();\nbool recoveryWebReady();\n",
        "web readiness declarations",
    )
    p.write_text(text, encoding="utf-8")

    p = repo / "src" / "recovery_manager.cpp"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "bool sCandidatePending = false;\n",
        "bool sCandidatePending = false;\nbool sWebReady = false;\n",
        "web readiness state",
    )
    text = replace_once(
        text,
        "  if(sCandidatePending && now>=kCandidateHealthyMs && (isWiFiConnected()||isAPMode())) acceptCandidate();\n",
        "  if(sCandidatePending && now>=kCandidateHealthyMs && sWebReady && (isWiFiConnected()||isAPMode())) acceptCandidate();\n",
        "candidate web health gate",
    )
    text = replace_once(
        text,
        "bool recoverySafeModeActive(){return sSafeMode;}\n",
        "void recoveryMarkWebReady(){sWebReady=true;}\nbool recoveryWebReady(){return sWebReady;}\nbool recoverySafeModeActive(){return sSafeMode;}\n",
        "web readiness accessors",
    )
    p.write_text(text, encoding="utf-8")

    # Mark readiness only after the HTTP server is actually listening; expose it
    # in diagnostics and make Factory Reset use the protected POST endpoint.
    p = repo / "src" / "web_server.cpp"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "d[\"candidatePending\"]=recoveryCandidatePending();d[\"candidateAttempts\"]=recoveryCandidateAttempts();d[\"rapidBootCount\"]=recoveryRapidBootCount();",
        "d[\"candidatePending\"]=recoveryCandidatePending();d[\"candidateAttempts\"]=recoveryCandidateAttempts();d[\"webReady\"]=recoveryWebReady();d[\"rapidBootCount\"]=recoveryRapidBootCount();",
        "recovery status web ready",
    )
    text = replace_once(
        text,
        "function factoryReset(){if(confirm('Factory reset ALL settings?'))location.href='/reset'}",
        "function factoryReset(){if(confirm('Factory reset ALL settings?'))act('/reset')}",
        "factory reset POST",
    )
    text = replace_once(
        text,
        '''  server.begin();
  Serial.println("Web server started on port 80");
''',
        '''  server.begin();
  recoveryMarkWebReady();
  Serial.println("Web server started on port 80");
''',
        "mark web ready",
    )
    p.write_text(text, encoding="utf-8")

    # Identity is still v9.4; distinguish the hardened physical candidate.
    p = repo / "include" / "smart_home_build.h"
    text = p.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC1"\n',
        '#define SMART_HOME_BUILD_LABEL "Smart Home v9.4 Recovery Foundation RC2"\n',
        "RC2 build label",
    )
    p.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.apply:
        raise SystemExit("Pass --apply")
    apply(Path(args.repo))
    print("Smart Home v9.4 Recovery Foundation RC2 hardening applied")
