# Engine-Agnostic Documentation Authority And Version Status Spec

> **Purpose:** Shared operational facts a future orchestrator needs were
> split across engine-specific bootstrap files, and `AGENTS.md` / `GEMINI.md`
> drifted badly stale while `CLAUDE.md` kept moving. Promote a durable
> principle: if a fact matters to more than one orchestrator, it must live
> in an engine-agnostic doc or canonical package metadata. Centralize the
> current consumer table and version/release walk in
> `docs/repository-reference.md`, and make the root engine files point
> there instead of carrying independent version histories.
> **Created:** 2026-06-02
> **Session Set:** `docs/session-sets/056-engine-agnostic-doc-authority-and-version-status/`
> **Prerequisite:** None. Independent of Set 055 (`structured
> verification issue artifacts`), which stays focused on verification
> artifact shape.
> **Workflow:** Orchestrator-maintained docs / release-discipline hygiene

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
```

> Rationale: shared documentation architecture and root-instruction-file
> cleanup only. No browser-visible UI, no runtime behavior change.

---

## Project Overview

### Motivation

The repo's documentation authority is currently underspecified in one
important way:

- `CLAUDE.md` carried a long current version walk.
- `AGENTS.md` and `GEMINI.md` carried a much older copy of the same kind
  of information, plus stale extension path/build facts.
- Live planning/review docs pointed reviewers and release operators at
  `CLAUDE.md` for shared repo facts such as current consumers and the
  version walk.

That is exactly the failure mode a future orchestrator cannot safely
recover from: a shared fact exists, but only in one engine-specific file,
so another engine starts from stale or contradictory guidance.

### What this set delivers

1. A durable guiding principle in the shared GitHub docs: shared
   operational facts belong in engine-agnostic docs or canonical package
   metadata, not only in `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`.
2. A canonical `docs/repository-reference.md` section for:
   current consumer repos, current release status, and a concise shared
   version walk.
3. Root engine bootstrap docs that point to the canonical shared-doc
   section rather than maintaining independent version histories.
4. Live planning/review docs updated to cite the engine-agnostic source,
   not `CLAUDE.md`, for release/version/consumer facts.

### Non-goals

- **No package version bump.** This set changes documentation authority,
  not shipped code.
- **No rewrite of historical closed session-set artifacts.** Old specs,
  change-logs, and verification files remain historical records.
- **No consumer-repo mass sync.** This set fixes the canonical repo; any
  cross-repo notice is a follow-on only if needed.
- **No attempt to eliminate every duplicate fact.** The goal is to avoid
  a fact living *only* in an engine-specific doc and to define one
  canonical source for the shared operational history.

### Open design questions (S1 audit)

1. **Where the canonical section lives.** Keep it inside
   `docs/repository-reference.md` vs split to a dedicated
   `docs/version-status.md`. Recommendation: keep it in
   `repository-reference.md` because that file already serves as the deep
   engine-agnostic reference page.
2. **How much history to carry.** Full prose walk vs concise recent walk
   plus package changelog pointers. Recommendation: concise recent walk +
   changelog pointers, to reduce maintenance burden.
3. **How much shared factual content stays in root engine files.** Keep
   current-consumer and build/test summaries vs strip them to bare
   bootstrap. Recommendation: keep only concise stable facts and ensure
   the canonical release/version source is engine-agnostic.
4. **Secondary docs to retarget.** Which live planning/review docs should
   cite the canonical shared-doc section. Recommendation: at minimum the
   release-process docs and review-criteria templates.

---

## Sessions

### Session 1 of 2: Audit & design-lock

**Steps:**
1. Re-survey the live shared-doc surfaces (`CLAUDE.md`, `AGENTS.md`,
   `GEMINI.md`, `docs/repository-reference.md`, shared review/planning
   docs) and confirm exactly where shared repo facts are duplicated.
2. Lock the guiding principle text, the canonical section location, and
   the scope of the shared version walk.
3. Decide whether any shared facts should remain duplicated in root
   engine docs after the canonical section exists.
4. Capture the audit record and lock the migration plan.

**Creates:** proposal / verdict if the audit needs a formal record.
**Ends with:** a locked documentation-authority contract.
**Progress keys:** principle text locked; canonical location locked;
root-doc scope locked.

### Session 2 of 2: Migrate shared docs + validate

**Steps:**
1. Add the canonical shared-facts / version-status section to
   `docs/repository-reference.md`.
2. Update `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` so they point to the
   canonical shared-doc section instead of carrying independent version
   histories.
3. Update live planning/review docs that currently cite `CLAUDE.md` as
   the source of shared repo facts.
4. Validate the edited markdown, grep for remaining live references that
   still treat one engine file as canonical, and close out.

**Ends with:** a future orchestrator can find shared repo facts from an
engine-agnostic doc, and the root bootstrap files no longer drift as
independent version archives.
**Progress keys:** canonical section landed; root-doc pointers landed;
live shared-doc references retargeted; validation clean.

---

## End-of-set deliverables

- A durable guiding principle for documentation authority in the shared
  GitHub docs.
- Canonical current-consumer and version-status information in
  `docs/repository-reference.md`.
- Root engine instruction files that point to the shared authority
  instead of carrying their own version walk.
- Live review/planning docs retargeted to the engine-agnostic source.