import * as assert from "assert";
import {
  CancelLifecycleUi,
  runCancelSessionSetFlow,
  runRestoreSessionSetFlow,
} from "../../commands/cancelLifecycleCommands";
import { NewModuleUi, runNewModuleFlow } from "../../commands/newModule";
import {
  buildStartNextSessionPrompt,
  planSessionRunPrompt,
  sanitizeSlugForPrompt,
} from "../../commands/copyPromptCommands";
import { sessionNumberOf, specSectionTargetFor } from "../../commands/openFile";
import { asSessionNode, asSetNode } from "../../commands/workExplorerTreeCommands";
import { RunRouterCliDeps } from "../../utils/routerCli";
import { makeSession, makeSet, makeTempDir, rmrf, writeFileTree } from "./helpers";
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

suite("cancel/restore flows", () => {
  test("cancel runs the CLI and reports the audit file on success", async () => {
    const { ui, infos, errors } = cancelUi();
    const refreshed = await runCancelSessionSetFlow(makeSet(), ui, fakeCliDeps(0));
    assert.strictEqual(refreshed, true);
    assert.strictEqual(errors.length, 0);
    assert.ok(infos[0].includes("CANCELLED.md"));
  });

  test("dismissing the confirm aborts without running anything", async () => {
    const { ui } = cancelUi({ confirm: async () => undefined });
    const refreshed = await runCancelSessionSetFlow(makeSet(), ui, {
      spawn: (() => {
        throw new Error("must not spawn");
      }) as never,
    });
    assert.strictEqual(refreshed, false);
  });

  test("a CLI refusal surfaces as an error and does not refresh", async () => {
    const { ui, errors } = cancelUi();
    const refreshed = await runCancelSessionSetFlow(
      makeSet(),
      ui,
      fakeCliDeps(3, "a session is in flight"),
    );
    assert.strictEqual(refreshed, false);
    assert.ok(errors[0].includes("refused"));
  });

  test("restore reports the preserved history file", async () => {
    const { ui, infos } = cancelUi({ confirm: async () => "Restore" });
    const refreshed = await runRestoreSessionSetFlow(
      makeSet({ state: "cancelled" }),
      ui,
      fakeCliDeps(0),
    );
    assert.strictEqual(refreshed, true);
    assert.ok(infos[0].includes("RESTORED.md"));
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
    assert.ok(infos[0].includes("module: greeter"));
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
  test("the start prompt is the framework's set-scoped trigger phrase", () => {
    assert.strictEqual(
      buildStartNextSessionPrompt(makeSet({ name: "007-x" })),
      "Start the next session of `007-x`.",
    );
  });

  test("backticks in slugs are sanitized", () => {
    assert.strictEqual(sanitizeSlugForPrompt("a`b"), "a'b");
  });

  test("planSessionRunPrompt re-checks the gate on dispatch", () => {
    const runnable = makeSession({ number: 1, status: "not-started" });
    const set = makeSet({ state: "not-started", sessions: [runnable] });
    assert.ok(planSessionRunPrompt(set, runnable));
    const stale = makeSession({ number: 2, status: "not-started" });
    assert.strictEqual(planSessionRunPrompt(set, stale), null);
  });
});

suite("tree command argument narrowing", () => {
  test("asSetNode and asSessionNode fail closed on foreign arguments", () => {
    assert.strictEqual(asSetNode({ kind: "module" }), undefined);
    assert.strictEqual(asSetNode(null), undefined);
    assert.ok(asSetNode({ kind: "set", set: makeSet() }));
    assert.strictEqual(asSessionNode({ kind: "session", set: makeSet() }), undefined);
    assert.ok(asSessionNode({ kind: "session", set: makeSet(), session: makeSession() }));
  });

  test("sessionNumberOf accepts only positive-integer session nodes", () => {
    assert.strictEqual(sessionNumberOf({ kind: "session", session: { number: 2 } }), 2);
    assert.strictEqual(sessionNumberOf({ kind: "session", session: { number: "2" } }), undefined);
    assert.strictEqual(sessionNumberOf({ kind: "set" }), undefined);
  });

  test("specSectionTargetFor degrades to top-of-file on unreadable spec", () => {
    assert.strictEqual(specSectionTargetFor("D:\\nope\\spec.md", 1), undefined);
    assert.strictEqual(specSectionTargetFor(undefined, 1), undefined);
  });

  test("specSectionTargetFor finds the session block in a real file", () => {
    const dir = makeTempDir("dabbler-spec-");
    try {
      writeFileTree(dir, {
        "spec.md": "# t\n### Session 1 of 1: Only\n1. Do.\n",
      });
      const range = specSectionTargetFor(path.join(dir, "spec.md"), 1);
      assert.strictEqual(range?.startLine, 1);
    } finally {
      rmrf(dir);
    }
  });
});
