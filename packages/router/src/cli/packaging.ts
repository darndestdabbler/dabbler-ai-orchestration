// `dabbler packaging` -- step (f): pack the session's work and push it to the
// declared feed.
//
// Only a session that declared itself releasable at step (a) may publish, and
// only after the evidence for (a) through (e) exists. `--dry-run` shows the
// gates and stops: it is a rehearsal, so it is never filed.

import { repoRootFor, resolveSessionsDir } from "../evidence.ts";
import { packagingPath, readPackaging } from "../ledger.ts";
import {
  type PackagingRun,
  PackagingConfigError,
  PackagingError,
  packageSession,
  record,
  runAsRecord,
  runIsPublished,
} from "../packaging.ts";
import { readSessionState } from "../progress.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler packaging [-h] [--sessions-dir SESSIONS_DIR] [--dry-run]",
    "                         [--show-record] [--json]",
    "",
    "Step (f): pack the session's work and push it to the declared feed.",
    "Only a session that declared itself releasable at step (a) may publish,",
    "and only after the evidence for (a) through (e) exists.",
    "",
  ].join("\n");
}

const VALUE_FLAGS = new Set(["--sessions-dir"]);
const BARE_FLAGS = new Set(["--dry-run", "--show-record", "--json"]);

interface Parsed {
  readonly sessionsDir?: string;
  readonly dryRun: boolean;
  readonly showRecord: boolean;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): Parsed | string {
  let sessionsDir: string | undefined;
  let dryRun = false;
  let showRecord = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    if (BARE_FLAGS.has(name)) {
      if (equals !== -1) return `argument ${name}: ignored explicit argument`;
      if (name === "--dry-run") dryRun = true;
      else if (name === "--show-record") showRecord = true;
      else json = true;
      continue;
    }
    if (!VALUE_FLAGS.has(name)) return `unrecognized arguments: ${token}`;
    if (equals !== -1) {
      sessionsDir = token.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) return `argument ${name}: expected one argument`;
    sessionsDir = next;
    index += 1;
  }
  return { sessionsDir, dryRun, showRecord, json };
}

function render(run: PackagingRun): string {
  const lines = [`packaging: ${run.ready ? "ready (dry run)" : run.outcome}`];
  for (const gate of run.gates) {
    // The same three marks the close prints. A gate reads the same wherever
    // it is shown, or the two screens disagree about the same fact.
    const mark = gate.inapplicable ? "SKIP" : gate.passed ? "PASS" : "FAIL";
    const note = gate.remediation ? ` — ${gate.remediation}` : "";
    lines.push(`  [${mark}] ${gate.name}${note}`);
  }
  if (run.refusal) lines.push(`  ${run.refusal}`);
  for (const step of run.steps) {
    const code = step.timedOut ? "timed out" : `exit ${step.exitCode}`;
    lines.push(`  ${step.step}: ${code} — ${step.command}`);
  }
  if (run.treeMutated) {
    lines.push(
      `  a declared command changed the repository while it ran ` +
        `(${run.treeDigest} -> ${run.postTreeDigest}). The artifacts ` +
        "were built from a tree nobody verified, so nothing was pushed. " +
        "Send the build's intermediates somewhere outside the " +
        "repository, or ignore them.",
    );
  }
  if (run.artifacts.length > 0) {
    lines.push(`  artifacts: ${run.artifacts.join(", ")}`);
  }
  if (runIsPublished(run)) lines.push(`  published to ${run.feed}`);
  return lines.join("\n");
}

function showRecorded(sessionsDir: string, json: boolean): number {
  const root = repoRootFor(sessionsDir);
  const state = readSessionState(sessionsDir);
  const number =
    state && typeof state["currentSession"] === "number"
      ? (state["currentSession"] as number)
      : null;
  if (root === null || number === null) {
    writeErr("no session is in flight\n");
    return EXIT_ERROR;
  }
  const rows = readPackaging(root, number);
  if (json) {
    writeOut(dumps(rows, { indent: 2 }) + "\n");
    return EXIT_OK;
  }
  const text =
    rows
      .map(
        (row) =>
          `${String(row["recorded_at"])}  ${String(row["outcome"])}  ` +
          `${String(row["refusal"] ?? row["feed"] ?? "")}`,
      )
      .join("\n") ||
    `no packaging attempt recorded; see ${packagingPath(root, number)}`;
  writeOut(text + "\n");
  return EXIT_OK;
}

export async function packagingVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler packaging: error: ${parsed}\n`);
    return EXIT_USAGE;
  }

  const sessionsDir = resolveSessionsDir(parsed.sessionsDir);

  if (parsed.showRecord) return showRecorded(sessionsDir, parsed.json);

  let run: PackagingRun;
  try {
    run = packageSession(sessionsDir, { dryRun: parsed.dryRun });
  } catch (error) {
    if (error instanceof PackagingError || error instanceof PackagingConfigError) {
      writeErr(`packaging: ${error.message}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }

  if (!parsed.dryRun) record(sessionsDir, run);

  writeOut(
    (parsed.json ? dumps(runAsRecord(run), { indent: 2 }) : render(run)) + "\n",
  );
  return runIsPublished(run) || run.ready ? EXIT_OK : EXIT_ERROR;
}
