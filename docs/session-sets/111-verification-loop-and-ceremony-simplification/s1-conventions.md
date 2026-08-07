# Session 1 conventions and baseline — Set 111

Read this before the work. It states the suite baseline, the release
contract, and the by-design exclusions, so the round spends its findings
on real defects rather than on the agreed starting state.

## What this session is

Set 111 Session 1 of 4: **make the verification loop's bounds real.**
Three changes to `ai_router/verify_session.py` plus tests and the doc
echoes:

1. **Enforce the phase bounds.** The documented totals (2 discovery
   passes, 2 remediation-review cycles) were advisory only —
   `count_phase_rounds` fed a printed "Next action" message and nothing
   refused a run past them, and they were exceeded in practice (13 calls
   / 379 min in one session; 9 rounds in Set 110 S1). The CLI now refuses
   the round that would pass a bound, before any metered call, unless
   `--operator-authorized-round "<reason>"` carries a non-empty operator
   attestation, appended to the per-session round ledger
   `sN-rounds.jsonl` — which also records every completed round's phase,
   verdict and `endedLoop`, because that (not the findings envelopes) is
   what the bound must count.

   *Corrected after remediation round 1: this line named the earlier
   `sN-round-authorizations.jsonl` design, which the S1 supplementary
   round's finding replaced with the merged ledger. The nit was raised by
   remediation-review round 4 and is fixed here (L-065-1: fix every echo
   in one pass).*
2. **Vary the discovery framing.** The K=2 fan-out sends two
   differently-framed prompts (`spec-conformance`, `failure-scenario`)
   over the same evidence instead of identical ones. Same K, same cost,
   same envelope merge.
3. **Wire the severity-gated stop into the exit path.** A Minor-only
   round is named as such and offered only the close command.

The authority for all three is
`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`
(§10 Q5 resolved: the bounds fail because nothing enforces them — the fix
is enforcement, not a different number; §10 first bullet: keep only the
framing-variation residue of the dead Proposal A) and the 2026-08-05
operator notes in `docs/session-sets/110-work-explorer-native-treeview/operator-notes.md`.

## Suite baseline (measured this session, on this machine)

**Targeted, after the last code change — all green:**

- `test_verify_session_phases.py` + `test_verify_session.py` +
  `test_session_issues_schema.py` → **208 passed, 0 failed**.
- Earlier, the verification-machinery set (`_phases`, `verify_session`,
  `verification_stamp`, `verification_integrity_gate`,
  `close_backstop`) → **298 passed, 0 failed**.

**Full `ai_router/tests` run → 3,181 passed, 16 failed, 10 skipped.**
All 16 failures are **environmental on this seat and pre-existing**, in
two classes, and none touch a module this session changed:

- `test_drift_guard.py` (2) — `Missing environment variable
  DABBLER_OPENAI_API_KEY for provider 'openai'`. **Proven pre-existing:**
  re-run with this session's changes stashed → the same 2 failures,
  36 passed.
- `test_pull_verifier.py` (6), `test_routing_exclusion_integrity.py` (6),
  `test_orchestrator_identity.py` (2) — `CopilotCliRoutingError: Copilot
  CLI dispatch failed ... error_class='total-timeout'`. These dispatch
  the **real** Copilot CLI; this seat runs the `copilot-cli` transport
  profile with no provider API keys, so they time out by construction.

This is exactly the fresh-clone / seat-dependent class Set 110 recorded:
invisible-or-inevitable locally depending on which side of the key
divide the machine sits.

## Scope extension, operator-authorized mid-session — disclosed

**This session's diff is larger than the plan's Touches list, on the
operator's explicit instruction.** Disclosed here rather than left for a
reviewer to discover:

`ai_router/cli_transport.py`, `config.py`, `__init__.py`,
`router-config.yaml` and `test_cli_transport.py` gain a
`transports.copilot-cli.timeouts` block (default-preserving; validated at
load). **Why:** this session's own **mandatory** verification could not
run. `cli_transport.py` hardcoded a 300s total dispatch ceiling with no
config or env path, and a full `session-verification` evidence bundle
(~116 KB, dispatched over the Set 104 file-handoff path) cannot complete
inside it — two consecutive `error_class='total-timeout'` dispatches with
nothing written, while a trivial prompt through the same CLI returned in
13s. That is a mandatory gate the transport could not complete, the same
class and the same reasoning as Set 109 S3 raising
`providers.google.timeout_seconds` from 300 to 900.

**Decision trail:** the orchestrator refused to self-authorize the change
and stopped to the operator with the options (add a knob / raise the
constant / shrink the evidence / manual-verify path / stop unverified).
The operator chose *add the knob and raise it*. The specific value
(`total_seconds: 1200`) is the orchestrator's, derived from measurement:
the round that finally completed took roughly 12 minutes, so 900 would
have left almost no margin, and the discovery phase deliberately asks for
the largest answer the loop ever requests.

**Known trade-off, stated rather than hidden:** a dispatch that streams
some output and then stalls can now occupy up to 20 minutes instead of 5.
A dispatch that never starts is unaffected — `first_byte_seconds` stays
at 30s. The value is per-seat tunable, which is the point of making it a
knob rather than moving a constant.

## Release contract

- `ai_router/CHANGELOG.md` gains **four** `[Unreleased]` entries under
  `### Changed`, tagged `(Set 111 S1)` — the enforced bounds, the
  discovery lenses, the Minor-only stop, and the transport-timeout knob
  above — and the `[Unreleased]` heading now names Set 111. **No version
  bump, no publish** — publishing is operator-gated and this is session 1
  of 4.
- No extension (`tools/dabbler-ai-orchestration/`) change: this set
  touches no Explorer-rendering surface (`requiresE2E: false`).

## By-design exclusions — not defects in this round

- **`requiresUAT: true` belongs to Session 4, not this one.** The spec
  assigns the guided-look walk to S4, which dogfoods the new format on
  itself. S1 ships no UI.
- **Close-out artifacts do not exist yet.** This is a pre-close review at
  Step 6: `close_session`, `change-log.md`, the final `disposition.json`,
  and the committed/pushed state all come after it.
- **Sessions 2–4 scope is deliberately absent.** Acceptance criteria with
  baseline discrimination (S2), the decision-rights rubric and decision
  journal (S3), and the ceremony pass (S4) are later sessions. Their
  absence here is the plan, not an omission.
- **The bounds' NUMBERS are settled and out of scope.** Proposal §10 Q5
  resolved that the fix is enforcement, not retuning; §"Non-goals" defers
  consequence-weighted budgets to a follow-on. A finding that argues 2
  should be 3 is re-litigating a settled decision.
- **Proposal A (a parallel lens wave) is dead as framed** and only its
  framing-variation residue survives. A finding asking for N parallel
  lenses, dedupe machinery, or a lens experiment is out of scope
  (proposal §10 Q1, resolved: measuring it would itself be ceremony).
- **The classic no-`--phase` path stays for compat.** Its bound is now
  enforced too (deliberately counting *any* prior findings-bearing round,
  so dropping `--phase` at the phased bound is not a one-flag bypass),
  but the path itself is not being removed here.
- **`ai_router/local-overrides.yaml` is gitignored and seat-local.** Its
  `transport.profile: copilot-cli` is why the key-dependent tests fail
  above; it is not part of the diff.

## An unusual artifact in this set's folder — disclosed, not hidden

`s1-verification.md` and a `VERIFIED` `disposition.json` appeared in this
set's directory mid-session. **This session did not create them**, and no
`session-verification` row for Set 111 exists in
`ai_router/router-metrics.jsonl`, so nothing stamped corroborates them.
The operator was asked, directed that it be treated as a third-party
verification and the verification redone, and asked that a note be
recorded in case it recurs. Accordingly:

- The artifact is **left in place, unedited** (verification artifacts are
  raw records), so it occupies round 1 and **this session's own routed
  verification runs as round 2+**.
- This session closes only on **its own** stamped evidence.
- One substantive point from that artifact was **acted on**: it observed
  that the new exit line said "VERIFIED -- no findings" even for a
  `VERIFIED` + `NITS` response (a `VERIFIED` token drops the NITS section
  at the parser). The wording is now "VERIFIED -- no Critical/Major
  findings. Record any nits from the raw artifact", with a test.

## Severity rubric for this round

Grade by **expected consequence**: probability the stated failure
scenario reaches a real user × impact. Low probability **or** low impact
is Minor. No nameable failure scenario is a nit, not an Issue. Every
Critical/Major needs its concrete failure scenario stated.
