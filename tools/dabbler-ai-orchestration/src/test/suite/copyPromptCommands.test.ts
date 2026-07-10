import * as assert from "assert";
import * as path from "path";
import {
  buildSpecReviewPrompt,
  buildSessionAccomplishmentsPrompt,
  buildSetAccomplishmentsPrompt,
  buildStartNextSessionPrompt,
  buildStartNextParallelSessionPrompt,
  buildVerificationKickoffPrompt,
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
    module: null,
    moduleTitle: null,
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
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none", tier: "full", verificationMode: "out-of-band-or-none", module: null },
    uatSummary: null,
    root,
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    workspaceTierMarker: null,
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

suite("copyPromptCommands — verification kickoff prompt (Set 062 S2, spec D2)", () => {
  const lwDedicated = () =>
    fakeSet("062-fixture", {
      config: {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
        module: null,
      },
    });

  test("pointer-style: references the workflow doc section, never embeds its body", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(out.includes("docs/ai-led-session-workflow.md"), "must point at the workflow doc");
    assert.ok(out.includes("Mode B"), "must name the dedicated-sessions section");
    // Body text from the doc (e.g. the derived-state table or the
    // resolution_status enum) must NOT be embedded — it would go stale.
    assert.ok(!out.includes("resolution_status"), "doc rule tables must not be embedded");
    assert.ok(!out.includes("closed-dispositioned"), "derived-state ladder must not be embedded");
  });

  test("instructs the blessed typed-session writer with the set's real directory", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    // Set 077 S1: the set-dir is quoted so pasted commands survive
    // workspace paths containing spaces.
    assert.ok(
      out.includes(
        'python -m ai_router.start_session --session-set-dir "docs/session-sets/062-fixture" --type verification',
      ),
      `kickoff must use the blessed writer; got: ${out}`,
    );
    assert.ok(!out.includes("\\"), "paths must be slash-separated regardless of OS");
  });

  test("demands engine OR provider difference and points at the orchestrator blocks", () => {
    // Set 077 S5 (A6): the cross-provider property is engine OR model
    // provider — the single-engine (Copilot model picker) pattern is
    // sanctioned, so the prompt must not demand a different engine
    // unconditionally.
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(/ENGINE or by model\s*\nPROVIDER|ENGINE or by model PROVIDER/i.test(out));
    assert.ok(out.includes("--provider"));
    assert.ok(out.includes("docs/session-sets/062-fixture/session-state.json"));
  });

  test("points at the remediation hand-off instead of inlining its command (A9)", () => {
    // Set 077 S5 rewrite: prompts are pointers — the kickoff names the
    // hand-off and defers its mechanics to the workflow doc's Mode B
    // section rather than embedding a second command line that can
    // drift from the doc.
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(/hand-off/i.test(out));
    assert.ok(out.includes("docs/ai-led-session-workflow.md"));
  });

  test("surfaces the minimum router version (critique M6 version-skew)", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(out.includes("dabbler-ai-router >= 0.27.0"));
  });

  test("references the spec and activity log by path (L1)", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(out.includes("docs/session-sets/062-fixture/spec.md"));
    assert.ok(out.includes("docs/session-sets/062-fixture/activity-log.json"));
  });

  test("is NOT the generic start-next-session prompt (D2: the dedicated flow is not generic)", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(!out.includes("Start the next session of"));
  });

  test("never instructs hand-editing the state file or UI-created sessions", () => {
    const out = buildVerificationKickoffPrompt(lwDedicated());
    assert.ok(/never hand-edit the state file/i.test(out));
  });

  test("sanitizes backticks in the slug like the other prompt builders", () => {
    const out = buildVerificationKickoffPrompt(
      fakeSet("evil`-name", {
        config: {
          requiresUAT: false,
          requiresE2E: false,
          uatScope: "none",
          tier: "lightweight",
          verificationMode: "dedicated-sessions",
          module: null,
        },
      }),
    );
    assert.ok(out.includes("`evil'-name`"));
    assert.ok(!out.includes("``"));
  });
});

// ---------------------------------------------------------------------------
// Set 077 S4 — pointer-style Evaluate prompts (Feature 3, A2/A9)
// ---------------------------------------------------------------------------
// Adapted from routed test-generation (gemini-pro, S4): import paths,
// TDD-ui setup/teardown, and the ensure-write sandbox (which must copy
// the REAL bundle — loadTemplateBundle reads every bundle file, so a
// one-file fake fails to load) were corrected during integration.

import * as fs from "fs";
import * as os from "os";
import {
  ensureCrossProviderVerificationDoc,
  __forTests as copyPromptForTests,
} from "../../commands/copyPromptCommands";
import { buildExternalVerificationTemplate } from "../../commands/externalVerification";
import {
  CROSS_PROVIDER_VERIFICATION_REL_PATH,
  resolveBundledTemplateDir,
} from "../../utils/consumerBootstrap";

suite("copyPromptCommands — pointer-style Evaluate prompts (Set 077 S4)", () => {
  type TrailerCtx = {
    readReviewCriteria: (root: string, kind: "spec" | "session" | "set") => string | null;
    fileExists: (p: string) => boolean;
  };
  const builders: Array<
    [string, (s: SessionSet, c: TrailerCtx) => string]
  > = [
    ["spec", buildSpecReviewPrompt],
    ["session", buildSessionAccomplishmentsPrompt],
    ["set", buildSetAccomplishmentsPrompt],
  ];

  for (const [kind, build] of builders) {
    test(`${kind} prompt OPENS with the canonical-doc pointer + missing-doc fallback`, () => {
      const out = build(fakeSet("077-pointer"), noCriteria);
      assert.ok(
        out.startsWith("Cross-provider review request (out-of-band verification)."),
        `${kind}: must open with the review-request line`,
      );
      assert.ok(
        out.includes("docs/dabbler/cross-provider-verification.md"),
        `${kind}: must point at the canonical instruction doc`,
      );
      assert.ok(
        out.includes("If that file is missing"),
        `${kind}: must carry the one-line missing-doc fallback`,
      );
      // The fallback names the full verdict grammar.
      assert.ok(out.includes("VERIFIED"), kind);
      assert.ok(out.includes("ISSUES_FOUND"), kind);
      assert.ok(out.includes("WAIVED"), kind);
    });

    test(`${kind} prompt CLOSES with the mandatory write-the-artifact instruction`, () => {
      const out = build(fakeSet("077-pointer"), noCriteria);
      assert.ok(
        out
          .trimEnd()
          .endsWith("A verdict that exists only in this chat does not count."),
        `${kind}: must close on the artifact instruction`,
      );
      assert.ok(
        out.includes("docs/session-sets/077-pointer/external-verification.md"),
        `${kind}: the artifact path must be spelled out relative to repo root`,
      );
      assert.ok(
        out.includes("append-only"),
        `${kind}: append-only discipline must be stated`,
      );
    });

    test(`${kind} prompt scope marker: only the spec review instructs Scope: specification`, () => {
      const out = build(fakeSet("077-pointer"), noCriteria);
      if (kind === "spec") {
        assert.ok(
          out.includes("Scope: specification"),
          "spec review must instruct the parser-visible scope marker",
        );
      } else {
        assert.ok(
          !out.includes("Scope: specification"),
          `${kind}: work reviews must not be spec-scoped`,
        );
      }
    });

    test(`${kind} prompt preserves the operator-criteria trailer between opener and close`, () => {
      const out = build(
        fakeSet("077-pointer"),
        withCriteria("Repo-specific check: the frobnicator must frob."),
      );
      const criteriaIdx = out.indexOf("Repo-specific check");
      const closeIdx = out.indexOf("Non-negotiable final step");
      assert.ok(criteriaIdx > 0, `${kind}: criteria embedded`);
      assert.ok(closeIdx > criteriaIdx, `${kind}: close comes after the trailer`);
    });
  }
});

suite("copyPromptCommands — review-criteria size guard (Set 077 S4)", () => {
  const trailerFn = copyPromptForTests.reviewCriteriaTrailer;

  test("short criteria are embedded verbatim (no truncation note)", () => {
    const trailer = trailerFn("/repo", "spec", withCriteria("short and sweet"));
    assert.ok(trailer.includes("short and sweet"));
    assert.ok(!trailer.includes("truncated at"));
  });

  test("criteria beyond 8000 chars are truncated with a pointer note", () => {
    const long = "A".repeat(9000);
    const trailer = trailerFn("/repo", "set", withCriteria(long));
    assert.ok(trailer.includes("[... truncated at 8000 characters"));
    assert.ok(
      trailer.includes("read docs/review-criteria/set.md for the rest"),
      "truncation note must point at the on-disk file",
    );
    assert.ok(
      trailer.length < 8000 + 400,
      `trailer should be bounded; got ${trailer.length}`,
    );
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

suite("externalVerification — seeded template (Set 077 S4, A2)", () => {
  test("carries set name, dated Round 1 header, and a PENDING verdict", () => {
    const t = buildExternalVerificationTemplate("077-my-set", "2026-07-02");
    assert.ok(t.includes("# External Verification — 077-my-set"));
    assert.ok(t.includes("## Round 1 — 2026-07-02"));
    assert.ok(t.includes("Verdict: PENDING"));
  });

  test("points the reviewing engine at the canonical instruction doc", () => {
    const t = buildExternalVerificationTemplate("077-my-set", "2026-07-02");
    assert.ok(t.includes("docs/dabbler/cross-provider-verification.md"));
  });
});
