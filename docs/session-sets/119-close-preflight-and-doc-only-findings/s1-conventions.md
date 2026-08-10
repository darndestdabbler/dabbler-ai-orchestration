# Session 1 conventions — Set 119

Read this before the diff. It states the baseline, the release contract,
and the by-design exclusions, so Round 1 spends itself on real defects
rather than on the agreed starting conditions.

## Suite baseline

The **full** pytest suite was run on the frozen tree, after the last code
change, and is **green**:

```
3912 passed, 9 skipped, 0 failed   (14:59 wall clock, -n auto)
```

Recorded as the run of record (`test-runs.jsonl`, `outcome=passed`,
`duration-seconds=901`). There are **no tracked failures** and no known
flakes in this session's surfaces. The 9 skips are the suite's standing
skips (platform/marker-gated), unchanged by this session.

Two failures appeared on the **first** full run and both were environmental,
not code — both are resolved and the numbers above are from a clean re-run:

1. `test_routing_exclusion_integrity` — the seat's Copilot CLI moved
   1.0.78 → 1.0.79, so the gitignored, seat-local
   `ai_router/copilot-catalog.lock` failed its fail-closed version-drift
   check and every `route()` call was refused. Refreshed with operator
   authorization (`copilot_catalog --refresh`, 11/18 models confirmed,
   providers anthropic/google/openai). Not a repo change — the lockfile is
   gitignored.
2. `test_drift_guard::test_real_repo_passes_all_drift_checks` — the
   `one-active-set` rule saw Set 117 and Set 119 both in-progress.
   Resolved by **parking Set 117** with the sanctioned, reversible
   `cancel_session_set` writer, on operator decision. Set 117's Sessions
   2–3 are pending, not abandoned; `preCancelStatus: in-progress` is
   recorded for `restore_session_set`.

## Release contract

Nothing is published by this session. `pyproject.toml` stays at `1.0.0`
(staged, publish operator-gated since Set 112) and no tag is pushed. The
router changelog entry is filed under **`## [Unreleased]`** deliberately —
this is Session 1 of 3 and the set is not finished. **A finding that the
version was not bumped is a false positive.**

`TEMPLATE_ID` moving `session-verification-v7` → `v8` is **not** a package
version bump; it is the verification-integrity protocol's required
response to a deliberate reviewer-template revision (`verification_stamp.py`
pins one normalized hash per id, and an unbumped edit fails closed). The
new pin was computed from the edited file, not copied.

## By-design exclusions — do not report these as defects

- **`evidencePaths` is deliberately OPTIONAL in both JSON schemas** even
  though both reviewer templates call it MANDATORY on a Critical/Major
  finding. Making it schema-required would mean a finding that omits it is
  *invalid* rather than *blocking*, and the anti-laundering default
  ("unknown blocks") requires the opposite: an uncited blocking finding
  must stay blocking, never become cheaper. The asymmetry is the design.
- **Nothing enforces the mandatory-ness at runtime.** There is no gate that
  refuses a Critical/Major finding lacking `evidencePaths`, on purpose —
  see above. This is named as owed follow-on work in `ai-assignment.md`,
  not an oversight.
- **The doc-only cap applies uniformly to Critical as well as Major.** That
  is the spec's literal step-4 rule and the operator attested to it
  (`decisions.jsonl`, `authority=human`,
  `rubric_line=verification-reduction`, `verification_effect=reduces`,
  with the narrower Major-only alternative recorded as a considered and
  rejected option). It is not an implementation slip.
- **Doc-ness is extension-based, never directory-based.** A machine
  contract under `docs/` (e.g. `docs/session-issues.schema.json`) is
  correctly NOT documentation. This is deliberate and tested.
- **`BEHAVIOURAL_MARKDOWN_PREFIXES` has exactly one entry.** A one-item
  tuple is the intended shape; growing it is explicitly flagged in
  `ai-assignment.md` as a signal to simplify the rule rather than lengthen
  the list.
- **`docs/session-sets/**` artifacts are session records, not product.**
  `activity-log.json`, `checklist-posts.jsonl`, `decisions.jsonl`,
  `session-events.jsonl` and `test-runs.jsonl` are written by sanctioned
  writers; their content is evidence of the session, not code under review.
- **This is Session 1 of 3.** Sessions 2 (`close_preflight`) and 3 (the
  backstop baseline and the unreachable-module deletion) are explicitly out
  of scope. `change-log.md` is authored at the set-terminal session, so its
  absence now is correct.

## Severity rubric for this round

Grade by **expected consequence**: probability the stated failure scenario
hits a real user × material impact. Low probability **or** low impact is
Minor. A finding with no nameable failure scenario is a nit.

**New this round, and it applies to you:** every Critical/Major finding must
carry an **`Evidence paths:`** line naming the repo-relative files you
actually opened. This session ships that contract, and a finding whose cited
evidence is entirely documentation prose (`.md` / `.rst` / `.txt`) is
recorded as a Minor nit rather than opening another round. If the defect is
in code, name the code file.
