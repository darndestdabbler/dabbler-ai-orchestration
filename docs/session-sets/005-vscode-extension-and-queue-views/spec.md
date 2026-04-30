# Session Set: VS Code Extension — Queue Views + Provider Heartbeats

## Summary

Surface the new outsource-last infrastructure in the VS Code extension. Add three new tree views to the activity-bar:

- **Provider Queues** — reads SQLite queue DBs via a Python helper script; shows pending / claimed / completed / failed messages per provider
- **Provider Heartbeats** — reads `capacity_signal.jsonl` files; shows last-emitted-work timestamps per provider, framed explicitly as observational ("when did this provider last emit?"), not predictive
- **Mode badges** on existing session-set items distinguishing outsource-first vs. outsource-last

The extension is the canonical surface for monitoring the two-CLI workflow. Without it, the human is staring at SQLite databases and JSONL files in a terminal.

---

## Why this set comes after Set 4

The data being surfaced (queue messages, capacity signals, mode badges, gate failures) all comes from infrastructure landed in Sets 1–4. This set adds NO new data sources — it just makes them visible.

Per the cross-provider review of the v1 plan, capacity awareness was reframed as **heartbeat-only**. This set's UI text reflects that framing carefully: no language that implies the extension can predict subscription window exhaustion.

---

## Scope

### In scope
- `Provider Queues` tree view in the existing `dabblerSessionSetsContainer` activity bar container
- `Provider Heartbeats` tree view in the same container
- Mode badges on existing session-set tree items
- Helper Python script `python -m ai_router.queue_status` that the extension shells out to (avoids needing to ship a SQLite client in the extension)
- Refresh + auto-poll for queue / heartbeat views
- Right-click context menus for queue messages: Open Payload, Mark Failed (for stuck messages), Force Reclaim (for emergency lease release)

### Out of scope
- Workflow doc collapse — Set 6
- Fresh close-out turn routing — Set 6
- Cross-provider audit — Set 6
- Any new behavior in the AI router itself (this set is UI only)

---

## Sessions

### Session 1: Helper Python script (`queue_status`) + activity-bar wiring

**Goal:** Build the Python helper the extension shells out to; wire the new view containers in `package.json`.

**Deliverables:**
- New module `ai-router/queue_status.py` invocable as `python -m ai_router.queue_status`
- CLI flags:
  - `--provider <name>` — filter to one provider
  - `--state <state>` — filter to one message state
  - `--workspace <path>` — workspace root (defaults to cwd)
  - `--format json` — JSON output for the extension
  - `--limit <n>` — cap result count (default 50)
- Output schema (JSON):
  ```json
  {
    "providers": {
      "anthropic": {
        "queue_path": "...",
        "states": {"new": 0, "claimed": 1, "completed": 12, "failed": 0, "timed_out": 0},
        "messages": [{"id": "...", "task_type": "...", "session_set": "...", "state": "...",
                      "claimed_by": "...", "lease_expires_at": "...", "enqueued_at": "..."}]
      }
    }
  }
  ```
- Helper `python -m ai_router.heartbeat_status` for capacity signal data:
  ```json
  {
    "providers": {
      "anthropic": {
        "last_completion_at": "2026-04-30T14:23Z",
        "completions_in_last_60min": 3,
        "tokens_in_last_60min": 4231,
        "minutes_since_last_completion": 12,
        "_disclaimer": "Observational only; subscription windows are not introspectable."
      }
    }
  }
  ```
- Update `tools/dabbler-ai-orchestration/package.json`:
  - Add view containers entries for `dabblerProviderQueues` and `dabblerProviderHeartbeats` under the existing `dabblerSessionSetsContainer`
  - Add command IDs for refresh/inspect (placeholders implemented in Session 2)
- Verify both Python helpers work standalone before extension integration
- Unit tests for the Python helpers

**Acceptance:**
- `python -m ai_router.queue_status --format json` produces parseable JSON
- `python -m ai_router.heartbeat_status --format json` produces parseable JSON with disclaimer
- `package.json` updated with new view containers (extension still loads)

### Session 2: `Provider Queues` tree view

**Goal:** Render a tree view that lists pending / claimed / completed / failed messages per provider. Right-click actions for inspection and emergency intervention.

**Deliverables:**
- New TypeScript module `tools/dabbler-ai-orchestration/src/providers/ProviderQueuesProvider.ts`
- Implements `vscode.TreeDataProvider<ProviderQueueItem>`
- Tree structure:
  ```
  Provider Queues
  ├── anthropic
  │   ├── new (0)
  │   ├── claimed (1)
  │   │   └── <message-id-prefix> · session-verification · my-feature/3
  │   ├── completed (12)
  │   ├── failed (0)
  │   └── timed_out (0)
  ├── openai
  │   └── ...
  ```
- On expand, tree fetches data via `python -m ai_router.queue_status --format json`
- Refresh: manual button + auto-refresh every 15s (settings-configurable)
- Right-click context menu on individual messages:
  - **Open Payload** — opens a new editor with the message's payload (read-only)
  - **Mark Failed** — invokes `python -m ai_router.queue_status --mark-failed <id>` (force-fails a stuck message; emits a confirmation dialog)
  - **Force Reclaim** — releases a stuck lease (`python -m ai_router.queue_status --force-reclaim <id>`); confirmation dialog
- Tooltip on hover: full message metadata
- Item icons by state (new=○, claimed=↻, completed=✓, failed=✗, timed_out=⏰)
- Tests via the extension test harness

**Acceptance:**
- View renders the queue state correctly
- Refresh button updates the view
- Right-click actions work and confirm before destructive operations

### Session 3: `Provider Heartbeats` view + mode badges + polish

**Goal:** Heartbeats view with explicit observational framing. Mode badges on existing session-set tree items. Final polish and tests.

**Deliverables:**
- New TypeScript module `tools/dabbler-ai-orchestration/src/providers/ProviderHeartbeatsProvider.ts`
- Tree structure:
  ```
  Provider Heartbeats (heartbeat-only — observational)
  ├── anthropic — last seen 12 min ago · 3 completions / 60 min
  ├── openai    — last seen 2 min ago  · 8 completions / 60 min
  └── google    — silent for 3h 22m    · ⚠️
  ```
- Silent provider warning: if `minutes_since_last_completion > 30`, show ⚠️ icon
- View description footer (visible at all times): _"Observational only. Subscription windows are not introspectable. Use as a heartbeat signal, not as routing guidance."_
- Mode badges on session-set items in existing `SessionSetsProvider`:
  - Read `outsourceMode` from each session set's `spec.md`
  - Add `[FIRST]` or `[LAST]` prefix to the description (or use a small icon)
- Refresh + auto-poll for heartbeats view (15s default, config setting)
- Documentation in extension's README.md describing the new views
- Tests covering: heartbeat view rendering, silent-provider warning threshold, mode badge correctness

**Acceptance:**
- Heartbeats view renders with explicit observational framing in description footer
- Silent provider warning fires after 30 min of no activity
- Mode badges visible on existing session-set items
- Extension passes all existing tests + new tests
- README updated with screenshots of the new views

---

## Acceptance criteria for the set

- [ ] All three sessions complete with passing tests
- [ ] Provider Queues tree view renders queue state and supports right-click actions
- [ ] Provider Heartbeats view shows last-seen timestamps with explicit "observational only" framing
- [ ] Mode badges visible on existing session-set items
- [ ] Extension's existing functionality unchanged
- [ ] No marketplace-blocking issues (CSP for any webview content, manifest validity, etc.)

---

## Risks

- **Shelling out to Python on every refresh.** May be slow if Python startup is slow. Mitigate: cache results within the extension for 5s; show stale-data indicator if cache is hit.
- **Heartbeat misuse.** Users may glance at the view and infer "provider is healthy because last completion was recent." This is wrong: a healthy-looking heartbeat doesn't mean the next call won't be rate-limited. Mitigate: footer text is prominent and specific.
- **SQLite locking conflict with running daemons.** The `queue_status` script reads while daemons may be writing. Use `PRAGMA query_only=ON` in read-only paths.
- **Cross-platform Python invocation.** Spawn semantics differ between Windows and Unix; reuse the existing pattern from the extension's other Python integrations (Set 4 of the prior VS Code extension work).

---

## References

- Set 1: `001-queue-contract-and-recovery-foundations` (queue DBs being read)
- Set 2: `002-role-loops-and-handoff` (capacity signals being read)
- Set 4: `004-cost-enforcement-and-capacity` (capacity_signal.jsonl format)
- Existing extension: `tools/dabbler-ai-orchestration/`
- Plan v2 synthesis: `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
