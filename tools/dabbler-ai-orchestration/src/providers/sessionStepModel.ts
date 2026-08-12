// Set 114 Session 3 — the TypeScript mirror of `ai_router/session_checklist.py`'s
// row builder, so the Work Explorer can render an in-flight session's steps.
//
// PURE. No `vscode` import and no `fs` import: everything here is a
// transform from already-parsed `activity-log.json` entries (plus the
// spec's step texts) onto row descriptors, which keeps it driveable from
// the Layer 2 suite exactly like `workExplorerTreeModel.ts`.
//
// WHY A MIRROR AND NOT A SUBPROCESS
// ---------------------------------
// A second implementation of a subtle rule is the duplicate-parser defect
// this repo repeats most (L-069-1), and Set 114 S2's routed
// `ai-assignment.md` names it for this session by name. It is taken
// deliberately, with the one mitigation that assignment also names:
//
//   > port the rule with a shared fixture that proves the two agree
//   > row-for-row.
//
// That fixture is `src/test/fixtures/session-step-parity.json`, committed
// once and asserted from BOTH sides — `ai_router/tests/test_step_row_parity.py`
// proves Python still produces those rows, and
// `src/test/suite/sessionStepModel.test.ts` proves this file does. Change
// either implementation alone and a test fails; change the fixture alone
// and the *other* implementation's test fails. Drift has nowhere to hide.
//
// The alternative — spawning `python -m ai_router.session_checklist` on
// expand — was rejected in `decisions.jsonl`: it puts a process spawn on a
// tree that refreshes on every watcher tick and a 30-second poll, and it
// makes a DISPLAY feature fail whenever the interpreter or the package is
// unresolvable. `utils/migrateSessionState.ts` is the precedent in the
// other direction: an explicit TypeScript mirror written to REMOVE exactly
// that coupling.
//
// WHAT IS DELIBERATELY NOT MIRRORED
// ---------------------------------
// The CLI's text/markdown rendering (`render`, `render_markdown`,
// `_summarize`) and the post ledger. Those
// are terminal concerns. This file mirrors the part that decides WHICH
// rows exist, in WHAT order, with WHAT status —
// `_collapse_by_step_key`, `is_logged_step`, `_reconcile`,
// `build_rows`, `plan_matches_spec` and `_humanize` — plus the spec-step
// parse those last two need (`spec_admission.parse_session_plans` /
// `parse_step_texts`).
//
// Set 127 S2 adds the DERIVED half to the mirrored part:
// `session_flight_facts`, `_active_step_index`, `_derive_progress` and
// `ChecklistRow.effective_status`. The one deliberate difference is that
// `sessionFlightFacts` takes an already-parsed `session-state.json` rather
// than reading it — this file has no `fs` import, and the Explorer's scan
// has the parsed state in hand already. What the timestamp LOOKS like is
// not here either: formatting is a rendering concern and lives beside the
// other row formatters in `workExplorerTreeModel.ts`.

/**
 * The `kind` marker on a seeded plan entry. `log_step` writes no `kind` at
 * all, so its presence is what separates "the spec said this session would
 * do X" from "the session did X".
 *
 * Must equal `session_checklist.PLAN_STEP_KIND`.
 */
export const PLAN_STEP_KIND = "plan-step";

/**
 * One `activity-log.json` entry, narrowed to the fields the row builder
 * reads. Everything is optional because this is untrusted on-disk data —
 * a hand-edited log must degrade, never throw.
 */
export interface StepEntry {
  sessionNumber?: number;
  stepNumber?: number;
  stepKey?: string;
  description?: string;
  status?: string;
  kind?: string;
  /**
   * Set 127 S2: when `log_step` wrote this entry — which, because it
   * writes AFTER the step is done, is that step's COMPLETION. It is the
   * only start-time evidence the ledger contains, and the next row's
   * start is derived from it ({@link completionOf}).
   */
  dateTime?: string;
}

/** One rendered row. Mirrors `session_checklist.ChecklistRow`. */
export interface StepRow {
  stepNumber: number | null;
  stepKey: string;
  description: string;
  status: string;
  /**
   * True when this row is still only a PLAN — a step the spec promised
   * that nothing has logged yet. It is carried rather than re-derived
   * from a missing timestamp: Set 114 S2's assignment note 2 says so
   * explicitly, and "no timestamp" is not the same question.
   */
  isPlanned: boolean;
  /**
   * Set 127 S2, DERIVED — never read from disk and never written to it.
   * True on the one row a session is currently working. `status` is left
   * exactly as the ledger wrote it; only {@link effectiveStatusOf} moves,
   * so a consumer can always see that the ledger said `pending` and the
   * tree drew the in-progress glyph, and why.
   *
   * Mirrors `session_checklist.ChecklistRow.is_active`.
   */
  isActive: boolean;
  /**
   * Set 127 S2, DERIVED. When this row's step started, as the raw ISO-8601
   * string taken from the PREVIOUS step's completion (or the session's
   * `startedAt` for the first row). `null` means "has not started" or
   * "cannot be derived" — never a guess, and never this row's own seeded
   * registration timestamp (operator ruling 3, 2026-08-12).
   *
   * Mirrors `session_checklist.ChecklistRow.started_at`.
   */
  startedAt: string | null;
}

// Set 115 S4: `TERMINAL_STATUSES` is gone with `markHere`, the only thing
// that read it. What is in flight is now READ (`status === "in-progress"`)
// rather than derived from which statuses count as finished.

/**
 * Status token -> the four-state lifecycle status the Explorer's authored
 * glyphs cover. The CLI's `STATUS_BOXES` maps the same tokens onto
 * `[x]` / `[~]` / `[ ]` / `[!]`; the tree has no `[!]` asset, so `blocked`
 * and `failed` fall through to `cancelled.svg` — the one authored glyph
 * that reads as "this did not go well" rather than as progress.
 *
 * An UNKNOWN token maps to `not-started`, matching `UNKNOWN_BOX`'s posture
 * of not claiming progress it cannot see.
 */
export type StepGlyphStatus =
  | "complete"
  | "in-progress"
  | "not-started"
  | "cancelled";

const STATUS_GLYPHS: Record<string, StepGlyphStatus> = {
  complete: "complete",
  done: "complete",
  "in-progress": "in-progress",
  in_progress: "in-progress",
  started: "in-progress",
  pending: "not-started",
  "not-started": "not-started",
  blocked: "cancelled",
  failed: "cancelled",
};

export function glyphStatusOf(status: string): StepGlyphStatus {
  return STATUS_GLYPHS[pyStr(status).toLowerCase()] ?? "not-started";
}

/**
 * The canonical token for a step in flight — the one a DERIVED active step
 * presents through {@link effectiveStatusOf}.
 *
 * Must equal `session_checklist.IN_PROGRESS_STATUS`, and it is kept beside
 * the glyph table it maps into so a rename of either cannot silently split
 * them.
 */
export const IN_PROGRESS_STATUS = "in-progress";

/**
 * Which status tokens mean "nothing has started this yet", derived from the
 * glyph table rather than re-spelled (L-069-1) — the mirror of
 * `session_checklist._UNSTARTED_STATUSES`, which is derived from
 * `STATUS_BOXES` the same way.
 *
 * Membership is asked of the RAW token, never of `glyphStatusOf`, and the
 * difference is load-bearing: `glyphStatusOf` answers `not-started` for an
 * UNRECOGNISED token (it refuses to claim progress it cannot see), where the
 * CLI boxes that token `[?]`. Reading eligibility through the fallback would
 * make the five legacy prose-in-`status` rows eligible here and ineligible in
 * Python — a divergence the corpus would not catch unless a case carried one,
 * which `a-prose-status-is-evidence-of-nothing` now does.
 */
const UNSTARTED_STATUSES: ReadonlySet<string> = new Set(
  Object.entries(STATUS_GLYPHS)
    .filter(([, glyph]) => glyph === "not-started")
    .map(([token]) => token),
);

/**
 * The glyphs that mean the RECORD has already answered "where is this
 * session": a step in flight, or one that stopped (`blocked` / `failed`,
 * which the tree paints with its one did-not-go-well asset). Either way
 * there is no silence for the derivation to fill.
 *
 * Mirrors `session_checklist._RECORD_ANSWERS_BOXES` — `{[~], [!]}`. Asking
 * `glyphStatusOf` IS correct here, unlike for {@link UNSTARTED_STATUSES}: an
 * unrecognised token answers `not-started` here and boxes `[?]` there, and
 * neither is a record answer, so the two agree.
 */
const RECORD_ANSWERS_GLYPHS: ReadonlySet<StepGlyphStatus> = new Set<StepGlyphStatus>([
  "in-progress",
  "cancelled",
]);

/**
 * What a row SAYS it is, record first, derivation second.
 *
 * A derived active step has no token of its own on disk — deriving it is the
 * whole point — so this is where `in-progress` appears for it. Every display
 * surface reads this rather than `row.status`; `row.status` stays the record.
 *
 * Mirrors `session_checklist.ChecklistRow.effective_status`.
 */
export function effectiveStatusOf(row: StepRow): string {
  return row.isActive ? IN_PROGRESS_STATUS : row.status;
}

/**
 * `(is this session in flight, when did it start)` for *sessionNumber*,
 * read from an already-parsed `session-state.json` and from nothing else.
 *
 * Mirrors `session_checklist.session_flight_facts` minus its file read —
 * this module is pure, and the Explorer's scan has the parsed state in hand
 * already. Returned as one value rather than two because both answers come
 * from the same record.
 *
 * `{ inFlight: false, startedAt: null }` is the answer for an absent,
 * unreadable or silent state file: no derivation, which is the status quo
 * the whole model had before Set 127.
 *
 * **The plan-less carve-out** (a set whose plan is not yet committed writes
 * a v4 file with no `sessions[]` array and a top-level `status` /
 * `startedAt` instead) contributes its `startedAt` and **nothing else** —
 * the file names no session number to attach a *current step* to. Nothing is
 * lost by the refusal: a plan-less set has no `### Session N` headings, so
 * no plan rows are seeded and there is no candidate row to derive onto.
 */
export interface SessionFlightFacts {
  inFlight: boolean;
  /** Raw ISO-8601 as the state file wrote it; never reformatted here. */
  startedAt: string | null;
}

/** The answer for a session nothing knows anything about. */
export const NOT_IN_FLIGHT: SessionFlightFacts = { inFlight: false, startedAt: null };

/** Python's `_iso_or_none`: a non-blank string, else `null`. */
function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function sessionFlightFacts(
  state: unknown,
  sessionNumber: number,
): SessionFlightFacts {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return NOT_IN_FLIGHT;
  }
  const sessions = (state as { sessions?: unknown }).sessions;
  // Absent OR empty: Python's reader shim normalises the carve-out's
  // missing array to `[]` and leaves the top-level passthroughs beside it,
  // so "no per-session ledger" is the one condition, spelled once.
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      inFlight: false,
      startedAt: isoOrNull((state as { startedAt?: unknown }).startedAt),
    };
  }
  for (const entry of sessions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as { number?: unknown; status?: unknown; startedAt?: unknown };
    // Mirrors Python's `isinstance(number, int) and not isinstance(number, bool)`.
    if (typeof e.number !== "number" || !Number.isInteger(e.number)) continue;
    if (e.number !== sessionNumber) continue;
    return {
      inFlight: e.status === "in-progress",
      startedAt: isoOrNull(e.startedAt),
    };
  }
  return NOT_IN_FLIGHT;
}

/**
 * True when *entry* is a step the orchestrator logged, rather than
 * machinery's bookkeeping about the session.
 *
 * Mirrors `session_checklist.is_logged_step`, and for the same reason it
 * is one predicate there: `log_step` writes no `kind`, so an entry that
 * carries one (`plan-step`, `path_aware_critique`, `contract_gate`,
 * `dual_surface_mode`, `suggestion_disposition`) is a record ABOUT the
 * session — several of them written at registration, before any work
 * exists. Such an entry renders, but it may not CLAIM a planned row.
 */
/**
 * Python's `str(x or "")`, exactly.
 *
 * **This is the fix for a whole defect class, not a helper for tidiness.**
 * The mirror originally used `String(x ?? "")` at every field read, which
 * is NOT the same coercion: `??` falls back only on `null`/`undefined`,
 * while Python's `or` falls back on every falsy value. So an
 * `activity-log.json` entry carrying `kind: 0` or `kind: false` — valid
 * JSON, and this reader treats on-disk data as untrusted — read as
 * *absent* in Python and as the literal strings `"0"` / `"false"` here.
 * That flipped `isLoggedStep`, which decides whether an entry may CLAIM a
 * planned row, so the terminal and the panel disagreed about which row
 * was current and whether a planned step had been executed.
 *
 * Found by the Set 114 end-of-set path-aware critique (gpt-5.5), not by
 * the parity corpus — which is the point of running a second lens over
 * the same code, and is why the corpus now carries the case.
 *
 * Every string-ish field read goes through this. One coercion used
 * everywhere is what stops the two languages drifting again — the same
 * shape Set 114 S2 used when it collapsed two `kind` filters into the
 * single `is_logged_step` predicate (L-069-1).
 */
function pyStr(value: unknown): string {
  // Mirrors Python truthiness for the types JSON can produce: `null`,
  // `undefined`, `""`, `0`, `-0`, `NaN` and `false` are all falsy in both
  // languages and coerce to the empty string. Everything else stringifies.
  return value ? String(value) : "";
}

/**
 * True when *entry* is a step the orchestrator logged, rather than
 * machinery's bookkeeping about the session.
 *
 * Mirrors `session_checklist.is_logged_step`, and for the same reason it
 * is one predicate there: `log_step` writes no `kind`, so an entry that
 * carries one (`plan-step`, `path_aware_critique`, `contract_gate`,
 * `dual_surface_mode`, `suggestion_disposition`) is a record ABOUT the
 * session — several of them written at registration, before any work
 * exists. Such an entry renders, but it may not CLAIM a planned row.
 *
 * `Array.isArray` is excluded explicitly: `typeof [] === "object"` in
 * JavaScript, so an array would otherwise read as a keyless — and
 * therefore logged — step, where Python's `isinstance(entry, dict)`
 * rejects it outright.
 */
export function isLoggedStep(entry: StepEntry | null | undefined): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  return pyStr(entry.kind).trim() === "";
}

function stepNumberOf(entry: StepEntry): number | null {
  const value = entry.stepNumber;
  // Mirrors Python's `isinstance(value, int) and not isinstance(value, bool)`:
  // a float, a boolean, a numeric string and `NaN` all answer "no number".
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function keyOf(entry: StepEntry): string {
  return pyStr(entry.stepKey).trim();
}

/**
 * Collapse *entries* by `stepKey`, keeping the LATEST entry at the
 * position the step FIRST appeared.
 *
 * `activity-log.json` is append-only, so a step logged `in-progress` and
 * later logged `complete` appears twice. Rendering both duplicates the row
 * and strands the current-step marker on the stale one — the wrong answer
 * to "where is this session". Entries with no `stepKey` cannot be
 * collapsed and are kept individually: two anonymous steps are two steps.
 *
 * Mirrors `session_checklist._collapse_by_step_key`.
 */
export function collapseByStepKey(entries: readonly StepEntry[]): StepEntry[] {
  const order: string[] = [];
  const latest = new Map<string, StepEntry>();
  let anonymous = 0;
  for (const entry of entries) {
    let key = keyOf(entry);
    if (!key) {
      anonymous += 1;
      // `\0` cannot occur in a real key, so an anonymous bucket can never
      // collide with an authored one.
      key = `\u0000anon-${anonymous}`;
    }
    if (!latest.has(key)) order.push(key);
    latest.set(key, entry);
  }
  return order.map((key) => latest.get(key) as StepEntry);
}

function rowFromEntry(entry: StepEntry, isPlanned: boolean): StepRow {
  return {
    stepNumber: stepNumberOf(entry),
    stepKey: pyStr(entry.stepKey),
    description: pyStr(entry.description),
    status: pyStr(entry.status),
    isPlanned,
    // Derived last, by `deriveProgress`, on every path. Constructed at
    // their null answers so a row is never half-built.
    isActive: false,
    startedAt: null,
  };
}

/**
 * When the step this entry describes finished, if it is a step at all.
 *
 * `log_step` stamps `dateTime` as it writes, and it writes AFTER the step is
 * done, so an ordinary entry's timestamp is that step's completion — the
 * next row's start.
 *
 * Guarded by {@link isLoggedStep}, because two other kinds of entry carry a
 * `dateTime` and neither is a completion: a seeded `plan-step` row, whose
 * stamp is REGISTRATION time (identical across every row of the session, and
 * rendering it as a start is the fresh wrong signal operator ruling 3 forbids);
 * and a bookkeeping record (`path_aware_critique`, `contract_gate`,
 * `dual_surface_mode`, `suggestion_disposition`), which is a record ABOUT the
 * session written by machinery, usually at registration.
 *
 * **The status is deliberately not consulted** (Set 127 S1 round 2's
 * adjudicated-minor residual, settled in S2 so one rule lands in both
 * languages at once). What advances the chain is the entry EXISTING:
 * `log_step` writes when the orchestrator records the step, so its stamp is
 * the last known moment of that step's activity and the best available lower
 * bound for the row below it. Gating on a *recognised terminal* token would
 * make the start times depend on the status vocabulary, which this model
 * refuses to trust in either direction — `completed` is one of the 15
 * non-canonical tokens Set 120 S2 preserved, and every legacy set spelling it
 * that way would silently lose its start times. Pinned in the corpus by
 * `the-start-time-chain-does-not-read-the-status-vocabulary`.
 *
 * Mirrors `session_checklist._completion_of`.
 */
function completionOf(entry: StepEntry): string | null {
  if (!isLoggedStep(entry)) return null;
  return pyStr(entry.dateTime).trim() || null;
}

/**
 * One row plus the two facts the derivation needs about its entry.
 *
 * Deliberately not folded into {@link StepRow}: `completion` and `isStep` are
 * inputs to a derivation, not things a consumer renders, and a row model that
 * carried a completion would invite a surface to draw an end time the operator
 * ruled against.
 *
 * Mirrors `session_checklist._RowEvidence`.
 */
export interface RowEvidence {
  row: StepRow;
  /** This step's completion, or `null` when it is not a step that finished. */
  completion: string | null;
  /**
   * True when the entry is work the session logged, rather than a seeded
   * plan row or a bookkeeping record about the session.
   */
  isStep: boolean;
}

/**
 * True when this row stands for a STEP — done, or merely planned.
 *
 * The distinction that matters to the start-time chain. A planned row is a
 * step nobody has finished, so it BREAKS the chain: the row after it starts
 * at an unknown time. A bookkeeping record is not a step at all, so it is
 * TRANSPARENT: the row after it starts when the previous real step finished,
 * not when a policy was written down.
 *
 * Mirrors `session_checklist._RowEvidence.is_step_row`.
 */
function isStepRow(item: RowEvidence): boolean {
  return item.isStep || item.row.isPlanned;
}

function evidenceOf(entry: StepEntry, isPlanned: boolean): RowEvidence {
  return {
    row: rowFromEntry(entry, isPlanned),
    completion: completionOf(entry),
    isStep: isLoggedStep(entry),
  };
}

/**
 * Merge the seeded plan with what the session actually logged.
 *
 * **The plan owns each row's position; the logged step owns its content.**
 *
 * Claims are made in two passes, IDENTITY BEFORE ORDINAL:
 *
 *   1. every logged step whose `stepKey` equals a planned key claims that
 *      row — a key match asserts identity and cannot be wrong;
 *   2. each remaining logged step claims the still-unclaimed planned row
 *      with the same `stepNumber`, **only when `allowOrdinal`**.
 *
 * The second pass is an inference: it reads "logged step 2" as "planned
 * step 2". It keeps the common case clean, because an orchestrator's own
 * step keys are prose-free handles that rarely equal the slug the seeder
 * derived from the spec's sentence. It is also unsound the moment the plan
 * moves underneath it — insert a step into the spec mid-session and an
 * ordinal-only pass cascades until the last planned step vanishes. Nothing
 * inside the ledger distinguishes that from a normal session; `spec.md`
 * does, which is why `allowOrdinal` is the CALLER's decision
 * ({@link planMatchesSpec}).
 *
 * Nothing is dropped in either direction: a planned step nobody logged
 * stays a pending row carrying the spec's own words, and a logged step the
 * plan did not predict appends after the plan in first-logged order.
 *
 * Returns one {@link RowEvidence} per row (Set 127 S2): the row as it will
 * render, beside the timestamp the NEXT row's start is derived from and
 * whether this row is a step at all. An unclaimed planned row contributes
 * neither, because a plan row's `dateTime` is registration time rather than
 * a completion ({@link completionOf}).
 *
 * Mirrors `session_checklist._reconcile`.
 */
export function reconcile(
  plan: readonly StepEntry[],
  real: readonly StepEntry[],
  allowOrdinal: boolean,
): RowEvidence[] {
  const evidence = plan.map((entry) => evidenceOf(entry, true));

  const byNumber = new Map<number, number>();
  const byKey = new Map<string, number>();
  plan.forEach((entry, index) => {
    const number = stepNumberOf(entry);
    if (number !== null && !byNumber.has(number)) byNumber.set(number, index);
    const key = keyOf(entry);
    if (key && !byKey.has(key)) byKey.set(key, index);
  });

  const claims = new Map<number, number>();
  const claimed = new Set<number>();
  const claim = (target: number | undefined, position: number): void => {
    if (target === undefined || claimed.has(target)) return;
    claimed.add(target);
    claims.set(position, target);
  };

  real.forEach((entry, position) => {
    if (!isLoggedStep(entry)) return;
    claim(byKey.get(keyOf(entry)), position);
  });
  if (allowOrdinal) {
    real.forEach((entry, position) => {
      if (claims.has(position) || !isLoggedStep(entry)) return;
      const number = stepNumberOf(entry);
      if (number === null) return;
      claim(byNumber.get(number), position);
    });
  }

  for (const [position, target] of claims) {
    evidence[target] = evidenceOf(real[position], false);
  }
  const extra = real
    .filter((_entry, position) => !claims.has(position))
    .map((entry) => evidenceOf(entry, false));
  return [...evidence, ...extra];
}

// Set 115 S4 removed `markHere` here, and `TERMINAL_STATUSES` with it —
// the mirror of the `session_checklist._mark_here` removal Set 120 S3 made
// by operator ruling. The rule it implemented (first unfinished logged row,
// else the first pending planned row, else the last row) is exactly what
// pointed confidently at step 1 of Set 119 S2 when four statuses were
// unreadable.
//
// Set 127 S2 is NOT that marker returning. {@link activeStepIndex} fires
// only where the record is SILENT — it never overrides a logged status, it
// stands down entirely the moment any row carries the in-progress or
// did-not-go-well glyph, and it produces nothing at all in a session
// `session-state.json` does not report as in flight. The marker's failure
// was that it always named exactly one row, including when it had no idea;
// this names at most one, and prefers naming none.

/**
 * Which row a session in flight is currently working, if any.
 *
 * The rule, in one line: **the first seeded plan row nothing has logged
 * against, and only while the record is otherwise silent.**
 *
 * Two guards, both of them the difference between "no signal" and "a wrong
 * signal":
 *
 *   1. **the record wins outright** — if any row already carries the
 *      in-progress or cancelled glyph (a logged `in-progress`, a `blocked`,
 *      a `failed`), the ledger has answered "where is this session" itself
 *      and this returns `null`. Deriving a second in-flight row beside a
 *      logged one is precisely the two-current-rows defect the removed
 *      `<- here` marker produced;
 *   2. **an unrecognised token is evidence of nothing** — eligibility asks
 *      for a token the table actually knows ({@link UNSTARTED_STATUSES}),
 *      not merely for one that FALLS BACK to not-started, so the legacy
 *      prose-in-`status` rows neither become the active step nor let a
 *      later row become it by looking finished.
 *
 * Callers pass rows that carry no derivation yet, so `row.status` here is
 * the record's own token.
 *
 * Mirrors `session_checklist._active_step_index`.
 */
export function activeStepIndex(rows: readonly StepRow[]): number | null {
  if (rows.some((row) => RECORD_ANSWERS_GLYPHS.has(glyphStatusOf(row.status)))) {
    return null;
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.isPlanned && UNSTARTED_STATUSES.has(pyStr(row.status).toLowerCase())) {
      return index;
    }
  }
  return null;
}

/**
 * Add the two derived facts to *evidence*'s rows.
 *
 * Pure: rows in, rows out. The two facts are computed together in one pass
 * because they answer one question between them — *where is this session,
 * and since when* — and a second pass over the same rows would be a second
 * place for the answers to disagree.
 *
 * **The active step** is derived only for a session in flight. A closed
 * session derives nothing: an in-progress glyph on a session that finished
 * last month is a worse answer than the silence it replaced, because an
 * operator would have a reason to believe it.
 *
 * **The start time** is derived for every row that has started, in flight or
 * not — "when did step 3 start" is as good a question on a session that
 * closed months ago as on the live one. A row has started when it is a
 * logged step, or when it is the derived active step. Each started row's
 * start is **the previous step's** completion, seeded with the session's own
 * `startedAt` for the first row; a bookkeeping row between two steps is
 * stepped over rather than treated as one ({@link isStepRow}). A gap between
 * two steps is therefore INSIDE the elapsed time, which is the honest
 * reading of "how long has this been running", and a row whose predecessor
 * is a step that never completed carries `null` rather than a borrowed
 * timestamp from further up.
 *
 * Mirrors `session_checklist._derive_progress`.
 */
export function deriveProgress(
  evidence: readonly RowEvidence[],
  flight: SessionFlightFacts,
): StepRow[] {
  const rows = evidence.map((item) => item.row);
  const active = flight.inFlight ? activeStepIndex(rows) : null;

  const derived: StepRow[] = [];
  let previousCompletion: string | null = flight.startedAt;
  evidence.forEach((item, index) => {
    const isActive = index === active;
    const hasStarted = isActive || item.isStep;
    derived.push({
      ...item.row,
      isActive,
      startedAt: hasStarted ? previousCompletion : null,
    });
    if (isStepRow(item)) previousCompletion = item.completion;
  });
  return derived;
}

// ---------------------------------------------------------------------------
// The spec's step texts — mirror of `ai_router/spec_admission.py`
// ---------------------------------------------------------------------------

// `### Session 2 of 4: Title`. Mirrors `spec_admission._SESSION_HEAD_RE`,
// NOT `progress.ts`'s `SESSION_HEADING_RE`: the latter requires a non-empty
// title (`(.+?)`), and a heading with an empty title still declares a
// session whose steps must be found. Two consumers, two contracts.
//
// `\s` rather than `[ \t]` throughout, because Python's `\s` matches
// newlines too and a mirror that is stricter than its original disagrees
// with it on exactly the malformed specs where disagreement is worst.
const SESSION_HEAD_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+(\d+))?\s*:\s*(.*)$/gm;

// A top-level ordered step. 4+ leading spaces is a nested Markdown list.
// The leading whitespace is CAPTURED so the digit's own offset is
// arithmetic rather than a search — see `parseStepTexts`.
const STEP_RE = /^(\s{0,3})(\d+)\.\s+\S/gm;

// `\s*` rather than `[ \t]*`, mirroring Python's `_FENCE_RE`: Python's
// `\s` matches a vertical tab or form feed too, so the stricter form
// would retain a fence Python strips (found as a nit by the end-of-set
// path-aware critique, gemini-3.1-pro).
const FENCE_RE = /^\s*(?:```|~~~)/;

/**
 * Blank out fenced code blocks, preserving LINE COUNT (not character
 * offsets), so a documentation sample full of numbered lines is not read
 * as this spec's steps. Mirrors `spec_admission._strip_fenced_blocks`.
 *
 * Exported for `specSectionLocator.ts` (Set 115 S2), which needs the same
 * "a heading inside a fence is a sample, not a section" rule. Line count
 * survives because every stripped line is replaced by an empty line, which
 * is what makes an offset->line mapping computed on the stripped body valid
 * for the ORIGINAL text.
 */
export function stripFencedBlocks(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/**
 * The text of each top-level step in one session's *segment*.
 *
 * A step runs from its `N.` marker to the next one, and ends early at the
 * first following line that starts in COLUMN 0 — that is how a Markdown
 * list ends, and it keeps the `**Creates:**` / `**Touches:**` trailer out
 * of the last step. Continuation lines and nested bullets (all indented)
 * stay with their step; internal whitespace collapses to single spaces.
 *
 * Spans are cut at the marker's own LINE START, not at the match index:
 * the leading `[ \t]{0,3}` can consume the preceding newline, so a step
 * introduced by a blank line matches from that blank line. Counting never
 * noticed; slicing did (the Python original lost the first step of every
 * session to exactly this).
 *
 * Mirrors `spec_admission.parse_step_texts`.
 */
export function parseStepTexts(segment: string): string[] {
  const bounds: number[] = [];
  // `STEP_RE` is a module-level /g regex; reset before each use so a prior
  // partial scan cannot leak `lastIndex` into this one.
  STEP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STEP_RE.exec(segment)) !== null) {
    // The digit group's own offset, mirroring Python's `m.start(1)`.
    const digitStart = match.index + match[1].length;
    bounds.push(segment.lastIndexOf("\n", digitStart - 1) + 1);
  }

  return bounds.map((start, i) => {
    const end = i + 1 < bounds.length ? bounds[i + 1] : segment.length;
    const lines = segment.slice(start, end).split("\n");
    const kept: string[] = lines.length > 0 ? [lines[0]] : [];
    for (const line of lines.slice(1)) {
      if (line.trim() !== "" && !/^\s/.test(line.slice(0, 1))) break;
      kept.push(line);
    }
    return kept
      .join(" ")
      .replace(/^\s*\d+\.\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  });
}

/** One `### Session N of M:` heading, located in a fence-stripped body. */
export interface SessionHead {
  readonly number: number;
  /** Offset of the `###` itself — mirrors Python's `m.start()`. */
  readonly headStart: number;
  /** Offset just past the heading line — mirrors Python's `m.end()`. */
  readonly contentStart: number;
}

/**
 * Every session heading in *body*, in document order.
 *
 * Split out of `parseSpecSteps` by Set 115 S2 so the section locator and
 * the step parser scan with ONE regex. A second heading regex is the
 * duplicate-parser defect this repo repeats most (L-069-1), and two
 * consumers disagreeing about where session 3 begins is exactly the drift
 * an operator would report as "it opened the wrong section".
 *
 * *body* must already be fence-stripped: a heading inside a fenced sample
 * declares nothing.
 */
export function scanSessionHeads(body: string): SessionHead[] {
  const heads: SessionHead[] = [];
  SESSION_HEAD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SESSION_HEAD_RE.exec(body)) !== null) {
    heads.push({
      number: Number(match[1]),
      headStart: match.index,
      contentStart: match.index + match[0].length,
    });
    // A zero-length match would spin forever; `###…` cannot be empty, but
    // the guard costs nothing and the alternative is a hung extension host.
    if (match[0].length === 0) SESSION_HEAD_RE.lastIndex += 1;
  }
  return heads;
}

/**
 * The step texts `spec.md` currently declares for *sessionNumber*, or `[]`.
 *
 * Mirrors `spec_admission.parse_session_plans` narrowed to one session,
 * which is what `session_checklist.read_spec_steps` does.
 */
export function parseSpecSteps(specText: string, sessionNumber: number): string[] {
  const body = stripFencedBlocks(specText);
  // `headStart` is the `###`'s own offset and `contentStart` is just past
  // the heading line, mirroring Python's `m.start()` / `m.end()`. One
  // session's segment runs from its own `contentStart` to the NEXT
  // heading's `headStart`.
  const heads = scanSessionHeads(body);

  for (let i = 0; i < heads.length; i += 1) {
    if (heads[i].number !== sessionNumber) continue;
    const end = i + 1 < heads.length ? heads[i + 1].headStart : body.length;
    return parseStepTexts(body.slice(heads[i].contentStart, end)).filter(
      (step) => step.trim() !== "",
    );
  }
  return [];
}

/**
 * True when `spec.md` still says what the seeded *plan* recorded.
 *
 * The one question the renderer asks the spec, and it is never answered
 * with a row: **has the plan moved since registration?** Ordinal
 * reconciliation is sound only while the numbers the orchestrator logs are
 * the numbers the plan was seeded with.
 *
 * Conservative in every failure direction — a missing, unreadable or
 * newly-unparseable spec answers `false`, which costs only the ordinal
 * convenience (unmatched steps append; nothing is evicted). Losing a row
 * is the failure that matters; showing one twice is not.
 *
 * Mirrors `session_checklist.plan_matches_spec`.
 */
export function planMatchesSpec(
  plan: readonly StepEntry[],
  specSteps: readonly string[],
): boolean {
  if (specSteps.length === 0) return false;
  const seeded = plan.map((entry) => pyStr(entry.description));
  return (
    seeded.length === specSteps.length &&
    seeded.every((text, i) => text === specSteps[i])
  );
}

/**
 * The rows for *sessionNumber*: the plan, reconciled against reality.
 *
 * Two sources, one record. Entries seeded by `start_session`
 * (`kind: "plan-step"`) supply the forward view; ordinary `log_step`
 * entries supply what the session has actually done. A set with no seeded
 * plan — every set that started before Set 114 S2, and any spec whose
 * steps do not parse — renders exactly as it did before: the logged steps,
 * collapsed by `stepKey`, in first-logged order.
 *
 * Returns `[]` for a session with no entries at all. The caller is
 * expected to hand in `[]` for an absent or unreadable activity log, which
 * degrades to no children rather than to a stale or invented list.
 *
 * Set 127 S2 adds *flight* — `(is this session in flight, when did it
 * start)`, from {@link sessionFlightFacts} — and applies
 * {@link deriveProgress} as the last thing that happens to every row, on
 * both paths, so a legacy set with no plan gets its start times and a
 * planned set gets both. It defaults to {@link NOT_IN_FLIGHT}, which is the
 * same answer Python derives from an absent `session-state.json`: no active
 * step and no start times, which is exactly the behaviour this model had
 * before. Nothing about which rows exist, or what the ledger says they say,
 * changes.
 *
 * Mirrors `session_checklist.build_rows`.
 */
export function buildStepRows(
  entries: readonly StepEntry[],
  sessionNumber: number,
  specSteps: readonly string[],
  flight: SessionFlightFacts = NOT_IN_FLIGHT,
): StepRow[] {
  const mine = entries.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      entry.sessionNumber === sessionNumber,
  );
  if (mine.length === 0) return [];

  const plan = collapseByStepKey(mine.filter((e) => e.kind === PLAN_STEP_KIND));
  // Everything that is not a plan row still RENDERS — a bookkeeping record
  // is part of the session's record. What it may not do is CLAIM a planned
  // row, which `reconcile` enforces via `isLoggedStep`.
  const real = collapseByStepKey(mine.filter((e) => e.kind !== PLAN_STEP_KIND));

  const evidence =
    plan.length === 0
      ? real.map((entry) => evidenceOf(entry, false))
      : reconcile(plan, real, planMatchesSpec(plan, specSteps));
  return deriveProgress(evidence, flight);
}

/**
 * `test-run-policy` -> `Test run policy`.
 *
 * The step key is the short, stable handle the orchestrator already
 * supplies; descriptions are audit-trail prose written for close-out
 * review and routinely run to several sentences. A tree row that wraps is
 * not a tree row, so the key is the label and the description is the
 * tooltip.
 *
 * Mirrors `session_checklist._humanize`, minus the cp1252 down-conversion:
 * a `TreeItem.label` is a UTF-16 string VS Code renders directly, so the
 * ASCII fold that protects a Windows console would only mangle text here
 * (L-079-1 is a subprocess-boundary rule, and there is no boundary here).
 */
export function humanizeStepKey(stepKey: string): string {
  const text = pyStr(stepKey).replace(/[_-]/g, " ").trim();
  if (!text) return "";
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * The label for a row: the humanized key, falling back to the first clause
 * of the description when a step was logged with no key at all.
 *
 * The fallback mirrors `_summarize`'s intent (prefer the key, fall back to
 * the description's first clause) without its column arithmetic — VS Code
 * truncates the label itself, at whatever width the panel happens to be.
 */
export function stepRowLabel(row: StepRow): string {
  const label = humanizeStepKey(row.stepKey);
  if (label) return label;
  const description = pyStr(row.description).trim();
  if (!description) return "(unnamed step)";
  const clause = /^[^.:;]*[.:;]?/.exec(description);
  return (clause?.[0] ?? description).trim() || description;
}
