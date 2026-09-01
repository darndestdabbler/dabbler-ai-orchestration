// The close gates, and the driver that runs them.
//
// Each gate is here because an incident is, so each test names the state
// the gate refuses rather than the code path it takes. The parity control
// proves the two routers word these identically; what these prove is the
// answer itself -- including the states the corpus never reaches, which is
// most of the interesting ones.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  EVIDENCE_GATES,
  GATE_CHECKS,
  GATE_PUBLISHED_WHEN_RELEASABLE,
  type GateResult,
  runGates,
} from "../src/gates.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { appendPackaging, appendRound, roundsPath } from "../src/ledger.ts";
import { recordRun } from "../src/testEvidence.ts";
import { declareSessionTask, registerSessionStart } from "../src/writers.ts";
import { git, makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

function byName(results: readonly GateResult[]): Record<string, GateResult> {
  return Object.fromEntries(results.map((row) => [row.name, row]));
}

function recordRound(
  repo: string,
  options: {
    blocking?: boolean;
    round?: number;
    previousTree?: string;
    verdict?: string;
    type?: string;
    remediated?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  const blocking = options.blocking ?? false;
  const row: Record<string, unknown> = {
    round: options.round ?? 1,
    verdict: options.verdict ?? (blocking ? "ISSUES_FOUND" : "VERIFIED"),
    blocking,
    verifier_model: "gpt-5-4",
    verifier_provider: "openai",
    findings: [],
    cost_usd: 0.05,
    completion_tree: snapshotWorktreeTree(repo),
    recorded_at: new Date().toISOString(),
  };
  if (options.previousTree) row["previous_tree"] = options.previousTree;
  if (options.type) row["type"] = options.type;
  if (options.remediated) row["remediated"] = options.remediated;
  appendRound(repo, 1, row);
  return row;
}

/**
 * A session in the state a clean close expects: registered, work committed
 * and pushed, one non-blocking round recorded, and a green run of record
 * bound to the tree it ran against.
 */
function closeReady(): { repo: string; sessionsDir: string } {
  const { repo, sessionsDir } = makeSandboxRepo();
  registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
  writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "work");
  git(repo, "push", "-q");
  recordFullRun(sessionsDir);
  recordRound(repo);
  return { repo, sessionsDir };
}

/**
 * The run of record for `SUITE`.
 *
 * A gate reads the suites the CONFIG declares, and the ambient config
 * belongs to whichever repository the tests are running in -- never to the
 * sandbox. So every test that means to exercise this gate hands it
 * `CONFIG`; the other gates' tests get the vacuous "no expensive suite is
 * declared" pass, which is what the Python twin's fixture gets too.
 */
function recordFullRun(sessionsDir: string): void {
  recordRun(sessionsDir, SUITE, "passed", { stage: "final-full", durationSeconds: 1.5 });
}

const SUITE = {
  name: "pytest",
  command: "pytest",
  covers: ["."],
  expensive: true,
  runsWhole: false,
};

const CONFIG = {
  testing: {
    suites: [{ name: "pytest", command: "pytest", covers: ["."], expensive: true }],
  },
};

describe("a close with nothing wrong with it", () => {
  it("passes all seven gates", () => {
    const { sessionsDir } = closeReady();
    const results = runGates(sessionsDir, { config: CONFIG });
    expect(results).toHaveLength(7);
    for (const row of results) {
      expect(`${row.name}: ${row.remediation}`).toBe(`${row.name}: `);
    }
  });

  it("runs the seven in the order the close prints them", () => {
    // `owed_decisions` sits after `test_run_fresh` on purpose: the operator
    // reads "nothing was measured" and then reads why that is not allowed to
    // stand, in that order.
    expect(GATE_CHECKS.map(([name]) => name)).toEqual([
      "verification_clean",
      "working_tree_clean",
      "pushed_to_remote",
      "test_run_fresh",
      "owed_decisions",
      // Before `verdict_vocabulary` rather than after: a session that
      // shipped nothing is a fact about the work, and the vocabulary check
      // is a fact about how the record spells its verdicts. The operator
      // reads what went wrong before how it was written down.
      "published_when_releasable",
      "verdict_vocabulary",
    ]);
  });
});

describe("verification_clean", () => {
  it("refuses a session with no round, and names the command that opens one", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("dabbler verify");
  });

  it("refuses while the latest round is blocking", () => {
    const { repo, sessionsDir } = closeReady();
    const tree = snapshotWorktreeTree(repo) as string;
    recordRound(repo, { blocking: true, round: 2, previousTree: tree });
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("blocking finding");
  });

  it("refuses when the work changed after the round that verified it", () => {
    const { repo, sessionsDir } = closeReady();
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 3\n", "utf8");
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("changed after verification");
  });

  it("allows the session's own bookkeeping to move after the round", () => {
    // `verify` writes the verdict and the change-log entry after its final
    // snapshot, so a gate that counted them as work would make every
    // verified session unclosable.
    const { sessionsDir } = closeReady();
    writeFileSync(join(sessionsDir, "change-log.md"), "## s1\n", "utf8");
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(true);
  });

  it("refuses a state file that no sanctioned write accounts for", () => {
    const { sessionsDir } = closeReady();
    const path = join(sessionsDir, "sessions.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("in-progress", "complete"), "utf8");
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("out of band");
  });

  it("fails closed on a ledger it cannot parse rather than trusting it", () => {
    const { repo, sessionsDir } = closeReady();
    const path = roundsPath(repo, 1);
    writeFileSync(path, readFileSync(path, "utf8").replace('"VERIFIED"', "not json"), "utf8");
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("failing closed");
  });

  it("passes a cap remediation and says out loud that nobody reviewed it", () => {
    const { repo, sessionsDir } = closeReady();
    const tree = snapshotWorktreeTree(repo) as string;
    recordRound(repo, {
      round: 2,
      previousTree: tree,
      verdict: "REMEDIATED_AT_CAP",
      type: "remediated_at_cap",
      remediated: {
        reviewed_round: 1,
        findings: [
          { description: "one", severity: "major" },
          { description: "two", severity: "critical" },
        ],
        fix_paths: ["src/widget.py"],
      },
    });
    const row = byName(runGates(sessionsDir))["verification_clean"];
    expect(row.passed).toBe(true);
    expect(row.remediation).toContain("2 blocking finding(s)");
    expect(row.remediation).toContain("LANDS UNREVIEWED");
  });

  it("closes in a repository that never ignored the run ledger", () => {
    // The round is written after the tree it describes, so counting it as
    // work made every verified session unclosable no matter how many times
    // it was re-verified.
    const { repo, sessionsDir } = makeSandboxRepo();
    writeFileSync(join(repo, ".gitignore"), "__pycache__/\n", "utf8");
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    recordRound(repo);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "work");
    git(repo, "push", "-q");
    for (const row of runGates(sessionsDir)) {
      expect(row.passed).toBe(true);
      // An inapplicable gate carries the reason it judged nothing. Only the
      // gates that actually measured something are silent.
      if (row.inapplicable) continue;
      expect(`${row.name}: ${row.remediation}`).toBe(`${row.name}: `);
    }
  });

  it("reports SKIP rather than PASS when no suite is declared", () => {
    // The sandbox declares a suite; a repository that declares none is the
    // state csv-model closed session 1 in, at a clean 5/5 with nothing
    // runnable. A gate that cannot see its own precondition must not report
    // success -- it grows quieter as the work grows more consequential.
    const { sessionsDir } = makeSandboxRepo();
    const row = runGates(sessionsDir, {
      config: { testing: { suites: [] } } as never,
    }).find((entry) => entry.name === "test_run_fresh");
    expect(row?.inapplicable).toBe(true);
    expect(row?.remediation).toContain("no suite is declared");
  });
});

describe("working_tree_clean", () => {
  it("refuses uncommitted work and previews the first five paths", () => {
    const { repo, sessionsDir } = closeReady();
    for (let index = 0; index < 7; index += 1) {
      writeFileSync(join(repo, `extra-${index}.txt`), "x\n", "utf8");
    }
    const row = byName(runGates(sessionsDir))["working_tree_clean"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("(+2 more)");
  });

  it("ignores editor droppings, which are nobody's work", () => {
    const { repo, sessionsDir } = closeReady();
    writeFileSync(join(repo, ".DS_Store"), "junk", "utf8");
    writeFileSync(join(repo, "notes.txt~"), "junk", "utf8");
    expect(byName(runGates(sessionsDir))["working_tree_clean"].passed).toBe(true);
  });

  it("ignores a modified bookkeeping file even when git lists it first", () => {
    // The first porcelain line has no leading marker to strip; a parser that
    // trimmed the whole line would read the path one character short.
    const { sessionsDir } = closeReady();
    writeFileSync(join(sessionsDir, "decisions-log.md"), "# Decisions\n", "utf8");
    expect(byName(runGates(sessionsDir))["working_tree_clean"].passed).toBe(true);
  });
});

describe("pushed_to_remote", () => {
  it("refuses a commit the upstream has not seen", () => {
    const { repo, sessionsDir } = closeReady();
    writeFileSync(join(repo, "extra.txt"), "x\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "later");
    const row = byName(runGates(sessionsDir))["pushed_to_remote"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("ahead of");
  });

  it("waives the gate for a repository that declares itself local-only", () => {
    const { repo, sessionsDir } = closeReady();
    git(repo, "remote", "remove", "origin");
    mkdirSync(join(repo, ".dabbler"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "local-only"), "", "utf8");
    const row = byName(runGates(sessionsDir))["pushed_to_remote"];
    expect(row.passed).toBe(true);
    expect(row.remediation).toContain("local-only repo");
  });

  it("refuses a branch with no upstream and no local-only marker", () => {
    const { repo, sessionsDir } = closeReady();
    git(repo, "checkout", "-q", "-b", "side");
    const row = byName(runGates(sessionsDir))["pushed_to_remote"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("--set-upstream");
  });
});

describe("test_run_fresh", () => {
  it("refuses a malformed suite declaration rather than reading it as none", () => {
    // "No expensive suites declared" and "every declared suite was a typo"
    // must never be indistinguishable.
    const { sessionsDir } = closeReady();
    const row = byName(
      runGates(sessionsDir, {
        config: { testing: { suites: [{ name: "unit" }] } },
      }),
    )["test_run_fresh"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("testing.suites");
  });

  it("asks nothing of a repository that declares no expensive suite", () => {
    const { sessionsDir } = closeReady();
    const row = byName(
      runGates(sessionsDir, { config: { testing: { suites: [] } } }),
    )["test_run_fresh"];
    expect(row.passed).toBe(true);
  });

  it("refuses when no run of record covers the declared suite", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const row = byName(runGates(sessionsDir, { config: CONFIG }))["test_run_fresh"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("no final-full run of record");
  });

  it("accepts a green run of record bound to this tree", () => {
    const { sessionsDir } = closeReady();
    const row = byName(runGates(sessionsDir, { config: CONFIG }))["test_run_fresh"];
    expect(`${row.passed}: ${row.remediation}`).toBe("true: ");
  });

  it("refuses a green run of record the tree has moved under", () => {
    const { repo, sessionsDir } = closeReady();
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 9\n", "utf8");
    const row = byName(runGates(sessionsDir, { config: CONFIG }))["test_run_fresh"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("PREDATES");
  });
});

describe("published_when_releasable", () => {
  it("refuses a releasable session with no packaging run on its record", () => {
    // csv-model session 6: declared releasable, held a valid packaging
    // declaration, passed every gate, landed, closed VERIFIED -- and
    // published nothing, because no phase ever called packaging and no gate
    // ever asked. The phase is the fix; this is what keeps it fixed.
    const { sessionsDir } = closeReady();
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship it", releasable: true });
    const row = byName(runGates(sessionsDir, { config: CONFIG }))["published_when_releasable"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("releasable");
    // And it says where the record comes from, so the reader knows what did
    // not happen rather than only that something is missing.
    expect(row.remediation).toContain("publish phase");
  });

  it("refuses a releasable session whose packaging runs all shipped nothing, and passes one that published", () => {
    // A row is a record of TRYING. The gate used to accept any of them,
    // which reads as sound only for the driven path -- where a feed refusal
    // stops the session before the close. Every other path to the close is
    // real, and the obvious one is the operator's: a publish stop offers
    // "run it again" or "cancel", neither works, so they run `session
    // close` by hand and the gate that exists to prove something shipped
    // says PASS over a refusal.
    const { repo, sessionsDir } = closeReady();
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship it", releasable: true });
    appendPackaging(repo, 1, {
      outcome: "refused",
      session_number: 1,
      releasable: true,
      refusal: "the feed would not take the artifact",
      recorded_at: new Date().toISOString(),
    });
    const refused = byName(runGates(sessionsDir, { config: CONFIG }))["published_when_releasable"];
    expect(refused.passed).toBe(false);
    expect(refused.remediation).toContain("not of shipping");

    appendPackaging(repo, 1, {
      outcome: "published",
      session_number: 1,
      releasable: true,
      feed: "https://feed.example/v3/index.json",
      secret_name: "FEED_PAT",
      artifacts: ["widget.1.0.0.nupkg"],
      steps: [
        { step: "pack", command: "pack {output}", exit_code: 0, duration_seconds: 1 },
        { step: "push", command: "push {artifact}", exit_code: 0, duration_seconds: 1 },
      ],
      recorded_at: new Date().toISOString(),
    });
    expect(
      byName(runGates(sessionsDir, { config: CONFIG }))["published_when_releasable"].passed,
    ).toBe(true);
  });

  it("is omitted rather than passed for the run that is trying to publish", () => {
    // packaging asks the close's gates as its own preconditions, and this
    // one asks whether packaging has run. Asked of packaging by packaging it
    // answers itself wrongly: the first publication would be refused for not
    // having happened, and no session could ever publish. Omitted, not
    // passed -- a green row nobody evaluated is worse than no row, because
    // something downstream will read it as evidence.
    const { sessionsDir } = closeReady();
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship it", releasable: true });
    const rows = runGates(sessionsDir, {
      config: CONFIG,
      omit: [GATE_PUBLISHED_WHEN_RELEASABLE],
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.name)).not.toContain(GATE_PUBLISHED_WHEN_RELEASABLE);
    // Every other gate still answered, so the omission is one gate and not
    // a way past the set.
    expect(rows.every((row) => row.passed)).toBe(true);
  });

  it("passes a session that was never going to publish", () => {
    // The ordinary case, and every session this repository has ever run.
    const { sessionsDir } = closeReady();
    expect(
      byName(runGates(sessionsDir, { config: CONFIG }))["published_when_releasable"].passed,
    ).toBe(true);
  });
});

describe("verdict_vocabulary", () => {
  it("refuses a token no writer of this router ever produced", () => {
    // Incident replay: a confabulated token must never survive to a close
    // even if it somehow reached the state file.
    const { sessionsDir } = closeReady();
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8")) as {
      sessions: Record<string, unknown>[];
    };
    state.sessions[0]["verificationVerdict"] = "manual-override-development";
    writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
    const row = byName(runGates(sessionsDir))["verdict_vocabulary"];
    expect(row.passed).toBe(false);
    expect(row.remediation).toContain("closed vocabulary");
  });

  it("stays silent about a session with no rounds at all", () => {
    // Absence of rounds is verification_clean's finding; double-reporting
    // one root cause is worse than silence.
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect(byName(runGates(sessionsDir))["verdict_vocabulary"].passed).toBe(true);
  });
});

describe("the driver", () => {
  it("turns a gate that throws into a failed row rather than wedging the close", () => {
    // A repository path that is not a repository at all reaches the first
    // guard of every gate; the point is that every row still comes back.
    const results = runGates(join(makeSandboxRepo().repo, "nowhere"));
    expect(results).toHaveLength(7);
    expect(results.every((row) => typeof row.remediation === "string")).toBe(true);
  });

  it("lets --force skip the bookkeeping gates and never the evidence ones", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const rows = byName(runGates(sessionsDir, { forced: true }));
    for (const [name, row] of Object.entries(rows)) {
      if (EVIDENCE_GATES.has(name)) {
        expect(row.remediation).not.toContain("skipped by --force");
      } else {
        expect(row.passed).toBe(true);
        expect(row.remediation).toBe("skipped by --force (bookkeeping gate)");
      }
    }
    expect(rows["verification_clean"].passed).toBe(false);
  });

  it("keeps the evidence gates to exactly the three that read the record", () => {
    // Whether the tree was verified, whether the verdict is a word this
    // framework knows, and whether the artifact a releasable session exists
    // to produce was produced. `--force` is for formalities.
    expect([...EVIDENCE_GATES].sort()).toEqual([
      "published_when_releasable",
      "verdict_vocabulary",
      "verification_clean",
    ]);
  });
});
