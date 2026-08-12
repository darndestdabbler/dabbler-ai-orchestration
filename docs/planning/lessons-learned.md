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

## Promoted lessons (Set 110 Step 9)
<!-- lesson-pointer: archived-set="110" -->

Set 110's Step 9 promoted three lessons whose citation counts had long since
passed the two-context bar — 27, 14 and 9 sets respectively. Their canonical
rules now live in `project-guidance.md`, which is also loaded at every session
start, so the active-tier copies were pure redundancy. Full text moved to
`lessons-archive.md` (never deleted; reactivated by `cite_lessons`).

| id | rule now lives in |
| :--- | :--- |
| L-065-1 | `project-guidance.md` -> Conventions -> Workflow Expectations (propagate a consistency fix to every echo) |
| L-095-1 | `project-guidance.md` -> Conventions -> Workflow Expectations (grade severity by consequence) |
| L-064-12 | `project-guidance.md` -> Conventions -> Build and Test (Explorer / state-writer / fixture / **manifest** changes run full Layer 3 before close) |

L-064-12 was **broadened** on promotion: Set 110 S4 proved the extension
manifest belongs in the trigger list, after a `package.json` edit that landed
after the last full Layer 3 run reached a staged VSIX carrying an icon shape VS
Code rejects outright.

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
<!-- lesson: id="L-079-1" added-set="079" last-used-set="124" status="active" scope="portable" -->

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
<!-- lesson: id="L-064-8" added-set="063" last-used-set="124" status="active" scope="portable" -->

- Prose carried over from a superseded doc was true (or tolerated) in the
  old context and reads authoritative in the new one — a defect class of
  its own. When authoring a replacement or successor doc, grep the new
  text for claims of *current* behavior (reads, writes, enforcement,
  defaults) and re-verify each against the code before routing
  verification.

## `git diff`-Based Verification Evidence Omits Untracked Files
<!-- lesson: id="L-064-9" added-set="063" last-used-set="124" status="active" scope="portable" -->

- `git diff` shows only tracked changes, so an evidence bundle that
  presents a diffstat as "the change set" silently omits new files and
  earns a Major completeness finding. `git add` new deliverables before
  generating diff-based evidence, or include `git status --short`
  alongside the diff so additions are visible.


## A Gate That Only Ever Passes Proves Nothing — Ship It With Falsifiers
<!-- lesson: id="L-112-1" added-set="112" last-used-set="124" status="active" scope="portable" -->

- A pattern-matching gate (grep guard, banned-phrase scan) that matches
  nothing looks **identical** to one that finds nothing, and reviewing
  its regexes reads as confirmation. Only a **planted violation**
  separates them: per rule, one falsifier that plants the defect and
  asserts the gate fires, one that plants the legitimate look-alike and
  asserts it does not. Set 112's anti-resurrection gate passed its own
  repo cleanly and still missed six declaration shapes over four
  verification rounds — every one found by planting it, none by reading
  the code. Add a **structural** assertion beside the textual one; it
  holds however a thing is spelled.

## Compare What A Transport CAN DO, Not What It Returns
<!-- lesson: id="L-125-1" added-set="125" last-used-set="125" status="active" scope="portable" -->

- Backends behind one interface differ in **capability**, not output. Under
  one `route()` contract, direct-API sends no `tools` key and cannot touch
  disk; the CLI transport dispatches an **agentic** process with shell and
  file-write. The gap lived in one subprocess flag, surfacing when routed
  calls silently edited 23 files, and a reviewer able to edit what it judges
  can VERIFY its own edit. **Refusal is not a control:** grant least
  privilege as an **allowlist** (denylists fail open).---

## Repo-Specific Lessons

> _No repo-specific lessons are currently in the active tier._ L-064-12
> (Explorer / state-writer / fixture / **manifest** changes run the full
> Layer 3 locally before close, after the last code change) was promoted at
> Set 110 Step 9 to `project-guidance.md` -> Conventions -> Build and Test;
> its full text is in `lessons-archive.md`.
