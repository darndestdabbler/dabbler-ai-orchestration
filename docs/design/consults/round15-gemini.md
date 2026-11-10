# Consult round 15 — gemini (`gemini-3.1-pro-preview`)

Answered 2026-09-14T14:03:36.928Z in 61s; 3957 in / 2609 out tokens.

---

**1. Zero deadlocks**
- **Recommendation:** Make every framework phase strictly idempotent and delete all internal hard-stops, returning context-rich errors to the engine instead.
- **Design:** Delete all 47 `DEADLOCK` stops in `packages/router/src/drive.ts`. Instead of halting the framework, return a standard error payload to the engine instructing it to fix the issue or report `blocked`. Modify late phases like `session close` to check actual system state (e.g., looking at git status or checking if the session folder is already removed) rather than trusting the run file's `phase` field. Ensure the `land` tree check reads from the actual git index, avoiding failures caused by disk files that git refuses to add. This attaches directly to the engine's step-evaluation loop, treating framework failures as normal step-rejections. 
- **The one risk:** The engine might enter an infinite loop retrying a command that the framework repeatedly rejects.
- **Mitigation:** Cap engine retries at three per step, after which the framework suspends the session and returns control to the human developer.
- **What a skilled human team does:** A skilled human team relies on idempotency—running `git status` or checking if a PR exists—before trying to close a branch or commit a file.

**2. The module folder**
- **Recommendation:** Delete the focused checkout entirely and run all sessions in the primary repository checkout.
- **Design:** Delete `packages/router/src/checkout.ts`, `exposure.ts`, `policy.ts`, and the FOCUSED/GLOBAL distinctions. Run the session in the developer's normal working tree. When the step report lists changed files, check them against the planned module's code roots; if an out-of-bounds file is touched, auto-revert that specific file via `git checkout` and reject the step so the engine can try again. This attaches to the step-report validation seam.
- **The one risk:** An auto-revert might erase a legitimate, necessary change to a shared file that the engine forgot to declare.
- **Mitigation:** Allow the developer to bypass the module boundary by adding a standard `sharedFiles` entry to `dabbler.yaml` if the step rejection is valid but unwanted.
- **What a skilled human team does:** A skilled human developer works in one standard repository checkout and relies on code organization and PR reviews, not filesystem obfuscation, to maintain module boundaries.

**3. Project references for .NET and Java**
- **Recommendation:** Use native IDE project references (`ProjectReference`, `<dependency>`) for internal modules and delete all internal in-repo packaging infrastructure.
- **Design:** Delete `packages/router/src/packages.ts`, the candidate job, the central version pinning in `ecosystem.ts`, the contract page enforcement in `contractdoc.ts`, and the local `packages/` folder. Use standard `.sln`/`.csproj` references for .NET and Maven reactor or Gradle `project(':x')` dependencies for Java. Packages are only generated at the final release stage, and only for modules specifically marked to ship outside the repository. The "consumer reads the promise" principle survives naturally through standard code interfaces and standard Javadoc/XML comments.
- **The one risk:** A Maven reactor build might attempt to build the entire solution instead of just the module and its dependencies, wasting time.
- **Mitigation:** Use standard ecosystem flags (ASSUMPTION: Maven's `--also-make` or `-pl`) to isolate the build tree to the target module.
- **What a skilled human team does:** A skilled human team uses native IDE project references to get immediate intellisense, fast refactoring, and simple local builds without a local package publish step.

**4. The abstraction layer**
- **Recommendation:** Delete `docs/modules.yaml` and derive the solution structure entirely from `.sln`, `.csproj`, and `pom.xml` files.
- **Design:** Delete the 960 lines of `modules.ts`, the redundant parsing in `ecosystem.ts`, and the test impact selection in `impact.ts`. Read dependencies directly via the existing `solutionDeps.ts` parsing logic to fill the Solution Explorer (`solutionTreeModel.ts`). Keep module responsibilities as plain text in the `docs/planning/solution-plan.md` file. Run the whole solution's tests (`dotnet test`, `mvn verify`) every time, as the 3-second overhead is vastly cheaper than maintaining impact selection logic.
- **The one risk:** Build files do not explicitly declare a project's "kind" (shared/library/application) in a unified, easily parsed way.
- **Mitigation:** Infer the project kind from standard properties (ASSUMPTION: `<OutputType>Exe</OutputType>`, `<packaging>war</packaging>`) and default to "library" if unknown.
- **What a skilled human team does:** A skilled human team treats the native ecosystem build files as the single source of truth for repository structure and dependencies.

**5. Speed**
- **Recommendation:** Cut the runtime from 14.5 minutes to under 5 minutes by removing idle polling waits, the candidate package job, and per-step cross-provider reviews.
- **Design:** Delete the 60s/15s polling timeouts in the `longWork` function of `drive.ts` and await subprocesses synchronously. Delete the candidate package step entirely, which saves over 5 minutes and prevents NuGet central package management breaks. Move the cross-provider review to run exactly once at the end of the session, rather than after every step. Run the 3-second run of record, and skip the release packaging phase unless explicitly requested.
- **The one risk:** Long synchronous waits during slow builds might cause the engine CLI to time out or disconnect.
- **Mitigation:** Ensure the framework sends periodic keep-alive progress updates to the engine's stdout while awaiting the synchronous subprocess.
- **What a skilled human team does:** A skilled human team runs fast local tests in seconds and only pushes to CI for comprehensive packaging and review when a logical chunk of work is complete.

**6. Tiers in planning**
- **Recommendation:** Capture the architecture tier choice as plain text in Session 1 and enforce client-data separation via standard project dependency graphs.
- **Design:** Update Session 1 to append a tier declaration (e.g., "Tiers: 3-tier") to `docs/planning/solution-plan.md`. If it reads "3-tier", add one validation check at the run of record that queries `solutionDeps.ts` to ensure the application `.csproj`/`pom.xml` does not reference the data `.csproj`/`pom.xml`. No new state machines, framework files, or complex gates are created.
- **The one risk:** The engine might write the tier choice in an unpredictable markdown format that the framework cannot reliably parse.
- **Mitigation:** Provide the engine a strict, regex-validated enum schema for that specific step in the work plan.
- **What a skilled human team does:** A skilled human team agrees on an architectural pattern up front, documents it in a readme, and uses PR reviews to catch architectural dependency violations.

**7. Deployment artifacts**
- **Recommendation:** Delete the custom `deployables` block and use native ecosystem publish commands to generate standard artifact folders per tier.
- **Design:** Delete the `deployables` parsing from `docs/modules.yaml` and shrink the custom release logic in `packaging.ts`. Issue native build commands (ASSUMPTION: `dotnet publish` or `mvn package`) during the run of record for projects identified as entry points (exes/web apps). Route the output to an `artifacts/` folder at the repository root. Defer actual deployment mechanics completely to the operator's external CI/CD pipelines.
- **The one risk:** Default publish commands might produce artifacts that do not match the specific environment requirements of the operator.
- **Mitigation:** Allow a simple override in `dabbler.yaml` that accepts the exact CLI string for the publish step (e.g., `dotnet publish -c Release -r linux-x64`).
- **What a skilled human team does:** A skilled human team uses standard build tools to produce binaries and hands them off to dedicated CI/CD platforms for packaging and deployment.

**8. The value a developer can see**
- **Recommendation:** The framework must become an invisible, fast typist that handles boilerplate scaffolding, testing, and native project wiring automatically, which an external chat AI cannot do because it lacks local build execution.
- **Design:** By stripping away the module folders, mock packages, 60-second sleep timers, and fragile `modules.yaml`, the framework reduces friction to zero. A developer asks for a feature, and within 5 minutes the AI writes the code, runs the actual native tests (`dotnet test`), auto-fixes any syntax errors using immediate feedback, and cleanly commits a working result to the developer's normal working tree. This automation of the tedious "code-compile-fix" loop is precisely the value that justifies the framework's existence, returning productive time to the human without requiring them to untangle proprietary framework errors.
- **The one risk:** Developers might still see the AI make poor logical coding choices, leading to mistrust.
- **Mitigation:** Instant, synchronous feedback loops (running tests in 3 seconds instead of after 5 minutes of framework overhead) allow the AI to correct its own logical mistakes before the developer ever reviews the PR.
- **What a skilled human team does:** A skilled human developer values tools that disappear into the background and automate tedium without enforcing a rigid, proprietary way of working.

---

**Ordering:**
- **Remove idle polling (`drive.ts`)**: Deletes 60s/15s sleep timeouts, replacing them with synchronous awaits to instantly regain speed.
- **Idempotent phases and auto-revert**: Deletes 47 `DEADLOCK` hard-stops in `drive.ts`, replacing them with context-rich step rejections.
- **Delete candidate packaging**: Deletes `packages.ts`, local `packages/` folders, and `Directory.Packages.props` pinning.
- **Delete focused checkout (`checkout.ts`)**: Deletes `checkout.ts`, `exposure.ts`, `policy.ts`, and the FOCUSED/GLOBAL concepts.
- **Replace `modules.yaml` with native parsing**: Deletes `modules.ts`, `impact.ts`, `contractdoc.ts`, and the contract folder requirement.
- **Native publish artifacts**: Deletes the `deployables` block and shrinks `packaging.ts` down to native artifact commands.

**What NOT to build:**
Do not build the draft's suggestion to "audit all 47 stops" to ensure they name commands that actually move them. The engine is an unpredictable black box and will inevitably issue bad commands; the framework must handle command refusal gracefully by rejecting the step, not treating it as a framework defect to audit. Do not build a cross-provider review for every step; run it once at the end. Do not build complex CI gates for the 3-tier check; keep it a simple grep of `solutionDeps.ts`.

**Where the draft is wrong:**
The draft states "a stop naming a command that refuses is a defect." This is fundamentally wrong because it assumes the framework can perfectly control the AI's inputs. The engine will supply bad arguments; the framework must auto-revert out-of-bounds files and return standard errors, rather than crashing as a "defect". The draft also suggests auditing the 47 stops, whereas the correct action for a simpler, reliable system is to delete them entirely in favor of idempotent state checks.

**Disagreements you expect:**
The other advisor might argue that test impact selection (`impact.ts`) is absolutely necessary for large monorepos to save AI wait time. I answer that full native tests in standard .NET/Java projects run incredibly fast (as proven by the 3-second `dotnet test` in the brief), and the massive complexity of maintaining custom test impact logic causes far more pipeline failures, deadlocks, and developer frustration than it saves in execution time.
