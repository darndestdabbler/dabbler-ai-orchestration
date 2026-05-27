import * as assert from "assert";
import * as path from "path";
import {
  buildSpecReviewPrompt,
  buildSessionAccomplishmentsPrompt,
  buildSetAccomplishmentsPrompt,
  buildStartNextSessionPrompt,
  buildStartNextParallelSessionPrompt,
  sanitizeSlugForPrompt,
} from "../../commands/copyPromptCommands";
import { SessionSet, SessionState } from "../../types";

// Set 048 Session 3 — copyPromptCommands tests. The four prompt
// builders are pure (no clipboard / no vscode API), so we exercise:
//
//   - L1: prompts reference paths, never embed file contents.
//   - §3.2 path-reference format: relative-to-repo-root paths, slash-
//     separated regardless of OS path separator.
//   - §3.9 review-criteria embedding when the per-repo override file
//     exists; default hint copy when it does not.
//   - "if present" change-log conditional inclusion.

function fakeSet(slug: string, over: Partial<SessionSet> = {}): SessionSet {
  const root = path.join("/repo");
  const dir = path.join(root, "docs", "session-sets", slug);
  return {
    name: slug,
    dir,
    specPath: path.join(dir, "spec.md"),
    activityPath: path.join(dir, "activity-log.json"),
    changeLogPath: path.join(dir, "change-log.md"),
    statePath: path.join(dir, "session-state.json"),
    aiAssignmentPath: path.join(dir, "ai-assignment.md"),
    uatChecklistPath: path.join(dir, `${slug}-uat-checklist.json`),
    state: "in-progress" as SessionState,
    totalSessions: 5,
    sessionsCompleted: 1,
    lastTouched: null,
    liveSession: null,
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none", tier: "full" },
    uatSummary: null,
    root,
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    prerequisites: null,
    blockedByPrereqs: false,
    ...over,
  };
}

const noCriteria = {
  readReviewCriteria: () => null,
  fileExists: (_p: string) => false,
};

const withCriteria = (text: string) => ({
  readReviewCriteria: () => text,
  fileExists: (_p: string) => true,
});

suite("copyPromptCommands — spec review prompt", () => {
  test("references spec.md relative to repo root, never embeds contents", () => {
    const out = buildSpecReviewPrompt(fakeSet("048-lightweight"), noCriteria);
    assert.ok(out.includes("docs/session-sets/048-lightweight/spec.md"));
    assert.ok(!out.includes("---\n"), "should not contain spec front-matter (which would imply embedded contents)");
  });

  test("uses forward slashes regardless of OS path separator (L1)", () => {
    const out = buildSpecReviewPrompt(fakeSet("xy"), noCriteria);
    assert.ok(!out.includes("\\"), `path should use forward slashes; got: ${out}`);
  });

  test("falls back to default hint when docs/review-criteria/spec.md absent (§3.9)", () => {
    const out = buildSpecReviewPrompt(fakeSet("xy"), noCriteria);
    assert.ok(out.includes("No `docs/review-criteria/spec.md` present"));
  });

  test("embeds review-criteria content when the per-repo file is present (§3.9)", () => {
    const out = buildSpecReviewPrompt(
      fakeSet("xy"),
      withCriteria("Project-specific spec checks:\n- thing A\n- thing B"),
    );
    assert.ok(out.includes("Operator review criteria (from docs/review-criteria/spec.md)"));
    assert.ok(out.includes("- thing A"));
    assert.ok(out.includes("- thing B"));
    assert.ok(!out.includes("No `docs/review-criteria/spec.md` present"));
  });
});

suite("copyPromptCommands — session accomplishments prompt", () => {
  test("always references spec.md and activity-log.json", () => {
    const out = buildSessionAccomplishmentsPrompt(fakeSet("xy"), noCriteria);
    assert.ok(out.includes("docs/session-sets/xy/spec.md"));
    assert.ok(out.includes("docs/session-sets/xy/activity-log.json"));
  });

  test("includes change-log.md only when present", () => {
    const without = buildSessionAccomplishmentsPrompt(fakeSet("xy"), noCriteria);
    assert.ok(!without.includes("docs/session-sets/xy/change-log.md"));

    const withChangeLog = buildSessionAccomplishmentsPrompt(
      fakeSet("xy"),
      withCriteria("session-specific criteria"),
    );
    assert.ok(withChangeLog.includes("docs/session-sets/xy/change-log.md"));
  });

  test("embeds git commands with prev-session-ref placeholder", () => {
    const out = buildSessionAccomplishmentsPrompt(fakeSet("xy"), noCriteria);
    assert.ok(out.includes("git log --oneline <prev-session-ref>..HEAD"));
    assert.ok(out.includes("git diff <prev-session-ref>..HEAD"));
  });
});

suite("copyPromptCommands — set accomplishments prompt", () => {
  test("references spec.md and change-log.md when present", () => {
    const out = buildSetAccomplishmentsPrompt(
      fakeSet("xy", { state: "complete", sessionsCompleted: 5 }),
      withCriteria("set-wide criteria"),
    );
    assert.ok(out.includes("docs/session-sets/xy/spec.md"));
    assert.ok(out.includes("docs/session-sets/xy/change-log.md"));
  });

  test("omits change-log.md when the file is absent", () => {
    const out = buildSetAccomplishmentsPrompt(
      fakeSet("xy", { state: "complete", sessionsCompleted: 5 }),
      noCriteria,
    );
    assert.ok(!out.includes("docs/session-sets/xy/change-log.md"));
  });

  test("embeds set-wide git commands with set-start-ref placeholder", () => {
    const out = buildSetAccomplishmentsPrompt(
      fakeSet("xy", { state: "complete" }),
      noCriteria,
    );
    assert.ok(out.includes("git log --oneline <set-start-ref>..HEAD"));
    assert.ok(out.includes("git diff <set-start-ref>..HEAD"));
  });
});

suite("copyPromptCommands — start-next-session prompt (L5 + §3.3 mirror)", () => {
  test("returns the exact one-line text the L5 left-click writes", () => {
    const out = buildStartNextSessionPrompt(fakeSet("048-lightweight"));
    assert.strictEqual(out, "Start the next session of `048-lightweight`.");
  });

  test("uses the set's slug verbatim (no path traversal possible — slug is filesystem name)", () => {
    const out = buildStartNextSessionPrompt(fakeSet("with-dashes-and-numbers-123"));
    assert.strictEqual(out, "Start the next session of `with-dashes-and-numbers-123`.");
  });

  test("sanitizes backticks in slug to avoid breaking the markdown payload (S3 verifier-flagged edge case)", () => {
    // Filesystem names with backticks are unusual but POSIX-legal;
    // a backtick inside the L5 backtick-delimited payload would
    // truncate the rendering. The sanitize replaces ` with ' so the
    // markdown stays well-formed.
    assert.strictEqual(sanitizeSlugForPrompt("evil`-name"), "evil'-name");
    const out = buildStartNextSessionPrompt(fakeSet("evil`-name"));
    assert.strictEqual(out, "Start the next session of `evil'-name`.");
    assert.ok(!out.includes("``"), "double-backtick is unsafe in markdown");
  });
});

suite("copyPromptCommands — start-next-parallel-session prompt (Set 049 S1 hygiene)", () => {
  test("returns the parallel-variant text matching copyCommand.ts's parallel preset", () => {
    const out = buildStartNextParallelSessionPrompt(fakeSet("049-orchestrator-coordination-removal"));
    assert.strictEqual(
      out,
      "Start the next parallel session of `049-orchestrator-coordination-removal`.",
    );
  });

  test("sanitizes backticks consistent with the non-parallel variant", () => {
    const out = buildStartNextParallelSessionPrompt(fakeSet("evil`-name"));
    assert.strictEqual(out, "Start the next parallel session of `evil'-name`.");
    assert.ok(!out.includes("``"));
  });
});
