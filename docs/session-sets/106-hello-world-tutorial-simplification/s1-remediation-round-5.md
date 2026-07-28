# S1 remediation sidecar — close-backstop round 5

`close_session`'s in-process backstop (Set 084) ran round 5 against the final
tree and found **one blocking Major**. It is a real defect and mine.

## R5-1 — The release guide kept the broken direct-script invocation

**Finding:** *"The release guide still uses the broken direct-script
invocation."* `docs/tutorials/release-and-recovery.md` still ran
`python services/app/app.py` in two places — the *What "deploy" means here*
snippet and the hotfix *validate before you tag* block.

**Accepted without reservation.** Round 1's finding L3 established that
`python services/app/app.py` sets `sys.path[0]` to `services/app`, so
`import services.greeter` raises `ModuleNotFoundError`. I fixed every occurrence
in `hello-world.md` and **did not propagate the fix to the release guide** — the
second document produced by the same session, describing the same toy program.

That is precisely the failure **L-065-1** names: *a consistency fix is rarely
local; grep for the key phrases of the old claim and update every echo in one
pass before re-verifying.* I cited that lesson's sibling (L-064-8) in this
session and still missed its central instruction. The cheap discipline — one
`grep -rn "python services/"` across `docs/tutorials/` — would have caught it,
and is what finally confirmed the fix.

**Fix:** both occurrences now use `python -m services.app.app`, matching the
tutorial. Verified exhaustively rather than by inspection:

```
$ grep -rn "python services/" docs/tutorials/
NONE
```

## Why the backstop earned its keep here

Rounds 1–4 all reviewed evidence bundles centred on the session diff, and the
per-round ledger kept attention on findings already in play. The close backstop
re-reviews the **final tree** from a clean diff base (`3d2974e`), which is what
surfaced a stale echo in the sibling document. This is the second time this set's
verification caught something a narrower pass missed — the first being the two
regressions in my own remediation at round 3.

No other finding was raised. The remediation-review cap (2 cycles) applies to the
`--phase remediation-review` loop; this was the close gate's own backstop, not a
self-authorized extra cycle.
