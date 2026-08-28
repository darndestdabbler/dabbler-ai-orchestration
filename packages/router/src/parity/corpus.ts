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

export interface RunOutcome {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runProcess(command: string, args: string[], cwd: string): RunOutcome {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...PINNED_ENV },
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

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md": SESSION_PLAN,
  "dabbler.yaml": DABBLER_YAML,
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "from src.widget import widget\n\n\ndef test_widget():\n    assert widget() == 1\n",
  ".gitignore": ".dabbler/\n",
};

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
    neededFromSession: 32,
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
