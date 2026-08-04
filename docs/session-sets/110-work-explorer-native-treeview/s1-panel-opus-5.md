# Panel opinion — Opus 5 (the orchestrator's own voice)

> **Provenance and its limits.** This is not a routed call. The operator's
> instruction at S1 was *"You are Opus 5, so we do not need to route to you"* —
> so the Opus 5 seat on this panel is filled by the orchestrator directly, at
> zero marginal cost. **Written and saved before reading either routed
> opinion**, so it is uncontaminated by them; the commit order proves the
> sequence.
>
> **The independence caveat, stated rather than buried:** the orchestrator is
> not a disinterested panelist. I read the spec before forming this view, I am
> the one who would execute the migration, and an orchestrator asked whether
> the work in front of it is worth doing has an obvious bias toward yes. Weight
> this opinion accordingly, and prefer the routed voices where they disagree
> with me.

---

## The question

Should the Work Explorer migrate from a hand-rolled `WebviewView` tree
(~1,100 lines of vanilla JS, ~800 of CSS re-creating ARIA tree semantics,
roving tabindex, focus painting, collapse state, a hover-revealed action
strip) to a native VS Code `TreeView` + `TreeDataProvider`?

---

## Position: GO — but the migration must be sold on the right grounds

I would proceed. My confidence is **high on correctness/maintainability
grounds and low on performance grounds**, and the distinction matters more
than the verdict, because the set's own spec is at risk of claiming a win it
has not earned.

### 1. The strongest argument is defect class, not line count

The line count (1,900) is the least interesting fact. The interesting fact is
**what kind of bug the current design admits**, and Set 108 produced a clean
specimen: a *CSS-only* change introduced a swallowed-click regression, and
Layer 2 plus every static gate were green while it was live. Only Layer 3
caught it.

That is not a coding error anyone could have avoided by being more careful. It
is structural: when you own the DOM, layout is part of your correctness
surface, and layout defects are invisible to assertions about state. A native
`TreeView` does not make that class of defect less likely — it makes it **not
ours**. Hit-testing, focus, keyboard traversal, and virtualisation move behind
an API boundary maintained by people who do nothing else.

The migration's real return is a permanent reduction in the surface area where
we can be wrong, and that return compounds over every future Explorer change.

### 2. The performance case is probably false, and the set should say so

Fact 4 in the spec is the one that should govern the honesty of this set:
**the view feels sluggish even when the tree is EMPTY.** An empty tree builds
no rows, so neither the full-teardown re-render (fact 2) nor the
build-collapsed-children waste (fact 3) can explain the symptom the operator
actually reports.

Both prior models independently bet on the host-side filesystem scan. If they
are right, a `TreeDataProvider` will not make startup feel faster by one
millisecond, because `getChildren` cannot be called until the model exists,
and the model is what is slow.

I therefore expect S1's measurement to show that **the migration does not fix
the motivating symptom**. That is a reason to be precise, not a reason to
stop: facts 2 and 3 are real costs that appear at scale, and the correctness
argument stands on its own. But the set must not ship a CHANGELOG line
implying the Explorer got faster if the measurement says otherwise. If the
scan is the cause, the honest outcome is a follow-on set that fixes the scan,
and a 110 that claims only what it delivers.

### 3. `getChildren`-on-expand moves cost rather than removing it

The spec's own risk list has this right, and it deserves more weight than a
bullet. Lazy children convert a slow initial paint into a **slow expand**, and
a 300 ms stall after a click is more noticeable than a 300 ms stall during a
paint the user was not watching. The mitigation is that the fourth level
(sessions) is served from `ProgressView.sessions`, already in memory — so if
every level below the root resolves from memory, expansion is genuinely free
and the concern is moot. That should be **verified during S2, not assumed**:
the test is that no `getChildren` call touches the disk.

### 4. The density trade is the real decision, and it is the operator's

Everything above is engineering judgment. The density trade is a **taste
judgment about a surface the operator looks at every working session**, and
no amount of model opinion substitutes for the operator looking at it.

The mechanical facts are not in doubt: a `TreeItem` gives one label, one
description, one icon, one tooltip. Today a session-set row can show a name, a
right-aligned colour-coded fraction column, up to five independent markers and
a kind badge — call it eight simultaneous signals against the native four, one
of which (the icon) must carry what five markers carry today.

Two observations I would put in front of the operator:

- **The tooltip is not an equal substitute for a marker.** "Information is
  preserved" is true and slightly misleading. A marker you can see while
  scanning twenty rows and a tooltip you must hover one row to read are not
  the same instrument. Scanning is the Explorer's primary use.
- **Colour is load-bearing and `description` does not carry it.** The Set 034
  fraction column encoded state in its colour. `TreeItem.description` renders
  as uniformly dimmed text. Moving `3/6` there preserves the number and drops
  the encoding — which is precisely why the operator's own note asks for an
  eyeball rather than assuming.

The compensating gain is real and should be weighed honestly: the operator's
asks (session-level rows with status icons) make the *most* important signal —
which session is in flight — visible as a glyph at its own level, replacing a
text clause. For the operator's actual daily question, the native tree may be
**better**, not merely acceptable.

### 5. What would make this a NO-GO

I want to name my own falsifiers, because a panel that cannot be wrong is
theatre:

1. **The operator judges the density loss unacceptable** on the rendered
   before/after. This is dispositive and needs no engineering justification.
2. **The submenu spike fails** — if `contributes.submenus` from
   `view/item/context` does not produce a working hierarchical menu, the set
   loses the operator-requested feature that partly motivates it, and Set 048
   S3's flaky DOM menu becomes a precedent rather than a warning.
3. **`"group": "inline"` renders the module actions unacceptably.** Weaker
   than the above; a context-menu-only fallback is survivable.

Note what is *not* on this list: test-suite breakage. Near-total Layer 2
breakage is expected, predicted by both prior models, and correctly budgeted
into S3. Treating the old suite as a behavioural specification is the right
move and not a reason to hesitate.

### 6. The one thing I would change about the plan

S3 both **deletes the old renderer** and **rewrites both test suites** and
**re-homes the empty state** and **swaps the activity-bar icon**. That is the
session with the most irreversible action (deletion) and the least residual
safety net (the suite that would have caught a mistake is being rewritten in
the same session).

I would not re-plan the set over this — S2 deliberately ships the provider
behind the existing surface so the two can be compared, which is the right
hedge. But S3 should sequence internally as **rewrite the tests against the
new surface first, prove them green, then delete** — never the reverse. A
deletion that happens while the suite is red cannot be distinguished from a
deletion that broke something.

---

## Summary

| question | my answer | confidence |
| --- | --- | --- |
| Migrate? | Yes | high |
| Because it is faster? | **No — expect no empty-startup win** | medium-high |
| Because the defect class moves off our plate? | Yes, this is the case | high |
| Is the density trade acceptable? | **Not mine to answer** | — |
| Biggest risk | Operator rejects density at S1 | — |
| Plan change | S3: green tests before deletion, not after | medium |
