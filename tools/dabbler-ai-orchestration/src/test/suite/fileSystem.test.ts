import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseSessionSetConfig, parseUatChecklist, readSessionSets } from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
}

suite("fileSystem — parseSessionSetConfig", () => {
  test("returns safe defaults when spec is missing", () => {
    const cfg = parseSessionSetConfig("/nonexistent/spec.md");
    assert.strictEqual(cfg.requiresUAT, false);
    assert.strictEqual(cfg.requiresE2E, false);
    assert.strictEqual(cfg.uatScope, "none");
  });

  test("parses requiresUAT and requiresE2E from yaml block", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, `## Session Set Configuration\n\`\`\`yaml\nrequiresUAT: true\nrequiresE2E: false\n\`\`\``);
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    assert.strictEqual(cfg.requiresE2E, false);
    fs.rmSync(dir, { recursive: true });
  });

  test("falls back to scanning plain text when no yaml block", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(specPath, "# My Spec\n\nrequiresUAT: true\n");
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.requiresUAT, true);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — parseUatChecklist", () => {
  test("returns null when file is missing", () => {
    const result = parseUatChecklist("/nonexistent/checklist.json");
    assert.strictEqual(result, null);
  });

  test("counts pending items", () => {
    const dir = makeTmpDir();
    const checklistPath = path.join(dir, "checklist.json");
    fs.writeFileSync(checklistPath, JSON.stringify({
      items: [
        { Result: "" },
        { Result: "pass" },
        { Result: "pending" },
      ],
    }));
    const result = parseUatChecklist(checklistPath);
    assert.ok(result);
    assert.strictEqual(result.pendingItems, 2);
    assert.strictEqual(result.totalItems, 3);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("fileSystem — readSessionSets", () => {
  test("returns empty array when docs/session-sets does not exist", () => {
    const sets = readSessionSets("/nonexistent");
    assert.deepStrictEqual(sets, []);
  });

  test("reads a not-started set (spec.md only)", () => {
    const dir = makeTmpDir();
    const slug = "my-feature";
    const setDir = path.join(dir, "docs", "session-sets", slug);
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# my-feature\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].name, slug);
    assert.strictEqual(sets[0].state, "not-started");
    fs.rmSync(dir, { recursive: true });
  });

  test("derives in-progress from activity-log.json presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-a");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-a\n");
    fs.writeFileSync(path.join(setDir, "activity-log.json"), JSON.stringify({ entries: [] }));
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("derives done from change-log.md presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-b");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-b\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "done");
    fs.rmSync(dir, { recursive: true });
  });

  test("skips directories starting with underscore", () => {
    const dir = makeTmpDir();
    const archivedDir = path.join(dir, "docs", "session-sets", "_archived");
    fs.mkdirSync(archivedDir, { recursive: true });
    fs.writeFileSync(path.join(archivedDir, "spec.md"), "# archived\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets.length, 0);
    fs.rmSync(dir, { recursive: true });
  });
});
