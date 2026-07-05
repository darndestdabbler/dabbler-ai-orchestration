// Set 079 Session 2 — Layer-2 tests for the gitScaffold.ts VS Code layer
// of the Copilot seat setup (added for the S2 cross-provider
// verification Major: the sequencing gate, the venv-interpreter reuse,
// the cancellable-notification options, and the install-failed skip must
// be PINNED, not implied by call order). Runs under the vscode stub.

import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  BuildStructureSeams,
  ScaffoldResult,
  TaskkillSpawn,
  buildProjectStructureNoPrompt,
  decideCopilotSeatSetup,
  makeRealKillEffects,
  runCopilotSeatSetupWithProgress,
} from "../../commands/gitScaffold";
import { InstallOutcome, venvPython } from "../../utils/aiRouterInstall";
import { TemplateBundle } from "../../utils/consumerBootstrap";
import {
  RunCatalogRefreshDeps,
  SeatSetupOutcome,
  deriveSeatId,
  deriveSeatLabel,
} from "../../utils/copilotSeatSetup";

function fakeContext(): vscode.ExtensionContext {
  return { subscriptions: [] as { dispose(): void }[] } as unknown as vscode.ExtensionContext;
}

suite("gitScaffold — makeRealKillEffects (S3 verification R1: async taskkill fallback)", () => {
  function makeFakeTaskkill(): {
    spawn: TaskkillSpawn;
    calls: { cmd: string; args: string[] }[];
    fireError: () => void;
  } {
    let errorCb: ((err: Error) => void) | null = null;
    const calls: { cmd: string; args: string[] }[] = [];
    return {
      spawn: (cmd, args) => {
        calls.push({ cmd, args });
        return {
          on: (event: "error", cb: (err: Error) => void) => {
            errorCb = cb;
            return undefined;
          },
        };
      },
      calls,
      fireError: () => errorCb?.(new Error("spawn taskkill ENOENT")),
    };
  }

  test("taskkillTree spawns taskkill /pid <pid> /T /F and does not plain-kill on success", () => {
    let killCount = 0;
    const fake = makeFakeTaskkill();
    const fx = makeRealKillEffects({ pid: 4242, kill: () => killCount++ }, fake.spawn);
    fx.taskkillTree(4242);
    assert.deepStrictEqual(fake.calls, [
      { cmd: "taskkill", args: ["/pid", "4242", "/T", "/F"] },
    ]);
    assert.strictEqual(killCount, 0, "no plain kill while taskkill is presumed running");
  });

  test("the taskkill child's ASYNC error event falls back to the plain kill", () => {
    let killCount = 0;
    const fake = makeFakeTaskkill();
    const fx = makeRealKillEffects({ pid: 4242, kill: () => killCount++ }, fake.spawn);
    fx.taskkillTree(4242);
    // a missing/blocked taskkill reports via the error event, not a throw
    fake.fireError();
    assert.strictEqual(killCount, 1, "plain kill must run from the error event");
  });

  test("plainKill delegates to the child's own kill()", () => {
    let killCount = 0;
    const fake = makeFakeTaskkill();
    const fx = makeRealKillEffects({ pid: 4242, kill: () => killCount++ }, fake.spawn);
    fx.plainKill();
    assert.strictEqual(killCount, 1);
    assert.strictEqual(fake.calls.length, 0, "plain kill never spawns taskkill");
  });
});

suite("gitScaffold — decideCopilotSeatSetup (the sequencing gate)", () => {
  test("not selected: lightweight tier never runs, whatever the profile", () => {
    assert.strictEqual(
      decideCopilotSeatSetup("lightweight", "copilot-cli", true, "/venv"),
      "skip-not-selected",
    );
    assert.strictEqual(
      decideCopilotSeatSetup("lightweight", undefined, true, "/venv"),
      "skip-not-selected",
    );
  });

  test("not selected: full tier with api / absent profile never runs", () => {
    assert.strictEqual(
      decideCopilotSeatSetup("full", "api", true, "/venv"),
      "skip-not-selected",
    );
    assert.strictEqual(
      decideCopilotSeatSetup("full", undefined, true, "/venv"),
      "skip-not-selected",
    );
  });

  test("selected but the install failed: honest skip, never a run", () => {
    assert.strictEqual(
      decideCopilotSeatSetup("full", "copilot-cli", false, "/venv"),
      "skip-install-incomplete",
    );
  });

  test("selected but no venv materialized: honest skip, never a run", () => {
    assert.strictEqual(
      decideCopilotSeatSetup("full", "copilot-cli", true, null),
      "skip-install-incomplete",
    );
    assert.strictEqual(
      decideCopilotSeatSetup("full", "copilot-cli", true, undefined),
      "skip-install-incomplete",
    );
  });

  test("selected + install succeeded + venv present: run", () => {
    assert.strictEqual(
      decideCopilotSeatSetup("full", "copilot-cli", true, "/proj/.venv"),
      "run",
    );
  });
});

suite("gitScaffold — runCopilotSeatSetupWithProgress (VS Code layer)", () => {
  const projectDir = path.join("/tmp", "seat-proj");
  const venvPath = path.join(projectDir, ".venv");

  interface Captured {
    progressOpts: { location: vscode.ProgressLocation; title: string; cancellable: boolean } | null;
    performDeps: RunCatalogRefreshDeps | null;
    infos: string[];
    warnings: string[];
  }

  function makeSeams(outcome: SeatSetupOutcome): {
    captured: Captured;
    seams: Parameters<typeof runCopilotSeatSetupWithProgress>[3];
  } {
    const captured: Captured = {
      progressOpts: null,
      performDeps: null,
      infos: [],
      warnings: [],
    };
    return {
      captured,
      seams: {
        withProgress: (opts, task) => {
          captured.progressOpts = opts;
          return task(
            { report: () => {} },
            {
              isCancellationRequested: false,
              onCancellationRequested: () => ({ dispose: () => {} }),
            } as unknown as vscode.CancellationToken,
          );
        },
        perform: async (deps: RunCatalogRefreshDeps) => {
          captured.performDeps = deps;
          return outcome;
        },
        showInfo: (m: string) => captured.infos.push(m),
        showWarning: (m: string) => captured.warnings.push(m),
      },
    };
  }

  const success: SeatSetupOutcome = {
    kind: "success",
    providers: ["anthropic", "google"],
    confirmed: 10,
    total: 18,
  };

  test("progress runs as a CANCELLABLE NOTIFICATION with the seat-setup title", async () => {
    const { captured, seams } = makeSeams(success);
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.ok(captured.progressOpts);
    assert.strictEqual(
      captured.progressOpts!.location,
      vscode.ProgressLocation.Notification,
    );
    assert.strictEqual(captured.progressOpts!.cancellable, true);
    assert.ok(captured.progressOpts!.title.includes("Copilot seat"));
  });

  test("the refresh uses the SCAFFOLDED VENV'S OWN interpreter and project cwd", async () => {
    const { captured, seams } = makeSeams(success);
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.ok(captured.performDeps);
    assert.strictEqual(captured.performDeps!.venvPythonPath, venvPython(venvPath));
    assert.strictEqual(captured.performDeps!.projectDir, projectDir);
  });

  test("seat identity is auto-derived: hostname+user hash id, basename label", async () => {
    const { captured, seams } = makeSeams(success);
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    let username: string;
    try {
      username = os.userInfo().username;
    } catch {
      username = process.env.USERNAME ?? process.env.USER ?? "user";
    }
    assert.strictEqual(
      captured.performDeps!.seatId,
      deriveSeatId(os.hostname(), username),
    );
    assert.ok(/^seat-[0-9a-f]{12}$/.test(captured.performDeps!.seatId));
    assert.strictEqual(
      captured.performDeps!.seatLabel,
      deriveSeatLabel(projectDir),
    );
  });

  test("registerDisposal pushes into context.subscriptions and splices back out", async () => {
    const context = fakeContext();
    const { captured, seams } = makeSeams(success);
    const origPerform = seams!.perform!;
    seams!.perform = async (deps: RunCatalogRefreshDeps) => {
      // While the run is "in flight": the teardown hook must be
      // registered in context.subscriptions...
      let hookRan = false;
      const reg = deps.registerDisposal(() => {
        hookRan = true;
      });
      assert.strictEqual(context.subscriptions.length, 1);
      // ...and disposing the returned handle must splice it back out
      // without running the teardown hook (Minor 4 fix).
      reg.dispose();
      assert.strictEqual(context.subscriptions.length, 0);
      assert.strictEqual(hookRan, true, "vscode.Disposable runs its callback on dispose");
      return origPerform(deps);
    };
    await runCopilotSeatSetupWithProgress(context, projectDir, venvPath, seams);
    assert.strictEqual(context.subscriptions.length, 0);
    assert.ok(captured.performDeps, "perform ran");
  });

  test("success outcome reports an info toast naming the config write", async () => {
    const { captured, seams } = makeSeams(success);
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.strictEqual(captured.warnings.length, 0);
    assert.strictEqual(captured.infos.length, 1);
    assert.ok(captured.infos[0].includes("10/18"));
    assert.ok(captured.infos[0].includes("transport.profile: copilot-cli"));
  });

  test("insufficient-providers warns honestly: fail-closed, config stays api, lockfile kept", async () => {
    const { captured, seams } = makeSeams({
      kind: "insufficient-providers",
      providers: ["anthropic"],
      confirmed: 5,
      total: 18,
    });
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.strictEqual(captured.infos.length, 0);
    assert.strictEqual(captured.warnings.length, 1);
    assert.ok(captured.warnings[0].includes("fail closed"));
    assert.ok(captured.warnings[0].includes("transport.profile: api"));
    assert.ok(captured.warnings[0].includes("Re-run seat setup"));
  });

  test("config-write-failed warns with the two-step partial state, not a refresh failure", async () => {
    const { captured, seams } = makeSeams({
      kind: "config-write-failed",
      providers: ["anthropic", "google"],
      detail: "disk full",
    });
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.strictEqual(captured.warnings.length, 1);
    assert.ok(captured.warnings[0].includes("probe succeeded"));
    assert.ok(captured.warnings[0].includes("disk full"));
    assert.ok(captured.warnings[0].includes("no re-probe is needed"));
  });

  test("cancelled warns that the lockfile was restored and config stays api", async () => {
    const { captured, seams } = makeSeams({ kind: "cancelled", by: "operator" });
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.strictEqual(captured.warnings.length, 1);
    assert.ok(captured.warnings[0].includes("restored"));
    assert.ok(captured.warnings[0].includes("transport.profile: api"));
  });

  test("refresh-failed warns with the detail and the re-run hint", async () => {
    const { captured, seams } = makeSeams({
      kind: "refresh-failed",
      detail: "the refresh exited with code 2",
    });
    await runCopilotSeatSetupWithProgress(fakeContext(), projectDir, venvPath, seams);
    assert.strictEqual(captured.warnings.length, 1);
    assert.ok(captured.warnings[0].includes("exited with code 2"));
    assert.ok(captured.warnings[0].includes("--seat-id"));
  });
});

suite("gitScaffold — buildProjectStructureNoPrompt (the REAL build path)", () => {
  const projectDir = path.join("/tmp", "build-proj");
  const venvPath = path.join(projectDir, ".venv");

  const fakeBundle = { engineFiles: {}, templates: {} } as unknown as TemplateBundle;

  function scaffoldResult(installOk: boolean): ScaffoldResult {
    return {
      written: ["CLAUDE.md"],
      skipped: [],
      installOk,
      installMessage: installOk ? "installed" : "pip failed",
      routerConfigRemoved: false,
      budgetOutcome: null,
    };
  }

  function installOutcome(venv: string | null): InstallOutcome {
    return {
      ok: venv !== null,
      message: "x",
      source: "pypi",
      venvPath: venv,
      routerConfigPreserved: false,
    };
  }

  interface BuildCapture {
    events: string[];
    seatSetupArgs: { projectDir: string; venvPath: string } | null;
    warnings: string[];
    infos: string[];
  }

  function makeBuildSeams(
    installOk: boolean,
    venv: string | null,
  ): { captured: BuildCapture; seams: BuildStructureSeams } {
    const captured: BuildCapture = {
      events: [],
      seatSetupArgs: null,
      warnings: [],
      infos: [],
    };
    return {
      captured,
      seams: {
        probePython: () => true,
        gitInit: async () => {
          captured.events.push("git-init");
        },
        loadBundle: () => fakeBundle,
        runScaffold: async () => {
          captured.events.push("scaffold");
          return {
            result: scaffoldResult(installOk),
            installOutcome: installOutcome(venv),
          };
        },
        seatSetup: (async (_ctx, dir, vp) => {
          captured.events.push("seat-setup");
          captured.seatSetupArgs = { projectDir: dir, venvPath: vp };
          return {
            kind: "success",
            providers: ["a", "b"],
            confirmed: 2,
            total: 18,
          } as SeatSetupOutcome;
        }) as typeof runCopilotSeatSetupWithProgress,
        showInfo: (m) => captured.infos.push(m),
        showWarning: (m) => captured.warnings.push(m),
      },
    };
  }

  test("copilot-cli: seat setup runs strictly AFTER the scaffold step, with the install's venvPath", async () => {
    const { captured, seams } = makeBuildSeams(true, venvPath);
    const result = await buildProjectStructureNoPrompt(
      fakeContext(),
      projectDir,
      "full",
      undefined,
      undefined,
      "copilot-cli",
      seams,
    );
    assert.ok(result);
    assert.deepStrictEqual(
      captured.events,
      ["git-init", "scaffold", "seat-setup"],
      "the refresh must never precede the completed scaffold sequence",
    );
    assert.deepStrictEqual(captured.seatSetupArgs, { projectDir, venvPath });
  });

  test("copilot-cli but the install failed: seat setup NEVER runs; honest skip warning", async () => {
    const { captured, seams } = makeBuildSeams(false, venvPath);
    await buildProjectStructureNoPrompt(
      fakeContext(),
      projectDir,
      "full",
      undefined,
      undefined,
      "copilot-cli",
      seams,
    );
    assert.ok(!captured.events.includes("seat-setup"));
    const skip = captured.warnings.find((w) =>
      w.includes("Copilot seat setup was skipped"),
    );
    assert.ok(skip, "the skip must be operator-visible, never silent");
    assert.ok(skip!.includes("--seat-id"), "carries the re-run hint");
  });

  test("copilot-cli but no venv materialized: seat setup NEVER runs; honest skip warning", async () => {
    const { captured, seams } = makeBuildSeams(true, null);
    await buildProjectStructureNoPrompt(
      fakeContext(),
      projectDir,
      "full",
      undefined,
      undefined,
      "copilot-cli",
      seams,
    );
    assert.ok(!captured.events.includes("seat-setup"));
    assert.ok(
      captured.warnings.some((w) => w.includes("Copilot seat setup was skipped")),
    );
  });

  test("api profile / no profile / lightweight: seat setup never runs and no seat warning fires", async () => {
    for (const [tier, profile] of [
      ["full", "api"],
      ["full", undefined],
      ["lightweight", undefined],
    ] as const) {
      const { captured, seams } = makeBuildSeams(true, venvPath);
      await buildProjectStructureNoPrompt(
        fakeContext(),
        projectDir,
        tier,
        undefined,
        undefined,
        profile,
        seams,
      );
      assert.ok(
        !captured.events.includes("seat-setup"),
        `seat setup must not run for tier=${tier} profile=${String(profile)}`,
      );
      assert.ok(
        !captured.warnings.some((w) => w.includes("Copilot seat setup")),
        "no seat-setup warning on the not-selected path",
      );
    }
  });
});
