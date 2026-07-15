# Manual-verify attestation — Set 104 Session 2

**Close method:** `close_session --manual-verify` (the sanctioned operator
override of the Set 083 verification-integrity backstop). **Verdict recorded:**
`WAIVED`.

## What was found (real, not disputed)

Cross-provider verification ran normally via the router API and found a genuine
**Major**: the live >32 KiB probe was executed against **Copilot CLI 1.0.69**
(the operator's installed seat), while `ai_router/copilot-catalog.lock` pins
**1.0.68** with `cli_version_pin_required = true`. That pin is runtime
fail-closed (`copilot_catalog.validate_catalog`, invoked in `ai_router/__init__.py`
during `route()` setup for the `copilot-cli` profile), so the spec's end-state
("VERIFIED working through the **pinned** CLI") is unmet in letter, and a real
`copilot-cli`-profile `route()` on the 1.0.69 seat would raise
`RuntimeError: CLI version drift` before the handoff runs.

- Round 1 (discovery, gpt-5-6, 2/2 fan-out): ISSUES_FOUND — this finding, twice.
- Round 2 (remediation-review, gpt-5-6): accepted the correction delta
  (overclaims removed; drift disclosed as a Known Issue) — VERIFIED, 1 fix
  accepted.
- Round 3 (close backstop, gpt-5-6, full diff vs the S1 baseline):
  independently RE-FOUND the pinned-CLI acceptance-gate gap. Expected — the gap
  is real and cannot be closed in code; only testing 1.0.68 or repinning to
  1.0.69 would satisfy it.

## Why it is waived (operator decision)

The finding is **not resolvable in code**. The orchestrator surfaced it plainly
and presented the reconciliation paths twice. The operator adjudicated via two
explicit `AskUserQuestion` decisions (logged in this session):

1. **Reconciliation:** *ship 0.34.0 now* (the handoff transport is proven — 58
   fake-spawner tests plus a live end-to-end read of an 82 KB payload on 1.0.69
   — and is version-agnostic) and **reconcile the catalog pin as part of Set 103
   seat prep**, alongside Set 103's other unmet preconditions (ADO org, Copilot
   seat, parallel-jobs grant). The drift is pre-existing (lock probed
   2026-07-04) and affects only the `copilot-cli` profile — not the default
   `api` profile, and not the router-package publish.
2. **Close path:** *close via the attested override* (`--manual-verify`,
   verdict WAIVED) and push the `v0.34.0` PyPI tag.

The waiver is honest and bounded: the Major is disclosed as a first-class Known
Issue in `ai_router/CHANGELOG.md` and in `s2-live-probe.md`, and the pin
reconciliation is carried forward as a **new blocking precondition for Set
103's `copilot-cli`-profile walk**, not silently dropped. This is an
operator-attested acceptance of a real, disclosed finding — not a confabulated
verification pass.

**Operator:** darndestdabbler (session operator).
**Date:** 2026-07-15.
