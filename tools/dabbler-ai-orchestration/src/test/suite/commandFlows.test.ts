import * as assert from "assert";
import * as vscode from "vscode";
import {
  CancellableSession,
  CancelLifecycleUi,
  runCancelSessionFlow,
  runRestoreSessionFlow,
} from "../../commands/cancelLifecycleCommands";
import {
  cloneRepository,
  createRepository,
  identifyRemote,
  locateRepository,
} from "../../commands/openRepository";
import type { Projection } from "../../providers/solutionTreeModel";
import {
  SetUpProjectUi,
  offerDeferredStart,
  runSetUpProjectFlow,
} from "../../commands/bootstrapProject";
import {
  ENGINES,
  type EngineTerminal,
  type SessionRegistrar,
  type SessionRunUi,
  closeLoopOnSessionEnd,
  defaultSessionRunUi,
  engineTerminalFor,
  isEngineTerminalOf,
  loopTerminalFor,
  repositoryOf,
  runConsultWithAi,
  runResumeSession,
  runStartSession,
} from "../../commands/sessionCommands";
import { ROUTER_VERSION } from "dabbler-ai-router";
import { prerequisiteReport, type ToolProbe } from "../../commands/troubleshoot";
import {
  refreshRecord,
  storeCredential,
  setAsMyDefault,
  setRelease,
  setReviewerTransport,
  setRoleModel,
  type ConfigurationUi,
} from "../../commands/configurationCommands";
import type { ConfigurationModel } from "../../providers/solutionTreeModel";
import { openDabblerTerminal } from "../../router/dabblerTerminal";
import { cancellableSessionOf } from "../../commands/cancelLifecycleCommands";
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

suite("set up new project", () => {
  function setUpUi(
    root: string | undefined,
    options: {
      choose?: string;
      initFails?: string;
      noGit?: boolean;
      newFolder?: string;
      offerFolder?: boolean;
      remote?: string;
    } = {},
  ): {
    ui: SetUpProjectUi;
    errors: string[];
    infos: string[];
    offers: string[];
    ran: string[];
    opened: string[];
    remembered: string[];
    inits: number;
  } {
    const errors: string[] = [];
    const infos: string[] = [];
    const offers: string[] = [];
    const ran: string[] = [];
    const opened: string[] = [];
    const remembered: string[] = [];
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
      openFolder: (root: string) => {
        opened.push(root);
        return Promise.resolve(undefined);
      },
      rememberPendingStart: (root: string) => {
        remembered.push(root);
        return Promise.resolve();
      },
    };
    if (options.newFolder !== undefined || options.offerFolder) {
      ui.chooseNewProjectFolder = () => Promise.resolve(options.newFolder);
    }
    // Skipping is the default here, because skipping is a real answer: a
    // flow that only works when a remote is given would be a required step
    // wearing an optional one's clothes.
    ui.askRemote = () => Promise.resolve(options.remote);
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
      opened,
      remembered,
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

  test("creates the project when VS Code has no folder open at all, and hands bootstrap the remote it asked for", async () => {
    // The one onboarding path this command exists for, and the one it used
    // to refuse outright. The remote is the one parameter the framework
    // cannot determine, and set-up never asked for it: the close pushes and
    // a focused checkout is cloned from the origin, so a project without
    // one cannot close its first session.
    const { ui } = setUpUi(undefined, {
      newFolder: "D:\\fresh",
      remote: "https://example.invalid/p.git",
    });
    const asked = fakeRouter(0);
    assert.strictEqual(await runSetUpProjectFlow(ui, asked.router), true);
    assert.strictEqual(asked.bootstrapOptions[0].remote, "https://example.invalid/p.git");

    // And skipping is a real answer: nothing is passed, and nothing refuses.
    const skipped = setUpUi(undefined, { newFolder: "D:\\fresh" });
    const second = fakeRouter(0);
    assert.strictEqual(await runSetUpProjectFlow(skipped.ui, second.router), true);
    assert.strictEqual(second.bootstrapOptions[0].remote, undefined);
  });

  test("opens a folder it created before offering anything about it", async () => {
    // `openFolder` replaces the window and restarts the extension host. An
    // offer made first appears over a project the operator cannot see, in a
    // window about to be discarded, and the session start it triggers races
    // the reload.
    const { ui, opened, offers, ran, remembered } = setUpUi(undefined, {
      newFolder: "D:\\fresh",
      choose: "Start session 1",
    });
    assert.strictEqual(await runSetUpProjectFlow(ui, fakeRouter(0).router), true);
    assert.deepStrictEqual(opened, ["D:\\fresh"]);
    // Neither happened here, because neither could be acted on here.
    assert.strictEqual(offers.length, 0);
    assert.strictEqual(ran.length, 0);
    // The offer is owed to the window that survives.
    assert.deepStrictEqual(remembered, ["D:\\fresh"]);
  });

  test("still offers in place when the folder was already open", async () => {
    // No window replacement, nothing to defer: the ordinary path is
    // unchanged, and the offer happens where the operator is looking.
    const { ui, opened, offers, remembered } = setUpUi("D:\\ws");
    await runSetUpProjectFlow(ui, fakeRouter(0).router);
    assert.strictEqual(opened.length, 0);
    assert.strictEqual(offers.length, 1);
    assert.strictEqual(remembered.length, 0);
  });

  test("makes the deferred offer once, in the window that opened", async () => {
    let stored: string | undefined = "D:\\fresh";
    const offers: string[] = [];
    const ran: string[] = [];
    const pending = {
      get: () => stored,
      set: (root: string) => {
        stored = root;
        return Promise.resolve();
      },
      clear: () => {
        stored = undefined;
        return Promise.resolve();
      },
    };
    const ui = {
      offer: (message: string) => {
        offers.push(message);
        return Promise.resolve("Start session 1");
      },
      startSession: (root: string) => {
        ran.push(root);
        return Promise.resolve(undefined);
      },
    };
    assert.strictEqual(await offerDeferredStart("D:\\fresh", pending, ui), true);
    assert.deepStrictEqual(ran, ["D:\\fresh"]);
    // Cleared before the offer, so a window closed on the question does not
    // ask it again on the next launch.
    assert.strictEqual(stored, undefined);
    assert.strictEqual(await offerDeferredStart("D:\\fresh", pending, ui), false);
  });

  test("does not make it in a window that is a different project", async () => {
    // The flag names the project it was recorded for; opening something else
    // in the meantime is not consent to start a session in it.
    const offers: string[] = [];
    const pending = {
      get: () => "D:\\fresh",
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const acted = await offerDeferredStart("D:\\somewhere-else", pending, {
      offer: (message: string) => {
        offers.push(message);
        return Promise.resolve(undefined);
      },
    });
    assert.strictEqual(acted, false);
    assert.strictEqual(offers.length, 0);
  });

  test("names no transport, because setting up one project is not a statement about how it routes", async () => {
    // `bootstrap` used to persist DABBLER_TRANSPORT at USER scope, which is
    // a side effect somebody finds weeks later debugging a different repo --
    // and that variable outranks every config layer, so it also shadowed
    // whatever a later `dabbler configure` set. The click contributes no
    // answer at all now; the project's own configuration decides.
    const fake = fakeRouter(0);
    const { ui } = setUpUi("D:\\ws");
    await runSetUpProjectFlow(ui, fake.router);
    assert.strictEqual(fake.bootstrapOptions[0]?.transport, undefined);
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

// --- Start, Resume and Consult open the engine's own CLI ------------------

function driveUi(overrides: Partial<SessionRunUi> = {}): {
  ui: SessionRunUi;
  errors: string[];
  infos: string[];
  /** Every terminal the UI was asked to open. */
  terminals: EngineTerminal[];
} {
  const errors: string[] = [];
  const infos: string[] = [];
  const terminals: EngineTerminal[] = [];
  const ui: SessionRunUi = {
    // Answers "it did not refuse" unless a test says otherwise. A suite that
    // let this reach the real `claude` would spawn the developer's own CLI
    // on every flow test -- passing here and meaning nothing anywhere else.
    engineKnowsModel: async () => null,
    closeEngineTerminals: () => undefined,
    pickEngine: async () => ENGINES[0],
    askModel: async () => "haiku",
    confirm: async () => false,
    choose: async () => undefined,
    report: () => undefined,
    showErrorMessage: (m: string) => errors.push(m),
    showInformationMessage: (m: string) => infos.push(m),
    openTerminal: (terminal) => {
      terminals.push(terminal);
      return undefined;
    },
    openLoopTerminal: (_repository, terminal) => {
      terminals.push(terminal);
      return undefined;
    },
    showFrameworkTerminal: () => undefined,
    withProgress: (_title, work) => work(),
    ...overrides,
  };
  return { ui, errors, infos, terminals };
}

/** A registrar that answers `code` and records what it was asked to register. */
function registrarOf(code: number | null = 0, output = ""): SessionRegistrar & { calls: string[][] } {
  const calls: string[][] = [];
  const register = (async (_root: string, args: readonly string[]) => {
    calls.push([...args]);
    return { code, output };
  }) as SessionRegistrar & { calls: string[][] };
  register.calls = calls;
  return register;
}

const CLI = "D:\\ext\\dabbler.cjs";

/** What the stub records of one `window.createTerminal` call. */
interface FakeTerminal {
  options: {
    name: string;
    cwd: string;
    shellPath: string;
    shellArgs: string[];
    env?: Record<string, string>;
    location?: { parentTerminal?: unknown };
    pty?: unknown;
  };
  shown: number;
  disposed: number;
  sent: Array<{ text: string; addNewLine: boolean }>;
  preserveFocus?: boolean;
  dispose: () => void;
}

suite("Start opens the person's own CLI", () => {
  const settings = vscode.workspace as unknown as {
    __setConfig: (section: string, key: string, value: unknown) => void;
    __clearConfig: () => void;
  };

  teardown(() => {
    settings.__clearConfig();
  });

  test("a model the engine's own list does not name stops the launch, before anything opens", async () => {
    // Round 2's blocking finding, and the reason it is asserted at the FLOW
    // rather than only at the helper: a check that is written and not wired
    // is the shape this whole session exists to delete. The repository's own
    // Start must open no terminal.
    //
    // The catalog this suite runs against is a throwaway with no block in
    // it, so the engine's list is EMPTY here and nothing may be refused --
    // which is the other half of the rule, and is why the refusal is driven
    // through a stubbed reading rather than through an absent one.
    // Driven through the CLI's OWN answer rather than through a catalog:
    // that is the half round 1's fix did not reach, and the half that
    // matters, because Claude Code validates against its own bundled
    // catalog and a list this machine read cannot stand in for it.
    const root = makeTempDir("launch-refusal-");
    const repository = makeRepository({ root });
    const row = driveUi({
      askModel: async () => "a-model-nothing-lists",
      engineKnowsModel: async (_choice, model) => model,
    });
    try {
      const refusedBeforeRegistering = registrarOf();
      assert.strictEqual(await runStartSession(repository, row.ui, refusedBeforeRegistering, CLI), false);
      // Nothing registered, nothing opened, and the operator was told why.
      assert.deepStrictEqual(refusedBeforeRegistering.calls, []);
      assert.deepStrictEqual(row.terminals, []);
      assert.ok(
        row.errors.some((line) => line.includes("a-model-nothing-lists")),
        row.errors.join(" | "),
      );

      // And a CLI that says nothing does not stop anybody: "it did not
      // refuse" covers no CLI, no answer and an engine with no pre-flight,
      // and none of those may stand between an operator and their work.
      const silent = driveUi({ askModel: async () => "a-model-nothing-lists" });
      assert.strictEqual(await runStartSession(makeRepository({ root }), silent.ui, registrarOf(), CLI), true);
      // The framework's loop and the engine's CLI.
      assert.strictEqual(silent.terminals.length, 2);
    } finally {
      rmrf(root);
    }
  });

  test("the chosen model reaches both engines' argv, and an empty one adds no flag", () => {
    // The defect this replaces: `args` was `carriesPrompt ? [sentence] : []`,
    // so the model an operator typed reached `dabbler session start` -- which
    // records identity -- and never reached the CLI at all. The router's own
    // unattended `engineShape` has always passed it; only the launch a person
    // presses did not.
    const repository = makeRepository();
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;

    const claude = engineTerminalFor(repository, ENGINES[0], "claude-opus-5");
    assert.notStrictEqual(typeof claude, "string");
    const claudeArgs = (claude as EngineTerminal).args;
    // The flag FIRST: `claude`'s prompt is a positional, so anything after it
    // is read as part of the prompt.
    assert.deepStrictEqual(claudeArgs.slice(0, 2), ["--model", "claude-opus-5"]);
    assert.strictEqual(claudeArgs.length, 3);
    assert.match(claudeArgs[2], /dabbler session wait/);

    const seat = engineTerminalFor(repository, copilot, "gpt-5-6-luna");
    assert.deepStrictEqual((seat as EngineTerminal).args.slice(0, 3), ["--model", "gpt-5-6-luna", "-i"]);

    // Empty means the engine's own default, and a flag with nothing after it
    // is a launch that fails in front of the person.
    const bare = engineTerminalFor(repository, ENGINES[0], "");
    assert.strictEqual((bare as EngineTerminal).args.length, 1);
    assert.match((bare as EngineTerminal).args[0], /dabbler session wait/);
  });

  test("the terminal an AI's CLI runs in says it is one, and the loop's does not", () => {
    // The router tells an engine from a person by what the calling shell
    // carries. A vendor's own marker is a reading of one version, and an
    // engine nobody measured has none, so the terminal says it for all of
    // them -- and the framework's own loop, which no AI types into, does not.
    const repository = makeRepository();
    for (const choice of ENGINES) {
      const terminal = engineTerminalFor(repository, choice, choice.modelRequired ? "gpt-5-6-luna" : "");
      assert.notStrictEqual(typeof terminal, "string", choice.engine);
      assert.strictEqual((terminal as EngineTerminal).env?.["DABBLER_ENGINE_TERMINAL"], "1", choice.engine);
    }
    assert.strictEqual(
      loopTerminalFor(repository, "dist/dabbler.cjs").env?.["DABBLER_ENGINE_TERMINAL"],
      undefined,
    );
  });

  test("asks before a start merges origin's unrelated work, and starts with the merge only on yes", async () => {
    const refusal =
      "start: refused -- origin/main shares no history with this checkout and holds 2 file(s) it has never had: " +
      "src/app.ts, README.md. ... run the same start with --merge-origin.";
    const register = (async (_root: string, args: readonly string[]) => {
      register.calls.push([...args]);
      return args.includes("--merge-origin") ? { code: 0, output: "" } : { code: 3, output: refusal };
    }) as SessionRegistrar & { calls: string[][] };
    register.calls = [];

    const asked: string[] = [];
    const declined = driveUi({ confirm: async (message) => { asked.push(message); return false; } });
    assert.strictEqual(await runStartSession(makeRepository(), declined.ui, register, CLI), false);
    assert.match(asked[0], /src\/app\.ts/);
    assert.strictEqual(register.calls.length, 1);
    assert.strictEqual(declined.terminals.length, 0);

    const agreed = driveUi({ confirm: async () => true });
    assert.strictEqual(await runStartSession(makeRepository(), agreed.ui, register, CLI), true);
    assert.deepStrictEqual(register.calls[2].slice(-1), ["--merge-origin"]);
    assert.strictEqual(agreed.terminals.length, 2);
  });

  test("asks what to do with uncommitted changes, and starts with the flag for the answer chosen", async () => {
    const refusal =
      "start: refused -- You can't start a session while there are new or changed files that haven't been " +
      "committed: docs/sessions/session-plan.md. Next: commit them, or undo the changes.\n" +
      "start: next -- run the same start with --commit-changes to commit and push them, or with --undo-changes to undo them.";
    const register = (async (_root: string, args: readonly string[]) => {
      register.calls.push([...args]);
      return args.some((arg) => arg.endsWith("-changes")) ? { code: 0, output: "" } : { code: 2, output: refusal };
    }) as SessionRegistrar & { calls: string[][] };
    register.calls = [];

    const asked: string[] = [];
    const cancelled = driveUi({ choose: async (message) => { asked.push(message); return undefined; } });
    assert.strictEqual(await runStartSession(makeRepository(), cancelled.ui, register, CLI), false);
    assert.match(asked[0], /session-plan\.md/);
    assert.deepStrictEqual(register.calls.length, 1);
    assert.strictEqual(cancelled.terminals.length, 0);

    for (const [answer, flag] of [["Commit and Push", "--commit-changes"], ["Undo the Changes", "--undo-changes"]]) {
      register.calls = [];
      const chosen = driveUi({ choose: async () => answer });
      assert.strictEqual(await runStartSession(makeRepository(), chosen.ui, register, CLI), true);
      assert.deepStrictEqual(register.calls[1].slice(-1), [flag]);
      assert.strictEqual(chosen.terminals.length, 2);
    }
  });

  test("Consult with AI opens the chosen CLI with the chosen model and the consult sentence, and registers nothing", async () => {
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const asked: string[] = [];
    const run = driveUi({
      pickEngine: async (purpose) => { asked.push(String(purpose)); return copilot; },
      askModel: async () => "gpt-5-6-luna",
    });
    assert.strictEqual(await runConsultWithAi(makeRepository(), run.ui, 7), true);
    assert.deepStrictEqual(asked, ["Consult with AI"]);
    // One terminal: the CLI. No loop terminal, and no registrar exists to call.
    assert.strictEqual(run.terminals.length, 1);
    const [cli] = run.terminals;
    assert.strictEqual(cli.program, "copilot");
    assert.match(cli.name, /^Consult/);
    assert.deepStrictEqual(cli.args.slice(0, 3), ["--model", "gpt-5-6-luna", "-i"]);
    assert.match(cli.args[3], /dabbler consult --sessions-dir docs\/sessions --session 7/);
    assert.doesNotMatch(cli.args[3], /session wait/);

    // A model the installed CLI refuses is refused here as at Start: nothing opens.
    const refused = driveUi({ engineKnowsModel: async (_choice, model) => model });
    assert.strictEqual(await runConsultWithAi(makeRepository(), refused.ui), false);
    assert.strictEqual(refused.errors.length, 1);
    assert.match(refused.errors[0], /does not know 'haiku'/);
    assert.strictEqual(refused.terminals.length, 0);
  });

  test("passes a dated model id exactly as it was chosen", () => {
    // `normalizeModelToken` drops the date suffix, and the date suffix is
    // what makes a pin a pin: generalising `claude-opus-5-20260901` here
    // would answer with a model nobody named. The CLI is the authority on
    // whether it knows an id.
    const pinned = engineTerminalFor(makeRepository(), ENGINES[0], "claude-opus-5-20260901");
    assert.deepStrictEqual(
      (pinned as EngineTerminal).args.slice(0, 2),
      ["--model", "claude-opus-5-20260901"],
    );
  });

  test("registers the session, starts the framework's loop, then opens the CLI with the waiter sentence", async () => {
    // The panel arrangement, asked for by name. It is no longer the default
    // -- `dabbler.terminalLocation` is `editor` now -- but it is still the
    // arrangement for anyone who wants their editors to stay editors, and
    // the rebuild-per-CLI rule below belongs to it alone.
    settings.__setConfig("dabbler", "terminalLocation", "panel");
    const repository = makeRepository();
    const register = registrarOf();
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;

    // The real UI over the stub: what matters is what the EDITOR was asked
    // to open, not what a fake recorded.
    const claude = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, claude, register, CLI), true);
    // Registered first, by the framework, with the identity the pick chose:
    // neither the person nor the AI types `session start`.
    assert.deepStrictEqual(register.calls[0], [
      "session", "start", "--sessions-dir", "docs/sessions", "--engine", "claude-code", "--provider", "anthropic",
    ]);
    // Three terminals: the framework's loop, the engine's CLI, and the
    // framework's own view beside the CLI.
    assert.strictEqual(terminals.length, 3);
    assert.deepStrictEqual(terminals[0].options.shellArgs, [
      CLI, "session", "run", "--mailbox", "--sessions-dir", "docs/sessions",
    ]);
    // The program is the editor's executable, which runs as node only when told to.
    assert.strictEqual(terminals[0].options.env?.ELECTRON_RUN_AS_NODE, "1");
    const cli = terminals[1];
    assert.strictEqual(cli.options.shellPath, "claude");
    assert.strictEqual(cli.options.cwd, repository.root);
    assert.strictEqual(cli.shown, 1);
    // The panel by name, not by omission. Saying nothing means "wherever
    // terminals open", and that is terminal.integrated.defaultLocation --
    // which an operator may have set to the editor area, leaving a setting
    // called `panel` putting the pair in editor tabs.
    assert.strictEqual(cli.options.location, vscode.TerminalLocation.Panel);
    // Claude Code takes a positional prompt for an interactive session, so
    // the sentence is argv and nothing is typed. It asks the AI to wait in
    // the background and answer; it registers nothing and advances nothing.
    assert.match(cli.options.shellArgs[0], /dabbler session wait --sessions-dir docs\/sessions/);
    assert.doesNotMatch(cli.options.shellArgs[0], /session (start|next)|--engine|--provider|--model/);
    assert.deepStrictEqual(cli.sent, []);

    // The Dabbler terminal, split off the CLI and shown.
    const dabbler = terminals[2];
    assert.ok(dabbler.options.name.startsWith("Dabbler"));
    assert.ok(dabbler.options.pty);
    assert.strictEqual(dabbler.options.location?.parentTerminal, cli);
    assert.strictEqual(dabbler.shown, 1);

    // The seat's CLI takes the sentence through `-i`, which starts it
    // interactively AND submits it: nothing is typed and no Enter is owed.
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const seat = { ...defaultSessionRunUi(), pickEngine: async () => copilot, askModel: async () => "gpt-5-6-luna" };
    assert.strictEqual(await runStartSession(repository, seat, register, CLI), true);
    // The model is recorded at registration and reaches the CLI's argv; the
    // sentence carries none.
    assert.deepStrictEqual(register.calls[1].slice(-2), ["--model", "gpt-5-6-luna"]);
    assert.strictEqual(terminals.length, 6);
    assert.strictEqual(terminals[4].options.shellPath, "copilot");
    assert.deepStrictEqual(terminals[4].options.shellArgs.slice(0, 3), ["--model", "gpt-5-6-luna", "-i"]);
    assert.match(terminals[4].options.shellArgs[3], /dabbler session wait/);
    assert.deepStrictEqual(terminals[4].sent, []);

    // A second session in the same window opens a second CLI, and the
    // terminal beside the FIRST one is not the arrangement Start promised
    // for this one. A location cannot be changed after creation, so the
    // Dabbler terminal is built again beside the CLI that was just opened.
    assert.ok(terminals[5].options.name.startsWith("Dabbler"));
    assert.strictEqual(terminals[5].options.location?.parentTerminal, terminals[4]);
    assert.strictEqual(terminals[5].shown, 1);
    // And the one it replaced is gone rather than left behind.
    assert.strictEqual(dabbler.disposed, 1);
    assert.strictEqual(dabbler.shown, 1);
  });

  test("a registration the router refuses opens nothing, and says why in the router's words", async () => {
    const row = driveUi();
    const refused = registrarOf(2, "start: refused -- the working tree is not clean");
    assert.strictEqual(await runStartSession(makeRepository(), row.ui, refused, CLI), false);
    assert.deepStrictEqual(row.terminals, []);
    assert.ok(row.errors.some((line) => line.includes("the working tree is not clean")), row.errors.join(" | "));
  });

  test("splits the terminal activation already made, rather than showing it as its own tab", async () => {
    // The ordinary path, and the one the first fix missed: an existing
    // repository is open when the window starts, so a Dabbler terminal
    // exists before there is any CLI to sit beside it. A terminal's
    // location is fixed at creation, so showing that one produces a
    // separate tab and no arrangement at all.
    settings.__setConfig("dabbler", "terminalLocation", "panel");
    const repository = makeRepository({ root: path.join("D:", "already-open") });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;
    openDabblerTerminal(repository.root);
    assert.strictEqual(terminals.length, 1);
    assert.strictEqual(terminals[0].options.location, undefined);

    const ui = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    // The loop, the CLI, then a Dabbler terminal built beside the CLI -- the
    // unsplit one is replaced, not merely shown.
    assert.strictEqual(terminals.length, 4);
    assert.strictEqual(terminals[3].options.location?.parentTerminal, terminals[2]);
    assert.strictEqual(terminals[3].shown, 1);
    assert.strictEqual(terminals[0].shown, 0);
  });

  test("opens the pair as two editor tabs by default, left to right", async () => {
    // The default the operator asked for: the CLI in the first editor
    // column and the framework's terminal in the next, both with the full
    // height of the window rather than a third of it.
    const repository = makeRepository({ root: path.join("D:", "editor-pair") });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;

    const ui = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    assert.strictEqual(terminals.length, 3);
    assert.deepStrictEqual(terminals[1].options.location, { viewColumn: vscode.ViewColumn.One });
    assert.ok(terminals[2].options.name.startsWith("Dabbler"));
    assert.deepStrictEqual(terminals[2].options.location, {
      viewColumn: vscode.ViewColumn.Beside,
    });
    assert.strictEqual(terminals[2].shown, 1);

    // A second Start in the same window costs no scrollback here: the
    // framework's tab is already where it belongs, so it is shown rather
    // than rebuilt -- which is the one thing the panel split cannot do.
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    assert.strictEqual(terminals.length, 5);
    assert.strictEqual(terminals[2].disposed, 0);
    assert.strictEqual(terminals[2].shown, 2);
  });

  test("opens the framework's loop in the panel without taking focus, whatever the pair's location", async () => {
    const repository = makeRepository({ root: path.join("D:", "loop-panel") });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;

    const ui = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    const loop = terminals[0];
    assert.deepStrictEqual(loop.options.shellArgs.slice(1, 4), ["session", "run", "--mailbox"]);
    assert.strictEqual(loop.options.location, vscode.TerminalLocation.Panel);
    assert.strictEqual(loop.preserveFocus, true);
  });

  test("a second Start replaces the repository's loop terminal and leaves the CLI and Dabbler terminals open", async () => {
    const repository = makeRepository({ root: path.join("D:", "loop-replaced") });
    const other = makeRepository({ root: path.join("D:", "elsewhere", "loop-replaced") });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;

    const ui = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(other, ui, registrarOf(), CLI), true);
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    const [otherLoop, firstLoop, cli, dabbler] = [terminals[0], terminals[3], terminals[4], terminals[5]];
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    assert.strictEqual(firstLoop.disposed, 1);
    assert.strictEqual(terminals[6].disposed, 0);
    assert.strictEqual(otherLoop.disposed, 0);
    assert.strictEqual(cli.disposed, 0);
    assert.strictEqual(dabbler.disposed, 0);
  });

  test("the session completing disposes its loop terminal", async () => {
    const repository = makeRepository({ root: path.join("D:", "loop-completes"), currentSession: 2 });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;
    closeLoopOnSessionEnd(repository);

    defaultSessionRunUi().openLoopTerminal(repository, loopTerminalFor(repository, CLI));
    // A scan that still reads the session in flight leaves it open.
    closeLoopOnSessionEnd(repository);
    assert.strictEqual(terminals[0].disposed, 0);
    closeLoopOnSessionEnd({ ...repository, currentSession: null });
    assert.strictEqual(terminals[0].disposed, 1);
  });

  test("closing the loop terminal by hand leaves Resume refusing to start a second loop beside a live one", async () => {
    const repository = makeRepository({
      root: path.join("D:", "loop-closed-by-hand"),
      currentSession: 2,
      nextSession: 2,
      sessions: [makeSession({ number: 2, status: "in-progress" })],
    });
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;
    const ui = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, ui, registrarOf(), CLI), true);
    terminals[0].dispose();

    // The heartbeat says the loop is still driving, so no loop is opened.
    assert.strictEqual(await runResumeSession(repository, ui, CLI, () => true), true);
    assert.ok(!terminals.slice(3).some((terminal) => terminal.options.shellArgs?.includes("--mailbox")));
  });

  test("a seat without a model opens nothing, and a dismissed pick opens nothing", async () => {
    const repository = makeRepository();
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const seat = driveUi({ pickEngine: async () => copilot, askModel: async () => "" });
    const register = registrarOf();
    assert.strictEqual(await runStartSession(repository, seat.ui, register, CLI), false);
    assert.ok(seat.errors[0].includes("needs a model"));
    const dismissed = driveUi({ pickEngine: async () => undefined });
    assert.strictEqual(await runStartSession(repository, dismissed.ui, register, CLI), false);
    assert.deepStrictEqual(register.calls, []);
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

  test("Start Session reads its repository off either row it is offered on", () => {
    // It is offered on the repository row and on the row for the session
    // that would be registered next. Narrowed to one node kind, the second
    // offer opened a menu whose command recognised nothing and returned
    // without a word -- worse than not offering it.
    const repository = makeRepository({ root: "D:/ws" });
    assert.strictEqual(repositoryOf({ kind: "repository", repository }), repository);
    assert.strictEqual(
      repositoryOf({ kind: "session", repository, session: makeSession() }),
      repository,
    );
    assert.strictEqual(repositoryOf({ kind: "bucket" }), undefined);
    assert.strictEqual(repositoryOf(null), undefined);
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

suite("commandFlows: cancel at planning time", () => {
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

});

suite("placing a repository the Explorer cannot reach", () => {
  const PROJECTION = {
    solution: { name: "csv", title: "CSV", multi: false, implicit: true, moduleCount: 1 },
    modules: [],
    external: [
      {
        id: "Dabbler.Csv.Model",
        producedBy: "csv-model",
        resolve: "feed",
        root: null,
        remote: null,
      },
    ],
  } as unknown as Projection;

  const source = {
    node: { kind: "external" as const, id: "Dabbler.Csv.Model" },
    projection: PROJECTION,
  };

  /** The prompts these four ask, answered; restored by the caller. */
  function answering(answers: {
    input?: string;
    folder?: string;
    confirm?: string;
  }): () => void {
    const w = vscode.window as unknown as Record<string, unknown>;
    const before = {
      showInputBox: w.showInputBox,
      showOpenDialog: w.showOpenDialog,
      showInformationMessage: w.showInformationMessage,
    };
    w.showInputBox = async () => answers.input;
    w.showOpenDialog = async () =>
      answers.folder ? [{ fsPath: answers.folder }] : undefined;
    w.showInformationMessage = async () => answers.confirm;
    const ws = vscode.workspace as unknown as { workspaceFolders?: unknown };
    const folders = ws.workspaceFolders;
    ws.workspaceFolders = [{ uri: { fsPath: "D:/ws/csv-app" } }];
    return () => {
      Object.assign(w, before);
      ws.workspaceFolders = folders;
    };
  }

  test("each command writes through the router, naming the repository the row is about", async () => {
    // The extension never authors `solution-dependencies.json` itself: two
    // writers for one declaration drift, and only one of them can be
    // schema-checked on the way out.
    const restore = answering({
      input: "git@github.com:dabbler/csv-model.git",
      folder: "D:/repos/csv-model",
      confirm: "Create",
    });
    try {
      const fake = fakeRouter(0, "done");
      let refreshed = 0;
      const refresh = (): void => {
        refreshed += 1;
      };
      await identifyRemote(fake.router, source, refresh);
      await locateRepository(fake.router, source, refresh);
      await cloneRepository(fake.router, source, refresh);
      await createRepository(fake.router, source, refresh);

      assert.deepStrictEqual(
        fake.depsCalls.map((call) => call.verb),
        ["deps locate", "deps locate", "deps clone", "deps scaffold"],
      );
      // The producer's id off the row, never a path -- the path is the
      // thing that is missing.
      assert.ok(fake.depsCalls.every((call) => call.options.repository === "csv-model"));
      assert.strictEqual(
        fake.depsCalls[0].options.remote,
        "git@github.com:dabbler/csv-model.git",
      );
      assert.strictEqual(fake.depsCalls[1].options.path, "D:/repos/csv-model");
      // The row the operator just acted on is the one they are looking at.
      assert.strictEqual(refreshed, 4);
    } finally {
      restore();
    }
  });

  test("a cancelled prompt writes nothing, and a refusal does not claim it did", async () => {
    const restore = answering({});
    try {
      const cancelled = fakeRouter(0, "done");
      await identifyRemote(cancelled.router, source, () => {});
      await locateRepository(cancelled.router, source, () => {});
      await createRepository(cancelled.router, source, () => {});
      assert.deepStrictEqual(cancelled.depsCalls, []);

      // A refusal refreshes nothing: the declaration did not move.
      const refused = fakeRouter(1, "csv-model declares no remote");
      let refreshed = 0;
      await cloneRepository(refused.router, source, () => {
        refreshed += 1;
      });
      assert.deepStrictEqual(
        refused.depsCalls.map((call) => call.verb),
        ["deps clone"],
      );
      assert.strictEqual(refreshed, 0);
    } finally {
      restore();
    }
  });
});

suite("Resume Session", () => {
  test("Resume Session restarts the loop only when no heartbeat says one is driving, and reopens the recorded engine waiting on it", async () => {
    const repository = makeRepository({
      root: "D:\\ws\\csv-pipeline",
      currentSession: 2,
      nextSession: 2,
      sessions: [makeSession({ number: 2, status: "in-progress" })],
      orchestrator: { engine: "copilot", provider: "openai", model: "gpt-5-6-luna" },
    });
    const cli = "D:\\ext\\dabbler.cjs";
    const loopArgs = ["session", "run", "--mailbox", "--sessions-dir", "docs/sessions"];

    // A live loop is left alone; the open CLI, whose waiter may be gone, is
    // replaced by one carrying the sentence.
    const closed: EngineTerminal[] = [];
    const live = driveUi({ closeEngineTerminals: (spec) => { closed.push(spec); } });
    assert.strictEqual(await runResumeSession(repository, live.ui, cli, () => true), true);
    // What is closed is exactly the CLI being reopened, in this repository.
    assert.deepStrictEqual(closed, [live.terminals[0]]);
    assert.strictEqual(live.terminals.length, 1);
    assert.strictEqual(live.terminals[0].program, "copilot");
    assert.deepStrictEqual(live.terminals[0].args.slice(0, 3), ["--model", "gpt-5-6-luna", "-i"]);
    assert.match(live.terminals[0].args[3], /dabbler session wait/);

    // No heartbeat: the loop is restarted, whatever terminals are open.
    const dead = driveUi();
    assert.strictEqual(await runResumeSession(repository, dead.ui, cli, () => false), true);
    assert.deepStrictEqual(dead.terminals[0].args.slice(1), loopArgs);
    assert.strictEqual(dead.terminals[0].cwd, repository.root);
    assert.strictEqual(dead.terminals[1].program, "copilot");

    // No recorded engine: the loop, and the sentence in a message.
    const unknown = driveUi();
    assert.strictEqual(await runResumeSession({ ...repository, orchestrator: null }, unknown.ui, cli, () => false), true);
    assert.strictEqual(unknown.terminals.length, 1);
    assert.match(unknown.infos[0], /dabbler session wait/);

    const idle = driveUi();
    assert.strictEqual(await runResumeSession({ ...repository, currentSession: null }, idle.ui, cli, () => false), false);
    assert.strictEqual(idle.terminals.length, 0);
  });

  test("Resume closes only its own repository's CLI, beside another repository of the same name", () => {
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const mine = engineTerminalFor(makeRepository({ root: "D:\\ws\\a\\app" }), copilot, "gpt-5-6-luna") as EngineTerminal;
    const theirs = engineTerminalFor(makeRepository({ root: "D:\\ws\\b\\app" }), copilot, "gpt-5-6-luna") as EngineTerminal;
    // Same label, same engine: the name alone cannot tell them apart.
    assert.strictEqual(mine.name, theirs.name);
    const open = (spec: EngineTerminal, cwd: string | vscode.Uri = spec.cwd, shellPath = spec.program) => ({
      name: spec.name,
      creationOptions: { shellPath, cwd },
    });
    const window = [
      open(mine),
      open(theirs),
      open(mine, { fsPath: mine.cwd } as unknown as vscode.Uri),
      open(mine, mine.cwd, "pwsh"),
    ];
    // Disposing what matches leaves the other repository's CLI and a shell
    // that merely shares the name.
    const left = window.filter((terminal) => !isEngineTerminalOf(terminal, mine));
    assert.deepStrictEqual(left, [window[1], window[3]]);
  });
});

suite("Troubleshoot's prerequisite report", () => {
  test("names a present tool with its version, a missing one as missing, and never a key's value", async () => {
    // The probe is what makes this a test of the report rather than of the
    // machine: git answers, everything else does not, whatever is installed
    // on the host running the suite.
    const asked: string[][] = [];
    const probe: ToolProbe = {
      probe: async (argv) => {
        asked.push([...argv]);
        return argv[0] === "git" ? "git version 2.51.0.windows.2" : null;
      },
    };
    const report = await prerequisiteReport(probe, {
      DABBLER_TRANSPORT: "copilot-cli",
      DABBLER_ANTHROPIC_API_KEY: "sk-ant-shouldneverbeprinted",
    });
    const text = report.join("\n");

    // Every prerequisite is asked, git among them.
    assert.ok(asked.some((argv) => argv[0] === "git"));
    assert.ok(asked.some((argv) => argv[0] === "mvn"));

    // Present: the tool's own answer. Missing: said so, with what it is for.
    assert.ok(/git\s+git version 2\.51\.0\.windows\.2/.test(text));
    assert.ok(/mvn\s+not found/.test(text));

    // The router is answered from the extension's own bundle, not from PATH.
    assert.ok(text.includes(`dabbler-ai-router ${ROUTER_VERSION}`));

    // The transport by value, because which one is set is the question.
    assert.ok(text.includes("DABBLER_TRANSPORT=copilot-cli"));

    // The keys by presence only. This is the assertion the section exists for:
    // the channel is one an operator pastes into an issue.
    assert.ok(text.includes("DABBLER_ANTHROPIC_API_KEY is set"));
    assert.ok(text.includes("DABBLER_OPENAI_API_KEY is not set"));
    assert.ok(!text.includes("sk-ant-shouldneverbeprinted"));
  });
});

suite("the Configuration section's model pick", () => {
  /** A pick that records what it was offered and takes the first item. */
  function capturingUi(
    /** Take the first offer, for a flow whose WRITE is what is being asked about. */
    takesFirst = false,
  ): {
    ui: ConfigurationUi;
    offered: vscode.QuickPickItem[];
    /** The options the list was offered WITH, which is where the help line rides. */
    options: vscode.QuickPickOptions[];
    informed: string[];
    /** A refusal is a sentence a person reads, so it is captured like one. */
    warned: string[];
  } {
    const offered: vscode.QuickPickItem[] = [];
    const options: vscode.QuickPickOptions[] = [];
    const informed: string[] = [];
    const warned: string[] = [];
    return {
      offered,
      options,
      informed,
      warned,
      ui: {
        confirm: () => Promise.resolve(false),
        runVerb: () => Promise.resolve(0),
        pick: (items, pickOptions) => {
          offered.push(...items);
          options.push(pickOptions);
          return Promise.resolve(takesFirst ? items[0] : undefined);
        },
        showInformationMessage: (message) => informed.push(message),
        showWarningMessage: (message) => warned.push(message),
        workspaceRoot: () => "D:/ws",
      },
    };
  }

  const model = (over: Partial<ConfigurationModel>): ConfigurationModel => ({ model: "a-model", provider: "anthropic", ...over,
  });

  test("labels each option's provider against the author, and prices only what a source priced", async () => {
    // Where the deleted cross-provider RULE went. Every model is offered --
    // the only one refused is the authoring model itself -- and each carries
    // how it stands to the author, so the person weighs what the framework
    // cannot judge. The price is the source's own word for its own price,
    // shown where a source stated one and absent where none did; a model
    // graded on a price it never stated is how a tool teaches a developer
    // that its tags mean nothing.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        // The author's provider, stated once on the authoring row: the label
        // below is DERIVED from it against each option's own provider, so a
        // reading with no authoring row labels nothing rather than labelling
        // wrongly.
        authoring: { role: "authoring", provider: "anthropic", chosen: null, candidates: [], excludes: [], fellThrough: false },
        primaryReviewer: {
          role: "verifier",
          chosen: null,
          candidates: [
            model({
              model: "claude-opus-5",
              provider: "anthropic",
              priceCategory: "high",
              conflict: "not usable while authoring is Anthropic",
            }),
            model({
              model: "gpt-5.6-terra",
              provider: "openai",
            }),
          ],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const { ui, offered, options } = capturingUi();
    const { router } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "primaryReviewer" }, projection },
      "primaryReviewer",
      () => undefined,
      ui,
    );
    assert.ok(offered[0].description?.includes("same provider"), offered[0].description);
    assert.ok(offered[0].description?.includes("high price"), offered[0].description);
    assert.ok(offered[1].description?.includes("different provider"), offered[1].description);
    // A candidate from the authoring vendor stays offered, and is marked.
    assert.ok(offered[0].description?.includes("not usable while authoring is Anthropic"), offered[0].description);
    assert.ok(!offered[1].description?.includes("not usable"), offered[1].description);
    // Nothing said, nothing shown: no price is invented for the second.
    assert.ok(!offered[1].description?.includes("price"), offered[1].description);
    // And the one line of help travels with the list, where the choice is made.
    assert.ok(options[0]?.placeHolder?.includes("blind spots"), options[0]?.placeHolder);
  });

  test("sets the authoring model from the engine's own list, and writes it as the authoring model", async () => {
    // It answered with a sentence telling the operator to go and type a
    // command, because `dabbler configure` had no `--authoring-model`. The
    // verb exists now, and the row that offers the choice is the row that
    // makes it.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        authoring: {
          role: "authoring",
          provider: "anthropic",
          chosen: null,
          candidates: [
            model({ model: "claude-opus-5", provider: "anthropic" }),
            model({ model: "claude-sonnet-5", provider: "anthropic" }),
          ],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const { ui, offered } = capturingUi(true);
    const { router, configureOptions } = fakeRouter(0, "written");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "authoring" }, projection },
      "authoring",
      () => undefined,
      ui,
    );
    assert.deepStrictEqual(
      offered.map((item) => item.label),
      ["claude-opus-5", "claude-sonnet-5"],
    );
    assert.deepStrictEqual(configureOptions, [
      { repoRoot: "D:/ws", authoringModel: "claude-opus-5" },
    ]);
  });

  test("reports the authoring model of a session in flight instead of offering to change it", async () => {
    // `session start` records the identity and the ledger carries it from
    // that moment, so this one row IS a report. The refusal says so; a
    // control that silently declined is the shape this section shipped in.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        authoring: {
          role: "authoring",
          provider: "anthropic",
          declaredAtStart: true,
          chosen: model({ model: "claude-opus-5", provider: "anthropic" }),
          candidates: [model({ model: "claude-opus-5", provider: "anthropic" })],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const { ui, offered, warned } = capturingUi();
    const { router, configureOptions } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "authoring" }, projection },
      "authoring",
      () => undefined,
      ui,
    );
    assert.strictEqual(offered.length, 0);
    assert.strictEqual(configureOptions.length, 0);
    assert.ok(warned.some((line) => line.includes("claude-opus-5")), warned.join(" | "));
  });

  test("says which record was read when the engine's own list offers nothing", async () => {
    // "No model qualifies" alone is what a seat with eighteen working models
    // was once told. The answer names the record and the reason.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        authoring: {
          role: "authoring",
          provider: "anthropic",
          enumeration: "api",
          unavailable: "no provider key resolves in this environment",
          chosen: null,
          candidates: [],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const { ui, offered, warned } = capturingUi();
    const { router, configureOptions } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "authoring" }, projection },
      "authoring",
      () => undefined,
      ui,
    );
    assert.strictEqual(offered.length, 0);
    assert.strictEqual(configureOptions.length, 0);
    assert.ok(warned.some((line) => line.includes("no provider key")), warned.join(" | "));
  });

  // The operator's case: this checkout's `dabbler.reviewerTransport = api`
  // decides the reviewing vehicle while the machine's is already copilot-cli.
  const reviewedOver = (): Projection =>
    ({
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        fidelityTransport: "api",
        primaryReviewer: {
          role: "reviewer",
          vehicle: {
            kind: "transport",
            options: [
              { id: "api", means: "the provider's own endpoint" },
              { id: "copilot-cli", means: "a Copilot seat" },
            ],
            chosen: "api",
            decidedBy: "dabbler.reviewerTransport",
            withheld: [],
          },
          chosen: null,
          candidates: [model({ model: "o-one", provider: "openai" })],
          excludes: [],
          fellThrough: false,
        },
      },
    }) as unknown as Projection;

  test("the Primary Reviewer model row asks no vehicle, even with two to choose from", async () => {
    // The Reviewing AI's Vehicle row is the one control for that; a second
    // question here was a second control for one write.
    const { ui, options } = capturingUi();
    const { router, configureOptions } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "primaryReviewer" }, projection: reviewedOver() },
      "primaryReviewer",
      () => undefined,
      ui,
    );
    assert.strictEqual(options.length, 1);
    assert.ok(options[0]?.title?.includes("model"), options[0]?.title);
    assert.strictEqual(configureOptions.length, 0);
  });

  test("setReviewerTransport writes the reviewing vehicle, the one the row shows", async () => {
    // It wrote the machine's `transport`, which the checkout's
    // reviewerTransport outranks: the toast said written and the row said
    // `api` still.
    const { ui, offered, options } = capturingUi(true);
    const { router, configureOptions } = fakeRouter(0, "written");
    await setReviewerTransport(
      router,
      { node: { kind: "configVehicle", who: "reviewing" }, projection: reviewedOver() },
      () => undefined,
      ui,
    );
    assert.deepStrictEqual(offered.map((item) => item.label), ["api", "copilot-cli"]);
    assert.ok(options[0]?.placeHolder?.includes("dabbler.reviewerTransport"), options[0]?.placeHolder);
    assert.deepStrictEqual(configureOptions, [{ repoRoot: "D:/ws", reviewerTransport: "api" }]);
  });

  test("picks the Auxiliary Reviewer from its own candidates and writes it as that role", async () => {
    // The third voice has been dispatchable since the roles were named and
    // has had no surface at all. It is picked through the same control as
    // the primary, against ITS OWN list, and what is written is the
    // auxiliary's selection -- a pick that wrote the reviewer's would have
    // moved the verdict this session did not ask to move.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        fidelityTransport: "api",
        primaryReviewer: {
          role: "reviewer",
          chosen: model({ model: "gpt-5.6-terra", provider: "openai" }),
          candidates: [model({ model: "gpt-5.6-terra", provider: "openai" })],
          excludes: [],
          fellThrough: false,
        },
        auxiliaryReviewer: {
          role: "auxiliary-reviewer",
          // Two vehicles present, and no vehicle question is asked here:
          // the auxiliary has no vehicle flag of its own, so offering one
          // would be a control that silently writes nothing.
          vehicle: {
            kind: "transport",
            options: [
              { id: "api", means: "the provider's own endpoint" },
              { id: "copilot-cli", means: "a Copilot seat" },
            ],
            chosen: "api",
            withheld: [],
          },
          chosen: null,
          candidates: [model({ model: "gemini-3.1-pro-preview", provider: "google" })],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const picked: vscode.QuickPickItem[] = [];
    const options: vscode.QuickPickOptions[] = [];
    const ui: ConfigurationUi = {
      confirm: () => Promise.resolve(false),
      runVerb: () => Promise.resolve(0),
      pick: (items, pickOptions) => {
        picked.push(...items);
        options.push(pickOptions);
        return Promise.resolve(items[0]);
      },
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };
    const { router, configureOptions } = fakeRouter(0, "written");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "auxiliaryReviewer" }, projection },
      "auxiliaryReviewer",
      () => undefined,
      ui,
    );
    assert.deepStrictEqual(
      picked.map((item) => item.label),
      ["gemini-3.1-pro-preview"],
    );
    assert.ok(options[0]?.title?.includes("adjudicates"), options[0]?.title);
    assert.deepStrictEqual(configureOptions, [
      { repoRoot: "D:/ws", auxiliaryModel: "gemini-3.1-pro-preview" },
    ]);
  });
});

suite("the solution row's release commands", () => {
  test("write the setting through configure, and repaint", async () => {
    const ui: ConfigurationUi = {
      confirm: () => Promise.resolve(true),
      runVerb: () => Promise.resolve(0),
      pick: () => Promise.resolve(undefined),
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };
    const { router, configureOptions } = fakeRouter(0, "written");
    let repainted = 0;
    await setRelease(router, "ship-by-default", () => (repainted += 1), ui);
    await setRelease(router, "on-request", () => (repainted += 1), ui);
    assert.deepStrictEqual(configureOptions, [
      { repoRoot: "D:/ws", release: "ship-by-default" },
      { repoRoot: "D:/ws", release: "on-request" },
    ]);
    assert.strictEqual(repainted, 2);
  });
});

suite("the Configuration node's refresh", () => {
  const PATH = "C:/Users/dev/AppData/Local/dabbler/ai-model-catalog.json";
  const ROW = {
    record: "ai-model-catalog",
    path: PATH,
    present: true,
    datedAt: "2026-09-11T00:00:00Z",
    ageHours: 2,
    thresholdHours: 24,
    command: "dabbler discovery refresh",
    cost: "Nothing.",
    stale: false,
    notes: [] as string[],
  };
  const PROJECTION = {
    solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
    modules: [],
    configuration: { records: [ROW] },
  } as unknown as Projection;

  test("runs the verb the router named, off the Configuration node rather than a row of its own", async () => {
    // The catalog's row is gone: it was named after the mechanism, and its
    // second action -- open the JSON in an editor -- invited a hand-edit of
    // a machine-written record that survives until the next refresh
    // replaces the block whole. What is left is the reading being brought
    // up to date, which belongs to the section. Which invocation re-reads
    // it is still the router's fact, and the cost travels with the
    // question, because this repository has answered "what does a refresh
    // cost" wrongly four times.
    const ran: Array<readonly string[]> = [];
    const said: string[] = [];
    let asked = "";
    const ui: ConfigurationUi = {
      confirm: (message) => {
        asked = message;
        return Promise.resolve(true);
      },
      runVerb: (_title, _cwd, args) => {
        ran.push(args);
        return Promise.resolve(0);
      },
      pick: () => Promise.resolve(undefined),
      showInformationMessage: (message) => said.push(message),
      showWarningMessage: (message) => said.push(message),
      workspaceRoot: () => "D:/ws",
    };

    let repainted = 0;
    await refreshRecord(
      { node: { kind: "configuration" }, projection: PROJECTION },
      () => (repainted += 1),
      ui,
    );
    assert.deepStrictEqual(ran, [["discovery", "refresh"]]);
    // **It finishes.** This was the one command in the section given no
    // callback, and it is the one that needed it most: what it rewrites is
    // the model catalog at the USER level, outside every glob a workspace
    // watcher can be built from. The operator refreshed and the pane went on
    // showing the old reading.
    assert.strictEqual(repainted, 1);
    assert.ok(
      said.some((line) => line.includes("re-read")),
      said.join(" | "),
    );
    assert.ok(asked.includes("Nothing."), asked);
    assert.ok(asked.includes(ROW.command), asked);
    // And the one condition under which the answer is no, said BEFORE the
    // click. The refusal is the right one -- a session that re-reads its own
    // verifier pool mid-run has edited the conditions of its own review --
    // but until now the question promised a refresh it was in no position to
    // offer, and the operator found out in the terminal afterwards.
    assert.ok(asked.includes("While a session is in flight"), asked);
    assert.ok(asked.includes("verifier pool"), asked);
  });

  test("asks for a key in a terminal and never in this window", async () => {
    // The whole design of the row: an input box's contents live in the
    // editor's own buffers and its undo history, and none of that is
    // somewhere this framework can reach in to clear afterwards. What the
    // command does is open a terminal on the verb that asks.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        credentials: [
          {
            provider: "openai",
            displayLabel: "OpenAI",
            variable: "DABBLER_OPENAI_API_KEY",
            fromEnvironment: false,
            reference: "client-a",
            decidedBy: ".vscode/settings.json",
            held: false,
            stop: "openai is configured to use the credential 'client-a'.",
            store: "dabbler auth set openai",
            choose: "dabbler configure --credential openai=<name>",
          },
        ],
      },
    } as unknown as Projection;

    const ran: Array<readonly string[]> = [];
    let asked = 0;
    let picked = 0;
    const ui: ConfigurationUi = {
      // Nothing is confirmed and nothing is picked: this command writes
      // nothing until a person types into the terminal it opens, and
      // closing that terminal is the no. A modal in front of it would be
      // two questions for one answer -- and the walk found the practical
      // half of the same point, where the modal blocked the window.
      confirm: () => {
        asked += 1;
        return Promise.resolve(true);
      },
      runVerb: (_title, _cwd, args) => {
        ran.push(args);
        return Promise.resolve(0);
      },
      // A pick would be a value collected in this window, which is the one
      // thing this command may not do.
      pick: () => {
        picked += 1;
        return Promise.resolve(undefined);
      },
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };

    let repainted = 0;
    await storeCredential(
      { node: { kind: "configCredential", provider: "openai" }, projection },
      () => (repainted += 1),
      ui,
    );
    // The credential's own name goes with it, so the key lands where the
    // committed setting is already pointing rather than under the
    // provider's name and out of reach of the reference.
    assert.deepStrictEqual(ran, [["auth", "set", "openai", "--name", "client-a"]]);
    assert.strictEqual(picked, 0);
    assert.strictEqual(asked, 0);
    assert.strictEqual(repainted, 1);
  });

  test("keeps a vehicle as this person's default, and says which file and what outranks it", async () => {
    // A right-click that wrote the committed settings file would publish a
    // personal preference to everyone who clones the repository, which is a
    // control doing more than it said.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        primaryReviewer: {
          role: "reviewer",
          vehicle: {
            kind: "transport",
            options: [{ id: "api", means: "the provider's own endpoint" }],
            chosen: "api",
            layers: [{ source: ".vscode/settings.json", value: "copilot-cli" }],
          },
          chosen: null,
          candidates: [],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const asked: string[] = [];
    const ui: ConfigurationUi = {
      confirm: (message) => {
        asked.push(message);
        return Promise.resolve(true);
      },
      runVerb: () => Promise.resolve(0),
      pick: () => Promise.resolve(undefined),
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };
    const { router, configureOptions } = fakeRouter(0, "written");
    await setAsMyDefault(
      router,
      { node: { kind: "configVehicle", who: "reviewing" }, projection },
      () => undefined,
      ui,
    );
    assert.deepStrictEqual(configureOptions, [
      { repoRoot: "D:/ws", reviewerTransport: "api", mine: true },
    ]);
    // Which file it is about to write, and what already outranks it: a
    // personal default under a committed setting is a value the operator can
    // see and the framework will not use.
    assert.ok(asked[0]?.includes("not committed"), asked[0]);
    assert.ok(asked[0]?.includes(".vscode/settings.json"), asked[0]);
  });

  test("refuses to keep a row that has nothing on it", async () => {
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        authoring: { role: "authoring", chosen: null, candidates: [], excludes: [], fellThrough: false },
      },
    } as unknown as Projection;
    const warned: string[] = [];
    const ui: ConfigurationUi = {
      confirm: () => {
        throw new Error("nothing to keep must not be confirmed");
      },
      runVerb: () => Promise.resolve(0),
      pick: () => Promise.resolve(undefined),
      showInformationMessage: () => undefined,
      showWarningMessage: (message) => warned.push(message),
      workspaceRoot: () => "D:/ws",
    };
    const { router, configureOptions } = fakeRouter(0, "");
    await setAsMyDefault(
      router,
      { node: { kind: "configRole", role: "authoring" }, projection },
      () => undefined,
      ui,
    );
    assert.deepStrictEqual(configureOptions, []);
    assert.ok(
      warned.some((line) => line.includes("nothing on this row")),
      warned.join(" | "),
    );
  });

  test("repaints even when the refresh did not finish, and says so", async () => {
    // A refresh that failed halfway still MOVED the file, so a pane left
    // showing the state before it would be wrong in the one direction an
    // operator has no way to check. The router already said why in the
    // terminal they were watching; repeating its words here would be a
    // second rendering of one refusal.
    const said: string[] = [];
    const ui: ConfigurationUi = {
      confirm: () => Promise.resolve(true),
      runVerb: () => Promise.resolve(2),
      pick: () => Promise.resolve(undefined),
      showInformationMessage: (message) => said.push(message),
      showWarningMessage: (message) => said.push(message),
      workspaceRoot: () => "D:/ws",
    };
    let repainted = 0;
    await refreshRecord(
      { node: { kind: "configuration" }, projection: PROJECTION },
      () => (repainted += 1),
      ui,
    );
    assert.strictEqual(repainted, 1);
    assert.ok(said.some((line) => line.includes("exit 2")), said.join(" | "));
  });

  test("does nothing at all when the operator declines", async () => {
    const ui: ConfigurationUi = {
      confirm: () => Promise.resolve(false),
      runVerb: () => {
        throw new Error("a declined refresh must not run anything");
      },
      pick: () => Promise.resolve(undefined),
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };
    let repainted = 0;
    await refreshRecord(
      { node: { kind: "configuration" }, projection: PROJECTION },
      () => (repainted += 1),
      ui,
    );
    assert.strictEqual(repainted, 0);
  });
});
