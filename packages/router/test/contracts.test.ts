import { describe, expect, it } from "vitest";

import { outcomeForExitCode } from "../src/contracts/router.ts";
import { VERBS, findVerb } from "../src/contracts/verbs.ts";
import { HANDLERS } from "../src/cli/registry.ts";

describe("the exit-code contract", () => {
  it("tells a refusal from a failed write from an unclassified failure", () => {
    expect(outcomeForExitCode(0)).toBe("ok");
    expect(outcomeForExitCode(3)).toBe("refused");
    expect(outcomeForExitCode(4)).toBe("writeFailed");
    // A usage error is a caller's bug, not a refusal.
    expect(outcomeForExitCode(2)).toBe("failed");
    // A process that was killed or never ran did not consent to anything.
    expect(outcomeForExitCode(null)).toBe("failed");
  });
});

describe("the verb table", () => {
  it("offers exactly the verbs the command can run, in both directions", () => {
    // The table is what the usage text lists and what the dispatcher looks
    // in; the registry is what answers. A verb in one and not the other is
    // either a promise the command breaks or a command nobody can find.
    // Announcing a verb before it worked was the port's shape and the port
    // is over: every verb here runs.
    expect(new Set(VERBS.map((entry) => entry.verb)).size).toBe(VERBS.length);
    for (const spec of VERBS) {
      expect(HANDLERS[spec.verb], `${spec.verb} is offered but not registered`)
        .toBeTypeOf("function");
    }
    for (const verb of Object.keys(HANDLERS)) {
      expect(findVerb(verb), `${verb} is registered but not offered`).toBeDefined();
    }
    // The retired run core is not a verb, and neither is the interpreter
    // that used to run all of them.
    expect(findVerb("runcli")).toBeUndefined();
    expect(findVerb("python")).toBeUndefined();
  });
});
