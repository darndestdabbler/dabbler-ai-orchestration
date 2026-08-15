# Session 2 remediation — discovery rounds 1 and 2

Round 1 was a two-lens discovery fan-out (`gpt-5-6-sol`, spec-conformance
and failure-scenario); round 2 was the supplementary completeness pass
over the same evidence, run **before** any remediation. Three Majors were
raised across the three calls — two of which are the same defect seen by
two independent lenses — plus eight nits. Every finding was accepted and
fixed except one, which is disputed with evidence and named below.

---

## Majors

### M1 — the exemplar is not followable by its declared audience (rounds 1a and 1b)

**Accepted, and it was the right catch.** Two independent lenses reached
it separately, which is the strongest signal the round produced.

The scenario declared its audience as *"anyone who has just installed the
Dabbler AI Orchestration extension"* while its baseline ran
`cd tools/dabbler-ai-orchestration` and its prerequisites assumed a prior
`npm install` in that directory. An extension user has no repository
checkout at all, and even a contributor could not tell what that `cd` was
relative to — from inside the extension package it resolves to a
nonexistent nested path. The set's whole claim is that a stranger can
follow the document, so this defeated the deliverable rather than
blemishing it.

Fixed in four places:

- `audience` now names *someone working in a local clone of the
  `dabbler-ai-orchestration` repository*, and says explicitly that this
  drives a throwaway sample project the repository ships, not the
  reader's own work.
- A new first prerequisite establishes the clone **and** the starting
  directory: *"the root of that clone — the folder that contains
  `ai_router/` and `tools/`"*, with a pointer elsewhere for a reader who
  has no clone.
- The two remaining prerequisites are rewritten as commands runnable from
  that root.
- `baseline.description` repeats the starting directory at the point of
  use, and a new `recovery` entry catches the exact error a reader in the
  wrong folder sees (`npm error Missing script: "walk"`).

The general rule is now written down where the next author will hit it:
`docs/walkthroughs/README.md` → *Write it for a stranger* gains two
numbered items — the audience line is a promise that must not be broader
than the prerequisites, and a `cwd:` is relative to something the
rendered document has to name.

### M2 — the quarantine lint had no CSS id rule (round 2)

**Accepted.** `scenario_lint` covered attribute selectors, hyphenated
class selectors, locator-engine prefixes, XPath and driver API calls —
and missed `#green-button`, which is as common as any of them. The
verifier noted the irony that this session's own render fixture uses
`#green-button` as a driver selector while no rule covered it appearing
in portable text.

Added the `css-id-selector` rule with both falsifiers. The pattern
requires a CSS-identifier start character, so `issue #123` does not
match, and a lookbehind excludes URL fragments (`docs/guide.md#anchor`)
and `C#`. `test_every_rule_is_covered_by_a_case` already asserted every
rule has a case, so the new rule could not be added without them.

Writing that falsifier surfaced a second, smaller defect in the test
fixture: an unquoted `#` starts a YAML comment, so the planted violation
was being truncated before it reached the lint. The fixture now
JSON-quotes the injected text — a falsifier that silently plants nothing
is the failure L-112-1 is about.

---

## Nits — accepted and fixed

1. **Renderers received the whole `Scenario`, including `.drivers`**
   (rounds 1b, 2). The claim that the quarantine was structural was
   overstated: renderers happened not to read the block, and the test
   protected only that. `render_all` now passes
   `replace(scenario, drivers={})`, so the guarantee is a property of the
   call. Two new tests: replacing the **entire** driver block (different
   driver name, unrelated keys) leaves all four outputs identical, and a
   stub renderer asserts it is handed `{}`.

2. **`--check` exited 0 when the default corpus was empty** (round 1a).
   A whole-tree check that passes having examined nothing is
   indistinguishable from one that examined everything. Now
   `EmptyCorpusError`: a `docs/walkthroughs/` that exists but holds no
   `scenario.yaml` is refused (exit 1). A tree with no such directory at
   all — the ordinary state of a pip-installed router — still exits 0,
   and both branches have tests.

3. **WebVTT cue safety** (rounds 1a, 1b). Narration containing a blank
   line silently split one step into two cues, the second untimed; `-->`
   in a payload can be read as a timing line. The renderer now flattens
   every cue payload to a single line, so authored prose may wrap freely,
   and the model refuses `-->` in `narration` and in `action` (the
   caption fallback) with the replacement named in the message. `expect`
   is unaffected — it never reaches a cue.

4. **Markdown table cells were unescaped** (round 1b). A recovery action
   naming `npm run walk | tee walk.log`, or a checkpoint authored as a
   wrapped block scalar, broke the generated table. Cells now flatten and
   escape `|`, with a test asserting every generated row keeps its own
   column count.

5. **`yaml.safe_load` accepted duplicate keys** (rounds 1b, 2). Last-one-
   wins, silently — precisely the "typo that quietly drops content"
   failure this parser exists to catch. A `_StrictLoader` now refuses
   duplicates, naming the key, the line, and what would have been lost.

6. **"the state the setup below leaves you in"** (round 1a) — the setup
   is rendered *above* that table. Reworded to remove the direction
   rather than reverse it, so it cannot go stale again if sections move.

7. **44 vs 46 seconds** (round 2). The exemplar's total moved when a step
   was corrected, and `README.md` and the changelog fragment still said
   44. Fixed by **removing** the number from both — it is derived from the
   source and rendered into all four documents, and restating it in prose
   gave it somewhere to drift, which is the defect this directory exists
   to prevent. Recorded there as an example rather than quietly patched.

---

## Nit disputed, with evidence

**"The claimed byte-for-byte divergence check normalizes line endings"
(all three calls). The observation is correct; the proposed fix —
comparing `read_bytes()` to `text.encode("utf-8")` — is refused.**

It would break `--check` on every Windows clone of this repository, and
the repository has already paid for this exact mistake once.

- `git config core.autocrlf` returns `true` here.
- `.gitattributes` marks only `docs/session-sets/**/s*-verification*.md`
  and `s*-issues*.json` as `-text`. Everything under `docs/walkthroughs/`
  is treated as text, so a fresh checkout writes it CRLF while the
  renderer emits LF.
- Under a byte comparison, all four documents would report drift on a
  clean clone with nothing changed — and the pytest corpus test would fail
  for every Windows contributor.
- The precedent is recorded in `.gitattributes` itself: Set 120 S3, where
  a rebase rewrote a stamped verification artifact LF → CRLF and grew it
  five bytes with no character changed.

**What was wrong was the claim, not the code.** The gate's contract is
*the same content*, not *the same bytes*. Every "byte-for-byte" /
"byte-identical" phrase in the module docstring, the test docstring, the
inline comments and `docs/walkthroughs/README.md` has been corrected to
say so and to state why.

Two tests pin both directions, so the tolerance is exactly line endings
and nothing more:

- `test_line_ending_translation_alone_is_not_drift` — rewrite all four
  files CRLF, check passes;
- `test_a_content_change_is_still_caught_in_a_crlf_checkout` — one changed
  word inside a CRLF file, check fails.

---

## Change made after the evidence snapshot, disclosed

The round's evidence bundle was assembled before this edit, so **no
verifier saw it**: step 5 of the exemplar (`open-the-spec-from-the-row`)
originally said only that `spec.md` opens. Reading
`src/commands/workExplorerTreeCommands.ts` while the round was in flight
showed that clicking a non-terminal set row *also* writes the
start-next-session prompt to the clipboard and raises a toast. A reader
would have seen an unannounced notification and been unable to tell a
product bug from an omission, so the step now states both outcomes and
quotes the toast verbatim. Its duration went 8s → 10s, which is what
moved the total from 44 to 46 and produced nit 7.

## Test evidence

`test_scenario_model.py`, `test_scenario_render.py` and
`test_scenario_lint.py`: **107 passed**, with the pre-existing xfail in
`test_changelog_partition.py` unchanged. `scenario_render --check` and
`scenario_lint` both clean over the committed corpus. The required
portion of the full suite is recorded at Step 8, after this remediation
and after the fix-delta review.
