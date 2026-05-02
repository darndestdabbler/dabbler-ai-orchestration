# README polish: screenshots, sample reports, and the posture-shift framing

> **Purpose:** Take the repo-root README from "feature-tour with one screenshot" to "credibly-positioned tool that pre-qualifies its readers." Three streams of work feed one polished README: (1) more screenshots of the extension actually doing work, against real projects; (2) sample reports from `python -m ai_router.report` showing what the metrics layer produces at scale; (3) a short philosophical-framing section that names the posture shift the extension hints at — not in the elevator pitch, but front-of-house enough that curious readers find it.
> **Created:** 2026-05-02
> **Session Set:** `docs/session-sets/011-readme-polish/`
> **Prerequisite:** Set 010 (`010-pypi-publish-and-installer`) must be closed. Both sets touch the README's adoption section; Set 010 does the structural rewrite (collapse to one install command), Set 011 does the polish pass on top. Sequencing avoids merge conflicts and lets Set 011 reference the install command as a real thing, not a planned thing.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: pure documentation work, no UI or behavioral surface to
> UAT. The screenshots are captured by the human (operator-driven,
> not testable) and the README itself is reviewed by the verifier as
> prose, not as code. Synchronous per-call routing is the right shape
> for two short sessions; no daemon needed.

---

## Project Overview

### What the set delivers

- A polished repo-root README that leads with a posture-shift framing,
  shows the extension working against real projects via several
  screenshots, includes excerpts of sample reports from
  `python -m ai_router.report`, and links to full sample reports
  saved under `docs/sample-reports/`.
- A `docs/screenshots/` directory containing every screenshot the
  README references (and a `SPEC.md` documenting which screenshot
  occupies which README section, so future README edits don't drift
  from what the images show).
- A `docs/sample-reports/` directory with two sanitized sample
  reports drawn from real reference projects — one project of modest
  size, one of substantial size — to give readers calibration on
  what the metrics layer produces at different scales.
- A non-destructive normalization pass on each reference project's
  `router-metrics.jsonl` if the report tool surfaces gaps. The
  normalization writes a *projection* (`router-metrics-normalized.jsonl`)
  rather than mutating the original, preserving the audit trail of
  the reference projects.

### Reference projects

Two real projects, both at the operator's desk:

- **`dabbler-platform`** — full-stack Blazor/React UI app; ~20+
  session sets; `requiresUAT: true`, `requiresE2E: true`; gives the
  reader a "what this looks like at scale" sample.
- **`dabbler-access-harvester`** — different shape (less UI, more
  CLI/library work); ~20+ session sets; gives the reader a contrasting
  shape so the reports don't all look like one project.

Sample-report file names use generic labels (`example-large-project.md`,
`example-mid-sized-project.md`) so the reference projects' identity is
preserved for reproducibility but the README copy stays
project-agnostic. Light redaction (URLs, secrets-shaped strings,
internal ticket IDs) is operator-driven; the spec defines what to look
for but the operator decides what to redact.

### Motivation

The existing repo-root README does the elevator-pitch job (one
screenshot, terse value-prop) but doesn't yet show the tool working
against real-world data. A reader who isn't already inclined to try
AI-led workflows has no on-ramp from "this looks tidy" to "this
holds up under load." More screenshots from real projects close that
gap; sample reports close it further by showing what the metrics
layer is actually capturing.

The framing section does a different job. The extension's most
unusual UI choice — putting session sets where the file tree
normally sits — is **a small UI gesture with a larger implication**:
when the first thing you see in a workspace is "what work is in
flight" rather than "what files exist," the unit of attention shifts
from files to work-in-progress. That hint at a posture shift is
genuinely there in the design; surfacing it in the README invites
readers who are willing to think beyond the code to engage on those
terms. Done right, this pre-qualifies readers and reduces wasted
adoption energy from people who'd bounce off the cost reality.

### Non-goals

- **No demo gif or screencast video.** A single still-image gallery
  is the right size for v0.x. Motion is a future polish, not this
  set's deliverable.
- **No deep philosophy of AI-driven development.** The framing
  section is short — three paragraphs at most — and grounded in a
  concrete analogy (construction-trades evolution). It's a hint, not
  a manifesto. Anything longer would tip into overselling.
- **No retrofit work that mutates reference projects' history.** If
  a reference project's `router-metrics.jsonl` has gaps the report
  tool can't handle, the spec writes a *projection* alongside the
  original; the originals stay untouched so the projects' audit
  trails remain complete.
- **No screenshots of the operator's actual command-line history,
  open file paths, or workspace contents that aren't the extension
  views themselves.** Operator-driven sanitization on capture; the
  spec calls out which areas of the screen need to be in-frame.

---

## Screenshot inventory (target set)

Produced in Session 1 as `docs/screenshots/SPEC.md`. The eight
target screenshots:

| # | Subject | Purpose in README |
|---|---|---|
| 1 | **Session Set Explorer with all four state groups visible** (In Progress, Not Started, Done, Cancelled) — captured against `dabbler-platform`. | Replaces the existing single-state hero screenshot with one that shows the full lifecycle. |
| 2 | **Provider Queues view with messages in multiple states** (claimed, completed, failed, timed-out) — drawn from a project that's used outsource-last work. | Shows the queue substrate is real and observable. |
| 3 | **Provider Heartbeats view with three providers, one stale** — captures the "⚡ vs ⚠️" contrast. | Demonstrates the observability-not-prediction framing. |
| 4 | **Cost Dashboard webview** with cumulative spend, per-set breakdown, sparkline, and model mix. | The "what does this cost?" question gets a visual answer. |
| 5 | **Sample report (terminal capture)** — `python -m ai_router.report` output against `dabbler-platform` (~20 sets, with the Opus-baseline savings headline). | Shows the metrics layer at scale. |
| 6 | **Sample report (terminal capture)** — `python -m ai_router.report` output against `dabbler-access-harvester` (~20 sets, different shape). | Shows two contrasting project shapes; reader gets calibration. |
| 7 | **Right-click menu on a session-set row** (Open spec, Copy trigger phrase, Cancel, etc.). | The interaction model is more than tree rendering. |
| 8 | **Project Wizard** — the onboarding panel that first-time users see. | Lowers the perceived barrier to entry. |

Three are *optional* if Session 1 surfaces real friction in capturing
them: #2 (Provider Queues with messages requires a recently-active
outsource-last project), #7 (right-click menu requires capture-time
interaction), #8 (Project Wizard requires opening a fresh
non-Dabbler workspace).

---

## Session Plan

### Session 1 of 2: Generate supporting content (retrofit + sample reports + screenshot specs)

**Goal:** Land everything the README polish will need, so Session 2 is
purely an editing pass against artifacts that already exist.

**Steps:**

1. **Confirm the two reference projects** at session start: default to
   `dabbler-platform` and `dabbler-access-harvester` per the spec's
   "Reference projects" section. If either is unavailable or their
   metrics aren't representative, the operator can substitute another
   project of similar scale — the orchestrator surfaces this as a path
   decision before proceeding.
2. **Pre-flight: run `python -m ai_router.report`** against each
   reference project's `router-metrics.jsonl`. Capture full stdout +
   exit code. Identify gaps:
   - Missing fields (e.g., older entries lacking `verifier_model`).
   - Inconsistent shapes across sessions (e.g., cost-field renamed
     between sets).
   - Anything the report tool stumbles on or warns about.
3. **Non-destructive retrofit**, only if pre-flight surfaced gaps.
   Write a normalization script (`scripts/normalize_metrics.py` or
   inline if simple) that produces
   `router-metrics-normalized.jsonl` alongside the original. The
   normalization fills missing fields with documented defaults
   (e.g., absent `verifier_model` → `"unknown"`) and harmonizes
   field-name drift. Originals are NOT modified; the projection is
   what the sample reports are generated from.
4. **Generate sample reports.** Run `python -m ai_router.report`
   against each normalized projection (or the original if no
   retrofit was needed). Save the reports as plain markdown at:
   - `docs/sample-reports/example-large-project.md` (drawn from
     `dabbler-platform`)
   - `docs/sample-reports/example-mid-sized-project.md` (drawn from
     `dabbler-access-harvester`)
   Operator-driven redaction pass before commit: scrub URLs,
   API-key-shaped strings, and any internal ticket IDs that
   shouldn't ship publicly. The orchestrator can suggest candidate
   redactions but the operator approves each one.
5. **Author the screenshot specification** at
   `docs/screenshots/SPEC.md`. For each of the eight target
   screenshots:
   - Subject (one-line description).
   - Workspace state to set up first (which workspace, which view
     active, any data-prep — e.g., "open the dabbler-platform
     workspace, ensure all four lifecycle states have at least one
     session set, expand the In Progress group").
   - Expected file name (kebab-case: `01-session-set-explorer.png`).
   - Optional: dimensions / zoom / theme guidance ("VS Code Light+
     theme, 100% zoom, 1280×720 minimum, full activity-bar visible").
   - Privacy note (what to crop or blur).
6. **Pre-stage `docs/screenshots/`** with a placeholder `.gitkeep`
   so the directory exists and Session 2 can drop files in without
   creating it.
7. **End-of-session cross-provider verification.** The verifier
   reviews: (a) the sample reports for accuracy and reasonable
   redaction, (b) the screenshot spec for completeness and operator-
   actionability, (c) the retrofit projection (if any) for
   non-destructive shape.
8. **Commit, push, run close-out.** Close-out summary surfaces the
   human handoff: "Capture the eight screenshots per
   `docs/screenshots/SPEC.md` before starting Session 2."

**Creates:**
- `docs/sample-reports/example-large-project.md`,
- `docs/sample-reports/example-mid-sized-project.md`,
- `docs/screenshots/SPEC.md`,
- `docs/screenshots/.gitkeep`,
- `scripts/normalize_metrics.py` (only if retrofit was needed).

**Touches:** None this session — by design, Session 1 produces *new*
artifacts and reads from existing reference projects but does not
modify any tracked README content. Session 2 owns the README edits.

**Ends with:** the two sample reports are committed and rendered
correctly (markdown links resolve; tables format); the screenshot
spec is committed and is operator-actionable (the operator can
read it and capture each shot without follow-up questions);
cross-provider verification returns `VERIFIED`; close-out summary
explicitly surfaces the human-handoff for screenshot capture.

**Progress keys:** `docs/screenshots/SPEC.md` exists with all eight
shots specified; `docs/sample-reports/` has two redacted reports;
no reference-project file outside `docs/sample-reports/` was
modified.

---

### Session 2 of 2: README polish (framing + screenshots + sample-report excerpts) + cross-provider verification + close-out

**Goal:** Use the artifacts produced by Session 1 (plus the
screenshots the operator captured between sessions) to bring the
README into its polished shape.

**Pre-conditions:** the operator has captured the eight (or fewer,
per the optional flag) screenshots per `docs/screenshots/SPEC.md`
and dropped them into `docs/screenshots/`. The orchestrator
verifies their presence as Step 1 below.

**Steps:**

1. **Verify screenshot deliverables.** Read
   `docs/screenshots/SPEC.md`, list expected file names, confirm
   each exists under `docs/screenshots/`. If any required shot
   (#1, #3, #4, #5, #6 — the non-optional ones) is missing, abort
   the session with a clear message; if only optional shots are
   missing, proceed but note in the close-out which optional shots
   were skipped.
2. **Add the posture-shift framing section.** Insert a new section
   titled **"A different posture in the chair"** (or another title
   the operator approves at session start) between the preamble +
   hero screenshot and the Table of Contents. The section is short
   — three paragraphs, ~140 words — grounded in the
   construction-trades-evolution analogy, naming the
   developer-as-coder → developer-as-facilitator-and-manager shift
   without using "paradigm shift," "revolution," or "AI-first"
   language. Tone: confident but understated. The draft authored
   alongside this spec is the starting point; the orchestrator may
   tighten or rephrase but should preserve the construction
   analogy and the "skill / keystrokes" distinction in the closing
   sentence.
3. **Build the "What does it look like?" gallery.** Add a short
   section after the framing, anchored on screenshots #1, #4, #2
   (or #3 if #2 was skipped), and #5. Each image gets a one-line
   caption that names what the reader is seeing. The gallery
   serves as a visual anchor for readers who scroll before they
   read.
4. **Embed sample-report excerpts.** Pick a representative excerpt
   (~12-20 lines) from each sample report — typically the headline
   summary plus the per-task-type unreliability table — and embed
   as a fenced code block in the relevant section (likely the
   existing "Highlighted features → 1. Cost-minded orchestration"
   subsection). Each excerpt links to the full report at
   `docs/sample-reports/`.
5. **Replace the hero screenshot if appropriate.** The current
   hero shot shows three states; screenshot #1 shows all four.
   The operator may prefer either depending on which reads more
   "alive." Default to #1 (more comprehensive); leave the choice
   open at session start.
6. **Add a "Reports and metrics" subsection** under "Highlighted
   features" if not already present. Anchored on screenshots #5
   and #6 with one-line "this is what real projects look like"
   captions. Brief intro paragraph names the cumulative-spend
   question and the per-task-type-unreliability question both as
   things the report answers.
7. **Tighten prose where screenshots replace text.** Several
   subsections currently spend paragraphs describing what a
   screenshot would now show in a glance; collapse those
   paragraphs to one sentence + image. Specifically: the
   paragraph describing the four state groups (now redundant
   with shot #1), the paragraph describing cost surfaces
   (now redundant with #4 and the report excerpts), and any
   paragraph that walks through a flow that a screenshot now
   visualizes.
8. **Update the existing "The Session Set Explorer in action"
   section.** Either retire it (its content is now distributed
   across the gallery and the framing section) or repurpose it
   as a "Beyond the Session Set Explorer" section pointing
   readers at the other views (Queues, Heartbeats, Cost
   Dashboard) with their own screenshots.
9. **Verify all internal links still resolve** and the new image
   paths are correct (`docs/screenshots/<name>.png` from the
   repo-root README).
10. **End-of-session cross-provider verification.** The verifier
    reviews the README diff as prose: does the framing section
    avoid overselling? Does the gallery section flow with the
    rest? Are sample-report excerpts representative or
    cherry-picked-misleadingly? Are claims supported by the
    visual evidence? Wording-quality issues are normal at this
    step — expect a small Round 2 if the framing section needs
    tightening.
11. **Commit, push, run close-out.** Final session — write
    `change-log.md` summarizing the polish pass.

**Creates:** `docs/session-sets/011-readme-polish/change-log.md`
(close-out artifact).

**Touches:**
- `README.md` (new framing section, gallery, embed-and-tighten pass,
  hero replacement);
- `docs/screenshots/SPEC.md` (only if a captured screenshot doesn't
  match the spec's claim — mark deviations);
- `tools/dabbler-ai-orchestration/README.md` (only if a screenshot
  reference there benefits from updating to point at the polished
  set; otherwise no touch).

**Ends with:** the README has the framing section, the gallery, the
sample-report excerpts, and the prose tighten-up landed; the
verifier returns `VERIFIED` on the prose review; `change-log.md` is
written; the closeout snapshot flips to closed.

**Progress keys:** all required screenshot files referenced from the
README resolve to actual files under `docs/screenshots/`; the
README's word count drops modestly (sign that the prose tighten-up
landed rather than just "added more text"); no orphan
`docs/screenshots/SPEC.md` references survive in the README body
(the spec is implementation-detail, not user-facing).

---

## Acceptance criteria for the set

- [ ] `docs/sample-reports/` contains two redacted markdown reports
      drawn from two real reference projects of contrasting shapes.
- [ ] `docs/screenshots/SPEC.md` documents every screenshot the
      README references; `docs/screenshots/` contains the captured
      images.
- [ ] If retrofit was needed, the normalization script and
      projection (`router-metrics-normalized.jsonl`) live alongside
      the originals in the reference projects, and the originals
      are byte-for-byte unchanged versus before this set.
- [ ] Repo-root README has a new framing section between the
      preamble and the Table of Contents, grounded in the
      construction-trades analogy, three paragraphs or fewer, free
      of "paradigm shift" / "revolution" language.
- [ ] Repo-root README has an inline gallery of at least four
      screenshots (Sessions Explorer, Cost Dashboard, one
      Queue/Heartbeat view, one report).
- [ ] Repo-root README has at least one embedded sample-report
      excerpt with a link to the full report under
      `docs/sample-reports/`.
- [ ] At least two paragraphs of redundant prose were tightened or
      removed in favor of the new screenshots (signal that the
      polish landed rather than just adding content on top).
- [ ] Cross-provider verification returns `VERIFIED` on Session 2;
      `change-log.md` is committed.

---

## Risks

- **The framing section can tip into overselling.** Mitigation:
  the spec specifies a hard ~140-word ceiling, lists banned
  language (paradigm shift, revolution, AI-first), and grounds the
  analogy in a concrete trade. The verifier's prose review at
  Step 10 is the safety net — if the section reads as marketing,
  the verifier will flag it.
- **Sample reports may inadvertently leak project-internal
  information.** Mitigation: the operator does the redaction pass
  in Session 1 Step 4; the orchestrator suggests candidates but
  doesn't auto-redact. The verifier is also asked to flag
  anything that looks like it shouldn't be public.
- **Screenshot capture is human-driven and asymmetric in cost** —
  the orchestrator can author the spec instantly but capturing
  eight screenshots well takes the operator real time.
  Mitigation: the spec lists three optional shots that can be
  skipped if friction is high; the required-five core gives
  enough material for a polished README.
- **Retrofit risk on the reference projects.** Mitigation: the
  normalization is a *projection*, not a mutation. If the
  retrofit reveals deeper data-shape problems, that surfaces as
  a follow-up issue (file as a backlog item against the
  reference project, don't try to fix in this set).
- **README diff size may exceed the verifier's preferred input
  size.** Mitigation: Session 2 verification can include just the
  changed regions (preamble + new sections + tightened
  paragraphs) rather than the whole file. Calibration note for
  the prompt: include enough surrounding context that the
  verifier can judge flow, not just diff correctness.

---

## References

- Set 010 (`010-pypi-publish-and-installer`) — prerequisite. Sets
  the stage for the README's adoption section to be one install
  command instead of a 60-line walkthrough; Set 011 polishes on
  top of that.
- Set 008 (`008-cancelled-session-set-status`) — established that
  `Cancelled` is a first-class state; screenshot #1's "all four
  state groups" claim depends on Set 008's work being live.
- `docs/ai-led-session-workflow.md` — the canonical workflow each
  session follows.
- `docs/planning/session-set-authoring-guide.md` — the spec
  authoring rules this spec follows.
- `ai_router/report.py` — the report tool whose output Session 1
  captures and Session 2 embeds.

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route
each, no analysis routes per the standing operator cost-containment
rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Retrofit + sample reports + screenshot spec | $0.10–$0.20 | Mechanical; verification mostly checks redaction quality and spec completeness. |
| 2 — README polish + framing + gallery | $0.20–$0.40 | Prose-quality verification can surface stylistic concerns; expect possible Round 2 if the framing section needs tightening. |
| **Set total** | **$0.30–$0.60** | Well below typical multi-session set cost; the work is heavier in time-on-task than in routed-call cost. |

Smaller than recent sets (Set 010 estimated $0.35–$0.70, Set 009
actual $0.78). Documentation polish runs cheap relative to feature
work.
