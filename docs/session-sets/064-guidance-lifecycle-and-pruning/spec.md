# Guidance Lifecycle & Pruning Spec

> **Purpose:** Stop `lessons-learned.md` and `project-guidance.md` from
> growing without bound by giving them a **lifecycle**: measure their
> recurring context cost, track per-lesson usage, archive (never delete)
> on evidence of disuse / supersession / encoded-into-automation, and
> keep an always-loaded "active" tier under a token budget. Two distinct
> deliverables: (1) a **steady-state mechanism** that prevents future
> bloat, and (2) a **one-time radical backlog-remediation recipe** for
> repos that are *already* over budget — because the steady-state usage
> signals are forward-looking and cannot retroactively distinguish a
> live lesson from dead weight on day one.
> **Created:** 2026-06-14
> **Session Set:** `docs/session-sets/064-guidance-lifecycle-and-pruning/`
> **Prerequisite:** None (Set 063 closed).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Origin:** Operator question 2026-06-14 ("there is no mechanism for
> pruning these files… keep track of the size/cost as overhead and
> develop a pruning mechanism"), grounded by the measured fact that the
> highest-volume consumer (`dabbler-access-harvester`, 69 session sets)
> already carries a **151 KB / 2467-line** `lessons-learned.md` and a
> **59 KB / 1010-line** `project-guidance.md` — ~210 KB (~50k tokens)
> read into context at every session start and growing monotonically.
> Cross-provider consult (gpt-5.4 + gemini-2.5-pro, 2026-06-14) graded
> the operator's first-draft proposal "partly right": the cost is real
> and worth managing, but the trigger should be evidence-of-use /
> supersession / encoded-into-automation — **not** a hard size budget
> and **not** "promote within N sets or archive." Both verdicts archived
> under `s1-consult/` for Session 1.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
totalSessions: 4
```

> Rationale: this set ships a **CLI/library keystone** (`close_session`
> usage-capture + a guidance cost reporter), a **metadata convention**
> in two human-readable markdown files, **portable docs/templates**, and
> a **migration recipe** — no UI surface, so `requiresUAT: false`. No
> user-visible behavior reachable through a real UI entry point, so
> `requiresE2E: false`; the floor is deterministic unit tests on the
> reporter, the metadata parser, the citation writer, and the
> ceiling check, plus the standing Python + TS suites green at close.
> If Session 1 finds the keystone must touch `ai_router/close_session.py`
> (expected) the set carries a **PyPI bump** in Session 4; the extension
> is touched only if S1 finds the citation step needs a command surface
> (default: it does not — close is a CLI/headless flow).

---

## Project Overview

### Motivation

`lessons-learned.md` and `project-guidance.md` are **re-read at the start
of every session** — they are loaded into the orchestrator's context
before any task work. Today they are append-only with exactly one
shrinking mechanism: when a lesson is *promoted* to project-guidance it
is collapsed to a one-line pointer. That mechanism only fires on
promotion and only ever collapses; it never evicts a lesson that has
simply gone stale, been superseded, or been encoded into a guard/test so
the prose reminder is now redundant.

The result is monotonic growth whose cost is **recurring and invisible**:
not disk bytes but ~50k tokens of context tax on every session in a
high-volume repo, plus attention dilution (genuinely important rules lose
salience inside low-signal "wallpaper"). The cost lands in consumer repos,
not here — this repo's own files are 12 KB / 4 KB because curator work is
low-volume; the harvester's are 151 KB / 59 KB.

### Two problems, two deliverables

1. **Steady-state (prevents future bloat).** A lifecycle: per-lesson
   metadata, usage capture at close, an always-loaded "active" tier under
   a token budget, a never-auto-loaded archive, and archive triggers
   based on evidence rather than size or age. This is forward-looking — it
   starts working the moment it ships and gets stronger as usage history
   accumulates.

2. **Backlog remediation (fixes the existing over-budget repos).** The
   steady-state usage signals are useless on day one: every existing
   harvester lesson has no `last-used-set` history, so disuse-based
   archival would either evict everything or nothing. A repo already at
   151 KB needs a **one-time radical pass** to get back under budget
   before the steady-state mechanism can keep it there. This set authors
   that recipe as a portable migration doc and dogfoods it (read-only)
   against the harvester file as the proof case; live execution on the
   harvester's working tree is a harvester-side follow-on, not this set.

### Cross-provider consult result (locks the design direction)

Both providers, independently, graded the operator's three-part draft
(track size · hard size budget gate · "promote within 10 sets or
archive") **"partly right"** and converged on the same redesign:

- **The cost is real — manage it** (money + attention + opportunity).
- **Hard size budget is a backstop, not the trigger.** A pure byte gate
  optimizes for bytes, forcing eviction of a still-valuable old lesson to
  fit a new one.
- **"Promote-or-archive in N sets" is flawed.** Promotion ≠ the only proof
  of value; durable *tactics* ("halve the batch and retry on truncation")
  never become Principles, and rare-but-critical disaster lessons fire
  once in 50 sets — the rule would evict the most valuable edge-case
  knowledge. Promotion must be **orthogonal** to archival.
- **Best archival signal:** no demonstrated reuse for N sets **and** not
  encoded in any active guidance / test / lint / template, **or**
  superseded, **or** subsystem retired.
- **Mechanism both designed:** tiered files (always-load active + capped,
  never-auto-load archive), per-lesson metadata (`added-set`,
  `last-used-set`, `status`, `superseded-by`, `encoded-in`, `scope`), an
  explicit "this lesson was instrumental" citation captured at session
  close, a periodic operator-reviewed archival sweep, and **archive ≠
  delete** (full text preserved, just not auto-loaded).

(One divergence held back as out-of-scope: Gemini's vector-DB retrieval
over the archive — over-engineered at this scale; markdown + grep
suffices. Recorded in the S1 consult notes, not adopted.)

### Design intents (Session 1 locks the details)

- **D1 — Guidance cost reporter.** A helper that reports the recurring
  overhead of the always-loaded guidance files (bytes **and** an
  estimated token count, per file and combined), and stamps a short
  freshness/size header into each file (last-pruned set, current size,
  budget). Metric framed as **tokens-read-per-session**, not just disk KB.
  Lock: CLI name (e.g. `python -m ai_router.guidance_report`), token
  estimator (cheap heuristic vs. tokenizer), header format, whether it
  warns at a configurable threshold.
- **D2 — Per-lesson metadata schema.** Lightweight, markdown-friendly,
  human-editable fields per lesson: `id` (short stable handle, e.g.
  `L-064-1`), `added-set`, `last-used-set`, `status`
  (active|archived|promoted), `superseded-by`, `encoded-in`, `scope`.
  Lock the exact serialization so the file stays readable (inline
  trailer line vs. small YAML block) and a parser can round-trip it.
- **D3 — Citation-at-close keystone.** `close_session` captures which
  lesson `id`s were instrumental in the set and updates their
  `last-used-set`. **This is the keystone** — every archival rule is
  guessing until close records real usage. Lock the capture path
  (operator-supplied list at close · a field in `change-log.md` /
  `disposition.json` · prompt at close, hard-TTY vs. soft-headless per
  the Set 057 pattern), how it round-trips into the markdown, and the
  no-citation default (do nothing, never auto-evict on silence alone).
- **D4 — Active / archive split.** `lessons-learned.md` becomes the
  always-loaded **active** tier (capped to a token budget); a sibling
  `lessons-archive.md` holds archived entries and is **never
  auto-loaded** (grep-able on demand). Redefine the existing rule from
  "never delete; only move" to **"never delete; move active → archive."**
  Update every "read these files at session start" instruction so the
  archive is explicitly excluded from the always-load set. Decide whether
  `project-guidance.md` gets the same split or only a ceiling (it is
  smaller and higher-signal by design).
- **D5 — Steady-state archive triggers (drop the draft rules).**
  Archive a lesson when **any** of: superseded (`superseded-by` set);
  encoded into automation (`encoded-in` names a live test/lint/guard/
  template); subsystem retired; or no `last-used-set` activity for N sets
  **and** not referenced by active guidance. Size budget is a **hard
  backstop ceiling only** (when over, a sweep is *required* before adding,
  but the sweep archives by the evidence rules, not by raw length).
  **Explicitly delete the "promote within 10 sets or archive" rule** and
  state that promotion is orthogonal to archival.
- **D6 — Backlog-remediation recipe (the radical interim strategy).** A
  one-time, portable recipe for repos already over budget. Lock which
  combination of: (a) routed **bulk triage** that classifies every
  existing entry keep-active | archive(superseded/obsolete/encoded) |
  promote | merge, operator-reviewed; (b) **supersession-merge dedup**
  pass (2467 lines almost certainly has near-duplicates); (c) **archive-
  bankruptcy** (wholesale move to archive, re-surface only on citation) —
  most radical, lock whether it is offered as an option; (d) seeding
  `last-used-set` for survivors so the steady-state mechanism has a
  baseline. Output is a migration-recipe doc + the routed-triage helper
  if one is warranted.
- **D7 — Ship to consumers.** Update the consumer-bootstrap template
  bundle so new repos get metadata-aware `lessons-learned` /
  `project-guidance` templates, the empty `lessons-archive.md`, and the
  lifecycle doc; emit a cross-repo notice (the established pattern) for
  existing consumers, pointing the harvester at D6 for its 151 KB
  backlog.
- **D8 — Docs + release.** New canonical lifecycle doc under `docs/`
  (engine-agnostic, per the Documentation-authority principle); update
  the authoring guide / workflow doc / `project-guidance.md` rule text /
  the consumer-bootstrap docs; PyPI bump if the keystone lands in
  `ai_router` (expected); CLAUDE/AGENTS/GEMINI walk only via the
  engine-agnostic doc, never as a sole-sourced fact.

### Non-goals

- No automatic, unattended deletion of any guidance content — archival is
  a move to a preserved, grep-able file, and the backlog sweep is
  operator-reviewed.
- No vector-DB / embedding retrieval over the archive (consult flagged it
  as over-engineered at this scale; markdown + grep is the floor).
- No live edits to the harvester's working tree — Session 3 dogfoods the
  recipe **read-only** and produces a proposed triage as a proof
  artifact; executing it is a harvester-side follow-on set.
- No change to the promotion mechanism's *direction* (lessons still
  promote into project-guidance); only its coupling to archival is cut.
- No new UI surface in the extension unless S1 finds the citation step
  genuinely needs one (default: it does not).

---

## Sessions

### Session 1 of 4: Audit & design-lock

**Goal:** Ground the design in the real state of every affected surface
and lock D1–D8 with file-level evidence.
**Steps:**
1. Measure the current overhead empirically across this repo and the
   consumer repos: byte + estimated-token size of every `lessons-learned.md`
   / `project-guidance.md`, session-set counts, and how much of each is
   already collapsed-to-pointer vs. live prose. Record per-repo.
2. Audit the read path: every instruction that tells an agent to read
   these files at session start (`CLAUDE.md`/`AGENTS.md`/`GEMINI.md`,
   `project-guidance.md` Workflow Expectations, the authoring guide, the
   consumer-bootstrap `start-here` template) — so D4's "exclude the
   archive from always-load" lands everywhere.
3. Audit the write path: how `close_session` runs today (gate checks,
   what it already writes to `change-log.md` / `disposition.json` /
   `activity-log.json`) to find the cleanest seam for the D3 citation
   capture; confirm whether it stays Python-CLI-only.
4. Audit the existing promotion/collapse convention and the consumer-
   bootstrap template bundle (what ships to new repos today).
5. Lock D1–D8. Route a cross-provider design consult on any contested
   lock (the 2026-06-14 consult covered direction; lock the *mechanics*
   here — serialization, capture path, ceiling value, which D6 options).
6. Cross-provider verification of the audit record.
**Creates:** `s1-audit.md` (measurements + read/write-path findings +
locks), `s1-consult/` (the 2026-06-14 gpt + gemini verdicts, plus any
new S1 consult output).
**Touches:** nothing in shipping code (audit-only session).
**Ends with:** D1–D8 answered with file-level evidence; suite green.
**Progress keys:** `session-001/measure`, `session-001/read-path`,
`session-001/write-path`, `session-001/design-lock`, `session-001/verified`.

### Session 2 of 4: Steady-state mechanism

**Goal:** Ship D1–D5 — the forward-looking lifecycle.
**Steps:**
1. Guidance cost reporter (D1): per-file + combined bytes/tokens, header
   stamp, configurable warn threshold; ASCII-only terminal output
   (lessons-learned cp1252 rule).
2. Metadata schema + parser (D2): round-trip read/write of the per-lesson
   fields in the locked serialization; preserve human readability.
3. Citation capture at close (D3): wire the locked capture path into
   `close_session`; update `last-used-set` for cited ids; no-citation
   default is inert (never auto-evict on silence).
4. Active/archive split (D4): introduce `lessons-archive.md`; redefine the
   move rule; update every always-load instruction found in S1 to exclude
   the archive.
5. Steady-state triggers + backstop ceiling (D5): the evidence-based
   archive criteria + the hard ceiling check; delete the
   promote-or-archive-in-N-sets rule from the guidance/lessons text.
6. Unit tests: reporter math, metadata round-trip, citation writer,
   ceiling check, no-citation inertness. Python + TS suites green.
7. Cross-provider verification (point the verifier at the D2/D3 contract).
**Creates:** reporter module + tests, metadata parser + tests,
`lessons-archive.md` (this repo, seeded empty/with any already-stale
entries per D5), citation-writer code + tests.
**Touches:** `ai_router/close_session.py` (citation seam),
`docs/planning/lessons-learned.md` + `project-guidance.md` (header +
rule text), always-load instructions per S1.
**Ends with:** a session close records lesson usage; the reporter prints
current overhead; the archive exists and is excluded from always-load;
all suites green.
**Progress keys:** `session-002/reporter`, `session-002/metadata`,
`session-002/citation`, `session-002/archive-split`,
`session-002/triggers`, `session-002/tests`, `session-002/verified`.

### Session 3 of 4: Backlog-remediation recipe + harvester dogfood

**Goal:** Ship D6 — the one-time radical strategy for repos already over
budget — and prove it on the real over-budget file, read-only.
**Steps:**
1. Author the portable backlog-remediation recipe doc per the D6 lock:
   the routed bulk-triage pass, the supersession-merge dedup pass, the
   archive-bankruptcy option (if locked in), and the survivor
   `last-used-set` seeding so the steady-state mechanism inherits a
   baseline. State explicitly that the sweep is operator-reviewed and
   archive ≠ delete.
2. If the lock calls for a routed-triage helper, implement it (classify
   each entry keep|archive|promote|merge with evidence) + unit tests on
   a fixture; ASCII-only output; persist routed output to UTF-8 before
   display (cp1252 rule).
3. Dogfood **read-only** against the harvester's 151 KB `lessons-learned.md`:
   run the triage to produce a *proposed* classification + a projected
   post-remediation size, written as a proof artifact here. Make no edit
   to the harvester working tree.
4. Python + TS suites green.
5. Cross-provider verification of the recipe + the dogfood projection.
**Creates:** the backlog-remediation recipe doc (portable, under `docs/`),
the routed-triage helper + tests (if locked), `s3-harvester-dogfood.md`
(proposed triage + projected size, read-only proof).
**Touches:** nothing in the harvester repo (dogfood is read-only).
**Ends with:** a repo over budget has a concrete, operator-reviewed path
back under budget; the harvester proof shows the projected reduction;
suites green.
**Progress keys:** `session-003/recipe`, `session-003/triage-helper`,
`session-003/harvester-dogfood`, `session-003/tests`,
`session-003/verified`.

### Session 4 of 4: Templates, docs sweep, release, close-out

**Goal:** Ship D7–D8 — propagate to consumers, document canonically,
release, and close.
**Steps:**
1. Bootstrap template bundle (D7): metadata-aware `lessons-learned` /
   `project-guidance` templates, empty `lessons-archive.md`, the lifecycle
   doc reference; esbuild/packaging copies if the bundle is packaged.
2. Cross-repo notice (D7): the established notice doc pointing existing
   consumers (the harvester first) at the Session 3 backlog recipe.
3. Docs sweep (D8): new canonical engine-agnostic lifecycle doc under
   `docs/`; update the authoring guide, `ai-led-session-workflow.md`,
   `project-guidance.md` rule text, quick-start, and the consumer-
   bootstrap docs; CLAUDE/AGENTS/GEMINI reference the canonical doc only
   (no sole-sourced fact).
4. Release (D8): PyPI bump if the keystone landed in `ai_router`
   (CHANGELOG + version + `repository-reference.md` in pre-push wording);
   Marketplace bump only if S1 found an extension change was needed
   (not expected). Through the green-Test gate.
5. Cross-provider verification (state the suite baseline + release
   contract up front in R1 — Set 062 calibration); close-out (final
   session → `change-log.md`).
6. Tag push(es) only with explicit operator authorization; record run
   ids post-publish.
**Touches:** template bundle, docs per sweep, version files, CHANGELOG.
**Ends with:** new repos inherit the lifecycle out-of-box; existing
consumers have a notice + a recipe; the mechanism is documented
canonically; the release ships (or is held for the operator's tag push)
through the green-Test gate.
**Progress keys:** `session-004/templates`, `session-004/cross-repo-notice`,
`session-004/docs-sweep`, `session-004/versions-bumped`,
`session-004/verified`, `session-004/change-log-written`.

---

## End-of-set deliverables

- A **guidance cost reporter** that surfaces the recurring
  tokens-read-per-session overhead of the always-loaded files (D1).
- A **per-lesson metadata schema** + round-trip parser, and a
  **citation-at-close keystone** in `close_session` that records real
  lesson usage (D2, D3).
- An **active/archive split** with the archive excluded from always-load,
  and the move rule redefined to "never delete; move active → archive"
  (D4).
- **Evidence-based archive triggers** + a hard backstop ceiling, with the
  flawed "promote-or-archive-in-N-sets" rule deleted and promotion made
  orthogonal to archival (D5).
- A **portable one-time backlog-remediation recipe** for over-budget
  repos, dogfooded read-only against the harvester's 151 KB file with a
  projected post-remediation size (D6).
- **Consumer propagation**: updated bootstrap templates + a cross-repo
  notice pointing the harvester at the recipe (D7).
- **Canonical engine-agnostic documentation** of the lifecycle and a
  release through the green-Test gate (D8).
