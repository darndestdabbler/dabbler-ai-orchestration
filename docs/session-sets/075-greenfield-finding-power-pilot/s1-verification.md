## Verdict

**ISSUES_FOUND**

### Major — Metadata contract cannot represent the settled 3-arm roster
**File(s):** `docs/greenfield-matrix-protocol.md` (§6), `ai_router/prompt-templates/greenfield-matrix-addendum.md` (step 6), `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/README.md` (“Required `metadata.json` fields”)

**Issue →**
- **Requirement violated:** **D5** + the settled **matrix roster/CLI**. One run contains three scored provider×surface arms: `push:anthropic`, `pull:openai`, and `pull:google`. The required `metadata.json` schema records only one `pullProvider` / `pullModel`.
- **Impact:** A telemetry package cannot faithfully identify the Google pull arm/model for the same run. That breaks reproducibility of the exact run configuration and prevents clean per-arm attribution/costing from metadata alone.
- **Evidence:**  
  - Protocol §6 example has only:
    ```json
    "pushProvider": "anthropic",
    "pushModel": "claude-sonnet-4-6",
    "pullProvider": "openai",
    "pullModel": "gpt-5-4"
    ```
    even though §8 fixes the roster as `push:anthropic` vs `{pull:openai, pull:google}`.
  - Same section says: “A single matrix run produces telemetry for the whole roster,” but the schema has only one pull identity slot.
  - Addendum step 6 repeats singular “push / pull provider+model”.
  - README repeats singular `pullProvider` / `pullModel`.

**Location →**
- `docs/greenfield-matrix-protocol.md` §6
- `ai_router/prompt-templates/greenfield-matrix-addendum.md` step 6
- `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/README.md` required-fields table

**Fix →**
- Replace the singular push/pull identity fields with a roster field that records **all scored arms**, e.g.:
  ```json
  "matrixArms": [
    {"surface": "push", "provider": "anthropic", "model": "..."},
    {"surface": "pull", "provider": "openai", "model": "..."},
    {"surface": "pull", "provider": "google", "model": "..."}
  ]
  ```
- Update the protocol example, addendum, and README to use that contract consistently.
- If roster changes are allowed, record them in the same structure instead of relying on prose.

### Major — Arm-vs-cell vocabulary is inconsistent where scoring/provenance are defined
**File(s):** `docs/greenfield-matrix-protocol.md` (§3, §8), `docs/greenfield-adjudication-rubric.md` (“Scoring Unit”, “Verdict Recording”), `ai_router/prompt-templates/greenfield-matrix-addendum.md` (step 4), `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/README.md` (layout comment)

**Issue →**
- **Requirement violated:** **D2** + the explicit internal-consistency requirement on the **arm-vs-cell scoring unit**.
- **Impact:** The canonical adjudication/provenance record is ambiguous about whether TP credit is recorded by **provider×surface arm** or by **cell**. That ambiguity directly threatens correct computation of per-arm TP/FP/share-of-union/unique-TPs for `pull:openai` vs `pull:google`.
- **Evidence:**  
  - Protocol §3 says the scoring unit is the **provider×surface arm**, but the section header is “Per-Cell Scoring”.
  - Protocol §8 says: “the established **2-cell** matrix: one `push` cell and two `pull` cells,” which mixes terms and counts inconsistently.
  - Rubric explicitly says the scoring unit is the **arm**, “**NOT** the `(push, pull)` matrix **cell**”.
  - But the rubric’s “Verdict Recording” says adjudication records “which **cell(s)** get credit for each TP”.
  - Addendum step 4 repeats “which **cell(s)** caught each TP”.
  - README layout says `adjudication.md` contains “per-**arm** credit”.

**Location →**
- `docs/greenfield-matrix-protocol.md` §3, §8
- `docs/greenfield-adjudication-rubric.md` “The Scoring Unit: the provider×surface arm”, “Verdict Recording”
- `ai_router/prompt-templates/greenfield-matrix-addendum.md` step 4
- `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/README.md` layout block

**Fix →**
- Canonicalize **arm** as the scored and recorded provenance unit everywhere findings are credited.
- In `adjudication.md`, require an explicit per-finding arm list such as:
  ```md
  armsCaught: [push:anthropic, pull:google]
  ```
- If “cell” must remain for historical/pairwise-comparison reasons, define it once as a separate concept and never use it as the scoring/provenance unit.
- Rename/rewrite the conflicting echoes (`Per-Cell Scoring`, “which cell(s) caught...”, “one push cell and two pull cells”) accordingly.

### Minor — Opening purpose line overclaims beyond adjudicated-union relative yield
**File:** `docs/greenfield-matrix-protocol.md` (Purpose)

**Issue →**
- **Requirement violated:** **D2** / honest framing. The purpose says the pilot answers “which provider x surface cell catches the most real defects,” which is stronger than the settled claim of **relative finding yield + precision against the adjudicated union**.
- **Impact:** Limited, because §1 immediately corrects the framing; still, the top-line statement overpromises actual defect-catching rather than adjudicated-union-relative performance.
- **Evidence:** The opening purpose sentence uses “catches the most real defects”; §1 later says “The honest claim is ‘relative finding yield and precision against the adjudicated union,’ never ‘recall.’”

**Location →**
- `docs/greenfield-matrix-protocol.md` opening “Purpose”

**Fix →**
- Change the purpose sentence to: “which provider×surface arm shows the highest **relative finding yield and precision against the adjudicated union** on fresh, not-yet-verified work.”
