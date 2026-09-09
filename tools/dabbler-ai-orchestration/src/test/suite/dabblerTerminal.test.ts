// The Dabbler terminal: the framework's background work, and nothing else.
//
// What is asserted is what reaches the pty -- the framework's own lines
// in their outline, and a job's bytes exactly as the runner wrote them.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
  DabblerTerminal,
  HANGING_INDENT,
  TONES,
  type Span,
  type Tone,
  disposeDabblerTerminals,
  ensureDabblerTerminal,
  forgetClosedTerminal,
  frameworkTerminalLocation,
  isSessionStart,
  layout,
  openDabblerTerminal,
  revealDabblerTerminal,
  revealOnSessionStart,
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
    // The first look is history; the job starts writing after it.
    terminal.poll();
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
    assert.strictEqual(written.filter((t) => plain(t).includes("14:30:05 working")).length, 1);
    // And not repeated on every look while nothing has changed.
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("14:30:05 working")), []);

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.strictEqual(terminal.indicator, "waiting");
    assert.ok(written.some((t) => plain(t).includes("job-collected")));
    assert.strictEqual(written.filter((t) => plain(t).includes("14:30:05 waiting")).length, 1);
    // The record moving is an event of its own, in the framework's shape.
    // The session was named on the first phase line and is not repeated.
    assert.ok(written.some((t) => plain(t).includes("14:30:05 phase now=land")));
    assert.ok(!written.some((t) => plain(t).includes("session=062 now=land")));

    terminal.dispose();
    rmrf(root);
  });

  test("stops claiming working once the job has exited uncollected, and says the router's words once", () => {
    // Session 91: the status file held the exit code for three hours while
    // the indicator spun. A full record, because the reader that answers
    // this is the router's and it validates what it reads.
    const job = {
      name: "verification",
      argv: ["node", "-e", "0"],
      pid: 1,
      log: ".dabbler/runs/s62/driver/jobs/verification.log",
      status: ".dabbler/runs/s62/driver/jobs/verification.status.json",
      started_at: "2026-08-31T14:00:00.000Z",
      retry_after_seconds: 60,
    };
    const record = {
      schema_version: 1,
      session_number: 62,
      engine: "cli",
      phase: "verify",
      seq: 5,
      invocations: 0,
      max_invocations: 24,
      accepted_steps: [],
      baseline_tree: null,
      stop: null,
      started_at: "2026-08-31T13:00:00.000Z",
      updated_at: "2026-08-31T14:00:00.000Z",
      job,
    };
    const { root, driver, terminal, written } = drivenRepo(record);
    fs.writeFileSync(
      path.join(driver, "jobs", "verification.status.json"),
      JSON.stringify({ exit: 4, ended_at: "2026-08-31T14:05:00.000Z" }),
      "utf8",
    );
    terminal.poll();
    assert.strictEqual(terminal.indicator, "uncollected");
    const said = written.filter((t) => plain(t).includes("14:30:05 uncollected"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]).includes("'verification' finished at 2026-08-31T14:05:00.000Z (exit 4)"));
    assert.ok(plain(said[0]).includes("`dabbler session next`"));
    assert.ok(!written.some((t) => plain(t).includes("14:30:05 working")));
    // Said once, not on every look.
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("14:30:05 uncollected")), []);
    // A tick while nothing runs draws no frame: the two glyphs the
    // indicator spins with never reach the writer.
    written.length = 0;
    terminal.tick();
    assert.ok(!written.some((t) => plain(t).includes("/") || plain(t).includes("\\")));
    assert.strictEqual(terminal.indicator, "uncollected");

    terminal.dispose();
    rmrf(root);
  });

  test("keeps a job's last bytes when the record drops it, and a whole job it never saw", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
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

  test("re-reads the theme when it changes rather than painting the old palette", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.open();
    // The first look says `phase=verify`, a milestone, in the dark palette.
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "dark"))));

    written.length = 0;
    (vscode.window as unknown as { __setColorTheme: (kind: number) => void }).__setColorTheme(
      vscode.ColorThemeKind.Light,
    );
    writeRun(driver, { session_number: 62, phase: "close", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "light"))));
    assert.ok(!written.some((t) => t.includes(toneOf("milestone", "dark"))));
    // Nothing is painted behind a line in either theme: the clock and the
    // indent are what set the framework's lines apart from a job's.
    assert.ok(!written.some((t) => t.includes(`${ESC}[48;`)));

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
    // The router's words, not this terminal's: paused rather than stopped,
    // the command ended and the session not, and who acts next.
    assert.ok(spoken.includes("paused session=062 kind=budget"));
    assert.ok(spoken.includes("driver.max_invocations (24)"));
    assert.ok(spoken.includes("remains in flight"));
    assert.ok(spoken.includes("Next: "));
    assert.ok(!spoken.includes("stopped kind"));
    assert.ok(!spoken.includes("rewritten"));
    assert.ok(!spoken.includes("engine:"));

    terminal.dispose();
    rmrf(root);
  });

  test("indents every continuation line of a multi-line reason and leaves no bare LF", () => {
    useTheme(vscode.ColorThemeKind.Dark);
    // git writes several lines to stderr and the driver carries them into
    // the stop's reason. A bare LF moves a pty DOWN without returning to
    // column 0, so this used to staircase across the terminal -- and a
    // continuation that started at column 0 would read as a second entry.
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
    const stop = written.find((text) => plain(text).includes("paused session=062 kind=land"));
    assert.ok(stop !== undefined);
    // Not one bare LF anywhere in it: every newline is a full CRLF.
    assert.strictEqual(stop.split("\n").length - 1, stop.split("\r\n").length - 1);
    // Three physical lines: the clock at the edge of the first, and the
    // other two under the text, where a continuation belongs.
    const lines = plain(stop).split("\r\n").filter((line) => line !== "");
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0]?.startsWith("14:30:05 paused"));
    assert.ok(lines[1]?.startsWith(`${" ".repeat(HANGING_INDENT)}remote: permission denied`));
    assert.ok(lines[2]?.startsWith(`${" ".repeat(HANGING_INDENT)}remote: contact an owner`));

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
      JSON.stringify({ suite: "typescript", stage: "final-full", outcome: "passed" }) +
        "\n" +
        JSON.stringify({ suite: "dotnet", stage: "preverify-targeted", outcome: "passed", sessionNumber: 62 }) +
        "\n",
      "utf8",
    );

    terminal.poll();
    const said = written.map(plain).join("");
    assert.ok(said.includes("verify round=1 verdict=VERIFIED"));
    // The repository-wide record is replayed for THIS session only: a row
    // another session recorded is history, and this session's is its own.
    assert.ok(!said.includes("tests suite=typescript"));
    assert.ok(said.includes("tests suite=dotnet stage=preverify-targeted outcome=passed"));

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

  test("says progress resumed once the phase has left the pause, and not before, and not past a replacement", () => {
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 62,
      phase: "steps",
      job: null,
      stop: { kind: "tests", reason: "the suite was red", at: "2026-08-31T14:00:00-04:00" },
    });
    terminal.poll();
    assert.ok(plain(written.join("")).includes("paused session=062 kind=tests"));

    // The resume clears the stop and re-enters the same phase: nothing has
    // happened yet, and nothing green is said.
    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "steps", job: null, stop: null });
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("progress-resumed"));

    // The phase moves on: that is progress, said once.
    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "verify", job: null, stop: null });
    terminal.poll();
    const moved = plain(written.join(""));
    assert.ok(moved.includes("progress-resumed past=tests from=steps phase=verify"), moved);
    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "run-of-record", job: null, stop: null });
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("progress-resumed"));

    // A replacement: the stop is gone and the phase moved, but another stop
    // stands in its place. That is a new pause, and never progress.
    written.length = 0;
    writeRun(driver, {
      session_number: 62,
      phase: "run-of-record",
      job: null,
      stop: { kind: "land", reason: "the push was refused", at: "2026-08-31T14:10:00-04:00" },
    });
    terminal.poll();
    written.length = 0;
    writeRun(driver, {
      session_number: 62,
      phase: "close",
      job: null,
      stop: { kind: "close", reason: "the close refused", at: "2026-08-31T14:20:00-04:00" },
    });
    terminal.poll();
    const replaced = plain(written.join(""));
    assert.ok(replaced.includes("paused session=062 kind=close"), replaced);
    assert.ok(!replaced.includes("progress-resumed"), replaced);

    terminal.dispose();
    rmrf(root);
  });

  test("says a decision answered, from the owed ledger, and only from where it first looked", () => {
    const { root, written, terminal } = drivenRepo(RUNNING);
    const owed = path.join(root, ".dabbler", "runs", "owed-decisions.jsonl");
    // Rows written before this terminal existed are history, and a question
    // raised is not something a person did: neither is spoken.
    fs.writeFileSync(
      owed,
      `${JSON.stringify({ id: "old-question", event: "answered", state: "answered", answer: "Yes" })}\n` +
        `${JSON.stringify({ id: "driver-stop-s62", event: "raised", state: "open" })}\n`,
      "utf8",
    );
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("decision-answered"));

    written.length = 0;
    fs.appendFileSync(
      owed,
      `${JSON.stringify({ id: "driver-stop-s62", event: "answered", state: "answered", answer: "Run `next` again" })}\n`,
      "utf8",
    );
    terminal.poll();
    const spoken = plain(written.join(""));
    assert.ok(spoken.includes("decision-answered id=driver-stop-s62 answer=Run `next` again"), spoken);
    assert.ok(!spoken.includes("old-question"));

    terminal.dispose();
    rmrf(root);
  });

  test("resolves the same tone in either theme, and never the same colour", () => {
    // Two palettes, one vocabulary. A tone that resolved to one colour in
    // both themes would be unreadable in one of them, which is the failure
    // the light and dark pair exists to prevent.
    for (const tone of ["milestone", "good", "warn", "bad", "muted"] as const) {
      assert.ok(TONES.dark[tone].startsWith("#"));
      assert.ok(TONES.light[tone].startsWith("#"));
      assert.notStrictEqual(TONES.dark[tone], TONES.light[tone]);
    }
    // `plain` is the terminal's own foreground and paints nothing.
    assert.strictEqual(paint("text", "plain", "dark"), "text");
    // And a milestone phase is a milestone while an ordinary one is not:
    // the operator reads this terminal to know where the session got to,
    // and the plan and the work beginning are two of the places it gets to.
    assert.strictEqual(lineTone("phase", { now: "close" }), "milestone");
    assert.strictEqual(lineTone("phase", { now: "plan" }), "milestone");
    assert.strictEqual(lineTone("phase", { now: "work" }), "milestone");
    // The name that phase was recorded under before session 140: a run from
    // last week lights up in the tone it earned when it was written.
    assert.strictEqual(lineTone("phase", { now: "steps" }), "milestone");
    assert.strictEqual(lineTone("phase", { now: "preverify" }), "plain");
    // A pause is amber and a deadlock is red: the one word that says
    // "running this again reaches this exact point" keeps its colour.
    assert.strictEqual(lineTone("paused", {}), "warn");
    assert.strictEqual(lineTone("paused", { class: "deadlock" }), "bad");
    // The two honest green events, and no third.
    assert.strictEqual(lineTone("progress-resumed", {}), "good");
    assert.strictEqual(lineTone("decision-answered", {}), "good");
    // An unrecognised verdict warns rather than passing as clean, because
    // that is exactly the case where guessing "fine" is worst.
    assert.strictEqual(lineTone("verify", { verdict: "SOMETHING_NEW" }), "warn");
  });
});

suite("the session from its registration, and each step as it starts", () => {
  /** A repository whose ledger holds one in-progress row and no run record yet. */
  function registeredRepo(
    row: Record<string, unknown>,
  ): { root: string; written: string[]; terminal: DabblerTerminal } {
    const root = makeTempDir("dabbler-registered-");
    fs.mkdirSync(path.join(root, "docs", "sessions"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs", "sessions", "sessions.json"),
      JSON.stringify({ sessions: [{ number: 7, status: "in-progress", ...row }] }),
      "utf8",
    );
    const written: string[] = [];
    const terminal = new DabblerTerminal({
      repoRoot: root,
      now: () => new Date(2026, 8, 8, 14, 5, 1),
      pollMs: 60_000,
    });
    terminal.onDidWrite((text: string) => written.push(text));
    return { root, written, terminal };
  }

  test("says the banner and the kind line from the in-progress ledger row, before any run record, and once", () => {
    // A focused session: the row carries the checkout `start --module`
    // wrote, and the policy says what it may touch.
    const focused = registeredRepo({ checkout: { module: "persister", path: "C:/work/Shop.persister" } });
    fs.mkdirSync(path.join(focused.root, ".dabbler", "runs", "s7"), { recursive: true });
    fs.writeFileSync(
      path.join(focused.root, ".dabbler", "runs", "s7", "policy.json"),
      JSON.stringify({ allowed: ["modules/persister", "modules/model/contract", "docs"] }),
      "utf8",
    );
    // Wide enough that the kind line is not wrapped under its indent.
    focused.terminal.open({ columns: 160, rows: 20 });
    focused.terminal.poll();
    const said = plain(focused.written.join(""));
    assert.ok(said.includes("SESSION 007"), said);
    assert.ok(
      said.includes("focused module=persister scope=modules/persister, modules/model/contract, docs"),
      said,
    );
    // The run record arriving for the same session adds no second banner.
    const driver = path.join(focused.root, ".dabbler", "runs", "s7", "driver");
    fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
    writeRun(driver, { session_number: 7, phase: "plan", job: null, stop: null });
    focused.terminal.poll();
    const all = plain(focused.written.join(""));
    assert.strictEqual(all.split("SESSION 007").length - 1, 1, all);
    assert.strictEqual(all.split("focused module=persister").length - 1, 1, all);
    focused.terminal.dispose();
    rmrf(focused.root);

    // A global session: no checkout on the row, and the whole repository.
    const global = registeredRepo({});
    global.terminal.open({ columns: 80, rows: 20 });
    global.terminal.poll();
    const globalSaid = plain(global.written.join(""));
    assert.ok(globalSaid.includes("SESSION 007"), globalSaid);
    assert.ok(globalSaid.includes("global scope=the whole repository"), globalSaid);
    global.terminal.dispose();
    rmrf(global.root);
  });

  test("says a step once when seq moves onto it, a rejection with its first reason, and nothing for a wait", () => {
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 62,
      phase: "steps",
      seq: 3,
      job: null,
      stop: null,
    });
    const instruction = (record: Record<string, unknown>) =>
      fs.writeFileSync(path.join(driver, "instruction.json"), JSON.stringify(record), "utf8");
    instruction({ kind: "step", seq: 3, session_number: 62, step_id: "widget", ask: "Build the widget. Then paint it." });
    terminal.open({ columns: 100, rows: 20 });
    terminal.poll();
    terminal.poll();
    const said = () => plain(written.join(""));
    assert.strictEqual(said().split("step id=widget ask=Build the widget.").length - 1, 1, said());

    instruction({ kind: "rejection", seq: 4, session_number: 62, step_id: "widget", reasons: ["the check failed: exit 1", "and another"] });
    writeRun(driver, { session_number: 62, phase: "steps", seq: 4, job: null, stop: null });
    terminal.poll();
    terminal.poll();
    assert.strictEqual(said().split("rejected id=widget reason=the check failed: exit 1").length - 1, 1, said());

    instruction({ kind: "wait", seq: 5, session_number: 62, retry_after_seconds: 60 });
    writeRun(driver, { session_number: 62, phase: "verify", seq: 5, job: null, stop: null });
    terminal.poll();
    assert.ok(!said().includes("seq=5"), said());
    assert.strictEqual(said().split("\r\n").filter((line) => / (step|rejected) /.test(line)).length, 2, said());
    terminal.dispose();
    rmrf(root);
  });

  test("says the step line on a later poll when the instruction was not readable on the first look", () => {
    // The read-once-drop-silently shape: the seq marked as said BEFORE the
    // read means the guard that would retry it has already been satisfied,
    // and the line is gone for good. Three ways one look can come back
    // wrong -- absent, unparseable, and still carrying the previous seq --
    // and after each of them the line still has to arrive.
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 62,
      phase: "steps",
      seq: 7,
      job: null,
      stop: null,
    });
    const instructionPath = path.join(driver, "instruction.json");
    terminal.open({ columns: 100, rows: 20 });
    terminal.poll();

    fs.writeFileSync(instructionPath, "{not json", "utf8");
    terminal.poll();

    fs.writeFileSync(
      instructionPath,
      JSON.stringify({ kind: "step", seq: 6, session_number: 62, step_id: "stale", ask: "An older seq." }),
      "utf8",
    );
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("step id="), plain(written.join("")));

    fs.writeFileSync(
      instructionPath,
      JSON.stringify({ kind: "step", seq: 7, session_number: 62, step_id: "widget", ask: "Build the widget. Then paint it." }),
      "utf8",
    );
    terminal.poll();
    terminal.poll();
    const said = plain(written.join(""));
    assert.strictEqual(said.split("step id=widget ask=Build the widget.").length - 1, 1, said);
    assert.ok(!said.includes("step id=stale"), said);
    terminal.dispose();
    rmrf(root);
  });

  test("says a step line again for seq 1 of the next session, though the last session's seq 1 was said", () => {
    // The deduplication is per session: a new session's seq starts over,
    // and a step said for the old session's seq must not silence the new one.
    const { root, driver, written, terminal } = drivenRepo({ session_number: 62, phase: "steps", seq: 1, job: null, stop: null });
    fs.writeFileSync(
      path.join(driver, "instruction.json"),
      JSON.stringify({ kind: "step", seq: 1, session_number: 62, step_id: "widget", ask: "Build the widget." }),
      "utf8",
    );
    terminal.open({ columns: 100, rows: 20 });
    terminal.poll();
    const next = path.join(root, ".dabbler", "runs", "s63", "driver");
    fs.mkdirSync(path.join(next, "jobs"), { recursive: true });
    fs.writeFileSync(
      path.join(next, "instruction.json"),
      JSON.stringify({ kind: "step", seq: 1, session_number: 63, step_id: "gadget", ask: "Build the gadget." }),
      "utf8",
    );
    writeRun(next, { session_number: 63, phase: "steps", seq: 1, job: null, stop: null });
    terminal.poll();
    terminal.poll();
    const said = plain(written.join(""));
    assert.strictEqual(said.split("step id=widget").length - 1, 1, said);
    assert.strictEqual(said.split("step id=gadget").length - 1, 1, said);
    terminal.dispose();
    rmrf(root);
  });

  test("rules the framework's voice with the session number once a session is known, and without one before", () => {
    const { root, written, terminal } = drivenRepo({ session_number: 62, phase: "plan", job: null, stop: null });
    terminal.open({ columns: 80, rows: 20 });
    // Before the first look nothing is known: the opening line is ruled `framework`.
    const opened = plain(written.join(""));
    assert.ok(opened.includes("─ framework ─"), opened);
    assert.ok(!opened.includes("S62"), opened);
    written.length = 0;
    terminal.poll();
    // A job's bytes change the voice, and the framework's next line comes
    // back under a rule that carries the number.
    const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.writeFileSync(path.join(driver, "jobs", "close.log"), "closing\n", "utf8");
    terminal.poll();
    writeRun(driver, { session_number: 62, phase: "verify", job: null, stop: null });
    terminal.poll();
    const after = plain(written.join(""));
    assert.match(after, /─ S62: framework ─/, after);
    assert.ok(!/─ framework ─/.test(after), after);
    terminal.dispose();
    rmrf(root);
  });

  test("heads a job's rule with the session number too", () => {
    // `verify-round-1` alone could head a group belonging to any session on
    // a scrollback that has held several. The framework's rule has carried
    // the number since session 126; a job's carried nothing at all.
    const { root, written, terminal } = drivenRepo({ session_number: 62, phase: "verify", job: null, stop: null });
    terminal.open({ columns: 80, rows: 20 });
    terminal.poll();
    written.length = 0;
    const jobs = path.join(root, ".dabbler", "runs", "s62", "driver", "jobs");
    fs.writeFileSync(path.join(jobs, "verify-round-1.log"), "reviewing\n", "utf8");
    terminal.poll();
    const said = plain(written.join(""));
    assert.match(said, /─ S62: verify-round-1 ─/, said);
    assert.ok(!/─ verify-round-1 ─/.test(said), said);
    terminal.dispose();
    rmrf(root);
  });

  test("gives a session that puts no job output on the terminal a numbered heading anyway", () => {
    // The operator's report: no `S133:` on any voice rule. The cause is not
    // the label -- `voice()` returns it -- but the occasion: `emit` draws a
    // rule only when the speaker changes, and a session driven from a chat
    // never changes voice, so no numbered rule is ever drawn. The banner is
    // the decided heading for that group, and this is the test that fails if
    // it stops being drawn; a label-only test would pass with the operator's
    // complaint still true.
    const { root, written, terminal } = drivenRepo({ session_number: 133, phase: "steps", job: null, stop: null });
    terminal.open({ columns: 80, rows: 20 });
    terminal.poll();
    const said = plain(written.join(""));
    // No job ever spoke, so no voice rule was occasioned...
    assert.ok(!/─ S133: framework ─/.test(said), said);
    // ...and the session is headed by its number ONCE -- a second banner
    // would be two headings for the group this one heads, which is the
    // whole reason the rule is not drawn here either.
    const rows = said.split("\r\n");
    const headings = rows.flatMap((line, at) => (line.trim() === "SESSION 133" ? [at] : []));
    assert.deepStrictEqual(headings.length, 1, said);
    const heading = headings[0]!;
    assert.strictEqual(rows[heading - 1], "═".repeat(79));
    assert.strictEqual(rows[heading + 1], "═".repeat(79));
    // And the framework's first line of the session follows that banner,
    // rather than standing above it under the unnumbered opening rule.
    const phase = rows.findIndex((line) => line.includes("now=steps"));
    assert.ok(phase > heading + 1, said);
    terminal.dispose();
    rmrf(root);
  });
});

suite("the outline", () => {
  const indent = " ".repeat(HANGING_INDENT);
  const words = (lines: Span[][]) => lines.map((physical) => physical.map((s) => s.text).join(""));

  test("lays a line out with the clock at the edge and everything after it under the text", () => {
    const spans: Span[] = [
      { text: "12:00:00", tone: "muted", bold: false },
      { text: " ", tone: "plain", bold: false },
      { text: "paused", tone: "warn", bold: true },
      { text: " ", tone: "plain", bold: false },
      { text: "reason=", tone: "muted", bold: false },
      { text: "one two three four five six", tone: "bad", bold: false },
    ];
    // Thirty columns: twenty-nine usable, twenty after the indent.
    const wrapped = layout(spans, 30);
    assert.deepStrictEqual(words(wrapped), [
      "12:00:00 paused reason=one",
      `${indent}two three four five`,
      `${indent}six`,
    ]);
    // The tone crosses the break with the text: a value is one colour on
    // every line it takes.
    assert.strictEqual(wrapped[1]?.[1]?.tone, "bad");
    // A token wider than the line is cut rather than left to the terminal,
    // which would wrap it without the indent.
    const long = layout([{ text: "x".repeat(50), tone: "plain", bold: false }], 30);
    assert.deepStrictEqual(words(long).map((line) => line.length), [29, 29, 10]);
    // The text's own newlines are continuation lines too, and an unknown
    // width breaks nothing else.
    const reason = layout([{ text: "git push failed:\nremote: denied", tone: "plain", bold: false }], null);
    assert.deepStrictEqual(words(reason), ["git push failed:", `${indent}remote: denied`]);
  });

  test("wraps its own lines at the terminal's width, and lays them out again when it is resized", async () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const root = makeTempDir("dabbler-outline-");
    const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
    writeRun(driver, {
      session_number: 62,
      phase: "steps",
      job: null,
      stop: {
        kind: "budget",
        reason:
          "the loop met driver.max_invocations (24), and whether to raise it or to " +
          "cancel is the operator's to say",
      },
    });
    const written: string[] = [];
    const terminal = new DabblerTerminal({
      repoRoot: root,
      now: () => new Date(2026, 7, 31, 14, 30, 5),
      pollMs: 60_000,
      resizeMs: 1,
    });
    terminal.onDidWrite((text: string) => written.push(text));
    const clear = `${ESC}[H${ESC}[2J${ESC}[3J`;
    // The rule between voices and the session's banner are lines of their
    // own and not framework lines.
    const physical = (text: string) =>
      plain(text.split(clear).join(""))
        .split("\r\n")
        .filter(
          (line) =>
            line !== "" &&
            !line.includes("─") &&
            !line.includes("═") &&
            !line.trim().startsWith("SESSION "),
        );

    terminal.open({ columns: 60, rows: 20 });
    terminal.poll();
    const narrow = written.flatMap(physical);
    // Every physical line fits, and every one that is not a line's first
    // begins under the text.
    assert.ok(narrow.every((line) => line.length <= 59), narrow.join("|"));
    assert.ok(narrow.some((line) => line.startsWith(indent)));
    assert.ok(narrow.every((line) => line.startsWith("14:30:05 ") || line.startsWith(indent)));

    // Widened: the terminal is cleared and everything is said again at the
    // new width, with the same words on fewer lines.
    written.length = 0;
    // Wide enough that nothing wraps: the stop's rendering runs past 400.
    terminal.setDimensions({ columns: 1000, rows: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const stream = written.join("");
    assert.ok(stream.includes(clear));
    const wide = physical(stream);
    assert.ok(wide.length < narrow.length, `${wide.length} vs ${narrow.length}`);
    assert.ok(wide.every((line) => line.startsWith("14:30:05 ")), wide.join("|"));
    assert.strictEqual(
      wide.join(" ").replace(/\s+/g, " "),
      narrow.join(" ").replace(/\s+/g, " "),
    );

    terminal.dispose();
    rmrf(root);
  });
});

suite("the first look, and the rule between voices", () => {
  test("says the session's history in time order, dumps no log, and rules a voice in when it changes", async () => {
    useTheme(vscode.ColorThemeKind.Dark);
    // A terminal opened after the fact used to replay every job log whole
    // and in filename order: the close before the run of record before the
    // verification. The records say what happened and when.
    const root = makeTempDir("dabbler-firstlook-");
    const runDir = path.join(root, ".dabbler", "runs", "s62");
    const driver = path.join(runDir, "driver");
    const jobs = path.join(driver, "jobs");
    fs.mkdirSync(jobs, { recursive: true });
    writeRun(driver, { session_number: 62, phase: "complete", job: null, stop: null });
    fs.writeFileSync(
      path.join(runDir, "rounds.jsonl"),
      JSON.stringify({ round: 1, verdict: "VERIFIED", verifier_model: "gpt-5.4", recorded_at: "2026-08-31T14:00:00.000Z" }) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, ".dabbler", "runs", "test-runs.jsonl"),
      JSON.stringify({ suite: "dotnet", stage: "final-full", outcome: "passed", sessionNumber: 62, recordedAt: "2026-08-31T14:10:00.000Z" }) +
        "\n" +
        JSON.stringify({ suite: "dotnet", stage: "final-full", outcome: "passed", sessionNumber: 61, recordedAt: "2026-08-31T14:05:00.000Z" }) +
        "\n",
      "utf8",
    );
    const at = (iso: string) => new Date(iso);
    fs.writeFileSync(path.join(jobs, "verification.log"), "verify: round 1 -- VERIFIED\n".repeat(50), "utf8");
    fs.writeFileSync(path.join(jobs, "verification.status.json"), JSON.stringify({ exit: 0 }), "utf8");
    fs.utimesSync(path.join(jobs, "verification.log"), at("2026-08-31T13:55:00.000Z"), at("2026-08-31T13:55:00.000Z"));
    fs.writeFileSync(path.join(jobs, "close.log"), "close: session 062 closed\n", "utf8");
    fs.utimesSync(path.join(jobs, "close.log"), at("2026-08-31T14:20:00.000Z"), at("2026-08-31T14:20:00.000Z"));

    const written: string[] = [];
    const terminal = new DabblerTerminal({
      repoRoot: root,
      now: () => new Date(2026, 7, 31, 14, 30, 5),
      pollMs: 60_000,
      resizeMs: 1,
    });
    terminal.onDidWrite((text: string) => written.push(text));
    terminal.open({ columns: 100, rows: 20 });
    terminal.poll();

    const said = plain(written.join(""));
    // One dated line per thing that happened, in the order it happened,
    // and then where the run is now.
    const order = [
      "earlier-job name=verification log=.dabbler/runs/s62/driver/jobs/verification.log exit=0",
      "verify round=1 verdict=VERIFIED verifier=gpt-5.4",
      "tests suite=dotnet stage=final-full outcome=passed",
      "earlier-job name=close log=.dabbler/runs/s62/driver/jobs/close.log",
      "phase session=062 now=complete",
      "session-closed session=062",
    ];
    const positions = order.map((line) => said.indexOf(line));
    assert.ok(positions.every((position) => position >= 0), said);
    assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions, said);
    // Another session's test run is not this session's history.
    assert.strictEqual(said.split("tests suite=dotnet").length - 1, 1);
    // Not one byte of either log was replayed.
    assert.ok(!said.includes("verify: round 1 -- VERIFIED"), said);
    assert.ok(!said.includes("close: session 062 closed"), said);
    // Everything so far is one voice under one rule, with the name in it.
    assert.strictEqual(said.split("─── framework ───").length - 1, 1, said);

    // Bytes a job writes from now on pass through, under a rule of its own,
    // and the framework's next line comes back under its rule.
    written.length = 0;
    fs.appendFileSync(path.join(jobs, "close.log"), "close: pushed 1 round ref(s)\n", "utf8");
    terminal.poll();
    writeRun(driver, {
      session_number: 62,
      phase: "complete",
      job: null,
      stop: { kind: "land", reason: "the push was refused" },
    });
    terminal.poll();
    const after = plain(written.join(""));
    assert.match(after, /─ S62: close ─+\r\nclose: pushed 1 round ref\(s\)\r\n/, after);
    // The framework's rule carries the session's number once one is known.
    assert.match(after, /─ S62: framework ─+\r\n14:30:05 paused/, after);
    // An empty line stands before each rule, so the groups have room
    // between them; the one at the very top has nothing above it. The
    // framework's last line had ended its own line, so one CRLF is the
    // empty line before the close rule; the job's bytes had too.
    assert.ok(after.startsWith("\r\n─"), after.slice(0, 40));
    assert.match(after, /ref\(s\)\r\n\r\n─+ S62: framework ─/, after);
    assert.ok(said.startsWith("─"), said.slice(0, 40));
    // The rule spans the terminal's width, one column short, and follows it
    // through a resize because it is drawn again with everything else.
    const rule = after.split("\r\n").find((line) => line.includes("─ S62: close ─")) ?? "";
    assert.strictEqual(rule.length, 99, rule);
    written.length = 0;
    terminal.setDimensions({ columns: 40, rows: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const narrow = plain(written.join("")).split("\r\n").filter((line) => line.includes("─ S62: close ─"));
    assert.strictEqual(narrow.length, 1);
    assert.strictEqual(narrow[0]?.length, 39, narrow[0]);

    terminal.dispose();
    rmrf(root);
  });

  test("opens a session under its own banner, again when the next one starts, and at the width in hand", async () => {
    useTheme(vscode.ColorThemeKind.Dark);
    const root = makeTempDir("dabbler-banner-");
    const first = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(path.join(first, "jobs"), { recursive: true });
    writeRun(first, { session_number: 62, phase: "complete", job: null, stop: null });
    const written: string[] = [];
    const terminal = new DabblerTerminal({
      repoRoot: root,
      now: () => new Date(2026, 7, 31, 14, 30, 5),
      pollMs: 60_000,
      resizeMs: 1,
    });
    terminal.onDidWrite((text: string) => written.push(text));
    terminal.open({ columns: 80, rows: 20 });
    terminal.poll();

    const lines = (text: string) => plain(text).split("\r\n");
    const opened = lines(written.join(""));
    // The session already there at the first look gets its banner before
    // anything is said of it: a double rule, the name centred, the rule.
    const heading = opened.indexOf("═".repeat(79));
    assert.ok(heading >= 0, opened.join("|"));
    assert.strictEqual(opened[heading + 1]?.trim(), "SESSION 062");
    assert.strictEqual(opened[heading + 1]?.indexOf("S"), Math.floor((79 - "SESSION 062".length) / 2));
    assert.strictEqual(opened[heading + 2], "═".repeat(79));
    assert.ok(opened.indexOf("14:30:05 phase session=062 now=complete") > heading + 2);
    // No voice rule directly under the banner: the framework is speaking.
    assert.ok(!opened[heading + 3]?.includes("─"), opened[heading + 3]);

    // The next session's run record: its own banner, once.
    written.length = 0;
    const next = path.join(root, ".dabbler", "runs", "s63", "driver");
    fs.mkdirSync(path.join(next, "jobs"), { recursive: true });
    writeRun(next, { session_number: 63, phase: "plan", job: null, stop: null });
    terminal.poll();
    terminal.poll();
    assert.strictEqual(lines(written.join("")).filter((line) => line.trim() === "SESSION 063").length, 1);
    assert.ok(plain(written.join("")).includes("phase session=063 now=plan"));

    // Narrowed: every banner is drawn again at the new width.
    written.length = 0;
    terminal.setDimensions({ columns: 50, rows: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const narrow = lines(written.join(""));
    assert.strictEqual(narrow.filter((line) => line === "═".repeat(49)).length, 4, narrow.join("|"));
    assert.strictEqual(narrow.filter((line) => line === "═".repeat(79)).length, 0);

    terminal.dispose();
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

suite("a session starting brings the framework's terminal into view", () => {
  test("a start shows it; activation, a scan and a close do not", () => {
    // csv-model feedback item 1. Under the pull the session is started in
    // the operator's own CLI, so nothing in the extension is the thing that
    // started it -- and the framework's terminal stayed created-and-unseen
    // since activation, which is easy not to know about at all.
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
    // The first scan of a quiet repository builds nothing and shows nothing.
    revealOnSessionStart(root, null);
    assert.strictEqual(createdTerminals().length, built);

    // The session starts.
    revealOnSessionStart(root, 91);
    const terminal = lastTerminal();
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(terminal.shown, 1);
    // Focus stays where the operator is typing, which is the CLI that
    // started it.
    assert.strictEqual(terminal.preserveFocus, true);

    // Every scan after it is the same session, and re-showing a panel on a
    // timer would make the editor unusable.
    revealOnSessionStart(root, 91);
    revealOnSessionStart(root, 91);
    assert.strictEqual(terminal.shown, 1);

    // It closes, and nothing is shown for that.
    revealOnSessionStart(root, null);
    assert.strictEqual(terminal.shown, 1);

    // The next one starts, and the terminal that is already open is shown
    // rather than rebuilt.
    revealOnSessionStart(root, 92);
    assert.strictEqual(createdTerminals().length, built + 1);
    assert.strictEqual(terminal.shown, 2);

    disposeDabblerTerminals().dispose();
    rmrf(root);
  });

  test("shows itself when a run begins after it was built, from the run record and without the Explorer", () => {
    // The Explorer's scan runs only while the view is visible, and a
    // session started in the person's own CLI while it was collapsed was
    // never seen to start. The terminal reads the run record itself, twice
    // a second, and the first `next` writes one.
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
    // not a start, and the startup noise activation avoids.
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
    // Once: every later look is the same run.
    pty.poll();
    assert.strictEqual(terminal.shown, 1);

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

suite("the watcher's second rule", () => {
  const STARTED = new Date(2026, 7, 31, 14, 28, 5).toISOString();

  const WORKING = {
    schema_version: 1,
    session_number: 62,
    engine: "claude-code",
    phase: "verify",
    seq: 4,
    invocations: 0,
    max_invocations: 24,
    accepted_steps: [],
    baseline_tree: null,
    stop: null,
    job: {
      name: "verification",
      argv: ["node", "dabbler.cjs", "verify"],
      pid: 1,
      log: ".dabbler/runs/s62/driver/jobs/verification.log",
      status: ".dabbler/runs/s62/driver/jobs/verification.status.json",
      started_at: STARTED,
      retry_after_seconds: 60,
    },
    started_at: STARTED,
    updated_at: STARTED,
  };

  test("says a job is outstanding when its log stops growing, and not while it grows", () => {
    // The window the first rule is blind in: while a job runs, the engine
    // owes nothing and the instruction is a `wait`, so a wedged verification
    // round reads as the healthiest thing in the record.
    setConfig("stalledAfterSeconds", 60);
    const root = makeTempDir("dabbler-watcher-");
    const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
    fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(WORKING), "utf8");
    const log = path.join(driver, "jobs", "verification.log");
    fs.writeFileSync(log, "round 1 starting\n", "utf8");

    // The watcher is consulted at most once per half-threshold, so the clock
    // has to move for a second look to happen at all.
    let clock = new Date(2026, 7, 31, 14, 30, 5);
    const written: string[] = [];
    const terminal = new DabblerTerminal({
      repoRoot: root,
      now: () => clock,
      pollMs: 60_000,
    });
    terminal.onDidWrite((text: string) => written.push(text));
    const tick = () => {
      clock = new Date(clock.getTime() + 60_000);
      terminal.poll();
    };

    // First look: the log is drained, and one look is not a comparison.
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    // It wrote something between looks, so it is working.
    fs.appendFileSync(log, "still going\n", "utf8");
    written.length = 0;
    tick();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    // And now it writes nothing at all.
    written.length = 0;
    tick();
    const said = written.filter((t) => plain(t).includes("watcher"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]).includes("state=job-outstanding job=verification"));
    assert.ok(said[0].includes(toneOf("warn", "dark")));

    terminal.dispose();
    clearConfig();
    rmrf(root);
  });
});
