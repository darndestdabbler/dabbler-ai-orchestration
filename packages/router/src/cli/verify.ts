// `dabbler verify …` -- the cross-provider verification loop's command line.
//
// Eight commands share one entry point: the bare round, `dispute`,
// `adjudicate`, `prepare`, `reanchor`, `reopen`, `person-review` and `step`.
// A ninth, `waive`, exists only to be refused by name -- a person's review
// replaces it, and "invalid choice" would read like an oversight rather than
// a decision.

import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { VALID_TRANSPORTS } from "../config.ts";
import {
  EXIT_OK,
  EXIT_USAGE,
} from "../verify/errors.ts";
import { recordDispute, runAdjudication } from "../verify/disputes.ts";
import { runPrepare } from "../verify/prepare.ts";
import { runReanchor } from "../verify/reanchor.ts";
import { reviewClosedSession, runReopen } from "../verify/reopen.ts";
import { runPersonReview } from "../verify/personReview.ts";
import { personIsPresent } from "../session.ts";
import { APPROVER_FLAG, APPROVER_GONE } from "./session.ts";
import { runRound } from "../verify/rounds.ts";
import {
  runStepAmend,
  runStepClose,
  runStepGuardCommit,
  runStepOpen,
  runStepStatus,
} from "../verify/steps.ts";
import { writeErr, writeOut } from "./output.ts";

/** `--flag value`, `--flag=value`, repeatable flags, and the bare switches. */
interface Parsed {
  readonly values: Map<string, string>;
  readonly repeated: Map<string, string[]>;
  readonly switches: Set<string>;
  readonly positional: string[];
}

const REPEATABLE = new Set(["--evidence", "--add-file"]);
const SWITCHES = new Set(["-h", "--help"]);

/**
 * Which flags each command takes, so an unknown one is refused rather than
 * dropped -- and an abbreviated one is resolved rather than refused.
 *
 * argparse does BOTH, and the port has to do both or it is drift in one of
 * two directions. It errors on an unrecognized argument, which is the
 * behaviour worth keeping: `--max-rnds` would otherwise run the loop at the
 * DEFAULT cap while the operator believed they had lowered it, and nothing
 * in the record would say the flag was ignored. It also accepts any
 * unambiguous prefix, so `--max-round` IS `--max-rounds` on the Python side
 * -- and a router that refused it would turn a working command line into an
 * error for the same words.
 */
function resolveFlag(
  name: string,
  allowed: readonly string[],
): { name: string } | { error: string } {
  if (allowed.includes(name)) return { name };
  const matches = allowed.filter((flag) => flag.startsWith(name));
  if (matches.length === 1) return { name: matches[0] as string };
  if (matches.length > 1) {
    return {
      error: `ambiguous option: ${name} could match ${matches.join(", ")}`,
    };
  }
  return { error: `unrecognized arguments: ${name}` };
}

function parseArgs(
  argv: readonly string[],
  allowed: readonly string[],
): Parsed | string {
  const values = new Map<string, string>();
  const repeated = new Map<string, string[]>();
  const switches = new Set<string>();
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith("--") && token !== "-h") {
      positional.push(token);
      continue;
    }
    if (SWITCHES.has(token)) {
      switches.add(token);
      continue;
    }
    const equals = token.indexOf("=");
    const written = equals === -1 ? token : token.slice(0, equals);
    const resolved = resolveFlag(written, allowed);
    if ("error" in resolved) return resolved.error;
    const name = resolved.name;
    let value: string;
    if (equals !== -1) {
      value = token.slice(equals + 1);
    } else {
      const next = argv[index + 1];
      if (next === undefined) return `argument ${name}: expected one argument`;
      value = next;
      index += 1;
    }
    if (REPEATABLE.has(name)) {
      const existing = repeated.get(name) ?? [];
      existing.push(value);
      repeated.set(name, existing);
      continue;
    }
    values.set(name, value);
  }
  return { values, repeated, switches, positional };
}


/** Every command takes it; the sessions root is derived when it is absent. */
const SESSIONS_DIR = "--sessions-dir";


function usage(): string {
  return [
    "usage: dabbler verify [--sessions-dir DIR] [--max-rounds N] [--transport T]",
    "       dabbler verify dispute --round N --finding F --grounds TEXT --evidence PATH",
    "       dabbler verify adjudicate [--max-rounds N] [--transport T]",
    "       dabbler verify prepare [--claims FILE]",
    "       dabbler verify reanchor --commit COMMIT --reason TEXT",
    "       dabbler verify reopen --rounds N --reason TEXT",
    "       dabbler verify reopen --session-number N --reason TEXT",
    "       dabbler verify person-review [--session-number N] [--reason TEXT]",
    "       dabbler verify step <open|close|status|amend|guard-commit>",
    "",
    "one cross-provider verification round; the loop continues on re-invocation",
    "",
    "reopen buys further rounds past a cap that has already ended the loop --",
    "the operator's answer when the cap stopped a review the tree still needs.",
    "It buys rounds, never a verdict, and never reaches an adjudication.",
    "With --session-number, a person buys one review of a CLOSED session that",
    "ended at the cap unverified -- REMEDIATED_AT_CAP, or ISSUES_FOUND short of an",
    "adjudication -- of what it changed as the trunk holds it now; a clean round",
    "makes its verdict VERIFIED.",
    "",
    "person-review is a person's own review of the work, never an engine's: at a",
    "verification stop of the session in flight, or with --session-number on a",
    "closed session that ended at the cap unverified. Without --reason it shows",
    "what a reviewer would be shown and changes nothing; with it, the verdict is",
    "REVIEWED_BY_PERSON, signed with git's user.name, which a release accepts.",
    "",
  ].join("\n");
}

function resolvedSessions(
  prefix: string,
  parsed: Parsed,
): { dir: string } | { code: number } {
  try {
    return { dir: resolveSessionsDir(parsed.values.get(SESSIONS_DIR) ?? null) };
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError) && !(error instanceof Error)) {
      throw error;
    }
    writeErr(`${prefix}: ${(error as Error).message}\n`);
    return { code: EXIT_USAGE };
  }
}

/** An integer flag as argparse's `type=int` reads it, or null when absent. */
function integerFlag(parsed: Parsed, name: string): number | null | "invalid" {
  const raw = parsed.values.get(name);
  if (raw === undefined) return null;
  if (!/^[+-]?\d+$/.test(raw.trim())) return "invalid";
  return Number.parseInt(raw.trim(), 10);
}

function transportFlag(parsed: Parsed): string | null | "invalid" {
  const raw = parsed.values.get("--transport");
  if (raw === undefined) return null;
  return (VALID_TRANSPORTS as readonly string[]).includes(raw) ? raw : "invalid";
}

function transportRefusal(prefix: string): number {
  writeErr(
    `${prefix}: argument --transport: invalid choice (choose from ` +
      `${VALID_TRANSPORTS.map((name) => `'${name}'`).join(", ")})\n`,
  );
  return EXIT_USAGE;
}

async function disputeMain(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, [
    SESSIONS_DIR, "--round", "--finding", "--grounds", "--evidence",
  ]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify dispute: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const round = integerFlag(parsed, "--round");
  const finding = integerFlag(parsed, "--finding");
  const grounds = parsed.values.get("--grounds");
  if (round === null || finding === null || grounds === undefined) {
    writeErr(
      "dabbler verify dispute: the following arguments are required: " +
        "--round, --finding, --grounds\n",
    );
    return EXIT_USAGE;
  }
  if (round === "invalid" || finding === "invalid") {
    writeErr("dabbler verify dispute: --round and --finding take integers\n");
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions("verify dispute", parsed);
  if ("code" in resolved) return resolved.code;
  // A person at a terminal has already read the refusal; the exit is all
  // the shell wants. The words it carries beside the exit are for the
  // driver, which has a record to put them on.
  return recordDispute(resolved.dir, {
    roundNumber: round,
    findingIndex: finding,
    grounds,
    evidence: parsed.repeated.get("--evidence") ?? [],
  }).exit;
}

async function adjudicateMain(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, [SESSIONS_DIR, "--max-rounds", "--transport"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify adjudicate: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const maxRounds = integerFlag(parsed, "--max-rounds");
  if (maxRounds === "invalid") {
    writeErr("dabbler verify adjudicate: --max-rounds takes an integer\n");
    return EXIT_USAGE;
  }
  const transport = transportFlag(parsed);
  if (transport === "invalid") return transportRefusal("dabbler verify adjudicate");
  const resolved = resolvedSessions("verify adjudicate", parsed);
  if ("code" in resolved) return resolved.code;
  return runAdjudication(resolved.dir, { maxRounds, transport });
}

async function prepareMain(argv: readonly string[]): Promise<number> {
  // There is no --change-id flag, and this is the message that says so:
  // "unrecognized arguments" would read like an oversight.
  for (const token of argv) {
    if (token === "--change-id" || token.startsWith("--change-id=")) {
      writeErr(
        "verify prepare: refused -- there is no --change-id option. " +
          "The change-id is derived from the reviewed tree; a supplied " +
          "value is refused rather than honoured.\n",
      );
      return EXIT_USAGE;
    }
  }
  const parsed = parseArgs(argv, [SESSIONS_DIR, "--claims"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify prepare: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions("verify prepare", parsed);
  if ("code" in resolved) return resolved.code;
  return runPrepare(resolved.dir, {
    claimsPath: parsed.values.get("--claims") ?? null,
  });
}

async function reanchorMain(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, [SESSIONS_DIR, "--commit", "--reason"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify reanchor: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const commit = parsed.values.get("--commit");
  const reason = parsed.values.get("--reason");
  if (commit === undefined || reason === undefined) {
    writeErr(
      "dabbler verify reanchor: the following arguments are required: " +
        "--commit, --reason\n",
    );
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions("verify reanchor", parsed);
  if ("code" in resolved) return resolved.code;
  return runReanchor(resolved.dir, commit, reason);
}

async function reopenMain(argv: readonly string[]): Promise<number> {
  if (argv.includes(APPROVER_FLAG)) {
    writeErr(`dabbler verify reopen: ${APPROVER_GONE}\n`);
    return EXIT_USAGE;
  }
  const parsed = parseArgs(argv, [SESSIONS_DIR, "--rounds", "--reason", "--session-number"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify reopen: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const reason = parsed.values.get("--reason");
  if (reason === undefined) {
    writeErr("dabbler verify reopen: the following arguments are required: --reason\n");
    return EXIT_USAGE;
  }
  const sessionNumber = integerFlag(parsed, "--session-number");
  if (sessionNumber !== null) {
    // A closed session's review is one round, always: what it buys is the
    // review the cap refused, and a count would make it a budget again.
    if (sessionNumber === "invalid" || parsed.values.has("--rounds")) {
      writeErr(
        "dabbler verify reopen: --session-number takes a session's number, and buys one round " +
          "with no --rounds\n",
      );
      return EXIT_USAGE;
    }
    const closed = resolvedSessions("verify reopen", parsed);
    if ("code" in closed) return closed.code;
    return reviewClosedSession(closed.dir, { sessionNumber, reason, engine: !personIsPresent() });
  }
  // Defaulted, and to one. A grant is for the review in front of the
  // operator, and a number they did not type is the number that buys the
  // least: reaching the new cap stops the session again, where an
  // over-generous default would quietly spend rounds nobody asked for.
  const rounds = integerFlag(parsed, "--rounds");
  if (rounds === "invalid") {
    writeErr("dabbler verify reopen: --rounds takes an integer\n");
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions("verify reopen", parsed);
  if ("code" in resolved) return resolved.code;
  return runReopen(resolved.dir, { rounds: rounds ?? 1, reason });
}

async function personReviewMain(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv, [SESSIONS_DIR, "--session-number", "--reason"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify person-review: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const sessionNumber = integerFlag(parsed, "--session-number");
  if (sessionNumber === "invalid") {
    writeErr("dabbler verify person-review: --session-number takes a session's number\n");
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions("verify person-review", parsed);
  if ("code" in resolved) return resolved.code;
  return runPersonReview(resolved.dir, {
    sessionNumber,
    reason: parsed.values.get("--reason") ?? null,
    engine: !personIsPresent(),
  });
}

const STEP_VERBS = ["open", "close", "status", "amend", "guard-commit"];

async function stepMain(argv: readonly string[]): Promise<number> {
  const [verb, ...rest] = argv;
  if (verb === undefined || !STEP_VERBS.includes(verb)) {
    writeErr(
      `dabbler verify step: invalid choice ${verb === undefined ? "" : `'${verb}'`}` +
        ` (choose from ${STEP_VERBS.map((name) => `'${name}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }
  if (verb === "guard-commit") return runStepGuardCommit();

  // Per step verb, as argparse declares them: only `open` takes `--step`
  // and only `amend` takes `--add-file` and `--reason`. One shared list
  // would make `--s` ambiguous under `amend`, where Python resolves it.
  const parsed = parseArgs(rest, [
    SESSIONS_DIR,
    ...(verb === "open" ? ["--step"] : []),
    ...(verb === "amend" ? ["--add-file", "--reason"] : []),
  ]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify step ${verb}: ${parsed}\n`);
    return EXIT_USAGE;
  }
  const resolved = resolvedSessions(`verify step ${verb}`, parsed);
  if ("code" in resolved) return resolved.code;

  if (verb === "open") {
    const stepId = parsed.values.get("--step");
    if (stepId === undefined) {
      writeErr(
        "dabbler verify step open: the following arguments are required: --step\n",
      );
      return EXIT_USAGE;
    }
    return runStepOpen(resolved.dir, stepId);
  }
  if (verb === "close") return runStepClose(resolved.dir);
  if (verb === "amend") {
    const reason = parsed.values.get("--reason");
    if (reason === undefined) {
      writeErr(
        "dabbler verify step amend: the following arguments are required: --reason\n",
      );
      return EXIT_USAGE;
    }
    const addFiles = parsed.repeated.get("--add-file") ?? [];
    if (addFiles.length === 0) {
      writeErr(
        "verify step amend: refused -- an amendment must carry the " +
          "change it makes. Name the path(s) with --add-file.\n",
      );
      return EXIT_USAGE;
    }
    return runStepAmend(resolved.dir, { reason, addedFiles: addFiles });
  }
  return runStepStatus(resolved.dir);
}

export async function verifyVerb(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === "dispute") return disputeMain(rest);
  if (first === "adjudicate") return adjudicateMain(rest);
  if (first === "waive") {
    writeErr(
      "verify waive: refused -- there is no waiver. A waiver " +
        "accepted work over a finding that still stood; a person who has " +
        "read the work signs a review of it instead, at a verification " +
        "stop: `dabbler verify person-review`. At the cap the loop decides " +
        "for itself: a fix made to the last round's findings is reviewed " +
        "by one round past the cap, and a tree that did not move is " +
        "UNRESOLVED. Re-run the loop and it will do whichever it is:\n" +
        "  dabbler verify --sessions-dir <dir>\n",
    );
    return EXIT_USAGE;
  }
  if (first === "prepare") return prepareMain(rest);
  if (first === "reanchor") return reanchorMain(rest);
  if (first === "reopen") return reopenMain(rest);
  if (first === "person-review") return personReviewMain(rest);
  if (first === "step") return stepMain(rest);

  const parsed = parseArgs(argv, [SESSIONS_DIR, "--max-rounds", "--transport"]);
  if (typeof parsed === "string") {
    writeErr(`dabbler verify: ${parsed}\n`);
    return EXIT_USAGE;
  }
  if (parsed.switches.has("-h") || parsed.switches.has("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  if (parsed.positional.length > 0) {
    writeErr(
      `dabbler verify: unrecognized arguments: ${parsed.positional.join(" ")}\n\n` +
        usage(),
    );
    return EXIT_USAGE;
  }
  const maxRounds = integerFlag(parsed, "--max-rounds");
  if (maxRounds === "invalid") {
    writeErr("dabbler verify: --max-rounds takes an integer\n");
    return EXIT_USAGE;
  }
  const transport = transportFlag(parsed);
  if (transport === "invalid") return transportRefusal("dabbler verify");
  const resolved = resolvedSessions("verify", parsed);
  if ("code" in resolved) return resolved.code;
  return runRound(resolved.dir, { maxRounds, transport });
}
