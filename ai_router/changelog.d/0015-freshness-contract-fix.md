## [Unreleased] — the verification freshness contract stops eating its own tail

### Fixed

- **Writing a session's evidence documents staled the verification that had
  just passed.** The freshness digest binds every changed file that is not on a
  narrow exempt list, and that list covered the *machine-generated* round
  artifacts (`s*-verification*.md`, `s*-issues*.json`, …) but had no pattern at
  all for the documents an orchestrator writes **about** its own session. Those
  are written after the round by construction — an outcome document reports
  what verification found.

  Measured live in Set 113 S6: staled **twice**, cost **$0.9607** in rounds and
  an operator interruption, and the second staleness was caused by
  `s6-adjudication-request.md` — the document explaining the first one.

  `s[0-9]*-*` joins `WORK_DIFF_SET_BOOKKEEPING`. A digit is required after the
  `s` so `spec.md` — the set's contract, which must always bind — cannot match.

  **And it joins `EVIDENCE_VISIBLE_BOOKKEEPING` in the same change.**
  `PHASED_EVIDENCE_SET_EXCLUDES` is *derived* from the freshness list, so
  adding the pattern to only the first tuple would have hidden a session's own
  outcome document from the round reviewing it — trading a freshness bug for a
  verifier-visibility bug, which is the one an orchestrator may never
  self-authorize (Set 111 S3). The narrower round-artifact patterns stay
  excluded from the bundle: a round re-reading its predecessors' verdicts is
  the bias that separation exists to prevent.

- **`pull_critique` now declares `path-aware-critique.json` as a close-mandated
  write.** The constitution puts the path-aware critique at **Step 8** — after
  the session's verification round has stamped its evidence — so writing the
  artifact staled the stamp of a verification that had just passed, and the
  close backstop answered with a fresh metered round. In Set 113 S6 that round
  was handed a delta of twelve documentation and bookkeeping files with **zero
  source in it**, correctly reported that five settled findings had no
  remediation *there*, and cost a round plus an operator adjudication to
  establish that nothing was wrong.

  Declared by the **writer**, in source, rather than added to a list in
  `verification_stamp` — `discover_close_mandated_writes` reads it with
  `ast.literal_eval` (no import, no side effects), so the next producer is
  exempt without anyone remembering to edit a list elsewhere. That drift is the
  whole reason the mechanism exists; this is its third user.

- **A stale-stamp refusal now names the files that bound it.** The digest is
  one hash over many files, so a mismatch said *something* moved and never
  *what* — and the only way to find the culprit was to re-derive the exclusion
  list by hand. Both Set 113 S6 diagnoses were thirty-second fixes once the
  list was visible.

  **The diagnostic already existed and had no caller.**
  `work_diff_binding_paths` was written on 2026-08-11 for precisely this — its
  own docstring says a mismatch "says *something* changed and never *what*",
  and that every occurrence costs "a reasoning spiral and, often, a defensive
  extra verification round". It was never wired into the message. So the tool
  built to end the spiral sat unused while the spiral kept billing; Set 113 S6
  paid for two rounds of it. This change is the wiring, not a new definition:
  `describe_work_diff_staleness` reports the existing bound set, newest-modified
  first, and points at the two mechanisms that fix it. Best-effort by
  construction — an explainer that raises inside an error path would replace
  the error it is explaining.

### Internal

- **A falsifier that pins the shared definition in place.** Three consumers ask
  "did the work change since we checked?" — the verification stamp,
  `test_run_fresh`, and the close backstop's delta anchor. They already share
  one list; nothing asserted that they must. `TestTheFreshnessDefinitionIsSHARED`
  fails if `run_of_record` or `post_round_delta` re-declares
  `WORK_DIFF_SET_BOOKKEEPING` locally instead of importing it, which is exactly
  how the three would drift apart and re-open everything above.

All five rules are mutation-tested: each fix was reverted in turn and the
matching falsifiers confirmed to fail. The staleness-naming test caught its own
mutant only after being rewritten to drive `validate_stamped_row` — the first
version exercised the helper directly and passed happily when the call was
deleted from the gate, which is precisely L-112-1's warning about asserting a
substring instead of the rule.
