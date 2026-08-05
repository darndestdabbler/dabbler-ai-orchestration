# Session 2 — round 2's nits, and why the code ones go to Session 3

> **Round 2 returned VERIFIED with zero blocking findings**, on both
> fan-out calls, reviewing the SHIPPED state with the cross-round ledger
> carried forward. Round 1's remediation held: nothing from round 1
> reappeared, and no new Critical or Major was substantiated.
>
> The CLI's structured parse reported `0 minor/nit`. **The raw artifacts
> carry four.** The raw record is what counts, so they are dispositioned
> here rather than allowed to vanish into a summary line.

## The four

| # | finding | raised by | disposition |
| --- | --- | --- | --- |
| 1 | The native tree discards `manifestFaults` | **both calls** | **Real. Assigned to Session 3** — see below |
| 2 | The icon spec's generated verdict string still says "required" | call 2 | **Real. Assigned to Session 3** (one string; changing it now would invalidate the close run) |
| 3 | §7 says an empty workspace renders a sole `Default` module | call 2 | **Half-right. Wording sharpened** — see below |
| 4 | (restatement of 1 from the second angle) | call 2 | merged into 1 |

Nothing disputed. Nothing dismissed.

---

## 1 — the native tree drops the invalid-manifest diagnostic

**This one is right, and it dents a claim this session made.**

`assembleVisibleModules` returns `{ modules, manifestFaults }`.
`CustomSessionSetsView` renders the faults into its System Status strip;
`WorkExplorerTreeProvider.modules()` takes `.modules` and drops the rest.
So with a hand-broken `docs/modules.yaml`, the native preview shows the
retained last-known-good tree **with no explanation** — the operator sees
stale modules and no reason why.

Both calls raised it independently, which is the signal that mattered in
round 1 too.

It also qualifies the sentence in `s2-implementation-notes.md` §1 that
the shared assembly means the two surfaces "cannot disagree". That is
true of *grouping and ordering*, which is what the extraction was for. It
is **not** true of diagnostics, and the write-up should not have implied
a broader guarantee than the code delivers.

**Why it is not fixed here.** Three reasons, and the first is the one
that would still apply on its own:

1. **Session 3 owns this surface.** Its plan re-homes System Status to a
   stacked `WebviewView` and wires `TreeView.message` — the exact
   mechanisms this diagnostic needs. Fixing it here would mean building a
   surface Session 3 then rebuilds.
2. **The round is VERIFIED and Minor-only**, where the loop's own rule is
   to record and stop rather than keep opening rounds.
3. **The full Layer 3 run was already in flight** when this landed.
   Touching product code mid-run is precisely the invalidation pattern
   the operator's 2026-08-05 test-run policy names, written in response
   to this session wasting a run that way once already.

**What Session 3 must do**, concretely enough that it is not re-derived:
`WorkExplorerTreeProvider` currently discards
`assembleVisibleModules(...).manifestFaults`, including
`retainedLastKnownGood`. Keep them, and surface them — `TreeView.message`
is the cheapest honest channel (the provider does not hold the view
handle today; `extension.ts` creates it and can set the message), and it
is the same channel the spec already earmarks for the transient
one-liner. The webview's wording is the reference:
`moduleAssembly.INVALID_MANIFEST_MESSAGE`.

**Consequence if it ships unfixed:** an operator who breaks their
manifest sees a tree that looks fine and is stale. That is a fail-quiet
in a codebase whose standing rule is fail-loud, never hide work — which
is why it is written down with an owner rather than left as a nit.

## 2 — the icon verdict string

`icon-render-mechanism.spec.ts` composes the verdict
`"BACKGROUND-IMAGE — the SVG paints as authored; a {light, dark} pair is
required"`. Round 1 narrowed that claim in `status-icon-theming.md` and
in the implementation notes, but the **generated string** was missed —
so a future run would re-record the over-claim.

That is L-065-1 exactly: a consistency fix is rarely local, and I fixed
three echoes and missed the fourth. Recorded as such rather than quietly
patched.

**The committed artifact is NOT edited.** `s2-evidence/icon-render-mechanism.json`
is a raw record of a measurement; its verdict string is what the harness
said at the time. The *harness* is what should change, and that is a
one-line edit in a Playwright spec — deferred only because making it
during the close run would have invalidated the run. Session 3 changes
the string to: *authored colours are what render, so `currentColor`
cannot inherit the workbench foreground; the pair is the selected
solution, not the only possible one.*

## 3 — the empty-workspace claim, checked rather than conceded

The verifier said §7's *"an empty workspace renders the sole `Default`
module row"* contradicts `assembleVisibleModules`, which returns nothing
when both roots and sets are empty.

Driven directly rather than argued:

```
folder open, no sets  -> [ 'Default' ]
NO folder, no sets    -> []
```

So the claim is **right for a workspace with a folder open** — the
ordinary meaning — and wrong only for a window with no folder at all,
where the Getting Started surface is what the operator sees anyway. The
note now says which case it means. Half-right findings get half-fixes,
not concessions.

---

## Suite and gate state at close

| gate | result |
| --- | --- |
| typecheck | clean |
| lint | 7 errors / 61 warnings — all pre-existing, none in files this session touched |
| Layer 2 | 1907 passing / 0 failing |
| Layer 3 | full suite, once, after the last code change (operator policy 2026-08-05) |
| verification | round 1 VERIFIED (0 blocking, 12 nits, all fixed); round 2 VERIFIED (0 blocking, 4 nits, dispositioned here) |
| rounds used | 2 of 2 permitted discovery passes — no third |

**One disclosure about round 2's own coverage.** A single documentation
paragraph (§8a, recording the operator's test-run policy) was added to
`s2-implementation-notes.md` *after* round 2 started, so that round
reviewed the tree minus that paragraph. It is prose in a handoff note
with no code or gate behind it. Re-rounding for it would be the grinding
the guidance forbids, so it is disclosed instead — the same category of
mistake as the invalidated test run, in a different gate, and worth
noticing that the pattern repeated.
