import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  PROVENANCE_HAND_EDITED,
  PROVENANCE_MACHINE_WRITTEN,
  PROVENANCE_UNSTAMPED,
  digestText,
  provenance,
  renderDocument,
  renderValue,
  setOrDrop,
  tomlFloat,
  writeDocument,
  type LockTable,
} from "../src/lockfile.ts";
import { pythonFloatRepr } from "../src/pythonJson.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

describe("rendering a value", () => {
  it("renders a boolean as a boolean, not as a number", () => {
    // In Python a bool is an int subclass, and `true` must not become `1`.
    expect(renderValue("k", true)).toBe("true");
    expect(renderValue("k", false)).toBe("false");
  });

  it("renders a count as an integer and a measurement as a float", () => {
    // JavaScript has one number type; a caller holding a float says so, so a
    // sample that lands on a whole number is not written as a count.
    expect(renderValue("k", 15)).toBe("15");
    expect(renderValue("k", 0.33)).toBe("0.33");
    expect(renderValue("k", tomlFloat(1))).toBe("1.0");
  });

  it("escapes a string and refuses an unrenderable control character", () => {
    expect(renderValue("k", 'a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
    expect(() => renderValue("k", "a\u0001b")).toThrow(/control character/);
  });

  it("renders a flat array of strings and refuses anything else", () => {
    expect(renderValue("k", ["a", "b"])).toBe('[\n    "a",\n    "b",\n]');
    expect(() => renderValue("k", [1, 2] as unknown as string[])).toThrow(
      /flat arrays of strings/,
    );
  });

  it("refuses a value it cannot represent rather than coercing it", () => {
    // A value the writer cannot render must never reach the writer.
    expect(() => renderValue("k", { nested: true } as unknown as string)).toThrow(
      /cannot represent/,
    );
    expect(() => renderValue("k", tomlFloat(Number.NaN))).toThrow(/non-finite/);
  });

  it("spells a float the way CPython's repr spells it", () => {
    // Same text or the content digest moves for a value nobody changed.
    expect(pythonFloatRepr(1)).toBe("1.0");
    expect(pythonFloatRepr(0.33)).toBe("0.33");
    expect(pythonFloatRepr(1e-5)).toBe("1e-05");
    expect(pythonFloatRepr(1e16)).toBe("1e+16");
    expect(pythonFloatRepr(1e15)).toBe("1000000000000000.0");
    expect(pythonFloatRepr(-123.456)).toBe("-123.456");
  });
});

describe("writing a document", () => {
  it("drops an unknown key rather than writing a placeholder", () => {
    // An absent key and a null key are the same fact, and TOML has only the
    // first: a value a vendor stopped reporting must not read as a measurement.
    const table: LockTable = { a: 1, b: "keep" };
    setOrDrop(table, "a", null);
    setOrDrop(table, "c", "added");
    expect(Object.keys(table)).toEqual(["b", "c"]);
  });

  it("renders tables in order, with a trailing newline", () => {
    const text = renderDocument([
      ["[meta]", { schema_version: 1 }],
      ["[[models]]", { id: "x" }],
    ]);
    expect(text).toBe('[meta]\nschema_version = 1\n\n[[models]]\nid = "x"\n');
  });

  it("writes LF on every platform, because the digest covers the bytes", () => {
    const path = join(makeTempDir(), "nested", "catalog.lock");
    writeDocument(path, "[meta]\na = 1\n");
    expect(readFileSync(path, "utf8")).toBe("[meta]\na = 1\n");
  });

  it("digests the rendered text", () => {
    expect(digestText("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("how a record came to hold what it holds", () => {
  it("calls a matching digest machine-written", () => {
    expect(
      provenance({
        storedDigest: "sha256:a",
        recomputedDigest: "sha256:a",
        writtenBy: "x",
        writtenAt: "y",
      }),
    ).toBe(PROVENANCE_MACHINE_WRITTEN);
  });

  it("calls a stamp stripped of its digest hand-edited, not unstamped", () => {
    // Removing the line that would convict is itself the edit.
    expect(
      provenance({ writtenBy: "x", writtenAt: "y", recomputedDigest: "sha256:a" }),
    ).toBe(PROVENANCE_HAND_EDITED);
  });

  it("calls a file with no stamp at all merely older than the writer", () => {
    expect(provenance({ recomputedDigest: "sha256:a" })).toBe(PROVENANCE_UNSTAMPED);
  });
});
