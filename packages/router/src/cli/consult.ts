// `dabbler consult` -- what an AI opened to consult reads before anything
// else. With `--mechanic`, what a fresh instance brought in to unblock a
// stopped session reads instead.
//
// It changes nothing and bills nothing. Every fact in it is read from
// `buildProjection`, the reading `dabbler status` prints, so the brief and
// the Work Explorer cannot disagree about where a repository is.
//
// Plan edits are permitted only while no session is in progress:
// `session-plan.md` is not ledger bookkeeping, so an edit made while a step's
// checks run moves the tree they prove, and one made between instructions is
// counted in the step's change set and lands in that session's diff.

import "../approvedPlan.ts";
import {
  SESSION_PLAN_FILENAME,
  SessionsRootNotFoundError,
  repoRootFromSessionsDir,
  resolveSessionsDir,
} from "../evidence.ts";
import { readRun, renderStop } from "../driver.ts";
import type { DriverRun } from "../generated/index.ts";
import { latestRound, readPackaging } from "../ledger.ts";
import { buildProjection, readSessionState } from "../progress.ts";
import { writeErr, writeOut } from "./output.ts";
import { statSync } from "node:fs";
import { basename, relative } from "node:path";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const PROJECT_PLAN_FILENAME = "project-work-plan.md";

function usage(): string {
  return [
    "usage: dabbler consult [-h] [--sessions-dir SESSIONS_DIR] [--session N] [--mechanic [--memo PATH]]",
    "",
    "Print the brief an AI opened to consult reads first. Changes nothing.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --sessions-dir SESSIONS_DIR",
    "                        the repository's sessions root; derived from the",
    "                        working directory when omitted",
    "  --session N           the session the consult is about",
    "  --mechanic            brief a fresh instance to unblock the session in",
    "                        flight: its stop, the record, the rules, and the",
    "                        Mechanic's instructions",
    "  --memo PATH           with --mechanic: the framework called it in without",
    "                        the person -- the unattended mandate, and the memo",
    "                        it leaves at PATH for the person",
    "",
  ].join("\n");
}

type Row = Record<string, unknown>;

/** The blocked task row's words: the router's one rendering of a standing stop. */
function standingStop(session: Row): string | null {
  const tasks = Array.isArray(session["tasks"]) ? (session["tasks"] as Row[]) : [];
  const blocked = tasks.find((task) => task["state"] === "blocked");
  return blocked === undefined ? null : String(blocked["intent"]);
}

function describeSession(session: Row): string[] {
  const lines = [`- Session ${String(session["number"])}, "${String(session["title"])}": ${String(session["status"])}.`];
  const stop = standingStop(session);
  if (stop === null) return lines;
  const actor = String(session["stopActor"] ?? "operator");
  // Carrying on is said, to the AI, by the person: there is no button for it.
  const resume =
    actor === "engine"
      ? "the AI working the session clears this stop by answering again"
      : "ask the AI working the session to run `dabbler session next` to carry on";
  lines.push(
    `- It is stopped. ${stop}`,
    `- Stopped for: ${actor}.`,
    "- The forward exits: `dabbler verify reopen --rounds N --reason \"<why>\"` for a spent " +
      "verification cap; `dabbler session plan amend --step <id> ... --reason \"<why>\"` for a " +
      `step's files or checks; ${resume}.`,
    "- `dabbler session cancel --force` is the person's verb only. Never run it; name it to them if it is the way.",
  );
  return lines;
}

/** The brief, as the text `dabbler consult` prints. */
export function consultBrief(sessionsDir: string, session?: number): string {
  const projection = buildProjection(sessionsDir);
  const repository = projection["repository"] as Row;
  const sessions = (projection["sessions"] as Row[]).filter((row) => Number.isInteger(row["number"]));
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const root = (relative(repoRoot, sessionsDir) || ".").split("\\").join("/");
  const current = repository["currentSession"] as number | null;
  const nextFree = sessions.reduce((max, row) => Math.max(max, row["number"] as number), 0) + 1;

  const now: string[] = [];
  if (current === null) {
    now.push(`- No session is in progress. ${String(repository["sessionsCompleted"])} of ${sessions.length} are complete.`);
  } else {
    const row = sessions.find((entry) => entry["number"] === current);
    if (row !== undefined) now.push(...describeSession(row));
  }
  if (session !== undefined && session !== current) {
    const row = sessions.find((entry) => entry["number"] === session);
    now.push(row === undefined ? `- There is no session ${session}.` : `- Asked about: session ${session}, "${String(row["title"])}": ${String(row["status"])}.`);
  }

  const planEdits =
    current === null
      ? "- Edit and commit the plan files when asked. No session is in progress, so an edit disturbs nothing."
      : `- Do NOT edit the plan files now. Session ${current} is in progress: an edit moves the tree its ` +
        "checks prove and lands in its diff. Draft the text in the chat, and write it once the session has closed.";

  return [
    `# Consult brief -- ${basename(repoRoot)}`,
    "",
    "You were opened to consult, not to orchestrate: run no waiter, start no session, answer no instruction.",
    "",
    "## Where things are",
    `- Sessions root: ${root}/`,
    `- ${root}/${SESSION_PLAN_FILENAME}: the session plan, prose.`,
    `- ${root}/${PROJECT_PLAN_FILENAME}: the project's work plan, prose.`,
    `- ${root}/sessions.json, activity-log.json, change-log.md, decisions-log.md: the router's alone.`,
    "- .dabbler/runs/s<N>/ (driver/run.json carries a session's phase and stop): the router's alone.",
    "- `dabbler status --sessions-dir " + root + "` prints the full reading this brief is taken from.",
    "",
    "## What is true now",
    ...now,
    "",
    "## How to plan a session",
    `- The next free number is ${nextFree}.`,
    "- Each session is a section headed `### Session <N> of <M>: <Title>`, M being the total, followed by " +
      "`Scope:`, then **Why.**, **What.**, **Non-goals.**, **Tests.** and **Releasable.** paragraphs. Read the last " +
      "section of the plan for the shape.",
    "- A planned session is committed as a plain commit, for a person to review.",
    "",
    "## The licence",
    "- Answer questions and read anything.",
    planEdits,
    "- Every file this consult changes is committed and pushed before the consultation ends, never left in " +
      "the tree: Start Session refuses a tree with uncommitted changes.",
    "- Change no code, no record under .dabbler/ or the router's files, and no verdict.",
    "- Work that changes code, including a fix the framework needs to clear a stop, becomes a planned session -- never your own edit.",
    "",
  ].join("\n");
}

/**
 * The Mechanic's two instructions, verbatim from the session plan that
 * made it: the whole of its licence beyond the rules above them. The log
 * is under the sessions root, wherever that is.
 */
export function mechanicInstructions(root: string): readonly [string, string] {
  return [
    "Diagnose, recommend, and act only when the person agrees.",
    `Make the minimum viable unblocking fix and record it in \`${root}/mechanic-log.md\`.`,
  ];
}

/** A record row as one line, cut where a round's findings would fill the screen. */
function rowLine(row: Record<string, unknown>): string {
  const text = JSON.stringify(row);
  return text.length > ROW_WIDTH ? `${text.slice(0, ROW_WIDTH)}...` : text;
}

const ROW_WIDTH = 600;

/**
 * The rows the stops after the steps rest on, quoted from the ledger: the
 * latest verification round and the latest packaging run. A step's own stop
 * rests on its reason, which the brief already quotes.
 */
function recordRows(repoRoot: string, session: number): string[] {
  const round = latestRound(repoRoot, session);
  const packaging = readPackaging(repoRoot, session).at(-1);
  return [
    `- Latest verification round: ${round === null ? "none recorded." : rowLine(round)}`,
    `- Latest packaging run: ${packaging === undefined ? "none recorded." : rowLine(packaging)}`,
  ];
}

/**
 * The brief `dabbler consult --mechanic` prints: one screen a fresh
 * instance can act on for the session in flight. The stop is quoted from
 * the run record and rendered by the router's one rendering of a stop, so
 * the Mechanic reads what the author and the terminal were shown.
 */
/**
 * What an unattended Mechanic may not do: the person's authority, as a
 * deny-list rather than a list of problem kinds, because a list of kinds can
 * only hold the walls somebody anticipated.
 */
export const UNATTENDED_DENIED = [
  "cancel, rollback, close or hold-release the session",
  "change the session plan or what counts as done",
  "make a significant design choice or add a dependency the plan did not approve",
  "touch credentials, spend money, or reach anything outside this repository",
  "weaken a test or a gate",
  "write the record or a verdict",
] as const;

/**
 * The brief's licence. Attended, the person agrees before anything is done;
 * unattended -- the framework called it in -- it fixes within the deny-list
 * and hands back what it may not fix, always with a memo.
 */
function mandateLines(root: string, memoPath: string | null): string[] {
  if (memoPath === null) {
    return [
      "- A person's verbs are theirs: recommend them and let the person type them -- " +
        '`dabbler session hold-release --reason "<why>"`, `dabbler session cancel --force --reason "<why>"`.',
      "- Once the person agrees you may run `dabbler verify reopen --rounds N --reason \"<why>\"`, " +
        "`dabbler session plan amend ... --reason \"<why>\"`, and ordinary file edits.",
      "- Commit nothing and push nothing: leave the fix and its log entry in the working tree. The framework takes " +
        "an uncommitted change as the fix, has the Primary Reviewer review it with the session's diff, and lands it.",
      "- When the fix is in, the person asks the author to run `dabbler session next`: the framework takes the change from there.",
      "",
      "## Your instructions",
      ...mechanicInstructions(root).map((instruction) => `- ${instruction}`),
    ];
  }
  return [
    "- The framework called you in without the person, and the person's authority stays theirs. You may not:",
    ...UNATTENDED_DENIED.map((denied) => `  - ${denied};`),
    "- Anything else that gets the session moving again is yours to do, as the minimum. A fix that needs any of " +
      "the above is diagnosed and handed back: make no edit, and say in the memo what the person must decide.",
    "- Commit nothing and push nothing, and run no waiter: leave the fix and its log entry in the working tree. " +
      "When you exit, the framework carries on; the Primary Reviewer reviews the fix with the session's diff, and " +
      "a fix that does not clear the stop is undone.",
    "",
    "## Your instructions",
    `- Make the minimum viable unblocking fix and record it in \`${root}/mechanic-log.md\`, with a stated reason ` +
      "why it keeps to the approved plan.",
    `- Always end by writing a memo to \`${memoPath}\` for the person: the cause and its evidence, what you tried, ` +
      "the line it reached, and one recommendation -- with the `dabbler session plan amend ... --reason \"<why>\"` " +
      "drafted for them to approve where the plan needs one.",
  ];
}

export function mechanicBrief(sessionsDir: string, options: { memoPath?: string } = {}): string {
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const root = (relative(repoRoot, sessionsDir) || ".").split("\\").join("/");
  const current = readSessionState(sessionsDir)?.["currentSession"];
  const head = [
    `# Mechanic brief -- ${basename(repoRoot)}`,
    "",
    "You were opened as the Mechanic: a fresh instance, brought in because the session in flight is stuck. " +
      "You are not its author and not its reviewer, and you drive nothing: run no waiter and answer no instruction.",
    "",
  ];
  if (typeof current !== "number") {
    return [...head, "No session is in flight, so there is nothing to unblock. Run `dabbler consult` instead.", ""].join("\n");
  }
  const run = readRun(repoRoot, current);
  const runDir = `.dabbler/runs/s${current}`;
  const stop: string[] = [];
  if (run === null) {
    stop.push(`- Session ${current} has no run record yet: nothing has stopped it.`);
  } else if ((run.stop ?? null) === null) {
    stop.push(`- Session ${current} is in phase '${run.phase}' and no stop stands. Read \`dabbler status\` for who it is waiting on.`);
  } else {
    const record = run.stop as NonNullable<DriverRun["stop"]>;
    const words = renderStop(record, run);
    stop.push(
      `- Session ${current} stopped in phase '${run.phase}'` +
        `${record.step_id ? ` at step '${record.step_id}'` : ""}: kind '${record.kind}'` +
        `${record.code ? `, code '${record.code}'` : ""}.`,
      `- The rule that refused, in its own words: ${record.reason}`,
      `- ${words.next}${words.ways}`,
    );
    const history = run.stop_history ?? [];
    if (history.length > 1) {
      stop.push(`- Earlier stops on this run: ${history.slice(0, -1).map((row) => `${row.kind} at ${row.at}`).join("; ")}.`);
    }
    const rewinds = run.rewinds ?? [];
    if (rewinds.length > 0) {
      stop.push(`- Rewinds already made: ${rewinds.map((row) => `to '${row.to}' for ${row.reason}`).join("; ")}.`);
    }
    stop.push("", "## The record rows it rests on", ...recordRows(repoRoot, current));
  }
  return [
    ...head,
    "## The stop",
    ...stop,
    "",
    "## Where the record is",
    `- ${runDir}/driver/run.json: the phase, the stop and its history. instruction.json: what the author was last asked.`,
    `- ${runDir}/driver/loop.log and supervision.jsonl: what the framework did, in order. ${runDir}/jobs/: each job's own log.`,
    `- ${runDir}/driver/transcripts/: the engine's words where the framework invoked it; under the pull the author's ` +
      "conversation is in the person's own CLI, and the person can paste from it.",
    `- ${root}/session-plan.md: what the session set out to do. \`dabbler status --sessions-dir ${root}\`: the full reading.`,
    "",
    "## The rules that keep the session restartable",
    `- Never write under .dabbler/runs/, ${root}/sessions.json or any other record the router writes.`,
    "- Never weaken a gate, a verdict or a test so that it passes.",
    ...mandateLines(root, options.memoPath ?? null),
    "- The minimum is the smallest change that lets the regular framework processes continue and keeps the " +
      "author's work successful as is, at least in large part; the entry says what was done and why.",
    "",
  ].join("\n");
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function consultVerb(argv: string[]): Promise<number> {
  let explicit: string | undefined;
  let session: number | undefined;
  let mechanic = false;
  let memo: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--mechanic") {
      mechanic = true;
      continue;
    }
    if (token === "--sessions-dir" || token === "--session" || token === "--memo") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        writeErr(`dabbler consult: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      index += 1;
      if (token === "--memo") {
        memo = next;
        continue;
      }
      if (token === "--sessions-dir") {
        explicit = next;
        continue;
      }
      if (!/^[1-9]\d*$/.test(next) || !Number.isSafeInteger(Number(next))) {
        writeErr(`dabbler consult: argument --session: not a session number: ${next}\n`);
        return EXIT_USAGE;
      }
      session = Number(next);
      continue;
    }
    writeErr(`dabbler consult: unrecognized argument: ${token}\n\n${usage()}`);
    return EXIT_USAGE;
  }

  if (memo !== undefined && !mechanic) {
    writeErr("dabbler consult: --memo is the unattended Mechanic's, and needs --mechanic\n");
    return EXIT_USAGE;
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(explicit);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`consult: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (!isDirectory(sessionsDir)) {
    writeErr(`consult: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  writeOut(mechanic ? mechanicBrief(sessionsDir, memo === undefined ? {} : { memoPath: memo }) : consultBrief(sessionsDir, session));
  return EXIT_OK;
}
