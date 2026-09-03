// One repository carrying a session plan, walked through the record a
// session leaves: registration, the declaration, the digests, a run record,
// a verified round anchored under its ref, a decision, a hand edit caught,
// an owed decision, the projection, the evidence bundle, quotes and
// searches over the reviewed tree, the deterministic controls, and the
// freshness gate. Each milestone reads real git and real files through the
// thin readers; the walk stops at the first wrong fact.
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";

import type { RouterConfig } from "../src/config.ts";
import {
  EvidenceEmptyError,
  assembleEvidence,
  assembleFixDeltaEvidence,
  collectControlFacts,
  controlSpec,
  runControl,
} from "../src/facts.ts";
import {
  ROUND_PUSH_BRANCH_REFSPEC,
  ROUND_REFSPEC,
  ensureRoundRefspecs,
  detectOutOfBandWrite,
  hashOutput,
  runAbsenceSearch,
  scopePaths,
  sessionRoundRefs,
  treePaths,
  verifyQuote,
} from "../src/evidence.ts";
import {
  checkOwedDecisions,
  checkTestRunFresh,
  checkVerificationClean,
  checkWorkingTreeClean,
} from "../src/gates.ts";
import { roundRef, snapshotWorktreeTree } from "../src/journal.ts";
import { appendRound, readRounds } from "../src/ledger.ts";
import { CLASS_EXTERNAL_CONSEQUENCE, answerOwed, openDecisions, raiseOwed, readOwed, foldOwed } from "../src/owedDecisions.ts";
import { buildProjection, buildTaskRows } from "../src/progress.ts";
import {
  digestOfEntries,
  enumerateSurface,
  readRecords,
  recordRun,
  surfaceDigest,
  treeDigest,
  type SuiteSpec,
} from "../src/testEvidence.ts";
import { appendDecision, declareSessionTask, readTaskDeclaration, registerSessionStart, renderDecisionsLog } from "../src/writers.ts";
import { git, gitOut, makeRepo, writeFiles } from "./support/repo.ts";

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

const HEX40 = /^[0-9a-f]{40}$/;
const UNIT: SuiteSpec = { name: "unit", command: "python -m pytest", covers: ["src/"], expensive: true, runsWhole: false };
const CONFIG = { testing: { suites: [{ name: "unit", command: "python -m pytest", expensive: true, covers: ["src/"] }] } } as unknown as RouterConfig;

const repo = makeRepo(
  {
    "docs/sessions/session-plan.md":
      "### Session 1 of 2: First things\n1. Register.\n2. Build the widget.\n3. Verify; close.\n\n### Session 2 of 2: Second things\n1. Register.\n",
    "dabbler.yaml": "schema_version: 1\n",
    "src/widget.py": "def widget():\n    return 1\n",
    "a.txt": "one\n",
    "b.txt": "two\n",
    ".gitignore": ".dabbler/\n",
  },
  { origin: true },
);
const sessionsDir = join(repo, "docs", "sessions");
const headTree = (): string => gitOut(repo, "rev-parse", "HEAD^{tree}");
const nodeScript = (body: string): string => `node -e ${JSON.stringify(body)}`;

describe("a repository walked through the record one session leaves", () => {
  milestone("registering session 1 grows the ledger to the plan and heals titles from it", () => {
    const sessions = registerSessionStart(sessionsDir, 1, { engine: "claude-code" })["sessions"] as Record<string, unknown>[];
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0]["status"], "in-progress");
    assert.equal(sessions[1]["title"], "Second things");
    assert.deepEqual(checkWorkingTreeClean(sessionsDir), [true, ""]);
  });

  milestone("the task is declared once, and a second declaration is refused", () => {
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Build the widget.", releasable: false });
    assert.equal(readTaskDeclaration(sessionsDir, 1)?.["task"], "Build the widget.");
    assert.throws(() => declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Again.", releasable: false }), /already declared/);
  });

  milestone("the surface is enumerated without the record, digested by content, and a deletion moves the tree once", () => {
    const entries = enumerateSurface(repo, [""], { sessionsDir });
    assert.ok(entries !== null);
    const paths = entries.map(([path]) => path);
    assert.ok(paths.includes("src/widget.py") && paths.includes("a.txt"), paths.join(","));
    assert.ok(!paths.includes("docs/sessions/sessions.json"), "the session's own bookkeeping is not the work");
    assert.ok(!paths.some((path) => path.startsWith(".dabbler/")), "the run ledger is the record");
    assert.equal(surfaceDigest(repo, [""], { sessionsDir }), digestOfEntries(entries));
    const before = treeDigest(repo, { sessionsDir });
    writeFileSync(join(repo, "a.txt"), "one more\n", "utf8");
    assert.notEqual(treeDigest(repo, { sessionsDir }), before);
    git(repo, "commit", "-q", "-am", "edit a");
    // D170: a tracked file deleted and not yet committed is omitted, so the
    // commit that records the deletion moves nothing.
    unlinkSync(join(repo, "b.txt"));
    const afterDelete = snapshotWorktreeTree(repo);
    const digestAfterDelete = treeDigest(repo, { sessionsDir });
    git(repo, "commit", "-q", "-am", "drop b");
    assert.equal(snapshotWorktreeTree(repo), afterDelete);
    assert.equal(treeDigest(repo, { sessionsDir }), digestAfterDelete);
  });

  milestone("a targeted run is recorded against the covered surfaces' digest", () => {
    const row = recordRun(sessionsDir, UNIT, "passed", {
      stage: "preverify-targeted", durationSeconds: 1.5, command: "python -m pytest tests/test_widget.py", policy: "targeted",
      sessionNumber: 1,
    });
    assert.equal(row.surfaceDigest, surfaceDigest(repo, UNIT.covers, { sessionsDir }));
    assert.equal(readRecords(repo).length, 1);
    assert.deepEqual(checkWorkingTreeClean(sessionsDir), [true, ""]);
  });

  milestone("a round anchors its tree under the session's ref, refuses a second row, and the clone learns to carry the refs", () => {
    const tree = snapshotWorktreeTree(repo) as string;
    const row = appendRound(repo, 1, {
      round: 1, verdict: "VERIFIED", blocking: false, findings: [], completion_tree: tree,
      recorded_at: "2026-01-01T00:00:00+00:00", verifier_model: "gpt", verifier_provider: "openai",
    });
    assert.match(String(row["anchor_commit"]), HEX40);
    assert.equal(gitOut(repo, "rev-parse", `${roundRef(1, 1)}^{tree}`), tree);
    assert.deepEqual(sessionRoundRefs(repo, 1), [roundRef(1, 1)]);
    assert.equal(readRounds(repo, 1).length, 1);
    assert.throws(() => appendRound(repo, 1, { ...row, round: 1 }), /append-only and never overwritten/);
    assert.deepEqual(ensureRoundRefspecs(repo), [
      `remote.origin.fetch=${ROUND_REFSPEC}`,
      `remote.origin.push=${ROUND_PUSH_BRANCH_REFSPEC}`,
      `remote.origin.push=${ROUND_REFSPEC}`,
    ]);
    assert.deepEqual(ensureRoundRefspecs(repo), []);
  });

  milestone("the verification gate passes on the verified tree and refuses once the work moves", () => {
    assert.deepEqual(checkVerificationClean(sessionsDir), [true, ""]);
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    const [passed, remediation] = checkVerificationClean(sessionsDir);
    assert.equal(passed, false);
    assert.match(remediation, /the working tree changed after verification round 1: src\/widget\.py/);
    git(repo, "checkout", "-q", "--", "src/widget.py");
    assert.deepEqual(checkVerificationClean(sessionsDir), [true, ""]);
  });

  milestone("a decision takes its identifier from the record and renders into the log", () => {
    const entry = appendDecision(sessionsDir, { sessionNumber: 1, decider: "operator", headline: "Keep the widget", body: "Because." });
    assert.equal(entry["decisionId"], "D1");
    assert.match(renderDecisionsLog(sessionsDir), /Keep the widget/);
  });

  milestone("a hand edit to the session record is caught, and the gate names it", () => {
    const path = join(sessionsDir, "sessions.json");
    const sanctioned = readFileSync(path, "utf8");
    assert.equal(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true }), null);
    writeFileSync(path, sanctioned.replace('"in-progress"', '"complete"'), "utf8");
    assert.match(String(detectOutOfBandWrite(sessionsDir, repo)), /out of band/);
    assert.match(checkVerificationClean(sessionsDir)[1], /^session-state integrity/);
    writeFileSync(path, sanctioned, "utf8");
    assert.equal(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true }), null);
  });

  milestone("an owed decision is raised, does not hold the close in its class, and folds once answered", () => {
    raiseOwed(repo, {
      id: "remote", decisionClass: CLASS_EXTERNAL_CONSEQUENCE, question: "Push where?", determined: "No remote is configured.",
      options: [{ label: "attach", consequence: "A remote is added." }, { label: "local-only", consequence: "Nothing is pushed." }],
      recommendation: "attach", onNoAnswer: "The wait is recorded.",
    });
    assert.equal(openDecisions(repo).length, 1);
    assert.equal(checkOwedDecisions(sessionsDir)[0], true);
    answerOwed(repo, "remote", "local-only");
    assert.equal(foldOwed(readOwed(repo)).get("remote")?.["answer"], "local-only");
    assert.equal(openDecisions(repo).length, 0);
  });

  milestone("the projection reads the ledger, the task rows and the clean verification view", () => {
    const projection = buildProjection(sessionsDir);
    const repository = projection["repository"] as Record<string, unknown>;
    assert.equal(repository["currentSession"], 1);
    assert.equal(repository["sessionsSource"], "ledger");
    const rows = buildTaskRows(sessionsDir, 1);
    assert.deepEqual(rows.slice(0, 2).map((row) => row["state"]), ["done", "done"]);
    const [session] = projection["sessions"] as Record<string, unknown>[];
    assert.equal((session["verification"] as Record<string, unknown>)["clean"], true);
    assert.equal(session["decisionsCount"] ?? 1, 1);
  });

  milestone("the evidence bundle refuses nothing to review, inlines the untracked, names the deleted, and lists what it left out", () => {
    assert.throws(() => assembleEvidence(repo, sessionsDir, 1), EvidenceEmptyError);
    writeFileSync(join(repo, "new.txt"), "brand new\n", "utf8");
    writeFileSync(join(repo, "big.txt"), "x".repeat(64 * 1024 + 1), "utf8");
    writeFileSync(join(repo, "raw.bin"), Buffer.from([0xff, 0xfe, 0x00]));
    unlinkSync(join(repo, "src", "widget.py"));
    const bundle = assembleEvidence(repo, sessionsDir, 1);
    assert.ok(bundle.includes("#### Untracked file contents") && bundle.includes("**new.txt**") && bundle.includes("brand new"));
    assert.ok(bundle.includes("deleted file mode") && bundle.includes("src/widget.py") && !bundle.includes("-def widget():"));
    assert.match(bundle, /- big\.txt — oversized \(65537 bytes\)/);
    assert.ok(bundle.includes("- raw.bin — binary / non-UTF-8"));
    const baseline = headTree();
    const delta = assembleFixDeltaEvidence(repo, sessionsDir, 1, baseline);
    assert.ok(delta.includes("FIX DELTA ONLY (tree-to-tree: previous round") && delta.includes(baseline.slice(0, 12)));
    for (const name of ["new.txt", "big.txt", "raw.bin"]) unlinkSync(join(repo, name));
    git(repo, "checkout", "-q", "--", "src/widget.py");
  });

  milestone("a quote is re-derived from the reviewed tree and an absence search is re-run over it", () => {
    writeFiles(repo, { "src/deep/b.py": "token\n", "docs/c.md": "token\n" });
    writeFileSync(join(repo, "src", "widget.py"), "token\ntoken\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "corpus");
    const tree = headTree();
    assert.ok(treePaths(repo, tree).includes("src/deep/b.py"));
    assert.equal(verifyQuote(repo, tree, { path: "a.txt", content_hash: hashOutput("one more\n"), span: { kind: "line", start: 1, end: 1 } }).content_hash, hashOutput("one more\n"));
    writeFileSync(join(repo, "later.py"), "x = 1\n", "utf8");
    assert.throws(() => verifyQuote(repo, tree, { path: "later.py", content_hash: hashOutput("x = 1\n"), span: { kind: "byte", start: 0, end: 6 } }), /quote-path-missing/);
    unlinkSync(join(repo, "later.py"));
    assert.deepEqual(scopePaths(repo, tree, ["src/**"]), ["src/deep/b.py", "src/widget.py"]);
    const row = runAbsenceSearch(repo, tree, { query: "token", query_kind: "literal", scope: ["src/**"], matches: 0 });
    assert.equal(row.matches, 3);
    assert.throws(() => runAbsenceSearch(repo, tree, { query: "token", query_kind: "literal", scope: ["nowhere/**"] }), /absence-scope-empty/);
  });

  milestone("a declared control runs and its row says what it proved, and a control that cannot run is never a quiet pass", () => {
    // `node`, not process.execPath: a Windows interpreter path carries
    // backslashes and spaces, and the runner substitutes the Node it runs on.
    assert.deepEqual([runControl(repo, controlSpec("analyzer", nodeScript("process.stdout.write('compared 7')"))).status, runControl(repo, controlSpec("analyzer", nodeScript("process.stdout.write('compared 7')"))).detail], ["pass", "compared 7"]);
    assert.equal(runControl(repo, controlSpec("lint", nodeScript(""))).detail, "exit 0, and the control printed nothing");
    const failed = runControl(repo, controlSpec("typecheck", nodeScript("process.stderr.write('boom'); process.exit(3)")));
    assert.deepEqual([failed.status, failed.detail], ["fail", "exit 3: boom"]);
    const absent = runControl(repo, controlSpec("compile", "no-such-program-anywhere --check"));
    assert.equal(absent.status, "unknown");
    assert.match(absent.detail, /could not be executed/);
    assert.match(runControl(repo, controlSpec("lint", 'ruff "unclosed')).detail, /could not be parsed/);
    const { facts } = collectControlFacts(repo, {});
    assert.deepEqual(facts.map((fact) => [fact.kind, fact.status]), [["compile", "not_applicable"], ["typecheck", "not_applicable"], ["lint", "not_applicable"], ["analyzer", "not_applicable"]]);
  });

  milestone("the freshness gate refuses a suite with no run of record and names the run to make", () => {
    const [passed, remediation] = checkTestRunFresh(sessionsDir, CONFIG);
    assert.equal(passed, false);
    assert.match(remediation, /unit: this session changed unit's covered surfaces but no final-full run of record exists \(1 preverify-targeted record\(s\) are present/);
    assert.match(remediation, /run `python -m pytest` after your last code change/);
  });
});
