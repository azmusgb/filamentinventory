from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ROOT / "firmware/waveshare-home/WaveshareHome/Services.cpp"
MODEL = ROOT / "firmware/waveshare-home/WaveshareHome/AppModel.h"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


services = SERVICES.read_text()
model = MODEL.read_text()

model = replace_once(
    model,
    'static constexpr char FW_VERSION[] = "1.0.2";',
    'static constexpr char FW_VERSION[] = "1.0.3";',
    "firmware version",
)

services = replace_once(
    services,
    '  http.setTimeout(5000);\n  if (url.startsWith("https://")) {',
    '  http.setTimeout(5000);\n  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);\n  http.setRedirectLimit(5);\n  if (url.startsWith("https://")) {',
    "HTTP redirect policy",
)

old = '''  int length = http.getSize();
  if (length > 0 && static_cast<uint32_t>(length) != sys.updateSize) {
    strlcpy(sys.updateError, "Firmware size differs from manifest", sizeof(sys.updateError));
    http.end();
    free(image);
    sys.otaInProgress = false;
    return false;
  }
'''
new = '''  int length = http.getSize();
  // GitHub release assets redirect to a CDN. With strict redirect following,
  // getSize() refers to the final response. If the server uses chunked transfer
  // encoding the length can be unknown (-1), so validate the actual byte count
  // after download instead of rejecting an unknown Content-Length here.
  if (length > 0 && static_cast<uint32_t>(length) != sys.updateSize) {
    strlcpy(sys.updateError, "Firmware size differs from manifest", sizeof(sys.updateError));
    strlcpy(sys.updateStatus, "Install failed", sizeof(sys.updateStatus));
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    http.end();
    free(image);
    sys.otaInProgress = false;
    sys.otaReadyToReboot = false;
    return false;
  }
'''
services = replace_once(services, old, new, "firmware size failure state")

# Keep the 1.0.2 dashboard hardening invariant in this maintenance release.
start = services.index("<form method='post' action='/settings'>")
end = services.index("</form>", start)
if services[start:end].count("<form") != 1:
    raise SystemExit("nested form regression detected inside /settings")

if "HTTPC_STRICT_FOLLOW_REDIRECTS" not in services:
    raise SystemExit("redirect hardening was not applied")
if 'FW_VERSION[] = "1.0.3"' not in model:
    raise SystemExit("version bump failed")

SERVICES.write_text(services)
MODEL.write_text(model)
print("Applied Waveshare Home 1.0.3 updater redirect fix")
print("- GitHub/CDN redirects enabled")
print("- unknown Content-Length tolerated")
print("- size mismatch transitions to failed state")
print("- dashboard hardening preserved")
