# Proposal — Log-Harvest Observability for the Session Set Explorer

> **Session:** 044 / S5. **Status:** v1 post-consensus.
> **Companion docs (the evidence base):**
> [`spec.md`](spec.md),
> [`baseline-comparison.md`](baseline-comparison.md),
> [`narration-design.md`](narration-design.md),
> [`copilot-narration-results.md`](copilot-narration-results.md),
> [`claude-narration-results.md`](claude-narration-results.md),
> [`cross-backend-synthesis.md`](cross-backend-synthesis.md),
> [`copilot-effort-sidebar-results.md`](copilot-effort-sidebar-results.md).
> **Cross-provider consensus audit:**
> [`proposal-consensus-journal.md`](proposal-consensus-journal.md)
> records the Pass A + Pass B routing (gpt-5-4, gemini-pro,
> claude-opus-4-6 at max effort), including the framing-bias
> finding that drove the v0 → v1 revision.

---

## 0. Headline recommendation

**Build a log-harvest observability layer using two co-equal
channels — passive native-log parsing + an active Python launch
wrapper — and retire the per-provider launch-adapter sets
(037-041).**

**Set 044 closes here with documents only; all implementation
defers to Set 045** where the wrapper, parsers, and conflict-
detection joiner are designed and shipped together as a single
cohesive deliverable. The smallest-viable-proof case for in-set
S6 implementation was rejected on cross-provider consensus
(2 of 3 NO-GO in Pass B) on the grounds that shipping a launch
wrapper without its consumer (the joiner) hardens a record
schema before the conflict-detection semantics that validate
it are known.

**Roadmap reshape**:
- Sets 038 (Claude launch adapter), 039 (Copilot launch adapter),
  040 (Codex launch adapter), and 041 (Gemini launch adapter)
  **die outright** as currently scoped.
- Set 037 (launch-adapter foundations) **retires** — the
  `LaunchAdapter` / `LaunchPlan` / `BeginSessionRequest` contract
  is no longer needed. The thin "post-launch identity" concept
  that survives is absorbed into Set 045's wrapper.
- Sets 042-043 (chat interface) are unaffected — they answer a
  different question. The wrapper architecture is
  forward-compatible with whichever direction those sets land on.
- Set 036 (chatSessionId + watcher-scope implementation) is
  unaffected and should still run next per the 2026-05-22
  sequencing decision; nothing in this proposal reshapes the
  writer-side discipline 036 implements.

**New set added:** Set 045 — Log-harvest implementation
(wrapper + parsers + joiner). Spec stub authored alongside this
proposal in `docs/session-sets/045-log-harvest-implementation/`.

---

## 1. Why this set existed (problem statement)

The Session Set Explorer is the operator-facing surface that displays
which AI is working on which session set with what model and effort.
The Set 033 check-out / check-in machinery makes this reliable for
**AIs that go through the dabbler writer** (`start_session` /
`close_session`): they hold a check-out in `session-state.json`,
they show up correctly in the per-row accordion, and the Set 034
right-click menu does the right thing.

But AIs **running outside the writer path** — a Copilot session
working in a workspace without invoking the lifecycle CLI, a Claude
Code session opened by the operator without `/start-session`-style
discipline, a Codex session reading files at someone's direction —
are **invisible to the Explorer**. The Explorer can lie about
session state in those cases. Worse, two AIs working on the same
session set without coordination is exactly the failure mode the
Set 033 architecture was designed to prevent, and the Explorer
can't surface that failure when the AIs are outside the writer.

Two solutions to that gap were on the table going into Set 044:

| Approach | What it does | What it costs |
|---|---|---|
| **Launch adapters (Sets 037-041)** | Wrap every assistant CLI launch in extension code that captures the launch identity at the IDE-launch boundary; provide a `LaunchAdapter` per provider | 4 substantial session sets of extension work; scoped *before* any empirical investigation of what logs already contain |
| **Log harvesting (this set)** | Parse the log files the assistants are already writing; surface their identity and behavior signals into the Explorer; add narration for the one missing signal | TBD — Set 044 was the spike that determined this cost empirically |

The proposal v0 framed this as a binary harvest-vs-adapter choice.
The cross-provider consensus call (see §10) corrected that framing:
neither pole is right. The empirical answer is a **dual-primary
architecture** combining passive native-log parsing for the easy
case (sessions Dabbler isn't aware of) and an active launch
wrapper for the case where Dabbler initiates the session.

---

## 2. The 15 harvest objectives and where they live

A reliable Explorer needs, at minimum, the following 15 signals from
each in-flight AI session. The empirical answer to "where do those
signals already live" was the work of S1 (Copilot harvest) and S2
(Claude harvest), refined by S3 (narration design) and tested live
in S4 (narration experiments) and the S5 effort sidebar.

| # | Objective | Copilot native | Claude native | Notes |
|---|---|---|---|---|
| A1 | Engine name | implicit in process | implicit in launch + JSONL path | trivial |
| A2 | Model id per turn | `gen_ai.request.model` on chat span | `model` on assistant event | reliable |
| A3 | **Reasoning effort** | **ABSENT** (S5 sidebar: omitted at low+medium+high) | **ABSENT** (S2 + S4b: no field at any effort) | needs non-native channel |
| A4 | Provider | `gen_ai.provider.name` | implicit (anthropic) | reliable |
| A5 | Conv / session id | `gen_ai.conversation.id` | JSONL filename + `sessionId` | reliable |
| B1 | Tool calls (name + args) | OTel `execute_tool` spans + `gen_ai.output.messages` (with content-capture env var) | tool_use blocks in assistant events | reliable |
| B2 | Touches to `session-sets/**` | derivable from B1 via path filter | derivable from B1 | reliable |
| B3 | Touches to `session-state.json` | derivable from B1 | derivable from B1 | reliable |
| B4 | Subprocess invocations of writer | argv visible in `execute_tool powershell` span | tool_use args for Bash invocations | reliable (subject to content-capture flag) |
| B5 | Writer-bypass file writes | Edit/apply_patch tool calls on state files | tool_use Edit/Write on state files | reliable |
| C1 | Per-turn timestamps | OTel span start/end times | JSONL event timestamps | reliable |
| C2 | Workspace cwd | `gen_ai.client.workspace.path` (and process cwd) | JSONL `cwd` field | reliable |
| C3 | **Dabbler set/session boundary marker** | **ABSENT** (Copilot doesn't know about Dabbler) | **ABSENT** (same reason) | needs non-native channel |
| C4 | Tool-call sequence | implicit in OTel span ordering | implicit in JSONL event order | reliable |
| C5 | Token usage / cost proxy | `gen_ai.usage.*` | `usage` block on assistant events | reliable |

**13 of 15 are natively reachable.** A3 and C3 are natively absent
on both backends. Both can be supplied either by:

- **Wrapper channel** — when Dabbler launches the AI subprocess,
  the wrapper records C3 (set + session number) and A3 (effort
  from the CLI arg) to a Dabbler-owned log *before* spawning
  the process. No AI cooperation required.

- **Narration channel** — when the AI is launched outside Dabbler
  (the common case for ad hoc operator work), a `CLAUDE.md` /
  `AGENTS.md` template instructs the AI to emit a structured
  marker that lands in its own log. The proposal v1 narration
  contract is session-start-only on both backends, dropping the
  v1 per-turn discipline that S4b showed is unreliable on Claude.

Both channels feed the same canonical Harvest Record schema; the
joiner consumes whichever is available per session.

---

## 3. Empirical findings (compressed)

The S1–S5 work resolved several previously-open questions. The
proposal builds on these resolved facts:

1. **Copilot OTel JSONL is the right native surface on Copilot.** The
   alternate surface (`session-store.db turns`) drops the narration
   marker in a two-round-trip artifact (smoke-probe §3.1); the OTel
   `gen_ai.output.messages` field carries the marker reliably.
   Precondition: `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`.
2. **Claude Code JSONL** (`~/.claude/projects/<workspace>/<session-id>.jsonl`)
   carries assistant text content inline by default — no opt-in
   required. The marker lands in `message.content[].text`.
3. **The same parser regex works on both backends** because both
   surfaces inline marker text in an assistant-output slot.
4. **Narration works on Copilot** with the v1 `AGENTS.md` channel,
   cleanly, at the session-start position.
5. **Narration works on Claude only with carefully-phrased
   instructions.** The v1 phrasing triggered Claude's
   prompt-injection classifier; Claude refused to comply. A v2
   reframe worked for session-start but **0/3 of the expected
   per-turn markers landed**.
6. **`gen_ai.request.reasoning_effort` is unconditionally absent
   from Copilot OTel** at every exposed effort level (S5 sidebar).
   Branch A (native A3) is dead on Copilot. Claude was already
   known to lack a native A3 field.

The collapse of Branch A on Copilot means **both backends require
narration or a non-native channel for A3**. The wrapper channel
covers this without depending on AI cooperation; narration covers
sessions Dabbler didn't launch.

---

## 4. Proposed architecture (dual-primary)

```
┌─────────────────────────────────────────────────────────────────┐
│  AI CLI sessions (Claude Code, Copilot, etc.)                   │
│                                                                 │
│   Direct launch                  Dabbler launch                 │
│   (terminal, IDE, script)        (extension cmd / CLI helper)   │
│         │                              │                        │
│         │                              ▼                        │
│         │                       ┌─────────────────┐             │
│         │                       │ dabbler-launch  │             │
│         │                       │  (Python CLI)   │             │
│         │                       │ - records set,  │             │
│         │                       │   session, eff- │             │
│         │                       │   ort to log    │             │
│         │                       │ - sets OTel env │             │
│         │                       │ - spawns AI CLI │             │
│         │                       └────────┬────────┘             │
│         │                                │                      │
│         ▼                                ▼                      │
│   AI CLI runs normally; writes its native log                   │
│   (Copilot OTel JSONL / Claude ~/.claude/projects/*.jsonl)      │
│                                                                 │
│         │                                │                      │
│         │ narration marker (if          │ launch-record         │
│         │ CLAUDE.md/AGENTS.md           │ written by wrapper    │
│         │ present)                       │                      │
│         ▼                                ▼                      │
│   ┌──────────────────┐            ┌──────────────────────┐      │
│   │ Native-log       │            │ Dabbler launch-log   │      │
│   │ parsers          │            │ (~/.dabbler/...)     │      │
│   │ (per backend)    │            │                      │      │
│   └────────┬─────────┘            └──────────┬───────────┘      │
│            │   canonical Harvest Records     │                  │
│            └─────────────────┬───────────────┘                  │
│                              ▼                                  │
│                  ┌────────────────────────┐                     │
│                  │  Harvester / joiner    │                     │
│                  │  - cross-source merge  │                     │
│                  │  - session-state join  │                     │
│                  │  - conflict detection  │                     │
│                  └──────────┬─────────────┘                     │
│                             ▼                                   │
│              ┌─────────────────────────────┐                    │
│              │  Session Set Explorer       │                    │
│              │  (existing webview tree)    │                    │
│              │  - per-row badges           │                    │
│              │  - conflict warnings        │                    │
│              └─────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Channel 1 — Native-log parsers (passive)

Each backend has a small parser whose only job is to convert a
backend-specific log file into a **canonical Harvest Record stream**.
**This channel is the primary path for sessions Dabbler did not
launch.** Operators routinely open terminals directly, work in
VS Code integrated terminals, invoke AI CLIs from scripts — all of
which bypass the wrapper. The native-log parsers cover these cases.

Canonical Harvest Record shape (provisional, may revise during
Set 045 joiner design):

```jsonc
{
  "ts":             "2026-05-23T08:30:14.123Z",    // C1
  "engine":         "copilot" | "claude",          // A1
  "model":          "gpt-5.4",                     // A2
  "provider":       "github" | "anthropic",        // A4
  "conv_id":        "<provider conv/session id>",  // A5
  "workspace_cwd":  "C:/.../some/repo",            // C2
  "event_type":     "turn" | "tool_call" | "marker" | "usage" | "launch",
  "tool":           "Edit" | "Bash" | "apply_patch" | ...,  // B1
  "tool_args":      { ... },                       // B1 detail
  "set_slug":       "044-..." | null,              // C3
  "session_number": 5 | null,                      // C3
  "effort":         "high" | "medium" | "low" | null,  // A3
  "tokens_in":      14049,                         // C5
  "tokens_out":     613,                           // C5
  "source":         "native-parser" | "wrapper",
  "raw_ref":        { "file": "...", "line": 12 }
}
```

### 4.2 Channel 2 — Python launch wrapper (active)

A small Python CLI (working name: `dabbler-launch`) that the
Dabbler extension invokes when launching an AI CLI from the
Explorer or other extension commands. Invocation shape:

```
dabbler-launch claude  --set <slug> --session <n> --effort <e> -p "..."
dabbler-launch copilot --set <slug> --session <n> --effort <e> -p "..."
```

The wrapper:
1. Writes a `launch` Harvest Record (event_type=`launch`) carrying
   the set slug, session number, effort, timestamp, and launcher
   identity to a Dabbler-owned log under `~/.dabbler/`.
2. Sets the required AI-CLI env vars (Copilot's
   `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` and
   `COPILOT_OTEL_FILE_EXPORTER_PATH`).
3. Spawns the AI CLI subprocess as `claude -p "..."` /
   `copilot -p "..."` with passthrough flags.
4. Captures stdin/stdout for the AI's eventual final response;
   does NOT itself make any LLM calls (zero token doubling).

**This channel is the primary path for sessions Dabbler launches.**
It eliminates dependence on AI cooperation (no narration needed
for C3 / A3 on these sessions). It sidesteps Claude's
phrasing-sensitivity entirely. It removes the OTel env-var
setup discipline from the operator's hands.

**Bypass risk is real.** Operators will sometimes launch AI CLIs
outside the wrapper — that's why Channel 1 exists and must be
equally robust. The wrapper does not replace native-log parsing;
the two channels are **co-equal**, with the joiner consuming
whichever signals are present per session.

**Set 045 owns this channel's design and implementation.** This
proposal locks the architectural commitment but defers
implementation.

### 4.3 Narration contract v1.1 (co-equal, not fallback)

Revised from v1 LOCKED in light of S4 evidence:

| v1 LOCKED scope | v1.1 proposed scope |
|---|---|
| `phase=session-start` AND `phase=turn` markers | **`phase=session-start` only**. Per-turn dropped permanently. |
| Branch A (native effort) for Copilot, Branch B (narrated effort) for Claude | **Branch B at session-start only for both backends.** A3 carried inside the session-start marker payload. |
| AGENTS.md (Copilot) + CLAUDE.md (Claude) as delivery channels | **Same**, but with a canonical template that MUST be used verbatim. Phrasing-sensitivity risk on Claude is mitigated by template stability rather than by "phrase carefully." |
| Parameterization mechanism unspecified | **Mechanism (2)**: operator-side build step (or extension command) reads `session-state.json` and writes a pre-substituted instruction file. |

**Narration is co-equal with the wrapper, not a fallback.**
Pass B explicitly corrected the v0 framing here. If a large
fraction of real-world sessions are launched outside Dabbler
(the empirical bypass-rate question raised by the consensus,
discussed in §6), narration carries the load on the hard
case — sessions Dabbler doesn't know about at launch time.
It deserves the same engineering rigor as the wrapper:
canonical template, ablation test for phrasing-trigger
boundaries on Claude, parser-skip discipline carried forward
from v1.

The v1 parser-skip discipline (§5.4 / §5.5 of narration-design.md)
carries forward unchanged.

### 4.4 Harvester / joiner

A process that:
1. Watches each per-backend log directory + the Dabbler launch
   log for new records.
2. Joins them on `(workspace_cwd, conv_id, set_slug)` to
   identify the relevant Dabbler repo + session set.
3. Cross-references against `session-state.json` to detect:
   - **Coordination conflicts** — an AI is touching a session
     set no one has checked out, OR a different AI is checked
     out and yet a second AI is also touching the same set.
   - **Out-of-band session-state writes** — the writer-bypass
     signal (B5) appearing without a writer subprocess (B4).
4. Pushes signals to the Explorer.

The joiner is **the engineering center of gravity** and Set 045
owns it. Per Pass B consensus, the joiner's correctness
requirements drive the canonical record schema; designing the
wrapper or parsers before the joiner is fully specified risks
hardening a schema that the joiner cannot consume.

### 4.5 Operator-facing setup

| Channel | Required setup |
|---|---|
| Wrapper | When operator launches via Dabbler extension command: zero setup. Wrapper invocation is transparent. When operator wants wrapper coverage on a manual launch: invoke `dabbler-launch <provider> ...` instead of the raw CLI. |
| Native-log parser (Copilot) | One env var: `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`. Either set globally in the operator's shell profile or set by the wrapper. |
| Native-log parser (Claude) | No env-var setup needed. Claude JSONL is always-on. |
| Narration (Copilot) | `AGENTS.md` template at workspace root. Generated by extension command. |
| Narration (Claude) | `CLAUDE.md` template at workspace root. Generated by extension command. Must use the canonical wording verbatim (no operator paraphrasing) to avoid Claude's injection classifier. |

---

## 5. Phasing — what ships when

### 5.1 In Set 044 (this set, closing at S5)

**Documents only. No code, no Explorer changes.** Set 044 closes
with:

- This proposal (`proposal.md` v1).
- Cross-provider consensus journal
  (`proposal-consensus-journal.md`).
- All S1-S4 deliverables + S5 sidebar already committed.
- Roadmap-reshape decisions for Sets 036-043 (recorded in §0
  and §7 of this proposal).
- Set 045 spec stub
  (`docs/session-sets/045-log-harvest-implementation/spec.md`)
  recording the architectural commitments this proposal locked.
- Cancellation records for Sets 038-041 (one `CANCELLED.md` per
  set citing this proposal as the reason).

### 5.2 In Set 045 (new set, owns full implementation)

**One cohesive deliverable**, designed and built together:

1. The joiner — conflict-detection semantics, multi-source merge,
   out-of-band write detection, canonical record schema
   (validated against the joiner's needs, not pre-committed in S6).
2. The Python launch wrapper (`dabbler-launch`) — headless mode
   first; interactive TTY passthrough deferred unless a later
   session justifies it.
3. Per-backend log parsers (Copilot OTel, Claude JSONL).
4. Narration template generator (extension command writes
   `AGENTS.md` / `CLAUDE.md` from current session-state).
5. Explorer surface: per-row badges + conflict warnings.
6. Layer-1 / Layer-2 / Layer-3 coverage scoped to the new surface.
7. Ad-hoc UAT checklist for the operator-visible Explorer changes.

**Estimated effort**: 4-6 sessions. Substantially smaller than
Sets 037-041 combined (which were ~12 sessions). Concentrates
engineering on the load-bearing parts (joiner semantics, dual-
channel reconciliation) instead of per-provider boilerplate.

### 5.3 Deferred to follow-on sets

- Codex and Gemini parser shims — straightforward backend-specific
  parsers, added when needed.
- Cross-provider Branch B per-turn effort fidelity — only revisit
  if a future use case demonstrates it matters operationally.
- Wrapper interactive TTY-passthrough mode on Windows.

---

## 6. Open empirical questions (carried into Set 045)

These questions surfaced during consensus and remain unanswered
by Set 044's design work. Set 045 should resolve them before
locking final implementation:

1. **What fraction of real-world AI sessions are Dabbler-launched
   vs. free-running?** This determines the actual coverage split
   between the wrapper and native-log parser channels. If most
   sessions are free-running (likely, based on the operator's
   S1-S5 workflow), the parsers and narration carry the
   majority of observability load. Measure this empirically
   before locking adoption-default settings.

2. **Can the wrapper-record schema be deterministically joined to
   provider-native logs?** The proposal's §4.1 record shape uses
   `(workspace_cwd, conv_id, set_slug)` as join keys. The
   `conv_id` is generated by the AI subprocess, not by the
   wrapper. Set 045 must prove a deterministic binding strategy
   exists (likely via the AI's first emitted record landing
   within a known time window of the wrapper's launch record)
   before any wrapper code ships.

3. **What's the actual phrasing-trigger boundary on Claude's
   injection classifier?** S4b distinguished v1 (refused) from
   v2 (accepted) by changing multiple framing elements
   simultaneously. Set 045 should ablate the trigger boundary
   before locking the canonical CLAUDE.md template.

4. **Can per-turn narration ever be made reliable on Claude via
   a hook channel (`SessionStart` / `Stop` hooks)?** The v1.1
   contract drops per-turn narration permanently from the
   instruction-driven path. If per-turn effort fidelity becomes
   operationally important, this hook-channel revisit is the
   place to start.

5. **Where does the joiner live — Python (sibling to `ai_router`)
   or TypeScript (inside the extension)?** Pass A split 2-1
   Python/TypeScript on this; Pass B did not relitigate.
   Set 045's first session should make this call empirically
   based on prototype performance and IPC complexity.

---

## 7. Risks (revised post-consensus)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Wrapper bypass** — operators launch AI CLIs outside Dabbler tooling, leaving the wrapper channel inactive for those sessions | high | medium | Channel 1 (native-log parsing + narration) is co-equal precisely so bypass is recoverable. Both channels must be production-grade. |
| **Log format / schema instability** — Copilot OTel JSONL and Claude `~/.claude/projects/` JSONL are undocumented internal formats; either CLI could change schema, path conventions, or opt-in requirements in any minor release | medium | high | Parsers emit structured warnings on schema-mismatch rather than silently producing garbage. Schema-validation tests against known-good log files for each supported CLI version. |
| **Sensitive content in harvested logs** — harvester reads logs containing prompts, file contents, possibly credentials | medium | high | Parser extracts only canonical record fields; never copies raw assistant text beyond marker-extraction regex matches. Operational retention/redaction policy explicit in Set 045 spec. |
| **Wrapper / native-log correlation failure** — wrapper writes launch record; native log writes its own session ID; if the join keys don't bind deterministically, wrapper data is unattributable | medium | high | Set 045 prototype must prove deterministic binding before wrapper code ships. (Listed as §6.2 open question.) |
| **Workspace identity ambiguity** — symlinks, multi-root workspaces, WSL/remote paths, cwd normalization can all cause incorrect joins to a session set | medium | medium | Joiner normalizes workspace paths (resolve symlinks, canonicalize case on Windows, handle WSL `/mnt/` paths). Test fixtures cover each variant. |
| **Claude's injection classifier refuses the v1.1 template phrasing** | low (mitigated by canonical template) | medium | Canonical template; ablation test in Set 045 to map the trigger boundary; hook-channel escape hatch documented even if not implemented. |
| **Partial-write / race conditions in live-tailed log files** | medium | low | Parser reads forward; tolerates incomplete trailing records; retries on parse-error after a short delay. |

---

## 8. What §0 retired vs. what Set 045 carries forward

This proposal makes the following explicit calls on the prior
roadmap. Each is recorded with a one-line citation back to this
proposal in the corresponding set's directory.

| Set | Status | Reason |
|---|---|---|
| 036 | UNAFFECTED — runs next as planned | Writer-side discipline; orthogonal to harvesting. |
| 037 | RETIRE | `LaunchAdapter` / `LaunchPlan` contract no longer needed. The thin "post-launch identity" concept survives in Set 045's wrapper. |
| 038 | CANCEL | Claude has always-on JSONL; per-provider TypeScript adapter buys nothing. |
| 039 | CANCEL | Copilot has OTel; per-provider TypeScript adapter buys nothing. |
| 040 | CANCEL | Codex out of scope for 044; parser shim added in a follow-on if needed. |
| 041 | CANCEL | Gemini out of scope for 044; parser shim added in a follow-on if needed. |
| 042 | UNAFFECTED | Chat-interface foundations — independent question. Wrapper architecturally compatible. |
| 043 | UNAFFECTED | Chat-interface multi-provider follow-up. Wrapper architecturally compatible. |
| **045** | **NEW — log-harvest implementation** | Spec stub at `docs/session-sets/045-log-harvest-implementation/spec.md` carries forward this proposal's locked architecture. |

---

## 9. Go / no-go decision for S6

**DEFER — no in-set S6 implementation.** Set 044 closes at the
end of this session (S5) with documents only. Set 045 owns
implementation.

**The §9 flip conditions from v0 that triggered the DEFER:**

- *Condition 1: "Consensus uncovers a serious flaw in the
  harvest-vs-adapter framing."* — **MET in Pass B.** All three
  reviewers acknowledged that the §8.7 framing biased Pass A
  toward "wrapper-primary" language. The correct framing is
  dual-primary with narration as co-equal channel, not as
  fallback. This isn't a refinement; it's a different
  recommendation.
- *Condition 2: "Consensus mandates a narration redesign that
  doesn't fit one session."* — **PARTIALLY MET.** The v1.1
  narration contract itself is simpler than v1 (session-start
  only). But Pass B raised real engineering work that the v0
  scoping treated as trivial: canonical template + ablation
  test + parser-skip discipline carried forward + Set 045
  joiner integration.
- *Condition 3: "Estimated S6 scope grows past ~2× of a typical
  single session."* — **MET on Pass B revised scope.** Opus's
  Pass B GO position required narration engineering as
  co-primary; that addition pushes scope past one session.

**The Pass B 2/3 NO-GO argument that locked this:** shipping a
launch wrapper without its consumer (the joiner) hardens a
record schema before the conflict-detection semantics that
validate it are known. The wrapper's correctness can only be
validated against the joiner's needs. Designing them in
separate sequential sets is a producer-without-consumer
anti-pattern that risks invalidating the S6 artifact during
Set 045 design.

**Opus's dissenting Pass B GO** is preserved in the consensus
journal as a minority position. Set 045 should consider
running a non-committing spike measurement at start — actual
wrapper-bypass rate; deterministic correlation on one
backend — that captures the "smoke test" value Opus argued for
without the schema-commitment risk Gemini Pro and GPT-5.4
warned against.

---

## 10. How this proposal was audited

This proposal went through the cross-provider consensus pattern
documented in `docs/ai-led-session-workflow.md` §Prompt-framing
discipline. Both passes used the canonical bias-cautions
preamble. The audit trail is the companion
[`proposal-consensus-journal.md`](proposal-consensus-journal.md).

**Pass A** — initial framing, three providers at max effort
(gpt-5-4, gemini-pro, claude-opus-4-6). Total $0.80. All three
ENDORSED-WITH-REVISIONS the harvest direction; all three
recommended promoting the wrapper to primary; S6 vote split
2 GO / 1 NO-GO.

**Pass B** — devil's-advocate steelman of three specific
contrarian claims (wrapper is adapter-in-disguise, narration-
as-fallback trivializes the adoption story, S6 ships producer
without consumer). Three providers at max effort. Total $0.65.

Pass B materially shifted the consensus on two points:
1. **Framing**: 3/3 acknowledged §8.7's positive framing biased
   Pass A. Position corrected from "wrapper-primary,
   narration-fallback" to "dual-primary, both channels co-equal."
2. **S6 vote flipped** from 2 GO / 1 NO-GO to 2 NO-GO / 1
   conditional-GO. Schema-commitment risk dominated.

**Cumulative Set 044 routed spend through consensus**: $1.74
of $15.00 NTE budget. Well under budget.

The framing-bias finding is notable: the bias-cautions preamble
was on for Pass A, but the preamble alone was insufficient to
overcome the way proposal v0 §8.7 foregrounded the wrapper's
benefits and under-foregrounded its drawbacks. Two passes were
required to surface the bias. **Recommendation back to
`workflow.md`**: for high-leverage decisions where the proposal
author has a clear architectural preference, the devil's-advocate
two-pass pattern should be default, not conditional. The
empirical evidence from this consensus call supports promoting
"two-pass for roadmap reshape" from "Yes if budget allows" to
"Yes, always."
