// The verifier's read surface, the hashed plan, and the review that gates it.
//
// The parity control proves the two routers agree on what a plan looks like
// on disk; these prove the rules a comparison cannot reach -- the refusals no
// corpus shape triggers, and the boundaries that only show themselves when
// something tries to cross them.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DEFAULT_READ_BUDGET,
  FIDELITY_TRANSFORMED,
  FIDELITY_UNVERIFIED,
  FIDELITY_VERBATIM,
  MODE_NONE,
  MODE_TOOLS,
  WRITE_ACCEPTED,
  WRITE_LABEL_FIX,
  WRITE_LABEL_TEST,
  WRITE_REFUSED,
  applyWrites,
  briefing,
  declaredDependencies,
  grantForTransport,
  readFidelity,
  recordForRound,
  recordRow,
  sessionScope,
  summaryLine,
} from "../src/agency.ts";
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
import { buildVerificationPrompt } from "../src/verifyjob.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const SPEC = `### Session 1 of 2: First things
1. Register.
2. **Build the widget.** It lives in \`src/widget.py\`.
3. Polish it.
4. Cross-provider verification.
5. Close-out.
`;

/** The plan the spec above asks for, with its two goals covered. */
function goodSteps(): Record<string, unknown>[] {
  return [
    {
      step_id: "build-the-widget",
      intent: "Build the widget",
      file_envelope: ["src/widget.py"],
      evidence_contract: [{ kind: "deterministic", description: "pytest passes" }],
    },
    {
      step_id: "polish-it",
      intent: "Polish it",
      file_envelope: ["src/polish.py"],
      evidence_contract: [{ kind: "judgment", description: "a reader agrees" }],
    },
  ];
}

function runDir(): string {
  const directory = join(makeTempDir(), "s1");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function approvedPlanIn(directory: string): Record<string, unknown> {
  writePlan(directory, newPlan(1, "fixture", goodSteps()));
  return approvePlan(directory);
}

// --- The plan ----------------------------------------------------------------

describe("the approved plan's hash", () => {
  it("moves when a core field moves and never when an amendment lands", () => {
    const directory = runDir();
    const approved = approvedPlanIn(directory);
    const bound = approved["plan_hash"];

    const amended = appendAmendment(directory, {
      stepId: "polish-it",
      reason: "the polish needed a helper",
      addedFiles: ["src/helper.py"],
    });
    expect(amended["plan_hash"]).toBe(bound);
    expect(computePlanHash(amended)).toBe(bound);
    // `readPlan` recomputes both hashes, so a pass here is the integrity
    // check agreeing rather than this test asserting.
    expect(readPlan(directory)["plan_hash"]).toBe(bound);

    const moved = { ...(amended as Record<string, unknown>) };
    moved["session_slug"] = "something-else";
    expect(computePlanHash(moved)).not.toBe(bound);
  });

  it("refuses a plan whose amendments were rewritten rather than appended", () => {
    // The core hash cannot catch this: `amendments` is deliberately outside
    // it so the field can grow. The write ledger is what closes it.
    const directory = runDir();
    approvedPlanIn(directory);
    appendAmendment(directory, {
      stepId: "polish-it",
      reason: "first",
      addedFiles: ["src/a.py"],
    });
    const path = join(directory, "approved-plan.json");
    const plan = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (plan["amendments"] as Record<string, unknown>[])[0]["reason"] = "rewritten";
    writeFileSync(path, JSON.stringify(plan, null, 2) + "\n", "utf8");

    expect(() => readPlan(directory)).toThrow(PlanIntegrityError);
  });

  it("refuses a hand-written plan that was never through a writer", () => {
    // Schema-valid on purpose: the refusal under test is the missing write
    // ledger, and a plan that failed validation first would prove nothing
    // about it.
    const directory = runDir();
    writeFileSync(
      join(directory, "approved-plan.json"),
      JSON.stringify(planOf(goodSteps()), null, 2),
      "utf8",
    );
    expect(() => readPlan(directory)).toThrow(PlanIntegrityError);
  });

  it("refuses a rewrite of an approved plan and a second approval", () => {
    const directory = runDir();
    approvedPlanIn(directory);
    expect(() => writePlan(directory, newPlan(1, "fixture", goodSteps()))).toThrow(
      PlanImmutableError,
    );
    expect(() => approvePlan(directory)).toThrow(PlanImmutableError);
  });

  it("refuses an amendment naming a step the plan does not declare", () => {
    const directory = runDir();
    approvedPlanIn(directory);
    expect(() =>
      appendAmendment(directory, { stepId: "no-such-step", reason: "x", addedFiles: ["a.py"] }),
    ).toThrow(/not declared in this plan/);
  });

  it("refuses an amendment to a plan nobody approved", () => {
    const directory = runDir();
    writePlan(directory, newPlan(1, "fixture", goodSteps()));
    expect(() =>
      appendAmendment(directory, { stepId: "polish-it", reason: "x", addedFiles: ["a.py"] }),
    ).toThrow(PlanImmutableError);
  });

  it("refuses two steps sharing one step_id", () => {
    const directory = runDir();
    const steps = goodSteps();
    steps[1]["step_id"] = steps[0]["step_id"];
    expect(() => writePlan(directory, newPlan(1, "fixture", steps))).toThrow(
      /duplicate step_id/,
    );
  });
});

describe("risk flags", () => {
  it("are derived from the envelope and overwrite what the author declared", () => {
    const directory = runDir();
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["nothing-to-see-here"];
    steps[0]["file_envelope"] = ["ai_router/session.py", "pyproject.toml"];
    const written = writePlan(directory, newPlan(1, "fixture", steps));
    expect((written["steps"] as Record<string, unknown>[])[0]["risk_flags"]).toEqual([
      "public-interface",
      "dependency-change",
    ]);
  });

  it("keeps one fixed order however the envelope is written", () => {
    const forward = deriveRiskFlags([
      "ai_router/a.py",
      ".dabbler/runs/x",
      "pyproject.toml",
    ]);
    const backward = deriveRiskFlags([
      "pyproject.toml",
      ".dabbler/runs/x",
      "ai_router/a.py",
    ]);
    expect(forward).toEqual(["public-interface", "sensitive-path", "dependency-change"]);
    expect(backward).toEqual(forward);
  });

  it("re-derives from a widened envelope, so an amendment cannot lower its own risk", () => {
    const directory = runDir();
    approvedPlanIn(directory);
    const amended = appendAmendment(directory, {
      stepId: "polish-it",
      reason: "it needs the config",
      addedFiles: ["router-config.yaml"],
    });
    const folded = effectivePlan(amended)["steps"] as Record<string, unknown>[];
    expect(folded[1]["risk_flags"]).toEqual(["sensitive-path"]);
  });
});

describe("the envelope", () => {
  it("scopes to one step rather than to the plan when a step is named", () => {
    const directory = runDir();
    const plan = approvedPlanIn(directory);
    expect(envelopePaths(plan)).toEqual(["src/widget.py", "src/polish.py"]);
    expect(envelopePaths(plan, "polish-it")).toEqual(["src/polish.py"]);
  });

  it("reports a path outside it, and names a dependency change as its own kind", () => {
    const repo = makeTempDir();
    execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
    const directory = join(repo, ".dabbler", "runs", "s1");
    mkdirSync(directory, { recursive: true });
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "widget.py"), "x = 1\n", "utf8");
    commitAll(repo);
    writeFileSync(join(repo, "src", "widget.py"), "x = 2\n", "utf8");
    writeFileSync(join(repo, "src", "stray.py"), "y = 1\n", "utf8");
    writeFileSync(join(repo, "pyproject.toml"), "[project]\n", "utf8");

    const plan = approvedPlanIn(directory);
    const comparison = compareToEnvelope(repo, plan, join(repo, "docs", "sessions"));
    expect(comparison.measured).toBe(true);
    expect(comparison.inside).toEqual(["src/widget.py"]);
    expect(comparison.outside).toEqual([
      { path: "pyproject.toml", reason: "new-dependency" },
      { path: "src/stray.py", reason: "outside-envelope" },
    ]);
    expect(needsAmendment(comparison)).toBe(true);
  });

  it("is never 'inside the plan' when git cannot say what changed", () => {
    const notARepo = makeTempDir();
    const directory = runDir();
    const comparison = compareToEnvelope(
      notARepo,
      approvedPlanIn(directory),
      join(notARepo, "docs", "sessions"),
    );
    expect(comparison.measured).toBe(false);
    expect(needsAmendment(comparison)).toBe(true);
  });
});

// --- The review --------------------------------------------------------------

describe("the free checks", () => {
  it("names a spec goal no step covers, and a step no goal asked for", () => {
    const steps = goodSteps();
    steps[1]["step_id"] = "work-nobody-asked-for";
    const findings = freeChecks(planOf(steps), SPEC, 1);
    const checks = findings.map((finding) => finding.check);
    expect(checks).toContain(CHECK_GOAL_WITHOUT_STEP);
    expect(checks).toContain(CHECK_STEP_WITHOUT_GOAL);
  });

  it("catches a file the spec names in backticks that no envelope declares", () => {
    const steps = goodSteps();
    steps[0]["file_envelope"] = ["src/other.py"];
    const findings = freeChecks(planOf(steps), SPEC, 1);
    const omission = findings.find(
      (finding) => finding.check === CHECK_ENVELOPE_OMITS_NAMED_FILE,
    );
    expect(omission?.detail).toContain("src/widget.py");
  });

  it("catches risk flags that are not what the envelope derives", () => {
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["sensitive-path"];
    const findings = freeChecks(planOf(steps), SPEC, 1);
    expect(findings.map((finding) => finding.check)).toContain(
      CHECK_RISK_FLAGS_NOT_DERIVED,
    );
  });

  it("keeps a document-wide finding inside an amendment's scope", () => {
    // A finding that names no step is not one step's problem, so narrowing to
    // an amended step must not hide it.
    const plan = planOf(goodSteps());
    delete plan["schema_version"];
    const scoped = freeChecks(plan, SPEC, 1, null, ["polish-it"]);
    expect(scoped.some((finding) => finding.stepId === null)).toBe(true);
  });

  it("reads only backticked tokens that are really paths", () => {
    expect(namedFiles("touch `src/a.py` and `docs/b.md`")).toEqual([
      "src/a.py",
      "docs/b.md",
    ]);
    expect(namedFiles("the `step_id` field and `verify`")).toEqual([]);
  });
});

describe("goals", () => {
  it("drop the ceremony every session pays and keep the session's own work", () => {
    const goals = sessionGoals(SPEC, 1);
    expect(goals.map((goal) => goal.key)).toEqual(["build-the-widget", "polish-it"]);
    expect(goals[1].text).toBe("Polish it.");
  });

  it("recognizes each lifecycle phrase however it is decorated", () => {
    expect(isLifecycleStep("**Register**; declare `--not-releasable`.")).toBe(true);
    expect(isLifecycleStep("Affected tests as preverify.")).toBe(true);
    expect(isLifecycleStep("Close-out.")).toBe(true);
    expect(isLifecycleStep("Build the widget.")).toBe(false);
  });
});

describe("parsing a reviewer's answer", () => {
  const ids = ["a", "b"];

  it("reads one verdict per step from the block form", () => {
    const verdicts = parseReviewResponse(
      "STEP: a\nVERDICT: approve\nFIELDS:\nWHY: the evidence proves it\n\n" +
        "STEP: b\nVERDICT: amend\nFIELDS: evidence_contract\nWHY: it would pass wrong\n",
      ids,
    );
    expect(verdicts[0]).toEqual({
      stepId: "a",
      verdict: "approve",
      objectedFields: [],
      reason: "the evidence proves it",
    });
    expect(verdicts[1].objectedFields).toEqual(["evidence_contract"]);
  });

  it("sends an unanswered step to a human rather than approving it", () => {
    const verdicts = parseReviewResponse("STEP: a\nVERDICT: approve\n", ids);
    expect(verdicts[1].verdict).toBe(VERDICT_HUMAN);
    expect(verdicts[1].reason).toContain("did not answer");
  });

  it("sends a verdict in a shape nobody asked for to a human", () => {
    const verdicts = parseReviewResponse(
      "STEP: a\nVERDICT: approve, with reservations\n",
      ["a"],
    );
    expect(verdicts[0].verdict).toBe(VERDICT_HUMAN);
    expect(verdicts[0].reason).toContain("unreadable verdict");
  });

  it("keeps an objection an approval also carried, rather than the approval", () => {
    const verdicts = parseReviewResponse(
      "STEP: a\nVERDICT: approve\nFIELDS: intent\n",
      ["a"],
    );
    expect(verdicts[0].verdict).toBe(VERDICT_HUMAN);
    expect(verdicts[0].objectedFields).toEqual(["intent"]);
  });

  it("objects to every answerable field when an objection names none", () => {
    const verdicts = parseReviewResponse("STEP: a\nVERDICT: amend\nWHY: no\n", ["a"]);
    expect(verdicts[0].objectedFields).toEqual([
      "intent",
      "file_envelope",
      "evidence_contract",
    ]);
  });
});

describe("the anti-grind rules", () => {
  it("lets a real revision through and stops a resubmission", () => {
    const plan = planOf(goodSteps());
    const digests = { "polish-it": { intent: "sha256:not-what-it-is" } };
    expect(revisionAnswersObjections(plan, digests)).toBe(true);

    const unchanged = { "polish-it": digestOf(plan, "polish-it", "intent") };
    expect(revisionAnswersObjections(plan, unchanged)).toBe(false);
  });

  it("counts a deleted step as having answered its objection", () => {
    const plan = planOf([goodSteps()[0]]);
    expect(revisionAnswersObjections(plan, { "polish-it": { intent: "x" } })).toBe(true);
  });

  it("escalates on a high-risk flag and on repeat rejection, and records both", () => {
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["sensitive-path"];
    const rejections = Array.from({ length: ESCALATE_AFTER_REJECTIONS }, () => ({
      outcome: OUTCOME_AMEND,
      model_called: true,
    }));
    expect(escalationTriggers(planOf(steps), rejections)).toEqual([
      TRIGGER_HIGH_RISK,
      TRIGGER_REPEAT_OBJECTION,
    ]);
  });

  it("forgets the strikes an approval settled", () => {
    const prior = [
      { outcome: OUTCOME_AMEND, model_called: true },
      { outcome: OUTCOME_APPROVED, model_called: true },
      { outcome: OUTCOME_AMEND, model_called: true },
    ];
    expect(escalationTriggers(planOf(goodSteps()), prior)).toEqual([]);
  });

  it("does not count a round that never reached a model", () => {
    const prior = [
      { outcome: OUTCOME_AMEND, model_called: false },
      { outcome: OUTCOME_AMEND, model_called: false },
    ];
    expect(escalationTriggers(planOf(goodSteps()), prior)).toEqual([]);
  });
});

describe("a review round", () => {
  /** A dispatch that records what it was asked and answers a fixed script. */
  function scripted(answer: string): {
    dispatch: (prompt: string, options: { role: string }) => Promise<Record<string, unknown>>;
    calls: Array<{ prompt: string; role: string }>;
  } {
    const calls: Array<{ prompt: string; role: string }> = [];
    return {
      calls,
      dispatch: (prompt, options) => {
        calls.push({ prompt, role: options.role });
        return Promise.resolve({
          content: answer,
          model_name: "m",
          provider: "p",
          transport: "api",
        });
      },
    };
  }

  it("spends nothing when a free check already refused the plan", async () => {
    const directory = runDir();
    const steps = goodSteps();
    steps[0]["risk_flags"] = ["sensitive-path"];
    const { dispatch, calls } = scripted("STEP: a\nVERDICT: approve\n");
    const round = await reviewRound(directory, planOf(steps), SPEC, 1, {
      dispatch: dispatch as never,
    });
    expect(calls).toHaveLength(0);
    expect(round["outcome"]).toBe(OUTCOME_AMEND);
    expect(round["model_called"]).toBe(false);
  });

  it("bounces a resubmission without reaching the model", async () => {
    const directory = runDir();
    const plan = planOf(goodSteps());
    const first = scripted(
      "STEP: build-the-widget\nVERDICT: amend\nFIELDS: intent\nWHY: vague\n" +
        "STEP: polish-it\nVERDICT: approve\n",
    );
    await reviewRound(directory, plan, SPEC, 1, { dispatch: first.dispatch as never });

    const second = scripted("STEP: build-the-widget\nVERDICT: approve\n");
    const round = await reviewRound(directory, plan, SPEC, 1, {
      dispatch: second.dispatch as never,
    });
    expect(second.calls).toHaveLength(0);
    expect(round["outcome"]).toBe(OUTCOME_BOUNCED);
    expect(readRounds(directory)).toHaveLength(2);
  });

  it("routes to the escalated role when a trigger fires", async () => {
    const directory = runDir();
    const steps = goodSteps();
    steps[0]["file_envelope"] = ["router-config.yaml", "src/widget.py"];
    steps[0]["risk_flags"] = ["sensitive-path"];
    const { dispatch, calls } = scripted(
      "STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: approve\n",
    );
    await reviewRound(directory, planOf(steps), SPEC, 1, { dispatch: dispatch as never });
    expect(calls[0].role).toBe(ROLE_PLAN_REVIEW_ESCALATED);
  });

  it("asks the cheap role when nothing triggers", async () => {
    const directory = runDir();
    const { dispatch, calls } = scripted(
      "STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: approve\n",
    );
    const round = await reviewRound(directory, planOf(goodSteps()), SPEC, 1, {
      dispatch: dispatch as never,
    });
    expect(calls[0].role).toBe(ROLE_PLAN_REVIEW);
    expect(round["outcome"]).toBe(OUTCOME_APPROVED);
    expect(round["reviewer"]).toEqual({
      model: "m",
      provider: "p",
      role: ROLE_PLAN_REVIEW,
      transport: "api",
    });
  });

  it("takes one human verdict as the round's outcome", async () => {
    const directory = runDir();
    const { dispatch } = scripted(
      "STEP: build-the-widget\nVERDICT: approve\nSTEP: polish-it\nVERDICT: human\nWHY: judgement\n",
    );
    const round = await reviewRound(directory, planOf(goodSteps()), SPEC, 1, {
      dispatch: dispatch as never,
    });
    expect(round["outcome"]).toBe(OUTCOME_HUMAN);
  });

  it("refuses a review history with a hole in it", () => {
    const directory = runDir();
    writeFileSync(join(directory, "plan-review.jsonl"), "{not json}\n", "utf8");
    expect(() => readRounds(directory)).toThrow(/is not valid JSON/);
  });
});

describe("the review prompt", () => {
  it("shows only the amended step, so nothing else can be objected to", () => {
    const prompt = buildReviewPrompt(planOf(goodSteps()), sessionGoals(SPEC, 1), [
      "polish-it",
    ]);
    expect(prompt).toContain("STEP: polish-it");
    expect(prompt).not.toContain("STEP: build-the-widget");
    expect(prompt).toContain("This is an amendment");
  });

  it("carries every step and its derived flags on a full review", () => {
    const prompt = buildReviewPrompt(planOf(goodSteps()), sessionGoals(SPEC, 1));
    expect(prompt).toContain("STEP: build-the-widget");
    expect(prompt).toContain("STEP: polish-it");
    expect(prompt).toContain("derived risk flags: none");
  });
});

describe("reviewing an amendment", () => {
  function approver(): (prompt: string, options: { role: string }) => Promise<Record<string, unknown>> {
    return () =>
      Promise.resolve({
        content: "STEP: polish-it\nVERDICT: approve\n",
        model_name: "m",
        provider: "p",
        transport: "api",
      });
  }

  it("appends only when the scoped round approves", async () => {
    const directory = runDir();
    approvedPlanIn(directory);
    const [round, plan] = await reviewAmendment(directory, SPEC, 1, {
      stepId: "polish-it",
      reason: "it needs a helper",
      addedFiles: ["src/helper.py"],
      dispatch: approver() as never,
    });
    expect(round["outcome"]).toBe(OUTCOME_APPROVED);
    expect(round["reviewed_steps"]).toEqual(["polish-it"]);
    expect((plan?.["amendments"] as unknown[]).length).toBe(1);
  });

  it("leaves the approved plan untouched when the round does not approve", async () => {
    const directory = runDir();
    approvedPlanIn(directory);
    const refuse = () =>
      Promise.resolve({
        content: "STEP: polish-it\nVERDICT: amend\nFIELDS: intent\nWHY: no\n",
        model_name: "m",
        provider: "p",
        transport: "api",
      });
    const [round, plan] = await reviewAmendment(directory, SPEC, 1, {
      stepId: "polish-it",
      reason: "it needs a helper",
      addedFiles: ["src/helper.py"],
      dispatch: refuse as never,
    });
    expect(round["outcome"]).not.toBe(OUTCOME_APPROVED);
    expect(plan).toBeNull();
    expect(readPlan(directory)["amendments"]).toEqual([]);
  });

  it("refuses an amendment that carries no change", async () => {
    const directory = runDir();
    approvedPlanIn(directory);
    await expect(
      reviewAmendment(directory, SPEC, 1, { stepId: "polish-it", reason: "just because" }),
    ).rejects.toThrow(/must carry a change/);
  });
});

// --- The verifier's surface --------------------------------------------------

describe("the agency grant", () => {
  const scopes = [{ suite: "unit", roots: ["tests/"], glob: "test_*.py" }];

  it("grants the read tools only on the seat, and the write on either", () => {
    const seat = grantForTransport("copilot-cli", { scope: ["src/a.py"], allowWrite: true });
    expect(seat.mode).toBe(MODE_TOOLS);
    expect(seat.readBudget).toBe(DEFAULT_READ_BUDGET);

    const api = grantForTransport("api", { scope: ["src/a.py"], allowWrite: true });
    expect(api.mode).toBe(MODE_NONE);
    expect(api.scope).toEqual([]);
    expect(api.readBudget).toBe(0);
  });

  it("describes nothing it did not grant", () => {
    const readOnly = grantForTransport("copilot-cli", { scope: ["src/a.py"] });
    expect(briefing(readOnly)).toContain("no other tools and no way to change anything");
    expect(briefing(readOnly)).not.toContain("Your one write");

    const noTools = grantForTransport("api", { allowWrite: true, testScopes: scopes });
    expect(briefing(noTools)).toContain("You have no tools on this transport");
    expect(briefing(noTools)).toContain("Your one write");
  });

  it("shows an example path this repository's own declaration would accept", () => {
    const grant = grantForTransport("copilot-cli", {
      allowWrite: true,
      testScopes: scopes,
    });
    expect(briefing(grant)).toContain("path=tests/test_example.py");
  });

  it("lists the envelope rather than describing it", () => {
    const grant = grantForTransport("copilot-cli", {
      allowWrite: true,
      writeEnvelope: ["src/a.py", "src/b.py"],
      writeLabel: WRITE_LABEL_FIX,
    });
    const text = briefing(grant);
    expect(text).toContain("- `src/a.py`");
    expect(text).toContain("```fix-write path=src/a.py");
  });
});

describe("scope", () => {
  it("takes the changed files, what they import, and the spec directory", () => {
    const repo = makeTempDir();
    mkdirSync(join(repo, "pkg"), { recursive: true });
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    writeFileSync(join(repo, "pkg", "a.py"), "from . import b\nimport json\n", "utf8");
    writeFileSync(join(repo, "pkg", "b.py"), "x = 1\n", "utf8");

    const scope = sessionScope(repo, join(repo, "docs", "sessions"), ["pkg/a.py"]);
    expect(scope).toEqual(["docs/sessions", "pkg/a.py", "pkg/b.py"]);
  });

  it("declares only first-order imports, never the closure", () => {
    const repo = makeTempDir();
    mkdirSync(join(repo, "pkg"), { recursive: true });
    writeFileSync(join(repo, "pkg", "a.py"), "from . import b\n", "utf8");
    writeFileSync(join(repo, "pkg", "b.py"), "from . import c\n", "utf8");
    writeFileSync(join(repo, "pkg", "c.py"), "x = 1\n", "utf8");
    expect([...declaredDependencies(repo, ["pkg/a.py"])]).toEqual(["pkg/b.py"]);
  });

  it("adds no spec directory when the round is outside a session set", () => {
    const repo = makeTempDir();
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.py"), "x = 1\n", "utf8");
    expect(sessionScope(repo, null, ["src/a.py"])).toEqual(["src/a.py"]);
  });
});

describe("what the round did", () => {
  const grant = grantForTransport("copilot-cli", { scope: ["src"], readBudget: 1 });

  it("records an unconfined search as out of scope rather than inside it", () => {
    const record = recordForRound("/nowhere", grant, {
      tool_calls: [{ tool: "grep", arguments: { pattern: "api_key" } }],
    });
    expect(record.operations[0].inScope).toBe(false);
    expect(record.operations[0].detail).toContain("unconfined");
  });

  it("counts a read past the budget and one outside the scope", () => {
    const record = recordForRound("/nowhere", grant, {
      tool_calls: [
        { tool: "view", arguments: { path: "src/a.py" } },
        { tool: "view", arguments: { path: "elsewhere/b.py" } },
      ],
    });
    const row = recordRow(record);
    expect(row["reads"]).toBe(2);
    expect(row["over_budget"]).toBe(1);
    expect(row["out_of_scope"]).toBe(1);
  });

  it("says out loud that a round with no tools is not equivalent to one with them", () => {
    const record = recordForRound("/nowhere", grantForTransport("api"), {});
    expect(recordRow(record)["reason"]).toContain("could not look at the tree");
    expect(summaryLine(record)).toContain("could not look at the tree");
  });

  it("leaves a granted surface nobody used visible", () => {
    const record = recordForRound("/nowhere", grant, { tool_calls: [] });
    expect(summaryLine(record)).toContain("looked at nothing it was granted");
  });

  it("ignores a tool that is not part of the surface", () => {
    const record = recordForRound("/nowhere", grant, {
      tool_calls: [{ tool: "shell", arguments: { path: "src/a.py" } }],
    });
    expect(record.operations).toEqual([]);
  });
});

describe("read fidelity", () => {
  it("marks a shown line that is not the disk line it claims to be", () => {
    const repo = makeTempDir();
    writeFileSync(join(repo, "a.py"), 'key = f"Bearer {api_key}"\n', "utf8");
    const [verbatim] = readFidelity(repo, "a.py", {
      content: '1. key = f"Bearer {api_key}"',
    });
    expect(verbatim).toBe(FIDELITY_VERBATIM);

    const [transformed, detail] = readFidelity(repo, "a.py", {
      content: '1. key = f"******"',
    });
    expect(transformed).toBe(FIDELITY_TRANSFORMED);
    expect(detail).toContain("line 1 was shown as");
  });

  it("says unverified rather than clean when there is nothing to compare", () => {
    const repo = makeTempDir();
    expect(readFidelity(repo, "gone.py", { content: "1. x" })[0]).toBe(
      FIDELITY_UNVERIFIED,
    );
    writeFileSync(join(repo, "a.py"), "x = 1\n", "utf8");
    expect(readFidelity(repo, "a.py", { content: "no numbers here" })[0]).toBe(
      FIDELITY_UNVERIFIED,
    );
  });

  it("does not slander a ranged read for the lines it did not show", () => {
    const repo = makeTempDir();
    writeFileSync(join(repo, "a.py"), "one\ntwo\nthree\n", "utf8");
    expect(readFidelity(repo, "a.py", { content: "3. three" })[0]).toBe(
      FIDELITY_VERBATIM,
    );
  });
});

describe("the one write", () => {
  const scopes = [{ suite: "unit", roots: ["tests/"], glob: "test_*.py" }];

  function writingGrant(overrides: Record<string, unknown> = {}) {
    return grantForTransport("copilot-cli", {
      allowWrite: true,
      testScopes: scopes,
      ...overrides,
    });
  }

  it("writes the file the block describes and reports what it did", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      writingGrant(),
      "```test-write path=tests/test_new.py\nassert True\n```\n",
    );
    expect(writes[0].outcome).toBe(WRITE_ACCEPTED);
    expect(writes[0].action).toBe("created");
    expect(readFileSync(join(repo, "tests", "test_new.py"), "utf8")).toBe("assert True\n");
  });

  it("refuses a path outside the declared test locations before opening a file", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      writingGrant(),
      "```test-write path=src/widget.py\nx = 1\n```\n",
    );
    expect(writes[0].outcome).toBe(WRITE_REFUSED);
    expect(writes[0].reason).toContain("outside the declared test locations");
    expect(existsSync(join(repo, "src", "widget.py"))).toBe(false);
  });

  it("refuses a traversal out of the repository", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      writingGrant(),
      "```test-write path=../escape.py\nx = 1\n```\n",
    );
    expect(writes[0].reason).toContain("outside the repository");
  });

  it("refuses every write when the round granted none", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      grantForTransport("copilot-cli", { testScopes: scopes }),
      "```test-write path=tests/test_new.py\nassert True\n```\n",
    );
    expect(writes[0].reason).toContain("granted no write operation");
  });

  it("refuses an empty body, which is a deletion wearing a write's name", () => {
    const repo = makeTempDir();
    mkdirSync(join(repo, "tests"), { recursive: true });
    writeFileSync(join(repo, "tests", "test_old.py"), "assert True\n", "utf8");
    const writes = applyWrites(
      repo,
      writingGrant(),
      "```test-write path=tests/test_old.py\n\n```\n",
    );
    expect(writes[0].reason).toBe("the block carried no content");
    expect(readFileSync(join(repo, "tests", "test_old.py"), "utf8")).toBe("assert True\n");
  });

  it("confines an envelope round to the envelope and nothing beside it", () => {
    const repo = makeTempDir();
    const grant = writingGrant({
      writeEnvelope: ["src/widget.py"],
      writeLabel: WRITE_LABEL_FIX,
    });
    const inside = applyWrites(repo, grant, "```fix-write path=src/widget.py\nx = 1\n```\n");
    expect(inside[0].outcome).toBe(WRITE_ACCEPTED);
    const outside = applyWrites(repo, grant, "```fix-write path=tests/test_a.py\nx = 1\n```\n");
    expect(outside[0].reason).toContain("outside the envelope");
  });

  it("ignores a block under another round's label", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      writingGrant({ writeLabel: WRITE_LABEL_TEST }),
      "```fix-write path=tests/test_new.py\nassert True\n```\n",
    );
    expect(writes).toEqual([]);
  });

  it("reports a malformed block rather than dropping it", () => {
    const repo = makeTempDir();
    const noPath = applyWrites(repo, writingGrant(), "```test-write\nassert True\n```\n");
    expect(noPath[0].reason).toContain("named no path");

    const unclosed = applyWrites(
      repo,
      writingGrant(),
      "```test-write path=tests/test_a.py\nassert True\n",
    );
    expect(unclosed[0].reason).toContain("never closed");
  });

  it("lets a test file carry a fence of its own", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      writingGrant(),
      "````test-write path=tests/test_doc.py\nTEXT = '''\n```\n'''\n````\n",
    );
    expect(writes[0].outcome).toBe(WRITE_ACCEPTED);
    expect(readFileSync(join(repo, "tests", "test_doc.py"), "utf8")).toContain("```");
  });

  it("refuses when the repository declares no test root at all", () => {
    const repo = makeTempDir();
    const writes = applyWrites(
      repo,
      grantForTransport("copilot-cli", { allowWrite: true }),
      "```test-write path=tests/test_a.py\nassert True\n```\n",
    );
    expect(writes[0].reason).toContain("declares no test root");
  });
});

describe("the auto-verification prompt", () => {
  it("fills the configured template and falls back when there is none", () => {
    const filled = buildVerificationPrompt(
      "T:{original_task} K:{task_type} R:{original_response}",
      "the task",
      "code-review",
      "the answer",
    );
    expect(filled).toBe("T:the task K:code-review R:the answer");

    const fallback = buildVerificationPrompt("", "", "code-review", "the answer");
    expect(fallback).toContain("Start your response with VERIFIED or ISSUES FOUND");
    expect(fallback).toContain("(not provided)");
  });

  it("substitutes every occurrence and never expands the response's own text", () => {
    // Both halves are JavaScript's defaults and neither is Python's: a string
    // replacement takes the first occurrence only, and `$&` / `` $` `` in it
    // are expanded against the match. The text under review is substituted
    // verbatim, so a response discussing shell or regex syntax reaches both.
    const repeated = buildVerificationPrompt(
      "{task_type}/{task_type}",
      "",
      "code-review",
      "",
    );
    expect(repeated).toBe("code-review/code-review");

    const dollars = buildVerificationPrompt(
      "R:{original_response}",
      "",
      "t",
      "cost $& and $` and $1",
    );
    expect(dollars).toBe("R:cost $& and $` and $1");
  });
});

describe("the plan artifact, against the reference implementation", () => {
  // The parity control compares two routers at the command line, and
  // `approved_plan` declares none on either side -- so the control can compare
  // this artifact only as `progress` reads it, which proves the READER. This
  // is the other half: the TypeScript writer's bytes, against the bytes the
  // Python writer produces from the same input.
  // Anchored to this file, never to `process.cwd()`: vitest is invoked from
  // the repository root and from `packages/router`, and a cwd-relative path
  // silently SKIPS this check from one of them -- which is worse than failing.
  const repoRoot = join(import.meta.dirname, "..", "..", "..");
  //
  // The repository's own interpreter, and no fallback to one on PATH: this
  // check needs `ai_router` importable, not merely a Python. The vitest CI job
  // installs no Python at all -- deliberately, and for the same reason the
  // parity control is absent from it (see .github/workflows/test.yml) -- so
  // the guard is what lets this file run there rather than a gap in it. Where
  // Python IS present, which is every machine that can run a verification
  // round, the check runs and is required.
  const interpreter = join(
    repoRoot,
    ".venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );

  it.runIf(existsSync(interpreter))(
    "writes an approved plan Python accepts, byte for byte",
    () => {
      const steps = goodSteps().map((step) => ({ ...step, risk_flags: [] }));

      const ours = runDir();
      writePlan(ours, newPlan(7, "cross-check", steps));
      approvePlan(ours);

      const theirs = runDir();
      const result = spawnSync(
        interpreter,
        [
          "-c",
          [
            "import json, sys",
            "from ai_router.approved_plan import approve_plan, new_plan, write_plan",
            "write_plan(sys.argv[2], new_plan(7, 'cross-check', json.loads(sys.argv[1])))",
            "approve_plan(sys.argv[2])",
          ].join("\n"),
          JSON.stringify(steps),
          theirs,
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);

      // `approved_at` is the one field a clock writes; everything else --
      // including the bound `plan_hash`, which is a digest over the canonical
      // JSON both routers must produce identically -- is compared exactly.
      const stamp = /"approved_at": "[^"]+"/;
      const ourText = readFileSync(join(ours, "approved-plan.json"), "utf8");
      const theirText = readFileSync(join(theirs, "approved-plan.json"), "utf8");
      expect(ourText.replace(stamp, "<ts>")).toBe(theirText.replace(stamp, "<ts>"));

      // And the reference implementation's own integrity check accepts it,
      // which is the claim a byte comparison cannot make on its own.
      const read = spawnSync(
        interpreter,
        [
          "-c",
          "import sys\nfrom ai_router.approved_plan import read_plan\nprint(read_plan(sys.argv[1])['plan_hash'])",
          ours,
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
      expect(read.status, read.stderr).toBe(0);
      expect(read.stdout.trim()).toBe(readPlan(ours)["plan_hash"]);
    },
  );
});

// --- Helpers -----------------------------------------------------------------

function planOf(steps: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    schema_version: 1,
    session_number: 1,
    session_slug: "fixture",
    steps: steps.map((step) => ({
      risk_flags: deriveRiskFlags((step["file_envelope"] as string[]) ?? []),
      ...step,
    })),
    approved: false,
    amendments: [],
  };
}

/** The digest the module itself would record for one objected field. */
function digestOf(
  plan: Record<string, unknown>,
  stepId: string,
  field: string,
): Record<string, string> {
  return objectedFieldDigests(plan, [
    { stepId, verdict: "amend", objectedFields: [field], reason: "" },
  ])[stepId];
}

function commitAll(repo: string): void {
  const options = {
    cwd: repo,
    stdio: "ignore" as const,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  };
  execFileSync("git", ["add", "-A"], options);
  execFileSync("git", ["commit", "-q", "-m", "seed", "--no-gpg-sign"], options);
}
