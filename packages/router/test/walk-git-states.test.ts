// One repository, walked through the states the gates and the evidence
// readers care about. Each milestone reads real git through the thin
// readers and judges it with the pure judges; the walk stops at the first
// wrong fact, because every later milestone stands on the earlier ones.
//
// This file is the contract band -- the git behaviours the router relies on,
// pinned against a real repository -- and the gates' integration tests, in
// one place. Everything else in the suite feeds facts to the judges.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";

import { sessionRoundRefs, treePaths } from "../src/evidence.ts";
import {
  judgePushState,
  materialPaths,
  readPushFacts,
  readWorktreeStatus,
} from "../src/gates.ts";
import {
  changedPathsBetween,
  objectExists,
  roundRef,
  runGit,
  runGitBinary,
  snapshotWorktreeTree,
} from "../src/journal.ts";
import { git, gitOut, makeRepo } from "./support/repo.ts";

const SESSIONS = "docs/sessions";
const HEX40 = /^[0-9a-f]{40}$/;

// Fail-first: a milestone that fails marks the walk broken, and every later
// milestone is skipped rather than failing for the earlier reason.
let broken: string | null = null;
function milestone(name: string, body: () => void): void {
  it(name, (t: TestContext) => {
    if (broken !== null) {
      t.skip(`not reached: '${broken}' failed first`);
      return;
    }
    try {
      body();
    } catch (error) {
      broken = name;
      throw error;
    }
  });
}

const repo = makeRepo(
  {
    "a.txt": "one\n",
    "b.txt": "two\n",
    "dir/nested.txt": "n\n",
    "a b.txt": "s\n",
    "crlf.txt": "a\r\nb\r\n",
    "lf.txt": "a\nb\n",
  },
  { origin: true },
);
const headTree = (): string => gitOut(repo, "rev-parse", "HEAD^{tree}");
const seedTree = headTree();

describe("a repository walked through the states the close gates read", () => {
  milestone("a fresh checkout is clean, on main, tracking its origin, and its identifiers are bare hex", () => {
    assert.equal(readWorktreeStatus(repo).text, "");
    assert.deepEqual(materialPaths(readWorktreeStatus(repo).text, SESSIONS), []);
    // affected.ts and drive.ts read rev-parse output as an identifier with
    // no framing: bare hex after journal's newline strip, no CR on Windows.
    assert.match(runGit(repo, ["rev-parse", "HEAD"]).stdout, HEX40);
    assert.match(seedTree, HEX40);
    assert.equal(runGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"]).stdout, "main");
    assert.equal(runGit(repo, ["remote"]).stdout, "origin");
    assert.equal(runGit(repo, ["remote", "get-url", "origin"]).code, 0);
    assert.deepEqual(judgePushState(readPushFacts(repo)), [true, ""]);
    // The worktree snapshot of a clean checkout is HEAD's own tree.
    assert.equal(snapshotWorktreeTree(repo), seedTree);
  });

  milestone("an untracked file is work, and the snapshot captures it where a tree diff would not", () => {
    writeFileSync(join(repo, "new.txt"), "n\n", "utf8");
    const status = readWorktreeStatus(repo).text;
    assert.ok(status.split("\n").includes("?? new.txt"), status);
    assert.deepEqual(materialPaths(status, SESSIONS), ["new.txt"]);
    const snapshot = snapshotWorktreeTree(repo);
    assert.ok(snapshot !== null && HEX40.test(snapshot));
    assert.deepEqual(changedPathsBetween(repo, seedTree, snapshot), ["new.txt"]);
    // The snapshot borrows a temporary index and leaves the real one alone.
    assert.equal(runGit(repo, ["diff", "--cached", "--quiet"]).code, 0);
  });

  milestone("a modified tracked file is work, first porcelain line included, and staging shows in the exit code", () => {
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    const status = readWorktreeStatus(repo).text;
    const lines = status.split("\n");
    assert.ok(lines.includes(" M a.txt"), status);
    assert.ok(lines.includes("?? new.txt"), status);
    assert.deepEqual(materialPaths(status, SESSIONS), ["a.txt", "new.txt"]);
    // bootstrap.ts reads staged-ness from `diff --cached --quiet` alone.
    assert.equal(runGit(repo, ["diff", "--cached", "--quiet", "--", "a.txt"]).code, 0);
    git(repo, "add", "a.txt");
    assert.equal(runGit(repo, ["diff", "--cached", "--quiet", "--", "a.txt"]).code, 1);
  });

  milestone("a staged deletion is work, and the deleted file's bytes are still readable at HEAD, CRLF intact", () => {
    git(repo, "rm", "-q", "crlf.txt");
    const status = readWorktreeStatus(repo).text;
    assert.ok(status.split("\n").includes("D  crlf.txt"), status);
    assert.ok(materialPaths(status, SESSIONS).includes("crlf.txt"));
    // evidence.ts reads file content at a tree through the binary path:
    // exact bytes, no newline translation.
    const blob = runGitBinary(repo, ["cat-file", "blob", `${seedTree}:crlf.txt`]);
    assert.equal(blob.code, 0);
    assert.equal(blob.stdout.toString("utf8"), "a\r\nb\r\n");
  });

  milestone("a commit ahead of its upstream is refused by the push gate with the count, and the diff names exactly the change", () => {
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "work");
    assert.equal(readWorktreeStatus(repo).text, "");
    const facts = readPushFacts(repo);
    assert.equal(facts.ahead, 1);
    assert.deepEqual(judgePushState(facts), [
      false,
      "branch 'main' is 1 commit(s) ahead of origin/main; run: git push",
    ]);
    // facts.ts and the selector diff trees NUL-separated with no quoting;
    // evidence.ts enumerates a tree the same way, nested paths with forward
    // slashes and spaces raw; facts.ts enumerates tracked files likewise.
    assert.deepEqual(changedPathsBetween(repo, seedTree, headTree()), ["a.txt", "crlf.txt", "new.txt"]);
    const paths = treePaths(repo, headTree());
    assert.ok(paths.includes("dir/nested.txt") && paths.includes("a b.txt"), paths.join(","));
    const tracked = runGit(repo, ["ls-files"]).stdout.split("\n");
    assert.ok(tracked.includes("dir/nested.txt") && tracked.includes("a b.txt"));
  });

  milestone("a round ref anchors a tree and reads back under its prefix, with internal newlines kept", () => {
    const tree = headTree();
    assert.equal(objectExists(repo, tree), true);
    assert.equal(objectExists(repo, "0123456789012345678901234567890123456789"), false);
    git(repo, "update-ref", roundRef(1, 1), gitOut(repo, "rev-parse", "HEAD"));
    git(repo, "update-ref", roundRef(1, 2), gitOut(repo, "rev-parse", "HEAD"));
    assert.deepEqual(sessionRoundRefs(repo, 1), [roundRef(1, 1), roundRef(1, 2)]);
    // journal strips only the OUTER newlines of what git printed.
    const listing = runGit(repo, ["for-each-ref", "--format=%(refname)", "refs/dabbler/"]).stdout;
    assert.equal(listing, `${roundRef(1, 1)}\n${roundRef(1, 2)}`);
  });

  milestone("pushed, the gate passes again", () => {
    git(repo, "push", "-q", "origin", "main");
    assert.deepEqual(judgePushState(readPushFacts(repo)), [true, ""]);
  });

  milestone("with the upstream unset, the gate names the command that sets one", () => {
    git(repo, "branch", "--unset-upstream");
    const facts = readPushFacts(repo);
    assert.equal(facts.upstream, null);
    assert.deepEqual(judgePushState(facts), [
      false,
      "branch 'main' has no upstream; run: git push --set-upstream <remote> main",
    ]);
  });

  milestone("with the remote gone, the local-only marker waives the gate and its absence does not", () => {
    git(repo, "remote", "remove", "origin");
    assert.equal(runGit(repo, ["remote"]).stdout, "");
    assert.notEqual(runGit(repo, ["remote", "get-url", "origin"]).code, 0);
    assert.equal(judgePushState(readPushFacts(repo))[0], false);
    mkdirSync(join(repo, ".dabbler"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "local-only"), "", "utf8");
    const facts = readPushFacts(repo);
    assert.equal(facts.localOnlyMarker, true);
    assert.equal(facts.hasRemote, false);
    assert.equal(judgePushState(facts)[0], true);
  });

  milestone("a detached HEAD is refused", () => {
    git(repo, "checkout", "-q", "--detach");
    const detached = runGit(repo, ["symbolic-ref", "--short", "-q", "HEAD"]);
    assert.notEqual(detached.code, 0);
    assert.equal(detached.stdout, "");
    assert.deepEqual(judgePushState(readPushFacts(repo)), [
      false,
      "HEAD is detached; check out a branch before close-out",
    ]);
    git(repo, "checkout", "-q", "main");
  });

  milestone("autocrlf=true rewrites checkout bytes while status stays clean, and a -text attribute defeats it", () => {
    // The session-66 class: content changed on disk, record silent. This is
    // the incident that hid a red CI suite for weeks.
    git(repo, "config", "core.autocrlf", "true");
    rmSync(join(repo, "lf.txt"));
    git(repo, "checkout", "--", "lf.txt");
    assert.equal(readFileSync(join(repo, "lf.txt"), "utf8"), "a\r\nb\r\n");
    const status = readWorktreeStatus(repo).text;
    assert.ok(!status.includes("lf.txt"), status);
    assert.deepEqual(materialPaths(status, SESSIONS), []);
    // And the fix that ended it. Only the attribute is staged: `add -A` here
    // would commit the CRLF working copy as the blob and prove nothing.
    writeFileSync(join(repo, ".gitattributes"), "* -text\n", "utf8");
    git(repo, "add", ".gitattributes");
    git(repo, "commit", "-q", "-m", "attributes");
    rmSync(join(repo, "lf.txt"));
    git(repo, "checkout", "--", "lf.txt");
    assert.equal(readFileSync(join(repo, "lf.txt"), "utf8"), "a\nb\n");
  });
});
