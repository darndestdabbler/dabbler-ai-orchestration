// What a session LOOKED like, in a file that outlives the framework.
//
// A second developer who clones this repository can read what every session
// DECIDED -- the decisions log and the change log are tracked -- and can see
// nothing of what any session looked like while it ran. The Dabbler Terminal
// is where that is visible, and it persists nothing: its scrollback is in
// memory, capped, and gone when the window closes. Everything it shows is
// reconstructed from records under `.dabbler/`, which is gitignored whole
// and stays that way, because the rollback depends on nothing there being
// tracked.
//
// So the record TRAVELS as a rendered artifact rather than as the records
// themselves: one self-contained HTML file per session, committed. The
// reason is this framework's own mortality -- a record only `dabbler` can
// parse is worth nothing the day `dabbler` is replaced, and an HTML file
// opens in any browser with no tooling at all. The repository already works
// this way: `decisions-log.md` is RENDERED from the activity log and is
// explicitly not a source.
//
// **No script, no network, no CDN.** Inline CSS and nothing else: a page
// that fetched a stylesheet would be a record that stops rendering the day
// the host goes away, which is the failure this file exists to avoid. Both
// palettes travel in the page under `prefers-color-scheme`, so one file
// reads correctly on either kind of screen.
//
// **The tone grammar lives here, and the Dabbler Terminal imports it.** What
// a line IS is one rule with two renderers over it -- ANSI colour in a
// terminal, a CSS class in a page. Written twice it would be two rules that
// agreed on the day they were written.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readDriverEvents, readRun } from "./driver.ts";
import { jobsDir } from "./jobs.ts";
import { runGit } from "./journal.ts";
import { readRounds } from "./ledger.ts";
import { redact } from "./packaging.ts";
import { readRecords } from "./testEvidence.ts";
import { VERSION } from "./version.ts";
import type { DriverEvent, DriverRun } from "./generated/index.ts";

// --- The tone grammar ---------------------------------------------------------
//
// Moved here from the extension's `dabblerTerminal.ts` unchanged, because a
// transcript and the terminal must agree about what every line IS. The
// terminal paints a tone as an ANSI escape; this file paints it as a class.

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
  // next, which is not an alarm. Every pause, whatever class a run written
  // before 2.9.0 carries.
  if (event === "paused") return "warn";
  // The one honest green event, and no second: the phase moved past a
  // pause with nothing in its place.
  if (event === "progress-resumed") return "good";
  // A finished job nobody collected is amber for the watcher's reason: the
  // framework knows of nothing wrong, and what is being said is that the
  // next call is owed and nobody has made it.
  if (event === "uncollected") return "warn";
  // The watcher is a nudge, not a verdict: nothing has gone wrong that the
  // framework knows of, and the only thing being said is that the engine
  // has been quiet over an unmoved tree. `warn` is the amber the indicator
  // already spins in, which is exactly the weight it should carry.
  if (event === "watcher") return "warn";
  if (event === "instruction-overdue") return "warn";
  if (event === "verify") return verdictTone(fields["verdict"] ?? "");
  if (event === "tests") return (fields["outcome"] ?? "") === "passed" ? "good" : "bad";
  // Every phase, and not a chosen eight. A list of the interesting ones put
  // `preverify`, `dispositions`, `fix` and `publish` in the plain tone --
  // which are precisely the phases where a session stops being routine and
  // an operator most wants to catch it -- so one session read blue, blue,
  // plain, blue, plain, plain, blue, blue, plain, blue as it moved, and the
  // reader had to know the list to know what the change of colour meant. A
  // phase line is the framework saying where the session is, and where the
  // session is is always worth the same weight.
  if (event === "phase") return "milestone";
  if (event === "session-closed") return "milestone";
  // A step beginning is the session's own progress, in the milestone blue;
  // an answer refused is the amber of a nudge, not the red of a failure --
  // the engine is told why and answers again.
  if (event === "step") return "milestone";
  if (event === "rejected") return "warn";
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
  // same value wherever another line carries it. Every one of them, for the
  // reason `lineTone` gives above.
  if (key === "now" || key === "phase") return "milestone";
  // On a pause the kind is amber; the words themselves stay plain, because
  // prose painted whole is a wall.
  if (event === "paused" && key === "kind") return "warn";
  return "plain";
}

// --- Where a transcript lives -------------------------------------------------

/**
 * One session's page, named so that the directory sorts the way it reads.
 *
 * Where they land is `TRANSCRIPTS_DIRNAME` in `journal.ts`, beside the
 * predicate that keeps them out of the digests: the writer and the
 * exclusion must name one directory, and a constant kept here would leave
 * the exclusion free to name a path nothing writes to.
 */
export function sessionTranscriptName(sessionNumber: number): string {
  return `session-${String(sessionNumber).padStart(3, "0")}.html`;
}

// --- Reading one session's records --------------------------------------------

/** How much of the jobs' own output a transcript carries. */
export type JobCarry = "failed" | "all";

export interface TranscriptOptions {
  /**
   * `failed` -- the default -- carries the outline and the bytes of jobs
   * that did not exit zero; `all` carries every job's bytes. The whole of a
   * run of record is megabytes of somebody else's runner output, and a
   * reader who wants it says so.
   */
  readonly jobs?: JobCarry;
  /** Fixed by a test; otherwise now. */
  readonly renderedAt?: string;
}

interface JobReading {
  readonly name: string;
  readonly exit: string;
  readonly output: string;
}

interface SessionReading {
  readonly sessionNumber: number;
  readonly run: DriverRun | null;
  readonly events: readonly DriverEvent[];
  readonly rounds: readonly Record<string, unknown>[];
  readonly testRuns: ReturnType<typeof readRecords>;
  readonly jobs: readonly JobReading[];
  /**
   * The records this session has none of, in the words a reader needs.
   *
   * SAID rather than inferred: a session with no rounds because it changed
   * nothing and a session whose ledger was never written look identical
   * from the outside, and a page that quietly omitted the section would be
   * telling the reader the first when it might be the second.
   */
  readonly absent: readonly string[];
}

/** Everything one session left behind, as much of it as there is. */
function readSession(
  repoRoot: string,
  sessionNumber: number,
  carry: JobCarry,
): SessionReading {
  const absent: string[] = [];
  const run = readRun(repoRoot, sessionNumber);
  if (run === null) absent.push("the run record (run.json)");

  const events = readDriverEvents(repoRoot, sessionNumber);
  if (events.length === 0) {
    absent.push(
      "the framework's own lines (events.jsonl) -- every session before 3.22.0 has none",
    );
  }

  let rounds: Record<string, unknown>[] = [];
  try {
    rounds = readRounds(repoRoot, sessionNumber);
  } catch {
    absent.push("the verification rounds (rounds.jsonl): the file would not read");
  }
  if (rounds.length === 0 && !absent.some((line) => line.includes("rounds.jsonl"))) {
    absent.push("any verification round");
  }

  const testRuns = readRecords(repoRoot).filter((row) => row.sessionNumber === sessionNumber);
  if (testRuns.length === 0) absent.push("any recorded test run");

  const jobs = readJobs(repoRoot, sessionNumber, carry);
  if (jobs.length === 0) absent.push("any background job");

  return { sessionNumber, run, events, rounds, testRuns, jobs, absent };
}

function readJobs(repoRoot: string, sessionNumber: number, carry: JobCarry): JobReading[] {
  const dir = jobsDir(repoRoot, sessionNumber);
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const jobs: JobReading[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".log")).sort()) {
    const name = entry.slice(0, -".log".length);
    const exit = readJobExit(join(dir, `${name}.status.json`));
    // The default carries a passing job's outline and not its bytes: a run
    // of record that went green is megabytes saying so.
    const wanted = carry === "all" || exit !== "0";
    jobs.push({
      name,
      exit,
      output: wanted ? readTextOrEmpty(join(dir, entry)) : "",
    });
  }
  return jobs;
}

function readJobExit(path: string): string {
  try {
    const row: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof row === "object" && row !== null) {
      const code = (row as Record<string, unknown>)["exit"];
      if (typeof code === "number") return String(code);
    }
  } catch {
    // An unreadable status is an unknown exit, which the page says.
  }
  return "?";
}

function readTextOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * A variable whose VALUE is a credential, by the name it is kept under.
 *
 * Every secret this framework reads lives in the environment and nowhere
 * else -- the provider keys, the feed PAT -- and every one of them is named
 * for what it holds. That is the rule this matches, and it is deliberately
 * the whole rule.
 *
 * It was the configuration's `api_key_env` list first, and that was wrong in
 * the one direction that matters: reading a config can FAIL, and a failure
 * there scrubbed nothing at all while saying nothing at all. A transcript is
 * the one record of a run that gets COMMITTED, and D278 found three provider
 * keys sitting in plaintext in a job log. Over-scrubbing costs a reader a
 * line they can get from the ledger; under-scrubbing publishes a key.
 */
const CREDENTIAL_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|PAT|CREDENTIAL)S?$/i;

/**
 * Every credential value this process can see, so a job's bytes can be
 * scrubbed of them.
 *
 * `redact` in `packaging.ts` is the single implementation of the rule and
 * this only feeds it -- including its minimum length, which is what keeps a
 * short, ordinary value from burying the page under redactions.
 */
function machineSecrets(): string[] {
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value !== "" && CREDENTIAL_NAME.test(name)) {
      secrets.push(value);
    }
  }
  return secrets;
}

function scrub(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = redact(out, secret);
  return out;
}

// --- HTML ---------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A job's own bytes, with its colour.
 *
 * The runners' colour is most of why the terminal is worth preserving at
 * all: a failing suite says which assertion failed in red, and a page that
 * stripped the escapes would hand the reader the same text with the one
 * thing they were looking for taken out of it. Only SGR sequences are
 * understood -- foreground colour, bold, and the resets. Everything else a
 * program may write (cursor moves, an alternate screen, a title) is
 * dropped: it is instruction to a terminal and means nothing on a page.
 */
export function ansiToHtml(text: string): string {
  const open: string[] = [];
  let out = "";
  let plain = "";

  const flush = (): void => {
    if (plain !== "") out += escapeHtml(plain);
    plain = "";
  };
  const closeAll = (): void => {
    flush();
    while (open.length > 0) {
      open.pop();
      out += "</span>";
    }
  };

  // `\u001b[` … `m` is a colour; any other final byte is a terminal
  // instruction and is swallowed whole rather than printed as mojibake.
  // eslint-disable-next-line no-control-regex -- ESC is the byte being matched
  const pattern = /\u001b\[([0-9;]*)([A-Za-z])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
  let last = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    plain += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (match[2] !== "m") continue;
    const codes = (match[1] ?? "").split(";").filter((code) => code !== "");
    if (codes.length === 0 || codes[0] === "0") {
      closeAll();
      continue;
    }
    const style = sgrStyle(codes);
    if (style === null) continue;
    flush();
    open.push(style);
    out += `<span style="${style}">`;
  }
  plain += text.slice(last);
  closeAll();
  return out;
}

/** The 16 terminal colours, as a page has to spell them. */
const ANSI_COLOURS: readonly string[] = [
  "#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
  "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff",
];

function sgrStyle(codes: readonly string[]): string | null {
  const parts: string[] = [];
  for (let index = 0; index < codes.length; index += 1) {
    const code = Number(codes[index]);
    if (code === 1) parts.push("font-weight:600");
    else if (code === 2) parts.push("opacity:.7");
    else if (code === 3) parts.push("font-style:italic");
    else if (code >= 30 && code <= 37) parts.push(`color:${ANSI_COLOURS[code - 30]}`);
    else if (code >= 90 && code <= 97) parts.push(`color:${ANSI_COLOURS[code - 90 + 8]}`);
    else if (code === 38 && codes[index + 1] === "5") {
      const colour = xterm256(Number(codes[index + 2]));
      if (colour !== null) parts.push(`color:${colour}`);
      index += 2;
    } else if (code === 38 && codes[index + 1] === "2") {
      const [red, green, blue] = codes.slice(index + 2, index + 5).map(Number);
      if ([red, green, blue].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        parts.push(`color:rgb(${red},${green},${blue})`);
      }
      index += 4;
    }
  }
  return parts.length === 0 ? null : parts.join(";");
}

function xterm256(index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 255) return null;
  if (index < 16) return ANSI_COLOURS[index];
  if (index < 232) {
    const steps = [0, 95, 135, 175, 215, 255];
    const offset = index - 16;
    const channel = (value: number): string => String(steps[value]);
    return `rgb(${channel(Math.floor(offset / 36))},${channel(
      Math.floor(offset / 6) % 6,
    )},${channel(offset % 6)})`;
  }
  const grey = 8 + (index - 232) * 10;
  return `rgb(${grey},${grey},${grey})`;
}

/**
 * The page's own styles.
 *
 * Tokens on `:root` for the light palette and the same tokens redefined
 * under `prefers-color-scheme: dark`, so one committed file reads correctly
 * on either kind of screen without a script deciding anything. `body` gets
 * an explicit background for the same reason.
 */
function styles(): string {
  const tokens = (kind: ThemeKind): string =>
    (Object.keys(TONES[kind]) as PaintedTone[])
      .map((tone) => `  --tone-${tone}: ${TONES[kind][tone]};`)
      .join("\n");
  return `
:root {
  --page: #ffffff;
  --ink: #1f1f1f;
  --faint: #e4e4e4;
  --panel: #f6f6f6;
${tokens("light")}
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #1e1e1e;
    --ink: #d4d4d4;
    --faint: #3a3a3a;
    --panel: #252526;
${tokens("dark")}
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 16px 64px;
  background: var(--page);
  color: var(--ink);
  font: 14px/1.6 ui-sans-serif, system-ui, "Segoe UI", sans-serif;
}
main { max-width: 68rem; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2.5rem 0 .75rem; border-bottom: 1px solid var(--faint); padding-bottom: .3rem; }
.stamp { color: var(--tone-muted); font-size: .85rem; margin: 0 0 .25rem; }
.absent { background: var(--panel); border-left: 3px solid var(--tone-warn); padding: .6rem .9rem; margin: 1.25rem 0; }
.absent ul { margin: .35rem 0 0; padding-left: 1.2rem; }
.mono, pre, code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
.lines { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 13px; }
.line { white-space: pre-wrap; word-break: break-word; padding-left: 10.5ch; text-indent: -10.5ch; }
.at { color: var(--tone-muted); }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid var(--faint); vertical-align: top; }
th { color: var(--tone-muted); font-weight: 600; }
details { margin: .5rem 0; }
summary { cursor: pointer; }
pre { background: var(--panel); padding: .75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; }
.stop { border-left: 3px solid var(--tone-bad); background: var(--panel); padding: .6rem .9rem; }
.milestone { color: var(--tone-milestone); }
.good { color: var(--tone-good); }
.warn { color: var(--tone-warn); }
.bad { color: var(--tone-bad); }
.muted { color: var(--tone-muted); }
`.trim();
}

function toned(tone: Tone, text: string): string {
  const escaped = escapeHtml(text);
  return tone === "plain" ? escaped : `<span class="${tone}">${escaped}</span>`;
}

function clockOf(instant: string): string {
  const match = /T(\d\d:\d\d:\d\d)/.exec(instant);
  return match === null ? instant : match[1];
}

/** One framework line, painted by the same grammar the terminal paints it by. */
function renderEvent(event: DriverEvent): string {
  const fields = Object.entries(event.fields ?? {}).map(
    ([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)] as const,
  );
  const asStrings = Object.fromEntries(fields);
  const painted = fields
    .map(
      ([key, value]) =>
        ` ${escapeHtml(key)}=${toned(fieldTone(event.event, key, value), value)}`,
    )
    .join("");
  return (
    `<div class="line"><span class="at">[${escapeHtml(clockOf(event.at))}]</span> ` +
    `${toned(lineTone(event.event, asStrings), event.event)}${painted}</div>`
  );
}

function section(title: string, body: string): string {
  return body === "" ? "" : `<h2>${escapeHtml(title)}</h2>\n${body}`;
}

function table(headings: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return "";
  const head = headings.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("\n");
  return `<table>\n<tr>${head}</tr>\n${body}\n</table>`;
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function renderRounds(rounds: readonly Record<string, unknown>[]): string {
  return table(
    ["Round", "Phase", "Verdict", "Reviewer", "Provider", "Transport", "Findings"],
    rounds.map((round) => {
      const verdict = text(round["verdict"]);
      const findings = Array.isArray(round["findings"]) ? round["findings"].length : 0;
      return [
        escapeHtml(text(round["round"])),
        escapeHtml(text(round["phase"])),
        toned(verdictTone(verdict), verdict),
        // Rows written before the role was renamed carry the old spelling,
        // and archived rows are never rewritten.
        escapeHtml(text(round["reviewer_model"] ?? round["verifier_model"])),
        escapeHtml(text(round["reviewer_provider"] ?? round["verifier_provider"])),
        escapeHtml(text(round["transport"])),
        escapeHtml(String(findings)),
      ];
    }),
  );
}

function renderTestRuns(runs: ReturnType<typeof readRecords>): string {
  return table(
    ["Suite", "Stage", "Outcome", "Duration", "Command"],
    runs.map((row) => [
      escapeHtml(row.suite),
      escapeHtml(row.stage),
      toned(fieldTone("tests", "outcome", row.outcome), row.outcome),
      escapeHtml(row.durationSeconds === null ? "" : `${Math.round(row.durationSeconds)}s`),
      `<span class="mono">${escapeHtml(row.command)}</span>`,
    ]),
  );
}

function renderJobs(jobs: readonly JobReading[], secrets: readonly string[]): string {
  if (jobs.length === 0) return "";
  return jobs
    .map((job) => {
      const heading =
        `<strong>${escapeHtml(job.name)}</strong> ` +
        `exit ${toned(fieldTone("job-finished", "exit", job.exit), job.exit)}`;
      if (job.output === "") {
        return `<div>${heading} <span class="muted">(output not carried)</span></div>`;
      }
      return (
        `<details><summary>${heading}</summary>\n` +
        `<pre>${ansiToHtml(scrub(job.output, secrets))}</pre></details>`
      );
    })
    .join("\n");
}

function renderStopBlock(run: DriverRun | null): string {
  const stop = run?.stop ?? null;
  if (stop === null) return "";
  return (
    `<div class="stop"><strong>${escapeHtml(stop.kind)}</strong>` +
    `${stop.code ? ` / ${escapeHtml(stop.code)}` : ""} ` +
    `<span class="at">at ${escapeHtml(stop.at)}</span>` +
    `<div>${escapeHtml(stop.reason)}</div></div>`
  );
}

function headCommit(repoRoot: string): string {
  const result = runGit(repoRoot, ["rev-parse", "HEAD"]);
  return result.code === 0 && result.stdout !== "" ? result.stdout : "unknown";
}

// --- The document -------------------------------------------------------------

/**
 * One session's transcript, as one self-contained HTML document.
 *
 * Never throws for a session that left little behind: what is missing is
 * listed on the page under its own heading, because a reader who cannot
 * tell "this session had no verification round" from "this session's ledger
 * is gone" has been told nothing by the omission.
 */
export function renderSessionTranscript(
  repoRoot: string,
  sessionNumber: number,
  options: TranscriptOptions = {},
): string {
  const carry: JobCarry = options.jobs ?? "failed";
  const reading = readSession(repoRoot, sessionNumber, carry);
  const secrets = machineSecrets();
  const renderedAt = options.renderedAt ?? new Date().toISOString();
  const title = `Session ${String(sessionNumber).padStart(3, "0")} transcript`;

  const absent =
    reading.absent.length === 0
      ? ""
      : `<div class="absent">This session left no:\n<ul>${reading.absent
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul></div>`;

  const steps = (reading.run?.accepted_steps ?? [])
    .map((step) => `<code>${escapeHtml(step)}</code>`)
    .join(", ");

  const body = [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="stamp">Rendered ${escapeHtml(renderedAt)} by dabbler-ai-router ${escapeHtml(
      VERSION,
    )} at ${escapeHtml(headCommit(repoRoot))}.</p>`,
    reading.run === null
      ? ""
      : `<p class="stamp">Engine ${escapeHtml(text(reading.run.engine))}, ` +
        `last phase ${toned("milestone", text(reading.run.phase))}, ` +
        `started ${escapeHtml(text(reading.run.started_at))}.</p>`,
    absent,
    section("Where it stopped", renderStopBlock(reading.run)),
    section(
      "What the framework said",
      reading.events.length === 0
        ? ""
        : `<div class="lines">${reading.events.map(renderEvent).join("\n")}</div>`,
    ),
    section("Verification", renderRounds(reading.rounds)),
    section("Test runs", renderTestRuns(reading.testRuns)),
    section("Steps accepted", steps === "" ? "" : `<p>${steps}</p>`),
    section("Jobs", renderJobs(reading.jobs, secrets)),
  ]
    .filter((part) => part !== "")
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${styles()}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}
