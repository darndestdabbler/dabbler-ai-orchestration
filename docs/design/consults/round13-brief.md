# Design consult, round 13: humans at the edges — what the sample found in 2.5.0, and the smallest block that answers it

You are consulted again on `dabbler-ai-orchestration`, the AI-led
coding-session framework (a TypeScript router `dabbler <verb>` bundled into
a VS Code extension) whose customers are **.NET and Java teams on GitHub
Copilot seats first, Claude Code second**. Round 12 settled the wall
without hooks. Sessions 160–162 answered the first sample log (thirteen
entries against 2.4.0) and shipped 2.5.0. The operator then drove the same
sample, `csv-parser` (a four-module .NET solution whose only product is
`docs/notes/dabbler-issues.md`), through 2.5.0: three sessions closed
VERIFIED and came back with **twenty-three entries**. This round asks for
the smallest block that answers them, under two positions the operator
stated on 2026-09-13.

You have NO tool access. **Every claim about this repository must cite a
path or a fact from this brief; mark anything you cannot ground here as
ASSUMPTION.** Answer tersely: the operator reads this, and the plan that
follows it is held to a line or a sentence per fix.

---

## The operator's two positions, verbatim

On governance:

> My concern is that as we identify issues, we will again over-engineer
> the solution. We may need to remove some governance powers that the
> framework has in order to allow AI to get the job done with only a
> little amount of friction to ensure that the process is typically
> followed.

On human sign-off:

> I think that it is ridiculous to ask the human operator for a sign off.
> There is way too much standing in the way of sessions getting done. The
> more that you bother a human developer, the less likely that he or she
> will use the extension. Therefore, we need to make it as easy as
> possible for the developer to finish a session.

And on this consult: "Please do not overengineer. Keep it simple."

## The orchestrator's position, which you are asked to check

**Humans at the edges, never in the loop.** All human input at `session
start` (the brief, releasability, which is already declared there); zero
human decisions between `start` and `done`; accountability moves to the
close, which prints what was stepped over. The reviewers are models and
stay. The three hard rules stay: state files are the router's, verdicts
are a reviewer's, the run of record is the framework's run.

**Two tests for any gate.** (1) A gate may refuse only what the engine
could have done differently; if the framework wrote the file, the gate's
scope is wrong and the fix narrows the gate, never adds an exemption list.
(2) A question to a person is raised only when the answer changes what the
framework does next; otherwise it is a row on the record and a line in the
close, not a question.

**A budget.** No fix in this block adds a verb, an instruction kind (the
docs promise four and no fifth), a state, or a special case in a gate. A
fix that cannot fit is a gate deleted, not a gate grown.

---

## What the source says the human touchpoints actually are

Verified in this tree on 2026-09-13; the sample's log guessed at some of
these and the source is what is written here.

- **Only one owed-decision class blocks a close.**
  `packages/router/src/owedDecisions.ts`: `BLOCKING_CLASSES` holds
  `verification-reduction` alone. `accountability-signoff`,
  `value-tradeoff` and `external-consequence` rows sit on `dabbler owed
  list` and never stop anything. So the sample's "sign-off" did not stall
  a session; it raised a question whose answer changes nothing the
  framework does.
- **`rebaseline` raises `repair-outside-a-step-<n>`**
  (`session.ts` ~2156, class `accountability-signoff`, options "It
  stands" / "It does not"). The row in `repairs.jsonl` is what the record
  needs; the question is re-asked after every close by
  `owedDecisions.ts` ~486 with corrected wording, because the "It does
  not" option became impossible once the work landed. A question whose
  options go stale is a question no answer was ever going to act on.
- **`--approver` is required on `plan amend`, `verify reopen` and
  `withdraw-release`** (`cli/session.ts` 185, 219–222; `drive.ts` 2630).
  The help says: "No gate reads the approver -- this records a claim, it
  does not prove an authorisation." The sample's engine wrote `claude-code
  engine, session 002` and it was accepted. The session's identity is
  already on the record from `start`.
- **The stop decision** (`drive.ts` ~1427, class `value-tradeoff`, "Run it
  again, or cancel it?") is raised on every stop; `session next` re-runs
  from the stop whether or not it is answered. It also carries an
  adviser's `Amend step` proposal when triage produced one, which is the
  one thing on it that a person might act on.
- **The plan template tells session 1 to ask the operator**
  (`bootstrap/templates.ts` 341: "Ask the operator what the solution is …
  unless the repository or your prompt already says … do not draft one
  from the folder name"). The protocol has no channel between `step` and
  `report`; a headless driver guesses or blocks. The sample got past it
  because a person was in the chat.

## The twenty-three entries, each with its mechanism

Numbered in log order. "Fix" is the orchestrator's proposed smallest
change; you are asked whether there is a smaller one, or none.

1. **`start` refused over a stale Auxiliary model in `preferences.json`**
   (`gemini-flash-latest`, a registry id from a prior release). Fix: an
   unresolvable stored preference is reported by `bootstrap`/`configure`
   on upgrade, or aliased; the refusal text is already good.
2. **`configure` warns `DABBLER_TRANSPORT` is obsolete; nothing else does.**
   Fix: cut (the variable is ignored; one doc sentence says to unset it).
3. **The plan step asks the operator with no channel.** Fix: the template
   sentence becomes "the brief is your prompt, or `docs/planning/brief.md`;
   with neither, report the step `blocked` naming that path" — an honest
   stop at the first step before any work, not a question mid-session.
   Alternative: `session start` on session 1 refuses when neither exists.
4. **`dabbler` on PATH is a `sh` wrapper; a shell-less check argv cannot
   spawn it on Windows.** Fix: a `dabbler.cmd` beside it, written by the
   same code that writes the `sh` wrapper.
5. **`declare` refuses an untracked `.vscode/settings.json` that `start`
   accepted, and the pause says "engine".** 162 already made the refusal
   name the file. Remaining fix: the check runs at `start`, where the
   condition is fully known; and a tree-state refusal is not logged as an
   engine fault.
6. **`modules create` drops the manifest's comment header; no way to
   remove the placeholder; `--kind application` defaults a package.** Fix:
   regenerate the header on every write; `--package none`; the placeholder
   is removed by hand and the template says so (no `remove` verb).
7. **Router writes `docs/sessions/*` untracked and nothing says it commits
   them.** Answered at close: it does. Fix: one sentence in `AGENTS.md`.
8. **`modules --help` prints `modules create --help`.** Cosmetic.
9. **The landed commit's subject is the whole task paragraph (770
   chars).** Fix: subject is `Session N: <title from sessions.json>`, the
   paragraph is the body.
10. **Run of record passed N/A with no suite declared and did not say
    so.** 162 gave the gate row a dash. Remaining fix: the phase log line
    says `no suite declared; nothing to run`.
11. **`invocations=0` on a pull-mode session.** Fix: omit in pull mode.
12. **`next` re-judges an already-accepted report when no new one was
    filed, and spends a refusal** (`drive.ts` `judgeReportShape`: a report
    with `seq !== instruction.seq` is refused under `report-seq`). Fix: a
    report whose seq is below the outstanding one is spent; `next`
    reprints the instruction and counts nothing.
13. **A plan's check tripped on text the step must not touch; only `plan
    amend` gets past it, the ask never names it, and `--approver` is a
    claim.** Fix: the plan step's ask names `plan amend` in one sentence;
    `--approver` is deleted (identity comes from the record).
14. **`--help` duplication is general.** Cosmetic.
15. **Router-written files carry LF on an `autocrlf` Windows checkout.**
    Fix: `bootstrap` writes `.gitattributes` with `* text=auto eol=lf`.
16. **A folder feed must exist before restore; no step can create a file
    outside the tree.** Fix: `packaging` (and the candidate job) creates a
    missing folder feed.
17. **`plan amend` leaves no trace in pushed history**
    (`.dabbler/runs/s<N>/driver/amendments.jsonl` is gitignored). Fix:
    the amend is folded into `activity-log.json`, which is committed.
18. **The impact plan logs `docs/` as `unowned`; what that does to suite
    selection is unstated.** Fix: one sentence in the docs and on the
    log line.
19. **`packaging --dry-run` prints `refused` and exits 0; names an empty
    credential for a folder feed.** Fix: wording.
20. **The `test_run_fresh` gate tells the engine to run the suite and
    record evidence by hand** (`affected.ts` 279), inside a session whose
    run of record the framework runs itself. Fix: inside a driven or
    pulled session the advice reads "the run of record runs after
    verification; nothing to do now".
21. **A `contract: package` module needs `modules/<slug>/contract/README.md`;
    the refusal names `dabbler module contract <slug>`, which refuses
    package** (`cli/module.ts` 699: "the designed seam is scaffolded for
    `contract: designed` only"). Fix: `modules create --contract package`
    writes the notes page from its template at once.
22. **The candidate job wrote `Directory.Packages.props` with
    `ManagePackageVersionsCentrally=true`** (`ecosystem.ts` 363
    `writeCentralPin`) after the test project existed with versioned
    `PackageReference`s; restore failed with NU1008. Fix options: (a) the
    props file is written at `modules create --contract package` time
    (`ecosystem.ts` 660 `writeIfAbsent` already exists), before any
    project, so the first project is born under CPM, and the README says
    so; (b) `writeCentralPin` migrates existing `Version` attributes into
    `PackageVersion` items when it creates the file; (c) add the pin
    without turning CPM on.
23. **The step report was refused for files the candidate job wrote**
    (`packages/*.nupkg`, `*.json`). `drive.ts` `stepChangedPaths` exempts
    only `SET_BOOKKEEPING_COMMIT_BASENAMES` under the sessions dir
    (`gates.ts` 95). Fix: the paths a framework job writes are the
    framework's, subtracted the same way, committed by it the same way.

## The proposed block, three sessions

- **163 — The questions nobody needs to answer.** Entries 3, 12, 13, 17,
  and: `rebaseline` raises no owed decision (the `repairs.jsonl` row and a
  line in the close's summary are the record); `--approver` deleted on
  amend, reopen and withdraw; the close prints every amend, rebaseline
  and waiver with its reason.
- **164 — What the framework wrote is not the step's.** Entries 16, 20,
  21, 22, 23, 5.
- **165 — The small things, and the walk.** Entries 1, 4, 6, 7, 9, 10,
  11, 15, 18, 19; cut 2, 8, 14 unless a line; the walk in the sample
  against the built VSIX; release.

---

## Questions

**Q1.** Is "humans at the edges, never in the loop" sound for this
product, given the source facts above? Which owed decisions survive the
test "an answer changes what the framework does next"? Name any the
orchestrator proposes to delete that you would keep, and why in a
sentence.

**Q2.** The stop decision (`drive.ts` ~1427) carries the adviser's `Amend
step` proposal. Is that the one mid-session question worth keeping, or is
the proposal better printed in the stop text and applied by the engine
through `plan amend` with no owed row?

**Q3.** Entry 3: template sentence plus a `blocked` report, or a check at
`start`? One, not both.

**Q4.** Entry 22: (a), (b) or (c)? Ground the choice in what CPM does to
an existing versioned `PackageReference`.

**Q5.** For each of the 23, say KEEP, SMALLER (with the smaller fix), or
CUT. One line each. The plan will follow your CUT list unless the
orchestrator disagrees in writing.

**Q6.** Anything in the proposed block that is a mechanism where a
sentence would do, or a sentence where nothing would do.

Terse. Cite paths from this brief. Mark ASSUMPTION where you must.
