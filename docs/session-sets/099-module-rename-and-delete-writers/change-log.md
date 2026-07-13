# Change Log — Set 099: Module Rename and Delete Writers

> **Set complete: 2026-07-13** (2 sessions). Second of the four-set
> module-lifecycle-simplification bundle (Sets 098–101): the
> transactional module RENAME writer and the module DELETE writer, both
> with palette commands. Module-row UI wiring is Set 100's; no publish —
> single release boundary after Set 101.

## Session 1 of 2 — The transactional rename writer

- **`renameModule(root, oldSlug, {newSlug?, newTitle?}, io?)`**
  (`moduleAuthoring.ts`): a preflighted, all-or-nothing rewrite. Slug
  stays identity (no `moduleId` / tombstones / registry — verdict
  decision 1). Preflight: target slug validates + is unique among
  declared slugs; rejects a target colliding with an UNDECLARED slug
  that already carries stamped sets (the silent history-merge hazard);
  refuses while any affected set has a running session. Apply:
  format-preserving `docs/modules.yaml` entry edit (slug and/or title)
  plus a restamp of `module: <old>` → `module: <new>` in every affected
  set's `spec.md` (a title-only rename skips the restamp entirely).
  Every write is computed and parse-after-write guarded before any byte
  lands; any failure rolls every already-written file back to its
  pre-transaction bytes.
- New pure helpers: `restampModuleInSpecText` / `assertRestampedTextValid`
  (value-rewrite of the top-level `module:` key), `rewriteManifestEntryText`
  / `assertRenamedManifestParses` (format-preserving slug/title rewrite +
  semantic parse-after guard), `parseManifestEntriesFromText`,
  `hasRunningSessionAt` (non-mutating state read).
- Palette command `dabbler.renameModule` (module QuickPick → validated
  slug/title inputs → two-step modal confirm naming the N restamped
  sets → writer → summary toast).
- 30 new tests; dogfood on a scratch multi-module repo (zero orphans);
  suite green; cross-provider phased discovery VERIFIED (0 Critical/Major
  on round 1, two genuine nits folded in: a slug-only rename of a
  title-less entry was spuriously refused, and the title-insert path
  hardcoded `\n` instead of the manifest's own newline convention).

## Session 2 of 2 — The delete writer

- **`deleteModule(root, slug, io?)`** (`moduleAuthoring.ts`): removes
  the manifest entry per the operator's adjudicated disposition rule.
  Every set stamped `module: <slug>` is classified by
  `classifyModuleSetsForDeletion` into **terminal** (complete, or
  already cancelled — untouched), **cancel** (non-terminal and not a
  clean scaffold — cancelled via the existing `cancelSessionSet`
  writer, reason auto-noted `module <slug> deleted`), or **remove** (an
  unstarted `kind: plan|decomposition` scaffold with no execution
  artifacts — directory removed outright). Refuses while any affected
  set has a running session (reuses Session 1's `hasRunningSessionAt`).
  The manifest removal is computed and guarded up front (an
  unspliceable manifest refuses the whole operation, nothing touched),
  but the write itself lands **last**: cancels and scaffold removals
  apply first — each idempotent and safely re-runnable — so an
  interrupted run never half-deletes the module; re-invoking finishes
  the job.
- New pure helpers: `rawSessionSetStatus` / `hasExecutionArtifacts`
  (deliberately non-mutating — never call the Explorer's `readStatus`,
  which lazily synthesizes a `not-started` `session-state.json` onto
  any spec-only folder the moment it's scanned, which would otherwise
  make the "unstarted scaffold" category unreachable once the Work
  Explorer has ever opened the workspace), `removeManifestEntryText` /
  `assertManifestEntryRemoved` (format-preserving entry removal +
  semantic parse-after guard).
- Palette command `dabbler.deleteModule` (module QuickPick → two-step
  modal confirm built from the *same* `classifyModuleSetsForDeletion`
  the writer uses, so the confirm enumeration is guaranteed truthful →
  writer → summary toast).
- 24 new tests covering the classification matrix, the apply matrix,
  running-session refusal, manifest-edit-last ordering (an injected
  manifest-write failure leaves already-applied cancels/removals
  standing and reports `partialFailure`), the re-declare-slug
  emergent-restore property, and format preservation.
- **Dogfood-caught regression, fixed before close:** a set cancelled
  before it ever had a `session-state.json` (`cancelSessionSet` only
  touches the state file when one already exists) left only
  `CANCELLED.md` on disk; the classifier's `readCancellationState`
  alone reported `"unknown"` for that shape, wrongly re-classifying an
  already-cancelled set as `cancel` (re-cancelling it). Fixed by
  falling back to the legacy `CANCELLED.md`-presence check, mirroring
  `readSessionSets`' own fallback — caught by dogfood, not by the unit
  suite, before it shipped.
- Suite green (1585 → 1587 passing) — also silently fixed a
  **pre-existing, unrelated** one-line drift in the Q7
  watcher-inventory allowlist that was already stale on `master` before
  this session began (confirmed by stashing this session's changes and
  re-running the test on bare `HEAD`).
- Cross-provider phased verification: discovery round 1 (fanned out
  K=2) returned `ISSUES_FOUND` both times with 3 Major findings, all
  investigated and disputed with concrete evidence (`git show HEAD`
  proving the watcher-line baseline was already stale pre-session; the
  spec's own "mirroring the cancel writer's modal posture" text plus a
  direct read of that command's actual one-modal implementation) rather
  than a code change — recorded as `advisory-disagreement` in
  `s2-remediation-round-1.md`. The remediation-review pass (an
  independent cross-provider read of the fix delta + evidence)
  confirmed both disputes (`2 accepted, 0 rejected`) and returned
  `VERIFIED`.

## Post-close: the advisory path-aware critique (manual, operator-run)

After the set-terminal `close_session`, the operator ran the manual
multi-provider path-aware critique (`pathAwareCritique: advisory`) — GPT-5.4
and Gemini-Pro, each with real repo access via GitHub Copilot, using
`ai_router/prompt-templates/path-aware-critique.md`. Both independently
converged on the same real Major/Critical defect, and GPT-5.4 found a second:

- **Legacy-set misclassification (both providers, Critical/Major).** The
  non-mutating classifier (`rawSessionSetStatus`, `hasRunningSessionAt`)
  returned `"not-started"` / "not running" the instant `session-state.json`
  was absent, without replicating `sessionState.ts`'s own
  `backfillPayload`/`readStatus` file-presence inference
  (`change-log.md` present → complete; `activity-log.json` present →
  in-progress). A pre-Set-7 (or otherwise never-backfilled) legacy set with
  no state file at all — of which this repo has several — would therefore
  have a **completed** history wrongly **cancelled** by `deleteModule`, and a
  **live** legacy set wrongly pass the running-session refusal for both
  writers. **Fixed:** a shared, non-mutating `inferLegacyStatus()` helper
  now backs both functions' state-file-absent fallback.
- **Comment-sweep on delete (GPT-5.4, Major).** `removeManifestEntryText`'s
  entry-span boundary walk treated a standalone `#`-prefixed line as "not a
  boundary," so a comment describing the *next* manifest entry — sitting
  between the deleted entry and that next entry — was swept into the
  deleted span and lost, contradicting the format-preservation contract.
  **Fixed:** the deletion-specific boundary walk now also stops at a
  same-or-shallower-indent standalone comment line, which therefore survives
  attached to whatever follows (mirrors how a human reader would attribute
  it) — `rewriteManifestEntryText`'s own (non-destructive) span walk is left
  unchanged, since it never deletes anything and has no equivalent defect.

Both providers' two remaining findings (rollback-wording overstatements) were
adjudicated as accurate already — the code already reports
`writeFailed.rolledBack === false` on a failed rollback; only the *prose*
summary overstated it, not the shipped code or its tests — so no behavior
change was needed there.

6 new regression tests added (legacy-complete classification, legacy
in-progress classification, legacy in-progress running-session refusal for
*both* writers, mid-file and trailing standalone-comment preservation), plus
a real-compiled-writer dogfood exercising all three scenarios end-to-end.
Suite green (1587 → 1593 passing). Raw critiques saved at
`path-aware-critique.json` (validated via
`ai_router.path_aware_critique.validate_path_aware_critique_artifact`);
`close_session` re-run afterward is a no-op (the set was already closed) —
the artifact retroactively satisfies the advisory gate for any future audit.

**Set 099 is now complete.** No version bump, no publish — the release
boundary is after Set 101.
