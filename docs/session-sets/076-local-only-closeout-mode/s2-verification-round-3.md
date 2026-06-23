- **Critical/Major issues:** None.

- **(a)** Yes. `_is_compound_identifier(raw, start, end)` matches the stated requirement:
  - It expands over the full contiguous `[\w=-]`-style token and exempts **only** when there is an extra alnum/underscore character outside the banned label span.
  - That means bare labels are still flagged when standalone or punctuation-delimited: `docs-only`, `` `docs-only` ``, `docs-only.`, `explorer-only.`
  - Dangling-separator cases are correctly **not** exempt because the surrounding token adds only `-` / `=` and no extra word component: `docs-only-`, `=docs-only`, `docs-only=`, `explorer-only-`
  - Legitimate Set 075 identifier forms stay exempt: `docs-only-excluded`, `targetClass=docs-only`, `diffClass=docs-only-excluded`
  - `source-dominated` and `packaging-small` are unaffected because they contain no banned literal at all.

- **(b)** No blocking correctness or test-adequacy gap remains in the Round-2 refinement. The added regressions cover the prior loosened-boundary bug, the explicit sentence-ending case, dangling `-` / `=` cases, and the key=value exemption path.

VERDICT: VERIFIED