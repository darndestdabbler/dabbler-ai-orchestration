// The *Dabbler* terminal: the framework's own background work, and nothing
// else, in a VS Code terminal.
//
// **What it says is the router's.** The readers, the formatting and the
// polling that turn a run's records into lines are `TerminalLines`, which
// `dabbler terminal` prints at a bare prompt too; this file is the VS Code
// terminal around it -- creating it, where it opens, revealing it when a
// session starts, and passing on its size and the colour theme. Nothing
// here decides what a line says, so no other interface can come to say it
// differently.
//
// **This terminal carries no engine chat, ever.** Chat in the CLI, work
// here; nothing in this file ever opens a transcript.
//
// The two notices the lines raise -- a session paused, an instruction
// overdue -- are shown as VS Code warnings, because the operator may be in
// the AI's chat or another window entirely and not looking at this terminal.

import * as path from "path";
import * as vscode from "vscode";

import {
  TerminalLines,
  stalledAfterSeconds,
  type Activity,
  type TerminalNotice,
  type ThemeKind,
} from "dabbler-ai-router";

export interface DabblerTerminalOptions {
  readonly repoRoot: string;
  /** The clock the `hh:mm:ss` prefix reads. */
  readonly now?: () => Date;
  /**
   * The instant this terminal came to exist, as `Date.now()` counts it: a
   * run that started after it is a session beginning while this terminal
   * watched, and `onDidStartRun` says so.
   */
  readonly since?: number;
  /** How long a resize is allowed to settle before the lines are laid out again. */
  readonly resizeMs?: number;
  /** The editor's theme, re-read rather than cached across a change. */
  readonly themeKind?: () => ThemeKind;
  /** How often the run record and the running job's log are looked at. */
  readonly pollMs?: number;
  /** How often the indicator advances a frame. */
  readonly spinMs?: number;
  /** How a notice reaches the operator outside this terminal; a VS Code warning by default. */
  readonly warn?: (message: string) => void;
}

/** The editor's theme as the router's palette names it. */
function editorTheme(): ThemeKind {
  return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
    ? "light"
    : "dark";
}

/**
 * The threshold the watcher is judged against, in the precedence the Work
 * Explorer already publishes: the operator's editor setting, then the
 * repository's own `verification.stalled_after_seconds`, then the default.
 *
 * The middle tier is asked of the router rather than restated here. A
 * renderer that fell back to a number of its own would quietly ignore a
 * threshold somebody set in `dabbler.yaml` on purpose.
 */
export function watcherThreshold(repoRoot: string): number {
  return operatorThreshold() ?? stalledAfterSeconds(repoRoot);
}

/** The operator's own threshold, or undefined where none is set. */
function operatorThreshold(): number | undefined {
  try {
    const configured = vscode.workspace
      .getConfiguration(SETTINGS_SECTION)
      .get<number>(STALLED_AFTER_KEY);
    if (typeof configured === "number" && configured > 0) return Math.trunc(configured);
  } catch {
    // No configuration host, which is the unit suite. The repository answers.
  }
  return undefined;
}

export class DabblerTerminal implements vscode.Pseudoterminal {
  private readonly writer = new vscode.EventEmitter<string>();
  readonly onDidWrite: vscode.Event<string> = this.writer.event;

  /**
   * A run beginning for this repository after this terminal was built,
   * with its session number. It is the lines' own reading of the run
   * record they already poll, which is why it fires whether or not the
   * Work Explorer is visible.
   */
  private readonly started = new vscode.EventEmitter<number>();
  readonly onDidStartRun: vscode.Event<number> = this.started.event;

  private readonly lines: TerminalLines;
  private readonly readTheme: () => ThemeKind;
  private themeSubscription: vscode.Disposable | undefined;

  constructor(options: DabblerTerminalOptions) {
    this.readTheme = options.themeKind ?? editorTheme;
    const warn = options.warn ?? ((message: string) => void vscode.window.showWarningMessage(message));
    this.lines = new TerminalLines({
      repoRoot: options.repoRoot,
      write: (text) => this.writer.fire(text),
      now: options.now,
      since: options.since,
      theme: this.readTheme(),
      pollMs: options.pollMs,
      spinMs: options.spinMs,
      resizeMs: options.resizeMs,
      stalledAfterSeconds: operatorThreshold,
      onRunStarted: (session) => this.started.fire(session),
      notice: (notice: TerminalNotice) => warn(notice.message),
    });
  }

  /** The editor's word on how wide this terminal is now. */
  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.lines.setColumns(dimensions.columns);
  }

  /** One frame of the indicator; public because the interval is not the behaviour. */
  tick(): void {
    this.lines.tick();
  }

  /** What the indicator says, which is a job running or the space between. */
  get indicator(): Activity {
    return this.lines.indicator;
  }

  open(initialDimensions?: vscode.TerminalDimensions): void {
    // A theme switched mid-session repaints from the next line rather than
    // staying wrong. Re-read rather than recomputed: the kind is the
    // editor's answer, and this asks it again instead of guessing.
    this.themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      this.lines.setTheme(this.readTheme());
    });
    this.lines.start(initialDimensions?.columns);
  }

  close(): void {
    this.dispose();
  }

  dispose(): void {
    this.lines.dispose();
    this.themeSubscription?.dispose();
    this.themeSubscription = undefined;
    this.started.dispose();
    this.writer.dispose();
  }

  /** One look at the record and at the running job's log; a test drives this directly. */
  poll(): void {
    this.lines.poll();
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
/** The operator's stall threshold, which the watcher line is judged against too. */
export const STALLED_AFTER_KEY = "stalledAfterSeconds";

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
  // A run beginning after this terminal was built brings it into view,
  // focus preserved: the person is typing in the CLI that began it. This
  // is the terminal's own reading of the run record, and it does not wait
  // on the Work Explorer's scan -- see `revealOnSessionStart` for the
  // Explorer's, which fires at registration when the view is there to see
  // it, and this one, which fires at the first `next` whether or not it is.
  pty.onDidStartRun(() => open.get(repoRoot)?.terminal.show(true));
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
 * Whether two consecutive readings of one repository are a session STARTING.
 *
 * Three cases decide it, and each is here because getting it wrong is
 * visible to the operator:
 *
 * - Nothing in flight now: not a start, whatever came before. A session
 *   ending must not open a panel.
 * - No previous reading: not a start. This window has just activated, and a
 *   session that was already running when it opened was not started by
 *   anything the operator did here -- taking the panel then is the
 *   startup-noise activation deliberately avoids.
 * - The number changed: a start. One session closing and the next
 *   registering between two readings is still the next one starting, and it
 *   is the exact shape of the loop this framework runs.
 */
export function isSessionStart(
  before: number | null | undefined,
  after: number | null,
): boolean {
  if (after === null || before === undefined) return false;
  return before !== after;
}

/** The last reading per repository, so a start is a change and not a state. */
const inFlightSeen = new Map<string, number | null>();

/**
 * Show the framework's terminal when a session starts here.
 *
 * csv-model feedback item 1: the operator ran `dabbler session start` in
 * their own CLI and the framework's terminal stayed exactly where activation
 * left it -- created, never shown, and easy not to know about. Start Session
 * pressed in the Explorer already opens it; a session begun anywhere else
 * did not, which is most of them under the pull.
 *
 * Focus is preserved, because the person is typing in the CLI that started
 * the session, and it fires on the transition rather than on every scan: the
 * repositories are re-read on a timer and on every file event, and a panel
 * that reopened on each of those would be unusable.
 */
export function revealOnSessionStart(
  repoRoot: string,
  currentSession: number | null,
): void {
  const before = inFlightSeen.get(repoRoot);
  inFlightSeen.set(repoRoot, currentSession);
  if (isSessionStart(before, currentSession)) ensureDabblerTerminal(repoRoot);
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
      // The readings go with them. A window that reopens starts with no
      // previous reading, which is what makes a session already in flight
      // at activation not a start.
      inFlightSeen.clear();
    },
  };
}
