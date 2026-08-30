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
 * The state a folded decision is IN, as distinct from the event that put it
 * there.
 *
 * The file is a log of events, so `raised` is a thing that happened; `open` is
 * a thing that is true. Renaming the event would have made the log describe
 * states it cannot hold -- a decision is not "opened" twice -- so the state is
 * derived on the fold instead, and every reader gets the vocabulary its
 * consumers were promised.
 */
export const STATE_OPEN = "open";
export const STATE_ANSWERED = "answered";
export const STATE_SUPERSEDED = "superseded";

export const SEVERITY_BLOCKING = "blocking";
export const SEVERITY_ADVISORY = "advisory";

/** Which state each event puts a decision into. One-to-one, and written. */
export const STATE_OF_EVENT: Readonly<Record<string, string>> = {
  [EVENT_RAISED]: STATE_OPEN,
  [EVENT_ANSWERED]: STATE_ANSWERED,
  [EVENT_SUPERSEDED]: STATE_SUPERSEDED,
};

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
  // No derivation here any more: every row carries the state it produced, so
  // the fold is a fold and nothing else.
  for (const id of first) ordered.set(id, merged.get(id) as Row);
  return ordered;
}

/**
 * One folded decision, validated against the contract its consumers read.
 *
 * The log's schema describes rows; this describes the thing a reader wants.
 * Validating here rather than trusting the fold means a consumer that follows
 * the published schema cannot be handed a record that does not match it --
 * which is the only sense in which a "contract" is one.
 */
export function currentDecisions(repoRoot: string): Row[] {
  const rows = [...foldOwed(readOwed(repoRoot)).values()];
  for (const row of rows) {
    const failure = schemaFailure(
      row,
      loadSchemaFile("owed-decision-current.schema.json"),
      "owed decision",
    );
    if (failure) throw new OwedDecisionError(failure);
  }
  return rows;
}

/** The decisions still waiting on a person. */
export function openDecisions(repoRoot: string): Row[] {
  return currentDecisions(repoRoot).filter((row) => row["state"] === STATE_OPEN);
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
    state: STATE_OPEN,
    recordedAt: nowIso("seconds"),
    sessionNumber: options.sessionNumber ?? null,
    class: options.decisionClass,
    // Derived from the class, never declared per call: a severity a caller
    // could set is a severity a caller could lower, and the one class that
    // blocks is exactly the one no caller may opt out of.
    severity: BLOCKING_CLASSES.has(options.decisionClass)
      ? SEVERITY_BLOCKING
      : SEVERITY_ADVISORY,
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
  value: string | null = null,
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
    state: STATE_ANSWERED,
    // Carried from the row that raised it: a reader of this row alone must be
    // able to tell what leaving it unanswered would have cost, without going
    // back through the log to find out.
    severity: current["severity"],
    recordedAt: nowIso("seconds"),
    sessionNumber,
    answer: choice,
    answeredBy: "operator",
    value,
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
    state: STATE_SUPERSEDED,
    severity: current["severity"],
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
export const ID_TESTING_SUITES = "testing-suites";
/** Where this repository pushes, asked once at setup. */
export const ID_GIT_REMOTE = "git-remote";
/**
 * The second question, asked once the first one's answer stops being true.
 *
 * `no-tests-yet` is a legitimate answer and its recorded consequence promises
 * the question comes back when the repository grows a test root. A separate id
 * is what keeps that promise: re-raising the first one would either be refused
 * (a decision is answered once) or would erase the answer that was correct
 * when it was given. The repository is in a materially different state, so it
 * gets a materially different question.
 */
export const ID_TESTING_SUITES_NOW_TESTS_EXIST = "testing-suites-tests-exist";

export function refreshOwedDecisions(
  repoRoot: string,
  options: {
    readonly ecosystems: readonly string[];
    readonly hasExpensiveSuite: boolean;
    readonly configFilename: string;
    readonly hasTestRoot?: boolean;
    readonly sessionNumber?: number | null;
  },
): Row | null {
  if (options.hasExpensiveSuite) return null;
  if (options.ecosystems.length === 0) return null;
  const named = options.ecosystems.join(", ");

  // The first question, once answered, stays answered -- but `no-tests-yet`
  // answers a fact about the repository, and the fact can stop being true.
  const first = foldOwed(readOwed(repoRoot)).get(ID_TESTING_SUITES);
  if (
    first !== undefined &&
    first["state"] === STATE_ANSWERED &&
    first["answer"] === "no-tests-yet" &&
    options.hasTestRoot === true
  ) {
    return raiseOwed(repoRoot, {
      id: ID_TESTING_SUITES_NOW_TESTS_EXIST,
      decisionClass: CLASS_VERIFICATION_REDUCTION,
      question:
        "This repository now has tests, and still declares no suite. How do " +
        "they run?",
      file: options.configFilename,
      determined:
        `It was recorded earlier that there were no tests yet, and that was ` +
        `true then. A test root now exists and ${options.configFilename} still ` +
        "declares no suite, so nothing measures it.",
      options: [
        {
          label: "declare",
          consequence:
            `The framework writes a ${named} suite into ` +
            `${options.configFilename} and the freshness gate starts ` +
            "measuring it.",
        },
        {
          label: "still-not-yet",
          consequence:
            "Recorded again as deliberate. Nothing is measured, and the " +
            "close keeps saying so.",
        },
      ],
      recommendation: "declare",
      confidence: "high",
      onNoAnswer:
        "Work continues and the close does not call it verified, because " +
        "there are tests here that nothing runs.",
      sessionNumber: options.sessionNumber ?? null,
    });
  }

  return raiseOwed(repoRoot, {
    id: ID_TESTING_SUITES,
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

/**
 * Where this repository pushes, asked once and at setup.
 *
 * External-consequence rather than verification-reduction, so it does NOT
 * hold the close: a repository that stays local is a legitimate answer, and
 * the close reads the answer instead of printing `git push --set-upstream`
 * for a remote nobody created. That printed line is csv-model's item 2 --
 * the framework naming a command that could not work, about a thing it never
 * offered to do.
 *
 * Hosted creation is deliberately not an option. Authentication, host,
 * organisation, name, visibility and collision handling are a provider
 * contract, and an option whose consequence cannot be stated in one sentence
 * is not a choice anyone can make from a brief.
 */
export function raiseRemoteDecision(
  repoRoot: string,
  options: {
    readonly hasRemote: boolean;
    readonly sessionNumber?: number | null;
  },
): Row | null {
  if (options.hasRemote) return null;
  return raiseOwed(repoRoot, {
    id: ID_GIT_REMOTE,
    decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
    question:
      "Where should this repository push? It has no remote, and the close " +
      "cannot prove work left this machine without one.",
    file: null,
    determined:
      "The repository is a git repository with no remote configured. " +
      "Whether that is deliberate is not derivable -- a scratch project and " +
      "an unfinished setup look identical from here.",
    options: [
      {
        label: "attach",
        consequence:
          "The framework adds the remote URL you give and pushes the branch " +
          "with an upstream. Answer with the URL: " +
          "`dabbler owed answer --id git-remote --choice attach --value <url>`.",
      },
      {
        label: "stay-local",
        consequence:
          "Recorded as deliberate. The close stops asking for a push and " +
          "says the repository is local-only, rather than naming a command " +
          "that cannot work.",
      },
    ],
    recommendation: "attach",
    confidence: "medium",
    onNoAnswer:
      "Nothing waits. The close still refuses an unpushed branch, because " +
      "work that never left this machine is work one disk failure ends -- " +
      "but it is the push it wants, not this answer.",
    sessionNumber: options.sessionNumber ?? null,
  });
}

/** Whether a package this repository consumes is one the solution produces. */
export const ID_DEPENDENCY_OWNERSHIP = "dependency-ownership";

/**
 * Ask whether a package this repository consumes is one of ours.
 *
 * The framework cannot derive it. A `.csproj` naming `Dabbler.Csv.Model`
 * looks exactly like one naming `Newtonsoft.Json`: both are package ids from
 * a feed, and nothing in either build file says which of them a sibling
 * repository builds. That is the whole reason `solution-dependencies.json`
 * exists, and the whole reason its first entry has to be told to it.
 *
 * Asked once per package, and `external` is a real answer rather than a
 * deferral -- most dependencies ARE external, and a question that only
 * accepts "ours" would be a leading one.
 */
export function raiseOwnershipDecision(
  repoRoot: string,
  options: {
    readonly packageId: string;
    readonly seenIn: string;
    readonly sessionNumber?: number | null;
  },
): Row | null {
  return raiseOwed(repoRoot, {
    id: `${ID_DEPENDENCY_OWNERSHIP}:${options.packageId}`,
    decisionClass: CLASS_VALUE_TRADEOFF,
    question: `Does one of your own repositories build ${options.packageId}?`,
    file: "solution-dependencies.json",
    determined:
      `${options.seenIn} references ${options.packageId}, and nothing in a ` +
      "build file says where a package comes from. A dependency your team " +
      "builds and one from a public feed are written identically.",
    options: [
      {
        label: "ours",
        consequence:
          "Recorded as an edge in this solution, so the graph knows the two " +
          "repositories are connected and a pin behind the producer's " +
          "release is something the framework can tell you about.",
      },
      {
        label: "external",
        consequence:
          "Recorded as third-party. It stays the build file's business, and " +
          "you are not asked about it again.",
      },
    ],
    recommendation: null,
    confidence: null,
    onNoAnswer:
      "Nothing. The dependency keeps working; the solution graph simply does " +
      "not know whether this edge is one of its own.",
    sessionNumber: options.sessionNumber ?? null,
  });
}
