# Audit-S1 Pass B — Devil's advocate review

## T1–T7 disagreements with Pass A's likely positions

- **T1 — Schema version**
  - **Counter-position:** Prefer **v5 bump** over v4-compatible.
  - **Reasoning:** v4-compatible hides the real migration cost behind “reader tolerance.” That defers the work, preserves stale shapes in the wild, and makes future cleanup harder to prove. A v5 break forces the remaining consumers to confront the new invariant now instead of accumulating dual-shape debt.

- **T2 — CLI compatibility surface**
  - **Counter-position:** Use **accept-with-warning**, not hard refusal and not pure silent ignore.
  - **Reasoning:** `--chat-session-id` is still being passed by the Claude hook in consumer repos. Hard refusal breaks live installs. Pure ignore hides the contract change and makes failures look like success. A warning preserves compatibility while surfacing that the arg is now vestigial.

- **T3 — Orchestrator declaration to the writer**
  - **Counter-position:** Keep an explicit writer contract per hook/orchestrator, not a one-off operator-CLI-only convention.
  - **Reasoning:** If only the current orchestrator is wired “by convention,” future orchestrators will regress into under-specified writes and the post-rip state will depend on tribal knowledge. The missing fields should be omitted intentionally, but the surviving fields still need a defined producer contract.

- **T4 — Historical `session-state.json` migration**
  - **Counter-position:** Do **not** rely on “readers ignore extras” as the long-term answer.
  - **Reasoning:** Leaving old files bloated makes it impossible to tell whether a field is genuinely absent or just stale. That blurs auditing, complicates later migrations, and keeps the old shape alive indefinitely. If v4-compatible is chosen, a sweep/normalize path should still be planned.

- **T5 — `~/.dabbler/orchestrator-writer.log`**
  - **Counter-position:** Keep it, at least provisionally.
  - **Reasoning:** Once coordination is gone, this log becomes one of the few places to diagnose bad hook writes, silent install regressions, or out-of-band file mutations. Retiring it removes a useful audit trail before the post-rip system has proven stable.

- **T6 — `holder_change` / `checkout_conflict` events**
  - **Counter-position:** Keep emitting them for one compatibility window, even if they are no-ops semantically.
  - **Reasoning:** Immediate retirement may break downstream consumers, joiners, or future harvest tooling that expects the event stream shape. If the goal is to preserve observability while removing enforcement, a compatibility emit is safer than a hard cut.

- **T7 — Cross-repo checkout notice text**
  - **Counter-position:** Do not retire the notice file outright; rewrite it into an explicit “remove this snippet” deprecation note.
  - **Reasoning:** Consumer repos that pasted the original text need a clear remediation path. Deleting the file leaves stale CLAUDE.md fragments in place with no obvious operator-facing cleanup instruction.

## D1–D3 disagreements

- **D1 — `bare-touch`**
  - **Counter-position:** Retire the detector as written, but don’t treat that as “no replacement needed.”
  - **Reasoning:** Under omit-null, the current predicate is structurally invalid. If missing engine values still matter operationally, the replacement should be a writer-completeness check, not the old detector.

- **D2 — `engine-mismatch` / `stale-checkout-touch`**
  - **Counter-position:** Retire these detectors, but acknowledge they are loss-of-signal, not just dead code.
  - **Reasoning:** Dropping `lastActivityAt` removes the only staleness/time-ordered evidence those checks had. If post-rip visibility still matters, it has to move to another signal source.

- **D3 — `writer-bypass`**
  - **Counter-position:** **Keep it.**
  - **Reasoning:** This is not coordination-specific. It is a general integrity check for out-of-band writes to `session-state.json`. That remains valuable after the rip-out and will catch real bugs that the removed coordination layer never covered.

## Feature roll-call counter-positions

- **FR1 — `external-verification.md` soft gate**
  - **Counter-position:** **Defer** rather than drop.
  - **Reasoning:** It is not load-bearing for the rip-out itself, but it is a user-facing checkpoint with independent value. If it is removed now, there is no obvious replacement for that review moment.

- **FR2 — `migrate_lightweight_to_canonical_v4` CLI**
  - **Counter-position:** **Keep.**
  - **Reasoning:** If historical files remain in circulation, the migration path is the only practical way to normalize them. That becomes more important, not less, once the coordination fields are removed.

- **FR3 — `dabbler.openExternalVerificationDoc`**
  - **Counter-position:** **Drop.**
  - **Reasoning:** This is UI convenience, not runtime infrastructure. It is not load-bearing for the post-rip state.

- **FR4 — `docs/review-criteria/{spec,session,set}.md` template bootstrap kit**
  - **Counter-position:** **Drop or defer.**
  - **Reasoning:** Helpful documentation scaffolding, but not necessary for a correct post-rip system. It should not block the rip-out.

- **FR5 — `Migrate to v4 schema` right-click action + `python -m ai_router.migrate_v3_to_v4`**
  - **Counter-position:** **Keep, or at minimum consolidate with FR2 rather than removing both.**
  - **Reasoning:** This is the operator-facing path that makes the migration real. If v4-compatible is chosen, the migration affordance is the mechanism that prevents the old shape from lingering forever.

## Survey gaps

- The read-site survey appears to underweight **non-runtime consumers** of the dropped fields:
  - schema/type declarations that still encode the old shape,
  - validation or serialization helpers outside the coordination path,
  - consumer-repo hook installers that rely on the old CLI surface,
  - any harvest/analytics readers that inspect `session-state.json` for reporting rather than enforcement.
- The survey should explicitly verify:
  - `tools/dabbler-ai-orchestration/src/types/sessionSetsWebviewProtocol.ts`,
  - any JSON schema or generated type derived from `session-state.json`,
  - any repo-local hook scripts in `dabbler-platform`, `dabbler-access-harvester`, and `dabbler-homehealthcare-accessdb` that pass `--chat-session-id`,
  - any tooling that consumes `session-events.jsonl` or `session-state.json` for display, export, or validation rather than conflict detection.
- Bottom line: the survey is credible for the coordination path, but it may have missed **shape consumers** that are not obvious enforcement readers.

## Session arc disagreement

- **Counter-position:** The estimate is **too low**.
- **Reasoning:** This is not just a code deletion. It includes:
  - CLI compatibility decisions,
  - consumer-repo hook validation,
  - historical file migration policy,
  - possible retention of integrity logging/events,
  - and documentation cleanup.
- **Revised arc:** **5–7 sessions** is more realistic than 3–5.

## Recommended operator-visible questions

- Do we want `--chat-session-id` to be **warning-only** compatibility, not silent ignore?
- Are we **keeping `writer-bypass`** as a post-rip integrity check?
- If v4-compatible is chosen, what is the **migration plan for historical `session-state.json` files**?
- Which migration surface is canonical: **FR2, FR5, or both**?
- Do we want a **consumer-repo deprecation note** rather than deleting the cross-repo notice outright?
- Are we counting **consumer-repo hook validation** in the session-arc estimate, or only core-repo code changes?