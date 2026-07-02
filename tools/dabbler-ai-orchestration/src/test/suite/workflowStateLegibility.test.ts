import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  durableVerificationModeFrom,
  deriveWorkflowState,
  LedgerSessionLike,
} from "../../utils/tierLegibility";
import { SessionSet } from "../../types";
import { readSessionSets, readLatestIssuesEnvelope } from "../../utils/fileSystem";
import { verificationOwedText, progressText } from "../../providers/SessionSetsModel";
import { resolveStartNextSessionPrompt, MODE_B_MIN_ROUTER_VERSION } from "../../commands/copyPromptCommands";

function set(over: Partial<SessionSet>): SessionSet {
  return over as SessionSet;
}

function ledgerSession(over: Partial<LedgerSessionLike>): LedgerSessionLike {
  return over as LedgerSessionLike;
}

const issuesEnvelope = (issues: unknown[]) => ({ issues });

suite("Workflow State & Legibility (Set 077 S5)", () => {
  suite("durableVerificationModeFrom()", () => {
    test("should return null for non-object or null input", () => {
      assert.strictEqual(durableVerificationModeFrom(null), null);
      assert.strictEqual(durableVerificationModeFrom(undefined), null);
      assert.strictEqual(durableVerificationModeFrom(123), null);
      assert.strictEqual(durableVerificationModeFrom("string"), null);
    });

    test("should return null if 'entries' key is missing or not an array", () => {
      assert.strictEqual(durableVerificationModeFrom({}), null);
      assert.strictEqual(durableVerificationModeFrom({ entries: null }), null);
      assert.strictEqual(durableVerificationModeFrom({ entries: {} }), null);
    });

    test("should return null for an empty entries array", () => {
      assert.strictEqual(durableVerificationModeFrom({ entries: [] }), null);
    });

    test("should ignore irrelevant, malformed, or null entries", () => {
      const activityLog = {
        entries: [
          { kind: "some_other_kind", choice: "dedicated-sessions" },
          null,
          {},
          { kind: "verification_mode" },
          { kind: "verification_mode", choice: "invalid-choice" },
        ],
      };
      assert.strictEqual(durableVerificationModeFrom(activityLog), null);
    });

    test("should return the choice from a valid 'verification_mode' entry", () => {
      const activityLog = {
        entries: [{ kind: "verification_mode", choice: "dedicated-sessions" }],
      };
      assert.strictEqual(durableVerificationModeFrom(activityLog), "dedicated-sessions");
    });

    test("should return the choice from a valid 'verification_mode_change' entry", () => {
      const activityLog = {
        entries: [{ kind: "verification_mode_change", choice: "out-of-band-or-none" }],
      };
      assert.strictEqual(durableVerificationModeFrom(activityLog), "out-of-band-or-none");
    });

    test("should return the last valid choice if multiple are present", () => {
      const activityLog = {
        entries: [
          { kind: "verification_mode", choice: "dedicated-sessions" },
          { kind: "some_other_kind", choice: "out-of-band-or-none" },
          { kind: "verification_mode_change", choice: "out-of-band-or-none" },
          { kind: "verification_mode", choice: "invalid-choice" },
        ],
      };
      assert.strictEqual(durableVerificationModeFrom(activityLog), "out-of-band-or-none");
    });

    test("a later change record should supersede an earlier capture", () => {
        const activityLog = {
            entries: [
              { kind: "verification_mode", choice: "out-of-band-or-none" },
              { kind: "verification_mode_change", choice: "dedicated-sessions" },
            ],
          };
          assert.strictEqual(durableVerificationModeFrom(activityLog), "dedicated-sessions");
    });
  });

  suite("deriveWorkflowState()", () => {
    test("non-dedicated mode returns closed-no-verification when complete", () => {
      const state = deriveWorkflowState([], "out-of-band-or-none", "complete", null);
      assert.strictEqual(state, "closed-no-verification");
    });

    test("non-dedicated mode returns work-in-progress when not complete", () => {
      const state = deriveWorkflowState([], "out-of-band-or-none", "in-progress", null);
      assert.strictEqual(state, "work-in-progress");
    });

    test("empty ledger in dedicated mode is work-in-progress", () => {
      const state = deriveWorkflowState([], "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "work-in-progress");
    });

    test("latest in-progress work session is work-in-progress", () => {
      const sessions = [ledgerSession({ status: "in-progress" })];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "work-in-progress");
    });

    test("latest in-progress verification session is awaiting-verification", () => {
      const sessions = [ledgerSession({ type: "verification", status: "in-progress" })];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "awaiting-verification");
    });

    test("latest in-progress remediation session is awaiting-remediation", () => {
      const sessions = [ledgerSession({ type: "remediation", status: "in-progress" })];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "awaiting-remediation");
    });

    test("any incomplete work session results in work-in-progress", () => {
      const sessions = [
        ledgerSession({ type: "work", status: "in-progress" }),
        ledgerSession({ type: "verification", status: "complete" }),
      ];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "work-in-progress");
    });

    test("all work complete, latest is work -> awaiting-verification", () => {
      const sessions = [ledgerSession({ type: "work", status: "complete" })];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "awaiting-verification");
    });

    test("latest verification complete with VERIFIED verdict -> closed-verified", () => {
      const sessions = [ledgerSession({ type: "verification", status: "complete", verificationVerdict: "VERIFIED" })];
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
      assert.strictEqual(state, "closed-verified");
    });

    test("latest verification complete, no issues, blank verdict, set in-progress -> awaiting-human", () => {
        const sessions = [ledgerSession({ type: "verification", status: "complete", verificationVerdict: "" })];
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", null);
        assert.strictEqual(state, "awaiting-human");
    });

    test("latest verification complete, no issues, blank verdict, set complete -> closed-verified", () => {
        const sessions = [ledgerSession({ type: "verification", status: "complete", verificationVerdict: null })];
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "complete", null);
        assert.strictEqual(state, "closed-verified");
    });

    test("latest verification complete with open issue -> awaiting-remediation", () => {
      const sessions = [ledgerSession({ type: "verification", status: "complete", verificationVerdict: "ISSUES_FOUND" })];
      const issues = issuesEnvelope([{}]); // open issue (no resolution_status)
      const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
      assert.strictEqual(state, "awaiting-remediation");
    });

    test("latest verification complete with 'escalate-human' issue -> awaiting-human", () => {
        const sessions = [ledgerSession({ type: "verification", status: "complete" })];
        const issues = issuesEnvelope([{ resolution_status: "escalate-human" }]);
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
        assert.strictEqual(state, "awaiting-human");
    });

    test("3 verification rounds with an open issue -> awaiting-human", () => {
        const sessions = [
            ledgerSession({ type: "verification", status: "complete" }),
            ledgerSession({ type: "verification", status: "complete" }),
            ledgerSession({ type: "verification", status: "complete" }),
        ];
        const issues = issuesEnvelope([{}]);
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
        assert.strictEqual(state, "awaiting-human");
    });

    test("latest remediation complete, all issues fixed -> awaiting-verification", () => {
        const sessions = [ledgerSession({ type: "remediation", status: "complete" })];
        const issues = issuesEnvelope([{ resolution_status: "fixed" }]);
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
        assert.strictEqual(state, "awaiting-verification");
    });

    test("latest remediation complete, all issues terminal non-fixed -> closed-dispositioned", () => {
        const sessions = [ledgerSession({ type: "remediation", status: "complete" })];
        const issues = issuesEnvelope([
            { resolution_status: "accepted-risk" },
            { resolution_status: "not-reproducible" },
        ]);
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
        assert.strictEqual(state, "closed-dispositioned");
    });

    test("latest remediation complete with an open issue -> awaiting-human", () => {
        const sessions = [ledgerSession({ type: "remediation", status: "complete" })];
        const issues = issuesEnvelope([{ resolution_status: "fixed" }, {}]);
        const state = deriveWorkflowState(sessions, "dedicated-sessions", "in-progress", issues);
        assert.strictEqual(state, "awaiting-human");
    });
  });

  suite("File System Integration", () => {
    let testRoot: string;
    setup(() => {
      testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
    });
    teardown(() => {
      fs.rmSync(testRoot, { recursive: true, force: true });
    });

    suite("readSessionSets() A7 Drift Fixture", () => {
        test("activity-log record should override spec seed for verificationMode", async () => {
            const setDir = path.join(testRoot, "docs", "session-sets", "a7-drift-set");
            fs.mkdirSync(setDir, { recursive: true });

            const specContent = "## Session Set Configuration\n```yaml\ntier: lightweight\nverificationMode: out-of-band-or-none\n```";
            fs.writeFileSync(path.join(setDir, "spec.md"), specContent);

            const activityLogContent = JSON.stringify({
                entries: [{ kind: "verification_mode_change", choice: "dedicated-sessions" }]
            });
            fs.writeFileSync(path.join(setDir, "activity-log.json"), activityLogContent);

            const sessionStateContent = JSON.stringify({
                schemaVersion: 4,
                sessionSetName: "a7-drift-set",
                status: "in-progress",
                totalSessions: 1,
                sessions: [{ number: 1, title: "W", status: "complete", startedAt: "t1", completedAt: "t1b", orchestrator: { engine: "copilot", provider: "anthropic" }, verificationVerdict: null }]
            });
            fs.writeFileSync(path.join(setDir, "session-state.json"), sessionStateContent);

            const sets = await readSessionSets(testRoot);
            assert.strictEqual(sets.length, 1);
            const a7Set = sets[0];

            assert.strictEqual(a7Set.config.verificationMode, "dedicated-sessions", "Verification mode should come from activity-log");
            assert.strictEqual(a7Set.workflowState, "awaiting-verification", "Workflow state should be derived based on dedicated mode");
            assert.strictEqual(a7Set.plusFraction, true, "plusFraction should be true for dedicated mode");
        });

        test("terminal set with blank verdict and no envelope derives closed-verified (S5 verification round 1)", async () => {
            // Locks the set-terminal branch of the TS ladder through the
            // real scan: the raw set-level status ("complete") must reach
            // deriveWorkflowState — two reviewers claimed liveSession is
            // an in-flight-only tracker whose status is null on complete
            // sets; this fixture proves the wiring is correct end-to-end.
            const setDir = path.join(testRoot, "docs", "session-sets", "terminal-blank-verdict");
            fs.mkdirSync(setDir, { recursive: true });
            fs.writeFileSync(
                path.join(setDir, "spec.md"),
                "## Session Set Configuration\n```yaml\ntier: lightweight\nverificationMode: dedicated-sessions\n```",
            );
            fs.writeFileSync(path.join(setDir, "activity-log.json"), JSON.stringify({ entries: [] }));
            fs.writeFileSync(path.join(setDir, "session-state.json"), JSON.stringify({
                schemaVersion: 4,
                sessionSetName: "terminal-blank-verdict",
                status: "complete",
                totalSessions: 2,
                sessions: [
                    { number: 1, title: "W", status: "complete", startedAt: "t1", completedAt: "t1b", orchestrator: { engine: "copilot", provider: "anthropic" }, verificationVerdict: null },
                    { number: 2, title: "Verification round 1", type: "verification", status: "complete", startedAt: "t2", completedAt: "t2b", orchestrator: { engine: "copilot", provider: "openai" }, verificationVerdict: null },
                ],
            }));

            const sets = await readSessionSets(testRoot);
            assert.strictEqual(sets.length, 1);
            assert.strictEqual(
                sets[0].workflowState,
                "closed-verified",
                "terminal blank-verdict/no-envelope set must keep the legacy closed-verified reading",
            );
        });

        test("should fall back to spec seed when no activity-log record exists", async () => {
            const setDir = path.join(testRoot, "docs", "session-sets", "seed-fallback-set");
            fs.mkdirSync(setDir, { recursive: true });

            const specContent = "## Session Set Configuration\n```yaml\ntier: lightweight\nverificationMode: out-of-band-or-none\n```";
            fs.writeFileSync(path.join(setDir, "spec.md"), specContent);

            const activityLogContent = JSON.stringify({ entries: [] });
            fs.writeFileSync(path.join(setDir, "activity-log.json"), activityLogContent);

            const sets = await readSessionSets(testRoot);
            assert.strictEqual(sets.length, 1);
            const fallbackSet = sets[0];

            assert.strictEqual(fallbackSet.config.verificationMode, "out-of-band-or-none", "Verification mode should come from spec.md");
            assert.strictEqual(fallbackSet.workflowState, null, "Workflow state should be null for non-dedicated sets (per test spec)");
        });
    });

    suite("readLatestIssuesEnvelope()", () => {
        test("should return null for an empty directory", async () => {
            const result = await readLatestIssuesEnvelope(testRoot);
            assert.strictEqual(result, null);
        });

        test("should select the file with the highest session number", async () => {
            const expectedContent = { issues: [{ id: "s3" }] };
            fs.writeFileSync(path.join(testRoot, "s1-issues.json"), JSON.stringify({ issues: [{ id: "s1" }] }));
            fs.writeFileSync(path.join(testRoot, "s3-issues.json"), JSON.stringify(expectedContent));
            fs.writeFileSync(path.join(testRoot, "s2-issues.json"), JSON.stringify({ issues: [{ id: "s2" }] }));

            const result = await readLatestIssuesEnvelope(testRoot);
            assert.deepStrictEqual(result, expectedContent);
        });

        test("should select the file with the highest round number for the same session", async () => {
            const expectedContent = { issues: [{ id: "s2r3" }] };
            fs.writeFileSync(path.join(testRoot, "s2-issues.json"), JSON.stringify({ issues: [{ id: "s2r1" }] }));
            fs.writeFileSync(path.join(testRoot, "s2-issues-round-3.json"), JSON.stringify(expectedContent));
            fs.writeFileSync(path.join(testRoot, "s2-issues-round-2.json"), JSON.stringify({ issues: [{ id: "s2r2" }] }));

            const result = await readLatestIssuesEnvelope(testRoot);
            assert.deepStrictEqual(result, expectedContent);
        });

        test("should skip malformed JSON files and select the next highest", async () => {
            const expectedContent = { issues: [{ id: "s3" }] };
            fs.writeFileSync(path.join(testRoot, "s4-issues.json"), "{ not json,");
            fs.writeFileSync(path.join(testRoot, "s3-issues.json"), JSON.stringify(expectedContent));
            fs.writeFileSync(path.join(testRoot, "s2-issues.json"), JSON.stringify({ issues: [{ id: "s2" }] }));

            const result = await readLatestIssuesEnvelope(testRoot);
            assert.deepStrictEqual(result, expectedContent);
        });
    });
  });

  suite("UI Text Generation", () => {
    suite("verificationOwedText()", () => {
      test("should return 'verification owed' for awaiting-verification state", () => {
        assert.strictEqual(verificationOwedText(set({ workflowState: "awaiting-verification" })), "verification owed");
      });
      test("should return 'remediation owed' for awaiting-remediation state", () => {
        assert.strictEqual(verificationOwedText(set({ workflowState: "awaiting-remediation" })), "remediation owed");
      });
      test("should return empty string for awaiting-human state", () => {
        assert.strictEqual(verificationOwedText(set({ workflowState: "awaiting-human" })), "");
      });
      test("should return empty string for other states", () => {
        assert.strictEqual(verificationOwedText(set({ workflowState: "work-in-progress" })), "");
        assert.strictEqual(verificationOwedText(set({ workflowState: "closed-verified" })), "");
      });
      test("cancelled rows never show owed words (terminal suppression)", () => {
        // "cancelled" is non-terminal to the derivation ladder (only
        // "complete" is), so the guard lives in the text helper — an
        // abandoned Mode-B set must not nag forever.
        assert.strictEqual(
          verificationOwedText(
            set({ state: "cancelled", workflowState: "awaiting-verification" }),
          ),
          "",
        );
      });
    });

    suite("progressText()", () => {
      test("should append '+' when plusFraction is true and sessions exist", () => {
        const sessionSet = set({ sessionsCompleted: 2, totalSessions: 3, plusFraction: true, liveSession: null });
        assert.strictEqual(progressText(sessionSet), "2/3+");
      });

      test("should not append '+' when plusFraction is false", () => {
        const sessionSet = set({ sessionsCompleted: 2, totalSessions: 3, plusFraction: false, liveSession: null });
        assert.strictEqual(progressText(sessionSet), "2/3");
      });

      test("should not append '+' when totalSessions is 0", () => {
        const sessionSet = set({ sessionsCompleted: 0, totalSessions: 0, plusFraction: true, liveSession: null });
        assert.strictEqual(progressText(sessionSet), "");
      });
    });
  });

  suite("resolveStartNextSessionPrompt()", () => {
    const baseSet = {
        name: "my-test-set",
        root: "/fake/root",
        dir: "/fake/root/docs/session-sets/my-test-set",
        specPath: "/fake/root/docs/session-sets/my-test-set/spec.md",
        activityPath: "/fake/root/docs/session-sets/my-test-set/activity-log.json",
        statePath: "/fake/root/docs/session-sets/my-test-set/session-state.json",
    };

    test("returns the generic work prompt for null/undefined/quiet states", () => {
        const expected = "Start the next session of `my-test-set`.";
        assert.strictEqual(
          resolveStartNextSessionPrompt(set({ ...baseSet, workflowState: null })).prompt,
          expected,
        );
        assert.strictEqual(
          resolveStartNextSessionPrompt(set({ ...baseSet })).prompt,
          expected,
        );
        assert.strictEqual(
          resolveStartNextSessionPrompt(set({ ...baseSet, workflowState: "work-in-progress" })).prompt,
          expected,
        );
    });

    test("awaiting-verification routes to the kickoff prompt and says so", () => {
        const { prompt, message } = resolveStartNextSessionPrompt(
          set({ ...baseSet, workflowState: "awaiting-verification" }),
        );
        assert.ok(prompt.includes("--type verification"));
        assert.ok(prompt.includes("Mode B"));
        assert.ok(prompt.includes(MODE_B_MIN_ROUTER_VERSION));
        assert.ok(message.includes("verification owed"));
    });

    test("awaiting-remediation routes to the remediation prompt and says so", () => {
        const { prompt, message } = resolveStartNextSessionPrompt(
          set({ ...baseSet, workflowState: "awaiting-remediation" }),
        );
        assert.ok(prompt.includes("--type remediation"));
        assert.ok(prompt.includes("sN-issues*.json"));
        assert.ok(prompt.includes(MODE_B_MIN_ROUTER_VERSION));
        assert.ok(message.includes("remediation owed"));
    });

    test("awaiting-human does NOT auto-route (a human decides next)", () => {
        const { prompt } = resolveStartNextSessionPrompt(
          set({ ...baseSet, workflowState: "awaiting-human" }),
        );
        assert.strictEqual(prompt, "Start the next session of `my-test-set`.");
    });
  });
});
