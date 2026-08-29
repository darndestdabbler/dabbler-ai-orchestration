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
    // No verb is named here. Naming one made this a countdown -- `verify` was
    // the example until session 33 and `workflow` until session 35 -- so the
    // announce-then-implement rule is asserted over whichever verbs are
    // currently declared without a handler, and every one of them has to
    // carry the session that lands it.
    for (const spec of VERBS.filter((entry) => !isImplemented(entry.verb))) {
      expect(spec.portedInSession, `${spec.verb} names no session`).toBeGreaterThan(0);
      expect(spec.pythonModule, `${spec.verb} names no module`).toBeTruthy();
    }
    // The retired run core is not a verb on either side.
    expect(findVerb("runcli")).toBeUndefined();
    expect(new Set(VERBS.map((entry) => entry.verb)).size).toBe(VERBS.length);
    // The table is the superset: a handler with no declaration would be a
    // verb the parity control cannot see and the usage text cannot list.
    for (const verb of Object.keys(HANDLERS)) {
      expect(findVerb(verb), `${verb} is registered but not declared`).toBeDefined();
    }
  });
});
