// Set 079 Session 2 — Layer-2 tests for the Copilot seat-setup wrapper
// (src/utils/copilotSeatSetup.ts) and the Build action's seat-profile
// rider narrowing (gettingStartedActions.ts). Pins the spec's happy path
// (sequencing inputs, pinned argv, parse-not-exit-code, the anchored
// transport.profile template render) and the critique-M1 hygiene
// (cancel/teardown kill the child and restore the lockfile snapshot).
// Cases generated via routed test-generation (gemini-pro) and adapted
// (platform-safe label paths; typed action-message helper).

import * as assert from "assert";
import * as path from "path";
import {
  CATALOG_LOCKFILE_REL,
  CancellationLike,
  RefreshChildCallbacks,
  RefreshChildSpawner,
  RunCatalogRefreshDeps,
  SeatSetupFileOps,
  SeedReadOps,
  buildRefreshArgs,
  deriveSeatId,
  deriveSeatLabel,
  parseRefreshStdout,
  performCopilotSeatSetup,
  readTransportProfile,
  renderTransportProfile,
  runCatalogRefresh,
} from "../../utils/copilotSeatSetup";
import {
  asTransportProfileRider,
  resolveTransportProfile,
} from "../../commands/gettingStartedActions";
import { GettingStartedActionMsg } from "../../types/sessionSetsWebviewProtocol";

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
      state.child.callbacks = callbacks;
      return state.child.handle;
    },
    lastCall: null,
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

  suite("renderTransportProfile", () => {
    const baseConfig = [
      "# Some header",
      "transport: # the main block",
      "  profile: api # the key to replace",
      "# another comment",
      "transports:",
      "  copilot-cli:",
      "    # not this one",
      "    profile: some-other-value",
      "",
    ].join("\n");

    test("replaces api with copilot-cli inside the transport block only", () => {
      const result = renderTransportProfile(baseConfig, "copilot-cli");
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.changed, true);
        assert.ok(result.text.includes("profile: copilot-cli # the key to replace"));
        assert.ok(!result.text.includes("profile: api # the key to replace"));
        // the sibling block's own profile key is untouched
        assert.ok(result.text.includes("profile: some-other-value"));
      }
    });

    test("preserves CRLF line endings", () => {
      const crlfConfig = baseConfig.replace(/\n/g, "\r\n");
      const result = renderTransportProfile(crlfConfig, "copilot-cli");
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.changed, true);
        assert.ok(
          result.text.includes("profile: copilot-cli # the key to replace\r\n"),
        );
        assert.strictEqual(
          (result.text.match(/\r\n/g) || []).length,
          (crlfConfig.match(/\r\n/g) || []).length,
        );
      }
    });

    test("idempotent when the profile is already copilot-cli", () => {
      const config = baseConfig.replace(
        "profile: api # the key to replace",
        "profile: copilot-cli # the key to replace",
      );
      const result = renderTransportProfile(config, "copilot-cli");
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.changed, false);
        assert.strictEqual(result.text, config);
      }
    });

    test("fails loud when there is no transport block", () => {
      const result = renderTransportProfile("# no transport block", "copilot-cli");
      assert.strictEqual(result.ok, false);
    });

    test("fails loud when the block has no profile key (never appends one)", () => {
      const result = renderTransportProfile("transport:\n  other: key\n", "copilot-cli");
      assert.strictEqual(result.ok, false);
    });

    test("targets the DIRECT child, not a nested sub-block's profile key", () => {
      // S2 code-review cross-verifier Major: a nested `profile:` before
      // the direct child must not be matched — rewriting it would report
      // success while the real transport.profile stayed api.
      const config = [
        "transport:",
        "  nested:",
        "    profile: api",
        "  profile: api   # api | copilot-cli",
        "",
      ].join("\n");
      const result = renderTransportProfile(config, "copilot-cli");
      assert.ok(result.ok);
      if (result.ok) {
        assert.ok(result.text.includes("    profile: api\n"), "nested key untouched");
        assert.ok(
          result.text.includes("  profile: copilot-cli   # api | copilot-cli"),
          "direct child rewritten",
        );
      }
    });

    test("refuses to overwrite an operator-edited value", () => {
      const config = baseConfig.replace(
        "profile: api # the key to replace",
        "profile: custom-value # the key to replace",
      );
      const result = renderTransportProfile(config, "copilot-cli");
      assert.strictEqual(result.ok, false);
      if (!result.ok) assert.ok(result.reason.includes("operator-edited"));
    });
  });

  suite("readTransportProfile", () => {
    const projectRoot = "/proj";
    const configPath = path.join(projectRoot, "ai_router", "router-config.yaml");

    test("reads api", () => {
      const ops = new FakeFileOps();
      ops.files.set(configPath, "transport:\n  profile: api\n");
      assert.strictEqual(readTransportProfile(projectRoot, ops), "api");
    });

    test("reads copilot-cli", () => {
      const ops = new FakeFileOps();
      ops.files.set(configPath, "transport:\n  profile: copilot-cli\n");
      assert.strictEqual(readTransportProfile(projectRoot, ops), "copilot-cli");
    });

    test("null when the file does not exist", () => {
      assert.strictEqual(readTransportProfile(projectRoot, new FakeFileOps()), null);
    });

    test("null when readFile throws", () => {
      const ops = new FakeFileOps();
      ops.files.set(configPath, "anything");
      ops.errors.readFile = true;
      assert.strictEqual(readTransportProfile(projectRoot, ops), null);
    });

    test("null for an unrecognized profile value", () => {
      const ops = new FakeFileOps();
      ops.files.set(configPath, "transport:\n  profile: custom\n");
      assert.strictEqual(readTransportProfile(projectRoot, ops), null);
    });

    test("null when only a different top-level block carries profile:", () => {
      const ops = new FakeFileOps();
      ops.files.set(configPath, "transports:\n  profile: api\n");
      assert.strictEqual(readTransportProfile(projectRoot, ops), null);
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
    const configPath = path.join(projectDir, "ai_router", "router-config.yaml");
    const baseConfig = "transport:\n  profile: api   # api | copilot-cli\n";

    setup(() => {
      fileOps = new FakeFileOps();
      spawnerState = createFakeSpawner();
      cancellation = new FakeCancellation();
      fileOps.files.set(configPath, baseConfig);
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

    test("success: >=2 distinct providers rewrites transport.profile", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 3/3 models confirmed, providers=['a', 'b', 'a']");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "success");
      if (outcome.kind === "success") {
        assert.deepStrictEqual(outcome.providers, ["a", "b"], "deduped + sorted");
        assert.strictEqual(outcome.confirmed, 3);
        assert.strictEqual(outcome.total, 3);
      }
      const newConfig = fileOps.readFile(configPath);
      assert.ok(newConfig.includes("profile: copilot-cli   # api | copilot-cli"));
    });

    test("insufficient-providers: config stays api", async () => {
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 1/3 models confirmed, providers=['google']");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "insufficient-providers");
      if (outcome.kind === "insufficient-providers") {
        assert.deepStrictEqual(outcome.providers, ["google"]);
      }
      assert.strictEqual(fileOps.readFile(configPath), baseConfig);
    });

    test("config-write-failed: config file missing (refresh itself succeeded)", async () => {
      fileOps.files.delete(configPath);
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "config-write-failed");
      if (outcome.kind === "config-write-failed") {
        assert.ok(outcome.detail.includes("missing from the workspace"));
        assert.deepStrictEqual(outcome.providers, ["a", "b"]);
      }
    });

    test("config-write-failed: anchor missing in the config", async () => {
      fileOps.files.set(configPath, "wrong: shape\n");
      const promise = performCopilotSeatSetup(deps);
      closeWith(0, "Wrote f: 2/2 models confirmed, providers=['a', 'b']");
      const outcome = await promise;

      assert.strictEqual(outcome.kind, "config-write-failed");
      if (outcome.kind === "config-write-failed") {
        assert.ok(outcome.detail.includes("no `transport:` block"));
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

    test("cancelled passthrough", async () => {
      const promise = performCopilotSeatSetup(deps);
      cancellation.cancel();
      spawnerState.child.callbacks!.onClose(null);
      const outcome = await promise;
      assert.strictEqual(outcome.kind, "cancelled");
      assert.strictEqual(fileOps.readFile(configPath), baseConfig);
    });
  });

  suite("gettingStartedActions — seat-profile rider narrowing", () => {
    suite("asTransportProfileRider", () => {
      test("undefined / null narrow to undefined (caller applies the default)", () => {
        assert.strictEqual(asTransportProfileRider(undefined), undefined);
        assert.strictEqual(asTransportProfileRider(null), undefined);
      });

      test("recognized values narrow case-insensitively", () => {
        assert.strictEqual(asTransportProfileRider("api"), "api");
        assert.strictEqual(asTransportProfileRider("API"), "api");
        assert.strictEqual(asTransportProfileRider("copilot-cli"), "copilot-cli");
        assert.strictEqual(asTransportProfileRider("COPILOT-CLI"), "copilot-cli");
      });

      test("present-but-unrecognized values throw (fail-loud)", () => {
        assert.throws(() => asTransportProfileRider("invalid"));
        assert.throws(() => asTransportProfileRider(123));
        assert.throws(() => asTransportProfileRider({}));
      });
    });

    suite("resolveTransportProfile", () => {
      const msg = (tp?: unknown): GettingStartedActionMsg => ({
        type: "gettingStartedAction",
        action: "build-structure",
        transportProfile: tp as GettingStartedActionMsg["transportProfile"],
      });

      test("lightweight drops the rider outright", () => {
        assert.strictEqual(
          resolveTransportProfile(msg("copilot-cli"), "lightweight"),
          undefined,
        );
        assert.strictEqual(resolveTransportProfile(msg(), "lightweight"), undefined);
      });

      test('full defaults to "api" when the rider is absent', () => {
        assert.strictEqual(resolveTransportProfile(msg(undefined), "full"), "api");
        assert.strictEqual(resolveTransportProfile(msg(null), "full"), "api");
      });

      test("full passes a present rider through narrowed", () => {
        assert.strictEqual(
          resolveTransportProfile(msg("copilot-cli"), "full"),
          "copilot-cli",
        );
        assert.strictEqual(resolveTransportProfile(msg("api"), "full"), "api");
      });

      test("full throws on a malformed rider", () => {
        assert.throws(() => resolveTransportProfile(msg("invalid"), "full"));
      });
    });
  });
});
