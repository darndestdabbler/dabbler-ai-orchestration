# AI Assignment — 106-hello-world-tutorial-simplification

## Session 1 of 4 — Rewrite the tutorial; retire the pair; author release-and-recovery

- Orchestrator: claude / anthropic / **claude-opus-5** / high (operator-invoked).
  `claude-opus-5` was not in the model registry, so `start_session` refused it
  as an identity (Set 084 F1). It was added to `router-config.yaml` as an
  **identity-only, `is_enabled: false`** entry — the mechanism the CLI's own
  refusal names, and the pattern `claude-sonnet-5` / `gemini-3-pro` already
  use. Recording the previous sessions' `claude-opus-4-8` would have been a
  false identity.
- Routed step-3.5 analysis: [`s1-ai-assignment-analysis.json`](s1-ai-assignment-analysis.json)
  (`task_type=analysis`, anthropic excluded → gemini-2.5-pro, tier 2,
  **$0.0119**, truncation-clean).
- Set-level facts carried from the spec (**immutable at runtime**): **Full
  tier**, `requiresUAT: true` (S4 is the acceptance walk — not this session),
  `requiresE2E: false`, `uatStyle: ad-hoc`, `uatScope: per-set`,
  `pathAwareCritique: advisory` (runs at the set-terminal close in S4). The
  **cut list is binding and not re-litigated** — a disagreement is recorded in
  the verification artifacts and the session proceeds.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the spec, the routed cut list, the three tutorials, the consumer-bootstrap templates, and the shipped command surface. | Orchestrator direct — read-only reconnaissance. |
| 2 | Resolve both runtime unknowns empirically; write [`s1-runtime-unknowns.md`](s1-runtime-unknowns.md). | Orchestrator direct — running the shipped writers against a fixture and probing a live CLI is execution, not reasoning. |
| 3 | Author `docs/tutorials/hello-world.md`. | **Orchestrator direct** — see below. |
| 4 | Author `docs/tutorials/release-and-recovery.md`. | **Orchestrator direct** — trimming existing local prose; a routed author cannot read the source it is trimming. |
| 5 | Delete the pair; stub the flagship URL; repair inbound links. | Orchestrator direct — mechanical filesystem + link edits. |
| 6 | Confirm the drift discipline is retired. | Orchestrator direct — a grep-level assertion. |
| 5.5 | **Routed reader-simulation review of the new tutorial**, before Step 7. | **Routed** — `documentation`, cross-provider. Added on the analyst's recommendation. |
| 7 | Full suite; phased `verify_session`; disposition; commit + push; `close_session`. | **Routed** for verification (`session-verification`, anthropic auto-excluded); orchestrator direct for the mechanics. |

### Why steps 3 and 4 are orchestrator-direct, not routed `documentation`

The routed analyst and the delegation thresholds agree here, for the same
reason: **fidelity beats generation**. This deliverable is not "write prose
about a topic" — every command title, prompt string, YAML key, and expected
on-screen string must match *this repo's shipped code*, which a routed author
cannot read. The tutorial's own governing principle (Set 086: never teach an
unrunnable step) makes an unverifiable claim a **defect**, not a style
blemish, and the two runtime unknowns exist precisely because assumed
behavior was not trustworthy. Routed generation would add variance on exactly
the axis that must not vary, and the orchestrator would then have to verify
every line against source anyway — paying twice for a worse draft.

The reasoning that *was* worth routing has already been routed: the **cut
list itself** went to a pinned `gpt-5.6` analysis before the spec was
committed, and is binding here. Independent perspective on the result arrives
through step 5.5 and the mandatory cross-provider verification, both of which
review a draft that is already true to the code.

### Biggest risk and its control (analyst's, adopted)

> "The orchestrator subtly misinterprets the nuance of command-line outputs or
> UI behavior when authoring the tutorial, resulting in steps that are
> factually correct but practically confusing."

Controls applied, cheapest first:

1. Every literal in the tutorial is read out of `package.json` / the command
   sources / the writers, never carried over from the retired tutorials
   (**L-064-8** — a replacement doc inherits the retired doc's claims at its
   peril).
2. The two behaviors most likely to be *assumed* were **run**, not read
   (`s1-runtime-unknowns.md`).
3. Step 5.5's routed reader-simulation pass, which reads for a stranger's
   comprehension rather than for correctness.
4. S4's live operator walk is the real acceptance test — this session's job is
   to make that walk cheap, not to substitute for it.

### Next-orchestrator recommendation (S2)

Routed recommendation (gemini-2.5-pro, anthropic excluded): **switch provider
for Session 2** — S2 is structured-config work (YAML/JSON templates, a build,
a version bump) and a different provider "mitigates the risk of compounding
any blind spots from the current orchestrator."

Recorded with one correction of fact: the analyst named **`gpt-4o`**, which
does **not** resolve in this repo's model registry (the OpenAI entries are
`gpt-5.4` / `gpt-5.5` / `gpt-5.6`) and would be refused by `start_session` as
an identity. The portable part of the recommendation — *run S2 on an OpenAI
orchestrator (Codex, which reads `AGENTS.md`)* — stands; the specific model id
is the operator's pick at invocation. The alternative of continuing on the
current orchestrator is also defensible, since S2 must keep the templates
consistent with the tutorial S1 just wrote; the operator decides.

### Next-set recommendation (after S4)

Routed: a documentation-consistency/scope audit applying this set's
simplification lens to the rest of the docs suite (suggested slug
`107-docs-consistency-and-scope-audit`).

Two live items this session surfaced that are **not** in scope here and that
the operator may want to rank against that:

- **Copilot catalog pin reconciliation is still owed and has drifted further**
  — lock pins `1.0.69`, the seat now runs `1.0.75`; `validate_catalog` fails
  closed. Set 104 S2 hand-bumped without re-probing and recorded the full
  `--refresh` as owed. Router-side, out of scope for a docs set.
- **The extension publish** (S2's version bump) stays **operator-gated**.

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-5 / high.
- Routing plan followed as recommended: authoring orchestrator-direct;
  step-3.5 analysis routed ($0.0119, truncation-clean); reader-simulation
  review routed pre-verification; session verification routed cross-provider.
- Deviation from the routed plan: none. The analyst's `gpt-4o` next-orchestrator
  id was recorded-with-correction rather than followed verbatim (it does not
  resolve in the registry); the provider-switch intent is preserved.

---

## Session 2 of 4 — Make the scaffolded output agree with the tutorial

- Orchestrator: claude / anthropic / **claude-opus-5** / high (operator-invoked).
  S1's routed advisor recommended switching to an OpenAI orchestrator for this
  session; the operator invoked Claude Code instead, which S1's own disposition
  named as the defensible continuity alternative ("the operator's call at
  invocation"). Recorded as a **known, operator-made deviation from the routed
  recommendation**, not an oversight — see *Continuity control* below.
- Routed step-3.5 analysis: [`s2-ai-assignment-analysis.json`](s2-ai-assignment-analysis.json)
  (`task_type=analysis`, anthropic excluded → gemini-2.5-pro, tier 2,
  **$0.0111**, truncation-clean).
- Set-level facts carried from the spec (**immutable at runtime**): **Full
  tier**, `requiresUAT: true` (S4 is the acceptance walk — not this session),
  `requiresE2E: false` (S2's delta is scaffolded-template *content*, and
  asserting template prose in an E2E test would pin copy, not behavior),
  `uatStyle: ad-hoc`, `uatScope: per-set`, `pathAwareCritique: advisory` (runs
  at the set-terminal close in S4). The **cut list is binding**.
- Scope boundary honored all session: S2 does **not** own
  `docs/tutorials/hello-world.md`. A template/tutorial contradiction that can
  only be fixed on the tutorial side is **recorded as a finding**, never
  silently edited into the tutorial.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read S1's disposition, the new tutorial, and the three templates. | Orchestrator direct — read-only reconnaissance. |
| 2 | Re-cut `CODEOWNERS.template` to the two-module cast. | Orchestrator direct — a 42-line, comment-only file with a prescriptive target. |
| 3 | Re-cut `monorepo-ci.yml.template`. | **Routed** — `analysis`, cross-provider. Adopted from the analyst. |
| 3b | Prove green-on-empty. | Orchestrator direct — **execution**, per the analyst's own control (below). |
| 4 | `getting-started.md.template` URLs; regenerate the cold-start goldens. | Orchestrator direct — text replacement plus the repo's prescribed `UPDATE_GOLDEN=1` regeneration. |
| 5 | Rebuild `dist/`; version bump + CHANGELOG; router-side no-op call. | Orchestrator direct — release-engineering mechanics. |
| 6 | Full suite; phased `verify_session`; disposition; commit + push; `close_session`. | **Routed** for verification (`session-verification`, anthropic auto-excluded); orchestrator direct for the mechanics. |

### Why step 3 is the one authoring step worth routing

The analyst singled it out and the reason survives scrutiny: the CI template is
the only deliverable here carrying a **genuine design tension** rather than a
prescribed target. The tutorial teaches an adapted job that **fails when a
module collects zero tests**, while the scaffolded template must be
**green on a repo with no modules at all** — the same file, two opposite
requirements, separated only by the reader's adaptation. That is reasoning about
GitHub Actions semantics, not text manipulation, so it goes out. `CODEOWNERS`
and `getting-started` have no such tension: their target is fully specified by
the tutorial and the spec, and routing them would buy variance on an axis that
must not vary (the same argument S1 made for the tutorial itself).

### Biggest risk and its control (analyst's, adopted verbatim in substance)

> "The AI's 'proof' of the CI template's harmlessness is a plausible but
> incorrect assertion."

This is exactly the gap the spec's own wording anticipates — *"state how that is
achieved and **prove it**"* — and it is the L-064-8 failure mode one layer down:
an assertion inherited from the old template's comment (*"the placeholder step
succeeds, so committing it before adapting cannot break your builds"*) reads
authoritative in the re-cut file even if the re-cut broke it.

Control applied: the proof is **executed, not argued**. The analyst suggested
`act`; it is not installed on this machine and installing a Docker-backed runner
is disproportionate. The substitute keeps the analyst's standard — run the
thing — at the level that is actually reachable: parse the emitted workflow,
assert structurally that the active job's only failure surface is its `run:`
block, then **execute that exact block in a fresh empty repository** and assert
exit 0. What cannot be executed locally is named as such rather than asserted.

### Continuity control (the same orchestrator that wrote the tutorial judges the templates)

> Analyst: "Mandate that the final `session_verification` task is routed to a
> non-Anthropic model … to provide a genuinely independent review of the work's
> conformance to the tutorial authored by the orchestrator in Session 1."

Already structurally guaranteed, not merely mandated: `verify_session` excludes
the orchestrator's own provider, so this session's verifier is non-Anthropic by
construction. Two additions, because "same orchestrator, same blind spot" is the
real exposure and one automatic exclusion is thin cover for it:

1. The verification evidence bundle presents the **tutorial's** CI/CODEOWNERS
   text and the **template's** side by side, so the verifier is asked to find
   contradictions rather than to trust a summary that they agree.
2. Step 3's routed CI analysis is itself cross-provider, putting an independent
   read on the one deliverable where S1's authoring choices are load-bearing.

### Next-orchestrator recommendation (S3)

Routed (gemini-2.5-pro, anthropic excluded): **`codex/openai/gpt-5.6`** —
"Session 3 is a creative authoring task requiring high precision and structure
for video scripts. A different top-tier model family … introduces cognitive
diversity."

Recorded as the routed recommendation. Note for the operator: this is now the
**second consecutive** recommendation to switch off Anthropic for this set, and
the S3 deliverable (six OBS scene scripts plus the S4 UAT checklist, held to the
Set 078 literal-copy-pasteable bar) is the last chance to get independent eyes on
the tutorial's teaching sequence *before* the operator spends ~2 hours walking
it in S4. The counter-argument is thinner here than it was for S2: S3 authors
*new* files against a finished tutorial, so continuity buys less. The pick
remains the operator's at invocation.

### Next-set recommendation (after S4)

Routed: **`107-post-uat-hardening`** — a follow-on set that immediately absorbs
what S4's live operator walk finds, "ensuring the project rapidly capitalizes on
the UAT's insights."

Recorded with a caveat of fact: S4's own plan already remediates everything the
walk catches and re-walks the remediated items, so a blanket follow-on set would
duplicate it. The part that genuinely cannot land in S4 is the residue S4 is
explicitly forbidden to fix — *"any **product** defect found is triaged: an
in-scope doc workaround plus a named follow-on set for the code fix — this set
ships no product behavior change."* That is the real shape of 107, and its
content is unknowable until the walk happens. S1's routed advisor named a
different candidate (`107-docs-consistency-and-scope-audit`, applying this set's
simplification lens to the rest of the docs suite), which does not depend on the
walk. Both are recorded; the operator ranks them after S4, alongside the two
live items S1 surfaced (the Copilot catalog pin reconciliation, and the gated
extension publish).

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-5 / high.
- Routing plan followed as recommended: CI-template re-cut routed
  (`analysis`, cross-provider); session verification routed cross-provider;
  everything else orchestrator-direct.
- Deviation from the routed plan: the **orchestrator identity** — the operator
  invoked Claude rather than the recommended OpenAI switch (recorded above, and
  compensated by the two continuity controls). The analyst's `act`-based proof
  mechanism was substituted, with the substitution and its limits stated.

---

## Session 3 of 4 — OBS scene scripts + the S4 UAT checklist

- Orchestrator: claude / anthropic / **claude-opus-5** / high (operator-invoked).
  This is the **third consecutive** session in which the routed advisor
  recommended switching off Anthropic and the operator invoked Claude Code.
  Recorded as a known, operator-made deviation — not an oversight. The operator
  owns the pick at invocation; the exposure it creates (one model family authored
  the tutorial, its templates, *and* the scripts that dry-run it) is real and is
  controlled below rather than waved off.
- Routed step-3.5 analysis: [`s3-ai-assignment-analysis.json`](s3-ai-assignment-analysis.json)
  (`task_type=analysis`, anthropic excluded → gemini-2.5-pro, tier 2,
  **$0.0098**, truncation-clean).
- Set-level facts carried from the spec (**immutable at runtime**): **Full
  tier**, `requiresUAT: true` — and unlike S1/S2, this session is the one that
  **authors the checklist** the S4 walk executes, so the ad-hoc UAT floor
  (`ProgrammaticVerification` **or** `NoProgrammaticPathReason` on every
  non-judgment functional item, validated locally before the human is notified)
  binds this session's output directly. `requiresE2E: false`, `uatStyle:
  ad-hoc`, `uatScope: per-set`, `pathAwareCritique: advisory` (runs at the
  set-terminal close in S4). The **cut list is binding**.
- Scope boundary: S3 owns `docs/tutorials/video/` and the checklist. It may
  touch `docs/tutorials/hello-world.md` **only where scripting exposes a gap** —
  which the spec explicitly permits and S2 explicitly queued (two named
  tutorial-side residuals in its disposition). A scripting-exposed gap is
  fixed; a stylistic preference is not.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the spec, S1/S2 dispositions, the runtime-unknowns artifact, and the new tutorial end to end as a reader would. | Orchestrator direct — read-only reconnaissance. |
| 2 | Author the nine files under `docs/tutorials/video/`. | **Orchestrator direct** — see below. |
| 3 | Reconcile the two S2-queued tutorial residuals exposed by scripting scene 4. | Orchestrator direct — a two-sentence edit in one file. |
| 4 | Author `106-hello-world-tutorial-simplification-uat-checklist.json`. | **Orchestrator direct** — literal transformation of a doc only the orchestrator can read. |
| 4b | **Mechanically validate the checklist** against the ad-hoc floor and the editor schema before it is offered to the human. | Orchestrator direct — an executable gate, not an opinion. |
| 5 | Full suite; phased `verify_session`; disposition; commit + push; `close_session`. | **Routed** for verification (`session-verification`, anthropic auto-excluded); orchestrator direct for the mechanics. |

The analyst returned `orchestrator-direct` for all four authoring steps and
`routed:session-verification` for the close — the same shape S1 and S2 settled
on, reached independently. Its reason is this set's standing countervailing
principle: these deliverables are literal transcriptions of *this repo's*
shipped strings, and a routed author cannot read the repo.

### Biggest risk and its control (analyst's, adopted with a correction)

> "Drift between the newly authored scripts/checklist and the source tutorial or
> underlying codebase. A single incorrect command, UI label, or expected outcome
> in the scripts will cause the live Session 4 UAT to fail, requiring
> significant rework."

Correct, and it is the expensive failure mode here: a defect in these files is
paid for in **operator minutes on camera**, not in a re-verify round.

The analyst's proposed control — *"a full, literal desk check … against a clean
developer environment"* — is **not adoptable as stated and is recorded as
declined**. A clean-environment desk check of these scripts is exactly the
~2-hour walk S4 exists to perform, on operator-supplied resources (a GitHub
account, a Copilot seat, a throwaway public repo) this session does not have.
Running it here would either duplicate S4 or, worse, produce a half-walk whose
partial evidence invites S4 to be skipped.

What is adopted instead, cheapest first:

1. **Traceability by construction.** Every beat cites the tutorial step it
   performs. A beat with no tutorial step is either a gap in the tutorial (fix
   it) or invented ceremony (cut it) — the same discipline that produced the
   tutorial.
2. **Literals are copied, never paraphrased.** Command titles come from the
   extension's `package.json` `contributes.commands`; shell lines, YAML, and
   expected on-screen strings are copied from `hello-world.md`, which S1 already
   verified against shipped code. A string that appears in a scene script and in
   the tutorial must be **byte-identical**, and that is checked mechanically,
   not by eye.
3. **The checklist floor is executed.** Every non-judgment functional item is
   machine-checked for `ProgrammaticVerification` / `NoProgrammaticPathReason`
   and for the "where you are" preamble before close.
4. **S4 is the acceptance test and stays that way.** This session's job is to
   make the walk cheap and unambiguous, not to pre-empt it.

### Scene-script pitfalls (analyst's, adopted into the beat structure)

The five it named are folded into the format rather than left as advice: no
magic transitions (every scene states the exact repo/UI state it starts from,
and every beat names the window it happens in); literal atomic actions, never
"configure the service"; explicit **wait** beats for anything asynchronous (AI
sessions, CI runs); narration written as speakable prose beside — not instead of
— the action; and an `If this fails on camera` line on every beat with a known
failure mode.

### Next-orchestrator recommendation (S4)

Routed (gemini-2.5-pro, anthropic excluded): **`github-copilot` / `openai` /
`gpt-5.6` / high** — "Session 4 is a live UAT focused on rapid, accurate
remediation of unexpected failures."

Recorded with one correction of fact, the same class as S1's `gpt-4o` slip: the
analyst paired the **`github-copilot` engine** with `gpt-5.6`. That pairing is
representable (a Copilot seat's identity is its underlying model — Set 084 F1),
but it is not what the reasoning describes; "a code-native OpenAI interface" is
**Codex**, which reads `AGENTS.md`. The portable recommendation — *run S4 on an
OpenAI orchestrator* — stands; `engine: codex` is the coherent form of it, and
the pick remains the operator's at invocation.

The counter-argument is now at its **weakest of the whole set**, and this is
worth stating plainly because it is the third time: S4 remediates defects in
documents this orchestrator family authored, found by a human walking them. An
author is the worst possible reviewer of their own instructions — they read the
step they meant, not the step they wrote. If any session of this set should
change hands, it is this one.

### Next-set recommendation (after S4)

Routed: **`107-advanced-topic-tutorial-simplification`** — apply this set's
simplification + scripting + UAT pattern to the next tutorial.

Recorded, but it is the weakest of the three candidates now on the table and the
reason is factual: **after this set there is no second tutorial left to
simplify.** `docs/tutorials/` will contain exactly `hello-world.md`,
`release-and-recovery.md`, `video/`, and one redirect stub — the 821-line cut
and the 390-line review prompt are gone. The transferable form of the analyst's
idea is S1's advisor's candidate, `107-docs-consistency-and-scope-audit` (apply
the lens to the wider docs suite), which does not depend on the walk.

Still on the table, unchanged and ranked by the operator after S4:

- **`107-post-uat-hardening`** (S2's advisor) — only for the residue S4 is
  *forbidden* to fix: product defects the walk exposes. Unknowable until the
  walk happens.
- **The Copilot catalog pin reconciliation** — router-side, owed since Set 104,
  now two CLI versions staler (lock `1.0.69`, seat `1.0.75`).
- **The extension publish** (S2's 0.46.0 bump) — operator-gated.

### Actuals (filled at close)

- Orchestrator used: claude / anthropic / claude-opus-5 / high.
- Routing plan followed as recommended: all authoring orchestrator-direct;
  step-3.5 analysis routed ($0.0098, truncation-clean); session verification
  routed cross-provider.
- Deviation from the routed plan: the **orchestrator identity** (third
  consecutive; operator's call, recorded above). The analyst's clean-environment
  desk-check control was **declined with reasons** and replaced by the four
  controls listed above.
