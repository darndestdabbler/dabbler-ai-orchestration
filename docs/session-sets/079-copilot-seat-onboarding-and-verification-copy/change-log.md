# Change Log — Set 079 (Copilot Seat-Profile Onboarding and Verification-Mode Copy)

> **What this set delivered:** A discoverable, guided setup for the
> `copilot-cli` transport profile inside the Getting Started webview form,
> giving Copilot-locked shops an onboarding path that does not require
> provider API keys. Bundled with this was a plain-language rewrite of the
> form's jargon-dense verification-mode radio descriptions, requested by the
> operator.
>
> **Non-goals (unchanged):** This set did not change the `copilot-cli`
> transport's underlying behavior, its fail-closed rules, or Set 078's
> single-seat evidence posture. Multi-seat / enterprise availability was
> NOT validated. The direct-API Full tier is unchanged.
>
> **Design background:** A single routed architecture critique was run
> against the spec draft. It returned three CRITICAL findings (seat
> identity, catalog-refresh sequencing, and failure UX for the keyless
> audience) which were all resolved in the spec before Session 1 started.
> See `architecture-critique.md` for the full review.
>
> **Release:** extension **0.35.0** — published 2026-07-05, tag
> `vsix-v0.35.0`, commit `c2ed2b4`, publish run 28751504260;
> extension-only, `dabbler-ai-router` stays 0.28.0.

---

## Session 1 of 5 — Copilot CLI presence probe + Full-tier sub-choice UI

**Status:** VERIFIED (cross-provider, round 1)

Landed the UI for the new Full-tier sub-choice ("Direct provider API
keys" vs "GitHub Copilot CLI seat"), mirroring the existing Lightweight
verification-mode radio pattern. The new `copilotCliPath` setting and a
presence probe for the CLI were added, surfacing a warning if the CLI is
missing when the operator selects the Copilot option. State management
(`gsState`, seed/dirty/reload precedence) was extended to cover the new
radio group. Verification confirmed the reachable warning matrix and the
probe's platform-specific resolution logic. Build-time wiring was
explicitly deferred to Session 2.

---

## Session 2 of 5 — Wire the happy path — sequencing, subprocess, progress, config write

**Status:** VERIFIED (cross-provider, round 3)

Implemented the core seat-setup logic. This included deriving a stable
seat ID and label without operator input; wrapping the
`copilot_catalog --refresh` CLI call in a cancellable, host-teardown-safe
subprocess with progress reporting; and parsing its stdout to confirm at
least two providers were found (the CLI's exit code is not a sufficient
success signal). The call is now sequenced to run strictly *after* the
scaffold's venv and `ai_router` install succeed. The resulting
`transport.profile: copilot-cli` is written via a safe field
replacement, not a naive append. A real-seat dogfood run against the live
Copilot CLI succeeded, confirming the happy path. Verification rounds 1-2
drove out a single integration ledger issue before the final pass.

---

## Session 3 of 5 — Failure matrix, honest failure UX, and E2E judgment

**Status:** VERIFIED (cross-provider, round 2)

Hardened the seat-setup logic by implementing the full failure matrix.
The failure UX is now "honest": it checks for `DABBLER_*` keys and only
presents the `api` profile as a working fallback if keys are present. For
the target keyless audience, failures state plainly that the router is not
yet functional. Config writes were made process-crash-atomic (temp+rename),
and POSIX process cancellation was hardened to kill the entire process
tree (unit-pinned only; the session's dogfooding was win32-only). The
session recorded the decision not to add new Playwright Layer-3 tests, as
the async UI is a native VS Code notification not reachable by the
webview-only harness.

---

## Session 4 of 5 — Simplify verification-mode copy (Feature 2)

**Status:** VERIFIED (cross-provider, round 1)

Landed the second, independent feature: a plain-language rewrite of the
two Lightweight verification-mode radio descriptions. The new copy was
verified against the actual behavior of the dedicated-sessions workflow.
The change was swept through the codebase to update all quoted references,
including READMEs and pinning tests, ensuring no stale copy remained. This
session touched no Feature 1 code and remained independently landable.

---

## Session 5 of 5 — Docs, UAT, and release

**Status:** VERIFIED (cross-provider, round 2; UAT-remediation rounds 3-4
also VERIFIED)

Docs were updated to reflect the new guided flow and its evidence basis,
including the honesty stance: validated on a single personal seat only
(the same seat as Set 078's dogfood), multi-seat/enterprise availability
NOT validated, POSIX cancel-kill unit-pinned only, config write
process-crash-atomic only. The end-of-set multi-provider path-aware
critique ran and its artifact is committed (`path-aware-critique.json`):
gemini-2.5-pro returned clean; gpt-5.4's one Major (a claimed nonexistent
recovery command) was adjudicated accept-finding **with false-premise
notes** — two of its three evidence claims were refuted by grep/source
evidence, and its real residue (a fictional command name in a test
fixture) was fixed. A spec-authoring gap was recorded for future sets:
the spec's prose called this critique "required" but the configuration
block never seeded `pathAwareCritique`, so the immutable set-start policy
capture stayed `none` and the producer's identity guard initially refused
the artifact write — prose does not arm the gate; the config block does.

The operator's UAT walk then caught a pre-existing, high-impact defect:
fresh Windows scaffolds were silently failing to seed
`router-config.yaml` because the install's config-seed one-liner crashed
on `cp1252` text-mode stdout, which broke the guided seat setup at the
config-write step. This was fixed in verification rounds 3-4 with a
raw-bytes config seed (plus a named, no-longer-silent seed-failure
message) and a class-wide UTF-8 chunk-decode fix across all five spawner
sinks. The operator re-walked UAT walks 4 and 5 to PASS against the
rebuilt VSIX; walk 3 was waived by explicit operator decision with the
Layer-2 evidence rationale recorded in the checklist. Set 080
(sub-choice legibility + screenshot refresh) was queued from operator
UAT feedback.
