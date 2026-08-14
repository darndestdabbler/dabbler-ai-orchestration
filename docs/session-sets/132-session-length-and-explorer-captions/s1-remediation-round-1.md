# Session 1 — remediation, round 1

One finding, one fix. The finding was correct and decisive: it names a
sibling site the caption rename missed, and it would have left the full
extension suite red.

---

## Finding 1 — Major / Completeness — **FIXED**

> The existing manifest identity/parity unit test still asserts the retired
> view name `Work Explorer`.
> `tools/dabbler-ai-orchestration/src/test/suite/workExplorerMenuParity.test.ts:74`

**Accepted without reservation.** The verifier reproduced the failure from
the diff alone, and it is exactly the class this repo has a convention
against: L-069-1, *a bug is a bug CLASS — fix every sibling site*. My sweep
for sibling sites searched for the container title (`AI Orch`) and found all
three of its occurrences, but the caption change also moved the **view name**,
and I never swept for `"Work Explorer"` as an asserted literal. The file that
holds it announces itself in a comment as *"the ONE place the shipping
identity is asserted"* — which is precisely why nothing else caught it.

### What was changed

`workExplorerMenuParity.test.ts`:

- `assert.strictEqual(native.name, "Work Explorer")` →
  `assert.strictEqual(native.name, CAPTION)`, with `CAPTION = "AI Work
  Explorer"` named once at the top of the file beside a comment saying where
  the *rendered* proof lives. The test title follows the assertion (`the tree
  is named AI Work Explorer and is unconditionally present`). The
  unconditional-presence checks (`visibility === undefined`, `when ===
  undefined`) and the single-view / no-webview checks are untouched, as the
  acceptance criterion required.
- **Added** a second test, `the container title, the view name and
  contextualTitle are ONE string`. This is the structural half of a textual
  assertion (L-112-1) and it is the manifest-level invariant that actually
  produces the correct render: VS Code merges a single-view container into the
  sidebar title and joins the two names with `: ` unless they are identical.
  It asserts **equality between the three fields** rather than three literals,
  so it survives a future caption change and fails on the mistake that is
  actually easy to make — editing one of the three and not the others. The
  `Pkg` interface grew `viewsContainers` and `contextualTitle` to support it.

### Why this is not just "make the test match the code"

The old assertion was a literal pinned to one of three fields that must agree.
Updating the literal alone would have restored green while leaving the same
trap armed for the next rename. The added equality test is what closes the
class: the three strings can no longer drift apart silently, in either
direction, whatever they are set to.

### Proven by planting, not by reading (L-112-1)

`contextualTitle` was set to `AI Orch` in the real manifest and the file was
re-run:

```
1 failing
  the container title, the view name and contextualTitle are ONE string:
  AssertionError [ERR_ASSERTION]: contextualTitle != view name
  + expected - actual
  -AI Orch
  +AI Work Explorer
  at src\test\suite\workExplorerMenuParity.test.ts:118:12
```

The manifest was restored and the file re-run: **23 passing, 0 failing**.

### Process correction, recorded rather than hidden

The finding exists because Step 5's targeted run covered
`workExplorerTreeModel.test.ts` only — the module I edited — and a manifest
rename's blast radius is not the module it lives in. The **full Layer 2 mocha
suite** was therefore run as part of this remediation, not deferred:

```
1456 passing, 2 pending, 0 failing   (npm run test:unit, ~1m)
```

The 2 pending are pre-existing. No other stale assertion exists anywhere in
Layer 2.

### Sibling sweep, widened

Re-swept for the view name as well as the container title across
`tools/dabbler-ai-orchestration/src` and `scripts/`:

- `electronLaunch.ts:737` — a **historical** comment explaining why the Layer 3
  helpers locate the pane by `.monaco-list` rather than by title. The rationale
  is unchanged and this rename is its second dividend (no locator needed
  editing). Extended with a one-line Set 132 note so the prose does not read as
  a stale claim about the current title (L-064-8).
- `scripts/verify_vsix_claims.py` — asserts view *ids*, `type`, and the icon
  shape; it never asserts a view **name**, so the rename does not reach it.
  Note for the record: that script is already stale for unrelated reasons
  (`EXPECTED_VERSION = 0.49.0`, and it still expects the `dabblerSessionSets`
  webview that Set 123 S3 deleted). Pre-existing, out of this session's scope,
  and named here rather than quietly stepped over.
- `scripts/capture-readme-shots.js`, `scripts/stage-walk.js`,
  `scripts/perf-harness.ts` — prose only, no assertion on the name.

---

## Round 2 (supplementary completeness-critic pass)

`VERIFIED`, no findings. The prior discovery blocker stood, which is why the
session verdict remained `ISSUES_FOUND`; it is the finding above and it is now
fixed.
