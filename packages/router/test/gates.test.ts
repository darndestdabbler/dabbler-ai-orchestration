// The close gates' judges, with literal facts. No repository, no setup: a
// judge takes what a reader would have returned and answers the row. The
// readers themselves are exercised in walk-git-states.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVIDENCE_GATES,
  GATE_CHECKS,
  classifyPushFailure,
  judgeFreshness,
  judgeLatestRound,
  judgeOwedDecisions,
  judgePackagingRecord,
  judgePushState,
  judgeSuiteDeclaration,
  judgeTreeSinceRound,
  judgeVerdictTokens,
  judgeVerification,
  judgeWorktree,
  materialPaths,
  parsePorcelain,
  parseRevListCount,
  previewPaths,
  runGates,
  unquotePorcelainPath,
  type PushFacts,
  type VerificationFacts,
} from "../src/gates.ts";
import type { SuiteLoadResult } from "../src/testEvidence.ts";

const SESSIONS = "docs/sessions";

describe("working_tree_clean: what counts as work in a porcelain status", () => {
  it("keeps modified and untracked paths, taking the new name of a rename", () => {
    const status = " M src/a.ts\n?? new.txt\nR  old.txt -> renamed.txt\n";
    assert.deepEqual(materialPaths(status, SESSIONS), ["src/a.ts", "new.txt", "renamed.txt"]);
  });

  it("decodes the C-quoting git puts around a path it had to escape", () => {
    // Octal bytes reassemble to UTF-8; the control escapes and the escaped
    // quote and backslash mean themselves.
    assert.equal(unquotePorcelainPath('"caf\\303\\251.txt"'), "café.txt");
    assert.equal(unquotePorcelainPath('"tab\\there"'), "tab\there");
    assert.equal(unquotePorcelainPath('"quo\\"te"'), 'quo"te');
    assert.equal(unquotePorcelainPath('"back\\\\slash"'), "back\\slash");
    assert.equal(unquotePorcelainPath("plain name.txt"), "plain name.txt");
    assert.deepEqual(parsePorcelain('?? "caf\\303\\251.txt"\n M a.txt\n'), [
      { code: "??", path: "café.txt" },
      { code: " M", path: "a.txt" },
    ]);
  });

  it("keeps a backslash that is part of a quoted name, and reads one in an unquoted path as a separator", () => {
    assert.deepEqual(materialPaths('?? "back\\\\slash"\n?? docs\\notes.md\n', SESSIONS), ["back\\slash", "docs/notes.md"]);
  });

  it("answers the working-tree question from the facts alone", () => {
    assert.deepEqual(judgeWorktree({ root: null, porcelain: "", error: "", setRel: SESSIONS }, SESSIONS), {
      paths: [],
      error: "not inside a git repository: docs/sessions",
    });
    assert.deepEqual(judgeWorktree({ root: "/r", porcelain: "", error: "git status failed: boom", setRel: SESSIONS }, SESSIONS), {
      paths: [],
      error: "git status failed: boom",
    });
    assert.deepEqual(judgeWorktree({ root: "/r", porcelain: " M a.txt\n", error: "", setRel: SESSIONS }, SESSIONS), {
      paths: ["a.txt"],
      error: "",
    });
  });

  it("reads a rev-list count as an integer and anything else as none", () => {
    assert.equal(parseRevListCount("3"), 3);
    assert.equal(parseRevListCount(" 12\n"), 12);
    assert.equal(parseRevListCount("fatal: bad revision"), 0);
    assert.equal(parseRevListCount(""), 0);
  });

  it("ignores editor droppings, which are nobody's work", () => {
    const status =
      "?? .DS_Store\n?? a.swp\n?? b~\n?? Thumbs.db\n?? desktop.ini\n?? docs/sessions/.lifecycle.lock\n";
    assert.deepEqual(materialPaths(status, SESSIONS), []);
  });

  it("ignores the session's own bookkeeping under the sessions root and nowhere else", () => {
    const status = " M docs/sessions/sessions.json\n M elsewhere/sessions.json\n";
    assert.deepEqual(materialPaths(status, SESSIONS), ["elsewhere/sessions.json"]);
  });

  it("ignores the run ledger, which is the record and not the work", () => {
    assert.deepEqual(materialPaths("?? .dabbler/runs/s1/rounds.jsonl\n", SESSIONS), []);
  });

  it("skips a line too short to carry a path", () => {
    assert.deepEqual(materialPaths("??\n\n", SESSIONS), []);
  });

  it("previews the first five paths and counts the rest", () => {
    assert.equal(previewPaths(["a", "b", "c", "d", "e", "f", "g"]), "a, b, c, d, e (+2 more)");
    assert.equal(previewPaths(["a"]), "a");
  });
});

function pushFacts(overrides: Partial<PushFacts>): PushFacts {
  return {
    branch: "main",
    upstream: "origin/main",
    localOnlyMarker: false,
    hasRemote: true,
    ahead: 0,
    dryRunError: null,
    ...overrides,
  };
}

describe("pushed_to_remote: the row from the push facts", () => {
  it("refuses a detached HEAD", () => {
    assert.deepEqual(judgePushState(pushFacts({ branch: null })), [
      false,
      "HEAD is detached; check out a branch before close-out",
    ]);
  });

  it("waives the gate for a local-only repository with no remote at all", () => {
    const row = judgePushState(pushFacts({ upstream: null, localOnlyMarker: true, hasRemote: false }));
    assert.equal(row[0], true);
    assert.match(row[1], /local-only repo: push gate waived/);
  });

  it("does not waive it when the marker is present but a remote is configured", () => {
    const row = judgePushState(pushFacts({ upstream: null, localOnlyMarker: true, hasRemote: true }));
    assert.equal(row[0], false);
    assert.match(row[1], /has no upstream/);
  });

  it("refuses a branch with no upstream and names the command that sets one", () => {
    assert.deepEqual(judgePushState(pushFacts({ upstream: null })), [
      false,
      "branch 'main' has no upstream; run: git push --set-upstream <remote> main",
    ]);
  });

  it("passes a branch its upstream has fully seen", () => {
    assert.deepEqual(judgePushState(pushFacts({ ahead: 0 })), [true, ""]);
  });

  it("refuses commits the upstream has not seen and says how many", () => {
    assert.deepEqual(judgePushState(pushFacts({ ahead: 2 })), [
      false,
      "branch 'main' is 2 commit(s) ahead of origin/main; run: git push",
    ]);
  });

  it("names a non-fast-forward when the dry run says so", () => {
    const row = judgePushState(pushFacts({ ahead: 1, dryRunError: "! [rejected] non-fast-forward" }));
    assert.deepEqual(row, [false, "non-fast-forward; rebase or pull --rebase first"]);
  });

  it("falls back to the first line of an unrecognised dry-run failure", () => {
    assert.equal(classifyPushFailure("ssh: could not resolve\nsecond line"), "git push --dry-run failed: ssh: could not resolve");
    assert.equal(classifyPushFailure(""), "git push --dry-run failed: unknown error");
  });
});

describe("verification_clean: the rounds, then the tree", () => {
  it("refuses a session with no round and names the command that opens one", () => {
    const row = judgeLatestRound([], 7, SESSIONS);
    assert.equal(row?.[0], false);
    assert.match(row?.[1] ?? "", /no verification round is recorded for session 7/);
    assert.match(row?.[1] ?? "", /dabbler verify --sessions-dir docs\/sessions/);
  });

  it("refuses while the latest round is blocking", () => {
    const rounds = [{ round: 1, blocking: false }, { round: 2, blocking: true, verdict: "ISSUES_FOUND" }];
    const row = judgeLatestRound(rounds, 7, SESSIONS);
    assert.match(row?.[1] ?? "", /round 2 ended with blocking findings \(ISSUES_FOUND\)/);
  });

  it("hands over to the tree when the latest round is not blocking", () => {
    assert.equal(judgeLatestRound([{ round: 1, blocking: false }], 7, SESSIONS), null);
  });

  it("refuses when the work changed after the round that verified it", () => {
    const row = judgeTreeSinceRound({ round: 3 }, ["src/a.ts"], SESSIONS, SESSIONS);
    assert.deepEqual(row, [
      false,
      "the working tree changed after verification round 3: src/a.ts. Re-run: dabbler verify --sessions-dir docs/sessions",
    ]);
  });

  it("allows the session's own bookkeeping to move after the round", () => {
    const changed = ["docs/sessions/sessions.json", "docs/sessions/activity-log.json"];
    assert.deepEqual(judgeTreeSinceRound({ round: 3 }, changed, SESSIONS, SESSIONS), [true, ""]);
  });

  it("previews five changed paths and counts the rest", () => {
    const changed = ["a", "b", "c", "d", "e", "f"];
    assert.match(judgeTreeSinceRound({ round: 1 }, changed, SESSIONS, SESSIONS)[1], /a, b, c, d, e \(\+1 more\)/);
  });

  it("refuses, in order, a missing repository, a hand edit, no session, an unreadable ledger, and a tree it cannot measure", () => {
    const facts = (overrides: Partial<VerificationFacts>): VerificationFacts => ({
      root: "/r",
      outOfBand: null,
      current: 7,
      rounds: [{ round: 1, blocking: false, completion_tree: "t" }],
      ledgerError: null,
      currentTree: "u",
      changedSinceLatest: [],
      setRel: SESSIONS,
      ...overrides,
    });
    assert.equal(judgeVerification(facts({ root: null }), SESSIONS)[1], "not inside a git repository: docs/sessions");
    assert.match(judgeVerification(facts({ outOfBand: "sessions.json edited" }), SESSIONS)[1], /^session-state integrity: sessions\.json edited\./);
    assert.equal(judgeVerification(facts({ current: null }), SESSIONS)[1], "no session is in flight under docs/sessions");
    assert.match(judgeVerification(facts({ rounds: null, ledgerError: "bad row" }), SESSIONS)[1], /unreadable or invalid \(bad row\)/);
    assert.match(judgeVerification(facts({ rounds: [] }), SESSIONS)[1], /no verification round is recorded/);
    assert.match(judgeVerification(facts({ currentTree: null }), SESSIONS)[1], /could not snapshot/);
    assert.match(judgeVerification(facts({ changedSinceLatest: null }), SESSIONS)[1], /could not diff/);
    assert.deepEqual(judgeVerification(facts({}), SESSIONS), [true, ""]);
  });

  it("passes a cap remediation and says out loud that nobody reviewed it", () => {
    const latest = {
      round: 4,
      type: "remediated_at_cap",
      remediated: { reviewed_round: 3, findings: [{}, {}] },
    };
    const row = judgeTreeSinceRound(latest, [], SESSIONS, SESSIONS);
    assert.equal(row[0], true);
    assert.match(row[1], /remediated at the cap: 2 blocking finding\(s\) from round 3/);
    assert.match(row[1], /THIS WORK LANDS UNREVIEWED/);
  });
});

function loaded(errors: string[], expensive: boolean[]): SuiteLoadResult {
  return {
    errors,
    suites: expensive.map((flag, index) => ({ name: `s${index}`, expensive: flag })),
  } as unknown as SuiteLoadResult;
}

describe("test_run_fresh: the declaration, then the verdicts", () => {
  it("names the file the operator edits, and never the packaged layer beneath it", () => {
    const row = judgeSuiteDeclaration(loaded(["suite 0 has no command"], []));
    assert.equal(row?.[0], false);
    assert.match(row?.[1] ?? "", /fix testing\.suites in dabbler\.yaml/);
    assert.doesNotMatch(row?.[1] ?? "", /router-config\.yaml/);
  });

  it("reports inapplicable rather than passed when no expensive suite is declared", () => {
    assert.deepEqual(judgeSuiteDeclaration(loaded([], [false])), [
      true,
      "no suite is declared, so nothing was measured",
      true,
    ]);
  });

  it("hands over to the verdicts when an expensive suite is declared", () => {
    assert.equal(judgeSuiteDeclaration(loaded([], [false, true])), null);
  });

  it("names every required suite that is not fresh, and only those", () => {
    const verdicts = [
      { suite: "unit", required: true, passed: false, reason: "the tree moved", changedInputs: [] },
      { suite: "e2e", required: false, passed: false, reason: "never ran", changedInputs: [] },
      { suite: "lint", required: true, passed: true, reason: "", changedInputs: [] },
    ];
    assert.deepEqual(judgeFreshness(verdicts), [false, "unit: the tree moved"]);
    assert.deepEqual(judgeFreshness([verdicts[2]]), [true, ""]);
  });
});

describe("owed_decisions", () => {
  it("passes when nothing is owed", () => {
    assert.deepEqual(judgeOwedDecisions([]), [true, ""]);
  });

  it("refuses and names every unanswered verification-reducing decision", () => {
    const row = judgeOwedDecisions([{ id: "suite-undeclared" }, { id: "source-resolution" }]);
    assert.equal(row[0], false);
    assert.match(row[1], /^2 unanswered decision\(s\) would reduce what verification proves: suite-undeclared, source-resolution\./);
  });
});

describe("published_when_releasable", () => {
  it("refuses a releasable session with no packaging run on its record", () => {
    const row = judgePackagingRecord([]);
    assert.equal(row[0], false);
    assert.match(row[1], /no packaging run is on its record/);
  });

  it("refuses a record of trying that shipped nothing", () => {
    const row = judgePackagingRecord([{ outcome: "refused" }, { outcome: "failed" }]);
    assert.match(row[1], /holds 2 run\(s\) and none of them published/);
  });

  it("passes once a run published", () => {
    assert.deepEqual(judgePackagingRecord([{ outcome: "failed" }, { outcome: "published" }]), [true, ""]);
  });
});

describe("verdict_vocabulary", () => {
  it("passes tokens the router writes", () => {
    assert.deepEqual(judgeVerdictTokens([["run ledger", "VERIFIED"], ["session-state", "ISSUES_FOUND"]]), [true, ""]);
  });

  it("refuses a token no writer of this router ever produced, naming its source", () => {
    const row = judgeVerdictTokens([["session-state", "manual-override-development"]]);
    assert.equal(row[0], false);
    assert.match(row[1], /^session-state carries verdict 'manual-override-development', which is not in the closed vocabulary/);
  });
});

describe("the driver", () => {
  const pass = (): readonly [boolean, string] => [true, ""];
  const fail = (): readonly [boolean, string] => [false, "no"];

  it("turns a gate that throws into a failed row rather than wedging the close", () => {
    const boom = (): never => {
      throw new Error("boom");
    };
    const rows = runGates(SESSIONS, { gates: [["working_tree_clean", boom]] });
    assert.deepEqual(rows, [
      { name: "working_tree_clean", passed: false, remediation: "gate crashed (Error: boom); failing closed", inapplicable: false },
    ]);
  });

  it("lets --force skip the bookkeeping gates and never the evidence ones", () => {
    const rows = runGates(SESSIONS, {
      forced: true,
      gates: [["working_tree_clean", fail], ["verdict_vocabulary", fail]],
    });
    assert.deepEqual(rows.map((row) => [row.name, row.passed]), [
      ["working_tree_clean", true],
      ["verdict_vocabulary", false],
    ]);
    assert.equal(rows[0].remediation, "skipped by --force (bookkeeping gate)");
  });

  it("omits a named gate rather than passing it", () => {
    const rows = runGates(SESSIONS, {
      omit: ["published_when_releasable"],
      gates: [["published_when_releasable", pass], ["owed_decisions", pass]],
    });
    assert.deepEqual(rows.map((row) => row.name), ["owed_decisions"]);
  });

  it("marks an inapplicable row as such and not as a pass", () => {
    const skip = (): readonly [boolean, string, boolean] => [true, "nothing measured", true];
    const [row] = runGates(SESSIONS, { gates: [["test_run_fresh", skip]] });
    assert.equal(row.inapplicable, true);
  });

  it("keeps the evidence gates to exactly the three that read the record", () => {
    assert.deepEqual([...EVIDENCE_GATES].sort(), ["published_when_releasable", "verdict_vocabulary", "verification_clean"]);
  });

  it("runs the seven in the order the close prints them", () => {
    assert.deepEqual(GATE_CHECKS.map(([name]) => name), [
      "verification_clean",
      "working_tree_clean",
      "pushed_to_remote",
      "test_run_fresh",
      "owed_decisions",
      "published_when_releasable",
      "verdict_vocabulary",
    ]);
  });
});
