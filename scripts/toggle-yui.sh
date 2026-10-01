#!/usr/bin/env bash
# Toggle YUI Notch Companion in Sway / Wayland
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$SCRIPT_DIR/../bin/yui-linux"

# Check if YUI is currently running
YUI_PID=$(pgrep -f "yui-linux|electron42.*app.asar" | head -n 1 || true)

if [ -n "$YUI_PID" ]; then
  # If running in Sway, toggle floating focus or send toggle signal
  if command -v swaymsg >/dev/null 2>&1; then
    # Focus YUI window
    swaymsg '[app_id="(?i)yui.*"] focus' 2>/dev/null || \
    swaymsg '[title="(?i)yui.*"] focus' 2>/dev/null || \
    kill "$YUI_PID"
  else
    kill "$YUI_PID"
  fi
else
  # Launch YUI
  nohup "$BIN_PATH" >/dev/null 2>&1 &
fi
