## Cross-Backend Synthesis — Set 044 / Session 4

> **Session:** 044 / S4 (synthesis across S4a + S4b matched-pair
> live runs). **Date:** 2026-05-22. **Method:** combine the
> Copilot-side findings from
> [`copilot-narration-results.md`](copilot-narration-results.md)
> with the Claude-side findings from
> [`claude-narration-results.md`](claude-narration-results.md)
> against the
> [`narration-design.md`](narration-design.md) v1 LOCKED contract
> and the [`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
> Part 1 objective set.
> **Reader audience:** S5 author preparing the cross-provider
> consensus proposal.

---

### 1. Headline asymmetry

The v1 narration contract was designed to apply uniformly across
both backends, with only the Branch B reasoning-axis active
state varying per backend (Copilot: Branch A simulated in S4a;
Claude: Branch B by default per design §6.3). Empirically, the
two backends responded to the same contract under matched conditions
**very differently**:

| Backend | Marker emit on `phase=session-start` | Per-turn marker emit (when Branch B active) | Notes |
|---|---|---|---|
| Copilot 1.0.51 (S4a) | **PASS** — 1 valid marker landed in `gen_ai.output.messages` turn 0 | Not tested in S4a (AGENTS.md instructed "DO NOT emit per-turn markers for this probe" because Branch A was simulated for Copilot) | Branch B per-turn discipline not measured on Copilot. Open. |
| Claude 2.1.63, v1 phrasing (S4b) | **FAIL** — 0 valid markers; Claude classified CLAUDE.md as prompt-injection and emitted a refusal-with-flag instead | FAIL (refused entire contract) | "Synthetic harvest target" / "NOT a real project" / "harvesting hooks" language triggered injection classifier |
| Claude 2.1.63, v2 phrasing (S4b) | **PASS** — 1 valid marker at event[5] of the assistant text stream | **FAIL** — 0 of 3 expected `phase=turn` markers across subsequent assistant text events, despite explicit Branch B instruction in CLAUDE.md | Reframed CLAUDE.md (project-convention framing, no "synthetic"/"harvest"/"NOT a real" language) flipped Claude from refusal to session-start compliance — but per-turn discipline silently dropped |

The "identical-contract-both-backends" property of the v1 design
**holds at the parser-contract level** (the same regex, the same
output shape, the same skip rules work for both backends'
emitted markers) but **does NOT hold at the producer-compliance
level** (Claude's safety classifier rejects certain phrasings;
Claude's instruction-following on multi-step batches silently
drops per-turn directives).

---

### 2. C3 marker landing — the design's primary goal

C3 ("Dabbler set/session boundary marker") is the design's
mandatory signal and the only objective the narration contract
was designed to close.

| Backend | Surface where the marker lands | Native availability of C3 before narration | C3 after narration |
|---|---|---|---|
| Copilot | `attributes.gen_ai.output.messages` (turn-0 chat span; requires `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`) | absent | present (1 valid marker in S4a narrated) |
| Claude | `assistant.message.content[].text` (event[5]; no opt-in env var needed — content is inlined by default in `~/.claude/projects/...jsonl`) | absent | present (1 valid marker in S4b v2 narrated) |

**Both backends close C3 on turn 0 under v1's locked contract.**
The Copilot-side close is unconditional (the only requirement is
that the operator set the OTel env var); the Claude-side close
is conditional on phrasing the CLAUDE.md as a normal project
convention rather than as a harvest target. Both surfaces hold
the marker as plain text inside an assistant-output slot the
parser can scan; neither requires backend-specific parsing
logic.

**Practical implication for S5:** the parser can be backend-agnostic
at the field level (same regex, same output shape). The
*delivery channel* (AGENTS.md vs scratch CLAUDE.md) and
*phrasing-of-the-delivery* are backend-specific concerns the
proposal must address separately from the parser.

---

### 3. Per-turn marker landing — Branch B reliability

The design's §6.3 default has Claude on Branch B (narrated
reasoning axis) because Claude's `usage` has no reasoning-axis
field. Branch B requires per-turn `phase=turn` markers to surface
the reasoning effort on each turn.

| Backend | Per-turn marker compliance under narration | Effective Branch B status |
|---|---|---|
| Copilot | Not measured in S4a (Branch A simulated) | Branch B reliability unknown on Copilot |
| Claude (v2 reframed) | 0 of 3 expected per-turn markers emitted | **Branch B effectively degraded to session-start-only on Claude** |

**Material implication for S5:** if S5's proposal needs per-turn
reasoning-effort data on Claude, the v1 narration contract does
NOT deliver it. Three plausible responses, each with trade-offs:

1. **Accept session-start-only A3 on Claude:** the harvester sees
   `effort=medium` once per session, not per turn. Loses ability
   to detect mid-session effort changes (though Claude Code
   2.1.63 does not currently expose mid-session effort changes
   at the CLI level, so this loss may be theoretical).
2. **Move per-turn narration to a Claude-side hook
   (`SessionStart` or `Stop` hook writes the marker into the
   incoming turn context):** rejected in design §7.2 for
   parser-symmetry reasons (the marker would appear in
   user-message text on Claude but assistant-text on Copilot,
   doubling the parser's search surface). Worth revisiting in
   S5 in light of the per-turn-skip evidence.
3. **Drop A3 from v1 narration entirely on Claude; rely on
   per-process effort knowledge from outside the JSONL** (e.g.,
   the orchestrator records the effort value at session
   check-out and the harvester joins on session-id). This
   restructures Branch B as "the orchestrator side, not the
   model side, surfaces effort."

The S4a Copilot run did not exercise Branch B (Branch A was
simulated), so Copilot's per-turn compliance under Branch B
remains an open empirical question that would matter only if S5
chooses to keep per-turn narration as the A3 surface on either
backend.

---

### 4. Combined per-objective coverage delta

Across both backends, against the
[`harvest-objectives-and-redaction.md`](harvest-objectives-and-redaction.md)
Part 1 enumeration, marking the *most-compliant* result observed
on each backend:

| # | Objective | Copilot (baseline → narrated) | Claude (baseline → narrated v2) | Cross-backend status |
|---|---|---|---|---|
| A1 | Engine name | implicit → implicit | implicit → implicit | NATIVE BOTH |
| A2 | Model id per turn | native → native | native → native | NATIVE BOTH |
| A3 | Reasoning effort | absent → not-tested (Branch A simulated) | absent → turn-0 only via marker | **CLAUDE PARTIAL; COPILOT OPEN** |
| A4 | Provider | native → native | native → native | NATIVE BOTH |
| A5 | Conv / session id | native → native | native → native | NATIVE BOTH |
| B1 | Tool calls (name + args) | native (with OTel content-capture env var) → same | native → native | NATIVE BOTH (Copilot has env-var precondition) |
| B2 | Session-set path filter | derivable → derivable | derivable → derivable | DERIVED BOTH |
| B3 | session-state.json filter | derivable → derivable | derivable → derivable | DERIVED BOTH |
| B4 | start_session / close_session subprocess | native (via argv in execute_tool span) | native (via Bash tool_use command field) | NATIVE BOTH |
| B5 | File writes bypassing the writer | native (Edit-shape tool span + path) | native (Edit tool_use + path + file-history-snapshot) | NATIVE BOTH |
| C1 | Per-turn timestamp | native | native | NATIVE BOTH |
| C2 | Conv start/end timestamp | native | native | NATIVE BOTH |
| **C3** | **Boundary marker** | **absent → present (turn 0)** | **absent → present (turn 0; v2 only)** | **CLOSED BY NARRATION ON BOTH** |
| C4 | start_session/close_session boundary marker | derivable from B4 → same | derivable from B4 → same | DERIVED BOTH |
| C5 | Pre-tool-call intent vs post-tool-call result | native (span hierarchy) → same | native (event order) → same | NATIVE BOTH |

**Combined headline:**

- **1 of 15 objectives closed by narration: C3, on both backends,
  on the first turn only.**
- **A3 remains partially open:** Copilot didn't exercise Branch B;
  Claude exercised Branch B but the per-turn discipline failed,
  so only the turn-0 marker carries the effort signal.
- **The other 13 objectives are natively reachable** on both
  backends (with the Copilot OTel content-capture env-var
  precondition).

This is the same single-signal headline S4a reported on the
Copilot side. The Claude side does not change the headline; it
sharpens the *reliability* of the single-signal claim.

---

### 5. Native-vs-narrated surface comparison

| Aspect | Copilot 1.0.51 | Claude 2.1.63 |
|---|---|---|
| Marker target surface (where the parser looks) | `attributes.gen_ai.output.messages` (OTel JSONL chat span) | `message.content[].text` (Claude Code JSONL assistant event) |
| Required opt-in | `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` + OTel exporter env vars | none (always-on JSONL inlines content) |
| Parser-skip phantom surface | `gen_ai.system_instructions` (AGENTS.md template echo, S4a observed 4 phantoms per session) | none — phantoms appear inside the same `assistant.text` field as valid markers; defense is §5.5 required-field check (S4b v1 observed 1 phantom dropped by parser) |
| Narration channel | `AGENTS.md` at git root + cwd (per `copilot help environment`) | scratch `CLAUDE.md` in workspace root (project-root pickup) |
| Narration-tax shape | +303 input tokens/turn (AGENTS.md inlined into system prompt every turn) | cache_creation_input_tokens spike on first turn; subsequent turns hit cache_read (different accounting; not directly comparable) |
| Phrasing-sensitive refusal | not observed in S4a | observed in S4b v1; resolved in S4b v2 by reframing |
| Per-turn marker reliability (under Branch B) | not measured in S4a | 0/3 in S4b v2 |
| Tool-sequence variance under narration | apply_patch/powershell positions swapped | Glob/Bash on task 1 varied; baseline+v1 both Bash, v2 Glob — uncorrelated to narration |

**Cross-backend insight:** the parser can be backend-agnostic
because both backends inline marker text inside an
assistant-output field. The harvester layer is where backend
asymmetry has to be absorbed (env-var precondition for Copilot,
phrasing-discipline for Claude, per-turn-reliability caveat for
Claude).

---

### 6. Residual gaps narration cannot close

Per spec.md S4 step 4 ("Identify residual gaps that even narration
cannot close, and call out whether those are showstoppers for the
S5 proposal").

| Residual gap | Backend | Why narration doesn't close it | Showstopper for S5? |
|---|---|---|---|
| Per-turn reasoning-effort signal on Claude (Branch B at full per-turn fidelity) | Claude | The narration contract is designed correctly; the model silently drops per-turn markers in practice (0/3 in v2). The contract can't enforce model compliance. | **Possibly.** Depends on whether S5's proposal needs per-turn effort granularity. If session-start fidelity is enough, this is a documented limitation, not a showstopper. |
| Phrasing-trigger boundaries on Claude | Claude | The v1 design didn't anticipate phrasing-driven refusal; v2 demonstrates that careful phrasing works, but the trigger boundary between "harvest target" (refused) and "project convention" (accepted) is not isolated. | **Not a showstopper, but a documentation and template-management item.** The S5 proposal must include a "use this exact CLAUDE.md template; don't paraphrase" caveat or commit to a programmatic substitution mechanism (§7.5 design mechanism (2) or (3)). |
| Parameterization mechanism reliability | Both | Both S4a and S4b used pre-substituted instruction files (operator manually edited concrete values into AGENTS.md / CLAUDE.md). The §7.5 mechanism-(1) failure mode (operator forgets to substitute, marker carries literal `SET-SLUG`) was not exercised. The §5.5 placeholder-leakage parser tag catches the most egregious failure shape but the failure RATE of manual substitution across multiple session boundaries is unmeasured. | **Risk-flagged in S4a §10; carries forward.** Not a showstopper if the proposal commits to mechanism (2) or (3); is a showstopper if the proposal relies on mechanism (1) at scale. |
| Native A3 reasoning-effort attribute on Copilot at non-default effort | Copilot | The S4a runs used `--effort medium`; the attribute was OMITTED. Whether the attribute appears at `--effort high` / `--effort low` was not measured. If it doesn't appear at any effort, narration is required (Branch B); if it does at non-default values, Copilot can be Branch A. | **Not a showstopper; sidebar item.** Memory `project_044_copilot_effort_sidebar_deferred` notes this can be measured cheaply in a S5 sidebar or Set 045 follow-on. |
| Conflict-detection signal triple (timestamp + set-id + agent-id) | Both | The components exist natively (C1 timestamp, A1+A4 engine+provider, A5 conv-id, C3 set-id via narration). What's not exercised is the *harvester's* ability to JOIN these into a single conflict-detection record. This is a downstream parser/harvester concern, not a narration concern. | **Not addressable by narration.** S5's proposal should commit to a harvester proof-of-concept that exercises the join. |

---

### 7. What S4 actually confirmed vs. what's still open

#### Confirmed by S4:

1. **C3 is closable by narration on both backends**, on the
   first turn, with the same parser contract.
2. **The parser-skip discipline (§5.4/§5.5) works for both
   backends' phantom shapes** (Copilot's `gen_ai.system_instructions`
   echoes; Claude's refusal-narrative substring with literal
   ellipsis).
3. **14 of 15 harvest objectives are natively reachable** with
   no narration on both backends (Copilot needs the OTel
   content-capture env var; Claude needs no opt-in).
4. **Claude's native reasoning-axis is empty** at any effort
   level the CLI exposes; Branch B is required, not optional.

#### Still open after S4:

1. **Per-turn marker reliability under Branch B on Copilot.**
2. **Per-turn marker reliability under Branch B on Claude is
   bad** — 0/3 in v2 — but whether that's specific to short
   inter-task transition prose, multi-step batches, or a
   systematic model behavior is not isolated.
3. **Phrasing-trigger boundaries on Claude:** v1 refused, v2
   accepted; specific trigger words are not isolated.
4. **Copilot native reasoning-effort attribute at non-default
   effort levels (§11 Q3, Q4):** deferred sidebar; cheap to
   measure when needed.
5. **Parameterization mechanism reliability** under mechanism
   (1) manual substitution at scale.
6. **Branch A path on Copilot:** if S5 proposes Branch A for
   Copilot, the deferred sidebar runs are the prerequisite.

---

### 8. Recommendations for S5 (input to consensus, not consensus output)

S5 is the consensus session. This file does NOT pre-judge the
consensus. The following are observations S5 can take as input,
not recommendations S5 must accept:

1. **The harvest gap on both backends is now empirically a
   1-signal problem (C3), with caveats.** The 14-of-15 baseline
   coverage holds; C3 is closable; per-turn reliability is the
   asterisk.
2. **The S5 proposal should consider whether per-turn A3
   narration is worth the complexity.** Two of three S4 runs
   that could have emitted per-turn markers failed to do so
   (Claude v1 refused; Claude v2 dropped them silently);
   Copilot didn't test the case. Session-start-only A3 may be
   the right scope.
3. **The S5 proposal should commit to a CLAUDE.md/AGENTS.md
   template** (exact wording) rather than free-form instruction
   prose, given the phrasing-sensitivity demonstrated on Claude.
4. **The S5 proposal should address parameterization mechanism**
   explicitly — at minimum a `§7.5 mechanism (2)` operator-side
   build step that reads from `session-state.json` and writes a
   pre-substituted instruction file. Manual substitution is a
   known failure-shape; the parser catches one failure mode but
   not the operational rate.
5. **The S5 proposal can rescope Sets 037-041 (launch-adapter
   roadmap) significantly** — if the harvester only needs to
   surface C3 + session-start A3, and the other 14 signals are
   native, the launch-adapter approach for state-file-watching
   is materially smaller than originally scoped.

6. **S5 may need to ask whether instruction-driven narration
   is viable on Claude at all.** Given the observed phrasing-
   sensitivity (v1 refusal) and per-turn unreliability (v2
   skip), the CLAUDE.md delivery mechanism may be too fragile
   for a production observability path. The hook-based
   injection channel (rejected in design §7.2 for parser-
   symmetry reasons) should be reconsidered in light of the
   S4b evidence, even at the cost of doubling the parser's
   search surface.

7. **S5 may need to simplify the Branch A/B design.** Per-turn
   narration is unreliable on Claude (0/3 in v2) and untested
   on Copilot. A simpler design might mandate `phase=session-
   start` markers for C3 on both backends and either abandon
   per-turn markers entirely, source A3 from the session-start
   marker only, or accept A3 as a native-only signal (Branch A
   on backends where it's available, omitted on backends where
   it isn't).

8. **S5 may need to be expanded into a re-design session.**
   The S4b findings introduce foundational uncertainty about
   the narration strategy that goes beyond "tune the v1
   contract." If S5 concludes the design needs material
   revision, S6 should be deferred to a follow-on set (Set
   045) rather than attempting implementation under a
   destabilized contract.

---

### 9. Verdict for S4 (S4a + S4b combined)

- The v1 narration design **works at the parser-contract level**:
  same regex, same output shape, same skip rules, both backends.
- The v1 design **partially works at the producer-compliance
  level**: turn-0 markers land on both backends under correct
  conditions; per-turn markers do NOT land reliably on Claude;
  Copilot per-turn discipline is untested.
- The **C3 closure is real but conditional on phrasing
  discipline on Claude** and on **OTel env-var setup on Copilot**.
- **A3 closure is partial on Claude, untested on Copilot.**
- **The other 13 objectives are natively reachable** and do not
  depend on narration.
- The combined evidence supports a **1-signal-with-caveats**
  narration scope for S5's proposal, not the originally-scoped
  multi-signal narration the design started from.

**S4 status: COMPLETE. S5 owns the consensus + proposal pass.**
