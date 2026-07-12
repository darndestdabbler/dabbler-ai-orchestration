# Up-front conventions block — Set 095 Session 1 (docs deliverable set)

## Severity rubric (OPERATOR-SET, 2026-07-12 — grade by expected consequence)

Severity is defined by the EXPECTED CONSEQUENCE of not fixing the finding:
probability that the consequence actually materializes for a real user of
this artifact, times the impact on the solution's objectives (here: a
three-person team successfully completing the walkthrough, and the review
prompt returning trustworthy, evidence-cited coaching).

- **Critical**: consequence is likely on the main path AND severely
  damages the objective (e.g. the walkthrough stalls unrecoverably; the
  review prompt asserts false violations as fact).
- **Major**: consequence is LIKELY for a typical literal follower AND
  materially impairs the objective — you must state the concrete failure
  scenario and why it is probable, not merely possible.
- **Minor**: everything where the probability is low (unusual repo
  configurations, edge-case layouts, adversarial or self-inflicted
  states) OR the impact is small (a confusing-but-recoverable moment, a
  wording nit, defense-in-depth hardening, epistemically-cleaner
  reporting). Low-probability OR low-impact = Minor, even when the
  observation is technically correct.

A finding with no stated, plausible failure scenario is Minor by
definition. Do not label hardening opportunities as Major.

## Cross-round issue ledger (settled points — do not resurrect)

- R1 (4 Majors, all fixed + re-dogfooded): integration codeRoots ownership;
  hotfix tag on the hotfix commit; owner-review four-fact evidence model +
  gh gathering + ADVISORY cap; integration prerequisites + post-merge start.
- R2 (5 Majors, all fixed + re-dogfooded): P3 touches exception; tag
  targets/ancestry evidence + no-presumably + P5 coverage-only scope; CI
  path job per module + required-checks selection step; serialized set
  generation; local+remote branch sweep.
- R3 (6 Majors, all fixed): branch protection moved AFTER the Part-3
  scaffold push (admin-bypass note added; no direct push under protection
  remains); Part 5 fully serialized (Sam lands 002 before Alex generates
  003 — the step-order contradiction removed); the review-prompt companion
  link added to the consumer-bootstrap template (goldens + dist regenerated);
  fetch outcome recorded + origin/main scope-diff base; tag ranges/ancestry
  grouped per tag family with rev-list proof; `changes` job required +
  skipped-check limitation named with the aggregate-gate production pattern.

- R4 (2 Majors, all fixed): Part 4 gained the explicit numbered landing
  step (authoring branch → PR → teammate browser-approval → merge → pull;
  branch name deliberately NOT session-set/* to avoid the worktree branch
  collision) and Part 5's opening now assumes the merge; the evidence
  script + prompt gather dated branch tips (for-each-ref committerdate)
  and per-branch divergence counts, and Principles 1/7 cap at ADVISORY
  without age/drift evidence.

- R5 (2 Majors, all fixed): local-checkout sync after every browser merge
  (`git switch main && git pull --ff-only`) added to Parts 5/8/9 before
  worktree close / tree-state expectations; the review prompt's coverage
  scoring now resolves CODEOWNERS with last-match-wins semantics
  (effective owner sets, final matching pattern cited) in P5, P4's
  coverage fact, the extraction instruction, and the report template.

- R6: VOID-BY-EVIDENCE (orchestrator process error — the session was
  already committed, so the default diff-vs-HEAD bundle was ~empty; the
  verifier's single finding correctly says "nothing to review"). Not a
  substantive round; artifact retained raw. All later rounds run with
  `--diff-base 34d4149` (the pre-session ref).
- R7 (2 Majors, both fixed): the walkthrough's all-modules CI command is
  now guarded for the pre-implementation state (`if [ -d services ]`,
  since the guardrails PR merges before any module code exists on main);
  the evidence script's remote-branch dedupe now compares COMMIT IDs, so
  a stale local branch can no longer suppress its newer remote twin.
  (No dogfood re-run for R7: the dedupe change is remote-repo logic the
  remote-less scratch repo cannot exercise, and the CI guard is
  walkthrough YAML — the doc-embedded script was re-syntax-checked.)

- R8 (1 Major, fixed): the routed recipe now gathers from ONE coherent
  repository state — fetch first, resolve the review base
  (origin/main → main fallback), read every policy file from that COMMIT
  via `git show` / `git ls-tree` (never the working tree), gather a
  branch-added set's spec.md from the branch itself, and the prompt
  instructs path-aware agents to disclose/ADVISORY-cap on any
  checkout-vs-base mismatch or fetch failure. Dogfood parity round 6 run
  with the updated gathering.

- R9 (2 Majors, both fixed): Part 7 now ships the COMPLETE final
  monorepo-ci.yml (trigger, `changes` filter with three outputs, three
  path-scoped module jobs named exactly as the required checks, and the
  all-modules guardrail) instead of hand-assembly instructions; the
  guardrail iterates each `services/*/` directory explicitly and FAILS
  on a zero-tests run (plain `unittest discover -s services` does not
  descend into non-package subdirs and exits 0 on "Ran 0 tests" — the
  vacuous-green hole is closed and named in the tutorial's notes).

- R10 (2 Majors, both fixed): (1) branch cleanup is now taught end-to-end
  — GitHub's "Automatically delete head branches" enabled in the Part 3
  settings step, a local `git branch -d` (+ `git fetch --prune`) at every
  merge point (authoring, guardrails, both session sets, integration,
  hotfix), and a no-lingering-merged-branches self-check item; (2) P6 now
  carries the production-target rule — tag mechanics are provable from
  git, production-runs-a-tag needs deployment evidence (tag-triggered
  deploy workflow / release record), and without it the principle caps
  at ADVISORY with the mechanics result reported (template hint updated).

- R11 (2 Majors, both fixed): (1) the `changes` job's `permissions:` block
  now grants `contents: read` alongside `pull-requests: read` (declaring
  any permission zeroes the rest, which would break checkout on private
  repos) — fixed in the tutorial AND the shipped scaffold template's
  worked example (sibling site, L-069-1; goldens + dist regenerated,
  unit suite green twice); (2) the per-module PR jobs now use a
  count-tests-then-run runner that FAILS on zero collected tests, and
  the all-modules guard counts collected tests instead of globbing
  test files. Scratch repo rebuilt to match; parity dogfood re-run
  SKIPPED this round (recorded, not silent: CI job internals don't
  change the review's verdict shape — P7 checks the all-modules job's
  presence/trigger, which is unchanged).

- R12 (2 Majors, both fixed): (1) the all-modules guardrail now FAILS on
  any module directory with zero collected tests (and on an empty
  services/), instead of skip-and-total — no module can be silently
  untested while the aggregate stays green; (2) Part 10's hotfix cleanup
  now carries the full post-browser-merge sync block (switch main, pull
  --ff-only, branch -d, fetch --prune) plus the squash/rebase `-d`
  refusal note.

- R13 (2 Majors, both fixed): (1) Part 5 now has Sam and Alex each run
  `Dabbler: Install ai-router` once after cloning (the .venv is
  gitignored and per-machine — fresh clones otherwise cannot run the
  worktree commands); (2) the hotfix drill now validates BEFORE tagging:
  push branch → PR (pull_request trigger runs the path-scoped job on any
  branch) → approval + green CI → tag the validated hotfix commit →
  deploy → merge → sync/cleanup.

- R14 (2 Majors, both fixed): (1) Sam and Alex now get complete explicit
  authoring-branch command blocks (authoring/002-clock-hello /
  authoring/003-integration-compose: switch -c, add, commit, push, PR,
  approval, merge, pull, branch -d) — the `<your-authoring-branch>`
  placeholder is gone; (2) the Part 7 guardrail claim is scoped honestly
  (existing module dirs cannot pass untested; an entirely-missing
  declared directory is owned by PR review + a new explicit self-check
  item asserting every declared codeRoot exists on main with tests) —
  claim-scoping chosen over more CI machinery per the operator's
  simplicity-first principle.

- R17 (1 Major, fixed — graded Major under the operator's new
  consequence rubric): P4's coverage fact is now judged on the CHANGED
  touched paths' effective owners aggregated per PR (never on the
  integration module's own directories), covering both integration
  shapes including the house-default `codeRoots: []`; Good example and
  report-template hint updated to match.
- R16 (1 Major, fixed): Part 1 gained the grant-teammates-access step
  (Settings > Collaborators > invite @sam-gh and @alex-gh with Write;
  accept invitations before Part 4; org-team alternative noted) — without
  it the personal-account path stalls at the first protected PR.
- R15 (2 Majors, both fixed): (1) the hotfix drill now validates the
  EXACT commit being tagged with a local test run at the hotfix head
  (the PR check runs on GitHub's preview merge with main — noted in the
  text); (2) the squash/rebase `git branch -d` caveat is now stated once
  as a global rule at the FIRST cleanup point (Part 4) covering every
  later cleanup, with Part 10's note retained.

A settled point never reopens under fresh wording. New findings must be
NEW defects, material at Critical/Major, in the artifacts as they now stand.
The operator has directed the loop to continue while findings remain
genuinely Major; rounds run against the full session delta
(`--diff-base 34d4149`). NOTE the materiality trend: R10-R15 findings are
narrower than R1-R3's; roughly half since R11 were defects or overclaims
in remediation-added content — the fix-churn regime the framework
discussion targets.

## Suite baseline (all run locally at close; exact counts)

- pytest: 2922 passed / 6 skipped.
- Extension unit (Layer 2): 1487 passing — includes the Set 095 moved
  template pins in sessionGenPrompt.test.ts and the regenerated cold-start
  goldens (deliberate, reviewed regeneration via UPDATE_GOLDEN after the
  template re-cut).
- Playwright (Layer 3, local per L-064-12): 26 passed.
- tsc --noEmit: clean.

## Release contract

- Extension version stays 0.42.0 (Unreleased). No version bump in this set:
  the 091-094 release boundary VSIX simply absorbs the re-cut bundled
  template; publish remains operator-gated (tag vsix-v0.42.0). No
  dabbler-ai-router bump either.
- media/getting-started.png is KNOWN-stale (pre-redesign form) — recorded in
  the 0.42.0 CHANGELOG pre-publish note as an operator retake item. It is a
  pre-existing condition this set documents, not a defect introduced here.

## By-design scope and exclusions

- This is a docs-deliverable set (spec: pathAwareCritique none, requiresE2E
  false). Deliverables: docs/tutorials/module-team-hello-world.md,
  docs/tutorials/module-team-hello-world-review-prompt.md, onboarding links
  (root README, docs/quick-start.md, extension README), and the 094-deferred
  getting-started.md.template re-cut. The only extension-source changes are:
  the bundled template, the atomically-moved content pins in
  sessionGenPrompt.test.ts, and a stale-comment sweep in planImport.ts.
  dist/* and test-fixtures/cold-start/* changes are generated from those.
- requiresUAT: suggested was NOT armed — no operator opt-in was available at
  session start (autonomous close). Per the spec's own rationale, the
  walkthrough is authored to the Set 078 UAT instruction bar and doubles as
  the operator's natural, optional hands-on walk after close.
- The dogfood (spec step 4) exercised the walkthrough's file/git/CLI
  end-state on a scratch repo plus the planted violation, and ran the review
  prompt through its own shipped routed recipe (raw output:
  s1-dogfood-review.md — an immutable routed artifact). Driving the VS Code
  UI clicks live is exactly the operator's optional walk; the UI behavior
  itself shipped (with its own gates and UAT) in Sets 092-094.
- The walkthrough's GitHub-side expectations (branch protection prompts,
  CODEOWNERS review-request behavior, Actions runs) are GitHub-hosted
  behavior that cannot be exercised from this repo; they were verified
  against GitHub's documented semantics (e.g. code owners are never
  review-requested on their own PRs) rather than a live run.
