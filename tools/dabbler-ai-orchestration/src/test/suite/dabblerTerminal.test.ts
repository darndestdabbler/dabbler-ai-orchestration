// The Dabbler terminal: the framework's background work, and nothing else.
//
// What is asserted is what reaches the pty -- the framework's own lines
// under their band, and a job's bytes exactly as the runner wrote them.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
  BAND_DARK,
  BAND_LIGHT,
  DabblerTerminal,
  TONES,
  type Tone,
  bandedLine,
  disposeDabblerTerminals,
  ensureDabblerTerminal,
  forgetClosedTerminal,
  frameworkTerminalLocation,
  openDabblerTerminal,
  revealDabblerTerminal,
  lineTone,
  paint,
  terminalLocation,
  watcherLookMs,
  watcherThreshold,
} from "../../router/dabblerTerminal";
import { makeTempDir, rmrf } from "./helpers";

const ESC = "\u001b";

/** A repository with one driven run, and the writes the pty received. */
function drivenRepo(run: Record<string, unknown>): {
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
    now: () => new Date(2026, 7, 31, 14, 30, 5),
    // The interval is not the behaviour; every test drives `poll` itself.
    pollMs: 60_000,
  });
  terminal.onDidWrite((text: string) => written.push(text));
  return { root, driver, written, terminal };
}

function writeRun(driver: string, run: Record<string, unknown>): void {
  fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(run), "utf8");
}

/**
 * One of the framework's lines with every SGR sequence taken out.
 *
 * The grammar and the colour are two separate claims and are asserted
 * separately: what the line SAYS is checked here, and what it is painted is
 * checked by the tests that look for a tone. Written without a regular
 * expression carrying an escape literal -- each piece after an ESC begins
 * with the sequence's own parameters and ends at its `m`.
 */
function plain(text: string): string {
  return text
    .split(ESC)
    .map((piece, index) => (index === 0 ? piece : piece.slice(piece.indexOf("m") + 1)))
    .join("");
}

/** The stub keeps the theme the previous test left; every test that reads a
 *  colour says which one it means. */
function useTheme(kind: number): void {
  (vscode.window as unknown as { __setColorTheme: (k: number) => void }).__setColorTheme(kind);
}

const RUNNING = {
  session_number: 62,
  phase: "verify",
  stop: null,
  job: { name: "verification round", log: ".dabbler/runs/s62/driver/jobs/verification-round.log" },
};

suite("the Dabbler terminal", () => {
  test("passes a job's log through byte for byte, escapes included", () => {
    const { root, driver, written, terminal } = drivenRepo(RUNNING);
    const log = path.join(driver, "jobs", "verification-round.log");
    // What a real runner writes: a colour opened, a glyph, a reset.
    const runnerOutput = `${ESC}[32m✓${ESC}[0m 214 passed\n`;
    fs.writeFileSync(log, runnerOutput, "utf8");

    terminal.poll();
    const passthrough = written.filter((text) => text.includes("214 passed"));
    assert.strictEqual(passthrough.length, 1);
    // The colour, the checkmark and the reset all survive: stripping them
    // here would undo the whole reason this is a terminal.
    assert.ok(passthrough[0].includes(`${ESC}[32m`));
    assert.ok(passthrough[0].includes("✓"));
    assert.ok(passthrough[0].includes(`${ESC}[0m`));
    // The one rendering exception, and it is not a content change: a pty
    // that receives a bare LF staircases every line after it.
    assert.ok(passthrough[0].endsWith("\r\n"));
    assert.strictEqual(passthrough[0].replace(/\r\n/g, "\n"), runnerOutput);

    // Only what is new since the last look, so a long run is not replayed.
    written.length = 0;
    fs.appendFileSync(log, "second line\n", "utf8");
    terminal.poll();
    assert.deepStrictEqual(
      written.filter((t) => t.includes("passed")),
      [],
    );
    assert.ok(written.some((t) => t.includes("second line")));

    terminal.dispose();
    rmrf(root);
  });

  test("says working while a job runs and waiting when none does, once each way", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
    assert.strictEqual(terminal.indicator, "working");
    assert.ok(written.some((t) => plain(t).includes("job-started name=verification round")));
    // Said, not merely held: a getter no surface renders answers nobody.
    assert.strictEqual(written.filter((t) => plain(t).includes("] working")).length, 1);
    // And not repeated on every look while nothing has changed.
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("] working")), []);

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.strictEqual(terminal.indicator, "waiting");
    assert.ok(written.some((t) => plain(t).includes("job-collected")));
    assert.strictEqual(written.filter((t) => plain(t).includes("] waiting")).length, 1);
    // The record moving is an event of its own, in the framework's shape.
    assert.ok(written.some((t) => plain(t).includes("dabbler [14:30:05] phase session=062 phase=land")));

    terminal.dispose();
    rmrf(root);
  });

  test("keeps a job's last bytes when the record drops it, and a whole job it never saw", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    const log = path.join(driver, "jobs", "verification-round.log");
    fs.writeFileSync(log, "round 1 starting\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => t.includes("round 1 starting")));

    // The job writes its summary and the framework collects it, both
    // between two looks. The summary is the line that matters most, and
    // reading the record alone would have lost it with the entry.
    written.length = 0;
    fs.appendFileSync(log, "VERIFIED in 4 rounds\n", "utf8");
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes("VERIFIED in 4 rounds")));

    // A short job whose whole life fell inside one interval was never on
    // the record when it was read. Its log is on disk either way.
    written.length = 0;
    fs.writeFileSync(path.join(driver, "jobs", "close.log"), "close: session 062 closed\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => plain(t).includes("job-output log=")));
    assert.ok(written.some((t) => t.includes("close: session 062 closed")));

    terminal.dispose();
    rmrf(root);
  });

  test("re-reads the theme when it changes rather than painting the old band", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.open();
    assert.ok(written.some((t) => t.includes(bandOf(BAND_DARK))));

    written.length = 0;
    (vscode.window as unknown as { __setColorTheme: (kind: number) => void }).__setColorTheme(
      vscode.ColorThemeKind.Light,
    );
    writeRun(driver, { session_number: 62, phase: "close", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes(bandOf(BAND_LIGHT))));
    assert.ok(!written.some((t) => t.includes(bandOf(BAND_DARK))));

    terminal.dispose();
    rmrf(root);
  });

  test("says a stop out loud, and never speaks a word the engine said", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    // The engine's transcript sits right beside the run record, and it is
    // the operator's rule that this terminal never reads it: the chat is in
    // the person's own CLI, and under headless drive it is the channel's.
    fs.writeFileSync(
      path.join(driver, "engine-01.log"),
      "engine: I think the widget should be rewritten\n",
      "utf8",
    );
    writeRun(driver, {
      session_number: 62,
      phase: "steps",
      job: null,
      stop: { kind: "budget", reason: "the loop met driver.max_invocations (24)" },
    });

    terminal.poll();
    const spoken = plain(written.join(""));
    assert.ok(spoken.includes("stopped kind=budget"));
    assert.ok(spoken.includes("driver.max_invocations (24)"));
    assert.ok(!spoken.includes("rewritten"));
    assert.ok(!spoken.includes("engine:"));

    terminal.dispose();
    rmrf(root);
  });

  test("bands every line of a multi-line reason and leaves no bare LF", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    // git writes several lines to stderr and the driver carries them into
    // the stop's reason. A bare LF moves a pty DOWN without returning to
    // column 0, so this used to staircase across the terminal -- and the
    // band, set once, ended at the first newline and left the rest bare.
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    writeRun(driver, {
      session_number: 62,
      phase: "land",
      job: null,
      stop: {
        kind: "land",
        reason: "git push failed:\nremote: permission denied\nremote: contact an owner",
      },
    });

    terminal.poll();
    const stop = written.find((text) => plain(text).includes("stopped kind=land"));
    assert.ok(stop !== undefined);
    // Not one bare LF anywhere in it: every newline is a full CRLF.
    assert.strictEqual(stop.split("\n").length - 1, stop.split("\r\n").length - 1);
    // And each of the three physical lines carries a band of its own.
    assert.strictEqual(stop.split(bandOf(BAND_DARK)).length - 1, 3);

    terminal.dispose();
    rmrf(root);
  });

  test("colours a line by what it is, and says the verdict and the test outcome", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    // The verdict and the outcome are read from the records the machine
    // wrote, never scraped out of the job bytes they also appear in --
    // parsing a stream that carries a runner's own escapes is how a
    // spinner gets cut in half.
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    fs.writeFileSync(
      path.join(path.dirname(driver), "rounds.jsonl"),
      JSON.stringify({ round: 1, verdict: "VERIFIED", verifier_model: "gpt-5-6-sol" }) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, ".dabbler", "runs", "test-runs.jsonl"),
      JSON.stringify({ suite: "typescript", stage: "final-full", outcome: "passed" }) + "\n",
      "utf8",
    );

    terminal.poll();
    const said = written.map(plain).join("");
    assert.ok(said.includes("verify round=1 verdict=VERIFIED"));
    // The repository-wide record is not replayed: the row that was already
    // there when this terminal first looked is history, not news.
    assert.ok(!said.includes("tests suite=typescript"));

    written.length = 0;
    fs.appendFileSync(
      path.join(root, ".dabbler", "runs", "test-runs.jsonl"),
      JSON.stringify({ suite: "extension", stage: "preverify-targeted", outcome: "failed" }) + "\n",
      "utf8",
    );
    terminal.poll();
    const after = written.join("");
    assert.ok(plain(after).includes("tests suite=extension stage=preverify-targeted outcome=failed"));
    // A failed outcome is bad and a clean verdict is good, and they are
    // different colours -- which is the whole point of the tone.
    assert.ok(after.includes(toneOf("bad", "dark")));
    assert.ok(!after.includes(toneOf("good", "dark")));

    terminal.dispose();
    rmrf(root);
  });

  test("resolves the same tone in either theme, and never the same colour", () => {
    // Two palettes, one vocabulary. A tone that resolved to one colour in
    // both themes would be unreadable in one of them, which is the failure
    // the light and dark pair exists to prevent.
    for (const tone of ["milestone", "good", "warn", "bad", "muted", "plain"] as const) {
      assert.ok(TONES.dark[tone].startsWith("#"));
      assert.ok(TONES.light[tone].startsWith("#"));
      assert.notStrictEqual(TONES.dark[tone], TONES.light[tone]);
    }
    // And a milestone phase is a milestone while an ordinary one is not:
    // the operator reads this terminal to know where the session got to.
    assert.strictEqual(lineTone("phase", { phase: "close" }), "milestone");
    assert.strictEqual(lineTone("phase", { phase: "steps" }), "plain");
    assert.strictEqual(lineTone("stopped", {}), "bad");
    // An unrecognised verdict warns rather than passing as clean, because
    // that is exactly the case where guessing "fine" is worst.
    assert.strictEqual(lineTone("verify", { verdict: "SOMETHING_NEW" }), "warn");
  });
});

/** What the stub recorded of every `window.createTerminal` call. */
interface FakeTerminal {
  options: { name: string; location?: unknown; pty?: unknown };
  shown: number;
}

function createdTerminals(): FakeTerminal[] {
  return (vscode.window as unknown as { __terminals: FakeTerminal[] }).__terminals;
}

function lastTerminal(): FakeTerminal {
  const all = createdTerminals();
  return all[all.length - 1];
}

suite("the indicator", () => {
  test("advances while the framework is working, and is not drawn when it is not", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();

    // A job is on the record, so there is something to indicate.
    written.length = 0;
    terminal.tick();
    const first = written.join("");
    terminal.tick();
    const second = written.join("").slice(first.length);
    // Two frames, and they are not the same one: what makes this an
    // indicator rather than a character is that it moves.
    assert.ok(plain(first).includes("/") || plain(first).includes("\\"));
    assert.ok(plain(second).includes("/") || plain(second).includes("\\"));
    assert.notStrictEqual(plain(first).trim(), plain(second).trim());

    // Nothing running: the frame is cleared rather than left spinning. An
    // indicator that claims motion while the framework is idle is the one
    // thing in this terminal a person would act on wrongly.
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    written.length = 0;
    terminal.tick();
    assert.strictEqual(plain(written.join("")).replace(/[\r\n]/g, ""), "");

    terminal.dispose();
    rmrf(root);
  });

  test("gets out of the way of a job's bytes and comes back after them", () => {
    // The spinner sits on the last line with no newline after it, so a
    // write that arrived while it was drawn would land on top of it. The
    // job's own bytes have to reach the terminal exactly as the runner
    // wrote them -- that is the rule this whole file is under.
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
    terminal.tick();

    written.length = 0;
    const log = path.join(driver, "jobs", "verification-round.log");
    fs.writeFileSync(log, `${ESC}[32m✓${ESC}[0m 214 passed\n`, "utf8");
    terminal.poll();

    const stream = written.join("");
    // The runner's line survives whole, escapes included.
    assert.ok(stream.includes(`${ESC}[32m`));
    assert.ok(stream.includes("214 passed"));
    // And the line was cleared before those bytes were written, so they did
    // not land on a frame.
    const cleared = stream.indexOf(`${ESC}[2K`);
    assert.ok(cleared >= 0 && cleared < stream.indexOf("214 passed"));

    terminal.dispose();
    rmrf(root);
  });

  test("never shares a line with a runner mid-line, and so never erases its bytes", () => {
    // A job's log is drained as raw bytes, and a runner writing a progress
    // counter or a test name before its result leaves the cursor partway
    // along a line. The indicator drawn THERE sits at the end of the
    // runner's own text, and the next tick erases the whole line to clear
    // the frame -- taking the runner's bytes with it. Losing a job's output
    // is the one thing this file exists to prevent.
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();

    written.length = 0;
    const log = path.join(driver, "jobs", "verification-round.log");
    // No trailing newline: the runner is still writing this line.
    fs.writeFileSync(log, "  ✓ widget returns 2", "utf8");
    terminal.poll();
    assert.ok(written.join("").includes("widget returns 2"));

    // Nothing is drawn while that line is open, so a tick has nothing to
    // erase and the partial output survives untouched.
    written.length = 0;
    terminal.tick();
    assert.strictEqual(written.join(""), "");

    // The runner finishes the line, and the indicator returns.
    fs.appendFileSync(log, "  (4ms)\n", "utf8");
    terminal.poll();
    written.length = 0;
    terminal.tick();
    assert.ok(plain(written.join("")).includes("/") || plain(written.join("")).includes("\\"));

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
    // Editor: its own tab beside the CLI's, which is why the CLI it was
    // opened next to is not remembered -- there is nothing to rebuild for.
    assert.deepStrictEqual(frameworkTerminalLocation("editor", cli), {
      viewColumn: vscode.ViewColumn.Beside,
    });
    assert.deepStrictEqual(frameworkTerminalLocation("editor", undefined), {
      viewColumn: vscode.ViewColumn.Beside,
    });
    // Panel: split off the CLI itself, which is the only way two terminals
    // share one panel row -- and it needs a CLI to split off.
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

suite("the way back to the framework terminal", () => {
  test("builds one when the person closed it, and shows the one that is open", () => {
    // Activation creates this terminal and never shows it, which makes
    // closing it by accident the easiest thing in the world -- and until
    // now nothing opened another, so a session driven from the person's own
    // CLI could run with no sight of the framework at all.
    const root = makeTempDir("dabbler-reveal-");
    openDabblerTerminal(root);
    const first = lastTerminal();
    const built = createdTerminals().length;

    // Open: shown, not rebuilt.
    revealDabblerTerminal(root);
    assert.strictEqual(createdTerminals().length, built);
    assert.strictEqual(first.shown, 1);

    // Closed by the person: the map lets go of it, so the next request
    // builds a live one rather than calling show() on a disposed terminal,
    // which does nothing whatever.
    forgetClosedTerminal(first as unknown as vscode.Terminal);
    revealDabblerTerminal(root);
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(lastTerminal().shown, 1);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });
});

/** The foreground one tone renders as, without the text around it. */
function toneOf(tone: Tone, kind: "dark" | "light"): string {
  return paint("", tone, kind).split("m")[0] + "m";
}

/** The SGR background one band renders as, without the line around it. */
function bandOf(hex: string): string {
  return bandedLine("", hex === BAND_DARK ? "dark" : "light").split("m")[0] + "m";
}

/** The stub's configuration, set for one test and cleared after it. */
function setConfig(key: string, value: unknown): void {
  (vscode.workspace as unknown as {
    __setConfig: (section: string, key: string, value: unknown) => void;
  }).__setConfig("dabbler", key, value);
}

function clearConfig(): void {
  (vscode.workspace as unknown as { __clearConfig: () => void }).__clearConfig();
}

suite("the watcher", () => {
  const ISSUED = new Date(2026, 7, 31, 14, 28, 5).toISOString();

  /** An instruction outstanding since `ISSUED`, which the fixture's clock is 120s past. */
  function outstanding(driver: string, seq = 4): void {
    fs.writeFileSync(
      path.join(driver, "instruction.json"),
      JSON.stringify({
        schema_version: 1,
        seq,
        kind: "step",
        session_number: 62,
        issued_at: ISSUED,
        step_id: "widget",
        ask: "Make the widget real.",
        answer_schema: "driver-report.schema.json",
        answer_command: "dabbler session report --seq 4 --step widget ...",
      }),
      "utf8",
    );
  }

  const WAITING = {
    schema_version: 1,
    session_number: 62,
    engine: "claude-code",
    phase: "steps",
    seq: 4,
    invocations: 0,
    max_invocations: 24,
    accepted_steps: [],
    baseline_tree: null,
    stop: null,
    started_at: ISSUED,
    updated_at: ISSUED,
  };

  test("says an instruction is outstanding once past the threshold, and not on every look", () => {
    setConfig("stalledAfterSeconds", 60);
    const { root, driver, written, terminal } = drivenRepo(WAITING);
    outstanding(driver);

    terminal.poll();
    const said = written.filter((t) => plain(t).includes("watcher"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]).includes("since=120s state=instruction-outstanding"));
    // Amber: a nudge, not a verdict, and the colour the indicator already uses.
    assert.ok(said[0].includes(toneOf("warn", "dark")));

    // The next look says nothing: the probe costs a git call, and one
    // silence is one line.
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    terminal.dispose();
    clearConfig();
    rmrf(root);
  });

  test("stays quiet while the framework itself is working", () => {
    setConfig("stalledAfterSeconds", 60);
    // A job running is the framework doing something nobody is waiting on a
    // person for -- the indicator's case, not the watcher's.
    const { root, driver, written, terminal } = drivenRepo({
      ...WAITING,
      job: {
        name: "verification",
        argv: [],
        pid: 1,
        log: ".dabbler/runs/s62/driver/jobs/verification.log",
        status: ".dabbler/runs/s62/driver/jobs/verification.status.json",
        started_at: ISSUED,
        retry_after_seconds: 30,
      },
    });
    outstanding(driver);

    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    terminal.dispose();
    clearConfig();
    rmrf(root);
  });

  test("is asked no more often than it can answer differently", () => {
    // Half the threshold, bounded: at the default it is a git call a
    // minute, never one per 500ms poll.
    assert.strictEqual(watcherLookMs(1800), 60_000);
    assert.strictEqual(watcherLookMs(60), 30_000);
    assert.strictEqual(watcherLookMs(2), 5_000);
  });

  test("takes the operator's threshold over the repository's", () => {
    const root = makeTempDir("dabbler-threshold-");
    // No setting: the repository answers, and an unconfigured one answers
    // with the framework's own default.
    clearConfig();
    assert.strictEqual(watcherThreshold(root), 1800);
    setConfig("stalledAfterSeconds", 90);
    assert.strictEqual(watcherThreshold(root), 90);
    clearConfig();
    rmrf(root);
  });
});
