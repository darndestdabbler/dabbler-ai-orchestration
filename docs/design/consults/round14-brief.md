# Consult, round 14: four operator proposals on how much a session asks of a person

You are consulted on `dabbler-ai-orchestration`, the AI-led coding-session
framework: a TypeScript router (`dabbler <verb>`) bundled into a VS Code
extension, whose customers are .NET and Java teams. A session is driven by
`dabbler session next`: the engine (Claude Code, Gemini CLI or Copilot CLI)
answers one instruction at a time — a work plan, then each step — and the
framework runs the checks, the cross-provider verification rounds, the
complete suite as the run of record, the commit, the push, the publish and
the close. A different provider's model reviews every session ("the Primary
Reviewer"); the author never verifies itself.

You have NO tool access. Every claim about the repository must cite a path
or a fact from this brief; mark anything else ASSUMPTION. Do not invent
paths.

The operator has made four proposals after driving sessions 163–165 and
finding the framework still asks a person for things a person never
declines. They are stated below as given, each with the facts from the tree
and the ledger. You are asked to evaluate each and to recommend the
simplest design that honours it, or to say why it should be amended.

## How the operator judges a design

These rules are standing directives and outrank cleverness:

- **(a)** Ask what really skilled human developers would do, not what an
  ideal AI-designed system would do. The framework is judged against the
  practice it replaces.
- **(b)** The PowerPoint test: if the design needs a state machine to
  explain, developers will reject it.
- **(c)** Simpler, more reliable, more performant, every time.
- **(d)** Human developer time outranks AI time. Spend tokens to save a
  developer's hour.
- **(e)** The customer is a .NET or Java team, not this repository.
- **Do not over-gate AI process.** The operator has standing authority to
  override any gate the framework invented for itself. "We are complicating
  this too much" is a verbatim ruling.
- **The machine owns the record**: verdicts come from the reviewer, never
  the author; nothing under `.dabbler/runs/` is hand-edited; no code path
  accepts a hand-written verdict. Nothing below relaxes that.

---

## Proposal 1 — raise the verification round cap from 3 to 7

**Operator's words.** "As far as I can recall, there has never been a
situation when the human operator has not authorized additional rounds of
verification once the cap has been reached. And typically only one or two
additional rounds are needed. Raise the limit to 7 to prevent bothering the
human with this tedious task. The verifying AI now has an additional burden
of rationale that minimizes the chances of raising issues that are not
likely to be realized."

**Facts.**

- The cap is `verification.settings.max_rounds: 3` in
  `packages/router/router-config.yaml`, read by `verificationRoundCap` in
  `packages/router/src/config.ts`. The same block sets
  `max_test_rounds: 7` for the tests phase.
- When the cap is reached the loop writes a `remediated_at_cap` terminal
  row (`packages/router/src/verify/rounds.ts`, `terminateAtCap`). If the
  tree then moves — which an unreviewed fix usually needs — the driven
  session stops with kind `cap-terminal-tree-moved`
  (`packages/router/src/drive.ts`) and names the one exit: `dabbler verify
  reopen --rounds N --reason "<why>"`, which buys named rounds and never a
  verdict. `session plan amend --max-rounds` is refused after a terminal.
- **The ledger.** `docs/sessions/sessions.json` records 159 sessions with a
  round count. Rounds needed: 1 round 38 sessions, 2 rounds 61, 3 rounds
  44, 4 rounds 9, 5 rounds 4, 6 rounds 1, 7 rounds 1, 8 rounds 1. Nine
  sessions closed `REMEDIATED_AT_CAP` (sessions 12–87; none since 87). Every
  `verify reopen` ever recorded (five grants, sessions 137, 144, 157) was
  granted, and every reopened session reached `VERIFIED`. Of the 16
  sessions that needed more than 3 rounds, 15 finished within 7; the one at
  8 is session 137, where the amend-that-did-nothing cost rounds.
- **What a round costs.** One direct-API review call by the reviewer
  (today typically `gpt-5.6-terra`, $2 in / $12 out per million tokens,
  or `gpt-5.6-sol` at $5 / $30) over the fix delta and the plan excerpt,
  plus the author's fix step. Reviews on a Copilot seat bill AI credits per
  token.
- **The rubric already carried into every round**
  (`packages/router/prompt-templates/verification.md`): severity is graded
  by expected consequence; a blocking finding must state violation, impact
  and evidence and a plausible, probable failure scenario; Minor-only means
  `VERIFIED`; nits never open a round. This is the "additional burden of
  rationale" the operator refers to. It was added after a session that ran
  17 rounds and 39 fresh "Majors" before it existed.

**Ask.** Adopt 7 as stated, or amend? Consider: 5 would have covered 13 of
16 long sessions, 7 covers 15; whether a *convergence* rule (stop when a
round raises no finding that is new AND blocking) is worth adding beside
the number or is over-engineering; whether the reopen verb should stay for
the rare 8th round or go.

---

## Proposal 2 — after the first release, every session releases unless it cannot

**Operator's words.** "Once the initial plan and general design and
decomposition of a solution has been approved, the only time a human
should be bothered is to discuss the first release, which should be
discussed as early as possible. If we take an agile approach, and
continuous delivery is the rule rather than the exception, then following
the first release (which may involve additional considerations — a data
migration, go-live coordination), every additional session should result
in a release unless new or fixed functionality in the current session
depends upon additional sessions (possibly targeting other modules).
Principle: once new or fixed functionality can be delivered, it should be
delivered. AI can identify when new or fixed functionality can be
delivered. The framework then simply delivers it — publication is
preapproved in those cases. The only times a release is held are (a) the
first release, where there may be go-live considerations, and (b) when the
functionality cannot be delivered due to dependencies in subsequent
sessions."

**Facts.**

- The engine writes `releasable: true|false` in its work plan
  (`packages/router/schemas/driver-work-plan.schema.json`; the ask in
  `drive.ts` `planAsk` says "true only if this session may publish an
  artifact; otherwise false"). The framework declares the session from it
  before any edit. A releasable session publishes between the push and the
  close (`drive.ts` `phasePublish` → `dabbler packaging`), and the close
  gate `published_when_releasable` (`packages/router/src/gates.ts`)
  refuses a releasable session with no packaging run. `dabbler session
  withdraw-release --reason` is the one way a releasable session ships
  nothing, recorded and never rewriting the declaration.
- **Publication needs a person's answer today.** `packaging` will not tag
  until the owed decision `publication:<version>` is answered `publish`
  (`packages/router/src/owedDecisions.ts`, `raisePublicationDecision`,
  class `external-consequence`, comment: "absolutely not the working AI's
  to take"). It is keyed to the version because an unkeyed decision
  answered once in 2026-09-02 went on to authorise four releases with
  nobody asked — "a decision keyed to nothing is consent for everything".
  On this repository there have been 12 such decisions: 11 answered
  `publish`, one `not yet` (2.0.19, held by the operator, which burned its
  number). The `marketplace` environment in CI also asks a person to
  approve the publish job, so a publish is consented to twice today.
- The operator's ruling after 165 (verbatim in spirit): "if you just need
  to confirm that it is OK to publish, just ask me that. My developers will
  hate this." Handing the operator `owed answer --choice publish`, a second
  `dabbler release` and `session next` is what they refused.
- Releases so far: 2.0.15 through 2.6.0 over sessions 137–165; most
  sessions in that span were planned `--not-releasable` by the session
  plan's author and released in batches of two or three sessions.
- The customer's product is a NuGet or Maven package into a declared feed
  (`packaging.ts`, `packaging-feed` and `packaging-secret` decisions), or
  a VSIX for this repository. There is no deployment step in the
  framework: "release" means a version pushed to a feed or a gallery.

**Ask.** The operator's rule is: publication is preapproved after the first
release; a session holds only for (a) the first release or (b) a stated
dependency on later work. Recommend the simplest design. Specifically:

1. Where does "the first release has happened" live so the framework can
   read it? (A tag on origin? The packaging record? A one-line
   declaration?)
2. What does the engine's plan say instead of a bare `releasable`
   boolean? (A hold needs a reason; a default of "ship" needs nothing.)
3. Does the CI environment approval stay as the one human consent, or is
   it the second consent the operator is tired of? Note the framework
   cannot remove CI's environment rule; it can only stop asking its own
   question.
4. What happens to a session whose review ended at the cap with findings
   standing, under a ship-by-default rule?
5. Who decides the version number (major/minor/patch) once no person is in
   the loop, and is that a question worth asking at all for a per-session
   release?

---

## Proposal 3 — eliminate owed decisions

**Operator's words.** "The whole owed decisions approach is too
burdensome. We should eliminate it. Decisions from the human and from AI
should continue to be documented, but there should be no more owed
decisions."

**Facts.**

- `packages/router/src/owedDecisions.ts` is 1,042 lines; `cli/owed.ts`
  (`dabbler owed list|answer`) is 500; the extension carries
  `owedDecisionCommands.ts` (238 lines, its test 172), 22 references in the
  Work Explorer tree model, 9 in the Dabbler Terminal, 5 in
  `package.json`. The close gate `owed_decisions` blocks only the
  `verification-reduction` class.
- **Every decision the code can raise**, with its class:
  - `testing-suites` / `testing-suites-tests-exist` (verification-reduction,
    the only blocking class): no suite is declared in `dabbler.yaml`, so
    the run of record has nothing to run.
  - `git-remote` (external-consequence): no origin to push to.
  - `dependency-ownership:<pkg>` (value-tradeoff): does one of your own
    repositories build this package?
  - `feed-source:<feed>`, `packaging-feed`, `packaging-secret`
    (external-consequence): which feed, and the NAME of the credential
    variable.
  - `publication:<version>` (external-consequence): the release question
    above.
  - `module-grant:<sibling>` (value-tradeoff, `exposure.ts`): a focused
    session asked for a sibling module's source; a person grants or
    refuses.
  - `driver-stop-s<N>` (value-tradeoff, `drive.ts`): EVERY stop of a
    driven session raises one — "run it again, or cancel it?" — carrying
    the stop's reason and, when the triage ladder produced one, an
    adviser's proposed amendment. It is superseded automatically when the
    session resumes.
  - `run-of-record-owed/s<N>/<suite>` (accountability-signoff): a suite
    the container runner could not run on this host.
- **On this repository, ever:** 44 decisions. 30 are `driver-stop-s<N>`,
  all superseded by the next `next`; 12 are `publication:<v>`; one
  `repair-outside-a-step-137`; one unkeyed `publication`. None of the
  setup questions ever fired here — they fire on a new repository (the
  trial repository csv-model on 2026-08-30 closed session 1 at a clean
  tree with nothing tested, which is the incident `testing-suites`
  cites). The sample walk raised `module-grant:person` once and the
  focused session waited on it.
- **Where decisions are documented regardless:** `activity-log.json`
  carries decision entries (D1…D278), rendered to
  `docs/sessions/decisions-log.md`; `docs/operator-decisions.md` is the
  operator's own governing record. Neither depends on the owed module.
- Session 163 already removed the questions nobody needed to answer
  (`rebaseline` asks nobody; `--approver` gone). The operator's stated
  expectation is that everything a person is still asked mid-session gets
  the same treatment.

**Ask.** The operator wants the module gone. For each decision class that
still bites, name the simplest replacement, in order of preference:
(i) a default the framework takes and records; (ii) a refusal that names
the fix, with no row and no verb (`session start` already stops with
"what refused, who acts, the command"); (iii) one question asked in the
place the person already is (chat, a toast) whose answer is one word. Say
which class, if any, cannot be replaced by (i)–(iii) and why. Say what
happens to `module-grant`, which is the one that holds a focused session
mid-flight. Say whether `driver-stop` rows carry anything a stop message
does not.

---

## Proposal 4 — non-goals in the plan, and both roles told that over-engineering is forbidden

**Operator's words.** "AI has a tendency to over-engineer solutions, and
the over-engineering is at the design level. AI models seem to have been
instructed to demonstrate their ongoing value by designing increasingly
sophisticated solutions. We need serious constraints on this. The
Authoring AI must identify non-goals in the work plan, and the Verifying
AI must evaluate the solution against both the goals and the non-goals.
Both must be told that over-engineering is strictly forbidden and that the
value AI brings is measured as much by the simplicity and clarity of its
design and implementation as by the alignment of the solution with the
stated requirements."

**Facts.**

- The work plan (`driver-work-plan.schema.json`) carries `task`,
  `releasable`, `steps[{id, ask, files, checks}]`, optional
  `repositories`, `modules`, `reason`. Nothing about goals or non-goals.
  The plan ask (`drive.ts` `planAsk`) tells the engine to keep steps small
  and one concern each, and nothing about scope or simplicity.
- The reviewer receives the session's own section of the session plan
  verbatim (`packages/router/src/verify/prompts.ts`, `buildTaskBlock`)
  plus the fix delta, under the template
  `prompt-templates/verification.md`, whose criteria are Correctness,
  Completeness and False confidence. Nothing about scope creep, design
  simplicity or a non-goal. A finding must name a violated requirement to
  block; over-building violates no requirement, so today it can only be a
  nit.
- The provider system prompts (`prompt-templates/system-prompts.md`) are
  generic "expert software engineer, be direct" text.
- This repository's own ground rules (`AGENTS.md`: no new module without
  deleting one; LOC budgets; one implementation of any rule) encode the
  same constraint for THIS tree, and are suspended for the rebuild. They
  do not travel to a customer's repository.
- The verification template already fights manufactured findings: "a
  correct and complete response SHOULD come back VERIFIED; manufacturing a
  finding to avoid a clean verdict is itself a failure". A reviewer told to
  hunt over-engineering is under the opposite pressure.

**Ask.** Recommend the simplest design that gives the operator what they
asked for. Specifically:

1. Is `non_goals` a required member of the work plan (an empty list
   allowed, or must the engine name at least one)? Where does it come from
   when the session plan's section already states scope?
2. What does the reviewer get told, and is "built something the plan did
   not ask for" a blocking finding (Major) or a nit? Under the rubric,
   what is its failure scenario?
3. The sentence about value being measured by simplicity: does it go in
   the plan ask, the step ask, the verification template, the provider
   system prompts, or the managed `AGENTS.md` body every engine reads at
   the customer's repository? Pick the fewest places.
4. Is there a mechanical signal worth adding (diff size against the step's
   declared files, new files not in `files`, a new dependency) or is that
   the over-engineering the proposal warns against?

---

## Answer shape

For EACH of the four proposals, in this order:

- **Verdict:** ADOPT AS STATED / ADOPT WITH AMENDMENT / DECLINE, and one
  sentence why.
- **Design:** the simplest design, at most six sentences, naming the seam
  in the tree it attaches to (from the facts above) and what is deleted.
- **The one risk** and its mitigation, one sentence each.
- **What a skilled human team does** in the same situation, one sentence.

Then, overall:

- **Ordering:** how you would split the four into sessions (one session
  per line: what it does, and what it deletes).
- **What NOT to build:** anything in the proposals or in your own design
  you would leave out, and why.
- **Disagreements you expect** the other advisor to raise, and your
  answer.

Plain language. No headings beyond the ones named here. Mark every claim
not grounded in this brief as ASSUMPTION.
