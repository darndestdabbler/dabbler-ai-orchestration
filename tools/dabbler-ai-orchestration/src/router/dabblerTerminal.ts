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
// **The framework's own lines are an outline.** Each begins with the clock
// at column 0 and everything after it -- a wrapped tail, a reason that
// carries git's own newlines -- continues under the text, not under the
// clock, so a reader scanning the left edge sees one entry per event
// however long the entry is. The terminal knows its own width (`open` and
// `setDimensions` are told it), wraps to it, and when the width changes it
// clears and lays every line out again at the new one, job output replayed
// byte for byte between them. A hanging indent that the terminal's own
// reflow undid on the first resize would be a promise the layout does not
// keep.
//
// **Two voices, and a rule between them.** The framework's own lines and a
// job's output are different things, and where one gives way to the other
// a rule is drawn across the terminal with the name of the voice that
// follows set into it -- `framework`, or the job's name. The scrollback
// then reads as titled groups, and a job's bytes inside its group are the
// runner's own, untouched. Nothing is drawn between two framework lines.
// A session opens under a heavier banner of its own -- `SESSION 004`
// between two double rules -- whenever the run record moves to a new one.
//
// **The first look says history, and dumps nothing.** A terminal opened
// mid-session, or after one, used to replay every job log on disk whole
// and in filename order -- the close before the run of record before the
// verification, with a thousand lines of runner output between two
// framework lines. Now it says what the records say happened, one dated
// line each in time order: this session's verification rounds, this
// session's test runs, and each job log already on disk, named with where
// it is. Only bytes appended after the terminal opened pass through.
//
// Colour is this file's own, and it says what a line IS rather than naming
// a colour: see `Tone`, `lineTone` and `fieldTone`. Two palettes, resolved
// from the editor's theme kind and re-read when it changes. There is no
// background behind the framework's lines: the clock and the indent are
// what separate them from a job's output, and a band did that at the cost
// of competing with the line it was behind.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
  WATCHER_QUIET,
  progressResumed,
  readUncollectedJob,
  readWatcher,
  renderStop,
  stalledAfterSeconds,
} from "dabbler-ai-router";

import { RUNS_REL } from "../utils/projection";
import { SESSIONS_REL } from "../utils/fileSystem";

export type ThemeKind = "dark" | "light";

/**
 * What a line, or a value inside one, IS -- which is the only thing that
 * decides its colour. No event names a colour; it names what it is, and the
 * palette answers in the theme at hand. `plain` is the terminal's own
 * foreground and is painted with nothing.
 */
export type Tone = "milestone" | "good" | "warn" | "bad" | "muted" | "plain";

/** The tones that carry a colour of their own. */
export type PaintedTone = Exclude<Tone, "plain">;

/**
 * The two palettes, one per theme kind.
 *
 * The dark values are the operator's, chosen on 2026-09-06 against the
 * editor's defaults: the milestone blue rather than a teal that read as a
 * second green, and a green and an amber each a step less saturated than
 * the token colours they replaced. The light values are the darker
 * relatives that stay readable on a white terminal; the same hex on both
 * backgrounds would be unreadable on one of them.
 */
export const TONES: Readonly<Record<ThemeKind, Readonly<Record<PaintedTone, string>>>> = {
  dark: {
    milestone: "#3874db",
    good: "#54a33b",
    warn: "#b79427",
    bad: "#f14c4c",
    muted: "#8c8c8c",
  },
  light: {
    milestone: "#2a5db0",
    good: "#256029",
    warn: "#8a6100",
    bad: "#a31515",
    muted: "#6b6b6b",
  },
};

/**
 * The phases that are a lifecycle milestone rather than a step of one.
 *
 * The operator reads this terminal to know where the session has GOT to,
 * and these are the answers worth looking up for: the plan being asked
 * for, the work beginning, the verification, the suite that is the run of
 * record, the commit and push, the close, and the end. `preverify`,
 * `dispositions` and `fix` are the ordinary traffic between them.
 */
const MILESTONE_PHASES = new Set([
  "plan",
  // `work` is the phase's name; `steps` is what it was called before session
  // 140, and a run recorded then must still light up in the tone it earned.
  // No writer emits the old name and every reader accepts it.
  "work",
  "steps",
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
 * Repository-wide, which is why only THIS session's rows are said at the
 * first look: a terminal opened today would otherwise recite months of
 * other sessions' runs before saying anything about this one. After the
 * first look it is read forward, and every new row is news.
 */
const TEST_RUNS_FILENAME = "test-runs.jsonl";

/**
 * The owed decisions of the repository, beside the test runs and read the
 * same way: forward from where it stood when this terminal first looked.
 * What is spoken from it is the `answered` fold alone.
 */
const OWED_FILENAME = "owed-decisions.jsonl";

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
  // A pause is amber: the loop met a bound and a person is told who acts
  // next, which is not an alarm. A deadlock is red, because it is the one
  // pause that says "running this again unchanged reaches this exact point
  // again", and softening that word would cost the operator money.
  if (event === "paused") return fields["class"] === "deadlock" ? "bad" : "warn";
  // The two honest green events, and no third: the phase moved past a
  // pause with nothing in its place, and a person answered a question.
  if (event === "progress-resumed" || event === "decision-answered") return "good";
  // A finished job nobody collected is amber for the watcher's reason: the
  // framework knows of nothing wrong, and what is being said is that the
  // next call is owed and nobody has made it.
  if (event === "uncollected") return "warn";
  // The watcher is a nudge, not a verdict: nothing has gone wrong that the
  // framework knows of, and the only thing being said is that the engine
  // has been quiet over an unmoved tree. `warn` is the amber the indicator
  // already spins in, which is exactly the weight it should carry.
  if (event === "watcher") return "warn";
  if (event === "verify") return verdictTone(fields["verdict"] ?? "");
  if (event === "tests") return (fields["outcome"] ?? "") === "passed" ? "good" : "bad";
  if (event === "phase") {
    return MILESTONE_PHASES.has(fields["now"] ?? "") ? "milestone" : "plain";
  }
  if (event === "session-closed") return "milestone";
  // A step beginning is the session's own progress, in the milestone blue;
  // an answer refused is the amber of a nudge, not the red of a failure --
  // the engine is told why and answers again.
  if (event === "step") return "milestone";
  if (event === "rejected") return "warn";
  // The session's kind, said once under its banner: read, not scanned for.
  if (event === "focused" || event === "global") return "plain";
  return "muted";
}

/** A job's exit code as a tone: zero is good, anything else is bad. */
function exitTone(exit: string): Tone {
  return exit === "0" ? "good" : "bad";
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
  if (key === "exit") return exitTone(value);
  // `now` is the phase line's own word for where the run is; `phase` is the
  // same value wherever another line carries it.
  if (key === "now" || key === "phase") return MILESTONE_PHASES.has(value) ? "milestone" : "plain";
  // On a pause the kind is amber and a deadlock class is red; the words
  // themselves stay plain, because prose painted whole is a wall.
  if (event === "paused" && key === "kind") return "warn";
  if (event === "paused" && key === "class") return value === "deadlock" ? "bad" : "warn";
  return "plain";
}

/** A path as the record spells them: repository-relative, forward slashes. */
function relativeToRoot(repoRoot: string, full: string): string {
  return path.relative(repoRoot, full).replace(/\\/g, "/");
}

/** What the terminal is doing, which is the indicator the operator reads. */
/**
 * `working` while a job runs, `waiting` between calls, and `uncollected`
 * when the job the record names has exited and nothing has collected it --
 * the state that read as `working` for three hours in session 91.
 */
export type Activity = "working" | "waiting" | "uncollected";

/** The parts of `run.json` this terminal reads. Nothing else is its business. */
interface RunRecord {
  readonly session_number?: number;
  readonly phase?: string;
  /** The adapter the run names; `cli` is the pull, and the rendering says which command resumes. */
  readonly engine?: string;
  /** The seq of the instruction last issued: which silence is being watched. */
  readonly seq?: number;
  /** When the run began, as the driver stamped it: what says whether it began while this terminal watched. */
  readonly started_at?: string;
  readonly stop?: {
    kind?: string;
    reason?: string;
    class?: "first" | "deadlock";
    at?: string;
    step_id?: string | null;
  } | null;
  readonly job?: {
    name?: string;
    log?: string;
    started_at?: string;
  } | null;
}

export interface DabblerTerminalOptions {
  readonly repoRoot: string;
  /** The clock the `hh:mm:ss` prefix reads. */
  readonly now?: () => Date;
  /**
   * The instant this terminal came to exist, as `Date.now()` counts it.
   *
   * A run whose record says it started before this is not news -- it was
   * already running when the terminal was built, and a terminal that took
   * the screen for it would be the startup noise activation avoids. One
   * that started after it is a session beginning while this terminal
   * watched, and `onDidStartRun` says so.
   */
  readonly since?: number;
  /**
   * How long a resize is allowed to settle before the lines are laid out
   * again.
   *
   * A drag on the panel divider reports a new width many times a second,
   * and a full replay on each would fight the drag for the screen. The
   * replay follows the LAST width, once the reports stop.
   */
  readonly resizeMs?: number;
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

/** `#3874db` as the three numbers an SGR truecolour sequence takes. */
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
 * One token in a tone, and the reset that follows it.
 *
 * `plain` is painted with nothing at all: it is the terminal's own
 * foreground, and naming a colour for it would override a theme the
 * operator chose. Everything else opens its colour and closes with a full
 * reset, which is exact now that nothing behind the text has to survive it.
 */
export function paint(
  text: string,
  tone: Tone,
  kind: ThemeKind,
  bold = false,
): string {
  if (tone === "plain" && !bold) return text;
  const colour = tone === "plain" ? "" : fg(TONES[kind][tone]);
  return `${bold ? `${ESC}[1m` : ""}${colour}${text}${ESC}[0m`;
}

/** One run of text in one tone: what a framework line is made of before it is laid out. */
export interface Span {
  readonly text: string;
  readonly tone: Tone;
  readonly bold: boolean;
}

/**
 * Where every continuation line begins: under the first character after
 * the clock. The clock is `hh:mm:ss` and one space follows it.
 */
export const HANGING_INDENT = "hh:mm:ss ".length;

/** One character of a line, carrying the tone of the span it came from. */
interface Cell {
  readonly ch: string;
  readonly tone: Tone;
  readonly bold: boolean;
}

/**
 * The physical lines one framework line occupies at a given width.
 *
 * The first physical line starts at column 0 with the clock; every other
 * one -- a wrapped tail, or a line the text itself carried after a newline
 * -- begins at `HANGING_INDENT`, so the clock is the only thing that ever
 * stands at the left edge. Wrapping breaks at spaces and drops the spaces
 * it broke at; a single token wider than the line is cut rather than left
 * to the terminal, which would wrap it without the indent. A null width
 * means the width is not known yet, and only the text's own newlines break
 * it then.
 *
 * Widths are counted in characters. The framework's lines are ASCII with
 * the occasional glyph, and a column-exact count of every grapheme would
 * be a table nobody here maintains for a difference nobody would see.
 */
export function layout(spans: readonly Span[], columns: number | null): Span[][] {
  const cells: Cell[] = [];
  for (const span of spans) {
    for (const ch of span.text.replace(/\r/g, "")) {
      cells.push({ ch, tone: span.tone, bold: span.bold });
    }
  }
  const paragraphs: Cell[][] = [[]];
  for (const cell of cells) {
    if (cell.ch === "\n") paragraphs.push([]);
    else (paragraphs[paragraphs.length - 1] as Cell[]).push(cell);
  }
  // One column is left free at the right edge: a line that fills the width
  // exactly leaves the cursor in the pending-wrap state, and the CRLF that
  // follows it lands differently across terminals.
  const usable = columns === null ? Number.POSITIVE_INFINITY : Math.max(1, columns - 1);
  const rest = columns === null ? usable : Math.max(1, usable - HANGING_INDENT);
  const indent: Span = { text: " ".repeat(HANGING_INDENT), tone: "plain", bold: false };
  const lines: Span[][] = [];
  paragraphs.forEach((paragraph, index) => {
    const wrapped = wrapCells(paragraph, index === 0 ? usable : rest, rest);
    wrapped.forEach((physical, position) => {
      const spans = toSpans(physical);
      lines.push(index === 0 && position === 0 ? spans : [indent, ...spans]);
    });
  });
  return lines;
}

/** Greedy word wrap over cells: `first` columns for the first line, `rest` after it. */
function wrapCells(cells: readonly Cell[], first: number, rest: number): Cell[][] {
  const lines: Cell[][] = [];
  let line: Cell[] = [];
  let avail = first;
  let gap: Cell[] = [];
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i] as Cell;
    if (cell.ch === " ") {
      gap.push(cell);
      i += 1;
      continue;
    }
    let j = i;
    while (j < cells.length && (cells[j] as Cell).ch !== " ") j += 1;
    let word = cells.slice(i, j);
    i = j;
    if (line.length === 0) {
      // Spaces that open a paragraph are the text's own indentation and
      // survive; spaces at a break are the break.
      line.push(...gap);
    } else if (line.length + gap.length + word.length > avail) {
      lines.push(line);
      line = [];
      avail = rest;
    } else {
      line.push(...gap);
    }
    gap = [];
    while (word.length > avail - line.length) {
      const room = avail - line.length;
      if (room > 0) {
        line.push(...word.slice(0, room));
        word = word.slice(room);
      }
      lines.push(line);
      line = [];
      avail = rest;
    }
    line.push(...word);
  }
  lines.push(line);
  return lines;
}

/** Consecutive cells in one tone, folded back into spans. */
function toSpans(cells: readonly Cell[]): Span[] {
  const spans: Span[] = [];
  for (const cell of cells) {
    const last = spans[spans.length - 1];
    if (last && last.tone === cell.tone && last.bold === cell.bold) {
      spans[spans.length - 1] = { ...last, text: last.text + cell.ch };
    } else {
      spans.push({ text: cell.ch, tone: cell.tone, bold: cell.bold });
    }
  }
  return spans;
}

/**
 * One framework line as the bytes the pty receives: laid out at `columns`,
 * each span painted, every physical line ended with CRLF.
 */
export function renderSpans(
  spans: readonly Span[],
  columns: number | null,
  kind: ThemeKind,
): string {
  return (
    layout(spans, columns)
      .map((physical) => physical.map((span) => paint(span.text, span.tone, kind, span.bold)).join(""))
      .join(CRLF) + CRLF
  );
}

/** The voice the framework's own lines are in, as the rule names it. */
export const FRAMEWORK_VOICE = "framework";

/** How wide a rule is drawn before the terminal has said how wide it is. */
const DEFAULT_RULE_COLUMNS = 60;

/**
 * The rule between two voices: a line across the terminal with the name of
 * the voice that follows set into the middle of it, both drawn in the
 * milestone tone, so it reads as a heading over the group beneath. One
 * column short of the width, for the same reason a framework line is.
 *
 * **The headings of this terminal are one family.** A voice rule and a
 * session banner do the same job at two scales, and the operator reads
 * them as one thing; painting the rule quiet and the name in the plain
 * foreground made them two. That is a presentation decision and the
 * operator's to make -- there is nothing here to argue with, and nothing
 * for a later session to rediscover and revert.
 */
export function divider(label: string, columns: number | null, kind: ThemeKind): string {
  const width = Math.max(label.length + 6, (columns ?? DEFAULT_RULE_COLUMNS) - 1);
  const dashes = width - label.length - 2;
  const left = Math.floor(dashes / 2);
  return (
    paint("─".repeat(left), "milestone", kind) +
    ` ${paint(label, "milestone", kind, true)} ` +
    paint("─".repeat(dashes - left), "milestone", kind) +
    CRLF
  );
}

/** Clear the screen and the scrollback, and put the cursor at the top. */
const CLEAR_ALL = `${ESC}[H${ESC}[2J${ESC}[3J`;

/**
 * How much of what was written this terminal keeps for a re-layout.
 *
 * Job output is kept byte for byte so a resize replays it as the runner
 * wrote it; a session's suite runs come to a few megabytes at most, and a
 * window that has watched many sessions drops the oldest. What is dropped
 * is said once at the top of the replay rather than silently absent.
 */
const HISTORY_CAP_BYTES = 4 * 1024 * 1024;

/**
 * The banner a session opens under: a double rule, the session's name in
 * capitals centred beneath it, and a double rule again. The one thing in
 * this terminal drawn heavier than a voice rule, because a session is the
 * one boundary in the scrollback bigger than a change of voice. In the
 * milestone tone, since a session beginning is the first milestone of all.
 */
export function banner(label: string, columns: number | null, kind: ThemeKind): string {
  const width = Math.max(label.length + 2, (columns ?? DEFAULT_RULE_COLUMNS) - 1);
  const rule = paint("═".repeat(width), "milestone", kind);
  const lead = " ".repeat(Math.floor((width - label.length) / 2));
  return `${rule}${CRLF}${lead}${paint(label, "milestone", kind, true)}${CRLF}${rule}${CRLF}`;
}

/** Everything this terminal has said or passed through, in order. */
type HistoryEntry =
  | {
      readonly kind: "line";
      readonly at: Date;
      readonly event: string;
      readonly fields: Record<string, string>;
      /** The voice it was said in: the rule a replay draws it under. */
      readonly voice: string;
    }
  | { readonly kind: "raw"; readonly label: string; readonly bytes: string }
  | { readonly kind: "banner"; readonly label: string; readonly voice: string };

/** The name a job log's bytes are labelled with: the file's own, without its suffix. */
function jobLabel(logPath: string): string {
  return path.basename(logPath).replace(/\.log$/, "");
}

/**
 * A voice's name with the session's number set into it, for the heading of
 * the group it leads: `S137: verify-round-1`.
 *
 * Both the framework's rule and a job's are headed this way, because a
 * scrollback that has held several sessions is read back one group at a
 * time and `verify-round-1` alone could head any of them. Before a session
 * is known the bare name is the whole heading; a group written under a
 * number keeps that number when the terminal replays it, because the group
 * really did belong to that session.
 */
function numbered(name: string, session: number | undefined): string {
  return session === undefined ? name : `S${session}: ${name}`;
}

/** A record's own timestamp as a Date, or null when it will not parse. */
function recordedAt(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The fields a verification round is said with. */
function roundFields(row: Record<string, unknown>): Record<string, string> {
  return {
    round: String(row["round"] ?? "?"),
    verdict: String(row["verdict"] ?? "?"),
    verifier: String(row["verifier_model"] ?? ""),
  };
}

/** The fields a test run is said with. */
function testRunFields(row: Record<string, unknown>): Record<string, string> {
  return {
    suite: String(row["suite"] ?? "?"),
    stage: String(row["stage"] ?? ""),
    outcome: String(row["outcome"] ?? "?"),
  };
}

/** Whether a run record's `started_at` is at or after `since`. Unparseable is never. */
function startedAfter(startedAt: string | undefined, since: number): boolean {
  if (!startedAt) return false;
  const at = Date.parse(startedAt);
  return !Number.isNaN(at) && at >= since;
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
  if (!run.job) return "waiting";
  return uncollectedWords(repoRoot, run) === null ? "working" : "uncollected";
}

/**
 * The router's words for a job that finished and nobody collected, or null.
 *
 * One reader and one wording, both the router's: this asks and paints.
 * A record the reader refuses -- a fixture, a half-written file -- reads
 * as no such job, which is what it read as before.
 */
export function uncollectedWords(repoRoot: string, run?: RunRecord | null): string | null {
  const record = run ?? (() => {
    const runPath = liveRunPath(repoRoot);
    return runPath === null ? null : readRun(runPath);
  })();
  if (record === null || record.stop || !record.job) return null;
  if (typeof record.session_number !== "number") return null;
  return readUncollectedJob(repoRoot, record.session_number)?.words ?? null;
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
  try {
    const configured = vscode.workspace
      .getConfiguration(SETTINGS_SECTION)
      .get<number>(STALLED_AFTER_KEY);
    if (typeof configured === "number" && configured > 0) return Math.trunc(configured);
  } catch {
    // No configuration host, which is the unit suite. The repository answers.
  }
  return stalledAfterSeconds(repoRoot);
}

/**
 * How often the watcher may be consulted at all.
 *
 * The rule's own tree probe costs a `git status`, and this terminal looks
 * every 500 ms. Half the threshold, bounded, is often enough that the line
 * lands within a poll of the crossing and rare enough that a session is not
 * paying for a git call twice a second: at the default 1800 s it is one a
 * minute, at a 60 s threshold one every thirty seconds.
 */
export function watcherLookMs(thresholdSeconds: number): number {
  return Math.min(60, Math.max(5, Math.trunc(thresholdSeconds / 2))) * 1000;
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

/** The ledger row in flight, as far as this terminal reads it. */
interface LedgerInFlight {
  readonly number: number;
  /** The focused checkout `session start --module` wrote onto the row, or null for a global session. */
  readonly checkout: { readonly module: string; readonly path: string } | null;
}

/**
 * The session the ledger says is in progress, or null.
 *
 * Read here, and only for the banner and the kind line: a session exists
 * from its registration, and the run record it will be driven under is
 * born at the first `next` -- which used to be the first this terminal
 * heard of it. Which session is in flight stays the projection's rule for
 * everything the Explorer renders; this reads one row for one line.
 */
function readLedgerInFlight(repoRoot: string): LedgerInFlight | null {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(repoRoot, SESSIONS_REL, "sessions.json"), "utf8"),
    );
    const sessions = (raw as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) return null;
    const row = sessions.find(
      (entry: unknown) => (entry as { status?: unknown }).status === "in-progress",
    ) as { number?: unknown; checkout?: unknown } | undefined;
    if (row === undefined || typeof row.number !== "number") return null;
    const checkout = row.checkout as { module?: unknown; path?: unknown } | undefined;
    return {
      number: row.number,
      checkout:
        checkout && typeof checkout.module === "string" && typeof checkout.path === "string"
          ? { module: checkout.module, path: checkout.path }
          : null,
    };
  } catch {
    return null;
  }
}

/** What the session's policy allows it to touch, as the router wrote it, or null when there is none. */
function readPolicyScope(repoRoot: string, session: number): string[] | null {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(repoRoot, RUNS_REL, `s${session}`, "policy.json"), "utf8"),
    );
    const allowed = (raw as { allowed?: unknown }).allowed;
    return Array.isArray(allowed) ? allowed.map(String) : null;
  } catch {
    return null;
  }
}

/** The marker `session start --module` leaves in the full checkout while the session runs in its clone. */
function readModuleSessionMarker(repoRoot: string): { module: string; path: string } | null {
  try {
    const raw: unknown = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".dabbler", "module-session.json"), "utf8"),
    );
    const marker = raw as { module?: unknown; path?: unknown };
    return typeof marker.module === "string" && typeof marker.path === "string"
      ? { module: marker.module, path: marker.path }
      : null;
  } catch {
    return null;
  }
}

/** The members of `driver/instruction.json` the step line reads. */
interface InstructionRecord {
  readonly kind?: string;
  readonly seq?: number;
  readonly step_id?: string;
  readonly ask?: string;
  readonly reasons?: readonly string[];
}

function readInstruction(driverDir: string): InstructionRecord | null {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(driverDir, "instruction.json"), "utf8"),
    );
    return parsed !== null && typeof parsed === "object" ? (parsed as InstructionRecord) : null;
  } catch {
    return null;
  }
}

/** The first sentence of an ask: up to its first full stop, on one line. */
export function firstSentence(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  const stop = oneLine.search(/\.(\s|$)/);
  return stop === -1 ? oneLine : oneLine.slice(0, stop + 1);
}

export class DabblerTerminal implements vscode.Pseudoterminal {
  private readonly writer = new vscode.EventEmitter<string>();
  readonly onDidWrite: vscode.Event<string> = this.writer.event;

  /**
   * A run beginning for this repository after this terminal was built.
   *
   * Carries the session number. It is the terminal's own reading of the
   * run record it already polls twice a second, which is why it fires
   * whether or not the Work Explorer is visible: the Explorer's scan runs
   * only while the view is, and a session started in the person's own CLI
   * while the view was collapsed was never seen to start.
   */
  private readonly started = new vscode.EventEmitter<number>();
  readonly onDidStartRun: vscode.Event<number> = this.started.event;

  private readonly repoRoot: string;
  private readonly now: () => Date;
  private readonly since: number;
  private readonly readTheme: () => ThemeKind;
  private readonly pollMs: number;
  private readonly resizeMs: number;

  private theme: ThemeKind;
  private timer: ReturnType<typeof setInterval> | undefined;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private themeSubscription: vscode.Disposable | undefined;

  /** The width the editor last reported, or null before it has said. */
  private columns: number | null = null;

  /** What has been written, kept so a resize can lay it out again. */
  private readonly history: HistoryEntry[] = [];
  private historyBytes = 0;
  private trimmed = false;

  /** The session whose run record was last read; undefined before any. */
  private lastSession: number | undefined = undefined;

  /** Whether a run record has been read at all: the first look says history. */
  private looked = false;

  /**
   * The session whose banner was said last, from whichever record named it
   * first -- the ledger row at registration, or the run record when a
   * terminal opens mid-session. One banner per session, whichever came.
   */
  private bannered: number | undefined = undefined;

  /** The instruction seq whose step or rejection line was said, so it is said once. */
  private saidSeq: number | undefined = undefined;

  /** The module-session marker last spoken of, so the line is said once per session. */
  private saidMarker: string | null = null;

  /** The session the last phase line named, so the next names it only on a change. */
  private saidSession: number | null = null;

  /**
   * Who spoke last -- the framework, or a job by name -- so a change of
   * voice gets its rule. Null before anything has been written, and again
   * after a replay clears the screen.
   */
  private speaker: string | null = null;

  private phase: string | null = null;
  private jobName: string | null = null;
  /**
   * The pause this terminal spoke last and has not yet seen moved past: the
   * stop's identity, and the phase it stood in. Compared, through the
   * router's own rule, against every later reading -- a stop gone with the
   * phase unmoved is a resume and not progress; a stop gone with the phase
   * moved on is the one green line this terminal may say about it.
   */
  private paused: { identity: string; stop: { kind: string }; phase: string } | null = null;
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

  /** When the watcher was last consulted, so its tree probe is not run per tick. */
  private lastLook = 0;
  /** What is being watched -- an instruction seq, or a job name -- and how many
   *  thresholds have been said of it. */
  private watching: string | null = null;
  private saidMultiple = 0;
  /** The drained size of the watched job log at the last look; null before one. */
  private watchedLogSize: number | null = null;

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
    this.resizeMs = options.resizeMs ?? 150;
    this.since = options.since ?? Date.now();
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
  private say(text: string, speaker: string): void {
    this.erase();
    this.emit(text, speaker);
    this.draw();
  }

  /**
   * One write, in one voice, and where it left the cursor.
   *
   * A change of voice gets its rule first, on a line of its own with an
   * empty line before it, so the framework's lines and a job's output read
   * as titled groups with room between them. A job that left its line
   * unfinished has that line ended before the empty one, because the rule
   * and the framework's next line must start at the edge and never on the
   * tail of a runner's. The very first rule stands at the top with nothing
   * above it to keep room from.
   */
  private emit(text: string, speaker: string): void {
    if (this.speaker !== speaker) {
      const before = this.speaker === null ? "" : this.atLineStart ? CRLF : `${CRLF}${CRLF}`;
      this.writer.fire(`${before}${divider(speaker, this.columns, this.theme)}`);
      this.speaker = speaker;
      this.atLineStart = true;
    }
    this.writer.fire(text);
    // Where the cursor is left, which is the only thing that decides
    // whether the indicator may be drawn at all. See `atLineStart`.
    this.atLineStart = text.endsWith(CRLF) || text.endsWith("\n");
  }

  /**
   * A session's banner, kept for a re-layout and drawn now.
   *
   * It stands apart from what came before by one empty line, and it is
   * the framework speaking: the lines under it are the framework's until
   * a job's bytes arrive, and a voice rule directly beneath a banner would
   * be two headings for one group.
   *
   * **The banner IS the session's numbered heading, and that is the
   * decision.** It was reported that no `S133:` ever appeared on a voice
   * rule, and the cause is here rather than in `voice()`: `emit` draws a
   * rule only when the speaker changes, this sets the speaker to the
   * numbered voice without drawing one, and a session driven from a chat
   * puts no job output on this terminal -- so its voice never changes and
   * no numbered rule is ever occasioned. The alternative was to draw the
   * session's first framework rule here, numbered. It is rejected: it
   * restores exactly the two headings for one group this comment was
   * written to prevent, and `SESSION 133` between double rules in the
   * milestone tone is already a heading that names the session more
   * plainly than `S133: framework` does. What the report is owed instead
   * is the number on the headings that ARE drawn -- a job's rule as well
   * as the framework's, which is what `numbered()` gives both.
   */
  private sayBanner(label: string): void {
    const voice = this.voice();
    this.remember({ kind: "banner", label, voice });
    this.erase();
    this.emitBanner(label, voice);
    this.draw();
  }

  private emitBanner(label: string, voice: string): void {
    const before = this.speaker === null ? "" : this.atLineStart ? CRLF : `${CRLF}${CRLF}`;
    this.writer.fire(`${before}${banner(label, this.columns, this.theme)}`);
    this.speaker = voice;
    this.atLineStart = true;
  }

  /**
   * A session's banner and, beneath it, its kind: said once per session,
   * from whichever record named the session first. The ledger row exists
   * from registration and carries the focused checkout; the run record is
   * born at the first `next`. A terminal that learned of sessions only
   * from the run record said nothing until the engine had already been
   * asked to declare, which is the silence the operator saw.
   */
  private openSession(number: number, ledger: LedgerInFlight | null): void {
    if (this.bannered === number) return;
    this.bannered = number;
    this.sayBanner(`SESSION ${String(number).padStart(3, "0")}`);
    if (ledger === null || ledger.number !== number) return;
    if (ledger.checkout === null) {
      // The whole repository and no wall: no exposure manifest is written
      // and no exposure gate runs, which is what `session start` said too.
      this.line("global", { scope: "the whole repository, no wall" });
    } else {
      this.line("focused", {
        module: ledger.checkout.module,
        scope: (readPolicyScope(this.repoRoot, number) ?? []).join(", "),
      });
    }
  }

  /** A replay once the resize that asks for it has settled. */
  private scheduleReplay(): void {
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = undefined;
      this.replay();
    }, this.resizeMs);
    (this.resizeTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Keep what was written, within the cap, so a resize can lay it out again.
   *
   * The oldest entries go first, whole, and the replay says once that they
   * went: a scrollback that began mid-line with no word about why would
   * read as a terminal that lost something.
   */
  private remember(entry: HistoryEntry): void {
    this.history.push(entry);
    this.historyBytes += entry.kind === "raw" ? Buffer.byteLength(entry.bytes) : 0;
    while (this.historyBytes > HISTORY_CAP_BYTES && this.history.length > 1) {
      const dropped = this.history.shift() as HistoryEntry;
      this.historyBytes -= dropped.kind === "raw" ? Buffer.byteLength(dropped.bytes) : 0;
      this.trimmed = true;
    }
  }

  /**
   * The editor's word on how wide this terminal is now.
   *
   * A changed width lays every line out again, after the resize settles:
   * the hanging indent is this terminal's own wrapping, and a terminal that
   * kept the old physical lines would show the indent honoured at one width
   * and broken at every other.
   */
  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (dimensions.columns === this.columns) return;
    this.columns = dimensions.columns;
    this.scheduleReplay();
  }

  /**
   * Clear the terminal and write everything again at the current width.
   *
   * Framework lines are rendered afresh -- at this width, in this theme,
   * with the clock they were first said at -- and job output is replayed
   * as the bytes the runner wrote, which is the only rendering of it there
   * is. The indicator comes back below it all if there is still something
   * to indicate.
   */
  private replay(): void {
    this.erase();
    this.writer.fire(CLEAR_ALL);
    this.atLineStart = true;
    this.speaker = null;
    if (this.trimmed) {
      this.emit(
        this.render(this.now(), "history-trimmed", { kept: "the most recent 4 MB" }),
        this.voice(),
      );
    }
    for (const entry of this.history) {
      if (entry.kind === "line") {
        this.emit(this.render(entry.at, entry.event, entry.fields), entry.voice);
      } else if (entry.kind === "raw") {
        this.emit(forTerminal(entry.bytes), entry.label);
      } else {
        this.emitBanner(entry.label, entry.voice);
      }
    }
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

  open(initialDimensions?: vscode.TerminalDimensions): void {
    // The width first, so the first line is laid out at it rather than
    // at an unknown width and replayed a moment later.
    if (initialDimensions) this.columns = initialDimensions.columns;
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
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    this.resizeTimer = undefined;
    this.themeSubscription?.dispose();
    this.themeSubscription = undefined;
    this.started.dispose();
    this.writer.dispose();
  }

  /**
   * One look at the record and at the running job's log.
   *
   * Public because the interval is not the behaviour: a test drives this
   * directly, and so does the caller that wants a tick on a file event.
   */
  poll(): void {
    // The ledger first: a session exists from its registration, before any
    // run record does, and its banner belongs at the very beginning.
    const ledger = readLedgerInFlight(this.repoRoot);
    if (ledger !== null) this.openSession(ledger.number, ledger);

    // The repository's own window while a focused session runs in the
    // module's folder: the marker is all this window holds of it, and one
    // line says where the work is. Its output is in that folder's terminal.
    const marker = readModuleSessionMarker(this.repoRoot);
    const markerKey = marker === null ? null : `${marker.module}\0${marker.path}`;
    if (markerKey !== null && markerKey !== this.saidMarker) {
      this.line("focused", { module: marker!.module, folder: path.basename(marker!.path) });
    }
    this.saidMarker = markerKey;

    const runPath = liveRunPath(this.repoRoot);
    if (runPath === null) return;
    const run = readRun(runPath);
    if (run === null) return;

    // A run record for a session this terminal has not read before. One
    // that began after the terminal did is a session starting while it
    // watched, and is said so whoever's CLI started it; one that was
    // already running is the state of the world at the first look.
    if (typeof run.session_number === "number" && run.session_number !== this.lastSession) {
      this.lastSession = run.session_number;
      // A new session's seq starts over: the step line said for the last
      // session's seq must not silence this one's.
      this.saidSeq = undefined;
      // Under its own banner, whether it is starting now or was already
      // there when the terminal first looked: what follows is one session's.
      // Said already if the ledger row named it; not said twice.
      this.openSession(run.session_number, ledger);
      if (startedAfter(run.started_at, this.since)) this.started.fire(run.session_number);
    }

    // The first look at a run says what the records say already happened,
    // before it says where the run is now.
    if (!this.looked) {
      this.looked = true;
      this.sayEarlier(run, runPath);
    }

    if (run.phase !== undefined && run.phase !== this.phase) {
      this.phase = run.phase;
      // The session is named when it changes and not on every phase: one
      // session's phases are read under its first line, and the number on
      // each of them was the same number every time.
      const session = run.session_number ?? null;
      this.line("phase", {
        ...(session !== this.saidSession ? { session: this.sessionLabel(run) } : {}),
        now: run.phase,
      });
      this.saidSession = session;
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

    // The instruction the run just issued, once per seq: a step as it
    // starts, with the first sentence of its ask; an answer refused, with
    // the first reason. A wait and a done say nothing here -- the job and
    // the phase lines already do.
    //
    // **The seq is marked as said only after a read that agreed with it.**
    // Marking it first makes the guard that would retry the read the very
    // thing that swallows it: an instruction that is absent, half-written,
    // or still carrying the previous seq drops its line PERMANENTLY, and
    // no later poll can recover it because the seq already reads as said.
    // A read that agreed is what marks it, whatever kind it turned out to
    // be -- a wait and a done were read and are deliberately silent, which
    // is not the same as never having been read at all.
    if (typeof run.seq === "number" && run.seq !== this.saidSeq) {
      const instruction = readInstruction(path.dirname(runPath));
      if (instruction !== null && instruction.seq === run.seq) {
        this.saidSeq = run.seq;
        if (instruction.kind === "step") {
          this.line("step", {
            id: instruction.step_id ?? "?",
            ask: firstSentence(instruction.ask ?? ""),
          });
        } else if (instruction.kind === "rejection") {
          this.line("rejected", {
            id: instruction.step_id ?? "",
            reason: firstSentence(instruction.reasons?.[0] ?? ""),
          });
        }
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
    this.drainOwed(path.join(this.repoRoot, RUNS_REL, OWED_FILENAME));

    if (collected !== null) {
      // What it exited with is the record's to say, not this terminal's to
      // guess -- the phase line that follows is what says how it went.
      this.line("job-collected", { name: collected });
      this.jobName = null;
    }

    const stop = run.stop ?? null;
    const phase = run.phase ?? "";
    if (stop) {
      // A stop is its kind, its moment and its reason: a replacement of the
      // same kind is a new pause, spoken as one. The words are the router's
      // one rendering, shared with the driver's stderr and the status row.
      const identity = `${stop.kind ?? ""}\0${stop.at ?? ""}\0${stop.reason ?? ""}`;
      if (this.paused === null || this.paused.identity !== identity) {
        const kind = stop.kind ?? "?";
        this.paused = { identity, stop: { kind }, phase };
        const words = renderStop(
          { kind, reason: stop.reason ?? "", class: stop.class ?? null, step_id: stop.step_id ?? null },
          { session_number: run.session_number ?? 0, phase, engine: run.engine },
        );
        this.line("paused", {
          session: this.sessionLabel(run),
          kind,
          class: stop.class ?? "",
          reason: `${words.happened} ${words.ended} ${words.next}`,
        });
      }
    } else if (this.paused !== null && progressResumed(this.paused, { stop: null, phase })) {
      // Gone AND moved on. Gone alone is the resume clearing it, and says
      // nothing yet; this terminal keeps the pause until the phase leaves it.
      this.line("progress-resumed", { past: this.paused.stop.kind, from: this.paused.phase, phase });
      this.paused = null;
    }

    // The indicator, said rather than merely held: a person watching this
    // terminal is asking "is anything happening", and a getter no surface
    // renders does not answer them. A job that has exited uncollected is
    // not "working" -- the spinner claimed it was for three hours once --
    // and the line that says so carries the router's words for it.
    const finished = stop || !job ? null : uncollectedWords(this.repoRoot, run);
    this.activity = stop || !job ? "waiting" : finished === null ? "working" : "uncollected";
    if (this.activity !== this.spoken) {
      this.spoken = this.activity;
      this.line(
        this.activity,
        finished === null ? {} : { name: job?.name ?? "job", reason: finished },
      );
    }
    // The indicator follows the activity immediately rather than at the
    // next animation tick: a framework that has just stopped should not
    // still appear to be spinning, however briefly.
    if (this.activity === "working") this.draw();
    else this.erase();

    this.watch(run);
  }

  /**
   * The other silence: an instruction issued, nothing answering it, over a
   * tree that has not moved.
   *
   * The rule is the router's -- this asks it and paints the answer. What is
   * decided here is only how OFTEN to ask (the probe costs a git call) and
   * how often to say it: once when the threshold is first crossed, and again
   * at each further multiple of it, so a session left alone keeps saying so
   * without saying it twice a second.
   */
  private watch(run: RunRecord): void {
    const session = run.session_number;
    if (session === undefined) return;
    const threshold = watcherThreshold(this.repoRoot);
    const now = this.now();
    if (now.getTime() - this.lastLook < watcherLookMs(threshold)) return;
    this.lastLook = now.getTime();

    // What is being watched: the instruction, or the job. Either changing
    // is a new silence, and whatever was said of the last one says nothing
    // about this one -- including how much of its log had arrived. A job's
    // identity is its name, its log AND the moment it started, because a
    // re-run starts a new job under the same name over the same truncated
    // log, and inheriting the last one's size would read as silence on its
    // first look.
    const job = run.job;
    const watching = job
      ? `${job.name ?? ""}\0${job.log ?? ""}\0${job.started_at ?? ""}`
      : `seq:${run.session_number ?? ""}:${run.seq ?? ""}`;
    if (watching !== this.watching) {
      this.watching = watching;
      this.saidMultiple = 0;
      this.watchedLogSize = null;
    }
    // The growth question is one this terminal has already answered: it
    // drains every job log in the run's directory on every poll, so the
    // offsets it keeps are the record of whether anything arrived. Asking
    // the file again would be a second answer to a question already asked.
    const reading = readWatcher(this.repoRoot, session, threshold, now, () =>
      this.jobLogGrew(run),
    );
    if (reading.state === WATCHER_QUIET) return;
    const multiple = Math.trunc(reading.sinceSeconds / threshold);
    if (multiple <= this.saidMultiple) return;
    this.saidMultiple = multiple;
    this.line("watcher", {
      since: `${reading.sinceSeconds}s`,
      state: reading.state,
      ...(reading.job ? { job: reading.job } : {}),
    });
  }

  /**
   * Whether the running job's log has grown since the last watcher look.
   *
   * Read from the offsets `drainJobs` maintains rather than from a fresh
   * `stat`: those offsets ARE how much of the log this terminal has seen,
   * and they move on every poll. Null until two looks have happened, because
   * one look is not a comparison.
   */
  private jobLogGrew(run: RunRecord): boolean | null {
    const log = run.job?.log;
    if (!log) return null;
    const full = path.join(this.repoRoot, ...log.split("/"));
    const drained = this.logOffsets.get(full);
    if (drained === undefined) return null;
    const seen = this.watchedLogSize;
    this.watchedLogSize = drained;
    return seen === null ? null : drained > seen;
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
   * What the records say has already happened in this run's session, one
   * dated line each, in the order it happened.
   *
   * Three sources, each read once here and forward-only afterwards: this
   * session's verification rounds, this session's rows of the repository's
   * test runs, and every job log already in the run's directory -- named,
   * with its exit if the job's status file says one, and NOT replayed. Its
   * size is where reading starts, so only bytes a job writes from now on
   * pass through. The job the record is carrying is left to `job-started`,
   * which says it in the present tense.
   *
   * Each line carries the record's own clock rather than the moment this
   * terminal happened to open: a verdict recorded at 21:06 is said at 21:06.
   */
  private sayEarlier(run: RunRecord, runPath: string): void {
    const now = this.now();
    const runDir = path.dirname(path.dirname(runPath));
    const earlier: Array<{ at: Date; event: string; fields: Record<string, string> }> = [];
    for (const row of this.newRows(path.join(runDir, ROUNDS_FILENAME), true)) {
      earlier.push({ at: recordedAt(row["recorded_at"]) ?? now, event: "verify", fields: roundFields(row) });
    }
    for (const row of this.newRows(path.join(this.repoRoot, RUNS_REL, TEST_RUNS_FILENAME), true)) {
      if (row["sessionNumber"] !== run.session_number) continue;
      earlier.push({ at: recordedAt(row["recordedAt"]) ?? now, event: "tests", fields: testRunFields(row) });
    }
    const current = run.job?.log ? path.join(this.repoRoot, ...run.job.log.split("/")) : null;
    const dir = path.join(path.dirname(runPath), JOBS_DIRNAME);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      // No jobs yet: nothing has run.
    }
    for (const name of names) {
      if (!name.endsWith(".log")) continue;
      const full = path.join(dir, name);
      let size: number;
      let at: Date;
      try {
        const stat = fs.statSync(full);
        size = stat.size;
        at = stat.mtime;
      } catch {
        continue;
      }
      this.logOffsets.set(full, size);
      this.announced.add(full);
      const base = jobLabel(full);
      if (full === current) continue;
      let exit = "";
      try {
        const status: unknown = JSON.parse(fs.readFileSync(path.join(dir, `${base}.status.json`), "utf8"));
        if (status !== null && typeof status === "object" && "exit" in status) {
          exit = String((status as { exit: unknown }).exit ?? "");
        }
      } catch {
        // No status: the job did not finish, or nothing recorded that it did.
      }
      earlier.push({
        at,
        event: "earlier-job",
        fields: { name: base, log: relativeToRoot(this.repoRoot, full), exit },
      });
    }
    earlier.sort((left, right) => left.at.getTime() - right.at.getTime());
    for (const item of earlier) this.line(item.event, item.fields, item.at);
  }

  /** This session's verification rounds, each said once, as they land. */
  private drainRounds(file: string): void {
    for (const row of this.newRows(file, true)) this.line("verify", roundFields(row));
  }

  /** Test runs as they are recorded; the first look already said this session's. */
  private drainTestRuns(file: string): void {
    for (const row of this.newRows(file, false)) this.line("tests", testRunFields(row));
  }

  /**
   * The second green event: a question folded to `answered`.
   *
   * Repository-wide like the test runs, and not replayed for the same
   * reason. Only the `answered` fold is spoken -- a question raised is an
   * attention row in the Explorer, and a question superseded is the
   * framework tidying after itself, and neither is something a person did.
   */
  private drainOwed(file: string): void {
    for (const row of this.newRows(file, false)) {
      if (row["event"] !== "answered") continue;
      this.line("decision-answered", {
        id: String(row["id"] ?? "?"),
        answer: String(row["answer"] ?? ""),
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
    if (appended === "") return;
    const label = numbered(jobLabel(logPath), this.bannered);
    this.remember({ kind: "raw", label, bytes: appended });
    this.say(forTerminal(appended), label);
  }

  private sessionLabel(run: RunRecord): string {
    return run.session_number === undefined
      ? "?"
      : String(run.session_number).padStart(3, "0");
  }

  /**
   * One `hh:mm:ss event key=value` line, kept for a re-layout and said
   * in the colours that say what it is.
   */
  private line(event: string, fields: Record<string, string> = {}, at: Date = this.now()): void {
    const voice = this.voice();
    this.remember({ kind: "line", at, event, fields, voice });
    this.say(this.render(at, event, fields), voice);
  }

  /**
   * The framework's voice, as the rule names it: `S126: framework` while a
   * session is known, `framework` before one is. The session number on
   * the rule is what the operator asked for -- a scrollback that has held
   * several sessions reads which one a group belongs to from its heading.
   */
  private voice(): string {
    return numbered(FRAMEWORK_VOICE, this.bannered);
  }

  /**
   * The bytes for one framework line at the width and theme in hand.
   *
   * The clock and the `key=` of every field are muted, because they are
   * scaffolding: the operator is scanning for the event and for the values.
   * The event takes the line's own tone, and each value takes whatever tone
   * that key's value earns -- which is how a verdict and a test outcome
   * come out green or red without this method knowing what either one is.
   * The clock stands alone at the left edge: it is the outline's marker,
   * and a word before it was one more thing to read past on every line.
   */
  private render(at: Date, event: string, fields: Record<string, string>): string {
    const clock = [at.getHours(), at.getMinutes(), at.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
    const tone = lineTone(event, fields);
    const spans: Span[] = [
      { text: clock, tone: "muted", bold: false },
      { text: " ", tone: "plain", bold: false },
      { text: event, tone, bold: tone !== "muted" && tone !== "plain" },
    ];
    for (const [key, value] of Object.entries(fields)) {
      if (value === "") continue;
      const valueTone = fieldTone(event, key, value);
      spans.push(
        { text: " ", tone: "plain", bold: false },
        { text: `${key}=`, tone: "muted", bold: false },
        { text: value, tone: valueTone, bold: valueTone !== "muted" && valueTone !== "plain" },
      );
    }
    return renderSpans(spans, this.columns, this.theme);
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
