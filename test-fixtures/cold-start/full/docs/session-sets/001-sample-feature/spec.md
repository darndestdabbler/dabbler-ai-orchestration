# Sample feature

> **Purpose:** A representative consumer set used by the cold-start fixtures.
> **Session Set:** `docs/session-sets/001-sample-feature/`
> **Created:** 2026-06-09
> **Workflow:** full
> **Prerequisite:** None

---

## Session Set Configuration

```yaml
tier: full                         # full | lightweight — see the tier model SSoT (link below)
requiresUAT: false                     # true | false | "suggested"
requiresE2E: false                     # true | false | "suggested"
uatScope: none                         # none | per-session | per-set (only when requiresUAT)
uatStyle: ad-hoc                       # ad-hoc | dsl (only when requiresUAT)
totalSessions: 3
# prerequisites:                       # uncomment if this set depends on another
#   - slug: <prerequisite-slug>
#     condition: complete
```

> **Tier:** `full` | `lightweight` is the single switch. The model is defined
> once, in the SSoT — do not restate it here:
> <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.
>
> Rationale: <one or two sentences on why these flags are set this way>.

---

## Project Overview

<scope, motivation, non-goals>

---

## Sessions

### Session 1 of 3: <verb-phrase title>

**Goal:** <one sentence — what this session ships>
**Steps:**
1. ...
2. ...
**Creates:** `<paths>`
**Touches:** `<paths>`
**Ends with:** <verifiable end-state — a passing test, a committed file, etc.>
**Progress keys:** `session-001/<key-a>`, `session-001/<key-b>`

---

### Session 2 of 3: <verb-phrase title>

**Goal:** <one sentence — what this session ships>
**Steps:**
1. ...
2. ...
**Creates:** `<paths>`
**Touches:** `<paths>`
**Ends with:** <verifiable end-state — a passing test, a committed file, etc.>
**Progress keys:** `session-002/<key-a>`, `session-002/<key-b>`

---

### Session 3 of 3: <verb-phrase title>

**Goal:** <one sentence — what this session ships>
**Steps:**
1. ...
2. ...
**Creates:** `<paths>`
**Touches:** `<paths>`
**Ends with:** <verifiable end-state — a passing test, a committed file, etc.>
**Progress keys:** `session-003/<key-a>`, `session-003/<key-b>`

---

## End-of-set deliverables

- <the durable artifacts this set produces>
