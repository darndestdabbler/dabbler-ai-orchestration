# Design consult, round 7: the objective is to stop the AI reading code it does not need — what is the wall, really?

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams**. Round 6
(you both answered it) settled the repository shape. This round reopens
one question underneath it, on the operator's instruction, and asks you to
think past the answers already given.

You have NO tool access. **Every claim you make about this repository must
cite a path or a number from this brief. Mark any claim you cannot ground
here as ASSUMPTION.** Do not invent paths.

---

## The governing rules (unchanged)

- **(a)** What *really skilled human developers* would do — not an ideal
  AI-designed system. The framework is judged against the practice it
  replaces.
- **(b)** The PowerPoint test: if it needs Visio, developers reject it.
- **(c)** Simpler, more reliable, more performant over complex.
- **(d)** Lower AI cost, but *human developer time outranks AI time*.
- **(e)** The customer is a .NET or Java team.
- **(f)** Get informed input, then decide; do not wait.

The lesson behind it all: **over $6,000 in tokens** on this repository,
attributed to AI working in oversized contexts.

---

## Where round 6 left it

Both of you rejected one-long-lived-branch-per-library and recommended a
monorepo with a directory per module (`modules/<slug>/`), a solution plan
first as a reviewed hypothesis (`docs/planning/solution-plan.md` +
`docs/modules.yaml`), sibling modules consumed as packages from a local
feed under immutable dev versions, module-scoped sessions, bundling
recorded in `release/<bundle>/bundle.yaml` and never executed. You split on
one thing: Sol put a **framework-made sparse worktree per module** first
("the current verifier only counts out-of-scope reads rather than
preventing them"); Gemini put **`.slnf` plus framework-enforced scope**
first and called sparse checkout over-correction ("do not bend git to solve
an AI context window problem"). The orchestrator recorded: build both, rule
first (`docs/design/consults/round6-synthesis.md`).

Two follow-ups since, from the operator:

1. *"You could commit the NuGet package or jar."* The orchestrator agreed
   it is a better default than a gitignored feed for small library packages
   (clone-and-go; the framework, never a person, rebuilds and commits at
   the land; immutable, sortable dev versions; one tracked folder in the
   package manager's hierarchical layout; a size ceiling with LFS above
   it). csv-model's package is ~5 KB.
2. *"There would be no way to rebase/archive old artifacts?"* Answered:
   history rewrite is possible but rare and breaks every SHA the
   framework's record cites; LFS archives without rewriting; a
   blob-filtered partial clone makes old blobs a server-only cost.

## The operator's reframing, verbatim

> Before we commit to a particular approach, let's consider the objective:
> **we want to prevent AI from reading more code than it needs to read.**
> If we give it artifacts, rather than code, that should help, but **what
> if the code is in a child directory in the repo. That might not work so
> well.** So, let's think outside the box on this one.

Read that carefully. Artifacts serve the *compiler*; they do nothing to a
*reader* if the sibling's source is on the same disk. The question is what
the engine can read, what it reads when it wants to know how a sibling
behaves, and what the framework can see or stop.

---

## What is true today, with paths and numbers

**Two readers.** The **engine** (Claude Code, Codex, Gemini CLI, Copilot
CLI) works in the developer's checkout under the pull loop
(`dabbler session next`); the framework issues instructions and judges
reports, and **never mediates the engine's reads**. The **verifier** is the
framework's own process: it is granted `list`, `search`, `read` tools with
a scope and a read budget, and every call is *recorded* with `in_scope`
and a fidelity grade — recorded, not refused (`packages/router/src/agency.ts`,
`recordForRound`, `readFidelity`, `inScope`). A round's record looks like
`reads: 28, out_of_scope: 0, transformed_reads: 1, fidelity_measurable:
true` (session 99, `.dabbler/runs/s99/rounds.jsonl`).

**What the engine leaves behind (measured on this machine, today).**
Claude Code writes one JSONL transcript per session, live, under
`~/.claude/projects/<project-slug>/<session-id>.jsonl`. Every tool call is a
`tool_use` record with `name` and `input`: a `Read` carries
`{"file_path": "d:\\Projects\\csv-model\\docs\\framework-notes.md"}`; a
`Bash` carries `{"command": "..."}`; each record carries the session `cwd`.
In the orchestrator's own session writing this brief, the tool counts were
**Bash 137, Edit 57, Write 10, Read 6** — the shell, not the Read tool, is
how most file content reached the model, and a shell read is visible only
as command text (`cat`, `sed -n`, `grep`, `node -e "...readFileSync..."`).
So an after-the-fact audit of "which files did the engine read" is
possible for Claude Code and must parse shell commands to be honest.
[Claude Code's path-scoped permission rules: see the confirmed facts
appended at the end of this brief.] Codex, Gemini CLI and Copilot CLI:
see the same appendix; assume weaker or no path-level read control.

**Git facts.** `git sparse-checkout` (cone mode) removes the excluded
directories from the worktree; they are not hidden, they are absent. A
partial clone (`git clone --filter=blob:none`) keeps file contents off the
local object store until a checkout needs them, so an excluded module's
source is not on the machine at all until something fetches it. Sparse
patterns are per-worktree, so one repository can hold a full checkout for
a human and a sparse worktree per module for sessions.

**Contract surfaces exist as tools.** .NET: `Microsoft.DotNet.GenAPI`
generates C# reference source (the public surface, no bodies) from an
assembly, and `Microsoft.CodeAnalysis.PublicApiAnalyzers` maintains
`PublicAPI.Shipped.txt`/`PublicAPI.Unshipped.txt` listings in the tree —
**ASSUMPTION** on exact package ids. Java: `javap -public` prints a class's
public surface; doclets can render an API listing. This repository already
has a `contractdoc` verb — "render a module's contract from its
declaration" (`packages/router/src/contractdoc.ts`) — and the old six-step
workflow's `contracts` step, both waiting to be repointed (round 5–6).

**The multi-repository shape exists and is expensive today.** The four
csv repositories each needed a bootstrap, a plan and a session series;
csv-model alone took six sessions for one class. The mechanisms to make N
repositories cheaper exist: the plan's `repositories` member places sibling
repositories declaring solution membership (`packages/router/src/drive.ts`
~line 1624), `dabbler deps scaffold/clone/locate`, `solution-dependencies.json`
(`packages/router/src/solutionDeps.ts`), and `dabbler workspace`, which
writes one VS Code workspace over every repository in a solution.

**Session scope today.** A step's report is measured against the files
the plan listed (`judgeReportFiles`, `drive.ts`); the verifier's scope is
the changed files plus what they import first-order plus the spec
directory (`sessionScope`, `agency.ts`). Nothing names a module.

---

## The questions

### Q1 — Is "reads" the right thing to bound?

The cost is tokens in context, and the reads that matter are the ones that
put a sibling's *source* into the model's context. Restate the objective in
the terms you would actually measure: files read outside the module, bytes
of source outside the module, tokens, tool calls? What does a skilled team
do today to keep an AI assistant on one part of a system — open only that
project, a `.slnf`, a separate repository, a prompt? Be honest about how
much of the $6,000 a wall would have saved versus how much was the engine
re-reading the module it *was* working on.

### Q2 — The layers, ranked

Four candidate layers, each attacking a different thing:

1. **Nothing to read on disk** — a framework-made sparse worktree per
   module over a blob-filtered partial clone. Sibling source is absent.
2. **Something better to read instead** — a generated, committed public
   surface per module (`modules/<slug>/contract/`: GenAPI stubs or a
   `PublicAPI.txt`; `javap`/doclet output for Java), regenerated at every
   land, a few percent of the source in tokens, diffable in a pull request.
   The guidance and the verifier point an engine here when it needs a
   sibling.
3. **Measure what was read anyway, and deny where the engine allows** —
   the framework parses the engine's transcript after a session (Claude
   Code today), counts reads outside the module including shell reads,
   reports at the close or refuses over a budget; path-scoped deny rules
   where the engine supports them.
4. **The verifier refuses, not counts** — `agency.ts` out-of-scope reads
   become refusals in the framework's own process.

Rank them by effect on tokens per ceremony cost under rules (a)–(e). Which
is theatre? Which pair is enough? Is there a fifth we have not named — a
container or dev-container with only the module mounted; an engine run as
a user that cannot read sibling paths; a read-through proxy filesystem;
something else a team already uses?

### Q3 — The contract surface

Is a generated public surface the right artifact for an AI to read in place
of source? What must it carry beyond signatures — XML doc comments,
behavioural notes, examples, the module's own tests as executable
contract? Generated at the land and committed, or generated on demand into
the worktree and never committed? How does a Java team get the same thing
without a bespoke tool? Where does this leave the framework's existing
`contractdoc` verb?

### Q4 — Does the package need to be *on disk* at all?

If the engine reads the contract and the compiler needs the package, the
package can come from anywhere the package manager restores from. Does the
committed-package answer from the follow-up change once the wall is the
worktree plus the contract — is a gitignored local feed, a committed
folder, or a plain package cache the simplest thing that works for a
focused worktree on a second machine and in CI? Say which, and why, in
terms a .NET team lead would accept.

### Q5 — Separate repositories, reconsidered against the restated objective

A library in its own repository is the wall every team already trusts,
and it needs no git feature. The trial's cost was the framework's
per-repository ceremony, not git's. If a solution-level bootstrap created
N repositories from the solution plan, `dabbler workspace` opened them as
one, and a session named a repository the way it would name a module, what
would remain worse about N repositories than a sparse worktree? Cross-module
changes, version pinning, atomic commits across a contract change — weigh
them honestly for a 3–10 module solution. Is the answer different for a
team of one (the operator) and a team of four?

### Q6 — The exception

Some work spans two modules: a contract change above all. How is that
declared so it is visible and rare — a session that opens two modules, a
worktree with two sparse paths, a plan `modules: [a, b]` member — and what
stops it from becoming the default?

### Q7 — Measurement across engines

Claude Code's transcript makes an audit possible. What is the equivalent
for Codex (rollouts under `~/.codex/`?), Gemini CLI and Copilot CLI —
**ASSUMPTION** where you are unsure. If only one engine is auditable, is
the audit worth building, or does the framework instead measure the one
thing every engine exposes — the tree it changed and the files its plan
listed — and let the worktree do the rest?

---

## What to answer

For Q1–Q7: **Soundness** (with a cited path or number per claim), **Risk**
(the failure you would bet on), **Recommendation** (one, concrete, small
enough to build). Then, once:

8. **One recommended design**, as the slides you would show a .NET team
   lead — five bullets at most — replacing or amending round 6's five.

9. **The change to round 6's session list** (1 solution plan + manifest;
   2 module-aware config; 3 module-scoped sessions; 4 immutable local
   packages; 5 drift and restore; 6 focused workspace; 7 local-byte gate +
   bundle recording; 8 Maven parity + secondary mode): what is added,
   removed, reordered, and which orderings are real dependencies.

10. **The disagreement.** Where round 6's synthesis was wrong, where the
    operator's reframing is wrong or right, and where you expect the other
    reviewer (one of you is a GPT model, the other Gemini) to be wrong.

Be direct. The operator has asked for review, not endorsement.

---

## Appendix — engine-side facts, confirmed against the vendors' documentation today

**Claude Code.** `permissions.deny` rules in `settings.json` can deny the
Read tool by path pattern, gitignore-style, e.g. `Read(./modules/bar/**)`;
anchors are the working directory (`path`, `./path`), the settings file's
root (`/path`), home (`~/path`) and the filesystem root (`//path`). Read
and Edit deny rules also apply to the file commands Claude Code recognises
in Bash — `cat`, `head`, `tail`, `sed` — and to shell redirections, but
**not** to an arbitrary subprocess that opens files itself (a `node -e` or
`python` script). A separate setting,
`permissions.blockReadsOutsideWorkingDirectories`, blocks reads outside the
primary working directory plus any `additionalDirectories` — a
working-directory wall, not a per-path rule. Transcripts: JSONL under
`~/.claude/projects/<project>/<session-id>.jsonl`, written continuously,
default retention 30 days (`cleanupPeriodDays`); the entry format is
documented as internal and subject to change between versions, and the
documented interfaces are `/export` and `claude -p --resume --output-format
json`. (Measured on this machine: the entries do carry `tool_use` `name`
and `input`, including `file_path` and `command`.)

**Copilot CLI.** `--deny-tool="read(...)"` exists, and a filed issue
reports it blocks all reads regardless of pattern; no persistent
path-scoped profile for non-interactive use. **Codex CLI.** Permission
profiles and `--sandbox` govern writes; no documented path-scoped read
denial. **Gemini CLI.** `.geminiignore` hides files from discovery only; a
file named explicitly is read; a policy proposal exists and is not
implemented.

So: Claude Code can be walled by rule (per path, or by working directory);
the other three cannot today, and the only wall that holds for all four is
what is on the disk they run in.
