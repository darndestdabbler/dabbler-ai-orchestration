# Style the greeting

> **Purpose:** Give the hello page a small stylesheet.
> **Session Set:** `docs/session-sets/002-style-the-greeting/`
> **Created:** 2026-06-02
> **Workflow:** full
> **Prerequisite:** `001-hello-page` must be complete.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
uatStyle: ad-hoc
totalSessions: 2
prerequisites:
  - slug: 001-hello-page
    condition: complete
```

> Rationale: styling builds on the finished page, so this set is
> blocked until `001-hello-page` closes. In the UAT fixture matrix this
> is the REAL-pending blocked row — the prerequisite exists and is
> in-progress, so the chain marker should render and its tooltip should
> name the slug and its current state.

---

## Project Overview

A stylesheet for the hello page: typography for the greeting, a muted
treatment for the date stamp.

---

## Sessions

### Session 1 of 2: Add the stylesheet

**Goal:** A `css/hello.css` linked from the page.
**Steps:**
1. Create `css/hello.css` with the heading + date styles.
2. Link it from `index.html`.
**Creates:** `css/hello.css`
**Touches:** `index.html`
**Ends with:** The page renders with the new styles.
**Progress keys:** `session-001/stylesheet`, `session-001/link`

---

### Session 2 of 2: Dark-mode pass

**Goal:** The page respects `prefers-color-scheme: dark`.
**Steps:**
1. Add the dark-mode media query.
2. Verify both schemes and close the set.
**Creates:** `change-log.md`
**Touches:** `css/hello.css`
**Ends with:** Set closed; both color schemes look right.
**Progress keys:** `session-002/dark-mode`, `session-002/verified`

---

## End-of-set deliverables

- A styled hello page with dark-mode support.
