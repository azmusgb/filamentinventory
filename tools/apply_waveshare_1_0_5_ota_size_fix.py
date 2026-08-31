from pathlib import Path

app = Path('firmware/waveshare-home/WaveshareHome/AppModel.h')
s = app.read_text()
old = 'static constexpr char FW_VERSION[] = "1.0.4";'
new = 'static constexpr char FW_VERSION[] = "1.0.5";'
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('Expected 1.0.4 version marker not found')
app.write_text(s)

svc = Path('firmware/waveshare-home/WaveshareHome/Services.cpp')
s = svc.read_text()
old_block = '''  int length = http.getSize();
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
new_block = '''  // GitHub release assets may be served through a CDN whose transport
  // Content-Length is not a trustworthy application-image integrity signal.
  // Treat it as diagnostic only. The authoritative checks are the expected
  // release size, exact downloaded byte count, and SHA-256 below.
  const int transportLength = http.getSize();
  if (transportLength > 0 && static_cast<uint32_t>(transportLength) != sys.updateSize) {
    Serial.printf("OTA transport Content-Length %d differs from expected image size %u; validating actual bytes and SHA-256 instead.\\n",
                  transportLength, static_cast<unsigned>(sys.updateSize));
  }
'''
if old_block in s:
    s = s.replace(old_block, new_block, 1)
elif new_block not in s:
    raise SystemExit('Expected OTA Content-Length validation block not found')

old_verify = '''  if (!ok || offset != sys.updateSize || actual != expected) {
    if (ok) strlcpy(sys.updateError, "Firmware SHA-256 verification failed", sizeof(sys.updateError));
    free(image);
    sys.otaInProgress = false;
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }
'''
new_verify = '''  if (!ok || offset != sys.updateSize || actual != expected) {
    if (ok && offset != sys.updateSize) {
      String e = String("Firmware byte count mismatch: expected ") + sys.updateSize + ", received " + offset;
      strlcpy(sys.updateError, e.c_str(), sizeof(sys.updateError));
    } else if (ok) {
      strlcpy(sys.updateError, "Firmware SHA-256 verification failed", sizeof(sys.updateError));
    }
    free(image);
    sys.otaInProgress = false;
    sys.otaReadyToReboot = false;
    strlcpy(sys.updateStatus, "Install failed", sizeof(sys.updateStatus));
    strlcpy(sys.otaStatus, "Failed", sizeof(sys.otaStatus));
    return false;
  }
'''
if old_verify in s:
    s = s.replace(old_verify, new_verify, 1)
elif new_verify not in s:
    raise SystemExit('Expected OTA verification failure block not found')

svc.write_text(s)
print('Applied Waveshare Home 1.0.5 OTA Content-Length fix')
