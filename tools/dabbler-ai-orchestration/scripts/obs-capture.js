#!/usr/bin/env node
// Windows OS-capture backend for walkthrough recording (Set 113 Session 4).
//
// INTERNAL AND EXPLICITLY UNSTABLE. Nothing outside this repository should
// import it, and its shape may change without notice. It exists because
// Playwright's `recordVideo` was measured to break the VS Code workbench
// (Set 111 S4) -- so the ONE surface this framework cannot record with the
// portable browser path is its own product, and category (e) products
// (non-web desktop) have no other route at all.
//
// WHAT THIS IS NOT. It is not a cross-platform recorder, not a media
// pipeline, and not a "record any application" tool -- that was refused
// outright (operator ruling, 2026-08-15 (b)): capture is the cheap half,
// and a generic recorder is idle until something can DRIVE an arbitrary
// application, which nothing does. It records exactly one thing: a window
// belonging to a process the caller already launched and already drives.
//
// OBS IS NEVER BUNDLED. It is a documented optional prerequisite. "OBS
// absent, or running without its websocket reachable" is a first-class
// failure path (ObsUnavailableError), and the caller is expected to carry
// on and produce the written walkthrough without a video.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  connectObs,
  ObsUnavailableError,
} = require("./obs-websocket-client.js");

const DEFAULT_OBS_EXE = path.join(
  process.env["ProgramFiles"] || "C:\\Program Files",
  "obs-studio",
  "bin",
  "64bit",
  "obs64.exe"
);

const OBS_CONFIG_ROOT = path.join(
  process.env.APPDATA || "",
  "obs-studio"
);
const WEBSOCKET_CONFIG = path.join(
  OBS_CONFIG_ROOT,
  "plugin_config",
  "obs-websocket",
  "config.json"
);
const SENTINEL_DIR = path.join(OBS_CONFIG_ROOT, ".sentinel");
const SCENES_DIR = path.join(OBS_CONFIG_ROOT, "basic", "scenes");
const PROFILES_DIR = path.join(OBS_CONFIG_ROOT, "basic", "profiles");
const USER_INI = path.join(OBS_CONFIG_ROOT, "user.ini");

// Windows Graphics Capture. The whole reason OBS is the primary candidate
// over ffmpeg gdigrab: WGC follows the window under occlusion, does not
// black-frame on hardware-accelerated Electron, and does not leak the
// occluding window into the frame.
const CAPTURE_METHOD_WGC = 2;
// Match candidate windows by executable, not by title. Title matching is
// the single likeliest way this captures the wrong window in a real
// environment, so the caller narrows by title itself and we REFUSE on more
// than one match rather than silently taking the first.
const MATCH_PRIORITY_EXE = 2;

function log(msg) {
  console.log("[os-capture] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Even dimensions only: yuv420 encoders reject odd ones. */
function toEven(n) {
  const v = Math.max(2, Math.floor(n));
  return v % 2 === 0 ? v : v - 1;
}

/**
 * Everything this module changed outside the repository, recorded so it
 * can be put back. C6 asks for deterministic cleanup INCLUDING when the
 * run fails part way, so the record is built as changes are made rather
 * than reconstructed at the end.
 */
class RestorePoint {
  constructor() {
    this.websocketConfig = null;
    this.userIni = null;
    this.sentinelsBefore = null;
    this.scenesBefore = null;
    this.profilesBefore = null;
    this.createdSceneCollection = null;
    this.createdProfile = null;
    this.originalSceneCollection = null;
    this.originalProfile = null;
  }
}

class ObsCaptureSession {
  constructor(options) {
    const opts = options || {};
    this.obsExe = opts.obsExe || DEFAULT_OBS_EXE;
    this.port = opts.port || 44667;
    this.password = opts.password || "dabbler-walkthrough";
    // The password used to CONNECT, which is normally the one OBS was
    // launched with. They are separable only so the pilot can induce a
    // genuine authentication rejection rather than assert one.
    this.connectPassword =
      opts.connectPassword !== undefined ? opts.connectPassword : this.password;
    // When false, OBS is not spawned and the connection is attempted
    // against whatever is (or is not) already listening -- the honest way
    // to exercise "OBS is not running".
    this.launchEnabled = opts.launchEnabled !== false;
    // Whether this session may WRITE obs-websocket's config to turn the
    // server on. DEFAULT FALSE, and that default is the whole point.
    //
    // Enabling the websocket is documented as a one-time thing the human
    // does in OBS's own UI, and the shipped recorder must not quietly do it
    // for them: "OBS installed with its websocket disabled" is the
    // supported missing-dependency state, so a user who runs the recorder
    // in that state must get a no-video walkthrough, not a reconfigured
    // OBS. Only the PILOT opts in, and only because it restores the file
    // byte-for-byte afterwards.
    this.mayEnableWebsocketConfig = opts.mayEnableWebsocketConfig === true;
    this.tag = opts.tag || "dabbler";
    this.launchTimeoutMs = opts.launchTimeoutMs || 60000;

    this.client = null;
    this.obsProcess = null;
    this.obsPid = null;
    this.restore = new RestorePoint();
    this.sceneName = null;
    this.inputName = null;
    this.createdInputKinds = [];
    this.recordingPath = null;
  }

  // ----------------------------------------------------------------- setup

  /**
   * Enable obs-websocket's server and clear stale run markers.
   *
   * Both were found by probing rather than reasoned about. Neither
   * `--websocket_port` nor `--websocket_password` ENABLES the server --
   * OBS logs "Overriding WebSocket port" and then never starts listening --
   * so the one boolean has to be written, and is put back at cleanup. And a
   * leftover `.sentinel/run_*` marker raises a modal "crash detected"
   * dialog on the next launch, which is how an automated harness silently
   * HANGS a later run instead of failing one.
   */
  prepareHost() {
    if (!fs.existsSync(this.obsExe)) {
      throw new ObsUnavailableError(
        "obs-not-installed",
        "OBS Studio was not found at " +
          this.obsExe +
          ". OBS is an optional prerequisite for OS capture; install it, or " +
          "record without a video."
      );
    }

    if (this.mayEnableWebsocketConfig && fs.existsSync(WEBSOCKET_CONFIG)) {
      const original = fs.readFileSync(WEBSOCKET_CONFIG, "utf8");
      this.restore.websocketConfig = original;
      const cfg = JSON.parse(original);
      if (!cfg.server_enabled) {
        cfg.server_enabled = true;
        fs.writeFileSync(WEBSOCKET_CONFIG, JSON.stringify(cfg, null, 4), "utf8");
        log("enabled obs-websocket server (restored at cleanup)");
      }
    }

    if (fs.existsSync(USER_INI)) {
      this.restore.userIni = fs.readFileSync(USER_INI);
    }

    // Snapshot what is on disk BEFORE anything is created, so cleanup can
    // remove what APPEARED rather than what it predicted would appear. The
    // first cut guessed OBS's slug rules and guessed wrong -- it looked for
    // `dabbler-walkthrough-collection.json` while OBS had written
    // `dabblerwalkthroughcollection.json` -- so the file survived AND the
    // survival check passed, which is the worst of both. Observing beats
    // predicting whenever the other program owns the naming.
    this.restore.scenesBefore = new Set(this._listDir(SCENES_DIR));
    this.restore.profilesBefore = new Set(this._listDir(PROFILES_DIR));
    this.restore.sentinelsBefore = this._sentinels();
    for (const f of this.restore.sentinelsBefore) {
      try {
        fs.unlinkSync(path.join(SENTINEL_DIR, f));
      } catch {
        /* best effort */
      }
    }
    if (this.restore.sentinelsBefore.length) {
      log(
        "cleared " +
          this.restore.sentinelsBefore.length +
          " stale OBS run marker(s)"
      );
    }
  }

  _sentinels() {
    return this._listDir(SENTINEL_DIR);
  }

  _listDir(dir) {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  }

  async launch() {
    if (!this.launchEnabled) {
      this.client = await connectObs({
        port: this.port,
        password: this.connectPassword,
        timeoutMs: 6000,
      });
      return await this.client.request("GetVersion", {});
    }
    const args = [
      "--websocket_port",
      String(this.port),
      "--websocket_password",
      this.password,
      "--minimize-to-tray",
      "--multi",
    ];
    this.obsProcess = cp.spawn(this.obsExe, args, {
      cwd: path.dirname(this.obsExe),
      stdio: "ignore",
      windowsHide: true,
    });
    this.obsPid = this.obsProcess.pid;
    log("launched OBS pid=" + this.obsPid);

    const deadline = Date.now() + this.launchTimeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        this.client = await connectObs({
          port: this.port,
          password: this.connectPassword,
          timeoutMs: 4000,
        });
        break;
      } catch (err) {
        lastError = err;
        await sleep(1500);
      }
    }
    if (!this.client) {
      throw new ObsUnavailableError(
        (lastError && lastError.kind) || "timeout",
        "OBS started (pid " +
          this.obsPid +
          ") but its websocket never became reachable on port " +
          this.port +
          ": " +
          (lastError ? lastError.message : "no further detail")
      );
    }
    const version = await this.client.request("GetVersion", {});
    log(
      "connected: OBS " +
        version.obsVersion +
        ", obs-websocket " +
        version.obsWebSocketVersion
    );
    return version;
  }

  // ------------------------------------------------------------- configure

  /**
   * Build an isolated scene collection and profile, and point one window
   * capture at the target.
   *
   * ISOLATED IS THE POINT. The operator's own OBS setup here carries a
   * live webcam, a microphone and Desktop Audio; borrowing their scene
   * collection would put all three into a recording nobody asked for. So
   * this creates its own collection, deletes every input it did not create
   * (that is where global audio devices live), and asserts what is left.
   */
  async configure(options) {
    const collection = this.tag + "-collection";
    const profile = this.tag + "-profile";
    this.sceneName = this.tag + "-scene";
    this.inputName = this.tag + "-window";

    const collections = await this.client.request("GetSceneCollectionList", {});
    this.restore.originalSceneCollection = collections.currentSceneCollectionName;
    const profiles = await this.client.request("GetProfileList", {});
    this.restore.originalProfile = profiles.currentProfileName;

    if (!collections.sceneCollections.includes(collection)) {
      await this.client.request("CreateSceneCollection", {
        sceneCollectionName: collection,
      });
    } else {
      await this.client.request("SetCurrentSceneCollection", {
        sceneCollectionName: collection,
      });
    }
    this.restore.createdSceneCollection = collection;
    await sleep(1200);

    if (!profiles.profiles.includes(profile)) {
      await this.client.request("CreateProfile", { profileName: profile });
    } else {
      await this.client.request("SetCurrentProfile", { profileName: profile });
    }
    this.restore.createdProfile = profile;
    await sleep(1200);

    // Every input that exists now is one OBS supplied, not one we asked
    // for -- global audio devices arrive this way. Remove them all, then
    // assert. C7 refuses to let "the webcam was probably not in frame" be
    // the standard of proof.
    const existing = await this.client.request("GetInputList", {});
    for (const input of existing.inputs) {
      await this.client.request("RemoveInput", {
        inputName: input.inputName,
      });
      log("removed pre-existing input: " + input.inputName +
          " (" + input.inputKind + ")");
    }

    await this.client.request("CreateScene", { sceneName: this.sceneName });
    await this.client.request("SetCurrentProgramScene", {
      sceneName: this.sceneName,
    });

    await this.client.request("SetProfileParameter", {
      parameterCategory: "Output",
      parameterName: "Mode",
      parameterValue: "Simple",
    });
    // ONLY the path and the container. Quality and encoder are left at the
    // profile's own defaults, and that is a MEASURED choice, not laziness:
    // `RecQuality=Small` makes OBS accept StartRecord and then never start
    // the output -- no error on the websocket, no line in OBS's own log, the
    // recording simply does not happen. Bisected against the defaults
    // (2026-08-15): container `mp4`, `hybrid_mp4` and `fragmented_mp4` all
    // record fine, canvas size is irrelevant, and the encoder id is
    // irrelevant while quality is `Stream`; setting quality to `Small` fails
    // on its own and fails with every encoder tried. Two settings removed
    // rather than a workaround added.
    for (const [name, value] of [
      ["FilePath", options.outDir],
      ["RecFormat2", "mp4"],
    ]) {
      await this.client.request("SetProfileParameter", {
        parameterCategory: "SimpleOutput",
        parameterName: name,
        parameterValue: String(value),
      });
    }
    await this.client.request("SetRecordDirectory", {
      recordDirectory: options.outDir,
    });

    // The canvas IS the window. Anything else records a letterboxed or
    // rescaled window, which is precisely the "usable resolution" failure
    // C3 is there to catch.
    const width = toEven(options.width);
    const height = toEven(options.height);
    await this.client.request("SetVideoSettings", {
      baseWidth: width,
      baseHeight: height,
      outputWidth: width,
      outputHeight: height,
      fpsNumerator: options.fps || 30,
      fpsDenominator: 1,
    });

    await this.client.request("CreateInput", {
      sceneName: this.sceneName,
      inputName: this.inputName,
      inputKind: "window_capture",
      inputSettings: {
        method: CAPTURE_METHOD_WGC,
        priority: MATCH_PRIORITY_EXE,
        cursor: options.captureCursor !== false,
        client_area: true,
      },
      sceneItemEnabled: true,
    });
    this.createdInputKinds.push("window_capture");

    const chosen = await this._chooseWindow(options.windowMatch);
    await this.client.request("SetInputSettings", {
      inputName: this.inputName,
      inputSettings: { window: chosen.value },
      overlay: true,
    });
    await sleep(1500);

    const items = await this.client.request("GetSceneItemList", {
      sceneName: this.sceneName,
    });
    if (items.sceneItems.length !== 1) {
      throw new Error(
        "expected exactly one source in the capture scene, found " +
          items.sceneItems.length +
          " -- refusing to record something nobody asked for."
      );
    }
    await this.client.request("SetSceneItemTransform", {
      sceneName: this.sceneName,
      sceneItemId: items.sceneItems[0].sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        scaleX: 1,
        scaleY: 1,
        boundsType: "OBS_BOUNDS_NONE",
      },
    });

    return { chosenWindow: chosen, canvas: { width, height } };
  }

  /**
   * Resolve the target window, or refuse.
   *
   * The Step 3.5 routed analysis named title ambiguity as the leading
   * false-pass mode for a pilot like this one: selecting by title passes in
   * a sterile environment and captures the wrong window in a real one. So
   * more than one match is an ERROR, not a tie to be broken -- a harness
   * that silently takes the first match records the wrong window and
   * reports success.
   */
  async _chooseWindow(matcher) {
    const listed = await this.client.request(
      "GetInputPropertiesListPropertyItems",
      { inputName: this.inputName, propertyName: "window" }
    );
    const candidates = (listed.propertyItems || [])
      .filter((item) => item.itemEnabled !== false && item.itemValue)
      .map((item) => ({ name: item.itemName, value: item.itemValue }));

    const matched = candidates.filter((c) => matcher(c));
    if (matched.length === 0) {
      throw new Error(
        "no capturable window matched. OBS offered " +
          candidates.length +
          " candidate(s): " +
          candidates.map((c) => c.name).join(" | ")
      );
    }
    if (matched.length > 1) {
      throw new Error(
        "REFUSING to record: " +
          matched.length +
          " windows matched, and picking one would be a guess. Matches: " +
          matched.map((c) => c.name).join(" | ")
      );
    }
    log("target window: " + matched[0].name);
    return matched[0];
  }

  // --------------------------------------------------------------- capture

  /** A PNG of what the capture source currently sees, as a Buffer. */
  async grabSourceFrame() {
    const res = await this.client.request("GetSourceScreenshot", {
      sourceName: this.inputName,
      imageFormat: "png",
    });
    const data = res.imageData || "";
    const comma = data.indexOf(",");
    return Buffer.from(comma >= 0 ? data.slice(comma + 1) : data, "base64");
  }

  /**
   * Start recording, and report the honest uncertainty of when it began.
   *
   * Nothing tells us the instant the first frame lands, so the call is
   * BRACKETED and the width of the bracket is carried as the anchor's
   * uncertainty -- the same contract Session 3 established for the browser
   * recorder. OBS's encoder start-up is slower than a browser's, so this
   * number is larger and saying so is the point.
   */
  async startRecording() {
    const before = Date.now();
    await this.client.request("StartRecord", {});
    const deadline = Date.now() + 20000;
    let active = false;
    while (Date.now() < deadline) {
      const status = await this.client.request("GetRecordStatus", {});
      if (status.outputActive) {
        active = true;
        break;
      }
      await sleep(100);
    }
    const after = Date.now();
    // An output that never goes active is a RECORDING FAILURE and has to
    // say so. The first cut let the poll time out and returned an anchor
    // with a 20-second uncertainty, so the run carried on and reported
    // "OBS produced no output file" -- true, but it named the symptom and
    // hid the cause. StartRecord returning ok while nothing starts is
    // exactly the failure `RecQuality=Small` produces, and it took a
    // bisect to find because nothing anywhere said it had happened.
    if (!active) {
      throw new ObsUnavailableError(
        "output-never-started",
        "OBS accepted StartRecord but its recording output never became " +
          "active within 20s. Nothing was captured. Check OBS's own log for " +
          "the profile's output settings; a rejected quality or encoder " +
          "value fails exactly this way, silently."
      );
    }
    return {
      anchorMillis: Math.round((before + after) / 2),
      uncertaintyMillis: after - before,
    };
  }

  async stopRecording() {
    const status = await this.client.request("GetRecordStatus", {});
    if (!status.outputActive) return null;
    const duration = status.outputDuration;
    const res = await this.client.request("StopRecord", {});
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const s = await this.client.request("GetRecordStatus", {});
      if (!s.outputActive) break;
      await sleep(150);
    }
    this.recordingPath = res.outputPath || null;
    return { outputPath: this.recordingPath, durationMillis: duration };
  }

  // --------------------------------------------------------------- cleanup

  /**
   * Put everything back, in the order that survives a part-way failure.
   *
   * Each step is independent and best-effort: a cleanup that abandons the
   * rest of its work because step two threw is how orphan processes and
   * half-removed profiles accumulate. What could not be undone is
   * RETURNED, not swallowed -- C6 is measured against this list.
   */
  async cleanup() {
    const problems = [];

    if (this.client) {
      try {
        const status = await this.client.request("GetRecordStatus", {});
        if (status.outputActive) await this.client.request("StopRecord", {});
      } catch (err) {
        problems.push("stop-record: " + err.message);
      }
      try {
        if (this.restore.originalSceneCollection) {
          await this.client.request("SetCurrentSceneCollection", {
            sceneCollectionName: this.restore.originalSceneCollection,
          });
          await sleep(1200);
        }
        if (this.restore.originalProfile) {
          await this.client.request("SetCurrentProfile", {
            profileName: this.restore.originalProfile,
          });
          await sleep(1200);
        }
      } catch (err) {
        problems.push("restore-current: " + err.message);
      }
      try {
        if (this.restore.createdProfile) {
          await this.client.request("RemoveProfile", {
            profileName: this.restore.createdProfile,
          });
        }
      } catch (err) {
        problems.push("remove-profile: " + err.message);
      }
      try {
        await this.client.close();
      } catch {
        /* already closed */
      }
    }

    // OBS is killed rather than closed: `ConfirmOnExit` is true in the
    // operator's settings, and a confirmation dialog is exactly the modal
    // stall this harness must never depend on a human to clear. Killing is
    // safe here because the recording is already stopped and flushed, and
    // because the run marker an unclean exit leaves behind is removed
    // below -- which is the only thing that leak actually costs.
    if (this.obsPid) {
      try {
        cp.execSync("taskkill /PID " + this.obsPid + " /T /F", {
          stdio: "ignore",
        });
      } catch {
        /* already gone */
      }
      await sleep(2000);
      if (this._processAlive(this.obsPid)) {
        problems.push("obs process " + this.obsPid + " still running");
      }
    }

    // obs-websocket has no RemoveSceneCollection request, so the only way
    // to leave the operator's OBS as it was found is to remove the files
    // this session caused to appear, after OBS has exited. What appeared is
    // OBSERVED against the pre-run snapshot rather than predicted from the
    // name we asked for: OBS slugs collection names by its own rules
    // (`dabbler-walkthrough-collection` becomes
    // `dabblerwalkthroughcollection`), and a cleanup that predicts the
    // filename deletes nothing and then reports success.
    problems.push(...this._removeAppeared(SCENES_DIR, this.restore.scenesBefore, "scene collection"));
    problems.push(...this._removeAppeared(PROFILES_DIR, this.restore.profilesBefore, "profile"));

    if (this.restore.userIni) {
      try {
        fs.writeFileSync(USER_INI, this.restore.userIni);
      } catch (err) {
        problems.push("restore-user-ini: " + err.message);
      }
    }
    if (this.restore.websocketConfig !== null) {
      try {
        fs.writeFileSync(WEBSOCKET_CONFIG, this.restore.websocketConfig, "utf8");
      } catch (err) {
        problems.push("restore-websocket-config: " + err.message);
      }
    }

    for (const f of this._sentinels()) {
      try {
        fs.unlinkSync(path.join(SENTINEL_DIR, f));
      } catch {
        /* best effort */
      }
    }
    if (this._sentinels().length) {
      problems.push("OBS run markers survived cleanup");
    }

    this.client = null;
    this.obsProcess = null;
    return problems;
  }

  /**
   * Remove everything that appeared in *dir* since the pre-run snapshot,
   * and report anything that would not go.
   */
  _removeAppeared(dir, before, label) {
    if (!before) return [];
    const problems = [];
    for (const entry of this._listDir(dir)) {
      if (before.has(entry)) continue;
      const target = path.join(dir, entry);
      try {
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 });
      } catch (err) {
        problems.push("remove-" + label + " " + entry + ": " + err.message);
      }
    }
    const survivors = this._listDir(dir).filter((e) => !before.has(e));
    if (survivors.length) {
      problems.push(
        label + " file(s) survived cleanup: " + survivors.join(", ")
      );
    }
    return problems;
  }

  _processAlive(pid) {
    try {
      const out = cp.execSync(
        'tasklist /FI "PID eq ' + pid + '" /NH /FO CSV',
        { encoding: "utf8" }
      );
      return out.includes('"' + pid + '"');
    } catch {
      return false;
    }
  }
}

module.exports = {
  ObsCaptureSession,
  ObsUnavailableError,
  DEFAULT_OBS_EXE,
  WEBSOCKET_CONFIG,
  SENTINEL_DIR,
  SCENES_DIR,
  PROFILES_DIR,
  toEven,
};
