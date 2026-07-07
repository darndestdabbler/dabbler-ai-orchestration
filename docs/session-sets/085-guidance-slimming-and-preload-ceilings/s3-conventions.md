# Session 3 verification — up-front conventions block

Read this before reviewing. It states the agreed baseline so Round 1
spends findings on real defects, not on the settled context.

## What this session is

Set 085 Session 3 of 3 (F4): **verifier evidence scope, playbook, live
dogfood, release prep.** It audits what `verify_session` assembles as
verifier context (outcome: no tool change; the deviation from the spec
sentence's literal evidence list is explicit and operator-adjudicated —
see below), authors the
repo-portable `docs/guidance-slimming-playbook.md`, runs itself as the
live dogfood of the slimmed preload, fixes one release-blocking
portability defect found during release prep (the bundled-default
manifest guard), and prepares — but does not publish — the router
`0.30.0` and extension `0.40.0` releases.

## Suite baseline (measured this session)

- `python -m pytest`: **2816 passed / 5 skipped** (the S2 baseline of
  2812 passed plus exactly the 4 new bundled-default-guard tests; the 5
  skips are pre-existing).
- Extension: `npx tsc --noEmit` clean; `npm run test:unit` **1270
  passing** (unchanged from S2 — this session changes no extension
  code, only `package.json` version + CHANGELOG).
- `python -m ai_router.guidance_report --check`: **exit 0** — TOTAL
  10,673 / 12,000 tokens, all four files at/below their ceilings.
- `python -m ai_router.validate_guidance_meta`: OK, 25 ids across 2
  files.
- Layer 3 Playwright **not run, by scope rule** (L-064-12): this diff
  touches no Explorer-rendering surface, no state-file writer, and no
  fixture harness. Same scoping S2 applied.

## Release contract (prepared, deliberately unpublished)

- Router `0.29.0 -> 0.30.0` (pyproject + CHANGELOG) and extension
  `0.39.0 -> 0.40.0` (package.json + CHANGELOG, template-bundle-only)
  are **prepared releases**. Publishing (tags, `release.yml` /
  `publish-vscode.yml`) is an **operator-authorized action** per the
  spec ("on operator authorization, release") and the constitution's
  irreversible-action list — the absence of tags/publish runs from this
  diff is the designed state, not an omission.
- Rollback text names only registry-live versions: router `0.29.0`
  (PyPI), extension `0.39.0` (Marketplace), both published 2026-07-07
  (L-078-1).

## By-design decisions (settled by the spec / operator — do not re-litigate)

- **Verifier-scope audit outcome — no tool change; SETTLED BY OPERATOR
  ADJUDICATION (I-085-S3-1, closed 2026-07-07).** Per the constitution's
  bounded-round rule, rounds 1–2's unfixed Major on this
  spec-interpretation fork stopped to the operator with the four-option
  adjudication packet (`disposition.json` →
  `verifier_scope_adjudication`). **The operator chose ACCEPT: the
  consensus-adopted scope list (diff, test output, gate outcomes, spec)
  is affirmed as the contract, and the spec sentence in Session 3
  Step 1 is amended accordingly** (inline amendment note in `spec.md`
  citing the adjudication; the constitution is a process doc and is
  deliberately not fed). This is a settled human decision under the
  workflow's verifiers-flag / humans-adjudicate rule — it is no longer
  an open finding, and re-raising it re-litigates a closed
  adjudication. The audited facts are unchanged:
  `assemble_evidence`/`build_prompt` feed the spec excerpt +
  `git status --short` + the complete diff + the up-front conventions
  block into `prompt-templates/verification.md`; **no process manual is
  in the bundle**. Against the spec sentence's five-item list ("diff,
  test output, gate outcomes, the spec, and the constitution"):
  - **diff / status / spec** — assembled deterministically by the CLI.
  - **test output + gate outcomes** — carried by the conventions block
    (this file), whose use is a promoted, mandatory workflow convention
    (project-guidance → "Open every session-verification prompt with an
    up-front conventions block", L-064-10). The CLI *flag* is optional
    by design: the requirement lives in guidance, and hard-requiring it
    in the CLI would add a second enforcement surface for the same
    invariant (this set's named anti-pattern). Every 085 verification
    round, including this one, actually carried them.
  - **the constitution** — deliberately not fed; **this is the
    deviation from the sentence's literal list, and it is recorded as
    such.** Provenance: the requirement's source is the 2026-07-07
    consensus (`consensus-synthesis.md`: "the verifier must not inherit
    the full manual either — scope verifier evidence to diff, test
    output, gate outcomes, spec. Adopted as Set 085 S3 Step 1") — the
    adopted scope list does not include the constitution; the spec
    sentence appended "and the constitution" at authoring time. Feeding
    a process doc to the verifier re-invites the process-heavy-critique
    failure mode the requirement exists to prevent (prefer removal over
    addition). The deviation, both readings of the spec sentence, and
    the split routed opinion below were recorded in `disposition.json`
    and stopped to the operator; **the operator adjudicated ACCEPT
    (2026-07-07)** — the consensus scope list is the contract, the spec
    sentence is amended (this round's diff carries the amendment), and
    `verify_session.py` and the templates stay untouched by design.
  - **The routed second opinion (`s3-verifier-scope-audit.txt`) is
    internally split and is cited as such:** its top-line answer 1 says
    "Unscoped… Required Edit: Add `session-constitution.md` to the
    evidence bundle"; its reasoned answer 2 then reverses — "The
    omission is the better state; do not add the constitution… The
    spec's allow-list should be amended to remove the constitution."
    Earlier S3 artifacts summarized only the second half as "concurs";
    that overstatement is corrected here and by an appended corrective
    activity-log entry (the original entry stands unedited).
- **The bundled-default guard IS in-scope S3 work:** release prep found
  that the packaged `router-config.yaml` (package-data) now declares
  this repo's preload manifest, so a pip-installed consumer with no
  workspace config would inherit a foreign manifest and
  `guidance_report --check` would hard-fail on files that exist only in
  this repo — a Major portability defect in the set's own F1 machinery,
  fixed before it could ship (source guard in
  `guidance_report._resolve_config_path` + `main()` unified through it;
  4 new tests; documented in `guidance-lifecycle.md`).
- **`project-guidance.md` / `lessons-learned.md` / `AGENTS.md` at
  exactly 100% of their per-file ceilings** is the ratchet design
  (ceiling = measured size), not a breach.
- **`disposition.json` is completed at Step 8, after this
  verification** — the dogfood record (on-demand opens, timings,
  rounds) and `lessons_cited` land there; their absence from this diff
  is sequencing, not a missing deliverable. Likewise
  `path-aware-critique.json` (required, set-terminal) is produced after
  this verification and before close.
- **No verification / gate / adversarial-framing change.** The no-skip
  mandate (Set 083) and the L-069-2 framing are out of scope; this
  session's only `ai_router` code change is the bundled-default guard.

## Live-dogfood facts (recorded for the A/B; the spec's Step 3)

- This session ran from the slimmed preload only: constitution +
  `project-guidance.md` + active `lessons-learned.md` + `CLAUDE.md`
  (~10.7k tokens), on the operator's `claude-fable-5` seat.
- On-demand docs opened at trigger moments (3 so far):
  `docs/guidance-lifecycle.md` (playbook authoring + guard
  documentation), `CONTRIBUTING.md` (Step 5 full-pass commands),
  `docs/ai-led-session-workflow.md` § path-aware critique (stage
  mechanics, set-terminal). The workflow doc was NOT opened for the
  happy path.
- `start_session` registered 14:42:31 EDT; first task action (S3.1
  evidence reads) ~14:46 — **~4 min** including Steps 3/3.5 (prereqs,
  ai-assignment block, routed next-set analysis).

## Round-3 findings — remediated in this diff (round-4 context)

- **R3 Issue 1 (session-3 chronology):** root cause — the S3-resume
  conversation re-ran `start_session` (the sanctioned re-attach after
  the operator-adjudication stop), which refreshed
  `session-state.json`'s `startedAt` to the re-attach time (15:39)
  without appending a ledger event, post-dating the already-logged
  work. `close_session --repair` reports no drift (it checks
  status-level drift, not timestamps), so per the schema doc's
  operator hand-edit recourse, `startedAt` was restored to
  `2026-07-07T14:42:31.549267-04:00` — exactly the ledger's
  session-3 `work_started` event. State, events, activity log, and
  the disposition dogfood record now agree on the timeline.
- **R3 Issue 2 (stray screenshot):** `tools/dabbler-ai-orchestration/
  media/Screenshot 2026-07-07 152310.png` was an accidental staging in
  commit `f44a32f` — nothing references it (no package.json, README,
  or doc link). Removed via `git rm` (recoverable from `f44a32f`);
  the extension release is again template-bundle-only as claimed.
- **R3 nit (manifest example 3528 vs 3499):** the
  `guidance-lifecycle.md` example now matches the live manifest
  (3499).
- **R3 nit (activity-log step-10 status token):** normalized
  `"completed"` → `"complete"` to the file's convention.
- **R3 nit (s1-next-orchestrator-analysis.json is fenced Markdown):**
  recorded, deliberately not churned — it is a saved S1 session
  artifact; rewriting historical artifacts to fix a filename/format
  nit is riskier than the nit (raw records stand).

## What to scrutinize

Whether the bundled-default guard breaks any legitimate manifest-
enforcement path (workspace / `--repo-root` / `AI_ROUTER_CONFIG` must
keep enforcing); whether the playbook's claims about the machinery match
the shipped code (a replacement/successor doc inherits claims at its
peril — L-064-8); whether the release artifacts are internally
consistent (versions, changelog claims, rollback targets registry-live);
and whether any surface still contradicts the no-change-needed audit
outcome.
