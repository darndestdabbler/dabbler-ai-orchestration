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
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class CorpusError extends Error {}

/** Git as the corpus needs it: no host configuration, fixed identity and dates. */
const PINNED_ENV: Record<string, string> = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Parity",
  GIT_AUTHOR_EMAIL: "parity@example.invalid",
  GIT_COMMITTER_NAME: "Parity",
  GIT_COMMITTER_EMAIL: "parity@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00+00:00",
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

export function runProcess(command: string, args: string[], cwd: string): RunOutcome {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: childEnvironment(),
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
): RunOutcome {
  return runProcess(interpreter, ["-m", ...moduleArgs], cwd);
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

/** A port nothing listens on, so the connection is refused rather than hung. */
const DEAD_ENDPOINT_URL = "http://127.0.0.1:1/v1";

const SEED: Record<string, string> = {
  [API_RECORD_PATH]: API_RECORD,
  "docs/sessions/session-plan.md": SESSION_PLAN,
  "dabbler.yaml": DABBLER_YAML,
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
    // Port 1 on the loopback refuses immediately, so `enumerate` reaches a
    // REAL transport failure without reaching a network. Both routers have
    // to call it the same thing, which is the only way the shared failure
    // vocabulary is checked rather than asserted.
    `providers:\n  openai:\n    base_url: "${DEAD_ENDPOINT_URL}"\n`
  );
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

  return repo;
}

/**
 * The five lifecycle shapes of the record. The three whose builders are
 * null need a canned verifier -- the offline transport, ported in session
 * 28 -- and land with the verbs that read them.
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
    summary: "a round with findings, one disputed with a rebuttal, then a withdrawal",
    build: null,
    neededFromSession: 26,
  },
  {
    name: "at-cap",
    summary: "the cap reached, with a remediation before the last round",
    build: null,
    neededFromSession: 26,
  },
  {
    name: "moved-machine",
    summary: "a clone without the round refspec, and a second copy that fetched it",
    build: null,
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
