# Developer approachability

> **Purpose:** Reduce new-developer intimidation without breaking
> any consumer or removing load-bearing functionality. Three
> specific problems identified in Set 020's audit drive this set:
>
> 1. **No entry point.** A developer opening the repo has no short
>    path to "I understand what this does." CLAUDE.md points at a
>    1,752-line workflow doc and nothing else.
> 2. **The workflow doc is structured for an AI executing a session,
>    not a human understanding the system.** UAT, outsource-last,
>    adjudication, and 16 rules all appear as flat peers to the
>    3-step happy path.
> 3. **`ai_router/` looks like a 20-module black box.** No quick
>    hierarchy, one 1,677-line entry point, two orphaned migration
>    utilities, no module-level orientation.
>
> The 25% complexity-reduction target is framed as:
> **"lines a developer needs to read before feeling oriented"
> vs. "total lines"** — not raw line-count deletion.
>
> **Created:** 2026-05-11
> **Session Set:** `docs/session-sets/021-developer-approachability/`
> **Prerequisite:** Set 020 closed (`8c4c89b`). The simplification-proposal.md
> from Set 020 is the input to this set's scope.
> **Workflow:** 2 sessions. Session 1 = quick-start + workflow doc restructure
> (doc-only). Session 2 = `ai_router/` cleanup (code changes).

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: normal
```

> Rationale: doc + small-code work; no UI surface. Two sessions
> because the workflow doc restructure (Session 1) has different
> risk and verification needs from the module extractions (Session 2).
> Cross-provider verification at end of each session.

---

## Project overview

### What the set delivers

**Session 1 — Quick-start + workflow doc restructure:**

1. **`docs/quick-start.md` (new, ~150 lines)** — the entry point
   a new developer finds before the full workflow doc. Sections:
   - What this framework does (3 sentences)
   - The two adoption paths: Lightweight vs. Full (one paragraph each)
   - The minimal spec file (copy-paste example)
   - The 5-step happy path for a Full-tier session (steps only,
     no detail — links to the full workflow doc for each)
   - Where to go next (3 links: workflow doc, authoring guide,
     adoption bootstrap)

2. **`docs/ai-led-session-workflow.md` restructured** — same file,
   same total content, but organized into two clearly-labeled halves:
   - **Core (read first):** ~400 lines. Steps 0–10 (each step
     as a tight paragraph or short bullet list — prose elaborations
     move to the reference half), the config-block overview as a
     compact table, Rules 1–8 and 12–16, Orchestrator Instruction
     Files, Switching Orchestrators. A developer can read this in
     20 minutes and understand 80% of the framework.
   - **Reference (read when relevant):** All current content that
     isn't in the core: UAT Checklist Rules (both paths), E2E
     gate, adjudication ladder, delegation discipline, outsource-last
     queue flow, parallel trigger variants, cost-budgeted modes,
     AI Router Details, Task Types table. Separated by a prominent
     `---` divider with a navigation note: "Stop here for
     `requiresUAT: false` + `outsourceMode: first` sessions. Read
     on when you need UAT, outsource-last, adjudication, or
     delegation details."

3. **`docs/adoption-bootstrap.md` Step 6 pattern catalog simplified**
   — replace the 7-item abstract pattern catalog with 3 concrete
   example organizations (e.g., "UI-form feature: one session per
   form flow + one testing session," "data migration: schema →
   ETL → validation," "API surface: one set per major endpoint
   group"). Abstract patterns become a brief appendix note.

4. **Spec template simplified** — the wizard's
   `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts`
   and the workflow doc's spec-template snippet currently show all
   7 config flags with comments. The template should lead with the
   3 most common flags (requiresUAT, requiresE2E, outsourceMode)
   and move uatStyle, uatScope, effort, totalSessions to a
   "set these if needed" secondary block with a "(optional, see
   authoring guide)" note.

**Session 2 — `ai_router/` cleanup:**

5. **Extract `ai_router/queue_verification.py` (new)** — move
   `_wait_for_verifications()`, `_discover_queue_providers()`,
   `_lookup_message()`, and `_MessageOutcome` out of
   `ai_router/close_session.py`. The main close-out script imports
   the function unchanged. `close_session.py` drops from 1,677 to
   ~1,350 lines; the queue machinery has a discoverable home.

6. **Archive migration utilities** — move `ai_router/backfill_session_state.py`
   and `ai_router/dump_session_state_schema.py` to
   `ai_router/scripts/`. After confirming all consumer repos are
   on schema v2, remove the v1 compatibility path in
   `session_state.py` (confirm with grep across consumers first).

7. **Module-level orientation docstrings** — add a 3-line summary
   docstring at the top of each major `ai_router/` module naming
   its purpose, its primary consumer (Full-tier / platform-only /
   all tiers), and what to read next if you need more. Target
   modules: `close_session.py`, `session_state.py`,
   `gate_checks.py`, `disposition.py`, `queue_db.py`,
   `worktree.py`, `notifications.py`. Not in the existing-
   docstring-on-top-of-docstring style — these replace or extend
   the opening line of the module docstring.

8. **`ai_router/` `__init__.py` orientation comment** — add a
   20-line module map near the top of `ai_router/__init__.py`
   listing the key modules and what they do:

   ```python
   # Key modules:
   #   __init__.py          route() — the public routing entry point
   #   close_session.py     close-out gate (Full-tier)
   #   session_state.py     lifecycle snapshot + events (Full-tier)
   #   gate_checks.py       deterministic close-out gates (Full-tier)
   #   disposition.py       per-session outcome record (Full-tier)
   #   queue_verification.py  outsource-last verification wait (platform only)
   #   worktree.py          worktree lifecycle CLI
   #   notifications.py     session-complete push notifications
   #   router-config.yaml   model selection, task types, tier mapping
   ```

### Non-goals

- **No behavioral changes.** Every route, gate, verification flow,
  and close-out mode works identically before and after. The edits
  are structure and docs.
- **No flag removal.** uatStyle, uatScope, etc. remain in the spec;
  they just aren't front-and-center in the template.
- **No consumer updates.** The restructured workflow doc keeps all
  existing section headings and Rules numbering. Instruction files
  (CLAUDE.md, AGENTS.md, GEMINI.md) only need updating if they
  reference specific line numbers (they don't — they reference
  section names).
- **No deletion of UAT/E2E rules.** The UAT Checklist Rules, the
  adjudication ladder, and the delegation discipline stay in the
  reference half. They move, not disappear.
- **No router-config.yaml pruning this set.** Task-type taxonomy
  reduction requires auditing metrics.jsonl first. Defer to Set 022
  or a standalone cleanup set after that audit.

---

## Expected developer-experience change

A developer encountering this repo after Set 021 lands:

1. Opens `docs/quick-start.md` — 5 minutes to oriented.
2. Opens `docs/ai-led-session-workflow.md` — sees the "Core" half
   first (~400 lines vs. 1,752). Reads the tight Steps 0–10 and
   understands the happy path in another 10 minutes.
3. Opens `ai_router/` — sees `__init__.py` module map; navigates
   to `close_session.py` or `session_state.py` depending on what
   they're debugging; finds the queue machinery in
   `queue_verification.py`.

That path — from "never seen this before" to "I understand the
framework" — currently takes 90+ minutes of unguided reading. The
target is 20–30 minutes. That is the 25% reduction being
tracked here.

---

## Sessions
### Session 1 of 2: Quick-start + workflow doc restructure

**Goal:** A new developer can understand the framework in 20 minutes
without having to read the full workflow doc end-to-end.

**Steps:**

1. **Register Session 1 start.**
2. **Read prerequisites:** quick-start doc from Set 020 proposal,
   current `docs/ai-led-session-workflow.md` (scan for section
   boundaries), workflow doc instruction-file pointers to confirm
   nothing hardcodes line numbers.
3. **Author `docs/quick-start.md`.** Tight, scannable. Five
   sections: what it does, Lightweight vs. Full, minimal spec
   example, 5-step happy path as a compact ordered list, where
   to go next.
4. **Add quick-start link to `CLAUDE.md`, `AGENTS.md`,
   `GEMINI.md`.** Each instruction file currently points at the
   workflow doc for the full procedure. Add one line under that
   pointer: "For a 5-minute introduction, see `docs/quick-start.md`."
5. **Restructure `docs/ai-led-session-workflow.md`:**
   - Write the Core half (~400 lines): tight Steps 0–10, compact
     config-block table, Rules 1–8 and 12–16, Orchestrator
     Instruction Files, Switching Orchestrators.
   - Add the navigation divider with the "stop here for simple
     sessions" note.
   - Move everything else into the Reference half (content is
     preserved exactly; only its position in the file changes).
6. **Simplify the bootstrap pattern catalog** — replace 7 abstract
   patterns with 3 concrete examples + a one-line pointer to
   "more patterns at [link]" for authors who want depth.
7. **Update spec templates** (wizard + workflow doc snippet) — lead
   with 3 primary flags; demote 4 secondary flags.
8. **Operator approval gate** — show the restructured doc and
   quick-start for review before committing.
9. **Verification route** — `route(task_type="session-verification")`
   on the core half of the restructured doc plus the quick-start.
   Question to verifier: "Does the core half (Steps 0–10, rules,
   config table) give a developer everything they need to run a
   simple `requiresUAT: false`, `outsourceMode: first` session
   without reading the reference half?"
10. **Author Session 1 close-out artifacts.** Commit. Do not push —
    holding for end-of-set.

**Creates:**
- `docs/quick-start.md` (new)
- All Session 1 close-out artifacts

**Touches:**
- `docs/ai-led-session-workflow.md` (restructure)
- `docs/adoption-bootstrap.md` (pattern catalog simplification)
- `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts` (template)
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` (quick-start pointer)

**Ends with:** `docs/quick-start.md` exists; workflow doc reads core-first;
verification confirms the core half is self-sufficient for simple sessions.

---

### Session 2 of 2: `ai_router/` cleanup

**Goal:** A developer opening `ai_router/` can understand the module
hierarchy in under 5 minutes and navigate to what they need.

**Steps:**

1. **Register Session 2 start.**
2. **Read prerequisites:** Session 1 close-out artifacts; current
   `ai_router/close_session.py` (queue-related functions);
   `ai_router/__init__.py` opening; consumer repos for schema-v2
   confirmation.
3. **Confirm v2 schema completeness.** Grep all consumer repos for
   `"schemaVersion": 1` or `"schemaVersion": null`. If any v1
   files exist, defer the v1-compat removal to a follow-up. If all
   are v2, proceed with the backfill removal.
4. **Create `ai_router/queue_verification.py`** — extract
   `_wait_for_verifications`, `_discover_queue_providers`,
   `_lookup_message`, `_MessageOutcome` from `close_session.py`.
   Wire the import in `close_session.py`. Update tests to import
   from the new module where needed.
5. **Archive migration utilities** — move `backfill_session_state.py`
   and `dump_session_state_schema.py` to `ai_router/scripts/`.
   Remove from `ai_router/__init__.py` exports if exported. If v2
   confirmed in step 3, remove the v1 compatibility branch from
   `session_state.py` (the `schemaVersion: 1` read path).
6. **Add module-level orientation docstrings** to the 7 target
   modules (close_session, session_state, gate_checks, disposition,
   queue_db, worktree, notifications). Each: 1 line purpose, 1 line
   consumer tier, 1 line "see also."
7. **Add module map comment** to `ai_router/__init__.py`.
8. **Run `python -m pytest ai_router/tests/` — must stay green.**
9. **Operator approval gate.** Show the extracted module, the
   archived utilities (or the deferral note), and the docstring
   samples.
10. **Verification route** — `route(task_type="session-verification")`
    on the diff. Question: "Does `close_session.py` read clearly
    without the queue functions? Do the module docstrings give a
    developer accurate 3-line orientation?"
11. **Author end-of-set artifacts.** Push Session 1 + Session 2
    commits together. Run `close_session`.

**Creates:**
- `ai_router/queue_verification.py` (new)
- `ai_router/scripts/backfill_session_state.py` (moved)
- `ai_router/scripts/dump_session_state_schema.py` (moved)
- All Session 2 close-out artifacts

**Touches:**
- `ai_router/close_session.py` (queue functions removed, import added)
- `ai_router/session_state.py` (v1 compat removal, if confirmed safe)
- `ai_router/__init__.py` (module map comment; export cleanup)
- `ai_router/tests/` (update imports from new module)
- 7 target module docstrings

**Ends with:** `ai_router/` is navigable; `close_session.py` is ~1,350 lines;
backfill utilities are archived; all tests green; Set 021 closed.

---

## Acceptance criteria for the set

- [ ] `docs/quick-start.md` exists; covers the 5 sections; readable in under 5 minutes.
- [ ] `docs/ai-led-session-workflow.md` has a Core half (~400 lines) followed by a labeled Reference half; the Core half is self-sufficient for `requiresUAT: false` + `outsourceMode: first` sessions (confirmed by Session 1 verifier).
- [ ] `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` each link to `docs/quick-start.md`.
- [ ] Bootstrap pattern catalog uses concrete examples; 7-item abstract list is either removed or in an appendix.
- [ ] Spec template in wizard + workflow doc leads with 3 primary flags; 4 secondary flags are demoted.
- [ ] `ai_router/queue_verification.py` exists with the extracted queue functions; `close_session.py` imports from it.
- [ ] `backfill_session_state.py` and `dump_session_state_schema.py` are archived (moved to `ai_router/scripts/`).
- [ ] 7 target `ai_router/` modules have orientation docstrings.
- [ ] `ai_router/__init__.py` has the module map comment.
- [ ] `python -m pytest ai_router/tests/` stays green (741/743 baseline, same pre-existing flakes).
- [ ] Both sessions' verification routes return VERIFIED (or ISSUES_FOUND resolved in-session).
- [ ] All five close-out gates pass.
- [ ] No behavioral changes to any route, gate, verification flow, or close-out mode.

---

## Risks

- **Workflow doc restructure breaks an instruction-file pointer.**
  All three instruction files reference the workflow doc by section
  name, not line number. Mitigation: keep all section heading text
  identical; the restructure moves sections, doesn't rename them.
- **"Core half" is too thin and breaks orchestrators reading the
  doc.** If Steps 0–10 are tightened too aggressively, a Session 1
  verifier will catch the gap. Mitigation: the Session 1 approval
  gate gives the operator a read before the verifier route fires.
- **v1 compat removal breaks a consumer with old state files.**
  Mitigation: the v2 grep in Session 2 step 3 is a hard gate —
  the removal doesn't happen if any consumer file is pre-v2.
- **Queue extraction breaks close_session tests.** The test suite
  mocks `close_session._wait_for_verifications` at the close_session
  module. After extraction, mocks need to target
  `queue_verification._wait_for_verifications`. Mitigation:
  step 8 (run tests) immediately after extraction.
- **Module docstrings conflict with existing top-of-file docstrings.**
  Some modules already have multi-paragraph module docstrings.
  The 3-line orientation summary replaces or prepends to the first
  line, not appends to the end. Mitigation: read each target module
  before editing; only add where clarity improves.

---

## References

- Set 020 `simplification-proposal.md` — source of the HC-1, HC-3,
  HC-4, HC-6 cuts implemented here.
- Set 020 `audit-inventory.md` — bucket descriptions used in the
  quick-start and module map.
- `docs/ai-led-session-workflow.md` — primary restructure target.
- `ai_router/close_session.py` — primary code target.
- `docs/planning/project-guidance.md` — framework values this set
  must not undercut.

---

## Cost projection

| Phase | Estimated cost | Notes |
|---|---|---|
| Session 1 — Doc authoring + restructure (in-session) | $0 | No routes |
| Session 1 — End-of-session verification | $0.10–$0.20 | Single verifier; doc-only diff |
| Session 2 — Code cleanup (in-session) | $0 | No routes |
| Session 2 — End-of-session verification | $0.10–$0.20 | Single verifier; code diff |
| **Set total (metered)** | **$0.20–$0.40** | Within limited-tier envelope |

Cumulative spend through Sets 016–020: $0.21 (Sets 016-018 zero, Set
019 $0.21, Set 020 $0.23). Adding Set 021 brings the running total to
~$0.44–$0.64 — well inside any reasonable project-lifetime ceiling.
