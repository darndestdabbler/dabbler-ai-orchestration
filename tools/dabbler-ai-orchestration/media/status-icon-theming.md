# Status icons — why there are two copies

`media/dark/` and `media/light/` each hold the same four status glyphs —
`not-started.svg`, `in-progress.svg`, `done.svg`, `cancelled.svg` — and
the Work Explorer's native tree passes them to `TreeItem.iconPath` as a
`{ light, dark }` pair.

Both sets are operator-authored. Replace either freely; keep the four
filenames, because the provider resolves them by name
(`SessionSetsModel.ICON_FILES`).

## The defect this fixes

Set 110 Session 1 rendered the as-authored assets in a real Extension
Development Host and found they carried hardcoded `#ffffff` and
`#000000` beyond their documented green/grey. On a **light** theme:

- `not-started.svg` was nearly invisible — a white ring on a white row;
- `in-progress.svg` lost its meaning — the white region that reads as a
  ring against a dark row disappeared, leaving a solid green blob.

`done.svg` and `cancelled.svg` survived, because their white is a check
and an X drawn *on top of* a coloured disc rather than on the row.

## Why light/dark files rather than one `currentColor` asset

Session 1 recommended re-authoring the four to a single
`fill:currentColor` path, "the same idiom already proven in this repo".
The Session 2 step-3.5 analyst independently recommended the same thing,
at HIGH confidence. **Both were wrong, and both were reasoning from the
same wrong precedent** — the activity-bar mark the operator had just
fixed that way. A `contributes.viewsContainers` icon and a
`TreeItem.iconPath` are not rendered by the same mechanism.

Session 2 asked the platform instead of the documentation.
`src/test/playwright/icon-render-mechanism.spec.ts` launches a real
Extension Development Host, drills to a session-set row and reads the
computed style of its icon element. The answer, recorded raw in
`docs/session-sets/110-work-explorer-native-treeview/s2-evidence/icon-render-mechanism.json`:

```
background-image  : url("vscode-file://vscode-app/.../dark/not-started.svg")
mask-image        : none
-webkit-mask-image: none
```

The SVG is painted **as authored**, not used as a stencil. `currentColor`
inside an externally-referenced SVG resolves against that SVG's own
document — which inherits nothing from the workbench — so the
recommended fix would have rendered every status glyph in one fixed
colour on both themes. That is worse than the defect it was meant to
cure, and it would have shipped looking deliberate.

VS Code *does* honour `iconPath: { light, dark }`, so that is what the
provider passes. `statusIconAssets.test.ts` keeps `currentColor` out as
an executable gate rather than as advice, because two independent
advisors reached for it and a third reader plausibly will.

**Stated precisely, because the probe proves less than it might seem
to.** What is measured is that the SVG's own authored colours are what
render, and therefore that `currentColor` cannot pick up the workbench
foreground. It does **not** follow that a pair is the only workable
answer — a single asset painted in a colour legible on both themes would
also work, and would be one fewer file. The pair is the SELECTED
solution, chosen because these particular glyphs carry a ring that has
to invert to stay legible, not the only one available.

## What differs between the two

As authored, 2026-08-05:

| glyph | element | `media/dark/` | `media/light/` |
| --- | --- | --- | --- |
| all four | ring | `#ffffff` | `#252526` |
| `in-progress` | pie | `#008000` | `#008000` |
| `done` | disc / check | `#008000` / white stroke | `#008000` / white stroke |
| `cancelled` | disc / X | `#6e6e6e` / white stroke | `#ffffff` / `#4c4c4c` stroke |

The ring is the element painted directly onto the row background, so it
is the one that has to invert. `cancelled` inverts its disc and X as
well — a design choice, not a mechanical rule, which is why the tests
check that the two variants DIFFER rather than trying to re-derive one
from the other.

`statusIconAssets.test.ts` pins three things and deliberately no more:
all eight files exist; light and dark are not the same bytes; and
`media/light/not-started.svg` — the acute case, a bare ring with no disc
behind it — carries no white at all.

## Not applicable to the precedence icons

Ranks 1–5 of the icon-precedence table (blocked, migration-required,
verification-unclean, duplicate-name, tier-mismatch) use `ThemeIcon`s,
which recolour correctly for free. Only rank 6 — the plain run state —
uses these files. That split is deliberate and predates this finding.

## The legacy copies at `media/*.svg` are gone

Four copies used to sit at the `media/` root. They were what
`SessionSetsModel.ICON_FILES` named, and the webview never rendered them
(`RowPayload.iconSlug` was emitted on every row but no client code ever
consumed it), so they were inert. They were removed when the light/dark
split landed, along with the unused `iconUriFor` helper that resolved
them. `ICON_FILES` survives — it still names the four slugs, which the
provider now resolves under `media/light/` and `media/dark/`.
