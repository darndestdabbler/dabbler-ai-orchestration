# Design consult: what an operator's first unaided walkthrough found

You are consulted as an outside reviewer on a set of **product and
architecture decisions** for `dabbler-ai-orchestration`, a TypeScript
monorepo:

- `packages/router` — a session-lifecycle CLI published as
  `dabbler-ai-router`, one binary `dabbler <verb>`.
- `tools/dabbler-ai-orchestration` — a VS Code extension (v2.0.1) that
  bundles the router and calls it in-process, contributing two tree views:
  **Work Explorer** (sessions, tasks, verification, attention rows) and
  **Solution Explorer** (components, contracts, cross-repository edges).

You have NO tool access. Everything you need is in this brief, and it is
ground truth read out of the source today, not summary. **Every claim you
make about this repository must cite a path or a number from this brief.
Mark any claim you cannot ground here as ASSUMPTION.** Do not invent paths.

---

## The system, in one page

A **session** is one unit of AI-driven work. The framework owns the
lifecycle; the AI engine (Claude Code, Copilot CLI, Codex, Gemini) does the
mechanics. Two drive modes exist:

- **Pull (the current default):** the engine sits in the person's own CLI
  and calls `dabbler session next --sessions-dir docs/sessions`. One call =
  one move. The router returns one of four instruction kinds as JSON on
  stdout: `step`, `rejection`, `wait`, `done`. The engine does what the
  instruction says, runs its `answer_command`, and calls `next` again.
- **Push:** `dabbler session drive --engine <name>` spawns the engine as a
  child process and does the same loop unattended.

The driver's phases (`packages/router/src/generated/driver-run.ts:28`):
`plan → steps → preverify → verify → dispositions → fix → run-of-record →
land → gate-wait → publish → close → complete`.

The Work Explorer renders **six task rows per session**, derived from
records the lifecycle writes and from nothing an engine types
(`packages/router/src/progress.ts:851-857`, `buildTaskRows` at
`progress.ts:906`):

| row | ends when |
|---|---|
| `register` | `session start` stamps `startedAt` on the ledger |
| `declare` | `session declare` appends a `task-declaration` activity row |
| `work` | every approved-plan step accepted (driver phase past `steps`) |
| `verify` | verification reaches `VERIFIED` |
| `run-of-record` | the full suite passes against the verified tree |
| `close` | `session close` flips status to `complete` |

The **Dabbler terminal** (`tools/dabbler-ai-orchestration/src/router/dabblerTerminal.ts`,
1149 lines) is a pseudoterminal in VS Code that polls
`.dabbler/runs/s<N>/driver/run.json` plus the job logs, rounds ledger and
test-run ledger, and paints one line per event with a tone
(`lineTone`, `dabblerTerminal.ts:181`): `milestone | good | warn | bad |
muted | plain`. It carries **no engine chat** — the person reads that in
their own CLI.

The **owed-decisions** ledger (`packages/router/src/owedDecisions.ts`) is an
append-only JSONL per repository, folded by `id`, with events
`raised | answered | superseded` and states `open | answered | superseded`.
Four human-required classes exist, of which only `verification-reduction`
blocks; the other three proceed on a stated default with the wait recorded.
`dabbler owed list` and `dabbler owed answer` exist as verbs
(`packages/router/src/cli/owed.ts`).

---

## What happened

The operator ran the framework end to end, unaided, against a small
`csv-model` tutorial repository, driving Copilot CLI in pull mode. They
produced 18 numbered issues. Six are mechanical and are already scoped
(a null-coercion bug, two missing context-menu entries, an auto-refresh
gap). The six below are the ones with a design question inside them, and
they are what this brief asks you about.

---

## Question A — the framework reads as alarmist, and nothing ever says "resolved"

**What the operator wrote, verbatim:**

> Many issues raised in the framework are addressed by AI; therefore, the
> framework seems a little alarmist in nature. Rather than saying DEADLOCK
> in caps and making it seem like nothing can be done about it, the
> framework should use softer language to let the human know that AI was
> alerted regarding a deadlock, and it may be resolving the issue now. Same
> thing for "close refused" — better to tell the human that AI was alerted
> regarding any issue and that it may be resolving the issue. And again,
> when AI resolves the issue, a green message should be displayed in the
> dabbler terminal indicating as such.

> When there is an issue that requires human intervention but something
> that can be deferred — like a repository without a remote — there should
> be a warning. I think that the word "stopped" is too strong. It suggests
> that the application terminated. "paused" would be better. And again,
> when the human provides a decision that allows resuming, there should be
> a green message indicating as such.

> Use plain language in the Dabbler output window. For example, what does
> "declaration was refused" mean?

> Once a problem is resolved by AI, the human operator, or the framework,
> the Work Explorer (the underlying data) should remove the warning.

> When issues are raised by the framework and then resolved by AI, AI should
> inform the framework and the framework should indicate that the issue is
> resolved.

**Ground truth.**

The vocabulary is deliberate and load-bearing. Refusals are minted through
one function (`packages/router/src/drive.ts:385`):

```ts
function refusal(rule: string, reason: string): string {
  return `[${rule}] ${reason}`;
}
```

A driver bound throws `Stop(kind, reason)` (`drive.ts:461`), which writes
`run.json.stop = {kind, reason, at, step_id, class}` and prints to stderr
(`drive.ts:2477`):

```
dabbler: STOPPED (<kind>[, deadlock]) in phase '<phase>' after N invocation(s) -- <reason>
Session <N> stays in flight; the same command re-runs from this phase.
```

`class` is `"first" | "deadlock"`. A deadlock is defined mechanically
(`drive.ts:2435`): same `kind`, same `step_id`, same **undecorated** reason
as the immediately preceding stop. It appends this to the reason
(`drive.ts:432`):

> ` -- DEADLOCK: the same stop, on the same step, for the same reason as the
> one before it. Running it again unchanged reaches this exact point again.`

On a deadlock in **unattended** mode only, the driver climbs a triage ladder
of `TRIAGE_RUNGS = 2` advisers before raising the one owed decision the stop
is allowed to raise (`stopDecisionId(n) = "driver-stop-s<n>"`,
`drive.ts:449`). Under the pull (`this.pull`) the ladder is **skipped
entirely** — the stop goes straight to the record.

The operator's cited example, "the declaration was refused", is
`drive.ts:1464`:

```
"the declaration was refused (its reason is above); a plan is answered before any file changes"
```

Terminal tones (`dabblerTerminal.ts:181-195`): `stopped → bad`,
`watcher → warn`, `verify → verdictTone`, `tests → good|bad`, milestone
phases → `milestone`, everything else → `muted`. **There is no event that
means "this was resolved"**, and there is no `good`-toned line other than a
`VERIFIED` verdict and a passing test run.

Attention rows in the Work Explorer are **derived, not stored**
(`tools/.../providers/workExplorerTreeModel.ts:968`, `attentionNodes`): open
owed decisions, one liveness row per in-flight session, and one row per
in-flight session whose verification stopped short. Because they are
derived, a row clears when the record moves — but **only** when a record
moves. Nothing writes a record saying "the AI fixed the thing the row was
about", so an item the AI resolved in its own working tree keeps its row.

**The proposal to critique (A):**

1. **A resolution is an event, not the absence of one.** Add a terminal
   event `resolved` in the `good` tone, emitted when a stop that was
   standing is gone from `run.json` on a later poll, and when an owed
   decision folds from `open` to `answered`. Both are already observable in
   files the terminal already reads or could read.
2. **Two vocabularies, one record.** Keep `kind`, `class` and the rule token
   exactly as they are on disk — they are the machine's record and the
   thing gates and tests read. Add a **rendering layer** that maps each
   `(kind, class)` pair to one plain sentence for a person, held in ONE
   table in the router (so the terminal, `dabbler status` and the Work
   Explorer cannot word it differently), e.g.
   `engine/first` → "Dabbler paused: the AI's answer didn't include a plan.
   The AI has been told and is likely fixing it."
3. **"Paused", not "stopped", wherever a person reads it.** The record keeps
   `stop`. The rendering says paused, and says who is expected to act next:
   the AI, or you.
4. **A stop must name its expected actor.** Add a derived (not stored)
   `awaiting: "engine" | "operator"` to the stop's rendering, computed from
   `kind`. `rejected-thrice` and `deadlock` are the operator's; a first
   `engine`-class stop is the AI's.

**Ask:** Is a rendering layer over an unchanged record the right cut, or
does a second vocabulary invite exactly the drift the repository's own rule
3 forbids ("One implementation of any rule")? Is "the AI has been told and
may be fixing it" a claim the framework can honestly make **under the
pull**, where the framework cannot see the engine at all and cannot know
whether anyone read the instruction? What is the failure mode of softening
a word that is currently doing real work?

---

## Question B — the watcher observes and never acts

**What the operator wrote, verbatim:**

> When watcher sees no activity for a while, then dabbler needs to do
> something — often just tell AI to continue or ask the human operator for
> assistance.

**Ground truth.** The watcher is a **pure function over the records**
(`packages/router/src/driver.ts:860`, `watcherReading`). It returns:

```ts
interface WatcherReading {
  state: "quiet" | "instruction-outstanding" | "job-outstanding";
  sinceSeconds: number;
  job?: string;
  clock?: "acknowledgment" | "liveness" | "progress";
  recommended_action?: string;   // <-- already written, in words
}
```

Three clocks, all judged against one configured threshold
(`verification.stalled_after_seconds`):

- **acknowledgment** — an answerable instruction issued, no answer file
  written, tree not touched since.
- **liveness** — a background job running past the threshold whose log has
  stopped growing.
- **progress** — edits happened and then stopped with the answer still
  owed; or a job still writing `JOB_SPIN_MULTIPLIER = 5` thresholds past its
  start (`driver.ts:774`).

Each reading already carries a `recommended_action` in plain words, e.g.
`"nothing has been observed since the instruction was issued; re-invoke the
engine -- \`dabbler session next\` prints the outstanding instruction
again."`

**Nothing consumes it.** The only renderer is the Dabbler terminal
(`dabblerTerminal.ts:757`), which prints:

```
watcher since=<N>s state=<state> [job=<name>]
```

— dropping both `clock` and `recommended_action` — once per threshold
multiple crossed. Under the **pull** there is no supervisor at all: the
router only runs when the engine calls it, and a silent engine is by
definition an engine that is not calling it. The extension has no timer that
reads the watcher; its 30-second poll (`extension.ts:242`) refreshes trees
only.

**The proposal to critique (B):** a supervisor tier in the extension, since
the extension is the only process alive while the engine is quiet.

1. The Dabbler terminal already polls; give it a **ladder keyed on the
   multiple of the threshold crossed**, not on the reading alone:
   - 1× — say it, with `recommended_action`, in `warn`.
   - 2× — **act, once, and only on the acknowledgment clock**: write the
     outstanding instruction back into the engine's terminal
     (`terminalShim` already puts `dabbler` on PATH; VS Code can
     `sendText` into a terminal the extension created) or, in push mode,
     re-invoke the engine. Record the nudge on `supervision.jsonl`, which
     already exists as the append-only spend-and-refusal record (session 80).
   - 3× — raise an **advisory** owed decision addressed to the operator,
     with the reading's own words as the brief.
2. **Never act on the liveness or progress clock.** A wedged job is
   `terminateTree`'s business and the operator's call; a nudge there would
   double-spend a provider round.
3. **A nudge is capped per silence.** One per `watching` identity
   (`dabblerTerminal.ts:734` already computes that identity as
   `job\0log\0started_at` or `seq:<n>`).

**Ask:** Is an extension-side supervisor the right home, given the router is
the only thing that owns lifecycle rules and the repository's rule 3 says a
rule is stated once? Or should the router grow a `dabbler session supervise`
daemon verb that the extension merely launches? What stops an auto-nudge
from burning a premium request per threshold on an engine that is simply
thinking? (Operator constraint on the record: Copilot seat calls are priced
per USER prompt, and the operator's budget has three currencies with no
exchange rate between them.)

---

## Question C — two six-step lifecycles are visible at once, and one never moves

**What the operator wrote, verbatim:**

> Solution Explorer Contract — what is that? Why does it say "not written
> yet"? Why does the Contract tooltip say "… it is written in Step 3?" Why
> does the csv-model say "1/6 Plan and design"?

> The task list doesn't seem to be that helpful and doesn't seem to be
> updating.

> The "Declare" step isn't named very well. Why not have "Register",
> "Plan", "Work 1: _____", "Work 2: ____" …, "Verify", "Test", "Close"?

**Ground truth.** There are genuinely **two** six-step vocabularies in the
product, and they are unrelated:

1. The **session** lifecycle — the six task rows above, which move on every
   session.
2. The **component/module** workflow (`packages/router/src/solution.ts:33`):
   `plan → decompose → contracts → mocks → integration → build`, titled
   "Plan and design", "Break it into components", "Write down the promises",
   "Build stand-ins", "Build the whole thing on stand-ins", "Replace the
   stand-ins for real". The Solution Explorer renders this as
   `${c.stepNumber}/6 ${c.stepTitle}` on every component row
   (`solutionTreeModel.ts:337`) and as a `■■□□□□` progress bar
   (`solutionTreeModel.ts:540`). The Contract row's "not written yet" and
   "it is written at step 3" (`solutionTreeModel.ts:347-353`) refer to step
   3 of **this** lifecycle.

The module workflow is advanced only by explicit `dabbler workflow` verbs
(`packages/router/src/cli/workflow.ts`, `workflow/commands.ts`). **Nothing
in the session lifecycle advances it.** A repository set up by `dabbler
bootstrap` and then driven through sessions therefore shows `1/6 Plan and
design` forever, with a Contract row that says "not written yet" forever,
while the sessions themselves complete normally.

The Solution Explorer's projection is written to
`.dabbler/solution/projection.json` and rewritten only by `bootstrap`,
`deps place`, the `workflow` verbs, and one call inside the driver's plan
phase (`drive.ts:1511`). It is not rewritten as a session progresses, and
the extension watches only that one file
(`SolutionTreeProvider.ts:46`).

On the task rows: `work` is **one row for the whole session's edits**
(`progress.ts:1024`), even though the approved plan is an ordered list of
named steps that the driver accepts one at a time and records in
`run.json.accepted_steps` and `step-execution.jsonl`.

**The proposal to critique (C):**

1. **Rename to the operator's words** and expand the work row:
   `Register → Plan → Work 1: <step intent> … Work N → Verify → Test →
   Close`. `declare` becomes **Plan** (it is the row that ends when the work
   plan is accepted); `run-of-record` becomes **Test**. The row *ids* on
   disk do not change — only the labels a person reads — so nothing that
   reads the record breaks.
2. **Work expands from the approved plan.** `buildTaskRows` gains one row
   per approved-plan step, each done when that step id appears in
   `accepted_steps`. Before a plan exists there is one placeholder Work row.
3. **Decide the module workflow's fate.** Three options, and this is the
   real question:
   - **(a) Retire it from the default view.** Hide the `N/6` description,
     the progress bar and the Contract row unless the repository has
     actually entered the workflow (`workflow enter` was run). A bootstrapped
     repository then shows components, contracts-if-present, and edges — and
     never shows a lifecycle nothing is driving.
   - **(b) Wire it to sessions.** Make the session lifecycle advance a
     component's step when a session's declared work names that component.
     This is a new coupling between two machines that were built apart.
   - **(c) Leave it, and explain it.** Better tooltips only.

**Ask:** Which of (a)/(b)/(c)? Weigh it against the repository's standing
rule "No new module without deleting one" and against the fact that the
module workflow has its own verbs, its own review prompts
(`stepreview.ts`), its own test phase (`testphase.ts`) and its own approval
gates — i.e. retiring it from the *view* is cheap, retiring it from the
*product* is not. Is showing a person two different "6 steps" in two panels
of the same window defensible at all?

---

## Question D — choosing which model authors and which model verifies

**What the operator wrote, verbatim:**

> Should be an easy way to allow each user to select a default model for
> authoring and a default model for verifying.

**Ground truth.** Selection is **by role**, never by a model name a caller
passes (`packages/router/router-config.yaml:69`):

```yaml
roles:
  generator:
    prefer: [claude-sonnet-4.6, gpt-5.5, gemini-3.1-pro-preview]
    require_provider_in: [anthropic, openai, google]
  verifier:
    prefer: [gpt-5.6-sol, gpt-5.4, claude-sonnet-4.6]
    require_provider_in: [anthropic, openai, google]
  plan-review:
    prefer: [gpt-5.4-mini, gemini-2.5-flash, claude-haiku-4.5]
  plan-review-escalated:
    prefer: [claude-opus-5, gpt-5.5, gemini-3.1-pro-preview]
```

`prefer` is **ordering only** — a model the list does not name still
qualifies and simply sorts after the named ones. `require_provider_in` is a
hard filter. `route(content, {role, excludeProviders, transport})`
(`packages/router/src/route.ts:721`) builds a ladder from that and
escalates through it. Verification is **cross-provider by construction**:
the verifier's provider excludes the orchestrator's, and there is a standing
no-skip mandate on the record — every session is cross-provider verified,
with no skip affordance anywhere.

Config precedence is: packaged `router-config.yaml`, then the repository's
`dabbler.yaml`, then `local-overrides.yaml` (machine-local, gitignored).
`dabbler.yaml` deliberately carries **no** providers, models, roles or
transports — the comment at its head says those are distribution facts and a
repository restating them "would fork the model registry in order to say how
to run a test suite".

There is a second, different sense of "authoring model": under the **pull**,
the thing that writes the code is the engine in the person's own CLI
(Copilot CLI's own model, chosen with `--model` on the registering call),
which the router does not select at all. The `generator` role is what the
router uses for its own internal generation.

**The proposal to critique (D):**

1. A VS Code command **"Dabbler: Choose Models"** offering two quick-picks —
   *Authoring* and *Verifying* — populated from the model registry, writing
   the choice as a one-line `prefer` prepend into **`local-overrides.yaml`**
   (machine-local, never the tracked `dabbler.yaml`), preserving
   `require_provider_in` untouched.
2. The pick refuses any model the registry marks
   `is_enabled_as_verifier: false` in the Verifying list, and shows why.
3. It states, in the picker, that a preference is an **ordering** and not a
   pin, and that cross-provider verification still applies — choosing an
   Anthropic verifier while running an Anthropic orchestrator means the
   exclusion picks the next candidate down.
4. The **engine** model (Copilot's `--model`) is a separate setting on the
   Start Session flow and is labelled as such, not merged into this.

**Ask:** Is a machine-local override the right scope, or should a team be
able to fix the verifier for a repository (tracked in `dabbler.yaml`,
against that file's stated principle)? Does exposing a per-user verifier
choice create a route around the no-skip verification mandate — i.e. can a
user pick a cheap or weak verifier and quietly lower the bar? If so, what
constrains it without re-introducing a decision the operator has to make
every session?

---

## Question E — local packages, bundling, and a solution repository

**What the operator wrote, verbatim:**

> Need to handle local packages better.
> - Probably default to local packages that get built when needed (local
>   .m2 or .nuget directory)
> - Push to remote package repo only when needed and in consultation with
>   human operator
> - Local packages should be automatically updated when code changes or new
>   relevant code is fetched from a remote repo.
> - So — architecture suggestion (please review):
>   a. for releases and release candidates, local packages might be
>      'bundled' into a smaller set of composite packages based upon the
>      target architecture tier and server. AI would work with the human
>      operator on the bundling. It should be documented in the project in
>      an appropriate way. For example, a project document could indicate
>      what bundle the current project is part of.
>   b. there might be a need for a solution repo that holds the solution
>      documentation, as well as bundling information and serves to generate
>      the release artifacts.

**Ground truth — what exists today.**

- **The framework does not build.** `packages/router/src/resolution.ts`
  states this in its header: it declares and reads, and "nothing here
  installs, restores or builds; nothing here touches machine-global state;
  nothing here holds a credential."
- A repository declares what it consumes in `solution-dependencies.json`
  (`packages/router/src/solutionDeps.ts`): each edge names an `id`, a
  `kind`, a `producedBy {id, remote, path}`, a `resolve` mode, and an
  optional `feed`. `resolve` is `"feed"` or `"source"`.
- **Source mode already exists and is reversible or it does not happen**
  (`resolution.ts` header): swapping a `PackageReference` for a
  `ProjectReference` records the original element first, restores exactly
  what was there, and leaves a record if it crashes mid-way. Critically:
  "a green build against a sibling checkout says nothing about the published
  package, so the run of record, packaging and the close all refuse while
  any dependency is resolving from source." Every swap is recorded in
  `source-mode.jsonl` (`resolution.ts:SOURCE_MODE_FILENAME`), machine-written
  and never hand-edited.
- **Publishing is declared, per repository, in `dabbler.yaml`**, as a
  `packaging` block with `pack.argv` and `push.argv`, with `{output}`,
  `{artifact}`, `{feed}` and `{secret}` substituted per argv element at spawn
  time. `feed` is a URL in the file; `secret` names an environment variable
  and never holds one. Example from this repository's own `dabbler.yaml`:
  ```yaml
  packaging:
    pack:  { argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"] }
    push:  { argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}", "--api-key", "{secret}"] }
  ```
- A session declares itself `releasable` or `--not-releasable` at plan time;
  the driver's `publish` phase runs pack-then-push for a releasable session.
  `dabbler release` tags a release the operator authorised.
- The Solution Explorer already renders cross-repository drift states from
  the projection: `behind` (a newer version is published), `split` (two
  repositories in one solution pin different versions), `feed` (feed not
  configured), `ahead` (their checkout is ahead) — `solutionTreeModel.ts:411`.
- There is a **`solution.yaml`** at this repository's root and a
  `dabbler workspace` verb that generates a VS Code workspace over every
  repository in the solution. There is no separate solution *repository*.

**The gap the operator is naming.** Between "resolve from a published feed"
and "resolve from a sibling checkout" there is nothing. A multi-repository
solution under active development therefore has two bad options per edge:
publish to a real feed on every change (slow, and the operator wants the
push to be a consulted decision, not a reflex), or flip to source mode —
which the framework deliberately treats as a state that **refuses the run of
record, packaging and the close**, i.e. no session can finish while it is on.

**The proposal to critique (E):**

1. **A third `resolve` mode: `local`.** A machine-local feed directory (a
   `.nuget`/`.m2`-shaped folder under a stated path) that the producing
   repository packs into and the consuming repository restores from. It is
   *feed* resolution mechanically — a real package with a real version — so
   it does **not** inherit source mode's refusal. What makes it honest is
   that the version carries a local-build marker, and the close refuses to
   record a run of record against a tree resolving a `local` edge **unless**
   that edge's producer is itself at a commit that is pushed.
2. **The producer publishes locally as part of its own session's publish
   phase**, using the same `packaging.pack` argv it already declares, with
   `{feed}` substituted to the local directory. A remote push stays what it
   is now: a declared, operator-authorised act.
3. **Freshness is derived, not tracked.** A consumer's local edge is stale
   when the producer's checkout has commits after the local package's build
   stamp. The Solution Explorer already has a drift vocabulary
   (`behind|split|feed|ahead`); this adds `stale-local`, and the row's
   action is "rebuild it" rather than a question.
4. **Bundling (18a) is a release-time concern and is declared, not
   inferred.** A `bundle` block naming a set of component ids and a target
   tier, held in ONE place, with each member repository's `dabbler.yaml`
   naming which bundle it belongs to (a back-reference, so a repository can
   answer "what am I part of" without reading the whole solution).
5. **The solution repository (18b) is the natural home for (4)** and for
   `solution.yaml`, the solution documentation, and the release manifest —
   but it is also a new repository that every member must find, and the
   framework's `producedBy.remote`/`path` machinery already solves exactly
   that lookup problem for producers.

**Ask, and this is the largest question in the brief:**

- Is a `local` resolve mode a genuine third state, or is it source mode with
  extra steps and a weaker guarantee? What is the specific way it lets a
  session record "the suite was green" about something that will not be true
  once the package is published for real?
- Does a per-machine local feed break the framework's evidence model, whose
  whole premise is that the close records the full suite green against an
  exact tree with a surface digest over every tracked file?
- Is a **solution repository** warranted, or is it a second source of truth
  next to each repository's own declaration — which is the property the
  current design is proud of (`solutionTreeModel.ts:53`: consumers are
  "derived and never declared"; `A→B` declared in A and `B→C` declared in B
  are two owner-specific facts)? If it IS warranted, what is the smallest
  thing it may hold without becoming the central manifest the design avoided?
- The bundling idea (18a) — composite packages per architecture tier — is
  presented as an AI-plus-operator activity. Is that a framework feature, or
  a project convention the framework should merely record? What breaks if
  the framework starts owning composite artifacts?

---

## Question F — the loop can start a session it was never asked to start

**What the operator wrote, verbatim:**

> Why does Copilot prompt you to continue sessions that it finished? Is
> there a bug with the framework where it is supposed to terminate
> verification sessions but does not?

**Ground truth.** The extension launches the engine with this prompt
(`tools/.../commands/sessionCommands.ts:123`):

> Call `dabbler session next --sessions-dir docs/sessions --engine <e>
> --provider <p>` and do what it says until it says `done`.

`Driver.register()` (`packages/router/src/drive.ts`, `register()`) does:

```ts
const inFlight = readSessionState(this.sessionsDir)?.["currentSession"];
const closing = ... ;
if (this.options.engine === null && typeof inFlight !== "number" && closing === null) {
  // refused -- no session is in flight, and none can be started without --engine
}
if (this.options.engine !== null && closing === null) {
  const code = start(this.sessionsDir, { engine, provider, model, effort });
  ...
}
```

So: **`--engine` on a call made after the session closed silently registers
and starts the NEXT session.** The managed guidance (`AGENTS.md`) tells the
engine that only the first call carries `--engine`/`--provider` and "every
later call carries none of them" — but the launch prompt hands the engine
one command line with the flags in it, and an engine that re-runs the
command it was given, once, after `done`, starts session N+1. An engine that
correctly drops the flags instead gets:

```
dabbler: refused -- no session is in flight, and none can be started without --engine (and --provider).
```

so both endings are wrong: one starts unrequested work, the other ends the
run on a refusal.

**The proposal to critique (F):** make `done` terminal.

1. After a session reaches `complete`, a `session next` call **carrying
   `--engine`** refuses unless it also carries an explicit
   `--start-next`, and says so in one sentence.
2. A `session next` call carrying **no** flags with nothing in flight
   returns a `done`-shaped instruction ("nothing is in flight; there is
   nothing to do") with exit 0 rather than a usage refusal — an engine
   looping "until done" then terminates cleanly.
3. The launch prompt is reworded so the flags appear only on the first call.

**Ask:** Is `--start-next` the right shape, or should starting the next
session simply never be reachable from `next` at all (i.e. `session start`
is the only door in)? What does an unattended `session drive` need here that
a pull call does not?

---

## What to answer

For each of A–F, in this order:

1. **Soundness** — what is wrong or under-specified in the proposal, with a
   citation from this brief for every claim.
2. **Risk** — the failure mode you would bet on, and what makes it likely.
3. **Recommendation** — one, concrete, and small enough to be built. If you
   would not build the proposal at all, say what to build instead.

Then, once, across all six:

4. **Sequencing** — this work is done in numbered "sessions", each one a
   day's AI-driven unit that must end with the full suite green, a
   cross-provider verification and a commit. Group A–F (plus the six
   mechanical fixes: a `String(null)` coercion bug, two missing
   context-menu entries, a Solution Explorer that only refreshes on one
   file, a terminal that never reveals itself, a task list that shows one
   opaque "Work" row) into an ordered set of sessions, and say which
   ordering constraints are real and which are convenience.
5. **The one thing** you would cut from this list entirely, and why.

Be direct. Disagreement with the operator's framing is the most useful thing
you can produce; they have asked for review, not agreement.
