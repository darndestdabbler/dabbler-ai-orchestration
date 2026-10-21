// Verification support -- the approved plan the verifier's surface is bound
// to: its hash and write ledger, its derived risk, and its envelope. Plans
// live in a temp directory; the envelope against a real change set is a
// milestone of walk-verify.test.ts.
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
import { gitAnswers, tempDir } from "./support/answers.ts";

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
