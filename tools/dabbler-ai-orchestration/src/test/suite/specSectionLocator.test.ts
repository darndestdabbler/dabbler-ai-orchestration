import * as assert from "assert";
import {
  locateSessionSection,
  scanSessionHeads,
  stripFencedBlocks,
} from "../../providers/specSectionLocator";

const SPEC = [
  "# The Set",
  "",
  "### Session 1 of 2: First",
  "1. Step one.",
  "",
  "### Session 2 of 2: Second",
  "1. Step A.",
  "2. Step B.",
  "",
  "",
].join("\n");

suite("specSectionLocator", () => {
  test("finds a session's own heading and runs to the next one, blanks trimmed", () => {
    const range = locateSessionSection(SPEC, 1)!;
    assert.strictEqual(range.startLine, 2);
    assert.strictEqual(range.endLine, 3);
  });

  test("the last session runs to end of file with trailing blanks trimmed", () => {
    const range = locateSessionSection(SPEC, 2)!;
    assert.strictEqual(range.startLine, 5);
    assert.strictEqual(range.endLine, 7);
  });

  test("a missing session is a first-class null, not an error", () => {
    assert.strictEqual(locateSessionSection(SPEC, 9), null);
    assert.strictEqual(locateSessionSection("", 1), null);
    assert.strictEqual(locateSessionSection(SPEC, 1.5), null);
  });

  test("a heading inside a fence is a sample, not a section", () => {
    const fenced = [
      "```md",
      "### Session 1 of 1: Sample",
      "```",
      "### Session 1 of 1: Real",
      "1. Do.",
    ].join("\n");
    const range = locateSessionSection(fenced, 1)!;
    assert.strictEqual(range.startLine, 3);
  });

  test("a duplicate heading resolves to the first, matching the Python extractor", () => {
    const dupe = "### Session 1: A\ntext\n### Session 1: B\nmore";
    assert.strictEqual(locateSessionSection(dupe, 1)!.startLine, 0);
  });

  test("stripFencedBlocks preserves line count", () => {
    const text = "a\n```\nb\nc\n```\nd";
    const stripped = stripFencedBlocks(text);
    assert.strictEqual(stripped.split("\n").length, text.split("\n").length);
    assert.ok(!stripped.includes("b"));
  });

  test("scanSessionHeads reads the number and offsets of each heading", () => {
    const heads = scanSessionHeads(SPEC);
    assert.deepStrictEqual(heads.map((h) => h.number), [1, 2]);
    assert.ok(heads[0].contentStart > heads[0].headStart);
  });
});
