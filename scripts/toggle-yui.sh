#!/usr/bin/env bash
# ==============================================================================
# YUI Companion Toggle Script (Sway / Wayland)
# Supports:
#   toggle-yui.sh          -> Toggle visibility (Show / Hide via scratchpad)
#   toggle-yui.sh --expand -> Toggle Expanded / Pill state via SIGUSR1 IPC
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="/home/niko/YUI/bin/yui-linux"

# Detect running Electron YUI instance
YUI_PID=$(pgrep -f "electron.*(yui|app\.asar)" | grep -v "^$$$" | head -n 1 || true)

# If --expand or -e flag is given, send SIGUSR1 to toggle expand/pill
if [ "$1" = "--expand" ] || [ "$1" = "-e" ]; then
  if [ -n "$YUI_PID" ]; then
    kill -SIGUSR1 "$YUI_PID" 2>/dev/null || true
    exit 0
  fi
fi

if [ -z "$YUI_PID" ]; then
  # Clean stale lock files
  rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
  rm -f "$HOME/.config/Electron/SingletonLock" "$HOME/.config/Electron/SingletonSocket" "$HOME/.config/Electron/SingletonCookie" 2>/dev/null || true
  nohup "$BIN_PATH" >/dev/null 2>&1 &
  exit 0
fi

# Toggle visibility in Sway
if command -v swaymsg >/dev/null 2>&1; then
  IS_VISIBLE=$(swaymsg -t get_tree 2>/dev/null | jq -r '.. | select(.app_id? == "yui-companion") | .visible' 2>/dev/null | head -n 1)
  if [ "$IS_VISIBLE" = "true" ]; then
    swaymsg '[app_id="yui-companion"] move scratchpad' >/dev/null 2>&1 || true
  else
    swaymsg '[app_id="yui-companion"] scratchpad show, sticky enable, focus' >/dev/null 2>&1 || true
  fi
else
  kill "$YUI_PID" 2>/dev/null || true
fi
