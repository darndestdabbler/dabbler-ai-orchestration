# Operator notes — Set 110

Notes captured from the operator outside a session. **Session 1 must fold
these into its operator-confirmed density mapping** (`densityTradeConfirmed`)
rather than treating them as settled design — they change what the tree
displays, and two of the three have a wrinkle worth a decision.

---

## 2026-08-04 — Session rows, status icons, and the fraction

Recorded verbatim as three asks, then reconciled against the code.

### The asks

1. **Add one more level to the tree, listing the sessions within each set.**
2. **Give that new level the operator's own icons** —
   `tools/dabbler-ai-orchestration/media/not-started.svg`, `in-progress.svg`,
   `done.svg` — to denote each session's status. *"That should eliminate the
   need for additional text indicating which session is in flight at the
   session set level."*
3. **At the Status Group level, use the same icons, and set
   `item.description` to the done/total fraction for the session set.** *"If
   that isn't possible, then let's consider other options."*

### What the code already provides (verified 2026-08-04)

This is cheaper than it looks, and ask 2 is a *removal*.

- **The session data is already in memory.** `ProgressView.sessions` is a
  `SessionRecord[]` of `{ number, title, status }`
  (`tools/dabbler-ai-orchestration/src/types.ts`). A session level is a pure
  in-memory `getChildren` expansion on a session-set node — **no new disk
  reads**, so it does not touch the startup cost S1 is measuring.
- **The icons are already wired at the set-row level.**
  `RowPayload.iconSlug` is literally `"in-progress.svg"` / `"done.svg"`
  (`src/types/sessionSetsWebviewProtocol.ts`). Ask 2 extends an existing
  vocabulary downward; it does not introduce one.
- **Ask 2's "additional text" is real and identifiable.**
  `RowPayload.description` is documented as *"remaining description after
  fraction extraction (e.g. `session 4 in flight · 2026-05-18`)"*. That
  `session 4 in flight` clause is what the session-level icons make redundant.
  Deleting it is consistent with *prefer removal over addition*.
- **The fraction already exists too.** `RowPayload.fraction` is `"3/6"`,
  `"0/4"`, `"3/3"`, `"2/3+"`, with `fractionTooltip` explaining the `+`.

### Reading ask 3 — and the tension S1 must decide, not discover

"Status Group level" most plausibly means **the session-set rows that live
under a status group**, not the group headers themselves. That reading is
self-consistent: a status group ("In Progress", "Not Started", …) contains
many sets, so a single done/total fraction has no owner at the group row.

It also explains the *"if that isn't possible"* hedge. **It is possible** —
`TreeItem.description` renders as dimmed text after the label. The reason to
ask is that a native `TreeView` gives only `label`, `description`, `iconPath`
and `tooltip`: **there is no custom column**, and the webview's fraction is
currently a bespoke right-aligned bold colored column, not description text.

**The tension:** Set 034 deliberately moved the fraction *out* of
`description` and into that dedicated column. Putting it back into
`description` is a knowing partial reversal, forced by the platform rather
than chosen. S1 should record it as such so a later reviewer does not file it
as a regression. **The operator has confirmed the trade** (see the icon
section below): the fraction text stays, the color-coded column goes. What is
still worth an eyeball during the S1 spike is whether dimmed `3/6` after the
set name carries enough of what the color coding did — the column encoded
state in its color, and `description` text does not.

The alternative reading — a count on the group header row itself (e.g.
`In Progress · 4 sets`) — is worth putting to the operator as the second
option, since `TreeItem.description` on a group row is equally available and
the two are not mutually exclusive.

### Wrinkles to settle in S1

1. **There are four session statuses, not three.** `SessionStatus` is
   `"not-started" | "in-progress" | "complete" | "cancelled"`, and
   `media/cancelled.svg` already exists alongside the three named above. Decide
   whether a *session* can be cancelled in practice (set-level cancellation is
   the established path) and either use the fourth icon or state why sessions
   never reach that status.
2. **The icons carry hardcoded fills** — `#008000` green on `in-progress.svg`
   and `done.svg`, `#6e6e6e` grey on `cancelled.svg`. VS Code only
   theme-recolors a `ThemeIcon`; a file `iconPath` renders as authored, so
   these look identical in light and dark. Probably fine at these colors, but
   it needs an eyeball in **both** themes during S1's API spike, and
   `iconPath` accepts `{ light, dark }` if they need to diverge.
3. **They are authored `width="16mm"` with `viewBox="0 0 16 16"`** (Inkscape
   physical units). Confirm they scale cleanly into a 16px tree row rather
   than assuming it.
4. **Ask 1 changes S2's stated shape.** The spec's Session 2 says
   *"module → bucket → session set, with `getChildren` resolving each level on
   expand"*, and its **Ends with** describes that tree. Both need the session
   level added — the fourth level is exactly the kind of thing the native
   migration makes cheap, so it belongs in the migration, not in a follow-on.
5. **Lazy expansion matters more with a fourth level.** A session-set node must
   report `Collapsed` (not `Expanded`) so session rows are built only on
   expand; otherwise the level that was supposed to be free is paid on every
   refresh, which is the failure mode the whole set exists to remove.

### Follow-up ask, same day — the activity-bar icon

> *"Since we are eliminating the fractions, I think that we should update the
> activity bar icon. I created a new one —
> `tools/dabbler-ai-orchestration/media/dabbler-ai-orchestration-icon-2.svg`."*

**In scope for this set.** The rationale is coherent: the shipping mark is a
single path whose motif reads as a fraction, and the new one is a circled
checkmark — a completion motif that matches a tree whose row icons become
status glyphs. (On "eliminating the fractions", see the operator's
clarification at the end of this section: the fraction *text* stays in
`description`; the fraction *list-icon column* is what goes.)

**A theme-safety defect was found on inspection and the operator has already
fixed it — S1 has nothing to do here.** As first delivered, the icon carried
hardcoded `fill:#ffffff` plus `stroke:#000000` on a ring path and a separate
stroked checkmark, which would not have tracked the activity bar's
active/inactive foreground the way the shipping mark does. It has since been
**flattened to a single path with `style="fill:currentColor"`** — the same
idiom as `dabbler-ai-orchestration-icon.svg`, and the sturdier of the two
options offered (a filled silhouette rather than recolored strokes, so there
are no stroke widths to survive scaling). Verified 2026-08-04: one `<path>`,
no `fill`/`stroke` attributes, and the only remaining hex colors are in the
non-rendering `sodipodi:namedview` editor block.

Re-saved as **Plain SVG** afterwards, which cleared the editor metadata too.
The asset is now structurally identical to the shipping icon — same
`width`/`height`/`viewBox`, a single `<path>` with `fill:currentColor`, no
`sodipodi:namedview`, no hex colors anywhere in the file. **No work is owed on
it.** The ring survives the flattening correctly: the outer and inner circle
subpaths wind in opposite directions, so the default nonzero fill rule yields
a ring rather than the solid disc a same-winding flatten would have produced.

One residual, and it is a UAT observation rather than a code change: the mark
should still be *looked at* in both themes and in the active and inactive
activity-bar states at real render size, not only at its authored 128px.

**Every reference to update** — there are exactly three, verified by grep:
`package.json` (`contributes.viewsContainers.activitybar[0].icon`),
`media/marketplace-work-explorer-mock.html`, and the extension `CHANGELOG.md`
mention. `media/darndest-dabbler-icon.png` is the *marketplace* icon and is a
different asset — do not confuse the two. `media/activity-bar-snapshot.png`
is a screenshot of the old mark and goes stale the moment this lands; retake
it or retire it (L-064-8 — a doc that inherits a retired claim).

**Where it belongs in the plan.** This is a shipping-asset swap with no
dependency on the `TreeDataProvider`, so it fits Session 3 ("switch over"),
which is already the session that retires the surfaces this replaces. It is
too small to justify its own session and too visible to leave uncommitted.

**Settled by the operator, same day.** *"I meant eliminating the fraction
icons. We will keep it in the description."* So the **fraction survives** as
`TreeItem.description` text exactly as ask 3 states; what goes is the Set 034
**fraction list-icon column** — the `.row-fraction` span rendered as a
fixed-width, right-aligned, bold, state-color-coded pseudo-icon
(`--row-fraction-width: 3em`, `.row-fraction-in-progress` /
`-not-started` / `-complete` in `tree.css`), which occupied the row's icon
slot. That column is a webview construct with no native equivalent and dies
with the migration regardless; the operator is confirming the loss is
intended, not incidental.

That also sharpens the icon rationale: the row's icon slot stops being a
*number* and becomes a *status glyph*, at both the set and the new session
level — so an activity-bar mark built on a fraction motif is describing a
column the product no longer has.

### Why this belongs to S1 rather than being applied directly

S1's job is the go/no-go and the **operator-confirmed density mapping** — the
`label` / `description` / `iconPath` / `tooltip` / `contextValue` table for
every row type. These asks *are* density decisions: one adds a row type, one
moves information from text to an icon, and one moves the fraction from a
custom column into `description`. Folding them into that table is the
sanctioned path; wiring them in S2 without the mapping would be inventing
display policy at implementation time.

---

## 2026-08-05 — Verification-loop discipline for Sessions 2–4

Operator-directed process guidance, recorded 2026-08-05 while S1's close was
still in flight. S1 first closed WAIVED after **seven verification rounds**
and two third-party adjudications; the close-backstop then re-raised the
unmeasured-baseline Major, and the fifth real-host attempt (commit `dcb1270`)
vindicated it — the stub figures were off by 10×. That history motivates both
halves of this note: the rounds were expensive, *and* the finding was real.
Background: the decision brief at
`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`
(candidate scope for Set 111). Set 110 does **not** implement any of it —
`ai_router` verification machinery is out of this set's scope, and changing
the harness mid-set would taint this set's own verification record. What
follows is *conduct within the existing machinery*, applied from S2 onward.

1. **Treat the phased bounds as hard.** `verify_session` only *prints* the
   ≤2-discovery / ≤2-remediation-review bound; nothing refuses a run past it
   (`ai_router/verify_session.py` — `count_phase_rounds` feeds the advisory
   message only). Obey the printed suspension as if it were enforced: at the
   bound with unresolved Critical/Major findings, stop to the operator. Do
   not open a round past the bound on your own authority, for any reason.

2. **At the bound, one adjudication — and it settles the stop, not the
   truth.** When what remains is disputed or judgment-shaped, go directly to
   a single third-provider adjudication instead of further rounds. But S1 is
   the cautionary tale on both sides: two MAY_CLOSE adjudications reasoned
   the unmeasured renderer cost immaterial, and the real measurement proved
   them wrong by an order of magnitude. An adjudication licenses *closing*;
   it does not falsify the finding. A finding waived at the bound is
   recorded as an owed residual with a named owner session — never argued
   down to nothing.

3. **Severity-gated stop applies** (existing guidance, L-095-1 lineage):
   when remaining findings are Minor-only with no plausible failure
   scenario, close rather than grind. Alert the operator in the disposition
   notes; do not spend rounds polishing Minors.

4. **Acceptance checks in remediation sidecars ("B-lite").** For each
   Critical/Major accepted for fix, the remediation sidecar must state an
   explicit acceptance check — a command plus expected output/exit code
   where executable, one prose sentence only where genuinely
   judgment-based — and record it **run against the pre-fix state (fails)
   and the fixed state (passes)** before `remediation-review` is invoked.
   Paste the actual outputs. Honest limitation, stated so nobody
   over-claims: these are orchestrator-authored, so they are a convergence
   aid to cut fix-rejected cycles, **not** a substitute for the routed
   review — `remediation-review` still adjudicates every fix.

5. **Nothing here reduces verification.** Discovery, supplementary-on-
   blocking, and remediation-review run exactly as the constitution
   requires (no-skip mandate untouched). This note governs when the loop
   *stops*, not whether it runs.
