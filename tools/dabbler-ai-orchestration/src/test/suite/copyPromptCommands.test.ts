import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildStartNextSessionPrompt,
  ensureCrossProviderVerificationDoc,
  sanitizeSlugForPrompt,
} from "../../commands/copyPromptCommands";
import {
  CROSS_PROVIDER_VERIFICATION_REL_PATH,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";
import { SessionSet, SessionState } from "../../types";

// Set 048 Session 3 — copyPromptCommands tests.
//
// The three "Evaluate" review-prompt builders (spec / session-
// accomplishments / set-accomplishments) and the parallel-session
// variant were RETIRED on 2026-08-11 by operator decision: the
// review prompts were used for manual verification that the routed
// cross-provider round now owns, and the parallel-session prompt was
// superseded by the worktree-per-session model. Their suites went
// with them, along with the review-criteria embedding machinery
// (docs/review-criteria/<kind>.md) that only they consumed.
//
// What remains is the one-line start-next-session prompt (L5 mirror)
// and the cross-provider-verification doc writer, which
// consumerBootstrap and moduleAuthoring still call.

function fakeSet(slug: string, over: Partial<SessionSet> = {}): SessionSet {
  const root = path.join("/repo");
  const dir = path.join(root, "docs", "session-sets", slug);
  return {
    name: slug,
    module: null,
    moduleTitle: null,
    moduleOrder: null,
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
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none", module: null },
    uatSummary: null,
    root,
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    ...over,
  };
}

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

suite("copyPromptCommands — ensureCrossProviderVerificationDoc (Set 077 S4)", () => {
  let sandbox: string;
  let extensionPath: string;
  let workspaceRoot: string;

  function realBundleDir(): string {
    const extRoot = path.resolve(__dirname, "../../..");
    const candidates = [
      path.resolve(extRoot, "../../docs/templates/consumer-bootstrap"),
      resolveBundledTemplateDir(extRoot),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, "cross-provider-verification.md.template"))) {
        return c;
      }
    }
    throw new Error("could not locate the consumer-bootstrap bundle");
  }

  setup(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-xpv-"));
    extensionPath = path.join(sandbox, "ext");
    workspaceRoot = path.join(sandbox, "my-workspace");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    // loadTemplateBundle reads EVERY bundle file, so the fake packaged
    // layout must carry the whole real bundle, not just one template.
    const bundleDir = resolveBundledTemplateDir(extensionPath);
    fs.mkdirSync(bundleDir, { recursive: true });
    const src = realBundleDir();
    for (const f of fs.readdirSync(src)) {
      if (f.endsWith(".template") || f.endsWith(".md")) {
        fs.copyFileSync(path.join(src, f), path.join(bundleDir, f));
      }
    }
  });

  teardown(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  function targetPath(): string {
    return path.join(
      workspaceRoot,
      ...CROSS_PROVIDER_VERIFICATION_REL_PATH.split("/"),
    );
  }

  test("creates the doc (with the repo name substituted) when missing", () => {
    assert.strictEqual(fs.existsSync(targetPath()), false);
    const ok = ensureCrossProviderVerificationDoc(extensionPath, workspaceRoot);
    assert.strictEqual(ok, true);
    const content = fs.readFileSync(targetPath(), "utf8");
    assert.ok(content.includes("my-workspace"), "repo name substituted");
    assert.ok(
      content.includes("Verdict grammar"),
      "canonical content present",
    );
  });

  test("refreshes a stale/hand-edited copy back to the bundled content", () => {
    fs.mkdirSync(path.dirname(targetPath()), { recursive: true });
    fs.writeFileSync(targetPath(), "old stale hand-edited content", "utf8");
    const ok = ensureCrossProviderVerificationDoc(extensionPath, workspaceRoot);
    assert.strictEqual(ok, true);
    const content = fs.readFileSync(targetPath(), "utf8");
    assert.ok(!content.includes("old stale hand-edited content"));
    assert.ok(content.includes("cross-provider-verification.md.template"));
  });

  test("an identical up-to-date copy is left as-is (idempotent)", () => {
    assert.strictEqual(
      ensureCrossProviderVerificationDoc(extensionPath, workspaceRoot),
      true,
    );
    const before = fs.readFileSync(targetPath(), "utf8");
    assert.strictEqual(
      ensureCrossProviderVerificationDoc(extensionPath, workspaceRoot),
      true,
    );
    assert.strictEqual(fs.readFileSync(targetPath(), "utf8"), before);
  });

  test("returns false (never throws) when the bundle dir is missing", () => {
    fs.rmSync(path.join(extensionPath, "dist"), { recursive: true, force: true });
    assert.strictEqual(
      ensureCrossProviderVerificationDoc(extensionPath, workspaceRoot),
      false,
    );
  });
});
