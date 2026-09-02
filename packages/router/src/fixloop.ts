// The complete suite, and the bounded fix loop a red run opens.
//
// The suite runs against the tree that includes the tests the verifier wrote,
// because a suite run before them proves the state of the code without the
// one reading that was bought to challenge it.
//
// **The envelope is the feature.** A model asked to fix failing tests will
// otherwise revise whatever it notices on the way past, which is the thing
// the operator excluded by name. So a fix round is handed only the failing
// test names, their output, and the files those failures implicate; and its
// writes are confined to the session's own diff plus those implicated files.
// A write outside the envelope is refused before any bytes are written -- a
// boundary, not a sentence in a prompt asking nicely.
//
// The confinement is complete rather than a first line of defence: the model
// has no filesystem on any transport. It describes a file in a fenced block
// and `agency.ts` is what opens one, so there is no second route by which a
// fix could reach a path this module did not allow.
//
// **Nothing here solicits a finding.** The round's job is the named failure.
// An observation about anything else is recorded verbatim and acted on by
// nobody, because a fix round that also reports is a fix round that also
// expands.
//
// What counts as a failure is read out of the runner's own output against the
// test root this repository declares, so the parser knows what a test is from
// the same declaration selection reads. It fails closed in both directions: a
// failure it cannot find narrows the envelope rather than widening it, and a
// red run whose output names no test it recognises opens no fix round at all.

import { statSync } from "node:fs";
import { join } from "node:path";

import {
  applyWrites,
  briefing,
  DEFAULT_READ_BUDGET,
  type AgencyGrant,
  grantForTransport,
  relativePosix,
  type TestWrite,
  WRITE_LABEL_FIX,
  writeAccepted,
  writeRow,
} from "./agency.ts";
import {
  type CheckRun,
  declaresTests,
  displayCommand,
  execute,
  loadSelectionConfig,
  namesATest,
  type SelectionConfig,
  STAGE_FINAL_FULL,
  timeoutFor,
} from "./checks.ts";
import { resolveTransport } from "./config.ts";
import { changedPathsBetween, snapshotWorktreeTree } from "./journal.ts";
import { NoCandidateError, route } from "./route.ts";
import { ROLE_GENERATOR } from "./selection.ts";
import { PhaseError, suitesFor } from "./testphase.ts";
import { readText } from "./textfile.ts";

export const TASK_TYPE = "code-fix";

/**
 * The words a runner puts beside a test it did not pass. A closed set, and
 * deliberately not a grammar for any one runner: this is a scan of output for
 * a declared test path standing next to a word meaning failure.
 *
 * Incompleteness here is safe by construction. A failure this misses is a
 * file the envelope does not open, so the loop can only ever be narrower than
 * the failures warrant -- and a red run that names nothing recognisable is
 * refused rather than sent to a fix round with no target.
 */
export const FAILURE_MARKERS: readonly string[] = [
  "FAILED",
  "ERROR",
  "FAIL",
  "FAILURE",
];

/**
 * How much of the run's output the fix round is shown. The whole run is in
 * the record; what goes to the model is the end, where runners put the
 * summary of what failed.
 */
export const MAX_OUTPUT_CHARS = 20_000;

/**
 * How much of one implicated file is shown. A file over this is named rather
 * than quoted: a truncated source file invites a fix written against half a
 * function.
 */
export const MAX_FILE_CHARS = 20_000;

/**
 * A path-shaped token: something with a directory separator or an extension,
 * optionally carrying the `::selector` suffix runners append to name one test
 * inside a file. A leading drive letter is part of the token, because a
 * traceback on Windows prints one and a path that stops at the colon is not
 * the path the runner named.
 *
 * `~` is in the class because it is in PATHS, not because it is punctuation
 * a runner might print: every Windows 8.3 short name carries one
 * (`C:\Users\RUNNER~1\...`), and a frame naming such a path matched only the
 * tail after the tilde -- which resolves under no repository, is dropped,
 * and leaves the fix round an envelope with the failing file missing from
 * it. Invisible on a machine whose paths have no short form, and true of
 * every CI runner.
 */
const DRIVE = String.raw`(?:[A-Za-z]:[\\/])?`;
const TOKEN_BODY = `${DRIVE}[A-Za-z0-9_~./\\\\-]*[A-Za-z0-9_~-]\\.[A-Za-z0-9_]+`;
const TOKEN = new RegExp(`${TOKEN_BODY}(?:::[^\\s,)"']+)?`, "g");

/**
 * The same token, but only where the output points *at* it -- a line number
 * or a test selector attached to the path. Runners name a file with a
 * position when they are pointing at code that failed, and name it bare when
 * they are reporting their own configuration; requiring the position is what
 * keeps a header line like `configfile: pytest.ini` out of the envelope.
 *
 * Two spellings, because runners have two: the position immediately after the
 * path (`app.py:4`, `a.js:10:5`, `File.cs:line 12`), and the path quoted with
 * the position beside it (`File "app.py", line 4`).
 */
const LOCATED = new RegExp(`${TOKEN_BODY}(?=:\\s*\\d|::|:\\s*line\\b)`, "gi");
const QUOTED_LOCATED = new RegExp(
  `["'](${TOKEN_BODY})["'][,:]?\\s+line\\s+\\d+`,
  "gi",
);

/** Where a round puts what it noticed and was not asked about. */
const OBSERVATIONS = /^#{1,6}\s*OBSERVATIONS\s*$/i;
const HEADING = /^#{1,6}\s+/;

/**
 * The loop could not be run. Never an outcome -- a fix round that did not
 * happen and one whose writes were all refused are different facts.
 */
export class FixLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixLoopError";
  }
}

/**
 * One test the runner did not pass: what it was called, and the declared test
 * file that name belongs to.
 */
export interface Failure {
  readonly name: string;
  readonly path: string;
}

/**
 * Where a fix round may write: the session's own diff, plus the files the
 * failures implicate.
 *
 * Membership is exact. A prefix rule would let one changed file in a package
 * open the whole package, which is the sprawl the envelope exists to stop --
 * and every entry here is a file, because both halves are produced by git and
 * by the runner rather than typed.
 */
export interface Envelope {
  readonly sessionPaths: readonly string[];
  readonly implicated: readonly string[];
}

export function envelopePaths(envelope: Envelope): string[] {
  return [...new Set([...envelope.sessionPaths, ...envelope.implicated])].sort();
}

export function envelopeAllows(envelope: Envelope, rel: string): boolean {
  return Boolean(rel) && envelopePaths(envelope).includes(rel);
}

export function envelopeRow(envelope: Envelope): Record<string, unknown> {
  return {
    sessionPaths: [...envelope.sessionPaths],
    implicated: [...envelope.implicated],
    paths: envelopePaths(envelope),
  };
}

/**
 * One fix round: who fixed, what the framework let them write, and what they
 * mentioned that nobody will act on.
 */
export interface FixRound {
  readonly provider: string;
  readonly model: string;
  readonly transport: string;
  readonly writes: readonly TestWrite[];
  readonly observations: readonly string[];
  readonly simulated: boolean;
}

export function fixWritten(round: FixRound): string[] {
  return round.writes.filter((w) => writeAccepted(w)).map((w) => w.path);
}

export function fixRefused(round: FixRound): string[] {
  return round.writes.filter((w) => !writeAccepted(w)).map((w) => w.path);
}

export function fixRow(round: FixRound): Record<string, unknown> {
  return {
    provider: round.provider,
    model: round.model,
    transport: round.transport,
    simulated: round.simulated,
    written: fixWritten(round),
    writes: round.writes.map((w) => writeRow(w)),
    observations: [...round.observations],
  };
}

function posix(path: string): string {
  return String(path).split("\\").join("/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Run the complete suite against the tree, and report what it said.
 *
 * Returns one `CheckRun` per suite that owns some of the tests the verifier
 * wrote, resolved through `testphase.suitesFor` so that "which suite answers
 * for these tests" has one implementation. Plural because a repository
 * running two ecosystems has two complete suites, and running only the first
 * would call one ecosystem's green the whole tree's.
 *
 * Each command is the declared one, unnarrowed: this stage is the whole suite
 * by definition, and a targeted command here would be a smaller claim wearing
 * the same name.
 */
export async function runSuite(
  repoRoot: string,
  config: Record<string, unknown>,
  authored: readonly string[],
): Promise<CheckRun[]> {
  const paths = [...new Set(authored.filter((p) => p))];
  if (paths.length === 0) {
    throw new FixLoopError(
      "no authored test to include, so this would be the suite as it stood " +
        "before the verifier read anything. The complete suite runs against " +
        "the tree including the tests it wrote.",
    );
  }
  let groups;
  try {
    groups = suitesFor(config, paths);
  } catch (error) {
    if (error instanceof PhaseError) throw new FixLoopError(error.message);
    throw error;
  }
  const runs: CheckRun[] = [];
  for (const [check] of groups) {
    const tree = snapshotWorktreeTree(repoRoot);
    if (tree === null) {
      throw new FixLoopError(
        `could not snapshot the working tree at ${repoRoot}. Every run is ` +
          "judged against a tree id, so a run that cannot name the tree it " +
          "measured proves nothing about it.",
      );
    }
    let timeout: number;
    try {
      timeout = timeoutFor(check, config);
    } catch (error) {
      throw new FixLoopError(
        "run_policy.check_timeout_seconds is not declared, and an " +
          "unbounded suite run is how a loop stops being bounded: " +
          `${(error as Error).message}`,
      );
    }
    runs.push(
      await execute(repoRoot, check, displayCommand(check), {
        stage: STAGE_FINAL_FULL,
        treeDigest: tree,
        timeoutSeconds: timeout,
      }),
    );
  }
  return runs;
}

function candidates(line: string): string[] {
  return [...line.matchAll(TOKEN)].map((m) => m[0]);
}

/** Compiled once: this runs per line over the whole of a suite's output. */
const MARKERS = FAILURE_MARKERS.map(
  (marker) => new RegExp(`(?<![A-Z])${marker}(?![A-Z])`),
);

function marked(line: string): boolean {
  const upper = line.toUpperCase();
  return MARKERS.some((marker) => marker.test(upper));
}

/**
 * A path token as this repository would spell it, or `""`.
 *
 * Runners print absolute paths as readily as relative ones -- a Windows
 * traceback names `C:\repo\app.py` and a subprocess names `/repo/app.py` --
 * so the spelling is preserved until `agency.relativePosix` has placed it
 * against the repository. Normalising first would strip the leading separator
 * and turn an absolute path into a relative one that names something else.
 */
function resolveToken(repoRoot: string | null, token: string): string {
  const path = String(token).split("::")[0];
  if (repoRoot === null) return posix(path);
  return relativePosix(repoRoot, path) ?? "";
}

/**
 * The tests the run named as not passing, in the order it named them.
 *
 * A line qualifies when it stands a declared test path next to a word meaning
 * failure. Both halves are needed: the marker alone matches a test *about*
 * errors, and the path alone matches every line of a verbose run.
 */
export function failures(
  output: string,
  selection: SelectionConfig,
  repoRoot: string | null = null,
): Failure[] {
  const found: Failure[] = [];
  const seen = new Set<string>();
  for (const line of (output || "").split(/\r\n|\r|\n/)) {
    if (!marked(line)) continue;
    for (const token of candidates(line)) {
      const path = resolveToken(repoRoot, token);
      const selector = token.includes("::") ? token.split("::").slice(1).join("::") : "";
      const name = selector ? `${path}::${selector}` : path;
      if (!path || !namesATest(path, selection) || seen.has(name)) continue;
      seen.add(name);
      found.push({ name, path });
    }
  }
  return found;
}

/**
 * The repository files the failures point at.
 *
 * Two sources, and no third: the files the named failing tests live in, and
 * the files the output points at with a position -- `app.py:4`, `main.go:17`,
 * `a.js:10:5`, `File "app.py", line 4`. Whatever the runner, it names a file
 * with a position when it is pointing at code that failed.
 *
 * A path the output merely mentions is not implicated. A runner also prints
 * its own configuration, its rootdir and its plugins, and taking those as
 * implicated would put the suite's own settings inside the envelope -- which
 * would let a fix round reroute the run instead of repairing the code.
 *
 * A token that does not resolve to a file inside the repository is dropped,
 * so a vendored frame in a traceback cannot put `site-packages` in the
 * envelope. Absolute paths a runner prints with a drive letter resolve on
 * this rule too or not at all, which narrows the envelope rather than
 * widening it.
 */
export function implicatedPaths(
  repoRoot: string,
  output: string,
  failing: readonly Failure[] = [],
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const named = [
    ...failing.map((f) => f.path),
    ...[...(output || "").matchAll(LOCATED)].map((m) => m[0]),
    ...[...(output || "").matchAll(QUOTED_LOCATED)].map((m) => m[1]),
  ];
  for (const token of named) {
    const rel = resolveToken(repoRoot, token);
    if (!rel || seen.has(rel)) continue;
    let isFile = false;
    try {
      isFile = statSync(join(repoRoot, rel)).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) continue;
    seen.add(rel);
    found.push(rel);
  }
  return found.sort();
}

/**
 * What this fix round may write to: the session's diff plus the files the
 * failures implicate.
 *
 * The session half is measured with the machinery every other fix delta in
 * this package is measured with, against the tree the session started from. A
 * diff git cannot answer is refused rather than treated as empty: an empty
 * envelope would refuse every write and read afterwards as a model that
 * proposed nothing.
 *
 * The implicated half is derived from the failures this repository's own
 * declaration lets the parser recognise, not from everything the runner
 * printed.
 */
export function buildEnvelope(
  repoRoot: string,
  baseTree: string,
  output: string,
  selection: SelectionConfig,
): Envelope {
  const current = snapshotWorktreeTree(repoRoot);
  if (current === null) {
    throw new FixLoopError(
      `could not snapshot the working tree at ${repoRoot}, so the session's ` +
        "own diff cannot be measured and the envelope cannot be built.",
    );
  }
  const changed = changedPathsBetween(repoRoot, baseTree, current);
  if (changed === null) {
    throw new FixLoopError(
      `git could not diff ${baseTree} against the working tree. An ` +
        "unmeasurable session diff is not an empty one, and treating it as " +
        "empty would silently refuse every fix.",
    );
  }
  return {
    sessionPaths: changed.map((p) => posix(p)).sort(),
    implicated: implicatedPaths(
      repoRoot,
      output,
      failures(output, selection, repoRoot),
    ),
  };
}

/**
 * What the round noticed and was not asked about, kept verbatim.
 *
 * Recorded because a finding erased is worse than a finding mis-severed, and
 * acted on by nobody because this round's job is the named failure.
 */
export function observations(text: string): string[] {
  const lines = (text || "").split("\r\n").join("\n").split("\n");
  const out: string[] = [];
  let collecting = false;
  for (const line of lines) {
    if (OBSERVATIONS.test(line.trim())) {
      collecting = true;
      continue;
    }
    if (collecting && HEADING.test(line)) break;
    if (collecting && line.trim()) {
      out.push(line.trim().replace(/^[-*]+/, "").trim());
    }
  }
  return out.filter((o) => o);
}

function tail(output: string): string {
  const text = output || "";
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `…\n${text.slice(-MAX_OUTPUT_CHARS)}`;
}

/**
 * The implicated files as `[path, text]`, largest ones named only.
 *
 * Only the implicated half is quoted. The session diff is in the envelope
 * because the fix may need to write there, not because the round is owed a
 * tour of everything the session touched.
 */
export function readEnvelopeFiles(
  repoRoot: string,
  envelope: Envelope,
): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];
  for (const rel of envelope.implicated) {
    let text: string;
    try {
      text = readText(join(repoRoot, rel));
    } catch {
      continue;
    }
    if (text.length > MAX_FILE_CHARS) {
      out.push([rel, `(not shown: ${text.length} characters)`] as const);
    } else {
      out.push([rel, text] as const);
    }
  }
  return out;
}

/**
 * What the fix round is asked for: a repair to a named failure, and nothing
 * else.
 *
 * The write surface is described by `agency.briefing`, so the block the
 * prompt asks for and the block the framework parses are one description.
 */
export function buildPrompt(
  failing: readonly Failure[],
  output: string,
  files: ReadonlyArray<readonly [string, string]>,
  envelope: Envelope,
  grant: AgencyGrant,
): string {
  const body: string[] = [
    "The test suite failed. Fix the failures named below.",
    "",
    "You wrote this code, or you are standing in for whoever did. This " +
      "is not a review: nobody is asking you what you think of it.",
    "",
    "## What failed",
    "",
  ];
  body.push(...failing.map((f) => `- \`${f.name}\``));
  body.push("", "## What the run said", "", "````", tail(output).trimEnd(), "````", "");
  if (files.length > 0) {
    body.push("## The files these failures implicate", "");
    for (const [path, text] of files) {
      body.push(`### \`${path}\``, "", "````", text.trimEnd(), "````", "");
    }
  }

  const brief = briefing(grant);
  if (brief) body.push(brief, "");

  body.push(
    "## How to answer",
    "",
    "**Emit the repaired files and nothing else that matters.** Every " +
      "file goes in its own write block, exactly as described above.",
    "",
    "- **Fix the named failures and nothing else.** A change that is not " +
      "needed by one of the failures above is out of scope, however " +
      "correct it is.",
    "- **Do not weaken a test to make it pass.** A test edited until it " +
      "agrees with the code proves the code agrees with itself.",
    "- **Emit the whole file**, not a patch or a fragment. The framework " +
      "writes what the block contains.",
    "",
    "**You may write only to these paths:**",
    "",
  );
  body.push(...envelopePaths(envelope).map((p) => `- \`${p}\``));
  body.push(
    "",
    "A write to anything else is refused by the framework before " +
      "anything is opened. It is not a request — there is no path by " +
      "which a file outside this list can be changed by this round.",
    "",
    "**No findings are wanted.** If you noticed something unrelated, put " +
      "it under an `## OBSERVATIONS` heading. It will be recorded word for " +
      "word and acted on by nobody, which is the honest treatment: this " +
      "round exists to answer a failing test, and a round that also " +
      "reports is a round that also expands.",
  );
  return body.join("\n");
}

/**
 * Ask for the repair and write the parts of it the envelope allows.
 *
 * Returns `[FixRound, raw response]` -- the raw text is returned so the
 * caller can file it verbatim.
 *
 * No provider is excluded. The exclusion that makes a review cross-vendor is
 * exactly wrong here: this is the author's own repair of the author's own
 * code, and routing it away from them would make a second vendor responsible
 * for work it has not seen.
 */
export async function fix(
  repoRoot: string,
  config: Record<string, unknown>,
  options: {
    failing: readonly Failure[];
    output: string;
    envelope: Envelope;
    transport?: string | null;
    readBudget?: number | null;
  },
): Promise<readonly [FixRound, string]> {
  const { failing, output, envelope } = options;
  if (failing.length === 0) {
    throw new FixLoopError(
      "no failing test to fix. A fix round with no named failure is a model " +
        "invited to revise whatever it notices, which is the one thing the " +
        "envelope exists to prevent.",
    );
  }
  const paths = envelopePaths(envelope);
  if (paths.length === 0) {
    throw new FixLoopError(
      "the envelope is empty, so every write would be refused after the " +
        "call had already been paid for. A session with no diff and no " +
        "implicated file has nothing this round could repair.",
    );
  }

  // Read the implicated files; write the envelope. §3.d says the round
  // receives the failures and the files they implicate, so the reading
  // surface stops there -- a session with an unrelated file in flight must
  // not have it blessed as something this round was invited to look at. The
  // write envelope is wider because §3.d says it is: a fix may need to land
  // in a file the session already changed.
  const scope = [...envelope.implicated];
  const budget = options.readBudget || DEFAULT_READ_BUDGET;

  const grantFor = (forTransport: string): AgencyGrant =>
    grantForTransport(forTransport, {
      scope,
      readBudget: budget,
      allowWrite: true,
      writeEnvelope: paths,
      writeLabel: WRITE_LABEL_FIX,
    });

  // Briefed from the resolved preference; the writes are applied under the
  // grant of the transport the call actually ran on, because a round that
  // fell back could not look however it was briefed.
  const briefed = grantFor(resolveTransport(config, options.transport ?? null));
  const prompt = buildPrompt(
    failing,
    output,
    readEnvelopeFiles(repoRoot, envelope),
    envelope,
    briefed,
  );
  let result;
  try {
    result = await route(prompt, {
      taskType: TASK_TYPE,
      role: ROLE_GENERATOR,
      transport: options.transport ?? null,
    });
  } catch (error) {
    if (error instanceof NoCandidateError) {
      throw new FixLoopError(
        `${error.message}. There is no candidate to repair the failure, so ` +
          "the loop stops here rather than leaving the suite red and the " +
          "record silent about why.",
      );
    }
    throw error;
  }

  const writes = applyWrites(repoRoot, grantFor(result.transport), result.content);
  return [
    {
      provider: result.provider,
      model: result.served_model_id || result.model_name,
      transport: result.transport,
      writes,
      observations: observations(result.content),
      simulated: Boolean(result.metadata?.simulated),
    },
    result.content,
  ] as const;
}

/**
 * This repository's declaration of where its tests live, or a refusal.
 *
 * The failure parser reads the same declaration selection reads, because a
 * framework with a second opinion about what a test is will eventually
 * disagree with itself about which run proved what.
 */
export function selectionFor(config: Record<string, unknown>): SelectionConfig {
  const loaded = loadSelectionConfig(config);
  if (!declaresTests(loaded.config)) {
    throw new FixLoopError(
      "no suite in testing.suites declares where its tests live, so no line " +
        "of the run's output could be confirmed to name a test and no " +
        "failure could be found in it.",
    );
  }
  return loaded.config;
}
