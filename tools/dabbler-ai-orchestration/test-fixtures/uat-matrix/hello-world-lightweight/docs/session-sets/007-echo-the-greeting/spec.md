# Echo the greeting

> **Purpose:** Add an `--echo` flag that repeats the greeting twice.
> **Session Set:** `docs/session-sets/007-echo-the-greeting/`
> **Created:** 2026-06-11
> **Workflow:** lightweight
> **Prerequisite:** None

---

## Session Set Configuration

```yaml
tier: lightweight
requiresUAT: false
requiresE2E: false
uatScope: none
uatStyle: ad-hoc
verificationMode: dedicated-sessions
totalSessions: 2
```

> Rationale: Lightweight Mode B. In the UAT fixture matrix this is the
> REMEDIATION-OWED row (Set 077): both work sessions are closed, the
> appended verification session (session 3) returned `ISSUES_FOUND`
> with one open finding in `s3-issues.json`, and the remediation
> session (session 4) was opened by the blessed hand-off writer and is
> in flight — so the row description reads `remediation owed` in words
> and the `Start Next Session` copy action yields the remediation
> hand-off prompt instead of a work-session prompt.

---

## Project Overview

An `--echo` flag: prints the greeting twice on separate lines.

---

## Sessions

### Session 1 of 2: Echo flag

**Goal:** `--echo` repeats the greeting.
**Steps:**
1. Parse the flag.
2. Print the assembled line twice.
**Creates:** —
**Touches:** `hello.js`
**Ends with:** Echoed greeting prints.
**Progress keys:** `session-001/flag`

---

### Session 2 of 2: Compose with tone flags

**Goal:** `--echo` composes with `--shout` / `--quiet`.
**Steps:**
1. Echo applies after tone transforms.
2. Update the README usage table.
**Creates:** —
**Touches:** `hello.js`, `README.md`
**Ends with:** All combinations print correctly.
**Progress keys:** `session-002/compose`, `session-002/docs`

---

## End-of-set deliverables

- An `--echo` flag with tone-flag composition, verified by a dedicated
  cross-provider verification session (round 1 found one open issue;
  remediation in flight).
