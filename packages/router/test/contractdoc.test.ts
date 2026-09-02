// Contract rendering: the sections a reader needs, and the refusals.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ContractError, load, render } from "../src/contractdoc.ts";
import { parse as parseSolution } from "../src/solution.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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
      expect(out).toContain(heading);
    }
  });

  it("calls out what is not promised, separately from the table", () => {
    const out = render(CONTRACT);
    expect(out).toContain("Not promised");
    expect(out).toContain("concrete List implementation");
  });

  it("says an empty section is empty rather than rendering blank", () => {
    const thin = { component: "x", operations: [{ name: "go" }] };
    expect(render(thin)).toContain("*none stated*");
  });

  it("shows both dependency directions in the diagram", () => {
    const out = render(CONTRACT, SOLUTION);
    expect(out).toContain("```mermaid");
    expect(out).toContain("csv_parser --> csv_model");
    expect(out).toContain("csv_app");
  });

  it("names who breaks under used-by", () => {
    expect(render(CONTRACT, SOLUTION)).toContain("**Used by:** `csv-app`");
  });

  it("draws no diagram for a component outside the solution", () => {
    const out = render(
      { component: "stranger", operations: [{ name: "go" }] },
      SOLUTION,
    );
    expect(out).not.toContain("```mermaid");
  });

  it("says not to hand-edit it", () => {
    expect(render(CONTRACT)).toContain("Do not edit by hand");
  });
});

describe("refusals", () => {
  it("refuses a missing file", () => {
    expect(() => load(join(makeTempDir(), "nope.yaml"))).toThrow(/no contract/);
  });

  it("refuses a contract without operations", () => {
    const path = join(makeTempDir(), "c.yaml");
    writeFileSync(path, "component: x\n", "utf8");
    expect(() => load(path)).toThrow(/operations/);
  });

  it("refuses an operation without a name", () => {
    const path = join(makeTempDir(), "c.yaml");
    writeFileSync(path, "component: x\noperations:\n  - signature: foo()\n", "utf8");
    expect(() => load(path)).toThrow(ContractError);
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
    expect(md).toContain("**not proved**");
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
    expect(md).toContain("`test_rejects_negative_a`");
    expect(md).not.toContain("**not proved**");
  });

  it("has nothing to prove for an empty section", () => {
    const md = render({ component: "x", operations: [{ name: "f" }] });
    expect(md).toContain("*nothing to prove*");
    expect(md).not.toContain("**not proved**");
  });
});
