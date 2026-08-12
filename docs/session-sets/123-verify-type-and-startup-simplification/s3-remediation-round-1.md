# Session 3 — remediation, round 1

Covers the merged Critical/Major findings from **both** discovery passes:
round 1 (fan-out, two lenses) and round 2 (supplementary). Four findings,
three distinct defects, **all accepted, none disputed.**

---

## F1 + F2 (rounds 1a and 1b — the same defect, found independently by both lenses)

> `Dabbler: Open Module Plan` is still contributed and shown on module rows,
> but its implementation was deleted with `wizard/planImport.ts`.

**Accepted, and it is the single most important thing verification caught.**

`registerPlanImportCommand` registered **two** commands, not one:
`dabbler.importPlan` — retired on purpose by the operator's ruling — and
`dabbler.openModulePlan`, the Work Explorer's `Open Plan` row action, which
was never in scope. Deleting the file took both. Meanwhile `package.json`
still contributed the command, `workExplorerTreeModel.ts` still emitted
`;can-open-plan;`, and the inline action therefore still *rendered* on every
module row — clicking it would have failed with command-not-found on the main
module workflow.

**Why nothing caught it.** `tsc` was happy: the whole import went, so no
reference dangled. The menu-parity suite checks *menu → contributes*, not
*contributes → registration*. No Layer 3 spec clicks Open Plan. It is the
Session 2 class again in a new costume — the declaration survives, the
backing does not — and it is exactly what my own conventions block asked the
verifier to look for, which is a useful reminder that naming a risk is not
the same as being immune to it.

**Fix.** New `src/commands/openModulePlan.ts` carrying the opener, its target
resolution, the module preselect and the containment guard, registered in
`extension.ts` via `safeRegister`. It lives in `commands/` because it was
never wizard work: opening a file the operator already has is not authoring a
plan.

One deliberate behavioural change: the old missing-plan branch offered
`Import Plan`, which called the importer that no longer exists. Offering a
retired action is worse than offering nothing, so the branch now **names the
path the plan is expected at** and stops.

**Class sweep (`L-069-1`).** I compared every id in `contributes.commands`
against every registration in shipping source. Two apparent orphans were
false positives — `regenerateNarrationTemplates` registers via a `COMMAND_ID`
constant and `copyStartCommand.default` via a template literal — so
`dabbler.openModulePlan` was the only genuine one.

**Falsifier (`L-112-1`), and it is a planted one.** A new test in
`workExplorerMenuParity.test.ts` asserts every contributed command has a
registration, tolerating both non-literal shapes so it cannot fail on correct
code. Proven both ways rather than asserted: with `openModulePlan.ts` removed
it FAILS naming `dabbler.openModulePlan`; restored, it passes. This is the
one test Session 3 adds, against a spec that asked for none — justified
because it converts a defect that reached a verifier into a defect that
cannot recur silently, and the session is still net −8 Layer 3 scenarios and
−21 test files.

---

## F3 (round 2, supplementary) — a stale claim Session 1 falsified

> Copilot seat setup failure messages still claim the effective profile falls
> back to `api` via `local-overrides.yaml`, but Set 123 made
> `project-verify-type.txt` override that file.

**Accepted.** `describeSeatSetupOutcome` hard-coded `local-overrides.yaml
keeps transport.profile: api` in four failure branches, plus "the DABBLER_*
key(s) already set keep the api profile working". Both were true when written
and were made **false by Session 1 of this very set**:
`derive_transport_profile()` returns the committed project file's profile
*before* it reads any configured `transport.profile`. On a project that
committed `COPILOT_CLI`, an operator would be told they were safely on `api`
while dispatch stayed `copilot-cli`. Textbook `L-064-8`.

**Fix by subtraction, not by adding a file read.** The messages now report
only what the command actually did — the seat profile was **not enabled** —
and name `project-verify-type.txt` as the file that really decides, instead
of asserting an effective profile they are not in a position to know. The
keys claim is qualified rather than dropped ("wherever this project's
committed verify type is DIRECT_API"), because the keys really are still
usable.

Three Layer 2 tests pinned the old strings and were updated to pin the new
guarantee, including an explicit `!includes("keeps transport.profile: api")`
so the false claim cannot come back.

---

## F4 (round 1) — live docs still pointing at retired surfaces

> Live onboarding/reference docs still direct users to retired
> setup/config/prompt surfaces.

**Accepted.** My step-4 sweep updated the bootstrap trio, the extension
README, the consumer-bootstrap template's setup section and the cold-start
fixture, but stopped short of the repo-level docs. The verifier is right that
this is where a new contributor actually lands.

Swept in this round:

| file | what changed |
| :--- | :--- |
| `README.md` | "For new projects: the Getting Started form" → "set up in two commands": the palette scaffold plus `verify_type`, with the System Status strip paragraph removed |
| `docs/quick-start.md` | setup path, the whole "Configuring your project" section (the six-section editor table → a four-file YAML table naming `project-verify-type.txt` as the deriving source of truth), the adoption checklist item, the where-do-I-go list, and the Cost Dashboard mention in the repo layout table |
| `docs/repository-reference.md` | the three source-map rows for `src/wizard/`, `src/dashboard/`, `src/configEditor/` rewritten (the first now documents `commands/openModulePlan.ts`), plus two live claims about what writes `budget.yaml` and what `adoption-bootstrap.md` redirects to |
| `docs/ai-led-session-workflow.md` | budget-threshold authorship (twice) and the session-state writer that referenced the retired prompt command |
| `docs/budget-yaml-schema.md` | writers/readers sections: the form is retired, the config-editor reader is deleted, hand authoring is the standard path |
| `docs/adoption-bootstrap.md` | the retired stub's redirect target |
| `docs/templates/consumer-bootstrap/getting-started.md.template` | the module-declaration routes and the parallel-decomposition instruction |
| `CONTRIBUTING.md` | the `npm run walk -- --empty` comment |
| `src/commands/troubleshoot.ts` | **runtime user-facing text** telling operators to run the deleted `Dabbler: Show Cost Dashboard`; now points at `python -m ai_router.report` |
| `scripts/stage-walk.js`, `scripts/walk-smoke.js` | `--empty` mode narration (the mode is kept; its justification changed) |
| `scripts/verify_vsix_claims.py` | superseded header — it is pinned to `0.49.0` and cannot pass, so it is annotated as a record rather than rewritten to agree with today |

The cold-start golden fixture was **regenerated through its sanctioned
writer** (`UPDATE_GOLDEN=1 npm run test:unit`), not hand-edited, after the
template changed again.

Historical records remain untouched by design: `docs/session-sets/**`,
`docs/proposals/**`, both `CHANGELOG.md` files' existing entries,
`docs/case-studies/**`, and the one-off `scripts/verify_session_0*.py`.

---

## Suites after remediation

`npm run test:unit`: **1471 passing, 2 pending, 0 failing.** The full Layer 3
and full pytest runs are taken once at close, after freeze.


---

## Round 3 (remediation-review, cycle 1) — 2 fix verdicts accepted, 1 rejected

The `openModulePlan` fix and the seat-message fix were **accepted**. The docs
fix was **rejected**, correctly, and the reason is worth stating plainly: my
own rewrite of `docs/quick-start.md` introduced a NEW false claim while
removing an old one. It said `Dabbler: Set Up New Project` "scaffolds
`ai_router/router-config.yaml` and `ai_router/budget.yaml`" — but the palette
path passes no budget, so `budgetYaml.ts` is never reached and no budget file
is written. `docs/budget-yaml-schema.md`, which I had just corrected in the
same round, said so explicitly; the two documents disagreed with each other.

That is the `L-064-8` class one layer up: replacement prose inherits the
retired prose's claims, and a doc rewritten *from* a stale claim can land on a
different stale claim. The lesson for this session is that a doc sweep needs
the same "grep every echo" discipline as a code fix.

**Fix, applied to every echo rather than the reported line (`L-069-1`):**

| file:line | claim |
| :--- | :--- |
| `docs/quick-start.md:55` | "The scaffold also writes router-config.yaml (and budget.yaml)" -> names router-config.yaml only, with an explicit hand-author instruction for budget.yaml |
| `docs/quick-start.md:66` | the Configuring-your-project lead -> the same correction, stating that a project with no budget.yaml has not declared a budget yet |
| `docs/quick-start.md:207` | "(the budget step's output)" -> "(hand-authored)" |
| `docs/quick-start.md:223-228` | the adoption checklist item -> scaffold writes router-config.yaml; budget.yaml is hand-authored |

`docs/adoption-bootstrap.md:31-32` was checked and already correct (it says
hand-create both). `tools/dabbler-ai-orchestration/README.md:274` describes
`budget.yaml` as an operator declaration, which is now more true, not less.


---

## Round 5 (remediation-review, cycle 2) — one more echo of the same class

Three fix verdicts accepted, one rejected: the **extension-local README still
directed users to the retired Getting Started form for provider setup**
(`tools/dabbler-ai-orchestration/README.md:24-34`). Accepted without dispute.

I had rewritten that README's "Get started" section and missed an earlier
provider-access table twenty lines above it — the same
fix-the-reported-line-not-the-class failure the round-3 rejection was about,
in the same file. Two rejections, two rounds apart, both because a doc sweep
was done by reading rather than by grepping.

**Fix, and this time the sweep was mechanical.** The README table's Setup cell
now names `Dabbler: Set Up Copilot Seat`, and the paragraph below states that
the choice is committed to `project-verify-type.txt` and derives
`transport.profile`. Then every remaining live surface was grepped for
`Getting Started form` / `cost dashboard` / `config editor` and triaged one by
one:

| file | what was still wrong |
| :--- | :--- |
| `docs/tutorials/adopt-dabbler.md` | step 1 of the adoption tutorial still walked the operator through the form's Tier and Provider-access fields; rewritten onto `Set Up New Project` + `verify_type` + `Set Up Copilot Seat` |
| `docs/ai-led-session-workflow.md` | the spend-monitoring list still offered `Dabbler: Show cost dashboard`; the significance-flagging command still named the config editor's button; a drift consequence still said "the cost dashboard misses the spend" |
| `docs/session-state-schema.md` | the opening line still listed the cost dashboard among the file's readers |
| `ai_router/config.py` | the docstring justifying `metadata.pricing_reviewed`'s survival rested on "the extension's Cost Dashboard renders its own staleness banner" — the reason had evaporated. Field deliberately KEPT (a config field with hand-maintained data is retired on purpose by a set that owns the schema, not as a side effect of a deletion), but the docstring no longer claims a consumer that does not exist. |
| `ai_router/docs/close-out.md` | two cost-dashboard references, one of them a diagnosis step |
| `src/commands/copilotSeatSetupCommand.ts` | **runtime error text** telling the operator to run "Build project structure (Getting Started form)" |
| `src/utils/budgetYaml.ts` | the comment header **written into every generated `budget.yaml`**: "written by the Dabbler Getting Started form" |
| `src/utils/moduleAuthoring.ts` | the comment header **written into every generated `modules.yaml`**, pointing at the form's copy-prompt button |

The last three are the ones worth naming: two of them write the stale claim
into files on a user's disk, and no doc grep of the repo's markdown would ever
have found them. Source comments recording historical provenance ("Set 060
Getting Started form...") were deliberately left alone — those are attribution,
not instruction.

## Suites at freeze

- **pytest**: 3967 passed, 9 skipped (7m38s)
- **mocha**: 1471 passing, 2 pending, 0 failing
- **playwright**: 31 passed / 0 failed (4.7m)

All three recorded via `run_of_record` after the last code change.
