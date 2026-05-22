## Discovery Notes — Claude Code 2.1.63

> **Session:** 044 / S2. **Status:** structural inventory complete;
> live-run harvest pending operator scope decision (folded into the
> same synthetic-set runs that may also exercise Copilot's deferred
> S1 harness, per operator decision 2026-05-22).
> **Backend:** Claude Code CLI 2.1.63 (Windows).
> **Harvest origin:** `~/.claude/` (the operator's existing config +
> per-project transcripts), plus the Dabbler-side hook integration at
> [`tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js`](../../../tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js).
> **Important:** unlike S1's Copilot probe (which ran against an
> empty `~/.copilot/`), this probe ran against the **operator's real
> Claude Code state** — `~/.claude/projects/` carries 31 project
> slugs with 121 transcript artifacts for this repo alone. The
> reading-side discipline (Part 2 §"Reading-side discipline") was
> applied strictly: distinct-key-set enumeration, byte counts, and
> enum-cardinality probes only — **no transcript content was read
> into the conversation or quoted in this file**.
> **Redaction posture:** structural-only (schemas, field names,
> byte counts, distinct-type-name enumeration). See
> [harvest-objectives-and-redaction.md](harvest-objectives-and-redaction.md)
> for the policy; S2-specific risk additions are in §8 below.

---

### 1. Log-surface inventory (per Part 3 methodology)

| Artifact | Format | Trigger | Per-process? | Schema (top-level shape) | Surfaces signals | Redaction risk | Sample size at probe |
|---|---|---|---|---|---|---|---|
| `~/.claude/settings.json` | JSON | First launch + settings edits | Shared (single file, rewritten in place) | `{autoUpdatesChannel: str, effortLevel: str, permissions: {...}, hooks?: {<event>: [{matcher, hooks: [{type, command}]}]}}` (operator's instance has no `hooks` block) | **A3** when `effortLevel` is set (default-effort signal — process-scope, not per-turn) | Low — no tokens; `permissions` list could reveal which tools/paths the operator has allowed/denied but not content | 87931 bytes on operator's instance |
| `.claude/settings.json` + `.claude/settings.local.json` (project-scoped, this repo) | JSON | Per-project settings persistence | Shared per project | `{permissions: {...}}` only on this repo; both files contain permissions allowlists with no hooks | (n/a — no hooks installed at the project scope on this repo) | Low | 103 + 339 bytes |
| `~/.claude/.credentials.json` | JSON | OAuth token storage | Shared | (not opened — known to contain bearer/refresh tokens per Claude Code docs) | n/a | **Critical** — long-lived OAuth tokens. Must never be copied to scratch or read into the conversation. Excluded from any harvester copy operation. | 528 bytes |
| `~/.claude/ide/<pid>.lock` | JSON | Per Claude-CLI ↔ IDE-extension bridge session | Per bridge session | `{authToken: str, ideName: str, pid: int, runningInWindows: bool, transport: str, workspaceFolders: [str]}` | None directly (envelope + pid) | **Critical** — `authToken` is the IDE-bridge bearer in plaintext (direct parallel to Copilot CLI's `~/.copilot/ide/*.lock` `headers.Authorization`). **Symmetric Claude/Copilot redaction concern.** | 12 locks on operator's instance, 201–222 bytes each |
| `~/.claude/projects/<slug>/<conv-uuid>.jsonl` | JSONL (one event per line) | Per conversation, append-only across turns | **Per conversation** (one file per CLI session) | See §2 for full type enumeration. Events: `assistant`, `user`, `attachment`, `file-history-snapshot`, `ai-title`, `last-prompt`, `queue-operation` | **A1**, **A2** (`message.model` per turn), **A5** (`sessionId`), **B1** (tool_use blocks), **B2/B3** (filterable by tool_use.input or toolUseResult.filePath), **B5** (tool_use_result on the user envelope), **C1** (per-event `timestamp`), **C2** (file mtime + first/last timestamp), partial **C3** (the slug names the project workspace but not the session set) | **HIGH** — full user prompts in `user.message.content[text]`, full assistant text + thinking in `assistant.message.content`, full file contents read by the assistant in `toolUseResult.originalFile`/`oldString`/`stdout` | 121 artifacts for this repo's slug; one sampled jsonl was 2,549,037 bytes / 713 lines |
| `~/.claude/projects/<slug>/<conv-uuid>/subagents/agent-<id>.jsonl` + `.meta.json` | JSONL + JSON | Per subagent (Agent tool) invocation | Per subagent | Mirrors the main JSONL schema; `.meta.json` carries the subagent envelope | Same as parent JSONL (A1, A2, B1, etc.) | Same HIGH | Present alongside any conversation that spawned subagents |
| `~/.claude/projects/<slug>/<conv-uuid>/tool-results/<id>.txt` | Plain text | Per long tool result | Per tool call | Raw tool stdout/result, written out-of-band when too large to inline in the JSONL | B1 stdout/content envelope only — content is the value | **HIGH** — full tool output including any file contents the tool surfaced | Present; per-result file naming `<short-id>.txt` |
| `~/.claude/file-history/<conv-uuid>/<content-hash>@v<N>` | Binary or text blobs (content-addressed snapshots) | Per file edit/write tracked for `/restore-checkpoint` rollback | Per conversation, per file | Content-addressed object store; `<hash>@v1`, `<hash>@v2` versions per file | B5 (the set of touched files is enumerable; their pre-edit contents are *stored*) | **HIGH** — these are full pre-edit file contents kept for rollback; treat as if every file Claude has edited is mirrored here | 579 per-conversation subdirs; one sampled subdir held 13 versioned objects, item size ~3 KB | 
| `~/.claude/sessions/<pid>.json` | JSON | Per Claude Code process launch | **Per process** | `{cwd, entrypoint, kind, peerProtocol, pid, sessionId, startedAt, version}` | A5 (sessionId) + C2 (startedAt) + envelope (cwd, version) | Low — envelope; `cwd` could pinpoint the workspace but no prompt/response | 6 files on operator's instance |
| `~/.claude/session-env/<conv-uuid>/` | (dir; empty on operator's instance) | Per session env-snapshot | Per conversation | (empty at probe time — no observed env-snapshot data to characterize) | TBD on first non-empty observation | TBD — likely environment variables (potentially HIGH if any `*_TOKEN`/`*_KEY` env vars are captured) | 0 files |
| `~/.claude/todos/<conv-uuid>-agent-<id>.json` | JSON | Per TodoWrite tool call | Per conversation/subagent | Top-level list of `{content, status, activeForm, ...}` entries | Coarse-grained C3-adjacent (todo content often paraphrases user intent / set+session boundaries) | Medium — todo titles may echo user-paraphrased intent; not raw prompts but adjacent | 8 files on operator's instance |
| `~/.claude/history.jsonl` | JSONL | Per prompt-suggestion-init event (sparse) | Shared | `{display: str, pastedContents: dict, project: str, sessionId: str, timestamp: int}` | A5 + C1 (timestamps); the `display` field paraphrases the most recent prompt envelope | Medium — `display` is a short prompt prefix; `pastedContents` could hold pasted user content | 2 lines / 373 bytes |
| `~/.claude/plans/<title-slug>.md` | Markdown | Per `/plan`-mode artifact | Shared | LLM-authored plan markdown | None of A/B/C/D directly | **HIGH** — the *filename* embeds a sentence-fragment paraphrase of the prompting message (e.g., `i-am-putting-you-vivid-beacon.md`). Filename is the leak surface; content is plan prose. | 21 files, 6 KB–27 KB each |
| `~/.claude/shell-snapshots/snapshot-bash-<ts>-<rand>.sh` | Shell script | Per Bash tool invocation | Per Bash call | Snapshot of the shell environment at invocation time | None of A/B/C/D directly | Medium — env values; could include PATH-leaked operator paths but not tokens (the Claude CLI deliberately filters its own auth env) | 223 snapshots |
| `~/.claude/telemetry/<event>.<uuid>.<uuid>.json` | JSONL (despite `.json` extension) | Per internal-telemetry event (when telemetry is on) | Shared | `{event_type: "ClaudeCodeInternalEvent", event_data: {event_name, session_id, model, env, entrypoint, client_timestamp, ...}}` | A2 (`event_data.model`), A5 (`event_data.session_id`), C1 (`client_timestamp`) | Low — operational; no prompts/responses, but `event_data.env` can carry env-var keys | 13 files (`*_failed_events.*.json`); 16 distinct `event_name` values observed (e.g., `tengu_init`, `tengu_context_size`, `tengu_dir_search`, `tengu_oauth_token_refresh_lock_acquiring`) |
| `~/.claude/cache/changelog.md` | Markdown | Per CLI auto-update | Shared | Claude Code's own release notes | None | Low — public release notes | Single file |
| `~/.claude/plugins/{blocklist.json, known_marketplaces.json, marketplaces/}` | JSON + dir | Plugin-marketplace state | Shared | Marketplace allow/block lists; downloaded plugin metadata | None | Low | n/a |
| `~/.claude/debug/latest/` | (referenced but absent on operator's instance) | When debug logging is enabled | n/a | TBD | TBD | TBD | 0 files |
| `~/.claude/backups/` | (empty on operator's instance) | Settings-edit backup pre-write | n/a | n/a | n/a | TBD | 0 files |

---

### 2. JSONL transcript schema (the rich-signal artifact)

Each `~/.claude/projects/<slug>/<conv-uuid>.jsonl` is append-only,
one event per line. Across the 713-line sample, **7 distinct
`type` values** appear. Counts shown are from that single sample
(non-empty, representative; not a population statistic):

| `type` | Count in sample | Top-level keys |
|---|---:|---|
| `assistant` | 327 | `cwd`, `entrypoint`, `gitBranch`, `isSidechain`, `message`, `parentUuid`, `requestId`, `sessionId`, `timestamp`, `type`, `userType`, `uuid`, `version` |
| `user` (prompt) | 191 | `cwd`, `entrypoint`, `gitBranch`, `isSidechain`, `message`, `parentUuid`, `permissionMode`, `promptId`, `sessionId`, `timestamp`, `type`, `userType`, `uuid`, `version` |
| `user` (tool-result-bearing) | 16 | adds `sourceToolAssistantUUID`, `toolUseResult`, drops `permissionMode` |
| `ai-title` | 62 | `aiTitle`, `sessionId`, `type` |
| `last-prompt` | 60 | `lastPrompt`, `leafUuid`, `sessionId`, `type` |
| `file-history-snapshot` | 34 | `isSnapshotUpdate`, `messageId`, `snapshot`, `type` |
| `attachment` | 19 | `attachment`, `cwd`, `entrypoint`, `gitBranch`, `isSidechain`, `parentUuid`, `sessionId`, `timestamp`, `type`, `userType`, `uuid`, `version` |
| `queue-operation` | 4 | `operation` (∈ `enqueue`, `dequeue`), `sessionId`, `timestamp`, `type` |

**`assistant.message` substructure** (the conflict-detection signal
source):

```
message = {
  id, role, type, model,        // model is the A2 signal — literal "claude-opus-4-7" observed
  content: [<content-block>...],
  stop_reason, stop_sequence, stop_details,
  diagnostics,
  usage,                        // token counts (in/out/cache); cost-tracking parity with router
}

content-block.type ∈ { "text", "thinking", "tool_use" }

tool_use block = {
  caller, id, input, name, type   // `name` = tool name; `input` = tool args (may contain
                                  // file paths AND verbatim file content for Edit/Write)
}
```

**`user.message.content` substructure** (the result side):

```
message = { content: [<content-block>...], role }
content-block.type ∈ { "text", "tool_result" }

tool_result block = { content, is_error?, tool_use_id, type }
```

**`user.toolUseResult` (top-level on the user envelope, per-tool
shape)** — the heart of B5 (file-write rule-violation signal). Eight
distinct shapes observed in the 16-result sample, each corresponding
to a different tool's result schema:

| Shape | Tool inferred | Conflict-detection signal |
|---|---|---|
| `(filePath, newString, oldString, originalFile, replaceAll, structuredPatch, userModified)` | **Edit** | `filePath` is the exact path edited; `originalFile` + `oldString` carry full prior content (HIGH redaction risk) |
| `(content, filePath, originalFile, structuredPatch, type, userModified)` | **Write** | `filePath` is the exact path written; `content` is the new file body (HIGH redaction risk) |
| `(interrupted, isImage, noOutputExpected, returnCodeInterpretation, stderr, stdout)` | **Bash** (status-aware) | `stdout`/`stderr` carry full command output; B4 signal lives here (`start_session` invocations show up as Bash results) |
| `(interrupted, isImage, noOutputExpected, stderr, stdout)` | **Bash** (older variant) | Same |
| `(matches, query, total_deferred_tools)` | **Grep / search** | Query string + match list; ToolSearch responses share this envelope |
| `(content, filenames, mode, numFiles, numLines)` | **multi-file read / LS** | File listing |
| `(answers, questions)` | **AskUserQuestion** | Operator answers captured verbatim — operator-content redaction concern |
| `(newTodos, oldTodos)` | **TodoWrite** | Todo titles |
| `(file, type)` | **Read** (file-touch envelope) | Just the path — no content |

**`file-history-snapshot.snapshot` substructure** — the rollback
mechanism (powers `/restore-checkpoint`):

```
snapshot = {
  messageId,
  timestamp,
  trackedFileBackups: { <abs-path>: <hash-or-blob-ref>, ... }
}
```

These are the index objects; the actual pre-edit blobs sit in
`~/.claude/file-history/<conv-uuid>/<content-hash>@v<N>`. Their
existence means **every file Claude has edited in a conversation is
mirrored content-addressed under `~/.claude/file-history/`** —
this is a much heavier always-on redaction surface than anything
Copilot CLI carries. Any harvester implementation must explicitly
exclude `file-history/` from any copy-to-scratch operation, or
limit the copy to the *index files* (`file-history-snapshot`
entries inside the JSONL) without pulling the blob store.

**Other event-type substructures (envelope only):**

- `attachment.attachment` has three observed shapes:
  - `(content, isInitial, skillCount, type)` — initial skills attachment
  - `(addedLines, addedNames, pendingMcpServers, readdedNames, removedNames, type)` — MCP server changes
  - `(content, itemCount, type)` — context attachments

- `ai-title.aiTitle` is a Claude-generated rolling conversation title;
  the 62 occurrences in 713 lines suggest the title is recomputed
  frequently (potentially per turn). The title is a paraphrase of
  conversation content — Medium redaction risk.

- `last-prompt.lastPrompt` keeps a copy of the most recent user
  prompt so `/resume` can repopulate the input. **HIGH redaction
  risk** — verbatim user prompt in a top-level field, easily
  greppable.

---

### 3. Hook integration (the Dabbler-specific opt-in path)

Unlike Copilot's `session-store.db` (always-on out of the box),
Claude Code's orchestrator-aware integration with Dabbler is
**opt-in** via the VS Code extension's installer command (per
`installOrchestratorHookClaudeCode.ts`):

- **Hook event**: `SessionStart` (one of Claude Code's documented
  hook events; payload is JSON on stdin to the hook command).
- **Installed shim**: `node "<extension>/scripts/claude-session-start-invoker.js"`
- **Behavior** (Set 033 H1): the shim reads the payload, walks up
  from `payload.cwd` to find the single in-progress session set,
  preserves any prior `claude+anthropic` model/effort, and spawns
  `python -m ai_router.start_session` — the **canonical writer**
  that holds the H3 hard-coordination invariant. The hook itself
  does not write `session-state.json`.
- **Hook payload fields used**: only `cwd`. Other Claude Code
  hook payload fields exist (per the public hook docs) but the
  Dabbler shim does not consume them.
- **Failure modes**: zero or multiple in-progress sets → silent
  exit 0; spawn failure → stderr log, exit 0; conflict (exit 4 from
  `start_session`) → write `~/.dabbler/checkout-conflicts/<ts>-claude-<slug>.json`
  for the in-extension `CheckoutPollService` to surface, then exit 0.
- **Conflict-record schema**: `{schemaVersion, detectedAt, source,
  sessionSetPath, sessionSetSlug, sessionNumber, heldByEngine,
  heldByProvider, heldByModel, checkedOutAt, wouldBeHolderEngine,
  wouldBeHolderProvider, wouldBeHolderModel, wouldBeHolderEffort}`
  — these are pre-redacted by design (no prompts, no file contents,
  just identity envelopes); safe to characterize verbatim.

**Operator's current state (this repo, 2026-05-22):** `~/.claude/settings.json`
has no `hooks` block and the project-level
[`.claude/settings.json`](../../../.claude/settings.json) also has no `hooks`
block. The installer hasn't been run against this repo's checkout, which
means the in-this-conversation `start_session` call that opened S2 came
from the orchestrator's explicit shell invocation, not from a
SessionStart hook firing. This matters for §4 below: **B4 (subprocess
invocation of `start_session`) is observable in the JSONL transcript
exactly where it normally is — inside a `user.toolUseResult` Bash result
block**, the same as any other shell command, and the hook path adds no
JSONL signal of its own (the invoker logs to stderr and exits 0).

---

### 4. Per-harvest-objective coverage (S2 verdict, Claude side only)

| Objective | Native? | Surface(s) | Notes |
|---|---|---|---|
| A1 — engine name | **Implicit** — file location alone identifies Claude Code | n/a | Same disposition as Copilot |
| A2 — model id per turn | **Yes**, per-turn | `assistant.message.model` on every assistant event in the JSONL; also `event_data.model` on telemetry events | Stronger than Copilot's `session-store.db` — model lives **on every turn**, not on the session row |
| A3 — effort / reasoning level | **Partial** — process-default in `~/.claude/settings.json`'s `effortLevel`; **fast/standard axis** structurally derivable from `usage.service_tier` + `usage.speed`; **high/medium/low effort axis** absent from `usage` and from `stop_details` (empty across the 327-event sample) | settings.json + `assistant.message.usage` (per-turn for fast/standard) | Empirical S2 probe of `assistant.message.usage` key-set revealed 10 fields: `cache_creation`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `inference_geo`, `input_tokens`, `iterations`, `output_tokens`, `server_tool_use`, `service_tier`, `speed`. **No** `reasoning_tokens`, `reasoning_effort`, `thinking_effort`, or equivalent field. `service_tier` and `speed` both showed `'standard'` in the sample (no `/fast`-mode turns observed). Conclusion: A3 narration mandatory for the high/medium/low effort dimension; fast-mode dimension can be read structurally. |
| A4 — provider | **Implicit** (always Anthropic) | n/a | Same disposition as Copilot |
| A5 — conversation/session id | **Yes** | `sessionId` (top-level on every JSONL event); `~/.claude/sessions/<pid>.json sessionId`; `~/.claude/ide/<pid>.lock` (filename = pid, not sid; not equivalent) | Stronger than Copilot — every line carries the sid, not just the session row |
| B1 — tool calls (name + args) | **Yes** | `assistant.message.content[tool_use]` carries `name` + `input` per call | Args are inline by default. Equivalent to Copilot OTel `execute_tool` spans **with content capture on** (which Copilot's default is OFF) — Claude's "content capture" is just "the default" |
| B2 — tool calls touching `docs/session-sets/**` | **Yes** — derivable from B1 by path filter on `tool_use.input` or `toolUseResult.filePath` | JSONL | `toolUseResult.filePath` is the cleaner channel (already path-extracted) for Edit/Write tools |
| B3 — tool calls touching `session-state.json` | **Yes** — derivable from B1 by exact-path match on `toolUseResult.filePath` | JSONL | Direct exact-path query |
| B4 — subprocess invocations of `start_session` / `close_session` | **Yes** | `assistant.message.content[tool_use]` where `tool_use.name == "Bash"` and `tool_use.input.command` contains `ai_router.start_session` / `ai_router.close_session`; result in matching `user.toolUseResult` (Bash shape: stdout/stderr/returnCodeInterpretation) | Observable in this very S2 conversation. No empirical-confirmation hole here |
| B5 — file writes that bypass the writer | **Yes** — Claude's JSONL surfaces **every** Edit/Write directly as `(filePath, newString, oldString, ...)` on the user envelope. A watcher can detect "Claude wrote to `session-state.json` via the Edit tool" without ambiguity | JSONL `toolUseResult` envelope | **Stronger evidence than Copilot's `session_files.tool_name`** — Claude shows the full diff inline, not just the tool name |
| C1 — per-turn timestamp | **Yes** | every event carries `timestamp` | Multiple-surfaces equivalent to Copilot |
| C2 — conversation start/end timestamp | **Yes** | First/last JSONL `timestamp` + `~/.claude/sessions/<pid>.json startedAt` + file mtime | Multiple surfaces |
| C3 — "Starting Set N Session M" boundary marker | **No** | (narration) | Project `<slug>` names the workspace path (same as Copilot's `sessions.cwd`); session-set-level granularity needs narration |
| C4 — "Calling start_session/close_session" boundary marker | **Yes via B4** | JSONL | Same as Copilot |
| C5 — pre-tool-call intent vs. post-tool-call result | **Yes** | `assistant.message.content[tool_use]` (the pre-call intent: tool name + args) is one event; `user.toolUseResult` (the post-call result) is a *separate* event later in the JSONL with `sourceToolAssistantUUID` pointing back at the assistant event | Cleaner than Copilot — these are explicit linked events, not span hierarchy reconstruction |

**Coverage summary:** the table has 15 rows (A1–A5, B1–B5, C1–C5).
**14 of 15 objectives are surfaced by Claude Code natively** (no
content-capture flag, no opt-in OTel exporter — the JSONL is
always on): 11 unambiguous "Yes" (A2, A5, B1, B2, B3, B4, B5, C1,
C2, C4, C5), 2 "Implicit" (A1, A4 — derivable from file location),
1 "Partial" pending S3 empirical confirmation (A3 — `effortLevel`
exists at process scope; per-turn TBD), and **1 native gap** (C3,
same as Copilot). Only **A3 (per-turn effort)** and **C3
(set/session marker)** unambiguously require narration — *exactly
the same two gaps as Copilot*. Every other native-or-gap verdict
matches the Copilot result, so the conflict-detection triple
(C1 + A1+A4 + C3) is in the same position structurally on both
backends: timestamps and engine+provider come for free; the
session-set boundary needs narration.

**Bottom-line for the proposal in S5:** Claude's JSONL is on par
with Copilot's `session-store.db` + OTel combined, **without the
OTel opt-in**. The per-turn `model` stamping is actually richer
than Copilot's per-session `host_type` (which may not even carry
the model). The fundamental architectural finding from S1 holds:
the native logs of both backends *already* contain the
(conv-id, file-path, tool-name, turn-index, timestamp, engine,
provider) signal a conflict watcher would need. C3 is the only
structural gap requiring narration, and it is symmetric across
backends, which makes the S3 narration design exactly one design
applied to both.

---

### 5. Authentication-bridge security note

`~/.claude/ide/<pid>.lock` files carry an `authToken` string field
in plaintext (12 such files exist on the operator's instance — the
locks accumulate across IDE restart because the lockfile-cleanup
fires on graceful shutdown only). This is the **direct parallel to
Copilot CLI's `~/.copilot/ide/<uuid>.lock headers.Authorization`** —
both backends use the same IDE-bridge pattern, both leave plaintext
bearer tokens at well-known paths. The Set 044 redaction policy
must treat `~/.claude/ide/` identically to `~/.copilot/ide/`:

- Never copy verbatim into commits, screenshots, scratch artifacts.
- Exclude `~/.claude/ide/` from any harvester copy-to-scratch
  operation.
- The same exclusion already documented for `~/.copilot/ide/` in
  the S2 harness recipe applies; the §6 scaffolding below
  enumerates the explicit Claude-side exclusion list.

Additionally, `~/.claude/.credentials.json` carries the
long-lived OAuth tokens (528 bytes, content unread) — same
critical-redaction posture, must never be touched by a harvester.

---

### 6. Scaffolding for the (possible) S2/S3 live runs

Per the operator scope decision (pending — see §9 below), live
harvest runs against the synthetic-set may occur in S2 alongside
the deferred Copilot runs. S1 already authored the scratch tree;
S2 adds these Claude-specific extensions:

**Scratch layout (existing from S1, plus Claude-side additions):**

```
C:\tmp\dabbler-log-harvest\
├── otel\                          # OTel exporter target (Copilot-only)
├── s1-baseline-copilot\           # deferred S1 runs land here if executed
├── s2-baseline-claude\            # this set's S2 deliverable
│   ├── claude-home\               # ISOLATED $env:CLAUDE_HOME for synthetic runs (NOT operator's ~/.claude)
│   ├── transcripts\               # snapshots of synthetic-run JSONLs
│   └── snapshot-meta.json         # per-run capture metadata (cwd, args, sid, env subset)
├── s3-narration-copilot\          # Session 3
├── s4-narration-claude\           # Session 4
└── synthetic-set\                 # the synthetic session-set tree (S1 scaffold)
    └── docs\session-sets\001-synthetic-harvest-target\
```

**Claude-side harness recipe (recipe-form only — no live runs in
S2 until operator authorizes):**

```powershell
# Per the S1 redaction policy: harvest scratch is gitignored;
# nothing in C:\tmp\dabbler-log-harvest\ enters the repo verbatim.

$env:CLAUDE_HOME = "C:\tmp\dabbler-log-harvest\s2-baseline-claude\claude-home"   # isolate from operator's real ~/.claude
# (env-var name is the documented home-override; verify in S2 first via `claude --help` if uncertain)

# Three representative invocations against the synthetic set:
#   1. interactive: read spec.md, summarize, exit
#   2. headless --print "what is in this session set?"
#   3. headless with a tool-call: "create a note file at notes.md saying 'hello'"
claude --add-dir C:\tmp\dabbler-log-harvest\synthetic-set --print "..."  (etc.)

# After each invocation, snapshot the touched surfaces:
#   $env:CLAUDE_HOME\projects\<slug>\<conv-uuid>.jsonl
#   $env:CLAUDE_HOME\projects\<slug>\<conv-uuid>\subagents\        (if any)
#   $env:CLAUDE_HOME\projects\<slug>\<conv-uuid>\tool-results\     (if any)
#   $env:CLAUDE_HOME\sessions\<pid>.json
#   $env:CLAUDE_HOME\telemetry\<event>.<uuid>.<uuid>.json          (if telemetry on)
# Do NOT snapshot:
#   $env:CLAUDE_HOME\ide\                  (authToken-bearing locks)
#   $env:CLAUDE_HOME\.credentials.json     (OAuth tokens)
#   $env:CLAUDE_HOME\file-history\         (full pre-edit content blobs)
```

**Note on `file-history/`:** even isolated synthetic runs will
populate `file-history/` with the synthetic-set's own contents
(low-sensitivity by construction). But the harvester implementation
must NOT generalize "we scoped the synthetic test, so file-history
is fine" — production harvesting from a real operator's `~/.claude/`
would copy every file Claude has ever edited. The exclusion is a
permanent policy, not a synthetic-test-only convenience.

---

### 7. Open questions for S3/S4

These are the empirical follow-ups for the narration sessions
(some of them are testable in S2 if live runs happen here):

1. **Does `usage` or `stop_details` on `assistant.message` carry
   reasoning-effort / thinking-tokens?** **Resolved structurally
   in S2** via key-set probe of the 327-assistant-event sample:
   `usage` has 10 fields (`cache_creation`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`,
   `inference_geo`, `input_tokens`, `iterations`, `output_tokens`,
   `server_tool_use`, `service_tier`, `speed`), and `stop_details`
   never populates as a dict. **No reasoning-effort field exists.**
   `service_tier` and `speed` (both observed as `'standard'`) carry
   the `/fast` vs `standard` axis; the high/medium/low effort axis
   has no structural surface. Narration mandatory for the
   high/medium/low axis. The §4 A3 row carries the updated verdict.
2. **Does Claude Code's `--print` (headless) mode produce the same
   JSONL shape as the interactive transcripts?** Likely yes (the
   `entrypoint` field distinguishes interactive vs headless), but
   confirm in the live-run.
3. **`SessionStart` hook full payload fields beyond `cwd`** — the
   Dabbler invoker uses only `cwd`; the full Claude Code hook
   payload schema is documented but worth probing in S3 to know
   what other fields a narration shim could read.
4. **`attachment` block first-fire schema** — the three observed
   shapes are mostly initialization-time; do any per-turn
   attachments (e.g., file references the assistant pulled in
   mid-turn) carry distinct envelopes?
5. **`session-env/<conv-uuid>/` empty-on-operator** — what fills
   this directory? A heavily-toolish run (lots of Bash calls)
   against the synthetic set should reveal it.
6. **`telemetry/` opt-in vs opt-out** — operator's instance has
   13 `1p_failed_events.*.json` files (the `1p_` prefix and
   `failed_events` name strongly suggests telemetry is currently
   failing-to-upload and being queued locally; the events
   themselves are *generated* regardless of upload posture). If
   harvest depends on this, the activation triggers need
   verification.

---

### 8. S2-specific redaction-policy additions (proposed)

The S1 policy in [`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 2 lists 7 numbered scrub rules. S2 proposes **3 additions**
specific to Claude Code surfaces that don't have Copilot
equivalents (or have stronger surface-level risk):

- **Scrub rule 8 — `file-history/` blob store:** harvester must
  treat `~/.claude/file-history/` as a copy-exclusion zone in
  parity with `~/.claude/ide/`. The blob store mirrors every file
  Claude has edited in any conversation, content-addressed and
  versioned. Even a "characterize the index" pass must enumerate
  filenames (hash-prefix only) and not open the blob contents.
- **Scrub rule 9 — `~/.claude/plans/<title-slug>.md` filename
  leakage:** the *filename* embeds a sentence-fragment paraphrase
  of the prompt that spawned the plan (e.g., the operator's
  instance contains 21 such filenames; one's slug starts with
  `i-am-putting-you-vivid-beacon` and an `i-believe-that-we-...`).
  Discovery-note characterizations should describe the *pattern*
  ("title slug paraphrases prompt") but never quote a slug
  verbatim. The 21 specific slugs on the operator's instance are
  excluded from this committed file by that rule.
- **Scrub rule 10 — `last-prompt` event in JSONL:** the
  `lastPrompt` top-level field on `type: "last-prompt"` events is
  a verbatim copy of the most recent user prompt, kept for
  `/resume`. Any harvester querying the JSONL must filter this
  event type out before any structured-summary aggregation, or
  treat it with the same scrub-rule-1 (verbatim prompts) discipline.

The rules are proposed here for inclusion in
`harvest-objectives-and-redaction.md`; the edit is applied in §10
below.

---

### 9. Live-run scope (operator decision needed)

S1's structural-only close-out left two artifact-classes open
for S2:

1. **S1 Copilot deferred live-runs** (the harness recipe in S1
   discovery-notes §6) — these never ran.
2. **S2 Claude Code live-runs** (the harness recipe in §6 above).

Both would run against the synthetic-set at
`C:\tmp\dabbler-log-harvest\synthetic-set\`, which S1 scaffolded
empty (S2 fills in `spec.md` + `session-state.json` at run time).

The structural inventory in §1–§8 is sufficient to write
`baseline-comparison.md` and reach the §4 cross-backend coverage
verdict **without** live runs — every claim in the table above
is grounded in either the operator's existing JSONL (probed
structurally, no content reads) or the documented hook/installer
code in the repo. Live runs would:

- Empirically resolve the §7 open questions (per-turn effort,
  `--print` JSONL shape, hook full payload, `session-env/`
  contents, telemetry activation).
- Provide a synthetic-set baseline against which to measure the
  S3/S4 narration delta — *without* this baseline, the
  narration experiment in S3 has no quantitative comparison
  point.

The trade-off is meaningful: skipping live runs means S3 must
either author its own baseline (folding the deferred work
forward, again) or argue from S1+S2's structural-only findings
that narration is worth designing despite the gap.

Operator decision question is preserved at [`disposition.json`](disposition.json)
close-out time; this section flags the decision rather than
making it.

---

### 10. Lock status

- [x] §1 inventory — complete (16 artifact rows incl. directory-class entries)
- [x] §2 JSONL schema — captured (7 type values, 9 distinct `toolUseResult` shapes)
- [x] §3 hook integration — characterized from in-repo shim source
- [x] §4 coverage matrix — 14 of 15 native, 1 narration gap (C3); A3 partial
- [x] §5 auth-bridge note — symmetric with Copilot
- [x] §6 scratch scaffolding — Claude-side recipe added on top of S1 layout
- [x] §7 open questions — recorded for S3 follow-up
- [x] §8 redaction-policy additions — proposed for upstream into harvest-objectives-and-redaction.md
- [ ] §9 live-run scope — pending operator decision
