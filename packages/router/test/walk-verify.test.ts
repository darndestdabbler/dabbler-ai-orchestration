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
import { checkVerificationClean } from "../src/gates.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { readDisputes, readRounds, standingReopen } from "../src/ledger.ts";
import { readSessionState } from "../src/progress.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, EXIT_USAGE } from "../src/session.ts";
import { recordRun, type SuiteSpec } from "../src/testEvidence.ts";
import { recordDispute, runAdjudication } from "../src/verify/disputes.ts";
import { splitDisputes } from "../src/verify/prompts.ts";
import { legalAnchor } from "../src/verify/reanchor.ts";
import { runReopen } from "../src/verify/reopen.ts";
import { runRound } from "../src/verify/rounds.ts";
import { setHttpSource } from "../src/transports/api.ts";
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
      "### Session 1 of 6: The widget\n1. Register.\n2. Make `widget()` return 2.\n3. Verify; close.\n\n" +
      "### Session 2 of 6: Again\n1. Register.\n2. Polish.\n\n### Session 3 of 6: Once more\n1. Register.\n2. Finish.\n\n" +
      "### Session 4 of 6: The verifier asks\n1. Register.\n2. Change the widget.\n\n" +
      "### Session 5 of 6: And asks with nothing granted\n1. Register.\n2. Change it again.\n\n" +
      "### Session 6 of 6: And is given what it asked for\n1. Register.\n2. Change it once more.\n",
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

/**
 * Further answers, placed where the cursor will next look.
 *
 * `script` writes from 01 and the cursor never rewinds, so a milestone that
 * needs answers after earlier ones have been served appends rather than
 * re-scripts -- otherwise it would overwrite responses already consumed and
 * still be served nothing.
 */
function queue(...bodies: string[]): void {
  const served = dispatches();
  bodies.forEach((body, index) =>
    writeFileSync(join(responses, `${String(served + index + 1).padStart(2, "0")}.md`), body, "utf8"),
  );
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
    let handedBack = "";
    const prose = await captured(() => {
      const outcome = recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "I disagree", evidence: [] });
      handedBack = outcome.refusal;
      return outcome.exit;
    });
    assert.equal(prose.code, EXIT_USAGE);
    assert.match(prose.err, /prose-only disputes are refused/);
    // The refusal travels beside the exit, and it is the same refusal: the
    // driver files the engine's disputes, and an exit code on its own put
    // `refused (exit 2)` on the record while the sentence that refused it
    // went to a stream nothing kept.
    assert.equal(handedBack, prose.err.replace(/\r\n/g, "\n").trim());
    const wrong = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 7, grounds: "g", evidence: ["src/widget.py"] }).exit);
    assert.match(wrong.err, /Its findings, by 0-based index:/);
    const filed = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test covers it", evidence: ["src/widget.py"] }).exit);
    assert.equal(filed.code, EXIT_OK, filed.err);
    assert.equal(readDisputes(repo, 1).length, 1);
    assert.equal(readDisputes(repo, 1)[0]["filed_after_round"], 1);
    let refusedTwice = false;
    try {
      const again = await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "again", evidence: ["src/widget.py"] }).exit);
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
    assert.equal((await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test proves it", evidence: ["tests/test_widget.py"] }).exit)).code, EXIT_OK);
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
    assert.equal((await captured(() => recordDispute(sessionsDir, { roundNumber: 1, findingIndex: 0, grounds: "the test proves it", evidence: ["tests/test_widget.py"] }).exit)).code, EXIT_OK);
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
    // Offered the read and given nothing by it: this round saw the evidence
    // bundle and no more, which is what a blind round sees, so `mode` says
    // so. `operations_granted` is where the offer it declined is recorded.
    assert.equal(agency["mode"], "none");
    assert.deepEqual(agency["operations_granted"], ["read"]);
    assert.match(String(agency["reason"]), /nothing that could be delivered/);
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

  milestone("session 6: with the setting on and an in-scope request, `runRound` delivers the file on a second turn and records the round as one that looked", async () => {
    // The whole wiring, driven by `runRound` and not by a hand-built grant:
    // the setting is read from the config on disk, the follow-up is the
    // round's own, and the wire is what says how many turns there were and
    // what the second one carried. The API transport is used here rather
    // than the offline one because only the wire can show the request.
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    registerSessionStart(sessionsDir, 6, { engine: "claude-code", provider: "anthropic" });
    // Three trailing newlines, so what arrives proves nothing was trimmed.
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 8\n\n\n", "utf8");
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 6 });
    reconfigure({
      transport: { profile: "api" },
      verification: { settings: { api_file_requests: true } },
    });

    const bodies: Array<Record<string, unknown>> = [];
    const restoreHttp = setHttpSource((_url, init) => {
      bodies.push(JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>);
      const first = bodies.length === 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: first
              ? "Show me the source before I grade it.\n\n```file-request\nsrc/widget.py\n```\n"
              : "VERIFIED\n\nThe source says what the change claims. Nothing blocks.\n",
            usage: { input_tokens: 100, output_tokens: 120 },
            status: "completed",
            model: "o-gpt",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    let code: number;
    let out: string;
    try {
      ({ code, out } = await captured(() => runRound(sessionsDir)));
    } finally {
      restoreHttp();
    }

    assert.equal(code, EXIT_OK, out);
    assert.equal(bodies.length, 2, "the delivered request bought exactly one further turn");
    const second = String(bodies[1]?.["input"] ?? "");
    // The contents as they are: three trailing newlines, none trimmed, and
    // no fourth added because the file already ends in one.
    assert.ok(second.includes("def widget():\n    return 8\n\n\n```"), second.slice(-400));
    assert.match(second, /Show me the source before I grade it/, "its own first answer travelled too");

    const agency = agencyOf(6);
    assert.equal(agency["mode"], "tools");
    assert.equal(agency["reads"], 1);
    const [operation] = agency["operations"] as Record<string, unknown>[];
    assert.deepEqual(
      [operation?.["kind"], operation?.["target"], operation?.["in_scope"], operation?.["fidelity"]],
      ["read", "src/widget.py", true, "verbatim"],
    );
    assert.equal(verdictOf(6), "VERIFIED");
  });

  milestone("session 7: the cap ends the loop, a further repair strands the session between two verbs, and an operator's grant is the way out", async () => {
    // Session 137, 2026-09-09, walked for real. The shape that cost it:
    // a blocking finding is fixed at the cap, the terminal is written, the
    // fix itself then needs a repair -- and from there `verify` said close
    // the session, the close said re-run `verify`, and `close --force`
    // could not help because `verification_clean` is evidence rather than
    // bookkeeping. Every assertion below is one half of that loop.
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    registerSessionStart(sessionsDir, 7, { engine: "claude-code", provider: "anthropic" });
    reconfigure({});
    queue(ISSUE, "VERIFIED\n\nThe repair is right and the tree is the one I was shown.\n");
    widget(9);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 7 });
    assert.equal((await captured(() => runRound(sessionsDir, { maxRounds: 1 }))).code, EXIT_BLOCKING);

    // The fix at the cited site, at the cap: REMEDIATED_AT_CAP, and the
    // work lands labelled unreviewed.
    widget(2);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 7 });
    assert.equal((await captured(() => runRound(sessionsDir, { maxRounds: 1 }))).code, EXIT_OK);
    const capped = readRounds(repo, 7)[1] as Record<string, unknown>;
    assert.equal(capped["type"], "remediated_at_cap");
    assert.ok(checkVerificationClean(sessionsDir)[0], "the tree it reviewed still closes");

    // The repair to the repair -- 137's second bug in the same fix. From
    // here neither verb moves, and each names the other.
    widget(3);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 7 });
    const [clean, why] = checkVerificationClean(sessionsDir);
    assert.equal(clean, false);
    assert.match(why, /the working tree changed after verification round 2/);
    assert.match(why, /dabbler verify/);
    const stranded = await captured(() => runRound(sessionsDir, { maxRounds: 9 }));
    assert.equal(stranded.code, EXIT_USAGE, "no cap reopens a terminal");
    assert.match(stranded.err, /already carries its terminal 'remediated_at_cap' row/);
    // The one sentence 137 did not have: the verb that breaks the tie.
    assert.match(stranded.err, /dabbler verify reopen/);

    // The grant, and what it does and does not buy.
    const granted = await captured(() =>
      runReopen(sessionsDir, {
        rounds: 1,
        reason: "the repair to the release path landed unreviewed",
        approver: "operator",
      }),
    );
    assert.equal(granted.code, EXIT_OK, granted.err);
    assert.equal(standingReopen(repo, 7)?.cap, 3);
    // A grant is not a verdict: the gate refuses until a round has run.
    const [afterGrant, sinceGrant] = checkVerificationClean(sessionsDir);
    assert.equal(afterGrant, false);
    assert.match(sinceGrant, /operator reopened verification after round 2/);

    // The bought round runs, over the flag that says one, and settles it.
    const reviewed = await captured(() => runRound(sessionsDir, { maxRounds: 1 }));
    assert.equal(reviewed.code, EXIT_OK, reviewed.err);
    const rows = readRounds(repo, 7);
    assert.equal(rows.length, 3);
    assert.equal(rows[2]["round"], 3);
    assert.equal(rows[2]["blocking"], false);
    assert.ok(checkVerificationClean(sessionsDir)[0], "the reviewed tree closes");
    assert.equal(verdictOf(7), "VERIFIED");

    // And the cap is still a cap. The grant bought round 3 and nothing
    // beyond it, so a fourth round is refused at the new cap exactly as the
    // third was refused at the old one -- there is no state in which the
    // budget has been switched off. The refusal names the same exit, which
    // is what keeps the escape one an operator decides each time rather
    // than a mode a session slips into.
    widget(4);
    recordRun(sessionsDir, UNIT, "passed", { ...TARGETED, sessionNumber: 7 });
    const spent = await captured(() => runRound(sessionsDir, { maxRounds: 9 }));
    assert.equal(spent.code, EXIT_USAGE);
    assert.match(spent.err, /the cap \(3\) is reached/);
    assert.match(spent.err, /dabbler verify reopen/);
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
