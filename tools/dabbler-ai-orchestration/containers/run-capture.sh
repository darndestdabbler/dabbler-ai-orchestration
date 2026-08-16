#!/bin/bash
# Set 113 Session 5 -- one capture run, entirely inside the container.
#
#   run-capture.sh <width> <height> <seconds> <outdir>
#
# Starts a virtual display, starts VS Code on it, records the display with
# ffmpeg, and takes a mid-recording still from the SAME display so the
# harness has something to correlate the video against. Everything it
# produces lands in <outdir>, which is the one bind-mounted path.
#
# It prints a machine-readable line per fact it establishes, prefixed
# `FACT `, because the harness must not have to parse ffmpeg's prose.

set -u

WIDTH="${1:-1280}"
HEIGHT="${2:-800}"
SECONDS_TO_RECORD="${3:-12}"
OUTDIR="${4:-/out}"
MODE="${5:-target}"   # target | magenta-control

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"

# VS Code's launcher detects WSL and PROMPTS -- "please install Visual Studio
# Code in Windows ... Do you want to continue anyway? [y/N]" -- then blocks on
# stdin forever. It fires here because Podman's machine IS a WSL VM and the
# interop markers reach inside the container, which is itself worth knowing:
# the container is isolated from the host's DISPLAY and devices, not from
# WSL's identity. This is the launcher's own documented opt-out.
export DONT_PROMPT_WSL_INSTALL=1

fact() { echo "FACT $1=$2"; }

# /out is pre-created in the image and owned by this user. This mkdir is the
# safety net for a caller-supplied path under $HOME, and it must not be fatal
# when the directory already exists.
mkdir -p "$OUTDIR" 2>/dev/null || true
if [ ! -w "$OUTDIR" ]; then
  echo "ERROR: output directory $OUTDIR is not writable" >&2
  exit 5
fi

# --- the display -------------------------------------------------------
# -screen 0 WxHx24 fixes the geometry that criterion I3 compares against.
# -nolisten tcp: the display must not be reachable over the network even
# from inside; the point is a display that goes nowhere.
# -noreset is load-bearing and was learned the hard way. Without it, the X
# server RESETS when its last client disconnects, which wipes the root
# window back to black -- so `xsetroot -solid magenta` appeared to succeed
# (exit 0) and produced an all-black capture, and criterion I1's positive
# control silently measured nothing. A control that fails open is worse than
# no control, because it looks like evidence.
Xvfb ":${DISPLAY_NUM}" -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp -noreset >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!
sleep 3

if ! xdpyinfo -display ":${DISPLAY_NUM}" >/tmp/xdpyinfo.txt 2>&1; then
  echo "ERROR: virtual display did not come up" >&2
  cat /tmp/xvfb.log >&2
  exit 3
fi
# READ the geometry rather than echoing back what was asked for -- a harness
# that reports its own request has measured nothing.
GEOM=$(awk '/dimensions:/ {print $2; exit}' /tmp/xdpyinfo.txt)
fact display_geometry "$GEOM"

# --- what the container can and cannot see -----------------------------
# Reported as facts so criterion I4 is measured inside the container rather
# than inferred from the run command outside it.
fact dev_video_nodes "$(ls /dev/video* 2>/dev/null | wc -l)"
fact dev_snd_nodes "$(ls /dev/snd/* 2>/dev/null | wc -l)"
fact dev_dri_nodes "$(ls /dev/dri/* 2>/dev/null | wc -l)"
fact host_x11_socket_present "$([ -e /tmp/.X11-unix/X0 ] && echo yes || echo no)"

# --- what is on the display --------------------------------------------
if [ "$MODE" = "magenta-control" ]; then
  # CRITERION I1's POSITIVE CONTROL, and it must travel the same path as the
  # measurement it validates: the root window is painted pure magenta and
  # then captured by the SAME ffmpeg x11grab pipeline. A control that came
  # from a synthetic PNG would prove the detector can read a file, not that
  # it fires on a frame this rig produced.
  xsetroot -solid '#ff00ff'
  sleep 2
  fact mode "magenta-control"
else
  # --disable-gpu: software rendering, because no GPU device is passed in.
  # --user-data-dir under $HOME keeps VS Code from touching anything shared.
  code --disable-gpu \
       --disable-workspace-trust \
       --user-data-dir="$HOME/.vscode-capture" \
       --extensions-dir="$HOME/.vscode-capture-ext" \
       "$HOME" >/tmp/code.log 2>&1 &
  CODE_PID=$!
  sleep 12
  fact mode "target"
fi

if ! xdpyinfo -display ":${DISPLAY_NUM}" >/dev/null 2>&1; then
  echo "ERROR: display died while starting the target" >&2
  exit 4
fi
# NOT `kill -0 $CODE_PID`. The `code` launcher is a wrapper that forks the
# real Electron process and EXITS, so its pid is dead by design and the check
# reported "target not alive" while fourteen VS Code processes were running.
# What matters is whether a window actually MAPPED on the display, which is
# also the thing a black recording would fail.
fact target_process_count "$(pgrep -c -f '/usr/share/code/code' 2>/dev/null || echo 0)"
fact mapped_window_count "$(xwininfo -root -children 2>/dev/null | grep -c '^     0x' || echo 0)"
fact mapped_window_names "$(xwininfo -root -children 2>/dev/null | sed -n 's/^     0x[0-9a-f]* "\([^"]*\)".*/\1/p' | paste -sd'|' - || echo none)"

# --- record ------------------------------------------------------------
ffmpeg -hide_banner -loglevel error \
       -f x11grab -framerate 25 -video_size "${WIDTH}x${HEIGHT}" \
       -i ":${DISPLAY_NUM}" \
       -t "$SECONDS_TO_RECORD" \
       -pix_fmt yuv420p \
       -y "$OUTDIR/capture.mp4" &
FFMPEG_PID=$!

# A still from the same display, halfway through, for the correlation in
# criterion I2. Taken with the same tool so a discrepancy cannot be blamed
# on two different grabbers.
sleep $(( SECONDS_TO_RECORD / 2 ))
ffmpeg -hide_banner -loglevel error \
       -f x11grab -video_size "${WIDTH}x${HEIGHT}" -i ":${DISPLAY_NUM}" \
       -frames:v 1 -y "$OUTDIR/inside.png" >/tmp/still.log 2>&1

wait "$FFMPEG_PID"
FFMPEG_RC=$?
fact ffmpeg_exit "$FFMPEG_RC"
fact capture_bytes "$(stat -c %s "$OUTDIR/capture.mp4" 2>/dev/null || echo 0)"
fact still_bytes "$(stat -c %s "$OUTDIR/inside.png" 2>/dev/null || echo 0)"

# --- extract frames for the harness ------------------------------------
# One frame per second, as PNG, so the host side never has to decode video.
mkdir -p "$OUTDIR/frames"
ffmpeg -hide_banner -loglevel error -i "$OUTDIR/capture.mp4" \
       -vf fps=1 "$OUTDIR/frames/f%03d.png" >/tmp/frames.log 2>&1
fact frame_count "$(ls "$OUTDIR/frames"/*.png 2>/dev/null | wc -l)"

kill "${CODE_PID:-0}" 2>/dev/null
kill "$XVFB_PID" 2>/dev/null
exit "$FFMPEG_RC"
