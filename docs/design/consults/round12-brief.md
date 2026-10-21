# Design consult, round 12: the wall without hooks — the scope handed over once, the CLI's own permissions, and nothing else

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams on GitHub
Copilot seats first, Claude Code second**. Round 10 moved the wall between
an AI engine and a sibling module's source from the disk (a sparse clone
per module session) to permissions over a regular checkout. Round 11
(`round11-brief.md`, `round11-synthesis.md`) made the permission a hook the
framework owns in front of the CLI's own tools, built to fail open, and it
was planned as sessions 125–129. Session 125 ran this morning and is
closing as this brief is written. **The operator has now read the plan for
126–129 and rejected its weight.** This round asks what the *minimum* is.

You have NO tool access. **Every claim about this repository must cite a
path or a fact from this brief; mark anything you cannot ground here as
ASSUMPTION.** Where a CLI behaviour is marked *not measured*, name the
probe rather than asserting it.

---

## The operator's words this morning, verbatim

On reading session 125's plan text — *"the module's codeRoots, its own
contract folder and every transitive dependency's, the root build files and
solution file, its shared files, and the sessions directory — never a
sibling's codeRoots"*:

> I was thinking that it would be better just to soft enforce everything.
> When you have contracts and codeRoots ... I wonder if we have
> overengineered this.

After the orchestrator explained the scope and recommended dropping the
pre-hook:

> I am mainly concerned about making the code reliable and simple. I think
> that if the first thing that AI does is call a framework command that
> returns the list of permissions for the current session, then I think
> that would be sufficient (in combination with built-in permissions for
> the AI models). If this means that we no longer need hooks that might
> not be reliable anyway, that's fine. As soon as I saw the word "canary"
> — I immediately saw this as overengineering. When I ask for something
> simple, it always ends up being 5 times as complicated as it should be.

And, an hour later, watching session 125 run:

> There are enough issues with basic functionality to warrant keeping
> things simple. For example, Session 125 is on the last Work Step. I had
> to refresh the Work Explorer manually to see that the last step was in
> progress. Also, the Dabbler Terminal doesn't output the work step.

The priorities from round 11 still hold and still rank: **(1) never an
impasse, (2) never a burden of decisions on the human, (3) simple, (4) then
as much blackboxing as those three allow.** Beneath them: what skilled
human developers would do; the PowerPoint test (can the design be drawn on
one slide); human time outranks AI time; a one-module solution keeps
working exactly as today. Read this round's questions with one more rule
the operator has just added in effect: **a mechanism the CLI vendors
already provide beats one the framework builds, and a mechanism the
framework has to attest beats nothing only if the attestation is free.**

---

## What exists after session 125 (2026-09-08), with paths

1. **The scope, derived.** `moduleScope(repoRoot, sessionsDir, shape,
   slugs)` in `packages/router/src/agency.ts` ~296: for each module the
   session names, its `codeRoots` from `docs/modules.yaml`, its own
   contract folder `modules/<slug>/contract/` (`checkout.ts` `contractDir`)
   and every transitive dependency's, the root build files and solution
   file, its declared shared files, the committed package feed directory,
   and the sessions directory (the verifier reads it). Never a sibling's
   `codeRoots`. About 35 lines over data the solution already carries for
   packing and the impact plan; it is not new and not in question.
2. **The policy record (session 125, step 1).** `packages/router/src/
   policy.ts`: `ModulePolicy` — `allowed` (the scope), `protected`
   (`docs/sessions/sessions.json`, `activity-log.json`, `docs/modules.yaml`,
   `.dabbler/runs`, `.dabbler/solution`), `siblings` (slug, roots,
   contract folder), `destructive` (regex strings for `git push --force`,
   `git reset --hard`, `git checkout -- .`, `git clean -f`, recursive
   deletion of the root). Written to `.dabbler/runs/s<N>/policy.json` at
   `declare` and at `start --module`; **nothing for a one-module shape**.
3. **The decision function (step 2).** In `policy.ts`: given the policy
   and one call (tool name, path or command), allow or deny with a
   structured reason. Three rules: out-of-scope or protected write → deny;
   destructive command → deny; sibling implementation read → deny softly,
   naming the owning module, its contract folder and a self-grant verb.
   Missing policy, malformed call, unknown tool → allow, marked
   `unobserved`.
4. **The scope on the first instruction (step 3).** The first `step` of a
   module session carries `scope` as a field of the instruction JSON
   (`schemas/driver-instruction.schema.json`, `drive.ts`, `session.ts`), and
   `dabbler session scope` prints it on demand (`cli/session.ts`). **This is
   the operator's "first thing the AI does" already built.**
5. **The Stop hook, and what it taught.** Bootstrap installs a Stop hook
   into `.claude/settings.json` (`bootstrap/index.ts` ~320) whose command is
   `dabbler session hook-stop`; its rule is `stopGateDecision` in
   `session.ts` ~2522: while a `step` or `rejection` is outstanding the turn
   is blocked and the model is told to answer it. **Measured today, again:**
   the hook keys on the repository, not the driving process, so a second
   Claude Code chat opened in the same checkout to *discuss the design* was
   blocked on every end of turn for the whole of session 125 and had to
   hold its own turn open with a polling loop to avoid becoming a second
   caller of `next`. The hook has no `stop_hook_active` guard and no
   session-id check. Copilot has no equivalent installed today.
6. **The pull loop.** `dabbler session next` returns `step`, `rejection`,
   `wait` or `done`; the engine reports each step with `dabbler session
   report --files <every file changed> --notes …`; the framework hashes the
   tree before and after a step's own checks (`dabbler.yaml`
   `testing.suites`), and a tree that moved under a check refuses the
   report. Three refusals of one step stop the session (`AGENTS.md`). **The
   report already names every changed path and the framework already
   diffs the tree**, so a path outside the scope is knowable at report
   time without any hook.
7. **The close gate.** `judgeExposure` in `packages/router/src/land.ts`
   231–249 refuses on two clauses: sibling bytes present under no recorded
   grant (the clone's clause, meaningless in a regular checkout) and paths
   changed outside the session's scope (the clause everyone agrees stays).
8. **The clone and its apparatus, still present:** `checkout.ts`, the
   bytes half of `exposure.ts` and the module-session marker, `module
   open|preflight|grant|revoke`, `session next --request-grant`, the
   debugging overlay (`layDebugGrants` in `ecosystem.ts`), the extension's
   **Open Module** and **Widen for Debugging** commands. Round 11 said
   delete, whole, in session 128. Start Session in the extension still
   opens the focused clone rather than the repository root.
9. **Two basic-functionality defects seen today** (item 5's second and
   third quotes): the Work Explorer did not repaint when the driver
   issued the last step and had to be refreshed by hand (a projection
   cache keyed without the driver's `run.json` was fixed once before, in
   session 110, and this is either its return or a sibling); and the
   Dabbler Terminal printed no line for the step at all. Neither is on any
   plan.

## What the CLIs provide without a hook (from the vendors' references, round 11)

**Claude Code 2.1.263.** `permissions.allow/deny` in `.claude/settings.json`
(tracked) or `.claude/settings.local.json` (gitignored), with path-globbed
`Read(...)`, `Edit(...)`, `Write(...)` rules and `Bash(prefix:*)` rules;
**deny rules win over allow rules**. `--dangerously-skip-permissions` is what
the framework's headless driver passes today (`engines.ts` ~160); *not
measured* whether deny rules hold under it. `--bare` skips hooks. The
framework has only ever set `blockReadsOutsideWorkingDirectories`
(`checkout.ts` ~303).

**GitHub Copilot CLI 1.0.83.** Static permissions: `shell(command:*?)`
(exact command or first-level subcommand, `:*` prefix), `write(path?)`
(trailing-component match; absolute path to pin), MCP and URL kinds.
**There is no `read(path)` kind.** `--allow-tool` / `--deny-tool` on the
command line; "denial rules always take precedence over allow rules, even
`--allow-all-tools`". *Not measured*: whether `--deny-tool` rules can be
placed in a repository file rather than argv (`~/.copilot/config` is
per-user), and whether `write(modules/model/src)` matches a directory or
only a trailing filename component. Hooks: `.github/hooks/NAME.json`,
fail-closed on non-zero exit, fail-open on timeout, bypassed by
`--allow-all-tools`; adjacent bug reports #3874 (a `preToolUse` denial not
honoured in the VS Code chat extension) and #2540 (plugin hooks not
firing). Per-hook cost measured on the operator's machine: 0.25–0.7 s,
the shell start.

## The design the operator proposes, restated by the orchestrator

1. The first instruction of a module session carries the scope; `dabbler
   session scope` prints it again. (Built.)
2. The framework writes the CLI's **own** static permission rules for the
   session's module — deny writes under each sibling's `codeRoots`, deny
   writes to the protected paths, deny the destructive shell prefixes — in
   whatever per-machine, gitignored place each CLI reads, at session start,
   and removes them at the close. No script of the framework's runs inside
   a tool call.
3. Reads are not enforced. The engine is told what is in scope and why a
   sibling's contract is the thing to read; a sibling read is at most
   flagged by the verifier as out of scope, as `rounds.jsonl` already does.
4. The one hard check stays where it already is, and moves earlier: the
   `session report` of a step whose changed paths include a path outside
   the scope is **refused with a reason** naming the module that owns the
   path and its contract folder — the same rejection path every other
   failed check uses, so the engine hears it while it can still act. The
   close keeps the changed-path clause as the backstop.
5. No pre-hook, no turn-end transcript scan, no canary, no coverage word,
   no self-grant verb, no `policy.json` beyond what step 4 needs. The
   Stop hook is the only hook, and it is fixed to fire only for the
   driving process (or not at all, if that cannot be done simply).

The orchestrator's own doubt, for you to settle: item 4 refuses at report
time, which is after the engine has already edited the sibling's file. Is
that an impasse (priority 1) or the ordinary rejection loop (an edit the
engine reverts in one move)? And does item 2 pull its weight at all, or is
"told, and refused at the report" enough?

---

## The questions

**Q1 — Sufficiency.** Is "scope handed over first + the CLI's own static
deny rules + refusal at the report" sufficient for the operator's four
priorities, for a .NET or Java team on Copilot seats? Name the failure you
would bet on under each priority, and whether anything in rounds 10–11 that
this drops (pre-hook, transcript scan, canary, coverage, self-grant) was
buying something a customer would notice in the first three months.

**Q2 — The CLI's own permissions, exactly.** For each CLI, the exact rules
the framework should write for a session on module `persister` in a
solution `{model, persister→model}`: which kinds, which paths, which file
or argv, and whether it can be gitignored and per-session. Where the
vendor reference (above) leaves a gap — Copilot's `write(path)` semantics,
rules in a file vs argv, Claude Code deny under
`--dangerously-skip-permissions` — name the probe. Then say plainly whether
step 2 of the proposed design is worth its two writers, or whether the
report-time refusal alone is the simpler equal.

**Q3 — Reads.** With no hook, a sibling's implementation is readable. Is
"told, not enforced" acceptable at priority 4, given that the contract is
what the sibling *publishes* and the package seam (`PackageReference`,
never `ProjectReference`) already makes compile-time coupling impossible?
What, if anything, should the record say about sibling reads — the
verifier's out-of-scope flag as today, a count from the CLI's own session
log read once at the close (Copilot `events.jsonl`, Claude Code's
transcript — a file read, not a hook), or nothing? Would you drop read
blackboxing from the first release entirely?

**Q4 — The report-time refusal.** Specify it: which paths count (the
report's `--files`, the tree diff, both), the reason text, and how it
interacts with the three-refusals rule and with a step whose plan is
wrong (the step genuinely needs the sibling changed). Is it an impasse?
Is it the only enforcement point the framework needs?

**Q5 — Hooks at all.** The operator: "hooks that might not be reliable
anyway". The Stop hook is installed today and blocked an observer chat all
morning. Options: (a) keep it, fix it to key on the driving process (the
CLI passes `session_id` in the hook input — *not measured* whether the
framework can learn the driver's id at launch without a `sessionStart`
hook); (b) keep it as is and document "one chat per repository while a
session is in flight"; (c) remove it and rely on the instruction's own
words. Which is the reliable, simple one? Is there any hook the framework
should keep?

**Q6 — What to delete, and what to fix first.** List everything from
sessions 126–129 and from the clone apparatus (item 8) that the proposed
design makes unnecessary: drop, demote to opt-in, or keep, one line each.
Then rank against that list the two basic-functionality defects (item 9):
should the re-scoped block fix them *before* any wall work, and what is the
smallest session that does?

**Q7 — The sessions.** Re-scope 126–129 as the fewest sessions that
deliver the operator's design, each ≤ 3 work steps, Copilot before Claude
Code, with the deletion of the clone and the Start-Session-at-root change
placed where they cost least. The orchestrator's guess is three (permissions
+ report refusal + Stop-hook fix; the deletions + Start Session at root +
the two defects; the Copilot walk that measures nothing but checks the
developer's day). Say if it should be two.

Then, once:

8. **The developer's day** — open, work, test, land, review — on a Copilot
   seat, under the design you recommend, two or three sentences each,
   including the moment the AI reaches for a sibling's file and what the
   developer sees.

9. **The disagreement.** Where the orchestrator's restatement above is
   heavier than the operator asked for; where "simple" and "blackboxing"
   genuinely conflict and which way you go; where you expect the other
   reviewer to over-engineer.

## What to answer

For Q1–Q7: **Soundness** (cited), **Risk** (the failure you would bet
on — an impasse, a burden, or a mechanism that silently does nothing all
count), **Recommendation** (one, small). Then 8–9. Mark ASSUMPTIONs; name
probes. Be direct and be short: the operator has asked for the simplest
reliable thing, has said the last two rounds produced five times what was
asked, and will read anything heavier as a defect.
