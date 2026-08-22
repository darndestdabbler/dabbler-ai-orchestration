# BATON: thin run core, Phase 0 external slice — built, reviewed, remediated

**Date:** 2026-08-22
**From:** Claude Opus 5 (1M context), spike session on `spike/thin-run-core`
**To:** The next session on this branch, and Sol
**Status:** Phase 0 slice complete and remediated. Accepted by review as a
behavioural prototype, **not** cut over. Nothing is in flight; the tree is
clean and everything is pushed.

---

## TL;DR

The external Phase 0 slice of `docs/run-core-blueprint.md` (§§3–9 plus §11) is
implemented in this disposable repository under ordinary git and direct
pytest. Sol reviewed it, found three integrity defects, one performance
defect, and one accounting objection; all five are fixed or answered, and six
blueprint defects were resolved in the blueprint itself.

**673 tests pass** (547 pre-existing, 126 new). The production repository's
lifecycle is untouched, and the new framework was never its own gate.

The open question is not technical. It is **§12.17**: measured honestly, the
replacement is only 8% smaller than what it unconditionally deletes. That
judgement is the operator's, and §5 of `docs/run-core-phase0-report.md` has
the numbers.

Three commits, all on GitHub:

| commit | what |
| --- | --- |
| `e33105ee` | Phase 0: the thin run core, external scratch slice |
| `9b20b2da` | Remediation pass: recovery integrity, lock ownership, projection cost |
| `22955edd` | `hl7-study-results.md` (authored by the operator on GitHub, pulled here) |

---

## What was done this session

### 1. The slice (`e33105ee`)

Six modules under `ai_router/`, matching §13's ownership table — no seventh,
no per-verb shims:

| Module | Owns |
| --- | --- |
| `journal.py` | Envelope, append+lock+fsync, sequence, read-after, truncation tolerance, heartbeat, git plumbing |
| `runcore.py` | Run identity, state fold, transitions, preconditions, escalation triggers, resume probe, worktree preparation |
| `runproject.py` | `run-projection.json`, spec parsing, organization join, the four documents |
| `checks.py` | Declared-check loading, targeted selection, execution, tree measurement |
| `verifyjob.py` | Request/Result contracts, evidence manifest, dispatch, rounds, remediation |
| `runcli.py` | The §7 verbs (18 of them), JSON I/O, exit codes |

Six schemas: `run-event`, `run-projection`, `session-organization`,
`session-state-v5`, `verification-request`, `verification-result`.
`router-config.schema.json` and `config.py` gained the §5.3 `run_policy`,
`git`, `explorer`, and `worktree` blocks.

Built in the instructed order — `fast` landed and passed before `verified`
existed. Targeted checks throughout; the complete suite exactly once at the
end. No dependency scheduling, no Agent SDK.

### 2. The remediation pass (`9b20b2da`)

Answering Sol's review. Detail in `docs/run-core-phase0-report.md` §4.

- **Critical — recovery bypassed checks and verification.** Adoption of a
  commit in the crash window inherited `finish`'s conclusion instead of
  re-deriving its proof. `runcore.adoption_problems` now requires a green
  `final-full` record bound to the committed tree for every required check,
  plus an accepted verdict for a `verified` run; anything missing parks the
  run and names the gap. Fixing it surfaced a fourth defect: `resume` parked a
  run and then un-parked it in the same call.
- **High — journal-lock ownership race.** Birth grace for unreadable locks,
  plus a per-holder token so a displaced holder cannot delete its successor's
  lock.
- **High — organization parsed and hashed separately**, letting an edit
  between the passes publish old content under the new digest. One read now
  yields both. `read_projection` also validates before serving.
- **High — projection cost.** 52 s → **0.19 s** for a 1,000-event rebuild.
  The cause was mostly `jsonschema` recompiling the 19-branch schema per event
  per read, not the re-fold. Compiled per-type validators, cached repository
  identity and v4 detection, and `journal.batch` (one read per lock).
- **Major — the reduction was not demonstrated.** The core imported four
  deletion-row modules. Those are now extracted, and
  `tests/test_runcore_independence.py` proves it two ways, including a
  subprocess import with the deletion rows blocked at `sys.meta_path`.

Six blueprint defects resolved *in the blueprint*: `waiting → completed` for
the attested waiver, a distinct `selection-unknown` escalation token, a null
`run_id` for organizational events, defined run-attempt and dispatch
identities, a schema for the generated v5 set document, and §11.2's stale
worktree command forms reconciled with §7.

### 3. The HL7 study (`22955edd`)

Pulled from GitHub, read, not acted on. It bears on this work in three ways —
see **Outstanding actions** 5, 6 and 7 below.

---

## Outstanding actions

Ordered by who has to decide. Nothing here is in progress.

### For the operator

1. **§12.17 — accept or falsify the rebuild thesis.** Measured against the
   unconditional deletion rows: 5,258 raw lines added, 5,748 deleted, **net
   −490 (8%)**. Tests: 126 added, 135 superseded, net −9. The blueprint
   projected ~5,450 deleted for ~1,750 added. The economic case now rests
   entirely on the conditional v3 row (−4,060 combined), which set 146
   decides. Sol's phase-0 rule says a core that is not markedly smaller has
   falsified the thesis. **Numbers: report §5.1.**

2. **§12.16 — the benchmark is still not runnable here.** `hl7-study-results.md`
   is the *results* of a study run in the sibling `dabbler-ai-orchestration-eval`
   repository, and says so in its own header. §15.2 asks for the task and
   repository. Nothing in this repo can execute it.

3. **Close or cancel the in-flight v3 sequence** (§15.1) before stage 2
   (shadow observation) can begin. Set 146's enable/kill decision also gates
   the conditional deletion row in item 1.

### For Sol

4. **Incremental projection — I did not build it, deliberately.** The 70 s
   that motivated the request is now 0.19 s, and a persisted fold state is a
   new machine record, a new divergence mode, and ~150 lines against a ceiling
   measurement puts several hundred runs away (the §8.1 two-second contract
   crosses at roughly **14,000 events**, ~400–900 runs). §14 already says the
   fix for an unbounded journal is compaction, not a cache in front of it.
   **If you want it anyway, say so — it is a small follow-up.** Reasoning and
   the scaling table are in report §4.4.

5. **The NITS/minor path can silence a defect the verifier found.** This is
   the sharpest thing the HL7 study says about this code, and it needs a
   blueprint decision, not a patch. `_strip_nits_section`
   (`verdict.py:101-103`) cuts the NITS section *before* issues are parsed, and
   `is_blocking_issue` (`verdict.py:229-236`) treats `minor` as non-blocking.
   §5.2.5 makes minor-only findings stop the loop, which is what I
   implemented. In the study's arm-2 case — Opus found the central defect and
   wrote "speculative rather than blocking" — a `verified` run would finish
   `VERIFIED`, `blocking_findings: 0`, and **no record of the defect at all**,
   because a NITS-sectioned finding is discarded rather than recorded as
   minor. A 0.426-accuracy parser would ship clean. Both files are on §10's
   "must survive unchanged" list, so this is yours to rule on.

6. **Plan review vs the blueprint.** Study §2 calls reviewing the plan "the
   strongest result in the study" — it moved the same defect, judged by the
   same model, from unsubstantiable to Critical, and halved implementer cost
   in all four cells. Blueprint §5.4 and §14 exclude plan machinery from
   `fast`/`verified`, and §13 has `plan_review.py` on the deletion list. These
   point in opposite directions.

### For the next implementation session

7. **`verifyjob.build_prompt` silently downgrades.** It falls back to a
   four-line inline stub when `config["_verification_template"]` is absent.
   Study §5 measured the house prompt as worth more than engine tier — three
   of four weak cells went 0.03–0.43 → 0.99+. A missing template should
   probably be a refusal, not a silent substitution. **Small, well-understood,
   safe to do.**

8. **Peak verdict is not projected.** §6 of the study says "report peak and
   terminal". The journal holds every round's result; `run-projection.json`
   surfaces only `last_verdict`. Recoverable, just not shown.

9. **`bootstrap.py` still imports `EXIT_BLOCKING` from `verify.py`** — the one
   remaining retained-module dependency on a deletion row, used to format a v3
   pre-commit hook. §13 already schedules bootstrap for rewrite in the same
   cutover that removes the hook, so this is expected work, not a blocker.

10. **Blueprint defects D6, D10, D11, D12, D13 are resolved in code but not in
    the blueprint.** Sol ruled on six of thirteen. The rest are recorded in
    report §3 with what I did and why. **D13 is the one that matters**: it
    added the only new vocabulary in the slice, the refusal token
    `generated-views-not-ignored`, because §6.2 asserts the generated views
    cannot dirty the candidate tree while §5.1.3 pins the snapshot semantics
    that would let them. D12 (camelCase `identityProvenance` inside an
    otherwise snake_case object) is implemented verbatim and may just be a typo.

11. **Explorer / extension gate is not implemented** (§8, and §12's extension
    items). Out of scope by instruction, and it is the remaining half of §12.

### Repository plumbing

12. **The local production clone is one commit behind GitHub** on this branch.
    `D:/Projects/dabbler-ai-orchestration` is at `9b20b2da`; GitHub and this
    repo are at `22955edd`. It does not have `hl7-study-results.md`.

13. **This repo's `origin` is the local clone, not GitHub**, with a fetch
    refspec that mirrors only `experiment/verification-pipeline-v3`. Two
    consequences: `git status` shows no ahead/behind for this branch and
    `@{u}` does not resolve, and `refs/remotes/github/*` exist here from an
    explicit-URL fetch with **no `remote.github` configured**, so `git fetch
    github` will not work. Use `git ls-remote <url>` to check state, or add
    the remote properly:
    `git remote add github https://github.com/darndestdabbler/dabbler-ai-orchestration.git`

---

## Where things stand mechanically

- Branch `spike/thin-run-core`, tree clean, three commits ahead of
  `12e99b3d` ("Fourth Overhaul").
- On GitHub at
  `https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/spike/thin-run-core`.
  The repo is public; no CI fires on `spike/*` (workflows are scoped to
  `master` and tags). `master` untouched.
- `.venv` here was created this session (`python -m venv .venv`, then
  `pip install -e ".[tests]"`). Run the suite with
  `.venv/Scripts/python -m pytest`.
- Full suite: **673 passed**, ~5 minutes at `-n 2`. The run-core subset alone
  is 126 tests, ~1.5 minutes at `-n 4`.
- Two benchmark scripts live in the session scratchpad, not the repo. They are
  disposable; the numbers they produced are in report §4.4 and §5.2, and
  `tests/test_runcore_independence.py` pins the freshness contract as a test.

## Reading order for whoever picks this up

1. `docs/run-core-phase0-report.md` — §2 for acceptance status, §4 for the
   review response, §5 for the numbers the cutover decision needs.
2. `docs/run-core-blueprint.md` — normative, and now carries Sol's six
   resolutions.
3. `hl7-study-results.md` — empirical, about a sibling repository, and the
   source of outstanding actions 5, 6 and 7.
