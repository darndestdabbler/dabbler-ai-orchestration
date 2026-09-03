// Contract rendering: the sections a reader needs, and the refusals.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ContractError, load, render } from "../src/contractdoc.ts";
import { parse as parseSolution } from "../src/solution.ts";
import { tempDir } from "./support/answers.ts";

const CONTRACT: Record<string, unknown> = {
  component: "csv-parser",
  version: "1.0.0",
  summary: "Reads a simple CSV file.",
  operations: [
    {
      name: "parse",
      signature: "List<CsvRecord> parse(Path file)",
      preconditions: ["The file exists and is readable."],
      postconditions: ["One record per data row, in file order."],
      retained: ["A trailing empty field stays an empty string, not null."],
      sideEffects: ["None. The file is not modified."],
      errors: ["A header-only file returns an empty list."],
      notPromised: ["The concrete List implementation."],
    },
  ],
};

const SOLUTION = parseSolution({
  solution: { name: "csv-demo", title: "CSV" },
  components: [
    { name: "csv-model" },
    { name: "csv-parser", dependsOn: ["csv-model"] },
    { name: "csv-app", kind: "integration", dependsOn: ["csv-parser"] },
  ],
});

describe("rendering", () => {
  it("carries every section a reader needs", () => {
    const out = render(CONTRACT);
    for (const heading of [
      "Must be true going in",
      "Guaranteed coming out",
      "Kept on purpose",
      "Side effects",
      "How it fails",
    ]) {
      assert.ok(out.includes(heading), heading);
    }
  });

  it("calls out what is not promised, separately from the table", () => {
    const out = render(CONTRACT);
    assert.ok((out).includes("Not promised"));
    assert.ok((out).includes("concrete List implementation"));
  });

  it("says an empty section is empty rather than rendering blank", () => {
    const thin = { component: "x", operations: [{ name: "go" }] };
    assert.ok((render(thin)).includes("*none stated*"));
  });

  it("shows both dependency directions in the diagram", () => {
    const out = render(CONTRACT, SOLUTION);
    assert.ok((out).includes("```mermaid"));
    assert.ok((out).includes("csv_parser --> csv_model"));
    assert.ok((out).includes("csv_app"));
  });

  it("names who breaks under used-by", () => {
    assert.ok(render(CONTRACT, SOLUTION).includes("**Used by:** `csv-app`"));
  });

  it("draws no diagram for a component outside the solution", () => {
    const out = render(
      { component: "stranger", operations: [{ name: "go" }] },
      SOLUTION,
    );
    assert.ok(!out.includes("```mermaid"));
  });

  it("says not to hand-edit it", () => {
    assert.ok(render(CONTRACT).includes("Do not edit by hand"));
  });
});

describe("refusals", () => {
  it("refuses a missing file", () => {
    assert.throws(() => load(join(tempDir("contract-"), "nope.yaml")), /no contract/);
  });

  it("refuses a contract without operations", () => {
    const path = join(tempDir("contract-"), "c.yaml");
    writeFileSync(path, "component: x\n", "utf8");
    assert.throws(() => load(path), /operations/);
  });

  it("refuses an operation without a name", () => {
    const path = join(tempDir("contract-"), "c.yaml");
    writeFileSync(path, "component: x\noperations:\n  - signature: foo()\n", "utf8");
    assert.throws(() => load(path), ContractError);
  });
});

// The column said every clause was tested, on every contract, always. A
// contract people trust is worse than one they check.
describe("what proves a clause", () => {
  it("says so when a clause has no test", () => {
    const md = render({
      component: "x",
      operations: [{ name: "f", preconditions: ["a is positive"] }],
    });
    assert.ok(md.includes("**not proved**"));
  });

  it("names the test that proves a clause", () => {
    const md = render({
      component: "x",
      operations: [
        {
          name: "f",
          preconditions: ["a is positive"],
          tests: { preconditions: ["test_rejects_negative_a"] },
        },
      ],
    });
    assert.ok(md.includes("`test_rejects_negative_a`"));
    assert.ok(!md.includes("**not proved**"));
  });

  it("has nothing to prove for an empty section", () => {
    const md = render({ component: "x", operations: [{ name: "f" }] });
    assert.ok(md.includes("*nothing to prove*"));
    assert.ok(!md.includes("**not proved**"));
  });
});
