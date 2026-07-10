# Change Log — Set 089: Verification Evidence Completeness

**Set:** `089-verify-evidence-completeness` · **Sessions:** 1 · **Tier:** Full
**Closed:** 2026-07-10 · **Verdict:** WAIVED (operator-adjudicated; see below)

## What this set did

Closed an upstream evidence-**completeness** gap in `ai_router.verify_session`
that the SS1–SS3 remediation (0.32.0, decision logic + evidence *integrity*) did
not cover — the gap that churned a real Full-tier session for 6 rounds.

### Fix A — depth-agnostic generated-bundle excludes
`build_diff_pathspecs` emitted the root-anchored `:(exclude)<name>`, which
excluded a top-level `dist/` but NOT a **nested** bundle
(`tools/dabbler-ai-orchestration/dist`) — flooding the diff (~4,400 lines) and
truncating the real source. Each default exclude now becomes a `glob` pathspec
matching at **any depth** (`**/<p>` + `**/<p>/**` for dirs), fixing both the main
diff and the untracked collector (shared function) and **retiring the per-repo
`--exclude tools/dabbler-ai-orchestration/dist` workaround**. The exact pathspec
is proven against a real `git`.

**Honest exclusion (round-1 finding).** Because a depth-agnostic rule also
matches a source dir named `dist` (e.g. `src/dist`), excluded **tracked** files
are now reported explicitly (`EvidenceBundle.tracked_excluded` + a rendered
"Excluded tracked paths — review directly" section), mirroring SS3's treatment
of excluded *untracked* files. Nothing is silently dropped; the SS3 completeness
guarantee is preserved while exclusion extends to nested bundles.

### Fix B — oversized/truncated-INPUT guard
The mirror of SS3's output-truncation guard, for the INPUT: when assembled
evidence would overrun the verifier's context, it is truncated silently and the
verifier reviews partial evidence with no signal. `assemble_evidence` now raises
`EvidenceTooLargeError` above a cap (`AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS`,
default 600 KiB) — enforced at **assembly** (round-1 finding), so every caller
(not just the CLI) fails closed. The CLI maps it to
`EXIT_VERIFICATION_UNAVAILABLE` with actionable guidance.

Tests: 56 in `test_verify_session.py` (incl. the nested-bundle acceptance test,
tracked-source-reported-not-silent, and assemble-level oversized guard). Full
suite green: **2913 passed**.

## Verification & adjudication

Two rounds (`verify_session`, verifier `gpt-5-4`, Anthropic orchestrator
excluded). The loop worked correctly on the **substance**: round 1 found **two
real bugs** (the `src/dist` completeness regression and Fix B not threaded
through `assemble_evidence`), both fixed; **round 2 confirms the fixes** and
raised only two **category errors** (a "round-1 artifact is stale" complaint
against an immutable append-only record, and the circular "set not closed at
verify time"). Per the bounded-round discipline the loop **stopped at round 2
and escalated**; the operator adjudicated both residual findings as non-defects
(`s1-adjudication.md`) and authorized an operator-attested close. Verdict
**WAIVED** (verification ran via `api`, returned category-error issues the
operator waived — not a dishonest `VERIFIED`).

> Suite note: the sole transient suite failure during the session was the
> `one-active-set` drift check tripping because Set 087 was also in flight — an
> orthogonal, operator-driven parallel-work condition that resolves on this
> close (only 087 remains active). Not a defect in 089's code.

## Step 9 — guidance reorganization review

**No preload changes recommended.** One **follow-up** is worth logging (not into
the slimmed preload): this is the **2nd** set (after 088) blocked at close by the
circular "set-not-closed-at-verify-time" verifier finding. A small follow-up —
teach the verification prompt / evidence framing that pre-close lifecycle state
is not a completeness defect (the ss4 doc's deferred "Related: prompt-template"
item) — would retire the recurring operator-override. Recommended as its own
set when the operator chooses.
