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

- Every lesson carries a one-line id marker under its heading:
  `<!-- lesson: id="L-<set>-<seq>" added-set="NNN" scope="portable" -->`.
  Validate with `python -m ai_router.validate_guidance_meta`. **Usage is
  not recorded here** — it lives in `docs/planning/guidance-usage.json`,
  read only at prune time (Set 121 S2).
- **Cite at close:** when a lesson is instrumental, list its id in
  `disposition.lessons_cited` and run
  `python -m ai_router.cite_lessons --set <N> --session <M> <id> ...` in
  the final commit — that usage signal drives every archival decision.
- **Never delete — archive** (operator-reviewed, full text preserved).
  Retention is measured in **active sessions**, never elapsed time, and
  pruning is a batched pass the operator initiates
  (`python -m ai_router.guidance_ledger report`). Preload residency
  follows the Set 085 admission test; this file is capped by the preload
  manifest (`python -m ai_router.guidance_report --check`).

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
| L-064-4 | `ai_router/cli_glyph_guard.py` (encoded Set 121 S3) |
| L-064-5 | `project-guidance.md` -> Conventions -> Workflow Expectations (session-state SSOT) |
| L-064-10 | `project-guidance.md` -> Conventions -> Workflow Expectations (up-front conventions block) — G-010 |
| L-064-11 | `session-set-authoring-guide.md` + `project-guidance.md` (spec-declared E2E/UAT) |
| L-066-1 | `ai_router/tests/test_contract_gate_schema.py` (encoded Set 121 S3) |
| L-069-1 | `project-guidance.md` -> Conventions -> Code Style (fix every sibling site) — G-008 |
| L-070-1 | `project-guidance.md` -> Conventions -> Workflow Expectations (iterative dogfood is evidence) — G-019 |
| L-079-3 | `project-guidance.md` -> Conventions -> Workflow Expectations (dogfood the true cold start) — G-020 |

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
<!-- lesson: id="L-079-1" added-set="079" scope="portable" -->

- Pass **bytes** end-to-end across a subprocess pipe and decode once at
  the consumer with an explicit codec, and write routed output to disk
  with `encoding="utf-8"` **before** printing it — a text-mode pipe with
  no `encoding=` decodes as cp1252 on Windows, and a mid-print crash
  loses the paid output. (Set 121 S1: the routed-output half is encoded
  in `cli_transport`; **29 production call sites still pass `text=True`
  with no `encoding=`** and are an open residual.)

## Archived lessons (Set 095 preload-ceiling triage)
<!-- lesson-pointer: archived-set="095" -->

L-095-1's admission required demotions (ceilings ratchet down only);
full text in `lessons-archive.md`:

| id | where the rule lives now |
| :--- | :--- |
| L-064-7 | executable-gate-encoded in the `verify_session` CLI (sub-Round-1 `--max-tier` refused without `--wording-only`) |
| L-078-1 | situational release/rollback-authoring trigger — search the archive at that moment |

## A Replacement Doc Inherits The Retired Doc's Claims At Its Peril
<!-- lesson: id="L-064-8" added-set="063" scope="portable" -->

- When authoring a replacement or successor doc, grep the new text for
  claims of *current* behavior (reads, writes, enforcement, defaults) and
  re-verify each against the code before routing verification — prose
  carried over from a superseded doc was true in the old context and
  reads authoritative in the new one.


## Ship Every Pattern Gate With A Falsifier That Plants The Violation
<!-- lesson: id="L-112-1" added-set="112" scope="portable" -->

- Per rule: one falsifier that plants the defect and asserts the gate
  fires, one that plants the legitimate look-alike and asserts it does
  not. Assert the **rule**, not a substring a sibling rule also emits,
  and add a structural assertion beside the textual one. A gate that
  matches nothing looks identical to one that finds nothing, and reading
  its regexes reads as confirmation. (Set 121 S1: the *assert your
  corpus is non-empty* half is now enforced —
  `ai_router/corpus_scan_guard.py`.)

## Encoded lessons (Set 121 encode-or-drop pass)
<!-- lesson-pointer: archived-set="121" -->

Set 121 S1 applied the operator's rule — *a lesson becomes executable
code or a single instruction line, or it is dropped* — to every active
lesson. These two were **already enforced by shipped code with true
falsifiers**, so criterion 4 of the admission test (no executable-gate
equivalent) disqualified them from preload. Full text in
`lessons-archive.md`; the per-lesson dispositions and their reasoning are
in the set's `decisions.jsonl`.

| id | the gate that now enforces it |
| :--- | :--- |
| L-064-9 | `ai_router/verify_session.py` — `EvidenceBundle.git_status` renders `git status --short` ahead of the diff (`test_verify_session.py::TestEvidenceAssembly`) |
| L-125-1 | `ai_router/cli_transport.py` — `READ_ONLY_TOOLS` / `_tool_grant_argv()` on both dispatch paths (`test_routed_calls_cannot_mutate.py`) |

The three surviving lessons above were **condensed to one instruction
line each**; their pre-condensation full text is preserved in
`lessons-archive.md` without trailers, since the live ids stay here.

---

## Repo-Specific Lessons

> _No repo-specific lessons are currently in the active tier._ L-064-12
> was promoted at Set 110 Step 9 (see the table above for where its rule
> lives); its full text is in `lessons-archive.md`.
