## Discovery Notes — Copilot CLI 1.0.51

> **Session:** 044 / S1. **Status:** structural inventory complete;
> live-run harvest deferred to S2 per operator decision 2026-05-22
> (folded into the same synthetic-set runs that will also exercise
> Claude Code).
> **Backend:** GitHub Copilot CLI 1.0.51 (Windows, `winget` install).
> **Harvest origin:** `~/.copilot/` plus runtime knobs documented by
> `copilot help monitoring` / `copilot help logging` / `copilot help
> environment`. **No live Copilot turns were driven from this session.**
> **Redaction posture:** structural-only (schemas, field names, byte
> counts). No verbatim user/assistant content has been read into the
> conversation or quoted in this file. See
> [harvest-objectives-and-redaction.md](harvest-objectives-and-redaction.md)
> for the policy.

---

### 1. Log-surface inventory (per Part 3 methodology)

| Artifact | Format | Trigger | Per-process? | Schema (top-level shape) | Surfaces signals | Redaction risk | Sample size at probe |
|---|---|---|---|---|---|---|---|
| `~/.copilot/config.json` | JSONC (`// ...` line comments accepted) | First launch + experiment-cache refresh | Shared (single file, rewritten in place) | `{firstLaunchAt: str, expAssignmentsCache: {<feature-id>: {schemaVersion, retrievedAt, response: {Features[], Flights{}, Configs[], ParameterGroups, FlightingVersion, ImpressionId, AssignmentContext}}}}` | (none of A/B/C/D directly; envelope only) | **Low** — Microsoft A/B experiment-assignment cache + first-launch timestamp. No tokens, no prompts. | 3542 bytes |
| `~/.copilot/logs/process-<pid-ts>.log` | Plain text, ISO-timestamp-prefixed (one event per line) | Process startup + per-process operational events | **Per process** (one file per `copilot.exe` invocation; filename embeds PID + epoch ms) | `<ISO timestamp> <LEVEL> <module>: <message>` | C2 (process start/stop timestamps) + sparse A5 (session-id-like UUIDs appear in messages) | Medium — operational; no prompts/responses, but may reveal install paths, model id of the active session, error stack traces with file paths | 26 lines / 2210 bytes from the operator's prior invocation; signal density per line ≈ 0.7 INFO + 0.4 ERROR + 0.04 DEBUG |
| `~/.copilot/session-state/<conv-uuid>/workspace.yaml` | YAML | Per conversation (mirror of `sessions` table row) | **Per conversation** | `{id: str, cwd: str, user_named: bool, summary_count: int, created_at: datetime, updated_at: datetime}` | A5 (id) + C2 (created/updated_at) + a partial B-flavored signal via `cwd` | Low — envelope only; the `cwd` field could pinpoint the operator's machine, but no prompt/response/file content | 175 bytes per file |
| `~/.copilot/session-state/<conv-uuid>/checkpoints/index.md` | Markdown table | Per checkpoint (`/checkpoint` command, or auto-checkpoint) | **Per conversation** | Markdown table heading + `\|---\|` separator + checkpoint rows (one per checkpoint) | Coarse-grained C3-adjacent (checkpoint boundaries inside a single conversation) | Medium — checkpoint titles could echo user intent paraphrased into the title text | 6 lines / 172 bytes on the empty/uninitialised case |
| `~/.copilot/session-state/<conv-uuid>/files/` | dir of files (probably per-file mirror of `session_files` rows) | Per file touched by the conversation | Per conversation | (empty at probe time — no observed-file mirror to characterize) | B1, B2, B3 if populated | **High** (would mirror touched-file contents) | 0 files on the operator's instance |
| `~/.copilot/session-state/<conv-uuid>/research/` | dir | Per `research`-tagged retrieval | Per conversation | (empty at probe time) | unclear | TBD on first non-empty observation | 0 files |
| `~/.copilot/session-store.db` | SQLite (FTS5 enabled) | Per turn / per file touch / per checkpoint / per session | **Shared** (single db across all Copilot CLI invocations) | See §2 for full schema. Tables: `sessions`, `turns`, `session_files`, `session_refs`, `checkpoints`, `dynamic_context_items`, `schema_version`, `search_index` (FTS5) + companions | **A1**, **A5**, **B1**, **B2**, **B3**, **C1**, **C2**, partial **C3** | **High** — `turns.user_message` and `turns.assistant_response` are the full prompt + response text; `checkpoints.work_done` / `important_files` / `next_steps` are LLM-authored prose. Tokens and OAuth credentials are not stored here. | 118784 bytes; **0 rows in all data tables on operator's instance** — schema-derived findings only |
| `~/.copilot/ide/<conv-uuid>.lock` | JSON | Per Copilot-CLI ↔ IDE-extension bridge session | Per bridge session | `{socketPath: str, scheme: str, headers: {Authorization: str}, pid: int, ideName: str, timestamp: int, workspaceFolders: [str], isTrusted: bool}` | None directly (envelope + pid) | **Critical** — `headers.Authorization` is the IDE-bridge bearer token in plaintext. **Never** copy verbatim into commits, screenshots, or scratch artifacts. | 368-381 bytes per lock, 2 observed |
| OTel JSONL export (`$COPILOT_OTEL_FILE_EXPORTER_PATH/*.jsonl`) | JSONL spans + metrics (OTel GenAI Semantic Conventions) | Per LLM call + per tool invocation + per metric measurement | Off by default (opt-in via `COPILOT_OTEL_FILE_EXPORTER_PATH` or `COPILOT_OTEL_ENABLED=true` or `OTEL_EXPORTER_OTLP_ENDPOINT`) | See §3 for the span tree + metric list | **A2** (model in span name + `gen_ai.request.model` attr), **B1** (`execute_tool <tool>` span + attrs), **C1** (every span has start/end), **C5** (span hierarchy makes pre-call vs post-call distinction explicit) | Low **without** `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` (metadata only). **High** with it (full prompts/responses/tool-args). | 0 bytes at probe (env var was unset until S1) |
| `--output-format json` stdout (when invoked with `-p/--prompt`) | JSONL on stdout (one JSON object per line) | Per prompt-mode invocation | Per process | Documented as "JSONL, one JSON object per line"; per-line shape not yet harvested — deferred to S2 representative-run characterization | Likely A2 + A5 + B1 + C1 (TBD on first capture) | High when content is included; depends on the per-line schema | Not yet captured |

---

### 2. `session-store.db` schema (the rich-signal artifact)

Schema version: 1 row in `schema_version` (value not read).

**Data tables (DDL captured verbatim from `sqlite_master.sql`; column
names only, no row values):**

```
sessions(
  id          TEXT PRIMARY KEY,
  cwd         TEXT,
  repository  TEXT,
  host_type   TEXT,
  branch      TEXT,
  summary     TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
)

turns(
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id         TEXT NOT NULL REFERENCES sessions(id),
  turn_index         INTEGER NOT NULL,
  user_message       TEXT,              -- HIGH redaction risk
  assistant_response TEXT,              -- HIGH redaction risk
  timestamp          TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, turn_index)
)

session_files(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  file_path     TEXT NOT NULL,         -- the conflict-detection signal
  tool_name     TEXT,                  -- name of the tool that touched the file
  turn_index    INTEGER,               -- when in the conversation
  first_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, file_path)
)

session_refs(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  ref_type    TEXT NOT NULL,           -- enumerable; not yet observed
  ref_value   TEXT NOT NULL,
  turn_index  INTEGER,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, ref_type, ref_value)
)

checkpoints(
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  checkpoint_number INTEGER NOT NULL,
  title             TEXT,
  overview          TEXT,
  history           TEXT,
  work_done         TEXT,
  technical_details TEXT,
  important_files   TEXT,              -- LLM-authored file-path list (parse target)
  next_steps        TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, checkpoint_number)
)

dynamic_context_items(
  repository  TEXT NOT NULL,
  branch      TEXT NOT NULL,
  src         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',  -- high-risk
  read_count  INTEGER NOT NULL DEFAULT 0,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repository, branch, src, name)
)

search_index — FTS5 virtual table over (content, session_id,
                source_type, source_id); content cells live in
                search_index_content / _data / _docsize / _idx
                companion tables.
```

**Indexes (informational):**

- `sessions(repository)`, `sessions(cwd)`
- `turns(session_id)`
- `session_files(file_path)`  ← **conflict-detection-relevant**
- `session_refs(ref_type, ref_value)`
- `checkpoints(session_id)`
- `dynamic_context_items(repository, branch)`

**The key finding:** `session_files.file_path + tool_name + turn_index`
is the schema-level evidence that Copilot CLI already tracks "which
tool touched which file on which turn" as a first-class artifact. This
is the harvest objective B1+B2+B3 in storage form, and it is **already
on by default** (no env-var opt-in like OTel requires) — provided
session continuity is enabled in the running process.

**Limitations:**

- **No engine column.** This db is Copilot-only; the engine is implicit.
- **No effort/reasoning column.** `--effort` is set per process and not
  persisted per turn or per session.
- **No model column on `turns`.** The model is on the `sessions` row's
  `host_type` *if at all*; we do not yet have an empirical row to
  inspect. May be in `summary` or only in OTel spans.
- **No "session set" column.** Dabbler's set/session id is not a
  concept Copilot knows about. `sessions.cwd` is the only natural
  proxy (matches the workspace path containing `docs/session-sets/`).
  C3 will require narration.

---

### 3. OTel export (the rich-signal opt-in)

`copilot help monitoring` documents the contract. Captured verbatim
where short and non-sensitive:

**Activation triggers** — any one of:

- `COPILOT_OTEL_ENABLED=true`
- `OTEL_EXPORTER_OTLP_ENDPOINT=<url>` (network exporter)
- `COPILOT_OTEL_FILE_EXPORTER_PATH=<file>` (JSONL file exporter)

**Span tree per agent interaction:**

```
invoke_agent                  -- top-level agent orchestration
  plan                        -- plan-mode task decomposition (only when --plan)
    chat <model>              -- LLM call inside planning
    execute_tool <tool>       -- tool call inside planning
  chat <model>                -- regular LLM API call
  execute_tool <tool>         -- regular tool invocation
```

Subagent invocations are linked into the same trace via context
propagation (so multi-step orchestration is one tree, not many).

**Span attributes** (per Copilot's own description, not yet
empirically harvested): model name, token counts, durations, costs,
error info. Likely follow `gen_ai.request.model`,
`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, etc., per
the OTel GenAI Semantic Conventions.

**Metrics emitted:**

| Metric | Type | Unit | Maps to |
|---|---|---|---|
| `gen_ai.client.operation.duration` | histogram | seconds | per-LLM-call latency |
| `gen_ai.client.token.usage` | histogram | tokens | by type (in/out/cache) |
| `github.copilot.tool.call.count` | counter | calls | B1 raw count |
| `github.copilot.tool.call.duration` | histogram | seconds | B1 latency |
| `github.copilot.agent.turn.count` | histogram | turns | per agent invocation |

**Content capture (the redaction-critical flag):**

- `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` switches
  on full-prompt + full-response + tool-args + tool-results in span
  attributes. **Off by default.**
- Set 044's stance: **leave content capture OFF**. Metadata-only
  spans are more than enough for the harvest objectives. Flipping
  content capture on would re-introduce the high-redaction-risk
  payload we explicitly excluded from Part 1 (prompt content is out
  of scope).

---

### 4. Per-harvest-objective coverage (S1 verdict)

| Objective | Native? | Surface(s) | Notes |
|---|---|---|---|
| A1 — engine name | **Implicit** — file location alone identifies Copilot | n/a | Need narration only to disambiguate when the *consumer* of the log doesn't already know it's a Copilot artifact |
| A2 — model id per turn | **Yes** via OTel (`chat <model>` span name + `gen_ai.request.model` attr); **partial** via `session-store.db` (maybe `sessions.host_type` — empirical needed) | OTel spans, possibly sessions row | OTel is the cleaner channel |
| A3 — effort / reasoning level | **No** in default surface; **maybe** in OTel under `gen_ai.request.reasoning_effort` semconv (empirical) | OTel (if at all) | Likely **needs narration** if OTel doesn't carry it |
| A4 — provider | **Implicit** (always GitHub Copilot) | n/a | Same as A1 |
| A5 — conversation/session id | **Yes** | `session-store.db sessions.id`, `workspace.yaml id`, `*.lock` filename | Multiple surfaces; pick the canonical one |
| B1 — tool calls (name + args) | **Yes** — metadata via OTel `execute_tool <tool>` spans; **structural** via `session_files.tool_name` (but no args without content-capture flag) | OTel spans, `session_files` | Args require content capture (off) |
| B2 — tool calls touching `docs/session-sets/**` | **Yes** — derivable from B1 by path filter | `session_files.file_path` + OTel | Index `session_files(file_path)` is helpful for query speed |
| B3 — tool calls touching `session-state.json` | **Yes** — derivable from B1 by exact-path match | `session_files.file_path` + OTel | The high-signal conflict-detection query |
| B4 — subprocess invocations of `start_session` / `close_session` | **Probably yes** — would be a `execute_tool <bash>` span with the command string in OTel attrs; in `session_files` it'd show as a tool call whose `tool_name` is "bash"/"shell" and whose target file is `session-state.json` indirectly | OTel + inference | Confirm in S2 live run |
| B5 — file writes that bypass the writer | **Yes** | `session_files.tool_name` + `session_files.file_path` | This is *exactly* the rule-violation signal we want — Copilot's own session store already records "the assistant wrote to this file via this tool". No narration required. |
| C1 — per-turn timestamp | **Yes** | `turns.timestamp`, OTel span start/end | Multiple surfaces |
| C2 — conversation start/end timestamp | **Yes** | `sessions.created_at` / `updated_at`, `workspace.yaml`, process log file mtime | Multiple surfaces |
| C3 — "Starting Set N Session M" boundary marker | **No** | (narration) | Copilot has no model of Dabbler sets. `sessions.cwd` is the only natural proxy, and even that doesn't disambiguate which *session* of a set is active. Narration required. |
| C4 — "Calling start_session/close_session" boundary marker | **Yes via B4** | OTel + `session_files` | If we already see B4, we already see C4 |
| C5 — pre-tool-call intent vs. post-tool-call result | **Yes** — OTel spans have explicit start/end and parent-child structure | OTel | Strongest in OTel; weaker in `session-store.db` |

**Coverage summary:** the table has 15 rows (A1-A5, B1-B5, C1-C5).
13 of 15 objectives are surfaced by Copilot natively or via the
documented OTel opt-in: 9 unambiguous "Yes" (A2, A5, B1, B2, B3, B5,
C1, C2, C5), 2 "Implicit" (A1, A4 — derivable from file location
because the Copilot log surface itself identifies the engine), 1
"Probably yes" pending S2 empirical confirmation (B4 — `bash` tool
spans carrying the `start_session`/`close_session` argv), and 1
"Yes via B4" derivative (C4). Only **A3 (effort)** and **C3
(set/session marker)** unambiguously require narration. A3 may
still be cheap to extract from OTel if Copilot's implementation
populates `gen_ai.request.reasoning_effort` (TBD in S2); C3 is the
structural one — it's Dabbler-specific and no Copilot surface knows
what a session set is, so narration is the only path.

**Bottom-line for the proposal in S5:** the harvest hypothesis is on
much firmer ground for Copilot than the spec assumed. The native
session store *already* contains the (session_id, file_path, tool_name,
turn_index, timestamp) tuple a conflict watcher would need. The only
structural gap is the Dabbler-set boundary marker, which is a known
narration target (C3) and which the narration experiment in S3 can
test cheaply.

---

### 5. Authentication-bridge security note

`~/.copilot/ide/<uuid>.lock` files contain `headers.Authorization` in
plaintext — the bearer token used by the Copilot CLI ↔ IDE-extension
bridge. Two such files exist on the operator's machine. The harvest
discipline in Part 2 of `harvest-objectives-and-redaction.md` already
mandates `<TOKEN_ELIDED>` for any verbatim quote, but the existence of
these files is worth flagging on its own as a security observation:

- They are short-lived (cleaned up when the bridge disconnects),
  not long-lived.
- They live under `~/.copilot/ide/`, which is **not** in any standard
  back-up exclusion list (e.g., Windows Backup, iCloud-on-Windows,
  OneDrive sync).
- A log-harvester implementation that copies the entire `~/.copilot/`
  tree into scratch would copy these tokens. The Set 044 scratch
  layout therefore **explicitly excludes** `~/.copilot/ide/` from any
  copy-to-scratch operation; see the S2 harness in §6.

---

### 6. Scaffolding for S2's live runs

Per operator decision 2026-05-22, the live-run portion of the Copilot
harvest is folded into S2 alongside the Claude Code live runs. S1
leaves the following ready for S2 to consume:

**Scratch layout, created in S1:**

```
C:\tmp\dabbler-log-harvest\
├── otel\                          # OTel JSONL exporter target
├── s1-baseline-copilot\           # (reserved; will be empty unless S2 promotes to S1-equivalence)
├── s2-baseline-claude\            # (this set's S2 deliverable)
├── s3-narration-copilot\          # (Session 3)
├── s4-narration-claude\           # (Session 4)
└── synthetic-set\                 # the synthetic session-set tree
    └── docs\session-sets\001-synthetic-harvest-target\
```

**Synthetic-set seed content (S2 to author at run time):**

- `001-synthetic-harvest-target/spec.md` — a minimal 2-session spec
  with deliberately-fake content (no real Dabbler nomenclature, no
  real third-party names).
- `001-synthetic-harvest-target/session-state.json` — schema-v3 state
  at `status: "not-started"`, `completedSessions: []`.
- No `change-log.md`, no UAT checklist, no other artifacts.

**S2 harvest harness (recipe S2 should run, redacted for the
recipe-form only — no live runs in S1):**

```powershell
# Per the S1 redaction policy: harvest scratch is gitignored;
# nothing in C:\tmp\dabbler-log-harvest\ enters the repo verbatim.

$env:COPILOT_HOME = "C:\tmp\dabbler-log-harvest\copilot-home"     # isolated from operator's real ~/.copilot
$env:COPILOT_OTEL_FILE_EXPORTER_PATH = "C:\tmp\dabbler-log-harvest\otel\copilot-baseline.jsonl"
# OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT — leave UNSET (off)

# Three representative invocations against the synthetic set:
#   1. interactive: read spec.md, summarize, exit
#   2. prompt-mode --output-format json: "what is in this session set?"
#   3. prompt-mode with a tool-call: "create a note file at notes.md saying 'hello'"
copilot --add-dir C:\tmp\dabbler-log-harvest\synthetic-set --log-level info --log-dir C:\tmp\dabbler-log-harvest\s2-baseline-claude\copilot-process-logs (rest of args)

# After each invocation, snapshot the touched surfaces:
#   $COPILOT_HOME\config.json
#   $COPILOT_HOME\logs\process-*.log
#   $COPILOT_HOME\session-state\<uuid>\
#   $COPILOT_HOME\session-store.db  (cp + sqlite3 .dump)
#   $env:COPILOT_OTEL_FILE_EXPORTER_PATH (rotate per invocation)
# Do NOT snapshot $COPILOT_HOME\ide\  (token-bearing locks)
```

**Synthetic-set creation script:** the `synthetic-set/` tree is
seeded in S1 as an empty directory hierarchy; S2 fills in `spec.md`
and `session-state.json` at run time so it can also vary the synthetic
content between baseline (S2) and narration (S3) runs.

---

### 7. Open questions for S2/S3

1. **Does `sessions.host_type` contain the model id, or just the
   bridge type ("ide" / "cli")?** Empirical answer pending S2's first
   non-empty turn.
2. **Does OTel carry the reasoning-effort attribute when
   `--effort high` is passed?** Pending S2; if no, A3 narration
   becomes mandatory for the proposal.
3. **`--output-format json` JSONL stdout schema** — not documented in
   `copilot help`; needs first-capture characterization in S2.
4. **`session_refs.ref_type` enumeration** — what values populate
   this column? (Conversation references, file refs, MCP server
   refs?). Empirical answer pending.
5. **`dynamic_context_items.content` redaction risk** — likely
   contains file excerpts; needs verification on first non-empty row.
6. **Process-log signal density for tool calls** — keyword probe in
   §1 showed 0 `tool_call`/`toolCall`/`tool_use` matches in the
   operator's 26-line empty-state log. A live-run log will tell us
   whether tool-call structure is logged here too, or whether the
   process log is purely operational.
