import * as assert from "assert";
import {
  CancellableSession,
  CancelLifecycleUi,
  runCancelSessionFlow,
  runRestoreSessionFlow,
} from "../../commands/cancelLifecycleCommands";
import { NewModuleUi, runNewModuleFlow } from "../../commands/newModule";
import {
  SetUpProjectUi,
  runSetUpProjectFlow,
} from "../../commands/bootstrapProject";
import {
  planRespecifyPrompt,
  planSendBackPrompt,
  planSessionRunPrompt,
} from "../../commands/copyPromptCommands";
import { cancellableSessionOf } from "../../commands/cancelLifecycleCommands";
import { START_NEXT_SESSION_PROMPT } from "../../providers/rowMenuHelpers";
import { sessionNumberOf, specSectionTargetFor } from "../../commands/openFile";
import {
  asRepositoryNode,
  asSessionNode,
} from "../../commands/workExplorerTreeCommands";
import {
  fakeRouter,
  makeRepository,
  makeSession,
  makeTempDir,
  makeVerification,
  rmrf,
  unusableRouter,
  writeFileTree,
} from "./helpers";
import * as path from "path";

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
    const refreshed = await runCancelSessionFlow(CANCELLABLE, ui, fakeRouter(0).router);
    assert.strictEqual(refreshed, true);
    assert.strictEqual(errors.length, 0);
    assert.ok(infos[0].includes("session 3"));
  });

  test("dismissing the confirm aborts without running anything", async () => {
    const { ui } = cancelUi({ confirm: async () => undefined });
    const refreshed = await runCancelSessionFlow(CANCELLABLE, ui, unusableRouter());
    assert.strictEqual(refreshed, false);
  });

  test("a CLI refusal surfaces as an error and does not refresh", async () => {
    const { ui, errors } = cancelUi();
    const refreshed = await runCancelSessionFlow(
      CANCELLABLE,
      ui,
      fakeRouter(3, "a session is in flight").router,
    );
    assert.strictEqual(refreshed, false);
    assert.ok(errors[0].includes("refused"));
  });

  test("restore names the session it returned", async () => {
    const { ui, infos } = cancelUi({ confirm: async () => "Restore" });
    const refreshed = await runRestoreSessionFlow(CANCELLABLE, ui, fakeRouter(0).router);
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
    const created = await runNewModuleFlow(ui, fakeRouter(0).router);
    assert.strictEqual(created, true);
    assert.ok(infos[0].includes("greeter"));
  });

  test("no workspace folder is an error, not a crash", async () => {
    const { ui, errors } = moduleUi([], undefined);
    assert.strictEqual(await runNewModuleFlow(ui, unusableRouter()), false);
    assert.ok(errors[0].includes("workspace"));
  });

  test("cancelling either input aborts silently", async () => {
    const { ui, errors } = moduleUi([undefined], "D:\\ws");
    assert.strictEqual(await runNewModuleFlow(ui, unusableRouter()), false);
    assert.strictEqual(errors.length, 0);
  });

  test("a duplicate-slug refusal from the CLI surfaces as an error", async () => {
    const { ui, errors } = moduleUi(["dupe", ""], "D:\\ws");
    assert.strictEqual(
      await runNewModuleFlow(ui, fakeRouter(1, 'module "dupe" already exists').router),
      false,
    );
    assert.ok(errors[0].includes("dupe"));
  });
});

suite("set up new project", () => {
  function setUpUi(
    root: string | undefined,
    options: {
      choose?: string;
      initFails?: string;
      noGit?: boolean;
      newFolder?: string;
      offerFolder?: boolean;
    } = {},
  ): {
    ui: SetUpProjectUi;
    errors: string[];
    infos: string[];
    offers: string[];
    ran: string[];
    inits: number;
  } {
    const errors: string[] = [];
    const infos: string[] = [];
    const offers: string[] = [];
    const ran: string[] = [];
    let inits = 0;
    const ui: SetUpProjectUi = {
      showInformationMessage: (m: string) => infos.push(m),
      showErrorMessage: (m: string) => errors.push(m),
      offer: (message: string) => {
        offers.push(message);
        return Promise.resolve(options.choose);
      },
      workspaceRoot: () => root,
      startSession: (root: string) => {
        ran.push(root);
        return Promise.resolve(undefined);
      },
    };
    if (options.newFolder !== undefined || options.offerFolder) {
      ui.chooseNewProjectFolder = () => Promise.resolve(options.newFolder);
    }
    if (!options.noGit) {
      ui.initRepository = () => {
        inits += 1;
        return Promise.resolve(options.initFails ?? "");
      };
    }
    return {
      ui,
      errors,
      infos,
      offers,
      ran,
      get inits() {
        return inits;
      },
    };
  }

  test("offers to start session 1 rather than naming a command to type", async () => {
    // Survey finding F1: the flow used to end with "Open a terminal and run
    // `dabbler session start`" -- the framework naming a command it can run,
    // about a project it had just finished preparing.
    const { ui, offers, ran } = setUpUi("D:\\ws");
    assert.strictEqual(await runSetUpProjectFlow(ui, fakeRouter(0).router), true);
    assert.strictEqual(offers.length, 1);
    assert.ok(!offers[0].includes("terminal"));
    assert.strictEqual(ran.length, 0);
  });

  test("starts the session in the project it prepared", async () => {
    // Dispatching the tree command instead sent no repository argument, and
    // that handler reads its repository off the argument — so the offered
    // start reached nothing at all.
    const { ui, ran } = setUpUi("D:\\ws", { choose: "Start session 1" });
    await runSetUpProjectFlow(ui, fakeRouter(0).router);
    assert.deepStrictEqual(ran, ["D:\\ws"]);
  });

  test("creates the project when VS Code has no folder open at all", async () => {
    // The one onboarding path this command exists for, and the one it used
    // to refuse outright.
    const { ui } = setUpUi(undefined, { newFolder: "D:\\fresh" });
    assert.strictEqual(await runSetUpProjectFlow(ui, fakeRouter(0).router), true);
  });

  test("cancelling the folder question cancels the command", async () => {
    const { ui, errors } = setUpUi(undefined, { offerFolder: true });
    assert.strictEqual(await runSetUpProjectFlow(ui, unusableRouter()), false);
    assert.strictEqual(errors.length, 0);
  });

  test("initialises a repository when bootstrap refuses for want of one", async () => {
    // `bootstrap` refuses a directory that is not a git repository. That is
    // a thing the framework can fix, so it fixes it and retries once.
    const fake = fakeRouter(3, "not a git repository");
    const { ui } = setUpUi("D:\\ws");
    await runSetUpProjectFlow(ui, fake.router);
    // Two bootstraps: the refusal, then the retry after `git init`.
    assert.strictEqual(
      fake.asked.filter((verb) => verb === "bootstrap").length,
      2,
    );
  });

  test("says why it could not initialise, rather than retrying blindly", async () => {
    const { ui, errors } = setUpUi("D:\\ws", { initFails: "no git extension" });
    assert.strictEqual(
      await runSetUpProjectFlow(ui, fakeRouter(3, "not a git repository").router),
      false,
    );
    assert.ok(errors[0].includes("no git extension"));
  });

  test("no workspace folder is an error, and nothing is asked of the router", async () => {
    const { ui, errors } = setUpUi(undefined);
    assert.strictEqual(await runSetUpProjectFlow(ui, unusableRouter()), false);
    assert.ok(errors[0].includes("Open the project folder"));
  });

  test("a refusal that an init cannot fix is shown, not swallowed", async () => {
    const { ui, errors } = setUpUi("D:\\ws", { noGit: true });
    assert.strictEqual(
      await runSetUpProjectFlow(ui, fakeRouter(3, "not a directory").router),
      false,
    );
    assert.ok(errors[0].includes("not a directory"));
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
    assert.ok(unresolved!.text.includes("dabbler verify"));
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
    assert.ok(remediated!.text.includes("dabbler session start --engine"));
    assert.ok(remediated!.text.includes("dabbler session declare --task"));

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
      'dabbler session cancel 19 --reason "respecified as session 21" --force',
    );
    const blockAt = unresolved.text.indexOf("### Session 21 of 21");
    // The plan is named by the scan's own path for it, relative to the
    // root, not by a filename typed into the prompt.
    assert.ok(unresolved.text.includes("in docs/sessions/session-plan.md"), unresolved.text);
    const startAt = unresolved.text.indexOf(
      "dabbler session start --engine claude-code --provider anthropic",
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
    assert.ok(landed.text.includes("(2) dabbler session start"));
  });
});
