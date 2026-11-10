# Hello page

> **Purpose:** Ship a hello-world page with a greeting and a date stamp.
> **Session Set:** `docs/session-sets/001-hello-page/`
> **Created:** 2026-06-01
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
totalSessions: 3
```

> Rationale: a tiny static page; build + tests + cross-provider AI
> verification are the quality bar.

---

## Project Overview

A single static page that greets the visitor and shows today's date.
Used as the control row in the UAT fixture matrix: session 2
is mid-flight, so the Explorer should show `1/3` with the in-flight
annotation and no markers of any kind.

Session 2's plan is **seeded** (`kind: "plan-step"` rows), the way
`start_session` has written it since Set 114 S2, and its first step is
logged complete. That is what makes this row exercise the whole fifth
level rather than a single logged line: one finished step, one step the
Explorer DERIVES as in flight (Set 127 — nothing on disk says so), and
one that has not started and therefore carries no start time at all.

---

## Sessions

### Session 1 of 3: Render the greeting

**Goal:** A page that says hello.
**Steps:**
1. Create `index.html` with a `#greeting` mount point.
2. Create `js/hello.js` that renders the `Hello, world!` heading.
**Creates:** `index.html`, `js/hello.js`
**Touches:** —
**Ends with:** Opening the page shows the greeting.
**Progress keys:** `session-001/page`, `session-001/greeting`

---

### Session 2 of 3: Add the date stamp

**Goal:** The page also shows today's date under the greeting.
**Steps:**
1. Extend `js/hello.js` to append a formatted date line.
2. Style the date line distinctly from the heading.
3. Verify the date renders in the operator's locale, and close.
**Creates:** —
**Touches:** `js/hello.js`, `index.html`
**Ends with:** The page shows the greeting and today's date.
**Progress keys:** `session-002/date-stamp`, `session-002/styling`

---

### Session 3 of 3: Polish and verify

**Goal:** Final pass and close-out.
**Steps:**
1. Review copy and layout.
2. Run the end-of-set verification and close the set.
**Creates:** `change-log.md`
**Touches:** `index.html`
**Ends with:** Set closed with a change log.
**Progress keys:** `session-003/polish`, `session-003/verified`

---

## End-of-set deliverables

- A hello-world page with greeting + date stamp.
