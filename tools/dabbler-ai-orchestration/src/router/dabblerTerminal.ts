// The *Dabbler* terminal: the framework's own background work, and nothing
// else.
//
// **The operator's rule, 2026-08-31: this terminal carries no engine chat,
// ever.** Under the pull the framework never sees the chat -- the person is
// reading it in their own CLI, which is the whole point of session 62 --
// and under headless `drive` the engine's stream goes to the "Dabbler:
// Engine" output channel and its grammar, which are untouched. Chat in the
// CLI, work here; no configuration is needed to keep them apart, because
// nothing in this file ever opens a transcript.
//
// What it shows is what the framework is doing while nobody is typing: the
// phase the run record moved to, the background job it started, the
// verification rounds and test runs the machine recorded, the stop it wrote
// -- and every one of that job's own bytes as they are appended. The job
// log passes through unaltered on purpose. That is where the test runners'
// colours, their checkmarks and their spinner live; session 60 established
// that only a real terminal can show them, and stripping them here would
// undo the reason this exists. (`clip` in the router's `engines.ts` strips
// escapes from ENGINE-derived text; that is a different seam for a
// different reason, and neither is a precedent for the other.)
//
// **A verdict and a test outcome are read from the records, never from the
// bytes.** They appear in a job's log too, and repainting them there would
// mean parsing a stream that also carries a runner's own escapes -- which
// is how a spinner gets cut in half. `rounds.jsonl` and `test-runs.jsonl`
// say the same things in a form that cannot be misread, so the framework's
// line about a verdict sits BESIDE the job output rather than on top of it.
//
// One exception, and it is a rendering one rather than a content one: a
// bare LF is written as CRLF, because a pseudoterminal that receives LF
// alone moves down without returning to column 0 and staircases every line
// after it. Every escape, every colour and every glyph survives untouched.
//
// Colour is this file's own, and it says what a line IS rather than naming
// a colour: see `Tone`, `lineTone` and `fieldTone`. Two palettes, resolved
// from the editor's theme kind and re-read when it changes.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { RUNS_REL } from "../utils/projection";

/**
 * What the band is painted with, and why it is gray.
 *
 * It was teal (`#165044` / `#87decd`) and the operator found it too loud to
 * read a session through: a saturated band behind every framework line
 * competes with the line itself, and what the band is FOR is separating the
 * framework's own voice from a test runner's output -- which a neutral gray
 * just off the terminal background does with a fraction of the noise.
 *
 * The dark value is slightly LIGHTER than a dark editor background rather
 * than darker, which is the one place this departs from "a shade darker
 * than the background". Darker than `#1e1e1e` reads as a hole punched in
 * the terminal, not as a band. Lighter reads as a raised row, which is the
 * intent. The light value is the shade darker it says it is.
 *
 * These are fixed per theme kind rather than sampled: a pseudoterminal is
 * handed no colour from the editor and cannot ask what the terminal
 * background actually is, so the two values are the best pair for the
 * default light and dark backgrounds and are stated as such.
 */
export const BAND_DARK = "#2b2b2b";
export const BAND_LIGHT = "#e6e6e6";

/**
 * The foreground the band restores to, explicitly, in both themes.
 *
 * The dark band used to take whatever foreground the theme happened to be
 * using. That worked while nothing else was coloured; it stops working the
 * moment a token inside the line has a colour of its own, because there is
 * then no sequence that says "back to normal" without also dropping the
 * band. Naming both ends makes the restore exact.
 */
export const TEXT_DARK = "#d4d4d4";
export const TEXT_LIGHT = "#1a1a1a";

export type ThemeKind = "dark" | "light";

/**
 * What a line, or a value inside one, IS -- which is the only thing that
 * decides its colour. No event names a colour; it names what it is, and the
 * palette answers in the theme at hand.
 */
export type Tone = "milestone" | "good" | "warn" | "bad" | "muted" | "plain";

/**
 * The two palettes, one per theme kind.
 *
 * They are the editor's own default token colours rather than invented
 * ones, so a session read in either theme looks like the editor it is
 * running in. `plain` is the restore target and is the same value the band
 * opens with.
 */
export const TONES: Readonly<Record<ThemeKind, Readonly<Record<Tone, string>>>> = {
  dark: {
    milestone: "#4ec9b0",
    good: "#6a9955",
    warn: "#d7ba7d",
    bad: "#f14c4c",
    muted: "#8c8c8c",
    plain: TEXT_DARK,
  },
  light: {
    milestone: "#00695c",
    good: "#256029",
    warn: "#8a6100",
    bad: "#a31515",
    muted: "#6b6b6b",
    plain: TEXT_LIGHT,
  },
};

/**
 * The phases that are a lifecycle milestone rather than a step of one.
 *
 * The operator reads this terminal to know where the session has GOT to,
 * and these are the answers worth looking up for: the verification, the
 * suite that is the run of record, the commit and push, the close, and the
 * end. `steps`, `preverify`, `dispositions` and `fix` are the ordinary
 * traffic between them.
 */
const MILESTONE_PHASES = new Set([
  "verify",
  "run-of-record",
  "land",
  "close",
  "complete",
]);

/** Where `jobs.ts` writes a background job's log, under the run's driver dir. */
const JOBS_DIRNAME = "jobs";

/**
 * The verification rounds of one session, as the machine wrote them.
 *
 * Per-session, under the run's own directory, so a rebuilt terminal replays
 * every round this session has had -- which is what a terminal rebuilt
 * mid-session should show.
 */
const ROUNDS_FILENAME = "rounds.jsonl";

/**
 * Every test run this repository has recorded, across every session.
 *
 * Repository-wide, which is why it is NOT replayed: a terminal opened today
 * would otherwise recite months of other sessions' runs before saying
 * anything about this one. It is read forward from wherever it stood when
 * this terminal first looked.
 */
const TEST_RUNS_FILENAME = "test-runs.jsonl";

/**
 * A verdict's tone.
 *
 * `VERIFIED` is the only clean one and it is the only green one. Everything
 * else is a verdict that asks for something -- findings to dispose, a round
 * to run again -- and reads as such. An unknown token is warned rather than
 * assumed good, because a verdict this does not recognise is exactly the
 * case where guessing "fine" is worst.
 */
export function verdictTone(verdict: string): Tone {
  const token = verdict.trim().toUpperCase();
  if (token === "VERIFIED") return "good";
  if (token === "ISSUES_FOUND" || token === "REJECTED" || token === "FAILED") return "bad";
  return "warn";
}

/**
 * What a whole line is, which decides the event word's colour.
 *
 * A stop is the one thing in this terminal that must not be scrolled past.
 * A milestone phase, a verdict and a test run are the lifecycle reaching
 * somewhere -- what the operator opened this terminal to see. Everything
 * else is traffic, and traffic is muted so that the three above stand out
 * of it rather than competing with it.
 */
export function lineTone(event: string, fields: Record<string, string> = {}): Tone {
  if (event === "stopped") return "bad";
  if (event === "verify") return verdictTone(fields["verdict"] ?? "");
  if (event === "tests") return (fields["outcome"] ?? "") === "passed" ? "good" : "bad";
  if (event === "phase") {
    return MILESTONE_PHASES.has(fields["phase"] ?? "") ? "milestone" : "plain";
  }
  if (event === "session-closed") return "milestone";
  return "muted";
}

/**
 * What one field's VALUE is, independent of the line it sits on.
 *
 * Keyed on the key rather than on the event, so a verdict is green wherever
 * it appears and a phase is a milestone wherever it appears. The event is
 * still passed because a `reason` on a stop is the diagnosis and a `reason`
 * anywhere else would not be.
 */
export function fieldTone(event: string, key: string, value: string): Tone {
  if (key === "verdict") return verdictTone(value);
  if (key === "outcome") return value === "passed" ? "good" : "bad";
  if (key === "phase") return MILESTONE_PHASES.has(value) ? "milestone" : "plain";
  if (event === "stopped" && (key === "kind" || key === "reason")) return "bad";
  return "plain";
}

/** A path as the record spells them: repository-relative, forward slashes. */
function relativeToRoot(repoRoot: string, full: string): string {
  return path.relative(repoRoot, full).replace(/\\/g, "/");
}

/** What the terminal is doing, which is the indicator the operator reads. */
export type Activity = "working" | "waiting";

/** The parts of `run.json` this terminal reads. Nothing else is its business. */
interface RunRecord {
  readonly session_number?: number;
  readonly phase?: string;
  readonly stop?: { kind?: string; reason?: string } | null;
  readonly job?: {
    name?: string;
    log?: string;
    started_at?: string;
  } | null;
}

export interface DabblerTerminalOptions {
  readonly repoRoot: string;
  /** The clock the `dabbler [hh:mm:ss]` prefix reads. */
  readonly now?: () => Date;
  /** The editor's theme, re-read rather than cached across a change. */
  readonly themeKind?: () => ThemeKind;
  /** How often the run record and the running job's log are looked at. */
  readonly pollMs?: number;
  /**
   * How often the indicator advances a frame.
   *
   * Separate from `pollMs`, and much shorter: 500ms is how often it is
   * worth reading a file, and it is not a rate anything animates at. A
   * test drives `tick` directly rather than waiting on either.
   */
  readonly spinMs?: number;
}

/** `#165044` as the three numbers an SGR truecolour sequence takes. */
function rgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * The two bytes every sequence here is built from, named rather than
 * spelled. Nothing in this file writes an escape literal.
 */
const ESC = String.fromCharCode(27);
const CRLF = String.fromCharCode(13, 10);
const CR = String.fromCharCode(13);

/**
 * The indicator, and the two frames the operator asked for.
 *
 * Two rather than the usual four: an alternating `/` and `\` is what they
 * described, and it is also the shape that reads as motion at a glance
 * without competing with a test runner's own spinner further up the
 * scrollback.
 */
const SPINNER_FRAMES: readonly string[] = ["/", "\\"];

/** Erase the line the spinner is on and put the cursor back at its start. */
const ERASE_LINE = `${ESC}[2K${CR}`;

/** An SGR truecolour foreground. */
function fg(hex: string): string {
  const [r, g, b] = rgb(hex);
  return `${ESC}[38;2;${r};${g};${b}m`;
}

/**
 * One token in a tone, and the exact restore that follows it.
 *
 * A full reset would end the band as well as the colour, so the restore is
 * spelled out: weight off, foreground back to the band's own. Nothing here
 * touches the background, which is what lets a coloured token sit inside a
 * banded line without punching a hole in it.
 */
export function paint(
  text: string,
  tone: Tone,
  kind: ThemeKind,
  bold = false,
): string {
  const palette = TONES[kind];
  return (
    `${bold ? `${ESC}[1m` : ""}${fg(palette[tone])}${text}` +
    `${ESC}[22m${fg(palette.plain)}`
  );
}

/**
 * One of the framework's own lines, with the band behind it.
 *
 * The band goes here and only here: a job's own output keeps whatever
 * colours it came with, and painting a background behind it would fight
 * the runner for the same cells.
 *
 * **The band is re-opened on every physical line.** A background set once
 * ends at the first newline, so a line whose text carries newlines of its
 * own -- a stop reason holding git's multi-line stderr, which is the case
 * that exposed this -- painted its first line and left the rest bare. The
 * newline inside it was also a bare LF, and a pseudoterminal moves DOWN on
 * LF without returning to column 0, so every following line started under
 * the end of the one above it and the whole stop staircased across the
 * terminal. Normalising and splitting here fixes both at once: each piece
 * gets its own band and its own CRLF.
 *
 * A tone that spans a newline ends at it. That is deliberate -- the first
 * line of a stop carries the colour that says what it is, and its
 * continuation is the detail, which reads better plain than shouted.
 */
export function bandedLine(text: string, kind: ThemeKind): string {
  const [r, g, b] = rgb(kind === "dark" ? BAND_DARK : BAND_LIGHT);
  const open = `${ESC}[48;2;${r};${g};${b}m${fg(TONES[kind].plain)}`;
  return (
    forTerminal(text)
      .split(CRLF)
      .map((line) => `${open}${line}${ESC}[0m`)
      .join(CRLF) + CRLF
  );
}

/** A pseudoterminal only accepts CRLF; nothing else about the bytes changes. */
export function forTerminal(bytes: string): string {
  return bytes.replace(/\r?\n/g, "\r\n");
}

/**
 * Where the live driven run is, or null.
 *
 * The run record is the source for this, not the ledger: the question here
 * is "what is the framework running right now", and `run.json` is the file
 * that answers it. Which session is in FLIGHT is the projection's rule and
 * stays there -- this never restates it.
 */
export function liveRunPath(repoRoot: string): string | null {
  const runs = path.join(repoRoot, RUNS_REL);
  let entries: string[];
  try {
    entries = fs.readdirSync(runs);
  } catch {
    return null;
  }
  const numbered = entries
    .map((name) => ({ name, number: /^s(\d+)$/.exec(name) }))
    .filter((entry) => entry.number !== null)
    .map((entry) => ({ name: entry.name, number: Number(entry.number?.[1]) }))
    .sort((left, right) => right.number - left.number);
  for (const entry of numbered) {
    const candidate = path.join(runs, entry.name, "driver", "run.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Working while the framework is running something, waiting otherwise.
 *
 * One rule, read by the terminal's indicator and by the Work Explorer's
 * liveness row: a job on the run record is the framework doing something
 * nobody is waiting on a person for, and a run with none is the space
 * between calls. A stop is waiting too -- it is the most waiting a session
 * can be doing.
 */
export function currentActivity(repoRoot: string): Activity {
  const runPath = liveRunPath(repoRoot);
  if (runPath === null) return "waiting";
  const run = readRun(runPath);
  if (run === null || run.stop) return "waiting";
  return run.job ? "working" : "waiting";
}

function readRun(runPath: string): RunRecord | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(runPath, "utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as RunRecord) : null;
  } catch {
    // A half-written record is not an event. The next tick reads it whole.
    return null;
  }
}

export class DabblerTerminal implements vscode.Pseudoterminal {
  private readonly writer = new vscode.EventEmitter<string>();
  readonly onDidWrite: vscode.Event<string> = this.writer.event;

  private readonly repoRoot: string;
  private readonly now: () => Date;
  private readonly readTheme: () => ThemeKind;
  private readonly pollMs: number;

  private theme: ThemeKind;
  private timer: ReturnType<typeof setInterval> | undefined;
  private themeSubscription: vscode.Disposable | undefined;

  private phase: string | null = null;
  private jobName: string | null = null;
  private stopKind: string | null = null;
  private activity: Activity = "waiting";
  private spoken: Activity | null = null;

  private readonly spinMs: number;
  private spinTimer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  /**
   * Whether the indicator is currently occupying the last line.
   *
   * Tracked rather than inferred from `activity`, because what has to be
   * erased is what was actually drawn: a write that arrives in the same
   * tick as the transition to `waiting` would otherwise land on top of a
   * frame nobody cleared.
   */
  private spinning = false;

  /**
   * Whether the last thing written ended a line.
   *
   * **The indicator is never drawn anywhere but column 0**, and this is how
   * that is known. A job's log is drained as raw bytes, and a runner mid-line
   * -- a progress counter, a test name being written before its result --
   * leaves the cursor partway along. Drawing there would put the frame at the
   * end of the runner's own text, and the next tick erases the WHOLE line to
   * clear it: the runner's bytes would go with it. Losing a job's output is
   * the one thing this file exists to prevent, so a partial line means no
   * indicator until the line is finished.
   */
  private atLineStart = true;

  /**
   * How far into each job log this terminal has read, by absolute path.
   *
   * Keyed on the FILE rather than on the job the record happens to be
   * carrying, and that is the fix for two ways output was lost: a job
   * removed from `run.json` between two looks took its last bytes with it
   * (its summary line, its final failure), and a job whose whole life fell
   * inside one interval was never read at all. The log outlives the record
   * entry, so reading the directory reads everything either way.
   */
  private readonly logOffsets = new Map<string, number>();

  /** Log paths the record already announced, so nothing is announced twice. */
  private readonly announced = new Set<string>();

  /**
   * How many rows of each JSONL record have been said, by absolute path.
   *
   * Rows rather than bytes, because these are read whole and parsed rather
   * than passed through -- and because a row that is still being written
   * must not be counted as read. See `newRows`.
   */
  private readonly recordLines = new Map<string, number>();

  constructor(options: DabblerTerminalOptions) {
    this.repoRoot = options.repoRoot;
    this.now = options.now ?? (() => new Date());
    this.readTheme =
      options.themeKind ??
      (() =>
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
          ? "light"
          : "dark");
    this.pollMs = options.pollMs ?? 500;
    this.spinMs = options.spinMs ?? 120;
    this.theme = this.readTheme();
  }

  /**
   * Everything this terminal writes goes through here, and that is the whole
   * of how the indicator stays out of the way.
   *
   * The spinner lives on the last line with no newline after it, so any
   * write that arrived while it was drawn would land on top of it. Erasing
   * first and redrawing after means a job's bytes reach the terminal exactly
   * as the runner wrote them -- which is the rule this file exists under --
   * and the indicator reappears below them.
   */
  private say(text: string): void {
    this.erase();
    this.writer.fire(text);
    // Where the cursor is left, which is the only thing that decides
    // whether the indicator may be drawn at all. See `atLineStart`.
    this.atLineStart = text.endsWith(CRLF) || text.endsWith("\n");
    this.draw();
  }

  /** Clear the indicator's line, if it is there. Idempotent. */
  private erase(): void {
    if (!this.spinning) return;
    this.spinning = false;
    this.writer.fire(ERASE_LINE);
  }

  /** Put the current frame back, if there is anything to indicate. */
  private draw(): void {
    if (this.activity !== "working") return;
    // Never on a line something else is already using. See `atLineStart`.
    if (!this.atLineStart) return;
    this.spinning = true;
    this.writer.fire(paint(SPINNER_FRAMES[this.frame] as string, "warn", this.theme));
  }

  /**
   * One frame.
   *
   * Public for the same reason `poll` is: the interval is not the
   * behaviour, and a test that had to wait 120ms per frame would be a test
   * of `setInterval`.
   *
   * A tick while nothing is running erases rather than advancing. An
   * indicator that spins when the framework is idle is worse than none at
   * all -- it is the one thing in this terminal that claims motion, and a
   * false claim there is what an operator would be reading when they
   * decided whether to wait or to intervene.
   */
  tick(): void {
    if (this.activity !== "working") {
      this.erase();
      return;
    }
    this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
    this.erase();
    this.draw();
  }

  /** What the indicator says, which is a job running or the space between. */
  get indicator(): Activity {
    return this.activity;
  }

  open(): void {
    this.line("terminal-opened", { repository: path.basename(this.repoRoot) });
    // A theme switched mid-session repaints from the next line rather than
    // staying wrong. Re-read rather than recomputed: the kind is the
    // editor's answer, and this asks it again instead of guessing.
    this.themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      this.theme = this.readTheme();
    });
    this.timer = setInterval(() => this.poll(), this.pollMs);
    // A poll is a thing this terminal does WHILE something else is
    // happening; it is never a reason for the process to stay alive. In
    // the extension host that changes nothing, and it is the difference
    // between a test run that ends and one that hangs.
    (this.timer as { unref?: () => void }).unref?.();
    // The indicator has its own, faster clock, and the same rule about
    // keeping nothing alive: an animation is never a reason for the
    // extension host to stay up.
    this.spinTimer = setInterval(() => this.tick(), this.spinMs);
    (this.spinTimer as { unref?: () => void }).unref?.();
    this.poll();
  }

  close(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    if (this.spinTimer !== undefined) clearInterval(this.spinTimer);
    this.spinTimer = undefined;
    this.themeSubscription?.dispose();
    this.themeSubscription = undefined;
    this.writer.dispose();
  }

  /**
   * One look at the record and at the running job's log.
   *
   * Public because the interval is not the behaviour: a test drives this
   * directly, and so does the caller that wants a tick on a file event.
   */
  poll(): void {
    const runPath = liveRunPath(this.repoRoot);
    if (runPath === null) return;
    const run = readRun(runPath);
    if (run === null) return;

    if (run.phase !== undefined && run.phase !== this.phase) {
      this.phase = run.phase;
      this.line("phase", { session: this.sessionLabel(run), phase: run.phase });
      // The end of the session, said as the end rather than as one more
      // phase. What the NEXT session's number is stays unsaid here: the
      // sequence skips cancelled numbers, that rule lives in the router's
      // projection, and a second implementation of it in a renderer is
      // exactly the drift this file's own header forbids. The close's log
      // says it, and it passes through.
      if (run.phase === "complete") {
        this.line("session-closed", { session: this.sessionLabel(run) });
      }
    }

    const job = run.job ?? null;
    const collected = !job && this.jobName !== null ? this.jobName : null;
    if (job && job.name !== this.jobName) {
      this.jobName = job.name ?? "job";
      if (job.log) this.announced.add(path.join(this.repoRoot, ...job.log.split("/")));
      this.line("job-started", { name: this.jobName, log: job.log ?? "?" });
    }

    // Drained BEFORE the job is reported collected, so a job's last bytes
    // are spoken before the line that says it finished -- and drained from
    // the directory, so they are spoken whether or not the record still
    // names it.
    this.drainJobs(path.dirname(runPath));

    // The verdict and the test outcome, from the records the machine owns
    // rather than from the job bytes they also appear in. Reading them here
    // is what lets this terminal say them in its own colours WITHOUT
    // repainting a runner's output -- which the header forbids and session
    // 60 is the reason for. The job log still passes through untouched;
    // these lines sit beside it.
    const runDir = path.dirname(path.dirname(runPath));
    this.drainRounds(path.join(runDir, ROUNDS_FILENAME));
    this.drainTestRuns(path.join(this.repoRoot, RUNS_REL, TEST_RUNS_FILENAME));

    if (collected !== null) {
      // What it exited with is the record's to say, not this terminal's to
      // guess -- the phase line that follows is what says how it went.
      this.line("job-collected", { name: collected });
      this.jobName = null;
    }

    const stop = run.stop ?? null;
    if (stop && stop.kind !== this.stopKind) {
      this.stopKind = stop.kind ?? "stopped";
      this.line("stopped", { kind: this.stopKind, reason: stop.reason ?? "" });
    } else if (!stop && this.stopKind !== null) {
      this.stopKind = null;
    }

    // The indicator, said rather than merely held: a person watching this
    // terminal is asking "is anything happening", and a getter no surface
    // renders does not answer them.
    this.activity = stop || !job ? "waiting" : "working";
    if (this.activity !== this.spoken) {
      this.spoken = this.activity;
      this.line(this.activity);
    }
    // The indicator follows the activity immediately rather than at the
    // next animation tick: a framework that has just stopped should not
    // still appear to be spinning, however briefly.
    if (this.activity === "working") this.draw();
    else this.erase();
  }

  /**
   * Every job log in the run's own directory, from wherever this terminal
   * last read it.
   *
   * The whole directory rather than the one job on the record: a short job
   * can start and finish between two looks, and its output is on disk
   * either way. A log nothing announced gets a line of its own, so bytes
   * never arrive from nowhere.
   */
  private drainJobs(driverDir: string): void {
    const dir = path.join(driverDir, JOBS_DIRNAME);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (!name.endsWith(".log")) continue;
      const full = path.join(dir, name);
      if (!this.logOffsets.has(full)) {
        this.logOffsets.set(full, 0);
        if (!this.announced.has(full)) {
          this.announced.add(full);
          this.line("job-output", { log: relativeToRoot(this.repoRoot, full) });
        }
      }
      this.drainFile(full);
    }
  }

  /**
   * This session's verification rounds, each said once.
   *
   * Replayed from the first row, because the file is this session's own and
   * a terminal rebuilt mid-session should show the rounds it has already
   * had -- the same reason the job logs are replayed.
   */
  private drainRounds(file: string): void {
    for (const row of this.newRows(file, true)) {
      this.line("verify", {
        round: String(row["round"] ?? "?"),
        verdict: String(row["verdict"] ?? "?"),
        verifier: String(row["verifier_model"] ?? ""),
      });
    }
  }

  /**
   * Test runs, from wherever the file stood when this terminal first looked.
   *
   * NOT replayed: the file is the repository's, not the session's, and it
   * holds every run of every session. What a terminal opened now should say
   * is what happens now.
   */
  private drainTestRuns(file: string): void {
    for (const row of this.newRows(file, false)) {
      this.line("tests", {
        suite: String(row["suite"] ?? "?"),
        stage: String(row["stage"] ?? ""),
        outcome: String(row["outcome"] ?? "?"),
      });
    }
  }

  /**
   * The rows one JSONL record has gained since the last look.
   *
   * `replay` decides only what the FIRST look does: from the beginning, or
   * from the end. Every look after it is the same either way.
   *
   * **The count stops at the first row that will not parse, and does not
   * step over it.** A file something else is appending to has a
   * half-written last line as its ordinary state, and a reader that counted
   * that line as read would drop the row for good the moment it was
   * finished. Stopping there costs nothing -- the next tick reads it whole
   * -- and it is the difference between a verdict said late and a verdict
   * never said at all.
   */
  private newRows(file: string, replay: boolean): Record<string, unknown>[] {
    let lines: string[];
    try {
      lines = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "");
    } catch {
      return [];
    }
    const seen = this.recordLines.get(file);
    const from = seen ?? (replay ? 0 : lines.length);
    const rows: Record<string, unknown>[] = [];
    let consumed = from;
    for (const line of lines.slice(from)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        break;
      }
      if (parsed === null || typeof parsed !== "object") break;
      rows.push(parsed as Record<string, unknown>);
      consumed += 1;
    }
    this.recordLines.set(file, consumed);
    return rows;
  }

  /** Whatever one log has gained since the last look, byte for byte. */
  private drainFile(logPath: string): void {
    const from = this.logOffsets.get(logPath) ?? 0;
    let appended: string;
    try {
      const handle = fs.openSync(logPath, "r");
      try {
        const size = fs.fstatSync(handle).size;
        if (size <= from) return;
        const buffer = Buffer.alloc(size - from);
        fs.readSync(handle, buffer, 0, buffer.length, from);
        this.logOffsets.set(logPath, size);
        appended = buffer.toString("utf8");
      } finally {
        fs.closeSync(handle);
      }
    } catch {
      return;
    }
    if (appended !== "") this.say(forTerminal(appended));
  }

  private sessionLabel(run: RunRecord): string {
    return run.session_number === undefined
      ? "?"
      : String(run.session_number).padStart(3, "0");
  }

  /**
   * One `dabbler [hh:mm:ss] event key=value` line, in the framework's shape
   * and in the colours that say what it is.
   *
   * The clock and the `key=` of every field are muted, because they are
   * scaffolding: the operator is scanning for the event and for the values.
   * The event takes the line's own tone, and each value takes whatever tone
   * that key's value earns -- which is how a verdict and a test outcome
   * come out green or red without this method knowing what either one is.
   */
  private line(event: string, fields: Record<string, string> = {}): void {
    const at = this.now();
    const clock = [at.getHours(), at.getMinutes(), at.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const tone = lineTone(event, fields);
    const parts = [
      paint(`dabbler [${clock}]`, "muted", this.theme),
      " ",
      paint(event, tone, this.theme, tone !== "muted" && tone !== "plain"),
    ];
    for (const [key, value] of Object.entries(fields)) {
      if (value === "") continue;
      const valueTone = fieldTone(event, key, value);
      parts.push(
        " ",
        paint(`${key}=`, "muted", this.theme),
        paint(value, valueTone, this.theme, valueTone !== "muted" && valueTone !== "plain"),
      );
    }
    this.say(bandedLine(parts.join(""), this.theme));
  }
}

/**
 * One *Dabbler* terminal per repository, and the CLI it was built beside.
 *
 * `parent` is not decoration: a terminal's location is fixed when it is
 * created, so the only thing that says whether this terminal is in the
 * arrangement Start promises is which terminal it was split off. A window
 * runs more than one session, and the second one's CLI is not the first
 * one's.
 */
const open = new Map<
  string,
  {
    terminal: vscode.Terminal;
    pty: DabblerTerminal;
    parent: vscode.Terminal | undefined;
  }
>();

/** Where the pair Start opens lives. The setting's two values, and no third. */
export type TerminalLocation = "editor" | "panel";

/** The setting that says it, in the two halves `getConfiguration` takes. */
export const SETTINGS_SECTION = "dabbler";
export const TERMINAL_LOCATION_KEY = "terminalLocation";

/**
 * Where this window puts the CLI and the framework's terminal.
 *
 * `editor` is the default, on the operator's call: the pair is what a
 * session is read through, and the editor area gives them the height a
 * transcript and a job log both want, where the panel gives them a third of
 * the window and a horizontal split. `panel` keeps the arrangement session
 * 62 built, for anyone who wants their editors to stay editors.
 *
 * Anything else -- a typo in settings.json, a value from a newer version --
 * reads as the default rather than throwing. A setting nobody can mistype
 * into a broken window is worth the two lines.
 */
export function terminalLocation(): TerminalLocation {
  const configured = vscode.workspace
    .getConfiguration(SETTINGS_SECTION)
    .get<string>(TERMINAL_LOCATION_KEY);
  return configured === "panel" ? "panel" : "editor";
}

/**
 * What `createTerminal` is told about where to put the framework's terminal.
 *
 * Under `editor` it is `Beside`, which is the second editor column -- the
 * CLI having been opened in the first. Under `panel` it is split off the
 * CLI itself, which is what `parentTerminal` means and the only way to get
 * two terminals sharing one panel row.
 *
 * Separated from `build` so that both branches are one expression a test
 * can read, rather than a shape only a running editor can show.
 */
export function frameworkTerminalLocation(
  where: TerminalLocation,
  beside: vscode.Terminal | undefined,
): vscode.TerminalOptions["location"] {
  if (where === "editor") return { viewColumn: vscode.ViewColumn.Beside };
  return beside ? { parentTerminal: beside } : undefined;
}

function build(repoRoot: string, beside?: vscode.Terminal): void {
  const pty = new DabblerTerminal({ repoRoot });
  const where = terminalLocation();
  const location = frameworkTerminalLocation(where, beside);
  const terminal = vscode.window.createTerminal({
    name: `Dabbler — ${path.basename(repoRoot)}`,
    pty,
    ...(location ? { location } : {}),
  });
  // Under `editor` the terminal is not beside any ONE cli -- it is its own
  // editor tab -- so nothing is remembered to compare against later, and
  // the rebuild rule below has nothing to fire on. That is the whole
  // difference between the two modes.
  open.set(repoRoot, { terminal, pty, parent: where === "panel" ? beside : undefined });
}

/**
 * The terminal for one repository, beside the CLI Start just opened.
 *
 * `beside` splits it off the engine's own terminal, which is the whole
 * arrangement this feature is: the person's CLI on one side, what the
 * framework is doing on the other. It is shown with focus PRESERVED --
 * the operator is typing to an engine, and a panel that stole the caret
 * mid-sentence would be worse than one they had to go looking for.
 *
 * **Under `panel`, a terminal beside anything but THIS CLI is replaced
 * rather than shown.** VS Code fixes a terminal's location when it is
 * created, so a cached one cannot be moved; showing it puts the framework's
 * work in a tab of its own and leaves the operator with half the
 * arrangement. Two ways in: activation builds one before any CLI exists,
 * and a second session in the same window opens a second CLI that the first
 * session's terminal is not beside. Both are the same rule -- the terminal
 * sits beside the CLI Start just opened, or it is built again.
 *
 * **Under `editor` there is nothing to rebuild for.** The framework's
 * terminal is an editor tab of its own rather than a split of one CLI, so
 * a second session's CLI opening in the first column leaves it exactly
 * where it should be. It is shown, and its scrollback survives -- which is
 * the one thing the panel arrangement cannot offer.
 *
 * What a rebuild costs is the scrollback of the previous session's
 * terminal, and what it buys is a terminal showing THIS session: the new
 * pty reads the job logs from disk, so nothing that happened is lost, it
 * is replayed.
 *
 * Keyed on the repository because a window can hold several: a second
 * workspace folder, a worktree, or one bootstrapped after activation.
 */
export function ensureDabblerTerminal(
  repoRoot: string,
  beside?: vscode.Terminal,
): void {
  const entry = open.get(repoRoot);
  const splitting = terminalLocation() === "panel";
  if (!entry) {
    build(repoRoot, beside);
  } else if (splitting && beside !== undefined && entry.parent !== beside) {
    entry.pty.dispose();
    entry.terminal.dispose();
    build(repoRoot, beside);
  }
  open.get(repoRoot)?.terminal.show(true);
}

/**
 * The terminal for a repository this window is already showing, created
 * and not shown.
 *
 * Activation's case: the session may be driven from a CLI the person
 * opened themselves, and the terminal should be there to be looked at
 * without having taken the panel at startup.
 */
export function openDabblerTerminal(repoRoot: string): void {
  if (open.has(repoRoot)) return;
  build(repoRoot);
}

/**
 * A terminal the person closed, forgotten so the next request builds one.
 *
 * Without this the map holds a disposed terminal for the life of the
 * window, and `show()` on a disposed terminal does nothing at all -- so a
 * repository whose Dabbler terminal was closed once had no Dabbler terminal
 * again until the window was reloaded. Activation creates one and never
 * shows it, which makes closing it the easiest thing in the world to do by
 * accident.
 *
 * The pty goes with it: its interval and its theme subscription are the
 * only things in here that outlive a closed terminal, and a poll writing
 * into an emitter nobody reads is a leak with no symptom.
 */
export function forgetClosedTerminal(closed: vscode.Terminal): void {
  for (const [root, entry] of open) {
    if (entry.terminal !== closed) continue;
    entry.pty.dispose();
    open.delete(root);
    return;
  }
}

/** The subscription that keeps the map honest. Activation holds it. */
export function watchClosedTerminals(): vscode.Disposable {
  return vscode.window.onDidCloseTerminal(forgetClosedTerminal);
}

/**
 * The framework's terminal for one repository, shown -- built first if
 * there is not one.
 *
 * What `dabbler.showFrameworkTerminal` runs, and the answer to a terminal
 * closed by accident. It takes the focus, unlike every other path in this
 * file: a person who asked for this terminal by name is asking to look at
 * it, and preserving focus would answer a different question.
 */
export function revealDabblerTerminal(repoRoot: string): void {
  if (!open.has(repoRoot)) build(repoRoot);
  open.get(repoRoot)?.terminal.show(false);
}

/** Every one of them, when the extension goes away. */
export function disposeDabblerTerminals(): vscode.Disposable {
  return {
    dispose: () => {
      for (const entry of open.values()) {
        entry.pty.dispose();
        entry.terminal.dispose();
      }
      open.clear();
    },
  };
}
