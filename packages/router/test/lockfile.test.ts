// The restricted-TOML record format both discovery paths write: what a value
// renders as, what the writer refuses rather than coerces, and how a record
// says whether it still holds what the machine put in it.
//
// Every rule here is a pure function of a value or a stamp. One test writes a
// file, because "LF on every platform" is a claim about bytes on disk.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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
import { tempDir } from "./support/answers.ts";

describe("rendering a value", () => {
  it("renders a boolean as a boolean, not as a number", () => {
    // In Python a bool is an int subclass, and `true` must not become `1`.
    assert.equal(renderValue("k", true), "true");
    assert.equal(renderValue("k", false), "false");
  });

  it("renders a count as an integer and a measurement as a float", () => {
    // JavaScript has one number type; a caller holding a float says so, so a
    // sample that lands on a whole number is not written as a count.
    assert.equal(renderValue("k", 15), "15");
    assert.equal(renderValue("k", 0.33), "0.33");
    assert.equal(renderValue("k", tomlFloat(1)), "1.0");
  });

  it("escapes a string and refuses an unrenderable control character", () => {
    assert.equal(renderValue("k", 'a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
    assert.throws(() => renderValue("k", "a\u0001b"), /control character/);
  });

  it("renders a flat array of strings and refuses anything else", () => {
    assert.equal(renderValue("k", ["a", "b"]), '[\n    "a",\n    "b",\n]');
    assert.throws(
      () => renderValue("k", [1, 2] as unknown as string[]),
      /flat arrays of strings/,
    );
  });

  it("refuses a value it cannot represent rather than coercing it", () => {
    // A value the writer cannot render must never reach the writer: coercing
    // it here would put a guess into a record that reads as a measurement.
    assert.throws(
      () => renderValue("k", { nested: true } as unknown as string),
      /cannot represent/,
    );
    assert.throws(() => renderValue("k", tomlFloat(Number.NaN)), /non-finite/);
  });

  it("spells a float the way CPython's repr spells it", () => {
    // Same text, or the content digest moves for a value nobody changed.
    assert.deepEqual(
      [1, 0.33, 1e-5, 1e16, 1e15, -123.456].map(pythonFloatRepr),
      ["1.0", "0.33", "1e-05", "1e+16", "1000000000000000.0", "-123.456"],
    );
  });
});

describe("writing a document", () => {
  it("drops an unknown key rather than writing a placeholder", () => {
    // An absent key and a null key are the same fact, and TOML has only the
    // first: a value a vendor stopped reporting must not read back as a
    // measurement of anything.
    const table: LockTable = { a: 1, b: "keep" };
    setOrDrop(table, "a", null);
    setOrDrop(table, "c", "added");
    assert.deepEqual(Object.keys(table), ["b", "c"]);
  });

  it("renders tables in order, with a trailing newline", () => {
    assert.equal(
      renderDocument([
        ["[meta]", { schema_version: 1 }],
        ["[[models]]", { id: "x" }],
      ]),
      '[meta]\nschema_version = 1\n\n[[models]]\nid = "x"\n',
    );
  });

  it("writes LF on every platform, because the digest covers the bytes", () => {
    const path = join(tempDir("lock-"), "nested", "catalog.lock");
    writeDocument(path, "[meta]\na = 1\n");
    assert.equal(readFileSync(path, "utf8"), "[meta]\na = 1\n");
  });

  it("digests the rendered text", () => {
    assert.equal(
      digestText(""),
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("how a record came to hold what it holds", () => {
  it("calls a matching digest machine-written", () => {
    assert.equal(
      provenance({
        storedDigest: "sha256:a",
        recomputedDigest: "sha256:a",
        writtenBy: "x",
        writtenAt: "y",
      }),
      PROVENANCE_MACHINE_WRITTEN,
    );
  });

  it("calls a stamp stripped of its digest hand-edited, not unstamped", () => {
    // Removing the line that would convict is itself the edit.
    assert.equal(
      provenance({ writtenBy: "x", writtenAt: "y", recomputedDigest: "sha256:a" }),
      PROVENANCE_HAND_EDITED,
    );
  });

  it("calls a file with no stamp at all merely older than the writer", () => {
    assert.equal(provenance({ recomputedDigest: "sha256:a" }), PROVENANCE_UNSTAMPED);
  });
});
