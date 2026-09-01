import * as assert from "assert";
import * as vscode from "vscode";
import {
  CancellableSession,
  CancelLifecycleUi,
  runCancelSessionFlow,
  runRestoreSessionFlow,
} from "../../commands/cancelLifecycleCommands";
import { NewModuleUi, runNewModuleFlow } from "../../commands/newModule";
import {
  SetUpProjectUi,
  offerDeferredStart,
  runSetUpProjectFlow,
} from "../../commands/bootstrapProject";
import {
  DEFAULT_STOP_REASON,
  Drives,
  ENGINES,
  type DriveLauncher,
  type SessionRunUi,
  defaultSessionRunUi,
  engineOutputChannel,
  runSendToEngine,
  runStartSession,
  runStartUnattendedSession,
  runStopDrive,
} from "../../commands/sessionCommands";
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

  test("creates the project when VS Code has no folder open at all", async () => {
    // The one onboarding path this command exists for, and the one it used
    // to refuse outright.
    const { ui } = setUpUi(undefined, { newFolder: "D:\\fresh" });
    assert.strictEqual(await runSetUpProjectFlow(ui, fakeRouter(0).router), true);
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

  test("does not change how this machine routes, to set up one project", async () => {
    // `bootstrap` otherwise persists DABBLER_TRANSPORT at USER scope. That is
    // right for a person running it at a terminal and wrong for a click: a
    // side effect somebody finds weeks later debugging a different repo.
    const fake = fakeRouter(0);
    const { ui } = setUpUi("D:\\ws");
    await runSetUpProjectFlow(ui, fake.router);
    assert.strictEqual(fake.bootstrapOptions[0]?.noTransportDetect, true);
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
} {
  const errors: string[] = [];
  const infos: string[] = [];
  const engine: string[] = [];
  const ui: SessionRunUi = {
    pickEngine: async () => ENGINES[0],
    askModel: async () => "haiku",
    askText: async (_title, _prompt, value) => value ?? "look at src/widget.py again",
    pickDrive: async (roots) => roots[0],
    report: () => undefined,
    showErrorMessage: (m: string) => errors.push(m),
    showInformationMessage: (m: string) => infos.push(m),
    engineLine: (line) => engine.push(line),
    openTerminal: () => undefined,
    showFrameworkTerminal: () => undefined,
    withProgress: (_title, work) => work(),
    ...overrides,
  };
  return { ui, errors, infos, engine };
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
    assert.match(cli.options.shellArgs[0], /dabbler session next .*--engine claude-code/);
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
