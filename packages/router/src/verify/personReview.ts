// A person's review of a session's work: the one verdict the loop does not
// produce, and the one reader who is not paid by the token.
//
// Every way on at a verification stop used to cost a model call -- another
// round, an adjudication -- or leave the session out of every release. A
// person who has read the work can judge it, and this verb lets them, on the
// record: the row names who reviewed, why they accepted it, and the tree they
// read. It is refused to an engine, because the incident the closed verdict
// vocabulary exists against was an engine writing its own verdict, and the
// answer to that is that only a person may write this one.
//
// Without --reason it shows the person what a reviewer would be shown and
// changes nothing. With it, it records -- in flight at a verification stop,
// or on a closed session that ended at the cap unverified.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { writeErr, writeOut } from "../output.ts";
import { SESSION_PLAN_FILENAME, STATE_FILENAME, planSection, repoRootFor, runGit } from "../evidence.ts";
import { nowIso, snapshotWorktreeTree } from "../journal.ts";
import { LedgerError, ROW_PERSON_REVIEW, appendRound, readRounds, type Row } from "../ledger.ts";
import { readSessionState, sessionDisplayNumber } from "../progress.ts";
import { readDriverEvents, readRun } from "../driver.ts";
import { findingResponse } from "../transcript.ts";
import { TERMINAL_HEADLINES, VERDICT_REVIEWED_BY_PERSON, VERDICT_VERIFIED } from "../verdict.ts";
import {
  recordAmendment,
  recordClosedSessionVerified,
  recordSessionVerification,
  reviewableAfterClose,
} from "../writers.ts";
import { EXIT_OK, EXIT_STATE, EXIT_USAGE } from "./errors.ts";
import { headCommit } from "./rounds.ts";

export interface PersonReviewOptions {
  /** A closed session's number; absent for the session in flight. */
  readonly sessionNumber: number | null;
  /** Why the person accepts the work; absent, the card is printed and nothing changes. */
  readonly reason: string | null;
  /** The caller is an engine: the verb is refused it. */
  readonly engine: boolean;
}

/** The session the review is of, once every refusal has had its say. */
interface Target {
  readonly number: number;
  readonly closed: boolean;
  readonly record: Row;
  readonly rounds: Row[];
}

const PREFIX = "verify person-review";

/** The person's name as git knows it, or null: a review nobody signed is not one. */
function reviewerName(repoRoot: string): string | null {
  const name = runGit(repoRoot, ["config", "user.name"]);
  const value = name.code === 0 ? name.stdout.trim() : "";
  return value === "" ? null : value;
}

/** The session the review is of, or the refusal that says why there is none. */
function resolveTarget(sessionsDir: string, repoRoot: string, closedNumber: number | null): Target | string {
  const state = readSessionState(sessionsDir);
  const sessions = Array.isArray(state?.["sessions"]) ? (state["sessions"] as Row[]) : [];
  const current = state?.["currentSession"];
  if (closedNumber === null) {
    if (current === null || current === undefined) {
      return `no session is in flight under ${sessionsDir}. A closed session is named: --session-number <N>`;
    }
    const number = current as number;
    const stop = readRun(repoRoot, number)?.stop ?? null;
    if (stop === null || stop.kind !== "verification") {
      return (
        `session ${sessionDisplayNumber(number)} does not stand at a verification stop, so there is no ` +
        "review owed that a person may give. Rounds run first; a person's review is a way on from a stop."
      );
    }
    const record = sessions.find((row) => row["number"] === number) ?? {};
    // A person's review never replaces the Primary Reviewer's VERIFIED: it
    // is a way on where no accepted verdict stands, not a second opinion
    // over one. A tree that moved after a VERIFIED round is reviewed again
    // by a round, which `verify reopen` buys.
    if (record["verificationVerdict"] === VERDICT_VERIFIED) {
      return (
        `session ${sessionDisplayNumber(number)} is VERIFIED by the Primary Reviewer, and a person's review ` +
        "never replaces that verdict: what changed since is reviewed by a round, which the stop's other ways on reach"
      );
    }
    return { number, closed: false, record, rounds: readRounds(repoRoot, number) };
  }
  if (current !== null && current !== undefined) {
    return (
      `session ${String(current)} is in flight, and a closed session is reviewed only when none is. ` +
      "Run it again once that session closes."
    );
  }
  const record = sessions.find((row) => row["number"] === closedNumber);
  const rounds = record === undefined ? [] : readRounds(repoRoot, closedNumber);
  const verdict = record?.["verificationVerdict"];
  if (record === undefined || record["status"] !== "complete" || !reviewableAfterClose(verdict, rounds.at(-1))) {
    const found =
      record === undefined
        ? "there is no such session"
        : record["status"] !== "complete"
          ? `its status is ${String(record["status"])}`
          : `its verdict is ${verdict === undefined || verdict === null ? "none" : String(verdict)}`;
    return (
      `session ${closedNumber} cannot be reviewed after its close: ${found}. Only a session that closed ` +
      "at the cap unverified -- REMEDIATED_AT_CAP, or ISSUES_FOUND short of an adjudication -- can."
    );
  }
  return { number: closedNumber, closed: true, record, rounds };
}

/** What the session changed, as a diffstat, and the command that shows all of it. */
function changeLines(repoRoot: string, target: Target): string[] {
  const start = target.record["startCommit"];
  if (typeof start !== "string" || start === "") return ["   The record does not say where the session started."];
  let range: string[] = [start];
  if (target.closed) {
    const landed = runGit(repoRoot, ["log", "-1", "--format=%H", "-E", `--grep=^Session ${target.number}: `, "HEAD"]);
    const commit = landed.code === 0 ? landed.stdout.trim() : "";
    const touched = commit === "" ? null : runGit(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit]);
    const paths = (touched?.stdout ?? "").split("\0").filter((path) => path.trim() !== "");
    if (paths.length === 0) return [`   No commit on this branch is session ${target.number}'s own, so what it changed cannot be read.`];
    range = [start, "HEAD", "--", ...paths];
  }
  const stat = runGit(repoRoot, ["diff", "--stat", ...range]);
  const shown = stat.code === 0 && stat.stdout.trim() !== "" ? stat.stdout.trimEnd().split(/\r?\n/) : ["(nothing)"];
  // `git diff` never shows a file git does not track, and a session's new
  // files are usually that until the land commits them: they are listed
  // whole, so nothing the person signs for is out of sight.
  const untracked = target.closed ? [] : untrackedFiles(repoRoot);
  return [
    ...shown.map((line) => `   ${line}`),
    ...(untracked.length === 0
      ? []
      : [
          "",
          "   New files git does not track yet, which `git diff` does not show:",
          ...untracked.map((path) => `     ${path} | ${newFileSize(repoRoot, path)}`),
        ]),
    "",
    "   The whole change:",
    `     git diff ${range.join(" ")}`,
    // `--no-index` against the empty file shows a new file as a diff, every
    // line of it, and reads nothing into the index.
    ...untracked.map((path) => `     git diff --no-index -- /dev/null ${path}`),
  ];
}

/** A new file's size as the diffstat would give it, in lines. */
function newFileSize(repoRoot: string, path: string): string {
  try {
    const text = readFileSync(join(repoRoot, ...path.split("/")), "utf8");
    const lines = text === "" ? 0 : text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);
    return `${lines} line(s), new`;
  } catch {
    return "new, and could not be read here";
  }
}

/** The working tree's new files, outside what git ignores. */
function untrackedFiles(repoRoot: string): string[] {
  const listed = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return listed.code === 0 ? listed.stdout.split("\0").filter((path) => path.trim() !== "") : [];
}

/** A finding as the reviewer wrote it: every line, and each field it declared. */
function findingDetail(finding: Row): string[] {
  const lines = String(finding["description"] ?? "").split(/\r?\n/).map((line) => `        ${line}`);
  for (const [label, key] of [
    ["Failure scenario", "failureScenario"],
    ["Acceptance criterion", "acceptanceCriterion"],
  ] as const) {
    if (typeof finding[key] === "string" && finding[key] !== "") lines.push(`        ${label}: ${String(finding[key])}`);
  }
  const paths = finding["evidencePaths"];
  if (Array.isArray(paths) && paths.length > 0) lines.push(`        Cited: ${paths.map(String).join(", ")}`);
  return lines;
}

/** Every round, and every finding with how the author answered it. */
function roundLines(repoRoot: string, target: Target): string[] {
  if (target.rounds.length === 0) return ["   No round has run."];
  const events = readDriverEvents(repoRoot, target.number);
  const lines: string[] = [];
  for (const row of target.rounds) {
    const who = row["reviewed_by"] ?? row["reviewer_model"] ?? row["verifier_model"];
    const what = typeof row["type"] === "string" ? row["type"] : String(row["phase"] ?? "round");
    lines.push(`   Round ${String(row["round"])} (${what}): ${String(row["verdict"])}${who === undefined ? "" : `, ${String(who)}`}`);
    const findings = Array.isArray(row["findings"]) ? (row["findings"] as Row[]) : [];
    findings.forEach((finding, index) => {
      const blocking = finding["blocking"] === true ? ", blocking" : "";
      lines.push(`     ${index}. [${String(finding["severity"])}${blocking}]`);
      lines.push(...findingDetail(finding));
      lines.push(`        Answered: ${findingResponse(Number(row["round"]), index, events, target.rounds)}`);
    });
  }
  return lines;
}

/** What a reviewer would be shown, for a person. Changes nothing. */
function printCard(sessionsDir: string, repoRoot: string, target: Target, who: string): number {
  let plan = "";
  try {
    plan = readFileSync(join(sessionsDir, SESSION_PLAN_FILENAME), "utf8");
  } catch {
    plan = "";
  }
  const section = planSection(plan, target.number);
  const shown = sessionDisplayNumber(target.number);
  const flag = target.closed ? ` --session-number ${target.number}` : "";
  writeOut(
    [
      `${PREFIX}: what a reviewer of session ${shown} would be shown. Nothing has changed.`,
      "",
      "1. The session's section of the session plan:",
      ...(section === null ? ["   (the plan has no section for it)"] : section.split(/\r?\n/).map((line) => `   ${line}`)),
      "",
      `2. What the session changed${target.closed ? ", as the trunk holds it now" : ", in the working tree"}:`,
      ...changeLines(repoRoot, target),
      "",
      "3. Every round's findings, and what the author did about each:",
      ...roundLines(repoRoot, target),
      "",
      `4. What the record will say: ${VERDICT_REVIEWED_BY_PERSON}, ${TERMINAL_HEADLINES[VERDICT_REVIEWED_BY_PERSON]}, ` +
        `by ${who}, with your reason and the tree you reviewed. A release accepts it as it accepts VERIFIED, ` +
        "and every view says a person reviewed it, and who.",
      "",
      `To record your review: dabbler verify person-review${flag} --reason "<why>". To decide nothing, do nothing.`,
      "",
    ].join("\n"),
  );
  return EXIT_OK;
}

/** The person_review row, validated by the ledger as it is appended. */
function reviewRow(repoRoot: string, rounds: readonly Row[], tree: string, who: string, reason: string): Row {
  const last = rounds.at(-1);
  const round = last === undefined ? 1 : Number(last["round"]) + 1;
  return {
    round,
    type: ROW_PERSON_REVIEW,
    verdict: VERDICT_REVIEWED_BY_PERSON,
    blocking: false,
    findings: [],
    completion_tree: tree,
    ...(last === undefined ? {} : { previous_tree: String(last["completion_tree"]) }),
    head_commit: headCommit(repoRoot),
    reviewed_by: who,
    reason,
    recorded_at: nowIso("microseconds"),
  };
}

/**
 * What `sessions.json` keeps of the review: who, why, and the tree they read.
 * The rounds ledger lives under `.dabbler/`, which never travels, so this is
 * the copy a second checkout -- and the release it starts -- can read.
 */
function reviewSummary(row: Row): Record<string, unknown> {
  return {
    rounds: row["round"],
    reviewedBy: row["reviewed_by"],
    reason: row["reason"],
    reviewedTree: row["completion_tree"],
  };
}

/** Record the review of the session in flight, which stands at a verification stop. */
function recordInFlight(sessionsDir: string, repoRoot: string, target: Target, who: string, reason: string): number {
  const tree = snapshotWorktreeTree(repoRoot);
  if (tree === null) {
    writeErr(`${PREFIX}: refused -- the working tree could not be read, so there is no tree to say you reviewed; try again.\n`);
    return EXIT_STATE;
  }
  const last = target.rounds.at(-1);
  if (last?.["type"] === ROW_PERSON_REVIEW && last["completion_tree"] === tree) {
    writeErr(
      `${PREFIX}: refused -- ${String(last["reviewed_by"])} already reviewed this tree at round ` +
        `${String(last["round"])}, and a review is recorded once. Carry on with \`dabbler session next\`.\n`,
    );
    return EXIT_USAGE;
  }
  const row = reviewRow(repoRoot, target.rounds, tree, who, reason);
  appendRound(repoRoot, target.number, row);
  recordSessionVerification(sessionsDir, target.number, VERDICT_REVIEWED_BY_PERSON, reviewSummary(row));
  recordAmendment(sessionsDir, {
    sessionNumber: target.number,
    what: `reviewed by a person at round ${String(row["round"])}: ${VERDICT_REVIEWED_BY_PERSON}`,
    reason,
    by: who,
  });
  writeOut(
    `${PREFIX}: session ${sessionDisplayNumber(target.number)} is ${TERMINAL_HEADLINES[VERDICT_REVIEWED_BY_PERSON]}, ` +
      `${who}: ${reason}\n` +
      "The verdict is REVIEWED_BY_PERSON, held to the tree you reviewed: a change after this needs a review of its own. " +
      `Carry on with \`dabbler session next --sessions-dir ${sessionsDir}\`.\n`,
  );
  return EXIT_OK;
}

/** Record the review of a closed session, and commit and push its state as the close does. */
function recordClosed(sessionsDir: string, repoRoot: string, target: Target, who: string, reason: string): number {
  const tree = runGit(repoRoot, ["rev-parse", "HEAD^{tree}"]).stdout.trim();
  if (tree === "") {
    writeErr(`${PREFIX}: refused -- HEAD's tree could not be read, so there is no tree to say you reviewed.\n`);
    return EXIT_STATE;
  }
  const row = reviewRow(repoRoot, target.rounds, tree, who, reason);
  appendRound(repoRoot, target.number, row);
  recordClosedSessionVerified(sessionsDir, target.number, reviewSummary(row), VERDICT_REVIEWED_BY_PERSON);
  writeOut(
    `${PREFIX}: session ${target.number} is ${TERMINAL_HEADLINES[VERDICT_REVIEWED_BY_PERSON]}, ${who}: ${reason}\n` +
      `Its verdict is now ${VERDICT_REVIEWED_BY_PERSON}, which a release accepts.\n`,
  );
  const stateFile = join(sessionsDir, STATE_FILENAME);
  const committed = runGit(repoRoot, [
    "commit",
    "-m",
    `Session ${target.number} of ${basename(sessionsDir)} reviewed by ${who} after its close`,
    "--",
    stateFile,
  ]);
  if (committed.code !== 0) {
    writeErr(`${PREFIX}: the verdict is written but the commit failed: ${committed.stderr}\n`);
    return EXIT_STATE;
  }
  if (!existsSync(join(repoRoot, ".dabbler", "local-only"))) {
    const pushed = runGit(repoRoot, ["push"]);
    if (pushed.code !== 0) {
      writeErr(`${PREFIX}: the verdict is written and committed but the push failed: ${pushed.stderr}. Run \`git push\`.\n`);
      return EXIT_STATE;
    }
  }
  return EXIT_OK;
}

/**
 * A person's review: the card without a reason, the record with one.
 */
export function runPersonReview(sessionsDir: string, options: PersonReviewOptions): number {
  if (options.engine) {
    writeErr(
      `${PREFIX}: refused -- \`verify person-review\` is a person's verb, never the engine's: it records ` +
        "a person's own review of the work, and an engine cannot be that person. Report the step blocked " +
        "and say why; a person runs it at a terminal of their own.\n",
    );
    return EXIT_USAGE;
  }
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) {
    writeErr(`${PREFIX}: not inside a git repository: ${sessionsDir}\n`);
    return EXIT_STATE;
  }
  const who = reviewerName(repoRoot);
  if (who === null) {
    writeErr(
      `${PREFIX}: refused -- git has no user.name here, and a review is signed by the person who gave it. ` +
        'Set it: git config user.name "<your name>"\n',
    );
    return EXIT_USAGE;
  }
  const reason = options.reason?.trim() ?? null;
  if (options.reason !== null && reason === "") {
    writeErr(`${PREFIX}: refused -- a review carries a reason: say why you accept the work.\n`);
    return EXIT_USAGE;
  }
  try {
    const target = resolveTarget(sessionsDir, repoRoot, options.sessionNumber);
    if (typeof target === "string") {
      writeErr(`${PREFIX}: refused -- ${target}\n`);
      return EXIT_USAGE;
    }
    if (reason === null) return printCard(sessionsDir, repoRoot, target, who);
    return target.closed
      ? recordClosed(sessionsDir, repoRoot, target, who, reason)
      : recordInFlight(sessionsDir, repoRoot, target, who, reason);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`${PREFIX}: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  }
}
