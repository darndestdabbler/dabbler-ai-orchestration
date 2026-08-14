## [Unreleased] — why long sessions are long (Set 132)

### Changed

- **(Set 132 S3) Transcript rotation fires only at a threshold-crossing step
  boundary, and N and the threshold are now documented as one setting.** Set
  131 established the trigger (~150K retained input tokens, taken at the first
  step boundary after the crossing) but not the half that stops it firing at
  *every* boundary. The arithmetic is self-defeating rather than merely
  unprofitable: a flush resets the transcript to ~54K, inside the cheap
  25–75K plateau, so a second flush at the next boundary pays the full
  400 credits to save approximately nothing. A session declaring `N = 3` has
  seven steps and six internal boundaries; firing at all six would cost 2,400
  credits, of which at most the first could repay. The boundary rule says
  *when* a flush is safe, the threshold says *whether* it is worth making, and
  both conditions are required. `docs/ai-led-session-workflow.md` →
  *Rotation, and the trade we declined* carries the rule and a new subsection
  stating the coupling in one place: **N determines how many boundaries exist,
  the threshold determines which of them fire** — with the obligation named in
  both directions, so a future set that lowers N must check the remaining
  boundaries still land near the 150K crossing, and one that lowers the
  threshold must check it has not recreated the every-boundary policy.

- **(Set 132 S3) The session-size cap section now states what the cap is
  competing against.** Per-session fixed overhead `F` was estimated two ways —
  as a regression intercept over 199–225 sessions (39 min) and as a direct
  partition of ceremony-step time over 97 sessions (41 min) — against a median
  work step of 6–9 minutes. The two are **not** independent confirmations:
  they regress and partition the same `startedAt`/`completedAt` interval, so
  what agrees is a fitted intercept and a measured split, which checks the
  decomposition rather than the interval. **Fixed overhead is 5–7× the cost of
  a work step**, so a step-budget change is a small lever by construction.
  Directly measured `w̄` does not rise with N (`corr(N, w̄)` = −0.03 to −0.40
  across every cut), which is the test the `F/N + w̄` ratio was algebraically
  unable to perform. And the residual tail's strongest observed correlate is
  not step count: among sets 111+, verification-artifact count correlates with
  duration at **+0.767** against N's **+0.228** — a ranking of unmodelled
  correlations, not an effect size, and its causal direction is unresolved.
  `WORK_STEP_BUDGET` is unchanged at 3 — the number moves only on the
  operator's word, and this set ships the brief, not the change.

### Added

- **(Set 132 S3) The consequence rubric is documented as governing plan
  authoring, not only severity triage.** Answering an operator question —
  *"what is the risk (probability × impact) of not doing this work?"* —
  **nothing was added to enforce it**: no gate, no config key, no CLI, no
  close-out predicate. L-095-1's existing rubric already *is* that question,
  evaluated about a proposed step rather than a reported finding, and it is
  already preload. The authoring guide's *Other sizing signals* now names the
  application point: before a step enters a spec, name the failure scenario
  that follows from not doing it; no nameable scenario means it is a nit and
  does not belong in the plan. The test can only ever delete a step, which
  makes it an instance of *Prefer removal over addition* rather than an
  exception to it.

### Known issues

- **`route(prefer_model=...)` is silently ignored on the `copilot-cli`
  transport.** `_route_via_copilot_cli` does not accept the parameter at all —
  that profile resolves exactly one generator *role* from the seat catalog
  instead of walking a tier ladder — so a preference the public `route()`
  signature accepts and documents is dropped without warning, while being
  honoured on `api`. A caller cannot detect it: the call succeeds, and the
  metrics row records `served_model_mismatch: false` because the model that
  answered is faithfully the one the transport asked for. Found by using it
  (a two-provider panel that came back single-provider). The working lever on
  that transport is `exclude_providers`, which it does apply against the
  catalog's confirmed entries. Not fixed here — this was a documentation
  session — and a fix owes falsifiers on **both** transports (L-112-1),
  covering the honour path and the loud-refusal path.

- **The automated path-aware-critique producer is wired to the `api`
  transport only.** `python -m ai_router.pull_critique` fails on a Copilot
  seat with `missing API key (env 'DABBLER_OPENAI_API_KEY')`, which reads as
  "path-aware review needs provider keys". It does not. Routed children on
  `copilot-cli` are dispatched as agentic CLI processes carrying
  `--available-tools view,grep,glob`, so they hold genuine read-only repo
  access by construction. The failure is in the producer: `pull_verifier.py`
  contains no reference to transports at all and implements its own tool loop
  against provider SDKs. The asymmetry is about who supplies the agentic
  loop — on `api` the router must build it, on `copilot-cli` the CLI already
  **is** the agent — so the seat that needs a hand-rolled loop least is the
  one the producer refuses. The **manual flow, which the template documents
  as the default, is unaffected** and is what Set 132 used. Same family as
  the `prefer_model` issue above: transport-conditional behaviour invisible
  from the call site.
