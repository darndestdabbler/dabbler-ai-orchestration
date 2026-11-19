// The Dabbler Terminal's lines: the framework's background work, and nothing
// else.
//
// What is asserted is what reaches the writer -- the framework's own lines
// in their outline, and a job's bytes exactly as the runner wrote them.

import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";

import { GATE_NOT_APPLICABLE } from "../src/gates.ts";
import { TONES, fieldTone, lineTone, type ThemeKind, type Tone } from "../src/transcript.ts";
import {
  HANGING_INDENT,
  RULE_CHAR,
  TerminalLines,
  forTerminal,
  layout,
  paint,
  watcherLookMs,
  type Span,
  type TerminalLinesOptions,
  type TerminalNotice,
  type TerminalRecord,
} from "../src/views/terminalLines.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const ESC = "\u001b";

// A scratch directory is not a repository: every git question the watcher's
// tree probe asks is answered as git answers one outside a repository.
const restoreGit = gitAnswers([[() => true, { code: 128, stderr: "fatal: not a git repository" }]]);
after(restoreGit);

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

type Extra = Partial<Omit<TerminalLinesOptions, "repoRoot" | "write">>;

/** A terminal over `root`, and the writes it made. */
function linesOver(root: string, extra: Extra = {}): { written: string[]; terminal: TerminalLines } {
  const written: string[] = [];
  const terminal = new TerminalLines({
    repoRoot: root,
    write: (text) => written.push(text),
    now: () => new Date(2026, 7, 31, 14, 30, 5),
    // The interval is not the behaviour; every test drives `poll` itself.
    pollMs: 60_000,
    theme: "dark",
    ...extra,
  });
  return { written, terminal };
}

/** A repository with one driven run, and the writes and notices the terminal made. */
function drivenRepo(
  run: Record<string, unknown>,
  noticed: TerminalNotice[] = [],
  extra: Extra = {},
): { root: string; driver: string; written: string[]; terminal: TerminalLines } {
  const root = tempDir("dabbler-terminal-");
  const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
  fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(run), "utf8");
  const { written, terminal } = linesOver(root, { notice: (notice) => noticed.push(notice), ...extra });
  return { root, driver, written, terminal };
}

/**
 * Every phase this framework writes, from the schema that declares them.
 *
 * Read rather than listed: a list here is a second copy of the vocabulary,
 * and the last one let four phases fall out of the tone they should have
 * had without anything failing.
 */
function phaseVocabulary(): string[] {
  const schema = path.join(import.meta.dirname, "..", "schemas", "driver-run.schema.json");
  const parsed = JSON.parse(fs.readFileSync(schema, "utf8")) as {
    $defs?: { phase?: { enum?: string[] } };
  };
  const phases = parsed.$defs?.phase?.enum;
  if (phases === undefined) throw new Error(`no phase enum in ${schema}`);
  return phases;
}

function writeRun(driver: string, run: Record<string, unknown>): void {
  fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(run), "utf8");
}

/**
 * One of the framework's lines with every SGR sequence taken out.
 *
 * The grammar and the colour are two separate claims and are asserted
 * separately: what the line SAYS is checked here, and what it is painted is
 * checked by the tests that look for a tone.
 */
function plain(text: string): string {
  return text
    .split(ESC)
    .map((piece, index) => (index === 0 ? piece : piece.slice(piece.indexOf("m") + 1)))
    .join("");
}

/** The foreground one tone renders as, without the text around it. */
function toneOf(tone: Tone, kind: ThemeKind): string {
  return paint("", tone, kind).split("m")[0] + "m";
}

const RUNNING = {
  session_number: 62,
  phase: "verify",
  stop: null,
  job: { name: "verification round", log: ".dabbler/runs/s62/driver/jobs/verification-round.log" },
};

describe("the Dabbler terminal's lines", () => {
  it("passes a job's log through byte for byte, escapes included", () => {
    const { root, driver, written, terminal } = drivenRepo(RUNNING);
    // The first look is history; the job starts writing after it.
    terminal.poll();
    const log = path.join(driver, "jobs", "verification-round.log");
    const runnerOutput = `${ESC}[32m✓${ESC}[0m 214 passed\n`;
    fs.writeFileSync(log, runnerOutput, "utf8");

    terminal.poll();
    const passthrough = written.filter((text) => text.includes("214 passed"));
    assert.strictEqual(passthrough.length, 1);
    assert.ok(passthrough[0]!.includes(`${ESC}[32m`));
    assert.ok(passthrough[0]!.includes("✓"));
    assert.ok(passthrough[0]!.includes(`${ESC}[0m`));
    // The one rendering exception, and it is not a content change.
    assert.ok(passthrough[0]!.endsWith("\r\n"));
    assert.strictEqual(passthrough[0]!.replace(/\r\n/g, "\n"), runnerOutput);

    // Only what is new since the last look, so a long run is not replayed.
    written.length = 0;
    fs.appendFileSync(log, "second line\n", "utf8");
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => t.includes("passed")), []);
    assert.ok(written.some((t) => t.includes("second line")));

    terminal.dispose();
    rmrf(root);
  });

  it("says working while a job runs and waiting when none does, once each way", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
    assert.strictEqual(terminal.indicator, "working");
    assert.ok(written.some((t) => plain(t).includes("job-started name=verification round")));
    assert.strictEqual(written.filter((t) => plain(t).includes("14:30:05 working")).length, 1);
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("14:30:05 working")), []);

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.strictEqual(terminal.indicator, "waiting");
    assert.ok(written.some((t) => plain(t).includes("job-collected")));
    assert.strictEqual(written.filter((t) => plain(t).includes("14:30:05 waiting")).length, 1);
    // The session was named on the first phase line and is not repeated.
    assert.ok(written.some((t) => plain(t).includes("14:30:05 phase now=land")));
    assert.ok(!written.some((t) => plain(t).includes("session=062 now=land")));

    terminal.dispose();
    rmrf(root);
  });

  it("stops claiming working once the job has exited uncollected, and says the router's words once", () => {
    // A full record, because the reader that answers this is the router's
    // and it validates what it reads.
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
    assert.ok(plain(said[0]!).includes("'verification' finished at 2026-08-31T14:05:00.000Z (exit 4)"));
    assert.ok(plain(said[0]!).includes("`dabbler session next`"));
    assert.ok(!written.some((t) => plain(t).includes("14:30:05 working")));
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("14:30:05 uncollected")), []);
    // A tick while nothing runs draws no frame.
    written.length = 0;
    terminal.tick();
    assert.ok(!written.some((t) => plain(t).includes("/") || plain(t).includes("\\")));
    assert.strictEqual(terminal.indicator, "uncollected");

    terminal.dispose();
    rmrf(root);
  });

  it("keeps a job's last bytes when the record drops it, and a whole job it never saw", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
    const log = path.join(driver, "jobs", "verification-round.log");
    fs.writeFileSync(log, "round 1 starting\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => t.includes("round 1 starting")));

    // The job writes its summary and the framework collects it, both
    // between two looks.
    written.length = 0;
    fs.appendFileSync(log, "VERIFIED in 4 rounds\n", "utf8");
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes("VERIFIED in 4 rounds")));

    // A short job whose whole life fell inside one interval.
    written.length = 0;
    fs.writeFileSync(path.join(driver, "jobs", "close.log"), "close: session 062 closed\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => plain(t).includes("job-output log=")));
    assert.ok(written.some((t) => t.includes("close: session 062 closed")));

    terminal.dispose();
    rmrf(root);
  });

  it("draws a suite's results as a mark, the project and its counts, for a .NET project and a Maven module alike", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.start();
    written.length = 0;
    fs.writeFileSync(
      path.join(driver, "jobs", "run-of-record-maven.log"),
      "dabbler [02:35:00] project-running project=person-model\n" +
        "dabbler [02:35:05] project-passed project=person-model pass=3 fail=0 not_run=0\n" +
        "dabbler [02:35:05] project-no-tests project=csv-deserializer\n" +
        "dabbler [02:35:09] test-failed test=Spec.B.Tests.PersistenceTests.SavesAPerson message=Assert.Equal() Failure: Values differ\n" +
        "dabbler [02:35:10] project-failed project=Spec.B.Tests pass=5 fail=2 not_run=1\n",
      "utf8",
    );
    terminal.poll();
    const said = written.map(plain).join("");
    assert.match(said, /^02:35:00 running person-model\r?$/m);
    assert.match(said, /^02:35:05 ✔ person-model: 3 pass, 0 fail, 0 not run\r?$/m);
    assert.match(said, /^02:35:05 ⚠ csv-deserializer: no tests found\r?$/m);
    assert.match(said, /^02:35:09 {3}Spec\.B\.Tests\.PersistenceTests\.SavesAPerson: Assert\.Equal\(\) Failure: Values differ\r?$/m);
    assert.match(said, /^02:35:10 ✘ Spec\.B\.Tests: 5 pass, 2 fail, 1 not run\r?$/m);
    assert.doesNotMatch(said, /project-passed|pass=|dabbler \[/);
    const painted = written.join("");
    assert.ok(painted.includes(paint("3 pass", "good", "dark")), "a pass count is green");
    assert.ok(painted.includes(paint("2 fail", "bad", "dark", true)), "a fail count is red");
    assert.ok(painted.includes(paint("0 fail", "muted", "dark")), "a zero is muted");

    terminal.dispose();
    rmrf(root);
  });

  it("draws a replayed router line the way it draws its own, and leaves every other line of a log as it was", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.start();
    written.length = 0;
    fs.writeFileSync(
      path.join(driver, "jobs", "close.log"),
      "dabbler [20:02:12] phase from=land to=close\n" +
        "dabbler [20:02:13] step widget has had no answer for 31 min\n" +
        "close: session 062 closed\n" +
        "✔ the gates pass\n",
      "utf8",
    );
    terminal.poll();
    const said = written.map(plain).join("");
    assert.match(said, /^20:02:12 phase from=land to=close\r?$/m);
    assert.match(said, /^20:02:13 step widget has had no answer for 31 min\r?$/m);
    assert.doesNotMatch(said, /dabbler \[/);
    assert.match(said, /^close: session 062 closed\r?$/m);
    assert.match(said, /^✔ the gates pass\r?$/m);
    // The file on disk is nobody's to rewrite.
    assert.match(fs.readFileSync(path.join(driver, "jobs", "close.log"), "utf8"), /^dabbler \[20:02:12\] phase/);

    // A read can land in the middle of a router line: its opening is held
    // until its end is written.
    written.length = 0;
    fs.appendFileSync(path.join(driver, "jobs", "close.log"), "dabbler [20:02:14] phase from=close ", "utf8");
    terminal.poll();
    assert.doesNotMatch(written.map(plain).join(""), /20:02:14|dabbler \[/);
    fs.appendFileSync(path.join(driver, "jobs", "close.log"), "to=complete\n", "utf8");
    terminal.poll();
    const joined = written.map(plain).join("");
    assert.match(joined, /^20:02:14 phase from=close to=complete\r?$/m);
    assert.doesNotMatch(joined, /dabbler \[/);
    // Anybody else's unfinished line is shown at once.
    written.length = 0;
    fs.appendFileSync(path.join(driver, "jobs", "close.log"), "pushing\nd", "utf8");
    terminal.poll();
    assert.match(written.map(plain).join(""), /pushing\r?\nd$/);

    terminal.dispose();
    rmrf(root);
  });

  it("draws an answer taken, a check starting and ending, and a suite's batch in its one line format", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.start();
    written.length = 0;
    fs.writeFileSync(
      path.join(driver, "jobs", "run-of-record.log"),
      "dabbler [13:10:12] answer-taken seq=2 step=widget status=done notes=made it real\n" +
        'dabbler [13:10:12] check-started step=widget argv=["npm","test"]\n' +
        'dabbler [13:10:40] check-ended step=widget argv=["npm","test"] outcome=passed seconds=28\n' +
        'dabbler [13:10:41] check-ended step=widget argv=["npm","run","lint"] outcome=failed seconds=1\n' +
        "TAP version 13\n" +
        "dabbler [13:11:02] suite-batch files=10/72 passed=180 failed=0\n",
      "utf8",
    );
    terminal.poll();
    const said = written.map(plain).join("");
    assert.match(said, /^13:10:12 answer-taken seq=2 step=widget status=done notes=made it real\r?$/m);
    assert.match(said, /^13:10:12 check-started step=widget argv=\["npm","test"\]\r?$/m);
    assert.match(said, /^13:10:40 check-ended step=widget argv=\["npm","test"\] outcome=passed seconds=28\r?$/m);
    assert.match(said, /^13:11:02 suite-batch files=10\/72 passed=180 failed=0\r?$/m);
    assert.doesNotMatch(said, /dabbler \[/);
    const painted = written.join("");
    assert.ok(painted.includes(paint("passed", "good", "dark", true)), "a passed check is green");
    assert.ok(painted.includes(paint("failed", "bad", "dark", true)), "a failed check is red");

    terminal.dispose();
    rmrf(root);
  });

  it("paints in the theme it is given, and in a new one from the next line", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.start();
    // The first look says `phase=verify`, a milestone, in the dark palette.
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "dark"))));

    written.length = 0;
    terminal.setTheme("light");
    writeRun(driver, { session_number: 62, phase: "close", stop: null, job: null });
    terminal.poll();
    assert.ok(written.some((t) => t.includes(toneOf("milestone", "light"))));
    assert.ok(!written.some((t) => t.includes(toneOf("milestone", "dark"))));
    // Nothing is painted behind a line in either theme.
    assert.ok(!written.some((t) => t.includes(`${ESC}[48;`)));

    terminal.dispose();
    rmrf(root);
  });

  it("says a stop out loud, and never speaks a word the engine said", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    // The engine's transcript sits right beside the run record, and this
    // terminal never reads it.
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
    assert.ok(spoken.includes("paused session=062 kind=budget"));
    assert.ok(spoken.includes("driver.max_invocations (24)"));
    assert.ok(spoken.includes("who=you"));
    assert.ok(spoken.includes("dabbler session run --max-invocations"));
    assert.ok(!spoken.includes("stopped kind"));
    assert.ok(!spoken.includes("rewritten"));
    assert.ok(!spoken.includes("engine:"));

    terminal.dispose();
    rmrf(root);
  });

  it("carries the stop's code to the rendering, so the coded stops keep their own actor and command", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    writeRun(driver, {
      session_number: 62,
      phase: "verify",
      job: null,
      engine: "cli",
      stop: {
        kind: "verification",
        code: "cap-disputed",
        reason: "the cap is reached and one blocking finding is disputed",
      },
    });

    terminal.poll();
    const spoken = plain(written.join(""));
    assert.ok(spoken.includes("who=you"));
    assert.ok(spoken.includes("dabbler verify adjudicate"));
    assert.ok(!spoken.includes("dabbler session next"));

    terminal.dispose();
    rmrf(root);
  });

  it("says every way on with its cost, not only the first command", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    writeRun(driver, {
      session_number: 62,
      phase: "verify",
      job: null,
      engine: "cli",
      stop: {
        kind: "verification",
        code: "provider-unreachable",
        reason: "routed verification call failed: connect ETIMEDOUT",
      },
    });

    terminal.poll();
    const spoken = plain(written.join(""));
    for (const command of [
      "dabbler session next",
      "dabbler configure --reviewer-model",
      "dabbler session cancel",
    ]) {
      assert.ok(spoken.includes(command), command);
    }
    assert.ok(spoken.includes("One more attempt at the same round"));
    assert.ok(spoken.includes("Verification stays cross-provider either way"));
    assert.ok(spoken.includes("ends with your reason on the record"));

    terminal.dispose();
    rmrf(root);
  });

  it("indents every continuation line of a multi-line reason and leaves no bare LF", () => {
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
    assert.strictEqual(stop.split("\n").length - 1, stop.split("\r\n").length - 1);
    const lines = plain(stop).split("\r\n").filter((line) => line !== "");
    assert.ok(lines.length >= 3, String(lines.length));
    assert.ok(lines.slice(1).every((line) => line.startsWith(" ".repeat(HANGING_INDENT))));
    assert.ok(lines[0]?.startsWith("14:30:05 paused"));
    assert.ok(lines[1]?.startsWith(`${" ".repeat(HANGING_INDENT)}remote: permission denied`));
    assert.ok(lines[2]?.startsWith(`${" ".repeat(HANGING_INDENT)}remote: contact an owner`));

    terminal.dispose();
    rmrf(root);
  });

  it("colours a line by what it is, and says the verdict and the test outcome", () => {
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
    // The repository-wide record is replayed for THIS session only.
    assert.ok(!said.includes("tests suite=typescript"));
    assert.ok(said.includes("tests suite=dotnet stage=preverify-targeted outcome=passed"));

    written.length = 0;
    fs.appendFileSync(
      path.join(root, ".dabbler", "runs", "test-runs.jsonl"),
      JSON.stringify({ suite: "extension", stage: "preverify-targeted", outcome: "failed" }) + "\n",
      "utf8",
    );
    terminal.poll();
    const later = written.join("");
    assert.ok(plain(later).includes("tests suite=extension stage=preverify-targeted outcome=failed"));
    assert.ok(later.includes(toneOf("bad", "dark")));
    assert.ok(!later.includes(toneOf("good", "dark")));

    terminal.dispose();
    rmrf(root);
  });

  it("says progress resumed once the phase has left the pause, and not before, and not past a replacement", () => {
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 62,
      phase: "steps",
      job: null,
      stop: { kind: "tests", reason: "the suite was red", at: "2026-08-31T14:00:00-04:00" },
    });
    terminal.poll();
    assert.ok(plain(written.join("")).includes("paused session=062 kind=tests"));

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "steps", job: null, stop: null });
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("progress-resumed"));

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "verify", job: null, stop: null });
    terminal.poll();
    const moved = plain(written.join(""));
    assert.ok(moved.includes("progress-resumed past=tests from=steps phase=verify"), moved);
    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "run-of-record", job: null, stop: null });
    terminal.poll();
    assert.ok(!plain(written.join("")).includes("progress-resumed"));

    // A replacement is a new pause, and never progress.
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

  it("resolves the same tone in either theme, and never the same colour", () => {
    for (const tone of ["milestone", "good", "warn", "bad", "muted"] as const) {
      assert.ok(TONES.dark[tone].startsWith("#"));
      assert.ok(TONES.light[tone].startsWith("#"));
      assert.notStrictEqual(TONES.dark[tone], TONES.light[tone]);
    }
    // `plain` is the terminal's own foreground and paints nothing.
    assert.strictEqual(paint("text", "plain", "dark"), "text");
    // EVERY phase, read from the schema that declares them.
    const phases = phaseVocabulary();
    assert.ok(phases.includes("preverify") && phases.includes("steps"), phases.join(","));
    for (const phase of phases) {
      assert.strictEqual(lineTone("phase", { now: phase }), "milestone", phase);
      assert.strictEqual(fieldTone("phase", "now", phase), "milestone", phase);
    }
    assert.strictEqual(lineTone("paused", {}), "warn");
    assert.strictEqual(lineTone("paused", { class: "deadlock" }), "warn");
    assert.strictEqual(lineTone("progress-resumed", {}), "good");
    assert.strictEqual(lineTone("verify", { verdict: "SOMETHING_NEW" }), "warn");
  });

  it("tells of a run begun after it was built, once, and not of one already there", () => {
    const root = tempDir("dabbler-runstart-");
    const older = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(older, { recursive: true });
    writeRun(older, {
      session_number: 62,
      phase: "complete",
      job: null,
      stop: null,
      started_at: "2026-08-31T13:00:00.000Z",
    });
    const started: number[] = [];
    const { terminal } = linesOver(root, { onRunStarted: (session) => started.push(session) });
    terminal.poll();
    assert.deepStrictEqual(started, []);

    const newer = path.join(root, ".dabbler", "runs", "s63", "driver");
    fs.mkdirSync(newer, { recursive: true });
    writeRun(newer, {
      session_number: 63,
      phase: "plan",
      job: null,
      stop: null,
      started_at: new Date().toISOString(),
    });
    terminal.poll();
    terminal.poll();
    assert.deepStrictEqual(started, [63]);

    terminal.dispose();
    rmrf(root);
  });
});

describe("the lines as data", () => {
  it("carries the same events in the same order in its json form as in its text form", () => {
    const root = tempDir("dabbler-json-");
    const runDir = path.join(root, ".dabbler", "runs", "s62");
    const driver = path.join(runDir, "driver");
    const jobs = path.join(driver, "jobs");
    fs.mkdirSync(jobs, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "rounds.jsonl"),
      JSON.stringify({ round: 1, verdict: "VERIFIED", reviewer_model: "gpt-5.6-sol", recorded_at: "2026-08-31T14:00:00.000Z" }) + "\n",
      "utf8",
    );
    fs.writeFileSync(path.join(jobs, "verification.log"), "verify: done\n", "utf8");
    fs.utimesSync(path.join(jobs, "verification.log"), new Date("2026-08-31T13:55:00.000Z"), new Date("2026-08-31T13:55:00.000Z"));
    fs.writeFileSync(
      path.join(jobs, "close.log"),
      "dabbler [14:20:01] phase from=land to=close\nclose: pushing\n",
      "utf8",
    );
    writeRun(driver, {
      session_number: 62,
      phase: "close",
      job: { name: "close", log: ".dabbler/runs/s62/driver/jobs/close.log" },
      stop: null,
    });

    const textNotices: TerminalNotice[] = [];
    const jsonNotices: TerminalNotice[] = [];
    // The indicator is not an event, and its frames are not lines.
    const text = linesOver(root, { indicator: false, notice: (notice) => textNotices.push(notice) });
    const json = linesOver(root, { format: "json", notice: (notice) => jsonNotices.push(notice) });
    const both = (act: () => void) => {
      act();
      text.terminal.poll();
      json.terminal.poll();
    };
    both(() => undefined);
    both(() => fs.appendFileSync(path.join(jobs, "close.log"), "close: pushed\n", "utf8"));
    both(() =>
      writeRun(driver, {
        session_number: 62,
        phase: "close",
        job: null,
        stop: { kind: "land", reason: "the push was refused", at: "2026-08-31T14:25:00-04:00" },
      }),
    );

    const textEvents = plain(text.written.join(""))
      .split("\r\n")
      .flatMap((line) => /^\d\d:\d\d:\d\d (\S+)/.exec(line)?.[1] ?? []);
    const records = json.written.join("").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as TerminalRecord);
    const jsonEvents = records.flatMap((record) => (record.kind === "line" ? [record.event] : []));
    assert.ok(textEvents.includes("earlier-job") && textEvents.includes("paused"), textEvents.join(","));
    assert.deepStrictEqual(jsonEvents, textEvents);
    // A job's own lines are its own objects, and nothing in the stream is an escape.
    assert.deepStrictEqual(
      records.flatMap((record) => (record.kind === "output" ? [record.text] : [])),
      ["close: pushing", "close: pushed"],
    );
    assert.ok(!json.written.join("").includes(ESC));
    // The notice is in the stream, and is the one handed over in either form.
    const streamed = records.filter((record) => record.kind === "notice");
    assert.strictEqual(streamed.length, 1);
    assert.deepStrictEqual(jsonNotices, textNotices);
    assert.deepStrictEqual({ ...streamed[0]!, kind: undefined }, { ...jsonNotices[0]!, kind: undefined });

    text.terminal.dispose();
    json.terminal.dispose();
    rmrf(root);
  });
});

describe("the session from its registration, and each step as it starts", () => {
  /** A repository whose ledger holds one in-progress row and no run record yet. */
  function registeredRepo(row: Record<string, unknown>): { root: string; written: string[]; terminal: TerminalLines } {
    const root = tempDir("dabbler-registered-");
    fs.mkdirSync(path.join(root, "docs", "sessions"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs", "sessions", "sessions.json"),
      JSON.stringify({ sessions: [{ number: 7, status: "in-progress", ...row }] }),
      "utf8",
    );
    const { written, terminal } = linesOver(root, { now: () => new Date(2026, 8, 8, 14, 5, 1) });
    return { root, written, terminal };
  }

  it("says the banner from the in-progress ledger row, before any run record, and once", () => {
    const registered = registeredRepo({});
    registered.terminal.start(80);
    registered.terminal.poll();
    const said = plain(registered.written.join(""));
    assert.ok(said.includes("SESSION 007"), said);
    const driver = path.join(registered.root, ".dabbler", "runs", "s7", "driver");
    fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
    writeRun(driver, { session_number: 7, phase: "plan", job: null, stop: null });
    registered.terminal.poll();
    const all = plain(registered.written.join(""));
    assert.strictEqual(all.split("SESSION 007").length - 1, 1, all);
    assert.ok(!all.includes("global scope="), all);
    registered.terminal.dispose();
    rmrf(registered.root);
  });

  it("says a step once when seq moves onto it, a rejection with its first reason, and nothing for a wait", () => {
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
    terminal.start(100);
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

  it("says the step line on a later poll when the instruction was not readable on the first look", () => {
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 62,
      phase: "steps",
      seq: 7,
      job: null,
      stop: null,
    });
    const instructionPath = path.join(driver, "instruction.json");
    terminal.start(100);
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

  it("says a step line again for seq 1 of the next session, though the last session's seq 1 was said", () => {
    const { root, driver, written, terminal } = drivenRepo({ session_number: 62, phase: "steps", seq: 1, job: null, stop: null });
    fs.writeFileSync(
      path.join(driver, "instruction.json"),
      JSON.stringify({ kind: "step", seq: 1, session_number: 62, step_id: "widget", ask: "Build the widget." }),
      "utf8",
    );
    terminal.start(100);
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

  it("says a step line for every step of a whole session, replayed as one really ran", () => {
    // Session 142's shape, from its record: seqs 1 to 24, the plan, seven
    // accepted steps, the round-1 rejection and the fix step it issued,
    // with waits between and a done at the end.
    const steps = [
      "plan",
      "heading-is-the-number-and-the-rule",
      "measure-how-often-the-rule-draws",
      "repo-retrunk",
      "retrunk-narrates-and-instructs",
      "bootstrap-offers-the-choice",
      "candidate-trunk-takes-the-whole-reading",
      "release-2-0-21",
    ];
    const issued: { kind: string; step?: string }[] = [
      ...steps.map((step) => ({ kind: "step", step })),
      { kind: "wait" },
      { kind: "wait" },
      { kind: "rejection", step: "release-2-0-21" },
      { kind: "step", step: "fix-round-1" },
      ...Array.from({ length: 11 }, () => ({ kind: "wait" })),
      { kind: "done" },
    ];
    const { root, driver, written, terminal } = drivenRepo({
      session_number: 142,
      phase: "plan",
      seq: 0,
      job: null,
      stop: null,
    });
    terminal.start(100);
    issued.forEach((entry, at) => {
      const seq = at + 1;
      // The instruction first, then the run record that points at it.
      fs.writeFileSync(
        path.join(driver, "instruction.json"),
        JSON.stringify({
          kind: entry.kind,
          seq,
          session_number: 142,
          ...(entry.step === undefined ? {} : { step_id: entry.step }),
          ask: `Do ${entry.step ?? "nothing"}.`,
          ...(entry.kind === "rejection" ? { reasons: ["Something was found."] } : {}),
        }),
        "utf8",
      );
      writeRun(driver, { session_number: 142, phase: "work", seq, job: null, stop: null });
      terminal.poll();
    });
    const said = plain(written.join(""));
    for (const step of [...steps, "fix-round-1"]) {
      assert.strictEqual(said.split(`step id=${step} `).length - 1, 1, `${step}\n${said}`);
    }
    terminal.dispose();
    rmrf(root);
  });

  it("rules the framework's voice with the session number once a session is known, and without one before", () => {
    const { root, written, terminal } = drivenRepo({ session_number: 62, phase: "plan", job: null, stop: null });
    terminal.start(80);
    // Before the first look nothing is known: the opening line is ruled `framework`.
    const opened = plain(written.join(""));
    assert.ok(opened.includes(`${RULE_CHAR} framework ${RULE_CHAR}`), opened);
    assert.ok(!new RegExp(`62 ${RULE_CHAR} framework`).test(opened), opened);
    written.length = 0;
    terminal.poll();
    const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.writeFileSync(path.join(driver, "jobs", "close.log"), "closing\n", "utf8");
    terminal.poll();
    writeRun(driver, { session_number: 62, phase: "verify", job: null, stop: null });
    terminal.poll();
    const later = plain(written.join(""));
    assert.match(later, new RegExp(`${RULE_CHAR}{2} 62 ${RULE_CHAR} framework ${RULE_CHAR}{2}`), later);
    assert.ok(!new RegExp(`${RULE_CHAR}{2} framework`).test(later), later);
    terminal.dispose();
    rmrf(root);
  });

  it("heads a job's rule with the session number too", () => {
    const { root, written, terminal } = drivenRepo({ session_number: 62, phase: "verify", job: null, stop: null });
    terminal.start(80);
    terminal.poll();
    written.length = 0;
    const jobs = path.join(root, ".dabbler", "runs", "s62", "driver", "jobs");
    fs.writeFileSync(path.join(jobs, "verify-round-1.log"), "reviewing\n", "utf8");
    terminal.poll();
    const said = plain(written.join(""));
    assert.match(said, new RegExp(`${RULE_CHAR}{2} 62 ${RULE_CHAR} verify-round-1 ${RULE_CHAR}{2}`), said);
    assert.ok(!new RegExp(`${RULE_CHAR}{2} verify-round-1`).test(said), said);
    terminal.dispose();
    rmrf(root);
  });

  it("gives a session that puts no job output on the terminal a numbered heading anyway", () => {
    const { root, written, terminal } = drivenRepo({ session_number: 133, phase: "steps", job: null, stop: null });
    terminal.start(80);
    terminal.poll();
    const said = plain(written.join(""));
    assert.ok(!new RegExp(`${RULE_CHAR} 133 ${RULE_CHAR} framework ${RULE_CHAR}`).test(said), said);
    const rows = said.split("\r\n");
    const headings = rows.flatMap((line, at) => (line.trim() === "SESSION 133" ? [at] : []));
    assert.deepStrictEqual(headings.length, 1, said);
    const heading = headings[0]!;
    assert.strictEqual(rows[heading - 1], "═".repeat(79));
    assert.strictEqual(rows[heading + 1], "═".repeat(79));
    const phase = rows.findIndex((line) => line.includes("now=steps"));
    assert.ok(phase > heading + 1, said);
    terminal.dispose();
    rmrf(root);
  });
});

describe("the outline", () => {
  const indent = " ".repeat(HANGING_INDENT);
  const words = (lines: Span[][]) => lines.map((physical) => physical.map((s) => s.text).join(""));

  it("lays a line out with the clock at the edge and everything after it under the text", () => {
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
    assert.strictEqual(wrapped[1]?.[1]?.tone, "bad");
    const long = layout([{ text: "x".repeat(50), tone: "plain", bold: false }], 30);
    assert.deepStrictEqual(words(long).map((line) => line.length), [29, 29, 10]);
    const reason = layout([{ text: "git push failed:\nremote: denied", tone: "plain", bold: false }], null);
    assert.deepStrictEqual(words(reason), ["git push failed:", `${indent}remote: denied`]);
  });

  it("wraps its own lines at the terminal's width, and lays them out again when it is resized", async () => {
    const root = tempDir("dabbler-outline-");
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
    const { written, terminal } = linesOver(root, { resizeMs: 1 });
    const clear = `${ESC}[H${ESC}[2J${ESC}[3J`;
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

    terminal.start(60);
    terminal.poll();
    const narrow = written.flatMap(physical);
    assert.ok(narrow.every((line) => line.length <= 59), narrow.join("|"));
    assert.ok(narrow.some((line) => line.startsWith(indent)));
    assert.ok(narrow.every((line) => line.startsWith("14:30:05 ") || line.startsWith(indent)));

    written.length = 0;
    terminal.setColumns(1000);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const stream = written.join("");
    assert.ok(stream.includes(clear));
    const wide = physical(stream);
    assert.ok(wide.length < narrow.length, `${wide.length} vs ${narrow.length}`);
    assert.ok(
      wide.every((line) => line.startsWith("14:30:05 ") || line.startsWith(indent)),
      wide.join("|"),
    );
    assert.strictEqual(
      wide.join(" ").replace(/\s+/g, " "),
      narrow.join(" ").replace(/\s+/g, " "),
    );

    terminal.dispose();
    rmrf(root);
  });
});

describe("the first look, and the rule between voices", () => {
  it("says the session's history in time order, dumps no log, and rules a voice in when it changes", async () => {
    const root = tempDir("dabbler-firstlook-");
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

    const { written, terminal } = linesOver(root, { resizeMs: 1 });
    terminal.start(100);
    terminal.poll();

    const said = plain(written.join(""));
    const order = [
      "earlier-job name=verification log=.dabbler/runs/s62/driver/jobs/verification.log exit=0",
      "verify round=1 verdict=VERIFIED reviewer=gpt-5.4",
      "tests suite=dotnet stage=final-full outcome=passed",
      "earlier-job name=close log=.dabbler/runs/s62/driver/jobs/close.log",
      "phase session=062 now=complete",
      "session-closed session=062",
    ];
    const positions = order.map((line) => said.indexOf(line));
    assert.ok(positions.every((position) => position >= 0), said);
    assert.deepStrictEqual([...positions].sort((a, b) => a - b), positions, said);
    assert.strictEqual(said.split("tests suite=dotnet").length - 1, 1);
    assert.ok(!said.includes("verify: round 1 -- VERIFIED"), said);
    assert.ok(!said.includes("close: session 062 closed"), said);
    assert.strictEqual(said.split("─── framework ───").length - 1, 1, said);

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
    const later = plain(written.join(""));
    assert.match(later, /─ 62 ─ close ─+\r\nclose: pushed 1 round ref\(s\)\r\n/, later);
    assert.match(later, /─ 62 ─ framework ─+\r\n14:30:05 paused/, later);
    assert.ok(later.startsWith("\r\n─"), later.slice(0, 40));
    assert.match(later, /ref\(s\)\r\n\r\n─+ 62 ─ framework ─/, later);
    assert.ok(said.startsWith("─"), said.slice(0, 40));
    const rule = later.split("\r\n").find((line) => line.includes("─ 62 ─ close ─")) ?? "";
    assert.strictEqual(rule.length, 99, rule);
    written.length = 0;
    terminal.setColumns(40);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const narrow = plain(written.join("")).split("\r\n").filter((line) => line.includes("─ 62 ─ close ─"));
    assert.strictEqual(narrow.length, 1);
    assert.strictEqual(narrow[0]?.length, 39, narrow[0]);

    terminal.dispose();
    rmrf(root);
  });

  it("shows a job's output in one piece, under one divider of its name", () => {
    const { root, driver, terminal, written } = drivenRepo({ session_number: 62, phase: "land", stop: null, job: null });
    const jobs = path.join(driver, "jobs");
    terminal.start();
    terminal.poll();
    written.length = 0;

    fs.writeFileSync(path.join(jobs, "run-of-record-maven.log"), "[INFO] Scanning for projects...\n", "utf8");
    writeRun(driver, {
      session_number: 62,
      phase: "run-of-record",
      stop: null,
      job: { name: "run of record: maven", log: ".dabbler/runs/s62/driver/jobs/run-of-record-maven.log" },
    });
    terminal.poll();
    fs.appendFileSync(path.join(jobs, "run-of-record-maven.log"), "[INFO] BUILD SUCCESS\n", "utf8");
    terminal.poll();

    const said = plain(written.join(""));
    assert.strictEqual(said.split("─ run-of-record-maven ─").length - 1, 1, said);
    const between = said.slice(said.indexOf("Scanning for projects"), said.indexOf("BUILD SUCCESS"));
    assert.ok(said.includes("BUILD SUCCESS") && !between.includes("─") && !/\d\d:\d\d:\d\d/.test(between), said);
    assert.ok(said.indexOf(" working") >= 0 && said.indexOf(" working") < said.indexOf("Scanning for projects"), said);

    terminal.dispose();
    rmrf(root);
  });

  it("shows a running job's output from its first byte when it is opened while the job runs", () => {
    const { root, driver, terminal, written } = drivenRepo({
      session_number: 62,
      phase: "run-of-record",
      stop: null,
      job: { name: "run of record: maven", log: ".dabbler/runs/s62/driver/jobs/run-of-record-maven.log" },
    });
    const jobs = path.join(driver, "jobs");
    fs.writeFileSync(path.join(jobs, "verification.log"), "verify: round 1 -- VERIFIED\n", "utf8");
    fs.writeFileSync(path.join(jobs, "verification.status.json"), JSON.stringify({ exit: 0 }), "utf8");
    fs.writeFileSync(
      path.join(jobs, "run-of-record-maven.log"),
      "running maven: mvn -B verify\n[INFO] Scanning for projects...\n",
      "utf8",
    );
    terminal.start();
    terminal.poll();
    fs.appendFileSync(path.join(jobs, "run-of-record-maven.log"), "[WARNING] Plugin validation issues were detected\n", "utf8");
    terminal.poll();

    const said = plain(written.join(""));
    assert.match(said, /running maven: mvn -B verify\r?\n\[INFO\] Scanning for projects\.\.\./);
    assert.match(said, /^\[WARNING\] Plugin validation issues were detected\r?$/m);
    assert.match(said, /earlier-job name=verification/);
    assert.ok(!said.includes("verify: round 1 -- VERIFIED"), said);

    terminal.dispose();
    rmrf(root);
  });

  it("opens a session under its own banner, again when the next one starts, and at the width in hand", async () => {
    const root = tempDir("dabbler-banner-");
    const first = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(path.join(first, "jobs"), { recursive: true });
    writeRun(first, { session_number: 62, phase: "complete", job: null, stop: null });
    const { written, terminal } = linesOver(root, { resizeMs: 1 });
    terminal.start(80);
    terminal.poll();

    const lines = (text: string) => plain(text).split("\r\n");
    const opened = lines(written.join(""));
    const heading = opened.indexOf("═".repeat(79));
    assert.ok(heading >= 0, opened.join("|"));
    assert.strictEqual(opened[heading + 1]?.trim(), "SESSION 062");
    assert.strictEqual(opened[heading + 1]?.indexOf("S"), Math.floor((79 - "SESSION 062".length) / 2));
    assert.strictEqual(opened[heading + 2], "═".repeat(79));
    assert.ok(opened.indexOf("14:30:05 phase session=062 now=complete") > heading + 2);
    assert.ok(!opened[heading + 3]?.includes("─"), opened[heading + 3]);

    written.length = 0;
    const next = path.join(root, ".dabbler", "runs", "s63", "driver");
    fs.mkdirSync(path.join(next, "jobs"), { recursive: true });
    writeRun(next, { session_number: 63, phase: "plan", job: null, stop: null });
    terminal.poll();
    terminal.poll();
    assert.strictEqual(lines(written.join("")).filter((line) => line.trim() === "SESSION 063").length, 1);
    assert.ok(plain(written.join("")).includes("phase session=063 now=plan"));

    written.length = 0;
    terminal.setColumns(50);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const narrow = lines(written.join(""));
    assert.strictEqual(narrow.filter((line) => line === "═".repeat(49)).length, 4, narrow.join("|"));
    assert.strictEqual(narrow.filter((line) => line === "═".repeat(79)).length, 0);

    terminal.dispose();
    rmrf(root);
  });
});

describe("the indicator", () => {
  it("advances while the framework is working, and is not drawn when it is not", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();

    written.length = 0;
    terminal.tick();
    const first = written.join("");
    terminal.tick();
    const second = written.join("").slice(first.length);
    assert.ok(plain(first).includes("/") || plain(first).includes("\\"));
    assert.ok(plain(second).includes("/") || plain(second).includes("\\"));
    assert.notStrictEqual(plain(first).trim(), plain(second).trim());

    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    written.length = 0;
    terminal.tick();
    assert.strictEqual(plain(written.join("")).replace(/[\r\n]/g, ""), "");

    terminal.dispose();
    rmrf(root);
  });

  it("gets out of the way of a job's bytes and comes back after them", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();
    terminal.tick();

    written.length = 0;
    const log = path.join(driver, "jobs", "verification-round.log");
    fs.writeFileSync(log, `${ESC}[32m✓${ESC}[0m 214 passed\n`, "utf8");
    terminal.poll();

    const stream = written.join("");
    assert.ok(stream.includes(`${ESC}[32m`));
    assert.ok(stream.includes("214 passed"));
    const cleared = stream.indexOf(`${ESC}[2K`);
    assert.ok(cleared >= 0 && cleared < stream.indexOf("214 passed"));

    terminal.dispose();
    rmrf(root);
  });

  it("never shares a line with a runner mid-line, and so never erases its bytes", () => {
    const { root, driver, terminal, written } = drivenRepo(RUNNING);
    terminal.poll();

    written.length = 0;
    const log = path.join(driver, "jobs", "verification-round.log");
    fs.writeFileSync(log, "  ✓ widget returns 2", "utf8");
    terminal.poll();
    assert.ok(written.join("").includes("widget returns 2"));

    written.length = 0;
    terminal.tick();
    assert.strictEqual(written.join(""), "");

    fs.appendFileSync(log, "  (4ms)\n", "utf8");
    terminal.poll();
    written.length = 0;
    terminal.tick();
    assert.ok(plain(written.join("")).includes("/") || plain(written.join("")).includes("\\"));

    terminal.dispose();
    rmrf(root);
  });

  it("stops when the terminal goes away", () => {
    const { root, terminal, written } = drivenRepo(RUNNING);
    terminal.start();
    terminal.dispose();
    written.length = 0;
    terminal.tick();
    assert.strictEqual(written.join(""), "");
    rmrf(root);
  });
});

describe("the watcher", () => {
  const ISSUED = new Date(2026, 7, 31, 14, 28, 5).toISOString();
  const threshold = { stalledAfterSeconds: () => 60 };

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

  it("says an instruction is outstanding once past the threshold, and not on every look", () => {
    const { root, driver, written, terminal } = drivenRepo(WAITING, [], threshold);
    outstanding(driver);

    terminal.poll();
    const said = written.filter((t) => plain(t).includes("watcher"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]!).includes("since=120s state=instruction-outstanding"));
    assert.ok(said[0]!.includes(toneOf("warn", "dark")));

    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    terminal.dispose();
    rmrf(root);
  });

  it("stays quiet while the framework itself is working", () => {
    const { root, driver, written, terminal } = drivenRepo(
      {
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
      },
      [],
      threshold,
    );
    outstanding(driver);

    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    terminal.dispose();
    rmrf(root);
  });

  it("says the loop's overdue event once, in the terminal and as a notice, and not again", () => {
    const warned: TerminalNotice[] = [];
    const { root, driver, written, terminal } = drivenRepo(WAITING, warned);
    const overdue = (at: string) =>
      JSON.stringify({ at, event: "instruction-overdue", seq: 4, step: "widget", outstanding_seconds: 1860, tree_quiet: true }) + "\n";
    fs.writeFileSync(path.join(driver, "supervision.jsonl"), overdue(ISSUED), "utf8");

    terminal.poll();
    const said = written.filter((t) => plain(t).includes("instruction-overdue"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]!).includes("step=widget seq=4 outstanding=1860s"));
    assert.strictEqual(warned.length, 1);
    assert.deepStrictEqual(
      { ...warned[0]!, message: "" },
      { notice: "instruction-overdue", step: "widget", seq: "4", outstandingSeconds: 1860, message: "" },
    );
    assert.match(warned[0]!.message, /step widget .*owed an answer for 31 min.*ask the AI in its chat/);

    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("instruction-overdue")), []);
    assert.strictEqual(warned.length, 1);

    fs.appendFileSync(path.join(driver, "supervision.jsonl"), overdue(ISSUED) + overdue(ISSUED), "utf8");
    terminal.poll();
    assert.strictEqual(written.filter((t) => plain(t).includes("instruction-overdue")).length, 2);
    assert.strictEqual(warned.length, 3);

    terminal.dispose();
    rmrf(root);
  });

  it("raises a stop where the operator is, once, with its first sentence and who acts", () => {
    const warned: TerminalNotice[] = [];
    const { root, driver, terminal } = drivenRepo(RUNNING, warned);
    terminal.start();
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
    const notice = warned[0]!;
    assert.ok(notice.notice === "paused");
    assert.strictEqual(notice.session, "062");
    assert.strictEqual(notice.stop, "close");
    // The whole reason is the notice's to carry; its sentence carries the first.
    assert.ok(notice.reason.includes("Run the suite again"), notice.reason);
    assert.ok(notice.message.includes("the close refused: test_run_fresh failed."), notice.message);
    assert.ok(!notice.message.includes("Run the suite again"), notice.message);
    assert.match(notice.message, /act\(s\) next/);
    assert.ok(notice.message.includes(`${notice.who} act(s) next`), notice.message);

    terminal.poll();
    assert.strictEqual(warned.length, 1);

    terminal.dispose();
    rmrf(root);
  });

  it("closed and opened again, rebuilds where the session is from the record and owns nothing of it", () => {
    const since = new Date(2026, 7, 31, 14, 27, 52).toISOString();
    const owed = {
      session_number: 62,
      phase: "work",
      job: null,
      stop: null,
      waiting: { owner: "author", for: "step 4", since, by: null, last_progress: since },
    };
    const first = drivenRepo(owed);
    first.terminal.start();
    first.terminal.poll();
    const before = fs.readFileSync(path.join(first.driver, "run.json"), "utf8");
    first.terminal.dispose();
    assert.strictEqual(fs.readFileSync(path.join(first.driver, "run.json"), "utf8"), before);

    const again = linesOver(first.root);
    again.terminal.start();
    again.terminal.poll();
    const said = again.written.map(plain).join("\n");
    assert.match(said, /work/);
    assert.match(said, /Author owes step 4 — 2:1\d/);
    again.terminal.dispose();
    rmrf(first.root);
  });

  it("says who the session is waiting on, once, and again when the AI picks it up", () => {
    const { root, driver, written, terminal } = drivenRepo(RUNNING);
    terminal.start();
    written.length = 0;

    // The fixture clock is 2026-08-31 14:30:05, and this wait began 133s before it.
    const since = new Date(2026, 7, 31, 14, 27, 52).toISOString();
    const owed = {
      session_number: 62,
      phase: "work",
      job: null,
      stop: null,
      waiting: { owner: "author", for: "step 4", since, by: null, last_progress: since },
    };
    writeRun(driver, owed);
    terminal.poll();
    const said = written.filter((t) => plain(t).includes("waiting-on"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]!).includes("Author owes step 4"), plain(said[0]!));
    assert.ok(plain(said[0]!).includes("nothing has read it"), plain(said[0]!));

    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("waiting-on")), []);

    // The waiter stamping its beacon IS news: the instruction was picked up.
    fs.writeFileSync(
      path.join(driver, "waiter.json"),
      JSON.stringify({ pid: 1, at: new Date().toISOString() }),
      "utf8",
    );
    terminal.poll();
    const delivered = written.filter((t) => plain(t).includes("waiting-on"));
    assert.strictEqual(delivered.length, 1);
    assert.ok(!plain(delivered[0]!).includes("nothing has read it"), plain(delivered[0]!));

    written.length = 0;
    writeRun(driver, {
      ...owed,
      waiting: {
        owner: "job",
        for: "verification",
        since,
        by: new Date(Date.parse(since) + 600_000).toISOString(),
        last_progress: since,
      },
    });
    terminal.poll();
    assert.ok(written.some((t) => plain(t).includes("Verification — 2:1")), written.join("|"));
    assert.ok(written.some((t) => plain(t).includes("of 10:00")), written.join("|"));

    terminal.dispose();
    rmrf(root);
  });

  it("follows the loop's own log, so a loop a waiter revived is not invisible", () => {
    const { root, driver, written, terminal } = drivenRepo(RUNNING);
    terminal.start();
    written.length = 0;

    fs.writeFileSync(path.join(driver, "loop.log"), "dabbler: an hour of history\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => plain(t).includes("loop-output log=")));
    assert.ok(!written.some((t) => t.includes("an hour of history")));

    written.length = 0;
    fs.appendFileSync(path.join(driver, "loop.log"), "dabbler: phase phase=land\n", "utf8");
    terminal.poll();
    assert.ok(written.some((t) => t.includes("phase phase=land")));

    terminal.dispose();
    rmrf(root);
  });

  it("is asked no more often than it can answer differently", () => {
    assert.strictEqual(watcherLookMs(1800), 60_000);
    assert.strictEqual(watcherLookMs(60), 30_000);
    assert.strictEqual(watcherLookMs(2), 5_000);
  });

  it("takes the interface's threshold over the repository's, and the repository's when it has none", () => {
    // The repository unconfigured answers 1800 s, and at that threshold a
    // wait of 120 s is quiet; the operator's 60 s says it.
    const quiet = drivenRepo(WAITING, [], { stalledAfterSeconds: () => undefined });
    outstanding(quiet.driver);
    quiet.terminal.poll();
    assert.deepStrictEqual(quiet.written.filter((t) => plain(t).includes("watcher")), []);
    quiet.terminal.dispose();
    rmrf(quiet.root);

    const told = drivenRepo(WAITING, [], threshold);
    outstanding(told.driver);
    told.terminal.poll();
    assert.strictEqual(told.written.filter((t) => plain(t).includes("watcher")).length, 1);
    told.terminal.dispose();
    rmrf(told.root);
  });
});

describe("the watcher's second rule", () => {
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

  it("says a job is outstanding when its log stops growing, and not while it grows", () => {
    const root = tempDir("dabbler-watcher-");
    const driver = path.join(root, ".dabbler", "runs", "s62", "driver");
    fs.mkdirSync(path.join(driver, "jobs"), { recursive: true });
    fs.writeFileSync(path.join(driver, "run.json"), JSON.stringify(WORKING), "utf8");
    const log = path.join(driver, "jobs", "verification.log");
    fs.writeFileSync(log, "round 1 starting\n", "utf8");

    // The watcher is consulted at most once per half-threshold, so the clock
    // has to move for a second look to happen at all.
    let clock = new Date(2026, 7, 31, 14, 30, 5);
    const { written, terminal } = linesOver(root, { now: () => clock, stalledAfterSeconds: () => 60 });
    const tick = () => {
      clock = new Date(clock.getTime() + 60_000);
      terminal.poll();
    };

    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    fs.appendFileSync(log, "still going\n", "utf8");
    written.length = 0;
    tick();
    assert.deepStrictEqual(written.filter((t) => plain(t).includes("watcher")), []);

    written.length = 0;
    tick();
    const said = written.filter((t) => plain(t).includes("watcher"));
    assert.strictEqual(said.length, 1);
    assert.ok(plain(said[0]!).includes("state=job-outstanding job=verification"));
    assert.ok(said[0]!.includes(toneOf("warn", "dark")));

    terminal.dispose();
    rmrf(root);
  });
});

describe("the marks in a job's bytes", () => {
  const paintedMark = (line: string): string => {
    const out = forTerminal(line, "dark");
    const start = out.indexOf(ESC);
    if (start === -1) return "";
    const body = out.slice(start).split(ESC);
    return body
      .slice(1)
      .map((piece) => piece.slice(piece.indexOf("m") + 1))
      .join("")
      .slice(0, 1);
  };

  it("paints the mark opening a line and leaves every character after it alone", () => {
    for (const mark of ["\u2713", "\u2714", "\u2717", "\u2716"]) {
      const line = `  ${mark} working_tree_clean`;
      const out = forTerminal(line, "dark");
      assert.strictEqual(paintedMark(line), mark, out);
      assert.strictEqual(plain(out), line, out);
    }
  });

  it("leaves a line whose mark is not in the first column exactly as it arrived", () => {
    const line = "  a test named \u2714 in its title";
    assert.strictEqual(forTerminal(line, "dark"), line);
    assert.strictEqual(forTerminal("\u2714ok", "dark"), "\u2714ok");
    for (const other of ["\u25b6", "\u2139", "\ufe63"]) {
      assert.strictEqual(forTerminal(`${other} something`, "dark"), `${other} something`);
    }
  });

  it("leaves a gate that judged nothing unpainted: it wears a dash, which is no mark", () => {
    const judged = "  \u2713 working_tree_clean";
    const judgedNothing = `  - exposure_within_ceiling ${GATE_NOT_APPLICABLE}`;
    assert.notStrictEqual(forTerminal(judged, "dark"), judged);
    assert.strictEqual(forTerminal(judgedNothing, "dark"), judgedNothing.replace(/\r?\n/g, "\r\n"));
  });

  it("does not paint the first glyph of a chunk that continues a line", () => {
    const chunk = "\u2714 a pass";
    assert.notStrictEqual(forTerminal(chunk, "dark", true), chunk);
    assert.strictEqual(forTerminal(chunk, "dark", false), chunk);
    const two = `tail of a line\n\u2714 a pass`;
    assert.ok(forTerminal(two, "dark", false).includes(ESC), "the second line is still painted");
  });
});
