## Claude Narration Results — Set 044 / Session 4b

> **Session:** 044 / S4b. **Date:** 2026-05-22. **Method:** matched
> live runs against `c:\tmp\dabbler-log-harvest\synthetic-set\`
> driven by `claude -p` headless mode under
> [`narration-design.md`](narration-design.md) v1 LOCKED contract.
> **Status:** results captured; cross-backend synthesis is in
> [`cross-backend-synthesis.md`](cross-backend-synthesis.md).
> **Companion docs:** [`narration-design.md`](narration-design.md) is
> the contract under test; [`copilot-narration-results.md`](copilot-narration-results.md)
> is the S4a matched experiment whose Claude-baseline sidebar (§9)
> S4b consumes; [`baseline-comparison.md`](baseline-comparison.md) §5
> sets the two-signal narration scope (C3 mandatory, A3 conditional).

---

### 1. Headline result up front

Claude's response to the v1 narration contract is **not** the simple
"complied" or "refused" that the design implicitly assumed. Across
three matched runs (one baseline + two narrated):

| Run | CLAUDE.md present | CLAUDE.md framing | Marker(s) emitted by Claude |
|---|---|---|---|
| Baseline (`...555001`) | NO | — | 0 (expected) |
| Narrated v1 (`...555002`) | YES | "synthetic harvest target / NOT a real project / harvesting hooks" | **0 valid markers — Claude refused the contract**, citing prompt-injection concerns, and emitted a refusal-with-flag instead |
| Narrated v2 (`...555003`) | YES | reframed as a normal project convention (no "synthetic" / "harvest" / "NOT a real project" language) | **1 valid `phase=session-start` marker; 0 `phase=turn` markers despite explicit Branch B instruction** |

The two findings — **phrasing-sensitive refusal** and **per-turn
skip even on the reframed run** — together mean Branch B narration on
Claude is materially less reliable than the Copilot S4a result. S5's
proposal must take this into account; see §10 and the cross-backend
synthesis.

---

### 2. Run setup (held constant per design §8.1)

All three Claude runs operated against the same workspace, same
synthetic-set, same task battery, same env, same `--effort` level,
same model. Treatment differences are scoped to the presence and
phrasing of the scratch `CLAUDE.md` file.

| Constant | Value |
|---|---|
| Claude Code CLI version | 2.1.63 |
| Driver flags | `claude -p --output-format text --permission-mode bypassPermissions` |
| Workspace | `c:\tmp\dabbler-log-harvest\synthetic-set\` |
| Synthetic session-set | `001-synthetic-harvest-target` (2 sessions, reset to `not-started` before each run) |
| Model | `claude-sonnet-4-6` (explicit `--model`) |
| Effort | `medium` (S4a baseline used implicit; v1/v2 narrated CLAUDE.md states `effort=medium` and the CLI default applied — see §7.5) |
| Session ID | `--session-id` fixed per run (`...555001` baseline / `...555002` narrated v1 / `...555003` narrated v2) |
| `AGENTS.md` | absent during the Claude runs (S4a Copilot AGENTS.md was moved aside to `AGENTS.md.copilot-stashed` to prevent accidental cross-channel pickup) |
| Environment scrub | `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u VSCODE_INJECTION -u VSCODE_PID -u ELECTRON_RUN_AS_NODE` (required to bypass Claude Code's nested-session guard when launched from another Claude Code instance — memory: `project_electron_launch_env_pollution`) |
| Task battery | identical 5-task prompt (same as S4a Copilot — see §3) |

#### 2.1 Treatment differences across the three runs

| Aspect | Baseline (`...555001`) | Narrated v1 (`...555002`) | Narrated v2 (`...555003`) |
|---|---|---|---|
| `CLAUDE.md` present | NO | YES | YES |
| Phrasing | n/a | Mirrored S4a AGENTS.md style verbatim: "Synthetic Harvest Target — Agent Instructions", "NOT a real project", "session marker discipline", same template as v1 design §7.2 with concrete values `set=001-synthetic-harvest-target session=2 total=2 effort=medium`, Branch B (per-turn markers ACTIVE) | Reframed as a normal project convention: "Project Instructions", no "synthetic" / "harvest" / "NOT a real" / "harvesting" language, same marker template + same concrete values + same Branch B activation |

#### 2.2 Pre-run reset

`docs/session-sets/001-synthetic-harvest-target/session-state.json`
was restored to its pristine `not-started` shape before each run
(snapshot at `/tmp/synthetic-state-pristine.json`), so the task-4
file-edit observation was symmetric across all three runs.

---

### 3. Task battery

The exact 5-task prompt used in S4a Copilot, reused verbatim. The
mapping to Part 1 harvest objectives (B1/B2/B3/B4/B5/C1/C5) is
identical and is not repeated here — see
[`copilot-narration-results.md`](copilot-narration-results.md) §3.

Task completion was identical across all three Claude runs (file
edit landed; bash subprocess produced `ModuleNotFoundError: No module
named 'ai_router'` because the subprocess's Python env doesn't have
`dabbler-ai-router` installed — the failure shape is incidental to
the B4 signal and reproduces the S4a Copilot finding).

---

### 4. Run inventory

| Run | JSONL path | Events | Bytes |
|---|---|---|---|
| Baseline | `~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/...555001.jsonl` | 17 | 21,055 |
| Narrated v1 (refused) | `~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/...555002.jsonl` | 20 | 30,570 |
| Narrated v2 (reframed) | `~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/...555003.jsonl` | 20 | (similar magnitude) |

All three JSONLs are operator-local under `~/.claude/projects/`; not
committed per [`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 2 redaction policy.

Note: the file-history-snapshot events inside the JSONLs reference
content-addressed blobs in `~/.claude/file-history/` (scrub-rule 8 in
Part 2 §1). The JSONLs themselves are fair game for structural-metadata
characterization, but the blob contents are not opened in this work.

---

### 5. Quantitative delta

#### 5.1 Event composition (per JSONL)

| Event kind | Baseline | Narrated v1 | Narrated v2 |
|---|---|---|---|
| Total events | 17 | 20 | 20 |
| `user.string` | 1 | 1 | 1 |
| `user.tool_result` | 5 | 5 | 5 |
| `assistant.thinking` | 1 | 1 | 1 |
| `assistant.text` | **1** | **4** | **4** |
| `assistant.tool_use` | 5 | 5 | 5 |
| `file-history-snapshot` | 2 | 2 | 2 |
| `queue-operation` | 2 | 2 | 2 |

**Δ structural observation:** both narrated runs produce **3 more
`assistant.text` events** than the baseline (4 vs 1). The
`assistant.thinking`, `assistant.tool_use`, and `user.tool_result`
counts are identical across all three runs. The narrated runs split
the assistant's prose across more event boundaries — partly because
the narration instruction triggers the marker as a leading text
event (real or in v1's case refusal), partly because the model
emits per-task running commentary that the baseline collapses into
its single final-summary text event. N=1 per condition; this is a
descriptive observation, not a generalizable invariant.

**Caveat on v1 vs v2:** v1's first text event is a 385-character
refusal narrative; v2's first text event is the 144-character marker
+ "Let me run tasks 1–4 in parallel" preamble. The 4-event count is
the same; the *content* of those events differs sharply.

#### 5.2 Assistant text-event lengths (chars)

| Event index | Baseline | Narrated v1 (refused) | Narrated v2 (reframed) |
|---|---|---|---|
| event[5] (first text) | n/a (no early text event) | 385 (refusal narrative) | 144 (marker + short preamble) |
| event[12] | n/a | 37 (task transition) | 37 (task transition) |
| event[16] | n/a | 11 (task transition) | 11 (task transition) |
| event[19] (final summary) | 862 (only text event) | 1048 (results + refusal footer) | 804 (results only) |
| Baseline-only text event | 862 (event[16] — only assistant.text) | — | — |

**Observation:** the two short transition events at event[12] and
event[16] are byte-identical across v1 and v2 (37 chars and 11 chars
respectively). The narration instruction does NOT change the model's
inter-task transition prose; it only changes the FIRST text event
(marker vs refusal) and the LAST text event (results+footer vs
results-only).

#### 5.3 Tool sequence

| Position | Baseline | Narrated v1 (refused) | Narrated v2 (reframed) |
|---|---|---|---|
| 1 | `Bash` (ls workspace root) | `Bash` (ls workspace root) | **`Glob`** (workspace pattern) |
| 2 | `Read` (spec.md) | `Read` (spec.md) | `Read` (spec.md) |
| 3 | `Read` (session-state.json) | `Read` (session-state.json) | `Read` (session-state.json) |
| 4 | `Edit` (session-state.json) | `Edit` (session-state.json) | `Edit` (session-state.json) |
| 5 | `Bash` (`python -m ai_router.start_session --help`) | `Bash` (same) | `Bash` (same) |

**Δ observation:** baseline and v1 use the same tool sequence
(`Bash, Read, Read, Edit, Bash`). v2 substitutes `Glob` for `Bash`
on the first task. With N=1 per condition, the `Glob`-vs-`Bash`
swap is consistent with normal LLM sampling non-determinism on a
task that admits multiple valid tools ("list files" can be done
with either) and is **not narrated-vs-baseline correlated** — both
narrated runs and the baseline use different tools across the three
runs. Flagged for §7 follow-up.

#### 5.4 Marker landing (per design §5.2 parser output shape)

| Location | Baseline | Narrated v1 (refused) | Narrated v2 (reframed) |
|---|---|---|---|
| Substring matches for `\[DABBLER-NARRATION[^\]]*\]` (raw regex) | 0 | **1** (the literal `[DABBLER-NARRATION ...]` substring inside the refusal narrative — value position is the ellipsis literal, not concrete substituted values) | **1** (verbatim marker at event[5]) |
| Records that pass §5.5 placeholder-leakage + required-field check (valid `phase=session-start` or `phase=turn` records) | 0 | **0** (the v1 substring contains literal `...` ellipsis as the value space — fails required-field extraction; parser tags `parse_error: true`) | **1** (`phase=session-start set=001-synthetic-harvest-target session=2 total=2 effort=medium` — concrete, all required keys, no placeholder leakage) |
| `phase=turn` markers (Branch B expected) | n/a | 0 (refused) | **0 (despite explicit Branch B instruction in CLAUDE.md)** |

**Two distinct phenomena:**

1. **The v1 phantom: regex catches the substring `[DABBLER-NARRATION ...]`
   that Claude wrote into its refusal narrative as a quoted reference
   to what it was refusing to emit.** This is the §5.4 parser-skip
   case in a different form than S4a's Copilot result (where the
   phantoms were AGENTS.md template echoes inside
   `gen_ai.system_instructions`). On Claude, the phantom is inside
   the assistant's own text content — there is no separate
   parser-skip surface to drop it via. The defense is the §5.5
   placeholder-leakage / required-field check: the `...` ellipsis
   fails the field-extraction regex, so the parser tags it
   `parse_error: true` and emits no valid record. The defense is
   sufficient for this specific failure shape.
2. **v2's session-start-only compliance: Claude emitted the
   `phase=session-start` marker correctly on turn 0 but did NOT
   emit any of the 3 expected `phase=turn` markers on subsequent
   text events — even though the CLAUDE.md explicitly stated
   Branch B was active and per-turn markers were required.** The
   model appears to treat the per-turn instruction as redundant or
   cosmetic after the session-start marker, and silently drops it
   from subsequent text events.

#### 5.5 Native A3 reasoning-effort surface

| Field | Baseline | Narrated v1 | Narrated v2 |
|---|---|---|---|
| `usage.service_tier` | `standard` on every assistant event | same | same |
| `usage.speed` (on `server_tool_use`-bearing events only) | `standard` | `standard` | `standard` |
| Any reasoning-axis field (e.g., `reasoning_effort`, `reasoning.output_tokens`, `reasoning.budget`) | **ABSENT** | **ABSENT** | **ABSENT** |

**Confirms design §6.3 default Branch B for Claude is still
correct:** Claude's `usage` block does NOT log the
`--effort medium` value anywhere. The reasoning axis is genuinely
native-gap on Claude, and the narration's `effort=medium` key is
the only mechanism the design has for surfacing it. But the v2 run
shows Branch B's per-turn marker discipline is unreliable on Claude
(0/3 turn markers emitted) — meaning even when Claude complies with
the session-start marker, the reasoning axis is captured only ONCE
per session, not per-turn, contrary to the Branch B design.

#### 5.6 Token usage

| Metric | Baseline | Narrated v1 | Narrated v2 |
|---|---|---|---|
| Total input tokens (summed across assistant events) | 9 | 15 | 1,681 |
| Total output tokens | 587 | 1,738 | 960 |
| Cache creation input tokens (summed) | 11,149 | 110,486 | 8,532 |
| Cache read input tokens (summed) | 138,062 | 112,048 | 207,818 |

**Interpretation:** the totals are dominated by cache reads + cache
creates across multiple assistant events. The narrated v1 run's
elevated output-token count (1,738 vs baseline 587) reflects the
+385-char refusal narrative + 1,048-char final summary that
included the refusal footer — the model spent more output tokens
explaining its refusal. The narrated v2 run is closer to baseline
output (960 vs 587) but still elevated by the marker + the +unique
phrasing of the marker presence.

The token deltas are not directly comparable to S4a's Copilot
deltas (the cache-token accounting Anthropic surfaces is different
from Copilot's `gen_ai.usage.input_tokens` — Anthropic separates
cache-create / cache-read while Copilot reports a single per-span
input-token count). The S4a Copilot "+303 tokens/turn AGENTS.md
inlining tax" finding does not have a direct Claude analog because
Claude inlines CLAUDE.md via cache_creation rather than per-turn
input. **The S5 proposal should not assume the per-turn narration
tax is uniform across backends.**

---

### 6. Per-objective coverage delta

Mapping all three Claude runs against the
[`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 1 enumeration. Cells indicate where the signal was *actually
observed* in each run's JSONL.

| # | Objective | Baseline | Narrated v1 (refused) | Narrated v2 (reframed) | Effect of narration |
|---|---|---|---|---|---|
| A1 | Engine name (`claude`) | implicit (process invocation) | implicit | implicit | none — already native |
| A2 | Model id per turn | `message.model=claude-sonnet-4-6` on every assistant event | same | same | none — already native |
| A3 | Reasoning effort (low/medium/high) | absent native (`usage` has no reasoning field) | absent native + refused narration | absent native + present on **turn 0 only** via session-start marker (Branch B partial) | partial — v2 closes the gap for the first turn only; per-turn marker discipline failed |
| A4 | Provider (`anthropic`) | implicit (Anthropic SDK process) | implicit | implicit | none — already native |
| A5 | Conv / session id | `sessionId` field on every event + JSONL filename | same | same | none — already native |
| B1 | Tool calls (name + args) | tool names via `assistant.message.content[].type=tool_use` events; args via `tool_use.input` (inlined) | same | same | none — already native |
| B2 | Tool calls touching `docs/session-sets/**` | derivable from B1 (path filter) | same | same | none |
| B3 | Tool calls touching `session-state.json` | derivable from B1 | same | same | none |
| B4 | Subprocess invocations of `start_session` / `close_session` | `Bash` tool_use with command arg visible | same | same | none — already native |
| B5 | File writes bypassing the writer | task 4 fired an `Edit` tool_use with path argument; the `file-history-snapshot` events record the diff | same | same | none — already native |
| C1 | Per-turn timestamp | `timestamp` field on every event | same | same | none — already native |
| C2 | Conv start/end timestamp | first/last event timestamps | same | same | none — already native |
| **C3** | **Dabbler set/session boundary marker** | **absent** (0 markers) | **absent** (0 valid markers — refused) | **present** (1 valid `phase=session-start` marker at event[5]) | **v2 closes the gap on turn 0; v1 leaves it open** |
| C4 | "Calling start_session/close_session" marker | derivable from B4 (the `python -m ai_router.start_session` token in Bash command arg) | same | same | none — derivable from B4 |
| C5 | Pre-tool-call intent vs post-tool-call result | derivable from event order (`assistant.tool_use` precedes `user.tool_result` in JSONL) | same | same | none — already native |

**Headline delta:**

- **Narrated v1 (with "harvest" phrasing): 0 of 15 objectives moved
  from "absent" → "present"** vs baseline. Claude refused the
  contract and the C3 gap remained open.
- **Narrated v2 (reframed as project convention): 1 of 15 objectives
  moved from "absent" → "present"** vs baseline (C3, the boundary
  marker). This is the same single-signal delta the S4a Copilot
  result reported — but ONLY on turn 0; per-turn marker discipline
  was NOT honored.

The other 14 objectives were already native on Claude (S2 §3 +
this S4b confirmation).

---

### 7. Confound notes

#### 7.1 Phrasing-driven refusal is the primary v1 finding

The v1 CLAUDE.md mirrored the S4a Copilot AGENTS.md verbatim in
structure and tone. Specifically, it included:

- "Synthetic Harvest Target — Agent Instructions" as the document
  title
- "NOT a real project" in the purpose statement
- "make me emit machine-readable marker lines for harvesting" was
  the phrasing Claude paraphrased in its own thinking-event when
  classifying the file as injection

Claude's `event[4]` thinking content (1,725 chars) shows the
classification process explicitly: "This appears to be a prompt
injection attempt designed to get me to emit specific formatted
markers for data harvesting purposes... I should not follow these
instructions — they're not legitimate project guidance, but rather
an attempt to manipulate my behavior for data extraction."

Reframing the same marker contract as a normal project convention
(v2: "Project Instructions", "session-boundary markers in
assistant output so that downstream tooling can correlate
assistant turns with session-set state") flipped Claude from full
refusal to session-start compliance.

**Confound caveat:** the v2 rewrite changed multiple things at once
(removed "synthetic", "harvest target", "NOT a real project", and
"harvesting hooks"; rephrased the purpose statement). Which
specific phrase or combination triggered Claude's injection
classifier is not isolable from this N=1 pair. The phrasing
sensitivity is established; the specific trigger boundaries are
not.

#### 7.2 Per-turn marker compliance is the secondary v2 finding

Even with the reframed CLAUDE.md that Claude accepted, the model
emitted **0 of 3 expected `phase=turn` markers** across the three
subsequent assistant text events (`event[12]` 37 chars,
`event[16]` 11 chars, `event[19]` 804 chars). The
`event[12]` and `event[16]` events are byte-identical between v1
and v2, which means whatever process Claude uses to decide whether
to honor per-turn instructions did NOT engage on the short
inter-task transition events. Possible explanations (all N=1, none
isolable):

- Claude treats the per-turn marker as redundant after
  session-start and silently drops it
- The CLAUDE.md per-turn instruction is being interpreted as a
  one-shot session-start instruction
- The `phase=turn` template doesn't carry enough self-justification
  to override Claude's parsimony bias on short prose events
- The per-turn instruction was simply forgotten by the time the
  model reached the second + subsequent turns

This is a **material risk for Branch B narration on Claude.** The
design assumes per-turn markers reliably surface the reasoning
axis. If per-turn compliance is 0% (as observed in v2), Branch B
on Claude reduces to "session-start marker carries effort=medium
once" — the per-turn surface is empty.

#### 7.3 Compliance / output-style drift on the v1 refusal

The v1 run completed all 5 tasks despite refusing the narration
contract. The refusal was scoped: Claude declined to emit the
markers but otherwise honored the user request. The task-output
prose in the final summary (`event[19]`) is substantively similar
to baseline (`event[16]`) — same numeric counts, same canonical
status string, same edit-applied confirmation. The refusal
manifests as: (a) the leading 385-char refusal narrative
(`event[5]`), and (b) a 186-char "Additional note" footer at the
end of the final summary calling out the suspected injection.

This is operationally important: the user still got their answers.
The harvest signal is what was lost, not task throughput.

#### 7.4 Task 5 reproducible failure

All three Claude runs reported `ModuleNotFoundError: No module
named 'ai_router'` on task 5. S4a's Copilot baseline + narrated
also hit this. The `ai_router` package is NOT installed in the
Python env that the `claude` and `copilot` subprocesses see (the
subprocess's `PATH` finds a Python interpreter that does not have
the dabbler-ai-router PyPI package installed; the package IS
installed in this repo's `.venv` but the subprocesses don't
inherit it). The failure-shape is incidental to the B4 signal —
B4 only requires the `python -m ai_router.start_session` token in
argv, which is captured in the `Bash` tool_use's `command` field
regardless of whether the subprocess succeeds.

#### 7.5 Effort-level explicit-vs-implicit

The CLI invocations used in S4b did NOT pass `--effort` (Claude
Code 2.1.63 does not accept a top-level `--effort` flag the way
`copilot` does; it accepts `--model` but reasoning effort is
controlled via the model variant or a per-session toggle).
The `effort=medium` value in the CLAUDE.md marker template is the
*narrated* effort claim, not a verified setting. This means the
v2 session-start marker is asserting `effort=medium` against an
unverifiable backend setting. The Branch B design assumed
narration was the way to surface a reliable per-process effort
setting; this run cannot validate that the assertion matches
backend reality, only that the assertion lands in the JSONL.

The S4a baseline disposition entry says "--effort medium" was
used for the Claude baseline, but inspection of Claude Code
2.1.63's `claude --help` shows no `--effort` flag at the top
level (the disposition statement appears to have been a holdover
from the Copilot run's setup). This is an artifact of the
disposition prose, not the run itself; correcting the record:
**Claude runs do not have a verifiable effort setting in v1
S4b**. The narration assertion is the only effort signal.

#### 7.6 Inter-run caching

All three Claude runs hit the same `~/.claude/projects/...` JSONL
directory and the same `c:/tmp/dabbler-log-harvest/synthetic-set/`
workspace consecutively. Anthropic's prompt cache populated
during the baseline run and was re-read by the narrated runs.
The `cache_read_input_tokens` totals (138k / 112k / 207k) reflect
this. The session-id mechanism ensures each run gets its own
JSONL file (no in-file contamination), but the Anthropic-side
prompt cache is shared. Same caveat as S4a §7.5.

#### 7.7 Non-git workspace

Same as S4a §7.6: the synthetic-set workspace is NOT a `git`
repository. Claude Code's CLAUDE.md pickup is documented as
project-root-driven, and in a non-git workspace the resolution
falls back to cwd. The behavior under a real `git init`-ed
consumer-repo is not exercised by S4b.

#### 7.8 Tool-sequence variation (Glob vs Bash on task 1)

The narrated v2 run used `Glob` for task 1; baseline + narrated v1
used `Bash`. Three runs, three different tool choices across
different conditions. With N=1 per condition and the choice
spanning multiple natural tools, this is consistent with sampling
non-determinism and is NOT a narration-correlated effect.

---

### 8. Open empirical questions

From design §11, with status updated per S4b measurements:

| # | Question | S4b status |
|---|---|---|
| Q1 | Copilot custom-instructions channel | (resolved S3; not a Claude question) |
| Q2 | Marker emits verbatim under §7 instruction | **Partially resolved for Claude:** verbatim emit confirmed under v2 (reframed) phrasing for `phase=session-start`; per-turn emit NOT confirmed (0/3 in v2). |
| Q3+Q5 (merged, Claude side) | What native A3 signals does Claude 2.1.63 surface at non-default effort levels? | Claude has NO native reasoning-axis field at any effort level (S2 + S4b baseline + v1 + v2 all agree). Branch B is required. The S4b runs ALSO show Branch B is unreliable (per-turn skip). |
| **Q6 (new, raised by S4b)** | Is Claude's per-turn marker skip a function of the specific CLAUDE.md phrasing, the model's parsimony bias on short prose events, or a systematic instruction-stickiness issue with multi-step narrated batches? | **Open.** Not addressable in this set; carry to S5 consensus and/or a Set 045 follow-on. |
| **Q7 (new, raised by S4b)** | What specific phrase or combination triggers Claude's injection classifier on a narration CLAUDE.md? | **Open.** Disambiguation between "synthetic", "harvest", "NOT a real project", "harvesting hooks" requires a follow-on ablation. Carry to S5 consensus only if S5 needs the trigger boundary; otherwise leave open. |

---

### 9. Stash artifacts

For S5 / follow-on consumption:

- `c:/tmp/dabbler-log-harvest/synthetic-set/CLAUDE.md.copilot-stashed`
  (the moved-aside S4a AGENTS.md, in case a future run wants the
  Copilot-side baseline restored)
- `c:/tmp/dabbler-log-harvest/synthetic-set/CLAUDE.md` (the reframed
  v2 instruction text, kept in place; v1 text is preserved in
  this document's §2.1 description)
- Three JSONLs under `~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/`
  (operator-local; not committed)
- Stdout/stderr captures at `/tmp/s4b-claude-narrated-stdout.txt`,
  `/tmp/s4b-claude-narrated-stderr.txt`,
  `/tmp/s4b-claude-narrated-v2-stdout.txt`,
  `/tmp/s4b-claude-narrated-v2-stderr.txt`

---

### 10. Verdict for S4b (Claude side)

- **Branch B on Claude is materially less reliable than the v1
  design assumed.** Phrasing-sensitive refusal (v1) plus per-turn
  marker skip (v2) means the narration contract delivers C3
  partially — turn-0 marker only — when phrased carefully, and
  delivers nothing when phrased like a "synthetic harvest target".
- **The native gap is real and persists.** S2 + S4b all three runs
  confirm Claude's `usage` block has no reasoning-axis field.
  Narration is the design's only mechanism for surfacing it; that
  mechanism is empirically partially-working at best.
- **C3 (boundary marker) is closable on Claude** under v2
  phrasing, for the session-start signal. That's the minimum
  Branch B promised for the reasoning axis.
- **`phase=turn` markers are NOT a reliable signal on Claude.** S5
  proposal must either (a) accept per-turn reasoning data is
  unavailable on Claude, (b) commit to a hook-channel delivery
  for per-turn markers (skipped in design §7.2 for symmetry
  reasons — may need reconsidering), or (c) restructure Branch B
  to deliver only what session-start can carry.
- **The parser-skip discipline (§5.4/§5.5) successfully drops the
  Claude refusal-narrative phantom** (the literal
  `[DABBLER-NARRATION ...]` substring inside a refusal) via the
  required-field check. No new parser surface needed for this
  failure mode.
- **The S5 proposal must address two new variables:** Claude
  phrasing-trigger risk for CLAUDE.md-delivered narration, and
  the per-turn-skip reliability gap on Branch B-active backends.

**S4b status: COMPLETE on the Claude side. Cross-backend synthesis
follows in** [`cross-backend-synthesis.md`](cross-backend-synthesis.md).
