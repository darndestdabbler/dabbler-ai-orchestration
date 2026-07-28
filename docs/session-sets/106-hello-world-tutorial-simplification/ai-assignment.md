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
