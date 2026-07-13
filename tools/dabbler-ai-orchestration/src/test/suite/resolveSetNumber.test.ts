// Set 050 S4 (Feature 2) — unit tests for the pure number->slug
// resolver that backs the extension's quick-input command. Mirrors the
// Python resolver's match / collision / no-match contract (verdict Q8).

import * as assert from "assert";
import {
  nextSessionSetNumberFrom,
  numericPrefix,
  parseSetHandle,
  resolveSetNumber,
} from "../../utils/resolveSetNumber";

suite("resolveSetNumber (Set 050 S4)", () => {
  test("numericPrefix parses leading NNN- and ignores unnumbered", () => {
    assert.strictEqual(numericPrefix("050-schema-drift"), 50);
    assert.strictEqual(numericPrefix("007-foo"), 7);
    assert.strictEqual(numericPrefix("harvester-cli"), null);
    assert.strictEqual(numericPrefix("050"), null); // no trailing hyphen
  });

  test("exact match (leading zeros normalized)", () => {
    const slugs = ["047-foo", "050-schema-drift", "bare-name"];
    assert.deepStrictEqual(resolveSetNumber(slugs, 50), {
      kind: "match",
      slug: "050-schema-drift",
    });
    assert.deepStrictEqual(resolveSetNumber(slugs, 47), {
      kind: "match",
      slug: "047-foo",
    });
  });

  test("no-match lists available numbers, no fuzzy nearest", () => {
    const r = resolveSetNumber(["047-a", "050-b", "bare"], 99);
    assert.strictEqual(r.kind, "no-match");
    if (r.kind === "no-match") {
      assert.deepStrictEqual(r.available, [47, 50]);
    }
  });

  test("no-match on a repo with no numbered sets reports empty", () => {
    const r = resolveSetNumber(["bare-one", "bare-two"], 1);
    assert.strictEqual(r.kind, "no-match");
    if (r.kind === "no-match") assert.deepStrictEqual(r.available, []);
  });

  test("collision names both offending slugs (sorted)", () => {
    const r = resolveSetNumber(["050-zeta", "050-alpha"], 50);
    assert.strictEqual(r.kind, "collision");
    if (r.kind === "collision") {
      assert.deepStrictEqual(r.matches, ["050-alpha", "050-zeta"]);
    }
  });

  test("parseSetHandle tolerates whitespace / 'Set ' / leading zeros", () => {
    assert.strictEqual(parseSetHandle("50"), 50);
    assert.strictEqual(parseSetHandle("050"), 50);
    assert.strictEqual(parseSetHandle(" 50 "), 50);
    assert.strictEqual(parseSetHandle("Set 50"), 50);
    assert.strictEqual(parseSetHandle("set 050"), 50);
    assert.strictEqual(parseSetHandle("050-schema-drift"), null);
    assert.strictEqual(parseSetHandle("abc"), null);
    assert.strictEqual(parseSetHandle(""), null);
  });

  // Set 098 S2: pure mirror of ai_router.resolve_set.next_session_set_number,
  // feeding scaffoldModuleLifecycleSets's number resolution.
  test("nextSessionSetNumberFrom: empty repo starts at 001", () => {
    assert.deepStrictEqual(nextSessionSetNumberFrom([]), { n: 1, padded: "001" });
  });

  test("nextSessionSetNumberFrom: max(existing) + 1, unnumbered dirs ignored", () => {
    assert.deepStrictEqual(
      nextSessionSetNumberFrom(["047-foo", "050-schema-drift", "bare-name"]),
      { n: 51, padded: "051" },
    );
  });

  test("nextSessionSetNumberFrom: width tracks the widest existing prefix", () => {
    assert.deepStrictEqual(nextSessionSetNumberFrom(["0998-foo", "0999-bar"]), {
      n: 1000,
      padded: "1000",
    });
    // A 3-digit repo stays at width 3 even near the boundary.
    assert.deepStrictEqual(nextSessionSetNumberFrom(["097-foo", "098-bar"]), {
      n: 99,
      padded: "099",
    });
  });
});
