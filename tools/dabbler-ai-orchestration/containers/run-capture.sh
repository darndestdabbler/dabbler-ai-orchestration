#!/bin/bash
# Set 113 Session 5 -- one capture run, entirely inside the container.
#
#   run-capture.sh <width> <height> <seconds> <outdir> <mode> <capturer>
#
#   mode      target | magenta-control
#   capturer  ffmpeg | obs
#
# Starts a virtual display, puts something on it, records that display, and
# takes a mid-recording still from the SAME display so the harness has
# something to correlate the video against. Everything it produces lands in
# <outdir>, which is copied out with `podman cp` afterwards -- there are NO
# bind mounts, because a bind mount is a hole in the boundary this session
# exists to measure.
#
# It prints a machine-readable line per fact it establishes, prefixed
# `FACT `, because the harness must not have to parse ffmpeg's or OBS's
# prose.
#
# BOTH CAPTURERS ARE HERE ON PURPOSE. The spec names OBS; verification
# (round 1, Major, both lenses) rejected substituting ffmpeg for it, because
# a session that measures a different dependency has not answered whether
# the DECLARED dependency can be isolated. So OBS is attempted for real, and
# ffmpeg stays beside it -- the comparison is the deliverable, not the
# convenience.

set -u

WIDTH="${1:-1280}"
HEIGHT="${2:-800}"
SECONDS_TO_RECORD="${3:-12}"
OUTDIR="${4:-/out}"
MODE="${5:-target}"
CAPTURER="${6:-ffmpeg}"

DISPLAY_NUM=99
export DISPLAY=":${DISPLAY_NUM}"

# VS Code's launcher detects WSL and PROMPTS -- "please install Visual Studio
# Code in Windows ... Do you want to continue anyway? [y/N]" -- then blocks on
# stdin forever. It fires here because Podman's machine IS a WSL VM and the
# interop markers reach inside the container, which is itself worth knowing:
# the container is isolated from the host's DISPLAY and devices, not from
# WSL's identity. This is the launcher's own documented opt-out.
export DONT_PROMPT_WSL_INSTALL=1

# No GPU device is passed in -- handing back /dev/dri is exactly the
# isolation being tested -- so OBS must render through Mesa's software
# rasteriser or not at all.
export LIBGL_ALWAYS_SOFTWARE=1

fact() { echo "FACT $1=$2"; }

mkdir -p "$OUTDIR" 2>/dev/null || true
if [ ! -w "$OUTDIR" ]; then
  echo "ERROR: output directory $OUTDIR is not writable" >&2
  exit 5
fi
fact capturer "$CAPTURER"

# --- the display -------------------------------------------------------
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
CODE_PID=""
if [ "$MODE" = "magenta-control" ]; then
  # CRITERION I1's POSITIVE CONTROL, and it must travel the same path as the
  # measurement it validates: the root window is painted pure magenta and
  # then captured by the SAME pipeline. A control that came from a synthetic
  # PNG would prove the detector can read a file, not that it fires on a
  # frame this rig produced.
  xsetroot -solid '#ff00ff'
  sleep 2
  fact mode "magenta-control"
else
  # THE REAL EXTENSION, not stock VS Code. Verification round 1 (Major) was
  # right that stock VS Code proves nothing about whether the Work Explorer
  # survives Linux software rendering, which is a different claim from
  # whether the capture is isolated.
  code --install-extension /home/capture/dabbler.vsix \
       --user-data-dir="$HOME/.vscode-capture" \
       --extensions-dir="$HOME/.vscode-capture-ext" \
       >/tmp/ext-install.log 2>&1
  fact extension_install_exit "$?"
  fact extensions_installed "$(code --user-data-dir="$HOME/.vscode-capture" \
       --extensions-dir="$HOME/.vscode-capture-ext" --list-extensions 2>/dev/null \
       | paste -sd'|' - || echo none)"

  # A workspace shaped like a Dabbler repo, so the Work Explorer has
  # something to render rather than an empty view that would look identical
  # to a broken one.
  mkdir -p "$HOME/fixture/docs/session-sets/001-container-fixture"
  cat > "$HOME/fixture/docs/session-sets/001-container-fixture/session-state.json" <<'JSON'
{
  "schemaVersion": 4,
  "sessionSetName": "001-container-fixture",
  "status": "in-progress",
  "sessions": [
    {"number": 1, "title": "Fixture session one", "status": "complete",
     "startedAt": "2026-08-16T00:00:00-04:00", "completedAt": "2026-08-16T00:10:00-04:00",
     "orchestrator": null, "verificationVerdict": "VERIFIED"},
    {"number": 2, "title": "Fixture session two", "status": "in-progress",
     "startedAt": "2026-08-16T00:20:00-04:00", "completedAt": null,
     "orchestrator": null, "verificationVerdict": null}
  ]
}
JSON

  code --disable-gpu \
       --disable-workspace-trust \
       --user-data-dir="$HOME/.vscode-capture" \
       --extensions-dir="$HOME/.vscode-capture-ext" \
       "$HOME/fixture" >/tmp/code.log 2>&1 &
  CODE_PID=$!
  sleep 18
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
CAPTURE_STARTED=$(date +%s)

if [ "$CAPTURER" = "obs" ]; then
  # OBS is seeded entirely from config files rather than driven over
  # obs-websocket. Publishing a websocket port out of the container to steer
  # it from the host would put a hole in the boundary under test, which is
  # the one thing this session may not do for convenience.
  OBSCFG="$HOME/.config/obs-studio"
  mkdir -p "$OBSCFG/basic/profiles/dabbler" "$OBSCFG/basic/scenes"

  cat > "$OBSCFG/global.ini" <<INI
[General]
FirstRun=true
EnableAutoUpdates=false
ConfirmOnExit=false

[Basic]
Profile=dabbler
ProfileDir=dabbler
SceneCollection=dabbler
SceneCollectionFile=dabbler
INI

  cat > "$OBSCFG/basic/profiles/dabbler/basic.ini" <<INI
[General]
Name=dabbler

[Output]
Mode=Simple

[SimpleOutput]
FilePath=$OUTDIR
RecFormat2=mp4
RecQuality=Small
RecEncoder=x264
VBitrate=2500
ABitrate=0

[Video]
BaseCX=$WIDTH
BaseCY=$HEIGHT
OutputCX=$WIDTH
OutputCY=$HEIGHT
FPSType=0
FPSCommon=25

[Audio]
SampleRate=44100
ChannelSetup=Mono
INI

  cat > "$OBSCFG/basic/scenes/dabbler.json" <<JSON
{
  "current_scene": "Scene",
  "current_program_scene": "Scene",
  "name": "dabbler",
  "scene_order": [{"name": "Scene"}],
  "sources": [
    {
      "balance": 0.5, "deinterlace_mode": 0, "enabled": true, "flags": 0,
      "id": "xshm_input", "mixers": 0, "monitoring_type": 0, "muted": false,
      "name": "screen", "private_settings": {},
      "push-to-mute": false, "push-to-mute-delay": 0,
      "push-to-talk": false, "push-to-talk-delay": 0,
      "settings": {"screen": 0, "show_cursor": true, "advanced": false},
      "sync": 0, "versioned_id": "xshm_input", "volume": 1.0
    },
    {
      "balance": 0.5, "deinterlace_mode": 0, "enabled": true, "flags": 0,
      "id": "scene", "mixers": 0, "monitoring_type": 0, "muted": false,
      "name": "Scene", "private_settings": {},
      "push-to-mute": false, "push-to-mute-delay": 0,
      "push-to-talk": false, "push-to-talk-delay": 0,
      "settings": {
        "custom_size": false, "id_counter": 1,
        "items": [
          {
            "align": 5, "blend_method": "default", "blend_type": "normal",
            "bounds": {"x": 0.0, "y": 0.0}, "bounds_align": 0, "bounds_type": 0,
            "crop_bottom": 0, "crop_left": 0, "crop_right": 0, "crop_top": 0,
            "group_item_backup": false, "id": 1, "locked": false,
            "name": "screen", "pos": {"x": 0.0, "y": 0.0},
            "private_settings": {}, "rot": 0.0,
            "scale": {"x": 1.0, "y": 1.0}, "scale_filter": "disable",
            "visible": true
          }
        ]
      },
      "sync": 0, "versioned_id": "scene", "volume": 1.0
    }
  ]
}
JSON

  obs --startrecording --minimize-to-tray --disable-updater \
      --collection dabbler --profile dabbler --scene Scene \
      >/tmp/obs.log 2>&1 &
  OBS_PID=$!
  # OBS needs to be up before its window can be found, and its window has to
  # GO before the capture means anything.
  sleep 8

  # THE FIX FOR OBS RECORDING ITSELF. --minimize-to-tray has no tray to
  # minimise into on a bare X display, so OBS's GUI sits on the screen it is
  # capturing. Unmapping it leaves OBS running and recording while removing
  # it from the display. Verified below rather than assumed, because "the
  # command returned 0" is what the xsetroot control already taught this
  # session not to trust.
  xdotool search --class obs 2>/dev/null | while read -r wid; do
    xdotool windowunmap "$wid" 2>/dev/null || true
  done
  sleep 2
  # Only OBS's MAIN window counts. The first version grepped every child
  # whose name contained "obs" and reported six -- five of which are 1x1 Qt
  # helper windows that were never on screen -- which made a working unmap
  # look like a failed one.
  fact obs_main_window_mapped "$(xwininfo -root -children 2>/dev/null | grep -c '"OBS [0-9]' || echo 0)"
  fact mapped_window_names_during_capture "$(xwininfo -root -children 2>/dev/null | sed -n 's/^     0x[0-9a-f]* "\([^"]*\)".*/\1/p' | paste -sd'|' - || echo none)"

  sleep "$SECONDS_TO_RECORD"

  # A still from the same display, mid-recording, for criterion I2.
  ffmpeg -hide_banner -loglevel error \
         -f x11grab -video_size "${WIDTH}x${HEIGHT}" -i ":${DISPLAY_NUM}" \
         -frames:v 1 -y "$OUTDIR/inside.png" >/tmp/still.log 2>&1

  # SIGINT, not SIGKILL: OBS finalises the container on interrupt, and a
  # killed OBS leaves an unplayable file that would read as a capture
  # failure rather than a teardown failure.
  kill -INT "$OBS_PID" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$OBS_PID" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$OBS_PID" 2>/dev/null
  fact obs_log_tail "$(tail -3 /tmp/obs.log 2>/dev/null | tr '\n' ';' | tr -d '"' | cut -c1-400)"

  PRODUCED=$(ls -1t "$OUTDIR"/*.mp4 2>/dev/null | head -1)
  if [ -n "$PRODUCED" ] && [ "$PRODUCED" != "$OUTDIR/capture.mp4" ]; then
    mv "$PRODUCED" "$OUTDIR/capture.mp4"
  fi
  CAPTURE_RC=$([ -s "$OUTDIR/capture.mp4" ] && echo 0 || echo 9)
else
  ffmpeg -hide_banner -loglevel error \
         -f x11grab -framerate 25 -video_size "${WIDTH}x${HEIGHT}" \
         -i ":${DISPLAY_NUM}" \
         -t "$SECONDS_TO_RECORD" \
         -pix_fmt yuv420p \
         -y "$OUTDIR/capture.mp4" &
  FFMPEG_PID=$!

  sleep $(( SECONDS_TO_RECORD / 2 ))
  ffmpeg -hide_banner -loglevel error \
         -f x11grab -video_size "${WIDTH}x${HEIGHT}" -i ":${DISPLAY_NUM}" \
         -frames:v 1 -y "$OUTDIR/inside.png" >/tmp/still.log 2>&1

  wait "$FFMPEG_PID"
  CAPTURE_RC=$?
fi

fact capture_exit "$CAPTURE_RC"
fact capture_wall_clock_seconds "$(( $(date +%s) - CAPTURE_STARTED ))"
fact capture_bytes "$(stat -c %s "$OUTDIR/capture.mp4" 2>/dev/null || echo 0)"
fact still_bytes "$(stat -c %s "$OUTDIR/inside.png" 2>/dev/null || echo 0)"

# --- extract frames for the harness ------------------------------------
# One frame per second, as PNG, so the host side never has to decode video.
mkdir -p "$OUTDIR/frames"
ffmpeg -hide_banner -loglevel error -i "$OUTDIR/capture.mp4" \
       -vf fps=1 "$OUTDIR/frames/f%03d.png" >/tmp/frames.log 2>&1
fact frame_count "$(ls "$OUTDIR/frames"/*.png 2>/dev/null | wc -l)"

# Criterion I6's filesystem half, measured INSIDE the run directory where
# the partial files would be. Counted here rather than on the host because
# `podman cp` of a tree would not distinguish a zero-byte artifact from one
# the copy dropped.
fact zero_byte_files "$(find "$OUTDIR" -type f -size 0 2>/dev/null | wc -l)"
fact temp_files "$(find "$OUTDIR" -type f \( -name '*.tmp' -o -name '*.part' -o -name '.*' \) 2>/dev/null | wc -l)"

kill "${CODE_PID:-0}" 2>/dev/null
kill "$XVFB_PID" 2>/dev/null
exit "$CAPTURE_RC"
