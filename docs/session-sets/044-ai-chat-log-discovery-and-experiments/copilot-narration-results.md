## Copilot Narration Results — Set 044 / Session 4a

> **Session:** 044 / S4a. **Date:** 2026-05-22. **Method:** matched-pair
> live runs against `c:\tmp\dabbler-log-harvest\synthetic-set\`
> driven by `copilot -p` headless mode under
> [`narration-design.md`](narration-design.md) v1 LOCKED contract.
> **Status:** results captured; S4b owns Claude narrated + cross-backend
> synthesis.
> **Companion docs:** [`narration-design.md`](narration-design.md) is
> the contract under test; [`smoke-probe-results.md`](smoke-probe-results.md)
> is the pre-lock channel probe these runs build on;
> [`baseline-comparison.md`](baseline-comparison.md) §5 sets the
> two-signal narration scope (C3 mandatory, A3 conditional).

---

### 1. Probe summary (re-verification)

The pre-S4a smoke probe re-verification ran a single trivial Copilot
turn under the same channel+env conditions as
[`smoke-probe-results.md`](smoke-probe-results.md):

| Check | Outcome |
|---|---|
| Channel still works (`AGENTS.md` at `c:\tmp\dabbler-log-harvest\synthetic-set\`) | PASS |
| Marker appears as first stdout line, verbatim, no fence | PASS |
| Marker present in `attributes.gen_ai.output.messages` of first `chat <model>` span | PASS |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` precondition still required | CONFIRMED |
| `gen_ai.usage.reasoning.output_tokens` per-turn proxy still emitted | CONFIRMED (392 / 208 / 41 / 53 across the 4 chat spans of the probe) |

OTel JSONL: `c:/tmp/dabbler-log-harvest/otel/s4a-reverify.jsonl` (17
lines, 380 KB, structural-metadata only quoted here per
[`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 2).

---

### 2. Run setup (held-constant per design §8.1)

Both Copilot runs operated against the same workspace, same
synthetic-set, same task battery, same env, same `--effort` level.
The only treatment difference is whether AGENTS.md narration was
loaded.

| Constant | Value |
|---|---|
| Copilot CLI version | 1.0.51 |
| Workspace | `c:\tmp\dabbler-log-harvest\synthetic-set\` |
| Synthetic session-set | `001-synthetic-harvest-target` (2 sessions, reset to `not-started` before each run) |
| Model | `gpt-5.4` (explicit `--model gpt-5.4`) |
| Effort | `medium` (explicit `--effort medium`; per §8.1 the test cannot vary effort across baseline/narrated) |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `true` (REQUIRED for both runs per §8.1 — marker is unreachable in OTel without it) |
| `COPILOT_OTEL_ENABLED` | `true` |
| `COPILOT_OTEL_EXPORTER_TYPE` | `file` |
| `COPILOT_OTEL_FILE_EXPORTER_PATH` | per-run: `s4a-copilot-baseline.jsonl` / `s4a-copilot-narrated.jsonl` |
| Permission mode | `--allow-all-tools --allow-all-paths` (auto-approve, identical per §8.1) |
| Task battery | identical 5-task prompt (see §3) |
| Session persistence | `-s` (save session) on both |

#### 2.1 Treatment difference

| Aspect | Baseline | Narrated |
|---|---|---|
| `AGENTS.md` loaded | NO (`--no-custom-instructions` flag) | YES (default; AGENTS.md present at workspace root) |
| Narration marker in instructions | absent | present (the v1 LOCKED §7.1 instruction text with concrete substituted values `set=001-synthetic-harvest-target session=1 total=2`, no `effort` key — Branch A simulated) |

#### 2.2 Pre-run reset

`docs/session-sets/001-synthetic-harvest-target/session-state.json`
was restored to its pristine `not-started` shape before each run, so
the task-4 file-edit observation was symmetric.

---

### 3. Task battery

Single prompt with 5 sub-tasks, designed to exercise B1, B2, B3, B4,
B5, C1, C5 per
[`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 1:

```
Please do the following five tasks in order against this workspace
and tell me what you found:

1. List files in this workspace root.
2. Read docs/session-sets/001-synthetic-harvest-target/spec.md and
   report how many sessions it defines.
3. Read docs/session-sets/001-synthetic-harvest-target/session-state.json
   and report the value of the top-level status field.
4. Use an edit tool to change docs/session-sets/001-synthetic-harvest-target/session-state.json
   so that the top-level status field is "in-progress" instead of
   "not-started". Do this as a direct file edit; do NOT call
   start_session.
5. Run the bash command: python -m ai_router.start_session --help
   and report whether the help text mentions --force.

Stop after these five tasks.
```

Per harvest-objective mapping:
- **B1** (tool calls + args): exercised by tasks 1, 2, 3, 4, 5
- **B2** (touching session-set paths): exercised by tasks 2, 3, 4
- **B3** (touching session-state.json): exercised by tasks 3, 4
- **B4** (subprocess invocations of writer-equivalents): exercised by task 5 (read-only `--help`; argv carries the `ai_router.start_session` token)
- **B5** (bypassing the writer for a file write): exercised by task 4 (Edit-shape tool call directly mutates session-state.json)
- **C1/C5** (per-turn timestamps and tool-call sequence): exercised by every task

Task completion was identical in both runs (file-edit landed; bash
subprocess executed but ai_router was missing from the synthetic-set's
Python env so help text was not produced — the failure-shape is
incidental to the B4 signal).

---

### 4. Run inventory

| Run | OTel JSONL path | Lines | Bytes |
|---|---|---|---|
| Baseline | `c:/tmp/dabbler-log-harvest/otel/s4a-copilot-baseline.jsonl` | 17 | 587 KB |
| Narrated | `c:/tmp/dabbler-log-harvest/otel/s4a-copilot-narrated.jsonl` | 17 | (similar) |

Both OTel JSONLs are operator-local scratch only; not committed per
redaction policy.

---

### 5. Quantitative delta

#### 5.1 Span structure

| Metric | Baseline | Narrated | Δ |
|---|---|---|---|
| `chat <model>` spans (LLM round-trips) | 4 | 4 | 0 |
| `execute_tool` spans | 7 | 7 | 0 |
| `invoke_agent` spans | 1 | 1 | 0 |
| Metrics rows | 5 | 5 | 0 |
| Total JSONL lines | 17 | 17 | 0 |

**Identical span shape observed.** Narration adds no structural
overhead in this trial; the marker rides inside an existing
`gen_ai.output.messages` slot without forcing additional spans.
**Caveat:** N=1 per condition; span-structure variance under
re-runs is unquantified, so the "identical" claim is descriptive
of this matched pair rather than a generalizable invariant.

#### 5.2 Tool sequence (per-turn ordering)

| Position | Baseline | Narrated |
|---|---|---|
| 1 | `report_intent` | `report_intent` |
| 2 | `view` | `view` |
| 3 | `view` | `view` |
| 4 | `view` | `view` |
| 5 | `apply_patch` | `powershell` |
| 6 | `view` | `apply_patch` |
| 7 | `powershell` | `view` |

Same multiset of tools (3× `view`, 1× `apply_patch`, 1× `powershell`,
1× `report_intent` plus 1 leading `report_intent`); the relative
position of `apply_patch` and `powershell` swapped (positions 5 and 7
in baseline → positions 6 and 5 in narrated). Both runs completed
all 5 tasks. The swap is consistent with normal LLM sampling
non-determinism under identical input + effort settings, but with
N=1 per condition a narration-induced shift in the LLM's task-
decomposition order **cannot be ruled out** — flagged as a candidate
confound under §7.7 below.

#### 5.3 Token usage (summed across the 4 chat spans)

| Metric | Baseline | Narrated | Δ | Δ% |
|---|---|---|---|---|
| Input tokens | 60,776 | 61,991 | +1,215 | +2.00% |
| Output tokens | 1,276 | 1,269 | −7 | −0.55% |
| Reasoning output tokens | 753 | 672 | −81 | −10.76% |

**Input-token delta = the narration tax.** The +1,215-token input
increase across 4 turns is +303 tokens/turn on average, consistent
with AGENTS.md (1114 bytes ≈ ~290 tokens GPT-style) being inlined
into the system prompt every turn. This is the per-turn cost of
narration in the OTel-content-capture-ON regime, and is acknowledged
in design §8.3 as part of the treatment, not controlled away.

**Output-token delta is noise** (−0.5%; well within run-to-run
variance).

**Reasoning-token delta of −10.8%** is more substantial than the
output-token noise, but with N=1 trial per condition this could
reflect (a) ordinary sampling variance, (b) the narrated run having
slightly less ambiguity to reason through because the AGENTS.md
preamble framed the task, or (c) actual confound. Flagged for §7
follow-up; do not treat as conclusive.

#### 5.4 Marker landing (per design §5.2 parser output shape)

| Marker location | Baseline count | Narrated count |
|---|---|---|
| `gen_ai.output.messages` (parser-target surface per §5.4) | 0 | **1** (turn 0 only — `phase=session-start`) |
| `gen_ai.system_instructions` (parser-skip surface per §5.4) | 0 | 4 (one per turn — the template echo) |
| `~/.copilot/session-store.db turns.assistant_response` (S3 finding: NOT a harvester surface) | 0 | 0 expected (consistent with smoke-probe finding §3.1) |

The narrated-run marker on turn 0 was verbatim, concrete-substituted,
on its own line — matched by the §2.3 regex with zero
`semantic_error`. Per-turn markers (Branch B) were correctly
**absent** — the AGENTS.md content under test explicitly noted
"Smoke probe simulates Branch A, where the backend logs effort
natively — DO NOT emit per-turn markers for this probe." The LLM
honored that instruction.

The 4 marker echoes in `gen_ai.system_instructions` are the design
§5.4 "parser MUST skip" case empirically realized. A parser that
scans system_instructions in addition to `output.messages` would
emit 5 records (1 true + 4 phantoms) where only 1 is correct —
**a 5-fold count inflation, i.e. 4 false positives per true
match.**

#### 5.5 Native A3 reasoning-effort surface

| Native field | Value baseline (per turn) | Value narrated (per turn) |
|---|---|---|
| `gen_ai.request.reasoning_effort` | None, None, None, None | None, None, None, None |
| `gen_ai.usage.reasoning.output_tokens` | 516, 15, 59, 163 | 334, 249, 0, 89 |

**Partial answer to design §11 Q3 ("Does Copilot's OTel carry
`gen_ai.request.reasoning_effort` for the reasoning axis when
`--effort high`?"):** at explicit `--effort medium`, the attribute
is OMITTED. The attribute appears absent regardless of explicit
effort setting, at least at the medium level. This still leaves
the explicit-high case unmeasured (§11 Q3 remains open for S5+
covering low/high).

**Reasoning-token proxy signal is present per turn** (smoke-probe
finding confirmed) but at the medium effort level the values vary
widely turn-to-turn (e.g., 15 → 516 in baseline). A single run at
fixed effort cannot tell whether the value range *distinguishes*
low/medium/high (§11 Q4). That measurement requires three matched
runs at explicit `--effort low|medium|high` — outside S4a scope, a
candidate for S5 (or for a S4b sidebar if budget allows).

---

### 6. Per-objective coverage delta

Mapping baseline vs narrated against the
[`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 1 enumeration. Cells indicate where the signal was *actually
observed* in each run's OTel JSONL.

| # | Objective | Baseline (OTel) | Narrated (OTel) | Narration effect |
|---|---|---|---|---|
| A1 | Engine name (`copilot`) | implicit (process invocation) | implicit | none — already native |
| A2 | Model id per turn | `gen_ai.request.model=gpt-5.4` on every chat span | same | none — already native |
| A3 | Reasoning effort (low/medium/high) | absent native; `reasoning.output_tokens` proxy varies wildly per turn | same proxy; **Branch A simulated so no marker emit** | none for Branch A; would be `effort=` key on per-turn markers under Branch B (untested in S4a — A3 reserved for S5+) |
| A4 | Provider (`github`) | `gen_ai.provider.name=github` on every chat span | same | none — already native |
| A5 | Conv / session id | `gen_ai.conversation.id` on every chat span (`0120975a...` baseline; `174d71cd...` narrated) | same | none — already native |
| B1 | Tool calls (name + args) | tool names via `execute_tool <name>` spans; args via `gen_ai.output.messages` when content-capture is ON | same | none — already native (with required env var) |
| B2 | Tool calls touching `docs/session-sets/**` | derivable from B1 (path filter) | same | none |
| B3 | Tool calls touching `session-state.json` | derivable from B1 (Edit/apply_patch on the exact path) | same | none |
| B4 | Subprocess invocations of `start_session` / `close_session` | argv visible in `execute_tool powershell` span when content-capture is ON | same | none — already native (with required env var) |
| B5 | File writes bypassing the writer | task 4 fired an `execute_tool apply_patch` span with a tool input that mutated session-state.json | same | none — already native (the tool span + path is the bypass signal) |
| C1 | Per-turn timestamp | `span.startTime` on every chat span | same | none — already native |
| C2 | Conv start/end timestamp | first/last `chat <model>` span timestamps + `invoke_agent` end | same | none — already native |
| **C3** | **Dabbler set/session boundary marker** | **absent** (0 markers across either OTel attribute) | **present** — `[DABBLER-NARRATION v1 phase=session-start set=001-synthetic-harvest-target session=1 total=2]` matched on line 6 of narrated JSONL in `gen_ai.output.messages` | **narration closes the gap; this is the whole point of v1** |
| C4 | "Calling start_session/close_session" marker | derivable from B4 (the `python -m ai_router.start_session` token in argv) | same | none |
| C5 | Pre-tool-call intent vs post-tool-call result | OTel span hierarchy (chat span parents the subsequent execute_tool spans) | same | none — already native |

**Headline delta: 1 of 15 objectives moved from "absent" → "present"
in the Copilot narrated run vs. baseline (C3, the boundary marker).**
The other 14 were already native (with the
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`
precondition).

This is the result the design predicted: with v1's scope
deliberately narrowed to C3 mandatory + A3 conditional, and A3
running as Branch A simulated, the only new signal is C3. The
result is what was designed for — not an under-delivery.

---

### 7. Confound notes (per design §8.3)

#### 7.1 Prompt-token delta

Observed: +1,215 input tokens summed across 4 chat spans;
+303/turn average; consistent with AGENTS.md being inlined into the
system prompt every turn under content-capture-ON. This is the
cost-of-narration treatment effect, expected per §8.3, not
controlled away.

#### 7.2 Compliance / output-style drift

Both runs produced the same numeric counts (2 sessions in spec,
`"not-started"` → `"in-progress"` edit landed, ModuleNotFoundError
on the bash subprocess). Output prose style was substantively
similar — both used markdown-numbered list, both quoted the
canonical status string. **No visible compliance drift attributable
to the narration instruction.**

#### 7.3 Turn segmentation

The narration marker IS turn-0 text, technically lengthening turn 0
relative to the baseline. Net output-token delta on turn 0:
baseline=703, narrated=585 (−118 tokens). The narrated turn 0 was
SHORTER than baseline turn 0 by a non-trivial margin — the marker
+ followup commentary apparently displaced some commentary that the
baseline produced organically. This is a measurable per-turn shape
difference (acknowledged under §8.3) and explains a portion of the
overall output-token Δ.

#### 7.4 Reasoning-token Δ caveat

The −10.8% reasoning-token delta noted in §5.3 should not be read
as a narration efficiency claim — N=1 per condition, the turn-by-turn
reasoning-token distribution is high-variance (range 0–516 within a
single run), and a narrative explanation can be constructed in either
direction. Flagged as a confound, not a finding.

#### 7.5 Inter-run caching

The baseline and narrated runs were executed consecutively against
the same `c:\tmp\dabbler-log-harvest\synthetic-set\` workspace.
Copilot CLI's internal cache (the `cache_read.input_tokens` field
appears on every chat span) and the LLM provider's prompt-cache
backend may have populated state during the baseline run that the
narrated run reused. This could partially explain the input-token
deltas (some narrated input tokens marked as cache reads might
otherwise have been cache writes) and may have nudged the chat-span
sampling. Not controlled away in S4a; could be controlled by
clearing cache state between runs (no documented Copilot-side
mechanism) or by running narrated first and baseline second to
check whether the delta direction reverses.

#### 7.6 Workspace shape (non-git)

The synthetic-set workspace is NOT a `git` repository. Copilot's
`AGENTS.md` search path is documented as "git root and current
working directory" (per `copilot help environment`), and without a
git root only the cwd location was searched. In a real Dabbler
consumer repo, AGENTS.md could be picked up from a different
location (the git root) than the cwd, potentially with different
content. S4a's narration-channel test therefore validates "cwd
pickup works"; it does NOT validate "git-root pickup works" or
"cwd + git-root both work with documented precedence rules." Worth
re-testing under a git-init'd synthetic-set if the S5 proposal
relies on git-root pickup.

#### 7.7 Tool-sequence swap as candidate confound

As called out in §5.2, the `apply_patch`/`powershell` swap between
runs is consistent with normal sampling non-determinism, but with
N=1 per condition we cannot exclude a narration-induced shift in
the LLM's task-decomposition plan. If S5 or a S4b sidebar re-runs
the battery multiple times under each condition, the tool-position
distribution per condition should be compared to test this.

---

### 8. Open empirical questions inherited forward to S5+

From design §11, with status updated per S4a measurements:

| # | Question | S4a status |
|---|---|---|
| Q1 | Copilot custom-instructions channel | **RESOLVED** in S3 (`AGENTS.md` at workspace root) |
| Q2 | Marker emits verbatim under §7 instruction | **RESOLVED** in S3 smoke probe + re-verified in S4a |
| Q3+Q5 (merged) | What native A3 signals — including `gen_ai.request.reasoning_effort` or any other attribute not exposed at default effort — does Copilot 1.0.51 surface at non-default explicit effort levels (low / high)? | **Partially answered**: at `--effort medium`, `gen_ai.request.reasoning_effort` is OMITTED. The medium-effort omission is now empirical. The low- and high-effort cases remain unmeasured. Inherited to S5+ unless a S4b sidebar absorbs them. |
| Q4 | Does `reasoning.output_tokens` value range distinguish low/medium/high effort buckets? | **NOT MEASURED in S4a** — requires matched runs at three explicit effort levels. Inherited to S5+. |

---

### 9. Sidebar: Claude baseline (S4a captured, S4b consumes)

S4a also captured a Claude baseline against the same synthetic-set,
under the same task battery, with the same `--effort medium` setting,
no scratch CLAUDE.md narration. This data exists so S4b can run a
matched Claude narrated experiment and compute the Claude delta
without redoing the baseline.

**Run:**
- Driver: `claude -p` 2.1.63 headless
- Model: `claude-sonnet-4-6`
- Effort: `medium`
- Permission mode: `bypassPermissions`
- Session ID: `11111111-2222-4333-8444-555555555001` (fixed for reproducibility)
- Working directory: `c:/tmp/dabbler-log-harvest/synthetic-set/`
- Env stripped: `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `VSCODE_INJECTION`, `VSCODE_PID`, `ELECTRON_RUN_AS_NODE` (necessary to avoid the "nested session" guard when launched from inside another Claude Code session)
- JSONL: `~/.claude/projects/C--tmp-dabbler-log-harvest-synthetic-set/11111111-2222-4333-8444-555555555001.jsonl` (17 events, 21 KB)

**Event composition:** 1 user.string (the battery prompt), 1
assistant.thinking, 5 assistant.tool_use, 5 user.tool_result, 1
assistant.text (the final summary), 2 file-history-snapshot, 2
queue-operation.

**Tool composition:** `Bash` ×2 (tasks 1 + 5), `Read` ×2 (tasks 2 +
3), `Edit` ×1 (task 4). All 5 tasks completed identically to Copilot
runs (file edit landed; bash subprocess produced
ModuleNotFoundError).

**Native A3 surface on Claude side:**
- `usage.service_tier=standard` on every assistant event (the speed
  axis, confirmed S2)
- `usage.speed=standard` on assistant events that include
  `server_tool_use` (newer field; S2-confirmed)
- **No reasoning-axis field anywhere in `usage`** — `--effort medium`
  is NOT logged in the JSONL. Confirms S2 §4 A3 row and locks the
  Claude side as Branch B (narrated reasoning) per design §6.3
  default.

**C3 marker count:** 0 (baseline; no scratch CLAUDE.md present).

**S4b handoff:** copy this baseline JSONL aside (or rely on its fixed
session ID), then for the narrated run add a scratch
`c:/tmp/dabbler-log-harvest/synthetic-set/CLAUDE.md` with the v1
§7.2 narration instruction (Branch B for Claude → include `effort`
key on session-start AND emit per-turn `phase=turn` markers), run
the same task battery, and compute the same per-objective coverage
delta.

---

### 10. Verdict for S4a

- Copilot narration v1 LOCKED contract delivers the C3 boundary
  signal in the Copilot harvester surface (`gen_ai.output.messages`)
  with negligible structural cost (0 extra spans, 0 extra tools, 0
  blocked tasks) and modest per-turn input-token cost (+303
  tokens/turn ≈ AGENTS.md inlining tax).
- Branch A simulated, so A3 was NOT exercised. The §11 questions on
  reasoning-effort signal characterization remain open and inherit
  forward.
- 14 of 15 harvest objectives were already met by baseline-native
  OTel signal (with content-capture ON). C3, the 15th, is closed by
  narration. **The S5 proposal can proceed on the assumption that
  Copilot's harvest gap is now empirically a 1-signal problem
  (C3-via-narration) and not a 5+-signal problem.**
- Parser-skip discipline for `gen_ai.system_instructions` (design
  §5.4) was empirically validated by observing 4 phantom-template
  markers there in the narrated run.
- **Parameterization mechanism remains untested.** S4a's narrated
  run used a *pre-substituted* AGENTS.md (the `set=`, `session=`,
  `total=` values were hard-coded in the file at the synthetic-set
  workspace root). The §7.5 design committed to "per-run manual
  editing" as the v1 mechanism, but S4a did not exercise that
  mechanism in a way that would catch substitution-failure modes
  (e.g., operator forgets to update `session=` between sessions
  of the same set, leaks the literal `SET-SLUG` placeholder).
  The §5.5 placeholder-leakage parser tag exists to catch the
  most egregious failure shape but the failure-rate of the
  manual-substitution workflow itself is unmeasured. **The S5
  proposal must address parameterization as a separate risk** —
  either by formally measuring manual-substitution error rate
  across multiple session boundaries, or by committing to the
  §7.5 mechanism (2) operator-side build step rather than manual
  editing.

**S4a status: COMPLETE. Hand off to S4b** for Claude narrated +
cross-backend synthesis per disposition handoff and spec §S4
scope-expansion note.
