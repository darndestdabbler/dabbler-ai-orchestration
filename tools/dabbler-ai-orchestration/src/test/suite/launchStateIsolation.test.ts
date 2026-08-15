// Set 117 S1 — per-launch state isolation, and the falsifiers that prove it.
//
// `--user-data-dir` and `--extensions-dir` scope VS Code's own profile per
// launch. They do NOT scope the machine-wide state directories the platform
// names: APPDATA / LOCALAPPDATA on Windows, and everything under HOME
// elsewhere. Every concurrent Electron launch therefore shared them, which was
// measured (2026-08-10, 35 Layer 3 tests at 8 workers) to be both CORRUPTING
// and SERIALIZING: shared 304.7s with 2 failures, scoped 275.3s all green.
// The failures had been assumed to be CPU starvation and were not.
//
// Commit 5388c3d1 fixed that inline in `electronLaunch.ts` and left the tests
// to this session. They matter more than usual here for a specific reason:
// this is env scoping, and env scoping fails SILENTLY. A regression that stops
// overriding APPDATA produces a suite that still passes — slower, and flaky
// under load, months later. Nothing about reading the code distinguishes a
// working override from a dead one (L-112-1), so every positive assertion
// below is paired with the planted look-alike: the same call WITHOUT the
// overlay, asserted to inherit the parent's value. If the override silently
// stopped working, the negative test would fail too, and a suite where both
// halves pass is one where the difference is real.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// A local TS import keeps this file on the CommonJS load path under ts-node,
// which is what makes the `require` below legal — see walkStager.test.ts.
import { readSessionSets } from "../../utils/fileSystem";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const launch = require("../../../scripts/vscode-launch.js") as {
  EXTENSION_ROOT: string;
  electronEnv: (
    extra?: Record<string, string>,
    sourceEnv?: Record<string, string | undefined>,
    platform?: string,
  ) => Record<string, string>;
  makeLaunchStateDirs: (opts?: {
    baseDir?: string;
    platform?: string;
  }) => { root: string; env: Record<string, string> };
  LAUNCH_BLOCKERS: Array<{ id: string; pattern: RegExp; explain: string }>;
  recognizeLaunchBlocker: (
    output: unknown,
  ) => { id: string; explain: string } | null;
  describeLaunchFailure: (
    originalMessage: string,
    output: string,
    maxOutputChars?: number,
  ) => string;
};

const EXTENSION_ROOT: string = launch.EXTENSION_ROOT;

suite("Set 117 S1 — per-launch state isolation", () => {
  const created: string[] = [];

  function makeIn(platform: string): { root: string; env: Record<string, string> } {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-isolation-test-"));
    created.push(base);
    return launch.makeLaunchStateDirs({ baseDir: base, platform });
  }

  suiteTeardown(() => {
    for (const dir of created) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* opportunistic — these live under TMPDIR */
      }
    }
  });

  suite("the overlay actually redirects, and the test can tell", () => {
    // The parent environment as a launch would really see it: a machine-wide
    // Windows profile, shared by every process on the box.
    const parent = {
      PATH: "C:\\Windows\\system32",
      APPDATA: "C:\\Users\\real\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\real\\AppData\\Local",
      USERPROFILE: "C:\\Users\\real",
      HOME: "C:\\Users\\real",
    };

    test("WITHOUT the overlay the parent's machine-wide dirs are inherited", () => {
      // The planted look-alike. This is the bug, reproduced: it asserts that
      // the allowlist really does carry APPDATA through, which is what made
      // the positive test below meaningful rather than vacuous. If this ever
      // fails, the allowlist changed and the pairing below proves nothing.
      const env = launch.electronEnv({}, parent, "win32");
      assert.strictEqual(env.APPDATA, parent.APPDATA);
      assert.strictEqual(env.LOCALAPPDATA, parent.LOCALAPPDATA);
      assert.strictEqual(env.USERPROFILE, parent.USERPROFILE);
      assert.strictEqual(env.HOME, parent.HOME);
    });

    test("WITH the overlay every one of them is redirected off the machine", () => {
      const { env: overlay } = makeIn("win32");
      const env = launch.electronEnv(overlay, parent, "win32");
      for (const key of ["APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME"]) {
        assert.ok(env[key], `${key} missing from the launch environment`);
        assert.notStrictEqual(
          env[key],
          parent[key as keyof typeof parent],
          `${key} still points at the machine-wide dir; concurrent launches ` +
            "would share state, which is both a corruption and a serialization " +
            "bug (measured: 2 failures and +29.4s at 8 workers)",
        );
      }
    });

    test("the overlay wins over inheritance regardless of merge order", () => {
      // `electronEnv` merges `extra` AFTER allowlist filtering. That ordering
      // is the whole mechanism — reverse it and the parent's APPDATA wins
      // while the code still reads as though it scopes.
      const { env: overlay } = makeIn("win32");
      const env = launch.electronEnv(overlay, parent, "win32");
      assert.strictEqual(env.APPDATA, overlay.APPDATA);
      assert.strictEqual(env.LOCALAPPDATA, overlay.LOCALAPPDATA);
    });
  });

  suite("each launch gets its own, and it exists on disk", () => {
    test("two launches never share a root", () => {
      // A single shared root would reintroduce the exact defect: the dirs
      // would be off the machine-wide profile and still shared BETWEEN the
      // concurrent launches, which is where the corruption came from.
      const a = makeIn("win32");
      const b = makeIn("win32");
      assert.notStrictEqual(a.root, b.root);
      assert.notStrictEqual(a.env.APPDATA, b.env.APPDATA);
      assert.notStrictEqual(a.env.LOCALAPPDATA, b.env.LOCALAPPDATA);
      assert.notStrictEqual(a.env.HOME, b.env.HOME);
    });

    test("the directories are real, not just strings", () => {
      // VS Code does not necessarily create APPDATA itself, and a path that
      // does not exist is a fail-open: the launch proceeds, writes somewhere
      // else, and the isolation is nominal.
      const { root, env } = makeIn("win32");
      for (const p of [root, env.APPDATA, env.LOCALAPPDATA, env.HOME]) {
        assert.ok(fs.existsSync(p), `${p} was named but never created`);
        assert.ok(fs.statSync(p).isDirectory(), `${p} is not a directory`);
      }
    });

    test("the state dirs live under the root, so one removal cleans up", () => {
      // Teardown removes `root`. Anything named outside it leaks a VS Code
      // profile per launch, and at 8 workers that is 8 per suite run.
      //
      // `path.relative`, not `startsWith`: a string-prefix test accepts a
      // SIBLING whose name merely begins with the root's ("/tmp/state-ab"
      // passes a startsWith check against "/tmp/state-a"), which is the
      // containment bug this assertion exists to catch.
      const { root, env } = makeIn("win32");
      for (const p of [env.APPDATA, env.LOCALAPPDATA, env.HOME]) {
        const rel = path.relative(root, p);
        assert.ok(
          !path.isAbsolute(rel) && !rel.startsWith(".."),
          `${p} is outside the root, so cleanup would leak it`,
        );
      }
    });

    test("a sibling that merely shares the root's name prefix is NOT contained", () => {
      // The planted look-alike for the assertion above. If containment ever
      // reverts to a string-prefix test, this fails and says why.
      const { root } = makeIn("win32");
      const sibling = root + "-not-mine";
      const rel = path.relative(root, sibling);
      assert.ok(
        path.isAbsolute(rel) || rel.startsWith(".."),
        "a name-prefix sibling was treated as living inside the root",
      );
    });
  });

  suite("the isolation is cross-platform, not Windows-only", () => {
    // This is the part commit 5388c3d1 could not settle. APPDATA and
    // LOCALAPPDATA do not exist off Windows: there, VS Code's machine-wide
    // state hangs off HOME (~/.config/Code on Linux, ~/Library/Application
    // Support/Code on macOS). An APPDATA-only fix leaves both CI runners
    // sharing state the moment either one runs more than one worker.
    for (const platform of ["linux", "darwin"]) {
      test(`${platform}: HOME and USERPROFILE are scoped`, () => {
        const { root, env } = makeIn(platform);
        assert.strictEqual(env.HOME, root);
        assert.strictEqual(env.USERPROFILE, root);
        assert.ok(fs.existsSync(root));
      });

      test(`${platform}: no invented Windows variables`, () => {
        // Setting APPDATA on Linux would be inert at best and misleading at
        // worst — a reader would conclude the state is scoped there when the
        // thing that scopes it is HOME.
        const { env } = makeIn(platform);
        assert.ok(!("APPDATA" in env), "APPDATA has no meaning off Windows");
        assert.ok(!("LOCALAPPDATA" in env), "LOCALAPPDATA has no meaning off Windows");
      });
    }

    test("win32 scopes HOME as well as the AppData pair", () => {
      // Windows VS Code reads APPDATA, but the extension host shells out to
      // git, and git reads its global config from USERPROFILE/HOME. Scoping
      // one without the other leaves half the state shared.
      const { root, env } = makeIn("win32");
      assert.strictEqual(env.HOME, root);
      assert.strictEqual(env.USERPROFILE, root);
      // The real Windows layout is <USERPROFILE>/AppData/{Roaming,Local}.
      // Since USERPROFILE is `root` here, anything that derives an AppData
      // path from the profile rather than reading the variable lands where
      // the variable points instead of in a sibling that only looks right.
      assert.strictEqual(env.APPDATA, path.join(root, "AppData", "Roaming"));
      assert.strictEqual(env.LOCALAPPDATA, path.join(root, "AppData", "Local"));
    });
  });

  // These are SOURCE-LEVEL pins, and the name says so. They prove each launch
  // site still routes through the shared factory; they do NOT prove the
  // resulting environment reaches a launched process — only a real launch
  // does that, and that is Layer 3's job. The pin is still worth having:
  // the defect it guards is a future edit quietly re-implementing the dirs
  // in one site, which no amount of behavioural testing of the OTHER site
  // would catch.
  suite("source pin: both launch sites route through the shared seam", () => {
    // L-069-1: the fix landed inline in the Playwright harness only. The walk
    // stager launches VS Code the same way, and `vscode-launch.js` exists
    // precisely so the operator's walk window is the one the suite exercises.
    // A harness-only fix means the walk still runs against the operator's real
    // machine-wide profile — which is both a pollution bug and exactly the
    // drift this shared module was created to prevent.
    const sites: Array<[string, string]> = [
      ["the Playwright harness", path.join(EXTENSION_ROOT, "src", "test", "playwright", "electronLaunch.ts")],
      ["the walk stager", path.join(EXTENSION_ROOT, "scripts", "stage-walk.js")],
    ];

    for (const [label, file] of sites) {
      test(`${label} calls the shared factory`, () => {
        const src = fs.readFileSync(file, "utf8");
        // A CALL, not a mention. The first version of this asserted on the
        // bare name and passed against a planted violation that re-implemented
        // the dirs inline while leaving the TYPE DECLARATION
        // (`makeLaunchStateDirs: (opts?...)`) in place — a name can survive in
        // an import, a type, or a comment long after the call is gone. The
        // trailing `(` with no colon before it is what separates the two.
        assert.ok(
          /makeLaunchStateDirs\s*\(/.test(src),
          `${file} names the shared state-dir factory but never calls it`,
        );
      });

      test(`${label} does not hand-roll its own AppData paths`, () => {
        // Match the CODE, not the comments that explain the mechanism — both
        // files legitimately discuss APPDATA in prose.
        const src = fs
          .readFileSync(file, "utf8")
          .split(/\r?\n/)
          .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
          .join("\n");
        assert.ok(
          !/APPDATA\s*:\s*path\.join/.test(src),
          `${file} builds its own AppData path instead of using the factory; ` +
            "a second definition is how the walk and the suite drift apart",
        );
      });
    }
  });

  suite("a session set placed under a scoped root is still parseable", () => {
    // Deliberately NOT called an end-to-end check. It stages nothing and
    // launches nothing: it asserts only that `readSessionSets` is indifferent
    // to living under a tmpdir-scoped HOME, which is the one property of the
    // scoping this layer can actually observe. Whether the scoped environment
    // reaches a real launched window is Layer 3's to answer.
    test("readSessionSets parses a fixture written under a scoped root", () => {
      const { root } = makeIn(process.platform);
      const setDir = path.join(root, "docs", "session-sets", "001-demo");
      fs.mkdirSync(setDir, { recursive: true });
      fs.writeFileSync(
        path.join(setDir, "session-state.json"),
        JSON.stringify(
          {
            schemaVersion: 4,
            sessionSetName: "001-demo",
            status: "not-started",
            sessions: [
              { number: 1, title: "Demo", status: "not-started", startedAt: null, completedAt: null, orchestrator: null, verificationVerdict: null },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
      fs.writeFileSync(path.join(setDir, "spec.md"), "# Demo\n", "utf8");
      const sets = readSessionSets(root);
      assert.strictEqual(sets.length, 1);
      assert.strictEqual(sets[0].name, "001-demo");
    });
  });
});

// Set 133 follow-on — a failed launch must report what the CHILD said.
//
// On 2026-08-15 all 32 Layer 3 specs failed with the same six words, "Target
// page, context or browser has been closed", each after ~34.3s, because a
// stuck VS Code installer held the machine-wide `vscode-updating` mutex. VS
// Code emitted the reason on the child's stderr and nothing read it, so a
// one-line answer arrived as 32 identical timeouts.
//
// These are paired the way the isolation tests above are (L-112-1): every
// recognizer assertion has a planted LOOK-ALIKE that must NOT match, because
// a pattern that matches everything and a pattern that matches nothing both
// read as "working" when you only test the positive case.
suite("Set 133 follow-on — launch failure diagnostics", () => {
  const MUTEX_LINE =
    "[main 2026-08-15T13:58:05.575Z] checkInnoSetupMutex: vscode-updating " +
    "is held, waiting up to 30s for setup to finish...";

  suite("recognizeLaunchBlocker", () => {
    test("recognizes the held vscode-updating mutex", () => {
      const hit = launch.recognizeLaunchBlocker(MUTEX_LINE);
      assert.ok(hit, "the mutex line must be recognized");
      assert.strictEqual(hit.id, "vscode-updating-mutex");
      // Assert the RULE, not a substring a sibling blocker also emits: the
      // explanation has to tell the reader this is machine state and that
      // the repo is not what needs changing.
      assert.match(hit.explain, /INSTALLER/);
      assert.match(hit.explain, /machine state, not a test failure/i);
    });

    test("recognizes an Electron binary that parsed args as a Node CLI", () => {
      const hit = launch.recognizeLaunchBlocker(
        "Code.exe: bad option: --extensionDevelopmentPath=D:/repo",
      );
      assert.ok(hit, "the bad-option line must be recognized");
      assert.strictEqual(hit.id, "electron-run-as-node");
      assert.match(hit.explain, /ELECTRON_RUN_AS_NODE/);
    });

    test("PLANTED LOOK-ALIKE: ordinary launch chatter is not a blocker", () => {
      // The failure mode this guards is a pattern broad enough to match any
      // stderr at all, which would label every failure with a cause it does
      // not have -- worse than saying nothing.
      const ordinary = [
        "[main 2026-08-15T13:58:05.575Z] update#setState idle",
        "[main] Starting VS Code",
        "Warning: 'NO_COLOR' env is ignored due to 'FORCE_COLOR' being set.",
        "an update is available and the window mentions vscode",
      ].join("\n");
      assert.strictEqual(launch.recognizeLaunchBlocker(ordinary), null);
    });

    test("PLANTED LOOK-ALIKE: a HEALTHY launch's real mutex chatter is not a blocker", () => {
      // Captured verbatim from a successful launch on 2026-08-15 while
      // building this fix. A healthy VS Code says "mutex" on its way up --
      // installMutex is not checkInnoSetupMutex -- so a recognizer keyed on
      // the word alone would label every green run as blocked. This is the
      // look-alike that pattern would fail, using the real bytes rather than
      // an invented approximation.
      const healthy =
        "[main 2026-08-15T14:41:24.586Z] StorageMainService: creating " +
        "application shared storage\n" +
        "[main 2026-08-15T14:41:24.666Z] Error: Error mutex already exists\n" +
        "    at Ls.installMutex (file:///D:/.vscode-test/Code.exe)";
      assert.strictEqual(launch.recognizeLaunchBlocker(healthy), null);
    });

    test("PLANTED LOOK-ALIKE: empty and non-string output are not blockers", () => {
      assert.strictEqual(launch.recognizeLaunchBlocker(""), null);
      assert.strictEqual(launch.recognizeLaunchBlocker(undefined), null);
      assert.strictEqual(launch.recognizeLaunchBlocker(null), null);
      assert.strictEqual(launch.recognizeLaunchBlocker(42), null);
    });

    test("the blocker corpus is non-empty and every entry is well formed", () => {
      // A recognizer with an empty rule table matches nothing and passes the
      // negative tests above for the wrong reason. Assert the input set.
      assert.ok(launch.LAUNCH_BLOCKERS.length >= 2);
      for (const b of launch.LAUNCH_BLOCKERS) {
        assert.ok(b.id && typeof b.id === "string");
        assert.ok(b.pattern instanceof RegExp);
        assert.ok(
          b.explain && b.explain.length > 40,
          `${b.id}: an explanation that does not explain is not a fix`,
        );
      }
    });
  });

  suite("describeLaunchFailure", () => {
    test("keeps the original message and appends the recognized cause", () => {
      const msg = launch.describeLaunchFailure(
        "electronApplication.firstWindow: Target page, context or browser has been closed",
        MUTEX_LINE,
      );
      // The original error is the half that says WHERE it died; losing it to
      // make room for the diagnosis would trade one blind spot for another.
      assert.match(msg, /firstWindow: Target page/);
      assert.match(msg, /LIKELY CAUSE \(vscode-updating-mutex\)/);
      assert.match(msg, /--- launched VS Code output ---/);
      assert.match(msg, /checkInnoSetupMutex/);
    });

    test("PLANTED LOOK-ALIKE: unrecognized output still reaches the reader", () => {
      // The point of capturing stderr is not the recognizer -- it is that an
      // UNKNOWN cause stops being invisible. If this ever regresses to "only
      // known causes are reported", the next novel blocker costs another
      // half-day of bisecting.
      const msg = launch.describeLaunchFailure(
        "launch failed",
        "SIGSEGV in some renderer nobody has seen before",
      );
      assert.doesNotMatch(msg, /LIKELY CAUSE/);
      assert.match(msg, /SIGSEGV in some renderer/);
    });

    test("says so explicitly when the child wrote nothing", () => {
      const msg = launch.describeLaunchFailure("launch failed", "");
      assert.match(msg, /none captured/);
    });

    test("truncates from the END, keeping the last lines written", () => {
      // A dying process's useful lines are its last ones. Truncating from the
      // front would keep the startup banner and drop the cause.
      const noise = "x".repeat(5000);
      const msg = launch.describeLaunchFailure(
        "launch failed",
        `${noise}\nTHE LAST THING IT SAID`,
        200,
      );
      assert.match(msg, /THE LAST THING IT SAID/);
      assert.match(msg, /\(truncated\)/);
      assert.ok(msg.length < 1500, "the clipped output must actually be clipped");
    });
  });
});
