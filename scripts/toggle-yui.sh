#!/usr/bin/env bash
# ==============================================================================
# YUI Companion Toggle Script (Hyprland & Sway / Wayland)
# Supports:
#   toggle-yui.sh          -> Toggle visibility / Expand
#   toggle-yui.sh --expand -> Toggle Expanded / Pill state via SIGUSR1 IPC
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="/home/niko/YUI/bin/yui-linux"

# Detect running Electron YUI main process
find_yui_pid() {
  if [ -n "$HYPRLAND_INSTANCE_SIGNATURE" ] && command -v hyprctl >/dev/null 2>&1; then
    local hpid
    hpid=$(hyprctl clients -j 2>/dev/null | jq -r '.[] | select(.class == "yui-companion") | .pid' 2>/dev/null | head -n 1 || true)
    if [ -n "$hpid" ] && [ "$hpid" != "null" ]; then
      echo "$hpid"
      return
    fi
  fi
  # Fallback to scanning proc for electron main process without --type=
  for p in $(pgrep -f "electron.*app\.asar" 2>/dev/null || true); do
    if [ "$p" != "$$" ] && ! grep -q -- "--type=" "/proc/$p/cmdline" 2>/dev/null; then
      echo "$p"
      return
    fi
  done
}

YUI_PID=$(find_yui_pid)

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
  nohup "$BIN_PATH" </dev/null >/dev/null 2>&1 & disown
  exit 0
fi

# If already running, handle toggle according to compositor
if [ -n "$HYPRLAND_INSTANCE_SIGNATURE" ]; then
  # In Hyprland: toggle expand/pill state directly
  kill -SIGUSR1 "$YUI_PID" 2>/dev/null || true
elif command -v swaymsg >/dev/null 2>&1 && [ -n "$SWAYSOCK" ]; then
  IS_VISIBLE=$(swaymsg -t get_tree 2>/dev/null | jq -r '.. | select(.app_id? == "yui-companion") | .visible' 2>/dev/null | head -n 1 || true)
  if [ "$IS_VISIBLE" = "true" ]; then
    swaymsg '[app_id="yui-companion"] move scratchpad' >/dev/null 2>&1 || true
  else
    swaymsg '[app_id="yui-companion"] scratchpad show, sticky enable, focus' >/dev/null 2>&1 || true
  fi
else
  kill -SIGUSR1 "$YUI_PID" 2>/dev/null || true
fi
