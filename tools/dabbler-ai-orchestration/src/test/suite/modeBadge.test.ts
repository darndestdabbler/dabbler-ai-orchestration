import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseSessionSetConfig } from "../../utils/fileSystem";
import { modeBadge } from "../../providers/SessionSetsProvider";
import { SessionSet } from "../../types";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-mode-test-"));
}

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "x",
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "not-started",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      outsourceMode: "first",
    },
    uatSummary: null,
    root: "/x",
    ...over,
  };
}

suite("parseSessionSetConfig — outsourceMode", () => {
  test("defaults to 'first' when spec is missing", () => {
    const cfg = parseSessionSetConfig("/nonexistent/spec.md");
    assert.strictEqual(cfg.outsourceMode, "first");
  });

  test("defaults to 'first' when yaml block omits the field", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\nrequiresUAT: true\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.outsourceMode, "first");
    fs.rmSync(dir, { recursive: true });
  });

  test("parses outsourceMode: last", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\noutsourceMode: last\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.outsourceMode, "last");
    fs.rmSync(dir, { recursive: true });
  });

  test("parses outsourceMode: first explicitly", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\noutsourceMode: first\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.outsourceMode, "first");
    fs.rmSync(dir, { recursive: true });
  });

  test("ignores unrecognized values and falls back to 'first'", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\noutsourceMode: hybrid\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.outsourceMode, "first");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("SessionSetsProvider — modeBadge", () => {
  test("renders [FIRST] for outsource-first sets", () => {
    assert.strictEqual(
      modeBadge(fakeSet({ config: {
        requiresUAT: false, requiresE2E: false, uatScope: "none", outsourceMode: "first",
      } })),
      "[FIRST]",
    );
  });

  test("renders [LAST] for outsource-last sets", () => {
    assert.strictEqual(
      modeBadge(fakeSet({ config: {
        requiresUAT: false, requiresE2E: false, uatScope: "none", outsourceMode: "last",
      } })),
      "[LAST]",
    );
  });
});
