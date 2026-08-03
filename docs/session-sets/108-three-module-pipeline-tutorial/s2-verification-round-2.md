ISSUES FOUND

### Issue 1: Part D processes the file twice and loses the batch ID needed for verification

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A reader drops the single CSV requested in Part D and executes Step 4. That `POST /run-now` processes and archives the file. Step 5 then invokes `POST /run-now` again; with no file left, it returns `[]`, so `$result[0].batchId` is null and the readback request cannot prove the batch reached the teammate’s persistence service. This is the normal main-path execution, not an edge case.
- **Details:**
  - **Violation:** Part D promises a copy-pasteable proof that the batch can be read from port `5202`, but Step 4 runs `curl.exe -s -X POST http://localhost:5103/run-now`, while Step 5 independently runs the same processing request again to assign `$result`.
  - **Impact:** The tutorial deterministically stalls at its final acceptance test after successfully processing the file. This materially defeats Part D’s stated objective.
  - **Evidence:** The tutorial defines `/run-now` as processing every file found and moving successful files to `archive\`. No additional file is dropped between Steps 4 and 5.
  - **Location:** `docs/tutorials/three-module-pipeline.md`, Part D, “Do it,” Steps 4–5.
  - **Fix:** Capture and display the response during Step 4, then reuse it in Step 5:
    ```powershell
    $result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
    $result
    curl.exe -s "http://localhost:5202/batches/$($result[0].batchId)"
    ```
    Remove the second `/run-now` call.

### Issue 2: Parts A and B assume fixed ports that their build instructions never ensure

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A typical reader hands the explicitly recommended contract section to an AI agent, which creates ordinary ASP.NET Core projects with generated or otherwise non-`5101`/`5102` launch URLs. The tutorial then starts them without URL overrides and immediately sends every probe to `localhost:5101` or `localhost:5102`. The calls fail despite working implementations, blocking Parts A, B, and subsequently Part C. Generated ASP.NET projects commonly use project-specific ports, so this is probable.
- **Details:**
  - **Violation:** The session requires “Every command copy-pasteable.” The tutorial assigns ports in the day-one convention, but neither Part A nor Part B’s “What to build” specification requires configuring the listener, and their launch commands provide no `--urls` override.
  - **Impact:** Correctly implemented services can appear broken at the first behavioral finish-line probe. Because Part C depends on both fixed addresses, the mismatch propagates through the main tutorial.
  - **Evidence:** The commands are:
    ```powershell
    dotnet run --project modules/priya/converter
    dotnet run --project modules/priya/persistence
    ```
    followed by requests to ports `5101` and `5102`. In contrast, Part D explicitly uses `--urls` to guarantee its `5201` and `5202` listeners.
  - **Location:** Parts A and B, “What to build” and finish-line launch commands.
  - **Fix:** Explicitly require those listening ports and make the commands deterministic:
    ```powershell
    dotnet run --project modules/priya/converter --urls http://localhost:5101
    dotnet run --project modules/priya/persistence --urls http://localhost:5102
    ```
    Apply the same defensive override to `watcher` on `5103`, or explicitly require and verify its configured listener.

#### NITS

- **Nit:** Part B’s finish line requires reading the stored rows through `GET /batches/{id}`, but its procedure only performs the two POSTs. Capture the first response’s `batchId` and include the corresponding GET command. Part C likewise requires rows in the database without showing a readback command.
- **Nit:** With `"ScheduleEnabled": true`, the scheduled poll can consume a newly dropped file before the manual `/run-now` request. The resulting `[]` is confusing, especially in Part D where the response supplies the batch ID. Document this race and a retry using a uniquely named file, or make the manual probe deterministic.
- **Nit:** Part C repeatedly says “drop a CSV” without assigning unique filenames. Reusing `orders.csv` can collide with an existing `archive\orders.csv` in implementations that do not overwrite archive destinations. Concrete `Copy-Item` commands with distinct destination names would avoid relying on unspecified collision behavior.
- **Nit:** The two-machine appendix only shows exposing `converter` on `5201`. A complete cross-machine Part D also needs `persistence` bound on `5202`, its separate database setting, and firewall access for both ports.
- **Nit:** “If the remote call times out rather than being refused, that is the firewall” is too categorical. Routing failures, an incorrect address, network ACLs, or a disconnected host can also time out.