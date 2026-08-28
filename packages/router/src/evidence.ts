// Where the record lives, and the two writes the record modules make into
// it.
//
// Session 27 ports `evidence` whole -- the tree snapshots, the covered
// surface, the run-of-record binding. What is here is the slice `ledger`
// and `writers` cannot be written without: the filenames at the sessions
// root, the round anchor `append_round` takes in the same call, and the
// digest ledger every sanctioned state write appends to.
//
// The filenames are constants because nothing chooses where a record
// lands. A caller that could name the file could name a second one, and
// the record's whole claim is that there is one.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { RUNS_DIRNAME, platformNewlines, repoRootFor, runGit } from "./journal.ts";
import { dumps } from "./pythonJson.ts";

export const SESSIONS_DIRNAME = "sessions";
const SESSIONS_PARENT = "docs";

/** The files that live at the sessions root. */
export const STATE_FILENAME = "sessions.json";
export const ACTIVITY_LOG_FILENAME = "activity-log.json";
export const SESSION_PLAN_FILENAME = "session-plan.md";

export function sessionsDirFor(repoRoot: string): string {
  return join(repoRoot, SESSIONS_PARENT, SESSIONS_DIRNAME);
}

/**
 * The inverse of `sessionsDirFor`, here so the two directions of one rule
 * cannot disagree.
 *
 * A caller holding a sessions root needs the repository root to reach
 * `.dabbler/runs/`, and asking git for it would make the answer depend on
 * the tree being a checkout -- which the projection's own fixtures are not.
 */
export function repoRootFromSessionsDir(sessionsDir: string): string {
  return resolve(sessionsDir, "..", "..");
}

/** No sessions root could be derived from where the caller stood. */
export class SessionsRootNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionsRootNotFoundError";
  }
}

/**
 * The sessions root for the repository the caller is standing in.
 *
 * An explicit path wins so a caller outside the tree can still address a
 * repository; otherwise the root is derived from the working directory.
 * Nothing here selects *which* sessions to act on -- that is the session
 * number's job.
 */
export function resolveSessionsDir(explicit?: string | null, start?: string): string {
  if (explicit) return String(explicit);
  const from = start ?? process.cwd();
  const root = repoRootFor(from);
  if (root === null) {
    throw new SessionsRootNotFoundError(
      `not inside a git repository: ${from}. Run from the repository, or ` +
        "pass --sessions-dir.",
    );
  }
  return sessionsDirFor(root);
}

// --- Round anchors -----------------------------------------------------------

export const ROUND_REF_NAMESPACE = "refs/dabbler/rounds";
export const ROUND_REFSPEC = `+${ROUND_REF_NAMESPACE}/*:${ROUND_REF_NAMESPACE}/*`;

/**
 * The identity an anchor commit is made under.
 *
 * Fixed, and not the operator's: an anchor is the router's bookkeeping, and
 * a commit carrying a person's name would read in `git log` as work they
 * did.
 */
const ANCHOR_IDENTITY: Record<string, string> = {
  GIT_AUTHOR_NAME: "dabbler-ai-router",
  GIT_AUTHOR_EMAIL: "router@dabbler.invalid",
  GIT_COMMITTER_NAME: "dabbler-ai-router",
  GIT_COMMITTER_EMAIL: "router@dabbler.invalid",
};

export function roundRef(sessionNumber: number, roundNumber: number): string {
  return `${ROUND_REF_NAMESPACE}/s${Math.trunc(sessionNumber)}/r${Math.trunc(roundNumber)}`;
}

/**
 * Whether `rev` names an object this store actually holds.
 *
 * A round snapshot is written through a throwaway index, so on its own it
 * is garbage-collectable and unpushable; `anchorRoundTree` is what makes it
 * reachable, and a round recorded before that existed -- or fetched by a
 * clone that lacks `ROUND_REFSPEC` -- still arrives with its baseline left
 * behind.
 */
export function objectExists(repoRoot: string, rev: string): boolean {
  return runGit(repoRoot, ["cat-file", "-e", `${rev}^{object}`]).code === 0;
}

/**
 * Make `tree` reachable: wrap it in a commit and point the round's ref at
 * it. Returns the anchoring commit, or null when the tree is not in this
 * store -- a row can only anchor an object it has, and inventing one would
 * be a baseline nobody snapshotted.
 */
export function anchorRoundTree(
  repoRoot: string,
  sessionNumber: number,
  roundNumber: number,
  tree: string,
): string | null {
  if (!objectExists(repoRoot, tree)) return null;
  const written = runGit(
    repoRoot,
    [
      "commit-tree",
      tree,
      "-m",
      `dabbler round snapshot: session ${sessionNumber} round ${roundNumber}`,
    ],
    { env: ANCHOR_IDENTITY },
  );
  const commit = written.stdout.trim();
  if (written.code !== 0 || !commit) return null;
  const updated = runGit(repoRoot, [
    "update-ref",
    roundRef(sessionNumber, roundNumber),
    commit,
  ]);
  return updated.code === 0 ? commit : null;
}

// --- Digests -----------------------------------------------------------------

export function hashBytes(raw: Buffer | Uint8Array): string {
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * `sha256:<hex>` of the raw, unsummarized text -- no normalization, no
 * trimming; the prefix is part of the value.
 */
export function hashOutput(raw: unknown): string {
  const text = typeof raw === "string" ? raw : raw === null || raw === undefined ? "" : String(raw);
  return hashBytes(Buffer.from(text, "utf8"));
}

// --- state-writes.jsonl ------------------------------------------------------

const STATE_WRITES_FILENAME = "state-writes.jsonl";

function stateWritesPath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), STATE_WRITES_FILENAME);
}

/**
 * The digest of `sessions.json` as it stands, or null when it cannot be
 * read.
 *
 * The file is read as TEXT, the way Python reads it, so a CRLF checkout
 * and an LF one hash the same -- the digest is over what the record says,
 * not over how a checkout spelled its line endings.
 */
export function stateFileHash(sessionsDir: string): string | null {
  try {
    const text = readFileSync(join(sessionsDir, STATE_FILENAME), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
    return hashOutput(text);
  } catch {
    return null;
  }
}

/**
 * One row per sanctioned write of `sessions.json`.
 *
 * Best-effort by contract: outside a git repository -- a unit test, a
 * scratch directory -- the record is simply not kept, because there is
 * nowhere it belongs. A write that failed to be recorded must never fail
 * the write it was recording.
 */
export function recordStateWrite(sessionsDir: string, repoRoot?: string | null): void {
  const root = repoRoot ?? repoRootFor(sessionsDir);
  if (!root) return;
  const digest = stateFileHash(sessionsDir);
  if (digest === null) return;
  const path = stateWritesPath(root);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, platformNewlines(dumps({ hash: digest }) + "\n"), {
      encoding: "utf8",
    });
  } catch {
    // See the docstring: recording is never allowed to fail a write.
  }
}
