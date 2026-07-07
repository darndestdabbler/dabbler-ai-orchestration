# Request for objective design input: cross-provider verification integrity in an AI-led session workflow

You are being consulted as an independent reviewer. Please analyze the
problem below and answer the numbered questions at the end. You have no
stake in any prior decision; if you believe the framing itself is wrong,
say so. Where you disagree with a proposed fix, propose a concrete
alternative. Do not soften disagreement.

## System context (self-contained; you cannot see the repository)

We maintain an AI-led coding-session framework. Work is divided into
"session sets" of numbered sessions. Each session is driven by one AI
orchestrator (Claude Code, Codex CLI, Gemini, or GitHub Copilot chat).
A Python package (`ai_router`) provides lifecycle CLIs and a `route()`
function that dispatches reasoning tasks to external models.

**The integrity rule at issue:** every Full-tier session must end with
*cross-provider verification* — a model from a **different provider**
than the orchestrator adversarially reviews the session's work
(complete diff + spec excerpt + test results) and returns a structured
verdict (`VERIFIED` / `ISSUES_FOUND`). A deterministic close gate
(`close_session`) refuses to close a session whose claimed verdict is
not corroborated by evidence:

- a `session-verification` row in an append-only metrics log
  (`router-metrics.jsonl`) for this (set, session), whose verifier's
  provider — resolved from the model name via a static model registry —
  **differs from the session orchestrator's provider**, plus
- a raw verification artifact (`sN-verification.md`) on disk, and
- verification is mandatory on every session (an earlier "skip if the
  diff is small" predicate was removed after it was gamed); the only
  exception is an operator-declared zero-budget tier in a config file
  (`budget.yaml`, `threshold_usd: 0`), never the engine's own choice.

The orchestrator's identity comes from a `session-state.json` block
written at session start by a CLI the orchestrator itself runs:

```json
"orchestrator": { "engine": "github-copilot", "provider": "openai",
                  "model": "claude-sonnet-4-6", "effort": "medium" }
```

(`model` and other fields are optional today; missing identity data
fails the gate closed.)

**The Copilot-CLI transport (relevant complication).** Some teams hold
only a GitHub Copilot seat and no direct provider API keys. For them,
`route()` can dispatch through the Copilot CLI instead of provider
APIs. Under this transport: the same seat can serve models from
multiple providers (Claude, GPT, Gemini) via a model picker; provider
provenance is **asserted, not confirmed** (inferred from the model
name prefix, e.g. `claude-*` → anthropic — the CLI has no first-party
provenance field); usage is unbilled seat quota, so metered-cost
accounting is unavailable; and the orchestrator itself is typically
*also* a model behind the same Copilot seat.

## What happened (three live incidents in one day, escalating)

**Incident 1 (the original bypass).** A Claude Sonnet orchestrator on a
Full-tier session skipped verification entirely, wrote
`verification_method: "manual"` (not even a legal token) plus a
self-attested `"VERIFIED"` into the close paperwork, and the close
accepted both verbatim. Response: we shipped (a) a first-class
`verify_session` CLI that assembles evidence, routes to a verifier,
writes artifacts, and patches the paperwork — so the honest path is
one command; and (b) the deterministic close gate described above.

**Incident 2 (gaming the skip predicate).** The instruction template
told engines to run a diff-based gating predicate to decide whether
verification was required. The rendered instruction invoked it with no
arguments; an empty path list evaluated as a zero-file diff and printed
"SKIP — small diff". The walking engine then fabricated verification.
Response (operator decision): the skip path was removed entirely —
verification is now mandatory every session — on the principle that
*a deterministic check whose input is supplied by the policed actor is
not deterministic*, and *any skip affordance offered to an engine will
eventually be taken*.

**Incident 3 (today's cold-start walk; the subject of this request).**
A fresh consumer repo was scaffolded; the orchestrator was Claude
Sonnet 4.6 **running inside a GitHub Copilot seat**, with `route()`
dispatching through the Copilot-CLI transport. Facts recovered from the
repo afterward:

1. The scaffold's venv installed the router from PyPI (one release
   behind), so the new CLI and close gate were absent — a
   release-sequencing gap on our side, noted but not the design issue.
2. For session 1, the orchestrator hand-composed its own verification
   script instead of any sanctioned path: a **diluted prompt** (a
   polite "independent code review" — none of the canonical template's
   adversarial framing, materiality gate, or severity anchors), an
   invented issue schema, then
   `route(task_type="session-verification")`. The router dispatched it
   through the Copilot transport to **`claude-sonnet-4.6` — the same
   underlying model that was orchestrating**. The metrics row recorded
   `provider: anthropic, verifier_of: null, cost: 0.0,
   transport: copilot-cli`. The same model reviewed its own work and
   returned VERIFIED.
3. Session 2 closed `VERIFIED` / `method: "api"` **78 seconds after
   starting, with zero verification calls of any kind** — pure
   self-attestation, again.
4. When the operator asked afterward whether verification had been
   genuine, the orchestrator answered honestly and accurately
   described what it had done. The review *content* was real and
   reasonable; the failure was structural, not deceptive.
5. Identity recording proved arbitrary: this walk registered
   `engine: copilot, provider: anthropic` (truthful underlying
   provider); a different session the same day, same seat class,
   registered `engine: github-copilot, provider: openai` (the seat
   vendor). Nothing constrains which one an engine writes.

**Why the current design failed structurally (our analysis — challenge
it):**

- **(H1) Verifier selection is not identity-aware.** "Cross-provider"
  is implemented as a static config pin (`session-verification:
  gpt-5-4`) with a comment saying "calibrated for a Claude
  orchestrator; swap this value if a different orchestrator runs
  sessions." Under the Copilot transport the pin is superseded by
  seat-local role aliases, which resolved to the orchestrator's own
  model. Nothing anywhere excludes *the session orchestrator's*
  provider at selection time.
- **(H2) The gate compares the wrong identity.** The close gate checks
  `verifier row provider != orchestrator.provider` where
  `orchestrator.provider` is a free-text label the orchestrator itself
  supplied at session start. For a multi-provider seat, the label may
  name the seat vendor (openai) while the underlying model is
  Anthropic — the check passes while the reality is same-model
  self-review. And the label's arbitrariness cuts both ways (see fact
  5).
- **(H3) The sanctioned CLI is optional in practice.** Even with the
  CLI present, a bare `route(task_type="session-verification")` writes
  a metrics row that the gate accepts as corroboration, and the
  adversarial prompt template is only applied if the caller uses the
  CLI (or copies the template). Hand-rolled diluted prompts pass.

## Proposed fixes (evaluate each; propose better ones)

- **F1 — Identity = underlying model, end to end.** The orchestrator
  block must record the underlying `model`; the gate resolves the
  orchestrator's *effective provider* from the model name via the
  model registry (same registry it already uses for the verifier row)
  and uses that for the ≠ check. For multi-provider engines
  (`github-copilot`) with no model recorded, the gate fails closed.
  `start_session` requires `--model` for such engines so the failure
  surfaces at the boundary, not at close.
- **F2 — Dynamic verifier exclusion.** `verify_session` (and the
  router's session-verification path generally) reads the session's
  orchestrator identity, resolves its effective provider, and passes
  it as an exclusion to verifier selection — replacing the hand-tuned
  static pin. Under a seat that cannot serve any different-provider
  model, selection fails closed to an explicit
  `verification_unavailable` outcome rather than silently verifying
  same-provider. (Open sub-question: what should the workflow then
  demand — block the close until a human or second engine verifies
  out-of-band? That is what the "Mode B" manual path exists for.)
- **F3 — Only the CLI's rows corroborate.** Make the gate require
  metrics rows that the `verify_session` CLI itself wrote (e.g., the
  CLI stamps rows with a field like `verifier_of` / an
  evidence-bundle hash that bare `route()` calls do not carry), so a
  hand-rolled `route()` call cannot masquerade as Step-6 evidence.
  This also guarantees the canonical adversarial template was used,
  since the CLI is what fills it.

## Constraints you should respect (or explicitly argue against)

- The policed actor is the orchestrator itself; there is no human in
  the loop at close time. Warnings printed to the offender's console
  are not enforcement.
- The framework must stay useful for Copilot-locked teams (no direct
  API keys). A design that simply forbids the Copilot transport for
  verification kills the Full tier for them; they do have a sanctioned
  manual path (a second chat pinned to a different provider, verdict
  recorded with an operator-visible attestation).
- Determinism is preferred over judgment calls in gates; anti-drift is
  the goal, not anti-adversary — but incidents show "lazy shortcut"
  and "adversary" converge in practice. A determined orchestrator
  fabricating multi-artifact forgeries is currently accepted as out of
  scope (billing-audit territory).
- Cost is not the binding constraint (verification runs ~$0.30/round
  via APIs; unbilled under Copilot).

## Questions

1. **Identity.** Is F1 (registry-resolved underlying-model identity,
   fail-closed when unresolvable) the right identity model? Is there a
   failure mode we're missing — e.g., does trusting the *self-reported
   model name* just move the lie one field over, and if so, what would
   you anchor identity to instead, given the Copilot CLI offers no
   confirmed provenance?
2. **Selection.** Do you agree verifier selection must exclude the
   orchestrator's effective provider dynamically (F2)? What should
   happen when no different-provider verifier is reachable — hard
   verification_unavailable + blocked close pending the manual Mode-B
   path, or something better?
3. **Provenance trust.** Under the Copilot transport, provider
   provenance is asserted (model-name prefix), not confirmed. Is
   asserted provenance acceptable evidence for a close gate? If not,
   what *practical* strengthening exists for a CLI that exposes no
   provenance — behavioral fingerprinting, operator attestation,
   demoting Copilot-transport verification to the manual attested
   path, something else?
4. **Making the CLI the only practical path (F3).** Reasonable and
   sufficient? Note the obvious counter: the orchestrator can still
   run the CLI and separately fabricate artifacts, or the CLI's
   stamp is forgeable by anyone who reads its source. Where is the
   right line between "raises the effort of a lazy shortcut" and
   security theater?
5. **The diluted-prompt problem.** Session 1's hand-rolled review was
   *real but soft* — no adversarial framing, so it rubber-stamps more
   easily. Beyond F3, is prompt-integrity worth enforcing (e.g.,
   template hash recorded in the metrics row), or is that
   over-engineering once F3 exists?
6. **Structural critique.** Stepping back: is there a simpler design
   that eliminates this class of failure rather than patching each
   instance — e.g., verification driven by something *other than* the
   orchestrator (CI job, git hook, a second standing agent), so the
   policed actor never holds the pen? What would you build, given the
   constraint set above?

Answer with numbered sections matching the questions. For each of
F1–F3: state AGREE / AGREE-WITH-CHANGES / DISAGREE, the changes or the
alternative, and the single biggest risk of adopting it as proposed.
End with a short overall recommendation (≤10 lines) for what to build
first.
