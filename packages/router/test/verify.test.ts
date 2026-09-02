// The verification loop: what a round says, what it refuses, and the two
// terminal states a capped session can end in.
//
// The parity control runs the verbs against the corpus and compares the
// bytes. What is here is the states the corpus does not build -- a round
// recorded against a rewritten history, a dispute cited outside the
// repository, a cap reached with a fix that touches no cited path -- plus
// the round itself, driven end to end against a scripted verifier so the
// record it writes can be read rather than inferred.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { grantForTransport } from "../src/agency.ts";
import { CONFIG_ENV_VAR } from "../src/config.ts";
import { runGit, snapshotWorktreeTree } from "../src/journal.ts";
import { appendDispute, appendRound, readRounds } from "../src/ledger.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { registerSessionStart } from "../src/writers.ts";
import { recordDispute, resolveRepoRelative } from "../src/verify/disputes.ts";
import {
  EXIT_BLOCKING,
  EXIT_OK,
  EXIT_STATE,
  EXIT_UNRESOLVED,
  EXIT_USAGE,
} from "../src/verify/errors.ts";
import { deriveChangeId, loadAuthorClaims, renderClaimsMarkdown } from "../src/verify/prepare.ts";
import {
  adjudicationPrompt,
  buildTaskBlock,
  citedEvidenceLines,
  priorFindingsBlock,
  splitDisputes,
  splitEvidenceRange,
  splitLines,
} from "../src/verify/prompts.ts";
import { legalAnchor, runReanchor } from "../src/verify/reanchor.ts";
import { runRound } from "../src/verify/rounds.ts";
import { runStepGuardCommit, runStepStatus } from "../src/verify/steps.ts";
import { verifyVerb } from "../src/cli/verify.ts";
import {
  clearProviderKeys,
  git,
  makeConfig,
  makeSandboxRepo,
  makeSeededRepo,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
  writeYaml,
} from "./support/fixtures.ts";
import { gitAnswers } from "./support/gitAnswers.ts";

afterAll(removeTempDirs);

// Ledger and prompt mechanics need paths, state files, and consistent tree
// identifiers -- not an object store. Where a test's subject is the object
// store itself (the legal anchor, re-anchoring, the end-to-end band), the
// real repository stays, and the describe says so.
const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" +
    "3. Cross-provider verification.\n4. Close-out.\n\n" +
    "### Session 2 of 2: Second things\n1. Register.\n2. Polish it.\n",
  "dabbler.yaml":
    "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n" +
    "      command: python -m pytest\n      expensive: true\n" +
    "      covers:\n        - src/\n        - tests/\n" +
    "      test_roots:\n        - tests\n      test_glob: \"test_*.py\"\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
};

function fakeTree(fill: string): string {
  return fill.repeat(40);
}

function makeStateDirs(): { repo: string; sessionsDir: string } {
  const repo = makeTempDir();
  for (const [rel, text] of Object.entries(SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
    [["status", "--porcelain", "-uall"], { stdout: "" }],
    [["status", "--porcelain"], { stdout: "" }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [["commit-tree"], { stdout: "c".repeat(40) }],
    [["update-ref"], { code: 0 }],
    [["diff"], { stdout: "" }],
  ]);
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

interface Output {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

const sinks = (): { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  const collect = (sink: string[]) => (chunk: unknown) => {
    sink.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(collect(out));
  vi.spyOn(process.stderr, "write").mockImplementation(collect(err));
  return { out, err };
};

/** Everything the command printed, so a refusal can be read rather than inferred. */
function captured(run: () => number): Output {
  const { out, err } = sinks();
  try {
    return { code: run(), out: out.join(""), err: err.join("") };
  } finally {
    vi.restoreAllMocks();
  }
}

async function capturedAsync(run: () => Promise<number>): Promise<Output> {
  const { out, err } = sinks();
  try {
    return { code: await run(), out: out.join(""), err: err.join("") };
  } finally {
    vi.restoreAllMocks();
  }
}

// --- What a prompt says -------------------------------------------------------

describe("an evidence citation", () => {
  it("reads a bare path, a single line, and a range", () => {
    expect(splitEvidenceRange("src/a.py")).toEqual({
      path: "src/a.py",
      start: null,
      end: null,
    });
    expect(splitEvidenceRange("src/a.py:12")).toEqual({
      path: "src/a.py",
      start: 12,
      end: 12,
    });
    expect(splitEvidenceRange("src/a.py:12-40")).toEqual({
      path: "src/a.py",
      start: 12,
      end: 40,
    });
  });

  it("renders exactly the cited passage, and says which lines they were", () => {
    // A whole-file cite of a large file would hope the passage lands in a
    // prefix; the range is how a citation stays relevant.
    const repo = makeSeededRepo({ "big.py": "a\nb\nc\nd\ne\n" });
    const lines = citedEvidenceLines(repo, "big.py:2-4");
    expect(lines[0]).toBe("  - Cited evidence `big.py` lines 2-4:");
    expect(lines[3]).toBe("b\nc\nd");
  });

  it("says a path is missing rather than dropping it silently", () => {
    const repo = makeSeededRepo();
    expect(citedEvidenceLines(repo, "gone.py")).toEqual([
      "  - Cited evidence `gone.py`: (missing at render time)",
    ]);
  });

  it("says how many lines the file has when the cited range is empty", () => {
    const repo = makeSeededRepo({ "short.py": "one\n" });
    expect(citedEvidenceLines(repo, "short.py:5-9")).toEqual([
      "  - Cited evidence `short.py:5-9`: (the file has only 1 line(s); " +
        "the cited range is empty)",
    ]);
  });

  it("truncates a whole-file cite at the cap and names the range syntax", () => {
    // Silently dropping the tail would let a rebuttal cite evidence the
    // verifier never saw.
    const repo = makeSeededRepo({ "huge.py": "x".repeat(17 * 1024) });
    const rendered = citedEvidenceLines(repo, "huge.py").join("\n");
    expect(rendered).toContain("truncated at the inline cap");
    expect(rendered).toContain("`huge.py:START-END`");
  });
});

describe("Python's line splitting", () => {
  it("takes CRLF as one boundary and drops a single trailing terminator", () => {
    // A line-range cite is numbered by it, so a naive split on "\n" would
    // number a CRLF file's passages differently.
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("the dispute split", () => {
  it("keeps a dispute pending until a later round has presented it", () => {
    const rounds = [{ round: 1 }, { round: 2 }];
    const dispute = { round: 1, finding_index: 0, filed_after_round: 1 };
    const { pending, settled } = splitDisputes(rounds, [dispute]);
    expect(pending.size).toBe(0);
    expect(settled.get("1:0")).toBe(2);

    const fresh = splitDisputes([{ round: 1 }], [dispute]);
    expect(fresh.pending.get("1:0")).toBe(dispute);
    expect(fresh.settled.size).toBe(0);
  });
});

describe("the prior-findings block", () => {
  it("says nothing at all when there are no prior rounds", () => {
    expect(priorFindingsBlock([])).toBe("");
  });

  it("carries a pending rebuttal and its evidence beside the finding", () => {
    const repo = makeSeededRepo({ "cite.py": "the line\n" });
    const rounds = [
      {
        round: 1,
        verdict: "ISSUES_FOUND",
        findings: [
          { severity: "major", description: "the widget is wrong", blocking: true },
        ],
      },
    ];
    const disputes = [
      {
        round: 1,
        finding_index: 0,
        filed_after_round: 1,
        grounds: "the widget is right",
        evidence_paths: ["cite.py"],
      },
    ];
    const block = priorFindingsBlock(rounds, disputes, repo);
    expect(block).toContain("- [major] [DISPUTED] the widget is wrong");
    expect(block).toContain("Orchestrator's rebuttal (grounds): the widget is right");
    expect(block).toContain("the line");
    // The UPHOLD-or-WITHDRAW instruction only appears when one is pending.
    expect(block).toContain("engage the rebuttal");
  });

  it("tells the verifier not to re-adjudicate a settled dispute", () => {
    // Re-presenting a rebuttal a later round already answered is the loop
    // this channel exists to end.
    const rounds = [
      { round: 1, verdict: "ISSUES_FOUND", findings: [{ severity: "major", description: "x" }] },
      { round: 2, verdict: "VERIFIED", findings: [] },
    ];
    const block = priorFindingsBlock(
      rounds,
      [{ round: 1, finding_index: 0, filed_after_round: 1, grounds: "g", evidence_paths: [] }],
      null,
    );
    expect(block).toContain("the rebuttal was presented in round 2");
    expect(block).not.toContain("engage the rebuttal");
  });
});

describe("the task block a round opens with", () => {
  it("carries the session's own plan verbatim and the round number", () => {
    const { sessionsDir } = makeStateDirs();
    const block = buildTaskBlock(sessionsDir, 1, 1, []);
    expect(block).toContain("Session 1 of the active session set (verification round 1)");
    expect(block).toContain("**Build the widget.**");
  });

  it("says the plan is unavailable rather than inventing one", () => {
    const block = buildTaskBlock(makeTempDir(), 1, 1, []);
    expect(block).toContain("(session plan unavailable)");
  });

  it("appends the agency briefing only when a grant was made", () => {
    const { sessionsDir } = makeStateDirs();
    const seat = grantForTransport("copilot-cli", { scope: ["src/widget.py"] });
    expect(buildTaskBlock(sessionsDir, 1, 1, [], null, null, seat)).not.toBe(
      buildTaskBlock(sessionsDir, 1, 1, []),
    );
  });
});

describe("the adjudicator's brief", () => {
  it("hands over the complete finding row, never a projection", () => {
    // The dispute rides in full; a partial rendering of the finding hands
    // the adjudicator a one-sided record and can clear a valid finding.
    const prompt = adjudicationPrompt(
      [
        {
          round: 3,
          index: 1,
          finding: { severity: "major", description: "d", evidencePaths: ["a.py"] },
          dispute: { grounds: "g", evidence_paths: [] },
        },
      ],
      "diff --git a/a.py",
      null,
    );
    expect(prompt).toContain("#### Dispute 1 — round 3, finding 1");
    expect(prompt).toContain('"evidencePaths": [\n    "a.py"\n  ]');
    expect(prompt).toContain("You may NOT raise new findings");
    expect(prompt).toContain("A dispute you do not clearly judge counts as UPHELD.");
  });

  it("says so when the fix delta is empty", () => {
    expect(adjudicationPrompt([], "", null)).toContain(
      "(no changes since the last round)",
    );
  });
});

// --- The dispute channel ------------------------------------------------------

describe("resolving a cited path", () => {
  it("refuses a path outside the repository even when it exists", () => {
    // Path containment is filesystem arithmetic; no repository needed.
    const repo = makeTempDir();
    writeFileSync(join(repo, "a.txt"), "one\n", "utf8");
    expect(resolveRepoRelative(repo, "../elsewhere.py")).toEqual([null, "outside"]);
    expect(resolveRepoRelative(repo, "a.txt")).toEqual(["a.txt", null]);
    expect(resolveRepoRelative(repo, "nope.py")).toEqual([null, "missing"]);
  });

  it("refuses a directory, because a directory is not a passage", () => {
    const repo = makeTempDir();
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.py"), "x\n", "utf8");
    expect(resolveRepoRelative(repo, "src")).toEqual([null, "missing"]);
  });
});

describe("recording a dispute", () => {
  function disputable(): { repo: string; sessionsDir: string } {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, {
      engine: "claude-code",
      provider: "anthropic",
    });
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [{ severity: "major", description: "the widget is wrong", blocking: true }],
      completion_tree: fakeTree("a"),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    return { repo, sessionsDir };
  }

  it("refuses prose alone: a dispute argues from the record", () => {
    const { sessionsDir } = disputable();
    const { code, err } = captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 0,
        grounds: "I disagree",
        evidence: [],
      }),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("prose-only disputes are refused");
  });

  it("refuses empty grounds", () => {
    const { sessionsDir } = disputable();
    const { code, err } = captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 0,
        grounds: "   ",
        evidence: ["dabbler.yaml"],
      }),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("--grounds must be non-empty");
  });

  it("refuses an oversized bare cite and names the range syntax", () => {
    // A bare cite of an oversized file would silently drop its tail at
    // render time; the refusal comes now, naming the exit.
    const { repo, sessionsDir } = disputable();
    writeFileSync(join(repo, "big.md"), "x".repeat(17 * 1024), "utf8");
    const { code, err } = captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 0,
        grounds: "look here",
        evidence: ["big.md"],
      }),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("over the inline cap");
    expect(err).toContain("big.md:START-END");
  });

  it("accepts a line-range cite of that same oversized file", () => {
    const { repo, sessionsDir } = disputable();
    writeFileSync(join(repo, "big.md"), `${"x\n".repeat(20000)}`, "utf8");
    const { code } = captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 0,
        grounds: "look here",
        evidence: ["big.md:3-5"],
      }),
    );
    expect(code).toBe(EXIT_OK);
    const rows = readFileSync(
      join(repo, ".dabbler", "runs", "s1", "disputes.jsonl"),
      "utf8",
    );
    expect(JSON.parse(rows.trim())["evidence_paths"]).toEqual(["big.md:3-5"]);
  });

  it("lists the round's findings by index when the index does not exist", () => {
    const { sessionsDir } = disputable();
    const { code, err } = captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 7,
        grounds: "g",
        evidence: ["dabbler.yaml"],
      }),
    );
    expect(code).toBe(EXIT_STATE);
    expect(err).toContain("Its findings, by 0-based index:");
    expect(err).toContain("  0. [major] the widget is wrong");
  });

  it("stamps the latest round at filing time, not the round it contests", () => {
    // The first round recorded AFTER this presents the rebuttal; later
    // rounds treat it as settled by that round's findings.
    const { repo, sessionsDir } = disputable();
    appendRound(repo, 1, {
      round: 2,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [],
      completion_tree: fakeTree("a"),
      previous_tree: fakeTree("b"),
      recorded_at: "2026-01-01T00:01:00+00:00",
    });
    captured(() =>
      recordDispute(sessionsDir, {
        roundNumber: 1,
        findingIndex: 0,
        grounds: "g",
        evidence: ["dabbler.yaml"],
      }),
    );
    const row = JSON.parse(
      readFileSync(join(repo, ".dabbler", "runs", "s1", "disputes.jsonl"), "utf8").trim(),
    );
    expect(row["round"]).toBe(1);
    expect(row["filed_after_round"]).toBe(2);
  });
});

// --- Re-anchoring -------------------------------------------------------------

// KEPT REAL: the subject is the object store itself -- ancestry, commit
// topology, and what resolves. Recorded answers would restate the rule
// under test.
describe("the legal anchor", () => {
  it("takes the round's own recorded HEAD, consulting no date", () => {
    const repo = makeSeededRepo();
    const head = headOf(repo);
    expect(legalAnchor(repo, head, "not a date at all", head)).toEqual([
      head,
      `Round HEAD was ${head.slice(0, 12)}, so that commit is the last one ` +
        "the round could not have reported on.",
    ]);
  });

  it("fails closed when the recorded HEAD is not an ancestor of this one", () => {
    // The history was rewritten since the round, and no baseline can be
    // placed on it.
    const repo = makeSeededRepo();
    const orphan = "0".repeat(40);
    const [anchor, why] = legalAnchor(repo, headOf(repo), "2026-01-01T00:00:00+00:00", orphan);
    expect(anchor).toBeNull();
    expect(why).toContain("This history has been rewritten since the round");
  });

  it("refuses an unreadable round timestamp rather than guessing", () => {
    const repo = makeSeededRepo();
    const [anchor, why] = legalAnchor(repo, headOf(repo), null);
    expect(anchor).toBeNull();
    expect(why).toContain("unreadable timestamp");
  });

  it("stops at the first post-round commit, so a backdated one can never win", () => {
    // A committer date is user-controlled to the second. Scanning
    // newest-first for "date <= moment" would pick a backdated remediation
    // commit as a baseline that predates the fixes sitting underneath it.
    //
    // Every commit's date is pinned, the seed included: a seed dated `now`
    // would sit past the round moment and end the walk before it began.
    const repo = pinnedRepo();
    commitAt(repo, "seed.txt", "2026-01-01T00:00:00+00:00");
    const first = headOf(repo);
    commitAt(repo, "later.txt", "2026-06-01T00:00:00+00:00");
    const backdated = headOf(repo);
    commitAt(repo, "backdated.txt", "2020-01-01T00:00:00+00:00");
    const [anchor] = legalAnchor(repo, headOf(repo), "2026-03-01T00:00:00+00:00");
    expect(anchor).toBe(first);
    expect(anchor).not.toBe(backdated);
  });

  it("has nothing to offer when every commit postdates the round", () => {
    const repo = makeSeededRepo();
    const [anchor, why] = legalAnchor(repo, headOf(repo), "1999-01-01T00:00:00+00:00");
    expect(anchor).toBeNull();
    expect(why).toContain("There is nothing to re-anchor onto.");
  });
});

// KEPT REAL: re-anchoring exists for the case where a recorded tree does or
// does not resolve in THIS object store; only a real one can answer that.
describe("re-anchoring a round", () => {
  it("refuses while the recorded tree still resolves here", () => {
    // Re-anchoring a baseline that is present would let the author choose
    // what the next round sees.
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [],
      completion_tree: snapshotWorktreeTree(repo),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    const { code, err } = captured(() => runReanchor(sessionsDir, "HEAD", "moved machines"));
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("resolves in this repository");
  });

  it("refuses a session with no recorded round", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    const { code, err } = captured(() => runReanchor(sessionsDir, "HEAD", "why"));
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("Round 1 measures against HEAD and needs no snapshot");
  });

  it("names the one commit it will accept when the wrong one is offered", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    const first = headOf(repo);
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [],
      // A tree this repository does not have: the moved-machine case.
      completion_tree: "1".repeat(40),
      head_commit: first,
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    commitAt(repo, "later.txt", "2026-06-01T00:00:00+00:00");
    const { code, err } = captured(() =>
      runReanchor(sessionsDir, headOf(repo), "moved machines"),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("is not the legal anchor for round 1");
    expect(err).toContain(`--commit ${first.slice(0, 12)}`);
  });

  it("records the substitute and says the record is weaker for it", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    const first = headOf(repo);
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [],
      completion_tree: "1".repeat(40),
      head_commit: first,
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    const { code, out } = captured(() => runReanchor(sessionsDir, first, "cloned without the refspec"));
    expect(code).toBe(0);
    expect(out).toContain("absent from this object store");
    expect(out).toContain("weaker record");
    const row = JSON.parse(
      readFileSync(
        join(repo, ".dabbler", "runs", "s1", "baseline-reanchors.jsonl"),
        "utf8",
      ).trim(),
    );
    expect(row["recorded_tree"]).toBe("1".repeat(40));
    expect(row["anchor_commit"]).toBe(first);
    expect(row["reason"]).toBe("cloned without the refspec");
  });
});

// --- Steps --------------------------------------------------------------------

describe("the step commands", () => {
  it("refuses a step against a session with no approved plan", () => {
    // An envelope that can still move measures nothing.
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    const { code, err } = captured(() => runStepStatus(sessionsDir));
    expect(code).toBe(EXIT_STATE);
    expect(err).toContain("has no plan");
  });

  it("lets a commit through when no step is open", () => {
    expect(runStepGuardCommit(makeStateDirs().repo)).toBe(EXIT_OK);
  });

  it("lets a commit through outside a repository entirely", () => {
    expect(runStepGuardCommit(makeTempDir())).toBe(EXIT_OK);
  });
});

// --- The round itself ---------------------------------------------------------

// KEPT REAL: the always-on end-to-end band. One describe drives the whole
// round pipeline against a real repository and a scripted verifier -- the
// composition test that recorded answers must never replace.
describe("a verification round, end to end", () => {
  beforeEach(() => {
    setProviderKeys();
    // `bootstrap` persists this at user scope on a seat machine, and it
    // outranks the profile the fixture writes.
    delete process.env["DABBLER_TRANSPORT"];
    resetForTests();
    resetRuntimeMode();
  });

  afterEach(() => {
    clearProviderKeys();
    delete process.env[CONFIG_ENV_VAR];
    delete process.env["DABBLER_TRANSPORT"];
    resetForTests();
    resetRuntimeMode();
    vi.restoreAllMocks();
  });

  /** What `makeSandboxRepo`'s own `dabbler.yaml` declares, as config. */
  const SANDBOX_TESTING = {
    suites: [
      {
        name: "unit",
        command: "python -m pytest",
        expensive: true,
        covers: ["src/", "tests/"],
        test_roots: ["tests"],
        test_glob: "test_*.py",
      },
    ],
    selection: {
      repo_wide: ["dabbler.yaml"],
      smoke: ["tests/test_widget.py"],
      rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }],
    },
  };

  /** A session ready for round 1, with a scripted verifier queued. */
  async function reviewable(responses: readonly string[]): Promise<{
    repo: string;
    sessionsDir: string;
  }> {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    const dir = makeTempDir();
    responses.forEach((text, index) => {
      writeFileSync(join(dir, `${String(index + 1).padStart(2, "0")}.md`), text, "utf8");
    });
    // A named config takes neither the tracked layer nor the machine-local
    // one, so the sandbox's own `dabbler.yaml` would be dropped -- and the
    // round needs its suite and its selection rules. They ride in the named
    // config instead, which is the same document either way.
    const config = makeConfig({
      transports: { offline: { responses_dir: dir } },
      transport: { profile: "offline" },
      testing: SANDBOX_TESTING,
    });
    process.env[CONFIG_ENV_VAR] = writeYaml(
      join(makeTempDir(), "router-config.yaml"),
      config,
    );
    return { repo, sessionsDir };
  }

  it("records a clean round and stamps the session verdict", async () => {
    const { repo, sessionsDir } = await reviewable([
      "VERIFIED\n\nThe widget is real and the test covers it.\n",
    ]);
    const reviewed = snapshotWorktreeTree(repo);
    const { code, out } = await capturedAsync(() => runRound(sessionsDir));
    expect(code).toBe(EXIT_OK);
    expect(out).toContain("round 1 — VERIFIED");
    expect(out).toContain("session 1 is verified");

    const [row] = readRounds(repo, 1);
    expect(row?.["round"]).toBe(1);
    expect(row?.["phase"]).toBe("full");
    expect(row?.["blocking"]).toBe(false);
    expect(row?.["verifier_provider"]).toBe("offline");
    // The tree the round completed at, and the commit it stood on: a later
    // recovery places a baseline by topology rather than by date. It is the
    // tree as the VERIFIER saw it -- the change-log block and the session
    // stamp are written after the snapshot, so re-snapshotting here would
    // measure the round's own bookkeeping.
    expect(row?.["completion_tree"]).toBe(reviewed);
    expect(row?.["head_commit"]).toBe(headOf(repo));
    expect(row?.["agency"]).toBeTruthy();

    // The raw output lands before any parsing, so a response the parser
    // cannot read is still on disk.
    expect(
      readFileSync(join(repo, ".dabbler", "runs", "s1", "round-1-verifier-output.md"), "utf8"),
    ).toContain("The widget is real");
  });

  it("blocks on a major finding and hands back the remediation recipe", async () => {
    const { repo, sessionsDir } = await reviewable([
      "ISSUES FOUND\n\nIssue 1: the widget returns the wrong number.\n" +
        "Severity: Major\nEvidence paths: src/widget.py\n",
    ]);
    const { code, out } = await capturedAsync(() => runRound(sessionsDir));
    expect(code).toBe(EXIT_BLOCKING);
    expect(out).toContain("1 blocking finding(s)");

    const [row] = readRounds(repo, 1);
    expect(row?.["blocking"]).toBe(true);
    const findings = row?.["findings"] as Array<Record<string, unknown>>;
    expect(findings[0]?.["severity"]).toBe("major");
    expect(findings[0]?.["blocking"]).toBe(true);
    expect(findings[0]?.["evidencePaths"]).toEqual(["src/widget.py"]);
    expect(findings[0]?.["section"]).toBe("body");
  });

  it("refuses a second round after a terminal row, naming the row", async () => {
    const { repo, sessionsDir } = await reviewable(["VERIFIED\n"]);
    appendRound(repo, 1, {
      round: 1,
      type: "adjudication",
      verdict: "VERIFIED",
      blocking: false,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [],
      outcomes: [{ finding_index: 0, outcome: "OVERRULED", reasons: "the cite is wrong" }],
      excluded_providers: ["anthropic"],
      completion_tree: snapshotWorktreeTree(repo),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    const { code, err } = await capturedAsync(() => runRound(sessionsDir));
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("already carries its adjudication row");
    expect(err).toContain("one per session, ever");
  });

  it("refuses a round with no session in flight", async () => {
    const { sessionsDir } = makeSandboxRepo();
    const { code, err } = await capturedAsync(() => runRound(sessionsDir));
    expect(code).toBe(EXIT_STATE);
    expect(err).toContain("no session is in flight");
  });

  it("measures round 2 against round 1's tree, not against HEAD", async () => {
    // A remediation answers for what the fix changed and nothing else.
    const { repo, sessionsDir } = await reviewable([
      "ISSUES FOUND\n\nIssue 1: wrong number.\nSeverity: Major\n" +
        "Evidence paths: src/widget.py\n",
      "VERIFIED\n\nThe fix is right.\n",
    ]);
    await capturedAsync(() => runRound(sessionsDir));
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 3\n", "utf8");
    const { code } = await capturedAsync(() => runRound(sessionsDir));
    expect(code).toBe(EXIT_OK);

    const rounds = readRounds(repo, 1);
    expect(rounds).toHaveLength(2);
    expect(rounds[1]?.["phase"]).toBe("fix-delta");
    expect(rounds[1]?.["previous_tree"]).toBe(rounds[0]?.["completion_tree"]);
  });

  it("terminates UNRESOLVED at the cap when no cited path was touched", async () => {
    // REMEDIATED AT THE CAP lands work no verifier reviewed, so it is
    // granted only when the fix delta touches a path each finding cited. A
    // changed tree is not that.
    const { repo, sessionsDir } = await reviewable([]);
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [
        {
          severity: "major",
          description: "the widget is wrong",
          blocking: true,
          evidencePaths: ["src/widget.py"],
        },
      ],
      completion_tree: snapshotWorktreeTree(repo),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    writeFileSync(join(repo, "unrelated.txt"), "not the fix\n", "utf8");
    const { code, err } = await capturedAsync(() => runRound(sessionsDir, { maxRounds: 1 }));
    // Its own code: no round is written here, so an orchestrator told
    // "blocking" would send the engine to dispose of findings that are not
    // there and arrive back at this same refusal, forever.
    expect(code).toBe(EXIT_UNRESOLVED);
    expect(code).not.toBe(EXIT_BLOCKING);
    expect(err).toContain("verify: UNRESOLVED");
    expect(err).toContain("cited: src/widget.py");
    expect(err).toContain("Nothing lands but the record");
  });

  it("records REMEDIATED AT THE CAP when the fix touches every cited path", async () => {
    const { repo, sessionsDir } = await reviewable([]);
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      transport: "offline",
      findings: [
        {
          severity: "major",
          description: "the widget is wrong",
          blocking: true,
          evidencePaths: ["src/widget.py"],
        },
      ],
      completion_tree: snapshotWorktreeTree(repo),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 3\n", "utf8");
    const { code, out } = await capturedAsync(() => runRound(sessionsDir, { maxRounds: 1 }));
    expect(code).toBe(EXIT_OK);
    expect(out).toContain("verify: REMEDIATED AT THE CAP");
    expect(out).toContain("The work lands labelled UNREVIEWED");

    const rows = readRounds(repo, 1);
    expect(rows[1]?.["type"]).toBe("remediated_at_cap");
    expect(rows[1]?.["verdict"]).toBe("REMEDIATED_AT_CAP");
    expect(rows[1]?.["blocking"]).toBe(false);
    // It is not a waiver, and the change log must not read like one.
    const changeLog = readFileSync(join(sessionsDir, "change-log.md"), "utf8");
    expect(changeLog).toContain("It is not a waiver");
  });

  it("sends a disputed finding to adjudication rather than terminating it", async () => {
    // A dispute says a finding is wrong, not that it was fixed, so it is
    // judged rather than terminated. Consensus precedes termination.
    const { repo, sessionsDir } = await reviewable([]);
    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      verifier_model: "offline:01.md",
      verifier_provider: "offline",
      findings: [
        { severity: "major", description: "wrong", blocking: true, evidencePaths: ["src/widget.py"] },
      ],
      completion_tree: snapshotWorktreeTree(repo),
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    appendDispute(repo, 1, {
      round: 1,
      finding_index: 0,
      filed_after_round: 1,
      grounds: "it is right",
      evidence_paths: ["src/widget.py"],
      recorded_at: "2026-01-01T00:01:00+00:00",
    });
    const { code, err } = await capturedAsync(() => runRound(sessionsDir, { maxRounds: 1 }));
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("carries disputed blocking finding(s)");
    expect(err).toContain("verify adjudicate");
  });
});

// --- The critique bundle ------------------------------------------------------

describe("the change-id", () => {
  it("is a function of the two trees and nothing else", () => {
    // The same reviewed tree always yields the same id, so nothing can file
    // fresh evidence against a review it has already passed.
    expect(deriveChangeId("a".repeat(40), "b".repeat(40))).toBe(
      deriveChangeId("a".repeat(40), "b".repeat(40)),
    );
    expect(deriveChangeId("a".repeat(40), "b".repeat(40))).not.toBe(
      deriveChangeId("c".repeat(40), "b".repeat(40)),
    );
    expect(deriveChangeId(null, "b".repeat(40))).toHaveLength(16);
  });

  it("refuses to derive one from a tree that could not be snapshotted", () => {
    expect(() => deriveChangeId("a".repeat(40), "")).toThrow(/cannot derive a change-id/);
  });
});

describe("the author's claims", () => {
  it("reads a bare list and an object carrying one", () => {
    const dir = makeTempDir();
    const list = join(dir, "list.json");
    writeFileSync(list, '[{"claim_id": "c1", "statement": "s"}]', "utf8");
    expect(loadAuthorClaims(list)).toHaveLength(1);
    const wrapped = join(dir, "wrapped.json");
    writeFileSync(wrapped, '{"claims": []}', "utf8");
    expect(loadAuthorClaims(wrapped)).toEqual([]);
    expect(loadAuthorClaims(null)).toEqual([]);
  });

  it("refuses a supplied change_id rather than honouring it", () => {
    // An id a model may choose is an id a model may reuse.
    const path = join(makeTempDir(), "claims.json");
    writeFileSync(path, '{"change_id": "deadbeef", "claims": []}', "utf8");
    expect(() => loadAuthorClaims(path)).toThrow(/cannot be supplied/);
  });

  it("refuses a bare claim object, rather than reading it as zero claims", () => {
    // Reading it as zero claims would silently discard what the author wrote.
    const path = join(makeTempDir(), "claims.json");
    writeFileSync(path, '{"claim_id": "c1", "statement": "s"}', "utf8");
    expect(() => loadAuthorClaims(path)).toThrow(/an object with no 'claims' key/);
  });

  it("renders a twin that says so when the author claims nothing", () => {
    const markdown = renderClaimsMarkdown({
      change_id: "abc",
      attempt: 2,
      recorded_at: "2026-01-01T00:00:00+00:00",
      claims: [],
    });
    expect(markdown).toContain("# Review claims — change abc");
    expect(markdown).toContain("- Attempt: 2");
    expect(markdown).toContain("The author claims nothing about this change.");
    expect(markdown.endsWith("\n")).toBe(true);
  });
});

// --- The command line --------------------------------------------------------

describe("the verify command line", () => {
  it("refuses a flag it does not have, rather than ignoring it", async () => {
    // A dropped `--max-rounds` would run the loop at the DEFAULT cap while
    // the operator believed they had lowered it, and nothing in the record
    // would say the flag was ignored. argparse errors here and so does this.
    const { code, err } = await capturedAsync(() =>
      verifyVerb(["--max-rnds", "2"]),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("unrecognized arguments: --max-rnds");
  });

  it("accepts an unambiguous abbreviation, as argparse does", async () => {
    // The other direction of the same fidelity: `--max-round` IS
    // `--max-rounds` on the Python side, so a router that refused it would
    // turn a working command line into an error for the same words. It gets
    // past the parser and refuses on state instead, which is the proof.
    const { code, err } = await capturedAsync(() =>
      verifyVerb(["--max-round", "2", "--sessions-dir", makeTempDir()]),
    );
    expect(err).not.toContain("unrecognized arguments");
    expect(code).not.toBe(EXIT_OK);
  });

  it("refuses an abbreviation two flags answer to", async () => {
    // `verify step open` declares both `--sessions-dir` and `--step`, so
    // `--s` names neither. Under `amend`, which declares no `--step`, the
    // same token resolves -- which is why the allowed list is per verb.
    const { code, err } = await capturedAsync(() =>
      verifyVerb(["step", "open", "--s", "x"]),
    );
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain("ambiguous option: --s");
  });
});

// --- helpers ------------------------------------------------------------------

function headOf(repo: string): string {
  return runGit(repo, ["rev-parse", "--verify", "HEAD"]).stdout;
}

/** An empty repository whose every commit date the caller pins. */
function pinnedRepo(): string {
  const repo = makeTempDir();
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "commit.gpgsign", "false");
  return repo;
}

/**
 * A commit with a pinned COMMITTER date -- `legalAnchor` reads `%cI`, and
 * `git commit --date` moves only the author's.
 */
function commitAt(repo: string, name: string, when: string): void {
  writeFileSync(join(repo, name), `${name}
`, "utf8");
  git(repo, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", name, "--no-gpg-sign"], {
    cwd: repo,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when,
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

