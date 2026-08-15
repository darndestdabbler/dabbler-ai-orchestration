## [Unreleased] — usage accounting leaves the preload corpus (Set 121 S2)

### Added

- **(Set 121 S2) `ai_router/guidance_ledger.py` — the guidance usage
  ledger.** One compact record per guidance item in
  `docs/planning/guidance-usage.json`, keyed by id and **agnostic about
  which document an entry lives in** (`kind` says what an entry *is*,
  never where it sits — `project-guidance.md` is the sink lessons are
  promoted into, so a lesson-specific ledger would have guaranteed a
  rewrite). Each entry carries a **bounded ring of its last 10 uses**,
  every use a dash-separated, zero-padded `<set>-<session>` **string** —
  `"120-10"`, never `120.10`, which round-trips through a float to
  `120.1` and reads back as session **1**. One sanctioned writer, an
  atomic replace, and the package's single lock implementation.

  Ordering is **append order, never label order**: set numbers are
  allocation order, not execution order (Set 121 S1 measured sets 115 and
  118 executing after 119), so both the ring and the active-session
  timeline are built from close-event timestamps.

  New CLI: `report` (retention candidates), `cite`, `fire`, `register`,
  `validate`, `backfill`.

- **(Set 121 S2) Retention rules, split by artifact type.** A single
  *"unused in N sets → drop"* rule fails for preventive gates: a gate
  that never fires is indistinguishable from a useless one, which **is**
  `L-112-1`. Instruction lines are retained when cited within the last
  `instruction_window_sessions` **active sessions** (never elapsed time —
  a dormant repository must not lose its guidance to the calendar).
  Cheap checks (<1s, deterministic, no routed call) are permanent and
  need no usage record at all. Expensive checks (a routed call, or >10s)
  must have **fired** within the last `check_window_sets` sets.

  *A use is a citation for an instruction and a FIRE for a check*, and
  that is a type error rather than a convention: `record_citation()`
  refuses an executable and `record_fire()` refuses an instruction, so a
  CI run cannot be filed as a fire.

  **Nothing here evicts anything.** The module has no evict path;
  pruning is a batched pass the operator initiates, never automatic and
  never mid-session.

- **(Set 121 S2) `close_lock.file_mutex` / `acquire_file_mutex`** — the
  single-file form of the existing stale-reclaim + TTL primitive, for
  repo-level append-only state that no session set owns. One lock
  implementation, two entry points, rather than a second copy of
  dead-PID and TTL probing.

- **(Set 121 S2) `guidance.retention` in `router-config.yaml`**, with the
  numbers **derived** from 345 recorded active sessions and 167
  per-session citation events rather than inherited from the proposal:
  `instruction_window_sessions: 30` (p99 of 694 intra-lesson citation
  gaps; ~10.4 sets at this repo's measured 2.88 sessions/set),
  `check_window_sets: 20` (**no fire history exists** — an honest default
  reusing the operator-set `disuse_window_sets`, stated as unmeasured),
  and `instruction_line_cap: 22` (peak distinct ids cited in any trailing
  window), whose known blind spot — `project-guidance.md` has no ids yet —
  is recorded along with Session 3's obligation to re-derive it.

### Changed

- **(Set 121 S2) `cite_lessons` records to the ledger, not the preload
  markdown.** It gains `--session <M>`, resolves ids against the guidance
  files **read-only**, and still prints `[reconsider]` for an archived
  id. Its `CLOSE_MANDATED_WRITES` declaration is repointed at
  `docs/planning/guidance-usage.json` with `bound: "whole-file"`.

  This is **strictly safer** than the exemption it replaces:
  `lessons-learned.md` and `lessons-archive.md` previously carried a
  surgical exemption so the close could bump one trailer field in them.
  Nothing writes them at close any more, so they now bind the freshness
  digest **byte for byte** with no exemption at all.

- **(Set 121 S2) `guidance_triage` shows the classifier real recency.**
  The routed prompt carries the ledger's use ring instead of the
  `last-used-set` scalar, which could not distinguish *used once, ten
  sets ago* from *used in every one of the last ten* — the two cases that
  warrant opposite triage verdicts.

- **(Set 121 S2) The ledger is backfilled from history, not started
  empty.** `close_session` has recorded `disposition.lessons_cited` into
  `session-events.jsonl` since Set 064, so `guidance_ledger backfill`
  replays 167 per-session citation events across 65 sets into true
  recency rings. A repo that has been citing lessons gets a populated
  ledger on day one.

### Removed

- **(Set 121 S2) `last-used-set` is retired from the lesson trailer
  scheme**, along with `guidance_meta.normalize_close_mandated_metadata`
  (the freshness normalizer that existed only because the close rewrote
  a preload document). `guidance_meta.update_last_used` remains as a
  **loud `NotImplementedError`** naming its replacement rather than a
  silent no-op, because a consumer repo pinned to an older release would
  otherwise drop its usage signal while appearing to work. A stale
  `last-used-set` in a trailer is reported by `validate_guidance_meta` as
  *retired*, not as an unknown key.

  `status="active"` is now omitted from a formatted trailer too — the
  active tier is what active means, and restating it cost preload tokens
  to say nothing.

**Migration for consumer repos:** run `python -m
ai_router.guidance_ledger backfill` once, then use `cite_lessons --set
<N> --session <M>`. Existing `last-used-set` values are left in place and
are inert; strip them at your convenience.
