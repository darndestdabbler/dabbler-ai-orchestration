import * as assert from "assert";
import {
  CancellableSession,
  CancelLifecycleUi,
  runCancelSessionFlow,
  runRestoreSessionFlow,
} from "../../commands/cancelLifecycleCommands";
import { NewModuleUi, runNewModuleFlow } from "../../commands/newModule";
import {
  planRespecifyPrompt,
  planSendBackPrompt,
  planSessionRunPrompt,
} from "../../commands/copyPromptCommands";
import { cancellableSessionOf } from "../../commands/cancelLifecycleCommands";
import { cancelArgs } from "../../utils/sessionLifecycleCli";
import { START_NEXT_SESSION_PROMPT } from "../../providers/rowMenuHelpers";
import { sessionNumberOf, specSectionTargetFor } from "../../commands/openFile";
import {
  asRepositoryNode,
  asSessionNode,
} from "../../commands/workExplorerTreeCommands";
import { RunRouterCliDeps } from "../../utils/routerCli";
import {
  makeRepository,
  makeSession,
  makeTempDir,
  makeVerification,
  rmrf,
  writeFileTree,
} from "./helpers";
import * as path from "path";

/** A RunRouterCliDeps whose spawn immediately exits with the given code. */
function fakeCliDeps(exitCode: number, stderr = ""): RunRouterCliDeps {
  return {
    echo: { append: () => {}, reveal: () => {} },
    resolveInterpreter: () => "python",
    interpreterExists: () => true,
    spawn: ((/* cmd, args, opts */) => {
      const listeners = new Map<string, (arg?: unknown) => void>();
      const mkStream = (payload: string) => ({
        on: (event: string, cb: (chunk: Buffer) => void) => {
          if (event === "data" && payload) cb(Buffer.from(payload));
        },
      });
      const child = {
        stdout: mkStream(exitCode === 0 ? '{"status":"ok"}' : ""),
        stderr: mkStream(stderr),
        on: (event: string, cb: (arg?: unknown) => void) => {
          listeners.set(event, cb);
          if (event === "close") queueMicrotask(() => cb(exitCode));
          return child;
        },
      };
      return child;
    }) as unknown as RunRouterCliDeps["spawn"],
  };
}

function cancelUi(overrides: Partial<CancelLifecycleUi> = {}): {
  ui: CancelLifecycleUi;
  errors: string[];
  infos: string[];
} {
  const errors: string[] = [];
  const infos: string[] = [];
  const ui: CancelLifecycleUi = {
    confirm: async (_s, _d, affirmative) => affirmative,
    promptReason: async () => "because",
    showInformationMessage: (m: string) => infos.push(m),
    showErrorMessage: (m: string) => errors.push(m),
    ...overrides,
  };
  return { ui, errors, infos };
}

const CANCELLABLE: CancellableSession = {
  root: "D:\\ws",
  number: 3,
  name: "Third things",
};

suite("cancel/restore flows", () => {
  test("cancel runs the CLI and names the session on success", async () => {
    const { ui, infos, errors } = cancelUi();
    const refreshed = await runCancelSessionFlow(
      CANCELLABLE,
      ui,
      fakeCliDeps(0),
    );
    assert.strictEqual(refreshed, true);
    assert.strictEqual(errors.length, 0);
    assert.ok(infos[0].includes("session 3"));
  });

  test("dismissing the confirm aborts without running anything", async () => {
    const { ui } = cancelUi({ confirm: async () => undefined });
    const refreshed = await runCancelSessionFlow(CANCELLABLE, ui, {
      spawn: (() => {
        throw new Error("must not spawn");
      }) as never,
    });
    assert.strictEqual(refreshed, false);
  });

  test("a CLI refusal surfaces as an error and does not refresh", async () => {
    const { ui, errors } = cancelUi();
    const refreshed = await runCancelSessionFlow(
      CANCELLABLE,
      ui,
      fakeCliDeps(3, "a session is in flight"),
    );
    assert.strictEqual(refreshed, false);
    assert.ok(errors[0].includes("refused"));
  });

  test("restore names the session it returned", async () => {
    const { ui, infos } = cancelUi({ confirm: async () => "Restore" });
    const refreshed = await runRestoreSessionFlow(
      CANCELLABLE,
      ui,
      fakeCliDeps(0),
    );
    assert.strictEqual(refreshed, true);
    assert.ok(infos[0].includes("session 3"));
  });
});

suite("new module flow", () => {
  function moduleUi(
    answers: Array<string | undefined>,
    root: string | undefined,
  ): { ui: NewModuleUi; errors: string[]; infos: string[] } {
    const errors: string[] = [];
    const infos: string[] = [];
    let call = 0;
    return {
      ui: {
        showInputBox: (async () => answers[call++]) as NewModuleUi["showInputBox"],
        showInformationMessage: (m: string) => infos.push(m),
        showErrorMessage: (m: string) => errors.push(m),
        workspaceRoot: () => root,
      },
      errors,
      infos,
    };
  }

  test("creates the module and tells the operator how to use it", async () => {
    const { ui, infos } = moduleUi(["greeter", "Greeter"], "D:\\ws");
    const created = await runNewModuleFlow(ui, fakeCliDeps(0));
    assert.strictEqual(created, true);
    assert.ok(infos[0].includes("greeter"));
  });

  test("no workspace folder is an error, not a crash", async () => {
    const { ui, errors } = moduleUi([], undefined);
    assert.strictEqual(await runNewModuleFlow(ui, fakeCliDeps(0)), false);
    assert.ok(errors[0].includes("workspace"));
  });

  test("cancelling either input aborts silently", async () => {
    const { ui, errors } = moduleUi([undefined], "D:\\ws");
    assert.strictEqual(await runNewModuleFlow(ui, fakeCliDeps(0)), false);
    assert.strictEqual(errors.length, 0);
  });

  test("a duplicate-slug refusal from the CLI surfaces as an error", async () => {
    const { ui, errors } = moduleUi(["dupe", ""], "D:\\ws");
    assert.strictEqual(
      await runNewModuleFlow(ui, fakeCliDeps(1, 'module "dupe" already exists')),
      false,
    );
    assert.ok(errors[0].includes("dupe"));
  });
});

suite("copy prompts", () => {
  test("the start prompt is the framework's trigger phrase, naming no repository", () => {
    assert.strictEqual(START_NEXT_SESSION_PROMPT, "Start the next session.");
  });

  test("planSessionRunPrompt re-checks the gate on dispatch", () => {
    const runnable = makeSession({ number: 1, status: "not-started" });
    const stale = makeSession({ number: 2, status: "not-started" });
    const repository = makeRepository({ sessions: [runnable, stale] });
    assert.ok(planSessionRunPrompt(repository, runnable));
    assert.strictEqual(planSessionRunPrompt(repository, stale), null);
  });
});

suite("tree command argument narrowing", () => {
  test("the two narrowings fail closed on foreign arguments", () => {
    const repository = makeRepository();
    assert.strictEqual(asRepositoryNode({ kind: "session" }), undefined);
    assert.strictEqual(asRepositoryNode(null), undefined);
    assert.ok(asRepositoryNode({ kind: "repository", repository }));
    assert.strictEqual(asSessionNode({ kind: "session", repository }), undefined);
    assert.ok(
      asSessionNode({ kind: "session", repository, session: makeSession() }),
    );
  });

  test("cancellableSessionOf reads the spawn root and number off the row", () => {
    const repository = makeRepository({ root: "D:/ws" });
    const session = makeSession({ number: 3, title: "Third things" });
    const target = cancellableSessionOf({ kind: "session", repository, session });
    assert.strictEqual(target?.root, "D:/ws");
    assert.strictEqual(target?.number, 3);
    assert.ok(target?.name.startsWith("003 "));
    assert.strictEqual(cancellableSessionOf({ kind: "repository", repository }), undefined);
  });

  test("sessionNumberOf accepts only positive-integer session nodes", () => {
    assert.strictEqual(sessionNumberOf({ kind: "session", session: { number: 2 } }), 2);
    assert.strictEqual(sessionNumberOf({ kind: "session", session: { number: "2" } }), undefined);
    assert.strictEqual(sessionNumberOf({ kind: "repository" }), undefined);
  });

  test("specSectionTargetFor degrades to top-of-file on an unreadable plan", () => {
    assert.strictEqual(specSectionTargetFor("D:\\nope\\session-plan.md", 1), undefined);
    assert.strictEqual(specSectionTargetFor(undefined, 1), undefined);
  });

  test("specSectionTargetFor finds the session block in a real file", () => {
    const dir = makeTempDir("dabbler-plan-");
    try {
      writeFileTree(dir, {
        "session-plan.md": "# t\n### Session 1 of 1: Only\n1. Do.\n",
      });
      const range = specSectionTargetFor(path.join(dir, "session-plan.md"), 1);
      assert.strictEqual(range?.startLine, 1);
    } finally {
      rmrf(dir);
    }
  });
});

suite("commandFlows: the three planning-time actions", () => {
  const nodeFor = (session: ReturnType<typeof makeSession>) => ({
    kind: "session" as const,
    repository: makeRepository({ sessions: [session] }),
    session,
  });

  test("cancel passes --force only for a session in flight and unresolved at the cap", () => {
    // The CLI refuses an in-flight cancel without --force, and that
    // refusal is right for live work. An unresolved session cannot close,
    // so for it cancel is the sanctioned exit; the flag rides on the
    // record's terminal state, never on a prompt to the operator.
    const unresolved = cancellableSessionOf(
      nodeFor(makeSession({ number: 3, status: "in-progress", verification: makeVerification() })),
    );
    assert.strictEqual(unresolved?.force, true);
    const landed = cancellableSessionOf(
      nodeFor(
        makeSession({
          number: 3,
          status: "complete",
          verification: makeVerification({ terminal: "REMEDIATED_AT_CAP" }),
        }),
      ),
    );
    assert.strictEqual(landed?.force, false);
    const live = cancellableSessionOf(nodeFor(makeSession({ number: 3, status: "in-progress" })));
    assert.strictEqual(live?.force, false);

    assert.deepStrictEqual(cancelArgs(3, "r"), ["cancel", "3", "--reason", "r"]);
    assert.deepStrictEqual(cancelArgs(3, "r", true), ["cancel", "3", "--reason", "r", "--force"]);
  });

  test("the send-back prompt names the record by path and reads differently per terminal state", () => {
    const repository = makeRepository();
    const unresolved = planSendBackPrompt(
      repository,
      makeSession({ number: 3, verification: makeVerification() }),
    );
    assert.ok(unresolved);
    assert.ok(unresolved!.text.includes(".dabbler/runs/s3/rounds.jsonl"));
    assert.ok(unresolved!.text.includes("unresolved at the cap"));
    assert.ok(unresolved!.text.includes("ai_router.verify"));
    // Never the finding text itself: the engine reads the record.
    assert.ok(!unresolved!.text.includes("suite command is guessed"));

    const remediated = planSendBackPrompt(
      repository,
      makeSession({
        number: 3,
        verification: makeVerification({
          terminal: "REMEDIATED_AT_CAP",
          headline: "remediated at the cap",
          fixPaths: ["ai_router/affected.py"],
        }),
      }),
    );
    assert.ok(remediated!.text.includes("no verifier reviewed it"));
    // No command re-opens review on a closed session; the prompt says so
    // and hands the engine the next session's start and declare.
    assert.ok(remediated!.text.includes("No command re-opens review"));
    assert.ok(remediated!.text.includes("python -m ai_router.session start --engine"));
    assert.ok(remediated!.text.includes("python -m ai_router.session declare --task"));

    const verified = planSendBackPrompt(
      repository,
      makeSession({
        number: 3,
        verification: makeVerification({ terminal: "VERIFIED", headline: "verified", clean: true }),
      }),
    );
    assert.strictEqual(verified, null);
  });

  test("the respecify prompt hands the engine cancel, the new plan block, and start — in that order", () => {
    const repository = makeRepository({
      totalSessions: 20,
      orchestrator: { engine: "claude-code", provider: "anthropic" },
    });
    const unresolved = planRespecifyPrompt(
      repository,
      makeSession({ number: 19, status: "in-progress", verification: makeVerification() }),
    )!;
    const cancelAt = unresolved.text.indexOf(
      'python -m ai_router.session cancel 19 --reason "respecified as session 21" --force',
    );
    const blockAt = unresolved.text.indexOf("### Session 21 of 21");
    // The plan is named by the scan's own path for it, relative to the
    // root, not by a filename typed into the prompt.
    assert.ok(unresolved.text.includes("in docs/sessions/session-plan.md"), unresolved.text);
    const startAt = unresolved.text.indexOf(
      "python -m ai_router.session start --engine claude-code --provider anthropic",
    );
    assert.ok(cancelAt >= 0 && blockAt > cancelAt && startAt > blockAt, unresolved.text);
    assert.ok(unresolved.toast.includes("session 21"));

    // A session already closed at the cap needs no cancel: two steps.
    const landed = planRespecifyPrompt(
      repository,
      makeSession({
        number: 17,
        status: "complete",
        verification: makeVerification({ terminal: "REMEDIATED_AT_CAP", headline: "remediated at the cap" }),
      }),
    )!;
    assert.ok(!landed.text.includes("session cancel"));
    assert.ok(landed.text.includes("(2) python -m ai_router.session start"));
  });
});
