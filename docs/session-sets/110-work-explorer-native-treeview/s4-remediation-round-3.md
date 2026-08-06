# Session 4 — remediation of verification round 3

> **Round 3** was routed `session-verification` to **`gpt-5.5`** (anthropic
> excluded), complexity hint 85, with the revised `s4-conventions.md`. Raw
> artifact: `s4-verification-round-3.md` — not edited. Structured findings:
> `s4-issues-round-3.json`.
>
> One Major and one nit. Both accepted.

---

## The Major — the release gate claimed more than it checked

> **The VSIX verifier does not actually verify every `0.49.0` CHANGELOG claim it
> certifies.** *Severity: Major. Category: Completeness.*

**Correct, and it lands on the gate that discharged round 1's Major.** Round 1
found the release deliverables missing; the fix was `verify_vsix_claims.py`, and
`change-log.md` then asserted that *"every claim in the CHANGELOG's `0.49.0`
entry is checked against the packaged artifact"* by it. It was not. The script
tested eleven coarse predicates. Meanwhile the `0.49.0` entry also claims lazy
row construction, a fourth tree level, `contextValue`-gated row actions,
malformed-ledger degradation, duplicate-session dropping, consistent icon
application, and severity relocating to tooltips — none of which the script
touched.

The wrong reading of that gap would be that the claims are unverified. They are
verified — by the Layer 2 and Layer 3 suites, both green on this tree. What was
wrong is the **sentence**, which pointed at a single script as though it covered
everything, so a release operator reading `ALL CLAIMS VERIFIED` would have
believed more than had been established. The verifier's own suggested remedy
names both options: expand the script, or narrow the assertion and cite the
tests. Both were taken, because each covers a different half.

### 1. Expanded, where the artifact can actually decide

Three claims turned out to be fully decidable from the manifest or the bundle
and simply had not been checked:

| new check | what it pins |
| --- | --- |
| every row action is gated on BOTH the view and a `contextValue` | The literal "gated per row type by `contextValue`" claim. All 19 `view/item/context` entries. An entry missing `viewItem` is offered on *every* row — the exact failure the claim denies. |
| the two named submenus exist, are populated, and are attached | Labels are `Copy Prompt` / `Open File`; each has commands in it (a declared-but-empty submenu renders as a dead arrow); and each is referenced from a menu, so neither is orphaned. |
| the session-level code the fourth level rests on is shipped | `normalizeLedgerSessions` is present in the shipped bundle. Deliberately scoped: this proves the code ships, **not** how it behaves. |

Falsified rather than assumed, by mutating a copy of the real VSIX:

| seeded mutation | result |
| --- | --- |
| strip `viewItem` from one menu entry | **FAIL** — `ungated: ['dabbler.openModulePlan']` |
| empty the `openFile` submenu | **FAIL** — `sizes={'openFile': 0, 'copyPrompt': 6}` |
| unmutated artifact | **14/14 PASS** |

### 2. Narrowed, where the artifact cannot decide

A zip file cannot expand a tree row. Behavioural claims are not artifact-
decidable at all, and a script that appeared to check them would be the same
class of error as round 2's check that asserted the bug — confidence without
evidence.

So the script's docstring now carries a **claim-by-claim map** of the whole
`0.49.0` entry against the gate that verifies each one, naming the specific
suites (`native-tree.spec.ts`, `workExplorerTreeModel.test.ts`,
`statusIconAssets.test.ts`, `icon-render-mechanism.spec.ts`,
`viewsContainerIcon.test.ts`, `work-explorer-tree.spec.ts`) for the rows it
cannot cover itself.

And the output line no longer overstates itself:

```
ALL ARTIFACT CLAIMS VERIFIED (14/14) -- artifact-decidable claims only;
behavioural claims are covered by the Layer 2/Layer 3 suites named in the
claims map in this file's docstring.
```

`change-log.md`'s sentence is rewritten to state the two-place split explicitly
instead of collapsing it into one script.

---

## The nit — stale text in the walk evidence

> `s4-walk-evidence.md` still said the activity-bar contrast finding "was fixed"
> and quoted the pre-round-2 **8.9m** Layer 3 run, while later lines in the same
> file said the opposite.

Correct, and it is the L-065-1 shape again — a consistency fix is rarely local.
Round 2's correction was applied to the closing paragraph and the decision list
but not to the Status block at the top of the same file, leaving the document
contradicting itself depending on where a reader stopped.

The Status block now states the run of record as **33/33 in 8.0 minutes**, notes
that the earlier 10.2m and 8.9m runs both predate the manifest edit and are
therefore not the run of record, and says plainly that the contrast finding was
reported fixed and that the report was withdrawn.

---

## Suite state

No product code changed for this round: the diff is the verifier script, its
docstring, and documentation wording. The artifact was re-verified against the
already-built VSIX rather than rebuilt, since nothing that goes *into* the
package changed.

| gate | result |
| --- | --- |
| VSIX claims (expanded) | **14 / 14 PASS**, and falsified on two seeded mutations |
| Layer 2 | 1870 passing / 1 pending (unchanged) |
| Layer 3, full, final tree | 33 passed / 0 failed (8.0m) (unchanged) |
