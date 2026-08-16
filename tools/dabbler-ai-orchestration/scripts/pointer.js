#!/usr/bin/env node
// Pointer visibility for the walkthrough recorders (Set 113 Session 7).
//
// The diagnosis this file acts on is already settled, and it is NOT that
// the captures were missing a cursor setting. Capture-side cursor drawing
// has been ON the whole time -- `obs-capture.js` creates its Windows
// Graphics Capture input with `cursor: true`, and the ffmpeg fallback
// passes `-draw_mouse 1`. What no recording ever had was a pointer that
// MOVED, because both recorders drive with Playwright and `locator.click()`
// synthesises input through the debug protocol: it never touches the real
// Windows pointer, and Chromium's `recordVideo` composites no cursor at all
// even if it had.
//
// So there are two mechanisms here, because the two paths fail differently
// and one mechanism cannot cover both:
//
//   * SYNTHETIC (web path). Chromium's `recordVideo` will not composite a
//     cursor under any circumstance, so moving a real pointer over the
//     browser window would change nothing in the file. The pointer is
//     therefore drawn INTO the page, extending the emphasis injection the
//     web recorder already performs rather than adding a second way of
//     reaching into the document.
//
//   * PHYSICAL (VS Code path). OBS captures the desktop compositor, which
//     draws the real system cursor, so here the fix is to move the real
//     system cursor. That TAKES OVER THE OPERATOR'S ACTUAL MOUSE for the
//     length of a capture, which is fine for a recording and unacceptable
//     as a background behaviour: it is opt-in, it announces itself on the
//     console before it starts, and it restores the entry position on
//     every exit path including failure.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------------------------------------------------------- synthetic

// Shared with the visibility checker and both recorders, so it is defined
// exactly once.
const POINTER_ID = "dabbler-synthetic-pointer";

// The standard arrow, white-filled with a dark border, because the point of
// this is to look like the pointer the viewer has on their own machine. It
// is NOT a highlight, a ripple or a theme -- the spec's "do not expand"
// list rules all three out, and a cursor that looks like something else
// teaches the viewer something false in the first three seconds.
//
// The hotspot is the SVG's (0,0), the arrow's tip, so positioning is a
// plain translate to the click point with no offset arithmetic anywhere.
const POINTER_SVG =
  '<svg width="22" height="30" viewBox="0 0 22 30" ' +
  'xmlns="http://www.w3.org/2000/svg" style="display:block">' +
  '<path d="M1 1 L1 22 L6.2 17.2 L9.6 25.6 L13.4 24 L10 15.8 L17.2 15.6 Z" ' +
  'fill="#ffffff" stroke="#111111" stroke-width="1.6" ' +
  'stroke-linejoin="round"/></svg>';

// Enough interpolation that the recording shows travel rather than a jump,
// at a cadence that survives the 25fps the browser recorder captures at.
// Twelve samples over ~480ms is roughly a frame every other sample, which
// reads as motion without turning a ten-second step into a fifteen-second
// one.
const APPROACH_SAMPLES = 12;
const APPROACH_TOTAL_MS = 480;

// Where the pointer starts its first approach from: off toward the
// bottom-right, so the first move enters from the edge rather than
// materialising in the middle of the UI.
function entryPoint(viewport) {
  return {
    x: Math.round(viewport.width * 0.82),
    y: Math.round(viewport.height * 0.94),
  };
}

/**
 * Ensure the synthetic pointer element exists in the current document.
 *
 * Re-injects when missing, for the same reason `applyEmphasis` does: the
 * element is per-document, so ANY navigation drops it, and a consumer
 * application has more than one page. A pointer that silently stopped
 * existing after the first link would look like a recorder that never
 * draws one.
 */
async function ensureSyntheticPointer(page, at) {
  return page.evaluate(
    (args) => {
      let node = document.getElementById(args.id);
      if (!node) {
        node = document.createElement("div");
        node.id = args.id;
        node.innerHTML = args.svg;
        // pointer-events:none is load-bearing rather than tidy: the element
        // sits at the exact coordinate the next click targets, so without
        // it the pointer would intercept the click it exists to illustrate.
        node.style.cssText = [
          "position:fixed",
          "left:0",
          "top:0",
          "z-index:2147483647",
          "pointer-events:none",
          "will-change:transform",
          "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
        ].join(";");
        node.dataset.x = String(args.start.x);
        node.dataset.y = String(args.start.y);
        node.style.transform =
          "translate(" + args.start.x + "px, " + args.start.y + "px)";
        document.body.appendChild(node);
      }
      return { x: Number(node.dataset.x), y: Number(node.dataset.y) };
    },
    { id: POINTER_ID, svg: POINTER_SVG, start: at }
  );
}

/** Where the synthetic pointer currently is, or null if it is not drawn. */
async function syntheticPointerPosition(page) {
  return page.evaluate((id) => {
    const node = document.getElementById(id);
    if (!node) return null;
    return { x: Number(node.dataset.x), y: Number(node.dataset.y) };
  }, POINTER_ID);
}

/**
 * Move the synthetic pointer to a point, interpolated so the recording
 * shows motion rather than teleportation.
 *
 * Easing is ease-out on purpose: a pointer that decelerates into its target
 * reads as deliberate, and one that arrives at constant speed reads as a
 * scripted jump that happens to take longer.
 */
async function moveSyntheticPointer(page, to, options) {
  const opts = options || {};
  const samples = Math.max(2, opts.samples || APPROACH_SAMPLES);
  const totalMs = Math.max(
    0,
    opts.totalMs === undefined ? APPROACH_TOTAL_MS : opts.totalMs
  );
  const from = (await syntheticPointerPosition(page)) || to;

  for (let i = 1; i <= samples; i += 1) {
    const linear = i / samples;
    const eased = 1 - Math.pow(1 - linear, 3);
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    await page.evaluate(
      (args) => {
        const node = document.getElementById(args.id);
        if (!node) return;
        node.dataset.x = String(args.px);
        node.dataset.y = String(args.py);
        node.style.transform =
          "translate(" + args.px + "px, " + args.py + "px)";
      },
      { id: POINTER_ID, px: x, py: y }
    );
    if (totalMs > 0) await page.waitForTimeout(totalMs / samples);
  }
  return { from: from, to: to };
}

/** Remove the synthetic pointer, if it is drawn. */
async function removeSyntheticPointer(page) {
  await page.evaluate((id) => {
    const node = document.getElementById(id);
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }, POINTER_ID);
}

// ----------------------------------------------------------------- physical

// The PowerShell side of the physical pointer. It is a LOOP reading one
// "x,y" line per move from stdin rather than one process per move: a
// PowerShell start costs 80-150ms on this machine, and paying that twelve
// times per click would make the approach jerk rather than glide, on top of
// making a ten-step scenario minutes longer.
//
// It is run as a FILE, not piped into `-Command -`, and that is not a style
// choice. `-Command -` makes PowerShell read its own script from stdin --
// the very stream the loop then wants to read move commands from -- so the
// two readers race for the same pipe and the loop silently never sees a
// coordinate. The first version did exactly that: it started cleanly, moved
// nothing, printed no error, and surfaced as "calibration saw 0 of 3 probe
// moves reach the window", which reads like a window-position problem and
// is not one.
//
// SetProcessDpiAwarenessContext comes first and matters: SetCursorPos takes
// PHYSICAL screen pixels, and a process that is not DPI aware has its
// coordinates silently rescaled by the system on any display that is not at
// 100%. The failure mode is a pointer that lands consistently short of
// where it was asked to go, which looks like a coordinate bug and is not.
const PS_DRIVER = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -Namespace DabblerPtr -Name Win -MemberDefinition @'",
  '[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
  '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(int c);',
  '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  "'@",
  "try { [void][DabblerPtr.Win]::SetProcessDpiAwarenessContext(-4) } catch { try { [void][DabblerPtr.Win]::SetProcessDPIAware() } catch {} }",
  // Announced, not assumed. Add-Type compiles C# on first use and takes one
  // to three seconds, during which every move written to stdin sits in the
  // pipe. The first version of the calibration read the window back before
  // any of them had run, saw no mousemove, and blamed the window position --
  // and then partially succeeded once the queue flushed, which is the worst
  // kind of failure because it looks intermittent.
  "[Console]::Out.WriteLine('ready')",
  "[Console]::Out.Flush()",
  "while ($true) {",
  "  $line = [Console]::In.ReadLine()",
  "  if ($null -eq $line) { break }",
  "  $line = $line.Trim()",
  "  if ($line -eq 'quit') { break }",
  "  $parts = $line.Split(',')",
  "  if ($parts.Length -eq 2) {",
  "    [void][DabblerPtr.Win]::SetCursorPos([int]$parts[0], [int]$parts[1])",
  "  }",
  "}",
].join("\n");

class PhysicalPointerUnavailableError extends Error {}

/**
 * A live handle on the real Windows pointer.
 *
 * Every instance of this class is a takeover of the operator's mouse, so
 * the lifecycle is deliberately explicit: `open()` announces itself and
 * remembers where the pointer was, and `close()` puts it back. `close()` is
 * safe to call twice and never throws, because it runs from `finally`
 * blocks whose job is to run after something has already gone wrong.
 */
class PhysicalPointer {
  constructor(logger) {
    this.log = logger || function () {};
    this.proc = null;
    this.entry = null;
    this.lastKnown = null;
    this.closed = false;
  }

  static shell() {
    return process.env.DABBLER_POWERSHELL || "powershell.exe";
  }

  /** Read the pointer position with a one-shot call, before the loop exists. */
  static readPosition() {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms;" +
      "$p=[System.Windows.Forms.Cursor]::Position;" +
      "Write-Output ($p.X.ToString() + ' ' + $p.Y.ToString())";
    const probe = cp.spawnSync(
      PhysicalPointer.shell(),
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8" }
    );
    if (probe.error || probe.status !== 0) return null;
    const match = /(-?\d+)\s+(-?\d+)/.exec(String(probe.stdout || ""));
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  open() {
    if (process.platform !== "win32") {
      throw new PhysicalPointerUnavailableError(
        "the physical pointer is Windows-only; this is " + process.platform
      );
    }
    this.entry = PhysicalPointer.readPosition();
    if (!this.entry) {
      throw new PhysicalPointerUnavailableError(
        "could not read the current pointer position through PowerShell, so " +
          "there would be nowhere to put the pointer back. Refusing to take " +
          "it over."
      );
    }
    // Said out loud, before anything moves. An operator whose mouse starts
    // driving itself must be able to read why on the console they already
    // have open, not find out by pulling this file up.
    this.log(
      "TAKING OVER THE PHYSICAL MOUSE POINTER for the length of this " +
        "capture. Do not touch the mouse until the run reports it released. " +
        "It will be put back at " +
        this.entry.x +
        "," +
        this.entry.y +
        "."
    );
    this.scriptPath = path.join(
      os.tmpdir(),
      "dabbler-pointer-" + process.pid + "-" + Date.now() + ".ps1"
    );
    fs.writeFileSync(this.scriptPath, PS_DRIVER, "utf8");
    this.proc = cp.spawn(
      PhysicalPointer.shell(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
    // Kept, not discarded. A driver that fails to compile its P/Invoke
    // types exits without moving anything, and without this the only symptom
    // is a calibration that blames the window position.
    this.stderr = "";
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.ready = false;
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      if (String(chunk).includes("ready")) this.ready = true;
    });
    this.proc.on("error", () => {
      this.proc = null;
    });
    this.lastKnown = { x: this.entry.x, y: this.entry.y };
    return this;
  }

  /**
   * Wait for the driver loop to be reading, not merely spawned.
   *
   * Refuses rather than proceeding on a timeout: a driver that is not
   * reading turns every subsequent move into a silent no-op, and every
   * downstream measurement into a mystery.
   */
  async waitUntilReady(timeoutMs) {
    const budget = timeoutMs || 15000;
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      if (this.ready) return this;
      if (!this.proc) break;
      await sleep(50);
    }
    throw new PhysicalPointerUnavailableError(
      "the pointer driver did not report itself ready within " +
        budget +
        "ms" +
        (this.driverError() ? " (it said: " + this.driverError() + ")" : "") +
        ", so no move it was given would have run"
    );
  }

  /** Whatever the driver process complained about, for a failure message. */
  driverError() {
    return (this.stderr || "").trim().split("\n").slice(0, 3).join(" ");
  }

  /**
   * The title of the top-level window the OS says is at a screen point.
   *
   * This exists because the failure it diagnoses is otherwise unreadable.
   * Moving the real pointer onto a window delivers mouse messages to
   * whatever is actually IN FRONT at that point, not to whichever window
   * asked -- so a recorder whose window is behind something else sees no
   * events at all, and reports "the window is not where the estimate
   * expected it", which is wrong and sends the reader looking at
   * coordinates. On this machine the answer was a OneNote window sitting
   * over the workbench.
   *
   * Returns null rather than throwing: this is a diagnostic, and a
   * diagnostic that fails must not replace the failure it was explaining.
   */
  static windowTitleAt(x, y) {
    const script = [
      "Add-Type -Namespace DabblerPtrQ -Name W -MemberDefinition @'",
      '[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(System.Drawing.Point p);',
      '[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);',
      '[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);',
      '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(int c);',
      "'@ -ReferencedAssemblies System.Drawing",
      "try { [void][DabblerPtrQ.W]::SetProcessDpiAwarenessContext(-4) } catch {}",
      "$p = New-Object System.Drawing.Point(" + Math.round(x) + "," + Math.round(y) + ")",
      "$h = [DabblerPtrQ.W]::WindowFromPoint($p)",
      "$root = [DabblerPtrQ.W]::GetAncestor($h, 2)",
      "$sb = New-Object System.Text.StringBuilder 512",
      "[void][DabblerPtrQ.W]::GetWindowText($root, $sb, 512)",
      "Write-Output $sb.ToString()",
    ].join("\n");
    const scriptPath = path.join(
      os.tmpdir(),
      "dabbler-ptr-q-" + process.pid + "-" + Date.now() + ".ps1"
    );
    try {
      fs.writeFileSync(scriptPath, script, "utf8");
      const probe = cp.spawnSync(
        PhysicalPointer.shell(),
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { encoding: "utf8" }
      );
      if (probe.error || probe.status !== 0) return null;
      const title = String(probe.stdout || "").trim();
      return title || null;
    } catch (err) {
      return null;
    } finally {
      try {
        fs.rmSync(scriptPath, { force: true });
      } catch (err) {
        /* a leftover temp script is not worth failing a diagnostic over */
      }
    }
  }

  moveTo(x, y) {
    if (!this.proc || this.closed) return;
    this.proc.stdin.write(Math.round(x) + "," + Math.round(y) + "\n");
    this.lastKnown = { x: Math.round(x), y: Math.round(y) };
  }

  /**
   * Travel to a point over several samples, so the capture shows motion.
   *
   * The wait between samples is a real sleep rather than a Playwright
   * timeout because this moves the SYSTEM pointer and has no page to hang
   * it off.
   */
  async approach(x, y, options) {
    const opts = options || {};
    const samples = Math.max(2, opts.samples || APPROACH_SAMPLES);
    const totalMs = Math.max(
      0,
      opts.totalMs === undefined ? APPROACH_TOTAL_MS : opts.totalMs
    );
    const from = this.lastKnown || this.entry || { x: x, y: y };
    for (let i = 1; i <= samples; i += 1) {
      const linear = i / samples;
      const eased = 1 - Math.pow(1 - linear, 3);
      this.moveTo(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
      if (totalMs > 0) await sleep(totalMs / samples);
    }
    this.lastKnown = { x: Math.round(x), y: Math.round(y) };
    return { from: from, to: { x: x, y: y } };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    // Put the pointer back FIRST, with a one-shot call that does not depend
    // on the loop process still being healthy. If the loop died -- which is
    // exactly the case where this matters -- writing to its stdin would
    // silently do nothing and the operator's mouse would be left wherever
    // the last step dropped it.
    if (this.entry) {
      const script =
        "Add-Type -AssemblyName System.Windows.Forms;" +
        "[System.Windows.Forms.Cursor]::Position = " +
        "New-Object System.Drawing.Point(" +
        this.entry.x +
        ", " +
        this.entry.y +
        ")";
      cp.spawnSync(
        PhysicalPointer.shell(),
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8" }
      );
    }
    if (this.proc) {
      try {
        this.proc.stdin.write("quit\n");
        this.proc.stdin.end();
      } catch (err) {
        /* the loop is already gone; the restore above already ran */
      }
      try {
        this.proc.kill();
      } catch (err) {
        /* nothing to kill */
      }
      this.proc = null;
    }
    if (this.scriptPath) {
      try {
        fs.rmSync(this.scriptPath, { force: true });
      } catch (err) {
        /* a leftover temp script is not worth failing a cleanup over */
      }
      this.scriptPath = null;
    }
    this.log("physical mouse pointer released; it is yours again");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map a page-space point to a physical screen point, BY MEASUREMENT.
 *
 * The arithmetic version of this -- (window.screenX + x) * devicePixelRatio
 * -- is a guess with three ways to be wrong: the workbench's own zoom level
 * multiplies devicePixelRatio, a secondary monitor at a different scale
 * factor breaks the single-ratio assumption, and a non-DPI-aware helper
 * process has its coordinates rescaled underneath it. All three fail the
 * same way, by landing the pointer somewhere plausible and wrong.
 *
 * So it is calibrated instead: move the real pointer to three known screen
 * points, read the `clientX/clientY` the renderer reports for the real
 * mousemove each one produced, and solve for scale and offset from the
 * first two. That measures the whole chain -- DPI, zoom, window position,
 * monitor origin -- without needing to model any of it. The third point is
 * then checked against the solution, so a calibration that solved garbage
 * says so instead of driving the pointer somewhere wrong all run.
 */
async function calibratePhysicalPointer(page, pointer, options) {
  const opts = options || {};
  const settleMs = opts.settleMs || 140;

  await page.evaluate(() => {
    window.__dabblerLastMove = null;
    if (!window.__dabblerMoveHook) {
      window.__dabblerMoveHook = (event) => {
        window.__dabblerLastMove = { x: event.clientX, y: event.clientY };
      };
      window.addEventListener("mousemove", window.__dabblerMoveHook, true);
    }
  });

  const probe = async (screenX, screenY) => {
    await page.evaluate(() => {
      window.__dabblerLastMove = null;
    });
    // Nudge first, so a probe point that happens to equal where the pointer
    // already is still produces a mousemove. Without it a repeat run can
    // read "no event" and report a window that is covered when it is not.
    pointer.moveTo(screenX + 3, screenY + 3);
    await sleep(30);
    pointer.moveTo(screenX, screenY);
    await sleep(settleMs);
    const seen = await page.evaluate(() => window.__dabblerLastMove);
    return seen ? { screen: { x: screenX, y: screenY }, client: seen } : null;
  };

  // Probe points are chosen inside the window's own client area, using the
  // arithmetic estimate only as a STARTING GUESS -- being wrong here costs
  // a retry, not a wrong answer, because the answer comes from what the
  // renderer reported and not from where we aimed.
  const geometry = await page.evaluate(() => ({
    screenX: window.screenX,
    screenY: window.screenY,
    dpr: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  const guess = (cx, cy) => ({
    x: Math.round((geometry.screenX + cx) * geometry.dpr),
    y: Math.round((geometry.screenY + cy) * geometry.dpr),
  });

  const aim = [
    guess(
      Math.round(geometry.innerWidth * 0.3),
      Math.round(geometry.innerHeight * 0.3)
    ),
    guess(
      Math.round(geometry.innerWidth * 0.7),
      Math.round(geometry.innerHeight * 0.7)
    ),
    guess(
      Math.round(geometry.innerWidth * 0.5),
      Math.round(geometry.innerHeight * 0.55)
    ),
  ];

  const samples = [];
  for (const point of aim) {
    const reading = await probe(point.x, point.y);
    if (reading) samples.push(reading);
  }
  if (samples.length < 3) {
    // Ask the OS what is actually at the point we aimed at, BEFORE blaming
    // the coordinates. This is the difference between a message that sends
    // the reader to the right place and one that sends them to the wrong
    // one.
    const blocker = PhysicalPointer.windowTitleAt(aim[0].x, aim[0].y);
    const driverComplaint =
      typeof pointer.driverError === "function" ? pointer.driverError() : "";
    throw new PhysicalPointerUnavailableError(
      "physical pointer calibration saw " +
        samples.length +
        " of 3 probe moves reach the window as mousemove events" +
        (blocker
          ? ", because the window in front at that point is '" +
            blocker +
            "'. Real pointer motion is delivered to whatever is on top, so " +
            "the window being recorded has to be the one in front."
          : (driverComplaint
              ? ". The driver said: " + driverComplaint
              : ". The pointer moved but nothing in the window heard it.")) +
        " Nothing was moved out of place; the pointer is back where it was."
    );
  }

  const a = samples[0];
  const b = samples[1];
  const check = samples[2];
  const spanClientX = b.client.x - a.client.x;
  const spanClientY = b.client.y - a.client.y;
  if (Math.abs(spanClientX) < 8 || Math.abs(spanClientY) < 8) {
    throw new PhysicalPointerUnavailableError(
      "physical pointer calibration got two probe points that landed at " +
        "effectively the same client coordinate, so scale cannot be solved"
    );
  }
  const scaleX = (b.screen.x - a.screen.x) / spanClientX;
  const scaleY = (b.screen.y - a.screen.y) / spanClientY;
  const originX = a.screen.x - a.client.x * scaleX;
  const originY = a.screen.y - a.client.y * scaleY;

  const toScreen = (clientX, clientY) => ({
    x: Math.round(originX + clientX * scaleX),
    y: Math.round(originY + clientY * scaleY),
  });

  const predicted = toScreen(check.client.x, check.client.y);
  const residual = Math.max(
    Math.abs(predicted.x - check.screen.x),
    Math.abs(predicted.y - check.screen.y)
  );
  // Three pixels of slack, because the renderer reports integer client
  // coordinates and a fractional scale factor cannot round-trip exactly.
  if (residual > 3) {
    throw new PhysicalPointerUnavailableError(
      "physical pointer calibration did not hold: the third probe point was " +
        "predicted " +
        residual +
        "px away from where it actually was. Refusing to drive the pointer " +
        "from a solution that does not describe this display."
    );
  }

  return {
    toScreen: toScreen,
    scale: { x: scaleX, y: scaleY },
    origin: { x: originX, y: originY },
    residualPixels: residual,
    geometry: geometry,
    samples: samples,
  };
}

module.exports = {
  POINTER_ID,
  POINTER_SVG,
  APPROACH_SAMPLES,
  APPROACH_TOTAL_MS,
  entryPoint,
  ensureSyntheticPointer,
  syntheticPointerPosition,
  moveSyntheticPointer,
  removeSyntheticPointer,
  PhysicalPointer,
  PhysicalPointerUnavailableError,
  calibratePhysicalPointer,
  sleep,
};
