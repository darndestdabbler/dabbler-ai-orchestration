### 1. Same-point matching

There are 16 distinct findings across the three runs with output (a, b, c).

*   **F1:** `reviewDecision` is misinterpreted as proof of enforcement (Major)
    *   **Found by:** a, b
*   **F2:** Hotfix is tagged/deployed without running full test suite (Major)
    *   **Found by:** a, c (as nit)
*   **F3:** `ADVISORY` cap in prompt suppresses proven failures (Major)
    *   **Found by:** a
*   **F4:** Owner identity/approval cannot be verified without an owner roster (Major)
    *   **Found by:** b
*   **F5:** Required test framework is not specified, breaking the "runnable" contract (Major)
    *   **Found by:** b, c
*   **F6:** Hardcoded entry point (`app.py`) in tutorial is not guaranteed to exist (Nit)
    *   **Found by:** a, b, c
*   **F7:** Date-based review script output filename causes collisions (Nit)
    *   **Found by:** a, c
*   **F8:** Tutorial contradicts itself on whether admin enforcement is optional (Nit)
    *   **Found by:** a
*   **F9:** Historical CODEOWNERS state is not checked for historical PRs (Nit)
    *   **Found by:** a
*   **F10:** Script logic for finding "freshest main" is flawed (Nit)
    *   **Found by:** b, c
*   **F11:** Prompt is vulnerable to injection from repository file contents (Nit)
    *   **Found by:** b, c
*   **F12:** Evidence gathering for lightweight tags is incomplete (Nit)
    *   **Found by:** b
*   **F13:** Review does not check for cross-branch name collisions (Nit)
    *   **Found by:** b
*   **F14:** Review ignores uncommitted changes in a dirty worktree (Nit)
    *   **Found by:** b
*   **F15:** Self-check misses verification of actual PR approvals (Nit)
    *   **Found by:** b
*   **F16:** Script checks for `CODEOWNERS` in only one of three supported locations (Nit)
    *   **Found by:** c

### 2. Overlap matrix

| Pair | &#x7c;Intersection&#x7c; | &#x7c;Union&#x7c; | Jaccard Index |
| :--- | :--- | :--- | :--- |
| a-b | 2 | 15 | 0.133 |
| a-c | 3 | 11 | 0.273 |
| a-d | 0 | 7 | 0.000 |
| b-c | 4 | 13 | 0.308 |
| b-d | 0 | 10 | 0.000 |
| c-d | 0 | 7 | 0.000 |

### 3. Marginal-yield curve

Total distinct findings discovered: 16.

*   **Run a:** contributed **7** new findings.
*   **Run b:** contributed **8** new findings.
*   **Run c:** contributed **1** new finding.
*   **Run d:** contributed **0** new findings.

Fraction of the total pool (16 findings) captured by each single run:

*   **Run a:** 7 / 16 = 43.8%
*   **Run b:** 10 / 16 = 62.5%
*   **Run c:** 7 / 16 = 43.8%
*   **Run d:** 0 / 16 = 0.0%

### 4. Decorrelation read

The evidence favors the reading that **gemini-3-1-pro under-finds** for this discovery task.

All five Majors reported by gpt-5-6 are plausible, high-consequence findings rooted in factual inconsistencies within the provided artifacts, not subjective judgment calls. They represent concrete failures:
1.  **Process Flaw:** The prompt explicitly allows misinterpreting `reviewDecision` (F1).
2.  **Process Flaw:** The hotfix tutorial skips integrated testing before deployment (F2).
3.  **Rubric Flaw:** The prompt's logic demonstrably hides proven failures under an `ADVISORY` cap (F3).
4.  **Evidence Gap:** The review claims to check owner approval without an owner data source (F4).
5.  **Deliverable Failure:** The tutorial omits a critical constraint (test framework), breaking its "copy-pasteable" promise (F5).

These are not borderline issues. They are structural defects in the process and documentation being verified. The fact that two prior gpt-5-6 rounds (R18/R20) missed them highlights the salience-limited nature of sequential review and strengthens the case that these are real, latent findings.

Gemini's `VERIFIED` verdict, which includes missing even clear-cut nits like the filename collision (F7) or prompt injection vector (F11), indicates it is not merely grading to a stricter standard; it is failing to detect the underlying conditions entirely.

**Implication:**
*   **Discovery Phase:** Mixing in this cheaper provider would have actively reduced the total finding harvest. For discovery, maximizing the yield from the most capable model is paramount.
*   **Verdict Phase:** In a verdict role, a decorrelated pass that returns "clean" against Majors from the primary model serves as a powerful signal for human adjudication. It flags a potential primary-model hallucination or over-sensitivity. Here, however, it appears to be a false negative.

### 5. Sizing recommendation

The data supports a fan-out of **K=2 with the same high-performance model**.

**Candidate Configuration Analysis:**

1.  **K=1 (gpt-5-6):**
    *   **Cost:** ~$0.25
    *   **Coverage:** Low and unpredictable (44-63% of the pool). This is an insufficient harvest.
2.  **K=2 same-model (gpt-5-6):**
    *   **Cost:** ~$0.50
    *   **Coverage:** Excellent (94% in this experiment). The low Jaccard index (0.133 for a-b) shows that two runs are highly complementary, effectively covering each other's stochastic blind spots. This configuration provides a near-complete harvest for a minimal cost, far cheaper and faster than the 17-round sequential baseline.
3.  **K=2 same-model + 1 cross-provider (gpt-5-6 x2, gemini-3-1-pro x1):**
    *   **Cost:** ~$0.55
    *   **Coverage:** No improvement over K=2 in this experiment. The cheap cross-provider pass added 10% to the cost for 0% marginal yield.

---

**Concrete Recommendation:**

*   **Default Configuration:** Set discovery fan-out **K=2**, using the **same preferred model** for both calls.
*   **Orchestration Logic:**
    *   Execute two identical, independent verification calls in parallel.
    *   Merge the two resulting finding sets (issues and nits).
    *   Present the deduplicated union of findings to the operator for remediation.
*   **Supplementary Pass:** Reserve the cheap, cross-provider call for an optional "adjudication" step. If the primary K=2 runs produce a surprising or high-stakes finding, an operator can trigger this pass to get a decorrelated signal before investing significant remediation effort. It is a tool for verdict validation, not initial discovery.