# Set 102 Session 1 — remediation sidecar for discovery round 1

Discovery round 1 (gpt-5-6, reduced fan-out 1/2 — the second identical call
timed out twice at the provider; the CLI accepted the round as reduced) found
1 Major + 6 nits. The supplementary completeness pass (round 2, gpt-5-6)
returned VERIFIED with nothing new. Merged harvest remediated once, below.

## Major 1 — URL-encoded ADO project/repository names not decoded: FIXED

- `splitRemote()` now decodes every path segment to its logical value
  (`decodeSegment`: `decodeURIComponent`, malformed escapes kept literally,
  never thrown), so `az --project` receives `My Project`, not
  `My%20Project`.
- The web-URL builders keep their single `encodeURIComponent`, which now
  encodes decoded values exactly once — the `%2520` double-encoding is gone
  (pinned by a dedicated no-`%2520` test).
- The test that wrongly pinned the encoded value was corrected and extended
  (decoded project+repo, malformed-escape literal, once-only re-encoding).

## Nits

1. **az extension/auth preflight incomplete — DEFERRED (by design).** The
   filesystem-probe posture deliberately mirrors `copilotCli.ts` ("a
   filesystem probe, not an execution probe"), the module comment says so,
   and the PR-command failure path surfaces the exact extension/auth
   guidance plus the browser fallback, so the user is never stranded. An
   execution-level probe (az extension list / auth status) is a fit for
   Session 2/3 polish if the operator's live ADO walk shows the failure-path
   UX is not enough. Recorded as a named residual, not an oversight.
2. **Finalize offered ANY branched worktree — FIXED.** The candidate filter
   is now `w.branch?.startsWith(SESSION_BRANCH_PREFIX)`; an unrelated linked
   worktree is never offered for removal (new test pins it).
3. **Detached linked worktrees silently excluded — DEFERRED.** With fix 2
   the exclusion is now by-rule (only session-set/* branches are
   candidates); a detached worktree cannot be a session worktree candidate
   by construction. Explicit stale-worktree reporting stays a possible
   Session 2 nicety; `git worktree prune` inside the idempotent remove step
   already handles the stale-registration case.
4. **ADO create-PR fallback used bare branch names — FIXED.** `sourceRef` /
   `targetRef` now carry `refs/heads/...` full refs, single-encoded (tests +
   the armed UAT walk expectation updated).
5. **`_git` located case-sensitively — FIXED.** `gitSegmentIndex()` compares
   case-insensitively (test added).
6. **Workspace at a repo subdirectory refused as "inside a worktree" —
   FIXED.** The guard now compares `git rev-parse --show-toplevel` against
   the primary root, so only a genuine linked worktree is refused (tests for
   both directions).

## Post-remediation evidence

- Extension unit suite: 1713 passing (95 Set-102 tests after the additions).
- Real-git dogfood harness: 3 passing (re-run post-fix).
- `npx tsc --noEmit` clean; esbuild compile clean; dist rebuilt.
