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
import { PROJECT_CONFIG_FILENAME } from "./config.ts";
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
  // Answered is settled: a different answer is a new question, and rewriting
  // the brief under one that has been decided would change what the operator
  // is recorded as having agreed to.
  if (current !== undefined && current["event"] === EVENT_ANSWERED) return null;
  if (current !== undefined && current["event"] === EVENT_RAISED) {
    // Idempotent on the QUESTION, not on the id. A brief corrected in code
    // never reached a decision already on disk, so the operator kept reading
    // the wrong one -- including, in the session that found this, a
    // recommendation the code had since reversed. An open decision whose
    // brief has changed is superseded and re-raised, which leaves both on
    // the record and puts the current one in front of the reader.
    if (sameBrief(current, options)) return null;
    supersedeOwed(
      repoRoot,
      options.id,
      "the brief changed; re-raised so the question on the record is the " +
        "one the framework is actually asking",
      options.sessionNumber ?? null,
    );
  }
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
/**
 * Whether a raised row asks what this brief asks.
 *
 * The parts a reader acts on: the question, what is known, the options and
 * their consequences, and the recommendation. Not the timestamp, and not the
 * session that happened to raise it.
 */
function sameBrief(current: Row, options: RaiseOptions): boolean {
  const shape = (
    question: unknown,
    determined: unknown,
    recommendation: unknown,
    choices: readonly { label: string; consequence: string }[],
  ): string =>
    JSON.stringify([
      String(question ?? ""),
      String(determined ?? ""),
      String(recommendation ?? ""),
      choices.map((choice) => [choice.label, choice.consequence]),
    ]);
  const raised = (Array.isArray(current["options"]) ? current["options"] : []).map(
    (entry) => ({
      label: String((entry as Row)["label"]),
      consequence: String((entry as Row)["consequence"]),
    }),
  );
  return (
    shape(current["question"], current["determined"], current["recommendation"], raised) ===
    shape(options.question, options.determined, options.recommendation ?? "", options.options)
  );
}

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

export const ID_FEED_SOURCE = "feed-source";

/**
 * Ask which package source serves a feed the declaration names.
 *
 * Not derivable, and not the framework's to pick. The declaration says a
 * dependency comes from `dabbler-local`; what is behind that name is a URL
 * or a directory on this machine, and choosing one wrong sends a restore at
 * somebody else's server. The answer is executed rather than handed back as
 * an instruction -- the operator picks the source, and the framework writes
 * the repository-scoped declaration.
 *
 * `external-consequence` and not a value trade-off: what gets written
 * changes where this repository fetches code from.
 */
export function raiseFeedDecision(
  repoRoot: string,
  options: {
    readonly feed: string;
    readonly packageId: string;
    readonly candidates: readonly string[];
    readonly sessionNumber?: number | null;
  },
): Row | null {
  const candidates = options.candidates.map((value) => ({
    label: value,
    consequence:
      `A repository-scoped ${"NuGet.config"} declares '${options.feed}' as ` +
      `${value}. Nothing machine-global is touched and no credential is written.`,
  }));
  return raiseOwed(repoRoot, {
    id: `${ID_FEED_SOURCE}:${options.feed}`,
    decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
    question: `What package source is '${options.feed}'?`,
    file: "NuGet.config",
    determined:
      `solution-dependencies.json says ${options.packageId} comes from a ` +
      `source named ` +
      `'${options.feed}', and no package source on this machine has that ` +
      "name. A restore will look in the sources that are configured, not " +
      "find it, and fail with a message about the package rather than the " +
      "feed.",
    options: [
      ...candidates,
      {
        label: "leave it unconfigured",
        consequence:
          "Nothing is written. The restore keeps failing, and the check keeps " +
          "reporting the feed as unconfigured until some source has that name.",
      },
    ],
    recommendation: null,
    confidence: null,
    onNoAnswer:
      "Nothing is written and nothing breaks that is not already broken: the " +
      "dependency cannot be restored from a feed until a source has this name.",
    sessionNumber: options.sessionNumber ?? null,
  });
}

/**
 * The answer that settles publishing for the whole repository.
 *
 * One label shared by both packaging questions, because it is a decision
 * about the repository rather than about one of two fields: answering it on
 * either question settles the other.
 */
export const NOT_PUBLISHED = "publishes nothing";

export const ID_PACKAGING_FEED = "packaging-feed";
export const ID_PACKAGING_SECRET = "packaging-secret";

/**
 * Ask where this repository publishes, and under what credential NAME.
 *
 * Two questions and not one, because they fail differently: a wrong feed
 * sends a release somewhere real, and a wrong credential name sends a build
 * nowhere at all. Both are asked ONCE, at the point the framework can already
 * see what would be packed -- the alternative is the state csv-model was in,
 * inventing pack and push argv by hand and getting all of it right before it
 * could publish once.
 *
 * `external-consequence`: what is answered here decides where an artifact
 * carrying this repository's name arrives.
 */
export function raisePackagingDecisions(
  repoRoot: string,
  options: {
    readonly ecosystem: string;
    readonly packCommand: string;
    readonly sessionNumber?: number | null;
  },
): Row[] {
  const raised: Row[] = [];
  const feed = raiseOwed(repoRoot, {
    id: ID_PACKAGING_FEED,
    decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
    question: "Which feed does this repository publish to?",
    file: PROJECT_CONFIG_FILENAME,
    determined:
      `Its build files say what would be packed -- \`${options.packCommand}\` ` +
      `is derivable from them. Where the result goes is not: a feed URL is a ` +
      "fact about your organisation, and there is nothing in this repository " +
      "that could be read to find it.",
    options: [
      {
        label: "<the feed's index URL>",
        consequence:
          "Written into the packaging block. A releasable session packs and " +
          "pushes there; nothing else changes, and no credential is written.",
      },
      {
        label: NOT_PUBLISHED,
        consequence:
          "No packaging block is written, which is a declaration rather than " +
          "a gap: this repository publishes to no feed today, and the " +
          "packaging step says so instead of failing.",
      },
    ],
    recommendation: null,
    confidence: null,
    onNoAnswer:
      "Nothing is written and nothing breaks. A session that declares itself " +
      "releasable is refused at step (f) with the reason that no feed is " +
      "declared, rather than pushing somewhere nobody chose.",
    sessionNumber: options.sessionNumber ?? null,
  });
  if (feed !== null) raised.push(feed);

  const secret = raiseOwed(repoRoot, {
    id: ID_PACKAGING_SECRET,
    decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
    question: "What is the NAME of the environment variable holding the feed credential?",
    file: PROJECT_CONFIG_FILENAME,
    determined:
      "The name goes in the configuration; the credential never does. It " +
      "resolves at spawn into one argv element and is placed in no " +
      "environment, so a repository's history never carries a PAT and a " +
      "child process never inherits one.",
    options: [
      {
        label: "DABBLER_FEED_PAT",
        consequence:
          "The conventional name. Set it in your shell or your CI secret " +
          "store; the framework reads it at the moment it pushes and nowhere " +
          "else.",
      },
      {
        label: NOT_PUBLISHED,
        consequence:
          "No packaging block is written. Answering it here settles the feed " +
          "question too: publishing is one decision about this repository, " +
          "not two about two fields.",
      },
      {
        label: "<another variable name>",
        consequence:
          "Whatever your organisation already uses. Only the name is " +
          "written, so an existing secret store keeps working unchanged.",
      },
    ],
    recommendation: "DABBLER_FEED_PAT",
    confidence: null,
    onNoAnswer:
      "Nothing is written. The packaging step refuses with the reason that " +
      "no credential is named, which costs one message rather than a build " +
      "that cannot be sent anywhere.",
    sessionNumber: options.sessionNumber ?? null,
  });
  if (secret !== null) raised.push(secret);
  return raised;
}

export const ID_PUBLICATION = "publication";

/**
 * Ask whether to publish, with the whole of what a wrong answer costs.
 *
 * The one decision in this framework that cannot be taken back. A version
 * pushed to a public registry is downloadable by everyone from that moment,
 * `npm unpublish` is refused after 72 hours and is a courtesy before it, and
 * a Marketplace version slot is never reusable. So the brief states the
 * versions, the registries and the order, and the framework does not move
 * until there is an answer.
 *
 * `external-consequence`, and the class is the point: it does not block a
 * close -- an unpublished product is not an unverified one -- and it is
 * absolutely not the working AI's to take.
 */
export function raisePublicationDecision(
  repoRoot: string,
  options: {
    readonly routerVersion: string;
    readonly extensionVersion: string;
    readonly sessionNumber?: number | null;
  },
): Row | null {
  return raiseOwed(repoRoot, {
    id: ID_PUBLICATION,
    decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
    question:
      `Publish dabbler-ai-router ${options.routerVersion} to npm and ` +
      `dabbler-ai-orchestration ${options.extensionVersion} to the VS Code ` +
      "Marketplace?",
    file: "(git tags)",
    determined:
      "Both are built, tested and unpublished, and `npm i -g " +
      "dabbler-ai-router` returns 404 today -- which is why a new project " +
      "cannot install the thing it is being asked to adopt. What ships is " +
      `the router at ${options.routerVersion} (npm, \`latest\`) and the ` +
      `extension at ${options.extensionVersion} (Marketplace), in that ` +
      "order: the extension bundles the router, so a Marketplace version " +
      "whose npm half is missing is the broken half-release. The framework " +
      "waits for npm to actually serve the router before it tags the " +
      "extension. Both publish through OIDC or a stored PAT in CI; no " +
      "credential is read or written here.\n\nWhat a wrong answer costs: a " +
      "published version is public from that moment and cannot be recalled " +
      "-- npm refuses `unpublish` after 72 hours, and a Marketplace version " +
      "slot is never reusable.",
    options: [
      {
        label: "publish",
        consequence:
          `Pushes \`v${options.routerVersion}\`, waits for npm to serve it, ` +
          `and then pushes \`vsix-v${options.extensionVersion}\`. Both become ` +
          "public and neither can be recalled. `npm i -g dabbler-ai-router` " +
          "starts working, which is the only outcome that closes this.",
      },
      {
        label: "release-candidate",
        consequence:
          `Pushes \`v${options.routerVersion}-rc1\` only. It exercises the ` +
          "NPM half of the path -- the build, the OIDC publish, the registry " +
          "-- and touches neither `latest` nor the Marketplace. `npm i -g " +
          "dabbler-ai-router` still returns 404 afterwards, so this does not " +
          "make the product installable; it is a rehearsal, and `publish` " +
          "still has to follow it.",
      },
      {
        label: "not yet",
        consequence:
          "Nothing is tagged and nothing is published. The build stays where " +
          "it is, and `npm i -g dabbler-ai-router` keeps returning 404.",
      },
    ],
    // The session exists BECAUSE the product is uninstallable, so the answer
    // that leaves it uninstallable cannot be the recommended one. An earlier
    // draft recommended the release candidate and called it "the whole path",
    // which was both false -- it never touches the Marketplace -- and a
    // recommendation to not do the thing.
    recommendation: "publish",
    confidence: null,
    onNoAnswer:
      "Nothing is published. This session closes either way -- an unpublished " +
      "product is not an unverified one -- but `npm i -g dabbler-ai-router` " +
      "keeps returning 404, so every adoption walkthrough still stops at its " +
      "first step and the item stays open.",
    sessionNumber: options.sessionNumber ?? null,
  });
}
