# Would an agent-native architecture serve this framework better? — feedback (Fable)

Engine: Claude Fable 5, 2026-08-22. Written against the tree at set 145 session 1
(`experiment/verification-pipeline-v3`). Companion opinions from other engines may
land beside this file with their own suffix.

## The question

Reconceive `dabbler-ai-orchestration` on top of the agent-harness primitives that
now exist in Claude Code (and, in partially compatible forms, in Copilot CLI and
Gemini CLI): **agents and subagents**, **skills**, **hooks** (shell tasks fired on
lifecycle events, including worktree creation), **background tasks with
notifications**, and the **Agent SDK** for programmatic control. Would sessions,
tasks, verification, and the AI Work Explorer come out better?

## Verdict up front

**Partially yes — but as an enforcement layer, not a replacement.** The strongest
version of this idea keeps `ai_router` exactly where ground rule 5 puts it — the
Python router owns the record and the decisions — and uses harness primitives to
do three things the router currently cannot do or does awkwardly:

1. **Enforce the lifecycle at the tool boundary** (hooks), instead of detecting
   violations after the fact.
2. **Emit a real event stream** the Work Explorer can subscribe to, instead of
   file-watching state files and polling every 30 seconds.
3. **Move per-ecosystem and per-step knowledge into skills** (loaded on demand),
   instead of always-loaded instruction prose or — worse — framework modules.

The weakest version — rebuilding the session lifecycle *inside* the Agent SDK,
with subagents as the verification mechanism — should be rejected. It breaks the
two invariants the whole framework exists to protect: **cross-provider
verification** (subagents are same-provider by construction) and **engine
neutrality** (this repo deliberately runs Claude Code, Codex, Gemini, and Copilot
seats over one shared `AGENTS.md`; a Claude-SDK-shaped lifecycle orphans three of
the four seats).

The rest of this memo takes the questions in order.

---

## 1. What would the architecture look like?

The honest mapping of framework concepts onto harness primitives:

| Framework concept today | Agent-native counterpart | Fit |
| --- | --- | --- |
| Session (register → work → verify → close) | An agent session with lifecycle hooks (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`) | **Good** — hooks are the missing enforcement point |
| The approved plan + envelope (`compare_to_envelope`, set 144/145) | A `PreToolUse` hook on Edit/Write that rejects paths outside the declared envelope | **Excellent** — turns a post-hoc diff into a boundary check |
| Per-session instructions in `spec.md` + AGENTS.md prose | Skills: one per lifecycle verb (`/register`, `/affected`, `/verify`, `/close`) plus per-ecosystem evidence skills | **Good** — pay-per-use context instead of always-loaded |
| Cross-provider verification (`verify.py` dispatch) | Subagents | **Bad** — subagents run the parent's provider; see §5 |
| Verification rounds as opaque CLI calls | Background tasks with completion notifications | **Good** — operator can watch instead of waiting |
| `.dabbler/runs/` machine-written record | Harness transcripts/journals | **Bad as replacement, fine as supplement** — the record must stay router-written (ground rule 5) |
| Work Explorer watcher + 30s poll | Hook-emitted append-only event JSONL | **Excellent** — see §4 |

Concretely, the hybrid architecture would be:

- **`.claude/hooks/` (and per-engine equivalents)** — thin shell adapters, each a
  one-liner calling `python -m ai_router.<module>`:
  - `SessionStart` → `session start` (registration becomes impossible to forget,
    not merely required);
  - `PreToolUse` on file edits → `plan envelope-check <path>` (the set-145
    mechanism, enforced *before* the write instead of diffed after);
  - `PostToolUse` on test commands → `test_evidence observe` (the command that
    actually ran is captured mechanically — no honesty dependency);
  - `Stop` → `session close --dry-run` (the five gate rows appear at the moment
    the session thinks it is done).
- **`.claude/skills/`** — the lifecycle verbs and the ecosystem knowledge
  (`dotnet-evidence`, `java-evidence`) as SKILL.md packages. The managed
  `AGENTS.md` body shrinks to role + hard rules; the how-to moves to skills that
  load only when invoked.
- **`ai_router` unchanged in authority.** Hooks *call* it; nothing in the harness
  writes state or verdicts. If a hook is bypassed (different engine, no hook
  support), the router's existing refusals still hold — hooks are belt, router
  stays suspenders.
- **Session worktrees** — see §2 for where they genuinely pay off (verification
  snapshots), and where they don't (parallel sessions you don't run).

## 2. Could the session and task lifecycle be reconceived?

Reconceived, no. **Re-enforced, yes.** The lifecycle you converged on across 137
sets is already right, and it is engine-neutral prose backed by router refusals.
What the harness adds is *where* enforcement happens:

- Today every rule is enforced at a chokepoint the agent must walk through
  voluntarily (`verify` refuses without preverify evidence; `close` runs gates).
  The failure mode is wasted work between the violation and the chokepoint.
  Hooks move enforcement to the moment of violation: an out-of-envelope Write is
  refused *as a tool call*, with the amendment command in the refusal text. That
  is the set-145 envelope made real-time, at zero model cost.
- **Worktree-per-verification-round is the one genuinely new structural idea.**
  Set 141's quote contract re-reads quotes "from the reviewed tree by digest —
  never the worktree, which keeps moving." A shell task on worktree creation
  could materialize the reviewed snapshot as an actual read-only worktree per
  round, making "the tree the verifier saw" a filesystem fact instead of a
  digest discipline. Cheap (git worktrees are ~free), removes a whole class of
  moving-tree hazards, and deletes some digest-plumbing rather than adding
  beside it — which is the only kind of addition the envelope permits.
- Worktree-per-*session* is less compelling: the operator runs sessions
  sequentially, the state model enforces one in-progress set, and verification
  reviews the working tree by design. Don't build parallelism you don't use.

## 3. Would it modularize the infrastructure?

Yes, in one specific and valuable way: **skills give language- and step-specific
knowledge somewhere to live that is not a Python module.** Set 143's direction was
elimination, not pluggability — it deleted the AST graph rather than build a
language-provider registry. Skills complete that move: when .NET support needs
"how to read a JaCoCo/Cobertura report, what `dotnet test` evidence looks like,"
that's a SKILL.md the working agent loads for that step — prompt-side knowledge,
not framework code. The module count stays flat; the framework stays a
language-neutral evidence protocol; the ecosystems get first-class treatment.

It also modularizes the *instructions*: the guidance-overhead lesson (65k → 10k
always-loaded tokens, set 085) generalizes here. AGENTS.md carries identity and
hard rules; skills carry procedure, loaded per verb.

What it does **not** modularize: the router itself. Splitting `verify.py` along
subagent boundaries would be a worse cut than the extraction set 145 session 3
already owns. Don't let the harness dictate module seams.

## 4. Would tasks with a lifecycle make the Work Explorer more reliable?

**Yes, and this is the highest-value item on the list — and it doesn't even need
the agent infrastructure.** Today the extension watches state-file patterns with
`createFileSystemWatcher`, refreshes the whole projection on any event, and backs
that with a 30-second `setInterval` poll precisely because watchers miss things
(network drives, atomic renames, events during window reload).

The fix is a contract change, not a framework change: **every router lifecycle
transition appends one line to a single `.dabbler/events.jsonl`** — schema
version, monotonic sequence number, transition name, set/session/step id,
timestamp — and the router folds events into one **atomically-written projection
file** recording the last consumed sequence. The event log is the recovery
source; the projection is the cheap read model. The extension applies only
contiguous sequences; a gap, an unknown schema, or an extension-host restart
triggers one full re-projection from the log. Keep the 30-second poll, demoted
to slow reconciliation — extension-host restarts and CLI writes from outside the
IDE are real — but it stops being the correctness mechanism. Hooks make emission
*complete* (tool-boundary events the router never sees, like "agent started
editing"), but the router alone can emit every transition it owns today. Retries
follow the ledger's own ethos: a failed attempt is immutable and a retry is a
new attempt, so the Explorer renders attempt counts instead of overwritten
history.

Do this regardless of the verdict on everything else in this memo.

## 5. Would cross-provider verification get easier or more standard?

**No — and this is the load-bearing objection to the full agent-native rebuild.**

- Claude Code subagents run Claude models. A subagent-as-verifier is
  same-provider review, which the no-skip mandate exists to prevent. The Agent
  SDK's third-party support (Bedrock, Vertex) is *hosting* diversity, not
  *model-family* diversity.
- The one harness that genuinely offers cross-vendor models under one roof is
  the Copilot seat — which is exactly what `verify.py` already dispatches
  through. The current design (router-owned dispatch, transport-selectable
  `copilot-cli` | `api`) is already the standard form of this; an SDK rebuild
  would re-derive it with more dependencies.
- What the harness *can* improve is the ergonomics around the dispatch: run
  verification as a background task with a completion notification (the rounds
  already exceed foreground timeouts — this is current practice as a workaround,
  it could be the designed shape), and surface round progress into the same
  event stream §4 describes.

## 6. Would operators gain visibility and the ability to interject?

**For the working seat: you already have it** — the orchestrator *is* an
interactive engine session; transcript, thinking, interrupt, and plan-approval
are harness features you use today. Hooks add one real improvement: gate results
and envelope refusals surface *inside the session at the moment they matter*,
rather than when the agent chooses to run the chokepoint command.

**For the verifier: this is where the visibility gap actually is**, and the
answer is transport-bound. A verifier reached over `copilot-cli` is a one-shot
process; its reasoning arrives as a verdict document. Options, in ascending
cost: persist and surface the verifier's full transcript beside the round record
(cheap, do it); stream verifier output into the Explorer via the event stream
(moderate); make verification rounds interactive sessions the operator can join
(expensive, and interjection into a *verifier* is a channel the integrity model
should probably refuse anyway — set 086's lesson cuts both ways: an operator
whispering to the verifier mid-round is unrecorded influence on a verdict).
Visibility yes; interjection into verification, deliberately no.

## 7. Would it help .NET and Java solutions?

Modestly, and only via skills (§3). The heavy lifting was already done by set
143: declared test roots, declared globs, digest-pinned provenance, one report
reader per format behind an existing seam. The remaining .NET/Java gaps are
knowledge gaps ("what does good evidence look like in this ecosystem"), which are
exactly skill-shaped, and *harness* gaps only if the target repos' engines lack
hook support. The extension is ecosystem-agnostic already — it renders router
JSON and never parses source. No agent infrastructure required; don't couple the
ecosystem roadmap to it.

## 8. Would the extension become more fragile?

**If it takes a dependency on the Agent SDK — yes, materially.** Today the
extension's entire contract is `python -m ai_router.progress --json` plus file
presence; it survives engine churn, SDK churn, auth churn, and works identically
whether the session ran on Claude, Codex, Gemini, or a Copilot seat. Embedding
the SDK would couple its release cadence to a vendor's, add an auth surface, and
break the renderer/decider separation that Session 3 spent real effort
establishing (six TS ports of Python logic deleted; don't invite the seventh in
SDK form).

The fragility ranking of the primitives, for this repo's multi-engine reality:

- **Skills** — lowest risk. SKILL.md is converging into a cross-vendor
  convention; worst case it degrades to instructions an engine reads as prose.
- **Hooks** — medium. Every engine has *a* hook mechanism; none share a schema.
  You'd maintain thin per-engine adapters (the `AGENTS.md`-tail pattern, applied
  to shell). Acceptable because hooks are belt-not-suspenders: the router's own
  refusals remain the floor for engines without them.
- **Subagents / Agent SDK as lifecycle owner** — high, and it also violates §5.
  Decline.

## 9. Would it cost more?

**Tokens: roughly neutral to slightly cheaper, if you hold the line on fan-out.**
Hooks are shell — free. Skills *reduce* per-turn context versus always-loaded
prose. The real cost risk is cultural: agent-native architectures drift toward
"spawn a subagent for it," and every fan-out multiplies context re-transmission
— the same arithmetic that killed set 138's scoped bundles (~7.5× per round).
Under three currencies with no exchange rate (seat premium requests, API USD,
subscription window), the default posture stays: one working agent, one
verifier, deterministic checks first because they cost zero. Local agents add no
infrastructure cost; they spend the same scarce currencies from a different
wallet.

---

## What I would actually do

Ranked, smallest-regret first; the first two stand on their own even if the rest
is rejected:

1. **Event-stream contract for the Explorer** (§4). Router-emitted
   `events.jsonl`, extension reads deltas, poll deleted. No agent infra needed.
2. **Persist and surface verifier transcripts** beside round records (§6).
3. **Hook adapters as enforcement-at-the-boundary** for the set-145 envelope,
   registration, and close-gate preview — thin shells over existing router
   commands, per-engine, never authoritative (§1, §2).
4. **Skills for lifecycle verbs and ecosystem evidence**, shrinking the
   always-loaded body (§3, §7).
5. **Worktree-per-verification-round** as a materialized reviewed snapshot
   (§2) — the one place "shell task on worktree creation" earns its keep.
6. **Do not** move the lifecycle into the Agent SDK, use subagents for
   verification, or let the extension link the SDK (§5, §8).

The framework's rarest property is that its integrity model is *engine-agnostic
and machine-owned*. Every step above borrows harness leverage without mortgaging
that property. The full agent-native rebuild would trade it for ergonomics the
hybrid gets anyway.

---

## Postscript, after reading the Sol memo

`agent-native-architecture-sol.md` was written independently against the same
question. Where the two memos converge — hybrid over SDK rewrite, kernel/router
keeps sole authority, durable events plus a projection for the Explorer, skills
for ecosystem knowledge, hooks as accelerators never as evidence, one editing
agent as the default, verification as a provider-neutral job over the existing
transport seam — treat the agreement as signal: two providers reached the same
load-bearing conclusions from the same tree.

**Adopted from Sol into this memo** (folded into §4 above): the atomic
projection file beside the event log, contiguous-sequence application with full
re-projection on any gap, the poll demoted to reconciliation rather than
deleted, and immutable attempts (retry = new attempt). All four are better
engineering than my first draft, and Sol's phase-0 proof — *the Explorer
survives restart, missed events, an outside-IDE CLI write, and a truncated
event without displaying false state* — is the right acceptance test for item 1
of my do-list. Sol's phased proofs and kill criteria are also the right
discipline for anything past items 1–2.

**Where I would trim Sol.** The generic task protocol — `dabbler task create /
start / checkpoint / pause / resume`, a five-role agent taxonomy, a universal
task state machine — is a second ontology laid *beside* sessions, steps,
rounds, and evidence records. The envelope's own surviving rule applies to
architecture as much as to modules: a new layer earns its existence by making
existing plumbing smaller. Sol's memo contains the seed of the smaller version
in its own observation that `step-execution.jsonl`, `rounds.jsonl`, test
evidence, and disputes *are already event-like*: standardize their **common
envelope and projection** first, and let a generic task surface be extracted
later only if the specialized records demonstrably keep re-implementing it.
Start with the envelope over existing record types, not with a new command
vocabulary that every existing concept must be re-mapped onto. Likewise the
role taxonomy: today's model has two parties with real authority boundaries
(working seat, verifier) plus the kernel; planner/investigator/implementer are
prompt shapes, not authority boundaries, and belong in skills rather than in
the protocol.

**One reframe both memos underweighted.** The operator's observed economics —
rebuilding this framework takes hours while enhancing it takes days — inverts
the classic rewrite risk calculus, because with AI-led development the cost of
a rebuild is proportional to the clarity of the *specification*, not the volume
of code. v2 itself was born that way: the compatibility contract and module
inventory existed first, and the code followed in hours. If that holds, the
durable artifact to invest in is the **model** — the state machine, the event
envelope, the verification job schema, the diagrams as normative documents —
authored and agreed *before* any code changes, so that the kernel can be
rebuilt against it rather than migrated toward it set by set. The record
formats under `.dabbler/runs/` and the integrity invariants are the
compatibility contract a rebuild must honor byte-for-byte or via a one-shot
migrator; everything else is regenerable. That decision belongs where the
v3 pipeline decision already lives — after the current sequence's kill gates,
not beside them.
