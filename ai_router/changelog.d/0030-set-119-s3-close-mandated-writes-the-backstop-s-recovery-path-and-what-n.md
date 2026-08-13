## [Unreleased] — close-mandated writes, the backstop's recovery path, and what nothing reached (Set 119 S3)

### Removed

- **(Set 119 S3) Four modules nothing reached: `floor_ratchet.py` (914),
  `routed_gate.py` (437), `pricing_proposal.py` (1,581) and
  `cost_report.py` (551) — 3,483 LOC plus 3,012 lines of tests (235
  tests).** Unreachability was PROVEN before anything was deleted, with a
  static import graph over all 78 `ai_router/*.py` modules (`ast`, no
  execution), against the spec's three criteria: no import from a close
  path, no console-script entry point, no reference in
  `router-config.yaml`. `routed_gate` was retired as a skip authority by
  Set 083 and answered `REQUIRED` unconditionally thereafter; the cost
  surface could not be populated at all on a Copilot seat, where all 83
  routed calls record `billed_usage_unavailable: true` and
  `cost_usd: 0.0`.

  **Breaking for library consumers:** `ai_router.get_costs` and
  `ai_router.print_cost_report` are gone, as are the `routed_gate`
  re-exports (`evaluate_routed_gate`, `RoutedGateDecision`,
  `ROUTED_GATE_TRIGGERS`, `BREADTH_THRESHOLD`, `TRIGGER_*`).
  `python -m ai_router.report` still summarises `router-metrics.jsonl`
  and the extension's cost dashboard is unchanged. The dead
  `output.cost_report_on_exit` and `verification.routed_gate`
  `router-config.yaml` keys went with them — neither had a reader.

  **`pricing.py` STAYS**, as does `contract_gate.py`, `spec_admission.py`
  and `replacement_gate.py`: the last three turned out to be REACHABLE
  and are reported rather than forced. `close_session.run` calls
  `validate_contract_gate` as a live close gate, `session_checklist`
  calls `spec_admission.parse_session_plans` to seed the plan the
  `checklist_posted` gate reads, and `dual_surface_verify` imports
  `replacement_gate.validate_benchmark_registration` at module scope. The
  line: a module is reachable when a surviving module CALLS it; an
  `__init__` re-export is publication, not use.

### Added

- **(Set 119 S3) Close-mandated writes are a declared CATEGORY, so a
  close-out artifact no longer stales the verification it just passed.**
  A writer declares a module-level `CLOSE_MANDATED_WRITES` literal;
  `verification_stamp.discover_close_mandated_writes` finds it by parsing
  the source with `ast` — no import, no side effects, safe on the close
  path — so a fifth close-mandated writer is exempt the moment it says
  so, **in either scope**, with no list here to edit.

  Two `bound` values, because the honesty matters. A per-set ledger is
  close output end to end (`whole-file`, a pathspec exclusion). A
  guidance file is only PARTLY close output: `cite_lessons` owns one
  `last-used-set` trailer field and the lesson prose around it is session
  WORK. So `cite_lessons` declares a normalizer
  (`guidance_meta.normalize_close_mandated_metadata`) and the freshness
  digest compares normalized-current against normalized-at-base, dropping
  the file entirely when only the mandated field moved. Exempting the
  file wholesale would have let a post-verification rewrite of a
  **preload** document ride a passed round — a verification reduction, so
  not an option.

  Why it mattered: the constitution MANDATES `cite_lessons` in the final
  commit, so every citing session staled its own stamp between verifying
  and closing, and the backstop quietly bought a metered round to
  re-verify a byte-identical tree. It surfaced in Set 119 S2 only because
  the round budget was already spent, so the backstop refused instead of
  paying.

- **(Set 119 S3) Every round now records the baseline it reviewed, so the
  backstop's own recovery path is reachable.**
  `verify_session.record_round_completed` takes an omit-null
  `discovery_baseline_tree` and `find_discovery_baseline_tree` reads the
  `sN-rounds.jsonl` ledger as well as the `sN-issues*.json` envelopes.
  The envelope is written only on a findings-bearing round, so the two
  states that most need a baseline left none — a **clean** discovery
  round, and **every close-backstop round** (which is unphased) — and
  `--phase remediation-review` refused with `EXIT_USAGE`, forcing a full
  ~$0.88 discovery round to reach a ~$0.07 fix-delta review.
  `verify_session` now snapshots for every round except a
  remediation-review itself, which must never become a baseline or a
  second cycle would diff from the first fix instead of from the original
  discovery baseline.

### Changed

- **(Set 119 S3) `EvidenceTooLargeError` now inherits from
  `VerifySessionError`.** They were siblings, and `close_backstop`
  catches the parent at four sites while catching this one at exactly
  one — so an oversized evidence bundle took the close down with an
  unhandled traceback on four paths: the gate gone, no remediation line,
  on the most expensive path there is. Fixing the TYPE fixes all four
  (L-069-1: the class, not the instance). The exit-code distinction never
  lived in the class relationship, only in handler ORDER, so the
  `verify_session` CLI's clauses were reordered — it caught the parent
  first, and a subclass caught after its parent is unreachable code.

- **(Set 119 S3) The backstop's blocking refusal names the phase, and the
  command it names now works.** It said "re-verify with `verify_session`
  (the sanctioned remediation loop)" while `--phase remediation-review`
  failed closed from exactly that state.
  `gate_checks._verify_session_command` takes an optional `phase`, and a
  test PARSES the refusal text and executes the command it names from the
  state it was printed in.



