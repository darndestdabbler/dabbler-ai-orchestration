import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { listGitWorktrees } from "./git";
import { readStatus } from "./sessionState";
import { isCancelled, readCancellationState } from "./cancelLifecycle";
import { readProgress, SessionStateInvariantError, normalizeToV4Shape } from "./progress";
import {
  LedgerSessionLike,
  completedVerificationInfo,
  deriveWorkflowState,
  durableVerificationModeFrom,
  shouldRenderPlusFraction,
  verificationMarkerFor,
} from "./tierLegibility";
import { readTierMarker } from "./tierMarkerStore";
import {
  SessionSet,
  SessionState,
  SessionSetConfig,
  SessionSetPrerequisite,
  TriStateFlag,
  UnsatisfiedPrerequisite,
  UatSummary,
  LiveSession,
  WorkflowState,
} from "../types";

export const SESSION_SETS_REL = path.join("docs", "session-sets");
export const PLAYWRIGHT_REL_DEFAULT = "tests";

// Cancelled sets sort below all other groups in the merge logic — Set 8
// keeps cancelled state as the lowest precedence so a set that exists in
// two roots (one cancelled, one active) prefers the active copy when
// dedup-merging. Within a single root the file-presence rule still wins
// because readSessionSets has already resolved each entry's state.
const STATE_RANK: Record<SessionState, number> = {
  complete: 3,
  "in-progress": 2,
  "not-started": 1,
  cancelled: 0,
};

export function discoverRoots(): string[] {
  const seen = new Map<string, string>();
  const order: string[] = [];
  const add = (p: string | undefined) => {
    if (!p) return;
    const canonical = path.resolve(p);
    // Set 077 S1 (verifier round 2): dedup on the filesystem's own
    // canonical form, not an OS-name proxy — realpath collapses case
    // variants only where the volume itself is case-insensitive (so
    // case-sensitive APFS/Linux keep distinct roots distinct), and
    // resolves symlinked duplicates as a bonus. Fall back to the
    // resolved path when realpath fails (nonexistent target — filtered
    // by the existsSync check below).
    let key: string;
    try {
      key = fs.realpathSync.native(canonical);
    } catch {
      key = canonical;
    }
    if (seen.has(key) || !fs.existsSync(canonical)) return;
    seen.set(key, canonical);
    order.push(canonical);
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    add(folder.uri.fsPath);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const wt of listGitWorktrees(folder.uri.fsPath)) {
      add(wt);
    }
  }
  return order;
}

// Detect a stale `status: "complete"` snapshot that doesn't actually
// reflect a finished set. Set 030 Session 3 collapses the old Set 022 +
// Set 023 multi-signal guard into a single v3-invariant probe: the v3
// reader (`readProgress`) validates that `sessions[]` matches the
// top-level `status`, and any drift surfaces as a rule-4/7 violation.
// The v2 read path goes through `synthesizeV3FromV2` first; a v2
// snapshot with `status: "complete"` but an empty/short
// `completedSessions[]` synthesizes to a sessions[] that fails rule 7,
// flagging the same drift cases (count mismatch, final-session signal
// gap) without the explicit predicate ladder.
//
// Set 047 Session 2: `readProgress` itself runs through
// `normalizeToV4Shape` now, so this probe is robust to both v3 and v4
// state-file shapes. The v2-compat ledger-merge below stays unchanged
// — it operates on the raw parsed dict before any normalization.
//
// V2-compat: pre-Set-022 snapshots without `completedSessions[]` get
// their array pre-populated from the events ledger before synthesis,
// so a legacy snapshot whose ledger has all closeouts still validates
// cleanly (no false drift downgrade).
//
// Returns false on parse failure — trust the canonical status rather
// than second-guessing on garbled input. Returns true ONLY when the v3
// invariants themselves reject the snapshot.
export function isMidSetComplete(statePath: string): boolean {
  if (!fs.existsSync(statePath)) return false;
  let sd: any;
  try {
    sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return false; // parse error: trust the canonical status
  }
  if (sd === null || typeof sd !== "object" || Array.isArray(sd)) return false;
  // V2-compat ledger merge: same shape as the readSessionSets path.
  let stateForProgress: any = sd;
  if (
    sd.sessions === undefined &&
    (!Array.isArray(sd.completedSessions) || sd.completedSessions.length === 0)  // noqa: D13 - v2-compat ledger-merge for synthesizer input
  ) {
    const eventsPath = path.join(path.dirname(statePath), "session-events.jsonl");
    const ledgerSessions = readClosedSessionsFromLedger(eventsPath);
    if (ledgerSessions.length > 0) {
      stateForProgress = { ...sd, completedSessions: ledgerSessions };
    }
  }
  const specPath = path.join(path.dirname(statePath), "spec.md");
  try {
    readProgress(stateForProgress, specPath);
    return false; // invariants hold — snapshot is internally consistent
  } catch (e) {
    if (e instanceof SessionStateInvariantError) {
      return true; // drift: invariants violated
    }
    return false; // TypeError / other: trust canonical status
  }
}

// Set 030 Session 3: v2-compat helper used to pre-populate
// `completedSessions[]` on a v2 snapshot whose state file lacks the
// field. Returns the sorted, deduplicated list of session numbers the
// events ledger records as closed via `closeout_succeeded`. Empty
// list on any read/parse failure or when the file is absent.
function readClosedSessionsFromLedger(eventsPath: string): number[] {
  if (!fs.existsSync(eventsPath)) return [];
  let text: string;
  try {
    text = fs.readFileSync(eventsPath, "utf8");
  } catch {
    return [];
  }
  const seen = new Set<number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as {
        session_number?: number;
        event_type?: string;
      };
      if (
        event.event_type === "closeout_succeeded" &&
        typeof event.session_number === "number" &&
        Number.isInteger(event.session_number) &&
        event.session_number > 0
      ) {
        seen.add(event.session_number);
      }
    } catch {
      // skip malformed lines — append-only ledger may carry partial writes
    }
  }
  return [...seen].sort((a, b) => a - b);
}

// Set 022 Session 2: events-ledger fallback for `sessionsCompleted`.
// Returns the count of distinct `closeout_succeeded` session numbers
// in `session-events.jsonl`. Used as the v2-compat fallback for
// pre-Set-022 snapshots (and pre-Set-030 consumer-repo snapshots)
// whose state file lacks both v3 sessions[] and v2 completedSessions[]
// — without a snapshot signal, the ledger is the next-best source.
// Returns 0 on any read/parse failure or when the file is absent —
// the caller treats 0 as "no authoritative signal" and falls through
// to the next derivation step rather than asserting "0 sessions done."
export function countDistinctCloseoutSessions(eventsPath: string): number {
  if (!fs.existsSync(eventsPath)) return 0;
  let text: string;
  try {
    text = fs.readFileSync(eventsPath, "utf8");
  } catch {
    return 0;
  }
  const seen = new Set<number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as {
        session_number?: number;
        event_type?: string;
      };
      if (
        event.event_type === "closeout_succeeded" &&
        Number.isInteger(event.session_number) &&
        (event.session_number as number) > 0
      ) {
        seen.add(event.session_number as number);
      }
    } catch {
      // skip malformed lines — append-only ledger may carry partial writes
    }
  }
  return seen.size;
}

export function parseSessionSetConfig(specPath: string): SessionSetConfig {
  // Set 048 Session 2: defaults are full-tier-conservative — `tier: "full"`,
  // `requiresUAT: false`, `requiresE2E: false`. Pre-Set-048 specs without
  // explicit `tier:` resolve to `"full"` so existing 47 sets continue to
  // run under canonical Full-tier discipline.
  // Set 061 Session 1: `verificationMode` joins the parsed fields —
  // the Set 057 per-set verification choice's spec-config seed.
  // Absent defaults to `"out-of-band-or-none"` (the strictly-opt-in
  // Set 057 contract).
  const config: SessionSetConfig = {
    requiresUAT: false,
    requiresE2E: false,
    uatScope: "none",
    tier: "full",
    verificationMode: "out-of-band-or-none",
  };
  if (!fs.existsSync(specPath)) return config;
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return config;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text;
  // Set 048 Session 2: triStateRe accepts `true | false | suggested` (with
  // optional surrounding quotes on `suggested` since YAML allows either).
  const triStateRe = (key: string) =>
    new RegExp(
      `^\\s*${key}\\s*:\\s*(?:"(suggested)"|(true|false|suggested))\\s*(?:#.*)?$`,
      "im",
    );
  // Set 061 S1 (verifier fix S061-S1-V1-001): accept optional single or
  // double quotes around scalar enum values — YAML allows either, and
  // the tri-state parser above already accepts quoted "suggested".
  // Without this, tier: "lightweight" / verificationMode:
  // "dedicated-sessions" silently fell back to their defaults.
  const stringRe = (key: string) =>
    new RegExp(
      `^\\s*${key}\\s*:\\s*(?:"([\\w-]+)"|'([\\w-]+)'|([\\w-]+))\\s*(?:#.*)?$`,
      "im",
    );
  const stringValue = (m: RegExpMatchArray | null): string | null =>
    m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
  const parseTriState = (m: RegExpMatchArray | null): TriStateFlag | null => {
    if (!m) return null;
    const raw = (m[1] ?? m[2] ?? "").toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "suggested") return "suggested";
    return null;
  };

  const uat = parseTriState(block.match(triStateRe("requiresUAT")));
  if (uat !== null) config.requiresUAT = uat;
  const e2e = parseTriState(block.match(triStateRe("requiresE2E")));
  if (e2e !== null) config.requiresE2E = e2e;
  const scope = stringValue(block.match(stringRe("uatScope")));
  if (scope) config.uatScope = scope;
  const tier = stringValue(block.match(stringRe("tier")));
  if (tier) {
    const v = tier.toLowerCase();
    if (v === "full" || v === "lightweight") config.tier = v;
    // Unknown tier values silently fall back to "full" — schema validator
    // (separate from this parser) is responsible for surfacing the typo.
  }
  const vm = stringValue(block.match(stringRe("verificationMode")));
  if (vm) {
    const v = vm.toLowerCase();
    if (v === "out-of-band-or-none" || v === "dedicated-sessions") {
      config.verificationMode = v;
    }
    // Unknown values fall back to the default, same posture as `tier`.
  }
  return config;
}

/**
 * Set 047 Session 5: parse the optional ``prerequisites:`` field from
 * the spec's ``Session Set Configuration`` YAML block.
 *
 * Expected shape (per spec §3.3):
 *
 * ```yaml
 * prerequisites:
 *   - slug: 046-some-other-set
 *     condition: complete
 *   - slug: 044-another-set
 *     condition: complete
 * ```
 *
 * Returns ``null`` when the field is absent (no dependency declared).
 * Returns ``[]`` when ``prerequisites: []`` is written explicitly.
 * Returns the parsed list otherwise. Tolerant of operator typos:
 * entries missing ``slug`` are dropped; unrecognized ``condition``
 * values are dropped (only ``"complete"`` is in the enum today, per
 * spec §3.3).
 *
 * The parser is intentionally lightweight (regex, not a YAML parser)
 * so this module stays dependency-free and so a stray indentation
 * issue in the spec doesn't fail-closed across the entire Explorer.
 * A full YAML round-trip lives in the config-editor module; readers
 * here only need to recognize the array form.
 */
export function parsePrerequisites(
  specPath: string,
): SessionSetPrerequisite[] | null {
  if (!fs.existsSync(specPath)) return null;
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  const block = headingMatch ? headingMatch[1] : text;
  // Detect the key first — distinguishes "field absent" from
  // "field present with empty list".
  const keyRe = /^\s*prerequisites\s*:(.*)$/im;
  const keyMatch = block.match(keyRe);
  if (!keyMatch) return null;
  const inlineRest = keyMatch[1].trim();
  // Inline empty: ``prerequisites: []`` — distinct from absent.
  if (inlineRest === "[]") return [];
  // Locate the list body following the key. Each entry begins with
  // ``- slug: ...`` followed (in any order) by ``condition: ...``.
  const keyIndex = block.search(keyRe);
  if (keyIndex < 0) return null;
  const after = block.slice(keyIndex + keyMatch[0].length);
  // Stop at the next top-level (or shallower) key. We allow nested
  // (indented) lines until we hit a non-indented non-empty line.
  const lines = after.split(/\r?\n/);
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      bodyLines.push(line);
      continue;
    }
    if (!/^\s/.test(line)) break; // next top-level key
    bodyLines.push(line);
  }
  const body = bodyLines.join("\n");
  // Split the body on the YAML list-item marker (``\n  - ``) so each
  // chunk holds one entry's key/value pairs. Splitting (rather than
  // matching with a lookahead) avoids a subtle regex-end-of-line bug
  // where `(?=...\\s*$)` truncated multi-line entries at the first
  // whitespace-only EOL inside the entry.
  const chunks = body.split(/\r?\n[ \t]*-[ \t]+/);
  // chunks[0] is the pre-list text (typically blank/whitespace);
  // each subsequent chunk is one entry's body.
  const out: SessionSetPrerequisite[] = [];
  // Strip a YAML inline comment from a scalar value
  // (``slug: 046-foo # comment`` → ``046-foo``). Comments are stripped
  // before matching so an operator-friendly annotation does not drop
  // the entry. Per the YAML spec a ``#`` mid-value requires a
  // preceding whitespace to start a comment; we honor that to avoid
  // mangling values like ``slug: foo#bar`` (unusual, but valid).
  const stripComment = (s: string): string =>
    s.replace(/\s+#.*$/, "").trim();
  // S5 verifier-fix Important-1: distinguish "no condition key
  // present → default to complete" from "condition key present but
  // invalid → drop the entry". The earlier all-in-one ``\S+`` capture
  // collapsed the two cases by treating an unparseable condition
  // (e.g., with an inline comment that broke the ``\S+`` capture) as
  // if it were absent.
  for (const chunk of chunks.slice(1)) {
    // Match the slug line; tolerate a trailing YAML comment on the
    // value via stripComment(). Slug is mandatory.
    const slugLineMatch = chunk.match(/^\s*slug\s*:\s*(.+)$/im);
    if (!slugLineMatch) continue;
    const slug = stripComment(slugLineMatch[1]);
    if (!slug) continue;
    // Detect presence of the ``condition`` key first; parse its
    // value (with comment-strip) afterwards. Presence-with-bad-value
    // is the drop case; absence is the default-to-"complete" case.
    const condLineMatch = chunk.match(/^\s*condition\s*:\s*(.*)$/im);
    let condition: "complete";
    if (condLineMatch) {
      const raw = stripComment(condLineMatch[1]);
      if (raw === "complete") {
        condition = "complete";
      } else {
        // Present but not in the enum → drop per spec §3.3.
        continue;
      }
    } else {
      // Absent → default to "complete".
      condition = "complete";
    }
    out.push({ slug, condition });
  }
  return out;
}

export function parseUatChecklist(checklistPath: string): UatSummary | null {
  if (!fs.existsSync(checklistPath)) return null;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
  } catch {
    return null;
  }
  const items: Record<string, unknown>[] = [];
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const v of node) collect(v); return; }
    const obj = node as Record<string, unknown>;
    if (obj["Result"] !== undefined || obj["result"] !== undefined) {
      items.push(obj);
    }
    for (const v of Object.values(obj)) collect(v);
  };
  collect(data);

  const e2eRefs = new Set<string>();
  let pending = 0;
  for (const it of items) {
    const r = (it["Result"] ?? it["result"] ?? "") as string;
    if (r === "" || /^pending$/i.test(String(r))) pending++;
    const ref = it["E2ETestReference"] || it["e2eTestReference"];
    if (ref) e2eRefs.add(String(ref));
  }
  return { totalItems: items.length, pendingItems: pending, e2eRefs: Array.from(e2eRefs) };
}

// Set 077 Session 5 (Features 4–5): the most recent sN-issues*.json
// envelope in a set directory, or null. TS mirror of Python's
// `dedicated_verification.read_latest_issues_envelope`: "most recent" =
// highest (sessionNumber, round) pair; round 1 files carry no -round-
// suffix; malformed/unreadable files are skipped. Feeds the derived
// workflow state (awaiting-remediation vs awaiting-human need the
// issue dispositions).
const ISSUES_FILE_RE = /^s(\d+)-issues(?:-round-(\d+))?\.json$/;

export function readLatestIssuesEnvelope(dir: string): unknown | null {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let bestKey: [number, number] | null = null;
  let bestPayload: unknown = null;
  for (const name of names) {
    const m = ISSUES_FILE_RE.exec(name);
    if (!m) continue;
    const key: [number, number] = [
      parseInt(m[1], 10),
      m[2] ? parseInt(m[2], 10) : 1,
    ];
    let payload: unknown;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    if (
      bestKey === null ||
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1])
    ) {
      bestKey = key;
      bestPayload = payload;
    }
  }
  return bestPayload;
}

export function readSessionSets(root: string): SessionSet[] {
  const sessionSetsDir = path.join(root, SESSION_SETS_REL);
  if (!fs.existsSync(sessionSetsDir)) return [];
  const entries = fs.readdirSync(sessionSetsDir, { withFileTypes: true });
  const sets: SessionSet[] = [];
  // Set 077 Session 2 (Feature 1): the workspace's durable tier-choice
  // marker, read ONCE per root and carried on every set so the renderer
  // can surface the tier-mismatch advisory. Tolerant reader — missing /
  // unreadable / unknown values read as null (no advisory).
  const workspaceTierMarker = readTierMarker(root);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const dir = path.join(sessionSetsDir, entry.name);
    const specPath = path.join(dir, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    const activityPath = path.join(dir, "activity-log.json");
    const changeLogPath = path.join(dir, "change-log.md");
    const statePath = path.join(dir, "session-state.json");
    const aiAssignmentPath = path.join(dir, "ai-assignment.md");
    const uatChecklistPath = path.join(dir, `${entry.name}-uat-checklist.json`);

    // Set 035: state-file-first cancellation detection. Set 8 originally
    // made `CANCELLED.md` presence the first gate; Set 033 Session 2
    // locked the H2 verdict that `session-state.json` is the single
    // source of truth for session-set state, and Set 035 extends that
    // verdict to the cancellation lifecycle. `readCancellationState`
    // consults the state file's `status` field first; the markdown
    // marker (`CANCELLED.md`) survives as an audit-trail artifact and
    // as the legacy-fallback signal when no usable state file is
    // present (the `"unknown"` branch below). The writer
    // (`cancelLifecycle.ts`) continues to keep both signals in lockstep
    // at every cancel/restore boundary, so the state file's `status`
    // is the authoritative read.
    let state: SessionState;
    const cancellation = readCancellationState(dir);
    if (cancellation === "cancelled") {
      state = "cancelled";
    } else if (cancellation === "unknown" && isCancelled(dir)) {
      // Legacy fallback: no usable state file (v1 snapshot, hand-edited
      // shape, brand-new folder), but `CANCELLED.md` is present. Honor
      // the file-presence signal so a pre-035 set still buckets
      // correctly. A `console.warn` documents the fallback so a
      // diagnostic trail exists if a state-file write bug ever masks
      // a real cancellation behind a "complete" status.
      console.warn(
        `[dabblerSessionSets] Cancellation detected via legacy file-presence ` +
          `fallback for ${dir} — session-state.json is missing or unparseable. ` +
          `Consider running ensure_state_file to repair.`
      );
      state = "cancelled";
    } else {
      const status = readStatus(dir);
      if (status === "complete") {
        // Defensive: a snapshot with status: "complete" that doesn't
        // actually satisfy the v3 invariants (e.g., sessions[] still
        // contains a not-started entry) is a stale mid-set close-out —
        // either a manual edit or a snapshot a consumer repo hasn't
        // refreshed yet. Downgrade so the set doesn't briefly show
        // Complete in the window between sessions.
        state = isMidSetComplete(statePath) ? "in-progress" : "complete";
      } else if (status === "in-progress") {
        state = "in-progress";
      } else {
        state = "not-started";
      }
    }

    let totalSessions: number | null = null;
    let sessionsCompleted = 0;
    let lastTouched: string | null = null;
    let liveSession: LiveSession | null = null;
    // Set 030 Session 5: v2-detection signal for the migration CTA.
    // Default false (no nag on absent / unreadable state — the rest
    // of the read path already degrades gracefully). Flipped to true
    // only when the parsed state file is an object with either no
    // schemaVersion / a non-3 value, OR schemaVersion === 3 but
    // sessions[] is missing (a broken v3 shape that the bulk migrator
    // refuses to rewrite — see migrate_session_state.py's
    // ACTION_SKIPPED_MALFORMED case for the same heuristic).
    //
    // Set 047 Session 3: expanded so canonical v3 files (schemaVersion=3
    // with sessions[]) also flag — the migration target in that case
    // is v4, and the ActionRegistry surfaces "Migrate to v4 schema"
    // instead of "Migrate to v3 schema". `migrationTargetSchemaVersion`
    // carries the target so the ActionRegistry can pick the right
    // command without re-reading the file.
    let needsMigration = false;
    let migrationTargetSchemaVersion: 3 | 4 | null = null;
    // Set 061 Session 1 (spec D1): the normalized sessions[] ledger,
    // captured for the plus-fraction predicate (which needs to see
    // whether a `type: "verification"` session has been appended yet).
    // Stays null when the state file is absent/unreadable — that reads
    // as "no typed session yet", which is correct for fresh sets.
    let ledgerSessions: unknown = null;
    // Set 050 S4: the raw on-disk schemaVersion, surfaced only for the
    // asterisk tooltip ("Ran under schema v<N>"). null when absent /
    // non-numeric (the asterisk then reads "an older schema").
    let schemaVersionOnDisk: number | null = null;
    const eventsPath = path.join(dir, "session-events.jsonl");

    // Activity log is a step log, not a count source. The activity-log
    // read is retained for two non-count signals: `totalSessions` (which
    // lives at the top level of activity-log.json — a different artifact
    // / different schema from session-state.json, outside D13's scope)
    // and the per-entry `dateTime` for the `lastTouched` display, which
    // is more granular than the state-file's session-boundary timestamps
    // while a session is mid-flight.
    // Set 077 Session 5 (A7): the parsed log is also the home of the
    // DURABLE verificationMode record (`verification_mode` /
    // `verification_mode_change` entries), captured here so the config
    // resolution below can prefer it over the spec seed.
    let activityLogParsed: unknown = null;
    if (fs.existsSync(activityPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(activityPath, "utf8")) as {
          totalSessions?: number;
          entries?: Array<{ sessionNumber?: number; dateTime?: string }>;
        };
        activityLogParsed = data;
        if (typeof data.totalSessions === "number") totalSessions = data.totalSessions;  // noqa: D13 - activity-log.json carrier field, not session-state
        for (const e of data.entries ?? []) {
          if (e.dateTime && (!lastTouched || e.dateTime > lastTouched)) lastTouched = e.dateTime;
        }
      } catch { /* ignore */ }
    }

    if (fs.existsSync(statePath)) {
      try {
        // Set 047 Session 2 (reader-first phase): pipe the raw parsed
        // state through `normalizeToV4Shape` so a v4-shaped file (whose
        // writers — Sessions 4-5 — drop `orchestrator`, `startedAt`,
        // `completedAt`, `verificationVerdict` from the top level in
        // favor of per-session metadata) reads identically to a v3 file.
        // The shim re-derives the top-level fields from `sessions[]` on
        // v4 inputs and is a no-op on pure v3 inputs that already carry
        // them. `needsMigration` detection below reads the RAW parsed
        // object (`rawSd`) because the v3/v4 distinction is precisely
        // the signal we're checking for there.
        const rawSd = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
          schemaVersion?: number;
          sessions?: unknown;
          completedSessions?: unknown;
        };

        // Set 030 Session 5 + Set 047 Session 3: needs-migration detection.
        // Computed FIRST — before normalize/progress reads — so the
        // badge surfaces even when the downstream shim/reader rejects
        // the file (e.g., an invariant violation in `normalizeToV4Shape`
        // would otherwise jump straight to the outer catch and lose
        // the migration affordance entirely, leaving the operator
        // unable to either fix or migrate the row). The S3 verifier
        // flagged the prior ordering as a coupling bug; this block
        // depends only on the parsed `rawSd`, not on any derived
        // value, so it's safe to run first.
        //
        // The criteria match the bulk migrators' "would migrate" rule
        // so the badge and the CLIs agree set-for-set:
        //   - schemaVersion === 4 (or higher): already current, no
        //     migration needed.
        //   - canonical v3 (schemaVersion === 3 with sessions[]): the
        //     `migrate_v3_to_v4` migrator's target — flag with
        //     target=4 so the ActionRegistry surfaces "Migrate to v4
        //     schema".
        //   - schemaVersion === 3 but sessions[] missing: broken-v3
        //     shape neither migrator will rewrite. Operator must
        //     hand-repair to canonical v3 (then re-run the v4
        //     migrator). Flag with target=3 so the menu offers
        //     "Migrate to v3 schema" — the v2→v3 migrator's
        //     same-shaped branch will also skip, which is the right
        //     "hand-repair, then come back" UX.
        //   - schemaVersion absent or < 3: legacy v1/v2; the v2→v3
        //     migrator's target. Flag with target=3.
        if (rawSd && typeof rawSd === "object" && !Array.isArray(rawSd)) {
          const sv = rawSd.schemaVersion;
          schemaVersionOnDisk = typeof sv === "number" ? sv : null;
          if (typeof sv === "number" && sv >= 4) {
            needsMigration = false;
            migrationTargetSchemaVersion = null;
          } else if (sv === 3) {
            if (Array.isArray(rawSd.sessions)) {
              needsMigration = true;
              migrationTargetSchemaVersion = 4;
            } else {
              needsMigration = true;
              migrationTargetSchemaVersion = 3;
            }
          } else if (typeof sv !== "number" || sv < 3) {
            needsMigration = true;
            migrationTargetSchemaVersion = 3;
          }
        }

        // Set 030 Session 3 v2-compat pre-processing: if the snapshot
        // is v2-shape (no sessions[]) and lacks a non-empty
        // completedSessions[], pre-populate it from the events ledger
        // BEFORE handing the dict to the normalize shim. This keeps
        // the ledger as a count signal for pre-Set-022 snapshots that
        // haven't been healed by their next boundary write yet.
        // Pure-v3 / v4 snapshots skip this entirely — sessions[] is
        // authoritative for them. Set 047 Session 2 moved this branch
        // ahead of the normalize call because normalize guarantees
        // sessions[] on the output, which would mask the v2-compat
        // signal if checked post-normalize.
        let preNormalizeSd: any = rawSd;
        if (
          rawSd &&
          typeof rawSd === "object" &&
          !Array.isArray(rawSd) &&
          rawSd.sessions === undefined &&
          (!Array.isArray(rawSd.completedSessions) ||  // noqa: D13 - v2-compat ledger-merge for synthesizer input
            (rawSd.completedSessions as unknown[]).length === 0)  // noqa: D13 - v2-compat ledger-merge for synthesizer input
        ) {
          const closedLedgerSessions = readClosedSessionsFromLedger(eventsPath);
          if (closedLedgerSessions.length > 0) {
            preNormalizeSd = { ...rawSd, completedSessions: closedLedgerSessions };
          }
        }

        const sd = normalizeToV4Shape(preNormalizeSd, specPath) as {
          completedAt?: string;
          startedAt?: string;
          status?: string;
          orchestrator?: {
            engine?: string;
            provider?: string;
            model?: string;
            effort?: string;
            checkedOutAt?: string;
            lastActivityAt?: string;
          };
          verificationVerdict?: string;
          forceClosed?: boolean;
          schemaVersion?: number;
          sessions?: unknown;
        };
        // Set 061 Session 1: the shim preserves per-session extras
        // (including the Set 057 `type` field) via entry spread, so
        // the normalized ledger is the right predicate input for
        // every input schema version.
        ledgerSessions = sd.sessions ?? null;

        // Set 030 Session 3: route progress reads through the v3/v4
        // helper. `readProgress` itself runs through `normalizeToV4Shape`
        // so a v4 file (per-session metadata) and a v3 file (top-level
        // metadata) both produce the same `ProgressView`. We trap
        // invariant violations and fall through to the v2-compat
        // events-ledger fallback below so a pre-Set-022 snapshot
        // lacking completedSessions[] still derives a sensible count.
        //
        // Set 047 Session 2: the v2-compat ledger-merge pre-step that
        // used to sit here is hoisted above the normalize call (see
        // `preNormalizeSd` above) — `sd` is already normalized to v4
        // with sessions[] guaranteed, so the historical ledger-merge
        // check (`sd.sessions === undefined`) would no longer fire.
        let progressTotal: number | null = null;
        let progressCompleted: number[] | null = null;
        let progressCurrent: number | null = null;
        try {
          const view = readProgress(sd, specPath);
          progressTotal = view.totalSessions;
          progressCompleted = [...view.completedSessions];
          progressCurrent = view.currentSession;
        } catch (e) {
          if (!(e instanceof SessionStateInvariantError)) {
            throw e;
          }
          // Invariant violation: state is drift-shaped. Leave the
          // progress-derived signals null and fall through to the
          // v2-compat heuristics below.
        }

        // State file is authoritative for `totalSessions` when the
        // v3 reader succeeded. The activity-log carries the field at
        // its top level (read above for legacy compatibility), but if
        // both are present the state-file value wins — a Set 022
        // Session 2 round-1 verifier finding caught the inverted
        // preference, which would silently mis-display the fraction
        // whenever a Lightweight-tier set hand-edited one file but
        // not the other.
        if (progressTotal !== null && progressTotal > 0) {
          totalSessions = progressTotal;
        }
        const stateTouched = sd.completedAt || sd.startedAt;
        if (stateTouched && (!lastTouched || stateTouched > lastTouched)) lastTouched = stateTouched;
        liveSession = {
          currentSession: progressCurrent,
          status: sd.status ?? null,
          orchestrator: sd.orchestrator ?? null,
          startedAt: sd.startedAt ?? null,
          completedAt: sd.completedAt ?? null,
          verificationVerdict: sd.verificationVerdict ?? null,
          forceClosed: sd.forceClosed ?? null,
          completedSessions: progressCompleted,
        };
        // sessionsCompleted priority (highest first):
        //  1. v3 `readProgress` derivation — authoritative for any
        //     state file whose sessions[] satisfies the invariants
        //     (every Full-tier write since Set 030 Session 2; every
        //     Lightweight-tier file with proper sessions[] entries).
        //  2. Distinct `closeout_succeeded` session numbers in
        //     `session-events.jsonl` — v2-compat fallback for sets
        //     whose snapshot fails the invariants (pre-Set-022 sets
        //     that haven't been healed by their next boundary write
        //     yet, or consumer repos awaiting the bulk migrator).
        //  3. `state === "complete"` plus `totalSessions` — terminal
        //     state with no granular count signal (e.g., a
        //     Lightweight-tier set marked complete without sessions[]
        //     or completedSessions[]). Using the canonicalized
        //     `state` instead of raw `sd.status` keeps this in
        //     lockstep with the bucketing alias map; also naturally
        //     skips the mid-set-complete drift case where `state`
        //     is downgraded to in-progress.
        if (progressCompleted !== null) {
          sessionsCompleted = progressCompleted.length;
        } else {
          const ledgerCount = countDistinctCloseoutSessions(eventsPath);
          if (ledgerCount > 0) {
            sessionsCompleted = ledgerCount;
          } else if (state === "complete" && typeof totalSessions === "number") {
            sessionsCompleted = totalSessions;
          }
        }
      } catch { /* ignore */ }
    }

    const config = parseSessionSetConfig(specPath);
    // Set 077 Session 5 (A7): the durable activity-log record outranks
    // the spec-config seed. Python's `read_verification_mode` (which
    // the Q6 close gate and the S4 gate stand-down key off) has always
    // preferred the record; the Explorer read only the seed, so a
    // blessed A→B transition whose seed-alignment failed left the
    // kickoff/setup actions and the `v?`/`v+`/`N/M+` markers
    // contradicting the gate. With the record applied here, every
    // downstream consumer of `config.verificationMode` (ActionRegistry
    // gates, tierLegibility predicates, the workflow-state derivation
    // below) reads the same effective mode the gate does (critique M5).
    const durableMode = durableVerificationModeFrom(activityLogParsed);
    if (durableMode !== null) config.verificationMode = durableMode;
    const uatSummary = config.requiresUAT ? parseUatChecklist(uatChecklistPath) : null;
    const prerequisites = parsePrerequisites(specPath);
    // Set 061 Session 1 (spec D1): derived, never persisted.
    const plusFraction = shouldRenderPlusFraction(
      config.tier,
      config.verificationMode,
      ledgerSessions as LedgerSessionLike[] | null,
    );
    // Set 062 Session 1 (spec D1): the verification-posture inputs +
    // marker — all derived at scan time, never persisted. The note
    // presence is a plain existence probe (the Set 057 out-of-band
    // record); the completed-verification info and the marker glyph
    // come from the same normalized ledger the plus-fraction reads.
    const externalVerificationNoteExists = fs.existsSync(
      path.join(dir, "external-verification.md"),
    );
    const completedVerification = completedVerificationInfo(
      ledgerSessions as LedgerSessionLike[] | null,
    );
    const verificationMarker = verificationMarkerFor(
      config.tier,
      config.verificationMode,
      ledgerSessions as LedgerSessionLike[] | null,
      externalVerificationNoteExists,
      state,
    );
    // Set 077 Session 5 (Features 4–5): derived only where the ladder
    // is live — Lightweight Mode-B rows. The issues-envelope read is
    // scoped the same way so Full/Mode-A rows pay no extra I/O.
    //
    // The ladder's set-terminal input is the RAW set-level status from
    // the parsed state file (Python parity: derive_state compares
    // set_status == "complete"), NOT the canonicalized bucket `state`
    // (whose mid-set-complete downgrade / cancelled mapping would
    // diverge from Python). `liveSession.status` carries exactly that
    // raw `sd.status` for every readable state file — despite the
    // record's name it is the normalized snapshot, populated for
    // complete sets too, not an in-flight-only tracker (two reviewers
    // misread this; hence the explicit local).
    let workflowState: WorkflowState | null = null;
    if (
      config.tier === "lightweight" &&
      config.verificationMode === "dedicated-sessions"
    ) {
      const rawSetStatus = liveSession?.status ?? null;
      workflowState = deriveWorkflowState(
        ledgerSessions as LedgerSessionLike[] | null,
        config.verificationMode,
        rawSetStatus,
        readLatestIssuesEnvelope(dir),
      );
    }

    sets.push({
      name: entry.name,
      dir,
      specPath,
      activityPath,
      changeLogPath,
      statePath,
      aiAssignmentPath,
      uatChecklistPath,
      state,
      totalSessions,
      sessionsCompleted,
      lastTouched,
      liveSession,
      config,
      uatSummary,
      root,
      needsMigration,
      migrationTargetSchemaVersion,
      schemaVersionOnDisk,
      prerequisites,
      // Default false; the cross-reference pass below overwrites this
      // once every set's `state` is known so each prereq can resolve
      // against an up-to-date snapshot. Sets without declared
      // prerequisites stay at false in both passes.
      blockedByPrereqs: false,
      unsatisfiedPrereqs: [],
      plusFraction,
      externalVerificationNoteExists,
      completedVerification,
      verificationMarker,
      workspaceTierMarker,
      workflowState,
    });
  }

  // Set 047 Session 5 (spec §3.3): per-root cross-reference for the
  // single-root caller. `readAllSessionSets()` recomputes against the
  // merged map below so prereqs that resolve to a set discovered in a
  // different worktree / root still find their target. Single-root
  // callers (tests, isolated workspace scans) get the right answer
  // here without needing the merge step.
  deriveBlockedByPrereqs(sets);
  // Diagnostic: one-line summary in the dev console showing how the
  // extension bucketed each root. Useful for spotting UI/cache bugs vs.
  // state-derivation bugs without needing a breakpoint.
  if (sets.length > 0) {
    const counts = sets.reduce(
      (acc, s) => {
        acc[s.state] = (acc[s.state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log(
      `[dabbler-ai-orchestration] readSessionSets(${path.basename(root)}): ` +
        `${sets.length} set(s) — ` +
        `complete=${counts.complete ?? 0}, ` +
        `in-progress=${counts["in-progress"] ?? 0}, ` +
        `not-started=${counts["not-started"] ?? 0}, ` +
        `cancelled=${counts.cancelled ?? 0}`,
    );
  }
  return sets;
}

/**
 * Set 047 Session 5 (spec §3.3): mutate each set in *sets* to set
 * ``blockedByPrereqs`` against the in-memory map of the same list.
 *
 * Cross-references each set's ``prerequisites`` (the parsed
 * spec.md field) against the target set's bucketed ``state`` and
 * sets the boolean accordingly. ANY unsatisfied prereq blocks the
 * row; an unknown prereq slug also blocks (typo / missing set must
 * surface, not silently unblock).
 *
 * Set 061 Session 2 (spec D3): the pass no longer collapses to a
 * boolean — it also carries the full unsatisfied list (slug,
 * condition, target state or "unknown") onto ``unsatisfiedPrereqs``
 * so the blocked marker's tooltip can name what the row is waiting
 * on. ``blockedByPrereqs`` stays as the compatibility boolean and
 * always equals ``unsatisfiedPrereqs.length > 0``.
 *
 * Idempotent: callable on a `sets` array that has been merged
 * across roots in `readAllSessionSets`, so cross-root prerequisites
 * resolve against the merged view rather than the per-root scan
 * (S5 verifier Important-2 fix).
 */
function deriveBlockedByPrereqs(sets: SessionSet[]): void {
  const setsByName = new Map<string, SessionSet>();
  for (const s of sets) setsByName.set(s.name, s);
  for (const s of sets) {
    if (!s.prerequisites || s.prerequisites.length === 0) {
      s.blockedByPrereqs = false;
      s.unsatisfiedPrereqs = [];
      continue;
    }
    const unsatisfied: UnsatisfiedPrerequisite[] = [];
    for (const prereq of s.prerequisites) {
      const target = setsByName.get(prereq.slug);
      if (!target) {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: "unknown",
        });
        continue;
      }
      if (prereq.condition === "complete" && target.state !== "complete") {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: target.state,
        });
      }
    }
    s.blockedByPrereqs = unsatisfied.length > 0;
    s.unsatisfiedPrereqs = unsatisfied;
  }
}

export function readAllSessionSets(): SessionSet[] {
  const merged = new Map<string, SessionSet>();
  for (const root of discoverRoots()) {
    for (const set of readSessionSets(root)) {
      const prior = merged.get(set.name);
      if (!prior) { merged.set(set.name, set); continue; }
      const newRank = STATE_RANK[set.state] ?? -1;
      const priorRank = STATE_RANK[prior.state] ?? -1;
      if (newRank > priorRank) {
        merged.set(set.name, set);
      } else if (newRank === priorRank) {
        if ((set.lastTouched || "") > (prior.lastTouched || "")) merged.set(set.name, set);
      }
    }
  }
  const mergedList = Array.from(merged.values());
  // S5 verifier Important-2 fix: re-derive blockedByPrereqs against
  // the merged map so a prereq target discovered in a different root
  // / worktree still resolves. The per-root pass inside
  // readSessionSets() handles the single-root case.
  deriveBlockedByPrereqs(mergedList);
  return mergedList;
}
