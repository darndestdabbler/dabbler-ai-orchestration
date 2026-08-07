# Session 1 — remediation round 1

Findings from discovery round 2 (both lenses) and supplementary round 3,
remediated once, with acceptance checks run against the pre-fix and fixed
states.

---

## L1 / L2 — Unplanned Copilot CLI transport change is outside the S1 contract and not release-documented (Major, Completeness)

*Reported independently by both discovery lenses (call 1
`spec-conformance`, call 2 `failure-scenario`) — the same underlying
point, verdicted here once.*

**Accepted, in part, and the finding was right about the process.** The
verifier could not see two facts, because the evidence bundle did not
carry them: the change was **operator-authorized mid-session**, and the
conventions block it was reviewing was written *before* that
authorization and never updated. A reviewer discovering an out-of-scope
transport change with no disclosure is exactly the failure mode this
finding names, and the disclosure gap was real.

**What was NOT accepted:** the finding's proposed resolution ("remove
it"). The change exists because this session's own **mandatory**
verification could not run: `cli_transport.py` hardcoded a 300s total
dispatch ceiling with no config or env path, and a full
`session-verification` bundle (~116 KB over the Set 104 file-handoff
path) cannot complete inside it — two consecutive
`error_class='total-timeout'` dispatches with nothing written, while a
trivial prompt through the same CLI returned in 13s. The orchestrator
refused to self-authorize, stopped to the operator with five options, and
the operator chose *add the config knob and raise it*. Reverting it would
re-break the gate.

**Fix:**

1. `s1-conventions.md` gains a **"Scope extension, operator-authorized
   mid-session — disclosed"** section: what changed, why, the decision
   trail (including that the orchestrator refused to self-authorize), the
   value's derivation, and the known trade-off.
2. The release contract in the same file now says **four** `[Unreleased]`
   entries, not three.
3. `ai_router/CHANGELOG.md` carries the fourth `(Set 111 S1)` entry for
   the transport knob (added while the discovery round was still in
   flight, so the round's evidence snapshot predates it).

**On the residual risk the second lens named** (a dispatch that streams
output then stalls now occupies 20 min instead of 5): real, stated in
both the config comment and the changelog, and bounded — a dispatch that
never starts still dies at `first_byte_seconds: 30`. The ceiling is now
per-seat tunable, which is why a knob was chosen over moving a constant.

**Acceptance check** — the disclosure exists and the counts agree:

```
$ grep -c "Scope extension, operator-authorized mid-session" \
    docs/session-sets/111-.../s1-conventions.md
```

| state | result |
|---|---|
| pre-fix | `0` — no disclosure section |
| fixed | `1` — disclosure present |

```
$ grep -c "(Set 111 S1)" ai_router/CHANGELOG.md
```

| state | result |
|---|---|
| pre-fix (at round-2 evidence snapshot) | `3` |
| fixed | `4` — matches the "four entries" release contract |

---

## L3 — Clean supplementary passes do not consume the enforced discovery bound (Major, Correctness)

**Accepted in full. This is a real defect and the finding is exactly
right**, including its reproduction: `discovery` (blocking) → clean
`supplementary` → third `supplementary` routed instead of refusing.

**Root cause.** `count_phase_family_rounds` counted only findings
envelopes, on the reasoning that "a clean round ends the loop on its
own". That reasoning holds for every clean round *except one*: a clean
`supplementary` round whose prior discovery blockers still stand does
**not** end the loop — `supplementary_blockers_stand` returns
`EXIT_BLOCKING` and the loop continues to remediation. It is the second
discovery pass, and it writes no envelope, so it was invisible to the
bound. The core Ends-with ("a third cycle is structurally impossible
without recorded operator authorization") was false on a common path.

**Fix — one artifact, not two.** The envelopes cannot express "did this
round end the loop", so the bound now reads a per-session **round
ledger**. Rather than adding a second bookkeeping file beside the
authorization trail this session had already introduced, the two were
**merged**: `sN-rounds.jsonl` is one append-only ledger with two record
kinds (`event`), the pre-call `operator-authorization` and the post-call
`round-completed` (phase, verdict, `blocking`, `endedLoop`).

- `count_phase_family_rounds` counts the **union by round number** of
  ledger records with `endedLoop: false` and findings envelopes — so
  sessions that predate the ledger keep their enforcement, and a blocking
  round (which leaves both) is never counted twice.
- The reader is tolerant: a torn final line is skipped and never voids
  the records before it. Failing open there would unlock the loop.
- `WORK_DIFF_SET_BOOKKEEPING` follows the rename (`s*-rounds.jsonl`), so
  a line appended mid-loop cannot stale an earlier round's stamped
  evidence.

**Acceptance check** — the reported reproduction, as a test:

```
$ .venv/Scripts/python.exe -m pytest ai_router/tests/test_verify_session_phases.py \
    -k "clean_supplementary_over_standing_blockers_consumes_a_pass" -q
```

| state | result |
|---|---|
| pre-fix | **FAILS** — the third pass ROUTED (`assert 4 == 2`: `EXIT_BLOCKING`, not the `EXIT_USAGE` refusal), reproducing the reported defect exactly |
| fixed | **PASSES** — third pass refused, `third.calls == []`, "discovery pass 3 of a bounded 2" |

The pre-fix state was produced by reverting **only** the ledger half of
the fix (`count_phase_family_rounds` reading envelopes alone) and running
the unchanged test against it, so the check is a genuine
fails-before / passes-after discriminator rather than a criterion that
passes either way.

Four sibling tests cover the class rather than the instance (L-069-1): a
loop-ending clean round is recorded but not counted; the ledger and the
envelopes never double-count; a ledger-less session still counts from
envelopes; a torn ledger line does not unlock the bound.

---

## Suite after remediation

`test_verify_session_phases.py` + `test_verify_session.py` +
`test_cli_transport.py` + `test_session_issues_schema.py` +
`test_config.py` → **287 passed, 0 failed**.
