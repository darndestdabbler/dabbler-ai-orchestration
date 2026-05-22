## Baseline Comparison — Claude Code 2.1.63 vs. Copilot CLI 1.0.51

> **Session:** 044 / S2. **Companion to:**
> [`discovery-notes-copilot.md`](discovery-notes-copilot.md) (S1) and
> [`discovery-notes-claude.md`](discovery-notes-claude.md) (S2).
> **Method:** structural-only across both backends (no live runs;
> S2's live runs deferred to S3 per operator decision 2026-05-22).
> **Reading order:** §1 for the headline verdict, §2 for the
> harvest-objective comparison, §3 for cross-backend invariants
> and divergences, §4 for what's testable without narration and
> what isn't, §5 for the S3 narration-design implications.

---

### 1. Headline verdict

**Both backends already surface the (conv-id, file-path, tool-name,
turn-index, timestamp, engine, provider) tuple a conflict watcher
needs.** They surface it through different artifacts — Copilot
through `~/.copilot/session-store.db` (always-on SQLite, schema-
captured in S1 §2) plus OTel JSONL (opt-in), Claude through
`~/.claude/projects/<slug>/<conv-uuid>.jsonl` (always-on per-turn
events, schema-captured in S2 §2). The set of objectives that
*remain* narration-only is identical on both backends:

- **A3** (per-turn effort/reasoning level) — partial on both;
  process-scope on Claude (`~/.claude/settings.json effortLevel`),
  TBD-in-OTel on Copilot. Likely narration-required.
- **C3** (Dabbler set/session boundary marker) — structural gap
  on both. Narration-required.

Everything else is native on at least one Claude surface AND on at
least one Copilot surface. This is the strongest single finding
of Sets 044's structural pass: **the harvest hypothesis is on
solid ground for both backends, and the *narration* design problem
reduces to "design narration for two signals" rather than "design
narration for 5+ signals plus opt-in plumbing for every other
signal".**

This is a narrower claim than "the *overall* design problem reduces
to two signals." The remaining harmonization work — the focus of
the S5 proposal — addresses the asymmetric **availability** of
signals that *are* native on both but appear in different forms:
Claude inlines tool arguments and tool-results by default; Copilot
gates the same content behind
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`. A
harvester that wants "tool args" must either flip the OTel flag on
Copilot (heightening redaction surface) or accept envelope-only
Copilot data and reconcile against Claude's inline data (different
shape per backend). Same architectural choice applies to B5
(Claude full diff vs Copilot tool_name+filepath only) and C5
(Claude explicit pointer vs Copilot span tree). The S5 proposal
must specify *which* path it takes; the narration design in S3
does not solve that piece.

---

### 2. Per-objective coverage, side by side

15 objectives total (A1–A5 identity, B1–B5 action, C1–C5
boundary). Cells use S1's and S2's existing verdicts verbatim
where they exist, with **=** highlighting symmetry and **≠**
highlighting divergence.

| # | Objective | Copilot (S1 §4) | Claude (S2 §4) | Symmetric? |
|---|---|---|---|---|
| A1 | Engine name | Implicit (file location identifies Copilot) | Implicit (file location identifies Claude) | **=** |
| A2 | Model id per turn | Yes via OTel (`gen_ai.request.model` per `chat <model>` span); partial via `session-store.db sessions.host_type` (empirical TBD) | **Yes**, every assistant event: `assistant.message.model` | **≠** *Claude stronger* (per-turn, no opt-in, no TBD) |
| A3 | Effort / reasoning level | Maybe in OTel `gen_ai.request.reasoning_effort` (empirical TBD pending S3 Copilot live runs) | **Partial, empirically narrowed in S2**: `usage.service_tier` + `usage.speed` carry the `/fast`-vs-`standard` axis; high/medium/low effort axis confirmed absent from `usage` (10 fields enumerated) and `stop_details` (empty). Narration mandatory for high/medium/low only. | **≠** *Claude side empirically resolved; Copilot still TBD* |
| A4 | Provider | Implicit (always GitHub Copilot) | Implicit (always Anthropic) | **=** |
| A5 | Conv / session id | Yes — `session-store.db sessions.id`, `workspace.yaml id`, `*.lock` filename | **Yes**, on every JSONL event: `sessionId` top-level | **≠** *Claude stronger* (every line, not just session row) |
| B1 | Tool calls (name + args) | Names yes (`session_files.tool_name`, OTel `execute_tool <tool>` spans); args ONLY with `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` (off by default) | **Yes, inline by default**: `assistant.message.content[tool_use]` carries `name` + `input` | **≠** *Claude stronger* (args are inline; Copilot needs opt-in for args) |
| B2 | Tool calls touching `docs/session-sets/**` | Derivable from B1 (path filter on `session_files.file_path`) | Derivable from B1 (path filter on `toolUseResult.filePath` or `tool_use.input`) | **=** |
| B3 | Tool calls touching `session-state.json` | Derivable from B1 (exact-match) | Derivable from B1 (exact-match on `toolUseResult.filePath`) | **=** |
| B4 | Subprocess invocations of `start_session` / `close_session` | Probably yes — Bash/shell tool span carrying the argv (empirical TBD in S3 live run) | **Yes** — Bash tool_use with `input.command` matching `ai_router.start_session`/`ai_router.close_session`; matching Bash result in `toolUseResult` | **≠** *Claude confirmed; Copilot TBD* |
| B5 | File writes that bypass the writer | Yes — `session_files(file_path, tool_name)` records which tool touched which file; "Copilot wrote to `session-state.json` via Edit" is queryable | **Yes** — `toolUseResult` (Edit-shape) carries `filePath` + `oldString` + `newString` + `structuredPatch` per Edit; full inline diff | **≠** *Claude stronger* (full diff inline; Copilot has touch metadata but no inline content) |
| C1 | Per-turn timestamp | Yes — `turns.timestamp`, OTel span start/end | Yes — every JSONL event carries `timestamp` | **=** |
| C2 | Conv start/end timestamp | Yes — `sessions.created_at` / `updated_at`, `workspace.yaml`, process-log mtime | Yes — first/last JSONL `timestamp` + `~/.claude/sessions/<pid>.json startedAt` + file mtime | **=** |
| C3 | "Starting Set N Session M" boundary marker | **No** — narration | **No** — narration | **=** *narration required, symmetric gap* |
| C4 | "Calling start_session/close_session" marker | Yes via B4 | Yes via B4 (confirmed in this set's S2 transcript) | **=** |
| C5 | Pre-tool-call intent vs post-tool-call result | Yes — OTel span hierarchy (parent-child) | **Yes** — explicit linked events: `assistant.tool_use` event ↔ `user.toolUseResult` event with `sourceToolAssistantUUID` pointer | **≠** *Claude stronger* (explicit pointer, no span-tree reconstruction needed) |

**Symmetry tally:** 9 symmetric rows. 6 divergent rows, **all in
Claude's favor** for native-signal richness (A2, A5, B1, B4, B5,
C5). The reverse case — Copilot stronger than Claude on some
signal — does not appear in the table.

**Methodology caveat for the asymmetry claim.** The S2 Claude
investigation read structural metadata from the operator's
**populated** instance — 31 project slugs and 121 transcripts for
this repo alone, a non-empty `~/.claude/`. The S1 Copilot
investigation read against an essentially **empty** Copilot
instance: 0 rows in every `session-store.db` data table, 0 files
under `session-state/<uuid>/files/`, 0 captured OTel JSONL spans.
S1's verdicts on Copilot are therefore weighted heavily toward
*schema-and-documentation* evidence, while S2's verdicts on Claude
have both *schema* evidence AND *empirical population* (key-set
counts, distinct-type enumeration over real events). Some portion
of the "Claude stronger" divergence likely reflects this
methodology asymmetry: a populated Copilot instance might surface
B4 argv content in OTel attrs (currently TBD), a per-turn model id
on `sessions.host_type` (currently TBD), and a `reasoning_effort`
attribute on `chat <model>` spans (currently TBD). The deferred
S1-Copilot live runs in S3 will close most of these TBDs — the
"all 6 favor Claude" tally should be revisited at S3 close to
distinguish *backend asymmetry* from *probe-fidelity asymmetry*.

---

### 3. Cross-backend invariants and divergences

#### 3.1 Invariants (true on both backends)

- **Always-on per-turn structured log surface.** Both backends
  emit a structured, per-turn artifact by default (no opt-in env
  var, no settings flag): Copilot's `session-store.db`, Claude's
  `<conv-uuid>.jsonl`. The harvester does not need to ship a
  configuration step to "turn on" logging on either backend — it
  can read what's already there from a fresh install.
- **IDE-bridge lockfiles with plaintext auth tokens.** Both
  backends use the same IDE-bridge pattern: `~/.copilot/ide/*.lock`
  with `headers.Authorization`, `~/.claude/ide/*.lock` with
  `authToken`. The redaction-exclusion zones are symmetric.
- **OAuth credential storage at well-known paths.** Both have a
  long-lived credential file (Claude: `.credentials.json`;
  Copilot: per Copilot CLI docs, in `~/.copilot/` or equivalent).
  Exclude from any harvester copy operation; never read into
  conversation context.
- **C3 narration-required.** Neither backend models Dabbler
  session sets natively. Both expose project-workspace-path
  surrogates (`sessions.cwd` / project `<slug>`) but neither knows
  which session of which set the assistant believes itself to be
  in. The S3 narration design has to design exactly one signal
  on this dimension and apply it to both.

#### 3.2 Divergences

##### 3.2.1 Inline-by-default vs opt-in for args

The single biggest signal-availability divergence: **Claude
inlines tool arguments and tool results in the JSONL by default**;
Copilot only inlines args/results in OTel when
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` (off by
default). The flip side: Copilot's default is *less* redaction-
risky for accidental harvesting; Claude's default produces a
high-redaction-risk artifact that must be carefully not-copied.

A harvester implementation that targets "the smallest viable
proof on Copilot" (per S5/S6 scope, mirroring the Set 039 precedent
of starting with one backend) can deliberately leave Copilot's
content-capture flag OFF, work from envelope-only signals
(`session_files`, OTel metadata spans), and never even see prompt
text. The same harvester targeting Claude must do extensive
scrubbing on the way *out* of the JSONL because content-capture is
not optional there — the structured per-turn artifact *is* the
content-bearing surface.

##### 3.2.2 Explicit event link vs implicit span hierarchy

C5 (pre/post tool-call distinction) is structurally cleaner on
Claude: the `user.toolUseResult.sourceToolAssistantUUID` field is
a direct back-pointer to the `assistant.tool_use` block that the
result is responding to. Copilot's equivalent is OTel span
parent-child structure (`invoke_agent → chat <model> → execute_tool
<tool>`), which is also unambiguous but requires span-tree
reconstruction at the consumer.

##### 3.2.3 Rollback artifact heaviness

Claude's `~/.claude/file-history/<conv-uuid>/<hash>@v<N>`
content-addressed blob store has **no Copilot equivalent**.
Copilot's `~/.copilot/session-state/<uuid>/files/` is documented
but was empty on the operator's instance (S1 §1); even if
populated, the file-mirror pattern would be similar but probably
lighter than Claude's. The asymmetric implication: a harvester
that "copies the assistant's home directory" pulls dramatically
more sensitive content on Claude than on Copilot, biasing the
S5 proposal toward a **read-in-place + project-to-summary**
posture over a copy-then-process posture.

##### 3.2.4 Hook integration shape

Copilot CLI does not document a Dabbler-equivalent hook event.
Claude Code does (`SessionStart`, others), and the Dabbler
extension already ships
[`claude-session-start-invoker.js`](../../../tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js)
that walks up to the in-progress set and invokes
`ai_router.start_session`. The hook *itself* doesn't add JSONL
signal — but it does mean a future narration mechanism on the
Claude side has a documented insertion point that doesn't exist on
the Copilot side. If the S5 proposal wants narration to be
*automatic* rather than instruction-driven (i.e., narrator script
fires regardless of model behavior), Claude has a hook surface
for it and Copilot does not.

##### 3.2.5 Telemetry shape

Claude has a built-in `~/.claude/telemetry/` JSONL exporter that
emits `ClaudeCodeInternalEvent` envelopes with per-event
`event_name`/`session_id`/`model`/`client_timestamp` — useful for
A2/A5/C1 in a *separate* artifact from the JSONL (16 distinct
event names observed in operator's `1p_failed_events.*.json`
files). Copilot's telemetry equivalent is the OTel exporter, which
is opt-in. **Telemetry is a third native surface on Claude
beyond JSONL + sessions/**, but it's a *failed-events queue* in
the operator's current state — meaning these are local-only
records waiting for upload retry. Worth confirming in S3 whether
telemetry runs at all when there's no network connectivity to the
1p endpoint.

---

### 4. What's testable without narration; what isn't

#### 4.1 Testable today (no narration, just native surfaces)

A conflict-detection watcher built today against the native logs
of either backend can reliably surface:

- **"Two different engine+provider holders touched the same
  `session-state.json` within the last N minutes."** — requires
  C1 (timestamp) + A1+A4 (engine+provider) + B3 (touch of the
  exact path). All native on both backends.
- **"A non-writer tool wrote `session-state.json`."** — requires
  B5 (filepath + tool name from the result envelope). Native on
  both (Claude has full diff inline; Copilot has tool_name +
  filepath without content).
- **"Did the assistant call `start_session` before any other
  tool that touched `docs/session-sets/<slug>/`?"** — requires
  B4 + B1 + C1 ordered by timestamp. Native on both.
- **"Per-conversation chronology of which tool touched which
  file."** — requires B1 + B2 + C1. Native on both.

#### 4.2 Not testable without narration

- **"Which session of which session set is the assistant
  currently in?"** — requires C3, which no native surface on
  either backend exposes. The closest native surrogate
  (workspace cwd / project slug) only narrows it to "this is
  the dabbler-ai-orchestration workspace" — not "this is
  044 Session 2 vs 045 Session 1".
- **"What reasoning effort did this turn use?"** — requires A3
  per-turn. Process-scope on Claude (`effortLevel`), unknown on
  Copilot (TBD in OTel). May be cheap to derive from the OTel
  side once empirically resolved; otherwise narration.

The list of "not testable today" is short and narrowly scoped —
which is exactly what makes the harvester proposal in S5 worth
writing.

---

### 5. Implications for the S3 narration design

The narration design in S3 should target **exactly two signals**
applied identically on both backends:

1. **C3 — set/session boundary marker.** Format candidates: a
   structured prefix marker in the assistant's first message of
   each session ("Set 044 / Session 2"), a JSON-line emitted at
   session-start via a pre-tool-call hook on Claude (and an
   equivalent in-prompt instruction on Copilot), or a free-form
   announcement that the narration parser keys off. The S3
   design call should pick one format and apply it identically
   to both backends, so the parser code is one function.

2. **A3 — per-turn effort marker (conditional).** If empirical
   S3 confirms `gen_ai.request.reasoning_effort` populates in
   OTel for Copilot and `usage.reasoning_tokens` (or a sibling
   field) populates in Claude's `assistant.message.usage`, A3
   becomes native and narration is not needed. If neither
   surfaces it natively, S3 needs to design a per-turn narration
   signal — but unlike C3, this one has weaker stakes (the
   conflict-detection triple in §1 doesn't include A3; effort is
   nice-to-have for the Explorer's accordion gauges, not a
   gating signal for conflict prevention).

Anything *beyond* these two would be scope creep relative to the
problem the launch-adapter approach (Sets 037-041) was solving.
The S3 design should resist adding narration for B5 (Claude
already shows full diff; Copilot already shows tool name +
filepath), for B4 (both confirm), for A2 (both per-turn), etc.

**However:** the "narration design = two signals" scope reduction
is NOT the same as the "harvester design = two signals" scope
reduction. The asymmetric **availability** of inline-vs-envelope
signals across backends (B1 args, B5 diff content, C5 link shape)
is a *harvester-architecture* problem that the S5 proposal must
resolve — it is orthogonal to S3's narration scope. Examples the
S5 author should expect to weigh in on:

- Do we flip Copilot's content-capture flag ON so both backends
  produce inline-content signal (heightening redaction), or leave
  it OFF and design the conflict watcher to accept different
  data shapes per backend?
- Do we extract `structuredPatch` from Claude's `toolUseResult`
  for B5, or just `filePath + tool_name` to keep parity with
  what Copilot natively exposes?
- Does the consumer code reconstruct OTel spans into the same
  shape as Claude's linked events, or maintain two adapters?

These are S5 questions, not S3 questions, but flagging them here
prevents the S3 narration design from accidentally taking on
scope that belongs in S5.

---

### 6. Risk and asymmetry summary for S5

When S5 writes the proposal, the following asymmetries should
shape "what we'd build first, in what order":

| Asymmetry | Implication |
|---|---|
| Copilot defaults to envelope-only; Claude defaults to inline content | Copilot-first POC keeps the redaction-risk surface area small and lets the team gain harvester experience on the safer backend |
| Claude has a hook surface (`SessionStart`); Copilot does not | Automatic narration scripting is feasible on Claude but harder on Copilot; if narration becomes critical, this drives backend-priority differently |
| Claude's `file-history/` blob store is a heavy redaction surface; no Copilot equivalent | Harvester architecture should be *read-in-place + project-to-summary*, not *copy-then-process*. This is the strongest single architectural constraint emerging from the comparison |
| Both have IDE lock-files with plaintext auth | Standard exclude-list pattern; one allowlist of paths to copy, never a denylist |
| Symmetric A3/C3 narration gap | The narration script is one design applied to two backends |

---

### 7. Open empirical questions inherited from S1 + S2 §7

These remain TBD pending S3's live runs against the synthetic
set. None blocks the §1–§5 verdict above.

1. Does Copilot's OTel carry `gen_ai.request.reasoning_effort`
   when `--effort high`? (S1 §7 Q2)
2. Does Claude's `assistant.message.usage` carry a thinking-
   tokens / effort field? (S2 §7 Q1)
3. Does Copilot's `sessions.host_type` contain the model id?
   (S1 §7 Q1)
4. `--output-format json` JSONL schema on Copilot. (S1 §7 Q3)
5. Claude `--print` (headless) JSONL parity with interactive.
   (S2 §7 Q2)
6. Claude `SessionStart` hook payload fields beyond `cwd`.
   (S2 §7 Q3)
7. Claude `session-env/<conv-uuid>/` population trigger. (S2 §7 Q5)
8. Copilot `session_refs.ref_type` enumeration. (S1 §7 Q4)
9. Claude telemetry activation triggers (the operator's
   `1p_failed_events` queue suggests it runs even when uploads
   fail; confirm). (S2 §7 Q6)

---

### 8. Lock status

- [x] §1 headline verdict — locked
- [x] §2 per-objective side-by-side — 15 rows mapped
- [x] §3 invariants + divergences — 5 divergences enumerated
- [x] §4 testable-today vs needs-narration — split locked
- [x] §5 narration design implications — two-signal scope for S3
- [x] §6 risk/asymmetry summary — feeds S5 proposal
- [x] §7 open empirical questions — 9 questions deferred to S3 live runs
