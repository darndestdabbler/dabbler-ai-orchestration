# Consult round 15 — synthesis

2026-09-14. Brief: `round15-brief.md`. Answers: `round15-gemini.md`
(`gemini-3.1-pro-preview`, 61 s) and `round15-sol.md` (`gpt-5.6-sol`,
medium effort — the high-effort call timed out at the network layer after
300 s). Every factual claim below was checked against the tree before it
was repeated.

The frame, from the operator: zero deadlocks, minimal friction, value a
developer can see. Both advisors answered in that frame, and both came back
recommending deletion far more than addition.

## Where both advisors agree, and so does the orchestrator

1. **Delete the module folder.** Every session runs in the developer's own
   checkout. Gone: the sparse clone beside the repository, reset and pull,
   grants, `sharedFiles`, focused versus global, Open Module and Grant
   (`checkout.ts`, `exposure.ts`, `policy.ts`, two extension commands).
2. **Project references inside the repository.** .NET `ProjectReference`;
   one Maven reactor build. Gone: the candidate package job, the committed
   `packages/` folder, sibling version pins, mandatory contract pages
   (`packages.ts`, `contractdoc.ts`). Packages only for what ships outside.
3. **Delete `docs/modules.yaml`.** The project graph comes from
   `.sln`/`.slnx` plus `.csproj` for .NET and the reactor `pom.xml` files for
   Java; `solutionDeps.ts` already reads `ProjectReference`,
   `PackageReference` and Maven `<dependency>`. The Solution Explorer is
   filled from that graph. What each project is for lives in
   `docs/planning/solution-plan.md`.
4. **Delete module-based impact selection** (`impact.ts`). Both advisors
   went further and said to run the whole suite every session; the
   operator overruled that for large suites — see *Revised after the
   operator's reply* below.
5. **Delete the `deployables:` block.** No per-tier artifact model.
6. **Every phase checks what already exists before acting**, so running it
   again is always safe. The close is one operation used by the verb and the
   driver alike — the driver stops spawning `session close`.
7. **No idle sleeps** between the engine and a job that has finished.
8. **.NET and Maven first; no Gradle claim** until a Gradle reader exists.

## Where they split, and the call

**Files changed outside the planned projects.** Gemini: reject the step and
auto-revert the files. Sol: show them in the step result and to the
reviewer; block nothing. **Call: Sol.** An automatic revert destroys work,
and a rejection is a new gate that would refuse a legitimate project
reference or build-file change — the exact shape of deadlock 2.

**The 47 stops.** Gemini: delete them all and return errors to the engine.
Sol: delete the stop taxonomy and the repeated-stop detector; one
retry-safe failure form. The draft said audit them. **Call: the principle
both advisors give, plus Sol's deletion.** Delete `judgeStopClass`, the
`DEADLOCK` label and the unattended triage ladder that only it feeds
(`triage.ts`, used only when `session drive` runs unattended). Keep one stop
form — what refused, who acts, the one command — for what only a person can
fix: a missing credential, a push the host refuses, a suite still failing
at the cap. Correction to Gemini: not every stop is something an engine can
fix, and the 47 are all stops, not 47 deadlocks.

**The in-call wait.** Gemini: wait synchronously with keep-alive output.
Sol: return when the job ends, fail at a hard timeout; called a bounded
wait arbitrary. **Call: a bounded wait inside the call, with no sleep
after it.** The bound is not arbitrary: the engine's own shell call has a
timeout (Claude Code's default is 120 s) and a real .NET or Java suite can
outlast it. `next` waits inside the call and returns the moment the job
ends; a job still running at the bound returns a `wait` that means "call
`next` again now", never "sleep 60 s".

**Tiers in planning.** Gemini: a plain-text tier line, plus one reference
check at the run of record. Sol: one plain question with the shop's usual
answer as editable default text, no enum, no framework check. **Call:
Sol's question**, e.g. *"What runs separately in production, and which part
may talk to the database?"*, recorded in the solution plan. Where the
answer is "only the service", the setup session writes that rule as an
ordinary architecture test in the solution's own test project — a test the
team owns and can read, not a framework gate.

**Deployment artifacts.** Gemini: run `dotnet publish` / `mvn package` on
entry-point projects into `artifacts/`, with an override. Sol: the existing
`dabbler.yaml` `packaging.pack` command produces every handoff artifact the
solution plan lists and fails if one is missing. **Call: Sol** — one seam
that already exists; the planning session writes the command from the
developer's answer about the handoff form.

## Where the advisors are wrong

- **Gemini: "per-step cross-provider review."** Review already runs once per
  session; the sample ran one round after all four steps.
- **Both: "release only when explicitly requested."** This reverses the
  operator's ship-by-default ruling made the same morning (round 14,
  sessions 166–168). And the measured cost was not the release: the publish
  job in the sample took 7 seconds; the minutes went to the candidate
  package job and its repair, which recommendation 2 deletes. **Call: keep
  ship by default.** With in-repository packages gone, a release is the
  handoff artifacts from `packaging.pack` and a tag. The dissent is put to
  the operator.
- **Sol, on the draft's "solution files alone"** — right: the draft was
  loose. The project files are read too, and Java has no `.sln`.

## Adopted from one advisor

- Sol: a small change is a small plan — one implementation step where one
  will do. Plan guidance, not a rule.
- Sol: the risk the module folder was built for (oversized AI context, the
  $6,000 lesson) may return. Watch `dabbler seat-cost` on the walk; add a
  provider-native read limit only if the spend actually comes back.

## Revised after the operator's reply: which tests run

The operator: running the whole suite each time is fine under about 30
seconds, but real projects have hundreds or thousands of tests, and this
repository's own run of record needed a Podman container (324 s on the host,
about 55 s across its three suites in the container, measured in
`.dabbler/runs/test-runs.jsonl`). The CSV sample is not typical.

- **Tests are named after what they test**, in each ecosystem's own form:
  `CsvSerializer.cs` → `CsvSerializerTests`, methods
  `Deserialize_EmptyInput_Throws`; `CsvSerializer.java` →
  `CsvSerializerTest`, `deserialize_emptyInput_throws`; this repository's
  `src/checks.ts` → `test/checks.test.ts`. Not comments listing tests:
  nothing checks a comment, and it is a second copy of a fact.
- **Selection is by file, not method.** Which files changed is exact from
  git; which methods changed needs a parser per language. A test class runs
  in seconds. Method-level names serve the engine and the reviewer.
- **One rule, any language:** a changed source file's tests are the test
  file whose name matches, by a pattern the repository declares once in
  `dabbler.yaml` (`src/{name}.ts` → `test/{name}.test.ts`). It replaces the
  hand-written rules of the existing `testing.selection` block
  (`checks.ts`), keeping its smoke fallback and its `selection_unknown`
  risk.
- **Three levels.** Each step: the tests named after its changed files plus
  any test it wrote or edited, added by the framework. End of session: the
  whole suite when its last recorded duration is under a threshold;
  otherwise the named tests plus the tests of projects that depend on what
  changed (Maven `-pl <changed> -amd`; .NET from project references). The
  whole suite: before a release and in CI after the push.
- **A changed source file with no matching test file** is shown to the
  reviewer. It blocks nothing.


1. **Nothing gets stuck, nothing waits.** Phases check what exists first
   (a closed session collects `done`; land, push, publish and tag look
   before acting); one close shared by verb and driver; delete the
   `DEADLOCK` classifier and triage ladder; the in-call wait; the `..slnx`
   name; the session-1 text that tells the engine to report a step it
   cannot report; `session start` checks the remote answers. Ends with a
   timed tutorial run.
2. **One checkout, project references.** Delete the module folder, grants,
   `sharedFiles`, the candidate job, `packages/`, sibling pins and contract
   pages; scaffold `ProjectReference` and a Maven reactor; files changed
   outside the planned projects are shown to the reviewer.
3. **The build files are the solution.** Delete `docs/modules.yaml`,
   module-based impact selection and `deployables:`; the graph from
   `.sln`/`.slnx`, `.csproj` and `pom.xml`; the Solution Explorer from the
   graph; retire the `modules create` verbs; tests selected by name and by
   the projects that depend on what changed.
4. **Planning asks what matters.** The production-split question with a
   shop default; small plans; handoff artifacts through `packaging.pack`;
   an architecture test where only the service may touch the database.
5. **The walk.** The CSV tutorial (.NET) and a Maven sample end to end
   through the built extension, timed — a one-class session under five
   minutes — then release.

## The operator's answers (same day)

Recorded in `docs/operator-decisions.md`, 2026-09-14. In short: fix the
deadlocks and the logged issues first and push them, then the deletions are
approved; releasing is a project-level setting defaulting to on request,
turned to ship by default from the solution's context menu (this repository
ships by default) — which replaces the "keep ship by default" call above; a
tutorial produces whatever artifact is easiest to test (containers are fine)
while the framework knows the IIS and Windows Service forms; the shop default
is application tier → API tier → database; the whole suite runs at a
session's end while it costs at most about 5% of the session's time.

## For the operator (as first put)

1. Delete the module folder, in-repository packages and `docs/modules.yaml`?
   This reverses the 2026-09-08 ruling and consult rounds 6–8.
2. Keep ship by default (recommended), or release only on request (both
   advisors)?
3. For the tutorial, the handoff form of each tier's artifact.
4. The shop default answer to the production-split question.
5. The threshold under which the whole suite runs at every session's end
   (proposed: 60 seconds, read from the suite's last recorded duration).
6. For a large suite, ship by default runs the whole suite at every release:
   accept that cost at release, or batch releases?
