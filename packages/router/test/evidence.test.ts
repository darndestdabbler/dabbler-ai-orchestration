// The evidence protocol: what makes a claim checkable.
//
// The parity control proves the two routers agree on what a verb writes;
// these prove the rules underneath, which a comparison cannot reach --
// the refusals no corpus shape triggers, and the questions git is asked
// about a tree nobody has committed.
//
// The anchor commit and its ref are proved in `record.test.ts`, where the
// round that writes them lives; nothing here repeats them.

import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  EvidenceError,
  ROUND_PUSH_BRANCH_REFSPEC,
  ROUND_REFSPEC,
  authoritativeTier,
  changedPathsBetween,
  detectOutOfBandWrite,
  ensureRoundRefspecs,
  hashOutput,
  nextAbsenceFallback,
  recordStateWrite,
  recordWorkerResult,
  runAbsenceSearch,
  scopePaths,
  sessionRoundRefs,
  snapshotWorktreeTree,
  treePaths,
  validateFindingEvidence,
  validateTranscript,
  verifyQuote,
  verifyWorkerResult,
} from "../src/evidence.ts";
import { writeChecks } from "../src/critique.ts";
import { git, makeSeededRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

function makeTranscript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pinnedRef: "abc123",
    commandId: "probe-widget-empty-input",
    pristineCheckout: true,
    exitCode: 1,
    rawOutput: "ZeroDivisionError\n",
    outputHash: hashOutput("ZeroDivisionError\n"),
    entrypoint: { kind: "cli", ref: "python -m widget" },
    replay: {
      pristineCheckout: true,
      exitCode: 1,
      outputHash: hashOutput("ZeroDivisionError\n"),
    },
    ...overrides,
  };
}

// --- Hashing -------------------------------------------------------------------

describe("hashing an output", () => {
  it("prefixes the digest and coerces a missing value to the empty string", () => {
    expect(hashOutput("x").startsWith("sha256:")).toBe(true);
    expect(hashOutput(null)).toBe(hashOutput(""));
    // No normalization: a trailing space is content.
    expect(hashOutput("a")).not.toBe(hashOutput("a "));
  });
});

// --- Transcripts ---------------------------------------------------------------

describe("validating a replay transcript", () => {
  it("accepts one that carries every trust rule", () => {
    expect(validateTranscript(makeTranscript()).ok).toBe(true);
  });

  it("requires exactly one trusted probe identifier", () => {
    const both = validateTranscript(makeTranscript({ templateId: "t-1" }));
    expect(both.ok).toBe(false);
    expect(both.reasons.some((reason) => reason.includes("exactly one"))).toBe(true);

    const neither = makeTranscript();
    delete neither["commandId"];
    const result = validateTranscript(neither);
    expect(result.ok).toBe(false);
    expect(
      result.reasons.some((reason) => reason.includes("never model-authored")),
    ).toBe(true);
  });

  it("names an agent-built harness and refuses it as its own oracle", () => {
    const result = validateTranscript(
      makeTranscript({ entrypoint: { kind: "agent_harness", ref: "my-harness" } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("oracle"))).toBe(true);
  });

  it("refuses a boolean where an exit code belongs", () => {
    // `True` is an int in Python and would pass an isinstance check; both
    // sides exclude it explicitly.
    expect(validateTranscript(makeTranscript({ exitCode: true })).ok).toBe(false);
  });

  it("requires the replay to reproduce the same bytes", () => {
    const transcript = makeTranscript();
    (transcript["replay"] as Record<string, unknown>)["outputHash"] =
      hashOutput("flaky output");
    const result = validateTranscript(transcript);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("did not reproduce"))).toBe(true);
  });

  it("collapses a REPRODUCED claim with no valid transcript", () => {
    expect(authoritativeTier("REPRODUCED", makeTranscript())).toBe("REPRODUCED");
    expect(authoritativeTier("REPRODUCED", null)).toBe("ASSERTED");
    expect(authoritativeTier("HYPOTHESIS", null)).toBe("HYPOTHESIS");
  });

  it("reads a finding that claims no tier as asserted", () => {
    const result = validateFindingEvidence({ description: "x" });
    expect(result.ok).toBe(true);
    expect(result.tier).toBe("ASSERTED");
  });
});

// --- Tree snapshots -------------------------------------------------------------

describe("snapshotting the working tree", () => {
  it("captures an untracked file, which a tree-vs-worktree diff would call deleted", () => {
    const repo = makeSeededRepo();
    const before = snapshotWorktreeTree(repo) as string;
    writeFileSync(join(repo, "new.txt"), "hi\n", "utf8");
    const after = snapshotWorktreeTree(repo) as string;
    expect(after).not.toBe(before);
    expect(changedPathsBetween(repo, before, after)).toEqual(["new.txt"]);
  });

  it("leaves the real index alone", () => {
    const repo = makeSeededRepo();
    writeFileSync(join(repo, "new.txt"), "hi\n", "utf8");
    snapshotWorktreeTree(repo);
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(status).toContain("?? new.txt");
  });

  it("excludes the run ledger even where no ignore rule covers it", () => {
    // A round is appended after the snapshot it describes, so a visible
    // ledger makes verified work look changed-since-verified. This fixture
    // has no .gitignore at all -- the exclusion cannot depend on one.
    const repo = makeSeededRepo();
    const before = snapshotWorktreeTree(repo);
    const runs = join(repo, ".dabbler", "runs", "s1");
    mkdirSync(runs, { recursive: true });
    writeFileSync(join(runs, "rounds.jsonl"), '{"round": 1}\n', "utf8");
    expect(snapshotWorktreeTree(repo)).toBe(before);
  });
});

// --- Out-of-band writes ----------------------------------------------------------

describe("detecting a hand edit to the session record", () => {
  function withState(text: string): { repo: string; sessionsDir: string } {
    const repo = makeSeededRepo();
    const sessionsDir = join(repo, "docs", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "sessions.json"), text, "utf8");
    return { repo, sessionsDir };
  }

  it("passes content that matches a sanctioned write", () => {
    const { repo, sessionsDir } = withState("{}");
    recordStateWrite(sessionsDir, repo);
    expect(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true })).toBeNull();
  });

  it("names an edit that matches no sanctioned write", () => {
    const { repo, sessionsDir } = withState("{}");
    recordStateWrite(sessionsDir, repo);
    writeFileSync(join(sessionsDir, "sessions.json"), '{"status": "complete"}', "utf8");
    expect(detectOutOfBandWrite(sessionsDir, repo)).toContain("out of band");
  });

  it("treats an absent ledger as a finding only where a record is required", () => {
    // Absence is the signature a fully-simulated session leaves, and it is
    // also what an ordinary read of a repository that never wrote one sees.
    const { repo, sessionsDir } = withState("{}");
    expect(detectOutOfBandWrite(sessionsDir, repo)).toBeNull();
    expect(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true })).toContain(
      "absent",
    );
  });
});

// --- Round refs ------------------------------------------------------------------

describe("teaching a clone to carry round refs", () => {
  function withRemote(): string {
    const repo = makeSeededRepo();
    const remote = join(makeTempDir(), "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { stdio: "ignore" });
    git(repo, "remote", "add", "origin", remote);
    return repo;
  }

  it("adds nothing where there is no remote to carry them to", () => {
    expect(ensureRoundRefspecs(makeSeededRepo())).toEqual([]);
  });

  it("adds the fetch, the branch and the rounds once, and not again", () => {
    const repo = withRemote();
    expect(ensureRoundRefspecs(repo)).toEqual([
      `remote.origin.fetch=${ROUND_REFSPEC}`,
      `remote.origin.push=${ROUND_PUSH_BRANCH_REFSPEC}`,
      `remote.origin.push=${ROUND_REFSPEC}`,
    ]);
    expect(ensureRoundRefspecs(repo)).toEqual([]);
  });

  it("keeps the push refspecs a clone chose for itself", () => {
    // A clone that set its own push refspecs decided what a bare push sends;
    // adding HEAD beside them would change that decision.
    const repo = withRemote();
    git(repo, "config", "--add", "remote.origin.push", "refs/heads/main:refs/heads/main");
    ensureRoundRefspecs(repo);
    const pushes = execFileSync(
      "git",
      ["config", "--get-all", "remote.origin.push"],
      { cwd: repo, encoding: "utf8" },
    )
      .split("\n")
      .filter((line) => line.trim() !== "");
    expect(pushes).toEqual(["refs/heads/main:refs/heads/main", ROUND_REFSPEC]);
  });

  it("lists no refs for a session that anchored none", () => {
    expect(sessionRoundRefs(makeSeededRepo(), 7)).toEqual([]);
  });
});

// --- Quote provenance --------------------------------------------------------------

describe("re-deriving a quote from the reviewed tree", () => {
  const SOURCE = "alpha\nbeta\ngamma\n";

  function reviewed(): { repo: string; tree: string } {
    const repo = makeSeededRepo({ "widget.py": SOURCE });
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    return { repo, tree };
  }

  it("returns the hash it computed, not the one the worker claimed", () => {
    const { repo, tree } = reviewed();
    const quote = {
      path: "widget.py",
      content_hash: hashOutput("beta\n"),
      span: { kind: "line", start: 2, end: 2 },
    };
    expect(verifyQuote(repo, tree, quote).content_hash).toBe(hashOutput("beta\n"));
  });

  it("refuses a quote whose bytes are not in that tree", () => {
    const { repo, tree } = reviewed();
    expect(() =>
      verifyQuote(repo, tree, {
        path: "widget.py",
        content_hash: hashOutput("delta\n"),
        span: { kind: "line", start: 2, end: 2 },
      }),
    ).toThrow(/quote-hash-mismatch/);
  });

  it("refuses a path the tree does not carry, whatever the worktree holds", () => {
    const { repo, tree } = reviewed();
    writeFileSync(join(repo, "later.py"), "x = 1\n", "utf8");
    expect(() =>
      verifyQuote(repo, tree, {
        path: "later.py",
        content_hash: hashOutput("x = 1\n"),
        span: { kind: "byte", start: 0, end: 6 },
      }),
    ).toThrow(/quote-path-missing/);
  });

  it("refuses a span that runs off the end of the file", () => {
    const { repo, tree } = reviewed();
    expect(() =>
      verifyQuote(repo, tree, {
        path: "widget.py",
        content_hash: hashOutput(""),
        span: { kind: "line", start: 1, end: 99 },
      }),
    ).toThrow(/quote-span-out-of-range/);
  });
});

// --- Absence searches ----------------------------------------------------------------

describe("re-running a declared absence search", () => {
  function corpus(): { repo: string; tree: string } {
    const repo = makeSeededRepo({
      "src/a.py": "token\ntoken\n",
      "src/deep/b.py": "token\n",
      "docs/c.md": "token\n",
    });
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    return { repo, tree };
  }

  it("counts the matches itself rather than believing the declaration", () => {
    const { repo, tree } = corpus();
    const row = runAbsenceSearch(repo, tree, {
      query: "token",
      query_kind: "literal",
      scope: ["src/**"],
      matches: 3,
    });
    expect(row.matches).toBe(3);
    expect(row.tool_version).toContain("node");
  });

  it("refuses a declaration whose count disagrees with the re-run", () => {
    const { repo, tree } = corpus();
    expect(() =>
      verifyWorkerResult(repo, tree, {
        check_id: "c1",
        result: "pass",
        absence_searches: [
          { query: "token", query_kind: "literal", scope: ["src/**"], matches: 0 },
        ],
      }),
    ).toThrow(/absence-search-disagrees/);
  });

  it("keeps `*` inside one directory and lets `**` cross them", () => {
    // fnmatch would let a bare `*.py` swallow the repository, turning a
    // declared narrow scope into an undeclared wide one.
    const { repo, tree } = corpus();
    expect(scopePaths(repo, tree, ["src/*.py"])).toEqual(["src/a.py"]);
    expect(scopePaths(repo, tree, ["src/**"])).toEqual(["src/a.py", "src/deep/b.py"]);
  });

  it("refuses a scope that resolves to nothing", () => {
    const { repo, tree } = corpus();
    expect(() =>
      runAbsenceSearch(repo, tree, {
        query: "token",
        query_kind: "literal",
        scope: ["nowhere/**"],
      }),
    ).toThrow(/absence-scope-empty/);
  });

  it("refuses a regex the engine cannot compile", () => {
    const { repo, tree } = corpus();
    expect(() =>
      runAbsenceSearch(repo, tree, {
        query: "(unclosed",
        query_kind: "regex",
        scope: ["src/**"],
      }),
    ).toThrow(/absence-query-invalid/);
  });

  it("reads the tree's own path list as the closed universe", () => {
    const { repo, tree } = corpus();
    expect(treePaths(repo, tree)).toEqual(["docs/c.md", "src/a.py", "src/deep/b.py"]);
  });
});

// --- The ladder and the one-way door ---------------------------------------------------

describe("the way out of a blocked check", () => {
  it("walks the ladder in the plan's order and ends at human review", () => {
    expect(nextAbsenceFallback()).toBe("deterministic-test-or-analyzer");
    expect(nextAbsenceFallback(["deterministic-test-or-analyzer"])).toBe(
      "narrower-positive-counterexample",
    );
    expect(
      nextAbsenceFallback([
        "deterministic-test-or-analyzer",
        "narrower-positive-counterexample",
        "blocked-with-manager-adjudication",
        "human-review",
      ]),
    ).toBeNull();
  });

  it("refuses a pass for a check already blocked out of reach", () => {
    // A later attempt with more context is a bigger budget, which is not
    // evidence about the code.
    const repo = makeSeededRepo();
    expect(() =>
      verifyWorkerResult(
        repo,
        "0".repeat(40),
        { check_id: "c1", result: "pass" },
        {
          priorResults: [
            { check_id: "c1", result: "blocked", blocked_reason: "unprovable-absence" },
          ],
        },
      ),
    ).toThrow(/blocked-not-dischargeable/);
  });

  it("refuses a result for a check nobody registered", () => {
    const repo = makeSeededRepo();
    const changeId = "a".repeat(64);
    writeChecks(repo, 1, changeId, [
      {
        schema_version: 1,
        check_id: "declared",
        source: "corpus:example",
        executor: "worker-model",
        objective: "Does every new public function document its refusal?",
        selector: { from: "changed-files" },
        condition: { exists: "docstring" },
        scope: { paths: ["src/**"], changed_only: true },
        branch: { documented: { when: { exists: "docstring" }, outcome: "pass" } },
        evidence: {
          pass: { requires: ["quote"] },
          fail: { requires: ["quote"] },
          blocked: { requires: ["adjudication-note"] },
        },
        authorized_pulls: ["src/**"],
        bounds: { max_files: 20, max_bytes: 200000, timeout_seconds: 30 },
      },
    ]);
    expect(() =>
      recordWorkerResult(repo, 1, "0".repeat(40), {
        change_id: changeId, check_id: "unregistered", result: "pass",
      }),
    ).toThrow(/check-not-registered/);
  });

  it("carries the refusal code rather than only its prose", () => {
    // An operator or a later stage sorts on `code`; the sentence is for a
    // reader and is free to change.
    try {
      verifyWorkerResult(makeSeededRepo(), "0".repeat(40), { result: "pass" });
      expect.unreachable("a result with no check_id must be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(EvidenceError);
      expect((error as EvidenceError).code).toBe("worker-result-malformed");
    }
  });
});

// --- The digest a deletion moves once ---------------------------------------------------

describe("a tracked file that has been deleted", () => {
  it("is omitted from the tree snapshot rather than marked in it", () => {
    // `ls-files` still names it, and a marker line would leave the digest
    // the moment the deletion is committed -- moving it across a commit in
    // which no file's content changed at all. D170 landed this; the
    // freshness half is proved in `preverify.test.ts`.
    const repo = makeSeededRepo({ "a.txt": "one\n", "b.txt": "two\n" });
    unlinkSync(join(repo, "b.txt"));
    const afterDelete = snapshotWorktreeTree(repo);
    git(repo, "commit", "-q", "-a", "-m", "drop b", "--no-gpg-sign");
    expect(snapshotWorktreeTree(repo)).toBe(afterDelete);
  });
});
