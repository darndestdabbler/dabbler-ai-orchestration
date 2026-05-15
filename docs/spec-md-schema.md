# spec.md schema — `docs/session-sets/<slug>/spec.md`

This document is the canonical structure every session set's `spec.md`
must follow. The schema is **strict where machines parse, flexible
where humans narrate**: a small fixed surface that the Session Set
Explorer, AI orchestrators, `ai_router`, and `close_session` rely on
to enumerate sessions and read configuration, with everything else
free-form.

## When this applies

Every directory under `docs/session-sets/<slug>/` that contains a
`spec.md`. The slug-named directory holds the spec, any per-session
BATONs, UAT checklists, and the generated `session-state.json` /
`activity-log.json` / `change-log.md`.

The schema applies to all four Dabbler consumer repos — `dabbler-
platform`, `dabbler-access-harvester`, `dabbler-homehealthcare-
accessdb`, `dabbler-ai-orchestration` — and to any new repo adopted
through the bootstrap prompt.

## Overview

A conforming `spec.md` has this skeleton:

```markdown
# <Title>

> **Purpose:** <one sentence>
> **Session Set:** `docs/session-sets/<slug>/`
> **Created:** YYYY-MM-DD
> **Workflow:** Lightweight | Full

## Session Set Configuration

```yaml
requiresUAT: true|false
requiresE2E: true|false
…
```

## <Optional narrative sections — any L2 headings the author needs>

## Sessions

### Session 1 of N: <verb-phrase title>
**Goal:** …
**Steps:** …
**Creates:** …
**Touches:** …
**Ends with:** …
**Progress keys:** …

### Session 2 of N: …
…
```

The **required** parts: title (L1), frontmatter blockquote,
`## Session Set Configuration`, `## Sessions`, and one `### Session
K of N: …` heading per session. Everything else is recommended or
flexible.

## Required structure

### 1. Title (L1, exactly one)

```markdown
# <Session Set Title>
```

Plain prose. Used as the human-readable name; the slug in the folder
path is the machine name.

### 2. Frontmatter blockquote

A single `>`-prefixed block immediately after the title. Three fields
are required, two more are optional but recommended:

```markdown
> **Purpose:** <one sentence describing what this set delivers>
> **Session Set:** `docs/session-sets/<slug>/`
> **Created:** YYYY-MM-DD
> **Workflow:** Lightweight | Full
> **Prerequisite:** <optional — anything the human must do before session 1>
```

`Workflow: Lightweight` declares a tier that runs without `ai_router`
(no PyPI dependency); per-session BATONs + UAT checklists drive
close-out. `Workflow: Full` declares the standard tier with router
metrics and provider routing.

### 3. Session Set Configuration (L2)

Exactly one `## Session Set Configuration` heading, immediately
followed by a fenced ```yaml block. Field reference:

```yaml
requiresUAT: true|false        # required
requiresE2E: true|false        # required
uatScope: none | per-session | full    # required when requiresUAT: true
uatStyle: ad-hoc | dsl                  # optional; default ad-hoc
effort: low | medium | high             # optional; orchestrator hint
totalSessions: <int>                    # optional; canonical session count
```

Lightweight-tier specs typically declare only `requiresUAT` /
`requiresE2E` / `uatScope` and omit router-coupled fields. Full-tier
specs add the rest. The yaml block is parsed by
`fileSystem.ts:parseSessionSetConfig` and by `ai_router`'s spec
reader; field names must match exactly.

### 4. Sessions parent (L2, named exactly `## Sessions`)

The single L2 heading that contains every session. The name is
**strict**: `## Sessions`. Legacy specs that use `## Session Plan`
must be migrated (see Migration below).

Nothing between `## Sessions` and the first `### Session 1 of N: …`
heading — any narrative belongs in a separate L2 section before
`## Sessions`.

### 5. Per-session heading (L3, format-locked)

Each session is exactly one L3 heading directly under `## Sessions`:

```markdown
### Session K of N: <verb-phrase title>
```

Rules:
- `K` and `N` are integers, **not zero-padded** in the heading.
- `K` starts at **1** for every set. Numbering is **per-set**, not
  global. A 4-session set is always `1`, `2`, `3`, `4` — never
  `005`, `006`, `007`, `008` (the global-counter pattern that
  earlier `dabbler-homehealthcare-accessdb` specs used is retired).
- `N` is the planned total. If the count is genuinely uncertain, the
  range form `### Session K of M-N: …` is allowed (e.g.,
  `Session 1 of 3-4`).
- The title is a verb phrase describing what the session ships.

**Status inline is not allowed.** Don't append `— DONE (date)` or
`— in progress` to the heading. Use the `**Result:**` block (see
Recommended below) for post-completion summaries.

#### Padding rules (where they apply)

- **Headers in spec.md**: no padding (`Session 1 of 4`).
- **Folders and file names** under the set: zero-padded so they
  sort correctly (`sessions/001-foo.md`, `uat-checklists/001-foo.json`).
- **Progress keys**: zero-padded (`session-001/uat-passed`).

## Recommended per-session subsections

Inside each `### Session K of N: …` block, the subsection labels are
bold-text lines (not nested headings) in this order. Order matters
for human scanning; bold-text format matters for grep:

```markdown
**Goal:** <one sentence — what this session ships>
**Steps:** <numbered list or bullet list of actions>
**Creates:** `path/a`, `path/b`
**Touches:** `path/c`
**Ends with:** <one sentence — success state>
**Progress keys:** `session-001/key-a`, `session-001/key-b`
**Result:** <added post-completion — outcome summary; optional>
```

Not every session needs every label. `Goal` is the most useful
single line; `Steps` is the workhorse; `Result` is added after the
session runs and serves as the durable summary.

## Flexible sections

Between the frontmatter and `## Sessions`, the author can add any L2
sections needed for the project. Common ones across the four repos:

- `## Problem Statement` — narrative framing
- `## Project Overview` — scope, stakeholders, constraints
- `## Standards` — coding/style/UAT conventions
- `## Decisions confirmed with the human (do not re-litigate)`
- `## Risks`
- `## Routing notes` — orchestrator-engine guidance per task type

These are free-form. The Session Set Explorer and `ai_router` don't
parse them; they're for humans (and for AI orchestrators reading
context).

## Migration

For specs that don't yet conform — chiefly `dabbler-homehealthcare-
accessdb`'s global-counter specs — the migration is mechanical:

1. **Renumber sessions per-set, starting at 1.** A four-session set
   that was labeled `Session 005…008` becomes `Session 1 of 4` …
   `Session 4 of 4`.
2. **Preserve the prior number** as a parenthetical at the end of the
   title: `### Session 1 of 4: frmClientDetail UAT (Old #5)`. The
   `(Old #N)` token is parser-ignorable and gives readers a trail
   back to historical references.
3. **Rename `## Session Plan` → `## Sessions`.** No tools accept the
   old name; rename in one pass per spec.
4. **Move inline status into `**Result:**` blocks.** A heading like
   `### Session 005 of set: foo — DONE (2026-05-05)` becomes
   `### Session 1 of 4: foo (Old #5)` plus `**Result:** DONE
   2026-05-05 — …` at the bottom of the session block.
5. **Re-key progress keys** to use the new per-set padded number
   (`session-001/uat-passed`, not `session-005/uat-passed`).
6. **Rename session BATONs / checklist files** under the set to the
   padded per-set number (`sessions/001-foo.md`,
   `uat-checklists/001-foo.json`).

## Worked example (Lightweight tier)

```markdown
# Detail Forms UAT

> **Purpose:** Run UAT for the four primary data-entry detail forms.
> **Session Set:** `docs/session-sets/001-forms-detail-uat/`
> **Created:** 2026-05-11
> **Workflow:** Lightweight
> **Prerequisite:** Run `ResetForUAT` in the Access Immediate Window.

## Session Set Configuration

```yaml
requiresUAT: true
requiresE2E: false
uatScope: per-session
```

## Project Overview

Detail forms are the highest-risk surface in the post-refactor
codebase. This set walks UAT through each of the four core forms.

## Sessions

### Session 1 of 4: frmClientDetail UAT (Old #5)
**Goal:** UAT-verify the client detail form's CRUD + cascade contract.
**Steps:**
1. Generate checklist JSON anchored to seed fixture rows.
2. Run `ResetForUAT`; execute checklist in uat-checklist-editor.
3. Parse failures; propose fixes one at a time.
**Creates:** `sessions/001-frmClientDetail-UAT.md`, `uat-checklists/001-frmClientDetail.json`
**Touches:** `HomeHealthCare.accdb`
**Ends with:** Checklist green; BATON written.
**Progress keys:** `session-001/checklist-generated`, `session-001/uat-passed`, `session-001/baton-written`
**Result:** DONE 2026-05-05 — 41/41 named checklist items passed across 3 UAT rounds.

### Session 2 of 4: frmBudgetServicePlan UAT (Old #6)
…
```

## Parser cheat-sheet (for AI orchestrators and tooling)

Regex anchors that reliably enumerate sessions in a conforming spec:

```
Title:                          ^# (.+)$
Sessions parent heading:        ^## Sessions\s*$
Session heading:                ^### Session (\d+) of (\d+(?:-\d+)?): (.+?)(?:\s*\(Old #\d+\))?\s*$
Config yaml block start:        ^## Session Set Configuration\s*$
Bold subsection label:          ^\*\*(Goal|Steps|Creates|Touches|Ends with|Progress keys|Result):\*\*
```

To list sessions, find the line matching the `## Sessions` regex,
then collect every L3 heading that follows until the next L2. The
session count (`N`) read from any session's heading should agree
with `totalSessions` if declared in the yaml block; mismatches are
worth surfacing as a warning.
