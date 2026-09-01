# Publish the page

> **Purpose:** Put the hello page on a public URL.
> **Session Set:** `docs/session-sets/003-publish-the-page/`
> **Created:** 2026-06-02
> **Workflow:** full
> **Prerequisite:** `099-cdn-rollout` must be complete.

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
  - slug: 099-cdn-rollout
    condition: complete
```

> Rationale: publishing depends on a CDN rollout set that — in this
> fixture matrix on purpose — does not exist. This is the UNKNOWN-slug
> blocked row: a typo or missing prerequisite keeps the chain marker on
> (typos block, they never silently unblock), and the tooltip reports
> the target as unknown.

---

## Project Overview

Deploy the static page to the public host once the (fictional) CDN
rollout completes.

---

## Sessions

### Session 1 of 2: Wire the deploy step

**Goal:** A one-command deploy script.
**Steps:**
1. Add `deploy.sh` that copies the page to the host bucket.
2. Document the command in the README.
**Creates:** `deploy.sh`
**Touches:** `README.md`
**Ends with:** Dry-run deploy succeeds locally.
**Progress keys:** `session-001/deploy-script`, `session-001/docs`

---

### Session 2 of 2: First publish

**Goal:** The page is live.
**Steps:**
1. Run the deploy against the real host.
2. Smoke-check the public URL and close the set.
**Creates:** `change-log.md`
**Touches:** —
**Ends with:** Public URL serves the page; set closed.
**Progress keys:** `session-002/publish`, `session-002/verified`

---

## End-of-set deliverables

- The hello page on a public URL with a repeatable deploy script.
