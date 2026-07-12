# Up-front conventions block — Set 095 Session 1 (docs deliverable set)

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

A settled point never reopens under fresh wording. New findings must be
NEW defects, material at Critical/Major, in the artifacts as they now stand.

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
