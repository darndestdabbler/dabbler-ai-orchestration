# Log-Harvest Implementation

> **Purpose:** implement the dual-primary log-harvest observability
> architecture locked by Set 044's consensus-audited proposal:
> Python launch wrapper + per-backend native-log parsers + joiner +
> Explorer surface, designed and shipped together.
> **Created:** 2026-05-23 (stub — Set 044 / S5 close-out).
> **Status:** STUB — sessions are scaffolded but specifics need
> first-session detail pass when this set begins.
> **Session Set:** `docs/session-sets/045-log-harvest-implementation/`
> **Prerequisites:**
> - Set 044 closed (proposal locked; consensus journal recorded).
> - Set 036 closed (writer-side discipline shipped first).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Relationship to other sets:**
> - **Inherits the locked architecture from Set 044's
>   [`proposal.md`](../044-ai-chat-log-discovery-and-experiments/proposal.md)
>   v1** and its consensus audit
>   [`proposal-consensus-journal.md`](../044-ai-chat-log-discovery-and-experiments/proposal-consensus-journal.md).
> - **Replaces** the retired Sets 037-041 (per-provider launch
>   adapter roadmap). Sets 037-041 are CANCELLED with citations
>   back to Set 044's proposal.
> - **Independent of** Sets 042-043 (chat-interface foundations);
>   the wrapper architecture is forward-compatible with whichever
>   direction those sets land on.
> - **Does not modify** the writer-side lifecycle discipline that
>   Set 036 implements; this set is observation-only and reads
>   `session-state.json` as truth.

---

## Session Set Configuration

```yaml
totalSessions: 6
requiresUAT: true
requiresE2E: true
uatScope: per-set
uatStyle: ad-hoc
effort: high
```

> **Rationale:** the joiner + conflict-detection semantics + dual-
> channel reconciliation are the engineering center of gravity.
> The Explorer changes are operator-visible and warrant ad-hoc UAT.
> The session count and effort estimate may revise at first-session
> detail pass; the stub locks the architectural scope, not the
> session-by-session breakdown.

---

## Project Overview

- **Scope:** ship the dual-primary log-harvest architecture as a
  cohesive deliverable. Set 044 locked the design; this set
  implements it end-to-end.
- **Goal:** the Session Set Explorer can honestly display
  orchestrator state for AI sessions running both inside the
  Dabbler writer path AND outside it (free-running terminal /
  IDE sessions / scripts), detect coordination conflicts, and
  surface writer-bypass file writes.
- **Method:**
  1. First session: open empirical questions carried from Set 044
     (bypass rate, deterministic correlation, joiner location).
  2. Joiner-first implementation: design conflict-detection
     semantics, then derive the canonical Harvest Record schema,
     then build the producer channels (wrapper + parsers +
     narration template) to that schema.
  3. Explorer integration and UAT.
- **Non-goals:**
  - Codex / Gemini parsers (deferred follow-on if needed).
  - Interactive TTY-passthrough mode on Windows for the wrapper
    (headless-only in this set).
  - Hook-channel per-turn narration on Claude (revisit only if
    per-turn fidelity becomes operationally important).
  - A Dabbler-owned chat-replay UI (separate question, Sets
    042-043).

---

## Locked architectural commitments (from Set 044 proposal v1)

These are FIXED by Set 044's cross-provider consensus and should
NOT be relitigated by Set 045 sessions. Any revision requires a
new audit pass.

1. **Dual-primary channels.** Wrapper + native-log parsing are
   co-equal, not primary-and-fallback. Both must be
   production-grade.
2. **Per-turn narration is permanently OUT of the contract.**
   v1.1 narration is session-start-only on both backends.
3. **Wrapper location**: `ai_router/` as a sibling to
   `start_session.py`.
4. **Headless mode first**; interactive TTY-passthrough deferred.
5. **Ungated-default** for Dabbler-launched sessions when the
   wrapper exists.
6. **Wrapper retires Set 037's `LaunchAdapter`/`LaunchPlan`
   contract.** Sets 038-041 stay cancelled.
7. **Joiner is the engineering center of gravity.** Producer
   schemas are derived from joiner needs, not committed before
   joiner design.

---

## Open empirical questions to resolve in Session 1

Carried from Set 044's proposal v1 §6. These are explicitly
the focus of the first session's spike work; they should be
resolved before the joiner is designed:

1. **Bypass rate.** What fraction of real-world AI sessions are
   Dabbler-launched vs. free-running? Self-observation period;
   target: 1-2 weeks of operator activity tracked. Determines
   the actual coverage split between channels and the relative
   investment priority.
2. **Deterministic wrapper-to-native-log correlation.** Build a
   minimal `dabbler-launch` prototype that writes a launch
   record, then prove the launch record can be joined 1:1 to
   the AI's native log records via `(workspace_cwd, time_window,
   conv_id)` keys. The `conv_id` is AI-generated after subprocess
   spawn; the binding must work despite that.
3. **Claude phrasing-trigger ablation.** S4b distinguished v1
   (refused) from v2 (accepted) by changing multiple framings
   simultaneously. Isolate which specific phrasing element
   triggers Claude's injection classifier so the v1.1
   canonical template can be written defensively.
4. **Joiner location**: Python (sibling to `ai_router`, easier
   headless testing) vs TypeScript (inside extension, in-process
   with Explorer webview). Pass A 2-1 favored Python but the
   decision was deferred to Session 1 prototype performance
   inspection.

---

## Sessions (stub — refine at start-of-set)

### Session 1 of 6: Open-question spike + joiner location decision

**Steps:**
1. Implement minimal `dabbler-launch` prototype (headless only,
   one backend) that writes launch records to `~/.dabbler/`.
2. Prove deterministic correlation between wrapper records and
   AI-native log records on a battery of synthetic sessions.
3. Run the Claude phrasing-trigger ablation against the synthetic-
   set; isolate the specific trigger element(s).
4. Start the bypass-rate self-observation log.
5. Prototype the joiner in BOTH Python and TypeScript on a
   minimal slice (one backend, one conflict scenario);
   benchmark + measure IPC complexity; LOCK the joiner location.
6. Cross-provider verification of the four resolutions.

**Creates:**
- `docs/session-sets/045-log-harvest-implementation/open-question-resolution.md`
- `~/.dabbler/launch-log.jsonl` (operator-local; first records)
- `joiner-location-decision.md`

**Ends with:** four open questions resolved with empirical
evidence; joiner location locked.

### Session 2 of 6: Joiner design + canonical schema

**Steps:**
1. Specify the joiner's conflict-detection semantics in full:
   coordination-conflict states, out-of-band-write states,
   resolution priorities, output shape.
2. Derive the canonical Harvest Record schema FROM the joiner's
   needs (not as the v0 proposal §4.1 stub).
3. Implement the joiner skeleton in the chosen language (per
   Session 1).
4. Layer-1 / Layer-2 coverage of the joiner.

**Creates:**
- `joiner-spec.md`
- joiner implementation (path TBD per location decision)

### Session 3 of 6: Wrapper + Copilot parser

**Steps:**
1. Implement `dabbler-launch` Python CLI (headless mode), writing
   to the canonical Harvest Record schema from Session 2.
2. Implement Copilot OTel JSONL parser.
3. Wire wrapper + parser into joiner.
4. Layer-1 / Layer-2 coverage.

**Creates:**
- `ai_router/dabbler_launch.py`
- Copilot parser module
- Test fixtures

### Session 4 of 6: Claude parser + narration v1.1 template

**Steps:**
1. Implement Claude `~/.claude/projects/` JSONL parser.
2. Author the canonical CLAUDE.md / AGENTS.md narration templates
   per the Session 1 phrasing-trigger ablation results.
3. Extension command: regenerate narration templates from
   current `session-state.json`.
4. Layer-1 / Layer-2 coverage.

**Creates:**
- Claude parser module
- Canonical narration templates
- Extension command implementation

### Session 5 of 6: Explorer integration + Layer-3 coverage

**Steps:**
1. Wire harvester output into the Explorer webview.
2. Per-row badges showing harvested signal availability.
3. Conflict-warning surface (visible when joiner detects a
   coordination conflict or writer-bypass write).
4. Layer-3 Playwright coverage of the new Explorer surface.

**Creates:**
- Extension UI changes
- Layer-3 test scenarios

### Session 6 of 6: UAT + change-log + cross-tier docs + release

**Steps:**
1. Ad-hoc UAT checklist for the Explorer changes.
2. Operator-walkthrough of the dual-channel setup story
   (wrapper invocation; narration template usage).
3. `change-log.md` summarizing what shipped.
4. Cross-tier consumer-repo docs update (the wrapper is a
   consumer-facing artifact).
5. Dual-registry release: PyPI (`dabbler-ai-router` with
   `dabbler-launch` entry point) + VS Code Marketplace
   (extension with harvester + Explorer surface).

**Creates:**
- `change-log.md`
- `045-log-harvest-implementation-uat-checklist.json`
- Cross-tier doc updates
- Release notes for both registries

---

## Progress keys

- session-001/open-questions-resolved
- session-001/joiner-location-locked
- session-002/joiner-spec-written
- session-002/canonical-schema-derived
- session-003/wrapper-shipped
- session-003/copilot-parser-shipped
- session-004/claude-parser-shipped
- session-004/narration-template-v11-shipped
- session-005/explorer-integrated
- session-005/layer-3-coverage-added
- session-006/uat-checklist-written
- session-006/change-log-written
- session-006/dual-registry-released

---

## Note on this stub

This spec.md is a **stub authored at Set 044 close-out** to
capture the consensus context while it was fresh. The
architectural commitments (§"Locked architectural commitments")
are firm. The session breakdown is provisional and should
revise at first-session start-of-set detail pass.

The session count, effort estimate, and exact session-by-session
scope should be confirmed by the first session's orchestrator
before commitment. If first-session work reveals the scope is
larger than 6 sessions, propose splitting into 045 +
follow-on rather than expanding 045 past 6 sessions.
