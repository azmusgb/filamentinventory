from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = root / "firmware/waveshare-home/WaveshareHome/AppModel.h"
svc = root / "firmware/waveshare-home/WaveshareHome/Services.cpp"

app_text = app.read_text()
if 'FW_VERSION[] = "1.0.0-rc9"' not in app_text:
    raise SystemExit("expected rc9 firmware version")
app_text = app_text.replace('FW_VERSION[] = "1.0.0-rc9"', 'FW_VERSION[] = "1.0.0-rc10"', 1)
app.write_text(app_text)

text = svc.read_text()
start_marker = '  String version = release["tag_name"] | "";\n'
end_marker = '  strlcpy(sys.updateVersion, version.c_str(), sizeof(sys.updateVersion));\n'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("OTA release metadata block not found")

replacement = r'''  String version = release["tag_name"] | "";
  version.replace("waveshare-v", "");
  version.replace("v", "");
  String firmwareUrl;
  String firmwareDigest;
  uint32_t firmwareSize = 0;
  for (JsonObject asset : release["assets"].as<JsonArray>()) {
    String name = asset["name"] | "";
    if (name == "WaveshareHome-firmware.bin") {
      // Use GitHub's API asset URL instead of browser_download_url. The API host
      // is already proven reachable by the release check and avoids a separate
      // github.com manifest request before OTA begins.
      firmwareUrl = asset["url"] | "";
      firmwareDigest = asset["digest"] | "";
      firmwareSize = asset["size"] | 0;
    }
  }
  if (!version.length() || !firmwareUrl.length()) {
    strlcpy(sys.updateError, "Release is missing firmware asset", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }
  if (firmwareDigest.startsWith("sha256:")) firmwareDigest.remove(0, 7);
  firmwareDigest.toLowerCase();
  if (firmwareDigest.length() != 64 || firmwareSize == 0) {
    strlcpy(sys.updateError, "Firmware asset lacks GitHub SHA-256 or size", sizeof(sys.updateError));
    sys.updateCheckInProgress = false; return false;
  }

  String sha = firmwareDigest;
  uint32_t size = firmwareSize;
'''
text = text[:start] + replacement + text[end:]

text = text.replace(
    'http.setConnectTimeout(7000);\n  http.setTimeout(15000);\n  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);',
    'http.setConnectTimeout(12000);\n  http.setTimeout(30000);\n  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);',
    1,
)
text = text.replace(
    'http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  http.addHeader("Accept-Encoding", "identity");\n  int code = http.GET();',
    'http.addHeader("User-Agent", "WaveshareHome-ESP32-Updater");\n  http.addHeader("Accept", "application/octet-stream");\n  http.addHeader("X-GitHub-Api-Version", "2022-11-28");\n  http.addHeader("Accept-Encoding", "identity");\n  int code = http.GET();',
    1,
)
text = text.replace(
    'Firmware size differs from signed manifest',
    'Firmware size differs from GitHub release metadata',
    1,
)
text = text.replace(
    'verifies its size and SHA-256 manifest, writes the inactive OTA slot',
    'verifies GitHub release size and SHA-256 digest, writes the inactive OTA slot',
    1,
)
svc.write_text(text)

print("rc10 OTA asset-digest migration applied")
