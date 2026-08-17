// A borderless, always-on-top magenta window, used as a measurement
// instrument (Set 113 Session 8).
//
// It is used three ways, exactly as Session 4's Chromium occluder was:
//   - as the thing that occludes the target, for C2;
//   - as proof the magenta detector fires at all, which is C2's CONTROL;
//   - as the decoy the correlation instrument must not mistake for the
//     workbench, which is C1's control.
//
// WHY IT REPLACES THE CHROMIUM ONE
//
// Two reasons, and the second is the substantive one.
//
//   1. Session 4's occluder was a real Chromium window, which needs
//      Playwright's browser download. This backend's measurement needs no
//      browser for anything else, and a 150MB download to obtain a
//      rectangle of one colour is a dependency the measurement does not owe.
//
//   2. IT FIXES THE INSTRUMENT THAT FAILED IN SESSION 4. C2 requires a
//      control -- "the magenta detector fires when magenta is genuinely in
//      frame" -- at a bar of 0.5 of the frame. Session 4's Chromium occluder
//      scored 0.441219 and so C2 was recorded UNMET even though the OBS
//      capture leaked exactly zero magenta. The shortfall was the browser's
//      own chrome: a title bar, a tab strip, an address bar and a status
//      bubble are not magenta, and they are a fixed cost that a 0.6-scale
//      window cannot amortise. A BORDERLESS form has no chrome, so the
//      control clears its bar by construction rather than by luck.
//
// The structure panels matter and are not decoration. A flat fill exercises
// the zero-variance branch of the correlation instrument, which is not the
// same thing as showing it can tell two real windows apart.
//
// Output is ASCII-only (L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** The colour C2's detector looks for, and the tolerance it allows. */
const MAGENTA = [255, 0, 255];
const MAGENTA_TOLERANCE = 24;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function script(rect) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    // Physical pixels. Without this the form lands at logical coordinates on
    // any display above 100% scaling, which is an occluder that misses.
    "Add-Type -Namespace DabblerOcc -Name W -MemberDefinition @'",
    '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
    "'@",
    "try { [void][DabblerOcc.W]::SetProcessDPIAware() } catch {}",
    "$f = New-Object System.Windows.Forms.Form",
    "$f.FormBorderStyle = 'None'",
    "$f.StartPosition = 'Manual'",
    "$f.ShowInTaskbar = $false",
    "$f.Left = " + Math.round(rect.x),
    "$f.Top = " + Math.round(rect.y),
    "$f.Width = " + Math.round(rect.width),
    "$f.Height = " + Math.round(rect.height),
    "$f.BackColor = [System.Drawing.Color]::FromArgb(255,0,255)",
    "$f.TopMost = $true",
    // Structure, so the correlation instrument is exercised against a window
    // with variance rather than a constant.
    "$p1 = New-Object System.Windows.Forms.Panel",
    "$p1.BackColor = [System.Drawing.Color]::FromArgb(32,32,32)",
    "$p1.SetBounds(0, 0, $f.Width, [int]($f.Height * 0.08))",
    "$f.Controls.Add($p1)",
    "$p2 = New-Object System.Windows.Forms.Panel",
    "$p2.BackColor = [System.Drawing.Color]::FromArgb(16,16,16)",
    "$p2.SetBounds([int]($f.Width * 0.1), [int]($f.Height * 0.2), [int]($f.Width * 0.5), [int]($f.Height * 0.15))",
    "$f.Controls.Add($p2)",
    "$p3 = New-Object System.Windows.Forms.Panel",
    "$p3.BackColor = [System.Drawing.Color]::FromArgb(48,48,48)",
    "$p3.SetBounds([int]($f.Width * 0.1), [int]($f.Height * 0.5), [int]($f.Width * 0.7), [int]($f.Height * 0.2))",
    "$f.Controls.Add($p3)",
    "$f.Show()",
    "$f.BringToFront()",
    "$f.Activate()",
    "[Console]::Out.WriteLine('shown')",
    "[Console]::Out.Flush()",
    // Pump messages until the parent kills the process. A form that does not
    // pump stops painting, and an occluder that is not painted is not
    // occluding anything.
    "while ($true) {",
    "  [System.Windows.Forms.Application]::DoEvents()",
    "  Start-Sleep -Milliseconds 40",
    "}",
  ].join("\n");
}

/**
 * Open the occluder and wait until it has actually painted.
 *
 * Waiting for 'shown' rather than sleeping a guessed interval is the same
 * lesson Session 7 paid for with its pointer driver: work handed to a
 * PowerShell child before it is ready is silently discarded.
 */
async function openMagentaOccluder(rect, logger) {
  const log = logger || function () {};
  const scriptPath = path.join(
    os.tmpdir(),
    "dabbler-occluder-" + process.pid + "-" + Date.now() + ".ps1"
  );
  fs.writeFileSync(scriptPath, script(rect), "utf8");
  const proc = cp.spawn(
    process.env.DABBLER_POWERSHELL || "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", scriptPath],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let shown = false;
  let stderr = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    if (String(chunk).includes("shown")) shown = true;
  });
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !shown && proc.exitCode === null) {
    await sleep(50);
  }
  if (!shown) {
    try {
      proc.kill();
    } catch (err) {
      /* already gone */
    }
    throw new Error(
      "the magenta occluder never reported itself shown" +
        (stderr.trim() ? " (it said: " + stderr.trim().split("\n")[0] + ")" : "")
    );
  }
  // Painting lags Show(). Without this the first frame taken after the call
  // can catch a form that exists and has not drawn, which reads as "the
  // capture is immune to occlusion" and is nothing of the kind.
  await sleep(900);
  log("magenta occluder up at " + rect.x + "," + rect.y + " " + rect.width + "x" + rect.height);

  return {
    rect,
    close: async () => {
      try {
        proc.kill();
      } catch (err) {
        /* already gone */
      }
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch (err) {
        /* a temp file is not worth failing a cleanup over */
      }
      await sleep(600);
    },
  };
}

module.exports = { openMagentaOccluder, MAGENTA, MAGENTA_TOLERANCE };
