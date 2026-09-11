# A RACI for the framework: operator, framework, working AI, independent AI — proposal (Fable)

Engine: Claude Fable 5, 2026-08-30. Requested by the operator; drafted against
the tree at master (post-port, 36 of 36 closed). Companion opinions from other
engines may land beside this file with their own suffix.

**Status: proposed, not adopted.** Input for the operator's discussion with the
other engines; not yet an operator decision of record.

The architecture it encodes, in one sentence borrowed from the white-box
direction: **the framework is the only white box — three opaque parties, one
inspectable mediator, every boundary crossing typed and recorded.**

Sources: `docs/session-framework-spec.md`, `docs/framework-reconception.md`,
`docs/agent-native-architecture-{sol,fable}.md`, `docs/operator-decisions.md`,
`docs/quick-start.md`, `AGENTS.md`, `STATUS.md`, and — for the decision-rights
rubric and education-mode briefs — `v1-final:docs/ai-led-session-workflow.md`,
which is **v1 canon not yet re-landed on master** (see "Cautions" at the end).

---

## How to read this

- **R — Responsible.** Does the work. At least one per row.
- **A — Accountable.** Owns the outcome; **exactly one per row**; the single
  point defects and escalations route to. For a machine actor, A means: when
  this fails, it is a defect to fix in that actor — never a process argument.
- **C — Consulted.** Input sought before the act; two-way. The expensive
  letter for a human.
- **I — Informed.** Told after; one-way. For the operator the default is
  informed in aggregate and audited on the record, not per event.
- **✗ — Excluded.** Affirmatively prohibited, not merely unassigned. Every ✗
  cites the rule or incident that makes it load-bearing.
- **[shift]** — the Responsible party moves between today's machinery and the
  target; the cell notes say which is which. **[open]** — genuinely undecided.
  **[defect]** — the row is broken today.

**The four parties are authority boundaries, not job titles.** Any engine can
hold the working seat. **Independent AI** is every seat that must not be the
author: the adversarial verifier ("no loyalty to the original response"), the
adjudicator (a third provider that neither orchestrated nor verified), and the
consult peers of decision-time consensus. It is never Accountable — a defect in
verification routes to the framework's dispatch or the operator's policy,
never to the verdict's author.

**The human is an auditor, not a gate.** Nothing in the framework blocks on a
person: a human-required decision arrives as a journaled brief with a stated
default, work that needs it waits with the wait recorded, and every AI-made
call is journaled for after-the-fact audit rather than pre-approval.

## The allocation rule (outranks the rows)

Rows go stale; a rule assigns new work forever. Place any new responsibility
with three questions, in order — cost is not an input to the first or third:

1. **Can it be made deterministic?** Then it belongs to the **framework** — as
   a check, a selector, a projection, or a state machine. A standard operating
   procedure an AI must remember is a framework gap, not an instruction to
   write better prose for.
2. **Is it judgment-shaped?** Spec-vs-reality conflicts, severity disputes,
   scoping, layout, test shape — then it belongs to the **working AI**,
   resolved by the ordered tiebreaks, journaled for audit. Difficulty is not a
   routing signal; the question is never "is this hard?" but "whose authority
   does this need?"
3. **Does it fall in a human-required class?** External or hard-to-reverse
   consequence · underivable value trade-off · accountability sign-off ·
   **anything that reduces verification** — then it is the **operator's**,
   delivered as an education-mode brief. The verification carve-out is checked
   first and is absolute: the agent never authors its own permission, and no
   economic rule may ever move a decision from human authority to AI
   authority.

Ordered tiebreaks for question 2 (first line that decides is recorded):
`goal-over-letter → prefer-reversible → simpler-code → defer-to-existing-gate
→ cross-provider-consensus → escalate-to-human`. Consensus precedes the
human — and consensus can never launder: two engines agreeing that a bound
should be lowered does not make it the AI's call.

---

## §1 — Direction & decomposition (supervisor attention spent on purpose)

Per the later spec there is **no approval gate anywhere, planning included**:
plans and contracts are *verified* cross-provider like everything else, and
the operator's authority is exercised in collaboration and on the record, not
as a blocking sign-off. The recorded tension with the reconception's
"Approves" gates is flagged under "Open items".

| Responsibility | Operator | Framework | Working AI | Independent AI | Notes |
| --- | --- | --- | --- | --- | --- |
| Business goals, requirements, direction | **A** R | — | C — elicits, records, asks | — | Nobody polices business alignment; accountability without a policing mechanism is the design (operator's sketch, kept verbatim). |
| Solution plan & high-level design | **A** C — heavy, works with the AI; owns the value trade-offs; audits | R — records; bounds the review loop | R — drafts, maintains | R — verifies the plan like code | "Planning sessions are verified, not approved" — the round cap and Minor-only stop supply the bound a person was once asked for (spec §9). |
| Decomposition & contract formalization | **A** C — heavy | R — validates shape; stores contracts | R — drafts | R — verifies the baseline | "A contract is executable design, and an unapproved baseline is never caught later" — verification is the catch, not a human gate. |
| Work packages & their task lists | I | R — records; renders in explorers | **A** R — leads | — | "AI leads · No gate." Accepted packages never reopen; a later change opens a new package naming the one it supersedes. |
| Plan correction — the plan contradicts reality | I | R — records the amendment | **A** R — amends on the record | — | Sessions 35–36 precedent: a unilateral substitution is not an amendment. Rubric line: goal-over-letter. |
| Direction or scope change mid-flight | **A** R | R — records the ruling | C — one recommendation | — | The escalation boundary: only scope, contract, acceptance-criteria, or architecture changes escalate. An ordinary failed test is not a human decision. |

## §2 — Execution (the silent phase)

| Responsibility | Operator | Framework | Working AI | Independent AI | Notes |
| --- | --- | --- | --- | --- | --- |
| Building the change | — silent | R — worktree init; envelope enforced at the tool boundary | **A** R | — | One capable editing agent is the default; fan-out is a measured optimization, not architecture (Sol §3). |
| Scheduling & advancing work **[open]** | **A** R now — notices completion, pastes the next prompt | R at target — if an executor is ever built | — cannot self-advance across handoffs | — | Sol's strongest objection: that person is the scheduler and the transport layer. Mitigation: one paste per work package. See "Open items". |
| Running checks & tests at the right times **[shift]** | — "an ordinary failed test is not a human decision" | **A** R — selects now; executes at target; retries flakes itself | R now — invokes the printed command | — | Failures, flakes, environmental faults stay inside an automated retry loop. |
| Capturing what actually ran — evidence **[shift]** | — | **A** — validates now (policy_violation on a wrong command); observes mechanically at target | R now — records by hand via test-evidence | I — consumes the manifest | The target removes the honesty dependency: evidence captured where the command runs, so no agent narrates what it ran (Fable §1). |
| The durable record — journal, state, verdicts, cost | ✗ I — reads projections; no verdict a person can type | **A** R — sole writer | ✗ | ✗ — writes only through dispatch | "The machine owns the record" — explicitly NOT set aside 2026-08-23. The ✗ includes the operator: `verify waive` exists only to be refused by name (`cli/verify.ts:3-7`). |
| AI Work Explorer — task list & session state **[shift]** | I — consumes; acts through it | **A** R — now: file watchers + 30 s poll + in-process projection; target: event journal + atomic projection, poll demoted to reconciliation | R — supplies content: plans, checkpoints, summaries; never narrates bookkeeping | — | Both memos' highest-value convergence. The extension already calls the router in-process — a verb is a function call (`extension.ts:104-148`, `router/host.ts`). |
| Solution Explorer — component graph **[defect]** | I | **A** R — owns the projection it renders | R — supplies manifest & contract content | — | **Broken today:** the view watches `.dabbler/solution/projection.json`, whose only writer was Python — deleted at the cutover. Nothing writes it; the tree renders empty (`SolutionTreeProvider.ts:43-54`). The framework owes it a router-side writer. |
| Progress narration & liveness | I | R — heartbeat, lastActivityAt, "possibly stalled" | **A** R — concise checkpoints and rationale | — | Liveness is a process fact (framework's); progress *meaning* is authored (AI's). |
| Mechanical git — branch, commit, push cadence | I | R — final git and evidence checks | **A** R | — | Automate mechanical git; release, rollback, history rewrite are §4's and stay human. |

## §3 — Verification (the loop bounds itself; the operator holds the dial, never the verdict)

| Responsibility | Operator | Framework | Working AI | Independent AI | Notes |
| --- | --- | --- | --- | --- | --- |
| Verification policy — level, triggers, caps, budgets | **A** R — repo default (fast/verified/program) + declared risk triggers | R — applies triggers; exposes no engine-facing skip | ✗ — never dials its own review level | ✗ — never widens its own mandate | The no-skip mandate as a decision right: the agent never authors its own permission. Lowering a bound, dropping a phase, narrowing fan-out, same-provider review — all verification-reducing, all reserved to the operator, carve-out checked first. |
| Selecting the verifier & dispatching rounds | I | **A** R — role-based selection; excludes the author's provider; bounded rounds | I — receives findings | R — reviews; later rounds re-check its own findings only | The role declares what a verifier may be; the framework takes the first survivor after exclusion. Preference can reorder candidates, never exclude one (spec §5). A verdict token not received from dispatch does not exist. |
| Findings & severity | I | **A** — schema-validated; never discarded | I | R — honest description, adversarial by charter | "Findings are never discarded" — severity is honest description; whether a finding blocks is a separate decision made elsewhere (operator-decisions, 2026-08-23). |
| Whether findings block; when the loop stops | I — set the policy above; audits outcomes | **A** R — round cap + Minor-only stop, machine-decidable | C — may dispute | C — severity input | Review-until-clean has no terminal state — five real rounds on one plan produced four new correct Majors every time. The bound is the cap and the severity stop, not a person. |
| Remediation of findings | — | R — re-selects checks for the fix delta | **A** R | C — re-reviews the delta | Rounds ≥2 review the fix delta, not the session again. |
| Disputes & adjudication | I — auditor of the terminal record | **A** R — runs the ladder; one adjudication per session, ever | R — disputes with repo-path evidence; prose-only refused | R — verifier upholds or withdraws; a **third provider** adjudicates | Dispute → adjudicate, engine-invokable — consensus precedes human; the adjudicator excludes MORE providers, never fewer. **There is no waive rung**: the verb exists only to be refused by name. Session 36 filed two evidence-backed disputes; both upheld. |
| Terminal outcomes at the cap | I — unresolved records are planning input, read between sessions | **A** R — REMEDIATED AT THE CAP · UNRESOLVED; the loop decides for itself | — | — | "Reading a record is not the same as being blocked by one" (spec §9). |
| UAT attestation & solution acceptance | **A** R — the sign-off itself needs someone accountable | R — records the attestation | R — authors copy-pasteable UAT instructions | — | The accountability-sign-off class: human-required because someone must be accountable for the sign-off itself, not because the machine path ran out. |

## §4 — Decisions & escalation (route by authority, not judgment load)

| Responsibility | Operator | Framework | Working AI | Independent AI | Notes |
| --- | --- | --- | --- | --- | --- |
| Everything judgment-shaped | I — audits the journal, in aggregate | R — journals the deciding rubric line | **A** R — resolves by the ordered tiebreaks | C — tiebreak 5, cross-provider consensus | A stop that asks the operator to adjudicate a judgment call is not a safety measure; it is a context transfer they did not ask for and cannot afford. A rubric executed by models improves as models improve; an operator gate is a fixed bottleneck that does not. |
| The four human-required classes | **A** R — decides; the answer settles it, no re-ask under fresh wording | R — journals; never implements the ask as a blocking gate | R — surfaces the brief; states the default on no answer | ✗ — consensus cannot launder authority | `external-consequence` · `value-trade-off` · `accountability-sign-off` · `verification-reduction`. Carve-out checked first; cost is never an input to the authority step. |
| Education-mode briefs — how a decision reaches the operator | I — receives a decision-ready ask | R — target: one inbox of attention events; today: the journal and the conversation | **A** R — five parts, batched, never a trickle | — | Required parts: where the set stands · the question in one sentence · options with consequences and costs · a recommendation with confidence · the default on no answer. Withholding a recommendation to seem neutral pushes the context-rebuilding onto the operator. |
| Consulting peer engines | — | R — routes the parallel consult; records both responses | **A** R — synthesizes into ONE actionable recommendation | C — a configured pair, in parallel | Tiebreak 5, plus the operator's standing directive: verify the peers' claims against the code — both got facts wrong on the first consult. Judgment, not relay. |
| Gate overrides & force operations | **A** R — exclusive; lifecycle only, never verdicts | R — executes; stamps forensic markers | ✗ | ✗ | Session 24: close --force past one bookkeeping gate completed the whole plan; forceClosed stamps at repository level. Overriding lifecycle is the operator's; overriding a verdict is no one's. |
| Release, publish, version tags | **A** R — external-consequence class; the push is the operator's | R — packaging gates; fails closed undeclared | R — prepares; declares releasability before work begins | — | Declaring releasability after building is a model deciding in hindsight what may be published. 2.0.0 sits unpublished until the operator pushes the tag, router before extension. |
| Budget ceilings — spend, elapsed, rounds | **A** R — sets them | R — enforces; a reached ceiling pauses, never opens another autonomous layer | I | I | Three currencies with no exchange rate; a seat call is priced even when the meter reads null. The framework records tokens per call, model, session — and does not pretend dollar attribution it cannot have. |

## §5 — Resources & meta

| Responsibility | Operator | Framework | Working AI | Independent AI | Notes |
| --- | --- | --- | --- | --- | --- |
| Secrets & credentials | R — provisions env vars | **A** R — resolves at spawn into one argv element; never stored, logged, or evented | ✗ | ✗ | Keys live in env vars, never in files; the packaging PAT is named in configuration and held nowhere. |
| Cost accounting | I | **A** R — tokens per call, per model, per session, both transports | R — prefers cheap paths; surfaces anomalies | — | The Explorer and cost journal update automatically, without the agent narrating bookkeeping (Sol's acceptance test). |
| The constraint set — gates, SOPs, policies | **A** — adopts; may set aside, on the record | R — enforces exactly what is adopted | C — proposes; every gate cites a concrete incident | — | Human-overridable by construction: the operator set the ground rules aside for the rebuild, on the record, and restoring them is part of finishing. "Staff will not use ceremony" is the governing constraint. |
| Process changes — this matrix included | **A** R — adopts | I | R — drafts | C — independent review of the proposal itself | The reconception ran this way: drafted with one engine, reviewed by another, the review kept verbatim including the parts not adopted. |

---

## The operator's whole job: five acts, none of them a gate

A is where the buck stops, not where the hours go. Collect the operator's R
cells and the recurring work is five acts, none of which holds an engine open:

1. **Shape the objective** and work the two heavy phases — plan and
   contracts — with the AI (§1).
2. **Hand the package off** — one paste today; the open decision below could
   shrink it further.
3. **Answer education-mode briefs** — batched, decision-ready, each with a
   recommendation and a stated default if unanswered.
4. **Audit the journal between sessions** — unresolved records are planning
   input, not interruptions.
5. **Sign off** — UAT attestation, release approval, the tag push. The
   accountability class that cannot be delegated.

If a sixth recurring act appears in practice, it is either a framework gap
(allocation rule, question 1) or an AI escalating too eagerly (question 2) —
treat it as a defect in the matrix, not in the operator.

## Open items this matrix deliberately does not settle

1. **Scheduling: supervisor, or executor?** Today the operator is the
   scheduler and the transport layer (Sol's strongest objection). Mitigation
   already adopted: one paste per work package. The alternative is an executor
   that advances sessions on its own — infrastructure the operator has not
   asked for. The honest name for the current state is "human-operated
   sessions," not "silent supervision." Whichever way it lands, the A stays
   with the operator; only the R moves.
2. **A recorded tension: "Approves" vs "no approval gate anywhere".** The
   reconception (2026-08-25) puts an Approves gate on planning and
   decomposition; the spec §9 (2026-08-26) says nothing blocks on a person,
   planning included — plans are verified, not approved, and "an override has
   no home here." This matrix follows the spec (later, and the build
   contract), keeping the operator's §1 authority as heavy collaboration plus
   after-the-fact audit rather than a blocking sign-off — but the two
   documents still disagree on paper and the discussion should settle it
   explicitly. The attention-events inbox survives either way, read as a view
   of owed decisions with recorded waits — never as a queue that holds an
   engine open.

## Deltas from the operator's sketch

1. **Everything in the sketch survived** — the matrix distributes it into
   rows and contradicts none of it.
2. **A fourth column** — the AI seat splits into working AI and independent
   AI. A three-party matrix cannot express "the author never reviews its own
   work," the single most load-bearing assignment in the system, nor place
   the adjudicator.
3. **A fifth mark, ✗ excluded** — this system's strongest rules are
   prohibitions, and several bind the operator too (no verdict a person can
   type). A blank cell reads "not assigned"; ✗ reads "assigned to no one, on
   purpose, for this incident."
4. **The gray area is smaller than the sketch assumed, and it is a ladder,
   not a zone** — the v1 decision-rights rubric already answers "consulted or
   informed?" precisely: judgment-shaped calls are the AI's via six ordered
   tiebreaks; only four named classes are human-required; consensus precedes
   the human everywhere else.
5. **The human is an auditor, not a gate** — informed on the record always;
   consulted via education-mode briefs only in the four reserved classes;
   never a blocking approval (the spec removed approval gates entirely).
6. **The allocation rule outranks the rows** — it encodes the sketch's own
   priorities: framework before AI, AI before operator, operator informed
   throughout, verification carve-out first and absolute.
7. **Today → target cells are marked, not blended** — including one live
   defect (Solution Explorer) and one open design cell (scheduling).
8. **One A per row; a machine A means "defects route here."** The
   independent AI is never an A.

## Recommendations beyond the matrix

1. **Re-land the decision-rights rubric and the education-mode brief format
   on master.** They are the decision half of this RACI and currently exist
   only in `v1-final` history (`docs/ai-led-session-workflow.md`, rubric at
   ~3156–3431), from a codebase the rebuild deleted. They should come back as
   v2 docs — and the consult pair should be named in configuration, not
   prose (the v1 config named `gpt-5-4` + `gemini-pro`, disabled by default;
   the operator's current standing pair is Sol + Gemini).
2. **Give the Solution Explorer a writer or retire the view.** It watches
   `.dabbler/solution/projection.json`; nothing has written that path since
   the Python deletion, so it renders an empty tree. Either the router's
   `solution` verb (or the workflow that replaces it) writes the projection,
   or the view should not ship enabled.
3. **Settle the approvals tension on the record** (open item 2) — one
   sentence in `operator-decisions.md` deciding whether §1's heavy phases
   carry a blocking approval or the spec's verified-not-approved model.

## Cautions for whoever builds on this

- The rubric and education-mode citations are **v1 canon, not on master** —
  cite them as `v1-final:docs/ai-led-session-workflow.md` or re-land them;
  do not present them as current governing text.
- The Set 136 ladder's **waive rung no longer exists** and its absence is
  enforced in code (`packages/router/src/cli/verify.ts`, `verdict.ts:30`,
  `ledger.ts:65`). If a responsibility table has a "waive" row, the correct
  entry is: no actor — refused by name.
- Two stale comments predate the in-process cutover and will mislead a
  reader: `WorkExplorerTreeProvider.ts:11-13` ("projection subprocess") and
  `quick-start.md:401-405` ("pure renderer of `dabbler status --json`").
