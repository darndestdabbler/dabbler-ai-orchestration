import * as assert from "assert";
import * as vscode from "vscode";
import {
  CancellableSession,
  CancelLifecycleUi,
  runCancelSessionFlow,
  runRestoreSessionFlow,
} from "../../commands/cancelLifecycleCommands";
import { NewModuleUi, runNewModuleFlow } from "../../commands/newModule";
import { OpenModuleUi, openModule } from "../../commands/openModule";
import { ShowImpactUi, showImpact } from "../../commands/showImpact";
import { PackModuleUi, packModule } from "../../commands/packModule";
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
  DEFAULT_STOP_REASON,
  Drives,
  ENGINES,
  START_REQUEST_REL,
  type DriveLauncher,
  type EngineTerminal,
  type SessionRunUi,
  defaultSessionRunUi,
  engineOutputChannel,
  repositoryOf,
  runResumeSession,
  runSendToEngine,
  runStartFocusedSession,
  runStartSession,
  runStartUnattendedSession,
  runStopDrive,
  startFromRequest,
  writeStartRequest,
} from "../../commands/sessionCommands";
import * as fs from "fs";
import { ROUTER_VERSION } from "dabbler-ai-router";
import { prerequisiteReport, type ToolProbe } from "../../commands/troubleshoot";
import {
  refreshRecord,
  setRoleModel,
  type ConfigurationUi,
} from "../../commands/configurationCommands";
import type { ConfigurationModel } from "../../providers/solutionTreeModel";
import type { DriveHandle } from "../../router/driveProcess";
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
    // Slug, title, kind and depends-on; Enter past the last two takes the
    // manifest's defaults, a library that depends on nothing.
    const { ui, infos } = moduleUi(["greeter", "Greeter", "", ""], "D:\\ws");
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
    const { ui, errors } = moduleUi(["dupe", "", "", ""], "D:\\ws");
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

// --- the driven session: Start launches, Stop and Send interrupt -----------

interface FakeDrive {
  handle: DriveHandle;
  exit: (code: number | null) => void;
}

function fakeDrive(root: string): FakeDrive {
  let exit: (code: number | null) => void = () => undefined;
  const exited = new Promise<number | null>((resolve) => {
    exit = resolve;
  });
  return { handle: { root, exited, kill: () => exit(null) }, exit };
}

function driveUi(overrides: Partial<SessionRunUi> = {}): {
  ui: SessionRunUi;
  errors: string[];
  infos: string[];
  engine: string[];
  /** Every folder the UI was asked to open in a new window. */
  opened: string[];
  /** Every terminal the UI was asked to open. */
  terminals: EngineTerminal[];
} {
  const errors: string[] = [];
  const infos: string[] = [];
  const engine: string[] = [];
  const opened: string[] = [];
  const terminals: EngineTerminal[] = [];
  const ui: SessionRunUi = {
    showTerminalNamed: () => false,
    openFolder: async (folder) => {
      opened.push(folder);
    },
    pickEngine: async () => ENGINES[0],
    askModel: async () => "haiku",
    askText: async (_title, _prompt, value) => value ?? "look at src/widget.py again",
    pickDrive: async (roots) => roots[0],
    report: () => undefined,
    showErrorMessage: (m: string) => errors.push(m),
    showInformationMessage: (m: string) => infos.push(m),
    engineLine: (line) => engine.push(line),
    openTerminal: (terminal) => {
      terminals.push(terminal);
      return undefined;
    },
    showFrameworkTerminal: () => undefined,
    withProgress: (_title, work) => work(),
    ...overrides,
  };
  return { ui, errors, infos, engine, opened, terminals };
}

function launcherOf(drives: Map<string, FakeDrive>): DriveLauncher & { launched: Array<{ root: string; args: string[] }> } {
  const launched: Array<{ root: string; args: string[] }> = [];
  return {
    launched,
    launch: (root, args, onLine) => {
      launched.push({ root, args: [...args] });
      const drive = fakeDrive(root);
      drives.set(root, drive);
      onLine("dabbler [00:00:00] engine-invoked seq=1 invocation=1/24");
      return drive.handle;
    },
  };
}

/** What the stub records of one `window.createTerminal` call. */
interface FakeTerminal {
  options: {
    name: string;
    cwd: string;
    shellPath: string;
    shellArgs: string[];
    location?: { parentTerminal?: unknown };
    pty?: unknown;
  };
  shown: number;
  disposed: number;
  sent: Array<{ text: string; addNewLine: boolean }>;
}

suite("Start opens the person's own CLI", () => {
  const settings = vscode.workspace as unknown as {
    __setConfig: (section: string, key: string, value: unknown) => void;
    __clearConfig: () => void;
  };

  teardown(() => {
    settings.__clearConfig();
  });

  test("opens the picked engine's CLI at the repository root, with the sentence, and launches no driver", async () => {
    // The panel arrangement, asked for by name. It is no longer the default
    // -- `dabbler.terminalLocation` is `editor` now -- but it is still the
    // arrangement for anyone who wants their editors to stay editors, and
    // the rebuild-per-CLI rule below belongs to it alone.
    settings.__setConfig("dabbler", "terminalLocation", "panel");
    const repository = makeRepository();
    const launcher = launcherOf(new Map());
    const terminals = (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
    terminals.length = 0;

    // The real UI over the stub: what matters is what the EDITOR was asked
    // to open, not what a fake recorded.
    const claude = { ...defaultSessionRunUi(), pickEngine: async () => ENGINES[0], askModel: async () => "" };
    assert.strictEqual(await runStartSession(repository, claude), true);
    // Two terminals, because two is the arrangement: the engine's CLI and
    // the framework's own work beside it.
    assert.strictEqual(terminals.length, 2);
    const cli = terminals[0];
    assert.strictEqual(cli.options.shellPath, "claude");
    assert.strictEqual(cli.options.cwd, repository.root);
    assert.strictEqual(cli.shown, 1);
    // The panel by name, not by omission. Saying nothing means "wherever
    // terminals open", and that is terminal.integrated.defaultLocation --
    // which an operator may have set to the editor area, leaving a setting
    // called `panel` putting the pair in editor tabs.
    assert.strictEqual(cli.options.location, vscode.TerminalLocation.Panel);
    // Claude Code takes a positional prompt for an interactive session, so
    // the sentence is argv and nothing is typed.
    // The identity is on `start` and on nothing else. A launch line that put
    // `--engine` on `next` is what an engine re-ran after `done`, and until
    // session 90 that registered and started the next session unasked.
    assert.match(cli.options.shellArgs[0], /dabbler session start .*--engine claude-code/);
    assert.match(cli.options.shellArgs[0], /dabbler session next /);
    const afterNext = cli.options.shellArgs[0].slice(
      cli.options.shellArgs[0].indexOf("dabbler session next "),
    );
    assert.ok(
      !/--engine|--provider|--model/.test(afterNext),
      "the `next` half of the launch sentence must carry no identity flags",
    );
    assert.deepStrictEqual(cli.sent, []);
    assert.deepStrictEqual(launcher.launched, []);

    // The Dabbler terminal, split off the CLI and shown -- created once
    // per repository, however many times Start is pressed.
    const dabbler = terminals[1];
    assert.ok(dabbler.options.name.startsWith("Dabbler"));
    assert.ok(dabbler.options.pty);
    assert.strictEqual(dabbler.options.location?.parentTerminal, cli);
    assert.strictEqual(dabbler.shown, 1);

    // The seat's CLI has no argv slot for it, so it is typed at the prompt
    // and not sent -- one keypress, and nothing copied anywhere.
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const seat = { ...defaultSessionRunUi(), pickEngine: async () => copilot, askModel: async () => "gpt-5-6-luna" };
    assert.strictEqual(await runStartSession(repository, seat), true);
    assert.strictEqual(terminals.length, 4);
    assert.strictEqual(terminals[2].options.shellPath, "copilot");
    assert.deepStrictEqual(terminals[2].options.shellArgs, []);
    assert.strictEqual(terminals[2].sent.length, 1);
    assert.strictEqual(terminals[2].sent[0].addNewLine, false);
    assert.match(terminals[2].sent[0].text, /--model gpt-5-6-luna/);

    // A second session in the same window opens a second CLI, and the
    // terminal beside the FIRST one is not the arrangement Start promised
    // for this one. A location cannot be changed after creation, so the
    // Dabbler terminal is built again beside the CLI that was just opened.
    assert.ok(terminals[3].options.name.startsWith("Dabbler"));
    assert.strictEqual(terminals[3].options.location?.parentTerminal, terminals[2]);
    assert.strictEqual(terminals[3].shown, 1);
    // And the one it replaced is gone rather than left behind.
    assert.strictEqual(dabbler.disposed, 1);
    assert.strictEqual(dabbler.shown, 1);
    assert.deepStrictEqual(launcher.launched, []);
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
    assert.strictEqual(await runStartSession(repository, ui), true);
    // The CLI, then a Dabbler terminal built beside it -- the unsplit one
    // is replaced, not merely shown.
    assert.strictEqual(terminals.length, 3);
    assert.strictEqual(terminals[2].options.location?.parentTerminal, terminals[1]);
    assert.strictEqual(terminals[2].shown, 1);
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
    assert.strictEqual(await runStartSession(repository, ui), true);
    assert.strictEqual(terminals.length, 2);
    assert.deepStrictEqual(terminals[0].options.location, { viewColumn: vscode.ViewColumn.One });
    assert.ok(terminals[1].options.name.startsWith("Dabbler"));
    assert.deepStrictEqual(terminals[1].options.location, {
      viewColumn: vscode.ViewColumn.Beside,
    });
    assert.strictEqual(terminals[1].shown, 1);

    // A second Start in the same window costs no scrollback here: the
    // framework's tab is already where it belongs, so it is shown rather
    // than rebuilt -- which is the one thing the panel split cannot do.
    assert.strictEqual(await runStartSession(repository, ui), true);
    assert.strictEqual(terminals.length, 3);
    assert.strictEqual(terminals[1].disposed, 0);
    assert.strictEqual(terminals[1].shown, 2);
  });

  test("a seat without a model opens nothing, and a dismissed pick opens nothing", async () => {
    const repository = makeRepository();
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const seat = driveUi({ pickEngine: async () => copilot, askModel: async () => "" });
    assert.strictEqual(await runStartSession(repository, seat.ui), false);
    assert.ok(seat.errors[0].includes("needs a model"));
    const dismissed = driveUi({ pickEngine: async () => undefined });
    assert.strictEqual(await runStartSession(repository, dismissed.ui), false);
  });
});

suite("the driven session", () => {
  test("Start Unattended launches `session drive` for the chosen engine at the repository root and shows what the driver prints", async () => {
    const repository = makeRepository();
    const spawned = new Map<string, FakeDrive>();
    const launcher = launcherOf(spawned);
    const { ui, engine, infos } = driveUi();
    const drives = new Drives();

    assert.strictEqual(await runStartUnattendedSession(repository, ui, launcher, drives), true);
    assert.deepStrictEqual(launcher.launched, [
      {
        root: repository.root,
        args: ["session", "drive", "--engine", "claude-code", "--provider", "anthropic", "--model", "haiku"],
      },
    ]);
    // The driver's line reached the engine channel as it was printed.
    assert.ok(engine.some((line) => line.includes("engine-invoked")));
    assert.ok(drives.running(repository.root));

    // A second Start on the same repository launches nothing.
    const again = driveUi();
    assert.strictEqual(await runStartUnattendedSession(repository, again.ui, launcher, drives), false);
    assert.strictEqual(launcher.launched.length, 1);
    assert.ok(again.errors[0].includes("already being driven"));

    // When the driver exits, the drive is over and the person is told.
    spawned.get(repository.root)!.exit(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(drives.running(repository.root), undefined);
    assert.ok(infos.some((m) => m.includes("closed")));
  });

  test("a seat without a model launches nothing, and a dismissed pick launches nothing", async () => {
    const repository = makeRepository();
    const launcher = launcherOf(new Map());
    const copilot = ENGINES.find((e) => e.engine === "copilot")!;
    const seat = driveUi({ pickEngine: async () => copilot, askModel: async () => "" });
    assert.strictEqual(
      await runStartUnattendedSession(repository, seat.ui, launcher, new Drives()),
      false,
    );
    assert.ok(seat.errors[0].includes("needs a model"));
    const dismissed = driveUi({ pickEngine: async () => undefined });
    assert.strictEqual(
      await runStartUnattendedSession(repository, dismissed.ui, launcher, new Drives()),
      false,
    );
    assert.deepStrictEqual(launcher.launched, []);
  });

  test("Stop is `session interrupt --stop` with the person's reason, and only while something is driven", async () => {
    const repository = makeRepository();
    const { router, interruptOptions } = fakeRouter(0, "interrupt: stop requested");
    const drives = new Drives();
    const idle = driveUi();
    assert.strictEqual(await runStopDrive(repository, idle.ui, router, drives), false);
    assert.strictEqual(interruptOptions.length, 0);
    assert.ok(idle.infos[0].includes("Nothing is being driven"));

    drives.add(fakeDrive(repository.root).handle);
    const { ui } = driveUi();
    assert.strictEqual(await runStopDrive(repository, ui, router, drives), true);
    assert.strictEqual(interruptOptions.length, 1);
    assert.strictEqual(interruptOptions[0].stop, true);
    assert.strictEqual(interruptOptions[0].reason, DEFAULT_STOP_REASON);
    assert.strictEqual(interruptOptions[0].repoRoot, repository.root);
    assert.strictEqual(interruptOptions[0].sessionsDir, repository.sessionsDir);
  });

  test("Send is `session interrupt` with the text, and an empty box sends nothing", async () => {
    const repository = makeRepository();
    const { router, interruptOptions } = fakeRouter(0, "interrupt: requested");
    const drives = new Drives();
    drives.add(fakeDrive(repository.root).handle);
    const { ui } = driveUi();
    assert.strictEqual(await runSendToEngine(undefined, ui, router, drives), true);
    assert.deepStrictEqual(
      interruptOptions.map((o) => [o.reason, o.stop]),
      [["look at src/widget.py again", false]],
    );
    const empty = driveUi({ askText: async () => "   " });
    assert.strictEqual(await runSendToEngine(repository, empty.ui, router, drives), false);
    assert.strictEqual(interruptOptions.length, 1);
    // A refusal from the verb is shown, not swallowed.
    const refused = fakeRouter(3, "interrupt: refused -- session 001 is not being driven");
    const shown = driveUi();
    assert.strictEqual(await runSendToEngine(repository, shown.ui, refused.router, drives), false);
    assert.ok(shown.errors[0].includes("not being driven"));
  });

  test("the engine channel is created under the language its grammar colours", () => {
    // The contributed grammar reaches the channel by language id and no
    // other way: without it the driver's lines and the engine's arrive in
    // one undifferentiated colour. A channel created plain records none.
    const created = engineOutputChannel() as unknown as { languageId?: string };
    assert.strictEqual(created.languageId, "dabbler-drive");
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

suite("one click starts a focused session", () => {
  const focusedNext = (root: string, checkoutModule: string | null) =>
    makeRepository({
      root,
      currentSession: null,
      nextSession: 2,
      checkoutModule,
      sessions: [
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 2, status: "not-started", kind: "focused", module: "persister" }),
      ],
    });

  test("Start Focused Session on a module row opens the module and writes the start request, and Start Session in the repository does the same", async () => {
    const clone = makeTempDir("focused-clone-");
    try {
      const repository = focusedNext("D:\\ws\\csv-pipeline", null);
      const answered = fakeRouter(0, JSON.stringify({ slug: "persister", path: clone, branch: "main" }));
      const row = driveUi({ askModel: async () => "haiku" });
      assert.strictEqual(await runStartFocusedSession(repository, "persister", row.ui, answered.router), true);
      assert.deepStrictEqual(answered.asked, ["module open"]);
      assert.deepStrictEqual(row.opened, [clone]);
      // Nothing typed here: the window that opens on the clone does that.
      assert.deepStrictEqual(row.terminals, []);
      const request = JSON.parse(fs.readFileSync(path.join(clone, START_REQUEST_REL), "utf8")) as Record<string, unknown>;
      assert.strictEqual(request.engine, "claude-code");
      assert.strictEqual(request.provider, "anthropic");
      assert.strictEqual(request.model, "haiku");
      assert.strictEqual(request.unattended, false);
      assert.strictEqual(typeof request.writtenAt, "string");

      // The repository row's Start Session routes the same way when the next
      // session is focused and this is the repository -- and not in the
      // module's own folder, where it opens the AI here.
      const button = driveUi();
      assert.strictEqual(await runStartSession(repository, button.ui, answered.router), true);
      assert.deepStrictEqual(button.opened, [clone]);
      const inFolder = driveUi();
      assert.strictEqual(await runStartSession(focusedNext(clone, "persister"), inFolder.ui, answered.router), true);
      assert.deepStrictEqual(inFolder.opened, []);
      assert.strictEqual(inFolder.terminals.length, 1);
    } finally {
      rmrf(clone);
    }
  });

  test("a window activating on a fresh request opens the AI's terminal with the sentence, and a stale one is dropped", async () => {
    const clone = makeTempDir("focused-clone-");
    try {
      const repository = focusedNext(clone, "persister");
      const launcher = launcherOf(new Map());
      writeStartRequest(clone, {
        engine: "claude-code",
        provider: "anthropic",
        model: "",
        unattended: false,
        writtenAt: new Date().toISOString(),
      });
      const fresh = driveUi({ pickEngine: async () => undefined, askModel: async () => undefined });
      assert.strictEqual(await startFromRequest(repository, fresh.ui, launcher, new Drives()), true);
      assert.strictEqual(fresh.terminals.length, 1);
      assert.strictEqual(fresh.terminals[0].program, "claude");
      assert.match(fresh.terminals[0].args[0] ?? "", /dabbler session start .* --engine claude-code --provider anthropic/);
      assert.strictEqual(fs.existsSync(path.join(clone, START_REQUEST_REL)), false, "consumed");

      writeStartRequest(clone, {
        engine: "claude-code",
        provider: "anthropic",
        model: "",
        unattended: false,
        writtenAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      });
      const stale = driveUi();
      assert.strictEqual(await startFromRequest(repository, stale.ui, launcher, new Drives()), false);
      assert.strictEqual(stale.terminals.length, 0);
      assert.strictEqual(fs.existsSync(path.join(clone, START_REQUEST_REL)), false, "dropped");
      assert.strictEqual(await startFromRequest(repository, stale.ui, launcher, new Drives()), false);
    } finally {
      rmrf(clone);
    }
  });

  test("Resume Session shows the engine's terminal by name, or opens one running session run on the in-flight row", async () => {
    const repository = makeRepository({
      root: "D:\\ws\\csv-pipeline",
      currentSession: 2,
      nextSession: 2,
      sessions: [makeSession({ number: 2, status: "in-progress" })],
    });
    const shown: string[][] = [];
    const found = driveUi({ showTerminalNamed: (names) => { shown.push([...names]); return true; } });
    assert.strictEqual(await runResumeSession(repository, found.ui, "D:\\ext\\dabbler.cjs"), true);
    assert.ok(shown[0].includes("Claude Code"));
    assert.strictEqual(found.terminals.length, 0);

    const gone = driveUi();
    assert.strictEqual(await runResumeSession(repository, gone.ui, "D:\\ext\\dabbler.cjs"), true);
    assert.strictEqual(gone.terminals.length, 1);
    assert.strictEqual(gone.terminals[0].name, "Session 002");
    assert.strictEqual(gone.terminals[0].cwd, repository.root);
    assert.deepStrictEqual(gone.terminals[0].args.slice(1), ["session", "run", "--sessions-dir", "docs/sessions"]);

    const idle = driveUi();
    assert.strictEqual(await runResumeSession({ ...repository, currentSession: null }, idle.ui, "D:\\ext\\dabbler.cjs"), false);
    assert.strictEqual(idle.terminals.length, 0);
  });
});

suite("Open Module", () => {
  const multi: Projection = {
    solution: { name: "csv-pipeline", title: "csv-pipeline", multi: true, implicit: false, moduleCount: 2 },
    modules: [
      { slug: "model", title: "model", kind: "shared-types", package: "CsvModel", contract: "package", codeRoots: ["modules/model"], dependsOn: [], usedBy: ["persister"], contractDir: null },
      { slug: "persister", title: "persister", kind: "library", package: "CsvPersister", contract: "package", codeRoots: ["modules/persister"], dependsOn: ["model"], usedBy: [], contractDir: null },
    ],
  };
  function ui(): { ui: OpenModuleUi; opened: string[]; warnings: string[] } {
    const opened: string[] = [];
    const warnings: string[] = [];
    return {
      opened,
      warnings,
      ui: {
        openFolder: (path: string) => {
          opened.push(path);
          return Promise.resolve(undefined);
        },
        showWarningMessage: (m: string) => warnings.push(m),
        workspaceRoot: () => "D:\\ws\\csv-pipeline",
      },
    };
  }

  test("opens the path the router answered in a new window, and shows a refusal in the router's sentence", async () => {
    // The router's JSON is the source of the path; nothing here derives it.
    const answered = fakeRouter(0, JSON.stringify({ slug: "persister", path: "D:\\ws\\csv-pipeline.persister", branch: "main" }));
    const good = ui();
    await openModule(answered.router, { node: { kind: "module", slug: "persister" }, projection: multi }, good.ui);
    assert.deepStrictEqual(answered.asked, ["module open"]);
    assert.deepStrictEqual(good.opened, ["D:\\ws\\csv-pipeline.persister"]);
    assert.deepStrictEqual(good.warnings, []);

    // Refused: the router's own words, and no window.
    const refused = fakeRouter(1, "module open: refused -- D:\\ws\\csv-pipeline.persister already exists: pass --reset");
    const bad = ui();
    await openModule(refused.router, { node: { kind: "module", slug: "persister" }, projection: multi }, bad.ui);
    assert.deepStrictEqual(bad.opened, []);
    assert.deepStrictEqual(bad.warnings, ["module open: refused -- D:\\ws\\csv-pipeline.persister already exists: pass --reset"]);
  });

  test("Show Impact plans a hypothetical change under the module's roots and shows the router's plan, or its refusal", async () => {
    const plan =
      "scope: a hypothetical change of modules/persister\n" +
      "modules: persister\n" +
      "candidates: persister (packed before the run of record)\n" +
      "  module-changed         suite persister-unit (persister)  <- modules/persister\n";
    const answered = fakeRouter(0, plan);
    const logged: string[] = [];
    const infos: string[] = [];
    const warnings: string[] = [];
    const ui: ShowImpactUi = {
      showInformationMessage: (m: string) => infos.push(m),
      showWarningMessage: (m: string) => warnings.push(m),
      log: (text: string) => logged.push(text),
      workspaceRoot: () => "D:\\ws\\csv-pipeline",
    };
    await showImpact(answered.router, { node: { kind: "module", slug: "persister" }, projection: multi }, ui);
    // The router was asked for the module's roots, and its answer is shown whole and in brief.
    assert.deepStrictEqual(answered.affectedOptions.map((o) => o.paths), [["modules/persister"]]);
    assert.strictEqual(logged.length, 1);
    assert.ok(logged[0].includes("module-changed         suite persister-unit"));
    assert.strictEqual(infos.length, 1);
    assert.ok(infos[0].startsWith("persister: modules: persister · candidates: persister"));
    assert.deepStrictEqual(warnings, []);

    const refused = fakeRouter(1, "affected: testing.selection is malformed: rules[0] names no test");
    await showImpact(refused.router, { node: { kind: "module", slug: "persister" }, projection: multi }, ui);
    assert.deepStrictEqual(warnings, ["affected: testing.selection is malformed: rules[0] names no test"]);
    assert.strictEqual(infos.length, 1);
  });

  test("Pack Module packs the module the row carries and shows the router's lines, or its refusal", async () => {
    const lines =
      "packed persister 0.1.0-dev.20260908.1.gabc1234\n" +
      "  packages/CsvPersister.0.1.0-dev.20260908.1.gabc1234.nupkg\n" +
      "pinned CsvPersister in Directory.Packages.props\n" +
      "recorded packages/CsvPersister.0.1.0-dev.20260908.1.gabc1234.json\n";
    const answered = fakeRouter(0, lines);
    // The slug and the root the verb is asked for are the whole of what the
    // row contributes; the fake answers whatever it is asked, so they are
    // caught on the way through.
    const packed: { workspaceRoot: string; slug: string }[] = [];
    const router = {
      module: {
        ...answered.router.module,
        pack: (o: { workspaceRoot: string; slug: string }) => {
          packed.push({ workspaceRoot: o.workspaceRoot, slug: o.slug });
          return answered.router.module.pack(o);
        },
      },
    };
    const logged: string[] = [];
    const infos: string[] = [];
    const warnings: string[] = [];
    const ui: PackModuleUi = {
      showInformationMessage: (m: string) => infos.push(m),
      showWarningMessage: (m: string) => warnings.push(m),
      log: (text: string) => logged.push(text),
      workspaceRoot: () => "D:\\ws\\csv-pipeline",
    };
    await packModule(router, { node: { kind: "module", slug: "persister" }, projection: multi }, ui);
    assert.deepStrictEqual(packed, [{ workspaceRoot: "D:\\ws\\csv-pipeline", slug: "persister" }]);
    assert.deepStrictEqual(answered.asked, ["module pack"]);
    // The whole answer in the channel; the `packed` line as the message.
    assert.strictEqual(logged.length, 1);
    assert.ok(logged[0].includes("pinned CsvPersister in Directory.Packages.props"));
    assert.deepStrictEqual(infos, ["persister: packed persister 0.1.0-dev.20260908.1.gabc1234"]);
    assert.deepStrictEqual(warnings, []);

    // Refused: the router's own sentence, and no message claiming a pack.
    const refusal = "module pack: refused -- module 'persister' declares contract: package and has no notes page";
    const refused = fakeRouter(1, refusal);
    await packModule(refused.router, { node: { kind: "module", slug: "persister" }, projection: multi }, ui);
    assert.deepStrictEqual(warnings, [refusal]);
    assert.strictEqual(infos.length, 1);
    assert.strictEqual(logged.length, 1);
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
  function capturingUi(): {
    ui: ConfigurationUi;
    offered: vscode.QuickPickItem[];
    /** The options the list was offered WITH, which is where the help line rides. */
    options: vscode.QuickPickOptions[];
    informed: string[];
  } {
    const offered: vscode.QuickPickItem[] = [];
    const options: vscode.QuickPickOptions[] = [];
    const informed: string[] = [];
    return {
      offered,
      options,
      informed,
      ui: {
        confirm: () => Promise.resolve(false),
        runVerb: () => undefined,
        pick: (items, pickOptions) => {
          offered.push(...items);
          options.push(pickOptions);
          return Promise.resolve(undefined);
        },
        showInformationMessage: (message) => informed.push(message),
        showWarningMessage: () => undefined,
        workspaceRoot: () => "D:/ws",
      },
    };
  }

  const model = (over: Partial<ConfigurationModel>): ConfigurationModel => ({
    alias: "a", model: "a-model", provider: "anthropic", ...over,
  });

  test("offers each model with what the record says about it, so the choice is not made blind", async () => {
    // The row already said it; the LIST is where the choice is actually
    // made, and a model nothing vouches for sitting beside one a provider
    // has vouched for, with nothing to tell them apart, is the promise
    // session 144 exists to stop this surface making.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: {
        fidelityTransport: "api",
        primaryReviewer: {
          role: "verifier",
          chosen: null,
          candidates: [
            model({ alias: "vouched", model: "o-vouched", provider: "openai", fidelity: "honoured" }),
            model({ alias: "silent", model: "o-silent", provider: "openai", fidelity: "not-known" }),
          ],
          excludes: ["anthropic"],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const { ui, offered } = capturingUi();
    const { router } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "primaryReviewer" }, projection },
      () => undefined,
      ui,
    );
    assert.strictEqual(offered.length, 2);
    assert.ok(offered[0].description?.includes("answers as itself"), offered[0].description);
    assert.ok(offered[1].description?.includes("not known"), offered[1].description);
    // And what the answer is an answer ABOUT travels with it.
    assert.ok(offered[0].description?.includes("api"));
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
        fidelityTransport: "copilot-cli",
        primaryReviewer: {
          role: "verifier",
          chosen: null,
          candidates: [
            model({
              alias: "mate",
              model: "claude-opus-5",
              provider: "anthropic",
              providerRelation: "same-provider",
              priceCategory: "high",
            }),
            model({
              alias: "other",
              model: "gpt-5.6-terra",
              provider: "openai",
              providerRelation: "different-provider",
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
      () => undefined,
      ui,
    );
    assert.ok(offered[0].description?.includes("same provider"), offered[0].description);
    assert.ok(offered[0].description?.includes("high price"), offered[0].description);
    assert.ok(offered[1].description?.includes("different provider"), offered[1].description);
    // Nothing said, nothing shown: no price is invented for the second.
    assert.ok(!offered[1].description?.includes("price"), offered[1].description);
    // And the one line of help travels with the list, where the choice is made.
    assert.ok(options[0]?.placeHolder?.includes("blind spots"), options[0]?.placeHolder);
  });

  test("does not offer to set the authoring model, because the ledger would not honour it", async () => {
    // It is the engine's, declared when the session is registered. The pane used to
    // write a role that nothing dispatched, so the control appeared to work
    // and changed nothing about which model authored anything.
    const projection = {
      solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
      configuration: { authoring: { role: "authoring", chosen: null, candidates: [], excludes: [], fellThrough: false } },
    } as unknown as Projection;
    const { ui, offered, informed } = capturingUi();
    const { router, configureOptions } = fakeRouter(0, "");
    await setRoleModel(
      router,
      { node: { kind: "configRole", role: "authoring" }, projection },
      () => undefined,
      ui,
    );
    assert.strictEqual(offered.length, 0);
    assert.strictEqual(configureOptions.length, 0);
    assert.ok(informed.some((line) => line.includes("session start")), informed.join(" | "));
  });

  test("states a vehicle with one option and asks about one with two, picking neither on its own", async () => {
    // A vehicle is offered wherever more than one is PRESENT, and a machine
    // that can reach only one is told what carries the role rather than
    // asked a question with one answer. Nothing is picked for the operator:
    // the pick that returns undefined writes nothing at all.
    const withVehicle = (options: Array<{ id: string; means: string }>): Projection =>
      ({
        solution: { name: "r", title: "r", multi: false, implicit: true, moduleCount: 1 },
        modules: [],
        configuration: {
          fidelityTransport: "api",
          primaryReviewer: {
            role: "reviewer",
            vehicle: { kind: "transport", options, chosen: "api", withheld: [] },
            chosen: null,
            candidates: [model({ alias: "one", model: "o-one", provider: "openai" })],
            excludes: [],
            fellThrough: false,
          },
        },
      }) as unknown as Projection;

    // One reachable vehicle: the first question asked is about the MODEL.
    const single = capturingUi();
    await setRoleModel(
      fakeRouter(0, "").router,
      {
        node: { kind: "configRole", role: "primaryReviewer" },
        projection: withVehicle([{ id: "api", means: "the provider's own endpoint" }]),
      },
      () => undefined,
      single.ui,
    );
    assert.strictEqual(single.options.length, 1);
    assert.ok(single.options[0]?.title?.includes("model"), single.options[0]?.title);

    // Two reachable vehicles: the first question asked is about the VEHICLE,
    // and cancelling it writes nothing.
    const pair = capturingUi();
    const { router, configureOptions } = fakeRouter(0, "");
    await setRoleModel(
      router,
      {
        node: { kind: "configRole", role: "primaryReviewer" },
        projection: withVehicle([
          { id: "api", means: "the provider's own endpoint" },
          { id: "copilot-cli", means: "a Copilot seat" },
        ]),
      },
      () => undefined,
      pair.ui,
    );
    assert.ok(pair.options[0]?.title?.includes("carries"), pair.options[0]?.title);
    assert.deepStrictEqual(
      pair.offered.map((item) => item.label),
      ["api", "copilot-cli"],
    );
    assert.strictEqual(configureOptions.length, 0);
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
          chosen: model({ alias: "p", model: "gpt-5.6-terra", provider: "openai" }),
          candidates: [model({ alias: "p", model: "gpt-5.6-terra", provider: "openai" })],
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
          candidates: [model({ alias: "aux", model: "gemini-3.1-pro-preview", provider: "google" })],
          excludes: [],
          fellThrough: false,
        },
      },
    } as unknown as Projection;
    const picked: vscode.QuickPickItem[] = [];
    const options: vscode.QuickPickOptions[] = [];
    const ui: ConfigurationUi = {
      confirm: () => Promise.resolve(false),
      runVerb: () => undefined,
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
    let asked = "";
    const ui: ConfigurationUi = {
      confirm: (message) => {
        asked = message;
        return Promise.resolve(true);
      },
      runVerb: (_title, _cwd, args) => ran.push(args),
      pick: () => Promise.resolve(undefined),
      showInformationMessage: () => undefined,
      showWarningMessage: () => undefined,
      workspaceRoot: () => "D:/ws",
    };

    await refreshRecord({ node: { kind: "configuration" }, projection: PROJECTION }, ui);
    assert.deepStrictEqual(ran, [["discovery", "refresh"]]);
    assert.ok(asked.includes("Nothing."), asked);
    assert.ok(asked.includes(ROW.command), asked);
  });
});
