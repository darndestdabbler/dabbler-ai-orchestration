# Session 1 — remediation for verification rounds 1 (discovery) + 2 (supplementary)

Both discovery passes ran with the up-front conventions block (suite baseline,
docs-only release contract, and the by-design exclusions the 2-session split
creates). The verifier honored the conventions — it flagged NONE of the
by-design exclusions (draft banner, `Passes: null`, "pipeline not yet run") — and
surfaced **7 distinct, genuinely real defects** across the two passes. All 7 are
agreed (none disputed) and all were fixed in docs (this set ships no code).

## Round 1 (discovery) — 6 findings deduplicating to 4 distinct defects

### F1 — Pipeline registered before its YAML is pushed (Major, Correctness; calls 1 & 4) — FIXED
Part 7 registered the ADO pipeline (select `/azure-pipelines.yml`) *before*
committing/pushing the file, but ADO can only register a pipeline from a YAML it
can see in the repo. **Fix:** Part 7 reordered — step 2 now commits + pushes
`azure-pipelines.yml` on `chore/guardrails` and opens the PR *first*; step 3
registers the pipeline against the pushed `chore/guardrails` branch; step 4 sets
the branch policies; step 5 completes the PR (re-queueing Build validation, which
was added after the PR opened). UAT Walk 7 reordered to match (push first, then
register), with an explicit "ORDER MATTERS" note.

### F2 — UAT checklist skips Part 5; Walks 9–10 assume clock/integration exist (Major, Completeness; calls 1 & 2) — FIXED
Walk 5 authored only greeter; Walks 9–10 assumed clock (002) and integration
(003) were authored, run, and merged, but no walk did that. **Fix:** Walk 5 now
authors ALL THREE session sets (Part 4 greeter + Part 5 clock & integration,
serially, each landed as a PR); Walk 6 runs the greeter AND clock sessions; Walk 8
completes + finalizes BOTH greeter and clock — so Walk 9's "greeter and clock
merged; integration unblocked" precondition and Walk 10's "all three Complete"
precondition are genuinely established. Notes order-map updated (Parts 4-5).

### F3 — A brand-new ADO org has no hosted parallel-jobs grant (Major, Completeness; call 1) — FIXED
`pool: vmImage: ubuntu-latest` needs a Microsoft-hosted parallel-jobs grant, and
a fresh org often starts with zero, so the first pipeline run stays queued and the
half-day walk stalls. **Fix:** added the precondition in three places — Part 0
prerequisite 6, a Part 7 step-3 "Hosted-agent capacity" callout (request the free
grant days ahead, or use a self-hosted pool + `pool: name:` change), and the UAT
Notes + Walk 7 PRECONDITION line. This aligns with the spec's own Session-2
precondition ("parallel-job grant or self-hosted agent sufficient to run one small
pipeline"), now surfaced in the reader-facing doc.

### F4 — `changes` job cannot resolve `origin/$TARGET` (Major, Correctness; call 2) — FIXED
`git fetch --no-tags origin main` only writes `FETCH_HEAD`; `git merge-base HEAD
origin/main` then fails and, under `set -euo pipefail`, aborts the job red (the
"run everything" fail-safe never triggers). **Fix:** the `changes` job now fetches
with an explicit refspec `+refs/heads/$TARGET:refs/remotes/origin/$TARGET` and
resolves the base as `git merge-base HEAD "refs/remotes/origin/$TARGET" || true`
— so the ref is actually created AND a failed merge-base falls through to the
run-everything fail-safe instead of aborting. Embedded pipeline re-validated
(parses; structure lints).

## Round 2 (supplementary) — 3 further distinct defects

### F5 — `changes` checkout lacks `persistCredentials` (Major, Correctness) — FIXED
Azure Pipelines does not leave its OAuth token in git config unless the checkout
requests `persistCredentials: true`, so the `changes` job's `git fetch` fails auth
on a private repo. **Fix:** added `persistCredentials: true` to the `changes`
job's `checkout: self` (only that job fetches; the other jobs operate on the
checked-out tree and need nothing). Re-validated.

### F6 — UAT Walk 4 leaves generated `NNN-default-*` sets behind (Major, Completeness) — FIXED
Walk 4 deleted only `001-default-plan`, `002-default-decomposition`, and
`docs/modules/default`, but the decomposition session also writes `NNN-default-*`
specs, so the Getting Started form would not return as the next step assumes.
**Fix:** the `rm` is now `rm -rf docs/session-sets/*-default-* docs/modules/default`
(matches the tutorial's Part 3), with a note that the form only returns once the
last default set is gone.

### F7 — UAT Walk 10 hotfix drill incomplete (Major, Completeness) — FIXED
Walk 10 jumped from the hotfix commit straight to `Cut release tag`, skipping the
hotfix PR, CI/Build-validation, exact-commit integrated validation, deploy, PR
completion, and branch cleanup that Part 10 documents. **Fix:** Walk 10 expanded
to the full Part-10 flow (tag v0.1.0 → deploy → hotfix branch → hotfix PR + green
CI → local integrated suite on the exact commit → tag v0.1.1 on the hotfix commit
→ deploy + complete + cleanup → rollback), each step with a literal expectation.

## Machine re-checks after remediation
- Embedded `azure-pipelines.yml` parses (`yaml.safe_load`) and structure lints;
  `persistCredentials: true` and the explicit-refspec/`|| true` fixes confirmed
  present in the `changes` job.
- Tutorial: no banned drift-guard phrases; all 13 `Dabbler:` command titles still
  match `package.json`; all relative links resolve.
- UAT checklist: JSON parses; 11 walks; every `Passes` still `null` (authored,
  not walked — Session 2 fills them in live).
- Suites unchanged (docs-only): unit 1767, pytest 3030/6 skip, drift-guard 25/25.

## Round 3 (remediation-review) — 6 fixes accepted, 1 rejected → fixed

The fix-delta review ACCEPTED F1/F3/F4/F5/F6/F7 (ledger L1,L3,L5,L7,L8,L9) and
REJECTED the F2 fix (ledger L2/L6): I had extended Walks 5, 6, and 8 to author
all three sets and run+merge greeter+clock, but left **Walk 9** unchanged, so the
integration set was never actually run/completed/finalized — Walk 10's "all three
Complete" precondition was still unattainable.

### F2b — Walk 9 did not take integration to Complete (Major, Completeness; L2/L6) — FIXED
**Fix:** Walk 9 extended to the full lifecycle — run the `003-integration-compose`
session in its worktree, open the PR, get BOTH required-owner approvals + green
Build validation, complete the PR (delete source branch), run `Dabbler: Finalize
merged set`, and verify `003-integration-compose` in the Complete bucket. Now all
three sets are genuinely Complete before Walk 10 begins. UAT JSON re-validated (11
walks parse).
