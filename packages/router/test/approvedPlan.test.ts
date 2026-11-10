// `approvedPlan` -- what the plan the person approved lets a session change.
//
// The one behavior here is the human way out of the build contract: a
// target change named in the session's section of the session plan, as
// committed at HEAD, releases that file and no other.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { approvedContractChange } from "../src/approvedPlan.ts";
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
});
