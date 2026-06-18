# Change Log — Set 071 (Verifier Materiality Gate + Nitpick-Churn Discipline)

> **What this set delivered.** Set 070 gave **both** reviewer surfaces their
> strongest devil's-advocate framing (steelman push, **L-069-2**). The operator's
> live field test of that framing (in the `kick-the-orchestrator-tires` repo)
> confirmed it lifts the real-defect catch rate **and** surfaced its predicted side
> effect: strong framing with **no materiality bar** sometimes **manufactures a
> Minor / false-positive finding** rather than return clean, and the re-verify loop
> then **churns rounds on it**. The canonical observed instance was **three**
> consecutive remediation rounds spent on `pytest` vs `python -m pytest -v` — a
> distinction with **no behavioural difference**, on work that was correct. This set
> adds the **calibration layer** that kills nitpick churn while leaving the
> Critical/Major catch ceiling untouched: a materiality "so what?" gate in both
> templates, a severity-anchored blocking classifier, the Minor-non-blocking
> re-verify loop discipline, a cross-round issue ledger, and a merge-impact /
> plausible-path-to-harm anti-laundering guardrail. Every layer is **additive — never
> a framing weakening** (L-069-2 is a hard constraint): the Set 070 strong-framing
> pins stay green and `dual_surface_verify.classify_framing_strength` still returns
> `ADVERSARIAL` for both edited templates.
>
> **Design rationale / directive:**
> [`docs/verification-surface-strategy.md`](../../verification-surface-strategy.md)
> § 7, **L-071-1**, and the scoping cross-provider consult (GPT-5.4 + Gemini-Pro,
> 2026-06-18) summarised in `spec.md` § *Design inputs*.
> **Release:** `ai_router` **0.25.0** — version bumped this session; **the PyPI
> publish is deferred at operator request** (a concurrent process in another VS Code
> instance must not be disrupted). The release is **staged, not published**: version
> metadata + `CHANGELOG.md` are committed, but no `v0.25.0` tag is pushed and no
> publish is triggered. No extension / Marketplace change (the Explorer / UI remains
> a non-goal).

---

## Session 1 of 3 — Materiality + anti-nitpick layer in both reviewer templates

**Status:** CLOSED, VERIFIED (gpt-5-4, 11-round loop). No release.

### Shipped

- **The materiality + anti-nitpick layer in both reviewer templates.**
  `ai_router/prompt-templates/verification.md` (push) and
  `prompt-templates/path-aware-critique.md` (pull) gained: the three-part "so what?"
  blocking test (a blocker must name the **exact requirement/claim violated**, the
  **concrete impact**, and the **evidence**; lacking all three it is a nit); the
  **anti-nitpick clause** (a correct+complete response *should* be VERIFIED;
  manufacturing a Minor to dodge a rubber-stamp is itself a false-positive failure;
  judge **semantic equivalence**, not textual identity — the `pytest`-vs-`python -m
  pytest -v` case is named as a worthless finding); the **severity anchor** (Major =
  *would change a reasonable reviewer's merge decision*) + **plausible-path-to-harm**
  escalation; and a non-blocking **`NITS`** output section.
- **Additivity preserved.** The Set 070 `_ADVERSARIAL_MARKERS` phrases
  ("devil's advocate", "assume the work is flawed"), the `{original_task}` /
  `{task_type}` / `{original_response}` placeholders, and the `VERIFIED` /
  `ISSUES FOUND` tokens are all preserved verbatim (L-069-2).
- **Tests.** `test_verification_framing.py` extended: all Set 070 strong-framing pins
  stay green, plus (a) section-anchored assertions that the materiality / anti-nitpick
  / NITS language is present in **both** templates, and (b) a test that
  `classify_framing_strength` returns `ADVERSARIAL` for both edited templates (the
  additivity / dual-surface-equality proof). +47 tests (suite 2126/5).

### Verification

gpt-5-4, 11 rounds (the strong devil's-advocate framing this set is itself about).
All substantive findings adopted; recurring "pins not load-bearing enough" was
**adjudicated non-blocking** per the set's own materiality bar (R11 the verifier
itself emitted a `NITS` section — a live demonstration of the discipline).

---

## Session 2 of 3 — Severity-anchored blocking logic + the re-verify loop discipline

**Status:** CLOSED, VERIFIED (gpt-5-4, 6-round loop, one genuine design split escalated
to the operator). No release.

### Operator decision point — verdict grammar

The spec'd default was binary; the operator requested a cross-provider consult before
committing. GPT-5.4 + Gemini-Pro independently, then a fresh-Claude synthesis —
**unanimous binary** (`VERIFIED` / `ISSUES_FOUND`, no third `VERIFIED_WITH_NITS`
token). The fresh-Claude refinement was adopted: make `is_blocking_verdict` a
first-class, fully-tested, **documented** contract artifact — the bare verdict token
is **not** sufficient to infer blocking. Raw consult outputs:
`s2-grammar-consult-{gpt,gemini,claude-synthesis}.md`.

### Shipped

- **The severity-anchored blocking classifier (`ai_router/verification.py`).**
  `is_blocking_verdict(verdict, issues)` is **severity-DERIVED, not token-derived**:
  given a findings list, any Critical/Major (or unknown / missing-severity) finding
  **blocks regardless of the verdict token passed alongside it**; all-Minor →
  non-blocking; no-findings → VERIFIED non-blocking, non-VERIFIED blocking. The
  anti-laundering net operates on the findings the classifier is *given*: the pull
  surface passes structured `pull_verifier.Finding` severities (net always live),
  while the push parser `parse_verification_response` **trusts a `VERIFIED` token and
  returns no findings** (operator-adjudicated in S2 — see this set's S2 R6 split — so
  it never re-mines a clean review's prose for a hidden Major and reintroduces churn);
  on push the net therefore bites on the `ISSUES_FOUND` path. Plus `classify_blocking` / `BlockingClassification` (the
  blocking-vs-nit partition + a log reason), `reconcile_issue_ledger` /
  `LedgerReconciliation` (stable-id RESOLVED/UNRESOLVED + a resurrection flag for the
  no-reopen-under-fresh-wording rule), and `parse_nits` (additive, observability-only
  — nits **never** enter the issues list, an S1 invariant). A **SURFACE NOTE**
  documents that the classifier is surface-agnostic (push via
  `parse_verification_response`, pull via `pull_verifier.Finding.severity`).
- **Load-bearing `parse_verification_response` robustness fixes** surfaced by the
  churn fixture + the verification loop: the `ISSUES FOUND` header self-match
  (spurious severity-less finding); a markdown-bold `**Severity:** Minor` the old
  regex could not read (→ Minor read as unknown → blocking = the exact churn this set
  kills); the canonical underscored `ISSUES_FOUND` header not stripped (L-069-1
  class-completion: `_` is not whitespace); a `VERDICT:`-prefixed verdict falling
  through to `ISSUES_FOUND`; and a trailing `NITS` section bleeding into the last
  issue's description. The `(verdict, issues)` public contract is unchanged.
- **`VerificationResult` wiring (`ai_router/__init__.py`).** Gained `blocking`
  (= `is_blocking_verdict`) and `nits` (= `parse_nits`) fields (defaulted,
  backward-compatible), populated in `_run_verification`, so the re-verify loop reads
  `result.verification.blocking` instead of the bare token. New symbols exported.
- **The re-verify loop discipline (`docs/ai-led-session-workflow.md` Step 6).** New
  subsection *Materiality and the re-verify loop discipline (Set 071)*: blocking is
  severity-anchored via `is_blocking_verdict` (not the bare token); Minor-only =
  effectively VERIFIED, opens **no** round; anti-laundering; the cross-round issue
  ledger (no resurrection under new wording); surface-agnostic; the 1–2-automatic /
  3+-human bound unchanged (only narrows what counts as a round-justifying finding;
  cites L-069-2). Wired into the Step-7 `ISSUES_FOUND` branch, the max-2-retries item,
  and the Mode-B bounded-round item (L-065-1 echo discipline).
- **Tests (`tests/test_blocking_classifier.py`).** The `is_blocking_verdict` matrix,
  the `classify_blocking` partition, the **verbatim** three-round
  `pytest`-vs-`python -m pytest -v` churn (end-to-end through
  `parse_verification_response` → Minor-only → **non-blocking**), verdict-grammar
  variants, severity-derived-not-token, push-parser-trusts-VERIFIED-token, NITS-no-
  bleed, `parse_nits`, surface-agnostic over `pull_verifier.Finding`, the
  `VerificationResult` wiring, and `reconcile_issue_ledger`. Suite 2165/5.

### Verification

gpt-5-4, 6 rounds. R1 / R3 / R4 were real Critical/Major correctness defects (justified
rounds, not nit churn); R2 a correctly-adjudicated false positive (the push parser was
*not* taught the pull "Findings" grammar — the pull surface parses severity
structurally); R6 a genuine orchestrator-vs-verifier **design split** on the push
surface (trust the VERIFIED token vs whole-response severity scan), **escalated to the
operator** at the round bound per the "3+ human" rule. **Operator adjudicated: trust the
VERIFIED token** (recorded via `record_adjudication`). The session's own verification
loop was a live demonstration of the set's discipline.

---

## Session 3 of 3 — Synthesis + docs + staged release + dogfood + close (FINAL)

**Status:** CLOSED, VERIFIED. Release **staged, not published** (operator-deferred).

### Shipped

- **Strategy synthesis.** `docs/verification-surface-strategy.md` § 7 (new) records
  that strong framing now ships with a materiality gate + Minor-non-blocking loop
  discipline — the calibration layer the steelman-push framing needed — plus the
  three additive layers, the anti-laundering guardrail, and the binary-grammar
  decision. The § 3 targeted-layer description now points to § 7.
- **`ai_router/docs/pull-verifier.md`** gained a *What Set 071 added* section (the
  materiality gate on the pull template + the surface-agnostic classifier + the loop
  discipline).
- **Lesson L-071-1** (portable): strong adversarial framing without a materiality bar
  manufactures Minor-finding churn; the fix is the loop (severity-anchored blocking,
  derived not token-read) + a materiality "so what?" gate + a cross-round issue ledger
  + a merge-impact / plausible-path-to-harm anti-laundering guardrail — never a framing
  weakening (L-069-2). Cites L-069-2, L-065-1, L-070-1.
- **`ai_router` 0.25.0 staged.** Version bumped in `ai_router/__init__.py` +
  `pyproject.toml`; `CHANGELOG.md` gained the `[0.25.0]` entry **and a backfilled
  `[0.24.0]` entry** (Set 070 had bumped the version + tagged `v0.24.0` but never added
  the package-level changelog section — reconstructed here from Set 070's set change-log
  and the strategy doc). **No tag pushed, no publish triggered** (operator-deferred).
- **Dogfood** (`pathAwareCritique: required`): the end-of-set multi-provider
  path-aware critique over this set's own diff; the final round kept as the gate
  artifact `path-aware-critique.json` and every finding adjudicated in
  `disposition.json` (L-070-1).

### Verification

Cross-provider session verification (`routed_gate` REQUIRED — shared verification
surface, high blast radius). Raw output in `s3-verification*.md`.

---

## End-of-set deliverables (all complete)

| Deliverable | Where | Session |
|---|---|---|
| Materiality + anti-nitpick layer (both templates), strong-framing pins intact | `prompt-templates/verification.md`, `path-aware-critique.md`, `test_verification_framing.py` | S1 |
| Severity-anchored blocking classifier + issue ledger + `parse_nits` | `ai_router/verification.py`, `__init__.py` | S2 |
| Re-verify loop discipline (Minor-non-blocking + issue ledger) | `docs/ai-led-session-workflow.md` Step 6 | S2 |
| `pytest`-vs-`python -m pytest -v` churn pinned as non-blocking regression | `tests/test_blocking_classifier.py` | S2 |
| Strategy synthesis (§ 7) + `pull-verifier.md` update | `docs/verification-surface-strategy.md`, `ai_router/docs/pull-verifier.md` | S3 |
| Lesson L-071-1 | `docs/planning/lessons-learned.md` | S3 |
| `ai_router` 0.25.0 (staged; publish operator-deferred) | `__init__.py`, `pyproject.toml`, `CHANGELOG.md` | S3 |
| This change log + dogfood artifact | `change-log.md`, `path-aware-critique.json` | S3 |

A verifier that keeps its strong adversarial framing — and so keeps catching the real
cross-file / correctness defects — but no longer manufactures immaterial findings or
churns re-verify rounds on nits, because a finding must clear a merge-impact
materiality bar to block and a settled point can never be resurrected under fresh
wording.
