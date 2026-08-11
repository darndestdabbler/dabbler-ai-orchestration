# Session 2 — remediation notes for rounds 1 and 2

Both discovery passes are remediated here in **one pass**, as the loop
discipline requires. All five findings were **accepted**; none was
disputed, and none was a false positive.

Four of the five (round 1) turned out to be **one root cause**, which is
why they are answered by one change rather than four patches.

---

## The root cause behind round-1 findings 1, 2 and 3

`close_session.run` evaluates the close backstop **before** the gate
chain (`close_session.py:1866` → `close_session.py:2005`). The first cut
of `close_preflight.evaluate` had it backwards: it walked `GATE_CHECKS`
first and appended the backstop row afterwards. Two consequences, both
found:

1. **A no-evidence close was reported as a `verification_integrity`
   refusal** (findings 1 and 2). It is not one. The backstop runs first,
   and on `VERIFIED` it writes the artifact and the stamped metrics row
   that gate looks for. The gate was being evaluated against a tree in
   which the thing it wants had not been created yet.
2. **The backstop's mid-close bookkeeping was not tolerated** (finding
   3). `close_session` passes `backstop.written_paths` to
   `working_tree_clean` as `extra_clean_ignore` so a rerun after a
   gate-failed backstop round does not trip over the artifacts, findings
   envelope, round ledger and patched disposition that round wrote
   (I-084-S2-9). The preflight never obtained them.

This mattered more than an ordinary ordering bug because it broke the
tool in **its own central case** — a finished session with no stamped
evidence, which is the 79-of-214 case the session exists to surface —
and it broke it in the exact direction the module's docstring promises it
cannot: reporting a refusal the close would not make.

### The fix

`evaluate` now runs `_backstop_obligation` **first** and feeds its
decision into the gate chain, mirroring the close:

- `extra_ignore_paths` is passed to `working_tree_clean` from
  `decide_backstop`'s settling row, exactly as `close_session` does.
- When the backstop **would route**, `verification_integrity` is reported
  as **not yet decidable** rather than unmet: the detail names the
  backstop row as where the close is actually decided, and carries the
  standing gate verdict in parentheses so nothing is hidden.

### What the fix is careful NOT to do

The deferral is **conditional on the backstop actually running**. When
the backstop stands down — the zero-budget tier, an illegal method token
— nothing will supply the missing evidence and `verification_integrity`
is genuinely the refusal, so it still blocks. That look-alike is pinned
by `test_integrity_still_blocks_when_the_backstop_will_not_run`.

And the report no longer claims a would-route close "would proceed".
Exit 0 there means *nothing you can fix by hand is outstanding*, not
*this close succeeds* — the backstop's verdict does not exist until the
round is paid for. `render` now prints a third summary line saying so,
and `test_but_the_report_does_not_claim_the_close_would_proceed` asserts
the words "would proceed" are absent. Overclaiming success would have
been the same error as the original refusal, pointing the other way.

---

## Round-1 finding 4 — `--session-number` was only half-honored

Correct, and the fix is **removal**, not extension. The flag relabeled
the report and steered the backstop row, while every registry predicate
went on resolving the session in focus from `session-state.json` — a
mixed-session report that reads like a single-session one.

Extending it was not available: the predicates each read the session
themselves and the spec scopes this session to `gate_checks.py` **callers
only, no predicate changes**. Removal is also what consistency wants —
`close_session` has no session flag either (it peeks the state file), and
the preflight predicts *that* close. `resolve_session_number` lost its
`explicit` parameter, so a mixed-session report is now unrepresentable
rather than merely undocumented.

---

## Round-2 finding — the two set-terminal gates were missing

Correct and independent of the above. `close_session` evaluates two more
gates **after** the registry chain: the Set 066 path-aware-critique gate
(`close_session.py:2059`) and the Set 068 contract gate
(`close_session.py:2164`), both keyed on the same compute-once
set-terminal predicate. A preflight that walked only `GATE_CHECKS` could
say it had named every *registered* obligation while omitting two that
really do refuse a close — which defeats the completeness promise that is
the whole point.

`_terminal_policy_obligations` now reports both, mirroring the close's
posture rather than inventing one:

- `required` → blocking; `advisory` → reported and never blocking;
  `none` → **no row at all** (a set that declares nothing pays nothing,
  and two permanently-met rows would be noise).
- Non-terminal close → no row, because the gates do not fire there.
- **Fail-open**, matching the close's "any internal error here never
  wedges close-out" contract: an error reading either policy drops the
  row rather than inventing a refusal.

Both names are in `preflight_check_names()` so the historical replay
counts a past failure of either as covered.

---

## Verification

- `ai_router/tests/test_close_preflight.py` — 53 tests, all passing.
  New: `TestItMirrorsTheClosesOrdering` (5) and
  `TestSetTerminalPolicyGates` (5). Per `L-112-1` each rule is planted
  **both** ways — the defect that must be reported, and the legitimate
  look-alike that must not be.
- `test_close_backstop.py`, `test_gate_checks.py`,
  `test_close_session_skeleton.py`, `test_path_aware_critique_close_gate.py`,
  `test_contract_gate_close.py` — 135 passing, unchanged: the fix is
  entirely inside `close_preflight`, and `run_close_backstop`'s behaviour
  is untouched.

---

# Round 3 (remediation-review) — two accepted findings

Round 3 accepted three of the four round-1 fixes and **rejected one**,
plus raised a new in-hunk finding. Both are correct, both are mine, and
both are the same species as the round-1 root cause: *the preflight
claimed something the close does not do.* Fixed together.

## Round-3 finding 1 — `required` is not unconditionally blocking

**Rejected fix, correctly.** `close_session` hard-blocks a failed
`required` terminal gate **only in an interactive TTY**; when stdin is
not a TTY, or `--accept-suggestions` was passed, it emits a soft warning
and the close **succeeds** (`close_session.py:2124-2136`, mirrored at
`:2164+` for the contract gate). My fix set
`blocking=(level == required_level)` unconditionally.

Agents and CI run headless. So on the most common invocation path the
preflight would have reported a blocking refusal for a close that
actually succeeds — the precise contract violation ("can never refuse
something the close allows") that round 1 already caught once, reappearing
in the fix for round 2. That is exactly the pattern this set's spec warns
about: *two of the three Major findings were introduced by fixing the
previous one.*

**Fix.** `_close_would_be_interactive()` reads the same signal the close
reads (`sys.stdin.isatty()`), and a `required` failure is blocking only
when it holds. Headless, the row is still **reported** — the signal is
never dropped — with the detail naming why it does not refuse and what
would change in a terminal. An uninterrogable stdin is treated as
non-interactive: the direction that under-claims rather than over-claims.
`--accept-suggestions` is invisible to the preflight and only ever moves
the close further toward soft-warn, so ignoring it cannot cause an
under-report.

Pinned both ways: `test_a_required_critique_with_no_artifact_is_reported_blocking`
(TTY → blocks) and
`test_a_required_critique_headless_is_reported_but_does_not_block`
(headless → reported, does not block).

## Round-3 finding 2 — the JSON and the human report disagreed

The round-1 fix taught `render` to say "NOT yet decided" for the
backstop-would-route state but left `to_dict()` computing
`would_close = not unmet_blocking`, i.e. `true`. The two surfaces of one
report gave **opposite conclusions on the single case this tool exists
for**, and `--json` is the surface automation reads.

**Fix.** The verdict is now a first-class tri-state,
`PreflightReport.verdict`, with one spelling that both surfaces consume:

| verdict | meaning | `would_close` |
| :--- | :--- | :--- |
| `would-refuse` | a deterministic blocking obligation is unmet | `false` |
| `undecided-backstop-would-route` | nothing hand-fixable is outstanding, but the backstop runs first and **its** verdict settles the close | `null` |
| `would-close` | the close is decided and would proceed | `true` |

`would_close` is deliberately **tri-state rather than dropped**: a
consumer that naively tests truthiness on `null` gets the *safe* answer
(not closeable) instead of the dangerous one. `render` now branches on
the same `verdict` property, so the two surfaces cannot drift again
without a test failing.

Pinned three ways — one per verdict —
(`test_json_and_human_reports_agree_on_the_undecided_state`,
`test_json_says_true_only_when_the_close_is_actually_decided`,
`test_json_says_false_when_the_close_would_refuse`) so "always null"
cannot pass.

## Verification (round 3)

`ai_router/tests/test_close_preflight.py` — **57 tests, all passing**
(53 → 57: one TTY falsifier and three verdict falsifiers).

