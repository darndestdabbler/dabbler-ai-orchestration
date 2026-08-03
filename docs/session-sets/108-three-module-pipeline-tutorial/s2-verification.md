ISSUES FOUND

## Issue 1: Part C never instructs the reader to implement the runnable watcher

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A typical reader follows Phase A literally and asks the AI to build decision-table logic with stubbed services. They then reach Phase B and are told to start `watcher` and call `POST /run-now`, although nothing instructed the AI to implement the hosted service, endpoint, scheduler, folder polling, HTTP clients, or configuration model. The watcher either does not start as expected or returns `404`, blocking the main-path integration exercise.
- **Details:**
  - **Violation:** The tutorial must tell the reader what to build and provide a complete, independently stoppable Part C. Phase A only says: “Build `watcher`'s logic and test it with stubs,” while Phase B immediately says: “Now start everything and watch a file go through.”
  - **Impact:** Part C is the composition module and a prerequisite for the Part D payoff. Missing its implementation phase materially prevents completion of both parts.
  - **Evidence:** Unlike Parts A and B, Part C has no complete “What to build” specification. `Watcher` configuration, Quartz scheduling, `/run-now`, result fields, HTTP forwarding, and folder movement first appear as already-existing behavior during the execution steps. The examples also leave the `/run-now` response contract ambiguous: one result is shown as an object while multiple results are shown as an array.
  - **Fix:** Add an explicit Phase B implementation step specifying the hosted service, `5103` binding, folder polling, configurable paths and service addresses, multipart converter call, unchanged persistence forwarding, decision-table handling, file movement, Quartz schedule, `/run-now`, and its stable response shape. Tell the reader to complete and test that implementation before starting the three services.

## Issue 2: Part D’s proof command uses a batch ID that cannot belong to the reader’s run

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Every reader who copy-pastes Part D receives a newly generated `batchId`, but Step 5 queries the fixed GUID from the author’s captured run. Their teammate’s persistence service returns `404`, so the tutorial’s final proof that the batch reached the alternate implementation fails.
- **Details:**
  - **Violation:** Step 5 requires “Every command copy-pasteable” and Part D must prove the repointed pipeline worked.
  - **Impact:** This breaks the final acceptance step of the tutorial’s central payoff for essentially every fresh run.
  - **Evidence:** Step 4 shows the captured ID `019fc888-1092-7836-8e83-355d31b4d054`; Step 5 hard-codes that same historical ID in:
    ```powershell
    curl.exe -s http://localhost:5202/batches/019fc888-1092-7836-8e83-355d31b4d054
    ```
    Batch IDs are generated per run.
  - **Fix:** Capture and parse the reader’s actual response:
    ```powershell
    $result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
    curl.exe -s "http://localhost:5202/batches/$($result.batchId)"
    ```

## Issue 3: The main-path `dotnet run` commands assume paths the tutorial says will vary

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A solo reader follows the instruction to use their own owner name, or an AI places the `.csproj` under a generated `src/...` directory. The first `dotnet run --project modules/priya/converter` command cannot find a project, and the same failure repeats for persistence and watcher. This is probable because owner substitution is explicitly required and nondeterministic project layout is explicitly acknowledged.
- **Details:**
  - **Violation:** “Every command copy-pasteable,” together with the tutorial’s own statement that AI-generated project layout normally differs.
  - **Impact:** Readers can be blocked at the first behavioral finish line and at every subsequent service-start step.
  - **Evidence:** Parts A–C hard-code:
    ```powershell
    dotnet run --project modules/priya/converter
    dotnet run --project modules/priya/persistence
    dotnet run --project modules/priya/watcher
    ```
    Earlier, solo readers are told to use names such as `alex-converter`. The only warning to locate the actual `.csproj` appears later in Part D, after all three affected commands have already been used.
  - **Fix:** Before the first run command, provide a copy-pasteable way to locate and assign each actual project file, then reuse those variables. Alternatively, require a fixed project-root layout as part of each module’s implementation specification.

## Issue 4: The Part B capture command corrupts JSON under the baseline Windows PowerShell

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A Windows 10/11 reader using the built-in Windows PowerShell 5.1 runs `curl.exe ... > batch.json`. Native-output redirection writes through PowerShell’s text encoding rather than preserving curl’s response bytes. Posting that file as `application/json` can produce a framework-level malformed-JSON `400`, blocking Part B and misleading the reader into debugging their persistence contract.
- **Details:**
  - **Violation:** The tutorial requires copy-pasteable Windows commands and says persistence receives “the exact bytes converter returned.”
  - **Impact:** The normal path offered to readers who completed Part A can fail before their persistence implementation executes.
  - **Evidence:** The tutorial uses:
    ```powershell
    curl.exe -s -F "file=@samples/orders.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert > batch.json
    ```
    Windows PowerShell 5.1 does not byte-preserve native stdout through `>`.
  - **Fix:** Let curl write the file directly:
    ```powershell
    curl.exe -s -o batch.json -F "file=@samples/orders.csv;type=text/csv" -F "schema=orders" http://localhost:5101/convert
    ```

## Issue 5: Part D falsely assumes parallel work is already present in the reader’s checkout

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Team members build on separate branches as instructed. Priya reaches Part D after Sam’s work is merged, but Priya’s current branch or checkout has not fetched and integrated it. `modules/sam/converter` is not on disk, so Part D fails before the repointing exercise begins. Separate clones do not synchronize merely because they share a repository.
- **Details:**
  - **Violation:** Part D must be a runnable one-machine payoff, and its resumption state must identify what is required.
  - **Impact:** The team version of the central contract-composition demonstration stalls at its first command.
  - **Evidence:** The tutorial asserts: “Because every member's modules live in the same repository, a teammate's `converter` is already on your disk.” It never requires all implementations to be merged or instructs the reader to switch to/update an integrated branch before Part D.
  - **Fix:** Add a Part D prerequisite that the teammate implementations are merged into an integration branch, then provide the repository’s supported fetch/pull or branch-switch procedure by link or command before starting their services.

## Issue 6: The advertised solo path is internally inconsistent and not executable as written

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A solo reader is told to use only their own durable owner name, then encounters an unconditional instruction to declare nine Priya/Sam/Chen modules. If they sensibly declare only their own three, Part D’s `modules/sam/...` commands cannot run. The “If you are working alone” section acknowledges the conceptual alternative but supplies no commands or declaration guidance, so the advertised solo Part D requires the reader to invent the missing setup.
- **Details:**
  - **Violation:** The tutorial explicitly promises: “Solo? Yes,” and R6 requires a one-machine solo Part D that proves the repoint mechanism.
  - **Impact:** Solo readers, a directly advertised audience, cannot follow the declaration bootstrap and final payoff consistently.
  - **Evidence:** The naming section says a solo reader uses `alex-converter`, `alex-persistence`, and `alex-watcher`. Step 3 then says to run New Module “nine times” for Priya, Sam, and Chen. Part D only provides Sam-path commands, while the solo section merely says to build or run a second version later.
  - **Fix:** Split Step 3 into explicit team and solo paths. A solo reader should declare exactly their own three modules once, then Part D should show commands for running second instances of their own converter and persistence on `5201`/`5202` with a separate database. Retain the existing conformance limitation.

## NITS

- **Nit:** Part D lacks its own explicit behavioral “finish line,” despite the requirement that all four parts have one. Its steps and acceptance-test paragraph partly compensate, so this is unlikely to block a reader.
- **Nit:** Contract 2 shows a `201` body with batch ID `019fc859-...` and immediately says “The `201` also carries” a `Location` containing `019fc876-...`. Even if captured from separate runs, the presentation implies one response and leaves unstated that `Location` must identify the same created batch.
- **Nit:** The tutorial first says the answer key uses `modules/converter/src/...` without an owner tier, but Part D later calls `modules/sam/converter` “the answer key’s shape.” Those statements cannot both be true.
- **Nit:** The IIS appendix does not provide enough procedure for a reader to publish successfully: it omits the ASP.NET Core Hosting Bundle, publish commands, IIS site/app-pool setup, permissions, and LocalDB identity considerations. It also says “three base addresses” change even though watcher has two downstream base-address settings.
- **Nit:** The session claims all duplication-review findings were fixed, but the reviewed `modules.yaml` editing procedure remains substantially present, including the command and YAML example. The added link narrows the duplication but does not implement the routed review’s proposed replacement.