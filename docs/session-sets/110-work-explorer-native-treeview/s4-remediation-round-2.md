# Session 4 — remediation of verification round 2

> **Round 2** was routed `session-verification` to **`gpt-5.5`** (anthropic
> excluded as the orchestrator's effective provider), with `s4-conventions.md`
> as the up-front conventions block. Raw artifact: `s4-verification-round-2.md`
> — not edited. Structured findings: `s4-issues-round-2.json`.
>
> One Major. **Accepted in full, and it was a genuine shipping defect that
> three separate green gates had already waved through.**

---

## The finding

> **The staged release uses an invalid VS Code view-container icon shape, so
> the Dabbler activity-bar container is rejected.** *Severity: Major. Category:
> Correctness.*

### It is correct, and the platform says so in one line

`src/vs/workbench/api/browser/viewsExtensionPoint.ts`, read from the VS Code
source rather than inferred:

```ts
if (typeof descriptor.icon !== 'string') {
  collector.error("property `icon` is mandatory and must be of type `string`");
  return false;
}
```

and the caller does `if (!this.isValidViewsContainer(value, collector)) return;`
— so a single bad descriptor makes VS Code skip the **entire** `activitybar`
array. The container is never registered and its views fall back into Explorer.
The manifest shipped as:

```json
"icon": {
  "light": "media/light/activity-bar-icon.svg",
  "dark":  "media/dark/activity-bar-icon.svg"
}
```

That is the object shape. **The primary surface of the extension this whole set
is about would not have appeared.**

### How it got in, which is the more useful part

It was introduced *as a UAT fix*. The operator's walk said the activity-bar mark
looked too dark on a light theme, and the session reached for the idiom sitting
right next door: `TreeItem.iconPath`, where a `{ light, dark }` pair is exactly
right and is the documented, tested, hard-won answer for the four status glyphs.

This repo had already written down why that reasoning is a trap — from the other
direction. `media/status-icon-theming.md` records that Session 1 and Session 2
both recommended `fill:currentColor` for the *status* icons because the
*activity-bar* icon had just been fixed that way, and that both were wrong
because **"a `contributes.viewsContainers` icon and a `TreeItem.iconPath` are not
rendered by the same mechanism."** Session 4 then made the mirror-image mistake:
it took the tree-icon idiom and applied it to the container.

The mechanism, confirmed by reading the generated CSS out of the shipped
workbench bundle of the very VS Code build the harness runs (1.132.0):

```
mask: url(...) no-repeat 50% 50%;
mask-size: var(--activity-bar-icon-size, 24px);
```

The activity-bar icon is a **stencil**. Only the silhouette survives; the colour
comes from the theme's activity-bar foreground. Which means the second half of
the finding, which the verifier did not need to state:

**The "fix" could not have worked even if the shape had been legal.** The two
contributed files were compared directly — their `d=` path data is
**byte-identical**, 2,178 characters each, differing only in a `fill` (`#606060`
versus `#ffffff`) that the mask discards. They would have rendered the same
pixels as the icon they replaced. The UAT complaint was never addressed at all;
it was *reported as fixed* while being neither fixed nor fixable from that
asset.

### Why nothing caught it

Three gates were green over the top of it, and each was green for an
understandable reason:

1. **Layer 3 (33/33)** — the last full run predates the change. The manifest
   edit landed at ~15:56; the previous full Layer 3 finished at ~14:19. No
   Playwright run ever loaded the broken manifest.
2. **`verify_vsix_claims.py`** — it did not miss the defect, it **asserted the
   defect as the expectation**:
   `activity_icon == {"light": ..., "dark": ...}`. Written in the same session,
   from the same wrong belief, it certified the bug as a passing claim. A
   verifier derived from the author's assumption cannot falsify that assumption.
3. **Layer 2 / typecheck / build** — none of them read the manifest's container
   icon at all. `package.json` is data; a wrong-but-well-formed value is
   invisible to every one of them.

The session's own `s4-conventions.md` also told round 2 that "no product code
changed" during remediation. That was wrong, and wrong in the direction that
matters: `package.json` *is* product. The verifier found the defect anyway.

---

## The fix

1. **`package.json`** — one string:
   `"icon": "media/activity-bar-icon.svg"`.
2. **`media/activity-bar-icon.svg`** — one shared asset, the operator's authored
   artwork with its path data preserved byte-for-byte (asserted before the
   per-theme copies were removed), painted `fill:currentColor`, which is the
   correct and previously-shipping idiom for a masked container icon. The
   `media/light/` and `media/dark/` copies are deleted: they encoded a belief
   that is false for this contribution point, and leaving them invites the same
   mistake back.
3. **`src/test/suite/viewsContainerIcon.test.ts`** — the gate that should have
   existed. Four tests, run over every contributed container, not just this one:
   the manifest contributes at least one container (so the loops below cannot be
   vacuously green); every icon is a **string**; every icon resolves to a real
   non-empty file; and no icon reaches into a `light/` or `dark/` directory —
   the narrower version of the same mistake, which is legal JSON and legal VS
   Code and still wrong.
4. **`scripts/verify_vsix_claims.py`** — the check that asserted the bug now
   asserts the shape VS Code accepts, plus the shared-asset and packaged-file
   claims. Its `currentColor` prohibition is re-scoped to the eight **status**
   assets, where it is true, instead of all icons, where it was the over-broad
   half of the same misunderstanding.
5. **`CHANGELOG.md`** — the false "Fixed" claim is withdrawn. The activity-bar
   contrast complaint moves to a **Known issues** section that states plainly
   that this release does not fix it and explains why the attempted fix could
   not have.
6. **`media/status-icon-theming.md`** — gains the counterpart section, so the
   rule is documented from both sides in the one file a reader consults when
   touching icons.

### Falsification — the gate is proved to fail, not merely to pass

An unfalsifiable guard reads as coverage. Both traps were driven against a
synthetic manifest via `DABBLER_EXTENSION_ROOT`:

| seeded manifest | result |
| --- | --- |
| `icon: { light, dark }` (the shipped bug) | **1 failing** — `every container icon is a STRING`, `-object +string`; other three green |
| `icon: "media/dark/activity-bar-icon.svg"` | **2 failing** — per-theme directory, and file-does-not-exist |
| the real manifest | **4 passing** |

The first run of the falsification also showed the gate failing *badly*: the
non-string cascaded into `TypeError: icon.split is not a function` in two other
tests, so one manifest mistake produced three failures of which two named the
wrong cause. The string check now owns non-strings and the others skip them, so
a bad shape produces exactly one failure that names it.

---

## A second defect, found by the re-run the first one forced

Because the manifest is product, the full Layer 3 suite had to run again. It came
back **32/33**, failing in `vsix-first-run-walkthrough.spec.ts`:

```
expect(locator).toHaveValue("default")  ->  received ""
locator resolved to <input aria-label="Which module do you want to rename?">
```

The assertion that failed is about the slug **InputBox**, but the element it
resolved against is still the module **QuickPick** — the picker never advanced.
`acceptSoleQuickPickItem` waited for the quick-input *input* to be visible and
then pressed Enter; VS Code shows the widget before it populates the item list,
and Enter against an empty list is a silent no-op. The picker stayed open and the
failure surfaced four lines later, blaming the wrong step.

Fixed in the helper: wait for a `.monaco-list-row` to exist — the thing Enter
actually accepts — press Enter, then wait for the picker's own placeholder input
to go **hidden**, so a swallowed Enter fails on the step that swallowed it rather
than poisoning a downstream assertion.

This is a test defect, not a product defect, and it is a pre-existing flake shape
rather than fallout from this session's changes: the same spec failed the same
way in Session 3's run of record.

---

## Suite state at close

Run in this order, after the last code change, per the policy Session 3 learned
the hard way — a targeted re-run is not a substitute for the full suite on the
tree being closed.

| gate | result |
| --- | --- |
| typecheck (`tsc --noEmit -p .`) | clean |
| Layer 2 (`npm run test:unit`) | **1870 passing / 1 pending** (1866 + the 4 new gate tests) |
| Layer 3 targeted (the repaired spec) | 1 passed |
| **Layer 3 full, on the final tree** | **33 passed / 0 failed (8.0m)** |
| VSIX claims | **11 / 11 PASS** on the rebuilt `0.49.0` artifact (63 entries, 1.42 MB) |

### The final suite re-measured startup, and the numbers moved

The release-gate figures quoted in `change-log.md` come from the written
artifact `s3-native-tree-baseline.json` (3,073.5 / 3,745.5 / 5,531.5 ms). This
run measured **2,787 / 3,395.5 / 4,074 ms** view-open→first-row at 10 / 100 /
500 sets. It did not overwrite the artifact — the baseline spec only writes
under `DABBLER_WRITE_EVIDENCE=1` — so the recorded numbers stand as the release
of record and this is reported as run-to-run spread rather than swapped in
because it looks better.

It changes no conclusion: **every scale is still multiples above the
`< 1,000 ms` gate**, which remains missed and remains deferred to its own
follow-on session rather than waived.
