# Remediation notes — Set 096 S1, verification round 1

Round 1 (gpt-5-6, template session-verification-v3) returned one Major:
`assemble_cross_round_ledger()` applied the SETTLED / no-resurrection
framing to every prior finding solely because an `sN-issues*.json`
artifact existed — an artifact proves a finding was REPORTED, not
settled, so an unremediated defect could be suppressed in the next
round (fail-open on the machinery's main path). Finding ACCEPTED.

Fix (fail-closed, per the verifier's suggested remedy): no-resurrection
framing is now EARNED. A prior finding renders as SETTLED only with
settlement evidence — an explicit settling per-issue `resolution_status`
(`fixed` / `not-reproducible` / `accepted-risk` / `accepted-consequence` /
`advisory-disagreement`; open or unrecognized statuses never settle), or,
for status-less findings, a NON-EMPTY `sN-remediation-round-<R>.md`
sidecar for that round (the orchestrator's settlement assertion — this
file is exactly that record for round 1). All other prior findings render
under a separate "WITHOUT settlement evidence — NOT settled" block that
instructs the verifier to re-evaluate them and states that re-raising an
unsettled point is not resurrection. An unreadable issues artifact and an
empty sidecar are explicitly NOT settlement evidence. Per-issue status
takes precedence over the round sidecar, so an `escalate-human` finding
can never be laundered into a settled point by a sidecar.

Changes: `ai_router/verify_session.py` (`assemble_cross_round_ledger`,
`_render_ledger_issue`, `_SETTLED_RESOLUTION_STATUSES`, docstrings),
`ai_router/tests/test_verify_session.py` (settlement-evidence tests:
bare-artifact → unresolved framing; settling status → settled;
open-status-despite-sidecar → unresolved; empty sidecar → unresolved;
unreadable artifact → re-evaluate), `ai_router/CHANGELOG.md` (ledger
bullet updated). Targeted suites re-run green (163 passed:
test_verify_session + framing + stamp).
