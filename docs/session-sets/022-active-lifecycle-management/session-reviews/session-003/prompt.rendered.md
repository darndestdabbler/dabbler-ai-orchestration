# Set 022 Session 3 — Workflow doc + schema doc + close-out doc + cross-consumer verification

You are an independent verifier reviewing Session 3 of session set
`022-active-lifecycle-management` in the `dabbler-ai-orchestration` repo.
Sessions 1 and 2 already shipped:

- **Session 1** delivered the ai_router state-first lifecycle protocol
  writer side: `ai_router/start_session.py` (CLI), `compute_effective_completed_sessions()`,
  `_flip_state_to_closed` appending to `completedSessions[]` on every close,
  `--repair --apply` backfilling `completedSessions[]` from events.
  Released as ai_router 0.2.3 (commit `1a973be`). Cross-provider VERIFIED.
- **Session 2** delivered the extension reader side: dropped activity-log
  as a count source, added `countDistinctCloseoutSessions()` events-ledger
  fallback, added `isCurrentSessionInFlight()` predicate, surfaced
  `LiveSession.completedSessions`, file watcher extended to
  `session-events.jsonl` + `CANCELLED.md`. Released as extension v0.13.12
  (commit `dcc8636`). Cross-provider VERIFIED (round 2).

**Session 3 scope** (what you are reviewing): documentation + cross-consumer
verification. No code changes. Three docs edited; no version bump.

## Decisions confirmed (do not re-litigate)

These came from a design round on 2026-05-15 with GPT 5.4 (Codex) and
Gemini Pro and were the foundation for Sessions 1 and 2. Session 3 is
the doc layer that encodes them as canonical:

1. **`completedSessions[]` is the authoritative progress ledger** on
   both tiers, maintained on every session close. The schema doc's
   "currently optional but planned" status for Full tier becomes
   "always written."
2. **Mid-set `lifecycleState` stays `work_in_progress`.** Only the
   final close flips it to `closed` (alongside `status: complete`).
3. **State invariant (load-bearing):**
   ```
   currentSession not in completedSessions[]                  → currentSession is in flight
   currentSession in completedSessions[] AND status="in-progress"  → between sessions
   status = "complete"                                        → set done
   ```
4. **`activity-log.json` is a step log only, not a count source.**
5. **Extension stays passive.** No "Start Session" / "Close Session"
   context-menu commands.
6. **CLI-driven on Full tier; hand-write on Lightweight.** The
   orchestrator runs `python -m ai_router.start_session <slug>`
   (Full) or hand-writes the same shape to `session-state.json`
   (Lightweight).
7. **Fraction convention stays `sessionsCompleted / totalSessions`.**
8. **Failure mode: passive recovery.** A stranded session is its own
   marker; the orchestrator resumes by re-reading state.

## Session 3 plan (from `spec.md`)

**Goal:** Encode the "state first, work second" protocol into the
workflow doc and orchestrator instructions so every consumer's AI
follows it. Verify end-to-end across all three consumers.

**Steps:**

1. Update `docs/ai-led-session-workflow.md`:
   - Step 1 ("Identify the Active Session Set and Register Session
     Start") gains the explicit protocol: orchestrator runs
     `python -m ai_router.start_session` (Full) *or* hand-writes the
     boundary fields (Lightweight) **before any other work in the
     session**. Pseudo-code for both tiers.
   - Step 8 gains the symmetric close-protocol detail: every close
     appends to `completedSessions[]`; only the final close flips
     status + lifecycleState.
   - The "do not skip close_session" warning added in commit
     `7166754` stays; cross-reference the new start-protocol.

2. Update `docs/session-state-schema.md`:
   - Promote `completedSessions[]` from "optional but planned" to
     "always written (Full tier) / always maintained (Lightweight)."
   - Add the GPT three-line invariant as the canonical state
     interpretation rule.
   - Note the new "in flight" predicate
     (`currentSession not in completedSessions[]`) and how the
     extension uses it.

3. Update `ai_router/docs/close-out.md`:
   - Add a "Session-boundary writes" subsection covering both
     `start_session` and `close_session`, with a table mirroring
     the protocol.
   - Extend the `--repair --apply` description to mention
     `completedSessions[]` backfill.

4. Verify across consumers (each verification is read-only —
   identify any drifted sets that need `--repair --apply` after this
   set lands; do not run repairs from this session set):
   - `dabbler-platform`
   - `dabbler-access-harvester`
   - `dabbler-homehealthcare-accessdb`

5. Cross-provider verification.

**Ends with:** Workflow doc + schema doc + close-out doc are consistent
with the new invariant; verification confirms no consumer-repo set will
break on next boundary write.

## Files in this session's commit

The diffs below are the full changes for Session 3. There are three doc
edits and no code changes; no version bump.

### `docs/ai-led-session-workflow.md` — Step 1 + Step 8 updates

```diff
warning: in the working copy of 'docs/ai-led-session-workflow.md', LF will be replaced by CRLF the next time Git touches it
diff --git a/docs/ai-led-session-workflow.md b/docs/ai-led-session-workflow.md
index 13d804e..378c70a 100644
--- a/docs/ai-led-session-workflow.md
+++ b/docs/ai-led-session-workflow.md
@@ -890,35 +890,119 @@ layout, or `<container>/<slug>` for repos still on the retired bare-
 repo + flat-worktree layout. See
 `docs/planning/repo-worktree-layout.md`.
 
+#### State first, work second (Set 022)
+
+The orchestrator declares "session N is in flight" on disk **before
+any other work in the session**. This is the prevention layer that
+keeps the Session Set Explorer's bucket transitions clean: the set
+moves to **In Progress** (or advances its fraction between sessions)
+the moment the boundary write lands, not whenever the first
+activity-log entry happens to flush. The v0.13.11 defensive guards
+remain as recovery defense-in-depth; the start-of-session boundary
+write is what keeps them from firing in normal operation.
+
+The boundary write maintains the state invariant (see
+[`docs/session-state-schema.md`](session-state-schema.md) for the
+canonical statement):
+
+```
+currentSession not in completedSessions[]                  → currentSession is in flight
+currentSession in completedSessions[] AND status="in-progress"  → between sessions
+status = "complete"                                        → set done
+```
+
+Two tier-symmetric paths produce the same shape on disk:
+
+**Full tier (router-driven).** Run the CLI as the first action of the
+session, then proceed to Step 2:
+
+```bash
+.venv/Scripts/python.exe -m ai_router.start_session \
+    --session-set-dir docs/session-sets/<slug> \
+    --engine claude-code \
+    --provider anthropic \
+    --model claude-opus-4-7 \
+    --effort medium
+```
+
+The CLI infers the next session via
+`compute_effective_completed_sessions(<dir>)` (reads
+`completedSessions[]`, falls back to the events ledger, then to the
+legacy heuristic), writes `session-state.json` (`currentSession`,
+`status: "in-progress"`, `lifecycleState: "work_in_progress"`,
+`startedAt` if previously null, clears `completedAt` and
+`verificationVerdict`), and appends one `work_started` event to
+`session-events.jsonl`. The call is **idempotent** — re-running on the
+same in-flight session is a no-op (the event ledger dedupes
+`work_started` and the snapshot fields are already correct), so a
+context-reset re-entry is safe. The CLI **refuses to skip ahead**
+(`exit 3` boundary violation) if session N is still open and the
+caller asks for N+1, and refuses to re-open a session already in
+`completedSessions[]`. Activity-log writing stays as it was — the
+first real work step adds the first entry; the CLI itself does not
+touch `activity-log.json`.
+
+Pseudo-code for the orchestrator's automation path:
+
 ```python
-from ai_router.session_log import find_active_session_set, SessionLog
-from ai_router import register_session_start
-
-SESSION_SET = find_active_session_set("docs/session-sets")
-log = SessionLog(SESSION_SET)
-next_session = log.get_next_session_number()
-
-# Write session-state.json BEFORE the first activity-log entry so
-# external tools (VS Code Session Set Explorer, manager dashboards)
-# see the session as in-progress immediately. Use "unknown" for
-# orchestrator fields the orchestrator cannot reliably introspect.
-register_session_start(
-    session_set=SESSION_SET,
-    current_session=next_session,
-    total_sessions=log.total_sessions,
-    orchestrator={
-        "engine": "claude-code",        # or "codex", "gemini-cli"
-        "provider": "anthropic",        # or "openai", "google"
-        "model": "claude-opus-4-7",     # specific model id
-        "effort": "high",               # low | medium | high | max | unknown
-    },
+import subprocess, sys
+
+session_set = "docs/session-sets/<slug>"
+result = subprocess.run(
+    [sys.executable, "-m", "ai_router.start_session",
+     "--session-set-dir", session_set,
+     "--engine", "claude-code",
+     "--provider", "anthropic",
+     "--model", "claude-opus-4-7",
+     "--effort", "medium"],
+    capture_output=True, text=True,
 )
+if result.returncode != 0:
+    # Exit 2 = usage error; exit 3 = boundary violation (e.g., a
+    # prior session is still open and must be closed first).
+    raise SystemExit(result.stderr or result.stdout)
+# Now proceed to Step 2 (read the spec) — state is in flight on disk.
 ```
 
+**Lightweight tier (hand-maintained).** No router runs. The
+orchestrator (or human) hand-writes the same fields to
+`session-state.json` before any other work in the session:
+
+```json
+{
+  "schemaVersion": 2,
+  "sessionSetName": "<slug>",
+  "currentSession": <N>,
+  "totalSessions": <N_total>,
+  "status": "in-progress",
+  "lifecycleState": "work_in_progress",
+  "startedAt": "<existing value, or now if null>",
+  "completedAt": null,
+  "verificationVerdict": null,
+  "orchestrator": {
+    "engine": "<engine>",
+    "provider": "<provider>",
+    "model": "<model>",
+    "effort": "<low|medium|high|unknown>"
+  },
+  "completedSessions": [<sessions closed so far, sorted, unique>]
+}
+```
+
+The Lightweight branch has no events ledger; `completedSessions[]` is
+the authoritative count signal and must be maintained by hand on
+every session boundary. See `docs/session-state-schema.md` for the
+required field shapes and the worked examples; the Lightweight tier
+exists exactly so projects that opt out of the router still get
+clean tree-view transitions.
+
 `session-state.json` is the single source of truth for in-progress
-detection by external tooling. It is flipped to `complete` at Step 8
-with the verification verdict. Do not rely on activity-log presence
-for in-progress signaling — `register_session_start()` runs first.
+detection by external tooling. It is updated again at Step 8 to flip
+`completedSessions[]` (every close) and on the final session also
+`status: "complete"` + `lifecycleState: "closed"`. Do not rely on
+activity-log presence for in-progress signaling — `start_session`
+(Full) or the hand-write above (Lightweight) is what makes the set
+visibly active.
 
 ### Step 2: Read the Spec and the Configuration Block
 
@@ -1279,6 +1363,41 @@ don't mix modes mid-set. Recovery for an already-drifted set: see
 `ai_router/docs/close-out.md` § "Mixed-mode drift" — run
 `close_session --repair --apply` to backfill the missing events.
 
+#### Symmetric close protocol (Set 022)
+
+Every close — non-final and final — appends `currentSession` to
+`completedSessions[]` (sorted, unique). Only the **final** close also
+flips `status` to `"complete"` and `lifecycleState` to `"closed"`. The
+final branch is reached when, after appending `currentSession`,
+`len(completedSessions) == totalSessions`. This is the symmetric
+counterpart to the [§State first, work second](#step-1-identify-the-active-session-set-and-register-session-start)
+boundary write at Step 1 and the same invariant the Session Set
+Explorer reads to bucket sets correctly.
+
+| Field                   | Non-final close                              | Final close                                  |
+|-------------------------|----------------------------------------------|----------------------------------------------|
+| `completedSessions[]`   | append `currentSession` (sorted, unique)     | append `currentSession` (sorted, unique)     |
+| `currentSession`        | unchanged (= just-closed session)            | unchanged (= `totalSessions`)                |
+| `status`                | `"in-progress"`                              | `"complete"`                                 |
+| `lifecycleState`        | `"work_in_progress"`                         | `"closed"`                                   |
+| `completedAt`           | unchanged (null)                             | now                                          |
+| Events ledger (Full)    | `closeout_requested` + `closeout_succeeded`  | `closeout_requested` + `closeout_succeeded`  |
+
+**Full tier.** `close_session` runs this protocol automatically —
+`_flip_state_to_closed` appends `currentSession` on every close via
+`compute_effective_completed_sessions` (which also backfills the
+array from the events ledger if it was empty on a legacy set).
+**Lightweight tier.** The orchestrator hand-writes the same field
+changes per the table above.
+
+Final-session detection deliberately uses
+`len(completedSessions) == totalSessions` post-append, with
+`change-log.md` presence as a belt-and-suspenders signal — both must
+indicate final session for the `status: "complete"` flip. This pairs
+with the v0.13.11 extension guard that downgrades a bucket if the
+ledger and snapshot disagree, so a drifted set never displays as
+Done by accident.
+
 #### Last session only — worktree and branch cleanup
 
 When the session being closed is the **last** session of the set AND the

```

### `docs/session-state-schema.md` — promote completedSessions[], canonical invariant

```diff
warning: in the working copy of 'docs/session-state-schema.md', LF will be replaced by CRLF the next time Git touches it
diff --git a/docs/session-state-schema.md b/docs/session-state-schema.md
index 61b3f7a..2dbac03 100644
--- a/docs/session-state-schema.md
+++ b/docs/session-state-schema.md
@@ -26,6 +26,25 @@ which infers the initial status from current file presence.
 The schema applies to all four Dabbler consumer repos and to any new
 repo adopted through the bootstrap prompt.
 
+## State invariant (Set 022 — canonical)
+
+Both writers (`start_session`, `close_session`) and all readers (the
+extension tree view, the close-out gate checks, the reconciler) derive
+their semantics from these three lines. When the snapshot's other
+fields disagree, this invariant wins:
+
+```
+currentSession not in completedSessions[]                   → session currentSession is in flight
+currentSession in completedSessions[] AND status="in-progress"  → between sessions (set is live but no session is active)
+status = "complete"                                         → set done
+```
+
+The "in flight" predicate is what the extension uses to render
+`0/N · session 1 in flight` (the fresh-set case) versus `1/4` plain
+(the between-sessions case). The "between sessions" branch only
+exists for a brief moment between `close_session` returning and the
+human triggering the next session.
+
 ## Required fields
 
 A conforming `session-state.json` is a JSON object with these fields:
@@ -41,7 +60,8 @@ A conforming `session-state.json` is a JSON object with these fields:
   "startedAt": "<ISO 8601 timestamp | null>",
   "completedAt": "<ISO 8601 timestamp | null>",
   "verificationVerdict": "VERIFIED" | null,
-  "orchestrator": { "engine": "...", "provider": "...", "model": "...", "effort": "..." } | null
+  "orchestrator": { "engine": "...", "provider": "...", "model": "...", "effort": "..." } | null,
+  "completedSessions": [<int>, ...]
 }
 ```
 
@@ -93,23 +113,44 @@ is **not** canonical. The extension's bucketing uses `status` first
 won't crash the UI but it surfaces in events-ledger audits and may
 confuse other consumers.
 
-## Optional fields
-
-### `completedSessions: number[]` (recommended on Lightweight tier)
-
-Array of 1-indexed session numbers that have been completed. Schema v2's
-authoritative signal for the "X done out of N" display.
-
-When present, the extension uses `completedSessions.length` directly. When
-absent, it falls back to deriving from `status` (`"complete"` → all done)
-or `currentSession − 1` (assumes the latest session is in flight). On
-Lightweight tier — where there's no `ai_router` writer — including this
-array eliminates the off-by-one ambiguity.
+### `completedSessions: number[]` (always written on Full; always maintained on Lightweight)
+
+Array of 1-indexed session numbers that have been completed, sorted
+ascending, no duplicates. **Schema v2's authoritative progress
+ledger.** Set 022 promoted this field from "optional but planned" to
+the canonical "X done out of N" signal on both tiers.
+
+When present, the extension uses `completedSessions.length` directly
+and computes the "in flight" predicate
+(`currentSession not in completedSessions[]`) to drive the
+`· session N in flight` annotation on early-session-1 rows. When
+absent on legacy sets, the extension falls back to the events-ledger
+count (distinct `closeout_succeeded` session numbers) and then to
+`totalSessions` when `status === "complete"`. The
+`currentSession − 1` fallback has been retired from the reader side
+(extension v0.13.12) — the writer-side helper
+`compute_effective_completed_sessions` makes it unnecessary, and
+removing the reader fallback eliminates an off-by-one class.
+
+Writer responsibility:
+
+- **Full tier.** `close_session` appends `currentSession` to
+  `completedSessions[]` on every successful close (non-final and
+  final), backfilling the array from the events ledger if the legacy
+  set was missing it. `start_session` preserves the existing array
+  across its snapshot rewrite, also backfilling from events for
+  pre-Set-022 sets.
+- **Lightweight tier.** The orchestrator or human appends
+  `currentSession` to `completedSessions[]` by hand on every close.
+  Without a router-driven writer, this array is the only authoritative
+  count signal — there is no events ledger to fall back to.
 
 ```json
 { ..., "completedSessions": [1, 2, 3] }
 ```
 
+## Optional fields
+
 ### `forceClosed: boolean`
 
 Set by `close_session --force` to record that gates were bypassed.
@@ -150,15 +191,21 @@ without confusion.
 ## Tier expectations
 
 - **Full tier** (`Workflow: Full` in the spec frontmatter): `ai_router`
-  writes the state file on every session boundary. `completedSessions`
-  is currently optional but planned; until then, `ai_router` flips
-  `status` to `"complete"` after the final session and the extension
-  uses the `state === "done"` derivation.
-- **Lightweight tier** (`Workflow: Lightweight`): no router writes. The
-  human or AI orchestrator maintains the file by hand on each session
-  boundary. **Include `completedSessions` explicitly** — it removes
-  the off-by-one risk and is the only authoritative count signal under
-  hand-maintenance.
+  writes the state file on every session boundary.
+  - `start_session` (Set 022): writes the in-flight shape — `currentSession`,
+    `status: "in-progress"`, `lifecycleState: "work_in_progress"`,
+    `startedAt` (if previously null), clears `completedAt` and
+    `verificationVerdict`. Preserves `completedSessions[]` from prior
+    state (or backfills from the events ledger on a legacy set).
+  - `close_session`: appends `currentSession` to `completedSessions[]`
+    on every close; flips `status` to `"complete"` and
+    `lifecycleState` to `"closed"` only on the final close (when
+    `len(completedSessions) == totalSessions` post-append).
+- **Lightweight tier** (`Workflow: Lightweight`): no router writes.
+  The human or AI orchestrator maintains the file by hand on each
+  session boundary, following the same field-by-field rules. **Always
+  include and maintain `completedSessions[]`** — it is the only
+  authoritative count signal under hand-maintenance.
 
 ## Worked examples
 
@@ -180,7 +227,7 @@ without confusion.
 }
 ```
 
-### Full tier, mid-set
+### Full tier, mid-set (session 2 in flight, session 1 closed)
 
 ```json
 {
@@ -198,10 +245,15 @@ without confusion.
     "provider": "anthropic",
     "model": "claude-opus-4-7",
     "effort": "normal"
-  }
+  },
+  "completedSessions": [1]
 }
 ```
 
+The invariant: `currentSession (2) not in completedSessions[]
+([1])` → session 2 is in flight. The extension's tree view renders
+this as `1/4 · session 2 in flight`.
+
 ### Not started
 
 ```json
@@ -227,9 +279,27 @@ Reading the canonical state of a folder:
 2. Read `status`; canonicalize via the alias map (`"completed"` →
    `"complete"`, `"done"` → `"complete"`).
 3. Read `completedSessions` if present; that's the authoritative count.
-4. Else if canonical `status === "complete"`, count = `totalSessions`.
-5. Else fall back to `currentSession − 1`. This is an estimate; emit
-   `completedSessions` to avoid it.
+4. Else read `session-events.jsonl` and count distinct
+   `closeout_succeeded` session numbers (Full-tier fallback for sets
+   that pre-date Set 022 — extension v0.13.12 reader path, and what
+   `ai_router.session_state.compute_effective_completed_sessions`
+   uses to backfill the array on the next boundary write).
+5. Else if canonical `status === "complete"`, count = `totalSessions`.
+6. Do **not** fall back to `currentSession − 1`. The reader-side
+   fallback was retired in extension v0.13.12; the writer-side helper
+   keeps `completedSessions[]` correct, and removing the reader
+   fallback eliminates an off-by-one class. Sets without either
+   `completedSessions[]` or a closeout-events trail read as 0
+   completed until the next boundary write heals them.
+
+Computing the "in flight" predicate (used by the tree view to
+distinguish a fresh-start row from a between-sessions row):
+
+- If `completedSessions` is missing or null → unknown, fall back to
+  count-only display.
+- If `currentSession` is set and not in `completedSessions[]` →
+  session `currentSession` is in flight.
+- Else → between sessions (set is live but no session is active).
 
 Bucketing in the Session Sets Explorer:
 
@@ -247,12 +317,17 @@ For consumer repos carrying pre-Set-7 drift:
 2. Rewrite `lifecycleState: "done"` / `"active"` / `"finished"` to the
    canonical `"closed"` (for terminal states) or `"work_in_progress"`
    (for live ones).
-3. On Lightweight tier, add `completedSessions: [1, 2, ...]` listing
-   every session that has completed.
+3. Add `completedSessions: [1, 2, ...]` listing every session that
+   has completed. **Required on both tiers as of Set 022.** On Full
+   tier the next `start_session` or `close_session` call backfills
+   this automatically (via `compute_effective_completed_sessions`),
+   so a hand-migration is optional but never harmful.
 4. Leave timestamps and other observability fields alone unless
    demonstrably wrong.
 
-The extension tolerates the unmigrated state files via the read-boundary
-alias map (since v0.13.10), so this migration can be done at leisure
-without breaking the UI. Migrate to keep the files self-describing for
-non-extension readers and to remove the off-by-one estimation.
+The extension tolerates the unmigrated state files via the
+read-boundary alias map (since v0.13.10) and the events-ledger
+fallback (since v0.13.12), so this migration can be done at leisure
+without breaking the UI. Migrate to keep the files self-describing
+for non-extension readers and to make the count derivation cheap
+(reading one JSON array beats parsing the full events ledger).

```

### `ai_router/docs/close-out.md` — Section 0 session-boundary writes + --repair --apply extension

```diff
warning: in the working copy of 'ai_router/docs/close-out.md', LF will be replaced by CRLF the next time Git touches it
diff --git a/ai_router/docs/close-out.md b/ai_router/docs/close-out.md
index 14291a5..5c30ee5 100644
--- a/ai_router/docs/close-out.md
+++ b/ai_router/docs/close-out.md
@@ -8,6 +8,7 @@ points here.
 
 Contents:
 
+- [Section 0 — Session-boundary writes (start and close)](#section-0--session-boundary-writes-start-and-close)
 - [Section 1 — When close-out runs](#section-1--when-close-out-runs)
 - [Section 2 — How to run close-out](#section-2--how-to-run-close-out)
 - [Section 3 — What the script does](#section-3--what-the-script-does)
@@ -17,6 +18,94 @@ Contents:
 
 ---
 
+## Section 0 — Session-boundary writes (start and close)
+
+Set 022 made `close_session` half of a symmetric pair. Every session
+in a Full-tier set has exactly two router-driven boundary writes:
+`start_session` at the beginning, `close_session` at the end. Both
+share `compute_effective_completed_sessions(session_set_dir)` from
+`ai_router.session_state` as the single source of truth for "how many
+sessions are closed," so the two writers cannot disagree about the
+set's current shape.
+
+### Why two writers
+
+The Session Set Explorer extension reads `session-state.json` and
+`session-events.jsonl` and surfaces the result as a fraction
+(`1/4`, `2/4`, `4/4 Done`) plus an "in flight" annotation
+(`· session 2 in flight`) on the row. For this UI to track reality,
+two transitions must land **on disk** at the right moment:
+
+- **Set first becomes active**, or a between-sessions set's next
+  session begins — the moment `start_session` runs.
+- **Set advances its fraction**, or hits Done — the moment
+  `close_session` returns success.
+
+Before Set 022, the start side was a Python call (`register_session_start`)
+embedded inside the orchestrator's automation script, and the close
+side already had this contract. Promoting the start side to a CLI
+makes the protocol uniform across engines (any orchestrator can
+shell out, even if it can't import `ai_router`) and gives the
+v0.13.11 defensive guards a writer-side mate so they only ever
+have to recover, never prevent.
+
+### Field-by-field protocol
+
+**At session start** (`python -m ai_router.start_session` — see
+[`ai_router/start_session.py`](../start_session.py)):
+
+| Field                  | Value at start                                       |
+|------------------------|------------------------------------------------------|
+| `currentSession`       | inferred via `compute_effective_completed_sessions`  |
+| `status`               | `"in-progress"`                                      |
+| `lifecycleState`       | `"work_in_progress"`                                 |
+| `startedAt`            | now (only if previously null)                        |
+| `completedAt`          | null (cleared if was set)                            |
+| `verificationVerdict`  | null (cleared if was set)                            |
+| `completedSessions[]`  | preserved (or backfilled from events on legacy sets) |
+| `orchestrator`         | refreshed for this session                           |
+| Events ledger          | append exactly one `work_started` (deduped)          |
+| Activity log           | nothing — first real step adds the first entry       |
+
+**At session close** (`python -m ai_router.close_session`, this doc):
+
+| Field                  | Non-final close                              | Final close                                  |
+|------------------------|----------------------------------------------|----------------------------------------------|
+| `completedSessions[]`  | append `currentSession` (sorted, unique)     | append `currentSession` (sorted, unique)     |
+| `currentSession`       | unchanged (= just-closed session)            | unchanged (= `totalSessions`)                |
+| `status`               | `"in-progress"`                              | `"complete"`                                 |
+| `lifecycleState`       | `"work_in_progress"`                         | `"closed"`                                   |
+| `completedAt`          | unchanged (null)                             | now                                          |
+| `verificationVerdict`  | latest verdict / unchanged                   | latest verdict / unchanged                   |
+| Events ledger          | `closeout_requested` + `closeout_succeeded`  | `closeout_requested` + `closeout_succeeded`  |
+
+Final-session detection uses
+`len(completedSessions) == totalSessions` post-append; `change-log.md`
+presence remains a belt-and-suspenders signal so a drift case in
+either direction is caught.
+
+### Idempotency
+
+Both writers are idempotent and safe to re-run:
+
+- `start_session` re-running for the in-flight session is a no-op.
+  The event ledger dedupes `work_started`; the snapshot fields are
+  already correct. Re-running asking for a different session number
+  exits 3 (boundary violation) — close the in-flight one first.
+- `close_session` re-running on an already-closed session exits 0
+  with `result: "noop_already_closed"` (see Section 3 step 4).
+
+### Tier symmetry
+
+The protocol applies tier-symmetrically: Full-tier projects use the
+two CLIs; Lightweight-tier projects hand-write the same fields. See
+[`docs/session-state-schema.md`](../../docs/session-state-schema.md)
+for the canonical field list and worked examples, and Step 1 of
+[`docs/ai-led-session-workflow.md`](../../docs/ai-led-session-workflow.md)
+for the orchestrator-facing pseudo-code.
+
+---
+
 ## Section 1 — When close-out runs
 
 Close-out is the **sole synchronization barrier** between session work
@@ -408,7 +497,15 @@ The drift shapes the walk detects:
    Repair: with `--apply`, append a synthetic `closeout_requested`
    (if missing) and `closeout_succeeded` for the claimed-closed
    session so the events ledger becomes internally consistent and
-   the tree view stops downgrading.
+   the tree view stops downgrading. **Set 022 extension:** the
+   apply path also backfills `completedSessions[]` in
+   `session-state.json` using
+   `compute_effective_completed_sessions` (which now sees the
+   synthesized closeout events). A drifted set with events for
+   sessions 1–4 but a snapshot that claims session 5 done gets
+   `completedSessions: [1, 2, 3, 4]` plus synthetic session-5
+   events (or whatever the helper resolves to), bringing both
+   files into agreement on the same boundary write.
 
 2. **Closeout-succeeded-but-state-not-closed.** The reverse drift:
    events ledger says the session closed but `session-state.json`

```

## Cross-consumer verification (Step 4)

Walked `docs/session-sets/<slug>/` in each of the three consumer repos.
Read-only inventory; no repairs run. Findings:

**`dabbler-platform`** (38 sets walked):
- 0 sets carry `completedSessions[]` today.
- 8 Full-tier sets (have `session-events.jsonl`): will heal cleanly via
  the events-ledger fallback on next boundary write:
  - `admin-user-creation-flow`, `admin-user-creation-flow-uat-remediation`,
    `admin-users-cross-links`, `composable-crud-helpers`,
    `packaging-and-template-readiness`, `transactional-system-columns`,
    `uat-dsl-verify-input-value`, `unified-master-details-composite`.
- 30 Lightweight-tier sets (no `session-events.jsonl`): no automated
  healer; need hand-maintenance per the schema doc going forward.
  These will emit a stderr warning on next boundary write via the
  `currentSession − 1` heuristic in `compute_effective_completed_sessions`,
  but won't break — the warning is the design intent: it tells the
  operator the array is being conjectured.

**`dabbler-access-harvester`** (33 sets walked):
- 0 sets carry `completedSessions[]` today.
- 5 Full-tier sets (have `session-events.jsonl`): will heal cleanly via
  events-ledger fallback:
  - `access-object-extractor-spike`, `form-report-code-and-grouping`,
    `generalization-validation-on-non-northwind`,
    `structured-form-report-extractor`, `table-extractor-coverage`.
- 28 Lightweight-tier sets: same as `dabbler-platform` — no events
  ledger, hand-maintenance going forward.
- Edge cases flagged: `integration-testing-and-acceptance` (cancelled
  mid-flight) and `vba-symbol-resolution-and-enrichment` (retired /
  superseded). Both can be left as-is; they're terminal states that
  won't see another boundary write.

**`dabbler-homehealthcare-accessdb`** (6 sets walked):
- 5 sets already carry numeric `completedSessions[]` arrays — fully
  compatible with the Set 022 invariant.
- 2 sets (`003-reports-client-svc-uat`, `004-reports-provider-uat`)
  carry string-based session IDs in `completedSessions[]` rather than
  integers. Lightweight-tier-only convention; the array is present and
  non-empty so the backfill helper won't fire, but the schema as written
  in `docs/session-state-schema.md` expects integers. **Not blocking**
  for this session set — the homehealthcare repo is a Lightweight-tier
  candidate that operates outside the Full-tier extension's progress
  counting path. If/when those two sets need to interoperate with the
  numeric ledger, the consumer repo can migrate them. Surfacing here so
  the operator knows.

**Verdict:** no consumer-repo set will *break* on next boundary write.
13 Full-tier sets heal cleanly via events-ledger fallback. 58 Lightweight-
tier sets carry on under hand-maintenance (with a stderr warning if any
ever transitions back to Full). 6 homehealthcare sets are already
compliant (with one schema-conformance note above).

## Your verification task

Verify that:

1. **Workflow-doc changes** correctly encode the state-first protocol
   in Step 1 with pseudo-code for both Full and Lightweight tiers, and
   that Step 8 gains the symmetric close-protocol detail (append on every
   close; flip status+lifecycleState only on final). Cross-reference the
   "do not skip close_session" warning is preserved.

2. **Schema-doc changes** promote `completedSessions[]` to "always written
   (Full) / always maintained (Lightweight)" — both worked examples and
   parser cheat-sheet must reflect this. The canonical three-line state
   invariant must be present and load-bearing. The reader-side parser
   cheat-sheet must (a) drop the `currentSession − 1` fallback and (b)
   add the events-ledger fallback step.

3. **Close-out doc changes** add a "Session-boundary writes" section
   covering both writers with a table mirroring the spec's protocol
   table, and extend the `--repair --apply` Case 1 description to
   mention `completedSessions[]` backfill.

4. **Cross-consumer verification** correctly identified which sets heal
   cleanly vs. which need hand-maintenance. Sanity-check the verdict
   "no consumer-repo set will break on next boundary write."

5. **Internal consistency**: the three docs cite each other where
   appropriate and don't disagree on field semantics.

Use the verification template instructions (verdict + issues with
category/severity). Doc-only work — no code or tests to validate.

Output JSON only. Use this exact shape:

```json
{
  "verdict": "VERIFIED" | "ISSUES_FOUND",
  "issues": [
    {
      "category": "Correctness | Completeness | False Positive",
      "severity": "Critical | Major | Minor",
      "description": "<what's wrong and what the correct answer should be>",
      "location": "<file path or section>"
    }
  ]
}
```
