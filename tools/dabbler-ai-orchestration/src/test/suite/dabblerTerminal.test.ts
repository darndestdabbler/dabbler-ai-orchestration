// The Dabbler terminal: the VS Code terminal around the router's lines.
//
// What a line says is `TerminalLines`' and is tested in the router
// (`packages/router/test/terminalLines.test.ts`). What is asserted here is
// what this extension adds: that the pty writes exactly what the lines
// write, follows the editor's theme, shows a notice as a warning, opens
// where the setting says and comes into view when a session starts.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TerminalLines, paint, type Tone } from "dabbler-ai-router";

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
