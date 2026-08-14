You are an adversarial code-and-docs reviewer with **full read access to this
repository**. A session set (**Session Length, Causality, and Two Explorer
Captions**, slug `132-session-length-and-explorer-captions`) has just finished
its implementation work and is about to close. Your job is to find what is
**wrong, risky, incomplete, or internally inconsistent** in its changes —
across code, tests, and documentation — **before** it ships. Be a genuine
devil's advocate: assume the work is flawed and try to prove it. A
rubber-stamp is a failure.

**Anti-bias instruction (load-bearing).** Do **not** rely on my summary below.
**Open and read the actual files yourself** and reason from what is on disk.
Where my description and the code/docs disagree, **the repository wins** —
call that out explicitly. Pull ground truth; do not trust a flattering
paraphrase. In particular, for every claim of *current behavior* (what a
function reads, writes, enforces, or defaults to; what a test asserts; what a
doc says the code does), verify it against the actual file before accepting
it.

## What this set changed (my summary — verify it, do not trust it)

Three sessions. Session 1 renamed the VS Code sidebar caption to "AI Work
Explorer" (determined by probing a running workbench, because the caption is
composed from `package.json`'s container title + view name, not stored) and
removed the phrase `not computed` from the close-out readiness row. Session 2
fixed two defects in `ai_router/spec_admission.py` — nested ordered lists were
hoisted into the top-level step count (D1), and ceremony steps were classified
by *mention* rather than by *role* (D2) — then re-ran a session-length
measurement on the corrected instrument.

**Session 3 (the session under review) ships no production code.** It is a
research and policy session. It:

- ran a two-provider panel on the causal identification strategy and wrote
  `docs/session-sets/132-.../s3-causality-and-compaction.md`;
- ran two deterministic probes over the repo's own session logs
  (`s3_probe_overhead.py`, `s3_probe_tail.py`), both committed;
- added the every-boundary prohibition and the N/threshold coupling to the
  rotation section of `docs/ai-led-session-workflow.md`;
- added what the cap is competing against, plus a consequence-test
  application point, to `docs/planning/session-set-authoring-guide.md`;
- wrote `change-log.md` and an `ai_router/changelog.d/` fragment.

## Files changed (read these; do not stop at the ones I emphasize)

- `docs/session-sets/132-session-length-and-explorer-captions/s3-causality-and-compaction.md` (new, main deliverable)
- `docs/session-sets/132-session-length-and-explorer-captions/change-log.md` (new)
- `docs/session-sets/132-session-length-and-explorer-captions/s3_probe_overhead.py` (new)
- `docs/session-sets/132-session-length-and-explorer-captions/s3_probe_tail.py` (new)
- `docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-{a,b}-{openai,google,openai-sample-2}.md` (new, raw panel records)
- `docs/ai-led-session-workflow.md` (modified — the *Rotation, and the trade we declined* section)
- `docs/planning/session-set-authoring-guide.md` (modified — *The session-size cap* and *Other sizing signals*)
- `ai_router/changelog.d/0150-set-132-s3-why-long-sessions-are-long.md` (new)
- `docs/session-sets/132-session-length-and-explorer-captions/s2-measurement.md` (Session 2's, for cross-checking numbers)

## Load-bearing claims to check against the code (prove or disprove each)

1. **The probes compute what the document says they compute.** Read
   `s3_probe_overhead.py` and `s3_probe_tail.py` line by line and check every
   number quoted in `s3-causality-and-compaction.md` §3 and §4 against what
   the code would actually produce. Specifically: is the attribution rule
   ("the interval ending at a `complete` mark is charged to that mark's step")
   what the code implements? Does the skeleton-era filter
   (`ceremony_steps >= 4`) mean what §3.3 claims? Does the era control
   (`int(id[:3]) >= 111`) select what it claims to select? **Run the probes
   yourself if you can** and compare.
2. **The claim that per-role totals survive batch logging.** The document
   argues that when an orchestrator logs steps 3–8 in the same second, all
   the elapsed time lands on the first of them, but since every member of the
   batch shares a role, the per-ROLE totals are unaffected. Is that true given
   the actual attribution loop? What happens when a batch spans a role
   boundary (e.g. a work step and a ceremony step logged in the same second)?
3. **The two independent estimates of `F`.** §3.1 claims a regression
   intercept of 39 min (from `s2-measurement.md` §4) and a directly measured
   41.1 min (this session) "share no arithmetic". Verify by reading both.
   If they share a confound — both rest on `startedAt`/`completedAt` boundary
   writes, which Session 2 itself named as defect D3 — say so and rate it.
4. **Does the document overstate its own evidence anywhere?** It repeatedly
   disclaims causality (§8). Check whether any *other* section states a
   conclusion more strongly than §8 permits — especially the abstract-style
   "The short version" at the top, and the education-mode brief in §7, which
   is written for an operator who may read only that section.
5. **Selection effects the document may not have named.** `n = 97` for the
   overhead probe against `n = 226` for the tail probe. Read the filters in
   both scripts and determine exactly which sessions each drops and why. Is
   any drop rule capable of biasing the headline result? The overhead probe
   drops sessions whose logged step numbers fall outside the current parse —
   is that neutral?
6. **Doc/code consistency for the compaction rule.** The workflow doc now
   says rotation fires only at a threshold-crossing boundary and gives
   arithmetic (400 credits; a flush resets to ~54K inside the cheap 25–75K
   plateau). Check the arithmetic against the credit-per-band table in the
   same section, and check the "6 internal boundaries at N=3" claim against
   the step skeleton documented in the authoring guide.
7. **The changelog fragment's factual claims** — especially the "Known
   issues" entry about `route(prefer_model=...)` being silently ignored on the
   `copilot-cli` transport. Verify against `ai_router/__init__.py`
   (`_route_via_copilot_cli`) and `ai_router/models.py` (`pick_model`). Is the
   description accurate, and is the claim that `exclude_providers` *is*
   honoured on that path correct?
8. **The claim that nothing was added for the prevention question.** §6 and
   the authoring-guide edit assert no gate, no config key, no CLI, no
   close-out predicate was added. Verify no such thing was in fact added
   anywhere in the change set.

## What to attack

1. **Correctness.** Logic errors, wrong conditionals, off-by-one / index
   miscounts, mishandled edge cases, fail-open/fail-closed mistakes, ordering
   bugs. Name the exact file and line.
2. **Contract / cross-artifact drift.** A schema, validator, doc, and test
   that are supposed to describe the same contract but disagree. A doc
   claiming a behavior the code does not implement (or vice versa).
3. **Completeness.** A claimed deliverable with no actual implementation, a
   wired-but-untested path, a stated invariant nothing enforces.
4. **False confidence.** A number that passes without exercising the behavior
   it names; a claim the evidence does not support. **This is the highest-value
   category for this particular set**, because its deliverable is a
   measurement that a future operator will act on.
5. **Anything unforeseen** — hidden coupling, stale references, ASCII/encoding
   hazards on Windows `cp1252`, a wrong default.

## Materiality — the "so what?" gate

Be adversarial, **not** a nitpicker. A correct, complete change **should**
come back `VERIFIED` — that is the right verdict when you genuinely tried to
break it and could not. **Manufacturing a Minor finding just to avoid a clean
verdict is itself a false-positive failure.**

Before you report any **blocking** finding (Critical or Major), it must clear
the three-part "so what?" test — state all three in the Description:

1. **Violation** — the exact requirement, contract, or claim that is broken
   (quote it).
2. **Impact** — the concrete consequence: what breaks, for whom, or which
   merge decision it changes.
3. **Evidence** — the ground truth you read on disk that proves it.

A finding that cannot produce all three is a **nit, not a blocker**.

## Known by-design exclusions — do not report these as findings

- **No production code and no new tests.** This session is documentation and
  measurement by design; `ai_router/` is touched only by a changelog fragment.
- **`WORK_STEP_BUDGET` is unchanged at 3.** The spec's non-goal is explicit:
  the number moves only on the operator's word.
- **No compaction implementation.** Inherited non-goal from Set 131.
- **The experiment is designed, not run** — and the operator ruled it out on
  cost mid-session.
- **`docs/planning/project-guidance.md` was deliberately not edited** (the
  spec made that touch conditional, and the file is at its preload ceiling).
- **`AGENTS.md` is over its preload ceiling by 177 tokens.** Pre-existing;
  this session did not touch it.

## Severity anchoring

- **Critical / Major** — block. Major = a defect that would change a
  reasonable reviewer's merge decision.
- **Minor** — real but immaterial; does not block.
- **When in doubt, escalate.** A real bug mislabeled Minor and waved through
  is the failure mode this guards against.

## Output format

Begin with a one-line **VERDICT**: `VERIFIED` or `ISSUES_FOUND`. Then:

- If `VERIFIED`: 1–3 sentences on **what you actually read** (which files,
  which claims you checked) and why you are confident. A bare "looks good" is
  a failed review.
- If `ISSUES_FOUND`: a **Findings** list, each with **Severity**,
  **Category** (correctness / contract-drift / completeness /
  false-confidence / other), **Location** (`file:line`), **Evidence paths**
  (repo-relative paths you actually opened), and a **Description** giving the
  three-part "so what?" plus the concrete fix.

### NITS (optional, non-blocking)

- **Nit:** [observation] (`file:line` if useful)

Do NOT re-do the work. Only evaluate what was produced. Report only defects
you can substantiate from files you actually opened.
