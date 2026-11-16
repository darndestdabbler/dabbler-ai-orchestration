// `approvedPlan` -- what the plan the person approved lets a session change.
//
// The one behavior here is the human way out of the build contract: a
// target change named in the session's section of the session plan, as
// committed at HEAD, releases that file and no other.
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  approvePlan,
  approvedContractChange,
  computePlanHash,
  contractChangeOf,
  newPlan,
  sessionStartCommit,
  writePlan,
} from "../src/approvedPlan.ts";
import { sessionRunDir } from "../src/ledger.ts";
import { STATUS_FAIL, contractFact } from "../src/facts.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

const PLAN = [
  "### Session 4 of 5: Move the web service to 4.8",
  "",
  "**What.** The shop moves Web to 4.8.",
  "",
  "**Contract change.** `Web/Web.csproj` -- the shop moves this service",
  "from 4.5.1 to 4.8.",
  "",
  "### Session 5 of 5: Something else",
  "",
  "**Contract change.** `Api/Api.csproj` -- not this session's.",
  "",
].join("\n");

const CLASSIC = (version: string): string =>
  `<Project ToolsVersion="15.0"><PropertyGroup><TargetFrameworkVersion>${version}</TargetFrameworkVersion></PropertyGroup></Project>`;

describe("an approved contract change", () => {
  it("makes the file the plan names not_applicable and leaves the others held", () => {
    const repo = tempDir();
    const head: Record<string, string> = {
      "docs/sessions/session-plan.md": PLAN,
      "Web/Web.csproj": CLASSIC("v4.5.1"),
      "Api/Api.csproj": CLASSIC("v4.5.1"),
    };
    const tree = { "Web/Web.csproj": CLASSIC("v4.8"), "Api/Api.csproj": CLASSIC("v4.8") };
    seed(repo, tree);
    const restore = gitAnswers([
      [["ls-tree"], { stdout: Object.keys(head).join("\0") }],
      [["ls-files"], { stdout: Object.keys(tree).join("\0") }],
      [(args) => args[0] === "show", (args) => ({ stdout: head[(args[1] ?? "").slice("HEAD:".length)] ?? "" })],
    ]);
    try {
      const approved = approvedContractChange(repo, join(repo, "docs", "sessions"), 4);
      assert.deepEqual(approved?.files, ["Web/Web.csproj"]);
      const fact = contractFact(repo, "maintenance", approved);
      assert.equal(fact.status, STATUS_FAIL);
      assert.match(fact.detail, /Web\/Web\.csproj: not_applicable -- the approved plan changes its contract: the shop moves this service from 4\.5\.1 to 4\.8\./);
      assert.match(fact.detail, /Api\/Api\.csproj: TargetFrameworkVersion at HEAD v4\.5\.1, in the tree v4\.8/);
      assert.doesNotMatch(fact.detail, /Web\/Web\.csproj: TargetFrameworkVersion/);
    } finally {
      restore();
    }
  });

  it("approves nothing when the paragraph names a file and gives no reason, wherever a reason stands", () => {
    assert.equal(contractChangeOf("### Session 4 of 5: X\n\n**Contract change.** `Web/Web.csproj`\n"), null);
    assert.equal(contractChangeOf("**Contract change.** `Web/Web.csproj` --\n\n**Tests.** x"), null);
    assert.deepEqual(contractChangeOf("**Contract change.** Upgrade because vendor support ended: `Web/Web.csproj`"), {
      files: ["Web/Web.csproj"],
      reason: "Upgrade because vendor support ended",
    });
  });

  it("is the committed approval whatever an approved plan records, and a plan the engine writes or deletes changes nothing", () => {
    const steps = [
      { step_id: "move", intent: "Move Web to 4.8", file_envelope: ["Web/Web.csproj"], evidence_contract: [{ kind: "deterministic", description: "builds" }] },
    ];
    const withPlan = (sessionPlan: string): string => {
      const repo = tempDir();
      const runDir = sessionRunDir(repo, 4);
      mkdirSync(runDir, { recursive: true });
      writePlan(runDir, { ...newPlan(4, "fixture", steps), contract_change: { files: ["Web/Web.csproj"], reason: "Web moves to 4.8" } });
      const approved = approvePlan(runDir);
      assert.equal(approved["plan_hash"], computePlanHash(approved));
      seed(repo, { "Web/Web.csproj": CLASSIC("v4.8"), "Api/Api.csproj": CLASSIC("v4.8") });
      head = { "docs/sessions/session-plan.md": sessionPlan, "Web/Web.csproj": CLASSIC("v4.5.1"), "Api/Api.csproj": CLASSIC("v4.5.1") };
      return repo;
    };
    let head: Record<string, string> = {};
    const restore = gitAnswers([
      [["ls-tree"], () => ({ stdout: Object.keys(head).join("\0") })],
      [["ls-files"], { stdout: "Web/Web.csproj\0Api/Api.csproj" }],
      [(args) => args[0] === "show", (args) => ({ stdout: head[(args[1] ?? "").slice("HEAD:".length)] ?? "" })],
    ]);
    try {
      // Committed for Web, recorded for Web: Web is released, Api is held.
      const recorded = withPlan(PLAN);
      const approved = approvedContractChange(recorded, join(recorded, "docs", "sessions"), 4);
      assert.deepEqual(approved?.files, ["Web/Web.csproj"]);
      const fact = contractFact(recorded, "maintenance", approved);
      assert.equal(fact.status, STATUS_FAIL);
      assert.match(fact.detail, /Web\/Web\.csproj: not_applicable -- the approved plan changes its contract/);
      assert.match(fact.detail, /Api\/Api\.csproj: TargetFrameworkVersion at HEAD v4\.5\.1, in the tree v4\.8/);
      // The record deleted: the same approval, because the record never granted it.
      rmSync(sessionRunDir(recorded, 4), { recursive: true, force: true });
      assert.deepEqual(approvedContractChange(recorded, join(recorded, "docs", "sessions"), 4), approved);
      // Recorded with nothing committed -- a plan the engine wrote itself: nothing.
      const forged = withPlan("### Session 4 of 5: Move the web service\n\n**What.** Nothing approved.\n");
      assert.equal(approvedContractChange(forged, join(forged, "docs", "sessions"), 4), null);
    } finally {
      restore();
    }
  });

  it("is read at the commit the session started on, so a paragraph committed during the session approves nothing", () => {
    const repo = tempDir();
    const sessionsDir = join(repo, "docs", "sessions");
    seed(repo, {
      "docs/sessions/sessions.json": JSON.stringify({ sessions: [{ number: 4, startCommit: "a1b2c3d4e5f6a7b8" }] }),
    });
    const before = "### Session 4 of 5: Move the web service\n\n**What.** Nothing approved.\n";
    const at: Record<string, string> = {
      "a1b2c3d4e5f6a7b8:docs/sessions/session-plan.md": before,
      "HEAD:docs/sessions/session-plan.md": PLAN,
    };
    const restore = gitAnswers([[(args) => args[0] === "show", (args) => ({ stdout: at[args[1] ?? ""] ?? "" })]]);
    try {
      assert.equal(sessionStartCommit(sessionsDir, 4), "a1b2c3d4e5f6a7b8");
      assert.equal(approvedContractChange(repo, sessionsDir, 4), null);
      at["a1b2c3d4e5f6a7b8:docs/sessions/session-plan.md"] = PLAN;
      assert.deepEqual(approvedContractChange(repo, sessionsDir, 4)?.files, ["Web/Web.csproj"]);
    } finally {
      restore();
    }
  });

  it("refuses an approved plan whose contract_change reason is only whitespace", () => {
    const runDir = sessionRunDir(tempDir(), 4);
    mkdirSync(runDir, { recursive: true });
    const plan = newPlan(4, "fixture", [
      { step_id: "move", intent: "Move", file_envelope: ["Web/Web.csproj"], evidence_contract: [{ kind: "deterministic", description: "builds" }] },
    ]);
    assert.throws(() => writePlan(runDir, { ...plan, contract_change: { files: ["Web/Web.csproj"], reason: "   " } }), /contract_change/);
  });
});
