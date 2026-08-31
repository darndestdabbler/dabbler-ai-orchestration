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
// phase the run record moved to, the background job it started, the stop it
// wrote -- and every one of that job's own bytes as they are appended. The
// job log passes through unaltered on purpose. That is where the test
// runners' colours, their checkmarks and their spinner live; session 60
// established that only a real terminal can show them, and stripping them
// here would undo the reason this exists. (`clip` in the router's
// `engines.ts` strips escapes from ENGINE-derived text; that is a different
// seam for a different reason, and neither is a precedent for the other.)
//
// One exception, and it is a rendering one rather than a content one: a
// bare LF is written as CRLF, because a pseudoterminal that receives LF
// alone moves down without returning to column 0 and staircases every line
// after it. Every escape, every colour and every glyph survives untouched.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { RUNS_REL } from "../utils/projection";

/** What the band is painted with. Read once here, used by both themes. */
export const BAND_DARK = "#165044";
export const BAND_LIGHT = "#87decd";

export type ThemeKind = "dark" | "light";

/** Where `jobs.ts` writes a background job's log, under the run's driver dir. */
const JOBS_DIRNAME = "jobs";

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
 * One of the framework's own lines, with the band behind it.
 *
 * The band goes here and only here: a job's own output keeps whatever
 * colours it came with, and painting a background behind it would fight
 * the runner for the same cells.
 */
export function bandedLine(text: string, kind: ThemeKind): string {
  const [r, g, b] = rgb(kind === "dark" ? BAND_DARK : BAND_LIGHT);
  // The light band is pale, so the foreground is forced dark against it;
  // the dark band takes the theme's own light foreground unchanged.
  const foreground = kind === "light" ? "\u001b[38;2;0;0;0m" : "";
  return `\u001b[48;2;${r};${g};${b}m${foreground}${text}\u001b[0m\r\n`;
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
    this.theme = this.readTheme();
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
    this.poll();
  }

  close(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
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
    if (appended !== "") this.writer.fire(forTerminal(appended));
  }

  private sessionLabel(run: RunRecord): string {
    return run.session_number === undefined
      ? "?"
      : String(run.session_number).padStart(3, "0");
  }

  /** One `dabbler [hh:mm:ss] event key=value` line, in the framework's shape. */
  private line(event: string, fields: Record<string, string> = {}): void {
    const at = this.now();
    const clock = [at.getHours(), at.getMinutes(), at.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const rendered = Object.entries(fields)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    this.writer.fire(
      bandedLine(`dabbler [${clock}] ${event}${rendered ? ` ${rendered}` : ""}`, this.theme),
    );
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

function build(repoRoot: string, beside?: vscode.Terminal): void {
  const pty = new DabblerTerminal({ repoRoot });
  const terminal = vscode.window.createTerminal({
    name: `Dabbler — ${path.basename(repoRoot)}`,
    pty,
    ...(beside ? { location: { parentTerminal: beside } } : {}),
  });
  open.set(repoRoot, { terminal, pty, parent: beside });
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
 * **A terminal beside anything but THIS CLI is replaced rather than
 * shown.** VS Code fixes a terminal's location when it is created, so a
 * cached one cannot be moved; showing it puts the framework's work in a
 * tab of its own and leaves the operator with half the arrangement. Two
 * ways in: activation builds one before any CLI exists, and a second
 * session in the same window opens a second CLI that the first session's
 * terminal is not beside. Both are the same rule -- the terminal sits
 * beside the CLI Start just opened, or it is built again.
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
  if (!entry) {
    build(repoRoot, beside);
  } else if (beside !== undefined && entry.parent !== beside) {
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
