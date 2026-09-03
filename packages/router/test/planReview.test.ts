// The hashed plan and the review that gates it: the plan's integrity rules,
// its derived risk, the free checks, the reviewer's answer, the anti-grind
// rules, and a review round driven by an injected dispatch. Plans live in a
// temp directory; nothing asks git or a model.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  PlanImmutableError,
  PlanIntegrityError,
  appendAmendment,
  approvePlan,
  compareToEnvelope,
  computePlanHash,
  deriveRiskFlags,
  effectivePlan,
  envelopePaths,
  needsAmendment,
  newPlan,
  readPlan,
  writePlan,
} from "../src/approvedPlan.ts";
import {
  CHECK_ENVELOPE_OMITS_NAMED_FILE,
  CHECK_GOAL_WITHOUT_STEP,
  CHECK_RISK_FLAGS_NOT_DERIVED,
  CHECK_STEP_WITHOUT_GOAL,
  ESCALATE_AFTER_REJECTIONS,
  OUTCOME_AMEND,
  OUTCOME_APPROVED,
  OUTCOME_BOUNCED,
  OUTCOME_HUMAN,
  ROLE_PLAN_REVIEW,
  ROLE_PLAN_REVIEW_ESCALATED,
  TRIGGER_HIGH_RISK,
  TRIGGER_REPEAT_OBJECTION,
  VERDICT_HUMAN,
  buildReviewPrompt,
  escalationTriggers,
  freeChecks,
  isLifecycleStep,
  namedFiles,
  objectedFieldDigests,
  parseReviewResponse,
  readRounds,
  reviewAmendment,
  reviewRound,
  revisionAnswersObjections,
  sessionGoals,
} from "../src/planReview.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const SPEC = `### Session 1 of 2: First things
1. Register.
2. **Build the widget.** It lives in \`src/widget.py\`.
3. Polish it.
4. Cross-provider verification.
5. Close-out.
`;

function goodSteps(): Record<string, unknown>[] {
  return [
    { step_id: "build-the-widget", intent: "Build the widget", file_envelope: ["src/widget.py"], evidence_contract: [{ kind: "deterministic", description: "pytest passes" }] },
    { step_id: "polish-it", intent: "Polish it", file_envelope: ["src/polish.py"], evidence_contract: [{ kind: "judgment", description: "a reader agrees" }] },
  ];
}

function planOf(steps: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    schema_version: 1, session_number: 1, session_slug: "fixture",
    steps: steps.map((step) => ({ risk_flags: deriveRiskFlags((step["file_envelope"] as string[]) ?? []), ...step })),
    approved: false, amendments: [],
  };
}

function runDir(): string {
  const directory = join(tempDir(), "s1");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function approvedPlanIn(directory: string): Record<string, unknown> {
  writePlan(directory, newPlan(1, "fixture", goodSteps()));
  return approvePlan(directory);
}

function scripted(answer: string): { dispatch: never; calls: Array<{ prompt: string; role: string }> } {
  const calls: Array<{ prompt: string; role: string }> = [];
  const dispatch = (prompt: string, options: { role: string }): Promise<Record<string, unknown>> => {
    calls.push({ prompt, role: options.role });
    return Promise.resolve({ content: answer, model_name: "m", provider: "p", transport: "api" });
  };
  return { calls, dispatch: dispatch as never };
}

describe("the approved plan's hash", () => {
  it("moves when a core field moves and never when an amendment lands", () => {
    const directory = runDir();
    const bound = approvedPlanIn(directory)["plan_hash"];
    const amended = appendAmendment(directory, { stepId: "polish-it", reason: "the polish needed a helper", addedFiles: ["src/helper.py"] });
    assert.equal(amended["plan_hash"], bound);
    assert.equal(computePlanHash(amended), bound);
    assert.equal(readPlan(directory)["plan_hash"], bound);
    assert.notEqual(computePlanHash({ ...amended, session_slug: "something-else" }), bound);
  });

  it("refuses a plan whose amendments were rewritten, one never through a writer, a rewrite of an approved one, and a second approval", () => {
    const directory = runDir();
    approvedPlanIn(directory);
    appendAmendment(directory, { stepId: "polish-it", reason: "first", addedFiles: ["src/a.py"] });
    const path = join(directory, "approved-plan.json");
    const plan = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (plan["amendments"] as Record<string, unknown>[])[0]["reason"] = "rewritten";
    writeFileSync(path, JSON.stringify(plan, null, 2) + "\n", "utf8");
    assert.throws(() => readPlan(directory), PlanIntegrityError);
    const unwritten = runDir();
    writeFileSync(join(unwritten, "approved-plan.json"), JSON.stringify(planOf(goodSteps()), null, 2), "utf8");
    assert.throws(() => readPlan(unwritten), PlanIntegrityError);
    const approved = runDir();
    approvedPlanIn(approved);
    assert.throws(() => writePlan(approved, newPlan(1, "fixture", goodSteps())), PlanImmutableError);
    assert.throws(() => approvePlan(approved), PlanImmutableError);
  });

  it("refuses an amendment naming an undeclared step, one to a plan nobody approved, and two steps sharing an id", () => {
    const directory = runDir();
    approvedPlanIn(directory);
    assert.throws(() => appendAmendment(directory, { stepId: "no-such-step", reason: "x", addedFiles: ["a.py"] }), /not declared in this plan/);
    const unapproved = runDir();
    writePlan(unapproved, newPlan(1, "fixture", goodSteps()));
    assert.throws(() => appendAmendment(unapproved, { stepId: "polish-it", reason: "x", addedFiles: ["a.py"] }), PlanImmutableError);
    const steps = goodSteps();
    steps[1]["step_id"] = steps[0]["step_id"];
    assert.throws(() => writePlan(runDir(), newPlan(1, "fixture", steps)), /duplicate step_id/);
  });
});

describe("risk flags", () => {
  it("are derived from the envelope in one fixed order, overwriting what the author declared, and re-derived on amendment", () => {
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["nothing-to-see-here"];
    steps[0]["file_envelope"] = ["packages/router/src/session.ts", "package.json"];
    const written = writePlan(runDir(), newPlan(1, "fixture", steps));
    assert.deepEqual((written["steps"] as Record<string, unknown>[])[0]["risk_flags"], ["public-interface", "dependency-change"]);
    const forward = deriveRiskFlags(["packages/router/src/a.ts", ".dabbler/runs/x", "package.json"]);
    assert.deepEqual(forward, ["public-interface", "sensitive-path", "dependency-change"]);
    assert.deepEqual(deriveRiskFlags(["package.json", ".dabbler/runs/x", "packages/router/src/a.ts"]), forward);
    const directory = runDir();
    approvedPlanIn(directory);
    const amended = appendAmendment(directory, { stepId: "polish-it", reason: "it needs the config", addedFiles: ["router-config.yaml"] });
    assert.deepEqual((effectivePlan(amended)["steps"] as Record<string, unknown>[])[1]["risk_flags"], ["sensitive-path"]);
  });
});

describe("the envelope", () => {
  it("scopes to one step when a step is named", () => {
    const plan = approvedPlanIn(runDir());
    assert.deepEqual(envelopePaths(plan), ["src/widget.py", "src/polish.py"]);
    assert.deepEqual(envelopePaths(plan, "polish-it"), ["src/polish.py"]);
  });

  it("is never 'inside the plan' when git cannot say what changed", () => {
    // What it says when git CAN say -- a path outside, a dependency change
    // named as its own kind -- is a milestone of walk-verify.test.ts.
    const repo = tempDir();
    const directory = join(repo, ".dabbler", "runs", "s1");
    mkdirSync(directory, { recursive: true });
    const plan = approvedPlanIn(directory);
    const unanswerable = gitAnswers([[() => true, { code: 128 }]]);
    try {
      const comparison = compareToEnvelope(repo, plan, join(repo, "docs", "sessions"));
      assert.equal(comparison.measured, false);
      assert.equal(needsAmendment(comparison), true);
    } finally {
      unanswerable();
    }
  });
});

describe("the free checks", () => {
  it("names a spec goal no step covers, a step no goal asked for, a named file no envelope declares, and risk flags not derived", () => {
    const orphan = goodSteps();
    orphan[1]["step_id"] = "work-nobody-asked-for";
    const checks = freeChecks(planOf(orphan), SPEC, 1).map((finding) => finding.check);
    assert.ok(checks.includes(CHECK_GOAL_WITHOUT_STEP) && checks.includes(CHECK_STEP_WITHOUT_GOAL));
    const missing = goodSteps();
    missing[0]["file_envelope"] = ["src/other.py"];
    assert.match(String(freeChecks(planOf(missing), SPEC, 1).find((f) => f.check === CHECK_ENVELOPE_OMITS_NAMED_FILE)?.detail), /src\/widget\.py/);
    const flagged = goodSteps();
    flagged[0]["risk_flags"] = ["sensitive-path"];
    assert.ok(freeChecks(planOf(flagged), SPEC, 1).map((f) => f.check).includes(CHECK_RISK_FLAGS_NOT_DERIVED));
  });

  it("keeps a document-wide finding inside an amendment's scope, and reads only backticked tokens that are really paths", () => {
    const plan = planOf(goodSteps());
    delete plan["schema_version"];
    assert.ok(freeChecks(plan, SPEC, 1, null, ["polish-it"]).some((finding) => finding.stepId === null));
    assert.deepEqual(namedFiles("touch `src/a.py` and `docs/b.md`"), ["src/a.py", "docs/b.md"]);
    assert.deepEqual(namedFiles("the `step_id` field and `verify`"), []);
  });
});

describe("goals", () => {
  it("drop the ceremony every session pays and keep the session's own work, recognising each lifecycle phrase however decorated", () => {
    const goals = sessionGoals(SPEC, 1);
    assert.deepEqual(goals.map((goal) => goal.key), ["build-the-widget", "polish-it"]);
    assert.equal(goals[1].text, "Polish it.");
    assert.equal(isLifecycleStep("**Register**; declare `--not-releasable`."), true);
    assert.equal(isLifecycleStep("Affected tests as preverify."), true);
    assert.equal(isLifecycleStep("Close-out."), true);
    assert.equal(isLifecycleStep("Build the widget."), false);
  });
});

describe("parsing a reviewer's answer", () => {
  const ids = ["a", "b"];

  it("reads one verdict per step from the block form", () => {
    const verdicts = parseReviewResponse("STEP: a\nVERDICT: approve\nFIELDS:\nWHY: the evidence proves it\n\nSTEP: b\nVERDICT: amend\nFIELDS: evidence_contract\nWHY: it would pass wrong\n", ids);
    assert.deepEqual(verdicts[0], { stepId: "a", verdict: "approve", objectedFields: [], reason: "the evidence proves it" });
    assert.deepEqual(verdicts[1].objectedFields, ["evidence_contract"]);
  });

  it("sends an unanswered step, an unreadable verdict, and an approval carrying an objection to a human", () => {
    const unanswered = parseReviewResponse("STEP: a\nVERDICT: approve\n", ids);
    assert.equal(unanswered[1].verdict, VERDICT_HUMAN);
    assert.match(unanswered[1].reason, /did not answer/);
    const unreadable = parseReviewResponse("STEP: a\nVERDICT: approve, with reservations\n", ["a"]);
    assert.equal(unreadable[0].verdict, VERDICT_HUMAN);
    assert.match(unreadable[0].reason, /unreadable verdict/);
    const objected = parseReviewResponse("STEP: a\nVERDICT: approve\nFIELDS: intent\n", ["a"]);
    assert.equal(objected[0].verdict, VERDICT_HUMAN);
    assert.deepEqual(objected[0].objectedFields, ["intent"]);
  });

  it("objects to every answerable field when an objection names none", () => {
    assert.deepEqual(parseReviewResponse("STEP: a\nVERDICT: amend\nWHY: no\n", ["a"])[0].objectedFields, ["intent", "file_envelope", "evidence_contract"]);
  });
});

describe("the anti-grind rules", () => {
  const digestOf = (plan: Record<string, unknown>, stepId: string, field: string): Record<string, string> =>
    objectedFieldDigests(plan, [{ stepId, verdict: "amend", objectedFields: [field], reason: "" }])[stepId];

  it("lets a real revision through, stops a resubmission, and counts a deleted step as answered", () => {
    const plan = planOf(goodSteps());
    assert.equal(revisionAnswersObjections(plan, { "polish-it": { intent: "sha256:not-what-it-is" } }), true);
    assert.equal(revisionAnswersObjections(plan, { "polish-it": digestOf(plan, "polish-it", "intent") }), false);
    assert.equal(revisionAnswersObjections(planOf([goodSteps()[0]]), { "polish-it": { intent: "x" } }), true);
  });

  it("escalates on a high-risk flag and on repeat rejection, forgets the strikes an approval settled, and does not count a round that never reached a model", () => {
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["sensitive-path"];
    const rejections = Array.from({ length: ESCALATE_AFTER_REJECTIONS }, () => ({ outcome: OUTCOME_AMEND, model_called: true }));
    assert.deepEqual(escalationTriggers(planOf(steps), rejections), [TRIGGER_HIGH_RISK, TRIGGER_REPEAT_OBJECTION]);
    assert.deepEqual(
      escalationTriggers(planOf(goodSteps()), [{ outcome: OUTCOME_AMEND, model_called: true }, { outcome: OUTCOME_APPROVED, model_called: true }, { outcome: OUTCOME_AMEND, model_called: true }]),
      [],
    );
    assert.deepEqual(escalationTriggers(planOf(goodSteps()), [{ outcome: OUTCOME_AMEND, model_called: false }, { outcome: OUTCOME_AMEND, model_called: false }]), []);
  });
});

describe("a review round", () => {
  it("spends nothing when a free check already refused the plan, and bounces a resubmission without reaching the model", async () => {
    const directory = runDir();
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["sensitive-path"];
    const refused = scripted("STEP: a\nVERDICT: approve\n");
    const round = await reviewRound(directory, planOf(steps), SPEC, 1, { dispatch: refused.dispatch });
    assert.equal(refused.calls.length, 0);
    assert.equal(round["outcome"], OUTCOME_AMEND);
    assert.equal(round["model_called"], false);

    const again = runDir();
    const plan = planOf(goodSteps());
    await reviewRound(again, plan, SPEC, 1, { dispatch: scripted("STEP: build-the-widget\nVERDICT: amend\nFIELDS: intent\nWHY: vague\nSTEP: polish-it\nVERDICT: approve\n").dispatch });
    const second = scripted("STEP: build-the-widget\nVERDICT: approve\n");
    const bounced = await reviewRound(again, plan, SPEC, 1, { dispatch: second.dispatch });
    assert.equal(second.calls.length, 0);
    assert.equal(bounced["outcome"], OUTCOME_BOUNCED);
    assert.equal(readRounds(again).length, 2);
  });

  it("asks the cheap role when nothing triggers, the escalated one when a trigger fires, and takes one human verdict as the outcome", async () => {
    const cheap = scripted("STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: approve\n");
    const round = await reviewRound(runDir(), planOf(goodSteps()), SPEC, 1, { dispatch: cheap.dispatch });
    assert.equal(cheap.calls[0].role, ROLE_PLAN_REVIEW);
    assert.equal(round["outcome"], OUTCOME_APPROVED);
    assert.deepEqual(round["reviewer"], { model: "m", provider: "p", role: ROLE_PLAN_REVIEW, transport: "api" });

    const steps = goodSteps();
    steps[0]["file_envelope"] = ["router-config.yaml", "src/widget.py"];
    steps[0]["risk_flags"] = ["sensitive-path"];
    const escalated = scripted("STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: approve\n");
    await reviewRound(runDir(), planOf(steps), SPEC, 1, { dispatch: escalated.dispatch });
    assert.equal(escalated.calls[0].role, ROLE_PLAN_REVIEW_ESCALATED);

    const human = await reviewRound(runDir(), planOf(goodSteps()), SPEC, 1, {
      dispatch: scripted("STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: human\nWHY: judgement\n").dispatch,
    });
    assert.equal(human["outcome"], OUTCOME_HUMAN);
  });

  it("refuses a review history with a hole in it", () => {
    const directory = runDir();
    writeFileSync(join(directory, "plan-review.jsonl"), "{not json}\n", "utf8");
    assert.throws(() => readRounds(directory), /is not valid JSON/);
  });
});

describe("the review prompt", () => {
  it("shows only the amended step on an amendment, and every step with its derived flags on a full review", () => {
    const scoped = buildReviewPrompt(planOf(goodSteps()), sessionGoals(SPEC, 1), ["polish-it"]);
    assert.ok(scoped.includes("STEP: polish-it") && !scoped.includes("STEP: build-the-widget") && scoped.includes("This is an amendment"));
    const full = buildReviewPrompt(planOf(goodSteps()), sessionGoals(SPEC, 1));
    assert.ok(full.includes("STEP: build-the-widget") && full.includes("STEP: polish-it") && full.includes("derived risk flags: none"));
  });
});

describe("reviewing an amendment", () => {
  it("appends only when the scoped round approves, leaves the plan untouched otherwise, and refuses an amendment carrying no change", async () => {
    const directory = runDir();
    approvedPlanIn(directory);
    const [round, plan] = await reviewAmendment(directory, SPEC, 1, {
      stepId: "polish-it", reason: "it needs a helper", addedFiles: ["src/helper.py"],
      dispatch: scripted("STEP: polish-it\nVERDICT: approve\n").dispatch,
    });
    assert.equal(round["outcome"], OUTCOME_APPROVED);
    assert.deepEqual(round["reviewed_steps"], ["polish-it"]);
    assert.equal((plan?.["amendments"] as unknown[]).length, 1);

    const untouched = runDir();
    approvedPlanIn(untouched);
    const [refused, none] = await reviewAmendment(untouched, SPEC, 1, {
      stepId: "polish-it", reason: "it needs a helper", addedFiles: ["src/helper.py"],
      dispatch: scripted("STEP: polish-it\nVERDICT: amend\nFIELDS: intent\nWHY: no\n").dispatch,
    });
    assert.notEqual(refused["outcome"], OUTCOME_APPROVED);
    assert.equal(none, null);
    assert.deepEqual(readPlan(untouched)["amendments"], []);
    await assert.rejects(reviewAmendment(untouched, SPEC, 1, { stepId: "polish-it", reason: "just because" }), /must carry a change/);
  });
});
