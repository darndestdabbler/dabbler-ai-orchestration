# Verification Round 1

Verifier: gemini-pro (google), task_type=code-review
Verdict: ISSUES_FOUND -> resolved (one Minor finding addressed; see below)

## Findings

### 1. (Minor) `read_capacity_summary` had a confusing dual-return for timezone normalization

The original implementation guarded against a naive injected `now`
by special-casing the "aware record + naive now" branch with its
*own* `CapacitySummary` construction and an early `return`. The
verifier flagged this as harder to read than necessary.

Investigation surfaced a related latent bug: even before the
verifier's recommended cleanup, the in-window math two blocks
earlier (`if ts_dt >= cutoff:`) would have raised
`TypeError: can't compare offset-naive and offset-aware datetimes`
if a caller ever passed a naive `now` — the dual-return only
covered the *time-since-last* arithmetic, not the in-window
comparison. Production callers always pass `_utc_now()`, so the
hole was unreachable in practice; tests didn't trigger it either.

**Resolution:** Normalize a naive `now` to UTC once at the top of
`read_capacity_summary`. After that, every datetime in the function
is aware, the in-window comparison no longer needs guards, and the
time-since-last block collapses to a single subtraction + single
return. Added a regression test
`test_naive_now_against_aware_record_does_not_crash` that injects
a naive `datetime` and asserts both the in-window count and the
`time_since_last_seconds` are computed correctly.

## Detailed Analysis Checklist (verifier output, summarized)

1. **All deliverables met in full?** Yes. `capacity.py` module,
   role-loop wiring, and outsource-last cost-report mode are all
   present and behave per spec.

2. **Heartbeat-only framing — loud enough?** Yes. The
   `capacity.py` module docstring, the
   `read_capacity_summary` docstring, the `CapacitySummary` dataclass
   doc, and a prominent `NOTE` at the bottom of the outsource-last
   text report all repeat the same message: this is observational,
   not predictive. The framing is reinforced four times across
   different surfaces.

3. **Failure / follow-up paths — no signal on incomplete work?**
   Yes. The capacity-signal write happens *only* after a successful
   `queue.complete()`; failure and `awaiting_followup` outcomes
   bypass it. Confirmed by `test_capacity_signal_wiring.py`.

4. **Concurrency:** The implementation uses `open(..., "a")` text-mode
   append for JSON Lines, which is per-line atomic on POSIX and on
   Windows for write sizes well below the pipe-buf limit. Verifier
   accepted the design; daemons typically write to provider-specific
   directories so cross-process contention is rare.

5. **Schema stability:** Enforced. `write_capacity_signal` populates
   the on-disk record by name from `completion_metadata`, dropping
   unknown keys; missing keys serialize as JSON null.
   `test_unknown_metadata_keys_are_ignored` and
   `test_missing_metadata_fields_become_null` pin the contract.

6. **Tests:** Comprehensive. No spec deviations, no obvious gaps.

## Cost

Verifier call: $0.0488 (gemini-pro, 28087 input + 1366 output tokens,
61.2s elapsed).
