#!/usr/bin/env node
// OBS plugin-surface comparison for Set 113 Session 5, step 4.
//
//   node scripts/measure-obs-plugin-surface.js
//   node scripts/measure-obs-plugin-surface.js --static-only
//
// THE CHEAP MITIGATION, MEASURED BEFORE THE EXPENSIVE ONE IS BUILT. The
// spec orders this ahead of the container on purpose: if OBS's
// `--only-bundled-plugins` removes most of the supply-chain surface, the
// container may not be worth its cost, and that is a real answer rather
// than a disappointing one.
//
// It answers exactly one question -- WHAT LOADS -- in two ways that can
// disagree, which is why both are here:
//
//   1. STATIC. What is on disk in each plugin location. Needs no launch,
//      cannot be wrong about what exists, and says nothing about what OBS
//      actually chooses to load.
//   2. OBSERVED. OBS launched twice, with and without the flag, and its own
//      log read back for the modules it loaded. Says what really happens,
//      and depends on OBS starting cleanly.
//
// It never records anything, creates no scene, and connects to no
// websocket. It launches OBS, waits for the log, and kills it.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const SET_DIR = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs"
);
const CRITERIA_PATH = path.join(SET_DIR, "s5-isolation-criteria.json");
const OUT_PATH = path.join(SET_DIR, "s5-plugin-surface-measurement.json");

const OBS_EXE = path.join(
  process.env["ProgramFiles"] || "C:\\Program Files",
  "obs-studio",
  "bin",
  "64bit",
  "obs64.exe"
);
const OBS_INSTALL_ROOT = path.join(
  process.env["ProgramFiles"] || "C:\\Program Files",
  "obs-studio"
);
const OBS_CONFIG_ROOT = path.join(process.env.APPDATA || "", "obs-studio");
const OBS_LOG_DIR = path.join(OBS_CONFIG_ROOT, "logs");
const SENTINEL_DIR = path.join(OBS_CONFIG_ROOT, ".sentinel");

// The three places OBS looks for plugins on Windows. The first is what
// "bundled" means; the other two are what `--only-bundled-plugins` is
// supposed to skip.
const PLUGIN_LOCATIONS = [
  {
    key: "bundled",
    dir: path.join(OBS_INSTALL_ROOT, "obs-plugins", "64bit"),
    bundled: true,
  },
  {
    key: "machine-wide",
    dir: path.join(process.env.ProgramData || "C:\\ProgramData", "obs-studio", "plugins"),
    bundled: false,
  },
  {
    key: "per-user",
    dir: path.join(OBS_CONFIG_ROOT, "plugins"),
    bundled: false,
  },
];

function log(msg) {
  process.stdout.write("[plugin-surface] " + msg + "\n");
}

function sha256(file) {
  return (
    "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  );
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every file under *dir*, with sizes. Recursive: a plugin is a tree. */
function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          /* raced or unreadable; counted as zero rather than dropped */
        }
        out.push({ path: path.relative(dir, full).replace(/\\/g, "/"), bytes: size });
      }
    }
  }
  return out;
}

function staticSurface() {
  const locations = [];
  for (const loc of PLUGIN_LOCATIONS) {
    const exists = fs.existsSync(loc.dir);
    const files = exists ? walk(loc.dir) : [];
    // A "module" is a loadable binary. Counting every locale .ini as
    // surface would inflate the number that the whole comparison turns on.
    const modules = files
      .filter((f) => /\.dll$/i.test(f.path))
      .map((f) => ({ name: path.basename(f.path), bytes: f.bytes }))
      .sort((a, b) => a.name.localeCompare(b.name));
    locations.push({
      key: loc.key,
      dir: loc.dir,
      bundled: loc.bundled,
      exists,
      moduleCount: modules.length,
      modules,
      fileCount: files.length,
      totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    });
  }
  return locations;
}

/** The newest log file OBS has written, or null. */
function newestLog() {
  const files = listDir(OBS_LOG_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const full = path.join(OBS_LOG_DIR, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* ignore */
      }
      return { name: f, full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? files[0] : null;
}

/**
 * Parse the modules OBS reports loading.
 *
 * Every line in an OBS log carries an `HH:MM:SS.mmm: ` prefix, so the
 * indentation the block structure depends on only exists AFTER that prefix
 * is stripped. The first cut of this parser matched raw indentation, found
 * nothing, and reported "0 modules loaded" for two launches that had
 * plainly loaded modules -- a parser defect that reads exactly like a
 * finding, which is the kind this repo has been bitten by before.
 *
 * There are no "Loading module:" lines in an OBS log at all. The
 * authoritative record is the `Loaded Modules:` block, terminated by a
 * dashed rule. The failure diagnostics are kept beside it because
 * "Skipping module ... not an OBS plugin" and "Failed to initialize module"
 * are what a shrinking surface would show up as first.
 */
function parseModules(logText) {
  const stripped = logText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}:\s?/, ""));

  const loaded = [];
  let inBlock = false;
  for (const line of stripped) {
    if (/^\s*Loaded Modules:\s*$/i.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (/^-{5,}\s*$/.test(line.trim())) break;
    if (line.trim() === "") continue;
    if (/^\s{2,}\S/.test(line)) loaded.push(line.trim());
    else break;
  }

  const skipped = [];
  const failed = [];
  for (const line of stripped) {
    let m = line.match(/^Skipping module '(.+?)'/);
    if (m) skipped.push(path.basename(m[1]));
    m = line.match(/^Failed to initialize module '(.+?)'/);
    if (m) failed.push(path.basename(m[1]));
  }

  const cmdLine = stripped.find((l) => l.startsWith("Command Line Arguments:")) || "";

  return {
    loadedModules: Array.from(new Set(loaded)).sort(),
    skippedNotAPlugin: Array.from(new Set(skipped)).sort(),
    failedToInitialize: Array.from(new Set(failed)).sort(),
    thirdPartyPluginsDisabledLogged: stripped.some((l) =>
      /^Third-party plugins disabled\.?$/i.test(l.trim())
    ),
    commandLineLogged: cmdLine.replace("Command Line Arguments:", "").trim(),
  };
}


function clearSentinels() {
  const before = listDir(SENTINEL_DIR);
  for (const f of before) {
    try {
      fs.unlinkSync(path.join(SENTINEL_DIR, f));
    } catch {
      /* best effort */
    }
  }
  return before.length;
}

function killObs(pid) {
  try {
    cp.execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {
    /* already gone */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Launch OBS once with *extraArgs*, wait for a NEW log to appear and
 * settle, kill it, and return the parsed modules.
 *
 * `--minimize-to-tray` and `--multi` come straight from the Session 4
 * recorder: the first keeps this off the operator's screen, the second
 * stops OBS refusing to start beside another instance.
 */
async function observeLaunch(label, extraArgs) {
  const before = newestLog();
  const beforeName = before ? before.name : null;
  clearSentinels();

  const args = ["--minimize-to-tray", "--multi", ...extraArgs];
  const proc = cp.spawn(OBS_EXE, args, {
    cwd: path.dirname(OBS_EXE),
    stdio: "ignore",
    windowsHide: true,
  });
  log(label + ": launched pid=" + proc.pid + " args=" + JSON.stringify(extraArgs));

  const deadline = Date.now() + 60000;
  let logFile = null;
  while (Date.now() < deadline) {
    await sleep(1500);
    const cur = newestLog();
    if (cur && cur.name !== beforeName) {
      const text = fs.readFileSync(cur.full, "utf8");
      // "Loaded Modules:" is written after every module load attempt, so
      // its presence is the signal that the surface is fully known.
      if (/Loaded Modules:/i.test(text)) {
        logFile = cur;
        break;
      }
    }
  }

  // A beat, so a module logged immediately after the summary block is not
  // truncated by the kill.
  if (logFile) await sleep(2000);
  killObs(proc.pid);
  await sleep(1500);
  clearSentinels();

  if (!logFile) {
    return {
      label,
      args: extraArgs,
      ok: false,
      reason: "no new OBS log containing a 'Loaded Modules:' block appeared within 60s",
    };
  }
  const text = fs.readFileSync(logFile.full, "utf8");
  const parsed = parseModules(text);
  return {
    label,
    args: extraArgs,
    ok: true,
    logFile: logFile.name,
    obsVersion: (text.match(/OBS\s+([\d.]+)/) || [null, null])[1],
    ...parsed,
  };
}

async function main() {
  const staticOnly = process.argv.includes("--static-only");

  if (!fs.existsSync(CRITERIA_PATH)) {
    console.error(
      "[plugin-surface] refusing to run: " +
        CRITERIA_PATH +
        " is missing. Criteria are fixed before measurements, not after."
    );
    process.exit(2);
  }
  if (!fs.existsSync(OBS_EXE)) {
    console.error("[plugin-surface] OBS not found at " + OBS_EXE);
    process.exit(2);
  }

  const measurement = {
    measuredAt: new Date().toISOString(),
    set: "113-narrated-video-walkthroughs",
    session: 5,
    step: "4 - measure the cheap mitigation",
    criteriaSha256: sha256(CRITERIA_PATH),
    obsExe: OBS_EXE,
    staticSurface: staticSurface(),
  };

  const bundled = measurement.staticSurface.find((l) => l.key === "bundled");
  const nonBundled = measurement.staticSurface.filter((l) => !l.bundled);
  log(
    "static: bundled=" +
      bundled.moduleCount +
      " modules, non-bundled=" +
      nonBundled.reduce((n, l) => n + l.moduleCount, 0) +
      " modules across " +
      nonBundled.length +
      " location(s)"
  );

  if (!staticOnly) {
    measurement.observed = {};
    measurement.observed.withoutFlag = await observeLaunch("without-flag", []);
    measurement.observed.withFlag = await observeLaunch("with-flag", [
      "--only-bundled-plugins",
    ]);

    const a = measurement.observed.withoutFlag;
    const b = measurement.observed.withFlag;
    if (a.ok && b.ok) {
      const setA = new Set(a.loadedModules);
      const setB = new Set(b.loadedModules);
      measurement.observed.removedByFlag = [...setA].filter((x) => !setB.has(x)).sort();
      measurement.observed.stillLoadedWithFlag = [...setB].sort();
      measurement.observed.addedByFlag = [...setB].filter((x) => !setA.has(x)).sort();
      measurement.observed.reductionRatio =
        setA.size === 0 ? null : measurement.observed.removedByFlag.length / setA.size;
      // Named because the point of the whole comparison is what SURVIVES
      // the mitigation, and a bare count hides it. Each of these is a large
      // dependency that the flag does not touch, because OBS ships it.
      const NOTABLE = {
        "obs-browser.dll": "an embedded Chromium (CEF) browser source",
        "win-dshow.dll": "DirectShow capture, i.e. the camera path",
        "decklink.dll": "Blackmagic DeckLink SDK",
        "decklink-captions.dll": "Blackmagic DeckLink SDK",
        "decklink-output-ui.dll": "Blackmagic DeckLink SDK",
        "nv-filters.dll": "NVIDIA video-effects filters",
        "obs-vst.dll": "a VST plugin host",
        "vlc-video.dll": "VLC playback integration",
        "obs-websocket.dll": "a scriptable remote-control server",
      };
      measurement.observed.notableSurvivors = [...setB]
        .filter((m) => NOTABLE[m])
        .sort()
        .map((m) => ({ module: m, what: NOTABLE[m] }));
      log(
        "observed: " +
          setA.size +
          " modules without the flag, " +
          setB.size +
          " with it, " +
          measurement.observed.removedByFlag.length +
          " removed (" +
          measurement.observed.notableSurvivors.length +
          " notable survivors)"
      );
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(measurement, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
}

main().catch((err) => {
  console.error("[plugin-surface] " + (err && err.stack ? err.stack : err));
  process.exit(1);
});
