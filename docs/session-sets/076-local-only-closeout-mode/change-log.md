# Change Log — Set 076 (Local-Only Close-Out Mode)

> **What this set delivered.** `check_pushed_to_remote` treated a missing
> upstream as a configuration error and **failed** the close-out gate, so a
> repository that is *deliberately* remote-less (no git remote, by design, and
> never will have one) could not close cleanly — the operator had to `--force`
> every session, which stamped `forceClosed: true` / `[FORCED]` on work that had
> no actual problem and conflated steady-state closes with incident recovery.
> Set 076 adds a durable, repo-level **`.dabbler/local-only`** signal: when the
> marker is present **and no git remote is configured**, the push gate becomes a
> *pass-with-note* instead of a configuration-error failure — but **only** when
> there is no remote, so it can never mask a real "forgot to push to an existing
> remote" miss. A blessed CLI sets/clears/inspects the marker.
>
> **Non-goals (unchanged):** the Getting-Started tier-leak defect (Defect 1 in
> the proposal — separate set); the other four close-out gates
> (`working_tree_clean`, `activity_log_entry`, `next_orchestrator_present`,
> `change_log_fresh`), which still apply unchanged on a local-only repo; and
> `--force`, which remains the incident-recovery bypass and is neither removed
> nor repurposed.
>
> **Design background:**
> [`docs/proposals/2026-06-23-lightweight-tier-leak-and-local-only-closeout.md`](../../proposals/2026-06-23-lightweight-tier-leak-and-local-only-closeout.md)
> (Defect 2).
> **Release:** `dabbler-ai-router` **0.26.2** (patch; tag-driven PyPI publish).

---

## Session 1 of 2 — Local-only signal + gate behavior + tests

**Status:** CLOSED, VERIFIED (gpt-5-4 cross-provider; the Minor on `_has_remote`
failure semantics was addressed by failing conservative before close-out).

### Delivered

- **`gate_checks.is_local_only(repo_root)`** — a pure filesystem helper
  (presence-only check of `.dabbler/local-only`; no git call; `False` on a
  falsy root) so the marker contract is unit-testable without a live git tree.
- **`gate_checks._has_remote(repo_root)`** — a conservative remote probe that
  treats a non-zero `git remote` exit as "a remote may exist", so the waiver
  requires an *affirmative* no-remote determination and never fires on an
  ambiguous probe (the waiver makes the gate pass, so the failure-mode bias
  must protect against masking a real unpushed state).
- **`check_pushed_to_remote` behavior branch** — inside the existing
  missing-upstream case only: marker present + no remote → pass-with-note;
  marker present + remote exists → unchanged failure; marker absent → unchanged.
  No new `GATE_CHECKS` entry and no change to the `gate_results` JSON shape.
- **`ai_router/tests/test_gate_checks_local_only.py`** — the full behavior
  matrix (positive waiver, negative remote-present, no-remote-no-marker
  regression) plus helper semantics.

Full detail in the S1 `disposition.json` and `s1-verification.md` (saved raw,
never edited). Lessons cited: L-064-6.

---

## Session 2 of 2 — Operator affordance, docs, and patch release

**Status:** CLOSED. Final session of the set.

### Delivered

- **`ai_router/local_only.py` — the blessed CLI.**
  `python -m ai_router.local_only --enable | --disable | --status` (with
  optional `--reason` and `--repo-root`), idempotent, reusing the
  `is_local_only` / marker contract from `gate_checks`. `--enable` records an
  **audit note inside the marker file** (an `enabled_at` timestamp, the
  provenance, and the reason) — the durable record that explains why a later
  close passes-with-note, reusing the marker as its own record rather than a
  parallel ledger. Re-enabling is a no-op that preserves the original note;
  `--status` reports presence and whether the waiver would actually fire
  (warning when a remote is configured). Console output is ASCII-only.
- **`ai_router/tests/test_local_only_cli.py`** — pure-helper idempotency, the
  audit note, status reading, the `main()` action surface (mutually-exclusive,
  required), the dabbler-dir sibling-preservation invariant, and the
  ASCII-only-output convention; plus the integration invariant that an enabled
  marker is exactly what `gate_checks.is_local_only` recognizes.
- **Documentation.** `ai_router/docs/close-out.md` gains *Section 6 — The
  sanctioned local-only close path* (behavior matrix, CLI, and the contrast
  with incident-recovery `--force`); Troubleshooting renumbered to Section 7
  and the TOC updated. The Step 8 close-out pointer in
  `docs/ai-led-session-workflow.md` and the `check_pushed_to_remote` docstring
  now point at it.
- **Release.** `dabbler-ai-router` bumped `0.26.1 → 0.26.2` with a CHANGELOG
  entry; sdist + wheel build clean and include the new module and docs.
- **CI repair (release-unblocking; decided via cross-provider consensus).** A
  pre-existing standing failure from Set 075 had the default-branch `Test`
  workflow red — which blocks the tag-driven PyPI publish gate. The
  stale-tier-framing drift guard matched its banned labels as bare substrings, so
  the legitimate Set 075 telemetry identifiers `docs-only-excluded` and
  `targetClass=docs-only` false-positived. The decision to fix it in this release
  session (vs. defer) was taken via GPT-5.4 + Gemini Pro consensus. The fix
  (`ai_router/scripts/drift_guard.py`) exempts a banned label only when it is part
  of a real compound identifier (carries an extra word component), so a bare label
  — in prose, backtick-quoted, sentence-ending, or beside a dangling separator —
  is still caught; the ban is not weakened. Shipped as a **separate, clearly
  labeled commit**.

Full detail in the S2 `disposition.json` and `s2-verification*.md` (saved raw,
never edited; verification converged over three cross-provider rounds — each
drove a real fix, per L-070-1 / L-071-1).

---

## End-of-set deliverables (all met)

- `check_pushed_to_remote` honors `.dabbler/local-only` (pass-with-note when
  remote-less; never masks a real unpushed-to-existing-remote state).
- A blessed `ai_router.local_only` CLI to enable / disable / inspect the signal.
- Unit tests covering the full behavior matrix and the CLI.
- Close-out / workflow docs describing local-only as a sanctioned,
  non-`--force` close path.
- A `dabbler-ai-router` **0.26.2** patch release.
