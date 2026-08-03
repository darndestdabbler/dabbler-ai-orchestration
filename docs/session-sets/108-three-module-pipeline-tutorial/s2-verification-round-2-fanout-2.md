ISSUES FOUND

## Issue 1: Round 1’s Part D read-back remediation consumes the file before capturing its batch ID

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A reader follows Part D exactly. Step 4 processes the only pending CSV and moves it to `archive\`. Step 5 calls `/run-now` again without adding another file, so the documented endpoint returns `[]`. `$result[0].batchId` is therefore null and the subsequent `GET /batches/` cannot prove anything. This is probable on the main path because it follows directly from the documented one-entry-per-found-file behavior and the preceding successful run.
- **Location:** Part D, **Do it**, steps 4–5.
- **Details:**
  - **Violation:** Part D promises a copy-pasteable behavioral proof: “you can read the batch back out of their `persistence` on `5202`.” It instead runs:
    ```powershell
    curl.exe -s -X POST http://localhost:5103/run-now
    ```
    and then runs the same operation again:
    ```powershell
    $result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
    curl.exe -s "http://localhost:5202/batches/$($result[0].batchId)"
    ```
  - **Impact:** The main Part D finish line hard-stalls, preventing the tutorial’s central contract-composition proof. This changes the merge decision because Part D is explicitly the tutorial’s payoff.
  - **Evidence:** Part C defines `/run-now` as returning one result per file found and `[]` for an empty folder. A successful first call archives the file, leaving nothing for the second call.
- **Fix:** Capture and reuse the response from the first and only processing call:
  ```powershell
  $result = curl.exe -s -X POST http://localhost:5103/run-now | ConvertFrom-Json
  $result
  curl.exe -s "http://localhost:5202/batches/$($result[0].batchId)"
  ```
  Remove the earlier unassigned `/run-now` call.

## Issue 2: Reusing `orders.csv` makes the integration exercises duplicate or collide instead of demonstrating fresh processing

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A typical reader uses the only supplied good sample, `samples/orders.csv`, throughout the tutorial. Part B stores `sourceFile: "orders.csv"` in the reader’s database. In Part C, dropping that same file therefore yields `AlreadyStored`, not a fresh `Stored` result. Reusing it for later Part C or Part D probes can also collide with the existing `archive\orders.csv`. In the team version, the teammate’s database will likewise already contain `orders.csv` from their own Part B. This is probable because the tutorial supplies only that good sample and repeatedly says “drop a CSV” without directing the reader to use a new destination filename.
- **Location:** Part B finish-line probe; Part C Phase B steps 4–5; Part D step 4.
- **Details:**
  - **Violation:** The tutorial promises that Part C proves “a real CSV’s rows [are] in a database” through the watcher and that Part D produces a fresh `Stored` result through somebody else’s services. The contract simultaneously states: “`sourceFile` is unique. A file is loaded once, ever.”
  - **Impact:** Readers can receive `AlreadyStored`, read rows inserted during an earlier exercise, and falsely conclude that the current end-to-end path stored them. Repeated copies can also encounter an unspecified archive-name collision and stall. This materially undermines the tutorial’s central behavioral proof.
  - **Evidence:** Part B creates `batch.json` from `samples/orders.csv`, whose contractual `sourceFile` is `orders.csv`, and posts it twice. No later step supplies or names a fresh good file, while the shown real-run transcripts use distinct names such as `orders-partd-3.csv` and `orders-both-repointed.csv`.
- **Fix:** Give each processing probe an explicit unique destination filename, for example:
  ```powershell
  Copy-Item samples/orders.csv C:\DabblerCsvPipeline\incoming\orders-partc-happy.csv
  Copy-Item samples/orders-invalid.csv C:\DabblerCsvPipeline\incoming\orders-partc-invalid.csv
  Copy-Item samples/orders.csv C:\DabblerCsvPipeline\incoming\orders-partc-deferred.csv
  ```
  Use another unique name in Part D, preferably including both owners, and state that uniqueness matters because `sourceFile` is the delivery identity.

## NITS

- **Nit:** Part B says nothing needs to be running when resuming, but its preferred `curl` command calls `localhost:5101` without first telling the reader to start `converter`. It also requires a `GET /batches/{id}` finish-line proof without providing that command. Add the start command and a concrete read-back command.
- **Nit:** Part C leaves `"ScheduleEnabled": true` while instructing the reader to drop a file and immediately call `/run-now`. Near a minute boundary, the scheduled poll can consume the file first and make the manual call return `[]`. Disable scheduling during deterministic hand probes or warn about this race.
- **Nit:** The SFTP appendix presents `DABBLER_PIPELINE_SFTP` as though the reader’s generated watcher supports it, but the build specification only requires `Source.Kind: LocalFolder`. State explicitly that these variables are answer-key capabilities, or require the reader to implement the SFTP source before using them.
- **Nit:** The cross-machine appendix asserts, “If the remote call times out rather than being refused, that is the firewall.” A timeout can also result from routing, an incorrect address, VPN/network policy, or a nonresponsive host. Change this to “the firewall is a likely cause” and list basic reachability checks.
- **Nit:** The fallback project search can return both application and test projects—and, in Part D, projects from all three modules—yet says to use “the folder that comes back.” Restrict searches to the relevant module and tell readers to select the runnable web project rather than a test project.