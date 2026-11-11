# Framework issues log

A running log of Dabbler AI Orchestration framework issues encountered
while driving sessions in this repository -- unclear instructions,
impasses, or mismatches between what an instruction says and what the
CLI actually accepts. Append an entry per issue as it is found; do not
edit or remove earlier entries.

## Session 1

### `session report` cannot answer a `plan`-schema step as `blocked`

The Session 1 "plan" instruction (`kind: step`, `step_id: plan`,
`answer_schema: driver-work-plan.schema.json`) carries an `ask` --
verbatim from the bootstrapped `docs/sessions/session-plan.md` -- that
says: "With neither [a prompt-supplied brief nor
`docs/planning/brief.md`], report this step `blocked` naming that path,
so the session stops here before any work."

In practice, `dabbler session report` refuses that path for this
instruction. Its `--step`/`--status blocked` form is only accepted when
the outstanding instruction's `answer_schema` is `driver-report.schema.json`;
for any other schema (here, `driver-work-plan.schema.json`) it demands
`--answer-file`, and the work-plan schema itself has no `blocked` member
-- only `task`, `hold_release`, `non_goals` and `steps`. So there is no
mechanical way to record "blocked, no brief" for the plan step as the
instruction text describes.

Separately, the extension's own bundled `PLAN_PROMPT` text (used
elsewhere in the same build) gives different guidance for this exact
situation: "ask them what the solution is ... Ask when the repository
and your prompt do not already answer those questions." That matches
what an interactive CLI agent can actually do.

**Resolution used this session:** asked the human operator directly, via
the CLI's interactive question tool, for the brief's substance (purpose,
users, must-do, out-of-scope, success criteria, existing notes), then
proceeded to author the plan from that answer instead of mechanically
blocking. Recommend either updating the bootstrapped session-plan text
to describe asking the operator instead of "report this step blocked",
or adding a `blocked` affordance to the work-plan schema/report verb so
the documented behavior is actually reachable.

### `dabbler modules create .` names the solution file `..slnx`

Running `dabbler modules create . --slug person-model ...` (workspace
root passed as the literal string `.`, matching this session's own
current directory) wrote a solution file literally named `..slnx` at
the repository root, instead of `csv-parser.slnx`. The tool derives the
solution's file name as `` `${basename(root)}.slnx` `` from the raw
`workspace_root` argument rather than its resolved absolute path;
`path.basename('.')` is `.`, so the file became `. + .slnx` =
`..slnx`. Passing the absolute repository path instead of `.` for every
later `dabbler modules create` call avoided repeating this. Recommend
resolving `workspace_root` to an absolute path before deriving the
solution's file name.

**Resolution used this session:** renamed the file to `csv-parser.slnx`
by hand, then used the absolute repository path (not `.`) for every
subsequent `dabbler modules create` invocation.

### The pre-existing `origin` remote is a web URL, not a git endpoint

At session land, `git push` (run internally by the router) failed with
`fatal: unable to update url base from redirection`, redirecting to a
Microsoft/Azure sign-in page. `git remote -v` showed `origin` set to
`https://dev.azure.com/CTDPH/CT.DPH-AI-Training/_settings/repositories?repo=<repo-guid>`
-- the Azure DevOps web settings page for the repository, not its git
clone endpoint. This predates this session; it was not something any
step in this session's plan set. The correct endpoint, confirmed with a
read-only `git ls-remote` before changing anything, is
`https://dev.azure.com/CTDPH/CT.DPH-AI-Training/_git/<repo-guid>`. The
remote's `master` also shares no history with this repository's local
`master` (`warning: no common commits` on fetch) -- it held only a
single auto-created `Added README.md` commit from when the Azure Repos
project was provisioned.

**Resolution used this session:** `git remote set-url origin
https://dev.azure.com/CTDPH/CT.DPH-AI-Training/_git/<repo-guid>`, then
`git merge origin/master --allow-unrelated-histories` to bring in the
pre-existing `README.md` without discarding either history, then pushed
normally. Recommend this repository's `origin` remote be corrected at
the source (wherever it was provisioned from) so a future clone or
fresh session does not meet the same redirect.

### `session next` deadlocks in `close` after `session close` is run directly

After satisfying the close gates by hand (`git push
--set-upstream`, `dabbler verify`, `dabbler test-evidence record`, a
manual `git commit`/`git push`), this session ran `dabbler session
close` directly rather than `dabbler session next` -- both are
documented verbs, and the close output confirmed success: `close:
session 001 of sessions closed (VERIFIED).` `dabbler status` afterward
correctly showed session 1 as `"status": "complete"` with
`"verificationVerdict": "VERIFIED"` and `"currentSession": null`.

However, every subsequent `dabbler session next` call still resumed
`.dabbler/runs/s1/driver/run.json`'s stale `phase: "close"` and retried
a close job, which now failed with `no session is in flight under
docs/sessions (status=None)` -- true, because the direct `session
close` call had already closed it -- and the second identical failure
was reported as a `DEADLOCK`. The driver's own run ledger and the
higher-level session ledger (`docs/sessions/sessions.json`) desynced:
the direct `session close` verb updated the latter but left the
former's phase pointer stuck, so `next` kept re-entering a job whose
precondition its own sibling verb had already satisfied. Per this
project's hard rules, the record is never hand-edited to get past a
stop, so this session did not touch `run.json`; it stopped calling
`next` once the loop repeated the identical deadlock, since running it
again unchanged was documented to reach the same point again.

**Resolution used this session:** treated session 1 as done on the
strength of `dabbler status` (`complete`, `VERIFIED`) and this log entry
instead of a clean `done` from `session next`, and did not start
session 2 (the operator's instruction was to run `session start` only
once). Recommend `session close`, wherever it is invoked from, also
advance or clear the driver's own `run.json` phase so `session next`
recognizes the session is already closed instead of retrying the close
job. Until fixed, prefer letting `dabbler session next` drive the close
gate to completion (as its own refusal messages direct: "Satisfy the
gate the close named, then carry on: `dabbler session next`") rather
than invoking `dabbler session close` directly once gates have failed.

## Session 3

### A package-kind module's contract notes page is required, but nothing visible said so

Both work steps of this session (`scaffold-person-model`,
`pack-person-model`) were accepted, verification passed, and the
`dotnet` suite ran green -- then the run-of-record's own `candidate:
person-model` job failed with: "module 'person-model' declares
contract: package and has no notes page at
modules/person-model/contract/README.md". Nothing before that refusal
said this file was required:

- `docs/modules.yaml`'s `person-model` entry declares only `kind:
  shared-types`, `codeRoots` and `package: person-model` -- no
  `contract:` key at all. "Declares contract: package" is inferred
  purely from the presence of `package:`, not written anywhere a
  session reads before packing.
- `docs/sessions/session-plan.md`'s Session 3 text (and the work plan
  this session declared from it) names exactly two deliverables --
  the `.csproj`/`Person.cs`/`.slnx` registration, and `dabbler module
  pack person-model` -- and says nothing about a contract page.
- `dabbler module pack --help` does not mention a required notes page
  either; the refusal comes from `dabbler module candidate`, a
  different verb the run-of-record phase calls internally, not
  something either step's `ask` named or that this session ran by
  hand before the candidate job did.

So there was no instruction, module declaration, or CLI help text that
told this session to author the contract page before packing; the
requirement surfaced only as a late, reactive runtime refusal after
both work steps had already been accepted as done.

**The file already existed -- just outside this session's checkout.**
`git log -- modules/person-model/contract/README.md` shows it was
created in Session 1 by `dabbler modules create` (the same placeholder
template as csv-import's and person-store's). But `git sparse-checkout
list` for this session's focused checkout named
`modules/csv-import/contract`, `modules/csv-parser/contract` and
`modules/person-store/contract` -- every sibling's contract folder --
while omitting `modules/person-model/contract`, the module's *own*.
Because the file was outside the checkout's cone, it was invisible on
disk; this session re-authored it from scratch rather than discovering
and filling in the one already committed. Recommend the focused
checkout always include a module's own contract folder alongside its
siblings', and recommend `dabbler module pack`/`modules create` state
in their own `--help` text (and ideally in the session-plan step text a
package-kind module's session generates) that a `package:`-declaring
module needs `modules/<slug>/contract/README.md` before its first pack.

**Compounding risk -- writing outside the sparse-checkout cone silently
does not commit.** Because the path was outside the cone, `git add
modules/person-model/contract/README.md` printed "will not be updated
in the index" and skipped it rather than erroring loudly. That silent
skip is what produced this session's `land`-phase deadlock: the
framework's own tree/candidate check saw the file's on-disk content
(digests are read from the filesystem), but git's index -- what a
commit actually captures -- did not, so "the tree is not the tree the
run of record tested" kept recurring no matter how many times the
candidate or run-of-record job re-ran.

**What missing the contract page risks, in general:** a `package:`
contract's whole point is that a consumer reads the notes page instead
of the implementation -- `csv-import`, `person-store` and `csv-parser`
each only see `person-model` as a packed `.nupkg`, never its source.
Without the notes page, a consumer has no documented promise to code
against beyond the bare C# signature (property names and types),
so: (a) a consumer might depend on undocumented behavior the
signature cannot express (e.g. whether `DateOfBirth` can be a future
date, whether the properties are safe to mutate after construction)
that a later `person-model` change could break without it counting as
a breaking change on paper; (b) the "kept on purpose" / "not promised"
split that protects an implementation's freedom to change has nothing
written down, so any refactor of `Person` risks looking like a break to
whichever consumer guessed wrong; and (c), mechanically, `dabbler
module pack`/`candidate` simply refuse for a `package`-kind module
until the page exists, so the module cannot be packed or consumed by
its dependents at all -- this is a hard stop today, not a
documentation nicety.

**Resolution used this session:** authored
`modules/person-model/contract/README.md` from the solution plan's
already-written person-model contract paragraph (Session 1's
`docs/planning/solution-plan.md`), matching the placeholder's section
headings, then added `modules/person-model/contract` to this
checkout's sparse-checkout cone (`git sparse-checkout add`) so `git
add` would actually stage it, then re-ran `dabbler module candidate
person-model --session 3` and `dabbler test-evidence run --suite
dotnet --stage final-full` until the run-of-record's own digests
matched what the tree currently held.
