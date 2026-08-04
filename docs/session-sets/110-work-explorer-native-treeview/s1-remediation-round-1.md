# S1 remediation — round 1

Against the four Major findings from the round-1 discovery pass
([`s1-issues.json`](s1-issues.json)), after a clean supplementary
completeness-critic pass ([`s1-verification-round-2.md`](s1-verification-round-2.md))
found nothing further.

**All four were accepted. None was disputed.** Two of them corrected claims the
decision document had already made, and one reversed a spike result. The set's
GO verdict is unchanged; three of its supporting claims are not.

---

## F1 + F2 — the startup conclusion overreached (merged)

> *"The harness does not measure extension activation, yet the decision treats
> host-pipeline timing as total startup and pre-ordains that migration cannot
> improve it."*

**Accepted in full.** The draft's §2 ended by instructing S4 to *"report
empty-startup as unchanged"*. That silently converts **"I did not measure
activation"** into **"activation cannot matter"** — a different and
unsupported claim. The webview being deleted loads HTML, CSS and ~1,100 lines
of script into a renderer; it is entirely possible that removing it improves
perceived startup on top of an unchanged discovery floor.

The two findings are the same defect stated twice (once as correctness, once as
completeness) and are remediated together.

**Fix** — `s1-migration-decision.md` §2, section retitled *"What was NOT
measured — and the claim this session is NOT entitled to make"*:

- Added an explicit **measured / unknown table** separating the four claims that
  are established from the two that are not.
- The instruction to S4 changed from *report unchanged* to **measure and report
  whichever way it falls**, including "if the native tree is faster to first
  paint, say so and quantify it".
- Named a concrete method for S4 (Show Running Extensions for activation time,
  Layer 3 timestamp to first row, five runs, medians) so the number is
  comparable rather than anecdotal.
- The surviving hard claim is narrowed to exactly what was measured: a ~102 ms
  discovery floor the migration cannot remove.
- §6 residual 2 rewritten to say the effect on startup is unknown **in both
  directions**.

**Not fixed here, and why:** activation was not measured *in this session*.
Doing so needs a running host and a comparable instrumented build of the old
view, which is S4's job with both implementations in hand. Fabricating a number
now would be worse than naming the gap.

---

## F3 — the inline-action spike tested two actions; the decision applied it to four

> *"S2 maps all four frequent module actions to `group: "inline"` based on this
> GO result, but at the operator's normal or minimum sidebar width the
> additional icons crowd the label, overflow, or lose discoverability."*

**Accepted, and the finding was right in the strongest possible way: the
re-spike falsified the original result.**

**Fix** — the spike was rebuilt with the real four-action strip
(`$(add)`, `$(go-to-file)`, `$(new-folder)`, `$(refresh)`) and re-run at
**minimum** panel width. Evidence:
[`06-four-inline-actions-erase-the-label.png`](s1-spike-evidence/06-four-inline-actions-erase-the-label.png).

The hovered module row renders as: chevron, folder icon, a one-character stub
of the name, then four icons. **The module name is gone** — which is precisely
the operator's original complaint about the hand-rolled strip, reproduced
inside the native tree.

Decision-document changes:

- §3(b) retitled **"WORKS AT TWO ACTIONS, FAILS AT FOUR"**, with both
  screenshots and an explicit note that the verification round caught the
  over-generalisation.
- **Binding constraint added for S2: at most two inline actions**, everything
  else in the context menu. This costs nothing that was wanted — the operator
  asked for *either* shortcuts *or* a hierarchical menu, not both.
- §6's no-go table entry changed from "No" to **"Conditionally"**, with the
  reasoning for why a cap is a constraint rather than a stopper.
- The mapping table row now reads `"group": "inline"`, **capped at 2**.
- New residual: two actions are proven safe at *default* width; minimum width
  with two was not separately captured, and S4's walk closes it.

---

## F4 — the mapping claimed a "most severe marker" with no precedence rule

> *"S2 implements the demonstrated generic in-progress icon for a blocked or
> migration-required set, leaving the actionable warning visible only on
> hover."*

**Accepted.** The worst-case fixture is a set that is simultaneously blocked,
migration-required and verification-WAIVED, and the first spike rendered it with
`in-progress.svg` — a generic run-state dot. "The single most severe marker" is
not implementable without saying which marker *is* most severe, and the draft
never said.

**Fix** — a ranked precedence table added to §4:

| rank | state | icon |
| ---: | --- | --- |
| 1 | blocked by prerequisite | `$(error)` |
| 2 | schema migration required | `$(warning)` |
| 3 | verification failed / WAIVED | `$(unverified)` |
| 4 | duplicate name across roots | `$(warning)` |
| 5 | tier mismatch vs workspace | `$(info)` |
| 6 | no marker | the status glyph |

First match wins the icon slot; every other marker still appears in the
tooltip. Ranks 1–5 are `ThemeIcon`s, so they recolour correctly in both themes
for free — a second reason to prefer them over authored SVGs, given the
light-theme defect in §3(d).

**Spike-proven, not asserted:**
[`07-severity-precedence-at-minimum-width.png`](s1-spike-evidence/07-severity-precedence-at-minimum-width.png)
shows a blocked set (red `$(error)`), a migration-required set (yellow
`$(warning)`) and a complete set (green check) in one tree at minimum width,
distinguishable at a glance with no hover and no readable label.

Also recorded: a set carrying a marker loses its run-state glyph from the icon
slot. The run state stays legible from the fourth-level session rows and the
tooltip; S4's walk confirms that is acceptable.

---

## Files changed in this remediation

| file | change |
| --- | --- |
| `s1-migration-decision.md` | §2 measured/unknown split + S4 measurement obligation; §3(b) reversed and capped; §4 precedence table; §5 two hard S2 constraints; §6 no-go row, residuals, and a *What the verification round changed* section |
| `s1-spike-evidence/06-four-inline-actions-erase-the-label.png` | new — four inline actions at minimum width |
| `s1-spike-evidence/07-severity-precedence-at-minimum-width.png` | new — three severities distinguishable at minimum width |
| `s1-spike-evidence/spike-extension/` | refreshed to the v2 spike (four inline actions, severity precedence, narrow sweep) |

No product code was touched; this session still ships no behaviour change.
