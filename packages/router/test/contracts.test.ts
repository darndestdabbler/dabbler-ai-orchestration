import { describe, expect, it } from "vitest";

import { outcomeForExitCode } from "../src/contracts/router.ts";
import { VERBS, findVerb } from "../src/contracts/verbs.ts";
import { isImplemented } from "../src/cli/registry.ts";

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
    const spec = findVerb("verify");
    expect(spec?.pythonModule).toBe("ai_router.verify");
    expect(isImplemented("verify")).toBe(false);
    expect(findVerb("runcli")).toBeUndefined();
    expect(new Set(VERBS.map((entry) => entry.verb)).size).toBe(VERBS.length);
  });
});
