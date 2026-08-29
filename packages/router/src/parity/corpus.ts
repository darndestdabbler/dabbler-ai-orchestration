// One repository per lifecycle shape, built fresh at every run.
//
// The builder drives the PYTHON router -- the reference implementation --
// from the same seed the test suite uses: a working repository with a
// session plan and a real bare `origin`, git identity and dates pinned
// through the environment so two builds of the same shape agree. Nothing
// under the corpus is checked in, so there is no golden file to go stale
// or to be hand-edited.
//
// A shape is built only when an active verb needs it. A shape whose
// builder is not written yet says so and the control stops with "could
// not run" (exit 2) rather than reporting a pass it did not earn -- the
// same announce-then-implement discipline as the verb registry.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export class CorpusError extends Error {}

/**
 * Git as the corpus needs it: no host configuration, fixed identity and
 * dates. And the one thing that decides what Python's output *bytes* are.
 *
 * `PYTHONIOENCODING` is not a normalization -- it is an input, the same kind
 * of thing as the pinned committer date. Python encodes `sys.stdout` with the
 * console code page unless told otherwise, so on Windows an em dash leaves
 * `print` as one cp1252 byte while Node writes the three UTF-8 bytes for the
 * same character. Left alone, every refusal sentence in the router that
 * carries a dash would read as drift, and the only way to make the comparison
 * agree would be to teach the TypeScript router to emit cp1252 -- baking a
 * Windows console default into a cross-platform command, and leaving session
 * 36 to change it back silently the moment Python leaves.
 *
 * So both routers are asked for the same encoding of the same text. It is set
 * for both spawns, because the corpus gives one environment per side rather
 * than two; Node has no such setting and ignores it.
 */
const PINNED_ENV: Record<string, string> = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Parity",
  GIT_AUTHOR_EMAIL: "parity@example.invalid",
  GIT_COMMITTER_NAME: "Parity",
  GIT_COMMITTER_EMAIL: "parity@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00+00:00",
  PYTHONIOENCODING: "utf-8",
};

/**
 * Router settings the operator's shell must not reach into the comparison.
 *
 * Each of these outranks something the corpus is trying to state. The worst
 * is `AI_ROUTER_CONFIG`: an operator who has it set makes every verb read
 * their config instead of the bundled one, and -- because a named config
 * takes neither layer -- the run would silently stop exercising the very
 * layering it reports on, in both routers at once and with no drift to show
 * for it. Both would be wrong together, which is the one failure a
 * comparison cannot see.
 */
const SCRUBBED_ENV = [
  "AI_ROUTER_CONFIG",
  "AI_ROUTER_METRICS_PATH",
  "DABBLER_TRANSPORT",
  "DABBLER_NO_ROUTER",
  // The provider keys, so the corpus can never reach a vendor. `discovery
  // enumerate` is the one compared verb that would: with a key it makes
  // three live calls whose answers are the vendors' current catalogs, which
  // are neither a function of the repository nor the same for both copies.
  // Without one, each vendor fails as `no-api-key` before any socket opens,
  // and what is compared is the record BOTH routers write out of that
  // identical failure -- the merge, the per-vendor annotation, the writer
  // stamp and the digest.
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
];

/**
 * One vendor keeps a credential, and it is a fake one.
 *
 * With every key scrubbed, all three vendors fail at `no-api-key` before a
 * socket opens -- which is what makes `enumerate` comparable at all, but it
 * also means the shared failure vocabulary is never exercised, because
 * `no-api-key` is a constant both routers already agreed on. So openai gets
 * a value that is not a key, and the overlay points it at a closed port on
 * the loopback. Nothing is ever sent: the connection is refused before a
 * request is written.
 *
 * The result is one case covering both halves of the field -- two vendors
 * refused for want of a credential, one classified from a real transport
 * failure -- and both routers must write the same word for each.
 */
const DEAD_ENDPOINT_KEY = "DABBLER_OPENAI_API_KEY";

function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...PINNED_ENV };
  for (const name of SCRUBBED_ENV) delete env[name];
  env[DEAD_ENDPOINT_KEY] = "not-a-key-the-endpoint-is-closed";
  return env;
}

export interface RunOutcome {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): RunOutcome {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...childEnvironment(), ...extraEnv },
  });
  if (proc.error) {
    throw new CorpusError(`${command} could not be run: ${proc.error.message}`);
  }
  return { code: proc.status, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

export function git(cwd: string, ...args: string[]): RunOutcome {
  const outcome = runProcess("git", args, cwd);
  if (outcome.code !== 0) {
    throw new CorpusError(
      `git ${args.join(" ")} failed (${outcome.code}): ${outcome.stderr.trim()}`,
    );
  }
  return outcome;
}

/** The Python router, through the interpreter the caller resolved. */
export function python(
  interpreter: string,
  cwd: string,
  moduleArgs: string[],
  extraEnv: Record<string, string> = {},
): RunOutcome {
  return runProcess(interpreter, ["-m", ...moduleArgs], cwd, extraEnv);
}

/**
 * The Python router's own writers, for an artifact no `python -m` verb
 * creates.
 *
 * `approved_plan` declares no command line, and its writer is the only thing
 * that can produce a plan a reader will accept -- a hand-written file is
 * refused on read, by design, so a fixture that wrote the JSON itself would
 * build a shape that only exercises the refusal. This is still the reference
 * implementation building the corpus, which is the rule the shapes already
 * follow; it is `-c` rather than `-m` because the module has no `__main__`.
 */
export function pythonScript(
  interpreter: string,
  cwd: string,
  source: string,
  args: string[] = [],
): RunOutcome {
  return runProcess(interpreter, ["-c", source, ...args], cwd);
}

const SESSION_PLAN = `# Parity corpus

## Sessions

### Session 1 of 2: First things
1. Register.
2. **Build the widget.** Make it real.
3. Cross-provider verification.
4. Close-out.

**Creates:** \`widget.py\`

### Session 2 of 2: Second things
1. Register.
2. Polish the widget.
3. Cross-provider verification.
4. Close-out.
`;

const DABBLER_YAML = `schema_version: 1

testing:
  suites:
    - name: unit
      command: python -m pytest
      expensive: true
      covers:
        - src/
        - tests/
      test_roots:
        - tests
      test_glob: "test_*.py"

  selection:
    repo_wide:
      - dabbler.yaml
    smoke:
      - tests/test_widget.py
    rules:
      - when: src/widget.py
        select:
          - tests/test_widget.py
`;

/**
 * Canned per-call telemetry, for the verbs that read it.
 *
 * It sits under `.dabbler/`, which the comparison's allow-list does not
 * cover, so it is an INPUT to the corpus and never an output: both copies
 * are handed the same rows, and what is compared is what each router makes
 * of them. The rows are chosen to reach every branch of the report -- a
 * served-model mismatch, a seat row with a conversation id and one without,
 * an escalation, a six-figure token count that must carry its separators,
 * and a row with no session number, which is grouped nowhere.
 */
export const METRICS_FIXTURE_PATH = ".dabbler/parity-metrics.jsonl";

const METRICS_FIXTURE = [
  {
    timestamp: "2026-01-01T00:00:00.000000+00:00", session_number: 1,
    call_type: "route", task_type: "code-review", model: "sonnet",
    requested_model_id: "a-sonnet", served_model_id: "a-sonnet-2",
    served_model_mismatch: true, provider: "anthropic", effort: "high",
    thinking_on: true, input_tokens: 1200, output_tokens: 3400,
    elapsed_seconds: 12.5, escalated: true, stop_reason: "end_turn",
    transport: "api", billed_usage_unavailable: null,
    transport_session_id: null, verifier_of: null, verdict: null,
    issue_count: null,
  },
  {
    timestamp: "2026-01-01T00:01:00.000000+00:00", session_number: 1,
    call_type: "verify", task_type: "verification", model: "gpt",
    requested_model_id: null, served_model_id: null,
    served_model_mismatch: null, provider: "openai", effort: "medium",
    thinking_on: true, input_tokens: 900000, output_tokens: 15,
    elapsed_seconds: 1.0, escalated: false, stop_reason: "stop",
    transport: "copilot-cli", billed_usage_unavailable: true,
    transport_session_id: "conv-1", verifier_of: "sonnet",
    verdict: "VERIFIED", issue_count: 0,
  },
  {
    timestamp: "2026-01-01T00:02:00.000000+00:00", session_number: 2,
    call_type: "route", task_type: "code-review", model: "sonnet",
    requested_model_id: "a-sonnet", served_model_id: "a-sonnet-2",
    served_model_mismatch: true, provider: "anthropic", effort: null,
    thinking_on: false, input_tokens: 7, output_tokens: 8,
    elapsed_seconds: 0.25, escalated: false, stop_reason: "end_turn",
    transport: "api", billed_usage_unavailable: true,
    transport_session_id: null, verifier_of: null, verdict: null,
    issue_count: null,
  },
  {
    timestamp: "2026-01-01T00:03:00.000000+00:00", session_number: null,
    call_type: "route", task_type: "planning", model: "flash",
    requested_model_id: null, served_model_id: null,
    served_model_mismatch: null, provider: "google", effort: null,
    thinking_on: false, input_tokens: 0, output_tokens: 0,
    elapsed_seconds: 0.0, escalated: false, stop_reason: "end_turn",
    transport: "api", billed_usage_unavailable: null,
    transport_session_id: null, verifier_of: null, verdict: null,
    issue_count: null,
  },
];

/** How many rows the telemetry fixture carries, for the control's report. */
export const METRICS_FIXTURE_ROWS = METRICS_FIXTURE.length;

/**
 * The API enumeration record, present and dated.
 *
 * `session start` prints a warning line for every discovery record that is
 * absent, undated or overdue -- and an absent record is stale whatever the
 * threshold says. A corpus without this file would make every
 * `session start` comparison a comparison of `discovery`, which lands in
 * session 28. So it is an INPUT, like the telemetry fixture: both copies
 * are handed the same file, and what is compared is the registration
 * beneath it.
 *
 * The date is fixed rather than current, and the overlay below sets both
 * freshness thresholds past any age it can reach. That also covers the seat
 * catalog, which is the real checked-in one and would otherwise start
 * warning on the day it ages out -- turning the control red for a reason no
 * diff of the change would explain. `discovery`'s own case, in session 28,
 * is what proves the freshness rules themselves.
 */
export const API_RECORD_PATH = ".dabbler/api-models.lock";

const API_RECORD = `[meta]
key_set_id = "default"
source = "parity-corpus"
enumerated_at = "2026-01-01T00:00:00Z"

[[providers]]
name = "anthropic"
enumerated_at = "2026-01-01T00:00:00Z"
model_count = 0

[[providers]]
name = "google"
enumerated_at = "2026-01-01T00:00:00Z"
model_count = 0

[[providers]]
name = "openai"
enumerated_at = "2026-01-01T00:00:00Z"
model_count = 0
`;

/** Past any age the fixed dates above can reach; see `API_RECORD`. */
const NEVER_STALE_HOURS = "100000000.0";

/**
 * A loopback endpoint nothing listens on, so a connection is REFUSED rather
 * than hung -- and refused the same way in both routers.
 *
 * The port is allocated and released rather than picked: a hard-coded one
 * proves nothing if something happens to be listening on it, and the failure
 * would be silent, because the two routers would agree about whatever they
 * both found there.
 *
 * It must also not be a port `fetch` refuses on sight. The WHATWG bad-port
 * list covers 1, 7, 9, 21, 22, 25, 53, 110, 143, 993 and about eighty more,
 * and Node rejects those with `Error: bad port` BEFORE opening a socket --
 * no `ECONNREFUSED`, no connection, nothing for httpx's failure to be
 * compared against. Port 1 was used here first and did exactly that: Python
 * connected and was refused while Node never left the process, so the case
 * compared two different events and still went green. An allocated
 * ephemeral port is never on that list.
 */
let deadEndpointUrl: string | null = null;

function deadEndpoint(): string {
  if (deadEndpointUrl !== null) return deadEndpointUrl;
  // Sync, because every builder below it is. The child binds port 0, reads
  // back what the OS assigned, releases it and prints it.
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      "const s=require('node:net').createServer();" +
        "s.listen(0,'127.0.0.1',()=>{const p=s.address().port;" +
        "s.close(()=>process.stdout.write(String(p)))});",
    ],
    { encoding: "utf8" },
  );
  const port = Number(String(probe.stdout).trim());
  if (!Number.isInteger(port) || port <= 0) {
    throw new CorpusError(
      "could not allocate a closed loopback port for the corpus, so the " +
        "failure-vocabulary case would prove nothing",
    );
  }
  deadEndpointUrl = `http://127.0.0.1:${port}/v1`;
  return deadEndpointUrl;
}

/**
 * The solution manifest every shape carries.
 *
 * A file rather than a shape: `workflow` needs a manifest before it can fold
 * a projection, and a sixth corpus shape would be built twice on every round
 * of every session that follows. This costs one `writeFileSync` per build and
 * nothing else -- no router runs against it until a case names it, and no
 * other verb reads `solution.yaml` at all.
 */
const SOLUTION_MANIFEST = [
  "solution:",
  "  name: parity-solution",
  "  title: The parity subject",
  "components:",
  "  - name: widget-model",
  "  - name: widget-app",
  "    kind: integration",
  "    dependsOn: [widget-model]",
  "",
].join("\n");

const SEED: Record<string, string> = {
  [API_RECORD_PATH]: API_RECORD,
  "docs/sessions/session-plan.md": SESSION_PLAN,
  "dabbler.yaml": DABBLER_YAML,
  "solution.yaml": SOLUTION_MANIFEST,
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "from src.widget import widget\n\n\ndef test_widget():\n    assert widget() == 1\n",
  // What `bootstrap` writes, plus the machine-local overlay: neither is
  // tracked in a real repository, and the corpus is only a corpus if it is
  // shaped like one.
  ".gitignore": ".dabbler/\nlocal-overrides.yaml\n",
  [METRICS_FIXTURE_PATH]:
    METRICS_FIXTURE.map((row) => JSON.stringify(row)).join("\n") + "\n",
};

/**
 * The machine-local layer, written per repository because it names a path
 * inside it.
 *
 * The corpus has to carry all THREE config layers or a control that reports
 * on the config load is reporting on two of them. It is also written so that
 * losing it would SHOW: it is what points `metrics` at the corpus's canned
 * telemetry, so a router that dropped the overlay would read the machine's
 * own `router-metrics.jsonl` beside the bundled config and print a different
 * report. A layer that could be deleted without the control noticing would
 * be scenery.
 *
 * Forward slashes on every platform: both YAML loaders take them, and a
 * Windows backslash in a YAML scalar is an escape.
 */
function localOverrides(repo: string): string {
  const fixture = join(repo, ...METRICS_FIXTURE_PATH.split("/")).replace(
    /\\/g,
    "/",
  );
  return (
    `metrics:\n  log_filename: "${fixture}"\n` +
    `discovery:\n  max_age_hours: ${NEVER_STALE_HOURS}\n` +
    `  seat_max_age_hours: ${NEVER_STALE_HOURS}\n` +
    // A closed loopback port refuses immediately, so `enumerate` reaches a
    // REAL transport failure without reaching a network. Both routers have
    // to call it the same thing, which is the only way the shared failure
    // vocabulary is checked rather than asserted.
    `providers:\n  openai:\n    base_url: "${deadEndpoint()}"\n`
  );
}

/**
 * A seat usage store, canned.
 *
 * `seat_cost` reads a store the Copilot CLI owns, at a path outside any
 * repository -- so unlike every other verb, what it reports is not a function
 * of the corpus unless the corpus supplies the store. This is that store: the
 * same rows for both copies, named through `--store` so nothing depends on the
 * machine having a seat at all. Written with `node:sqlite` because a fixture
 * both routers must read has to be a real SQLite file; the reader on the
 * Python side is `sqlite3`, and agreeing on this file is part of what the case
 * proves.
 *
 * The rows reach the branches that matter: a conversation with usage spread
 * over two events (the sum and the event count), and one present in `sessions`
 * with no usage at all, which is a genuine zero rather than an absence.
 */
export const SEAT_STORE_PATH = ".dabbler/parity-seat-store.db";

function writeSeatStore(repo: string): void {
  const path = join(repo, ...SEAT_STORE_PATH.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  const sqlite = process.getBuiltinModule("node:sqlite");
  if (sqlite === undefined) {
    throw new CorpusError(
      "this Node build has no node:sqlite, so the seat-cost fixture cannot " +
        "be written and that case would report a pass it did not earn",
    );
  }
  const { DatabaseSync } = sqlite as {
    DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
  };
  const database = new DatabaseSync(path);
  database.exec("CREATE TABLE schema_version (version INTEGER)");
  database.exec("INSERT INTO schema_version VALUES (6)");
  database.exec(
    "CREATE TABLE assistant_usage_events (session_id TEXT, total_nano_aiu INTEGER)",
  );
  database.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY)");
  database.exec(
    "INSERT INTO assistant_usage_events VALUES " +
      "('conv-a', 1000000000), ('conv-a', 500000000)",
  );
  database.exec("INSERT INTO sessions VALUES ('conv-a'), ('conv-b')");
  database.close();
}

/** A seeded working repository plus the bare `origin` it pushes to. */
function seedRepository(target: string): string {
  const repo = join(target, "repo");
  const remote = join(target, "remote.git");
  mkdirSync(repo, { recursive: true });
  for (const [rel, text] of Object.entries(SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  writeFileSync(join(repo, "local-overrides.yaml"), localOverrides(repo), "utf8");
  writeSeatStore(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "gc.auto", "0");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  git(target, "init", "-q", "--bare", remote);
  git(repo, "remote", "add", "origin", "../remote.git");
  git(repo, "push", "-q", "-u", "origin", "main");
  return repo;
}

export interface BuildContext {
  /** The interpreter that can import `ai_router`. */
  readonly interpreter: string;
}

export interface ShapeSpec {
  readonly name: string;
  readonly summary: string;
  /** Null until the session that needs this shape lands its builder. */
  readonly build: ((target: string, context: BuildContext) => string) | null;
  /** The session of the port plan whose verbs first need it. */
  readonly neededFromSession: number;
}

function buildFresh(target: string): string {
  return seedRepository(target);
}

function buildInFlight(target: string, context: BuildContext): string {
  const repo = seedRepository(target);
  const sessionsDir = join(repo, "docs", "sessions");

  const start = python(context.interpreter, repo, [
    "ai_router.session", "start",
    "--sessions-dir", sessionsDir,
    "--engine", "claude-code",
    "--provider", "anthropic",
  ]);
  if (start.code !== 0) {
    throw new CorpusError(`session start failed (${start.code}): ${start.stderr.trim()}`);
  }

  const taskFile = join(target, "tasks.md");
  writeFileSync(taskFile, "1. Build the widget.\n", "utf8");
  const declare = python(context.interpreter, repo, [
    "ai_router.session", "declare",
    "--sessions-dir", sessionsDir,
    "--task-file", taskFile,
    "--not-releasable",
  ]);
  if (declare.code !== 0) {
    throw new CorpusError(`session declare failed (${declare.code}): ${declare.stderr.trim()}`);
  }

  // One edited source file, so the selector has something to select on.
  writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");

  const affected = python(context.interpreter, repo, [
    "ai_router.affected", "--sessions-dir", sessionsDir,
  ]);
  if (affected.code !== 0) {
    throw new CorpusError(`affected failed (${affected.code}): ${affected.stderr.trim()}`);
  }

  const record = python(context.interpreter, repo, [
    "ai_router.test_evidence", "record",
    "--sessions-dir", sessionsDir,
    "--suite", "unit",
    "--stage", "preverify-targeted",
    "--command", "python -m pytest tests/test_widget.py",
    "--outcome", "passed",
    "--duration-seconds", "1",
  ]);
  if (record.code !== 0) {
    throw new CorpusError(
      `test_evidence record failed (${record.code}): ${record.stderr.trim()}`,
    );
  }

  writeApprovedPlan(repo, context);
  return repo;
}

/**
 * The session's approved plan, approved, with its one step opened.
 *
 * Without it `progress --json` on this shape renders an empty task list, and
 * the two routers agree on emptiness -- which proves nothing about the fold
 * that turns a plan and an execution record into rows. The step id is the one
 * the shape's own session plan derives (`build-the-widget`), so the plan
 * answers a real goal rather than an invented one.
 *
 * `approve_plan` is called rather than skipped because the approval is what
 * binds `plan_hash` into the artifact, and that hash is over the canonical
 * JSON both routers have to agree on byte for byte. An unapproved plan would
 * leave the one field this case exists to compare unwritten.
 */
function writeApprovedPlan(repo: string, context: BuildContext): void {
  const steps = [
    {
      step_id: "build-the-widget",
      intent: "Build the widget",
      file_envelope: ["src/widget.py"],
      evidence_contract: [
        { kind: "deterministic", description: "the targeted tests pass" },
      ],
      risk_flags: [],
    },
  ];
  const plan = pythonScript(
    context.interpreter,
    repo,
    [
      "import json, sys",
      "from ai_router.approved_plan import approve_plan, new_plan, write_plan",
      "from ai_router.ledger import session_run_dir",
      "run = session_run_dir(sys.argv[2], 1)",
      "run.mkdir(parents=True, exist_ok=True)",
      "write_plan(run, new_plan(1, 'parity', json.loads(sys.argv[1])))",
      "approve_plan(run)",
    ].join("\n"),
    [JSON.stringify(steps), repo],
  );
  if (plan.code !== 0) {
    throw new CorpusError(`approved plan failed (${plan.code}): ${plan.stderr.trim()}`);
  }

  const opened = pythonScript(
    context.interpreter,
    repo,
    [
      "import json, sys",
      "from ai_router.ledger import append_step_event",
      "append_step_event(sys.argv[2], 1, json.loads(sys.argv[1]))",
    ].join("\n"),
    [
      JSON.stringify({
        schema_version: 1,
        event: "opened",
        recorded_at: PINNED_STEP_TIME,
        session_number: 1,
        step_id: "build-the-widget",
        base_commit: "a".repeat(40),
      }),
      repo,
    ],
  );
  if (opened.code !== 0) {
    throw new CorpusError(`step event failed (${opened.code}): ${opened.stderr.trim()}`);
  }
}

/**
 * The step row's stamp, fixed rather than read from the clock.
 *
 * Every other timestamp in the corpus is written by the router and reduced by
 * normalization 1. This one is authored by the builder, and authoring a moving
 * value would make the shape's own bytes differ between two builds for a
 * reason no diff could attribute.
 */
const PINNED_STEP_TIME = "2026-01-01T00:00:00+00:00";

/**
 * The offline transport's scripted answers, for the shapes that need a
 * verifier.
 *
 * Three shapes turn on what a verifier said, and a live one cannot be asked
 * to produce a specific awkward response on demand -- which is exactly what
 * a corpus of verification states requires. The responses are files, served
 * in lexical order, one per dispatch; both copies of a shape are built from
 * the same directory, so the two routers are handed the same words.
 */
function scriptResponses(target: string, responses: readonly string[]): string {
  const dir = join(target, "verifier-responses");
  mkdirSync(dir, { recursive: true });
  responses.forEach((text, index) => {
    writeFileSync(
      join(dir, `${String(index + 1).padStart(2, "0")}.md`),
      text,
      "utf8",
    );
  });
  return dir;
}

/** One blocking finding, cited at the file the shape's session edits. */
const BLOCKING_RESPONSE =
  "ISSUES FOUND\n\nIssue 1: the widget returns the wrong number.\n" +
  "Category: correctness\nSeverity: Major\n" +
  "Failure scenario: a caller reading widget() gets 2 where 1 is meant.\n" +
  "Evidence paths: src/widget.py\n";

/**
 * A round with findings, one of them disputed with a rebuttal.
 *
 * Everything is written by the PYTHON router, as every shape is: the round
 * comes from `python -m ai_router.verify` against a scripted verifier, and
 * the dispute from `verify dispute`. A fixture that wrote `rounds.jsonl`
 * itself would build a shape that only exercises the reader.
 */
function buildDisputed(target: string, context: BuildContext): string {
  const repo = buildInFlight(target, context);
  const sessionsDir = join(repo, "docs", "sessions");
  const responses = scriptResponses(target, [BLOCKING_RESPONSE]);

  const round = python(
    context.interpreter,
    repo,
    ["ai_router.verify", "--sessions-dir", sessionsDir, "--transport", "offline"],
    { DABBLER_OFFLINE_RESPONSES: responses },
  );
  // Exit 4 is a blocking round, which is the state this shape IS.
  if (round.code !== 4) {
    throw new CorpusError(
      `the disputed shape's round exited ${round.code}, not 4 (blocking): ` +
        `${(round.stderr || round.stdout).trim()}`,
    );
  }

  const dispute = python(context.interpreter, repo, [
    "ai_router.verify", "dispute",
    "--sessions-dir", sessionsDir,
    "--round", "1",
    "--finding", "0",
    "--grounds", "the widget's contract is the new number, per the plan",
    "--evidence", "docs/sessions/session-plan.md",
  ]);
  if (dispute.code !== 0) {
    throw new CorpusError(
      `verify dispute failed (${dispute.code}): ${dispute.stderr.trim()}`,
    );
  }
  return repo;
}

/**
 * The cap reached, with a remediation before the last round.
 *
 * The cap is lowered to two rather than the tree being driven three times:
 * `--max-rounds` is the same number the loop reads from configuration, so
 * the state is the real one and it costs one round less to reach.
 */
function buildAtCap(target: string, context: BuildContext): string {
  const repo = buildInFlight(target, context);
  const sessionsDir = join(repo, "docs", "sessions");
  const responses = scriptResponses(target, [BLOCKING_RESPONSE, BLOCKING_RESPONSE]);

  for (const round of [1, 2]) {
    if (round === 2) {
      // The remediation, and the evidence it makes necessary. A round two
      // that opened on an unchanged tree would be reviewing nothing.
      writeFileSync(
        join(repo, "src", "widget.py"),
        "def widget():\n    return 3\n",
        "utf8",
      );
      recordTargetedRun(repo, sessionsDir, context);
    }
    const outcome = python(
      context.interpreter,
      repo,
      [
        "ai_router.verify",
        "--sessions-dir", sessionsDir,
        "--transport", "offline",
        "--max-rounds", "2",
      ],
      { DABBLER_OFFLINE_RESPONSES: responses },
    );
    if (outcome.code !== 4) {
      throw new CorpusError(
        `the at-cap shape's round ${round} exited ${outcome.code}, not 4: ` +
          `${(outcome.stderr || outcome.stdout).trim()}`,
      );
    }
  }
  return repo;
}

/**
 * A clone that never received the round refspec.
 *
 * The recorded completion tree is a real object in the origin and absent
 * here, which is the state `verify reanchor` exists for and the one no other
 * shape can reach: a shape built in place always has its own objects. The
 * clone is the repository the case runs against; the built one is its
 * origin, kept beside it.
 */
function buildMovedMachine(target: string, context: BuildContext): string {
  const origin = buildDisputed(target, context);
  const clone = join(target, "clone");

  // Cloned from the BARE remote, not from the working repository. A local
  // `git clone <dir>` hardlinks the whole object store, unreachable objects
  // included, so the round's snapshot tree would arrive with it and the
  // shape would not be the shape it claims. The remote only ever received
  // the pushed branch: nothing pushed `refs/dabbler/rounds/*`, which is
  // exactly why the recorded tree goes missing on the far machine.
  // `--branch main` because a bare repository's HEAD still names the branch
  // `git init --bare` chose, and nothing here pushed to that name -- so a
  // clone without it checks out nothing and leaves HEAD unborn.
  git(target, "clone", "-q", "--branch", "main", join(target, "remote.git"), clone);
  git(clone, "config", "core.autocrlf", "false");
  git(clone, "config", "commit.gpgsign", "false");
  git(clone, "config", "gc.auto", "0");

  // What a clone does NOT bring, and what this shape is about.
  //
  // The session record and the run ledger are both untracked here (D135), so
  // a clone has neither -- and without them the far machine has no session
  // in flight and no round, which is a different refusal entirely. Every
  // `verify reanchor` case would then pass by agreeing about the wrong
  // thing: two routers refusing "no session" while `baseline-reanchors.jsonl`
  // is never written and never compared. So the record travels and the
  // OBJECTS do not, which is the real state a session that changed machines
  // arrives in.
  cpSync(join(origin, ".dabbler"), join(clone, ".dabbler"), { recursive: true });
  cpSync(join(origin, "docs", "sessions"), join(clone, "docs", "sessions"), {
    recursive: true,
    force: true,
  });

  // The machine-local layer names a path inside the repository it was
  // written for, so it is rewritten for this one.
  rehomeOverrides(clone);

  // The shape asserts its own premise. A vacuous corpus shape is worse than
  // a missing one: it reports a pass for a comparison that never ran, and
  // nothing downstream can tell the two apart. If the recorded tree ever
  // arrives here -- a changed clone flag, a pushed round refspec -- this
  // stops the run instead of quietly making the reanchor case a no-op.
  const rounds = readFileSync(
    join(clone, ".dabbler", "runs", "s1", "rounds.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n");
  const recorded = String(
    (JSON.parse(rounds[rounds.length - 1] as string) as Record<string, unknown>)[
      "completion_tree"
    ],
  );
  const present = runProcess(
    "git",
    ["cat-file", "-e", `${recorded}^{object}`],
    clone,
  );
  if (present.code === 0) {
    throw new CorpusError(
      `the 'moved-machine' shape carries round 1's recorded tree ` +
        `${recorded.slice(0, 12)}, so the recovery it exists to compare ` +
        "cannot happen and every reanchor case on it would pass vacuously",
    );
  }
  return clone;
}


/** Point the machine-local overlay at this copy's own telemetry fixture. */
export function rehomeOverrides(repo: string): void {
  writeFileSync(join(repo, "local-overrides.yaml"), localOverrides(repo), "utf8");
}

/**
 * `test_evidence record` for the tests the current change set selects.
 *
 * A round is refused without it, so a shape that drives a second round has
 * to record one -- through the Python router, like everything else the
 * corpus builds.
 */
function recordTargetedRun(
  repo: string,
  sessionsDir: string,
  context: BuildContext,
): void {
  const recorded = python(context.interpreter, repo, [
    "ai_router.test_evidence", "record",
    "--sessions-dir", sessionsDir,
    "--suite", "unit",
    "--stage", "preverify-targeted",
    "--command", "python -m pytest tests/test_widget.py",
    "--outcome", "passed",
    "--duration-seconds", "1",
  ]);
  if (recorded.code !== 0) {
    throw new CorpusError(
      `test_evidence record failed (${recorded.code}): ${recorded.stderr.trim()}`,
    );
  }
}

/**
 * The five lifecycle shapes of the record.
 */
export const SHAPES: readonly ShapeSpec[] = [
  {
    name: "fresh",
    summary: "a plan and a config, no ledger and no runs: registration from nothing",
    build: buildFresh,
    neededFromSession: 26,
  },
  {
    name: "in-flight",
    summary: "started, declared, one file edited, the selector run and recorded",
    build: buildInFlight,
    neededFromSession: 26,
  },
  {
    name: "disputed",
    summary: "a round with findings, one disputed with a rebuttal",
    build: buildDisputed,
    neededFromSession: 33,
  },
  {
    name: "at-cap",
    summary: "the cap reached, with a remediation before the last round",
    build: buildAtCap,
    neededFromSession: 33,
  },
  {
    name: "moved-machine",
    summary: "a clone without the round refspec, so the recorded tree is absent",
    build: buildMovedMachine,
    neededFromSession: 33,
  },
];

export function findShape(name: string): ShapeSpec | undefined {
  return SHAPES.find((shape) => shape.name === name);
}

/** Build one shape into `target`, returning the repository root inside it. */
export function buildShape(name: string, target: string, context: BuildContext): string {
  const shape = findShape(name);
  if (!shape) throw new CorpusError(`'${name}' is not a corpus shape`);
  if (!shape.build) {
    throw new CorpusError(
      `the '${name}' shape has no builder yet; it lands with the verbs that ` +
        `read it, from session ${shape.neededFromSession}`,
    );
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  return shape.build(target, context);
}

/**
 * A built shape, copied rather than rebuilt.
 *
 * D169 measured the cost and D176 named the lever: a SHAPE is what a case
 * pays for, because a shape is built twice per case that names it. Twenty-
 * eight cases over two shapes already cost ~200 s, and three of the five
 * shapes drive a verification round -- so rebuilding per case is what stops
 * the table from growing.
 *
 * A copy is sound because a shape is a directory: the git repository inside
 * it uses a relative `origin`, and the one absolute path in it -- the
 * machine-local overlay naming its own telemetry fixture -- is rewritten
 * here. Every case still gets a pristine tree, because the template is
 * never run against; it is only ever copied FROM.
 */
export function copyShape(template: string, target: string, repoName: string): string {
  rmSync(target, { recursive: true, force: true });
  cpSync(template, target, { recursive: true });
  const repo = join(target, repoName);
  rehomeOverrides(repo);
  return repo;
}

/** The name of the repository directory inside a built shape's target. */
export function repoDirName(shape: string, repo: string, target: string): string {
  const rel = relative(target, repo);
  if (rel === "" || rel.includes("..")) {
    throw new CorpusError(
      `the '${shape}' shape built its repository outside its own target`,
    );
  }
  return rel;
}

