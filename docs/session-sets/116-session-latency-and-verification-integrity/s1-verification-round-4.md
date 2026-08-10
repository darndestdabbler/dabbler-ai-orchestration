ISSUES FOUND

Fix verdict: L1 e2e command timing is now documented from a checked-in transcript -- accepted-with-modification  
Fix verdict: L2 full-suite serial/parallel parity evidence is not bound to a reconstructable measured tree -- fix-rejected  
Fix verdict: L3 every new run record now requires a finite positive duration -- fix-accepted  
Fix verdict: L4 e2e evidence still does not identify the immutable tree actually measured -- fix-rejected  
Fix verdict: L5 -- duplicate-of L2  
Fix verdict: L6 -- duplicate-of L3  
Fix verdict: L7 -- duplicate-of L4  
Fix verdict: L8 -- duplicate-of L2  

### Issue 1: The full-suite parity transcript is not bound to a reconstructable measured tree

- **Location:** `docs/session-sets/116-session-latency-and-verification-integrity/s1-full-suite-parity-benchmark.txt`; `CONTRIBUTING.md`, “Same-tree parity proof”; `test-runs.jsonl`
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A maintainer reviewing or later re-deriving the `-n auto` adoption attempts to establish that serial and parallel pytest used the same collection-affecting tree. This is probable because suite evolution already invalidated the previous benchmark and parity is an explicit adoption prerequisite. The only digest covers `ai_router/`, while `pytest.ini`, `pyproject.toml`, dependencies, and other repository inputs that can affect collection or execution are outside that digest. The transcript’s custom header merely asserts the digest; pytest did not emit it, and no measured commit is identified. The maintainer therefore still cannot audit the claimed same-tree parity.
- **Acceptance criterion:** `JUDGMENT - Does checked-in evidence contain the actual serial and parallel full-suite outputs with identical pass/skip counts and timings, both tied to the same immutable, reconstructable commit covering all test-affecting files rather than only an ai_router subtree digest asserted after execution?`
- **Details:** **Violation:** The session requires “**Prove parity before adopting: identical passed/skipped counts serial vs parallel, and record both timings**,” while the remediation claims the digest is “**cryptographic proof of one tree**.” **Impact:** A reasonable reviewer still cannot establish the prerequisite for making parallel execution the default, materially affecting the merge decision. **Evidence:** The benchmark explicitly defines `surfaceDigest` as an “`ai_router/` content digest.” It does not cover the changed `pytest.ini` or `pyproject.toml`, and the raw pytest sections contain no tool-emitted digest or commit binding. The JSONL records were also created separately after execution and their structured `command` fields do not identify the serial command.
- **Fix:** Run both variants against an immutable commit, capture that commit identity with the execution output, and cite it from `CONTRIBUTING.md`. This challenges the Round 3 L8 remediation specifically: adding transcript text did not supply the missing tree binding.

### Issue 2: The e2e timing source still cites a future shipping commit rather than the measured commit

- **Location:** `CONTRIBUTING.md`, Layer 1 timing paragraph; `docs/session-sets/116-session-latency-and-verification-integrity/s1-e2e-parity-benchmark.txt`
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** After the e2e suite changes again, a contributor attempts to check out the tree that produced 113.13s/64.32s. This is probable because suite growth already invalidated the former timing and reproducibility is the reason a commit citation was required. They cannot do so: the source identifies an uncommitted working tree atop a base commit and says later `git blame` will reveal the commit in which the evidence ships, which is not necessarily the tree on which pytest ran.
- **Acceptance criterion:** `JUDGMENT - Does CONTRIBUTING.md cite a checked-in e2e execution record that identifies an immutable, reconstructable commit actually used for both measured runs?`
- **Details:** **Violation:** The task requires “**Cite the measurement and its commit so the next reader can re-derive it**.” **Impact:** The corrected timing remains non-reproducible from source control, materially defeating the timing-documentation objective. **Evidence:** The benchmark says the run used “the working tree … on top of base commit `d11d8d...`” and delegates identity to future `git log`/`git blame`. That identifies the evidence’s eventual shipping commit, not the commit actually executed. Its only current identity is again the partial `ai_router/` digest. This is not a complaint that final close-out has not happened; an immutable measured tree identifier is part of the timing evidence due before review.
- **Fix:** Measure the e2e commands on an immutable intermediate commit and record that SHA in both the transcript and `CONTRIBUTING.md`, or provide an equivalently reconstructable full-tree object identity. This challenges the Round 3 L7 remediation specifically.

### NITS

- **Nit:** `s1-e2e-parity-benchmark.txt` says `CONTRIBUTING.md` cites the earlier 113.69s/63.47s figures, but the current document cites 113.13s/64.32s.
- **Nit:** The serial and e2e JSONL rows retain the generic structured command `.venv/Scripts/python.exe -m pytest ai_router/tests -q`; their actual `-n 0` and `-m e2e` commands appear only in free-text `detail`, reducing structured query accuracy.