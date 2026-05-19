# Set 031 — AI Assignment

> **Status:** Authored at session-start (2026-05-19) by Claude Opus 4.7
> during the spec-implementation conversation. The three "open questions"
> the spec flagged for operator confirmation were asked via
> `AskUserQuestion` at session start; the answers (all three confirming
> Claude's recommendation) are recorded below. Per memory
> `feedback_ai_router_usage`, the router is reserved for end-of-session
> verification — this file was authored directly by the spec-author
> without router invocation.

---

## Session 1 of 2: Schema acceptance + journal format + workflow doc

### Three open questions (operator-confirmed at session start)

Asked via `AskUserQuestion` 2026-05-19; all three resolved to Claude's
recommended answer:

| # | Question | Operator decision |
|---|---|---|
| Q1 | Where does the implementation session set live? | **This repo (`dabbler-ai-orchestration`)** |
| Q2 | Default `categories` list — narrower or broader? | **Narrower V1: 4 mechanical categories** (`refactor-placement`, `file-layout`, `scoping`, `spec-clarification`) |
| Q3 | Journal git-tracked or gitignored? | **Committed JSONL + gitignored `consensus-decisions/` full-payload dir** |

These choices drive the default values written into
`ai_router/router-config.yaml`, the schema-validation enum lists, and
the `.gitignore` entry queued for Session 2.

### Recommended orchestrator

Claude Opus 4.7 @ effort=high. The schema + validation + AJV mirror
are cross-codebase work (Python + TypeScript) that has to stay in
parity; the journal helper is small but has to get the atomic-append
+ hashing right on first land or the audit trail is unreliable.
Opus is the right choice for keeping two-language implementations
aligned.

### Rationale

The schema is the contract that consumer repos enable against. Drift
between the Python loader's accepted shape and the AJV mirror used by
the visual config editor would surface as opaque "valid YAML, rejected
by the editor" reports later — fix it once here. Round-A verification
catches any cross-cutting wording drift between the schema, the
workflow doc, and the helper docstrings.

### Estimated routed cost

$0.05 – $0.15 (single end-of-session verification with gemini-pro;
no audit cycle since the design was three-way approved 2026-05-17 per
`docs/planning/delegation-consensus-config.md`).

### Constraint reminders

- `feedback_ai_router_route_result_handling`: not invoked this session
  beyond the end-of-session verifier; verifier call follows the
  dump-result-to-JSON-before-attribute-access pattern.
- `feedback_audit_then_spec_for_substantial_features`: audit phase
  intentionally skipped — design already three-way approved.
- `feedback_prefer_ai_consensus_over_human_prompt`: Q1–Q3 were the
  three taste/scope calls the design doc reserved for the operator;
  every other in-session call goes via Claude's best judgment.

### NTE budget

$5 (set-level), confirmed at session start 2026-05-19. Session 1
forecast leaves ample headroom for Session 2's smaller diff.

---

## Session 2 of 2: Per-agent pointers + PyPI release + cross-repo notification + close-out

### Recommended orchestrator

Claude Sonnet 4.6 @ effort=medium **or** Claude Opus 4.7 @
effort=medium. The work is mechanical: three identical pointer lines,
a CHANGELOG entry, a version bump, the PyPI release script, three
cross-repo CLAUDE.md edits, a `.gitignore` entry, and final-session
close-out. Sonnet handles this size of mechanical work reliably and
costs less per token. Opus is the safer pick only if Round-A
verification in Session 1 flagged anything that needs deeper attention
in Session 2.

### Rationale

The risky bit is the PyPI release (irreversible — can only roll
forward by bumping to 0.5.1). Session 1 covers the testable surface;
Session 2's job is to ship without surprises. Cross-repo notification
is byte-identical copy-paste across three consumer repos; keep-in-sync
discipline matters but the cognitive load is low.

### Estimated routed cost

$0.02 – $0.10 (single end-of-session verification; smaller diff than
Session 1).

### Constraint reminders

- Operator-gated PyPI publish (Session 2 step 4) — confirm shape
  before `twine upload`.
- Cross-repo notification one-liners are byte-identical across all
  three consumer repos per the keep-agent-instruction-files-in-sync
  convention.
- `.gitignore` adds `ai_router/consensus-decisions/` (full-payload
  dir) — per Q3 the JSONL itself stays committed.
