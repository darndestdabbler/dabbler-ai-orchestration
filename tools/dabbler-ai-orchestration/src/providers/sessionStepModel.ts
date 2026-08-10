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
// `_summarize`, the `<- here` column widths) and the post ledger. Those
// are terminal concerns. This file mirrors the part that decides WHICH
// rows exist, in WHAT order, with WHAT status, and WHICH one is current —
// `_collapse_by_step_key`, `is_logged_step`, `_reconcile`, `_mark_here`,
// `build_rows`, `plan_matches_spec`, `_humanize` — plus the spec-step
// parse those last two need (`spec_admission.parse_session_plans` /
// `parse_step_texts`).

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
}

/** One rendered row. Mirrors `session_checklist.ChecklistRow`. */
export interface StepRow {
  stepNumber: number | null;
  stepKey: string;
  description: string;
  status: string;
  isHere: boolean;
  /**
   * True when this row is still only a PLAN — a step the spec promised
   * that nothing has logged yet. It is carried rather than re-derived
   * from a missing timestamp: Set 114 S2's assignment note 2 says so
   * explicitly, and "no timestamp" is not the same question.
   */
  isPlanned: boolean;
}

/** Statuses that mean the step is finished. Mirrors `_mark_here`'s `terminal`. */
const TERMINAL_STATUSES = new Set(["complete", "done"]);

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
    isHere: false,
    isPlanned,
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
 * Mirrors `session_checklist._reconcile`.
 */
export function reconcile(
  plan: readonly StepEntry[],
  real: readonly StepEntry[],
  allowOrdinal: boolean,
): StepRow[] {
  const planRows = plan.map((entry) => rowFromEntry(entry, true));

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
    planRows[target] = rowFromEntry(real[position], false);
  }
  const extra = real
    .filter((_entry, position) => !claims.has(position))
    .map((entry) => rowFromEntry(entry, false));
  return [...planRows, ...extra];
}

/**
 * Return *rows* with exactly one row carrying the current-step marker.
 *
 * The first unfinished **logged** step is "here". Only if no logged step is
 * unfinished does a still-pending PLANNED row take the marker — that is
 * the honest reading of "the plan promised this next, and nothing has
 * started it". Without that ordering, a session on step 3 whose step 2 is
 * still an untouched plan row would point the operator at step 2.
 *
 * Mirrors `session_checklist._mark_here`.
 */
export function markHere(rows: readonly StepRow[]): StepRow[] {
  if (rows.length === 0) return [];
  const unfinished = (row: StepRow): boolean =>
    !TERMINAL_STATUSES.has(String(row.status).toLowerCase());

  let here = rows.findIndex((row) => !row.isPlanned && unfinished(row));
  if (here === -1) {
    const planned = rows.findIndex(unfinished);
    here = planned === -1 ? rows.length - 1 : planned;
  }
  return rows.map((row, index) => ({ ...row, isHere: index === here }));
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
 * Blank out fenced code blocks, preserving line count and offsets, so a
 * documentation sample full of numbered lines is not read as this spec's
 * steps. Mirrors `spec_admission._strip_fenced_blocks`.
 */
function stripFencedBlocks(text: string): string {
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
  const heads: Array<{ number: number; headStart: number; contentStart: number }> = [];
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
 * Mirrors `session_checklist.build_rows`.
 */
export function buildStepRows(
  entries: readonly StepEntry[],
  sessionNumber: number,
  specSteps: readonly string[],
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

  if (plan.length === 0) {
    return markHere(real.map((entry) => rowFromEntry(entry, false)));
  }
  return markHere(reconcile(plan, real, planMatchesSpec(plan, specSteps)));
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
