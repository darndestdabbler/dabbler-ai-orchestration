# Session 2 conventions and baseline — Set 111

Read this before the work. It states what this session is, the suite
baseline, the release contract, and the by-design exclusions, so the
round spends its findings on real defects rather than on the agreed
starting state.

## What this session is

Set 111 Session 2 of 4: **acceptance criteria with baseline
discrimination** (Proposal B). One new module, one prompt-template
revision, one envelope-schema extension, and one framing change to the
retained final review:

1. **The verifier envelope carries an acceptance block.**
   `ai_router/prompt-templates/verification.md` now asks for a per-Issue
   `Acceptance criterion:` (a single backticked command, or
   `JUDGMENT - <sentence>`) and an optional `Acceptance expectation:`
   (`exit <n>`, `output contains "<substring>"`), plus a *Writing an
   acceptance criterion* section stating the rules a command must obey.
   `verification._parse_acceptance` parses both forms tolerantly into the
   new optional per-issue `acceptance` object; `docs/session-issues.schema.json`
   and `docs/session-issues-schema.md` document it.
2. **`ai_router/acceptance_harness.py` runs them, gated by baseline
   discrimination.** Each **unchanged** criterion runs against the round's
   `discoveryBaselineTree` (pre-fix) and a fresh working-tree snapshot
   (fixed). A finding auto-closes **only** on fails-before AND
   passes-after. Results are written to `sN-acceptance-round-<M>.json`.
3. **Containment.** Verifier-authored shell is untrusted input, so both
   runs happen in **disposable git worktrees** checked out from the
   captured tree objects (`git commit-tree` + `git worktree add
   --detach`), never the live working tree; with **no shell** (shell
   operators are refused, not interpreted), a credential-stripped
   environment carrying `DABBLER_NO_ROUTER=1`, a wall-clock timeout, and
   cleanup on every path including errors.
4. **Exactly one `remediation-review` is retained.**
   `verify_session.assemble_acceptance_block` renders criteria-closed
   findings *with both runs' evidence* and non-closing criteria *with the
   reason they did not close*, keyed by the same ledger ids the
   fix-verdict coverage check uses; the phase framing directs the round
   at what the fixes **broke** and what the criteria **missed**.

The authority for all four is
`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`
§5 (Proposal B), §6 (the OpenAI critique and its baseline-discrimination
guard, including the untrusted-code point the author had missed), and §9
(the Set 109 S4 counterexample that bounds B and is why the final review
survives), plus the spec's Session 2 plan.

## Deliberate design decisions — please review these AS DECISIONS

These are choices, not oversights. Challenge them on their merits; do not
report them as omissions.

- **Fix-verdict coverage is UNCHANGED.** A criteria-closed finding still
  gets its `Fix verdict:` line every cycle. The Set 096 S2 round-11
  operator decision removed prior-acceptance exemption because it
  forfeits the regression check, and Proposal B does not re-open that.
  What B buys is that the line costs one restatement instead of a
  re-derivation.
- **No adequacy checker is built.** Baseline discrimination proves a
  criterion is *related* to the defect, never that it is *sufficient*
  (§10 Q2/Q3 — deliberately unresolved; OpenAI and Google disagree). The
  retained holistic review owns sufficiency. A finding that "the harness
  cannot tell whether the criterion was the RIGHT one" is a restatement
  of a settled decision, not a defect.
- **Every non-closing outcome fails CLOSED** — the finding keeps its
  blocking status. That includes `error` (timeout / spawn failure): an
  infrastructure problem must never masquerade as discrimination.
- **A criterion must be BACKTICKED to be executable.** Unfenced prose
  parses as `judgment` and is never handed to a runner. The `JUDGMENT`
  marker wins over a backticked span, so a judgment sentence quoting a
  command stays judgment.
- **Shell operators are REFUSED, not interpreted.** The harness spawns no
  shell; a criterion carrying `&&`, `|`, `;`, redirection or `$(...)`
  becomes `refused-unsafe` rather than being run with the operators
  passed through as literal argv (which would silently change what the
  verifier meant).
- **Only TEST assets invalidate, not product files.** The fix *must*
  change product code; invalidation exists so the person being judged
  cannot edit the ruler. The classification is code-side
  (`_TEST_ASSET_PATTERNS`).
- **The criterion hash covers the whole contract** (command +
  `expectedExitCode` + `expectedOutputContains`), not just the command:
  weakening the expectation is an edit even when the command is
  byte-identical.
- **A new module rather than more `verify_session.py`.** The spec's
  *Touches* line names `verify_session.py`; the harness is a new file
  because `verify_session.py` is already ~3,700 lines and because
  untrusted-code execution deserves an isolated, separately-testable
  surface. `verify_session.py` is still touched (the acceptance block,
  the ledger-id map, the framing, the next-action lines).
- **The harness is a separate command, not an automatic step inside
  `verify_session`.** It is invoked between remediation and
  `--phase remediation-review`, and the CLI's *Next action* block now
  prints it at that moment. Running it is not a gate: skipping it simply
  means every finding arrives at the review as an open question.

## Operator-authorized scope extension (2026-08-07)

Recorded here in full because it is **outside this session's spec plan**
and must be reviewed as a deliberate, authorized addition rather than
mistaken for scope creep.

**What the operator said.** *"There are generally two types of users of my
extension — (a) those who will use the Copilot CLI and not need the API
keys (me and my staff) and (b) those who will use the API keys without
Copilot. So, we shouldn't complain or even generate a warning regarding
the absence of keys unless someone is attempting to do the Full Tier with
direct APIs."*

**The defect this exposed, and the fix.** `config.load_config()` validated
provider API keys at **load** time for any `api`-profile config. That made
every **read-only** consumer of the config fail on a keyless machine.
The repository's own drift guard is the worked example: its docstring says
it "reads only local files — `router-config.yaml` and the committed
`ai_router/model-inventory.lock` — and never probes a provider", yet it
could not run without `DABBLER_OPENAI_API_KEY`. Its two tests were
failing on this seat and had been classified (in Session 1) as
"pre-existing environmental failures" — they were a real defect wearing
that label.

- `load_config(path, *, require_api_keys=False)` no longer validates by
  default; the validation moved into a named, testable
  `config.validate_provider_api_keys(config)`.
- `ai_router/__init__.py::_init()` — the **dispatch** entry point — passes
  `require_api_keys=True`. The `copilot-cli` exemption still applies
  inside the validator, so a Copilot seat never complains even there.
- `providers.call_model` continues to raise its own missing-key error at
  the true point of use, so the **direct-API path is not weakened** — a
  keyless direct-API user still fails loudly, twice over. Only the false
  alarms are gone.
- Docs now present the two transports side by side rather than treating
  keys as universally required: `docs/quick-start.md`,
  `docs/session-constitution.md` (Step 0), `CLAUDE.md`, `GEMINI.md`.
  (`AGENTS.md` already qualified its instruction with the profile.)
- Tests: `test_transport_profile_config.py` gains the read-does-not-
  require-keys case plus direct coverage of the validator's two exemptions;
  `test_drift_guard.py` gains
  `test_model_registry_drift_needs_no_provider_api_keys`, which
  deletes `DABBLER_OPENAI_API_KEY` from the environment and asserts the
  guard both passes clean and still catches real drift.

**Also recorded, not built:** a note for Set 112 to relabel the two
Full-tier transports in user-facing surfaces to **"Direct APIs"** and
**"Copilot CLI"**, in
`docs/proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md`
→ *Operator notes recorded during Set 111*. The note states the default
assumption explicitly — **new labels, same config values** — because
renaming `transport.profile: api` on disk is a breaking change for every
consumer that already set it.

**Also fixed, same root cause, test-only.** Session 1 recorded a second
class of "pre-existing environmental" failures: 14 tests in
`test_pull_verifier.py` (6), `test_routing_exclusion_integrity.py` (6)
and `test_orchestrator_identity.py` (2) that dispatch the **real** Copilot
CLI and time out. They are the mirror image of the same defect. Each of
those tests fakes the **direct-API** seam — `ai_router.call_model`, or
`httpx` — so each is asserting a property of the `api` transport. But
they loaded the seat's real config, and this seat's gitignored
`local-overrides.yaml` says `transport.profile: copilot-cli`, so `route()`
sailed past the fakes and dispatched the live CLI. After Session 1 raised
the CLI's total ceiling from 300s to 1200s, each one hung for **up to 20
minutes**, which is why the first attempt at this session's full run had
to be abandoned.

Two shared fixtures in `ai_router/tests/conftest.py` remove the seat from
the equation:

- `placeholder_provider_keys` — sets placeholder `DABBLER_*` keys for a
  test whose provider call is faked (the key is never sent).
- `direct_api_transport` — additionally points `AI_ROUTER_CONFIG` at a
  copy of the **shipped** `router-config.yaml` in a scratch directory,
  where no `local-overrides.yaml` sits beside it. The shipped file is
  pinned to `profile: api` by a packaging invariant with its own test, so
  the copy *is* the shipping configuration these tests mean by "the live
  registry".

Result: all 14 now run as the Direct-APIs population they were written
for, on any seat. `test_orchestrator_identity.py` +
`test_routing_exclusion_integrity.py` → **115 passed in 17s** (previously
hanging); `test_pull_verifier.py` → **148 passed, 3 skipped in 18s**.
**This session therefore deselects and excuses nothing** — the first
session in this set with a genuinely clean full run on this machine.

## Suite baseline (measured this session, on this machine)

**Targeted, after the last code change — all green:**

- `test_acceptance_harness.py` → **50 passed, 0 failed** (the new suite).
- `test_verify_session_phases.py` + `test_verify_session.py` +
  `test_session_issues_schema.py` + `test_verification_framing.py` +
  `test_verification_stamp.py` → **302 passed, 0 failed**.
- `test_drift_guard.py` + `test_production_imports.py` +
  `test_entry_points.py` + `test_close_backstop.py` +
  `test_verification_integrity_gate.py` + `test_guidance_meta.py` →
  **186 passed, 2 failed** on the FIRST pass — the two failures were
  `test_model_registry_drift_flags_an_id_the_provider_does_not_offer`
  and `test_model_registry_drift_passes_on_a_real_id`, which Session 1
  had recorded as "pre-existing environmental" (missing
  `DABBLER_OPENAI_API_KEY` on this Copilot seat). The operator-authorized
  scope extension above **fixed them at the root**: both now pass on a
  keyless seat, so this session has **no** deselected or excused tests.

- `test_transport_profile_config.py` + `test_drift_guard.py` +
  `test_config.py` + `test_local_overrides_merge.py` + `test_metrics.py`
  → **85 passed, 0 failed**, with no keys present.
- `test_orchestrator_identity.py` + `test_routing_exclusion_integrity.py`
  → **115 passed in 17s** (these used to hang for ~20 min each).
- `test_pull_verifier.py` → **148 passed, 3 skipped in 18s**.

**Full run of record — `python -m pytest ai_router/tests`, after the last
code change, NOTHING deselected: 3,563 passed / 0 failed / 10 skipped in
15m36s.** This is the first fully clean full run on this machine in the
set: Sessions 1's two excused classes (16 failures, plus 14 more tests it
had to deselect for CLI timeouts) were root-fixed above rather than
carried forward.

## Release contract

- `ai_router/CHANGELOG.md` gains a `[Unreleased]` entry for the harness.
  **No version bump and no publish** — publishing is operator-gated and
  happens at a release boundary, not in a session. A finding that "the
  version was not bumped" is out of scope.
- The extension (`tools/dabbler-ai-orchestration/`) is **untouched**.
  This session ships no UI surface, which is why the set declares
  `requiresE2E: false`. `requiresUAT: true` is a **set-level** flag that
  Session 4 dogfoods on the new guided-look format; S2 owes no walk.

## By-design exclusions (not defects)

- **Close-out state does not exist yet.** This is a pre-close review:
  no `close_session`, no `change-log.md`, no final disposition verdict,
  nothing committed or pushed. Their absence is never a finding.
- **This review's own machinery** (`s2-verification*.md`,
  `s2-issues*.json`, `s2-acceptance-round-*.json`, `s2-rounds.jsonl`) is
  an immutable raw record, not a deliverable under review.
- **Sessions 3 and 4 own their own scope**: the decision-rights rubric
  and decision journal (S3), and the ceremony pass — artifact-necessity
  review, session-size cap, test-run policy, guided-look UAT, walk
  stager, guidance streamlining, CI hygiene (S4). Work deferred to them
  is deferred **by the spec**, not by omission.
- **`operator-notes.md`** in this set folder is operator input recorded
  at the start of this session (the unaccounted-verification instruction
  and two Work Explorer convenience items for a future set). It is a
  record of what the operator said, not a deliverable of this session.
