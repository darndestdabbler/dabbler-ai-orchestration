"""Verify a packaged VSIX against the CHANGELOG's top entry.

Set 110 S4. Spec step 7 requires the artifact's CONTENTS to be checked, not
just that a file was produced -- the S4 verification round raised the missing
release deliverables as a blocking finding, so this is a script that can be
re-run rather than a paragraph asserting someone looked.

Round 2 then found that this script's own activity-bar check ASSERTED THE BUG:
it required `icon` to be the `{light, dark}` object that VS Code rejects. A
verifier that encodes the defect as the expectation is worse than no verifier,
so that check now tests the shape VS Code actually accepts. See
`src/test/suite/viewsContainerIcon.test.ts` for the same rule as a Layer 2 gate.

SCOPE, stated because round 3 found the earlier wording overclaimed it.
------------------------------------------------------------------------
This script verifies what is decidable FROM THE ARTIFACT: the manifest it
declares and the code it ships. It cannot verify runtime behaviour -- a zip
file does not expand a tree row -- and it does not pretend to. "ALL ARTIFACT
CLAIMS VERIFIED" is deliberately not "all CHANGELOG claims verified".

Every claim the `0.49.0` entry makes, and where it is actually verified:

| CHANGELOG claim                              | verified by                     |
| -------------------------------------------- | ------------------------------- |
| version / entry / supersedes 0.48.0          | HERE                            |
| Work Explorer is a native tree, not a webview | HERE (manifest) + Layer 3       |
|                                              | work-explorer-tree.spec.ts      |
| rows are built lazily on expansion            | Layer 3 native-tree.spec.ts     |
| a set expands to its sessions (4th level)     | Layer 3 native-tree.spec.ts;    |
|                                              | HERE only that the code ships   |
| no extra disk read (`normalizeLedgerSessions`)| Layer 2 workExplorerTreeModel   |
|                                              | .test.ts; HERE that it ships    |
| malformed ledger degrades, duplicates dropped | Layer 2 workExplorerTreeModel   |
|                                              | .test.ts                        |
| row actions are `view/item/context` menus     | HERE                            |
| gated per row type by `contextValue`          | HERE (every entry's `when`)     |
| two submenus, Copy Prompt + Open File         | HERE (labels, populated, bound) |
| Setup & Status is a webview behind a `when`   | HERE                            |
| status icons are the per-theme pairs          | HERE (packaged) + Layer 2       |
|                                              | statusIconAssets.test.ts        |
| applied consistently; module rows have none   | Layer 2 workExplorerTreeModel   |
|                                              | .test.ts                        |
| severity moves to tooltip/context metadata    | Layer 2 workExplorerTreeModel   |
|                                              | .test.ts                        |
| `currentColor` cannot work, kept out by test  | HERE (packaged assets) + Layer 2|
|                                              | statusIconAssets.test.ts +      |
|                                              | Layer 3 icon-render-mechanism   |
| activity-bar icon is a string, one asset      | HERE + Layer 2                  |
|                                              | viewsContainerIcon.test.ts      |
| the webview renderer is deleted               | HERE                            |

The behavioural rows are covered by the suites named, which ran green on this
tree: Layer 2 1870 passing / 1 pending, Layer 3 33 passed / 0 failed.

Run from the extension directory:

    python scripts/verify_vsix_claims.py dabbler-ai-orchestration-0.49.0.vsix
"""

from __future__ import annotations

import json
import re
import sys
import zipfile

EXPECTED_VERSION = "0.49.0"

# The four run-state glyphs. These are TreeItem.iconPath icons: VS Code paints
# them as a CSS background-image with mask-image:none, so the SVG's OWN colours
# render and `currentColor` cannot work. They ship as a {light, dark} pair.
STATUS_ICON_NAMES = ("not-started", "in-progress", "done", "cancelled")

# The activity-bar container icon is NOT one of those. VS Code masks it
# (`mask: url(...)`) and paints the silhouette with the theme's activity-bar
# foreground, so its own fill is discarded -- `currentColor` is correct here,
# a per-theme pair is meaningless, and an object is outright illegal.
ACTIVITY_BAR_ICON = "extension/media/activity-bar-icon.svg"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    vsix = argv[1]

    with zipfile.ZipFile(vsix) as z:
        names = set(z.namelist())
        pkg = json.loads(z.read("extension/package.json"))
        changelog = z.read("extension/CHANGELOG.md").decode("utf-8")
        bundle = z.read("extension/dist/extension.js").decode("utf-8", "replace")
        status_assets = [
            f"extension/media/{theme}/{name}.svg"
            for name in STATUS_ICON_NAMES
            for theme in ("light", "dark")
        ]
        status_bodies = {
            a: z.read(a).decode("utf-8", "replace") for a in status_assets if a in names
        }

    views = pkg["contributes"]["views"]["dabblerSessionSetsContainer"]
    tree = next(v for v in views if v["id"] == "dabblerWorkExplorerTree")
    setup = next(v for v in views if v["id"] == "dabblerSessionSets")
    activity_icon = pkg["contributes"]["viewsContainers"]["activitybar"][0]["icon"]
    menus = pkg["contributes"]["menus"]
    submenus = pkg["contributes"].get("submenus", [])
    submenu_ids = {s["id"] for s in submenus}
    submenu_labels = {s["label"] for s in submenus}
    submenu_sizes = {s["id"]: len(menus.get(s["id"], [])) for s in submenus}

    item_menus = menus.get("view/item/context", [])
    # A row action is correctly gated only if it is scoped to THIS view and to a
    # contextValue; either alone lets it leak onto rows it does not apply to.
    ungated_items = [
        entry.get("command") or entry.get("submenu")
        for entry in item_menus
        if "viewItem" not in (entry.get("when") or "")
        or "dabblerWorkExplorerTree" not in (entry.get("when") or "")
    ]
    # A submenu declared but never referenced from a menu is invisible.
    referenced_submenu_ids = {
        entry["submenu"]
        for group in menus.values()
        if isinstance(group, list)
        for entry in group
        if isinstance(entry, dict) and "submenu" in entry
    }
    missing_status = [a for a in status_assets if a not in names]
    current_color = [a for a, body in status_bodies.items() if "currentColor" in body]
    renderer_code_refs = re.findall(
        r"\b(?:class|new)\s+CustomSessionSetsView\b", bundle
    )

    checks = [
        (
            "version is 0.49.0 and the CHANGELOG's top entry matches",
            pkg["version"] == EXPECTED_VERSION
            and bool(re.search(r"^##\s*\[0\.49\.0\]", changelog, re.M)),
            f"package={pkg['version']}",
        ),
        (
            "Work Explorer is a NATIVE tree (no webview type)",
            "type" not in tree,
            f"type={tree.get('type', '<none>')}",
        ),
        (
            "Setup & Status remains a webview, conditionally present",
            setup.get("type") == "webview"
            and setup.get("when") == "dabblerSessionSets.setupNeeded",
            f"when={setup.get('when')}",
        ),
        (
            # THE CHECK THAT USED TO BE WRONG. It asserted the {light, dark}
            # object was the correct value, so it certified as passing the very
            # shape that makes VS Code's isValidViewsContainer return false and
            # drop the whole container. A string is the ONLY legal shape.
            "activity-bar icon is a STRING (any object shape kills the container)",
            isinstance(activity_icon, str) and bool(activity_icon.strip()),
            f"type={type(activity_icon).__name__} value={json.dumps(activity_icon)}",
        ),
        (
            "activity-bar icon is one shared asset, not a per-theme file",
            isinstance(activity_icon, str)
            and not any(
                seg in ("light", "dark") for seg in re.split(r"[\\/]", activity_icon)
            ),
            json.dumps(activity_icon),
        ),
        (
            "the activity-bar icon it names is actually packaged",
            isinstance(activity_icon, str)
            and f"extension/{activity_icon}" in names,
            ACTIVITY_BAR_ICON if ACTIVITY_BAR_ICON in names else "NOT PACKAGED",
        ),
        (
            "every light/dark STATUS icon is packaged (4 states x 2 themes)",
            not missing_status,
            f"{len(status_assets)} assets" if not missing_status
            else f"missing: {missing_status}",
        ),
        (
            "row actions are real context menus with the two submenus",
            isinstance(menus.get("view/item/context"), list)
            and len(submenus) == 2,
            f"submenus={sorted(submenu_ids)}",
        ),
        (
            # Scoped to the STATUS icons on purpose. They are background-images,
            # so currentColor resolves against the SVG's own document and would
            # paint one fixed colour on both themes. The activity-bar icon is
            # masked, where currentColor is fine and its fill is discarded --
            # applying this rule to it was the over-broad half of the same
            # misunderstanding.
            "no packaged STATUS icon uses fill:currentColor (cannot work there)",
            not current_color,
            "checked all 8 status icons" if not current_color
            else f"offenders: {current_color}",
        ),
        (
            "the deleted webview renderer is absent from the shipped bundle",
            not renderer_code_refs,
            # A bare substring match is NOT the test: the bundle keeps comments,
            # and ~20 of them cite the deleted class to explain where code moved
            # from. Only a definition or construction would mean it still ships.
            "no class/new CustomSessionSetsView" if not renderer_code_refs
            else f"live refs: {renderer_code_refs}",
        ),
        (
            "the native tree view id IS in the shipped bundle",
            "dabblerWorkExplorerTree" in bundle,
            "tree view id present",
        ),
        (
            # CHANGELOG: "gated per row type by `contextValue`, so a row only
            # ever offers the actions that apply to it". A `view/item/context`
            # entry with no `viewItem` clause is offered on EVERY row, which is
            # precisely the claim failing. This is manifest-checkable in full.
            "every row action is gated on BOTH the view and a contextValue",
            bool(item_menus) and not ungated_items,
            f"{len(item_menus)} entries, all gated" if not ungated_items
            else f"ungated: {ungated_items}",
        ),
        (
            # CHANGELOG: "including two submenus (Copy Prompt, Open File)".
            # Checks the labels and that each submenu actually has commands in
            # it -- a declared-but-empty submenu renders as a dead arrow.
            "the two named submenus exist, are populated, and are attached",
            submenu_labels == {"Copy Prompt", "Open File"}
            and all(submenu_sizes.values())
            and submenu_ids <= referenced_submenu_ids,
            f"labels={sorted(submenu_labels)} sizes={submenu_sizes}",
        ),
        (
            # CHANGELOG: "the scan already parsed the `sessions[]` ledger and
            # then discarded it, and it is now retained (`normalizeLedgerSessions`)".
            # The artifact can prove the named function SHIPS; it cannot prove
            # how it behaves -- see the claims map in the module docstring.
            "the session-level code the fourth level rests on is shipped",
            "normalizeLedgerSessions" in bundle,
            "normalizeLedgerSessions present in bundle",
        ),
    ]

    failed = 0
    for claim, ok, detail in checks:
        if not ok:
            failed += 1
        print(f"{'PASS' if ok else 'FAIL'}  {claim}  [{detail}]")

    print(f"\n{len(names)} entries in {vsix}")
    if failed == 0:
        print(
            "ALL ARTIFACT CLAIMS VERIFIED "
            f"({len(checks)}/{len(checks)}) -- artifact-decidable claims only; "
            "behavioural claims are covered by the Layer 2/Layer 3 suites named "
            "in the claims map in this file's docstring."
        )
    else:
        print(f"{failed} CLAIM(S) FAILED")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
