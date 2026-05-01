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

  // Set 7: state is read directly from session-state.json's `status`,
  // not derived from file presence. Each fixture writes the canonical
  // not-started / in-progress / complete status string and asserts the
  // tree-view label maps it correctly. The "spec.md only" fixture
  // exercises the lazy-synth fallback (readStatus writes the
  // not-started shape on the fly when the file is absent).

  test("reads a not-started set via lazy-synth (spec.md only)", () => {
    const dir = makeTmpDir();
    const slug = "my-feature";
    const setDir = path.join(dir, "docs", "session-sets", slug);
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# my-feature\n");
    const sets = readSessionSets(dir);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].name, slug);
    assert.strictEqual(sets[0].state, "not-started");
    // Lazy-synth wrote the file as a side effect of readStatus.
    assert.ok(fs.existsSync(path.join(setDir, "session-state.json")));
    fs.rmSync(dir, { recursive: true });
  });

  test("reads in-progress from session-state.json status", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-a");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-a\n");
    fs.writeFileSync(path.join(setDir, "activity-log.json"), JSON.stringify({ entries: [] }));
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "in-progress" })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("reads done from session-state.json status='complete'", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-b");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-b\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "complete" })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "done");
    fs.rmSync(dir, { recursive: true });
  });

  test("canonicalizes pre-Set-7 'completed' alias to done", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "feature-c");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# feature-c\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "completed" })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "done");
    fs.rmSync(dir, { recursive: true });
  });

  // Set 7: the canonical contract is "status beats file presence."
  // These contradictory fixtures lock that in — without them, the old
  // file-presence implementation could still pass the basic in-progress
  // and done tests above (they have both the legacy presence signal AND
  // a matching status). Round-1 verifier flagged this gap.

  test("status='complete' beats activity-log.json presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "contradict-1");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# contradict-1\n");
    fs.writeFileSync(path.join(setDir, "activity-log.json"), JSON.stringify({ entries: [] }));
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "complete" })
    );
    const sets = readSessionSets(dir);
    // Old file-presence rule: change-log absent + activity-log present
    // = "in-progress". Set 7 rule: status overrides → "done".
    assert.strictEqual(sets[0].state, "done");
    fs.rmSync(dir, { recursive: true });
  });

  test("status='in-progress' beats change-log.md presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "contradict-2");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# contradict-2\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    fs.writeFileSync(
      path.join(setDir, "session-state.json"),
      JSON.stringify({ schemaVersion: 2, status: "in-progress" })
    );
    const sets = readSessionSets(dir);
    // Old file-presence rule: change-log present = "done". Set 7 rule:
    // status overrides → "in-progress". The contradiction itself is
    // unusual (it would mean a new session was opened after a previous
    // one's change-log was authored); this test locks in the precedence.
    assert.strictEqual(sets[0].state, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  // Verifier round 2 regression: lazy-synth on a legacy folder with
  // change-log.md or activity-log.json but no session-state.json must
  // infer the right initial state from those files (not regress to
  // not-started). readStatus now routes the file-absent path through
  // ensureSessionStateFile, mirroring the Python helper.

  test("lazy-synth infers 'done' from legacy change-log.md presence", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "legacy-done");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# legacy-done\n");
    fs.writeFileSync(path.join(setDir, "change-log.md"), "# Changes\n");
    // Deliberately no session-state.json — exercises the lazy-synth path.
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "done");
    // Side effect: a state file was written with the inferred shape.
    const written = JSON.parse(
      fs.readFileSync(path.join(setDir, "session-state.json"), "utf8")
    );
    assert.strictEqual(written.status, "complete");
    assert.strictEqual(written.lifecycleState, "closed");
    fs.rmSync(dir, { recursive: true });
  });

  test("lazy-synth infers 'in-progress' from legacy activity-log.json", () => {
    const dir = makeTmpDir();
    const setDir = path.join(dir, "docs", "session-sets", "legacy-active");
    fs.mkdirSync(setDir, { recursive: true });
    fs.writeFileSync(path.join(setDir, "spec.md"), "# legacy-active\n");
    fs.writeFileSync(
      path.join(setDir, "activity-log.json"),
      JSON.stringify({
        entries: [{ sessionNumber: 1, dateTime: "2026-01-01T00:00:00-04:00" }],
      })
    );
    const sets = readSessionSets(dir);
    assert.strictEqual(sets[0].state, "in-progress");
    const written = JSON.parse(
      fs.readFileSync(path.join(setDir, "session-state.json"), "utf8")
    );
    assert.strictEqual(written.status, "in-progress");
    assert.strictEqual(written.startedAt, "2026-01-01T00:00:00-04:00");
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
