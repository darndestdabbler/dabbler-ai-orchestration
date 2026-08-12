# Session 3 verification — conventions block

Read this before the change set. It states the agreed baseline so Round 1
spends its findings on real defects rather than on the baseline itself
(project-guidance → Workflow Expectations, L-064-10).

## Suite baseline (exact, this session)

| suite | result | when |
| :--- | :--- | :--- |
| pytest (full) | **4006 passed, 9 skipped**, 607s | after the last code change |
| Playwright Layer 3 (full) | **31 passed**, 5.0m | after the last code change |
| mocha Layer 2 | **1459 passing, 2 pending**, 28s | after the last code change |

Session 2's recorded baseline was 3991 passed / 9 skipped. The delta of
**+15** is exactly this session's new falsifiers: 4 non-parametrized tests
plus `test_is_gitignored_by_recognises_genuine_coverage` (3 cases) and
`test_is_gitignored_by_rejects_look_alikes` (7 cases), plus the stderr-warning
test. No test was deleted without a replacement (see "Replaced, not deleted").

Layer 2 went 1475 → 1459 mid-session. That is not a regression: 16 cases
pinned the extension-side `.gitignore` guarantee and the atomic file writer,
both of which were **removed on purpose** (see Finding 2 below). Their
coverage moved to `ai_router/tests/test_verify_type_resolution.py`, which
gained 15.

## Release contract

Nothing is published by this session. `ai_router` and the extension are both
released by the operator only; no version bump is claimed here, and
`tools/dabbler-ai-orchestration/dist/` is a **tracked build artifact**
refreshed by `npm run compile` — its diff is generated, not hand-authored.

## By-design exclusions

- `docs/session-sets/**` verification artifacts from Sets 123/124 are **raw
  records** and are never edited. They still contain the retired "committed"
  vocabulary on purpose; that is history, not a live surface.
- `docs/planning/verify-type-resolution.md` keeps its Set 123 prose and
  carries a Set 124 amendment banner in the status preamble instead of being
  rewritten. It is a dated design record.
- `test-fixtures/cold-start/full/**` is a **golden snapshot** of the template
  render, regenerated with `UPDATE_GOLDEN=1 npm run test:unit`. Its diff must
  mirror the template's.

## What this session was planned to do

Spec Session 3 of 3: fix every documentation echo of the retired "committed"
claim, fix the extension-side echoes and the tests pinning them, walk the cold
start, then run the full suites.

## What it actually found — please review these as the load-bearing changes

**Finding 1 (Critical, fixed): the extension still wrote the key S2 had
turned into a hard refusal.** `performCopilotSeatSetup` rendered
`transport.profile: copilot-cli` into `ai_router/local-overrides.yaml`. Set
124 S2 made that key raise at config load, so a *successful*
`Dabbler: Set Up Copilot Seat` produced a project whose every `load_config`
raised `ValueError`. Reproduced in a throwaway fixture before any fix.
Operator was briefed and chose the fix; journaled in `decisions.jsonl`
(rubric line `goal-over-letter`). The write is now
`<venvPython> -m ai_router.verify_type --set COPILOT_CLI --project-root <dir>`
— the one sanctioned writer — and the retired YAML-render machinery is gone.

**Finding 2 (Major, fixed): the writer promised an ignore it never made.**
The required cold-start walk exposed it: `write_project_verify_type` embeds a
header reading *"Gitignored on purpose"*, but nothing added the rule, so the
documented first run left the answer untracked and **committable**
(`git check-ignore` exit 1). `ensure_gitignored()` now runs **before** the
file is written. Consequence: the `.gitignore` guarantee this same session had
just added to the extension became a second implementation of one fact — the
exact defect this set removes — so it was deleted and the extension inherits
the guarantee through the spawn.

## Replaced, not deleted

Every removal carries a replacement or an explicit reason, in a comment at
the removal site:

| removed | replaced by |
| :--- | :--- |
| `renderTransportProfile` + `locateTransportProfile` + `hasTopLevelTransportBlock` + `RenderProfileResult` and their suite | `buildVerifyTypeArgs` / `verifyTypeCommandHint` suites — the extension invokes a writer instead of editing a YAML field |
| `readTransportProfile` | `readProjectVerifyType` (parses the sanctioned writer's comment header) |
| `ensureVerifyTypeIgnored` / `isVerifyTypeIgnored` (TS) | `ensure_gitignored` / `is_gitignored_by` (Python), falsified both directions |
| `writeFileAtomically` / `ATOMIC_WRITE_TMP_SUFFIX` | nothing — its last caller went with the guarantee above; the atomic-replace concern moved to the writer that owns the write |
| outcome kind `config-write-failed` | `verify-type-write-failed` (same two-step partial state, honest name) |

## Falsifiers shipped (L-112-1: planted, not read)

Python: the rule fires on a bare repo; it precedes the file it protects;
appends without clobbering; is idempotent; recognises the 3 genuine patterns;
rejects 7 look-alikes **including the retired local-overrides rule**; an
unwritable `.gitignore` warns on stderr and still records the answer.
**Mutation-tested:** disabling `ensure_gitignored` fails exactly 4 of them;
restored → 46 pass.

TypeScript: asserts no file the seat setup writes carries
`profile: copilot-cli`; asserts an existing `local-overrides.yaml` is left
**byte-identical**; asserts the recovery message names
`verify_type --set COPILOT_CLI` and never `transport:` or
`local-overrides.yaml`.

## Irony budget

The set declared 18 new test functions across three sessions. This session
added 7 (15 cases). Please flag if the total reads as over-budget.
