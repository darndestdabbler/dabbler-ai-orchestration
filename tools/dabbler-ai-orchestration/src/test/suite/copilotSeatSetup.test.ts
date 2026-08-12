// Set 079 Session 2 — Layer-2 tests for the Copilot seat-setup wrapper
// (src/utils/copilotSeatSetup.ts). Pins the spec's happy path
// (sequencing inputs, pinned argv, parse-not-exit-code, the verify-type
// write through the router's own CLI) and the critique-M1 hygiene
// (cancel/teardown kill the child and restore the lockfile snapshot).
// Cases generated via routed test-generation (gemini-pro) and adapted
// (platform-safe label paths; typed action-message helper).
//
// Set 123 S3: the "Build action's seat-profile rider narrowing" suite went
// with `gettingStartedActions.ts` and the Getting Started webview form that
// posted the rider. Nothing posts a `transportProfile` message any more —
// the seat is set up by the `Dabbler: Set Up Copilot Seat` command, and the
// project's verify type is resolved by `python -m ai_router.verify_type`.

import * as assert from "assert";
import * as path from "path";
import {
  CATALOG_LOCKFILE_REL,
  SEAT_STATUS_MARKER_REL,
  CancellationLike,
  KillEffects,
  RefreshChildCallbacks,
  RefreshChildSpawner,
  RunCatalogRefreshDeps,
  SeatSetupFileOps,
  SeatSetupOutcome,
  SeedReadOps,
  buildRefreshArgs,
  clearCopilotSeatStatusMarker,
  currentUsername,
  deriveCopilotSeatChosenUnconfirmed,
  deriveSeatId,
  deriveSeatLabel,
  describeSeatSetupOutcome,
  describeSkipInstallIncompleteHonesty,
  extractWriterWarning,
  dispatchKill,
  buildVerifyTypeArgs,
  parseRefreshStdout,
  performCopilotSeatSetup,
  readCopilotSeatStatusMarker,
  readProjectVerifyType,
  rerunRefreshHint,
  resolveKillStrategy,
  runCatalogRefresh,
  spawnDetached,
  writeCopilotSeatStatusMarker,
  verifyTypeCommandHint,
} from "../../utils/copilotSeatSetup";

// --- Fakes (hand-rolled; the suite convention — no sinon) ---

class FakeCancellation implements CancellationLike {
  public isCancellationRequested = false;
  private callbacks: (() => void)[] = [];

  onCancellationRequested(cb: () => void): { dispose(): void } {
    this.callbacks.push(cb);
    return {
      dispose: () => {
        this.callbacks = this.callbacks.filter((c) => c !== cb);
      },
    };
  }

  cancel(): void {
    this.isCancellationRequested = true;
    this.callbacks.forEach((cb) => cb());
  }
}

class FakeFileOps implements SeatSetupFileOps, SeedReadOps {
  public files = new Map<string, string>();
  public errors = { readFile: false, writeFile: false };
  public removeRecursiveLog: string[] = [];

  exists(absPath: string): boolean {
    return this.files.has(absPath);
  }

  readFile(absPath: string): string {
    if (this.errors.readFile) throw new Error("Fake readFile error");
    if (!this.files.has(absPath)) throw new Error("File not found");
    return this.files.get(absPath)!;
  }

  writeFile(absPath: string, content: string): void {
    if (this.errors.writeFile) throw new Error("Fake writeFile error");
    this.files.set(absPath, content);
  }

  removeRecursive(absPath: string): void {
    this.removeRecursiveLog.push(absPath);
    this.files.delete(absPath);
  }
}

interface FakeSpawnerState {
  spawner: RefreshChildSpawner;
  lastCall: { cmd: string; args: string[]; opts: { cwd: string } } | null;
  /** Set 124 S3: performCopilotSeatSetup now spawns TWICE on the happy
   * path -- the catalog refresh, then the verify-type write through
   * `python -m ai_router.verify_type`. Every call is recorded so a test
   * can assert the second invocation's argv, not just the first. */
  calls: { cmd: string; args: string[]; opts: { cwd: string } }[];
  child: {
    callbacks: RefreshChildCallbacks | null;
    handle: { killCount: number; kill(): void };
    throwOnSpawn: Error | null;
  };
}

function createFakeSpawner(): FakeSpawnerState {
  const state: FakeSpawnerState = {
    spawner: (cmd, args, opts, callbacks) => {
      if (state.child.throwOnSpawn) throw state.child.throwOnSpawn;
      state.lastCall = { cmd, args, opts };
      state.calls.push({ cmd, args, opts });
      state.child.callbacks = callbacks;
      return state.child.handle;
    },
    lastCall: null,
    calls: [],
    child: {
      callbacks: null,
      handle: {
        killCount: 0,
        kill() {
          this.killCount++;
        },
      },
      throwOnSpawn: null,
    },
  };
  return state;
}

suite("copilotSeatSetup", () => {
  suite("deriveSeatId", () => {
    test("deterministic, `seat-` + 12 hex chars", () => {
      const id1 = deriveSeatId("MyHost", "MyUser");
      const id2 = deriveSeatId("MyHost", "MyUser");
      assert.strictEqual(id1, id2, "ID should be deterministic");
      assert.ok(/^seat-[0-9a-f]{12}$/.test(id1), `ID should match format, got ${id1}`);
    });

    test("normalizes hostname and username case", () => {
      assert.strictEqual(
        deriveSeatId("MyHost", "MyUser"),
        deriveSeatId("myhost", "myuser"),
      );
    });

    test("trims whitespace before hashing", () => {
      assert.strictEqual(
        deriveSeatId("  MyHost  ", "  MyUser  "),
        deriveSeatId("MyHost", "MyUser"),
      );
    });

    test("different inputs produce different ids", () => {
      const id1 = deriveSeatId("Host1", "User1");
      assert.notStrictEqual(id1, deriveSeatId("Host2", "User1"));
      assert.notStrictEqual(id1, deriveSeatId("Host1", "User2"));
    });
  });

  suite("deriveSeatLabel", () => {
    test("workspace folder basename (forward-slash paths work on every OS)", () => {
      assert.strictEqual(deriveSeatLabel("/home/user/my-project"), "my-project");
    });

    test("win32 backslash path resolves on win32", function () {
      // path.basename is platform-specific; backslash separators only
      // split on Windows, so this case is win32-only by design.
      if (process.platform !== "win32") this.skip();
      assert.strictEqual(deriveSeatLabel("C:\\Users\\user\\my-project"), "my-project");
    });

    test('empty basename falls back to "workspace"', () => {
      assert.strictEqual(deriveSeatLabel(""), "workspace");
      assert.strictEqual(deriveSeatLabel("/"), "workspace");
    });
  });

  suite("buildRefreshArgs", () => {
    test("pinned argv without an explicit binary", () => {
      assert.deepStrictEqual(buildRefreshArgs("seat-123", "label-abc"), [
        "-m",
        "ai_router.copilot_catalog",
        "--refresh",
        "--seat-id",
        "seat-123",
        "--seat-label",
        "label-abc",
      ]);
    });

    test("pinned argv with an explicit binary appended as --binary", () => {
      assert.deepStrictEqual(
        buildRefreshArgs("seat-123", "label-abc", "/path/to/cli"),
        [
          "-m",
          "ai_router.copilot_catalog",
          "--refresh",
          "--seat-id",
          "seat-123",
          "--seat-label",
          "label-abc",
          "--binary",
          "/path/to/cli",
        ],
      );
    });
  });

  suite("parseRefreshStdout", () => {
    const realCliLine =
      "Wrote ai_router/copilot-catalog.lock: 12/18 models confirmed, providers=['anthropic', 'google', 'openai']";

    test("parses the real CLI line with surrounding output", () => {
      const summary = parseRefreshStdout(`preamble...\n${realCliLine}\npostamble...`);
      assert.deepStrictEqual(summary, {
        lockfilePath: "ai_router/copilot-catalog.lock",
        confirmed: 12,
        total: 18,
        providers: ["anthropic", "google", "openai"],
      });
    });

    test("parses an empty provider list", () => {
      const summary = parseRefreshStdout(
        "Wrote /tmp/f: 0/5 models confirmed, providers=[]",
      );
      assert.deepStrictEqual(summary, {
        lockfilePath: "/tmp/f",
        confirmed: 0,
        total: 5,
        providers: [],
      });
    });

    test("parses a single provider", () => {
      const summary = parseRefreshStdout(
        "Wrote ./f: 1/1 models confirmed, providers=['google']",
      );
      assert.deepStrictEqual(summary, {
        lockfilePath: "./f",
        confirmed: 1,
        total: 1,
        providers: ["google"],
      });
    });

    test("returns null when the summary line is absent", () => {
      assert.strictEqual(
        parseRefreshStdout("Some other output\nfrom a failed run."),
        null,
      );
    });

    test("returns null for a malformed summary line", () => {
      assert.strictEqual(
        parseRefreshStdout("Wrote x: N/M models confirmed, providers=[]"),
        null,
      );
    });
  });

  // Set 124 S3: the renderTransportProfile suite went with the renderer.
  // It pinned an anchored YAML field replacement for `transport.profile` in
  // local-overrides.yaml -- a key S2 retired outright, so there is nothing
  // left for it to be right about. Its replacement is the
  // buildVerifyTypeArgs / writeVerifyTypeThroughRouter coverage below: the
  // extension no longer edits a config field, it invokes the one writer.

  suite("buildVerifyTypeArgs (the pinned write invocation)", () => {
    test("names the module, the value, and an EXPLICIT --project-root", () => {
      assert.deepStrictEqual(
        buildVerifyTypeArgs("COPILOT_CLI", "/proj"),
        [
          "-m",
          "ai_router.verify_type",
          "--set",
          "COPILOT_CLI",
          "--project-root",
          "/proj",
        ],
      );
    });

    // WHY this is pinned rather than left to the spawn cwd: verify_type
    // resolves a write target by walking up to the first ancestor holding
    // `.git`. A scaffolded project that is not yet a git repo would write
    // somewhere ABOVE itself -- silently answering for the wrong project.
    test("does NOT rely on cwd: --project-root is always present", () => {
      const args = buildVerifyTypeArgs("DIRECT_API", "/somewhere/else");
      assert.ok(args.includes("--project-root"));
      assert.strictEqual(args[args.indexOf("--project-root") + 1], "/somewhere/else");
    });

    test("never names the retired local-overrides transport key", () => {
      const joined = buildVerifyTypeArgs("COPILOT_CLI", "/proj").join(" ");
      assert.doesNotMatch(joined, /transport/);
      assert.doesNotMatch(joined, /local-overrides/);
    });
  });

  suite("verifyTypeCommandHint", () => {
    test("is the exact command an operator can paste", () => {
      assert.strictEqual(
        verifyTypeCommandHint("COPILOT_CLI"),
        "python -m ai_router.verify_type --set COPILOT_CLI",
      );
      assert.strictEqual(
        verifyTypeCommandHint("DIRECT_API"),
        "python -m ai_router.verify_type --set DIRECT_API",
      );
    });
  });

  suite("readProjectVerifyType", () => {
    const projectRoot = "/proj";
    const verifyTypePath = path.join(projectRoot, "project-verify-type.txt");

    test("reads DIRECT_API", () => {
      const ops = new FakeFileOps();
      ops.files.set(verifyTypePath, "DIRECT_API\n");
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), "DIRECT_API");
    });

    test("reads COPILOT_CLI", () => {
      const ops = new FakeFileOps();
      ops.files.set(verifyTypePath, "COPILOT_CLI\n");
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), "COPILOT_CLI");
    });

    // The Python writer emits a multi-line comment header explaining why the
    // file is gitignored. A reader that choked on it would report "never
    // chose Copilot" for every seat the extension itself configured.
    test("skips the comment header the sanctioned writer emits", () => {
      const ops = new FakeFileOps();
      ops.files.set(
        verifyTypePath,
        "# How this project is verified, ON THIS MACHINE. Gitignored on\n" +
          "# purpose: this is machine/project state, not committed project\n" +
          "#\n" +
          "\n" +
          "COPILOT_CLI\n",
      );
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), "COPILOT_CLI");
    });

    test("null when the file does not exist", () => {
      assert.strictEqual(readProjectVerifyType(projectRoot, new FakeFileOps()), null);
    });

    test("null when readFile throws", () => {
      const ops = new FakeFileOps();
      ops.files.set(verifyTypePath, "anything");
      ops.errors.readFile = true;
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), null);
    });

    test("null for an unrecognized value", () => {
      const ops = new FakeFileOps();
      ops.files.set(verifyTypePath, "SOMETHING_ELSE\n");
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), null);
    });

    test("null for a comments-only file", () => {
      const ops = new FakeFileOps();
      ops.files.set(verifyTypePath, "# just a header\n\n");
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), null);
    });

    // The old reader answered from ai_router/local-overrides.yaml. A reader
    // that still did would resurrect the retired mechanism as a SEED.
    test("does not answer from a local-overrides transport.profile", () => {
      const ops = new FakeFileOps();
      ops.files.set(
        path.join(projectRoot, "ai_router", "local-overrides.yaml"),
        "transport:\n  profile: copilot-cli\n",
      );
      assert.strictEqual(readProjectVerifyType(projectRoot, ops), null);
    });
  });

  // ---------------------------------------------------------------------
  // Set 097 (spec D1) — the durable "chose Copilot but not confirmed"
  // marker: SEAT_STATUS_MARKER_REL read/write, and the pure derivation the
  // System Status strip note gates on. The 5-state matrix (never-chose /
  // chose+confirmed / chose+cancelled / chose+CLI-missing /
  // chose+install-incomplete) collapses to marker x durableProfile,
  // because the three "attempted, unconfirmed" reasons are indistinguishable
  // on disk by design (same marker word, same api-profile router-config).
  // ---------------------------------------------------------------------

  suite("copilot seat status marker (Set 097 D1)", () => {
    const projectRoot = "/proj";
    const markerPath = path.join(projectRoot, ".dabbler", "copilot-seat-status");

    test("SEAT_STATUS_MARKER_REL is .dabbler/copilot-seat-status", () => {
      assert.strictEqual(
        SEAT_STATUS_MARKER_REL,
        path.posix.join(".dabbler", "copilot-seat-status"),
      );
    });

    test("readCopilotSeatStatusMarker: null when the file does not exist", () => {
      assert.strictEqual(
        readCopilotSeatStatusMarker(projectRoot, new FakeFileOps()),
        null,
      );
    });

    test("readCopilotSeatStatusMarker: reads 'unconfirmed' (trimmed, case-insensitive)", () => {
      for (const raw of ["unconfirmed", "unconfirmed\n", "  Unconfirmed  \n", "UNCONFIRMED"]) {
        const ops = new FakeFileOps();
        ops.files.set(markerPath, raw);
        assert.strictEqual(
          readCopilotSeatStatusMarker(projectRoot, ops),
          "unconfirmed",
          JSON.stringify(raw),
        );
      }
    });

    test("readCopilotSeatStatusMarker: null for an unrecognized word or unreadable file", () => {
      const junk = new FakeFileOps();
      junk.files.set(markerPath, "confirmed\n");
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, junk), null);

      const unreadable = new FakeFileOps();
      unreadable.files.set(markerPath, "unconfirmed\n");
      unreadable.errors.readFile = true;
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, unreadable), null);
    });

    test("writeCopilotSeatStatusMarker: writes the single word, round-trips through the reader", () => {
      const ops = new FakeFileOps();
      writeCopilotSeatStatusMarker(projectRoot, ops);
      assert.strictEqual(ops.files.get(markerPath), "unconfirmed\n");
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, ops), "unconfirmed");
    });

    // S1 discovery Majors 1-2: the marker must not revive the note forever
    // once the operator explicitly rebuilds away from Copilot.
    test("clearCopilotSeatStatusMarker: removes an existing marker; reader then sees null", () => {
      const ops = new FakeFileOps();
      writeCopilotSeatStatusMarker(projectRoot, ops);
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, ops), "unconfirmed");
      clearCopilotSeatStatusMarker(projectRoot, ops);
      assert.strictEqual(ops.files.has(markerPath), false);
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, ops), null);
    });

    test("clearCopilotSeatStatusMarker: a no-op, not an error, when no marker exists", () => {
      const ops = new FakeFileOps();
      assert.doesNotThrow(() => clearCopilotSeatStatusMarker(projectRoot, ops));
      assert.strictEqual(readCopilotSeatStatusMarker(projectRoot, ops), null);
    });
  });

  // Set 097: rerunRefreshHint relocated here from gitScaffold.ts so the
  // persistent System Status note and the one-shot toast share ONE
  // implementation instead of two that could drift.
  //
  // S1 discovery supplementary Major: the ORIGINAL relocated body (a
  // copy-pasteable `python -m ai_router.copilot_catalog --refresh …`
  // command) never actually promoted transport.profile — that CLI has no
  // knowledge of router-config.yaml at all, so the note it was supposed
  // to help dismiss could never actually clear. Replaced with the
  // Command-Palette instruction that runs the ACTUAL confirmation-gated
  // flow (copilotSeatSetupCommand.ts).
  suite("rerunRefreshHint (Set 097 relocation, corrected after S1 supplementary)", () => {
    test("points at the Set Up Copilot Seat command, deterministically", () => {
      const hint = rerunRefreshHint();
      assert.ok(hint.includes("Dabbler: Set Up Copilot Seat"));
      assert.ok(hint.includes("Command Palette"));
      assert.strictEqual(hint, rerunRefreshHint());
    });

    test("currentUsername never throws", () => {
      assert.strictEqual(typeof currentUsername(), "string");
      assert.ok(currentUsername().length > 0);
    });
  });

  suite("deriveCopilotSeatChosenUnconfirmed (Set 097 D1)", () => {
    test("never chose: marker null -> false, whatever the durable verify type", () => {
      assert.strictEqual(deriveCopilotSeatChosenUnconfirmed(null, null), false);
      assert.strictEqual(deriveCopilotSeatChosenUnconfirmed(null, "DIRECT_API"), false);
      assert.strictEqual(deriveCopilotSeatChosenUnconfirmed(null, "COPILOT_CLI"), false);
    });

    test("chose + confirmed: durable verify type is COPILOT_CLI -> false, even with a stale marker", () => {
      assert.strictEqual(
        deriveCopilotSeatChosenUnconfirmed("unconfirmed", "COPILOT_CLI"),
        false,
      );
    });

    test("chose + unconfirmed (cancelled | CLI-missing | insufficient-providers | install-incomplete): true", () => {
      // All four reasons share the identical on-disk shape (marker=
      // "unconfirmed", profile stays "api" or the file never existed) —
      // that IS the point: the derivation cannot and need not tell them
      // apart, only whether the seat is durably confirmed.
      assert.strictEqual(deriveCopilotSeatChosenUnconfirmed("unconfirmed", "DIRECT_API"), true);
      assert.strictEqual(deriveCopilotSeatChosenUnconfirmed("unconfirmed", null), true);
    });
  });

  suite("runCatalogRefresh", () => {
    let deps: RunCatalogRefreshDeps;
    let fileOps: FakeFileOps;
    let spawnerState: FakeSpawnerState;
    let cancellation: FakeCancellation;
    let disposalState: { hook: (() => void) | null; disposeCount: number };

    const projectDir = "/project";
    const lockfileAbs = path.join(projectDir, CATALOG_LOCKFILE_REL);

    setup(() => {
      fileOps = new FakeFileOps();
      spawnerState = createFakeSpawner();
      cancellation = new FakeCancellation();
      disposalState = { hook: null, disposeCount: 0 };
      deps = {
        venvPythonPath: "/venv/bin/python",
        projectDir,
        seatId: "seat-id",
        seatLabel: "seat-label",
        spawn: spawnerState.spawner,
        fileOps,
        cancellation,
        registerDisposal: (dispose) => {
          disposalState.hook = dispose;
          return {
            dispose: () => {
              disposalState.disposeCount++;
              disposalState.hook = null;
            },
          };
        },
      };
    });

    test("happy path: completed with parsed summary; lockfile kept", async () => {
      const promise = runCatalogRefresh(deps);
      assert.ok(spawnerState.child.callbacks);
      fileOps.files.set(lockfileAbs, "fresh-lock"); // the CLI's own write
      spawnerState.child.callbacks!.onStdout(
        "Wrote ai_router/copilot-catalog.lock: 2/2 models confirmed, providers=['a', 'b']",
      );
      spawnerState.child.callbacks!.onClose(0);

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "completed");
      if (outcome.kind === "completed") {
        assert.deepStrictEqual(outcome.summary.providers, ["a", "b"]);
      }
      assert.strictEqual(fileOps.files.get(lockfileAbs), "fresh-lock");
      assert.deepStrictEqual(fileOps.removeRecursiveLog, []);
      assert.strictEqual(
        disposalState.disposeCount,
        1,
        "teardown hook should be disposed once the run settles",
      );
    });

    test("happy path: spawns the venv python with the pinned args and cwd", async () => {
      const promise = runCatalogRefresh(deps);
      spawnerState.child.callbacks!.onClose(0);
      await promise;

      assert.ok(spawnerState.lastCall);
      assert.strictEqual(spawnerState.lastCall!.cmd, deps.venvPythonPath);
      assert.strictEqual(spawnerState.lastCall!.opts.cwd, deps.projectDir);
      assert.deepStrictEqual(
        spawnerState.lastCall!.args,
        buildRefreshArgs(deps.seatId, deps.seatLabel),
      );
    });

    test("exit-error: restores a pre-existing lockfile", async () => {
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "half-written-by-crashed-run");
      spawnerState.child.callbacks!.onClose(1);

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "exit-error");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");
      assert.strictEqual(disposalState.disposeCount, 1);
    });

    test("exit-error: deletes a lockfile that did not exist before", async () => {
      assert.strictEqual(fileOps.exists(lockfileAbs), false);
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "half-written-by-crashed-run");
      spawnerState.child.callbacks!.onClose(1);

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "exit-error");
      assert.strictEqual(fileOps.exists(lockfileAbs), false);
      assert.deepStrictEqual(fileOps.removeRecursiveLog, [lockfileAbs]);
    });

    test("spawn-error: onError restores the lockfile", async () => {
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "bad-content");
      spawnerState.child.callbacks!.onError(new Error("ENOENT"));

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "spawn-error");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");
    });

    test("spawn throwing synchronously is a spawn-error", async () => {
      spawnerState.child.throwOnSpawn = new Error("EACCES");
      const outcome = await runCatalogRefresh(deps);
      assert.strictEqual(outcome.kind, "spawn-error");
      if (outcome.kind === "spawn-error") {
        assert.ok(outcome.message.includes("EACCES"));
      }
    });

    test("operator cancel: kills the child, restores the lockfile, resolves cancelled", async () => {
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "partial-write");
      cancellation.cancel();

      assert.strictEqual(spawnerState.child.handle.killCount, 1);
      spawnerState.child.callbacks!.onClose(null); // process exit after kill

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      if (outcome.kind === "cancelled") assert.strictEqual(outcome.by, "operator");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");
      assert.strictEqual(disposalState.disposeCount, 1);
    });

    test("operator cancel: deletes a mid-run lockfile that did not exist before", async () => {
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "partial-write");
      cancellation.cancel();
      spawnerState.child.callbacks!.onClose(null);

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      assert.strictEqual(fileOps.exists(lockfileAbs), false);
    });

    test("teardown: the registered hook kills the child, restores, settles", async () => {
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "partial-write");

      assert.ok(disposalState.hook, "disposal hook should be registered");
      disposalState.hook!(); // simulate extension-host teardown

      assert.strictEqual(spawnerState.child.handle.killCount, 1);
      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      if (outcome.kind === "cancelled") assert.strictEqual(outcome.by, "teardown");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");
      assert.strictEqual(disposalState.hook, null, "hook disposed after settle");
    });

    test("token already cancelled: resolves without spawning", async () => {
      cancellation.cancel();
      const outcome = await runCatalogRefresh(deps);
      assert.strictEqual(outcome.kind, "cancelled");
      assert.strictEqual(spawnerState.lastCall, null, "spawn should not be called");
    });

    test("late cancel after a completed run: completed wins, lockfile kept", async () => {
      // S2 review Major 2: the child exits 0 with a valid summary, then
      // the cancel races in before onClose dispatch — restoring would
      // destroy the valid artifact and report `cancelled` for a run
      // that succeeded.
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "fresh-valid-lock"); // the CLI's final write
      spawnerState.child.callbacks!.onStdout(
        "Wrote f: 2/2 models confirmed, providers=['a', 'b']",
      );
      cancellation.cancel(); // raced in after the process already exited
      spawnerState.child.callbacks!.onClose(0);

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "completed");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "fresh-valid-lock");
    });

    test("teardown then late close: the post-exit restore runs again", async () => {
      // S2 review Major 1: the teardown restore can race the dying
      // child's final truncate-write; when the close event still gets to
      // fire, the restore must run AGAIN so the post-exit state wins.
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);

      disposalState.hook!(); // teardown: kill + synchronous restore + settle
      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");

      // The dying child completes its truncate-write AFTER the teardown
      // restore, then close fires.
      fileOps.files.set(lockfileAbs, "post-teardown-truncate-write");
      spawnerState.child.callbacks!.onClose(null);
      assert.strictEqual(
        fileOps.files.get(lockfileAbs),
        "old-content",
        "post-exit restore must win over the racing final write",
      );
    });

    test("hung child after kill: force-settles cancelled after the timeout", async () => {
      // S2 review Minor 6: a killed child that never emits close must
      // not hang the progress notification forever.
      deps.killSettleTimeoutMs = 5;
      fileOps.files.set(lockfileAbs, "old-content");
      const promise = runCatalogRefresh(deps);
      fileOps.files.set(lockfileAbs, "partial-write");
      cancellation.cancel();
      // no onClose ever fires

      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      if (outcome.kind === "cancelled") assert.strictEqual(outcome.by, "operator");
      assert.strictEqual(fileOps.files.get(lockfileAbs), "old-content");
    });
  });

  suite("performCopilotSeatSetup", () => {
    let deps: RunCatalogRefreshDeps;
    let fileOps: FakeFileOps;
    let spawnerState: FakeSpawnerState;
    let cancellation: FakeCancellation;

    const projectDir = "/project";
    const gitignorePath = path.join(projectDir, ".gitignore");
    const verifyTypePath = path.join(projectDir, "project-verify-type.txt");
    const localOverridesPath = path.join(
      projectDir,
      "ai_router",
      "local-overrides.yaml",
    );

    setup(() => {
      fileOps = new FakeFileOps();
      spawnerState = createFakeSpawner();
      cancellation = new FakeCancellation();
      deps = {
        venvPythonPath: "/venv/bin/python",
        projectDir,
        seatId: "seat-id",
        seatLabel: "seat-label",
        spawn: spawnerState.spawner,
        fileOps,
        cancellation,
        registerDisposal: () => ({ dispose: () => {} }),
      };
    });

    function closeWith(code: number | null, stdout = "", stderr = ""): void {
      assert.ok(spawnerState.child.callbacks, "spawner must have been called");
      if (stdout) spawnerState.child.callbacks!.onStdout(stdout);
      if (stderr) spawnerState.child.callbacks!.onStderr(stderr);
      spawnerState.child.callbacks!.onClose(code);
    }

    /** Settle the SECOND spawn -- the verify-type write. Yields the
     * microtask/timer queue until performCopilotSeatSetup has reached it,
     * so the test never races the await between the two children. */
    async function closeVerifyTypeWrite(
      code: number | null,
      stderr = "",
    ): Promise<void> {
      for (let i = 0; i < 20 && spawnerState.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assert.strictEqual(
        spawnerState.calls.length,
        2,
        "the verify-type write must have been spawned",
      );
      if (stderr) spawnerState.child.callbacks!.onStderr(stderr);
      spawnerState.child.callbacks!.onClose(code);
    }

    test("success: >=2 distinct providers records COPILOT_CLI through verify_type", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 3/3 models confirmed, providers=['a', 'b', 'a']");
      await closeVerifyTypeWrite(0);
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "success");
      if (outcome.kind === "success") {
        assert.deepStrictEqual(outcome.providers, ["a", "b"], "deduped + sorted");
        assert.strictEqual(outcome.confirmed, 3);
        assert.strictEqual(outcome.total, 3);
      }
      // The write goes through the router's own entry point, in the
      // scaffolded venv, against THIS project.
      const write = spawnerState.calls[1];
      assert.strictEqual(write.cmd, "/venv/bin/python");
      assert.deepStrictEqual(
        write.args,
        buildVerifyTypeArgs("COPILOT_CLI", projectDir),
      );
      assert.strictEqual(write.opts.cwd, projectDir);
    });

    // THE REGRESSION THIS SESSION EXISTS TO PREVENT (Set 124 S3). Until
    // now this branch rendered `transport.profile: copilot-cli` into
    // ai_router/local-overrides.yaml. Set 124 S2 made that key a HARD
    // REFUSAL at config load, so a "successful" seat setup handed the
    // operator a project whose every load_config raised. A planted
    // assertion, not a code read, is what separates a fixed writer from a
    // fixed-looking one (L-112-1).
    test("success: writes NOTHING into local-overrides.yaml (the retired key)", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(0);
      assert.strictEqual((await promise).kind, "success");

      assert.ok(
        !fileOps.exists(localOverridesPath),
        "seat setup must not create ai_router/local-overrides.yaml at all",
      );
      for (const [, content] of fileOps.files) {
        assert.doesNotMatch(
          content,
          /profile:\s*copilot-cli/,
          "no file this command writes may carry the retired transport.profile key",
        );
      }
    });

    // The look-alike (L-112-1): an operator's EXISTING local-overrides.yaml
    // must be left exactly as found -- the fix is "stop writing that key",
    // not "clobber that file".
    test("success: an existing local-overrides.yaml is left byte-identical", async () => {
      const preexisting = "notifications:\n  pushover: true\n";
      fileOps.files.set(localOverridesPath, preexisting);
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(0);
      assert.strictEqual((await promise).kind, "success");
      assert.strictEqual(fileOps.readFile(localOverridesPath), preexisting);
    });

    // Set 124 S3: this module writes NOTHING now. The two tests that stood
    // here pinned the extension-side .gitignore guarantee and its
    // ignoreWarning; both moved into `verify_type.write_project_verify_type`,
    // which establishes the rule before it writes the file. What stays
    // pinnable here is the negative: the seat setup touches no files at all.
    test("success: the seat setup itself writes no files", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(0);
      assert.strictEqual((await promise).kind, "success");

      // The lockfile is the refresh CLI's own artifact (written by the child,
      // not by this module) and the project file belongs to verify_type, so
      // nothing reaches disk through the injected ops on the happy path.
      assert.ok(!fileOps.exists(gitignorePath));
      assert.ok(!fileOps.exists(verifyTypePath));
      assert.ok(!fileOps.exists(localOverridesPath));
    });

    test("insufficient-providers: no verify-type write is spawned at all", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 1/3 models confirmed, providers=['google']");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "insufficient-providers");
      if (outcome.kind === "insufficient-providers") {
        assert.deepStrictEqual(outcome.providers, ["google"]);
      }
      assert.strictEqual(spawnerState.calls.length, 1, "refresh only");
      assert.ok(!fileOps.exists(verifyTypePath));
    });

    // S3 discovery round 1, Major: exit 0 is NOT unconditional success. The
    // writer fails open on an unwritable .gitignore -- it records the answer
    // and warns on stderr -- and swallowing that warning would leave the
    // operator with a committable machine-local answer while the toast
    // claimed it was gitignored.
    test("success: relays the writer's stderr warning instead of claiming gitignored", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(
        0,
        "WARNING: could not add '/project-verify-type.txt' to " +
          "/project/.gitignore (read-only file system). " +
          "project-verify-type.txt is machine/project state -- add that rule " +
          "by hand before committing.\n",
      );
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "success");
      if (outcome.kind === "success") {
        assert.ok(outcome.writerWarning, "the fail-open skip must be named");
        assert.ok(outcome.writerWarning!.includes("could not add"));
      }
      const msg = describeSeatSetupOutcome(outcome, false, "hint");
      assert.strictEqual(msg.level, "warning");
      assert.match(msg.message, /NOT git-ignored/);
    });

    // The look-alike (L-112-1): Python's own interpreter noise reaches the
    // same stream. `<frozen runpy>:130: RuntimeWarning: ...` must NOT be
    // mistaken for the writer's warning, or every single successful setup
    // would tell the operator their answer is committable.
    test("success: unrelated stderr noise is NOT reported as a warning", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(
        0,
        "<frozen runpy>:130: RuntimeWarning: 'ai_router.verify_type' found in " +
          "sys.modules after import of package 'ai_router'\n",
      );
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "success");
      if (outcome.kind === "success") {
        assert.strictEqual(outcome.writerWarning, undefined);
      }
      const msg = describeSeatSetupOutcome(outcome, false, "hint");
      assert.strictEqual(msg.level, "info");
      assert.match(msg.message, /gitignored/);
    });

    test("extractWriterWarning: fires on the contract, ignores the noise", () => {
      assert.strictEqual(
        extractWriterWarning("WARNING: could not add '/x' to /y (EACCES)."),
        "WARNING: could not add '/x' to /y (EACCES).",
      );
      assert.strictEqual(extractWriterWarning(""), undefined);
      assert.strictEqual(
        extractWriterWarning("<frozen runpy>:130: RuntimeWarning: whatever"),
        undefined,
      );
      // A line MENTIONING a warning mid-sentence is not the contract.
      assert.strictEqual(
        extractWriterWarning("wrote the file; no WARNING: was emitted"),
        undefined,
      );
    });

    test("verify-type-write-failed: the write CLI exits non-zero", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      await closeVerifyTypeWrite(2, "Refusing to write 'NOPE'.");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "verify-type-write-failed");
      if (outcome.kind === "verify-type-write-failed") {
        assert.ok(outcome.detail.includes("exited with code 2"));
        assert.ok(outcome.detail.includes("Refusing to write"));
        assert.deepStrictEqual(outcome.providers, ["a", "b"]);
      }
    });

    test("verify-type-write-failed: the write subprocess cannot start", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      for (let i = 0; i < 20 && spawnerState.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      spawnerState.child.callbacks!.onError(new Error("ENOENT"));
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "verify-type-write-failed");
      if (outcome.kind === "verify-type-write-failed") {
        assert.ok(outcome.detail.includes("could not start"));
        assert.ok(outcome.detail.includes("ENOENT"));
      }
    });

    test("refresh-failed passthrough: exit-error carries the stderr tail", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(1, "", "Something went wrong.");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "refresh-failed");
      if (outcome.kind === "refresh-failed") {
        assert.ok(outcome.detail.includes("exited with code 1"));
        assert.ok(outcome.detail.includes("Something went wrong."));
      }
      assert.strictEqual(spawnerState.calls.length, 1, "no write on a failed probe");
    });

    test("refresh-failed passthrough: exit 0 with unparseable output", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Some unexpected output");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "refresh-failed");
      if (outcome.kind === "refresh-failed") {
        assert.ok(outcome.detail.includes("could not be parsed"));
      }
    });

    test("cancelled passthrough: nothing is written and nothing is spawned twice", async () => {
      const promise = performCopilotSeatSetup(deps);
      cancellation.cancel();
      spawnerState.child.callbacks!.onClose(null);
      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      assert.strictEqual(spawnerState.calls.length, 1);
      assert.ok(!fileOps.exists(verifyTypePath));
      assert.ok(!fileOps.exists(gitignorePath));
    });
  });

  // --- Session 3: the failure matrix (honest failure UX, atomic config
  // write, kill strategy). Cases generated via routed test-generation
  // (gemini-pro) and adapted (composer copy re-grounded against the real
  // strings; tmp-write assertion fixed for the move-semantics fake). ---
  suite("Session 3 failure-matrix", () => {
    // Realistic fixture: production (copilotSeatSetup.rerunRefreshHint)
    // now points at the REAL "Dabbler: Set Up Copilot Seat" command,
    // contributed in package.json and registered in
    // copilotSeatSetupCommand.ts (S1 discovery supplementary Major, Set
    // 097: the prior copy-pasteable `copilot_catalog --refresh` command
    // never actually promoted transport.profile). Earlier revisions of
    // this fixture used a FICTIONAL command name before any such command
    // existed (S5 path-aware critique caught that as misleading) — this
    // string is the actual shipped one now.
    const rerunHint = 'run "Dabbler: Set Up Copilot Seat" from the Command Palette';
    const projectDir =
      process.platform === "win32" ? "C:\\Users\\test\\project" : "/home/test/project";
    const configRel = path.join("ai_router", "local-overrides.yaml");
    const configAbs = path.join(projectDir, configRel);
    const baseConfigContent = "transport:\n  profile: api\n";

    // S3 fake: file ops with atomic rename support (the base FakeFileOps
    // deliberately stays rename-less — it must keep satisfying
    // SeatSetupFileOps without one, pinning the optionality).
    class FakeFileOpsWithRename extends FakeFileOps {
      public renameLog: { old: string; new: string }[] = [];
      public throwOnRename: Error | null = null;

      rename(oldAbsPath: string, newAbsPath: string): void {
        if (this.throwOnRename) throw this.throwOnRename;
        this.renameLog.push({ old: oldAbsPath, new: newAbsPath });
        if (this.files.has(oldAbsPath)) {
          this.files.set(newAbsPath, this.files.get(oldAbsPath)!);
          this.files.delete(oldAbsPath);
        }
      }
    }

    suite("describeSeatSetupOutcome (honest failure UX)", () => {
      suite("kind: success", () => {
        const outcome: SeatSetupOutcome = {
          kind: "success",
          providers: ["p1", "p2"],
          confirmed: 10,
          total: 12,
        };
        test("message is level:info, identical for keyed/keyless states", () => {
          const expected =
            "Copilot seat set up: 10/12 models confirmed (providers: p1, p2). " +
            "COPILOT_CLI written to project-verify-type.txt (gitignored — the " +
            "router derives transport.profile: copilot-cli from it).";
          const msgKeyless = describeSeatSetupOutcome(outcome, false, rerunHint);
          assert.strictEqual(msgKeyless.level, "info");
          assert.strictEqual(msgKeyless.message, expected);
          const msgKeyed = describeSeatSetupOutcome(outcome, true, rerunHint);
          assert.strictEqual(msgKeyed.level, "info");
          assert.strictEqual(msgKeyed.message, expected);
        });
      });

      suite("kind: insufficient-providers", () => {
        const baseOutcome = { confirmed: 1, total: 12 };
        test("keyless: warns 'not yet functional', no api-works claim, gives rerun hint", () => {
          const msg = describeSeatSetupOutcome(
            { kind: "insufficient-providers", ...baseOutcome, providers: ["p1"] },
            false,
            rerunHint,
          );
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /not yet functional/);
          assert.doesNotMatch(msg.message, /api profile working/);
          assert.ok(msg.message.includes(rerunHint));
        });

        test("keys present: affirms 'api profile working', gives rerun hint", () => {
          const msg = describeSeatSetupOutcome(
            { kind: "insufficient-providers", ...baseOutcome, providers: ["p1"] },
            true,
            rerunHint,
          );
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /api profile working/);
          assert.doesNotMatch(msg.message, /not yet functional/);
          assert.ok(msg.message.includes(rerunHint));
        });

        test("reason-specific guidance: 0 confirmed -> 'CLI may be missing'", () => {
          const msg = describeSeatSetupOutcome(
            { kind: "insufficient-providers", confirmed: 0, total: 12, providers: [] },
            false,
            rerunHint,
          );
          assert.match(msg.message, /CLI may be missing/);
          assert.doesNotMatch(msg.message, /only one provider family/);
        });

        test("reason-specific guidance: 1 provider -> enterprise-lock note", () => {
          const msg = describeSeatSetupOutcome(
            { kind: "insufficient-providers", confirmed: 5, total: 12, providers: ["p1"] },
            false,
            rerunHint,
          );
          assert.match(msg.message, /only one provider family/);
          assert.match(msg.message, /re-running will not change the result/);
          assert.doesNotMatch(msg.message, /CLI may be missing/);
        });
      });

      suite("kind: refresh-failed", () => {
        const outcome: SeatSetupOutcome = {
          kind: "refresh-failed",
          detail: "test detail",
        };
        test("keyless: warns 'not yet functional', no api-works claim, gives rerun hint", () => {
          const msg = describeSeatSetupOutcome(outcome, false, rerunHint);
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /not yet functional/);
          assert.doesNotMatch(msg.message, /api profile working/);
          assert.match(msg.message, /test detail/);
          assert.ok(msg.message.includes(rerunHint));
        });

        test("keys present: affirms 'api profile working', gives rerun hint", () => {
          const msg = describeSeatSetupOutcome(outcome, true, rerunHint);
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /api profile working/);
          assert.doesNotMatch(msg.message, /not yet functional/);
          assert.ok(msg.message.includes(rerunHint));
        });
      });

      suite("kind: cancelled", () => {
        const outcome: SeatSetupOutcome = { kind: "cancelled", by: "operator" };
        test("keyless: warns 'not yet functional', no api-works claim, mentions restore + rerun hint", () => {
          const msg = describeSeatSetupOutcome(outcome, false, rerunHint);
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /lockfile was restored/);
          assert.match(msg.message, /not yet functional/);
          assert.doesNotMatch(msg.message, /api profile working/);
          assert.ok(msg.message.includes(rerunHint));
        });

        test("keys present: affirms 'api profile working', mentions restore + rerun hint", () => {
          const msg = describeSeatSetupOutcome(outcome, true, rerunHint);
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /lockfile was restored/);
          assert.match(msg.message, /api profile working/);
          assert.doesNotMatch(msg.message, /not yet functional/);
          assert.ok(msg.message.includes(rerunHint));
        });
      });

      suite("kind: verify-type-write-failed", () => {
        const outcome: SeatSetupOutcome = {
          kind: "verify-type-write-failed",
          providers: ["p1", "p2"],
          detail: "test detail",
        };
        test("keyless: warns 'not yet functional', gives the one-command (not re-probe) guidance", () => {
          const msg = describeSeatSetupOutcome(outcome, false, rerunHint);
          assert.strictEqual(msg.level, "warning");
          assert.match(msg.message, /not yet functional/);
          assert.doesNotMatch(msg.message, /api profile with the DABBLER_\* key/);
          assert.match(msg.message, /no re-probe is needed/);
          assert.ok(!msg.message.includes(rerunHint));
        });

        test("keys present: affirms the keys keep working, names the exact command", () => {
          const msg = describeSeatSetupOutcome(outcome, true, rerunHint);
          assert.strictEqual(msg.level, "warning");
          // Set 123 S3: the old pin was /api profile with the DABBLER_\* key/,
          // which asserted an EFFECTIVE profile this code cannot know — the
          // resolved project-verify-type.txt decides it. What stays true, and
          // is what the operator needs, is that the keys are still usable.
          assert.match(msg.message, /DABBLER_\* key\(s\) already set/);
          assert.match(msg.message, /project-verify-type\.txt resolves to/);
          assert.doesNotMatch(msg.message, /not yet functional/);
          assert.match(msg.message, /no re-probe is needed/);
          assert.ok(!msg.message.includes(rerunHint));
        });

        // Set 124 S3: the recovery instruction must be a command the operator
        // can paste, not a YAML field to hand-edit in a file that no longer
        // accepts it. Naming `transport:` here would send an operator to edit
        // the exact key that now refuses at config load.
        test("both states name `verify_type --set COPILOT_CLI`, never the retired key", () => {
          for (const keys of [true, false]) {
            const msg = describeSeatSetupOutcome(outcome, keys, rerunHint);
            assert.ok(msg.message.includes(verifyTypeCommandHint("COPILOT_CLI")));
            assert.doesNotMatch(msg.message, /transport:/);
            assert.doesNotMatch(msg.message, /local-overrides\.yaml/);
          }
        });
      });
    });

    suite("describeSkipInstallIncompleteHonesty", () => {
      test("keyless: says 'not functional', no api-works claim", () => {
        const msg = describeSkipInstallIncompleteHonesty(false);
        assert.match(msg, /not functional/);
        assert.doesNotMatch(msg, /api profile working/);
      });
      test("keys present: affirms 'api profile working', no non-functional claim", () => {
        const msg = describeSkipInstallIncompleteHonesty(true);
        assert.match(msg, /api profile working/);
        assert.doesNotMatch(msg, /not functional/);
      });
    });

    // Set 124 S3: the writeFileAtomically suites went with the writer. The
    // atomic-replace guarantee was not weakened, it MOVED -- the only file
    // this flow still causes to be written is written by `verify_type`.

    suite("kill strategy", () => {
      suite("resolveKillStrategy", () => {
        test("win32 with pid -> taskkill-tree", () => {
          assert.strictEqual(resolveKillStrategy("win32", 123), "taskkill-tree");
        });
        test("posix with pid -> posix-group", () => {
          assert.strictEqual(resolveKillStrategy("linux", 123), "posix-group");
          assert.strictEqual(resolveKillStrategy("darwin", 123), "posix-group");
        });
        test("any platform without pid -> plain", () => {
          assert.strictEqual(resolveKillStrategy("win32", undefined), "plain");
          assert.strictEqual(resolveKillStrategy("linux", undefined), "plain");
        });
      });

      suite("spawnDetached", () => {
        test("win32 -> false (taskkill /T walks the tree undetached)", () => {
          assert.strictEqual(spawnDetached("win32"), false);
        });
        test("posix -> true (child must lead its own process group)", () => {
          assert.strictEqual(spawnDetached("linux"), true);
          assert.strictEqual(spawnDetached("darwin"), true);
        });
      });

      // S3 code-review Major 1: the dispatch itself (not just the pure
      // selector) must be pinned — group signal on POSIX, taskkill on
      // win32, sync-throw fallback to the plain kill on both.
      suite("dispatchKill", () => {
        function makeEffects(overrides?: {
          taskkillThrows?: boolean;
          signalThrows?: boolean;
        }) {
          const calls: string[] = [];
          const fx: KillEffects = {
            taskkillTree: (pid: number) => {
              calls.push(`taskkill:${pid}`);
              if (overrides?.taskkillThrows) throw new Error("EPERM");
            },
            signalGroup: (pid: number) => {
              calls.push(`group:${pid}`);
              if (overrides?.signalThrows) throw new Error("ESRCH");
            },
            plainKill: () => {
              calls.push("plain");
            },
          };
          return { calls, fx };
        }

        test("posix-group signals the GROUP and does not plain-kill on success", () => {
          const { calls, fx } = makeEffects();
          dispatchKill("linux", 123, fx);
          assert.deepStrictEqual(calls, ["group:123"]);
        });

        test("posix-group falls back to the plain kill when the signal throws", () => {
          const { calls, fx } = makeEffects({ signalThrows: true });
          dispatchKill("linux", 123, fx);
          assert.deepStrictEqual(calls, ["group:123", "plain"]);
        });

        test("win32 taskkill success does not plain-kill", () => {
          const { calls, fx } = makeEffects();
          dispatchKill("win32", 123, fx);
          assert.deepStrictEqual(calls, ["taskkill:123"]);
        });

        test("win32 falls back to the plain kill when taskkill throws synchronously", () => {
          const { calls, fx } = makeEffects({ taskkillThrows: true });
          dispatchKill("win32", 123, fx);
          assert.deepStrictEqual(calls, ["taskkill:123", "plain"]);
        });

        test("no pid -> plain kill only, on any platform", () => {
          const a = makeEffects();
          dispatchKill("win32", undefined, a.fx);
          assert.deepStrictEqual(a.calls, ["plain"]);
          const b = makeEffects();
          dispatchKill("linux", undefined, b.fx);
          assert.deepStrictEqual(b.calls, ["plain"]);
        });
      });
    });
  });
});


  // Set 124 S3: the two .gitignore suites that stood here went with the
  // extension-side guarantee they pinned. The rule is now established by
  // `verify_type.write_project_verify_type` itself, and it is falsified on
  // that side -- in ai_router/tests/test_verify_type_resolution.py, both
  // directions (a planted un-ignored repo gets the rule; a look-alike rule
  // is not mistaken for coverage). Re-pinning it here would test a
  // guarantee this module no longer makes.
