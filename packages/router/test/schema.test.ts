import { describe, expect, it } from "vitest";

import {
  SchemaTranslationError,
  generateModule,
  type SchemaSource,
} from "../src/schema/generate.ts";
import { staleFiles } from "../src/schema/emit.ts";

function moduleFor(schema: Record<string, unknown>): string {
  return generateModule({ fileName: "demo.schema.json", schema } as SchemaSource);
}

describe("the schema-to-type generator", () => {
  it("names a $defs entry after its root and ignores an allOf that only refines", () => {
    const out = moduleFor({
      type: "object",
      required: ["row"],
      properties: { row: { $ref: "#/$defs/row" } },
      allOf: [{ if: { properties: { row: {} } }, then: { required: ["row"] } }],
      $defs: {
        row: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "integer" } },
        },
      },
    });

    expect(out).toContain("export type DemoRow = {");
    expect(out).toContain("row: DemoRow;");
    // The `if`/`then` member carries no shape, so it adds no intersection.
    expect(out).not.toContain("&");
  });

  it("renders a nullable type and an enum as unions of what they admit", () => {
    const out = moduleFor({
      type: "object",
      properties: {
        cost: { type: ["number", "null"] },
        verdict: { type: "string", enum: ["VERIFIED", "ISSUES_FOUND"] },
        kind: { const: "adjudication" },
      },
    });

    expect(out).toContain("cost?: number | null;");
    expect(out).toContain('verdict?: "VERIFIED" | "ISSUES_FOUND";');
    expect(out).toContain('kind?: "adjudication";');
  });

  it("renders an object that declares no property as the map it is", () => {
    const out = moduleFor({
      type: "object",
      properties: {
        providers: { type: "object", additionalProperties: { type: "string" } },
      },
    });

    expect(out).toContain("providers?: Record<string, string>;");
  });

  it("refuses a $ref that points outside this schema rather than widening it", () => {
    expect(() =>
      moduleFor({ type: "object", properties: { row: { $ref: "other.json#/row" } } }),
    ).toThrow(SchemaTranslationError);
  });
});

describe("the staleness control", () => {
  it("names a changed file, a missing one, and one the generator no longer writes", () => {
    const expected = new Map([
      ["a.ts", "one"],
      ["b.ts", "two"],
    ]);
    const actual = new Map([
      ["a.ts", "one"],
      ["b.ts", "CHANGED"],
      ["gone.ts", "three"],
    ]);

    expect(staleFiles(expected, actual)).toEqual([
      { name: "b.ts", state: "changed" },
      { name: "gone.ts", state: "unexpected" },
    ]);
    expect(staleFiles(new Map([["c.ts", "x"]]), new Map())).toEqual([
      { name: "c.ts", state: "missing" },
    ]);
  });
});
