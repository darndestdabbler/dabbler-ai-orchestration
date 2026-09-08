// What the suite costs the operator, held to what the declaration claims.
//
// Two protections keep `node --test` off the operator's machine, and BOTH
// had lapsed by session 121 without a single test noticing:
//
//   1. Session 76's below-normal worker priority, which let the operator
//      keep typing during a run. It lived in a vitest setup file and was
//      deleted with `vitest.config.ts` when session 88 retired vitest.
//      Nothing carried it into the `node --test` rebuild.
//   2. Session 96's git-spawn constraint, which is what replaced
//      `--test-concurrency=4` and let the concurrency cap come off. It
//      still holds -- but it recognised a walkthrough by the FILENAME
//      pattern `walk-*.test.ts`, so the exemption widened from six files
//      to eight simply by people naming new files correctly.
//
// The shape of the failure is the same both times: a protection with no
// auditor, so its lapse is invisible until someone measures. That is what
// this control is for. It rides in the lint gate beside
// `check-selection-map.ts`, and every session runs it.
//
// A control rather than a test, deliberately: the ground rules forbid tests
// of test infrastructure, and the thing being held here is the test
// infrastructure's own declaration. Reading source and spawning probes is
// what `check-selection-map.ts` and `check-boundaries.ts` already do.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTER_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(ROUTER_ROOT, "..", "..");
const TEST_DIR = join(ROUTER_ROOT, "test");
const PRELOAD = join(TEST_DIR, "support", "no-git.ts");

const problems: string[] = [];

function fail(what: string): void {
  problems.push(what);
}

// --- The worker yields to the operator ----------------------------------------

/**
 * What a child reports its own priority as, with the preload or without it.
 *
 * Behavioural rather than a call to `workerPriority` directly: the policy
 * being right is worth nothing if the preload stops APPLYING it, and that
 * is exactly the half that went missing before. The child's environment is
 * built explicitly so this control gives the same answer on a developer's
 * machine and on a CI runner, neither of which it can otherwise predict.
 */
function probePriority(options: { preload: boolean; ci: boolean }): number | null {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["CI"];
  if (options.ci) env["CI"] = "1";
  // A file:// URL, not the path: `--import` resolves an absolute Windows
  // path as a URL and reads `d:` as a protocol. The suite's own command
  // escapes this by being relative to the repository root.
  const argv = [
    ...(options.preload ? ["--import", pathToFileURL(PRELOAD).href] : []),
    "-e",
    "process.stdout.write(String(require('node:os').getPriority()))",
  ];
  const run = spawnSync(process.execPath, argv, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (run.status !== 0) {
    fail(
      `could not probe the worker priority (${options.preload ? "with" : "without"} the preload` +
        `${options.ci ? ", CI" : ""}): ${String(run.stderr).trim() || `exit ${String(run.status)}`}`,
    );
    return null;
  }
  const value = Number.parseInt(String(run.stdout).trim(), 10);
  return Number.isNaN(value) ? null : value;
}

function checkWorkerPriority(): void {
  const bare = probePriority({ preload: false, ci: false });
  const preloaded = probePriority({ preload: true, ci: false });
  const underCi = probePriority({ preload: true, ci: true });
  if (bare === null || preloaded === null || underCi === null) return;

  // Higher is lower: Node's scale runs PRIORITY_NORMAL 0 to PRIORITY_LOW 19.
  if (preloaded <= bare) {
    fail(
      `the preload did not lower this worker's priority: a plain node reports ${String(bare)} ` +
        `and one loading test/support/no-git.ts reports ${String(preloaded)}. Session 76's ` +
        "policy is what keeps the operator's machine usable during a run.",
    );
  }
  if (underCi !== bare) {
    fail(
      `the preload changed the worker's priority under CI: ${String(underCi)} against a plain ` +
        `node's ${String(bare)}. There is no operator to yield to on a runner, and the wall ` +
        "clock is what a runner is paid for.",
    );
  }
}

// --- Only the declared walkthroughs build repositories ------------------------

/**
 * The list the preload declares, read from its source.
 *
 * Both quote styles, and an EMPTY parse is a failure rather than a shrug.
 * The first cut of this read only double-quoted entries and returned `[]`
 * silently when it found none -- so reformatting `no-git.ts` to single
 * quotes, which changes nothing about what it does, would have switched
 * this whole control off while it went on reporting success. That is the
 * same defect one layer up as the thing being audited: a protection that
 * stops protecting without saying so.
 */
function declaredWalkthroughs(): string[] {
  const source = readFileSync(PRELOAD, "utf8");
  const block = /const WALKTHROUGHS[^=]*=\s*\[([^\]]*)\]/.exec(source);
  if (block === null) {
    fail(
      "test/support/no-git.ts no longer declares a WALKTHROUGHS list. It is the budget on how " +
        "many test files may build git repositories; a filename pattern in its place widens " +
        "itself every time somebody names a file correctly, which is how six became eight.",
    );
    return [];
  }
  const names = [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]).sort();
  if (names.length === 0) {
    fail(
      "test/support/no-git.ts declares a WALKTHROUGHS list this control cannot read any names " +
        "out of. Refusing rather than passing: an audit that reads nothing and reports success " +
        "is worse than no audit, because it also stops anyone looking.",
    );
  }
  return names;
}

/** The `walk-*.test.ts` files actually on disk. */
function walkthroughsPresent(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => /^walk-.*\.test\.ts$/.test(name))
    .sort();
}

/**
 * The list and the disk, held to each other in BOTH directions.
 *
 * An undeclared walkthrough is the failure this session exists to stop: it
 * spawns git and a full CLI child per job, nineteen workers at a time. A
 * declared file that no longer exists is the quieter one -- a standing
 * exemption attached to a name, waiting for the next file to take it.
 */
function checkWalkthroughBudget(): readonly string[] {
  const declared = declaredWalkthroughs();
  if (declared.length === 0) return [];
  const present = walkthroughsPresent();

  const undeclared = present.filter((name) => !declared.includes(name));
  const missing = declared.filter((name) => !present.includes(name));

  if (undeclared.length > 0) {
    fail(
      `${undeclared.join(", ")} would build git repositories without being declared in ` +
        "test/support/no-git.ts. Add it to WALKTHROUGHS deliberately, or feed the answer " +
        "through journal.setGitSource (test/support/answers.ts) as the rest of the suite does.",
    );
  }
  if (missing.length > 0) {
    fail(
      `test/support/no-git.ts declares ${missing.join(", ")}, which no longer exists. A stale ` +
        "entry is an exemption nothing uses, and the next file to take that name inherits it.",
    );
  }
  return present;
}

// --- The declaration says what is true ----------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/**
 * `dabbler.yaml`'s comment on the typescript suite states the walkthrough
 * count in prose, and that is where a reader learns why the concurrency cap
 * came off. It said FIVE while there were eight, from session 96 to 122,
 * beside a timing figure that was two sessions old when it was written and
 * five times wrong by the end. A number in a comment is a claim like any
 * other; this one now has an auditor.
 */
function checkDeclaredCount(present: readonly string[]): void {
  if (present.length === 0) return;
  const yaml = readFileSync(join(REPO_ROOT, "dabbler.yaml"), "utf8");
  const claim = /the (\w+) `walk-\*` files/.exec(yaml);
  if (claim === null) {
    fail(
      "dabbler.yaml no longer says how many `walk-*` files spawn git. The comment on the " +
        "typescript suite is where that constraint is explained, and the number belongs with it.",
    );
    return;
  }
  const said = NUMBER_WORDS[claim[1].toLowerCase()];
  if (said === undefined) {
    fail(`dabbler.yaml says "the ${claim[1]} \`walk-*\` files", which is not a number this reads.`);
    return;
  }
  if (said !== present.length) {
    fail(
      `dabbler.yaml says the ${claim[1]} \`walk-*\` files and there are ${String(present.length)}.`,
    );
  }
}

// --- The measurement keeps its honest gap -------------------------------------

/**
 * `docs/design/suite-cost.md` records that the jump from 40 s to 102 s
 * between sessions 98 and 99 is NOT explained. Session 99's diff was read
 * looking for it and nothing in it is on a hot path.
 *
 * This check exists because the cheapest way to make that document read as
 * finished is to invent a cause for it, and a plausible wrong cause costs
 * the next investigator the measurement the document was written to keep.
 * A session that genuinely FINDS the answer records it and deletes this
 * check in the same change -- which is a deliberate act, and the point.
 */
function checkUnexplainedJumpStandsRecorded(): void {
  const path = join(REPO_ROOT, "docs", "design", "suite-cost.md");
  let note: string;
  try {
    note = readFileSync(path, "utf8");
  } catch {
    fail(
      "docs/design/suite-cost.md is missing. It carries the per-session measurement, what each " +
        "lapsed protection was, and what is still unknown -- without it the next session " +
        "measures the same thing again from nothing.",
    );
    return;
  }
  if (!/not explained|unexplained/i.test(note)) {
    fail(
      "docs/design/suite-cost.md no longer says the sessions 98-to-99 jump is unexplained. If " +
        "the cause has been found, record the evidence and remove this check in the same " +
        "change; a document that stops admitting the gap without closing it is worse than none.",
    );
  }
}

// --- The control --------------------------------------------------------------

checkWorkerPriority();
const present = checkWalkthroughBudget();
checkDeclaredCount(present);
checkUnexplainedJumpStandsRecorded();

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`check-suite-cost: ${problem}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "check-suite-cost: worker priority yields to the operator; " +
      `${String(present.length)} walkthroughs declared, present and correctly counted; ` +
      "the measurement keeps its open question.\n",
  );
}
