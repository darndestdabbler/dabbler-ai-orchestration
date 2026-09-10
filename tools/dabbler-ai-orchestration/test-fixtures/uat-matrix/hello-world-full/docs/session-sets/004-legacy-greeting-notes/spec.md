# Legacy greeting notes

> **Purpose:** Capture the original greeting copy decisions in a notes doc.
> **Session Set:** `docs/session-sets/004-legacy-greeting-notes/`
> **Created:** 2026-05-20
> **Workflow:** full
> **Prerequisite:** None

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
uatStyle: ad-hoc
totalSessions: 2
```

> Rationale: a small documentation set that closed before the v4
> state-file schema landed. Its `session-state.json` is deliberately
> still schema v3 — in the UAT fixture matrix this is the
> needs-migration row: the Explorer shows the quiet asterisk with the
> "Ran under schema v3" tooltip and offers `Migrate to v4 schema` on
> the row menu.

---

## Project Overview

Two short sessions that wrote down why the greeting says what it says,
so future copy edits have context.

---

## Sessions

### Session 1 of 2: Draft the notes

**Goal:** A first draft of `docs/greeting-notes.md`.
**Steps:**
1. Collect the copy decisions from the page history.
2. Draft the notes doc.
**Creates:** `docs/greeting-notes.md`
**Touches:** —
**Ends with:** Draft committed.
**Progress keys:** `session-001/draft`

---

### Session 2 of 2: Review and close

**Goal:** Reviewed notes; set closed.
**Steps:**
1. Tighten the draft.
2. Verify and close the set.
**Creates:** `change-log.md`
**Touches:** `docs/greeting-notes.md`
**Ends with:** Set closed.
**Progress keys:** `session-002/review`, `session-002/verified`

---

## End-of-set deliverables

- `docs/greeting-notes.md` recording the greeting copy decisions.
