## [Unreleased] — the active step, and the round that posts itself (Set 127)

### Added

- **(Set 127 S1) The record can say a step is in flight, and since when —
  without a new writer.** Nothing on disk ever said which step a session was
  *on*: `log_step` writes after a step finishes and `start_session` seeds the
  plan as `pending`, so the two writers between them only ever produced
  `pending` and `complete`, and `in-progress` was ~1.4% of every step status
  ever written. Rather than add a third write (and a convention to remember),
  `session_checklist.build_rows()` **derives** it: the active step is the
  lowest-numbered seeded `plan-step` row with nothing logged against it, in a
  session `session-state.json` says is in flight. Each started row also
  carries a derived **start time** — the previous step's completion, or the
  session's `startedAt` for the first step — an honest wall-clock proxy for
  *how long has this been running*. Because it is computed from rows both
  surfaces already read, it cannot drift out of sync and it fixes every
  historical set retroactively. `session_projection` serializes the derived
  fields rather than recomputing them.

- **(Set 127 S3) A verification round posts its own checklist.** The
  `checklist_posted` gate wants a post inside each transition's own window,
  and one transition type could not realistically be met: a blocking
  discovery round drives `discovery → supplementary → remediate →
  remediation-review` minutes apart, machine-driven, with nobody at the
  terminal. Set 126 S2 missed rounds 2 and 3 exactly that way, and a missed
  window cannot be re-entered — so a structurally predictable omission kept
  arriving on the operator's desk as waiver paperwork.

  `verify_session.post_round_checklist()` renders the checklist at the end of
  every round that **completed**, through the existing `record_post` path, so
  the record still means *a render happened* and the round's output tells the
  operator where the session is. It is called from one place — the line after
  `record_round_completed()` — which is what pairs a post with a ledgered
  round and nothing else: a round refused past its bound, a failed routed
  call, and `--dry-run` all return before it, and a **close-backstop** round
  never reaches it (the backstop calls the ledger writer directly, and its
  rounds are not checklist transitions). Both failure modes are non-fatal and
  **named** on stderr (`L-079-1`): bookkeeping must never cost the operator a
  round they have already paid for.

  Nothing else moved. `check_checklist_posted` is unchanged — same positional
  windows, same one-post-per-window rule, same waiver path — and the other
  transition types (session start, test-run recorded, operator stop, last
  logged step) bind exactly as they did. Falsified in both directions
  (`L-112-1`), including the window rule asserted against a hand-built ledger
  rather than by reading the new call site.

  **The cost, on the record:** that transition can no longer be missed, so it
  can no longer report a missing post. This reduces what a close-time gate
  can catch, which is the decision-rights carve-out the orchestrator may
  never self-authorize; the operator ratified it on 2026-08-12 with the two
  rejected alternatives recorded (`decisions.jsonl`, `authority: "human"`,
  `verification_effect: "reduces"`).

### Changed

- **(Set 127 S3) The cadence documentation now matches the mechanism.** The
  constitution's Step 4 transition list, the authoring guide's *step-checklist
  cadence* table, and `check_checklist_posted`'s own docstring all taught an
  obligation the tool now discharges for one transition type — an instruction
  surviving the change it describes is the defect family Set 126 spent a
  session on. The guide's stale `<- here` marker prose (removed by the Set
  120 S3 operator ruling) went with it.

