# Lessons Learned

> **Purpose:** Durable tactics and failure patterns that must be in
> context before the same mistake repeats. This is the always-loaded
> **active** tier of the guidance lifecycle; `lessons-archive.md` holds
> everything else and is **never** read at session start (search it with
> `python -m ai_router.guidance_search --archive`).
>
> **Note for consumer repos:** The portable lessons below apply to all
> AI-led-workflow repos. Add repo-specific lessons in the section at the
> bottom.

**Lifecycle in brief** (canonical reference:
[`docs/guidance-lifecycle.md`](../guidance-lifecycle.md)):

- Every lesson carries a one-line metadata trailer under its heading:
  `<!-- lesson: id="L-<set>-<seq>" added-set="NNN" last-used-set="NNN" status="active" scope="portable" -->`.
  Validate with `python -m ai_router.validate_guidance_meta`.
- **Cite at close:** when a lesson is instrumental, list its id in
  `disposition.lessons_cited` and run
  `python -m ai_router.cite_lessons --set <N> <id> ...` in the final
  commit — that usage signal drives every archival decision.
- **Never delete — archive** (operator-reviewed, full text preserved).
  Preload residency follows the Set 085 admission test; this file is
  capped by the preload manifest
  (`python -m ai_router.guidance_report --check`).

---

## Portable Lessons (all AI-led-workflow repos)

## Promoted lessons (full text archived)
<!-- lesson-pointer: archived-set="073" -->

These lessons proved durable and were **promoted** — their canonical rule now
lives in `project-guidance.md` (or the authoring guide), which is also loaded at
every session start, so the active-tier copy was pure redundancy. Set 073 moved
their **full text** to `lessons-archive.md` (never deleted; grep-able via
`python -m ai_router.guidance_search --archive`, reactivated by `cite_lessons`).

| id | rule now lives in |
| :--- | :--- |
| L-064-4 | `project-guidance.md` -> Conventions -> Code Style (ASCII-only glyphs) |
| L-064-5 | `project-guidance.md` -> Conventions -> Workflow Expectations (session-state SSOT) |
| L-064-10 | `project-guidance.md` -> Conventions -> Workflow Expectations (up-front conventions block) |
| L-064-11 | `session-set-authoring-guide.md` + `project-guidance.md` (spec-declared E2E/UAT) |
| L-066-1 | `project-guidance.md` -> Conventions -> Code Style (pure-Python validator parity) |
| L-069-1 | `project-guidance.md` -> Conventions -> Code Style (fix every sibling site) |
| L-070-1 | `project-guidance.md` -> Conventions -> Workflow Expectations (iterative dogfood is evidence) |
| L-079-3 | `project-guidance.md` -> Conventions -> Workflow Expectations (dogfood the true cold start) |

## Archived lessons (Set 085 preload triage)
<!-- lesson-pointer: archived-set="085" -->

Set 085 applied the preload **admission test** (recent recurrence AND
high miss cost AND weak automated detectability AND no executable-gate
equivalent AND expressible in <=150 tokens; see
`docs/guidance-lifecycle.md`). Lessons already enforced by automation, or
whose trigger moment is situational, moved full-text to
`lessons-archive.md`:

| id | where the rule lives now |
| :--- | :--- |
| L-064-1 | encoded in `ai_router/utils.py::detect_truncation` — call it before trusting structured routed output |
| L-064-2 | encoded in `router-config.yaml` `verification.max_cost_multiplier` (router-enforced, no orchestrator action) |
| L-064-3 | merged into L-079-1 below (one cp1252 class) |
| L-064-6 | duplicate of `project-guidance.md` -> Workflow Expectations (route `ai-assignment.md`; never self-opine) |
| L-069-2 | encoded in the shipped reviewer templates (both carry the strong adversarial framing) |
| L-071-1 | encoded in `ai_router.verification.is_blocking_verdict` / `classify_blocking` + the workflow Step-6 loop discipline; principle stated in `session-constitution.md` |
| L-072-1, L-073-1 | experiment-design methodology — consult the archive when designing an A/B or recording a replication |
| L-079-2 | spec-authoring rule — see the authoring guide (gate flags live in the config block, prose cannot arm a gate) |

## Windows cp1252 Is A Standing Bug Class — Bytes At Subprocess Boundaries, Persist Before Printing
<!-- lesson: id="L-079-1" added-set="079" last-used-set="087" status="active" scope="portable" -->

- The child Python's stdout text layer defaults to `cp1252` on Windows,
  so any non-ASCII payload crossing a pipe *as text* is a latent crash in
  both directions — and a fail-open branch can swallow it silently (the
  Set 079 config-seed defect shipped exactly that way). Pass **bytes**
  end-to-end (`sys.stdout.buffer.write(...)`), decode once at the
  consumer with a streaming-safe decoder, and when touching spawn code
  grep for the sibling sites (L-069-1). Same class (merged L-064-3):
  never `print(result.content)` before writing routed output to disk with
  `encoding="utf-8"` — a mid-print crash loses the paid output. A
  fail-open branch around such I/O must NAME the skip in operator-facing
  output.

## Archived lessons (Set 095 preload-ceiling triage)
<!-- lesson-pointer: archived-set="095" -->

L-095-1's admission required demotions (ceilings ratchet down only);
full text in `lessons-archive.md`:

| id | where the rule lives now |
| :--- | :--- |
| L-064-7 | executable-gate-encoded in the `verify_session` CLI (sub-Round-1 `--max-tier` refused without `--wording-only`) |
| L-078-1 | situational release/rollback-authoring trigger — search the archive at that moment |

## A Replacement Doc Inherits The Retired Doc's Claims At Its Peril
<!-- lesson: id="L-064-8" added-set="063" last-used-set="101" status="active" scope="portable" -->

- Prose carried over from a superseded doc was true (or tolerated) in the
  old context and reads authoritative in the new one — a defect class of
  its own. When authoring a replacement or successor doc, grep the new
  text for claims of *current* behavior (reads, writes, enforcement,
  defaults) and re-verify each against the code before routing
  verification.

## `git diff`-Based Verification Evidence Omits Untracked Files
<!-- lesson: id="L-064-9" added-set="063" last-used-set="102" status="active" scope="portable" -->

- `git diff` shows only tracked changes, so an evidence bundle that
  presents a diffstat as "the change set" silently omits new files and
  earns a Major completeness finding. `git add` new deliverables before
  generating diff-based evidence, or include `git status --short`
  alongside the diff so additions are visible.

## Propagate A Consistency Fix To Every Echo Before Re-Verifying
<!-- lesson: id="L-065-1" added-set="065" last-used-set="100" status="active" scope="portable" -->

- A consistency finding is rarely local: the same claim echoes in the
  summary table, body prose, per-row cells, and the bottom line, and each
  missed echo costs another verification round (Set 065 spent two rounds
  chasing residual echoes). After fixing, grep the document for the key
  phrases of the *old* claim and update every echo in one pass before
  re-verifying. The same discipline applies to the cross-round issue
  ledger.

## A Dependency-Pin Bump Is Not Enablement
<!-- lesson: id="L-075-1" added-set="075" last-used-set="084" status="active" scope="portable" -->

- A raised floor in `requirements.txt` (or any manifest) does not touch
  the already-provisioned environment; the downstream step still fails
  with `No module named ...` mid-session on an expensive path. Enablement
  is three steps: bump the pin, **upgrade the target venv**
  (`pip install -U "<pkg>>=<floor>"`), and **prove the entrypoint**
  imports and parses the exact args the downstream step will pass. Record
  the resolved installed version at close, not just the declared floor.

## An Ungraded "Find Issues" Verification Loop On An Unbounded Artifact Surface Does Not Converge
<!-- lesson: id="L-095-1" added-set="095" last-used-set="102" status="active" scope="portable" -->

- Reviewers are salience-limited, not context-limited: each pass returns
  the most salient handful of technically-real findings, and fixing them
  reshuffles salience for the next (Set 095: 17 rounds, 39 fresh Majors,
  zero disputed, no convergence). Grade severity by CONSEQUENCE —
  probability the stated failure scenario materializes for a real user ×
  impact on the deliverable's objectives; low-probability OR low-impact
  is Minor even when technically correct; no plausible failure scenario
  ⇒ Minor by definition. The first rubric-graded round returned VERIFIED.
  Until the rubric ships in the verification template, carry it in each
  round's up-front conventions block.

---

## Repo-Specific Lessons

## Explorer / State-Writer / Fixture Changes Run Layer 3 Locally Before Close
<!-- lesson: id="L-064-12" added-set="047" last-used-set="101" status="active" scope="repo-specific" -->

- The Layer-3 Playwright suite is the only gate that exercises the real
  webview, and a test layer nobody runs rots silently — five rot families
  accumulated while the workflow was never green, and fail-fast then hid
  both the OS-independent rot and a Linux-only env bug. Any session that
  changes Explorer-rendering surfaces, the state-file writers, or the
  fixture harness runs `npm run test:playwright` locally before close.
  When CI is red, treat CANCELLED jobs as unknown coverage, not passing
  coverage — and fix a red workflow in-flight rather than letting a
  standing failure re-accumulate.
