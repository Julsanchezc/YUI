#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$SCRIPT_DIR/../bin/yui-linux"

# Detect running Electron YUI instance (excluding this shell script)
YUI_PID=$(pgrep -f "electron.*(yui|app\.asar)" | grep -v "^$$$" | head -n 1 || true)

if [ -z "$YUI_PID" ]; then
  # Not running: ensure stale lock cleanup & launch cleanly in background
  rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
  rm -f "$HOME/.config/Electron/SingletonLock" "$HOME/.config/Electron/SingletonSocket" "$HOME/.config/Electron/SingletonCookie" 2>/dev/null || true
  nohup "$BIN_PATH" >/dev/null 2>&1 &
  exit 0
fi

# YUI is running: handle toggle in Sway or desktop
if command -v swaymsg >/dev/null 2>&1; then
  # Check if window is currently visible or in scratchpad
  IS_VISIBLE=$(swaymsg -t get_tree 2>/dev/null | jq -r '.. | select(.app_id? == "yui-companion") | .visible' 2>/dev/null | head -n 1)

  if [ "$IS_VISIBLE" = "true" ]; then
    # Currently visible: hide to scratchpad
    swaymsg '[app_id="yui-companion"] move scratchpad' >/dev/null 2>&1 || true
  elif [ "$IS_VISIBLE" = "false" ]; then
    # In scratchpad: show and focus
    swaymsg '[app_id="yui-companion"] scratchpad show, sticky enable, focus' >/dev/null 2>&1 || true
  else
    # Process is running but window not yet registered or crashed: restart
    kill -9 "$YUI_PID" 2>/dev/null || true
    rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
    sleep 0.2
    nohup "$BIN_PATH" >/dev/null 2>&1 &
  fi
else
  # Non-Sway fallback: toggle process
  kill "$YUI_PID" 2>/dev/null || true
fi
