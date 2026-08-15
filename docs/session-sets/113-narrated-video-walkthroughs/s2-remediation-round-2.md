# Session 2 remediation — round 2 (supplementary discovery pass)

Round 2 was the completeness-critic pass over the same evidence, run
before any remediation. It raised **one Major and three nits**, all
accepted. The fixes were made in the single remediation pass covering
both discovery rounds; the full reasoning, the disputed nit and the
disclosed post-snapshot change are in
[`s2-remediation-round-1.md`](s2-remediation-round-1.md), which is the
narrative record for both rounds.

This file is the per-round disposition, so a reader of round 2's
findings can see what happened to each without reading the other file.

| # | Finding | Disposition |
| :--- | :--- | :--- |
| Major 1 | The quarantine gate misses common CSS ID selectors in portable step text | **Fixed.** New `css-id-selector` rule in `scenario_lint.py`, with a planted `#green-button` violation and a look-alike covering `issue #123`, a bare `#`, a `docs/guide.md#anchor` fragment and `C#`. Adding it also exposed that the lint fixture's unquoted `#` started a YAML comment and truncated the planted text — the fixture now JSON-quotes injected strings. |
| Nit 1 | `check_scenario_dir` claims byte-for-byte but `read_text` normalizes CRLF | **Observation accepted, proposed fix refused, with evidence.** Byte comparison would fail on every Windows clone (`core.autocrlf=true`; `.gitattributes` exempts only the stamped verification artifacts). The wording was wrong, not the code — corrected everywhere, and two tests now pin that the tolerance is line endings and nothing else. See round 1's sidecar, *Nit disputed, with evidence*. |
| Nit 2 | The exemplar totals 46 seconds while `README.md` and the changelog say 44 | **Fixed by removal.** The number is derived from the source and rendered into all four documents; restating it in prose gave it somewhere to drift. Both prose copies now say "under a minute", and the README records the 44 → 46 drift as the worked example of why. |
| Nit 3 | `yaml.safe_load` silently accepts duplicate mapping keys | **Fixed.** `_StrictLoader` refuses duplicates, naming the key, its line, and the content that would have been dropped. Four tests, including the look-alike that the same key appearing once in each of two steps is fine. |

Round 2's Major and round 1's Majors are independent findings; no
finding was re-reported across rounds, and nothing here was settled by
the orchestrator's own reasoning alone. The disputed nit is settled by
deterministic, checkable evidence (`git config core.autocrlf`, the
committed `.gitattributes`, and the Set 120 S3 incident recorded in that
file's own header comment), not by an opinion about which comparison is
nicer.

Test evidence and the required-suite plan: see round 1's sidecar.

---

## Round 3 (remediation-review cycle 1) — the fix delta

| Finding | Fix verdict | What happened |
| :--- | :--- | :--- |
| L1 — exemplar declares no clone / repository-root context | **fix-accepted** | Settled. |
| L2 — the same defect from the second round-1 lens | **duplicate-of L1** | Settled with L1. |
| L3 — the CSS-id rule still misses type-qualified selectors | **fix-rejected** | Accepted and fixed; see below. |

### The rejected fix, and why the rejection was right

The first `css-id-selector` pattern was `(?<![\w#])#[A-Za-z_-][\w-]*`.
Its negative lookbehind existed to keep URL and file fragments out
(`docs/guide.md#anchor`), and it did — but it also excluded
**`button#save`**, because the character before `#` is a word character
there too. Browser tooling emits type-qualified selectors constantly, and
`button#save` survives an unquoted YAML scalar (YAML needs *whitespace*
before `#` to begin a comment), so this was a live authoring path that
the lint, the corpus test and every generated document would have passed
in silence.

The rule is now `(?<![\w#./-])[A-Za-z]*#[A-Za-z_-][\w-]*`: an optional
type prefix is allowed, but only when it begins at a word boundary and
does not follow `.` or `/`. That is what separates `button#save` (in)
from `guide.md#anchor` and `https://example.test/guide#setup` (out),
while the identifier requirement after `#` keeps `issue #123`, a bare
`#` and `C#` out as before.

The verifier's own executable acceptance criterion was run verbatim and
exits 0:

```
python -c "__import__('sys').exit(not any(r.name == 'css-id-selector' and r.pattern.search('Click button#save.') for r in (__import__('sys').path.insert(0, 'ai_router') or __import__('scenario_lint')).RULES))"
```

A second falsifier case was added rather than widening the first one.
The point is recorded in the test: `button#save` is exactly the form the
first fix did not think of, and a falsifier that only ever plants the
shape its author already had in mind is the gap L-112-1 names. Ten
further discriminations are asserted directly against the pattern in
`TestCssIdSelectorBoundary` (`div#main` and `a#b` in; `notes.md#top`, a
bare `#`, `C#` and both URL fragments out).

Suites after this cycle: `test_scenario_model.py`,
`test_scenario_render.py`, `test_scenario_lint.py` — **119 passed**.
Corpus `--check` and `scenario_lint` both clean.
