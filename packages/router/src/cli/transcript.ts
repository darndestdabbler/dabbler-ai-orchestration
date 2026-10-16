// `dabbler transcript` -- render sessions already on disk.
//
// A driven session renders its own at the Log phase, so this verb is for
// the sessions that came BEFORE the one you are in: a developer a dozen
// sessions into a consumer project asks for the dozen at once, from records
// the framework wrote anyway. It reads and writes files and spends nothing.
//
// **An existing transcript is never overwritten.** A file in that directory
// was rendered against a tree that is no longer HEAD -- its head commit says
// so on its own first line -- and quietly replacing it would hand the reader
// a page that describes one session and is stamped with another's tree. A
// path already taken is said and skipped, and the range goes on.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { TRANSCRIPTS_DIRNAME, runGit } from "../journal.ts";
import {
  renderSessionTranscript,
  sessionTranscriptName,
  type JobCarry,
} from "../transcript.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler transcript [-h] --from N [--to M] [--full]",
    "                          [--out DIR] [--commit]",
    "                          [--sessions-dir SESSIONS_DIR]",
    "",
    "  Render each session in the range as one self-contained HTML page,",
    "  from records already on disk. Nothing is dispatched and nothing is",
    "  billed. A page that already exists is left exactly as it is.",
    "",
    "options:",
    "  --from N                 the first session to render (required)",
    "  --to M                   the last; the same as --from when absent",
    "  --full                   carry every job's output, not only the failed ones'",
    `  --out DIR                where the pages land; ${TRANSCRIPTS_DIRNAME}/ when absent`,
    "  --commit                 commit what was written, in one commit",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

interface Parsed {
  readonly from: number;
  readonly to: number;
  readonly jobs: JobCarry;
  readonly out: string | undefined;
  readonly commit: boolean;
  readonly sessionsDir: string | undefined;
}

/** The arguments, or the one sentence saying why they are not arguments. */
export function parseTranscriptArgs(argv: readonly string[]): Parsed | string {
  let from: number | undefined;
  let to: number | undefined;
  let jobs: JobCarry = "failed";
  let out: string | undefined;
  let commit = false;
  let sessionsDir: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--from" || token === "--to") {
      const parsed = Number(value);
      if (value === undefined || !Number.isInteger(parsed) || parsed < 1) {
        return `${token} takes a session number`;
      }
      if (token === "--from") from = parsed;
      else to = parsed;
      index += 1;
      continue;
    }
    if (token === "--out" || token === "--sessions-dir") {
      if (value === undefined) return `${token} takes a path`;
      if (token === "--out") out = value;
      else sessionsDir = value;
      index += 1;
      continue;
    }
    if (token === "--full") {
      jobs = "all";
      continue;
    }
    if (token === "--commit") {
      commit = true;
      continue;
    }
    return `unrecognized arguments: ${token}`;
  }

  if (from === undefined) return "--from names the first session to render";
  // One session is the common case and `--to` is noise for it; a range that
  // runs backwards is a typo, and rendering nothing would look like success.
  const last = to ?? from;
  if (last < from) return `--to ${last} is before --from ${from}`;
  return { from, to: last, jobs, out, commit, sessionsDir };
}

export function transcriptVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const parsed = parseTranscriptArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler transcript: ${parsed}\n`);
    return EXIT_USAGE;
  }

  let root: string | null;
  try {
    root = repoRootFor(resolveSessionsDir(parsed.sessionsDir));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`transcript: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (root === null) {
    writeErr("transcript: not inside a git repository\n");
    return EXIT_USAGE;
  }

  const directory = parsed.out ?? join(root, TRANSCRIPTS_DIRNAME);
  mkdirSync(directory, { recursive: true });

  const written: string[] = [];
  for (let session = parsed.from; session <= parsed.to; session += 1) {
    const path = join(directory, sessionTranscriptName(session));
    if (existsSync(path)) {
      writeOut(`transcript: session ${session} already has one at ${path}; left as it is\n`);
      continue;
    }
    writeFileSync(path, renderSessionTranscript(root, session, { jobs: parsed.jobs }), "utf8");
    written.push(path);
    writeOut(`transcript: session ${session} -> ${path}\n`);
  }

  if (written.length === 0) {
    writeOut("transcript: nothing written.\n");
    return EXIT_OK;
  }
  if (!parsed.commit) return EXIT_OK;

  const added = runGit(root, ["add", "--", ...written]);
  if (added.code !== 0) {
    writeErr(`transcript: refused -- git add failed: ${added.stderr.trim()}\n`);
    return EXIT_REFUSED;
  }
  const subject =
    parsed.from === parsed.to
      ? `Transcript for session ${parsed.from}`
      : `Transcripts for sessions ${parsed.from}-${parsed.to}`;
  const committed = runGit(root, ["commit", "-m", subject, "--", ...written]);
  if (committed.code !== 0) {
    writeErr(`transcript: refused -- git commit failed: ${committed.stderr.trim()}\n`);
    return EXIT_REFUSED;
  }
  writeOut(`transcript: committed ${written.length} page(s).\n`);
  return EXIT_OK;
}
