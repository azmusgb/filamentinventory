#!/usr/bin/env bash
set -euo pipefail

# Resolve the Waveshare ESP32-S3 USB JTAG/serial device without depending on
# macOS-assigned /dev/cu.usbmodem#### numbering.
#
# Defaults to Espressif USB JTAG/serial VID:PID 303A:1001. If more than one
# matching device is attached, set WAVESHARE_USB_SERIAL to the board serial
# reported by `python -m platformio device list`.

VID_PID="${WAVESHARE_VID_PID:-303A:1001}"
USB_SERIAL="${WAVESHARE_USB_SERIAL:-}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MONITOR_BAUD="${WAVESHARE_MONITOR_BAUD:-115200}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/waveshare-usb.sh port
  bash scripts/waveshare-usb.sh list
  bash scripts/waveshare-usb.sh monitor

Environment overrides:
  WAVESHARE_USB_SERIAL=<serial>   Select one board when multiple matches exist
  WAVESHARE_VID_PID=303A:1001    Override USB VID:PID
  WAVESHARE_MONITOR_BAUD=115200  Override serial-monitor baud rate
  PYTHON_BIN=python              Python executable to use

Examples:
  PORT="$(bash scripts/waveshare-usb.sh port)"
  echo "$PORT"

  bash scripts/waveshare-usb.sh monitor

  WAVESHARE_USB_SERIAL='A4:CB:8F:DB:30:90' \
    bash scripts/waveshare-usb.sh monitor
EOF
}

platformio_list() {
  if ! "$PYTHON_BIN" -m platformio device list 2>/dev/null; then
    echo "ERROR: PlatformIO is unavailable through '$PYTHON_BIN -m platformio'." >&2
    echo "Activate the project/ESPTool environment and try again." >&2
    return 1
  fi
}

detect_ports() {
  local listing
  listing="$(platformio_list)" || return 1

  awk -v vid="$VID_PID" -v serial="$USB_SERIAL" '
    /^\/dev\/(cu|tty)\./ { port=$1; next }
    /^Hardware ID:/ {
      if (index($0, "USB VID:PID=" vid) > 0 &&
          (serial == "" || index($0, "SER=" serial) > 0)) {
        print port
      }
    }
  ' <<<"$listing"
}

resolve_port() {
  local -a ports=()
  while IFS= read -r port; do
    [[ -n "$port" ]] && ports+=("$port")
  done < <(detect_ports)

  if (( ${#ports[@]} == 1 )); then
    printf '%s\n' "${ports[0]}"
    return 0
  fi

  if (( ${#ports[@]} == 0 )); then
    echo "ERROR: Waveshare USB device not found (VID:PID $VID_PID)." >&2
    if [[ -n "$USB_SERIAL" ]]; then
      echo "Requested serial: $USB_SERIAL" >&2
    fi
    echo >&2
    echo "Available serial devices:" >&2
    platformio_list >&2 || true
    return 2
  fi

  echo "ERROR: Multiple matching Espressif USB devices were found:" >&2
  printf '  %s\n' "${ports[@]}" >&2
  echo >&2
  echo "Set WAVESHARE_USB_SERIAL to the desired board serial, for example:" >&2
  echo "  WAVESHARE_USB_SERIAL='<serial>' bash scripts/waveshare-usb.sh monitor" >&2
  echo >&2
  platformio_list >&2 || true
  return 3
}

command="${1:-port}"
case "$command" in
  port)
    resolve_port
    ;;
  list)
    platformio_list
    ;;
  monitor)
    port="$(resolve_port)"
    echo "Waveshare detected at: $port" >&2
    exec "$PYTHON_BIN" -m platformio device monitor \
      --port "$port" \
      --baud "$MONITOR_BAUD" \
      --filter time
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "ERROR: Unknown command '$command'." >&2
    usage >&2
    exit 64
    ;;
esac
