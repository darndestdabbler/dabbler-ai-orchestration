ISSUES FOUND

- **Issue 1: The manifest-bootstrap remediation still tells readers to declare the converter a second time**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Session 2 follows both settled instructions and writes a bootstrap that predeclares all nine modules, followed by Part A telling each reader to declare `{owner}-converter`. Because the detailed Part A sequence is the authority Session 2 writes from, this contradiction is likely to propagate. A reader then attempts to add an already-existing slug and is rejected at the first implementation step.
  - **Details:**
    - **Violation:** R9 requires: **“All nine entries land in `docs/modules.yaml` in a single commit, before anybody branches.”** But Part A still says: **“The reader declares `{owner}-converter`, sets its code root…”**
    - **Location:** `s1-walk-outline.md` → R9 and Part A.
    - **Impact:** The round-2 fix for concurrent manifest edits is incomplete. The tutorial can either duplicate a manifest entry—which R1 says the product rejects—or give Session 2 mutually incompatible instructions about when modules are declared. This would stall readers on the main path and changes the merge decision for the outline.
    - **Evidence:** R9’s example already contains `priya-converter` with its title, `codeRoots`, and `planPath`; Part A then explicitly directs Priya to declare that same module and set the same code root.
    - **Fix:** Change Part A to start work in the **already-declared** `{owner}-converter` module and create/start its plan or session set. Reserve all manifest declaration and code-root assignment exclusively for R9’s bootstrap step.

#### NITS

- **Nit:** R1 claims owner-based slugs are unique “with no allocation step at all,” but `{owner}` is defined through personal names. Two members with the same normalized name would still collide. Define it as a repository-unique, stable owner ID or VCS handle.

- **Nit:** R5 says the `ConnectionStrings__Orders` environment override is “the one Part D wants,” while R6 says Part D changes exactly two settings “and there are no others.” Clarify that each member’s database name is established during Part B, leaving only the two watcher endpoint changes for Part D.

- **Nit:** R6’s heading says Run 2 had “nothing on the `51xx` band at all,” although R5 says the watcher remains on `5103`. The recorded steps correctly exclude only `5101` and `5102`; narrow the heading accordingly.