# Verification-Loop Remediation (out-of-band, July 2026)

**Status:** landed on `master` (`dabbler-ai-router` 0.32.0, publish operator-gated).
**Repo:** `dabbler-ai-orchestration` — the `dabbler-ai-router` package lives at
`ai_router/` in this repo, so every commit hash, branch, and file path below
resolves in **this repository's** history.
**Done deliberately OUT OF BAND** — not through this framework's own verification
loop, because that loop was the thing being repaired. Integrity came instead from
**git + the full pytest suite + independent, different-provider (GPT) review**.

This document is the durable record of what was wrong, how it was fixed, and why
the work happened outside the tool. It is assembled from the three
per-session-set summaries produced during the effort (`ss1-summary.md` /
`ss2-summary.md` / `ss3-summary.md`, which lived in the **separate external
remediation workspace** and are not part of this repo — their substance is
synthesized here, so this file is the authoritative in-repo record).

---

## 1. Why out of band
The verification loop had become a "run-away train": it refused to exit on
minor-only findings (endless churn), and its anti-fabrication gates could still
be bypassed. Fixing that *through* the orchestrator would have re-triggered the
very loop under repair, and would have meant verifying the verification code with
itself (standing on the branch being sawn). So the work was done in a separate
workspace, on branches `fix/critical-eval-ss1..ss3`, with a manual cross-provider
review at each step.

## 2. The governing principle
**The builder cannot release itself.** Release requires evidence from a *different
provider* than the implementing agent, and the release decision is *computed by
the framework*, never asserted by the agent. Everything below serves that
sentence. (An early, more elaborate "separation-of-powers" design — legislative /
judicial / referral / appeal roles — was deliberately cut down to this principle
plus a small set of deterministic gates; the elaborate apparatus was over-scoped.)

## 3. What was fixed, by session set

### SS1 — severity-aware loop exit + anti-self-release (commit `a7a471f`)
Two layers disagreed about what "blocking" meant: the severity predicate existed
but the workflow state machine (`derive_state`) ignored it and treated *any*
undispositioned issue as loop-keeping. Fixes:
- One shared `is_blocking_issue()` predicate now backs `is_blocking_verdict`,
  `classify_blocking`, **and** `derive_state`. A Minor-only round closes as
  "verified with observations" instead of churning.
- The `VERIFIED`-token short-circuit was removed — a structured Major under a
  mislabeled `VERIFIED` now goes to `awaiting-human` (contradictory evidence).
- Unknown/unauthorized `resolution_status` is invalid evidence → `awaiting-human`
  (checked above both branches).
- `accepted-risk` / `accepted-consequence` / `not-reproducible` are human-stops
  (the builder cannot self-accept a Major); only `fixed` stays terminal.
- The push parser surfaces a genuinely *structured* blocking block under a
  `VERIFIED` token (line-anchored; never scans prose).

### SS2 — bind the close's severity decision to the hash-bound artifact (commit `60c887d`)
The close decided minor-only-ness by reading severities from the **unbound,
editable** `sN-issues.json` envelope, so a hand-edited severity could launder a
Major into a non-blocking close. Fix: the close settle-logic reparses the
**hash-bound raw artifact** (`sN-verification*.md`) instead — its bytes are
re-validated against `artifact_sha256`, so editing the envelope changes nothing
and editing the artifact fails validation. No stamp-schema (the on-disk schema
of the hash-bound verification artifact) migration was needed.

### SS3 — evidence completeness + anti-rollback (commit `a48c6e6`)
- **Untracked content:** the verifier now sees the *content* of new files
  (file-level `git ls-files --others`); binary / oversized / symlink /
  generated-bundle-excluded files are reported as **explicitly uncovered**.
- **Truncation:** a truncated response is invalid evidence →
  `EXIT_VERIFICATION_UNAVAILABLE`, writing nothing.
- **Anti-rollback:** the **latest verification attempt governs** — the gate and
  the close backstop fail closed when the newest stamped row is invalid, so a
  newer failed/truncated attempt can no longer be discarded in favor of an older
  favorable valid row.

## 4. Accepted boundary (documented, not a bug)
The Lightweight/dedicated tier's engine-arm cross-provider check lets two
different engines on the *same* provider pass as independent. This is retained on
purpose: the Full tier already excludes the orchestrator's **effective provider**,
so the enforced release gate is correct; the Lightweight tier is router-off and
unstamped (weaker by design). Documented in the `cross_provider_satisfied`
docstring. Tightening it would break backward-compatible configs for marginal
value.

## 5. Deferred (revive on telemetry)
A `derive_evaluation_decision()` refactor (redundant — the decisions are already
correct), an attempt-history round budget (needs a durable attempt ledger), and
honest machine-verified vs operator-waived release labels.

## 6. Verification & review
- Full unit suite **2898 passed** + **8 e2e**, verified green even under CI's
  no-`copilot` condition (reproduced locally by removing the CLI from PATH). Two
  **pre-existing, unrelated** CI failures that predated this work were fixed to
  unblock the release: a drift-guard docs-lint false positive (commit `e3e6a4d`;
  `module-organized-projects-recommendation.md:315`, the "no python" bigram) and
  four Set 086 copilot-preflight tests missing their stub (commit `2af75fc`;
  see §8).
- The independent, different-provider review process caught **nine** real defects
  the builder missed across the three sets (e.g. the unimplemented accepted-*
  self-release, a divergent VERIFIED-branch severity filter, an anti-rollback gap
  that made SS3's own truncation claim overstated). Each was reproduced against
  the branch, then fixed. This is the governing principle working in miniature:
  the builder could not verify itself; cross-provider review caught what it was
  blind to.

## 7. Delivery
The fixes are the **Python package `dabbler-ai-router`** (bumped to 0.32.0), **not
the VSIX** — the VS Code extension bundles only its compiled TypeScript and was
unchanged. Users receive the fixes by installing/updating the Python package
(pip / the extension's "Update ai-router" command / the built wheel), then
publishing is operator-gated via a git tag → PyPI.

## 8. Salvaged: Set 086 — Copilot-seat verification integrity (a cancelled set)
**Set 086 (`verification-verdict-token-legibility` / Copilot-seat verification
integrity) was formally CANCELLED in the orchestrator** (commit `426808c`;
`docs/session-sets/086-verification-verdict-token-legibility/CANCELLED.md`) — a
casualty of the same run-away verification loop this remediation repairs. Its code had nonetheless
landed on `master` (CHANGELOG `[0.31.0] — Unreleased`), orphaned there with a
**red CI** ever since (which is why 0.31.0 never published). This remediation
salvages it: its CI was fixed here — four `start_session`-driven tests were
missing the copilot-preflight stub that Set 086's own design provides, so they
failed in CI where the `copilot` CLI is absent — and Set 086's work now ships
**inside 0.32.0** rather than being lost in the cancellation queue.

What Set 086 delivered (all on `master`, now shipping):
- **Auth-preflight** (`copilot_preflight.py`): a staged binary → credential →
  live-probe check wired into `start_session`, so a mis-authed copilot-cli seat is
  **blocked from starting** a session it could never honestly verify.
- **Close fail-loud on missing evidence**: an absent/empty/unreadable
  `session-events.jsonl` is a high-severity finding that **hard-blocks the close**
  (`gate_checks.check_verification_integrity` + `writer_discipline` ledger check),
  not a silent skip.
- **Verdict-token validation at the blessed writer**
  (`session_state.validate_verification_verdict`): an exact normalized allowlist
  (`VERIFIED` / `ISSUES_FOUND` / `WAIVED` + `ISSUES_FOUND_RESOLVED_IN_FLIGHT`); a
  free-form or prefix look-alike token (`VERIFIED_NOT_REALLY`) is **rejected**.
- **Togglable transport diagnostics** (`transport_diagnostics.py`): every failed
  copilot-cli dispatch emits a structured, prompt-redacted JSONL record so a
  dispatch failure is never silently swallowed.

The through-line: Set 086 was *itself* an anti-fabrication / verification-integrity
effort ("verify for real or stop loudly, never silently accept a confabulated
result"). It was cut down by the runaway loop; this remediation both fixes that
loop and rescues Set 086's contribution to the same goal — the two belong in one
documentation record.
