import { describe, expect, it } from "vitest";

import { outcomeForExitCode } from "../src/contracts/router.ts";
import { VERBS, findVerb } from "../src/contracts/verbs.ts";
import { HANDLERS, isImplemented } from "../src/cli/registry.ts";

describe("the exit-code contract", () => {
  it("tells a refusal from a failed write from an unclassified failure", () => {
    expect(outcomeForExitCode(0)).toBe("ok");
    expect(outcomeForExitCode(3)).toBe("refused");
    expect(outcomeForExitCode(4)).toBe("writeFailed");
    // argparse's usage code is a caller's bug, not a refusal.
    expect(outcomeForExitCode(2)).toBe("failed");
    // A process that was killed or never ran did not consent to anything.
    expect(outcomeForExitCode(null)).toBe("failed");
  });
});

describe("the verb table", () => {
  it("declares every verb before it works, so the CLI can refuse it by name", () => {
    // `workflow` is the example rather than a ported verb: it is declared,
    // it is not registered, and the CLI therefore refuses it by name and
    // says which session lands it. Naming a verb that later gets ported
    // makes this test a countdown -- `verify` was the example until session
    // 33 -- so the invariant is asserted alongside it.
    const spec = findVerb("workflow");
    expect(spec?.pythonModule).toBe("ai_router.workflow");
    expect(isImplemented("workflow")).toBe(false);
    expect(findVerb("runcli")).toBeUndefined();
    expect(new Set(VERBS.map((entry) => entry.verb)).size).toBe(VERBS.length);
    // The table is the superset: a handler with no declaration would be a
    // verb the parity control cannot see and the usage text cannot list.
    for (const verb of Object.keys(HANDLERS)) {
      expect(findVerb(verb), `${verb} is registered but not declared`).toBeDefined();
    }
  });
});
