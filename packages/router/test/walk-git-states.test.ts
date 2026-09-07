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

import { preverifyGate } from "../src/affected.ts";
import { STAGE_TARGETED, displayCommand, execute, makeCheck } from "../src/checks.ts";
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
import { appendRound } from "../src/ledger.ts";
import { POLICY_TARGETED, loadSuitesChecked, recordRun, type SuiteSpec } from "../src/testEvidence.ts";
import { registerSessionStart } from "../src/writers.ts";
import { git, gitOut, makeRepo, writeFiles } from "./support/repo.ts";

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

  milestone("an untracked file is work, a quoted name is decoded, and the snapshot captures both where a tree diff would not", () => {
    writeFileSync(join(repo, "new.txt"), "n\n", "utf8");
    writeFileSync(join(repo, "café.txt"), "c\n", "utf8");
    const status = readWorktreeStatus(repo).text;
    assert.ok(status.split("\n").includes("?? new.txt"), status);
    // git quotes the non-ASCII name in octal; the reader hands back UTF-8.
    assert.ok(status.includes('"caf\\303\\251.txt"'), status);
    assert.deepEqual(materialPaths(status, SESSIONS), ["café.txt", "new.txt"]);
    const snapshot = snapshotWorktreeTree(repo);
    assert.ok(snapshot !== null && HEX40.test(snapshot));
    assert.deepEqual(changedPathsBetween(repo, seedTree, snapshot), ["café.txt", "new.txt"]);
    // The snapshot borrows a temporary index and leaves the real one alone.
    assert.equal(runGit(repo, ["diff", "--cached", "--quiet"]).code, 0);
  });

  milestone("a modified tracked file is work, first porcelain line included, and staging shows in the exit code", () => {
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    const status = readWorktreeStatus(repo).text;
    const lines = status.split("\n");
    assert.ok(lines.includes(" M a.txt"), status);
    assert.ok(lines.includes("?? new.txt"), status);
    assert.deepEqual(materialPaths(status, SESSIONS), ["a.txt", "café.txt", "new.txt"]);
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
    assert.deepEqual(changedPathsBetween(repo, seedTree, headTree()), ["a.txt", "café.txt", "crlf.txt", "new.txt"]);
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

describe("the gate that stands in front of a verification round", () => {
  const CONFIG = {
    testing: {
      suites: [{ name: "python", command: "python -m pytest", covers: ["docs/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py" }],
      selection: { repo_wide: ["pyproject.toml"], rules: [{ when: "docs/", select: [] }, { when: "src/", select: ["tests/test_thing.py"] }] },
    },
  };
  // One repository, walked: the change set is what git measures against the
  // seed, so the milestones below build on each other.
  const gateRepo = makeRepo({
    "docs/keep.md": "x\n",
    "docs/sessions/session-plan.md": "### Session 1 of 2: First\n1. Register.\n2. Build it.\n\n### Session 2 of 2: Second\n1. Register.\n",
  });
  const gateSessions = join(gateRepo, "docs", "sessions");

  it("walks one repository: an empty mapping skips evidence, an unmapped path blocks, a remediation is measured by the fix, and a suite asked for nothing is satisfied by the run it asked for", () => {
    // One test, because each part stands on the state the part before it
    // left: the change set is what git measures against the seed.
    //
    // -- skips evidence only for a declared empty mapping, and blocks on a
    // path nobody mapped even beside a mapped one. "Nothing is affected" and
    // "nobody knows what is affected" look identical from the selected-test
    // list and must never be treated alike.
    writeFileSync(join(gateRepo, "docs", "notes.md"), "x\n", "utf8");
    assert.equal(preverifyGate(gateRepo, gateSessions, CONFIG).ok, true);
    mkdirSync(join(gateRepo, "scripts"), { recursive: true });
    writeFileSync(join(gateRepo, "scripts", "deploy.rb"), "x\n", "utf8");
    const blocked = preverifyGate(gateRepo, gateSessions, CONFIG);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason, /scripts\/deploy\.rb/);
    assert.equal(blocked.command, "");
    writeFiles(gateRepo, { "src/app.py": "x = 1\n" });
    assert.match(preverifyGate(gateRepo, gateSessions, CONFIG).reason, /scripts\/deploy\.rb/);

    // -- measures a remediation by the fix rather than by the whole
    // session. A repository-wide edit buys one full run, at the round that
    // reviewed it; judging later rounds against HEAD would re-buy it every
    // time.
    rmSync(join(gateRepo, "scripts"), { recursive: true, force: true });
    registerSessionStart(gateSessions, 1, { engine: "claude-code", provider: "anthropic" });
    writeFileSync(join(gateRepo, "pyproject.toml"), "[p]\n", "utf8");
    assert.equal(preverifyGate(gateRepo, gateSessions, CONFIG).command, "python -m pytest");
    appendRound(gateRepo, 1, {
      round: 1, verdict: "ISSUES_FOUND", blocking: true, findings: [], recorded_at: "2026-08-19T18:00:00-04:00",
      verifier_model: "m", verifier_provider: "openai", completion_tree: snapshotWorktreeTree(gateRepo) as string,
    });
    writeFileSync(join(gateRepo, "src", "app.py"), "x = 2\n", "utf8");
    assert.equal(preverifyGate(gateRepo, gateSessions, CONFIG).command, "python -m pytest tests/test_thing.py");

    // -- asks a suite the selection named no test of for nothing, and is
    // satisfied by the run it asked for.
    const twoSuites = {
      testing: {
        suites: [
          { name: "python", command: "python -m pytest", covers: ["src/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py" },
          { name: "typescript", command: "vitest run", covers: ["src/"], expensive: true, test_roots: ["suite"], test_glob: "*.test.ts" },
        ],
        selection: { rules: [{ when: "src/app.py", select: ["tests/test_app.py"] }, { when: "docs/", select: [] }, { when: "pyproject.toml", select: [] }] },
      },
    };
    const asked = preverifyGate(gateRepo, gateSessions, twoSuites);
    assert.equal(asked.ok, false, asked.reason);
    assert.equal(asked.suite, "python");
    assert.equal(asked.command, "python -m pytest tests/test_app.py");
    const python = loadSuitesChecked(twoSuites).suites.find((s) => s.name === "python") as SuiteSpec;
    recordRun(gateSessions, python, "passed", {
      stage: "preverify-targeted", durationSeconds: 1, command: "python -m pytest tests/test_app.py", policy: POLICY_TARGETED,
      policyReason: "named every selected test", selectedTests: [["tests/test_app.py", "configured-rule"]],
    });
    const satisfied = preverifyGate(gateRepo, gateSessions, twoSuites);
    assert.equal(satisfied.ok, true, satisfied.reason);
    assert.deepEqual(satisfied.accepted.map(([name]) => name), ["python"]);
  });
});

describe("the check executor over a real index", () => {
  it("leaves the real index alone across a run", async () => {
    // The executor snapshots the tree before and after the check through a
    // temporary index; what the operator has (or has not) staged is theirs.
    const project = makeRepo({ "a.txt": "one\n" });
    writeFileSync(join(project, "untracked.txt"), "x\n", "utf8");
    const check = makeCheck({ name: "noop", argv: [process.execPath, "-e", "0"] });
    await execute(project, check, displayCommand(check), {
      stage: STAGE_TARGETED,
      treeDigest: snapshotWorktreeTree(project) as string,
      timeoutSeconds: 60,
    });
    assert.match(gitOut(project, "status", "--porcelain"), /\?\? untracked\.txt/);
  });
});
