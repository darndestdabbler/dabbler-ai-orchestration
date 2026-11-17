// The Dabbler terminal: the VS Code terminal around the router's lines.
//
// What a line says is `TerminalLines`' and is tested in the router
// (`packages/router/test/terminalLines.test.ts`). What is asserted here is
// what this extension adds: that the pty writes exactly what the lines
// write, follows the editor's theme, shows a notice as a warning, opens
// where the setting says and comes into view when a session starts.

import * as assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TerminalLines, WORK_STEP_PREFIX, createInProcessRouter, paint, type Router, type Tone } from "dabbler-ai-router";

import {
  DabblerTerminal,
  disposeDabblerTerminals,
  ensureDabblerTerminal,
  forgetClosedTerminal,
  frameworkTerminalLocation,
  isSessionStart,
  openDabblerTerminal,
  revealDabblerTerminal,
  revealOnSessionStart,
  terminalLocation,
  watcherThreshold,
} from "../../router/dabblerTerminal";
import { makeTempDir, rmrf } from "./helpers";

const ESC = "\u001b";
const CLOCK = (): Date => new Date(2026, 7, 31, 14, 30, 5);

/** A repository with one driven run, and the writes the pty received. */
function drivenRepo(run: Record<string, unknown>, warned: string[] = []): {
  root: string;
  driver: string;
  written: string[];
  terminal: DabblerTerminal;
} {
  const root = makeTempDir("dabbler-terminal-");
  const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
  fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(run), "utf8");
  const written: string[] = [];
  const terminal = new DabblerTerminal({
    repoRoot: root,
    now: CLOCK,
    // The interval is not the behaviour; every test drives `poll` itself.
    pollMs: 60_000,
    warn: (message) => warned.push(message),
  });
  terminal.onDidWrite((text: string) => written.push(text));
  return { root, driver, written, terminal };
}

function writeRun(driver: string, run: Record<string, unknown>): void {
  fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(run), "utf8");
}

/** The stub keeps the theme the previous test left; every test that reads a
 *  colour says which one it means. */
function useTheme(kind: number): void {
  (vscode.window as unknown as { __setColorTheme: (k: number) => void }).__setColorTheme(kind);
}

/** The foreground one tone renders as, without the text around it. */
function toneOf(tone: Tone, kind: "dark" | "light"): string {
  return paint("", tone, kind).split("m")[0] + "m";
}

const RUNNING = {
  session_number: 62,
  phase: "verify",
  stop: null,
  job: { name: "verification round", log: ".dabbler/runs/s62/driver/jobs/verification-round.log" },
};

suite("the Dabbler terminal", () => {
  test("writes exactly what the router's lines write, byte for byte", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, written, terminal } = drivenRepo(RUNNING);
    const direct: string[] = [];
    const lines = new TerminalLines({
      repoRoot: root,
      write: (text) => direct.push(text),
      now: CLOCK,
      pollMs: 60_000,
      theme: "dark",
    });
    const both = (act: () => void): void => {
      act();
      terminal.poll();
      lines.poll();
      terminal.tick();
      lines.tick();
    };
    terminal.open({ columns: 72, rows: 20 });
    lines.start(72);
    both(() => fs.writeFileSync(path.join(driver, "jobs", "verification-round.log"), `${ESC}[32m✓${ESC}[0m 214 passed\n`, "utf8"));
    both(() =>
      writeRun(driver, {
        session_number: 62,
        phase: "verify",
        job: null,
        stop: { kind: "land", reason: "git push failed:\nremote: permission denied", at: "2026-08-31T14:00:00-04:00" },
      }),
    );
    assert.ok(written.join("").includes("214 passed"));
    assert.strictEqual(written.join(""), direct.join(""));

    terminal.dispose();
    lines.dispose();
    rmrf(root);
  });

  test("re-reads the theme when it changes rather than painting the old palette", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.open();
    // The first look says `phase=verify`, a milestone, in the dark palette.
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "dark"))));

    written.length = 0;
    useTheme(vscode.ColorThemeKind.Light);
    writeRun(driver, { session_number: 62, phase: "close", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "light"))));
    assert.ok(!written.some((t) => t.includes(toneOf("milestone", "dark"))));

    terminal.dispose();
    rmrf(root);
  });

  test("shows a stop's notice where the operator is, once, in the notice's own words", () => {
    // A stop the framework cannot cure waits for a person, and a person in
    // the AI's chat or another window has no way of knowing one is waiting
    // for them.
    const warned: string[] = [];
    const { root, driver, terminal } = drivenRepo(RUNNING, warned);
    terminal.open();
    warned.length = 0;

    writeRun(driver, {
      session_number: 62,
      phase: "close",
      job: null,
      stop: {
        kind: "close",
        reason: "the close refused: test_run_fresh failed. Run the suite again and close.",
        at: "2026-08-31T14:00:00-04:00",
      },
    });
    terminal.poll();
    assert.strictEqual(warned.length, 1);
    assert.ok(warned[0].includes("session 062 is paused (close)"), warned[0]);
    assert.ok(warned[0].includes("the close refused: test_run_fresh failed."), warned[0]);
    assert.ok(!warned[0].includes("Run the suite again"), warned[0]);
    assert.match(warned[0], /act\(s\) next/);

    terminal.poll();
    assert.strictEqual(warned.length, 1);

    terminal.dispose();
    rmrf(root);
  });

  test("stops when the terminal goes away", () => {
    // An animation is never a reason for the extension host to stay alive.
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, terminal, written } = drivenRepo(RUNNING);
    terminal.open();
    terminal.dispose();
    written.length = 0;
    terminal.tick();
    assert.strictEqual(written.join(""), "");
    rmrf(root);
  });
});

/** What the stub recorded of every `window.createTerminal` call. */
interface FakeTerminal {
  options: { name: string; location?: unknown; pty?: unknown };
  shown: number;
  /** What the last `show()` asked for; undefined until one is made. */
  preserveFocus?: boolean;
}

function createdTerminals(): FakeTerminal[] {
  return (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
}

function lastTerminal(): FakeTerminal {
  const all = createdTerminals();
  return all[all.length - 1];
}

suite("where Start puts the two terminals", () => {
  const stub = vscode.workspace as unknown as {
    __setConfig: (section: string, key: string, value: unknown) => void;
    __clearConfig: () => void;
  };

  teardown(() => {
    stub.__clearConfig();
  });

  test("defaults to the editor area, and reads an unknown value as the default", () => {
    // The operator's call: the pair is what a session is read through, and
    // the editor area gives both of them the height a transcript wants.
    stub.__clearConfig();
    assert.strictEqual(terminalLocation(), "editor");
    // A typo in settings.json, or a value from a newer version, must not
    // leave someone with a window that cannot open a terminal at all.
    stub.__setConfig("dabbler", "terminalLocation", "beside-the-minimap");
    assert.strictEqual(terminalLocation(), "editor");
  });

  test("puts the framework's terminal in the next editor column, or splits the CLI", () => {
    const cli = { name: "Claude Code" } as unknown as vscode.Terminal;
    assert.deepStrictEqual(frameworkTerminalLocation("editor", cli), {
      viewColumn: vscode.ViewColumn.Beside,
    });
    assert.deepStrictEqual(frameworkTerminalLocation("editor", undefined), {
      viewColumn: vscode.ViewColumn.Beside,
    });
    assert.deepStrictEqual(frameworkTerminalLocation("panel", cli), { parentTerminal: cli });
    assert.strictEqual(frameworkTerminalLocation("panel", undefined), undefined);
  });

  test("opens the framework's terminal where the setting says, and shows it", () => {
    stub.__setConfig("dabbler", "terminalLocation", "panel");
    const root = makeTempDir("dabbler-placement-");
    const cli = { name: "Claude Code" } as unknown as vscode.Terminal;
    ensureDabblerTerminal(root, cli);
    const panelTerminal = lastTerminal();
    assert.deepStrictEqual(panelTerminal.options.location, { parentTerminal: cli });
    assert.ok(panelTerminal.shown > 0);

    // The same repository under `editor` is a different location, so the
    // one that cannot be moved is replaced rather than shown in the wrong
    // half of the arrangement.
    disposeDabblerTerminals().dispose();
    stub.__setConfig("dabbler", "terminalLocation", "editor");
    ensureDabblerTerminal(root, cli);
    assert.deepStrictEqual(lastTerminal().options.location, {
      viewColumn: vscode.ViewColumn.Beside,
    });

    // And a second session's CLI does NOT cost the operator their
    // scrollback under `editor`: the tab is already where it belongs.
    const built = createdTerminals().length;
    ensureDabblerTerminal(root, { name: "a second CLI" } as unknown as vscode.Terminal);
    assert.strictEqual(createdTerminals().length, built);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });
});

suite("a session starting brings the framework's terminal into view", () => {
  test("a start shows it; activation, a scan and a close do not", () => {
    assert.strictEqual(isSessionStart(null, 5), true);
    assert.strictEqual(isSessionStart(4, 5), true, "one closing and the next registering");
    assert.strictEqual(isSessionStart(5, 5), false, "the same reading again");
    assert.strictEqual(isSessionStart(5, null), false, "a session ending opens nothing");
    assert.strictEqual(isSessionStart(null, null), false);
    // No previous reading: this window has just activated, and a session
    // already running was not started by anything the operator did here.
    assert.strictEqual(isSessionStart(undefined, 5), false);

    const root = makeTempDir("dabbler-onstart-");
    const built = createdTerminals().length;
    revealOnSessionStart(root, null);
    assert.strictEqual(createdTerminals().length, built);

    revealOnSessionStart(root, 91);
    const terminal = lastTerminal();
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(terminal.shown, 1);
    // Focus stays where the operator is typing.
    assert.strictEqual(terminal.preserveFocus, true);

    revealOnSessionStart(root, 91);
    revealOnSessionStart(root, 91);
    assert.strictEqual(terminal.shown, 1);

    revealOnSessionStart(root, null);
    assert.strictEqual(terminal.shown, 1);

    revealOnSessionStart(root, 92);
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(terminal.shown, 2);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });

  test("shows itself when a run begins after it was built, from the run record and without the Explorer", () => {
    const root = makeTempDir("dabbler-runstart-");
    const older = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(older, { recursive: true });
    writeRun(older, {
      session_number: 62,
      phase: "complete",
      job: null,
      stop: null,
      started_at: "2026-08-31T13:00:00.000Z",
    });
    openDabblerTerminal(root);
    const terminal = lastTerminal();
    const pty = terminal.options.pty as DabblerTerminal;
    pty.poll();
    // Already there when the terminal was built: the state of the world,
    // not a start.
    assert.strictEqual(terminal.shown, 0);

    const newer = path.join(root, ".dabbler", "runs", "s63", "driver");
    fs.mkdirSync(newer, { recursive: true });
    writeRun(newer, {
      session_number: 63,
      phase: "plan",
      job: null,
      stop: null,
      started_at: new Date().toISOString(),
    });
    pty.poll();
    assert.strictEqual(terminal.shown, 1);
    assert.strictEqual(terminal.preserveFocus, true);
    pty.poll();
    assert.strictEqual(terminal.shown, 1);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });
});

suite("the way back to the framework terminal", () => {
  test("builds one when the person closed it, and shows the one that is open", () => {
    const root = makeTempDir("dabbler-reveal-");
    openDabblerTerminal(root);
    const first = lastTerminal();
    const built = createdTerminals().length;

    revealDabblerTerminal(root);
    assert.strictEqual(createdTerminals().length, built);
    assert.strictEqual(first.shown, 1);

    // Closed by the person: the map lets go of it, so the next request
    // builds a live one rather than calling show() on a disposed terminal.
    forgetClosedTerminal(first as unknown as vscode.Terminal);
    revealDabblerTerminal(root);
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(lastTerminal().shown, 1);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });
});

suite("the watcher's threshold", () => {
  const stub = vscode.workspace as unknown as {
    __setConfig: (section: string, key: string, value: unknown) => void;
    __clearConfig: () => void;
  };

  test("takes the operator's threshold over the repository's", () => {
    const root = makeTempDir("dabbler-threshold-");
    // No setting: the repository answers, and an unconfigured one answers
    // with the framework's own default.
    stub.__clearConfig();
    assert.strictEqual(watcherThreshold(root), 1800);
    stub.__setConfig("dabbler", "stalledAfterSeconds", 90);
    assert.strictEqual(watcherThreshold(root), 90);
    stub.__clearConfig();
    rmrf(root);
  });
});

suite("DabblerTerminal: the two surfaces over one record", () => {
  const ESC = "\u001b";

  /** The bytes a pty received, with the SGR sequences taken back out. */
  function plain(text: string): string {
    return text
      .split(ESC)
      .map((piece, index) => (index === 0 ? piece : piece.slice(piece.indexOf("m") + 1)))
      .join("");
  }

  /** The step the terminal last announced, from what it actually wrote. */
  function announced(written: readonly string[]): string | null {
    const said = [...plain(written.join("")).matchAll(/step id=(\S+)/g)];
    return said.length === 0 ? null : (said[said.length - 1]?.[1] ?? null);
  }

  /** The step the Work Explorer shows as the open child of its Work row. */
  async function shown(router: Router, root: string, sessionsDir: string): Promise<string | null> {
    const projection = await router.progress({ repoRoot: root, sessionsDir });
    assert.ok(projection.ok, JSON.stringify(projection));
    const session = projection.value.sessions.find((row) => row.number === 1);
    const open = (session?.tasks ?? []).find(
      (row) => row.isOpen && (row.stepId ?? "").startsWith(WORK_STEP_PREFIX),
    );
    return open ? (open.stepId ?? "").slice(WORK_STEP_PREFIX.length) : null;
  }

  test("the terminal and the Work Explorer name the same step, from one instruction at one seq", async () => {
    // The point is not that each surface renders something -- both did, and
    // that is exactly why they were free to disagree. They are fed by one
    // record, and when they disagree the operator cannot tell which is
    // lying. So: one driver directory, and the same answer out of both, at
    // two different seqs, so a fixed answer cannot pass twice.
    const root = makeTempDir("dabbler-parity-");
    const sessionsDir = path.join(root, "docs", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, "session-plan.md"),
      "### Session 1 of 1: Build the widget\n1. Register.\n",
      "utf8",
    );
    // `start` asks the declaration's own question first -- whether work has
    // begun in the tree -- so the fixture is a git repository with its plan
    // committed, the state a repository is in when a session starts.
    for (const args of [
      ["init", "-q"],
      ["add", "-A"],
      ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "plan"],
    ]) {
      const git = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      assert.strictEqual(git.status, 0, `git ${args.join(" ")}: ${git.stdout}${git.stderr}`);
    }

    // `start` refuses an engine whose CLI is not on PATH, and the suite may
    // not read this machine's PATH -- so it builds the one it needs. Both
    // spellings, so the lookup finds one on either platform; nothing runs.
    const bin = makeTempDir("dabbler-parity-bin-");
    fs.writeFileSync(path.join(bin, "claude"), "#!/bin/sh\n", "utf8");
    fs.writeFileSync(path.join(bin, "claude.cmd"), "@echo off\n", "utf8");
    // `start` also refreshes the catalog when this machine has a seat login or
    // a provider key, and then asks it for a Primary Reviewer outside the
    // author's provider. The suite may read neither, so the home is empty, no
    // key is set, nothing is due, and the reviewer is the one model the
    // catalog is seeded with -- a seat block read for no login, which is what
    // an empty home believes.
    const home = makeTempDir("dabbler-parity-home-");
    const catalogPath = process.env.DABBLER_CATALOG_PATH as string;
    const savedCatalog = fs.existsSync(catalogPath) ? fs.readFileSync(catalogPath, "utf8") : null;
    const now = new Date().toISOString();
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        schema_version: 1,
        written_by: "workExplorerTreeModel.test.ts",
        written_at: now,
        transports: {
          "copilot-cli": {
            refreshed_at: now,
            source: "acp-session-new",
            scope: {},
            models: [
              {
                id: "gpt-5.4",
                provider: "openai",
                provider_source: "openai",
                display_name: "GPT-5.4",
                enabled: true,
                price_category: null,
                cost: null,
                listed_at: now,
              },
            ],
            retired: [],
          },
        },
      }),
      "utf8",
    );
    const saved = new Map<string, string | undefined>();
    const set = (name: string, value: string | undefined): void => {
      if (!saved.has(name)) saved.set(name, process.env[name]);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    set("PATH", [bin, process.env.PATH ?? ""].join(path.delimiter));
    set("PATHEXT", ".COM;.EXE;.BAT;.CMD");
    set("HOME", home);
    set("USERPROFILE", home);
    for (const name of Object.keys(process.env).filter((key) => /^DABBLER_.*_API_KEY$/.test(key))) {
      set(name, undefined);
    }
    const router = createInProcessRouter();
    let started;
    try {
      started = await router.session.start({
        engine: "claude-code",
        provider: "anthropic",
        repoRoot: root,
        sessionsDir,
      });
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (savedCatalog === null) fs.rmSync(catalogPath, { force: true });
      else fs.writeFileSync(catalogPath, savedCatalog, "utf8");
    }
    assert.ok(started.ok, JSON.stringify(started));

    const driver = path.join(root, ".dabbler", "runs", "s1", "driver");
    fs.mkdirSync(driver, { recursive: true });
    const steps = ["widget", "polish", "ship"];
    fs.writeFileSync(
      path.join(driver, "plan.json"),
      JSON.stringify({
        schema_version: 1,
        session_number: 1,
        task: "Do it.",
        non_goals: ["Anything the step does not name."],
        recorded_at: "2026-09-09T11:00:00-04:00",
        steps: steps.map((id) => ({
          id,
          ask: `Do the ${id}. Then check it.`,
          files: ["src/w.ts"],
          checks: [{ argv: ["true"] }],
        })),
      }),
      "utf8",
    );

    const written: string[] = [];
    const terminal = new DabblerTerminal({ repoRoot: root, pollMs: 60_000 });
    terminal.onDidWrite((text: string) => written.push(text));
    terminal.open({ columns: 100, rows: 20 });

    // Two moments of one run: the second step outstanding, then the third.
    for (const [seq, accepted] of [
      [5, ["widget"]],
      [6, ["widget", "polish"]],
    ] as ReadonlyArray<readonly [number, readonly string[]]>) {
      const outstanding = steps[accepted.length];
      fs.writeFileSync(
        path.join(driver, "instruction.json"),
        JSON.stringify({
          schema_version: 1,
          seq,
          session_number: 1,
          issued_at: "2026-09-09T11:30:00-04:00",
          kind: "step",
          step_id: outstanding,
          ask: `Do the ${outstanding}. Then check it.`,
        }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(driver, "run.json"),
        JSON.stringify({
          schema_version: 1,
          session_number: 1,
          engine: "cli",
          phase: "work",
          seq,
          invocations: 1,
          max_invocations: 24,
          accepted_steps: [...accepted],
          baseline_tree: null,
          stop: null,
          started_at: "2026-09-09T11:00:00-04:00",
          updated_at: "2026-09-09T11:30:00-04:00",
        }),
        "utf8",
      );

      terminal.poll();
      const fromTerminal = announced(written);
      const fromExplorer = await shown(router, root, sessionsDir);
      assert.strictEqual(fromTerminal, fromExplorer, `seq ${seq}: ${plain(written.join(""))}`);
      assert.strictEqual(fromTerminal, outstanding, `seq ${seq}`);
    }

    terminal.dispose();
    rmrf(root);
  });
});
