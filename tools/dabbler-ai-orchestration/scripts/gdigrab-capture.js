// ffmpeg `gdigrab` capture of the desktop rectangle a window occupies.
//
// WHY THIS BACKEND EXISTS (Set 113 Session 8)
//
// Session 7 asked a narrow question of three candidates -- does the frame
// contain the workbench AND the system cursor -- and measured the answer
// (`s7-cursor-capture-backends.json`):
//
//   OBS window capture, WGC      window YES (0.9996)  cursor NO  (0.00000)
//   OBS window capture, BitBlt   window NO  (black)   cursor yes
//   ffmpeg gdigrab, desktop rect window YES (0.9697)  cursor YES (0.124)
//
// WGC ignores the cursor setting entirely; BitBlt honours it and cannot read
// a hardware-accelerated Electron surface, so it draws an arrow on a black
// frame -- the cursor without the product. Only gdigrab produces both,
// because it reads the COMPOSITED DESKTOP rather than a window's own
// surface.
//
// THAT IS THE WHOLE TRADE, AND THIS FILE IS WHERE IT IS PAID.
//
// Reading the composited desktop means the capture is a RECTANGLE OF SCREEN,
// not a window. Two properties OBS got for free have to be built here, and
// the Session 4 pilot already wrote down the bar for both:
//
//   C2, "no unrelated desktop pixels". Anything that comes to the front over
//   the rectangle lands in the frame. OBS's window capture is immune; this
//   is not. These recordings are destined for a PUBLIC URL, so this is the
//   criterion that decides whether the backend may be used at all, and the
//   mitigation is a guard that REFUSES to start and ABORTS mid-capture
//   rather than a warning nobody reads.
//
//   Window-follow. The rectangle is fixed at stream open and a window can
//   move. See `WINDOW_FOLLOW_POLICY` below for the decision and why the
//   other two options were rejected.
//
// What this backend gets for free in exchange: C7's no-audio-track clause,
// which OBS structurally could not satisfy (`s4-ffmpeg-fallback-measurement.json`).
// `-an` is not a setting that might be overridden by a profile; it is an
// argument on the command line, and there is no audio device in the graph at
// all.
//
// Output is ASCII-only (Windows cp1252 console, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  WindowGeometry,
  WindowGeometryUnavailableError,
  overlap,
  DESKTOP_SHELL_CLASSES,
} = require("./window-geometry.js");

/**
 * THE WINDOW-FOLLOW DECISION, and the two options it rejects.
 *
 * The spec offered three: re-read the rectangle per frame, pin the window
 * for the length of a capture, or abort when it moves.
 *
 *   RE-READ PER FRAME is not available. gdigrab fixes -offset_x/-offset_y/
 *   -video_size when the stream OPENS; there is no way to move the rectangle
 *   of a running capture. Emulating it means either restarting ffmpeg per
 *   move (a different file each time, so not one recording) or capturing the
 *   whole virtual desktop and cropping afterwards (here, 5760x1200 for a
 *   1440x900 window -- five times the pixels, and the crop would still need
 *   a per-frame rectangle ffmpeg has no way to receive). Rejected as
 *   unimplementable rather than as undesirable.
 *
 *   PIN THE WINDOW is implementable and is rejected on the SPEC'S OWN
 *   TERMS. The harness this backend exists to serve records a real session
 *   in the operator's real VS Code window, and its contract is that it
 *   "observes and nothing more -- it must not ... make a session behave
 *   differently because it is being recorded." A window the operator cannot
 *   move for fifteen minutes is a session behaving differently. Pinning
 *   trades a visible failure for an invisible constraint on the human.
 *
 *   ABORT WHEN IT MOVES is what is implemented. It is the only one of the
 *   three that is both implementable and observe-only, and it FAILS CLOSED:
 *   the alternative to aborting is a file that silently contains a slice of
 *   desktop where the product used to be, which is precisely the artifact
 *   that must never reach a public URL. The footage up to the move is kept
 *   and the abort is named, so a move costs the tail of a recording rather
 *   than the whole session's work.
 */
const WINDOW_FOLLOW_POLICY = "abort-on-move";

// How far the window may drift before the capture is abandoned. Not zero:
// DWM reports sub-pixel-ish jitter on some transitions and a guard that
// fires on 1px would abort recordings that are visually perfect. Two pixels
// of a 1440-wide frame is invisible; twenty is not.
const WINDOW_MOVE_TOLERANCE_PX = 2;

// How often the guard looks. The geometry driver answers in about 4ms warm,
// so this is nearly free, and it bounds how much wrong footage a capture can
// contain before it notices: at 500ms, half a second.
const GUARD_INTERVAL_MS = 500;

// An intersecting window smaller than this fraction of the capture is not
// treated as occlusion. It exists for one measured reason: Windows keeps
// 1x1 and few-pixel helper windows at the top of z-order permanently, and a
// guard with a zero threshold refuses to record on a clean desktop. Set
// deliberately BELOW the pilot's own C2 leakage bar (0.0005 of the frame)
// so the guard cannot pass something the criterion would fail.
const OCCLUSION_MIN_FRACTION = 0.0001;

/**
 * The failure type the recorder already knows how to degrade around.
 *
 * `record-vscode-walkthrough.js` treats a capture failure as a reason to
 * ship the walkthrough WITHOUT a video, never as a reason to fail the run --
 * the written document is the deliverable and the video is the enhancement.
 * `kind` is the machine-readable half, and C5 asserts that every way the
 * dependency can be missing produces one.
 */
class CaptureUnavailableError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "CaptureUnavailableError";
    this.kind = kind;
  }
}

/** Raised when the capture rectangle stopped being the window. */
class CaptureIntegrityError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = "CaptureIntegrityError";
    this.kind = kind;
    this.detail = detail || null;
  }
}

function log(msg) {
  console.log("[gdigrab] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// yuv420p needs even dimensions. Rounding DOWN never asks the grabber for a
// pixel outside the window; rounding up can.
function toEven(n) {
  const v = Math.floor(n);
  return v % 2 === 0 ? v : v - 1;
}

function which(exe) {
  const probe = cp.spawnSync(exe, ["-version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) return null;
  const first = String(probe.stdout || "").split("\n")[0].trim();
  return first || "(version unreported)";
}

/**
 * Is this window something that could put unrelated pixels in the frame?
 *
 * Everything excluded here is excluded for a reason that was measured on a
 * real desktop, not assumed:
 *
 *   - invisible / minimized / CLOAKED. A cloaked window passes
 *     IsWindowVisible and draws nothing; every suspended UWP app is one.
 *     On the machine this was written on, 333 top-level windows existed and
 *     11 were real. A guard that skips this check refuses to record, always,
 *     on a desktop with nothing wrong with it.
 *   - the desktop shell itself (Progman / WorkerW). It is the wallpaper, it
 *     is below everything by construction, and calling it an occluder means
 *     reporting that the desktop occludes the window standing on it.
 *   - zero-area windows.
 *   - THE TARGET'S OWN PROCESS. VS Code's popups, menus and dialogs are the
 *     product; a recording of the product should contain them. This is the
 *     one exclusion that is a judgement rather than a fact, so it is
 *     RECORDED per capture rather than silently applied.
 */
function isPotentialOccluder(win, targetPid) {
  if (!win.visible) return false;
  if (win.minimized) return false;
  if (win.cloaked) return false;
  if (DESKTOP_SHELL_CLASSES.has(win.className)) return false;
  if (win.bounds.width <= 0 || win.bounds.height <= 0) return false;
  if (targetPid && win.pid === targetPid) return false;
  return true;
}

/**
 * Every unrelated window ABOVE the target that intersects the capture rect.
 *
 * "Above" is z-order, which is why `window-geometry` walks
 * GetTopWindow/GetWindow rather than calling EnumWindows: a window BEHIND
 * the target contributes no pixels no matter how much it overlaps, and a
 * guard that ignores z-order refuses to record whenever anything is parked
 * behind the editor.
 */
function findOccluders(windows, target, rect) {
  const found = [];
  for (const win of windows) {
    if (win.hwnd === target.hwnd) continue;
    if (win.z >= target.z) continue;
    if (!isPotentialOccluder(win, target.pid)) continue;
    const hit = overlap(rect, win.bounds);
    if (!hit.intersects) continue;
    if (hit.fractionOfTarget < OCCLUSION_MIN_FRACTION) continue;
    found.push({
      hwnd: win.hwnd,
      pid: win.pid,
      z: win.z,
      className: win.className,
      title: win.title,
      // A refusal names what is in the way, and plenty of real occluders
      // have no title at all -- a borderless form, a tooltip, a splash
      // screen. Reporting `""` tells the operator a window is in the way
      // and nothing about WHICH, which is the difference between a message
      // that ends the problem and one that starts a hunt.
      label: describeWindow(win),
      overlapFractionOfCapture: Number(hit.fractionOfTarget.toFixed(6)),
      overlapRect: hit.rect,
    });
  }
  found.sort(
    (a, b) => b.overlapFractionOfCapture - a.overlapFractionOfCapture
  );
  return found;
}

/** The most identifying thing we can say about a window, for a human. */
function describeWindow(win) {
  const title = String(win.name || win.title || "").trim();
  if (title) return title;
  const cls = String(win.className || "").trim();
  const where =
    win.bounds.x + "," + win.bounds.y + " " + win.bounds.width + "x" + win.bounds.height;
  return (
    "(untitled " +
    (cls ? cls + " " : "") +
    "window, pid " +
    win.pid +
    ", at " +
    where +
    ")"
  );
}

class GdigrabCaptureSession {
  constructor(options) {
    const opts = options || {};
    this.tag = opts.tag || "dabbler-gdigrab";
    this.ffmpegExe = opts.ffmpegExe || process.env.DABBLER_FFMPEG || "ffmpeg";
    this.ffprobeExe =
      opts.ffprobeExe || process.env.DABBLER_FFPROBE || "ffprobe";
    this.framerate = opts.framerate || 30;
    // Opt-out, not opt-in. The entire reason this backend was built is that
    // the other two do not draw a cursor.
    this.drawMouse = opts.drawMouse !== false;
    // The guard is the C2 mitigation. It can be disabled ONLY so the
    // measurement harness can run the falsifier -- a guard nobody can turn
    // off cannot be shown to do anything.
    this.occlusionGuard = opts.occlusionGuard !== false;
    this.windowFollowGuard = opts.windowFollowGuard !== false;
    this.guardIntervalMs = opts.guardIntervalMs || GUARD_INTERVAL_MS;
    this.moveTolerancePx =
      opts.moveTolerancePx === undefined
        ? WINDOW_MOVE_TOLERANCE_PX
        : opts.moveTolerancePx;

    this.geometry = null;
    this.ownsGeometry = true;
    this.target = null;
    this.rect = null;
    this.captureRect = null;
    this.proc = null;
    this.outputPath = null;
    this.recordingStartedAt = null;
    this.guardTimer = null;
    this.integrity = { aborted: false, reason: null, detail: null, atMillis: null };
    this.observations = { occlusionChecks: 0, maxOccluderFraction: 0 };
    this.stderr = "";
    this.versions = null;
    this.cleanedUp = false;
  }

  // ------------------------------------------------------------------ host

  /**
   * C5's first gate: the dependency is either present or NAMED.
   *
   * A missing ffmpeg must not surface as "the recording produced no file".
   * It surfaces as a kind the caller can branch on and a message that says
   * what to install.
   */
  prepareHost() {
    if (process.platform !== "win32") {
      throw new CaptureUnavailableError(
        "platform-unsupported",
        "gdigrab is a Windows GDI grabber; this is " + process.platform
      );
    }
    const ffmpeg = which(this.ffmpegExe);
    if (!ffmpeg) {
      throw new CaptureUnavailableError(
        "ffmpeg-executable-absent",
        "ffmpeg was not runnable as '" +
          this.ffmpegExe +
          "'. The gdigrab backend cannot capture without it. Install it and " +
          "put it on PATH (winget install Gyan.FFmpeg), or set DABBLER_FFMPEG " +
          "to its full path."
      );
    }
    const ffprobe = which(this.ffprobeExe);
    if (!ffprobe) {
      throw new CaptureUnavailableError(
        "ffprobe-executable-absent",
        "ffprobe was not runnable as '" +
          this.ffprobeExe +
          "'. It ships beside ffmpeg and is what reports the recording's " +
          "duration and stream list, so a capture without it could not be " +
          "checked for an audio track (C7). Install it on PATH (it comes " +
          "with ffmpeg: winget install Gyan.FFmpeg), or set DABBLER_FFPROBE " +
          "to its full path."
      );
    }
    this.versions = { ffmpeg, ffprobe };
    return this.versions;
  }

  /**
   * Kept for interface parity with `ObsCaptureSession`.
   *
   * There is nothing to launch -- and that is a property worth naming rather
   * than hiding behind a no-op. OBS needed a process, a websocket, a scene
   * collection, a profile and a restore point, and every one of those was a
   * way for a run to leak state into the operator's machine (C6). This
   * backend spawns one child process at record time and touches no
   * configuration anywhere.
   */
  async launch() {
    if (!this.versions) this.prepareHost();
    return {
      backend: "ffmpeg-gdigrab-desktop",
      ffmpegVersion: this.versions.ffmpeg,
      ffprobeVersion: this.versions.ffprobe,
      windowFollowPolicy: WINDOW_FOLLOW_POLICY,
    };
  }

  async _geom() {
    if (!this.geometry) {
      this.geometry = new WindowGeometry(log).open();
      await this.geometry.waitUntilReady();
    }
    return this.geometry;
  }

  // ------------------------------------------------------------- configure

  /**
   * Choose the window, compute the rectangle, and refuse if either is
   * ambiguous or already dirty.
   *
   * `windowMatch` is the same predicate contract `ObsCaptureSession.configure`
   * takes, so the recorder can hand either backend the same matcher.
   */
  async configure(options) {
    const opts = options || {};
    const geom = await this._geom();
    const windows = await geom.list();
    const virtualScreen = geom.virtualScreen || { x: 0, y: 0 };

    const candidates = windows.filter(
      (w) =>
        w.visible &&
        !w.cloaked &&
        !w.minimized &&
        w.client.width > 0 &&
        w.client.height > 0
    );
    const matched = candidates.filter((w) => {
      try {
        return Boolean(opts.windowMatch(w));
      } catch (err) {
        return false;
      }
    });

    if (matched.length === 0) {
      throw new CaptureUnavailableError(
        "no-window-matched",
        "no visible window matched the capture target. " +
          candidates.length +
          " candidates were considered."
      );
    }
    // C1's refusal clause, and it is a refusal rather than a preference.
    // Selecting by title alone passes in a sterile environment and captures
    // the wrong window in a real one -- Session 4 found ELEVEN candidate
    // windows of which TWO were Code.exe, the fixture host and the
    // operator's own editor running the session.
    if (matched.length > 1) {
      throw new CaptureUnavailableError(
        "ambiguous-window-match",
        "refusing to guess: " +
          matched.length +
          " windows matched the capture target (" +
          matched.map((w) => JSON.stringify(w.name)).join(", ") +
          "). Close the extra one and run again."
      );
    }

    this.target = matched[0];
    // The CLIENT area, not the window rect: the window rect carries the
    // title bar and the DWM shadow, and a recording of the product should
    // not spend its edges on either.
    const client = this.target.client;
    this.rect = {
      x: client.x,
      y: client.y,
      width: toEven(client.width),
      height: toEven(client.height),
    };
    // gdigrab measures its offsets from the VIRTUAL screen origin, which is
    // negative on a desktop with a monitor left of or above the primary.
    //
    // HONEST LIMITATION: the machine this was measured on reports a virtual
    // origin of (0,0), so the subtraction below is a no-op here and the
    // negative-origin case is UNVERIFIED. It is written this way because
    // getting it wrong produces a plausible video of the wrong pixels rather
    // than an error, but nobody should read a pass on this machine as
    // evidence it works on a left-of-primary layout.
    this.captureRect = {
      x: this.rect.x - virtualScreen.x,
      y: this.rect.y - virtualScreen.y,
      width: this.rect.width,
      height: this.rect.height,
    };
    this.virtualScreen = virtualScreen;
    this.outDir = opts.outDir || this.outDir;
    this.outputPath = path.join(
      this.outDir,
      (opts.basename || this.tag) + ".mp4"
    );

    // The rectangle has to be CLEAN BEFORE the recording starts, not merely
    // watched afterwards. Starting dirty and aborting one poll later
    // produces a file whose first frames are the thing the guard exists to
    // keep out.
    const occluders = findOccluders(windows, this.target, this.rect);
    this.observations.occlusionChecks += 1;
    if (occluders.length) {
      this.observations.maxOccluderFraction = Math.max(
        this.observations.maxOccluderFraction,
        occluders[0].overlapFractionOfCapture
      );
    }
    if (this.occlusionGuard && occluders.length) {
      throw new CaptureIntegrityError(
        "occluded-before-start",
        "refusing to record: " +
          occluders.length +
          " unrelated window(s) overlap the capture rectangle, and gdigrab " +
          "reads the composited desktop, so they WOULD be in the video. " +
          "Topmost: " +
          occluders[0].label +
          " covering " +
          (occluders[0].overlapFractionOfCapture * 100).toFixed(2) +
          "% of the frame. Move or close it and run again.",
        { occluders }
      );
    }

    return {
      chosenWindow: { name: this.target.name, hwnd: this.target.hwnd, pid: this.target.pid },
      canvas: { width: this.rect.width, height: this.rect.height },
      rect: this.rect,
      captureRect: this.captureRect,
      virtualScreen,
      occludersAtConfigure: occluders,
      windowFollowPolicy: WINDOW_FOLLOW_POLICY,
      candidatesConsidered: candidates.length,
    };
  }

  // ---------------------------------------------------------------- frames

  _gdigrabInputArgs() {
    return [
      "-f",
      "gdigrab",
      "-draw_mouse",
      this.drawMouse ? "1" : "0",
      "-framerate",
      String(this.framerate),
      "-offset_x",
      String(this.captureRect.x),
      "-offset_y",
      String(this.captureRect.y),
      "-video_size",
      this.captureRect.width + "x" + this.captureRect.height,
      "-i",
      "desktop",
    ];
  }

  /** A PNG of what the capture rectangle currently contains, as a Buffer. */
  async grabSourceFrame() {
    if (!this.captureRect) {
      throw new CaptureUnavailableError(
        "not-configured",
        "grabSourceFrame() was called before configure() chose a window"
      );
    }
    const outPath = path.join(
      this.outDir,
      "frame-" + Date.now() + "-" + Math.floor(Math.random() * 1e6) + ".png"
    );
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      ...this._gdigrabInputArgs(),
      "-frames:v",
      "1",
      "-y",
      outPath,
    ];
    const proc = cp.spawnSync(this.ffmpegExe, args, { encoding: "buffer" });
    if (proc.error || proc.status !== 0 || !fs.existsSync(outPath)) {
      throw new CaptureUnavailableError(
        "frame-grab-failed",
        "gdigrab could not take a frame: " +
          (Buffer.isBuffer(proc.stderr)
            ? proc.stderr.toString("utf8").trim()
            : String(proc.stderr || "")) || "exit " + proc.status
      );
    }
    const png = fs.readFileSync(outPath);
    try {
      fs.unlinkSync(outPath);
    } catch (err) {
      /* a stray frame in the run dir is not worth failing over */
    }
    return png;
  }

  // ------------------------------------------------------------- recording

  /**
   * Start recording, and report the honest uncertainty of when it began.
   *
   * The call is BRACKETED and the width of the bracket carried as the
   * anchor's uncertainty -- the same contract Session 3 established for the
   * browser recorder and Session 4 for OBS. Here "started" means gdigrab has
   * reported its input stream, which is the first moment any pixel can have
   * been read.
   */
  async startRecording() {
    if (!this.captureRect) {
      throw new CaptureUnavailableError(
        "not-configured",
        "startRecording() was called before configure() chose a window"
      );
    }
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });

    const args = [
      "-hide_banner",
      "-loglevel",
      "info",
      ...this._gdigrabInputArgs(),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      // C7's no-audio clause, structurally. Not a profile setting that a
      // later edit could flip: there is no audio device in the graph, and
      // -an means the muxer is not offered one either. This is the clause
      // OBS could not satisfy without the operator editing their own
      // profile (`s4-ffmpeg-fallback-measurement.json`).
      "-an",
      "-y",
      this.outputPath,
    ];

    const before = Date.now();
    this.proc = cp.spawn(this.ffmpegExe, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.stderr = "";
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.proc.on("error", (err) => {
      this.stderr += "\nspawn error: " + String((err && err.message) || err);
    });
    let exited = false;
    this.proc.on("exit", () => {
      exited = true;
    });

    // Wait for gdigrab to actually OPEN the input, not merely for spawn to
    // return. ffmpeg prints its input stream summary once the grabber is
    // live; before that, no pixel has been read and an anchor would be a
    // guess. An ffmpeg that dies here (a bad rectangle, a missing encoder)
    // must be a NAMED recording failure, not a 20-second anchor uncertainty
    // that lets the run carry on and blame the empty file later.
    const deadline = Date.now() + 20000;
    let live = false;
    while (Date.now() < deadline) {
      if (/Stream #0:0/.test(this.stderr) || /Output #0/.test(this.stderr)) {
        live = true;
        break;
      }
      if (exited) break;
      await sleep(50);
    }
    const after = Date.now();

    if (!live) {
      const detail = (this.stderr || "").trim().split("\n").slice(-6).join(" | ");
      this.proc = null;
      throw new CaptureUnavailableError(
        "output-never-started",
        "ffmpeg accepted the gdigrab arguments but never opened its input " +
          "within 20s, so nothing was captured. It said: " +
          (detail || "(nothing on stderr)")
      );
    }

    this.recordingStartedAt = Math.round((before + after) / 2);
    this._startGuard();
    return {
      anchorMillis: this.recordingStartedAt,
      uncertaintyMillis: after - before,
    };
  }

  /**
   * The C2 and window-follow guards, running for the length of the capture.
   *
   * Both abort rather than warn. A warning on a console nobody is watching,
   * attached to a file that is about to be published, is not a mitigation.
   */
  _startGuard() {
    if (!this.occlusionGuard && !this.windowFollowGuard) return;
    const startRect = { ...this.rect };
    const tick = async () => {
      if (!this.proc || this.integrity.aborted) return;
      let windows;
      try {
        const geom = await this._geom();
        windows = await geom.list();
      } catch (err) {
        // A guard that cannot see is not a guard. Say so and stop the
        // capture rather than let it run unwatched to a public URL.
        this._abort(
          "guard-blind",
          "the window-geometry driver stopped answering, so the capture " +
            "could no longer be checked for occlusion: " +
            String((err && err.message) || err),
          null
        );
        return;
      }
      const current = windows.find((w) => w.hwnd === this.target.hwnd);

      if (this.windowFollowGuard) {
        if (!current || !current.visible || current.minimized) {
          this._abort(
            "window-disappeared",
            "the recorded window stopped being visible mid-capture, so the " +
              "rectangle no longer contains the product.",
            null
          );
          return;
        }
        const dx = Math.abs(current.client.x - startRect.x);
        const dy = Math.abs(current.client.y - startRect.y);
        const dw = Math.abs(toEven(current.client.width) - startRect.width);
        const dh = Math.abs(toEven(current.client.height) - startRect.height);
        if (
          dx > this.moveTolerancePx ||
          dy > this.moveTolerancePx ||
          dw > this.moveTolerancePx ||
          dh > this.moveTolerancePx
        ) {
          this._abort(
            "window-moved",
            "the recorded window moved or resized mid-capture (by " +
              dx + "," + dy + " px and " + dw + "x" + dh +
              " px). gdigrab's rectangle is fixed when the stream opens, so " +
              "everything after this point would be desktop where the " +
              "product used to be. Policy is " + WINDOW_FOLLOW_POLICY + ".",
            { dx, dy, dw, dh, from: startRect, to: current.client }
          );
          return;
        }
      }

      if (this.occlusionGuard && current) {
        this.observations.occlusionChecks += 1;
        const occluders = findOccluders(windows, current, this.rect);
        if (occluders.length) {
          this.observations.maxOccluderFraction = Math.max(
            this.observations.maxOccluderFraction,
            occluders[0].overlapFractionOfCapture
          );
          this._abort(
            "occluded-mid-capture",
            "an unrelated window came to the front over the capture " +
              "rectangle mid-recording: " +
              occluders[0].label +
              " covering " +
              (occluders[0].overlapFractionOfCapture * 100).toFixed(2) +
              "% of the frame. gdigrab reads the composited desktop, so it " +
              "is in the video.",
            { occluders }
          );
          return;
        }
      }
    };
    this.guardTimer = setInterval(() => {
      tick().catch(() => {
        /* the abort path already recorded whatever it could */
      });
    }, this.guardIntervalMs);
  }

  _abort(kind, message, detail) {
    if (this.integrity.aborted) return;
    this.integrity = {
      aborted: true,
      reason: kind,
      message,
      detail: detail || null,
      atMillis: Date.now(),
      millisIntoRecording: this.recordingStartedAt
        ? Date.now() - this.recordingStartedAt
        : null,
    };
    log("ABORTING CAPTURE (" + kind + "): " + message);
    this._stopGuard();
    // The footage up to this instant is KEPT. It is the part that is
    // correct, and throwing it away would make an accidental window drag
    // cost a whole session's recording rather than its tail.
    this._signalStop();
  }

  _stopGuard() {
    if (this.guardTimer) {
      clearInterval(this.guardTimer);
      this.guardTimer = null;
    }
  }

  /** Ask ffmpeg to finish the file properly rather than killing it. */
  _signalStop() {
    if (!this.proc) return;
    try {
      if (this.proc.stdin && this.proc.stdin.writable) {
        this.proc.stdin.write("q");
        this.proc.stdin.end();
      }
    } catch (err) {
      /* falls through to the kill in stopRecording/cleanup */
    }
  }

  /**
   * Stop, and return what was actually written.
   *
   * `q` on stdin makes ffmpeg finalise the container -- a killed ffmpeg
   * leaves an mp4 with no moov atom, which is a file that exists, has a
   * plausible size, and will not play. The kill is the fallback, and when it
   * is used the caller is told.
   */
  async stopRecording() {
    this._stopGuard();
    if (!this.proc) return null;
    const proc = this.proc;
    const exited = new Promise((resolve) => {
      if (proc.exitCode !== null) return resolve(proc.exitCode);
      proc.on("exit", (code) => resolve(code));
    });
    this._signalStop();

    let killed = false;
    const deadline = Date.now() + 15000;
    while (proc.exitCode === null && Date.now() < deadline) {
      await sleep(100);
    }
    if (proc.exitCode === null) {
      killed = true;
      try {
        proc.kill();
      } catch (err) {
        /* already gone */
      }
    }
    await exited;
    this.proc = null;

    const result = {
      outputPath: this.outputPath,
      killedWithoutFinalising: killed,
      integrity: this.integrity.aborted ? this.integrity : null,
      backend: "ffmpeg-gdigrab-desktop",
      windowFollowPolicy: WINDOW_FOLLOW_POLICY,
      observations: this.observations,
    };
    if (!fs.existsSync(this.outputPath)) {
      result.durationMillis = null;
      result.streams = [];
      result.note = "ffmpeg exited without writing an output file";
      return result;
    }
    const probed = this.probe(this.outputPath);
    result.durationMillis = probed.durationMillis;
    result.streams = probed.streams;
    result.hasAudioTrack = probed.streams.some((s) => s.codec_type === "audio");
    result.sizeBytes = fs.statSync(this.outputPath).size;
    return result;
  }

  /** ffprobe, as structured data. Used by C3 and C7 alike. */
  probe(file) {
    const proc = cp.spawnSync(
      this.ffprobeExe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,width,height,nb_frames",
        "-of",
        "json",
        file,
      ],
      { encoding: "buffer" }
    );
    if (proc.error || proc.status !== 0) {
      return { durationMillis: null, streams: [], error: true };
    }
    let parsed;
    try {
      parsed = JSON.parse(proc.stdout.toString("utf8"));
    } catch (err) {
      return { durationMillis: null, streams: [], error: true };
    }
    const duration = Number((parsed.format || {}).duration);
    return {
      durationMillis: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
      streams: parsed.streams || [],
    };
  }

  // --------------------------------------------------------------- cleanup

  /**
   * Put everything back. Best-effort, independent steps, and what could not
   * be undone is RETURNED rather than swallowed -- C6 is measured against
   * this list.
   *
   * There is much less to undo than OBS needed, and that is the point: no
   * scene collection, no profile, no websocket config, no sentinel files,
   * no second application's process tree. One child process and one
   * PowerShell driver.
   */
  async cleanup() {
    const problems = [];
    if (this.cleanedUp) return problems;
    this.cleanedUp = true;
    this._stopGuard();

    if (this.proc) {
      try {
        await this.stopRecording();
      } catch (err) {
        problems.push("stop-recording: " + String((err && err.message) || err));
      }
    }
    if (this.proc) {
      try {
        this.proc.kill();
      } catch (err) {
        problems.push("kill-ffmpeg: " + String((err && err.message) || err));
      }
      this.proc = null;
    }
    if (this.geometry && this.ownsGeometry) {
      try {
        this.geometry.close();
      } catch (err) {
        problems.push("close-geometry: " + String((err && err.message) || err));
      }
      this.geometry = null;
    }
    return problems;
  }
}

module.exports = {
  GdigrabCaptureSession,
  CaptureUnavailableError,
  CaptureIntegrityError,
  WindowGeometryUnavailableError,
  findOccluders,
  isPotentialOccluder,
  toEven,
  WINDOW_FOLLOW_POLICY,
  WINDOW_MOVE_TOLERANCE_PX,
  OCCLUSION_MIN_FRACTION,
  GUARD_INTERVAL_MS,
};
