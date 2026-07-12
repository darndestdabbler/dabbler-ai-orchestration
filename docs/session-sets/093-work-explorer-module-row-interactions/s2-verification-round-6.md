ISSUES FOUND

- **Issue 1: The byte-diff guard rejects valid stamps when the first existing YAML key starts with `m`**
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The D4 contract requires a format-preserving `module:` splice into valid configuration blocks. `assertStampedTextValid()` claims to verify that the result is “the original with EXACTLY the single inserted line,” but its longest-common-prefix/suffix calculation is not insertion-safe when the inserted text and following original text share a prefix.
    - **Impact:** A valid unstamped set can be refused, and because phase one gates the entire batch, one such set prevents every selected set from being assigned. For example, any configuration whose first key is `model:`, `mode:`, or another key beginning with `m` triggers this failure despite the produced splice being correct.
    - **Evidence:** In `assertStampedTextValid()`, the common prefix continues past the insertion point when the original block’s first character is `m`, because the inserted line also starts with `m`:
      ```ts
      while (p < minLen && originalText[p] === newText[p]) p++;
      ```
      Given:
      ```yaml
      model: opus
      ```
      and the correct result:
      ```yaml
      module: greeter
      model: opus
      ```
      the calculated `newMiddle` becomes effectively `odule: greeter\nm`, not `module: greeter\n`, so the expected-line regex rejects it. All current tests use `tier:` as the first key and therefore miss this case.
  - **Location:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts` → `assertStampedTextValid()`
  - **Fix:** Validate against the deterministic insertion anchor rather than inferring an insertion through longest-common-prefix/suffix. Pass the known `insertAt`/`inserted` values into the guard, reconstruct the expected text from `originalText`, and require exact equality with `newText`; alternatively, recompute the expected result using `stampModuleIntoSpecText(originalText, slug)`. Add a regression test with `model:` as the first configuration key and verify both single- and multi-set assignment succeed.