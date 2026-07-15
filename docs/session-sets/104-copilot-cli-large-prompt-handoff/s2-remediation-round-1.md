# S2 — Remediation note for verification round 1

Round 1 (discovery, gpt-5-6, 2/2 fan-out) returned **ISSUES_FOUND** with two
findings that are the **same issue** surfaced independently by both fan-out
calls:

- **L1 (Correctness, Major, call 1)** and **L2 (Completeness, Major, call 2):**
  the live probe ran through **Copilot CLI 1.0.69** while
  `ai_router/copilot-catalog.lock` pins **1.0.68**
  (`cli_version_pin_required = true`), yet `s2-live-probe.md` and the CHANGELOG
  claimed verification "through the pinned CLI" / "release-ready." The spec's
  end-state names the **pinned** CLI. The verifier's accepted remediations were:
  (i) test on 1.0.68 and replace the evidence; (ii) repin to 1.0.69 + reconfirm,
  then retest; **or (iii) remove the "pinned CLI" / "VERIFIED" / "Release-ready"
  claims.**

## Finding is ACCEPTED (not disputed)

The finding is correct and material. My own probe evidence disclosed the
1.0.69-vs-1.0.68 mismatch but wrongly filed it as "not a blocker." Deeper
inspection during remediation confirmed it is worse than a wording slip: the
pin is **runtime-fail-closed** — `copilot_catalog.validate_catalog` runs in
`ai_router/__init__.py` during `route()` setup for the `copilot-cli` profile
and raises `RuntimeError: CLI version drift` on the mismatch **before any
dispatch**. The S2 probe only worked because it called `CopilotCliTransport`
directly, bypassing that gate. So a real `copilot-cli`-profile `route()` on
this 1.0.69 seat is blocked — which is exactly the path **Set 103's Copilot+ADO
walk** would take.

## Remediation applied (verifier's accepted option iii + operator adjudication)

This finding does **not** call for a transport-code change — the handoff code
is proven (58/58 fake-spawner tests + a live end-to-end read of an 82,231-byte
payload on 1.0.69) and is version-agnostic (it writes a temp file and reads the
same JSON result shape as the inline path). The defect is (a) a misrepresenting
**claim** and (b) a **pre-existing catalog/seat drift** (the lock was probed
2026-07-04 on 1.0.68; the seat has since auto-updated to 1.0.69).

1. **Removed every overclaim (verifier option iii).** `s2-live-probe.md` and
   `ai_router/CHANGELOG.md` no longer say "through the pinned CLI," "VERIFIED
   through the pinned CLI," or "release-ready." They now state plainly that the
   handoff was proven **on 1.0.69**, that the spec's "pinned CLI" end-state is
   met in *intent* but not in *letter*, and that the drift blocks the
   `copilot-cli` profile.
2. **Disclosed the drift as a first-class Known Issue.** A dedicated CHANGELOG
   "Known issue" entry and a top-of-file banner in `s2-live-probe.md` explain
   the fail-closed mechanism, its blast radius (the `copilot-cli` profile only —
   **not** the default `api` profile, and **not** the router-package publish),
   and the reconciliation options.
3. **Operator adjudication (logged; AskUserQuestion, Set 104 S2).** Presented
   the three reconciliation paths (ship-and-defer / repin-to-1.0.69-and-reprobe
   / downgrade-to-1.0.68-and-reprobe) with costs. The operator chose **ship
   0.34.0 now and reconcile the pin as part of Set 103's seat prep** — the pin
   drift is pre-existing and only blocks the `copilot-cli` profile Set 103 first
   exercises, and Set 103 is already blocked on other seat preconditions (ADO
   org, Copilot seat, parallel-jobs grant), so the reconciliation naturally
   bundles there. It is recorded as an explicit Set-103 precondition, not lost.

## Resolution status

- **L1 / L2 — fix-accepted (resolution: claims corrected + drift disclosed +
  reconciliation carried to Set-103 seat prep by operator decision).** The
  deliverable no longer misrepresents anything; the material blocker is
  disclosed and assigned an owner/next-step, not hidden. No transport-code
  regression risk (no code change). The literal "verify on the pinned version"
  action is deferred with the pin reconciliation, by operator decision, because
  the version it would test (1.0.68) is not the version the operator's seat runs.
