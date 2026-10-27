// What a repository's setup sessions are told, by whether code is already
// there: a blank repository plans a skeleton, and one that holds a solution
// plans to read it and fit the framework to it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DECOMPOSITION_PROMPT, PLAN_PROMPT, bootstrapPlan } from "../src/bootstrap/templates.ts";

describe("bootstrapPlan", () => {
  it("over an existing solution, asks for the survey and alignment and adopts rather than re-creates", () => {
    const text = bootstrapPlan(["Acme.sln", "Acme.Api.csproj"]);
    const [first, second] = text.split("### Session 2:") as [string, string];
    assert.match(first, /`Acme\.sln`, `Acme\.Api\.csproj`/);
    assert.match(first, /Read its structure before\s+planning/);
    assert.match(first, /module-per-folder\s+layout/);
    assert.match(first, /first sessions as alignment/);
    assert.match(first, /before any feature work/);
    assert.match(first, /first numbered session adopts the solution/);
    assert.match(second, /adopts the solution already there/);
    assert.match(second, /No session re-creates a\s+project that exists/);
    assert.doesNotMatch(text, /the skeleton/);
  });

  it("over a blank repository, plans the skeleton and surveys nothing", () => {
    const text = bootstrapPlan([]);
    assert.match(text, /The first numbered session is the skeleton/);
    assert.match(text, /The first numbered session, the skeleton, writes\s+the projects/);
    assert.doesNotMatch(text, /already holds a solution|alignment|adopts/);
  });

  it("marks verification, the run of record and the close as the framework's, not as items to plan", () => {
    // Numbered beside the author's items, a planner made them steps with
    // `dabbler noop` checks.
    const text = bootstrapPlan([]);
    assert.doesNotMatch(text, /^\d+\. (Cross-provider verification|Full test suite|Close-out)/m);
    for (const session of text.split("### Session 2:")) {
      assert.match(session, /The framework then verifies the work cross-provider, runs the suites as\s+the run of record and closes the session\. These are the framework's,\s+not steps to plan\./);
    }
  });
});

describe("PLAN_PROMPT", () => {
  it("keeps the skeleton for a blank repository and has an existing solution read and adopted", () => {
    assert.match(PLAN_PROMPT, /no solution or build yet, the first\s+numbered session, the skeleton/);
    assert.match(PLAN_PROMPT, /read its structure\s+before planning/);
    assert.match(PLAN_PROMPT, /first sessions as alignment/);
    assert.match(PLAN_PROMPT, /first numbered session adopts\s+that solution/);
  });
});

describe("DECOMPOSITION_PROMPT", () => {
  it("writes the skeleton only where no solution exists, and otherwise adopts it", () => {
    assert.match(DECOMPOSITION_PROMPT, /skeleton is for a\s+repository with no solution or build yet/);
    assert.match(DECOMPOSITION_PROMPT, /first numbered session adopts it instead/);
    assert.match(DECOMPOSITION_PROMPT, /no session re-creates a project that exists/);
  });
});
