import * as assert from "assert";
import {
  DEDICATED_CONSEQUENCE_COPY,
  OUT_OF_BAND_CONSEQUENCE_COPY,
  buildConfirmationItems,
  buildModePickItems,
} from "../../commands/setupVerification";

// Set 062 Session 2 (spec D3): the confirmation flow's decision
// surfaces are pure builders so they can be pinned without a VS Code
// host (the same split switchTier uses: the handler is thin glue, the
// pickable content is data). The host-side wiring (re-checks, the
// durable-record refusal, the rewrite + refresh) composes pieces that
// are each unit-tested: verificationModeRecordExists and
// rewriteSpecVerificationMode in verificationModeRewrite.test.ts, the
// ActionRegistry gate in actionRegistry.test.ts.

suite("setupVerification — mode QuickPick items (D3)", () => {
  test("offers exactly the two modes, dedicated first (the action's namesake)", () => {
    const items = buildModePickItems("out-of-band-or-none");
    assert.deepStrictEqual(
      items.map((i) => i.value),
      ["dedicated-sessions", "out-of-band-or-none"],
    );
  });

  test("annotates the current mode so the picker reads as a state view", () => {
    const fromA = buildModePickItems("out-of-band-or-none");
    assert.ok(
      fromA.find((i) => i.value === "out-of-band-or-none")!.description.endsWith("— current"),
      "current mode must be annotated",
    );
    assert.ok(
      !fromA.find((i) => i.value === "dedicated-sessions")!.description.includes("current"),
      "non-current mode must not claim to be current",
    );
    const fromB = buildModePickItems("dedicated-sessions");
    assert.ok(
      fromB.find((i) => i.value === "dedicated-sessions")!.description.endsWith("— current"),
    );
  });

  test("the dedicated-sessions item carries the one-way consequence copy naming the N/M+ growth", () => {
    const item = buildModePickItems("out-of-band-or-none")
      .find((i) => i.value === "dedicated-sessions")!;
    assert.strictEqual(item.detail, DEDICATED_CONSEQUENCE_COPY);
    assert.ok(/one-way/i.test(item.detail), "copy must say the transition is one-way");
    assert.ok(item.detail.includes("N/M+"), "copy must name the N/M+ growth (spec D3)");
  });

  test("the out-of-band item explains the default posture without 'unverified' language", () => {
    const item = buildModePickItems("dedicated-sessions")
      .find((i) => i.value === "out-of-band-or-none")!;
    assert.strictEqual(item.detail, OUT_OF_BAND_CONSEQUENCE_COPY);
    assert.ok(item.detail.includes("external-verification.md"));
    assert.ok(
      !/unverified/i.test(item.detail),
      "Mode A is a posture, not a deficiency — copy never says 'unverified' (spec D1)",
    );
  });
});

suite("setupVerification — confirmation step (D3)", () => {
  test("A->B confirmation names the target and carries the one-way consequence copy", () => {
    const items = buildConfirmationItems("dedicated-sessions");
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].label, "Switch to dedicated-sessions");
    assert.strictEqual(items[0].confirmed, true);
    assert.strictEqual(items[0].detail, DEDICATED_CONSEQUENCE_COPY);
  });

  test("B->A confirmation carries the out-of-band copy instead", () => {
    const items = buildConfirmationItems("out-of-band-or-none");
    assert.strictEqual(items[0].label, "Switch to out-of-band-or-none");
    assert.strictEqual(items[0].detail, OUT_OF_BAND_CONSEQUENCE_COPY);
  });

  test("Cancel is always offered and is the only non-confirming item", () => {
    for (const target of ["dedicated-sessions", "out-of-band-or-none"] as const) {
      const items = buildConfirmationItems(target);
      const cancels = items.filter((i) => !i.confirmed);
      assert.strictEqual(cancels.length, 1);
      assert.strictEqual(cancels[0].label, "Cancel");
    }
  });
});
