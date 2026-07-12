# Change Log — Set 095: Module Hello World Walkthrough

> The re-homed Set 087 S4 scope, re-cut against the shipped 091–094
> module-first Work Explorer UX (per the operator-confirmed verdict: this
> work lands after Set D). Single-session set. Closes out the 087-S3
> human sign-off on the surfaces that survived the redesign, on the
> module-authoring journey the walkthrough exercises.

## Session 1 — Walkthrough, AI feedback prompt, dogfood & set close

- **`docs/tutorials/module-team-hello-world.md`** — the three-person
  (Priya/`greeter`, Sam/`clock`, Alex/`integration` with
  `touches: [greeter, clock]`) Hello World walkthrough on the NEW flow,
  written to the Set 078/087-S3 instruction bar (literal button/command
  names, per-part "Where you are" preambles, blockquoted **Expect:**
  observations, a closing self-check checklist): init trunk → **Build
  project structure** → **Define modules (optional)** via the D6
  decomposition prompt → the palette-first first plan + set (the key
  sequencing fact: the form is replaced by the tree only once the first
  set exists) → per-module row actions (**AI Plan** / **Import Plan…** /
  **Open Plan** / **AI Sets**, module-stamped and globally-unique) →
  worktrees (`python -m ai_router.worktree open <slug>`) → CODEOWNERS +
  path-scoped/all-module CI → small PRs → the integration set reviewed by
  both touched owners → tag `v0.1.0` → deploy-from-tag → hotfix-from-tag
  (`v0.1.1`) → rollback-to-tag. The cast intentionally matches the
  scaffolded CODEOWNERS template's worked example.
- **`docs/tutorials/module-team-hello-world-review-prompt.md`** — the
  reusable, engine-agnostic AI feedback prompt: seven scored principles
  (trunk hygiene; name uniqueness + `module:` correctness; directory
  discipline vs `codeRoots`; integration `touches` + owner review;
  CODEOWNERS coverage; tag correctness / production-as-a-tag;
  integration-bomb symptoms), evidence-citation-required PASS/ADVISORY/FAIL
  output, coaching tone, "Top 3 next actions". Two run paths: paste into a
  path-aware agent, or `route(task_type="analysis")` — the routed recipe
  gathers an **evidence bundle** first (a routed API model cannot read the
  repo; the prompt accepts either self-gathered or bundled evidence).
- **Authoring discipline:** both docs were drafted via
  `route(task_type="documentation")` (gemini-2.5-pro, tier 2; the router's
  second-provider auto-verify caught two Majors on the walkthrough draft),
  then fidelity-re-checked claim-by-claim against the extension source
  (the 094 S2 calibration note / L-064-8). Real doc↔code defects fixed in
  that pass: `Dabbler: Import Project Plan` is a module-picker + file
  picker (not an AI prompt); CODEOWNERS never review-requests a PR's own
  author (the walkthrough now teaches where the ownership rules DO bite —
  the integration PR); no direct pushes to a just-protected `main`; the
  literal starter-line quoting; `.gitignore` for the scaffolded `.venv`.
- **Dogfood (planted violation):** built a scratch `hello-modules` repo to
  the walkthrough's exact end-state (manifest, plans, three merged
  module-stamped sets, adapted CODEOWNERS + two-layer CI, `v0.1.0`,
  hotfix `v0.1.1`) plus set `004-greeter-polish` (`module: greeter`)
  editing `services/clock/clock.py` on its in-flight branch. The shipped
  review prompt, run via its own routed recipe (gemini-2.5-pro, $0.02),
  returned **Principle 3 FAIL with the exact citation** (branch, owning
  module's `codeRoots`, offending path, the diff command) and actionable
  coaching; the other six principles PASS/ADVISORY with real citations.
  Raw output: `s1-dogfood-review.md`. The walkthrough's worktree claims
  were verified literally against the CLI (`worktree open`/`list` on the
  scratch repo).
- **Onboarding links + the 094-deferred teaching-doc re-cut:** root
  README, `docs/quick-start.md`, and the extension README now link both
  tutorials; `docs/templates/consumer-bootstrap/getting-started.md.template`
  re-cut for the shipped UX (Work Explorer name; **Define Modules
  (Optional)** section; palette-first sequencing; row actions; left-click
  starter line; parallel guidance re-homed to the advanced palette
  command) — closing the 0.42.0 pre-publish caveat's doc half. Template
  content pins in `sessionGenPrompt.test.ts` moved atomically; cold-start
  goldens + bundled `dist/templates` regenerated; a stale `planImport.ts`
  caller comment swept.
- **Operator flag (pre-publish, cosmetic):** `media/getting-started.png`
  still shows the pre-redesign three-step form while the README captions
  it as two-section — retake in a live VS Code window (the 0.42.0
  CHANGELOG pre-publish note now says exactly this). Screenshots are the
  only remaining piece of the 094 deferral.

## Verification & suite

- Suite at close: pytest 2922 passed / 6 skipped (re-run after the final
  doc state); extension unit 1487 (re-run after each template change,
  including the moved pins + twice-regenerated goldens); Playwright
  Layer 3 26 passed (run locally per L-064-12); `tsc --noEmit` clean.
- Cross-provider verification (gpt-5-6, anthropic excluded): **R1
  ISSUES_FOUND — four Majors, all accepted and fixed in flight**: (1) the
  tutorial's integration module claimed `codeRoots: []` while its set
  created `services/integration/` — the manifest/cast now give integration
  its composition root (both shapes documented as legal); (2) the hotfix
  drill tagged post-merge `main` — `v0.1.1` now goes on the hotfix commit
  itself (the primer's two ambiguous echoes clarified in the same pass,
  L-065-1); (3) the review prompt could score owner review from local
  artifacts — its owner-review principle now separates coverage /
  auto-request / enforcement / completed-approval facts, gathers `gh` PR
  review data best-effort, and caps at ADVISORY without it; (4) the
  integration worktree opened before its dependencies existed — the set
  now declares `prerequisites:` on 001+002 and Alex starts from the
  post-merge `main` (Parts 5/6/9 resequenced). The dogfood was re-run on
  the rebuilt scratch repo (`s1-dogfood-review-round-2.md`): the planted
  violation still FAILs with exact citations, and owner-review now returns
  ADVISORY with the four-fact separation honored.
- **R2 ISSUES_FOUND — five fresh Majors, all accepted and fixed in
  flight**: (1) Principle 3 contradicted Principle 4 for
  `touches`-sanctioned edits — P3 now carries the explicit `touches`
  exception in its allowed-path rule; (2) tag-correctness could PASS
  without ancestry evidence (the R2 dogfood wrote "presumably") — the
  evidence bundle now gathers decorated logs, peeled tag targets, and
  per-tag range logs, P6 requires ancestry for a PASS (ADVISORY
  otherwise, "presumably" banned), and P5 is scoped to coverage-only
  (enforcement claims prohibited); (3) the tutorial's CI teaching had no
  integration path job and never selected required status checks — Part 7
  now builds one filter + job per module and adds the
  return-to-branch-protection step (Part 1 says why it must wait);
  (4) Sam and Alex could race to the same set number — Part 5 now
  serializes (Sam lands `002`, Alex pulls, then generates `003`) and
  names the fail-loud uniqueness backstop; (5) the routed evidence script
  enumerated only local branches — it now sweeps local + remote
  session-set branches (skipping `origin/HEAD` and upstream duplicates).
  Dogfood round 3 re-run against the fixed artifacts
  (`s1-dogfood-review-round-3.md`): the planted violation FAILs citing the
  missing `touches` sanction, and both owner-review and tag-ancestry land
  on honest ADVISORY rather than guessed PASSes.
- **R3 ISSUES_FOUND — six fresh Majors, all accepted and fixed in
  flight**: (1) Part 1 protected `main` and Part 3 then pushed straight to
  it (with a wrong claim about when protection bites) — protection now
  goes on at the END of Part 3, after Priya's two solo setup pushes, with
  the admin-bypass option named; (2) the R2 serialization fix left Part
  5's steps contradicting themselves (Alex's generation was still listed
  before the sync point) — Part 5 is now strictly Sam-lands-002 →
  Alex-pulls-and-generates-003; (3) the consumer-bootstrap teaching doc
  linked only the walkthrough — the review-prompt companion link added
  (goldens + bundled dist regenerated); (4) the evidence script's fetch
  outcome is now recorded and scope diffs use `origin/main` when present
  (stale-base misattribution closed); (5) tag range/ancestry checks now
  group per tag family (repo-wide `v*` vs per-module `<slug>-v*`) with a
  `rev-list` ancestry proof per pair; (6) the required-checks step now
  includes the `changes` filter job and names the skipped-check
  limitation plus the always-running aggregate-gate production pattern.
  Dogfood round 4 re-run end-to-end on the new gathering
  (`s1-dogfood-review-round-4.md`): the planted violation FAILs citing the
  missing `touches` sanction, and tag correctness reaches an *evidenced*
  PASS ("v0.1.1 contains only the single hotfix commit") — validating the
  family/ancestry gathering.
- **R4 ISSUES_FOUND — two fresh Majors (finding count converging
  4→5→6→2), both accepted and fixed in flight**: (1) the R3 protection
  resequencing left Part 4 with no numbered step actually landing `001`
  through the protected trunk — Part 4 step 6 now branches
  (`authoring/…`, deliberately not the reserved `session-set/…` worktree
  name), PRs, gets a browser approval from a not-yet-cloned teammate,
  merges, and pulls; (2) Principles 1/7 score branch age/drift but the
  evidence had no dates — the script + prompt now gather dated branch
  tips and per-branch divergence counts, with P1/P7 capped at ADVISORY
  without them. Dogfood round 5 (`s1-dogfood-review-round-5.md`): stable —
  the same correct verdict shape for the third consecutive run.
- **R5 ISSUES_FOUND — two more fresh Majors, both accepted and fixed in
  flight**: (1) Parts 5/8/9 now sync the local checkout after every
  browser merge (`git switch main && git pull --ff-only`) before worktree
  close / tree-state expectations (Part 4 already had it); (2) the review
  prompt's coverage scoring now resolves CODEOWNERS with GitHub's
  **last-match-wins** semantics — effective owner sets, final matching
  pattern cited, override blind spots called out (P5 recheck, P4 coverage
  fact, extraction instruction, and the report template all updated).
- **Loop suspension and operator directive.** After R5 the orchestrator
  suspended the loop per the severity-gated stop rule (5 rounds, 19
  findings, all fresh, all fixed, none disputed, steadily finer grain)
  and requested adjudication. The **operator directed the loop to
  continue** while findings remain genuinely Major ("if reviews continue
  to uncover undisputed major issues, they are doing their job"), and
  opened a separate design discussion on containing discovery-phase
  scope (see `s1-next-set-analysis.json` follow-ons and the session
  report).
- **R6 — VOID-BY-EVIDENCE.** The session had been committed at
  suspension, so R6's default diff-vs-HEAD bundle was ~empty and the
  verifier's single finding correctly reports "nothing to review" — an
  orchestrator process error (`--diff-base` not repointed), not a
  substantive round. Artifact retained raw; all later rounds run with
  `--diff-base 34d4149` (the pre-session ref).
- **R7 ISSUES_FOUND — two fresh Majors, both accepted and fixed**: (1)
  the walkthrough's all-modules CI command is now guarded for the
  pre-implementation `main` (`if [ -d services ]` — the guardrails PR
  merges before any module code exists, so the bare discover command
  would have turned `main` red immediately); (2) the evidence script's
  remote-branch dedupe now compares commit IDs, so a stale local branch
  can no longer suppress its newer remote twin. No dogfood re-run for
  R7 (recorded, not silent: the dedupe is remote-repo logic the
  remote-less scratch repo cannot exercise; the doc-embedded script was
  re-syntax-checked).
- **R8–R17 — ten more rounds, 13 more Majors, all accepted and fixed,
  none disputed** (full per-round detail in `s1-cross-round-ledger.md`;
  raw rounds in `s1-verification-round-*.md`): one-coherent-repo-state
  evidence gathering (`git show` at the review base; branch-added specs
  from their branches); the complete final `monorepo-ci.yml` in Part 7
  (three path-scoped jobs + a never-vacuously-green all-modules
  guardrail — per-module zero-test failure, absent-dir handling) with
  the `contents: read` permissions fix applied to the shipped
  `monorepo-ci.yml.template`'s worked example too (L-069-1 sibling;
  goldens + dist regenerated); serialized authoring with explicit
  command blocks for every PR; branch protection moved after the solo
  setup pushes with admin-bypass and auto-delete-head-branches settings;
  per-merge sync + branch cleanup everywhere (one global squash/rebase
  rule); hotfix validated at the exact tagged commit before tagging;
  per-machine `Dabbler: Install ai-router` for fresh clones; teammate
  Write-access grants at repo creation; dated branch tips + divergence
  counts in the evidence bundle with P1/P7 ADVISORY caps; P5
  last-match-wins effective-owner resolution; P6 production-target
  evidence rule; P4 coverage re-keyed to the changed touched paths'
  aggregated effective owners (both integration shapes). Dogfood parity
  re-ran through round 8 — the planted violation FAILed with exact
  citations in every one of the eight runs.
- **Severity re-grounding and termination (operator, 2026-07-12).** At
  R16 the operator set a consequence-based severity rubric (Major =
  probable failure scenario for a real user × material impact on the
  solution's objectives; low-probability OR low-impact = Minor even when
  technically correct) and a hard cap of 21 rounds. The rubric entered
  the conventions block at R18 — which returned **VERIFIED, zero
  findings**, terminating the loop three rounds under the cap. Totals:
  18 rounds (1 void — the R6 empty-evidence process error), 39 blocking
  findings, all accepted and fixed in flight, zero disputed;
  verification spend $4.88 of a $5.25 session total. The loop's shape
  (real-but-ever-finer findings, no convergence until severity was
  consequence-graded) is the primary input to the phased-verification
  framework proposal recorded in the session report and
  `s1-next-set-analysis.json` follow-ons.
- UAT: `requiresUAT: suggested` was **not armed** (no operator opt-in at
  session start; this close ran autonomously). The walkthrough itself is
  authored to the UAT instruction bar and doubles as the operator's
  natural hands-on walk — running it verbatim in a clean environment is
  the recommended (optional) human sign-off, per the spec's rationale.

## End-of-set outcome

The 091–095 module-first redesign is fully documented for consumers: a
runnable team walkthrough proven against a planted violation, a reusable
coaching review prompt, accurate scaffolded onboarding, and tutorials
linked from every entry surface. Extension 0.42.0 remains publish-ready
and operator-gated (tag `vsix-v0.42.0`); the screenshot retake is the one
cosmetic pre-publish item. Follow-ons per the routed recommendation:
`s1-next-set-analysis.json`.
