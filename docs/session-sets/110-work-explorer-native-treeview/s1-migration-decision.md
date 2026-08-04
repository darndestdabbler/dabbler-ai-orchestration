# Set 110 Session 1 — Migration decision

> **Verdict: GO.** Confirmed by an operator decision on the density trade
> (2026-08-04), a three-model panel run on the corrected registry, measured
> startup costs at four scales, and four API spikes answered by running code
> rather than by reading documentation.
>
> **But not for the reason the set was pitched.** The migration does **not**
> fix the symptom that motivated it. See *The performance case is false*.

---

## 1. The panel, re-run on the corrected registry

The spec made Set 109 a hard prerequisite because the 2026-08-04 panel was
answered by `gpt-5-4-mini` and `gemini-2.5-pro` — a mini model and a
two-generation-old one — after the registry silently routed around the models
that were requested. 109 fixed that. This session re-asked the same question of
the models that were meant to answer it.

| seat | model | how | verdict | cost |
| --- | --- | --- | --- | --- |
| Opus 5 | `claude-opus-5` | orchestrator, direct (operator: *"You are Opus 5, so we do not need to route to you"*) | **GO** | $0 |
| Sonnet 5 | `claude-sonnet-5` | routed, `prefer_model=sonnet` | **GO_WITH_CONDITIONS** | $0.0367 |
| GPT-5.6 Sol | `gpt-5.6-sol` | routed, `prefer_model=gpt-5-6-sol` | **GO_WITH_CONDITIONS** | $0.1056 |

Raw artifacts: [`s1-panel-opus-5.md`](s1-panel-opus-5.md) (written and
committed **before** either routed opinion was read, so it is uncontaminated),
[`s1-panel-sonnet-5.json`](s1-panel-sonnet-5.json),
[`s1-panel-gpt-5-6-sol.json`](s1-panel-gpt-5-6-sol.json). Both routed calls were
truncation-clean; both served the exact requested `model_id`, which is 109's fix
working on its first real use.

**The question was reconstructed from this spec, not recovered verbatim.** The
metrics ledger records the two prior calls (2026-08-04T19:42:42Z and
19:43:15Z, `session_set: null`) but does not retain prompts. The spec's
*Project Overview* is the authored record of what that panel was told, and the
re-run prompt was built from it. A future reader should treat "the same
question" as *the same question as recorded*, not as a byte-identical replay.

### Where the three agreed, unprompted

1. **Migrate** — all three.
2. **The strongest argument is defect class, not performance.** All three
   independently named the Set 108 swallowed-click regression as the case: a
   CSS-only change broke interaction while the unit suite and every static gate
   stayed green. Sonnet: *"not a fluke, it's the natural failure mode of
   hand-rolled hover strips over reflowing DOM."*
3. **The performance case is not real** (details below).
4. **The density trade is the operator's call, not an engineering one.** All
   three refused to decide it. Sol: *"cannot be settled from API capability
   alone."*
5. **S3 as specced is the riskiest session in the set** and should not delete
   the old renderer in the same breath as rewriting the suite that would catch
   a mistake. Reached independently by all three, including the orchestrator's
   own opinion written before the routed ones arrived.

### Where they differed

Sonnet and Sol both wanted a **vertical slice earlier** — Sol explicitly
wanting S2 to build a complete native slice (menus, tooltips, icons,
expansion) rather than "only the provider behind the existing surface", and
both wanting the real-repo walk moved before deletion. The orchestrator's
opinion did not raise this. It is folded into the plan adjustments below.

### The honest counter-argument, recorded rather than buried

Sonnet's self-critique is the strongest case against this set and is reproduced
because it deserves to survive into S4's retrospective:

> *"A working, if inelegant, view is being traded for four sessions of
> engineering risk on a promise (perf) that fact 4 already suggests won't
> materialize, chasing a defect class (click-swallowing) that has exactly one
> documented occurrence. If the operator's actual complaint is 'it's slow' and
> the scan turns out to be the fix, this whole migration may be solving the
> wrong problem well."*

The measurement below shows the scan **is** essentially the whole cost. The
set proceeds anyway, on the correctness argument, with the performance claim
withdrawn rather than defended.

---

## 2. The performance case is false — measured, not argued

Harness: [`scripts/perf-harness.ts`](../../../tools/dabbler-ai-orchestration/scripts/perf-harness.ts).
Raw: [`s1-perf-measurements.json`](s1-perf-measurements.json). Medians of 5
reps, warm cache, Windows 11, Node 22.

| scenario | sets | git spawn | discovery | scan | **PIPELINE** | discovery share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| synthetic empty | 0 | 102.2 ms | 116.0 ms | **0.3 ms** | **102.2 ms** | ~100% |
| synthetic small | 10 | 105.9 | 117.8 | 6.4 | 100.9 | ~100% |
| synthetic medium | 100 | 86.4 | 103.2 | 51.7 | 186.8 | 55% |
| synthetic large | 500 | 81.9 | 93.9 | 242.1 | 334.1 | 28% |
| **this repo, real** | 109 | 81.6 | 94.6 | 44.0 | **124.4 ms** | 76% |

`PIPELINE` is `readAllSessionSetsWithDiagnostics()` — the actual product
entrypoint, and the honest total. `discovery` and `scan` are component probes
measured separately and are **already inside** `PIPELINE`; they are not summed.
(The first cut of this harness did sum them and reported inflated totals. Fixed
before any number here was recorded.) A discovery share at or above 100% at the
small scales is not an error: both figures are one `git worktree list` spawn and
nothing else, so they differ only by run-to-run noise.

### What this settles

**On an empty tree the host does ~102 ms of work, and 0.3 ms of it is reading
session sets.** The rest is `discoverRootsWithFamilies()` in
[`fileSystem.ts:210`](../../../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts#L210),
which calls `listGitWorktrees()` in
[`git.ts:4`](../../../tools/dabbler-ai-orchestration/src/utils/git.ts#L4) — a
**synchronous `execFileSync("git", ["worktree", "list", "--porcelain"])`**, one
per workspace folder, blocking the extension host, paid before a single set is
read and regardless of how many exist.

Spec fact 4 said the view feels sluggish even when the tree is empty, and that
neither the innerHTML teardown nor the build-collapsed-children waste could
explain it. Both previously-consulted models bet on the host-side scan. **They
were directionally right and specifically wrong**: it is not the *scan* — the
scan of zero sets costs 0.3 ms. It is the **git subprocess inside discovery**.

**A TreeDataProvider does not make this one millisecond faster.** `getChildren`
cannot be called before the model exists, and building the model is the cost.

### What the migration *does* buy, at scale

The scan is real and linear — 242 ms at 500 sets, ~0.5 ms per set — and today
every one of those sets is also built into DOM unconditionally, collapsed or
not. Lazy `getChildren` removes the DOM half. It does not remove the scan half.

### Consequences, stated plainly

- **There is a ~102 ms floor the migration cannot remove.** Discovery runs
  before any view exists and is untouched by anything in this plan. No
  CHANGELOG line may claim the migration removed *that*.
- **The real fix for the floor is a follow-on**: make discovery async, cache the
  worktree enumeration, or drop the second discovery pass. It is explicitly a
  non-goal here (spec: *no change to the watcher/scan pipeline*) and must not be
  smuggled in.
- This is the single most likely candidate for **Set 111**, and it is now backed
  by a number rather than a hunch.

### What was NOT measured — and the claim this session is NOT entitled to make

`resolveWebviewView`, extension activation, and webview cold-start-to-first-paint
need a running extension host and are not measurable from Node. The spec asked
for four buckets; this session honestly delivers two, plus a decomposition of
the dominant measured one.

**An earlier draft of this document overreached here, and the verification round
was right to block it.** It instructed S4 to "report empty-startup as
unchanged", which silently converts *"I did not measure activation"* into
*"activation cannot matter"*. Those are different claims, and only the first is
supported.

What is actually established:

| claim | status |
| --- | --- |
| A ~102 ms discovery floor exists and the migration cannot remove it | **measured** |
| Reading session sets is not the empty-tree cost (0.3 ms) | **measured** |
| Lazy children remove DOM construction for collapsed sets at scale | **measured** (scan is linear; DOM build is unconditional today) |
| Whether removing the webview improves activation / view creation | **UNKNOWN — not measured** |
| Whether total perceived startup improves | **UNKNOWN — depends on the above** |

The webview being replaced is a real cost centre — it loads HTML, CSS and
~1,100 lines of script into a renderer — so it is entirely possible the
migration *does* improve perceived startup on top of an unchanged floor.

**S4's obligation is therefore to measure, not to confirm.** It must report the
activation and first-paint numbers for both the old and new views, and state
whichever way they fall. If the native tree is faster to first paint, S4 should
say so and quantify it; if it is not, S4 should say that. What S4 must **not**
do is claim the ~102 ms floor moved, because nothing in this set touches it.

**Suggested method for S4** (so the number is comparable, not anecdotal): the
Extension Development Host's *Developer: Show Running Extensions* reports
per-extension activation time, and Layer 3 can timestamp from window ready to
first tree row present. Run each five times on the same machine and report
medians, the way this session's harness does.

---

## 3. The API spikes — answered by running, not reading

A throwaway extension ([`s1-spike-evidence/spike-extension/`](s1-spike-evidence/spike-extension/))
was built and launched in a real Extension Development Host (**VS Code
1.131.0**), modelling the four-level tree, the density mapping, the operator's
own status SVGs, submenus, and inline actions.

### (a) `contributes.submenus` from `view/item/context` — **WORKS**

Evidence: [`03-hierarchical-submenu-two-levels.png`](s1-spike-evidence/03-hierarchical-submenu-two-levels.png).

`Plan ›` and `Verification ›` render as real submenus with chevrons; `Plan`
opens to `Create Plan` / `Import Plan` / `Deeper Still ›`, proving **two levels
of nesting**, which is one more than the plan needs. Menu `group` keys render as
separators (`1_actions` above `2_lifecycle`). `contextValue` gating works: the
`module-normal` row offers Plan + Rename + Delete; `module-pseudo` correctly
offers less.

**Set 048 S3's flaky DOM-drawn menu is a warning, not a precedent.** This is a
different mechanism and it works.

### (b) `"group": "inline"` — **WORKS AT TWO ACTIONS, FAILS AT FOUR**

Evidence: [`04-inline-actions-render-as-icons.png`](s1-spike-evidence/04-inline-actions-render-as-icons.png)
(two actions, default width) and
[`06-four-inline-actions-erase-the-label.png`](s1-spike-evidence/06-four-inline-actions-erase-the-label.png)
(four actions, minimum width).

With **two** inline commands (`$(add)`, `$(go-to-file)`) the icons render
right-aligned at the row's trailing edge, revealed on hover, **not overlapping
the label**.

**With four — the module strip's real action count — the label is erased.** At
minimum panel width the hovered module row renders as chevron, folder icon, a
one-character stub of the name, then four icons. The module name is gone.

> **This finding exists because the verification round caught the first draft
> generalising a two-action spike to a four-action strip.** It was right to.
> The corrected spike reproduces *the operator's original complaint inside the
> native tree*: the action strip covering the module name at narrow widths is
> not automatically solved by going native. It is solved by **limiting how many
> inline actions there are**.

**Binding constraint for S2:** at most **two** inline actions. Everything else
goes in the context menu, which the submenu spike proved works. This is also
what the operator asked for in the first place — *either* quick-access
shortcuts *or* a working hierarchical menu, explicitly not a hybrid — so the
constraint costs nothing that was wanted.

The 0.48.0 ellipsis CSS still becomes dead code, because at two actions nothing
overlays the title.

**Residual for S4's walk:** even at two actions, confirm the module name stays
readable at the operator's actual minimum width. The spike shows two actions
are safe at *default* width; minimum width with two was not separately captured.

### (c) Lazy `getChildren` — **WORKS, more strongly than assumed**

Evidence: [`spike-laziness-trace.json`](s1-spike-evidence/spike-laziness-trace.json).

| stage | what VS Code had asked for |
| --- | --- |
| after activation, view never opened | **nothing at all** |
| after the view became visible | `getChildren(root)` |
| after expanding a module | `+ getChildren(module)` |
| after expanding a bucket | `+ getChildren(bucket)` |
| after expanding a set | `+ getChildren(set)` — the fourth level |

Each level is requested only when its parent is expanded, and **nothing is
requested at all until the view is visible** — a property the current design
does not have, since its watcher rebuilds the whole tree regardless. (The trace
shows duplicate entries at each level; those are the harness's own direct calls
used to obtain a node to reveal, not VS Code's.)

Operator-notes wrinkle 5 is therefore satisfiable: a session-set node must
report `Collapsed`, and the fourth level then costs nothing on refresh.

### (d) The operator's status icons — **a real defect found**

Evidence: [`05-light-theme-icon-defect.png`](s1-spike-evidence/05-light-theme-icon-defect.png),
[`spike-report.json`](s1-spike-evidence/spike-report.json).

Operator-notes wrinkle 2 asked for an eyeball in both themes. Done, and the
problem is **worse than the note recorded**. The note flagged `#008000` green
and `#6e6e6e` grey. The files actually carry **`#ffffff` and `#000000` as
well** — all four of them:

| file | width/viewBox | hardcoded fills | currentColor |
| --- | --- | --- | --- |
| `not-started.svg` | 16mm / `0 0 16 16` | `#ffffff`, `#000000` | no |
| `in-progress.svg` | 16mm / `0 0 16 16` | `#008000`, `#ffffff`, `#000000` | no |
| `done.svg` | 16mm / `0 0 16 16` | `#008000`, `#ffffff`, `#000000` | no |
| `cancelled.svg` | 16mm / `0 0 16 16` | `#6e6e6e`, `#ffffff`, `#000000` | no |

In **dark** theme all four read correctly. In **light** theme:

- **`not-started.svg` is nearly invisible** — a white fill on a white row.
- **`in-progress.svg` loses its meaning** — the white region that reads as a
  ring against a dark row disappears into a light row, so the glyph reads as a
  solid green blob rather than a partially-filled ring.
- `done.svg` and `cancelled.svg` survive.
- The control row using a `ThemeIcon` (`pass-filled`) recolors correctly in
  both themes, as expected.

**Wrinkle 3 is answered too:** the `width="16mm"` authoring is harmless — the
`viewBox` governs and all four scale cleanly into a 16 px row.

**Owed in S2/S3:** either supply `iconPath: {light, dark}` variants, or
re-author the four glyphs to a single `currentColor` path the way the operator
already fixed the activity-bar icon. The second is preferable and is the same
idiom already proven in this repo. **This is not optional polish** — one of the
four statuses is invisible on a light theme.

---

## 4. The density trade — operator-confirmed, and one premise overturned

The spike rendered the spec's worst-case row (five markers + fraction + kind
badge) at the default panel width and produced a finding that **changes the
operator's own ask 3**.

### The finding

`TreeItem.description` is **dropped entirely when the label truncates.** At the
default sidebar width (~300 px) every real dabbler set name truncates, so the
fraction never appears:

- [`01-default-width-fraction-invisible.png`](s1-spike-evidence/01-default-width-fraction-invisible.png)
  — `087-work-explorer-module-first-…`, `108-three-module-pipeline-tutori…`,
  `109-model-registry-and-pricing-t…`. **No fraction on any of them.** Short
  labels (`In Progress`, `Complete`) keep their descriptions, which is what
  makes the rule visible.
- [`02-wide-panel-fraction-visible.png`](s1-spike-evidence/02-wide-panel-fraction-visible.png)
  — at ~770 px the same rows show `3/5`, `4/4`, `4/4`.

So operator-notes' *"It is possible — `TreeItem.description` renders as dimmed
text after the label"* is true in isolation and **false at the width the
operator actually works at**. The exact px threshold was not bisected; the
governing rule is *description survives only if the label is not truncated*.

### The operator's decision (2026-08-04)

> **Drop the fraction from set rows entirely.** Progress is read from the
> session-level status glyphs.

Chosen over keeping it in `description` (invisible at working width) and over
prefixing it into the label (always visible, but displaces the set number the
operator scans down the left edge).

This is a **removal**, consistent with *prefer removal over addition*, and it is
the only option that behaves identically at every panel width.

**It supersedes the operator-notes line** *"the fraction text stays in
`description`"* and the spec's mapping row *`3/5` fraction → `description`*.
Set 034's fraction is now retired in full — the colour-coded column **and** the
text. A later reviewer should read this as a deliberate reversal forced by a
measured platform constraint, not a regression. It also strengthens rather than
weakens the activity-bar icon swap: the row's icon slot is now a status glyph
everywhere, so a fraction-motif mark describes a column the product no longer
has.

### The confirmed mapping table

| today | native | status |
| --- | --- | --- |
| session-set name | `label` | confirmed |
| `3/5` fraction column | **removed entirely** | **operator-decided 2026-08-04** |
| the single most severe marker | `iconPath`, per the precedence below | confirmed, spike-proven |
| the remaining markers, in full | markdown `tooltip` | confirmed |
| kind / state, for menu gating | `contextValue` | confirmed, spike-proven |
| module action strip | `view/item/context`, `"group": "inline"`, **capped at 2** | confirmed, spike-proven — four erases the label |
| hierarchical actions | `contributes.submenus` | confirmed, spike-proven |
| **session rows (4th level)** | `label` = title, `iconPath` = status glyph | operator ask 1, confirmed |
| in-flight session | `description` = `in flight` | short label, so it renders |
| bucket rows | `description` = `N sets` | **proposed, not put to the operator** — renders reliably because bucket labels are short; S4's walk confirms or drops it |

### The icon precedence rule — required, and previously missing

"The single most severe marker" is not implementable without saying which
marker *is* most severe. The first draft omitted this, and the verification
round correctly called it a gap: the worst-case fixture is a set that is
simultaneously blocked, migration-required and verification-WAIVED, and the
draft's spike rendered it with a **generic in-progress dot** — leaving every
actionable state on hover only, which is precisely the density regression the
panel named as a no-go risk.

**Precedence, most severe first.** The first match wins the icon slot; every
other marker still appears in the tooltip.

| rank | state | icon | colour |
| ---: | --- | --- | --- |
| 1 | blocked by prerequisite | `$(error)` | `problemsErrorIcon.foreground` |
| 2 | schema migration required | `$(warning)` | `problemsWarningIcon.foreground` |
| 3 | verification failed / WAIVED | `$(unverified)` | `problemsWarningIcon.foreground` |
| 4 | duplicate name across roots | `$(warning)` | `problemsWarningIcon.foreground` |
| 5 | tier mismatch vs workspace | `$(info)` | `problemsInfoIcon.foreground` |
| 6 | *no marker* — plain run state | the status glyph (not-started / in-progress / done / cancelled) | per asset |

Ranks 1–5 are `ThemeIcon`s and therefore recolour correctly in both themes for
free — which is a second reason to prefer them over authored SVGs for the
marker states, given the light-theme defect found in (d).

**Spike-proven:** [`07-severity-precedence-at-minimum-width.png`](s1-spike-evidence/07-severity-precedence-at-minimum-width.png)
renders a blocked set (red `$(error)`), a migration-required set (yellow
`$(warning)`) and a complete set (green check) in the same tree at **minimum**
panel width. The three are distinguishable at a glance with no hover and no
label — which is the property the density trade needs and the draft had not
demonstrated.

**Note the interaction with rank 6:** a set carrying a marker loses its
run-state glyph from the icon slot. The run state remains legible from the
fourth-level session rows once expanded, and from the tooltip when not. S4's
walk should confirm that is acceptable in practice.

---

## 5. Plan adjustments

### S3 — operator-decided (2026-08-04): keep four sessions, sequence internally

All three panel voices independently flagged S3. The operator chose to keep the
four-session shape and impose an internal order rather than split into 3a/3b.
**S3 must proceed in this order:**

1. Write the new Layer 2 + Layer 3 suites against the native tree.
2. Prove them green.
3. Seed a regression and prove the **new** Layer 3 catches it — the old suite's
   one demonstrated talent (Set 108) must be shown to have transferred before
   the old suite is retired.
4. **Only then** delete the renderer, its CSS, the 0.48.0 ellipsis rule, and the
   action strip.
5. Re-home the empty state.

A deletion performed while the suite is red cannot be distinguished from a
deletion that broke something.

### S2 — one adjustment, from Sol and Sonnet

The spec has S2 build "the `TreeDataProvider`" behind the existing surface. Both
routed voices argued that validates data adaptation but not the risky part.
**S2 should ship a complete vertical slice** — provider *plus* menus, submenus,
tooltips, icons and expansion — still behind the existing surface, so what S3
switches to has already been seen working. The spike extension in
[`s1-spike-evidence/spike-extension/`](s1-spike-evidence/spike-extension/) is a
working starting point for exactly that slice.

Its **Ends with** also needs the fourth level added, per operator-notes wrinkle
4; the spec's `module → bucket → session set` shape is now
`module → bucket → session set → session`.

**Two hard constraints S2 must honour**, both established by spike evidence
rather than preference:

1. **At most two inline actions.** Four erases the module label at minimum
   width — the operator's original complaint, reproduced natively.
2. **Implement the icon precedence table**, not "the most severe marker" as
   prose. Ranks 1–5 are `ThemeIcon`s; only rank 6 uses the authored SVGs, and
   those still need their light-theme fix.

### S4 — unchanged in scope, one caveat

The walk stays in S4. Both routed voices wanted it earlier; the operator's
choice to keep four sessions means S3's internal ordering is the mitigation
instead. S4's re-measurement **must report empty-startup as unchanged** and
attribute it to discovery, not treat it as a disappointment to be explained
away.

---

## 6. Go / no-go

**GO.**

The set proceeds on the correctness and maintainability argument, which all
three panelists ranked first, and which the Set 108 specimen makes concrete. It
proceeds with the performance claim **withdrawn**, in writing, before any code
is migrated.

None of the three no-go conditions fired:

| condition | outcome |
| --- | --- |
| Operator judges the density loss unacceptable | **No** — trade accepted, with the fraction removed rather than degraded |
| `contributes.submenus` fails to give a hierarchical menu | **No** — works, two levels deep |
| `"group": "inline"` renders unacceptably | **Conditionally** — **fails at four actions**, fine at two. Not a no-go, because the fix is a cap S2 can honour and the operator never wanted four shortcuts plus a menu. Recorded as a binding constraint, not a residual. |

Recorded residuals, none blocking:

1. The four status SVGs need theme-safe variants — one is invisible on a light
   theme. **Owed in S2/S3.** Ranks 1–5 of the icon precedence use `ThemeIcon`s
   and are unaffected.
2. **Activation, `resolveWebviewView` and first paint are unmeasured**, so the
   migration's effect on perceived startup is genuinely unknown in both
   directions. S4 must measure and report whichever way it falls.
3. The bucket-row `N sets` description is proposed, not operator-confirmed.
4. The discovery-cost fix (the ~102 ms git subprocess) is out of scope here and
   is the strongest candidate for the next set.
5. Two inline actions were proven safe at *default* width; minimum width with
   two was not separately captured. S4's walk closes it.

### What the verification round changed

Round 1 returned four Major findings, all of them real and none disputed. They
are recorded here rather than quietly folded in, because two of them corrected
claims this document had already made:

1. **The startup conclusion overreached** — see §2's *What was NOT measured*.
   The draft told S4 to report startup unchanged; it now tells S4 to measure.
2. **The same, restated as a completeness gap** — merged with (1).
3. **The inline-action spike tested two actions and the decision generalised to
   four.** Re-spiked at four: the label is erased. The GO on inline actions is
   now capped at two.
4. **The mapping claimed a "most severe marker" with no precedence rule**, and
   the spike had rendered a blocked set as a generic in-progress dot. A ranked
   precedence table now exists and is spike-proven at minimum width.

The set's verdict did not change. Two of its supporting claims did, and one
spike result was reversed.
