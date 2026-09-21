// The contract layer: the schemas that describe the router's answers, the
// types generated from them, the control that keeps the two in step, and the
// two vocabularies a caller reads a run through -- exit codes and verbs.
//
// All of it is a decision over literal inputs. The generator is handed a
// schema object, the staleness control two maps of file text, and the verb
// table its own registry.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HANDLERS } from "../src/cli/registry.ts";
import { outcomeForExitCode } from "../src/contracts/router.ts";
import { VERBS, findVerb } from "../src/contracts/verbs.ts";
import { staleFiles } from "../src/schema/emit.ts";
import {
  SchemaTranslationError,
  generateModule,
  type SchemaSource,
} from "../src/schema/generate.ts";
import { allSchemaFailures, schemaFailure } from "../src/schema/validate.ts";

function moduleFor(schema: Record<string, unknown>): string {
  return generateModule({ fileName: "demo.schema.json", schema } as SchemaSource);
}

describe("validating against a schema", () => {
  const SCHEMA = {
    type: "object",
    required: ["id"],
    properties: { id: { type: "integer" }, name: { type: "string" } },
    additionalProperties: false,
  };

  it("says nothing about data the schema admits", () => {
    assert.equal(schemaFailure({ id: 1, name: "x" }, SCHEMA, "demo"), null);
  });

  it("names the subject and where the failure is", () => {
    // A refusal that does not say which file and which key sends the reader
    // back to the schema to guess.
    const failure = schemaFailure({ id: "one" }, SCHEMA, "demo.yaml");
    assert.match(String(failure), /demo\.yaml/);
    assert.match(String(failure), /id/);
  });

  it("reports every failure, not only the first", () => {
    const failures = allSchemaFailures({ id: "one", extra: true }, SCHEMA);
    assert.ok(failures.length >= 2);
  });
});

describe("the schema-to-type generator", () => {
  it("names a $defs entry after its root and ignores an allOf that only refines", () => {
    const out = moduleFor({
      type: "object",
      required: ["row"],
      properties: { row: { $ref: "#/$defs/row" } },
      allOf: [{ if: { properties: { row: {} } }, then: { required: ["row"] } }],
      $defs: {
        row: { type: "object", required: ["id"], properties: { id: { type: "integer" } } },
      },
    });

    assert.match(out, /export type DemoRow = \{/);
    assert.match(out, /row: DemoRow;/);
    // The `if`/`then` member carries no shape, so it adds no intersection.
    assert.doesNotMatch(out, /&/);
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

    assert.match(out, /cost\?: number \| null;/);
    assert.match(out, /verdict\?: "VERIFIED" \| "ISSUES_FOUND";/);
    assert.match(out, /kind\?: "adjudication";/);
  });

  it("renders an object that declares no property as the map it is", () => {
    const out = moduleFor({
      type: "object",
      properties: { providers: { type: "object", additionalProperties: { type: "string" } } },
    });

    assert.match(out, /providers\?: Record<string, string>;/);
  });

  it("refuses a $ref that points outside this schema rather than widening it", () => {
    // Widening it to `unknown` would put the cast back at the seam the
    // generated types exist to remove.
    assert.throws(
      () => moduleFor({ type: "object", properties: { row: { $ref: "other.json#/row" } } }),
      SchemaTranslationError,
    );
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

    assert.deepEqual(staleFiles(expected, actual), [
      { name: "b.ts", state: "changed" },
      { name: "gone.ts", state: "unexpected" },
    ]);
    assert.deepEqual(staleFiles(new Map([["c.ts", "x"]]), new Map()), [
      { name: "c.ts", state: "missing" },
    ]);
  });

  it("judges the lines and not the bytes between them", () => {
    // What kept `master` red for weeks. The repository stores LF, the
    // generator renders LF, and `core.autocrlf` -- the default on Windows
    // and what `windows-latest` runs with -- checked the files out as CRLF.
    // All 31 modules then compared unequal and the control announced a
    // schema drift that had not happened, in the first step of the job, so
    // the typecheck, the lint, the suite and the bundles behind it never
    // ran. `.gitattributes` is the fix; this is the guard behind it.
    const rendered = "export type A = {\n  a: string;\n};\n";
    const checkedOut = rendered.split("\n").join("\r\n");
    assert.deepEqual(
      staleFiles(new Map([["a.ts", rendered]]), new Map([["a.ts", checkedOut]])),
      [],
    );

    // And a real regeneration is still caught: what this control exists for
    // is a token that changed, which no newline rule can disguise.
    const drifted = "export type A = {\n  a: number;\n};\n";
    assert.deepEqual(
      staleFiles(new Map([["a.ts", rendered]]), new Map([["a.ts", drifted]])),
      [{ name: "a.ts", state: "changed" }],
    );
  });
});

describe("the exit-code contract", () => {
  it("tells a refusal from a failed write from an unclassified failure", () => {
    assert.equal(outcomeForExitCode(0), "ok");
    assert.equal(outcomeForExitCode(3), "refused");
    assert.equal(outcomeForExitCode(4), "writeFailed");
    // A usage error is a caller's bug, not a refusal.
    assert.equal(outcomeForExitCode(2), "failed");
    // A process that was killed or never ran did not consent to anything.
    assert.equal(outcomeForExitCode(null), "failed");
  });
});

describe("the verb table", () => {
  it("offers exactly the verbs the command can run, in both directions", () => {
    // The table is what the usage text lists and what the dispatcher looks
    // in; the registry is what answers. A verb in one and not the other is
    // either a promise the command breaks or a command nobody can find.
    assert.equal(new Set(VERBS.map((entry) => entry.verb)).size, VERBS.length);
    for (const spec of VERBS) {
      assert.equal(
        typeof HANDLERS[spec.verb],
        "function",
        `${spec.verb} is offered but not registered`,
      );
    }
    for (const verb of Object.keys(HANDLERS)) {
      assert.ok(findVerb(verb), `${verb} is registered but not offered`);
    }
    // The retired run core is not a verb, and neither is the interpreter
    // that used to run all of them.
    assert.equal(findVerb("runcli"), undefined);
    assert.equal(findVerb("python"), undefined);
  });
});
