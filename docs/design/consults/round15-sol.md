# Consult round 15 — sol (`gpt-5.6-sol`)

Answered 2026-09-14T14:12:26.396Z in 259s; 3784 in / 7885 out tokens.

---

### 1. Zero deadlocks

- **Recommendation:** Make every phase a retry-safe reconciliation of durable reality, not a transition based on the driver’s remembered phase.
- **Design:** A phase must first observe whether its intended effect already exists, perform only missing work, and then verify the effect. For close, a complete and VERIFIED ledger must supersede `phase: close`, directly fixing the failure caused by `phaseClose` in `packages/router/src/drive.ts`. Extract one close operation used by both `session close` and the driver instead of having the driver spawn the verb. Delete `judgeStopClass`, the repeated-stop `DEADLOCK` classification, and the 47 bespoke stop constructions in `drive.ts`; return either success or one failure with the exact external repair and a safe retry. Any gate invented by the framework must be automatically repairable or overridable through one common operator override, rather than a phase-specific command. Test retrying every late operation before release, including interruption before and after its durable effect, and run the timed tutorial through the built extension.
- **The one risk:** ASSUMPTION: A poorly chosen “effect already exists” check could accept incomplete work.
- **Mitigation:** Define completion from existing durable evidence—the ledger, tested commit, remote commit and release tag—and test interruption at each boundary.
- **What a skilled human team does:** ASSUMPTION: It makes delivery commands safe to rerun and does not diagnose repeated failures as a special workflow state.

### 2. The module folder

- **Recommendation:** Delete the focused checkout and treat the planned project boundary as guidance and review information, not a blocking gate.
- **Design:** Run in the developer’s checkout and delete the sparse clone, reset-and-pull workflow, grants, `sharedFiles` widening, and focused/global distinction implemented around `packages/router/src/checkout.ts`. Delete the corresponding Open Module and Grant extension commands. Tell the engine which projects are expected to change and show unexpected files in the step result and cross-provider review. Do not reject such a step automatically: legitimate changes to project references, shared build files or consumers would turn that rejection into another framework-created stop. Keep the final complete suite as the correctness boundary. Address the documented $6,000 context problem by measuring files and bytes read and tightening instructions before introducing another filesystem wall.
- **The one risk:** ASSUMPTION: An engine may again read much more source than the task requires.
- **Mitigation:** Measure context use per session, warn on abnormal expansion, and add provider-native read limits only if measurements show that instructions are insufficient.
- **What a skilled human team does:** ASSUMPTION: It works in one checkout, starts with the relevant projects, and follows dependencies when the change genuinely crosses a boundary.

### 3. Project references for .NET and Java

- **Recommendation:** Use normal in-repository project dependencies and reserve packages for artifacts consumed outside the repository.
- **Design:** Replace sibling NuGet packages with `.csproj` `ProjectReference` entries and sibling Maven dependencies with one reactor build; use Gradle project dependencies only when Gradle is explicitly supported. Delete the candidate package job, committed `packages/` folder, sibling-package pinning, and mandatory contract pages handled by `packages/router/src/packages.ts` and `packages/router/src/contractdoc.ts`. Run the whole reactor or solution for the run of record, avoiding special one-module package publication. ASSUMPTION: Maven builds restricted to one module may require its reactor dependencies to be selected as well, so the framework should not promise arbitrary isolated module builds. Keep consumer-contract tests already recognised by `packages/router/src/impact.ts`, but run them through the normal build. The promise is the public API, its documentation where useful, and executable consumer tests—not a compulsory parallel contract folder.
- **The one risk:** ASSUMPTION: A team may accidentally expose or consume implementation APIs once the source projects are directly available.
- **Mitigation:** Use normal visibility rules, API compatibility checks where the team already has them, consumer tests, and the independent review rather than filesystem isolation.
- **What a skilled human team does:** ASSUMPTION: It uses project references inside one repository and publishes versioned packages only across repository or release boundaries.

### 4. The abstraction layer

- **Recommendation:** Remove `docs/modules.yaml` and derive the project graph from the build files, while keeping only human intent and handoff requirements in existing documents.
- **Design:** Use the `.sln`/`.slnx` plus `.csproj` files for .NET and reactor `pom.xml` files for Maven; `packages/router/src/solutionDeps.ts` already parses `.csproj` references and Maven dependencies. Solution files alone are insufficient because project references and project type are in the project build files, and Java has no `.sln` equivalent. Fill the extension’s Solution Explorer from that derived graph and retire its dependency on `docs/modules.yaml`, including the current machinery in `solutionTreeModel.ts`. Put project purpose, production split and dependency intent in `docs/planning/solution-plan.md`; put executable packaging commands in the existing `dabbler.yaml` `packaging.pack` seam. Delete module kinds, code roots, contract modes, package flags and deployables from `docs/modules.yaml` rather than maintaining a reduced second source of truth. Do not claim Gradle support until a Gradle project model is implemented; the brief states that `solutionDeps.ts` currently has no Gradle support.
- **The one risk:** ASSUMPTION: Unusual generated projects or dynamic build definitions may not be discoverable through static parsing.
- **Mitigation:** Allow an explicit project-list override only for repositories where discovery demonstrably fails, rather than retaining a mandatory module schema.
- **What a skilled human team does:** ASSUMPTION: It treats build files as the executable dependency graph and architecture documents as explanations of intent.

### 5. Speed

- **Recommendation:** Target under five minutes for a one-class session, keep one independent review and one complete run of record, and remove every avoidable wait and packaging action.
- **Design:** ASSUMPTION: Under five minutes is achievable for the measured sample because its review took about 40 seconds and `dotnet test` took three seconds, while most excess time came from extra steps, package repair and polling. Let a small plan contain one implementation step rather than four separately checked steps. Run a focused check after implementation, then the independent review, then the complete suite as the run of record; rerun review and checks only if code changes afterward. Replace `longWork` in `packages/router/src/drive.ts` with an in-call wait that returns immediately when the child ends and fails with cleanup after a hard timeout, instead of telling the engine to sleep for 15 or 60 seconds. Do not run the candidate package job, and do not publish or release on every coding session; release only when explicitly requested. Keep commit, push, close and the framework-only record under `.dabbler/runs/`.
- **The one risk:** ASSUMPTION: A full suite in a large repository may dominate the target even after orchestration overhead is removed.
- **Mitigation:** Keep the full suite as the run of record but report framework overhead separately, so slow product tests are visible rather than hidden by orchestration delays.
- **What a skilled human team does:** ASSUMPTION: It runs a quick relevant check while editing, one authoritative suite before landing, and releases deliberately rather than after every commit.

### 6. Tiers in planning

- **Recommendation:** Ask one plain question about separately running parts and database ownership, record the answer in the solution plan, and do not create a tier state model.
- **Design:** During session 1 ask: “What runs separately in production, and which part may access the database?” Offer the shop’s usual answer as editable default text rather than forcing three-tier, two-tier or other enum values. Record the confirmed answer in `docs/planning/solution-plan.md`, which already holds responsibilities and dependency direction. Use that prose when the engine creates the initial projects and reviews later dependency changes. Do not add tier metadata to `dabbler.yaml` or revive `docs/modules.yaml`. Do not add the generic client-to-data reference gate; a team that needs enforcement should add a normal repository architecture test as part of its suite.
- **The one risk:** ASSUMPTION: Prose may drift from the implemented architecture.
- **Mitigation:** Have the independent review compare project references with the recorded production split and recommend a repository-owned architecture test when drift becomes recurring.
- **What a skilled human team does:** ASSUMPTION: It documents deployment boundaries plainly and automates only the architectural rules that are important and stable for that solution.

### 7. Deployment artifacts

- **Recommendation:** Delete `deployables:` and have the repository’s existing `packaging.pack` command produce all declared handoff artifacts without deploying them.
- **Design:** List the required handoff artifacts and their owning projects in `docs/planning/solution-plan.md`. Use the existing `dabbler.yaml` `packaging.pack` argv as the single executable seam; one repository command may produce several artifacts and must fail if any required artifact is missing. Keep `packaging.push`, credentials and tagging out of ordinary coding sessions because `packages/router/src/packaging.ts` already separates those release concerns. Do not add a per-tier artifact engine, runtime enum or mandatory folder hierarchy. ASSUMPTION: Typical implementations would use `dotnet publish` for .NET applications, Maven packaging for Java jars or wars, and repository-specific commands for images or database artifacts. Run artifact production only on explicit packaging verification or release, not after every small session.
- **The one risk:** ASSUMPTION: A free-form command provides less framework-level insight into individual artifact types.
- **Mitigation:** Require the command to emit a concise artifact manifest into the run record rather than teaching the framework every .NET and Java packaging system.
- **What a skilled human team does:** ASSUMPTION: It owns packaging in its build, documents the outputs handed to operations, and lets orchestration invoke rather than reinterpret that build.

### 8. The value a developer can see

- **Recommendation:** Keep the framework only if it can add independent verification and a reliable delivery record while adding minutes, not tens of minutes, to a small change.
- **Design:** A developer gets an AI-authored change that is checked by a different vendor, validated by the repository’s complete suite, committed and pushed consistently, and recorded under framework-only `.dabbler/runs/`; asking one AI directly does not provide that independent reviewer or controlled record. The developer also gets one command that resumes safely after interruption instead of having to understand internal phases. The cost must remain visible through a timing summary separating generation, review, product checks and framework overhead. ASSUMPTION: This is worth roughly a few minutes for work that needs review and traceability, but not the measured 14½ minutes for a Person class. If the framework cannot hold that boundary after deleting the documented overhead, it should not mediate small coding tasks.
- **The one risk:** ASSUMPTION: Developers may still see the independent review and record as ceremony for trivial work.
- **Mitigation:** Show the review findings, test result, commit and timing in one concise close summary, and allow teams to use direct AI for work outside the governed workflow.
- **What a skilled human team does:** ASSUMPTION: It adopts tooling when the evidence and delivery reliability are obvious and abandons workflow that costs more than the risk it removes.

### Ordering

Session 1 — Make close, land, push, publish and release retry-safe; delete `judgeStopClass`, repeated-stop deadlock handling, child spawning from `phaseClose`, and the 47 bespoke stop constructions in `packages/router/src/drive.ts`.

Session 2 — Replace `longWork` callback sleeps with direct completion waiting and bounded failure cleanup; delete the 15-second and 60-second idle waits in `packages/router/src/drive.ts`.

Session 3 — Run and time the four-module tutorial through the built extension, covering manual close, missing checkout files, bad plan reporting and invalid Azure DevOps remote detection; delete release eligibility for any build that fails this exercise.

Session 4 — Remove focused checkouts; delete sparse-clone reset/pull behavior from `packages/router/src/checkout.ts`, grants, `sharedFiles` widening, focused/global session handling, and the extension’s Open Module and Grant commands.

Session 5 — Switch in-repository .NET and Maven dependencies to project/reactor references; delete the candidate package job, committed local packages, sibling pins, and mandatory contract pages from the machinery represented by `packages/router/src/packages.ts` and `packages/router/src/contractdoc.ts`.

Session 6 — Derive the project graph from `.sln`/`.slnx`, `.csproj` and `pom.xml` using the seam in `packages/router/src/solutionDeps.ts`; delete `docs/modules.yaml` and its use across the router and extension.

Session 7 — Fill the extension’s Solution Explorer from the derived graph; delete the module-schema logic in `solutionTreeModel.ts` and retire module/module-creation CLI behavior that only maintains the removed abstraction.

Session 8 — Simplify session planning and execution to small plans, one review point and one final suite; delete per-step builds where the same check is repeated and remove automatic release from ordinary sessions.

Session 9 — Add the production-split question to session 1 and record the answer in `docs/planning/solution-plan.md`; delete the proposed tier enum and generic reference gate.

Session 10 — Route artifact production through existing `dabbler.yaml` `packaging.pack`; delete `deployables:` and do not add a second artifact model.

### What NOT to build

- Do not build a replacement sandbox, virtual module boundary or per-step cross-project rejection; it recreates the focused-checkout gate that caused the missing contract file.
- Do not audit and preserve 47 stop variants; delete their persistent workflow semantics and use one retry-safe failure form.
- Do not build a new phase protocol or expose internal state-machine vocabulary to developers; the PowerPoint test in the brief rejects it.
- Do not build generalized tier metadata, tier-specific folders or a universal architecture-rule engine; the solution plan and repository tests are simpler.
- Do not build another module manifest after deleting `docs/modules.yaml`; that would retain two sources of truth.
- Do not build package publication for siblings in one repository; it caused the measured NU1008 repair cycle and immutable dev-version complexity.
- Do not build mandatory contract pages; keep ordinary API documentation and executable consumer tests where they add value.
- Do not build impact selection as a requirement after returning to whole-solution runs; retire the module-based logic in `packages/router/src/impact.ts`.
- Do not build a static Gradle parser now; the brief says no Gradle parser exists, and Java support can first be reliable through Maven.
- Do not build automatic deployment, automatic release per session, or framework-owned commands for every artifact technology.

### Where the draft is wrong

- Checking only late phases is too narrow: every operation that can be retried after interruption must reconcile durable reality, including starting and collecting long-running work.
- Auditing all 47 stops preserves the complexity that created the problem; the stop taxonomy and repeated-stop detector should be deleted.
- Rejecting files outside the planned project is another framework gate and can reject necessary reference, build or consumer changes; it should be a visible warning and review input.
- “Solution files alone” is incorrect: the brief itself places project references and project type in `.csproj` and `pom.xml`, while Java has no `.sln` equivalent.
- Waiting “up to about 90 seconds” is still an arbitrary polling protocol; the command should return when work ends or fail and clean up at a real timeout.
- Running a release whenever packaging is declared confuses producing verified code with publishing an externally visible version and repeats the cost that made the Person-class session slow.
- Three-tier/two-tier/other is more machinery than needed and may conflate logical layering with separately running production units; ASSUMPTION: asking what runs separately and who owns database access produces a more useful answer.
- A generic “client never references data” check is too solution-specific to justify framework machinery; put it in the repository’s own tests when the team chooses that rule.
- Requiring one output folder per tier is unnecessary; the handoff artifacts and the command that produces them are the facts that matter.

### Disagreements you expect

- Another advisor may keep focused checkouts because the brief records roughly $6,000 of oversized-context cost; my answer is to measure read volume after removing the checkout and reintroduce only provider-native limits if the cost actually returns, because the existing filesystem wall has already caused an uncommittable file and a witnessed deadlock.
- Another advisor may keep `docs/modules.yaml` as an explicit architecture model; my answer is that 27 router files, five extension files and thousands of lines now depend on facts already represented by the build, while purpose belongs in `docs/planning/solution-plan.md`.
- Another advisor may prefer impact-selected tests for large repositories; my answer is to allow quick project checks during implementation but retain the complete suite as the run of record, as required by the session design in the brief.
- Another advisor may want the client-to-data rule enforced centrally; my answer is that repository-owned architecture tests are simpler, visible to developers and capable of expressing exceptions.
- Another advisor may argue that every reviewed change must be packaged and released; my answer is that review, run of record, commit and push establish change quality, while packaging and release should happen only when an artifact is deliberately requested.
- Another advisor may promise immediate Gradle support; my answer is that reliable Maven and .NET support is better than claiming a third build model that `packages/router/src/solutionDeps.ts` does not currently parse.
