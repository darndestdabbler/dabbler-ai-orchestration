import { describe, expect, it } from "vitest";

import { normalize } from "../src/parity/normalize.ts";
import { isCompared, normalizeForPath } from "../src/parity/compare.ts";

describe("the two normalizations", () => {
  it("erases every timestamp and every spelling of a root, and nothing else", () => {
    const roots = ["D:\\work\\copy-a", "/tmp/copy-b"];
    const text = [
      '{"startedAt": "2026-08-28T09:14:02.117431-04:00",',
      ' "decidedOn": "2026-08-28",',
      ' "native": "D:\\\\work\\\\copy-a\\\\docs",',
      ' "forward": "D:/work/copy-a/docs",',
      ' "other": "/tmp/copy-b/docs",',
      ' "relative": "docs/sessions/sessions.json"}',
    ].join("\n");

    const out = normalize(text, roots);

    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(out).not.toContain("copy-a");
    expect(out).not.toContain("copy-b");
    // A repository-relative path is left exactly as it was: it must match.
    expect(out).toContain('"relative": "docs/sessions/sessions.json"');
  });

  it("reduces a digest ledger to its shape, and leaves every other digest alone", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const row = `{"hash": "${digest}"}`;

    expect(normalizeForPath(".dabbler/runs/state-writes.jsonl", row, [])).toContain(
      "sha256:<digest>",
    );
    // A tree hash has no timestamp in it and is compared exactly.
    const treeRow = `{"completion_tree": "${digest}"}`;
    expect(normalizeForPath(".dabbler/runs/s1/rounds.jsonl", treeRow, [])).toBe(treeRow);
  });
});

describe("which paths are compared", () => {
  it("takes the record and leaves telemetry, locks and the retired run core", () => {
    expect(isCompared("docs/sessions/sessions.json")).toBe(true);
    expect(isCompared(".dabbler/runs/s3/rounds.jsonl")).toBe(true);
    expect(isCompared(".dabbler/runs/test-runs.jsonl")).toBe(true);

    expect(isCompared(".dabbler/runs/router-metrics.jsonl")).toBe(false);
    expect(isCompared(".dabbler/runs/s3/.lifecycle.lock")).toBe(false);
    expect(isCompared(".dabbler/runs/s3/journal.jsonl")).toBe(false);
    // Nothing the router does not write can make the control red.
    expect(isCompared("src/widget.py")).toBe(false);
  });
});
