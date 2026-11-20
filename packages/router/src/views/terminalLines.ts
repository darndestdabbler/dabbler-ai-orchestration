// The *Dabbler* terminal's lines: the framework's own background work, and
// nothing else, as text an interface writes to a terminal.
//
// This is the whole of what the terminal SAYS. An interface around it --
// the VS Code pseudoterminal, `dabbler terminal` at a bare prompt -- gives
// it a width, a theme and a place to write, and decides nothing about what
// a line is. Nothing here knows of any editor.
//
// **This terminal carries no engine chat, ever.** Under the pull the
// framework never sees the chat -- the person is reading it in their own
// CLI -- and nothing in this file ever opens a transcript.
//
// What it shows is what the framework is doing while nobody is typing: the
// phase the run record moved to, the background job it started, the
// verification rounds and test runs the machine recorded, the stop it wrote
// -- and every one of that job's own bytes as they are appended. The job
// log passes through unaltered on purpose. That is where the test runners'
// colours, their checkmarks and their spinner live; only a real terminal can
// show them, and stripping them here would undo the reason this exists.
// (`clip` in `engines.ts` strips escapes from ENGINE-derived text; that is a
// different seam for a different reason, and neither is a precedent for the
// other.)
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
// however long the entry is. The width is given, lines wrap to it, and when
// it changes every line is laid out again at the new one, job output
// replayed byte for byte between them. A hanging indent that the terminal's
// own reflow undid on the first resize would be a promise the layout does
// not keep.
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
// mid-session, or after one, says what the records say happened, one dated
// line each in time order: this session's verification rounds, this
// session's test runs, and each job log already on disk, named with where
// it is. Only bytes appended after the terminal opened pass through.
//
// Colour says what a line IS rather than naming a colour: see `Tone`,
// `lineTone` and `fieldTone` in `transcript.ts`. A session's committed
// transcript renders the same records into a page, so the rule about what a
// line is has two renderers over it and is stated once where both reach it.
// This file paints a tone as an ANSI escape; the transcript paints it as a
// CSS class. Two palettes, chosen by the theme the interface gives. There is
// no background behind the framework's lines: the clock and the indent are
// what separate them from a job's output.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  WATCHER_QUIET,
  progressResumed,
  readWatcher,
  renderStop,
  waiterSeenSince,
} from "../driver.ts";
import { SESSIONS_DIRNAME, STATE_FILENAME } from "../evidence.ts";
import { readUncollectedJob } from "../jobs.ts";
import { RUNS_DIRNAME } from "../journal.ts";
import { ROW_PERSON_REVIEW, ROW_REMEDIATED_AT_CAP } from "../ledger.ts";
import { TERMINAL_HEADLINES, VERDICT_REMEDIATED_AT_CAP, VERDICT_REVIEWED_BY_PERSON } from "../verdict.ts";
import { renderWaiting, stalledAfterSeconds } from "../progress.ts";
import {
  TESTS_FAILED,
  TESTS_NONE,
  TESTS_PASSED,
  TESTS_RUNNING,
  TEST_FAILURE,
} from "../testOutput.ts";
import { TONES, fieldTone, lineTone, type ThemeKind, type Tone } from "../transcript.ts";

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
 * What the framework's own loop noticed while it waited, under the run's
 * driver dir. The row read here is `instruction-overdue`: an instruction the
 * AI has not answered past the threshold. Only the older mailbox loop writes
 * it; elsewhere the waiting line says what is owed and for how long.
 */
const SUPERVISION_FILENAME = "supervision.jsonl";

/**
 * The loop's own copy of what it wrote, beside its heartbeat.
 *
 * A loop started from an interface's own terminal writes there and here
 * both; a loop a WAITER revived is detached and hidden, and this file is
 * the only place its output exists. Following it is what keeps "nothing
 * runs where nobody can see it" true however the loop was started.
 */
const LOOP_LOG_FILENAME = "loop.log";

/** A run's directory under the repository: `.dabbler/runs`. */
function runsDir(repoRoot: string): string {
  return path.join(repoRoot, ...RUNS_DIRNAME.split("/"));
}

/**
 * A suite's result events, drawn as a person reads a test run: a mark, the
 * project, and its counts -- or null for every other event, which is drawn
 * as `event key=value`.
 *
 * These are the router's own DECLARED events (`testOutput.ts`), read by name
 * and by field, never a runner's prose recognised by its wording. A count is
 * toned only when it is not zero, so the eye lands on what happened: passes
 * green, failures red, tests that did not run amber, and a project that
 * found no tests under a warning of its own rather than beside the greens.
 */
export function suiteResultSpans(event: string, fields: Record<string, string>): Span[] | null {
  const plain = (text: string): Span => ({ text, tone: "plain", bold: false });
  const project = fields["project"] ?? "";
  if (event === TESTS_RUNNING) return [{ text: "running", tone: "muted", bold: false }, plain(` ${project}`)];
  if (event === TESTS_NONE) {
    return [{ text: "⚠", tone: "warn", bold: true }, plain(` ${project}: `), { text: "no tests found", tone: "warn", bold: false }];
  }
  if (event === TEST_FAILURE) {
    const message = fields["message"] ?? "";
    return [plain("  "), { text: fields["test"] ?? "", tone: "bad", bold: false }, plain(message === "" ? "" : `: ${message}`)];
  }
  if (event !== TESTS_PASSED && event !== TESTS_FAILED) return null;
  const count = (key: string, word: string, tone: Tone): Span => {
    const value = fields[key] ?? "0";
    const counted = value !== "0";
    return { text: `${value} ${word}`, tone: counted ? tone : "muted", bold: counted && tone === "bad" };
  };
  const passed = event === TESTS_PASSED;
  return [
    { text: passed ? "✔" : "✘", tone: passed ? "good" : "bad", bold: true },
    plain(` ${project}: `),
    count("pass", "pass", "good"),
    plain(", "),
    count("fail", "fail", "bad"),
    plain(", "),
    count("not_run", "not run", "warn"),
  ];
}

/**
 * Who acts, in the second person a terminal line is read in.
 *
 * The router's word is the field name -- `engine`, `operator`, `either` --
 * and a person reading their own screen is `you`. Nothing is decided here:
 * which of the three it is comes off the record, and this only says it in
 * the voice the rest of the line is written in.
 */
export function whoActs(actor: "engine" | "operator" | "either"): string {
  if (actor === "operator") return "you";
  if (actor === "engine") return "the engine";
  return "the engine or you";
}

/** A path as the record spells them: repository-relative, forward slashes. */
function relativeToRoot(repoRoot: string, full: string): string {
  return path.relative(repoRoot, full).replace(/\\/g, "/");
}

/**
 * What the terminal is doing, which is the indicator the operator reads.
 *
 * `working` while a job runs, `waiting` between calls, and `uncollected`
 * when the job the record names has exited and nothing has collected it --
 * the state that read as `working` for three hours once.
 */
export type Activity = "working" | "waiting" | "uncollected";

/** The parts of `run.json` this terminal reads. Nothing else is its business. */
export interface TerminalRunRecord {
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
    /**
     * Which refusal it was, where the kind is too coarse. Carried through
     * rather than dropped: the rendering keys on it, and a stop read
     * without it renders another situation's actor and another
     * situation's command.
     */
    code?: string | null;
    reason?: string;
    at?: string;
    step_id?: string | null;
  } | null;
  readonly job?: {
    name?: string;
    log?: string;
    started_at?: string;
  } | null;
  /**
   * Who the session is waiting on, as the loop wrote it, rendered here in
   * the router's own sentence: "working" and "waiting" alone cannot say
   * whether anybody owes anything.
   */
  readonly waiting?: {
    owner?: "author" | "job" | "person";
    for?: string;
    since?: string;
    by?: string | null;
    last_progress?: string;
  } | null;
}

export interface TerminalLinesOptions {
  readonly repoRoot: string;
  /** Where the ledger is; `docs/sessions` under the repository when absent. */
  readonly sessionsDir?: string;
  /** Where every byte this terminal says goes. */
  readonly write: (text: string) => void;
  /** The clock the `hh:mm:ss` prefix reads. */
  readonly now?: () => Date;
  /**
   * The instant this terminal came to exist, as `Date.now()` counts it.
   *
   * A run whose record says it started before this is not news -- it was
   * already running when the terminal was built. One that started after it
   * is a session beginning while this terminal watched, and
   * `onRunStarted` says so.
   */
  readonly since?: number;
  /** The width the lines are laid out at; null until the interface knows it. */
  readonly columns?: number | null;
  /** The palette a tone is painted from; `setTheme` changes it. */
  readonly theme?: ThemeKind;
  /**
   * How long a resize is allowed to settle before the lines are laid out
   * again.
   *
   * A drag on a panel divider reports a new width many times a second, and
   * a full replay on each would fight the drag for the screen. The replay
   * follows the LAST width, once the reports stop.
   */
  readonly resizeMs?: number;
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
  /**
   * Whether the indicator is drawn at all; true when absent. A stream that
   * is not a terminal -- a pipe, a file -- cannot erase a frame, so a frame
   * written there stays in the text for good.
   */
  readonly indicator?: boolean;
  /**
   * The operator's own stall threshold, where the interface has one.
   *
   * An answer of undefined falls back to the repository's
   * `verification.stalled_after_seconds` and then to the default -- the
   * middle tier is asked of the router, never restated.
   */
  readonly stalledAfterSeconds?: () => number | undefined;
  /** A run beginning for this repository after this terminal was built, with its session number. */
  readonly onRunStarted?: (session: number) => void;
  /**
   * What reaches the operator outside this terminal: a session paused, an
   * instruction overdue. Handed over in either format, and in `json` also
   * written to the stream.
   */
  readonly notice?: (notice: TerminalNotice) => void;
  /**
   * `text` (the default) writes coloured lines for a terminal; `json`
   * writes one object per line, for an interface that draws its own.
   */
  readonly format?: TerminalFormat;
}

export type TerminalFormat = "text" | "json";

/**
 * A notice the terminal raises where the operator may be instead: the
 * fields it was built from, and the sentence it is said in.
 */
export type TerminalNotice =
  | {
      readonly notice: "paused";
      readonly session: string;
      readonly stop: string;
      readonly reason: string;
      readonly who: string;
      readonly message: string;
    }
  | {
      readonly notice: "instruction-overdue";
      readonly step: string;
      readonly seq: string;
      readonly outstandingSeconds: number;
      readonly message: string;
    };

/**
 * One object of the `json` stream, one per line of it.
 *
 * `line` is a framework line -- the router's own read from a job's log
 * included, which carries only the clock it was written at -- with each
 * piece of its text and the tone the router gives it. `output` is a piece
 * of a job's own output exactly as the job wrote it; `eol` says whether it
 * ended its line, so a line a job has not finished is not held back.
 */
export type TerminalRecord =
  | {
      readonly kind: "line";
      readonly at: string | null;
      readonly clock: string;
      readonly event: string;
      readonly fields: Record<string, string>;
      readonly voice: string;
      readonly spans: readonly Span[];
    }
  | { readonly kind: "output"; readonly voice: string; readonly text: string; readonly eol: boolean }
  | { readonly kind: "rule"; readonly label: string }
  | { readonly kind: "banner"; readonly label: string }
  | ({ readonly kind: "notice" } & TerminalNotice);

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
 * One framework line as the bytes a terminal receives: laid out at
 * `columns`, each span painted, every physical line ended with CRLF.
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
 * The character a voice rule is drawn with, and the character a heading
 * separates the session number from the voice with -- one constant, because
 * two would let the heading drift out of the line it sits in and read as a
 * label dropped into a rule rather than part of one.
 */
export const RULE_CHAR = "─";

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
 * operator's to make.
 */
export function divider(label: string, columns: number | null, kind: ThemeKind): string {
  const width = Math.max(label.length + 6, (columns ?? DEFAULT_RULE_COLUMNS) - 1);
  const dashes = width - label.length - 2;
  const left = Math.floor(dashes / 2);
  return (
    paint(RULE_CHAR.repeat(left), "milestone", kind) +
    ` ${paint(label, "milestone", kind, true)} ` +
    paint(RULE_CHAR.repeat(dashes - left), "milestone", kind) +
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
 * terminal that has watched many sessions drops the oldest. What is dropped
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
 * the group it leads: the number, `RULE_CHAR`, and the voice.
 *
 * The separator is the character the rule is drawn with, so the heading is
 * continuous with the line it sits in. Both the framework's rule and a
 * job's are headed this way, because a scrollback that has held several
 * sessions is read back one group at a time and `verify-round-1` alone
 * could head any of them. Before a session is known the bare name is the
 * whole heading; a group written under a number keeps that number when the
 * terminal replays it, because the group really did belong to that session.
 */
function numbered(name: string, session: number | undefined): string {
  return session === undefined ? name : `${session} ${RULE_CHAR} ${name}`;
}

/** A record's own timestamp as a Date, or null when it will not parse. */
function recordedAt(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The fields a verification round is said with.
 *
 * Both spellings of the reviewing model, because archived rows are not
 * rewritten: a ledger recorded before the role was renamed carries
 * `verifier_model`, and a reader that took only the new key would print a
 * round with no reviewer against it.
 */
export function roundFields(row: Record<string, unknown>): Record<string, string> {
  return {
    round: String(row["round"] ?? "?"),
    // A fix that landed at the cap unread is said as that, never as its token,
    // and a person's review as theirs, with their name as the reviewer.
    verdict:
      row["type"] === ROW_REMEDIATED_AT_CAP
        ? TERMINAL_HEADLINES[VERDICT_REMEDIATED_AT_CAP]
        : row["type"] === ROW_PERSON_REVIEW
          ? TERMINAL_HEADLINES[VERDICT_REVIEWED_BY_PERSON]
          : String(row["verdict"] ?? "?"),
    reviewer: String(row["reviewed_by"] ?? row["reviewer_model"] ?? row["verifier_model"] ?? ""),
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

/**
 * The mark at the start of a line, and the tone it is worth.
 *
 * Two writers, one shape. `✓` and `✗` are the gate row's, from the router's
 * one `renderGateRow`; `✔` and `✖` are `node --test`'s own. Everything else
 * a runner writes at the start of a line -- `▶` over a suite, `ℹ` on a
 * summary, `﹣` on a skip -- is left exactly as it arrived.
 */
const MARK_TONES: Readonly<Record<string, Tone>> = {
  "✓": "good",
  "✔": "good",
  "✗": "bad",
  "✖": "bad",
};

/**
 * One line of a job's bytes with its mark painted, and not one character
 * more.
 *
 * **The bound is the point.** A renderer that recognised PHRASES in another
 * component's sentences would be a contract nobody declared, and the first
 * reworded message would break it silently. This recognises a glyph in the
 * first column, which is punctuation doing what punctuation is for -- and
 * the prose after it reaches the screen exactly as the runner wrote it.
 *
 * A gate that judged nothing wears neither the pass mark nor the fail mark:
 * the router opens its row with a dash, which is no mark this table knows,
 * so the line reaches the screen unpainted with no special case here.
 */
function paintMark(line: string, kind: ThemeKind): string {
  const at = line.search(/\S/);
  if (at === -1) return line;
  const mark = line[at] as string;
  const tone = MARK_TONES[mark];
  if (tone === undefined) return line;
  // A mark is a bullet, so something follows it. A glyph opening a word is
  // part of the word.
  const after = line[at + 1];
  if (after !== undefined && after !== " ") return line;
  return line.slice(0, at) + paint(mark, tone, kind, true) + line.slice(at + 1);
}

/**
 * A pseudoterminal only accepts CRLF; beyond that the only thing that
 * changes is the MARK opening a line, which is painted.
 *
 * The colour goes in here rather than into the bytes on disk. The router
 * could have written the escapes itself, and then every `close.log` and
 * run-of-record log would carry them for whoever opens one; the terminal
 * could have read the gate rows from a record and drawn them, and then they
 * would be said twice. Neither is available for `node --test`, which writes
 * its own marks and keeps no record of them -- so this has to exist
 * regardless, and once it does the gate rows are one more shape it
 * recognises.
 *
 * `atLineStart` is false when this chunk continues a line an earlier drain
 * ended in the middle of: its first glyph is then not in the first column,
 * whatever it looks like here.
 */
export function forTerminal(
  bytes: string,
  kind: ThemeKind,
  atLineStart = true,
  draw?: (line: RouterLine) => string,
): string {
  const lines = bytes.replace(/\r?\n/g, "\r\n").split("\r\n");
  return lines
    .map((line, at) => {
      if (at === 0 && !atLineStart) return line;
      // Only a line this chunk ends: a fragment is continued by the next drain.
      const whole = at < lines.length - 1;
      const routers = draw !== undefined && whole ? routerLine(line) : null;
      return routers === null ? paintMark(line, kind) : draw!(routers).replace(/\r\n$/, "");
    })
    .join("\r\n");
}

/** One line the router wrote about itself: the clock it printed, the event, and its `key=value` fields. */
export interface RouterLine {
  readonly clock: string;
  readonly event: string;
  readonly fields: Record<string, string>;
}

/** The router's own line, as its driver prints one: who is speaking, the clock, then the event. */
const ROUTER_LINE = /^dabbler \[(\d{2}:\d{2}:\d{2})\] (.+)$/;
/** How such a line opens, which is all that can be known of one before its end is written. */
const ROUTER_PREFIX = "dabbler [";

/**
 * A replayed line read as the router's own, or null where it is anybody
 * else's.
 *
 * The prefix says who is speaking, which a log file on disk needs and this
 * terminal does not: its voice rule already says it, and its own lines open
 * with the bare clock. So the router's line is drawn the way those are, and a
 * step or a phase looks the same whoever reported it. The fields are read for
 * their tones only -- every character after the clock reaches the screen --
 * and a line that is prose after its clock is one event with no fields.
 */
export function routerLine(line: string): RouterLine | null {
  const match = ROUTER_LINE.exec(line);
  if (match === null) return null;
  const clock = match[1] as string;
  const said = match[2] as string;
  const space = said.indexOf(" ");
  const rest = space === -1 ? "" : said.slice(space + 1);
  const keys = [...rest.matchAll(/(?:^| )([A-Za-z_][\w-]*)=/g)];
  if (rest !== "" && keys[0]?.index !== 0) return { clock, event: said, fields: {} };
  const fields: Record<string, string> = {};
  keys.forEach((key, at) => {
    const from = (key.index ?? 0) + key[0].length;
    const to = at + 1 < keys.length ? (keys[at + 1]?.index ?? rest.length) : rest.length;
    const name = key[1] as string;
    // A key said twice keeps both: the second is carried in the first's value.
    if (name in fields) fields[name] = `${fields[name]} ${name}=${rest.slice(from, to)}`;
    else fields[name] = rest.slice(from, to);
  });
  return { clock, event: space === -1 ? said : said.slice(0, space), fields };
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
  const runs = runsDir(repoRoot);
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
 * as no such job.
 */
export function uncollectedWords(repoRoot: string, run?: TerminalRunRecord | null): string | null {
  const record = run ?? (() => {
    const runPath = liveRunPath(repoRoot);
    return runPath === null ? null : readRun(runPath);
  })();
  if (record === null || record.stop || !record.job) return null;
  if (typeof record.session_number !== "number") return null;
  return readUncollectedJob(repoRoot, record.session_number)?.words ?? null;
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

function readRun(runPath: string): TerminalRunRecord | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(runPath, "utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as TerminalRunRecord) : null;
  } catch {
    // A half-written record is not an event. The next tick reads it whole.
    return null;
  }
}

/**
 * The session the ledger says is in progress, or null.
 *
 * Read here, and only for the banner: a session exists from its
 * registration, and the run record it will be driven under is born at the
 * first `next`. Which session is in flight stays the projection's rule for
 * everything else; this reads one row for one line.
 */
function readLedgerInFlight(sessionsDir: string): number | null {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(sessionsDir, STATE_FILENAME), "utf8"));
    const sessions = (raw as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) return null;
    const row = sessions.find(
      (entry: unknown) => (entry as { status?: unknown }).status === "in-progress",
    ) as { number?: unknown } | undefined;
    if (row === undefined || typeof row.number !== "number") return null;
    return row.number;
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

/**
 * The terminal's lines for one repository, and the polling that finds them.
 *
 * Given a width, a theme and a place to write, it reads the records of a
 * run under `.dabbler/runs/` and writes what they say. An interface tells it
 * of a new width (`setColumns`) or theme (`setTheme`) and starts or disposes
 * it; everything a line says is decided here.
 */
export class TerminalLines {
  private readonly repoRoot: string;
  private readonly sessionsDir: string;
  private readonly sink: (text: string) => void;
  /** Disposed: nothing more is written, whatever is still asked of it. */
  private disposed = false;
  private readonly now: () => Date;
  private readonly since: number;
  private readonly pollMs: number;
  private readonly resizeMs: number;
  private readonly spinMs: number;
  private readonly spins: boolean;
  private readonly json: boolean;
  private readonly operatorThreshold: () => number | undefined;
  private readonly onRunStarted: (session: number) => void;
  private readonly onNotice: (notice: TerminalNotice) => void;

  private theme: ThemeKind;
  private timer: ReturnType<typeof setInterval> | undefined;
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  private spinTimer: ReturnType<typeof setInterval> | undefined;

  /** The width the interface last reported, or null before it has said. */
  private columns: number | null;

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
  /**
   * The wait this terminal has already said, by owner, subject, start and
   * whether a waiter had read it. Said once per wait and once more when
   * that last part changes -- an instruction picked up is news; the clock
   * ticking is not.
   */
  private waitingSaid: string | null = null;
  private activity: Activity = "waiting";
  private spoken: Activity | null = null;
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
   * leaves the cursor partway along. Drawing there would put the frame at the
   * end of the runner's own text, and the next tick erases the WHOLE line to
   * clear it: the runner's bytes would go with it. So a partial line means no
   * indicator until the line is finished.
   */
  private atLineStart = true;

  /**
   * How far into each job log this terminal has read, by absolute path.
   *
   * Keyed on the FILE rather than on the job the record happens to be
   * carrying: a job removed from `run.json` between two looks must not take
   * its last bytes with it, and a job whose whole life fell inside one
   * interval must still be read. The log outlives the record entry, so
   * reading the directory reads everything either way.
   */
  private readonly logOffsets = new Map<string, number>();

  /**
   * Whether each log's next chunk will open a line, which is the only thing
   * that decides whether its first glyph can be a mark.
   */
  private readonly logAtLineStart = new Map<string, boolean>();
  /** Per log: the opening of a router line read before its end was written. */
  private readonly heldRouterLine = new Map<string, string>();

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

  constructor(options: TerminalLinesOptions) {
    this.repoRoot = options.repoRoot;
    this.sessionsDir = options.sessionsDir ?? path.join(options.repoRoot, "docs", SESSIONS_DIRNAME);
    this.sink = options.write;
    this.now = options.now ?? (() => new Date());
    this.since = options.since ?? Date.now();
    this.columns = options.columns ?? null;
    this.theme = options.theme ?? "dark";
    this.pollMs = options.pollMs ?? 500;
    this.spinMs = options.spinMs ?? 120;
    this.json = options.format === "json";
    // A frame is a thing a terminal draws and erases; a stream of objects
    // has neither.
    this.spins = !this.json && (options.indicator ?? true);
    this.resizeMs = options.resizeMs ?? 150;
    this.operatorThreshold = options.stalledAfterSeconds ?? (() => undefined);
    this.onRunStarted = options.onRunStarted ?? (() => undefined);
    this.onNotice = options.notice ?? (() => undefined);
  }

  /** One write to wherever this terminal writes, until it is disposed. */
  private output(text: string): void {
    if (!this.disposed) this.sink(text);
  }

  /** One object of the `json` stream, on a line of its own. */
  private record(record: TerminalRecord): void {
    this.output(`${JSON.stringify(record)}\n`);
  }

  /** In `json`, a change of voice is an object of its own, as the rule is in text. */
  private recordVoice(speaker: string): void {
    if (this.speaker === speaker) return;
    this.speaker = speaker;
    this.record({ kind: "rule", label: speaker });
  }

  /** A notice, handed over, and in `json` said in the stream too. */
  private raise(notice: TerminalNotice): void {
    if (this.json) this.record({ kind: "notice", ...notice });
    this.onNotice(notice);
  }

  /**
   * The threshold the watcher is judged against: the operator's own, where
   * the interface has one, then the repository's, then the default.
   */
  private watcherThreshold(): number {
    const configured = this.operatorThreshold();
    if (typeof configured === "number" && configured > 0) return Math.trunc(configured);
    return stalledAfterSeconds(this.repoRoot);
  }

  /**
   * Everything this terminal writes goes through here, and that is the whole
   * of how the indicator stays out of the way.
   *
   * The spinner lives on the last line with no newline after it, so any
   * write that arrived while it was drawn would land on top of it. Erasing
   * first and redrawing after means a job's bytes reach the terminal exactly
   * as the runner wrote them, and the indicator reappears below them.
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
      this.output(`${before}${divider(speaker, this.columns, this.theme)}`);
      this.speaker = speaker;
      this.atLineStart = true;
    }
    this.output(text);
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
   * decision.** `emit` draws a rule only when the speaker changes, this sets
   * the speaker to the numbered voice without drawing one, and a session
   * driven from a chat puts no job output here -- so its voice never changes
   * and no numbered rule is ever occasioned. Drawing the session's first
   * framework rule here, numbered, would restore the two headings for one
   * group this is written to prevent; `SESSION 133` between double rules
   * already names the session more plainly than `133 ─ framework` does.
   */
  private sayBanner(label: string): void {
    const voice = this.voice();
    if (this.json) {
      this.record({ kind: "banner", label });
      this.speaker = voice;
      return;
    }
    this.remember({ kind: "banner", label, voice });
    this.erase();
    this.emitBanner(label, voice);
    this.draw();
  }

  private emitBanner(label: string, voice: string): void {
    const before = this.speaker === null ? "" : this.atLineStart ? CRLF : `${CRLF}${CRLF}`;
    this.output(`${before}${banner(label, this.columns, this.theme)}`);
    this.speaker = voice;
    this.atLineStart = true;
  }

  /**
   * A session's banner: said once per session, from whichever record named
   * the session first. The ledger row exists from registration; the run
   * record is born at the first `next`.
   */
  private openSession(number: number): void {
    if (this.bannered === number) return;
    this.bannered = number;
    this.sayBanner(`SESSION ${String(number).padStart(3, "0")}`);
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
   * How wide the terminal is now.
   *
   * A changed width lays every line out again, after the resize settles:
   * the hanging indent is this terminal's own wrapping, and a terminal that
   * kept the old physical lines would show the indent honoured at one width
   * and broken at every other.
   */
  setColumns(columns: number): void {
    if (columns === this.columns) return;
    this.columns = columns;
    // An object is laid out by whoever draws it: nothing to replay.
    if (!this.json) this.scheduleReplay();
  }

  /**
   * The palette from the next line on. A theme switched mid-session
   * repaints from the next line rather than staying wrong.
   */
  setTheme(kind: ThemeKind): void {
    this.theme = kind;
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
    this.output(CLEAR_ALL);
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
        this.emit(this.replayed(entry.bytes, true), entry.label);
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
    this.output(ERASE_LINE);
  }

  /** Put the current frame back, if there is anything to indicate. */
  private draw(): void {
    if (!this.spins || this.activity !== "working") return;
    // Never on a line something else is already using. See `atLineStart`.
    if (!this.atLineStart) return;
    this.spinning = true;
    this.output(paint(SPINNER_FRAMES[this.frame] as string, "warn", this.theme));
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

  /**
   * The first line, the timers and the first look.
   *
   * The width first, so the first line is laid out at it rather than at an
   * unknown width and replayed a moment later. Both timers are unref'd: a
   * poll and an animation are things this does WHILE something else is
   * happening, never a reason for the process to stay alive.
   */
  start(columns?: number | null): void {
    if (columns !== undefined && columns !== null) this.columns = columns;
    this.line("terminal-opened", { repository: path.basename(this.repoRoot) });
    this.timer = setInterval(() => this.poll(), this.pollMs);
    (this.timer as { unref?: () => void }).unref?.();
    this.spinTimer = setInterval(() => this.tick(), this.spinMs);
    (this.spinTimer as { unref?: () => void }).unref?.();
    this.poll();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    if (this.spinTimer !== undefined) clearInterval(this.spinTimer);
    this.spinTimer = undefined;
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    this.resizeTimer = undefined;
  }

  /**
   * One look at the record and at the running job's log.
   *
   * Public because the interval is not the behaviour: a test drives this
   * directly, and so does a caller that wants a tick on a file event.
   */
  poll(): void {
    // The ledger first: a session exists from its registration, before any
    // run record does, and its banner belongs at the very beginning.
    const ledger = readLedgerInFlight(this.sessionsDir);
    if (ledger !== null) this.openSession(ledger);

    const runPath = liveRunPath(this.repoRoot);
    if (runPath === null) return;
    const run = readRun(runPath);
    if (run === null) return;

    // A run record for a session this terminal has not read before. One
    // that began after the terminal did is a session starting while it
    // watched; one that was already running is the state of the world at
    // the first look.
    if (typeof run.session_number === "number" && run.session_number !== this.lastSession) {
      this.lastSession = run.session_number;
      // A new session's seq starts over: the step line said for the last
      // session's seq must not silence this one's.
      this.saidSeq = undefined;
      this.openSession(run.session_number);
      if (startedAfter(run.started_at, this.since)) this.onRunStarted(run.session_number);
    }

    // The first look at a run says what the records say already happened,
    // before it says where the run is now.
    if (!this.looked) {
      this.looked = true;
      this.sayEarlier(run, runPath);
    }

    if (run.phase !== undefined && run.phase !== this.phase) {
      this.phase = run.phase;
      // The session is named when it changes and not on every phase.
      const session = run.session_number ?? null;
      this.line("phase", {
        ...(session !== this.saidSession ? { session: this.sessionLabel(run) } : {}),
        now: run.phase,
      });
      this.saidSession = session;
      // The end of the session, said as the end rather than as one more
      // phase. What the NEXT session's number is stays unsaid here: the
      // sequence skips cancelled numbers, that rule lives in the projection,
      // and the close's log says it as it passes through.
      if (run.phase === "complete") {
        this.line("session-closed", { session: this.sessionLabel(run) });
      }
    }

    // The instruction the run just issued, once per seq: a step as it
    // starts, with the first sentence of its ask; an answer refused, with
    // the first reason. A wait and a done say nothing here.
    //
    // **The seq is marked as said only after a read that agreed with it.**
    // Marking it first would make an instruction that is absent,
    // half-written, or still carrying the previous seq drop its line
    // PERMANENTLY. A read that agreed is what marks it, whatever kind it
    // turned out to be.
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

    // Said BEFORE the job's log is drained: `working` is the framework's
    // line, and said after the first read it would sit between two halves
    // of the job's output. Only a job beginning: one ending is said after
    // its last bytes.
    this.sayActivity(run, "working");

    // Drained BEFORE the job is reported collected, so a job's last bytes
    // are spoken before the line that says it finished -- and drained from
    // the directory, so they are spoken whether or not the record still
    // names it.
    this.drainJobs(path.dirname(runPath));

    // The loop's own output, from the copy it keeps beside its heartbeat,
    // followed exactly as a job's log is, so "nothing runs where nobody can
    // see it" holds however the loop was started.
    this.drainLoopLog(path.join(path.dirname(runPath), LOOP_LOG_FILENAME));

    // The verdict and the test outcome, from the records the machine owns
    // rather than from the job bytes they also appear in.
    const runDir = path.dirname(path.dirname(runPath));
    this.drainRounds(path.join(runDir, ROUNDS_FILENAME));
    this.drainTestRuns(path.join(runsDir(this.repoRoot), TEST_RUNS_FILENAME));
    this.drainOverdue(path.join(path.dirname(runPath), SUPERVISION_FILENAME), run);

    if (collected !== null) {
      // What it exited with is the record's to say, not this terminal's to
      // guess -- the phase line that follows is what says how it went.
      this.line("job-collected", { name: collected });
      this.jobName = null;
    }

    this.sayWaiting(run);

    const stop = run.stop ?? null;
    const phase = run.phase ?? "";
    if (stop) {
      // A stop is its kind, its moment and its reason: a replacement of the
      // same kind is a new pause, spoken as one. The words are the router's
      // one rendering, and the record goes to it WHOLE, code included.
      const identity = `${stop.kind ?? ""}\0${stop.at ?? ""}\0${stop.reason ?? ""}`;
      if (this.paused === null || this.paused.identity !== identity) {
        const kind = stop.kind ?? "?";
        this.paused = { identity, stop: { kind }, phase };
        const words = renderStop(
          {
            kind,
            code: stop.code ?? null,
            reason: stop.reason ?? "",
            step_id: stop.step_id ?? null,
          },
          { session_number: run.session_number ?? 0, phase, engine: run.engine },
        );
        // Four separable facts, as four fields: `who` is off the record, and
        // `ways` is every way on with its cost and its command, as the
        // router formats them once.
        this.line("paused", {
          session: this.sessionLabel(run),
          kind,
          who: whoActs(words.actor),
          reason: stop.reason ?? "",
          ways: words.ways,
        });
        // And where the operator actually is, which may be the AI's chat or
        // another window entirely. Once per stop: it hangs off the same
        // identity the line above is keyed on.
        const who = whoActs(words.actor);
        this.raise({
          notice: "paused",
          session: this.sessionLabel(run),
          stop: kind,
          reason: stop.reason ?? "",
          who,
          message:
            `Dabbler: session ${this.sessionLabel(run)} is paused (${kind}) — ` +
            `${firstSentence(stop.reason ?? "")} ${who} act(s) next.`,
        });
      }
    } else if (this.paused !== null && progressResumed(this.paused, { stop: null, phase })) {
      // Gone AND moved on. Gone alone is the resume clearing it, and says
      // nothing yet; this terminal keeps the pause until the phase leaves it.
      this.line("progress-resumed", { past: this.paused.stop.kind, from: this.paused.phase, phase });
      this.paused = null;
    }

    this.sayActivity(run);
    // The indicator follows the activity immediately rather than at the
    // next animation tick.
    if (this.activity === "working") this.draw();
    else this.erase();

    this.watch(run);
  }

  /**
   * The indicator, said rather than merely held: a person watching this
   * terminal is asking "is anything happening". A job that has exited
   * uncollected is not "working", and the line that says so carries the
   * router's words for it.
   */
  private sayActivity(run: TerminalRunRecord, only?: Activity): void {
    const job = run.job ?? null;
    const stop = run.stop ?? null;
    const finished = stop || !job ? null : uncollectedWords(this.repoRoot, run);
    const activity: Activity = stop || !job ? "waiting" : finished === null ? "working" : "uncollected";
    if (only !== undefined && activity !== only) return;
    this.activity = activity;
    if (this.activity === this.spoken) return;
    this.spoken = this.activity;
    this.line(this.activity, finished === null ? {} : { name: job?.name ?? "job", reason: finished });
  }

  /**
   * The other silence: an instruction issued, nothing answering it, over a
   * tree that has not moved.
   *
   * The rule is the router's -- this asks it and paints the answer. What is
   * decided here is only how OFTEN to ask (the probe costs a git call) and
   * how often to say it: once when the threshold is first crossed, and again
   * at each further multiple of it.
   */
  private watch(run: TerminalRunRecord): void {
    const session = run.session_number;
    if (session === undefined) return;
    const threshold = this.watcherThreshold();
    const now = this.now();
    if (now.getTime() - this.lastLook < watcherLookMs(threshold)) return;
    this.lastLook = now.getTime();

    // What is being watched: the instruction, or the job. Either changing
    // is a new silence. A job's identity is its name, its log AND the moment
    // it started, because a re-run starts a new job under the same name over
    // the same truncated log.
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
    // drains every job log on every poll, so its offsets are the record of
    // whether anything arrived.
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
   * Whether the running job's log has grown since the last watcher look,
   * from the offsets `drainJobs` maintains. Null until two looks have
   * happened, because one look is not a comparison.
   */
  private jobLogGrew(run: TerminalRunRecord): boolean | null {
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
   * Who the session is waiting on, in the router's one sentence, shared
   * with `dabbler status` and the Work Explorer's row. Whether a waiter has
   * read the instruction is taken live here as it is everywhere else.
   */
  private sayWaiting(run: TerminalRunRecord): void {
    const waiting = run.waiting ?? null;
    if (!waiting || !waiting.owner || !waiting.for || !waiting.since) {
      this.waitingSaid = null;
      return;
    }
    const session = run.session_number ?? 0;
    const read =
      waiting.owner === "author"
        ? { waiter: waiterSeenSince(this.repoRoot, session, waiting.since) }
        : {};
    const identity = `${waiting.owner}\0${waiting.for}\0${waiting.since}\0${String(read.waiter ?? "")}`;
    if (this.waitingSaid === identity) return;
    this.waitingSaid = identity;
    this.line("waiting-on", {
      says: renderWaiting(
        {
          owner: waiting.owner,
          for: waiting.for,
          since: waiting.since,
          by: waiting.by ?? null,
          last_progress: waiting.last_progress ?? waiting.since,
          ...read,
        },
        this.now().getTime(),
      ),
    });
  }

  /**
   * The loop's own output, followed exactly as a job's log is.
   *
   * The first look starts at the file's current SIZE rather than at its
   * beginning: a terminal opened mid-session should say what happens from
   * now on, not recite an hour of a loop that is still running.
   */
  private drainLoopLog(logPath: string): void {
    if (!this.logOffsets.has(logPath)) {
      let size: number;
      try {
        size = fs.statSync(logPath).size;
      } catch {
        // No loop has written here yet; there is nothing to follow.
        return;
      }
      this.logOffsets.set(logPath, size);
      this.logAtLineStart.set(logPath, true);
      if (!this.announced.has(logPath)) {
        this.announced.add(logPath);
        this.line("loop-output", { log: relativeToRoot(this.repoRoot, logPath) });
      }
      return;
    }
    this.drainFile(logPath);
  }

  /**
   * Every job log in the run's own directory, from wherever this terminal
   * last read it. The whole directory rather than the one job on the
   * record: a short job can start and finish between two looks. A log
   * nothing announced gets a line of its own, so bytes never arrive from
   * nowhere.
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
   * size is where reading starts. The job the record is carrying is left to
   * `job-started`, and its log is read from the start.
   *
   * Each line carries the record's own clock rather than the moment this
   * terminal happened to open.
   */
  private sayEarlier(run: TerminalRunRecord, runPath: string): void {
    const now = this.now();
    const runDir = path.dirname(path.dirname(runPath));
    const earlier: Array<{ at: Date; event: string; fields: Record<string, string> }> = [];
    for (const row of this.newRows(path.join(runDir, ROUNDS_FILENAME), true)) {
      earlier.push({ at: recordedAt(row["recorded_at"]) ?? now, event: "verify", fields: roundFields(row) });
    }
    for (const row of this.newRows(path.join(runsDir(this.repoRoot), TEST_RUNS_FILENAME), true)) {
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
      // The job the record is carrying is the present, not history: what it
      // has written so far is shown from its first byte.
      this.logOffsets.set(full, full === current ? 0 : size);
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

  /**
   * Each `instruction-overdue` the loop recorded since the last look, said
   * once here and once as a warning -- the operator may be in the AI's
   * chat, not in this terminal. An event for an instruction the run has
   * since moved past is history and says nothing.
   */
  private drainOverdue(file: string, run: TerminalRunRecord): void {
    for (const row of this.newRows(file, true)) {
      if (row["event"] !== "instruction-overdue" || row["seq"] !== run.seq) continue;
      const seq = String(row["seq"]);
      const step = typeof row["step"] === "string" ? row["step"] : "?";
      const seconds = Number(row["outstanding_seconds"] ?? 0);
      this.line("instruction-overdue", { step, seq, outstanding: `${seconds}s` });
      this.raise({
        notice: "instruction-overdue",
        step,
        seq,
        outstandingSeconds: seconds,
        message:
          `Dabbler: step ${step} (instruction ${seq}) has been owed an answer for ${Math.floor(seconds / 60)} min. ` +
          "Nothing of the framework's waits on it -- ask the AI in its chat what it is doing with it.",
      });
    }
  }

  /** Test runs as they are recorded; the first look already said this session's. */
  private drainTestRuns(file: string): void {
    for (const row of this.newRows(file, false)) this.line("tests", testRunFields(row));
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
   * finished.
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
    // Whether this chunk opens a line, so a mark is only painted where it
    // really is in the first column.
    const opensLine = this.logAtLineStart.get(logPath) ?? true;
    // The start of a router line whose end has not been written yet is held
    // back until it has: half of one drawn as it arrived is a `dabbler [`
    // line on the screen after all. Nothing else is held -- a runner's own
    // unfinished line shows at once.
    const held = this.heldRouterLine.get(logPath) ?? "";
    let text = held + appended;
    const cut = text.lastIndexOf("\n") + 1;
    const tail = text.slice(cut);
    const tailOpensLine = cut > 0 || opensLine || held !== "";
    if (tailOpensLine && tail.startsWith(ROUTER_PREFIX)) {
      this.heldRouterLine.set(logPath, tail);
      text = text.slice(0, cut);
    } else {
      this.heldRouterLine.delete(logPath);
    }
    if (text === "") return;
    const label = numbered(jobLabel(logPath), this.bannered);
    this.logAtLineStart.set(logPath, text.endsWith("\n"));
    if (this.json) {
      this.recordOutput(text, opensLine || held !== "", label);
      return;
    }
    this.remember({ kind: "raw", label, bytes: text });
    this.say(this.replayed(text, opensLine || held !== ""), label);
  }

  /**
   * A log's bytes as objects: one per line, the router's own as the line it
   * is drawn as in text, everybody else's exactly as written.
   */
  private recordOutput(bytes: string, opensLine: boolean, label: string): void {
    this.recordVoice(label);
    const pieces = bytes.split("\n");
    pieces.forEach((piece, at) => {
      const eol = at < pieces.length - 1;
      if (!eol && piece === "") return;
      const text = piece.replace(/\r$/, "");
      const router = eol && (at > 0 || opensLine) ? routerLine(text) : null;
      if (router !== null) {
        this.record(this.lineRecord(null, router.clock, router.event, router.fields, label));
      } else {
        this.record({ kind: "output", voice: label, text, eol });
      }
    });
  }

  /** A log's bytes for this screen: marks painted, and the router's own lines drawn as this terminal's are. */
  private replayed(bytes: string, opensLine: boolean): string {
    return forTerminal(bytes, this.theme, opensLine, (line) => this.render(line.clock, line.event, line.fields));
  }

  private sessionLabel(run: TerminalRunRecord): string {
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
    if (this.json) {
      this.recordVoice(voice);
      this.record(this.lineRecord(at, clockOf(at), event, fields, voice));
      return;
    }
    this.remember({ kind: "line", at, event, fields, voice });
    this.say(this.render(at, event, fields), voice);
  }

  /** A framework line as the `json` stream carries it: the spans the text form paints, unlaid. */
  private lineRecord(
    at: Date | null,
    clock: string,
    event: string,
    fields: Record<string, string>,
    voice: string,
  ): TerminalRecord {
    return {
      kind: "line",
      at: at === null ? null : at.toISOString(),
      clock,
      event,
      fields,
      voice,
      spans: lineSpans(clock, event, fields),
    };
  }

  /**
   * The framework's voice, as the rule names it: `126 ─ framework` while a
   * session is known, `framework` before one is.
   */
  private voice(): string {
    return numbered(FRAMEWORK_VOICE, this.bannered);
  }

  /**
   * The bytes for one framework line at the width and theme in hand.
   */
  private render(at: Date | string, event: string, fields: Record<string, string>): string {
    // A replayed router line carries the clock it was written at, already said.
    const clock = typeof at === "string" ? at : clockOf(at);
    return renderSpans(lineSpans(clock, event, fields), this.columns, this.theme);
  }
}

/** `hh:mm:ss`, the clock every framework line opens with. */
function clockOf(at: Date): string {
  return [at.getHours(), at.getMinutes(), at.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

/**
 * One framework line as spans, before it is laid out: what the text form
 * paints and the `json` form carries.
 *
 * The clock and the `key=` of every field are muted, because they are
 * scaffolding: the operator is scanning for the event and for the values.
 * The event takes the line's own tone, and each value takes whatever tone
 * that key's value earns -- which is how a verdict and a test outcome come
 * out green or red without this knowing what either one is.
 */
function lineSpans(clock: string, event: string, fields: Record<string, string>): Span[] {
  const opening: Span[] = [
    { text: clock, tone: "muted", bold: false },
    { text: " ", tone: "plain", bold: false },
  ];
  const result = suiteResultSpans(event, fields);
  if (result !== null) return [...opening, ...result];
  const tone = lineTone(event, fields);
  const spans: Span[] = [...opening, { text: event, tone, bold: tone !== "muted" && tone !== "plain" }];
  for (const [key, value] of Object.entries(fields)) {
    if (value === "") continue;
    const valueTone = fieldTone(event, key, value);
    spans.push(
      { text: " ", tone: "plain", bold: false },
      { text: `${key}=`, tone: "muted", bold: false },
      { text: value, tone: valueTone, bold: valueTone !== "muted" && valueTone !== "plain" },
    );
  }
  return spans;
}
