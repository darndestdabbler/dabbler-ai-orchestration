# Change Log — Set 077 (Lightweight Tier UX and Copilot Hardening)

> **What this set delivered.** The coordinated release for the
> Copilot-locked team's mission-critical adoption week (2026-07-06): the
> Getting Started tier leak is closed with webview state persistence plus
> durable `.dabbler/tier` / `.dabbler/verification-mode` markers read
> marker-first by every downstream surface; the form gains a three-way
> setup choice (Full / Lightweight + dedicated verification sessions /
> Lightweight + out-of-band-or-none) and a Python prerequisite warning with
> a no-artifacts-on-failure pre-flight; out-of-band verification completes
> itself — the canonical `docs/dabbler/cross-provider-verification.md` doc
> is ensure-written into every workspace, the pointer-style Evaluate
> prompts require the reviewing engine to write its own verdict to
> `external-verification.md`, a round-aware parser recognizes `VERIFIED` /
> `ISSUES_FOUND` / `WAIVED`, and the soft gate is content-aware and keyed to
> the resolved runtime mode; and Mode B is Copilot-fit — the close gate
> passes on engine **or** provider difference (the sanctioned
> single-engine-Copilot pattern), a start-time guardrail refuses a
> same-pair verification session before any write, owed states surface as
> a loud `start_session` banner on both tiers, and the Explorer auto-routes
> "Start Next Session" to the right kickoff/remediation prompt.
>
> **Design background:** [`spec.md`](spec.md) (six sessions; two
> pre-authoring critiques folded in, `planning-critique-1-planning.md` and
> `planning-critique-2-architecture.md`).
> **Release:** `dabbler-ai-router` **0.27.0** + extension **0.34.0** —
> published 2026-07-04 (see *Release status* below).

---

## Session-by-session summary

1. **Comprehensive review baseline and triage** — full-repo code review
   across both the TypeScript webview/extension and the Python router,
   routed across six bundles with cross-provider auto-verify; findings
   triaged into the spec.
2. **Tier truth chain (Feature 1)** — fixed the webview-state tier leak
   (hide/reload silently reverting a Lightweight pick to Full); added the
   durable `.dabbler/tier` marker read marker-first by every prompt/message
   builder; tier-mismatch advisory when the marker and spec disagree.
3. **Getting Started three-way choice and Python prerequisite (Feature 2)**
   — the tier step gained the dedicated-sessions / out-of-band-or-none
   sub-choice (persisted as `.dabbler/verification-mode`); a Python
   interpreter probe warns inline and gates the Build action before any
   durable write, so a missing interpreter fails friendly with nothing left
   behind.
4. **Out-of-band self-completing verification (Features 3-4)** — authored
   the canonical `docs/dabbler/cross-provider-verification.md` instructions
   doc (ensure-written into every workspace); rewrote the Evaluate prompts
   pointer-style with a mandatory write-the-artifact close; added the
   `external_verification` round/verdict parser (`WAIVED` included) and
   fixed the soft gate's mode-keying and lazy-synthesis misclassification
   (the A12 defect).
5. **Verification owed — every surface says so (Feature 5)** — extended
   `validate_dedicated_verification` to accept an engine-or-provider
   difference with a start-time refusal mirroring the close gate; added the
   `start_session` pending-verification banner (Mode B and out-of-band);
   the Explorer now reads the durable `verificationMode` record over the
   spec seed and auto-routes "Start Next Session" to the kickoff or
   remediation prompt.
6. **UAT, path-aware critique, and coordinated release** — built and
   locally installed the VSIX; authored the ad-hoc UAT checklist (initially
   suspended by the operator over instruction quality — see below); ran the
   required multi-provider path-aware critique (clean); bumped both
   packages and CHANGELOGs; published.

## The UAT rewrite (Set 078 authoring bar)

The first UAT walk was suspended mid-session: steps required guessing,
left the operator unable to tell a product bug from a misread instruction,
and assumed shared context a fresh reader doesn't have. Rather than
patching individual steps, the checklist was rewritten wholesale to match
the bar Set 078's own UAT demonstrated: every `HumanAction` a literal,
copy-pasteable command or exact UI element label; every `Expectation` a
literal string/value to diff against; every claim re-grounded against
current source (two real drifts were caught and fixed — a stale button
label, and a false claim that the Getting Started doc's tier callout
differs by verification mode, when it is tier-only). The four purely
CLI/Python walks (the pending-verification banner and the Mode-B
start-time gate) were converted to self-contained scratch-fixture recipes,
live-dogfooded by the orchestrator with byte-for-byte captured output,
replacing a dependency on a fragile multi-walk VS Code scaffold chain for
a feature that never needed VS Code to reproduce. The re-walk passed
14/14 with zero feedback.

While reviewing for the release, both `README.md` files (root and the
extension's Marketplace listing) were found to have drifted from the
actually-shipped feature set and were updated: the three-way setup choice,
the Python prerequisite check, the canonical verification doc and
self-completing prompts, and the pending-verification banner / auto-routing
were all previously undocumented.

## Release status (as of this close)

**Published.** `dabbler-ai-router` `0.27.0` shipped to PyPI 2026-07-04
(tag `v0.27.0`, release.yml run
[28718682653](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718682653),
tagged commit `51fc437` — the commit where the 0.27.0 version bump
landed, before Set 078 bumped `pyproject.toml` further to 0.28.0).
Extension `0.34.0` shipped to the VS Code Marketplace and Open VSX the
same day (tag `vsix-v0.34.0`, publish-vscode.yml run
[28718703898](https://github.com/darndestdabbler/dabbler-ai-orchestration/actions/runs/28718703898),
tagged commit `a391f61`) — the existing `VSCE_PAT` was still valid, no
renewal was needed. Set 078's `v0.28.0` was pushed immediately after, per
the release-ordering invariant. See `docs/repository-reference.md` →
*Current release status* / *Recent version walk* for the full run-id
evidence.

**Rollback pair**, if a hotfix-grade defect surfaces during the adoption
week: extension `0.33.1` + router `0.26.2` (both remain published).

## A pre-existing CI defect fixed in passing

The last two commits from Set 078 Session 5 had left the `Test` workflow
red on `master`: the consumer-bootstrap `AGENTS.md` tail template gained
Set 078's Copilot-seat-profile bullet, but the committed cold-start golden
fixtures were never regenerated (`UPDATE_GOLDEN=1`), so the snapshot test
failed on every push since. Regenerated as part of getting this set's own
commit to green before tagging.

## Follow-on scope identified, not in this set

Reviewing the shipped Copilot CLI hybrid tier (Set 078) against its
original motivation surfaced a real onboarding gap: the `copilot-cli` seat
profile is not represented anywhere in the Getting Started form, so a
Copilot-locked operator has no way to discover it exists. Combined with a
request to simplify the Lightweight verification-mode radio copy (current
strings are jargon-dense), this is planned as a new session set rather
than folded into this close.

## End-of-set deliverables

- Tier truth chain: durable marker, truthful prompts/messages, mismatch
  advisory, regression fixtures (Defect 1 closed).
- Getting Started: three-way setup choice seeding `tier` +
  `verificationMode`; Python prerequisite warning; Troubleshooting template
  landed; drift guard green.
- Out-of-band verification: canonical instruction doc (also templated to
  consumers), pointer prompts with a mandatory write-the-artifact close,
  templated `external-verification.md`, content-aware and correctly-keyed
  soft gate, no redundant double-gate.
- `start_session` pending-verification banner on both tiers.
- Mode B: engine-or-provider gate (Copilot-locked shops pass on provider
  difference), Explorer reads the durable mode record, owed-state
  auto-routing of the next-session prompt, documented single-engine
  pattern.
- Review artifacts: S1 findings, per-session verifications, end-of-set
  multi-provider path-aware critique.
- UAT checklist rewritten to the Set 078 authoring bar; re-walked 14/14
  clean.
- Both READMEs reconciled against the shipped feature set.
- Releases: `dabbler-ai-router` 0.27.0 and extension 0.34.0, both
  published 2026-07-04.
