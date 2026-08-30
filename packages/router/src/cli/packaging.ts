// `dabbler packaging` -- step (f): pack the session's work and push it to the
// declared feed.
//
// Only a session that declared itself releasable at step (a) may publish, and
// only after the evidence for (a) through (e) exists. `--dry-run` shows the
// gates and stops: it is a rehearsal, so it is never filed.

import { detectPackaging } from "../bootstrap/detect.ts";
import { loadConfig } from "../config.ts";
import { repoRootFor, resolveSessionsDir } from "../evidence.ts";
import { packagingPath, readPackaging } from "../ledger.ts";
import {
  type PackagingRun,
  PackagingConfigError,
  PackagingError,
  loadDeclaration,
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

/**
 * What a dry run would do, said in sentences rather than in a config dump.
 *
 * The operator is not reading this to audit argv. They are reading it to
 * answer three questions -- what gets built, where it goes, and what is
 * standing in the way -- and a rehearsal that printed the gate rows alone
 * answered only the third. A repository that declares no packaging says so as
 * a DECLARATION here, with what was detected and what is missing, because
 * "publishes nothing" and "you have not told me how to publish" are the same
 * silence and not the same fact.
 */
function explain(sessionsDir: string, run: PackagingRun): string {
  const root = repoRootFor(sessionsDir);
  const lines: string[] = [];
  const declaration = root === null ? null : loadDeclaration(loadConfig());
  if (declaration === null) {
    const reading = root === null ? null : detectPackaging(root);
    if (reading?.recipe) {
      // NOT a declaration. A repository whose build files say they are meant
      // to be published, and whose feed question is still open, is waiting on
      // an answer -- and calling that "publishes nothing" tells the operator
      // the state is settled one sentence before saying it is not.
      lines.push(
        "This repository publishes nothing YET -- not as a declaration, but " +
          "because the two answers that would let it are still open.",
      );
      lines.push(
        `Its build files say it is meant to: they look packable with ` +
          `\`${reading.recipe.pack.join(" ")}\`. Two answers are all that is ` +
          "missing -- which feed, and the NAME of the credential. " +
          "`dabbler owed list` has both questions waiting.",
      );
    } else {
      lines.push("This repository publishes nothing today, and that is a declaration.");
      if (reading?.reason) lines.push(`Nothing was detected: ${reading.reason}`);
    }
    return lines.join("\n");
  }

  lines.push(`It would pack with:   ${declaration.pack.argv.join(" ")}`);
  lines.push(`It would push to:     ${declaration.push.feed}`);
  lines.push(
    `Using the credential named ${declaration.push.secret}, which is read ` +
      "at the moment of the push and written nowhere.",
  );
  const failed = run.gates.filter((gate) => !gate.passed);
  if (failed.length === 0) {
    lines.push("Every gate the close reads passes, so a real run would publish.");
  } else {
    lines.push(
      `Waiting on ${failed.length} gate(s): ` +
        failed.map((gate) => `${gate.name} (${gate.remediation})`).join("; "),
    );
  }
  if (run.refusal) lines.push(run.refusal);
  return lines.join("\n");
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
    (parsed.json
      ? dumps(runAsRecord(run), { indent: 2 })
      : parsed.dryRun
        ? `${explain(sessionsDir, run)}\n\n${render(run)}`
        : render(run)) + "\n",
  );
  return runIsPublished(run) || run.ready ? EXIT_OK : EXIT_ERROR;
}
