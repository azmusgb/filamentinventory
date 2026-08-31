from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVC = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

svc = SVC.read_text()

svc = replace_once(
    svc,
    '    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=20";',
    '    : "https://api.github.com/repos/azmusgb/filamentinventory/releases?per_page=1";',
    'preview release page size',
)

svc = replace_once(
    svc,
    '  http.addHeader("Accept", "application/vnd.github+json");\n  int code = http.GET();',
    '  http.addHeader("Accept", "application/vnd.github+json");\n  http.addHeader("Accept-Encoding", "identity");\n  int code = http.GET();',
    'release identity encoding',
)

old_parse = '''  JsonDocument releases;\n  DeserializationError err = deserializeJson(releases, http.getStream());\n  http.end();\n  if (err) {\n    strlcpy(sys.updateError, "Invalid GitHub release response", sizeof(sys.updateError));\n    sys.updateCheckInProgress = false; return false;\n  }\n'''
new_parse = '''  String releasePayload = http.getString();\n  http.end();\n  if (!releasePayload.length()) {\n    strlcpy(sys.updateError, "Empty GitHub release response", sizeof(sys.updateError));\n    sys.updateCheckInProgress = false; return false;\n  }\n  JsonDocument releases;\n  DeserializationError err = deserializeJson(releases, releasePayload);\n  if (err) {\n    String e = String("GitHub JSON: ") + err.c_str();\n    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));\n    sys.updateCheckInProgress = false; return false;\n  }\n'''
svc = replace_once(svc, old_parse, new_parse, 'release payload parsing')

svc = replace_once(
    svc,
    '  manifestHttp.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  int manifestCode = manifestHttp.GET();',
    '  manifestHttp.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  manifestHttp.addHeader("Accept-Encoding", "identity");\n  int manifestCode = manifestHttp.GET();',
    'manifest identity encoding',
)

old_manifest = '''  JsonDocument manifest;\n  err = deserializeJson(manifest, manifestHttp.getStream());\n  manifestHttp.end();\n  if (err) {\n    strlcpy(sys.updateError, "Invalid update manifest", sizeof(sys.updateError));\n    sys.updateCheckInProgress = false; return false;\n  }\n'''
new_manifest = '''  String manifestPayload = manifestHttp.getString();\n  manifestHttp.end();\n  JsonDocument manifest;\n  err = deserializeJson(manifest, manifestPayload);\n  if (err) {\n    String e = String("Manifest JSON: ") + err.c_str();\n    strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));\n    sys.updateCheckInProgress = false; return false;\n  }\n'''
svc = replace_once(svc, old_manifest, new_manifest, 'manifest payload parsing')

svc = replace_once(
    svc,
    '  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  int code = http.GET();\n  if (code != HTTP_CODE_OK) {\n    snprintf(sys.updateError, sizeof(sys.updateError), "Firmware HTTP %d", code);',
    '  http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  http.addHeader("Accept-Encoding", "identity");\n  int code = http.GET();\n  if (code != HTTP_CODE_OK) {\n    snprintf(sys.updateError, sizeof(sys.updateError), "Firmware HTTP %d", code);',
    'firmware identity encoding',
)

SVC.write_text(svc)
print('rc9 release-response hardening applied')
