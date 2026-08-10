# Terminology change: "sanctioned writer"

> **Status:** open work item, recorded 2026-08-10 at the operator's
> request. Not yet applied.
>
> **Why:** the repo currently calls its authorized state-file writers
> **"blessed writers."** The operator finds that usage religiously
> offensive. The term is to be replaced repo-wide.

## The replacement

**`sanctioned writer`** — and correspondingly *"sanctioned by"*,
*"sanctioned transition"*, *"sanctioned-writer bookkeeping"*.

This is not a new coinage. **`sanctioned` already appears 339 times** in
this repo, in exactly this sense — *"the sanctioned remediation loop"*,
*"every refusal teaches the sanctioned Step 6 command"*. One line in
`ai_router/CHANGELOG.md` already reads *"the blessed writer for the
sanctioned `out-of-band-or-none` → ... transition"*, which is the whole
argument: the two words are being used interchangeably, and only one of
them is a problem.

Rejected alternatives: `authorized` (also common, but overloaded here by
`--operator-authorized-round`), `designated` (rare in this repo, 28 uses),
`canonical` (3,819 uses, but it means "the authoritative version of a
thing", not "the only thing permitted to write").

## Scope

| surface | matches | files | recommendation |
| :--- | ---: | ---: | :--- |
| Python code (comments, docstrings, messages) | 32 | 14 | **replace** |
| Live docs | 26 | 18 | **replace** |
| TypeScript code | 7 | 6 | **replace** |
| Engine bootstrap (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) | 3 | 3 | **replace** — keep the three in lockstep |
| Other | 5 | 5 | **replace** |
| **Live surface subtotal** | **73** | **46** | |
| Session-set specs (historical) | 185 | 93 | operator's call — see below |
| `CHANGELOG.md` (historical) | 13 | 2 | operator's call — see below |
| **Total** | **271** | **136** | |

**On the historical surface.** Set 116 S1 set a precedent when it corrected
stale test timings: its sweep *"deliberately left historical specs,
changelogs, and the benchmark script alone — those are records."* By that
rule the 198 historical matches would stay. **That rule was written about
stale numbers, not about a word the operator objects to**, so it should not
be applied automatically here. Two defensible options:

1. **Live surface only (73 matches, 46 files).** Everything an orchestrator
   reads or that ships changes; completed session specs and changelogs
   remain untouched as the record of what was said at the time.
2. **Everywhere (271 matches, 136 files).** Mechanical, and removes the
   term from the operator's own repo entirely.

**Recommendation: option 1 now, option 2 available at any time** — it is a
single scripted replacement and carries no behavioural risk. Nothing in the
codebase keys on the string; it appears only in prose, comments and
operator-facing messages.

## Notes for whoever applies it

- **No behaviour changes.** Verify with a full pytest run; there should be
  no test that asserts on the word. If one does, that assertion is the
  finding.
- **Keep the three engine bootstrap files in lockstep** — they share one
  body by policy, and the preload manifest counts the largest as
  representative. `blessed` → `sanctioned` is +2 characters and does not
  threaten any ceiling.
- **Fix the casing variants** — `Blessed writer:` appears as a bolded label
  in `docs/ai-led-session-workflow.md`.
- Prefer rewording over substitution where the sentence reads better
  without the adjective at all: *"the writers that own this shape"*,
  *"only `session_state.py` writes this."*
