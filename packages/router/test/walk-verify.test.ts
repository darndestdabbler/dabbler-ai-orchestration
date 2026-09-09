// One repository, walked through the verification loop over scripted
// responses. Session 1 is the loop entire: the pre-verification gate, a
// round that finds a Major, a dispute filed from the record, the fix at the
// cited site, and the fix-delta round that presents the rebuttal, verifies,
// and stamps the session. The framework allows one adjudication per session
// and treats it as terminal, so the two adjudication branches -- UPHOLD
// keeping a finding, OVERRULE clearing one -- are walked in sessions 2 and
// 3 of the same repository and plan. Beside them: the legal anchor over
// real commits, and the approved plan's envelope over a real change set. Every model
// answer is a file; every milestone stops the walk when it fails.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { stringify as stringifyYaml } from "yaml";

import { preverifyGate } from "../src/affected.ts";
import { approvePlan, compareToEnvelope, needsAmendment, newPlan, writePlan } from "../src/approvedPlan.ts";
import { CONFIG_ENV_VAR } from "../src/config.ts";
import { EXIT_BLOCKING } from "../src/contracts/exitCodes.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { readDisputes, readRounds } from "../src/ledger.ts";
import { readSessionState } from "../src/progress.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, EXIT_USAGE } from "../src/session.ts";
import { recordRun, type SuiteSpec } from "../src/testEvidence.ts";
import { recordDispute, runAdjudication } from "../src/verify/disputes.ts";
import { splitDisputes } from "../src/verify/prompts.ts";
import { legalAnchor } from "../src/verify/reanchor.ts";
import { runRound } from "../src/verify/rounds.ts";
import { flipStateToClosed, registerSessionStart } from "../src/writers.ts";
import { makeConfig, routeAnswers, setProviderKeys, tempDir } from "./support/answers.ts";
import { git, gitOut, makeRepo, writeFiles } from "./support/repo.ts";

let broken: string | null = null;
function milestone(name: string, body: () => void | Promise<void>): void {
  it(name, async (t: TestContext) => {
    if (broken !== null) {
      t.skip(`not reached: '${broken}' failed first`);
      return;
    }
    try {
      await body();
    } catch (error) {
      broken = name;
      throw error;
    }
  });
}

/** Everything a verb printed, so a refusal can be read rather than inferred. */
async function captured(run: () => Promise<number> | number): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => { out.push(String(chunk)); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => { err.push(String(chunk)); return true; }) as typeof process.stderr.write;
  try {
    return { code: await run(), out: out.join(""), err: err.join("") };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

const TESTING = {
  suites: [{ name: "unit", command: "python -m pytest", expensive: true, covers: ["src/", "tests/"], test_roots: ["tests"], test_glob: "test_*.py" }],
  selection: { repo_wide: ["dabbler.yaml"], smoke: ["tests/test_widget.py"], rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }] },
};
const UNIT: SuiteSpec = { name: "unit", command: "python -m pytest", covers: ["src/", "tests/"], expensive: true, runsWhole: false };
const RED = "============ FAILURES ============\nsrc/widget.py:2: in widget\nE   assert 2 == 1\nFAILED tests/test_widget.py::test_widget - assert 2 == 1\n";
const ISSUE = "ISSUES FOUND\n\nIssue 1: the widget returns the wrong number.\nSeverity: Major\nEvidence paths: src/widget.py\n";
// An answer that grades the change AND asks for a file it may not have.
// `runner.js` exists in the fixture and is outside the round's scope, so
// the refusal is the boundary rather than the filesystem.
const ASKS =
  "VERIFIED\n\nI would have liked the runner as well, but what I was shown is enough.\n\n" +
  "```file-request\nrunner.js\n```\n\nNothing here blocks.\n";
const TARGETED = { stage: "preverify-targeted", durationSeconds: 1, command: "python -m pytest tests/test_widget.py", policy: "targeted" };

const repo = makeRepo(
  {
    "docs/sessions/session-plan.md":
      "### Session 1 of 5: The widget\n1. Register.\n2. Make `widget()` return 2.\n3. Verify; close.\n\n" +
      "### Session 2 of 5: Again\n1. Register.\n2. Polish.\n\n### Session 3 of 5: Once more\n1. Register.\n2. Finish.\n\n" +
      "### Session 4 of 5: The verifier asks\n1. Register.\n2. Change the widget.\n\n" +
      "### Session 5 of 5: And asks with nothing granted\n1. Register.\n2. Change it again.\n",
    "dabbler.yaml": "schema_version: 1\n",
    "src/widget.py": "def widget():\n    return 1\n",
    // The plan's step asks for 2; the session's first attempt returns 3,
    // which is the defect the round finds, and the fix returns 2.
    "tests/test_widget.py": "from src.widget import widget\n\n\ndef test_widget():\n    assert widget() == 2\n",
    "runner.js": `process.stdout.write(${JSON.stringify(RED)});\nprocess.exit(1);\n`,
    ".gitignore": ".dabbler/\n",
  },
  { origin: true },
);
const sessionsDir = join(repo, "docs", "sessions");
const responses = tempDir("responses-");
const config = makeConfig({ transports: { offline: { responses_dir: responses } }, transport: { profile: "offline" }, testing: TESTING });
const seedHead = gitOut(repo, "rev-parse", "HEAD");

function script(...bodies: string[]): void {
  bodies.forEach((body, index) => writeFileSync(join(responses, `${String(index + 1).padStart(2, "0")}.md`), body, "utf8"));
}

/** How many scripted responses have been served: the honest count of dispatches. */
function dispatches(): number {
  return Number(readFileSync(join(responses, ".cursor"), "utf8").trim());
}

/** The config on disk, so a milestone can change one setting between rounds. */
function reconfigure(overrides: Record<string, unknown>): void {
  writeFileSync(
    process.env[CONFIG_ENV_VAR] as string,
    stringifyYaml({ ...config, ...overrides }),
    "utf8",
  );
  resetForTests();
}

/** The agency block of a session's last round. */
function agencyOf(session: number): Record<string, unknown> {
  const rows = readRounds(repo, session);
  return (rows[rows.length - 1] as Record<string, unknown>)["agency"] as Record<string, unknown>;
}

function commitAt(name: string, when: string): string {
  writeFileSync(join(repo, name), `${name}\n`, "utf8");
  git(repo, "add", name);
  execFileSync("git", ["commit", "-q", "-m", name], {
    cwd: repo, stdio: "ignore", windowsHide: true,
    env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
  });
  return gitOut(repo, "rev-parse", "HEAD");
}

async function adjudicate(judgment: string): Promise<{ code: number; out: string; err: string }> {
  // The adjudicator is a third provider: it cannot be the offline verifier,
  // so its one answer comes through the route seam.
  const restore = routeAnswers([["google", judgment]]);
  try {
    return await captured(() => runAdjudication(sessionsDir, { maxRounds: 1 }));
  } finally {
    restore();
  }
}

const verdictOf = (session: number): unknown =>
  ((readSessionState(sessionsDir)?.["sessions"] as Record<string, unknown>[])[session - 1] ?? {})["verificationVerdict"];

function widget(returns: number): void {
  writeFileSync(join(repo, "src", "widget.py"), `def widget():\n    return ${returns}\n`, "utf8");
}

describe("a repository walked through the verification loop", () => {
  milestone("the router is pointed at scripted responses and session 1 is registered with its work changed", () => {
    // The verifier's answers in dispatch order: session 1's two rounds, then
    // one round each for the two adjudication sessions.
    script(ISSUE, "VERIFIED\n\nThe fix is right and the rebuttal was answered.\n", ISSUE, ISSUE, ASKS, ASKS);
    process.env[CONFIG_ENV_VAR] = join(tempDir("config-"), "router-config.yaml");
    writeFileSync(process.env[CONFIG_ENV_VAR], stringifyYaml(config), "utf8");
    delete process.env["DABBLER_TRANSPORT"];
    setProviderKeys();
    resetForTests();
    resetRuntimeMode();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    widget(3);
    assert.equal(readSessionState(sessionsDir)?.["currentSession"], 1);
  });

  milestone("the pre-verification gate refuses before evidence and passes once a targeted run is recorded against the change", () => {
    const before = preverifyGate(repo, sessionsDir, config);
    assert.equal(before.ok, false);
    assert.match(before.reason, /no pre-verification run of unit is recorded/);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 1 });
    const after = preverifyGate(repo, sessionsDir, config);
    assert.equal(after.ok, true, after.reason);
    assert.deepEqual(after.accepted, [["unit", "python -m pytest tests/test_widget.py", "targeted"]]);
  });

  milestone("round 1 finds a Major, blocks, and records the finding with its evidence and the raw answer", async () => {
    const reviewed = snapshotWorktreeTree(repo);
    const { code, out } = await captured(() => runRound(sessionsDir));
    assert.equal(code, EXIT_BLOCKING, out);
    assert.match(out, /1 blocking finding\(s\)/);
    const [row] = readRounds(repo, 1);
    assert.equal(row["blocking"], true);
    assert.equal(row["phase"], "full");
    assert.equal(row["completion_tree"], reviewed);
    assert.equal(row["verifier_provider"], "offline");
    const [finding] = row["findings"] as Record<string, unknown>[];
    assert.equal(finding["severity"], "major");
    assert.deepEqual(finding["evidencePaths"], ["src/widget.py"]);
    assert.ok(readFileSync(join(repo, ".dabbler", "runs", "s1", "round-1-verifier-output.md"), "utf8").includes("wrong number"));
    assert.equal(verdictOf(1), null);
  });

  milestone("a dispute argues from the record: prose alone is refused, a bad index lists the findings, a cited one is filed once", async () => {
    const prose = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "I disagree", evidence: [] }));
    assert.equal(prose.code, EXIT_USAGE);
    assert.match(prose.err, /prose-only disputes are refused/);
    const wrong = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 7, grounds: "g", evidence: ["src/widget.py"] }));
    assert.match(wrong.err, /Its findings, by 0-based index:/);
    const filed = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test covers it", evidence: ["src/widget.py"] }));
    assert.equal(filed.code, EXIT_OK, filed.err);
    assert.equal(readDisputes(repo, 1).length, 1);
    assert.equal(readDisputes(repo, 1)[0]["filed_after_round"], 1);
    let refusedTwice = false;
    try {
      const again = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "again", evidence: ["src/widget.py"] }));
      refusedTwice = again.code !== EXIT_OK;
    } catch {
      refusedTwice = true;
    }
    assert.equal(refusedTwice, true, "a finding is disputed at most once");
  });

  milestone("the fix changes the cited site to the value the test expects, and the fix-delta round presents the rebuttal, verifies against round 1's tree, and stamps the session", async () => {
    widget(2);
    assert.match(readFileSync(join(repo, "tests", "test_widget.py"), "utf8"), /widget\(\) == 2/);
    const { code, out } = await captured(() => runRound(sessionsDir));
    assert.equal(code, EXIT_OK, out);
    assert.match(out, /round 2 — VERIFIED/);
    const rounds = readRounds(repo, 1);
    assert.equal(rounds.length, 2);
    assert.equal(rounds[1]["phase"], "fix-delta");
    assert.equal(rounds[1]["previous_tree"], rounds[0]["completion_tree"]);
    assert.equal(rounds[1]["blocking"], false);
    // The dispute was presented by round 2 and is settled by it.
    const { pending, settled } = splitDisputes(rounds, readDisputes(repo, 1));
    assert.equal(pending.size, 0);
    assert.equal(settled.get("1:0"), 2);
    assert.equal(verdictOf(1), "VERIFIED");
  });

  milestone("session 2: a disputed Major at the cap goes to adjudication; UPHOLD keeps it, the session stays blocked, and no further round may open", async () => {
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    registerSessionStart(sessionsDir, 2, { engine: "claude-code", provider: "anthropic" });
    widget(4);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 2 });
    assert.equal((await captured(() => runRound(sessionsDir, { maxRounds: 1 }))).code, EXIT_BLOCKING);
    assert.equal((await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test proves it", evidence: ["tests/test_widget.py"] }))).code, EXIT_OK);
    const refused = await captured(() => runRound(sessionsDir, { maxRounds: 1 }));
    assert.equal(refused.code, EXIT_USAGE);
    assert.match(refused.err, /carries disputed blocking finding\(s\)/);
    const judged = await adjudicate("Dispute 1: UPHOLD — the widget still returns the wrong number and the cite shows it\n");
    const rows = readRounds(repo, 2);
    const adjudication = rows[rows.length - 1];
    assert.equal(adjudication["type"], "adjudication", judged.out + judged.err);
    assert.equal((adjudication["outcomes"] as Record<string, unknown>[])[0]["outcome"], "UPHELD");
    assert.equal(adjudication["blocking"], true);
    assert.notEqual(judged.code, EXIT_OK);
    const terminal = await captured(() => runRound(sessionsDir));
    assert.equal(terminal.code, EXIT_USAGE);
    assert.match(terminal.err, /already carries its adjudication row/);
  });

  milestone("session 3: the same dispute, OVERRULED by the adjudicator, clears the finding and verifies the session", async () => {
    flipStateToClosed(sessionsDir, { verdict: "ISSUES_FOUND" });
    registerSessionStart(sessionsDir, 3, { engine: "claude-code", provider: "anthropic" });
    widget(5);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 3 });
    assert.equal((await captured(() => runRound(sessionsDir, { maxRounds: 1 }))).code, EXIT_BLOCKING);
    assert.equal((await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test proves it", evidence: ["tests/test_widget.py"] }))).code, EXIT_OK);
    const judged = await adjudicate("Dispute 1: OVERRULE — the cited test proves the widget right\n");
    assert.equal(judged.code, EXIT_OK, judged.out + judged.err);
    const rows = readRounds(repo, 3);
    const adjudication = rows[rows.length - 1];
    assert.equal((adjudication["outcomes"] as Record<string, unknown>[])[0]["outcome"], "OVERRULED");
    assert.equal(adjudication["blocking"], false);
    assert.equal(verdictOf(3), "VERIFIED");
  });

  milestone("session 4: the setting is on, the verifier asks for a file outside its scope, and the refusal is on the record while its verdict still stands", async () => {
    // The one exposure this surface has: the block is parsed on every
    // round, so the case that matters is the one where the answer asks for
    // something it may not have. Nothing is delivered, so nothing is worth
    // a second turn -- the answer that carried the request is the verdict.
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    registerSessionStart(sessionsDir, 4, { engine: "claude-code", provider: "anthropic" });
    widget(6);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 4 });
    reconfigure({ verification: { settings: { api_file_requests: true } } });
    const before = dispatches();

    const { code, out } = await captured(() => runRound(sessionsDir));
    assert.equal(code, EXIT_OK, out);
    assert.equal(dispatches() - before, 1, "a refused request buys no further turn");

    const agency = agencyOf(4);
    assert.equal(agency["mode"], "tools");
    assert.deepEqual(agency["operations_granted"], ["read"]);
    const [operation] = agency["operations"] as Record<string, unknown>[];
    // `runner.js` is on disk and is still not opened: the boundary is the
    // scope, not the filesystem.
    assert.deepEqual([operation?.["kind"], operation?.["target"], operation?.["in_scope"]], ["read", "runner.js", false]);
    assert.match(String(operation?.["detail"]), /outside the scope/);
    assert.equal(agency["out_of_scope"], 1);
    assert.equal(verdictOf(4), "VERIFIED");
  });

  milestone("session 5: with the setting off the same block is recorded, refused for want of a granted read, and ignored", async () => {
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    registerSessionStart(sessionsDir, 5, { engine: "claude-code", provider: "anthropic" });
    widget(7);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 5 });
    reconfigure({});
    const before = dispatches();

    const { code, out } = await captured(() => runRound(sessionsDir));
    assert.equal(code, EXIT_OK, out);
    assert.equal(dispatches() - before, 1, "the round is one turn, as every round is today");

    const agency = agencyOf(5);
    // Nothing was granted, so nothing changed about what this round could
    // see -- and the ask is on the record all the same, because a request
    // that vanishes silently looks like one that was never made.
    assert.equal(agency["mode"], "none");
    assert.deepEqual(agency["operations_granted"], []);
    const [operation] = agency["operations"] as Record<string, unknown>[];
    assert.match(String(operation?.["detail"]), /granted no read operation/);
    assert.equal(verdictOf(5), "VERIFIED");
  });

  milestone("the legal anchor is placed by topology and stops at the first post-round commit, so a backdated one can never win", () => {
    const head = gitOut(repo, "rev-parse", "HEAD");
    assert.deepEqual(legalAnchor(repo, head, "not a date", head), [head, `Round HEAD was ${head.slice(0, 12)}, so that commit is the last one the round could not have reported on.`]);
    assert.match(legalAnchor(repo, head, "2026-01-01T00:00:00+00:00", "0".repeat(40))[1], /This history has been rewritten since the round/);
    assert.match(legalAnchor(repo, head, null)[1], /unreadable timestamp/);
    // The walk runs oldest-first and stops at the first commit dated after
    // the round: the round moment sits just after the real commits, a
    // far-future commit ends the walk, and a backdated one behind it cannot
    // be reached however early its date says it is.
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "work");
    const last = gitOut(repo, "rev-parse", "HEAD");
    const moment = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    commitAt("later.txt", "2099-06-01T00:00:00+00:00");
    const backdated = commitAt("backdated.txt", "2020-01-01T00:00:00+00:00");
    const [anchor] = legalAnchor(repo, gitOut(repo, "rev-parse", "HEAD"), moment);
    assert.equal(anchor, last);
    assert.notEqual(anchor, backdated);
    assert.match(legalAnchor(repo, seedHead, "1999-01-01T00:00:00+00:00")[1], /There is nothing to re-anchor onto\./);
  });

  milestone("the approved plan's envelope is compared against what git says changed: inside, outside, and a dependency change named as its own kind", () => {
    const directory = join(repo, ".dabbler", "runs", "s3");
    writePlan(directory, newPlan(3, "fixture", [{ step_id: "finish", intent: "Finish", file_envelope: ["tests/test_widget.py"], evidence_contract: [{ kind: "deterministic", description: "pytest passes" }] }]));
    const plan = approvePlan(directory);
    // The change set the envelope is compared against: one file inside it,
    // one outside it, and a new dependency file.
    writeFiles(repo, { "tests/test_widget.py": "from src.widget import widget\n\n\ndef test_widget():\n    assert widget() == 1\n", "notes.md": "scratch\n" });
    writeFileSync(join(repo, "pyproject.toml"), "[project]\n", "utf8");
    const comparison = compareToEnvelope(repo, plan, sessionsDir);
    assert.equal(comparison.measured, true);
    assert.deepEqual(comparison.inside, ["tests/test_widget.py"]);
    assert.deepEqual(comparison.outside, [
      { path: "notes.md", reason: "outside-envelope" },
      { path: "pyproject.toml", reason: "new-dependency" },
    ]);
    assert.equal(needsAmendment(comparison), true);
    assert.equal(existsSync(join(repo, ".dabbler", "runs", "s3", "approved-plan.json")), true);
  });
});
