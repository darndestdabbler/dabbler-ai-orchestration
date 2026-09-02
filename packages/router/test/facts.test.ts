// `facts` -- the deterministic pass a round runs before it buys a verifier.
//
// The vocabulary is what these check. Four words, and the two that are not
// `pass` carry the weight: a control nobody declared and a control that could
// not be launched must never look like a control that ran and was green.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONTROL_TIMEOUT_SECONDS,
  DEFAULT_DIFF_EXCLUDES,
  EvidenceEmptyError,
  EvidenceTooLargeError,
  STATUS_FAIL,
  STATUS_NOT_APPLICABLE,
  STATUS_PASS,
  STATUS_UNKNOWN,
  appendFacts,
  assembleEvidence,
  assembleFixDeltaEvidence,
  buildDiffPathspecs,
  changedLines,
  checkEvidenceCap,
  collectControlFacts,
  controlFact,
  controlFactRed,
  controlSpec,
  factRecord,
  factRecordToDict,
  factsPath,
  loadControlsChecked,
  parseChangedLines,
  redFactsRefusal,
  runControl,
} from "../src/facts.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { git, makeSeededRepo } from "./support/fixtures.ts";

// KEPT REAL, deliberately: every describe here has git's or a child
// process's behavior as its subject -- evidence bundles over real diffs
// (untracked, deleted, inlined), changed-line counts parsed from real
// output, controls that really spawn and really time out. Recorded answers
// would restate the expected output beside itself and could never fail. The
// repositories are the cheap seeded kind, and the spawns ARE the test.

const CAP_ENV = "AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS";

afterEach(() => {
  delete process.env[CAP_ENV];
});

describe("the diff pathspecs", () => {
  it("excludes each pattern at any depth, and names the lifecycle files", () => {
    // The anchored form missed `tools/x/dist`, which is the incident this
    // shape exists for; and the session's own record is not its work.
    const pathspecs = buildDiffPathspecs();
    expect(pathspecs[0]).toBe(".");
    expect(pathspecs).toContain(":(exclude,glob)**/dist");
    expect(pathspecs).toContain(":(exclude,glob)**/dist/**");
    expect(pathspecs).toContain(":(exclude,glob)**/sessions.json");
    // A pattern that is already a glob gets no `/**` twin: `*.vsix/**` names
    // nothing, and git rejects a pathspec that matches no path.
    expect(pathspecs).toContain(":(exclude,glob)**/*.vsix");
    expect(pathspecs).not.toContain(":(exclude,glob)**/*.vsix/**");
    expect(DEFAULT_DIFF_EXCLUDES).toContain(".dabbler");
  });
});

describe("the round-1 evidence bundle", () => {
  it("refuses an empty bundle rather than routing a review of nothing", () => {
    // A session that already committed its work once verified nothing and
    // nearly closed clean.
    const repo = makeSeededRepo();
    expect(() => assembleEvidence(repo, join(repo, "docs"), 1)).toThrow(
      EvidenceEmptyError,
    );
  });

  it("inlines untracked files, because the diff only names them", () => {
    const repo = makeSeededRepo();
    writeFileSync(join(repo, "new.txt"), "brand new\n", "utf8");
    const bundle = assembleEvidence(repo, join(repo, "docs"), 1);
    expect(bundle).toContain("#### Untracked file contents");
    expect(bundle).toContain("**new.txt**");
    expect(bundle).toContain("brand new");
  });

  it("names a deleted file and does not reproduce it", () => {
    // The contents of a deleted file are the whole of what a deletion
    // costs the bundle and none of what a reviewer needs from it: the
    // question is which file went and what still reaches for it, and
    // neither is in the removed lines. The header is still there, so the
    // deletion is visible rather than hidden.
    const repo = makeSeededRepo({ "src/widget.py": "def widget():\n    return 1\n" });
    rmSync(join(repo, "src", "widget.py"));
    const bundle = assembleEvidence(repo, join(repo, "docs"), 1);
    expect(bundle).toContain("deleted file mode");
    expect(bundle).toContain("src/widget.py");
    expect(bundle).not.toContain("-def widget():");
  });

  it("names every untracked path it did not inline, with the reason", () => {
    // Exclusion is never silent: an omitted file a reviewer cannot see and
    // was never told about is a hole in the evidence.
    const repo = makeSeededRepo();
    writeFileSync(join(repo, "big.txt"), "x".repeat(64 * 1024 + 1), "utf8");
    writeFileSync(join(repo, "raw.bin"), Buffer.from([0xff, 0xfe, 0x00]));
    writeFileSync(join(repo, "seen.txt"), "readable\n", "utf8");
    const bundle = assembleEvidence(repo, join(repo, "docs"), 1);
    expect(bundle).toContain("#### Untracked paths NOT inlined");
    expect(bundle).toMatch(/- big\.txt — oversized \(65537 bytes\)/);
    expect(bundle).toContain("- raw.bin — binary / non-UTF-8");
  });

  it("lists the lifecycle's own files by path and shows none of their diff", () => {
    // They are the record of the session, not its work; diffing them would
    // spend the reviewer's whole budget on the framework's bookkeeping. The
    // path still rides along, so the exclusion is visible rather than silent.
    //
    // The file is TRACKED and modified, which is the only way one reaches
    // the list: `_untracked_contents` is called with the same pathspecs that
    // exclude these names, so an untracked lifecycle file never reaches its
    // own branch. Faithful to Python, where that branch is equally
    // unreachable from the one caller.
    const repo = makeSeededRepo({
      "a.txt": "one\n",
      "docs/sessions/sessions.json": '{"schemaVersion": 4}\n',
    });
    writeFileSync(
      join(repo, "docs", "sessions", "sessions.json"),
      '{"schemaVersion": 4, "sessions": []}\n',
      "utf8",
    );
    writeFileSync(join(repo, "src.txt"), "work\n", "utf8");
    const bundle = assembleEvidence(repo, join(repo, "docs", "sessions"), 1);
    expect(bundle).toContain("#### Expected framework bookkeeping (paths only)");
    expect(bundle).toContain("- docs/sessions/sessions.json");
    expect(bundle).not.toContain('"sessions": []');
  });
});

describe("the fix-delta bundle", () => {
  it("names both trees and says new defects live only in these hunks", () => {
    const repo = makeSeededRepo();
    const baseline = snapshotWorktreeTree(repo) as string;
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    const bundle = assembleFixDeltaEvidence(repo, join(repo, "docs"), 1, baseline);
    expect(bundle).toContain("FIX DELTA ONLY (tree-to-tree: previous round");
    expect(bundle).toContain(baseline.slice(0, 12));
    expect(bundle).toContain("new defects are admissible only within these hunks");
    expect(bundle).toContain("-one");
    expect(bundle).toContain("+two");
  });
});

describe("the evidence cap", () => {
  it("refuses over the cap and names the variable that raises it", () => {
    process.env[CAP_ENV] = "10";
    expect(() => checkEvidenceCap("x".repeat(11))).toThrow(EvidenceTooLargeError);
    expect(() => checkEvidenceCap("x".repeat(11))).toThrow(
      /evidence bundle is 11 chars \(cap 10\)/,
    );
  });

  it("falls back to the default when the variable is not an integer", () => {
    // Python's `int()` raises on "600k" and the fallback is the default;
    // `Number()` would answer NaN and compare false against every length.
    process.env[CAP_ENV] = "600k";
    expect(() => checkEvidenceCap("x".repeat(1000))).not.toThrow();
  });
});

describe("the changed lines", () => {
  it("counts only what the diff adds, numbered in the post-image", () => {
    const diff = [
      "--- a/one.py",
      "+++ b/one.py",
      "@@ -1,2 +1,3 @@",
      " keep",
      "+added",
      "+also",
      "@@ -10,2 +12,0 @@",
      "-gone",
      "-gone too",
    ].join("\n");
    expect(parseChangedLines(diff)).toEqual({ "one.py": [1, 2, 3] });
  });

  it("attributes nothing to a deleted file", () => {
    const diff = ["--- a/gone.py", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-x"].join(
      "\n",
    );
    expect(parseChangedLines(diff)).toEqual({});
  });

  it("answers null when git cannot measure, never an empty change set", () => {
    // An unmeasurable change is never "no change".
    expect(changedLines(join(makeSeededRepo(), "not-a-repo"))).toBeNull();
  });
});

describe("the control declarations", () => {
  it("reports every error rather than the first", () => {
    // A control lost to a typo and a control never declared both end up
    // `not_applicable`; only the error list tells them apart.
    const loaded = loadControlsChecked({
      testing: {
        controls: [
          { kind: "compile", command: "true", extra: 1 },
          { kind: "nonsense", command: "true" },
          { kind: "lint", command: "  " },
          { kind: "compile", command: "twice" },
          "not a mapping",
        ],
      },
    });
    expect(loaded.errors).toEqual([
      "testing.controls[0] has unknown key(s) ['extra']",
      "testing.controls[1].kind must be one of " +
        "['compile', 'typecheck', 'lint', 'analyzer']",
      "testing.controls[2].command must be a non-empty string",
      "testing.controls[3].kind 'compile' is declared more than once",
      "testing.controls[4] must be a mapping",
    ]);
    expect(loaded.controls.map((spec) => spec.kind)).toEqual(["compile"]);
  });

  it("refuses a controls block that is not a list", () => {
    expect(loadControlsChecked({ testing: { controls: {} } }).errors).toEqual([
      "testing.controls must be a list",
    ]);
  });

  it("writes one row per kind, always all four", () => {
    // A kind nobody declared says so, rather than leaving a reader to infer
    // it from an absence.
    const { facts } = collectControlFacts(makeSeededRepo(), {});
    expect(facts.map((fact) => fact.kind)).toEqual([
      "compile",
      "typecheck",
      "lint",
      "analyzer",
    ]);
    for (const fact of facts) {
      expect(fact.status).toBe(STATUS_NOT_APPLICABLE);
      expect(fact.detail).toBe("no control of this kind is declared");
    }
  });
});

describe("running one control", () => {
  // `node`, not `process.execPath`: a Windows interpreter path carries
  // backslashes and spaces, and `shlexSplit` reads a backslash as an escape
  // exactly as Python's `shlex.split` does. Naming the runtime instead is
  // also what exercises the interpreter rule -- `runControl` substitutes the
  // Node this router runs on, so the control cannot reach a different one.
  const nodeScript = (body: string): string => `node -e ${JSON.stringify(body)}`;

  it("keeps a green control's own output, so the row says what it proved", () => {
    // An analyzer that compared seven paths and one that compared nothing
    // both exit 0, and from the record alone they were indistinguishable.
    const fact = runControl(
      makeSeededRepo(),
      controlSpec("analyzer", nodeScript("process.stdout.write('compared 7')")),
    );
    expect(fact.status).toBe(STATUS_PASS);
    expect(fact.detail).toBe("compared 7");
  });

  it("says so when a green control printed nothing", () => {
    const fact = runControl(
      makeSeededRepo(),
      controlSpec("lint", nodeScript("")),
    );
    expect(fact.status).toBe(STATUS_PASS);
    expect(fact.detail).toBe("exit 0, and the control printed nothing");
  });

  it("fails a non-zero exit and carries the code with the tail", () => {
    const fact = runControl(
      makeSeededRepo(),
      controlSpec(
        "typecheck",
        nodeScript("process.stderr.write('boom'); process.exit(3)"),
      ),
    );
    expect(fact.status).toBe(STATUS_FAIL);
    expect(fact.detail).toBe("exit 3: boom");
  });

  it("is UNKNOWN when the tool could not be launched, never a quiet pass", () => {
    // An absent tool that reports success is worse than no tool at all.
    const fact = runControl(
      makeSeededRepo(),
      controlSpec("compile", "no-such-program-anywhere --check"),
    );
    expect(fact.status).toBe(STATUS_UNKNOWN);
    expect(fact.detail).toMatch(/could not be executed/);
  });

  it("is UNKNOWN when the declared command cannot be parsed", () => {
    const fact = runControl(makeSeededRepo(), controlSpec("lint", 'ruff "unclosed'));
    expect(fact.status).toBe(STATUS_UNKNOWN);
    expect(fact.detail).toMatch(/could not be parsed/);
  });

  it("has a timeout, so a hung control cannot wedge every round", () => {
    expect(CONTROL_TIMEOUT_SECONDS).toBe(600);
  });
});

describe("what counts as red", () => {
  it("is a required control on anything but green, UNKNOWN included", () => {
    // The author is the only one who can turn "the tool did not run" into an
    // answer, and a verifier cannot.
    expect(controlFactRed(controlFact("lint", STATUS_UNKNOWN, "x", true))).toBe(true);
    expect(controlFactRed(controlFact("lint", STATUS_FAIL, "x", true))).toBe(true);
    expect(controlFactRed(controlFact("lint", STATUS_FAIL, "x", false))).toBe(false);
    expect(
      controlFactRed(controlFact("lint", STATUS_NOT_APPLICABLE, "", true)),
    ).toBe(false);
  });

  it("says nothing when nothing is red", () => {
    expect(redFactsRefusal(factRecord({ controls: [] }))).toBe("");
  });

  it("returns the red rows to their author with the prefix it was given", () => {
    const refusal = redFactsRefusal(
      factRecord({
        controls: [controlFact("lint", STATUS_UNKNOWN, "ruff check", true, "gone\nmore")],
      }),
      "verify step close",
    );
    expect(refusal).toContain(
      "verify step close: refused -- 1 required deterministic control(s) are not green:",
    );
    expect(refusal).toContain("  lint       UNKNOWN        ruff check");
    // Only the first line of the detail, indented under the row.
    expect(refusal).toContain("\n              gone\n");
    expect(refusal).not.toContain("more");
  });
});

describe("the record", () => {
  it("carries counts rather than line numbers, and omits what is absent", () => {
    const dict = factRecordToDict(
      factRecord({
        controls: [controlFact("lint", STATUS_PASS, "ruff", true, "clean")],
        changed: { "a.py": [1, 2, 3] },
        recordedAt: "2026-01-01T00:00:00+00:00",
      }),
    );
    expect(dict["changedLines"]).toEqual({ "a.py": 3 });
    expect(dict["controls"]).toEqual([
      { kind: "lint", status: "pass", required: true, command: "ruff", detail: "clean" },
    ]);
    expect(dict).not.toHaveProperty("sessionNumber");
    expect(dict).not.toHaveProperty("round");
    expect(dict).not.toHaveProperty("declarationErrors");
  });

  it("distinguishes an unmeasurable change set from an empty one", () => {
    expect(factRecordToDict(factRecord({}))["changedLines"]).toBeNull();
  });

  it("appends one sorted-key line per collection", () => {
    // Machine-owned and append-only: two collections are two rows, and a
    // reader parses each line on its own.
    const repo = makeSeededRepo();
    appendFacts(repo, factRecord({ recordedAt: "one" }));
    appendFacts(repo, factRecord({ recordedAt: "two" }));
    const lines = readFileSync(factsPath(repo), "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)["recordedAt"]).toBe("one");
    // sort_keys: `changedLines` before `controls` before `recordedAt`.
    expect(lines[0]).toBe(
      '{"changedLines": null, "controls": [], "recordedAt": "one"}',
    );
  });
});

describe("the git seam these all sit on", () => {
  it("measures the untracked collector against a real index", () => {
    // The collector asks git rather than walking the tree, so a path the
    // repository ignores is not evidence.
    const repo = makeSeededRepo();
    writeFileSync(join(repo, ".gitignore"), "ignored.txt\n", "utf8");
    writeFileSync(join(repo, "ignored.txt"), "invisible\n", "utf8");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "ignore", "--no-gpg-sign");
    writeFileSync(join(repo, "seen.txt"), "visible\n", "utf8");
    const bundle = assembleEvidence(repo, join(repo, "docs"), 1);
    expect(bundle).toContain("**seen.txt**");
    expect(bundle).not.toContain("invisible");
  });
});

describe("what the CLI reports", () => {
  it("prints one padded row per control and the change-set summary", () => {
    // Through the built bundle rather than the module, because the padding
    // is what an operator reads and a helper could pad differently.
    const repo = makeSeededRepo();
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    const cli = join(import.meta.dirname, "..", "dist", "dabbler.cjs");
    if (!existsSync(cli)) return; // built by `npm run build`; parity builds it too
    const out = execFileSync(process.execPath, [cli, "facts"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(out).toContain("  compile    not_applicable ");
    expect(out).toContain("changed lines: 1 added across 1 file(s)");
  });
});
