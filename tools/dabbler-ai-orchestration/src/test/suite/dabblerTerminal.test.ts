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
  bandedLine,
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
    assert.ok(written.some((t) => t.includes("job-started name=verification round")));
    // Said, not merely held: a getter no surface renders answers nobody.
    assert.strictEqual(written.filter((t) => t.includes("] working")).length, 1);
    // And not repeated on every look while nothing has changed.
    written.length = 0;
    terminal.poll();
    assert.deepStrictEqual(written.filter((t) => t.includes("] working")), []);

    written.length = 0;
    writeRun(driver, { session_number: 62, phase: "land", stop: null, job: null });
    terminal.poll();
    assert.strictEqual(terminal.indicator, "waiting");
    assert.ok(written.some((t) => t.includes("job-collected")));
    assert.strictEqual(written.filter((t) => t.includes("] waiting")).length, 1);
    // The record moving is an event of its own, in the framework's shape.
    assert.ok(written.some((t) => t.includes("dabbler [14:30:05] phase session=062 phase=land")));

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
    assert.ok(written.some((t) => t.includes("job-output log=")));
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
    const spoken = written.join("");
    assert.ok(spoken.includes("stopped kind=budget"));
    assert.ok(spoken.includes("driver.max_invocations (24)"));
    assert.ok(!spoken.includes("rewritten"));
    assert.ok(!spoken.includes("engine:"));

    terminal.dispose();
    rmrf(root);
  });
});

/** The SGR background one band renders as, without the line around it. */
function bandOf(hex: string): string {
  return bandedLine("", hex === BAND_DARK ? "dark" : "light").split("m")[0] + "m";
}
