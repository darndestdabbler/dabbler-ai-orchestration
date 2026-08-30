// Decisions the framework cannot make for itself, recorded so it stops asking.
//
// The framework used to meet a missing precondition and print a refusal at
// whichever agent happened to be standing there. The next session met the same
// gap and printed the same refusal, and nothing accumulated: bothering the
// operator once during setup is reasonable, and bothering them every session
// for the same fact is what makes people route around a tool.
//
// A row is one event in a decision's life, appended and never edited. Folding
// by `id` and taking the last row gives the current state, so the file answers
// "what is owed" and "what was owed and settled" with the same read. It is
// repository-scoped rather than session-scoped because an unanswered question
// outlives the session that raised it -- which is the whole reason it is worth
// writing down.
//
// **Only one class blocks.** The rubric's four human-required classes are
// checked in precedence, and `verification-reduction` is first and absolute:
// proceeding on a default there would let the record claim something
// verification never established. The other three proceed on their stated
// default with the wait recorded, because nothing in this framework holds an
// engine open waiting for a person. The distinction is the whole design: work
// never stops, and the record does not get to say verified.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { nowIso, platformNewlines } from "./journal.ts";
import { RUNS_DIRNAME, type Row, readJsonl } from "./ledger.ts";
import { appendFileSync } from "node:fs";
import { dumps } from "./pythonJson.ts";
import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";

export const OWED_FILENAME = "owed-decisions.jsonl";

export const EVENT_RAISED = "raised";
export const EVENT_ANSWERED = "answered";
export const EVENT_SUPERSEDED = "superseded";

/**
 * The rubric's four human-required classes, in the order they are checked.
 *
 * `VERIFICATION_REDUCTION` is first because the carve-out is absolute: the
 * agent never authors its own permission, and no economic or convenience rule
 * may move a decision out of it.
 */
export const CLASS_VERIFICATION_REDUCTION = "verification-reduction";
export const CLASS_EXTERNAL_CONSEQUENCE = "external-consequence";
export const CLASS_VALUE_TRADEOFF = "value-tradeoff";
export const CLASS_ACCOUNTABILITY_SIGNOFF = "accountability-signoff";
export const CLASSES: readonly string[] = [
  CLASS_VERIFICATION_REDUCTION,
  CLASS_EXTERNAL_CONSEQUENCE,
  CLASS_VALUE_TRADEOFF,
  CLASS_ACCOUNTABILITY_SIGNOFF,
];

/** The one class whose unanswered questions refuse a close. */
export const BLOCKING_CLASSES: ReadonlySet<string> = new Set([
  CLASS_VERIFICATION_REDUCTION,
]);

export class OwedDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwedDecisionError";
  }
}

export function owedPath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), OWED_FILENAME);
}

function validate(record: Row): Row {
  const failure = schemaFailure(
    record,
    loadSchemaFile("owed-decisions.schema.json"),
    "owed decision",
  );
  if (failure) throw new OwedDecisionError(failure);
  return record;
}

/** Every row, in the order they were written. */
export function readOwed(repoRoot: string): Row[] {
  return readJsonl(owedPath(repoRoot), validate);
}

export interface OwedDecision extends Row {
  readonly id: string;
  readonly event: string;
}

/**
 * The current state of each decision, keyed by id, in the order first raised.
 *
 * The last row wins, which is what makes an append-only file answerable: an
 * answer does not edit the question, it supersedes it, and both stay readable.
 */
export function foldOwed(rows: readonly Row[]): Map<string, Row> {
  const first: string[] = [];
  const merged = new Map<string, Row>();
  for (const row of rows) {
    const id = String(row["id"]);
    if (!merged.has(id)) first.push(id);
    // The brief is carried forward: an `answered` row states the choice, and a
    // reader still needs the question it answers.
    merged.set(id, { ...(merged.get(id) ?? {}), ...row });
  }
  const ordered = new Map<string, Row>();
  for (const id of first) ordered.set(id, merged.get(id) as Row);
  return ordered;
}

/** The decisions still waiting on a person. */
export function openDecisions(repoRoot: string): Row[] {
  return [...foldOwed(readOwed(repoRoot)).values()].filter(
    (row) => row["event"] === EVENT_RAISED,
  );
}

/** Open decisions whose class refuses a close. */
export function blockingDecisions(repoRoot: string): Row[] {
  return openDecisions(repoRoot).filter((row) =>
    BLOCKING_CLASSES.has(String(row["class"])),
  );
}

function append(repoRoot: string, record: Row): Row {
  validate(record);
  const path = owedPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, platformNewlines(dumps(record) + "\n"), { encoding: "utf8" });
  return record;
}

export interface RaiseOptions {
  readonly id: string;
  readonly decisionClass: string;
  readonly question: string;
  readonly determined: string;
  readonly options: ReadonlyArray<{ readonly label: string; readonly consequence: string }>;
  readonly recommendation?: string | null;
  readonly confidence?: "high" | "medium" | "low" | null;
  readonly onNoAnswer?: string | null;
  readonly file?: string | null;
  readonly sessionNumber?: number | null;
}

/**
 * Raise a decision, or leave the standing one alone.
 *
 * Idempotent by id and deliberately so: the condition that raises a question
 * is usually still true on the next session, and re-raising would turn one
 * owed decision into a row per session -- which is the per-session re-ask this
 * record exists to end, merely written down instead of printed.
 *
 * Refuses a brief with fewer than two options. One option is a notification,
 * and a notification wearing a decision's shape is how a framework pretends to
 * have consulted someone.
 */
export function raiseOwed(repoRoot: string, options: RaiseOptions): Row | null {
  if (!CLASSES.includes(options.decisionClass)) {
    throw new OwedDecisionError(
      `class must be one of ${CLASSES.join(", ")}, got '${options.decisionClass}'`,
    );
  }
  if (options.options.length < 2) {
    throw new OwedDecisionError(
      `owed decision '${options.id}' offers ${options.options.length} option(s); ` +
        "a question with one answer is a notification",
    );
  }
  const current = foldOwed(readOwed(repoRoot)).get(options.id);
  if (current !== undefined && current["event"] === EVENT_RAISED) return null;
  if (current !== undefined && current["event"] === EVENT_ANSWERED) return null;
  return append(repoRoot, {
    id: options.id,
    event: EVENT_RAISED,
    recordedAt: nowIso("seconds"),
    sessionNumber: options.sessionNumber ?? null,
    class: options.decisionClass,
    question: options.question,
    file: options.file ?? null,
    determined: options.determined,
    options: options.options.map((entry) => ({
      label: entry.label,
      consequence: entry.consequence,
    })),
    recommendation: options.recommendation ?? null,
    confidence: options.confidence ?? null,
    onNoAnswer: options.onNoAnswer ?? null,
  });
}

/**
 * Record the operator's choice.
 *
 * `answeredBy` is closed to `operator` in the schema, and this is the only
 * writer: a model that could record an answer to a question reserved for a
 * person would have authored its own permission, which is the one thing the
 * carve-out exists to prevent.
 */
export function answerOwed(
  repoRoot: string,
  id: string,
  choice: string,
  sessionNumber: number | null = null,
  note: string | null = null,
): Row {
  const current = foldOwed(readOwed(repoRoot)).get(id);
  if (current === undefined) {
    throw new OwedDecisionError(`no owed decision '${id}' has been raised`);
  }
  if (current["event"] === EVENT_ANSWERED) {
    throw new OwedDecisionError(
      `owed decision '${id}' was already answered '${String(current["answer"])}'; ` +
        "a decision is answered once, and a different answer is a new question",
    );
  }
  const labels = (Array.isArray(current["options"]) ? current["options"] : []).map(
    (entry) => String((entry as Row)["label"]),
  );
  if (!labels.includes(choice)) {
    throw new OwedDecisionError(
      `'${choice}' is not one of the options offered for '${id}': ` +
        labels.join(", "),
    );
  }
  return append(repoRoot, {
    id,
    event: EVENT_ANSWERED,
    recordedAt: nowIso("seconds"),
    sessionNumber,
    answer: choice,
    answeredBy: "operator",
    note,
  });
}

/** Retire a question the repository outgrew before anyone answered it. */
export function supersedeOwed(
  repoRoot: string,
  id: string,
  note: string,
  sessionNumber: number | null = null,
): Row {
  const current = foldOwed(readOwed(repoRoot)).get(id);
  if (current === undefined) {
    throw new OwedDecisionError(`no owed decision '${id}' has been raised`);
  }
  return append(repoRoot, {
    id,
    event: EVENT_SUPERSEDED,
    recordedAt: nowIso("seconds"),
    sessionNumber,
    note,
  });
}

/** True when the repository has a record at all; a missing file is no rows. */
export function owedExists(repoRoot: string): boolean {
  return existsSync(owedPath(repoRoot));
}

// --- The conditions the framework raises for itself ---------------------------

/**
 * Raise what this repository owes, and raise nothing it does not.
 *
 * Called from `session start`, which is a write and happens before the work,
 * so a question is standing before the session that would trip over it begins.
 * Idempotent, because `raiseOwed` is.
 *
 * The one condition wired here is the suite declaration, and its shape is the
 * shape every later condition should copy: the framework establishes what it
 * can (which ecosystems this repository actually builds), asks only what it
 * cannot derive (which command runs the tests, and whether there are any yet),
 * and states what happens if nobody answers.
 *
 * It asks only when there is something to test. A repository whose root
 * declares no buildable ecosystem is a repository of documents, and demanding
 * a test command from it is the ceremony this framework is supposed to be
 * removing -- csv-model's first two sessions were exactly that, and were right
 * to close green.
 */
export function refreshOwedDecisions(
  repoRoot: string,
  options: {
    readonly ecosystems: readonly string[];
    readonly hasExpensiveSuite: boolean;
    readonly configFilename: string;
    readonly sessionNumber?: number | null;
  },
): Row | null {
  if (options.hasExpensiveSuite) return null;
  if (options.ecosystems.length === 0) return null;
  const named = options.ecosystems.join(", ");
  return raiseOwed(repoRoot, {
    id: "testing-suites",
    decisionClass: CLASS_VERIFICATION_REDUCTION,
    question:
      "How do this repository's tests run? Until that is declared, no session " +
      "can prove it did not break anything.",
    file: options.configFilename,
    determined:
      `The root declares ${named}, so there is code here to test, and ` +
      `${options.configFilename} declares no suite. Which command runs the ` +
      "tests is not derivable from the build files -- a build file is not a " +
      "test command.",
    options: [
      {
        label: "declare",
        consequence:
          `The framework writes a ${named} suite into ` +
          `${options.configFilename} and the freshness gate starts measuring ` +
          "it. Sessions from then on must run it before they close.",
      },
      {
        label: "no-tests-yet",
        consequence:
          "Recorded as a deliberate answer rather than an oversight. Nothing " +
          "is measured, and the question is asked again when the repository " +
          "grows a test root.",
      },
    ],
    recommendation: "declare",
    confidence: "high",
    onNoAnswer:
      "Nothing. This is the one class that waits: work continues and the " +
      "session runs to the end, but the close will not call it verified, " +
      "because there is nothing that could have verified it.",
    sessionNumber: options.sessionNumber ?? null,
  });
}
