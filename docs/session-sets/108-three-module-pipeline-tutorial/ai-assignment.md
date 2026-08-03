# AI Assignment — 108-three-module-pipeline-tutorial

## Session 1 of 4 — Contracts, and the shape of the walk

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0238,
  truncation-clean).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks it — S1 arms it and does not run it),
  `requiresE2E false` (this set ships documents; no extension or router
  behaviour changes, so L-064-12 does not arm), `pathAwareCritique advisory`
  (set-terminal, in S4). Do not re-litigate mid-session — a wrong flag is
  surfaced at Step 9.
- Budget note: this session draws on the **`DABBLER_*` provider keys** only —
  one routed analysis, a two-engine decision consult, one routed outline review,
  and the mandatory cross-provider verification. It spends **zero Copilot seat
  capacity**. The reference solution runs locally on the .NET SDK and costs
  nothing.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the spec; confirm the operator precondition by resolving the published answer key's `HEAD`. | Orchestrator direct — reconnaissance and one `git ls-remote`. |
| 2 | Extract both service contracts. | Orchestrator direct, and **executed as a live capture rather than a read** — see the departure below. |
| 3 | Settle Part D's mechanics. | Orchestrator direct — **proven by running it**, including a falsifier. Not a reasoning task once it can be executed. |
| 4 | Settle repository layout and module naming. | **Two-engine decision consult** (`gpt-5-4` + `gemini-pro`), per the spec's instruction. Genuine solution-variance, and the answer is stamped durably into every future session set. |
| 5 | Confirm the POC's four findings against the running product. | Orchestrator direct — a new test against shipping code; deterministic assertions, zero solution-variance. |
| 6 | Analyse the draft outline against the ownership table and `adopt-dabbler.md`. | **Routed** (`analysis`) — spec-directed, and duplication is a semantic judgement a grep cannot make. |
| 7 | Write the two deliverables. | Orchestrator direct — transcription of literals captured in steps 2–5 plus rulings settled in step 4. Routing it would re-introduce paraphrase into strings whose whole value is that they are literal. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### Where this departs from the routed analyst, and why

**Adopted, and it changed the deliverable — its `missing_step`.** The analyst
named the prerequisite contradiction: the spec's success criterion claims the
reader installs *"nothing but the .NET 10 SDK"*, while the proven solution needs
LocalDB, which the SDK does not carry. It was right, and it was checkable: this
machine's installed-products registry lists `Microsoft SQL Server 2025 LocalDB`
and `Microsoft SQL Server 2019 LocalDB` as their own MSI entries, independent of
every SDK `dotnet --list-sdks` reports. The spec's risk register suspected this
and assigned it to **Session 4** — too late, because **Session 2** writes the
prerequisite list. Settled here as R8b, and flagged for the operator as the one
place this session contradicts the spec's prose.

**Departed on step 2's method, not its routing.** The analyst treated the
contracts as transcription from source. Reading source yields a *description* of
a contract; the tutorial needs the **bytes on the wire**. So both services were
started and driven with real requests, and every status code, envelope and error
body in `s1-service-contracts.md` is a captured response. This caught things a
reading would have missed or stated less confidently — the camelCase envelope
around verbatim-cased row keys, the explicit `null` for a blank optional column,
the `201`-then-`200` duplicate pair returning the **same** batch id, and the fact
that `GET /batches/{id}` flips the row casing back to camelCase because those are
now the service's columns rather than the file's.

**Departed on step 3 the same way, and further.** The plan says *settle* Part D's
mechanics. They were settled by **running** them: a second `converter` on `5201`
beside the first on `5101`, the watcher repointed by configuration only, then —
the part that matters — **the original `converter` killed** and the pipeline still
working. Without that last step "the watcher used the second version" is an
assumption. All four decision-table rows were forced the same way, including a
deferred file that was retried and stored on a later tick with no intervention.

**Departed on the analyst's `naming_recommendation`, while keeping its
conclusion.** It claimed `converter-v1` "is not unique and will cause a collision
when the second team member declares their module." That is wrong as stated — the
pre-set POC gives each member a distinct version (`v1`/`v2`/`v3`) and the nine
slugs are unique. But the real defect is adjacent and worse: staying unique
*requires a central version-number allocation step before anyone can start*,
which contradicts the model's premise that nobody waits on anybody. Both consult
engines reached owner-in-slug independently. Pinned as an assertion in
`poc-nine-modules-ondisk.ts` so neither the claim nor its correction can drift.

**Departed on `riskiest_step`.** The analyst picked writing the outline, on the
grounds that a hidden inter-part dependency would not surface until S4's walk.
Reasonable, but the outline's four parts were already independent in the *proven*
solution, so the dependency it fears is not free to appear. The likelier failure
is **step 4, the naming ruling** — because it is the one output that becomes
*irreversible* the moment Session 2 writes it down and a reader stamps
`module: <slug>` into a spec file. A wrong outline is edited; a wrong slug is
migrated. That is why step 4 got the two-engine consult and step 7 did not.

**Recorded, not adopted — `next_orchestrator`.** See below.

### Decision-time consensus — the one call this session made

`delegation.decision_consensus.enabled` is **`false`** repo-wide. The spec's
Session 1 step 4 nonetheless directs *"route through decision-time consensus
before falling back to `AskUserQuestion`"*, and the question's category
(`file-layout`) is in the configured whitelist. Resolution: **the consult was
run, the config flag was not touched** — flipping it is an operator config edit,
and the configured `unresolved_action: ask_user` fallback was honoured on the
orchestrator's side. Raw responses: `s1-layout-naming-consensus.json`. The
bias-cautions preamble was prepended verbatim.

Both engines converged on **owner-in-slug**, differing only on component order
and title wording — not a material disagreement, so it was synthesized rather
than escalated to the operator. The synthesis added the one thing neither engine
supplied: **`priya-converter`, not `converter-priya`**, because the slug is then
the code root with its separators swapped (`modules/priya/converter`), which is
one rule to teach instead of two.

Cost: $0.0906 across both engines.

### The finding that was accepted as real and rejected as a fix

The routed outline review returned one Critical (accepted whole) and one Major
worth recording, because acting on it as written would have caused the defect it
was trying to prevent.

It found that R4's ownership-routing procedure duplicates `adopt-dabbler.md`
Part 5 step 3, and recommended replacing R4 with a link. Part 5 *does* own that
procedure today — verified, not assumed. But **Session 3 deletes Part 5**, and
the spec's ownership table assigns cross-module ownership routing to this
tutorial. Linking would have produced a dead link by the set's own end, and
Session 3's planned dead-link grep would not have caught the deeper version:
delete Part 5 before Session 2 writes the replacement and the estate loses its
only copy of the procedure. R4 now records the transfer plus a hard
**S2-writes-before-S3-deletes** ordering constraint, and Session 3's handover
carries a *content* check rather than a link check.

The general shape is worth naming: **a reviewer reading the current estate
cannot see the end state the set is steering toward.** Its evidence was right and
its remedy was scoped to today.

### Next-orchestrator recommendation

The analyst recommends **claude / anthropic / claude-opus-5 / high**, arguing
Session 2 is a large, high-stakes prose deliverable where quality dominates.

**Endorsed, with a correction to its reasoning.** The analyst framed this as
"justifying an exception to the operator's budget constraints" — backwards.
Claude *is* the operator-invoked engine here; it is a **provider switch** that
costs, and the memory of a cut-back personal budget makes staying put the cheap
option, not the expensive one. The recommendation is right for a reason the
analyst did not give: Session 2 must hold **R1–R8b plus two contracts' worth of
literal strings** across a long document without paraphrasing any of them, and
literal fidelity under length is exactly what this session's own routed drafts
were weakest at.

The fresh-eyes reading that a provider switch would buy is supplied instead by
the mandatory cross-provider verification (anthropic excluded) and by routing
Session 2's duplicate-procedure grep off-provider.

Second choice if the operator prefers provider diversity: **openai / gpt-5-6**,
effort high.

Budget: Session 2 is prose plus greps — `DABBLER_*` keys only, zero Copilot seat
capacity.

### Next-session-set recommendation

The analyst recommends **the Java track**, which the spec already names as a
follow-on. Recorded, and **not** endorsed as next: the spec itself says the Java
track comes *"after this one is walked"*, and Session 4 has not walked it yet.
Recommending it now would pre-empt the evidence that should decide it.

The standing candidates from Set 107's close, unchanged and still ahead of it:

1. **Increment B** — `Start work` / `Send for review`, plus one-form module
   creation.
2. **The owed `adopt-dabbler.md` walk** — never performed; Set 106 was cancelled
   with it outstanding, and **Session 3 of this set edits that document**, which
   makes the debt larger rather than smaller.

Session 3's trim is a reason to raise (2): a document about to be cut down has
still never been walked in its current form. Final ordering is the operator's,
taken at the set-terminal close.

### Actuals (interim — the session is SUSPENDED at the verification cap, not closed)

- **Orchestrator used:** claude / anthropic / claude-opus-5 / high (operator-invoked).
- **Routing plan followed as recommended**, with the three method departures
  recorded above. The two steps the plan called "settle" were **executed**
  instead — which is where most of this session's value came from, and also
  where two of its defects came from (see below).
- **Deviations:** two, both disclosed at the time.
  1. The two-engine decision consult was run while
     `delegation.decision_consensus.enabled` is `false` repo-wide, because the
     spec directs it and the category is whitelisted. The config flag was not
     touched.
  2. One file was added outside the set directory
     (`poc-nine-modules-ondisk.ts`), then a second during remediation
     (`poc-nine-modules-dom.ts`). Both are peers of the existing POC, outside
     `src/test/suite/**`, and modify nothing.
- **Sub-decisions settled:** R1–R9. The load-bearing ones are owner-in-slug
  (version-in-slug needs central allocation), the day-one single-commit manifest
  bootstrap (R9), and behavioural finish lines (counts are observations).
- **Verification:** four rounds — discovery (fan-out 2/2) → supplementary →
  remediation-review ×2. **Nine distinct Major findings, all accepted, none
  disputed.** Seven from the original draft; **two introduced by the remediation
  itself** and caught by the fix-delta review.
- **Three findings were closed by running something new**, not by editing prose:
  the rendered-DOM harness, the both-services Part D run, and the platform check.
- **The loop suspended at its 2-cycle bound** with the final blocking Major
  fixed but its fix unreviewed. See `s1-remediation-round-5.md` for the
  operator's options. **No third cycle was opened.**
- **Cost: $1.1052 across 10 routed calls** (from `router-metrics.jsonl`, not
  estimated):

  | | |
  | --- | --- |
  | Verification, four rounds | **$0.9407** (85%) |
  | Two-engine decision consult | $0.0906 |
  | Outline ownership review | $0.0284 |
  | Step-3.5 analysis | $0.0238 |
  | **Wasted** — a first step-3.5 call whose result was lost | **$0.0215** |

  The waste is recorded rather than netted out. The script computed a
  truncation flag *before* writing the paid response to disk, hit a
  `TypeError` on the call signature, and lost the output — **the exact failure
  L-079-1 warns about** (never touch paid output before persisting it). The
  script was reordered to write first; every routed call afterwards persists
  before doing anything that can raise.

  `DABBLER_*` keys only; **zero Copilot seat capacity**, as forecast.
- **Outcome:** not closed. `disposition.json` records `requires_review` with the
  suspension as its blocker.
