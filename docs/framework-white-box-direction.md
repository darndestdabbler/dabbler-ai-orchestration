# The framework as the only white box — proposed direction

**Status:** proposal, for critique. Asked of GPT Sol and Gemini,
independently: attack it, do not bless it. Nothing here is authorized
until the operator approves; nothing is built.
**Date:** 2026-08-26
**Branch:** `design/solution-decomposition`
**Suggested location:** `docs/framework-white-box-direction.md`

**Relation to prior documents.** `docs/framework-reconception.md` (the
supervisor model) stands. `docs/revision-2026-08-recommended-changes.md`
(work packages WP-0–WP-7) stands, amended per §8.
**This document reopens one operator decision of record** — "the extension
is the only surface they use." §4 makes the case; the operator decides.

**Provenance.** §1's five principles, the twelve instruction categories in
§2, and the escalation observation are **operator-authored** and settled as
intent; their wording is attackable. Everything else is proposed in this
revision and fully attackable.

**How to read this.** §0 states what the framework is for and where it
has been. §1 states the axioms and their corollaries. §2
compresses the instruction list into a grammar. §3 names the three black
boxes and the one white box. §§4–6 redesign surface, streaming, and
delivery on those axioms. §7 extends the framework past software. §8 lists
amendments to the standing change set. §9 is what must not change. §10 is
where to attack.

---

## 0. The point, and where this comes from

### 0.1 Goals

**The goal is trustworthy solutions delivered faster and cheaper, by
staff who supervise AI engines rather than write the code.** The two
success criteria of record: (a) staff get over the finish line faster and
cheaper, and (b) staff *want* to use it, because the architecture is
simple enough to understand and intuitive. (b) rules out ceremony as
firmly as (a) rules out sloppiness — a correct mechanism people route
around has failed.

**The economic thesis: attention is the scarce input and tokens are the
cheap one, so the framework converts problems of attention into problems
of process plus tokens.** A supervisor's attention is spent only where a
decision is genuinely theirs; AI tokens are spent everywhere else. Both
are costs; the second is far cheaper, and getting cheaper.

**Trust is manufactured mechanically rather than maintained by
vigilance.** Decomposition keeps each unit of work small enough that less
goes wrong; contracts make black boxes actually black; cross-provider
verification catches what went wrong anyway; the append-only record makes
every decision and every finding inspectable afterward. Quality that
depends on someone paying attention does not survive that person having a
busy week.

**The bar to beat is the status quo: N disconnected windows, no shared
view, and quality held up by heroics.** The bar is low, and it is the
real bar. An improvement over that is a win; perfect is not required.

### 0.2 Where this comes from

**The framework today is a VS Code extension plus a Python package that
routes work across AI vendors, runs a session lifecycle, and enforces
cross-provider verification.** `ai_router` decides; the extension
renders. The unit hierarchy has been session sets → sessions → tasks, and
the numbered history of session sets runs into the 140s. The evidence
cited throughout this document — the severity-inflation incident, the
15-round run, five rounds returning four new Majors each — is operating
history from that record, not thought experiment.

**It has built real things in two very different worlds.** Production
software solutions for state government — the two mandated stacks, Java
and .NET, come from that world, as do the HL7 v2 parsing study and the
Electronic Lab Reporting example — and home projects, including a
software platform for exploring alternative music notation.

**That spread is why §7 treats domain generality as a requirement rather
than a curiosity.** A framework serving regulated government data systems
on Monday and a notation-exploration platform on Saturday cannot afford
software assumptions baked into its core — and the music example in §7 is
drawn from life, not invented for the table.

**What it is becoming is the subject of this document:** the same
machinery, reconceived so that the framework — not an IDE, not an AI
engine, and not anyone's vigilance — is the thing that drives.

## 1. Axioms — the manifesto

**The operator's five principles:** (1) the framework drives all
within-session processes, not AI; (2) AI is a black box for
non-deterministic processing — work that cannot reliably be converted to
parameterized mechanical code; (3) every AI output includes a
deterministic input to the next framework process — a generated file's
presence, a numeric, Boolean, or enumeration value; (4) everything
mechanizable is mechanical, parameterized, executable code, run when
conditions are met; (5) AI serves the framework, never the reverse.

**Compiled down by their own rule, the five are one sentence: the
framework is the program; an AI engine is a function call.** P1 — the
framework owns the program counter. P2 — AI is the nondeterministic
subroutine. P3 — every call declares a return type. P4 — everything else
is ordinary code. P5 — no subroutine seizes control flow.

**Corollary to P3 — branch only on honest fields.** The framework
branches only on outputs that are (a) verifiable by the framework itself —
a failure case it can run, a file whose presence it can test — or (b)
authored by a party indifferent to the branch. The recorded reason: v1
keyed cost control to verifier-authored severity and got 95%+ MAJOR within
days. "Tests pass" is the framework's observation, never the AI's claim.

**Corollary to P4 — mechanize or delete.** Automating a process is not a
justification for keeping it. `activity-log.json` was demoted to optional
diagnostics for exactly this reason. Every mechanical step must still name
the work it removes; automated ceremony drifts silently precisely because
nobody feels its cost.

**Escalation is a return value, not a conversation** *(the operator's
observation, promoted to a rule)*. In an AI-driven framework, "request a
human decision" is a conversational turn that holds a session open. Here
it is `ESCALATE(attention-event)`: the call terminates, the inbox files
the event, and the framework resumes later with the decision as a
parameter, state refolded from the journal. The whole family transforms
the same way — round-extension requests, scope-change proposals,
contract-change proposals, cannot-substantiate deferrals. **The sorting
rule against the one mediated exception (path-aware pull): if the
framework can answer from state, it is a budgeted channel; if a person
must answer, it is a terminal return.** Holding a session open against
human latency couples AI context lifetime to human availability — the
losing-its-place failure the process layer exists to end.

**Proposed sixth principle — the framework drives the human's
participation too.** Attention is requested only through typed events at
the enumerated touchpoints; the framework never assumes anyone is
watching; a decision is a journal append. In one line: **the framework
sequences; AI authors; the human authorizes.** This also dissolves an
apparent conflict between P1 and the reconception's "AI leads work
packages": leading is authorship of content; driving is ownership of
process state.

## 2. The instruction grammar

**The twelve instruction categories are an enumeration of a cross
product: five verbs over an artifact set.** Verbs: **produce, critique,
adjudicate, document, instruct.** Artifacts: project plan, package set
(spec), session plan, solution, acceptance/tests, contract,
documentation, delegated instructions, critique-of-X. The blanks in
categories 6–8 ("following ____ guidance, generating ____") are not prose
to fill in later; they are the two columns the framework owns at every
call site.

**One primitive: `ai_call(verb, artifact, inputs) → return-schema, under
guidance@version`.** Adding an artifact type is a configuration row, never
a code path. Guidance documents and return schemas are versioned
infrastructure — the verification prompt is already treated so; this
generalizes that treatment to every call site.

**The compression is checkable — nothing dropped:**

| Operator's category | Grammar form |
| --- | --- |
| 1. Work with human on project plan | `produce(project-plan)` — human-gated |
| 2. Operationalize plan into spec / session sets | `produce(package-set)` |
| 3. Session plan from description | `produce(session-plan)` |
| 4. Solution for step | `produce(solution)` |
| 5. Tests for step solution | **splits — see below** |
| 6. Verify/critique project plan | `critique(project-plan)` |
| 7. Verify/critique spec | `critique(package-set)` |
| 8. Verify/critique session plan | `critique(session-plan)` |
| 9. Verify/critique solution | `critique(solution)` |
| 10. Generate documentation | `document(X)` |
| 11. Instructions for delegated assignment | `instruct(engine, X)` |
| 12. Evaluate a critique | `adjudicate(critique(X))` |
| *(missing today)* | `produce(contract)`, `critique(contract)` |

**The artifact set gains the row the current list cannot express:
contract.** Contract formalization inside the decomposition gate is the
framework's most important gate — Sol's unapproved-baseline finding — and
the grammar must be able to say it.

**Category 5 splits, because acceptance written after a solution is
confirmation-shaped.** The evidence asymmetry places acceptance at plan
time: **(5a)** `produce(acceptance)` — operationalize the step's
pre-registered acceptance contract, at plan time; **(5b)**
`produce(tests)` — unit tests, at solution time.

## 3. Three black boxes, one white box

**The same encapsulation pattern appears three times, hiding three
different things, enforced three different ways:**

| Box | Hides | Contract | Enforced | A violation is |
| --- | --- | --- | --- | --- |
| AI call | nondeterminism | `(verb, artifact, guidance@version) → schema` | per call, at runtime, fail closed | **expected** — raw quarantined, round fails |
| Component | implementation | interface + version + pins | at build time — surface gate, blocked-import tests | a bug |
| Human | judgment | attention event → decision | terminal returns; journal appends; never assumed watching | nothing — work waits, and the wait is recorded |

**The boxes live in different layers and compose.** Components are
solution-layer — durable, spatial. AI calls are work-layer — ephemeral,
temporal. Component contracts define the small context that makes AI
calls affordable; AI calls are what build components. Cross-provider
verification is box #1 instantiated twice, gripping best at box #2's
contract surface.

**The architecture in one sentence: the framework is the only white box.**
Three opaque parties, one inspectable mediator, every boundary crossing
typed and recorded.

## 4. The surface, reopened

**This section reopens the operator decision of record that the extension
is the only surface staff use.** The case, then the proposal; the operator
decides.

**VS Code answers a builder's needs, and the builders are now engines.**
The supervisor's contract is five touchpoints — approve plan/design,
approve decomposition with contracts, grant or refuse round extensions,
adjudicate disputed findings from a two-minute brief, sign off UAT — and
none of them touches a file, a terminal, or a repository. The brief is
already specified as decidable *without reading the code*. The framework
changed its audience and kept the old audience's surface.

**The extension is already architecturally a doorway, not a wall.**
`explorer` is a read-only consumer of the `worklog` projection —
"TypeScript renders, Python decides" — and the new Solution Explorer is
still a drawing, so nothing built is discarded. The onboarding cost cuts
against the persona: today the extension bootstraps a Python interpreter
and installs `ai_router` (`pythonInterpreter.ts`, `installAiRouter.ts`).
An IDE plus an extension plus a venv, to read an inbox, fails success
criterion (b). And the two mandated stacks are Java and .NET, whose
developers live in IntelliJ, Rider, and Visual Studio — VS Code was never
their home either.

**Proposed: one renderer, two shells, three doorways over time.** The
supervisor UI — tree, inbox, briefs, approve/refuse/grant — is a plain
web view served by the CLI (`dabbler serve`). The browser hosts it for
supervisors; a VS Code webview hosts the *identical* static files for
developers; divergence is impossible because both render the same
projection and write through the sanctioned writers. The third doorway,
later: the projection and inbox exposed as an MCP server, so supervision
becomes "what needs me?" asked from Claude Code or Copilot chat, with
approve/refuse as tool calls that must echo an explicit event id — a
confabulated approval structurally impossible, same write ledger.

**Ownership buys the navigation the model already implies.** Every noun
becomes a route — solution, component, package, round, finding, brief —
so attention events deep-link to pre-scoped evidence, which is what makes
the two-minute brief actually two minutes. The inbox is the home page,
not a badge on a tree. The by-component / by-status / by-release pivot is
a query parameter.

**The integrated UAT checklist is `uat_follow` with a human as the
model.** Same document, same steps; the UI renders a checklist and
records completion per step. Sign-off stops being one checkbox and
becomes a per-step record — and diffing where humans stumble against
where the weak-model panel stumbled turns every UAT run into calibration
data for the panel itself.

**The doorway question is settled empirically, by the operator's own
method.** Write the supervisor's-day instructions per doorway and run the
weak-model panel through each; a doorway in which the panel cannot
complete the five touchpoints fails.

## 5. Streaming: stream the record, tail the logs

**"CLI output" is two things with different trust levels, and they get
different channels.** Framework state — session progress, rounds,
findings, attention events — is already appended to the journal by the
sanctioned writers. The UI subscribes to *that*, never to a process's
stdout.

**Mechanics: Server-Sent Events, with the event id equal to the journal
sequence number.** `dabbler serve` exposes the projection plus
`GET /events`. Reconnect sends `Last-Event-ID` and the server replays from
the record — resumability for free, no broker, because an append-only
record *is* a replay buffer. SSE over WebSockets deliberately: the write
path is discrete POSTs, and auto-reconnect-with-last-id is the
protocol-level match for journal replay. Most systems bolt on a message
bus to get a live UI; here it falls out of "the machine owns the record."

**Raw process output stays out of the journal.** Copilot CLI runs, test
suites, and token streams are diagnostics: per-step log files (the
`raw_output_ref` pattern), with a peek drawer that tails
`GET /logs/<step>` on demand — chunked, retention-limited, never gate
evidence. This is the same demotion `activity-log.json` already received.
Chunk-safe UTF-8 handling is solved once in `utf8ChunkDecoder.ts`; the
server needs the same care.

**Two deliberate refusals.** **No token-by-token model streaming in the
supervisor shell** — a half-formed output is not yet a deterministic input
(P3), and watching tokens is theater for this persona; it stays in the
developer shell. **No PTY in the supervisor UI** — children run
non-interactive (set 137's argv handoff), a child that asks a question is
a misconfigured step that fails, and the moment there is a terminal in
the view, the supervisor is a developer again.

**The guard line for the whole owned-UI direction: the UI may never know
anything the projection doesn't say, and may never do anything a CLI
command can't.** Write handlers invoke the same functions as the CLI
verbs — one implementation, so the UI is provably no more powerful than
the CLI.

**The entire surface can be built for zero tokens.** The corpus already
contains `session-events.jsonl` fixtures; replay them through `serve` and
the supervisor UI is developed and tested deterministically before it
ever meets a live run.

## 6. Delivery: one channel

**VS Code's auto-update never covered the half that matters.** The
marketplace updates the extension shell; the framework is Python,
bootstrapped separately — two channels, with version skew between them as
a standing failure mode. The goal is one channel, not a different
updater.

**Near term, the wheel is the channel.** The renderer ships as static
files inside the Python package: `pipx install`, `dabbler serve`, browser
opens. One artifact carries the UI, the framework, the guidance docs, and
the verification prompt, atomically versioned — skew becomes structurally
impossible, which is strictly better than what VS Code offered. A
supervisor's install is one command; update is `pipx upgrade` plus a
startup banner when a newer release exists.

**At team scale, the browser is the delivery.** WP-5 puts the record in
git; a small internal box runs `serve` against it; staff get a URL. Zero
install, updates land for everyone on deploy — and the underrated part:
everyone is on the same guidance and prompt versions *by construction*,
which "the verification prompt is load-bearing infrastructure" quietly
requires and per-machine installs cannot promise. Execution stays where
credentials live — copy-prompt works from a browser — while supervision
centralizes, because a decision is a journal append through the
sanctioned writers.

**The ladder: wheel for the pilot; URL past two or three staff; VS Code
persists as the developer shell and is allowed to lag,** because the
renderer inside it comes from the same wheel.

**Provenance gains a field: the framework version that wrote each
event.** The record should say which version wrote what.

## 7. Past software: the domain seam

**The work layer is domain-neutral already, and partially prose-proven.**
Packages, sessions, the journal and fold, round governance, the inbox,
weak-model instruction testing — the five-rounds/four-Majors result was a
*plan document*, and `uat_follow`/`skimcheck` were built on walkthrough
prose, not code. A policy suite or a musical score can use this layer
today with a trivial component graph and lose nothing it has now.

**The component concept transfers, and the operator's examples are strong
cases, not weak ones.** Legislation: a definitions section is an
interface; "as defined in section 3 of the X Act" is contract
consumption; an amendment act is a work package that enumerates its
affected components; the express-amendment convention — no silent
redefinition — is the API gate; a consolidated statute is the fold of an
append-only amendment journal. Music: movements and parts are components;
instrument range is a type error; motifs are shared meaning while
accompaniment figuration is duplicated mechanism — §6.5's boundary,
verbatim; the parts on the stands versus the composer's working score is
the consumer-view/pin split; and film scoring already practices IDD — the
MIDI mockup is the integration built against mocks, orchestration
replacing them gradually.

**What varies by domain is a thin adapter surface, and `solution.py`
already declares kinds.** The seam exists nominally; the risk is that
only software kinds get implemented and their assumptions leak upward.

| Domain | Interface extraction | Deterministic checks | A failure case is | Mock |
| --- | --- | --- | --- | --- |
| Software | compiled surface diff | tests, types, lint | a failing input | stub library |
| Legislation / policy | defined terms + obligations | cross-refs, term usage, numbering, style lint | a fact pattern with a contradictory outcome | placeholder section, terms fixed |
| Score | instrumentation, key/tempo scheme, motif registry, ranges | notation validation, range and playability | an unplayable passage | piano reduction / MIDI mockup |

**Two honest limits.** **Gate teeth scale with the domain's formality:**
notation and legislative drafting are more formal than most code;
free-form policy prose is the loose case and needs authoring conventions
before extraction has anything to grip. **Aesthetic findings cannot carry
failure cases** — so they record, never block, and the human adjudicates
taste; the round cap matters *more* there, because if a prose document
has no bottom, an aesthetic review has no floor.

**Guardrail: a domain is configuration, never a code path.** No core
module imports a kind adapter; the manifest schema quarantines domain
fields inside kind-specific blocks. Domain semantics live entirely inside
the black box (P2); domain specifics live in `guidance@version` and the
adapters.

**This stays a hypothesis until a second pilot.** The cheap one, someday:
a policy suite — no compilers to confound it, and the document verifier
already exists.

## 8. Amendments to the standing change set

`docs/revision-2026-08-recommended-changes.md` stands; this direction
amends it as follows.

- **New §1.0 — the axioms.** §1 here sits above the seven principles;
  `docs/operator-decisions.md` gains the manifesto as a decision of
  record, with provenance.
- **New §2.10 — surface and delivery.** §§4–6 here. The `explorer` row in
  the dogfood cut splits into **renderer** (static assets shipped in the
  wheel) and **shells** (browser; VS Code webview; MCP doorway later).
- **WP-0 gains:** no core module imports a kind adapter; the manifest
  schema quarantines kind-specific fields.
- **WP-1 gains:** return schemas and guidance docs versioned per call
  site; framework version stamped into event provenance.
- **WP-3 gains:** escalations are terminal returns; `serve` exposes the
  projection plus SSE with event id = journal sequence; the inbox is the
  home page.
- **WP-4 acceptance changes:** renders in both shells from one
  projection; a route per noun; attention events deep-link to pre-scoped
  evidence.
- **New WP-8 — the served surface.** `serve`, SSE replay, log tailing,
  discrete write POSTs through the sanctioned writers, fixture-replay
  development. Reviewers may argue this folds into WP-3/WP-4; the
  counterargument is package boundedness.

## 9. What must not change

- **The machine owns the record.** A decision is a journal append through
  the sanctioned writers, from every doorway — browser, webview, MCP tool
  call alike.
- **Findings are never erased.** Aesthetic findings record and never
  block.
- **The enumerated touchpoints do not grow because the surface got easier
  to build.** A new touchpoint is a gated design change, not a UI feature.
- **The two-channel install never returns.** The extension may lag; the
  framework may not fork.
- **No PTY in the supervisor surface; no token streaming in the
  supervisor shell.**
- **The named ceremony stays dead** (`framework-reconception.md`, "What
  must not come back").

## 10. Where to attack

For Sol and Gemini, independently; findings adjudicated by the operator
under the standing method — reproduce before acting.

1. **The compiled axiom.** Does "the framework is the program; an AI
   engine is a function call" lose anything the five principles carry? Is
   there a P1-vs-"AI leads work packages" conflict that §1's
   authorship-versus-state distinction fails to dissolve?
2. **The grammar.** Is verbs × artifacts lossless against the operator's
   twelve (table, §2)? Which verbs are missing — negotiate, estimate,
   decompose? Is `adjudicate` genuinely a verb, or `critique` applied to
   a critique?
3. **The honest-fields corollary.** Is "verifiable or authored by an
   indifferent party" sufficient — or does path-aware pull let a verifier
   shape its own evidence base and thereby its blocking findings, an
   incentive door the corollary misses?
4. **SSE on the journal.** With WP-5's union-merged, two-machine appends,
   are sequence numbers still total enough for `Last-Event-ID` replay?
   Does record-as-bus couple UI availability to git availability at team
   scale?
5. **The guard line.** "The UI is never more powerful than the CLI" —
   enumerate the ways a served UI still leaks power: batch approvals,
   default-selected recommended options that make authorization
   rubber-stamp-shaped, notification pressure that turns five touchpoints
   into fifty glances.
6. **Terminal returns.** Which escalations genuinely cannot be terminal —
   a mid-step clarification inside a long-running build? — and what does
   forcing them through terminate-and-re-enter actually cost?
7. **Central serve.** The record's availability now has a server in the
   loop. Who writes when the box is down, and does per-machine journaling
   reconcile cleanly after?
8. **The domain seam.** Find where software assumptions already leak into
   core modules (`evidence.py`? `checks.py`? `affected.py`?). And is
   "aesthetic findings never block" abusable in either direction — an
   author dismissing substantiated findings as taste, or a verifier
   dressing taste as defect?
9. **The UAT checklist.** Per-step completion records create pressure to
   tick boxes. Apply mechanize-or-delete to the checklist itself: what
   work does each recorded step remove, and when does the diff against
   the weak-model panel stop paying for its collection?
