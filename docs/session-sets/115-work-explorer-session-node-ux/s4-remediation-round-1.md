# Set 115 Session 4 — remediation, round 1

One blocking finding, and it was correct.

## Finding (Major, Completeness) — Playwright-scoped changes after the last recorded full run

> "The artifact-menu removal changed the VS Code package/menu surface and
> Layer 3 specs at 14:12, but the last recorded full
> `npm run test:playwright` is 11:18. A merge/close decision would rely on
> stale GUI coverage for exactly the package/real-host surface the spec
> says must be fully rerun after the last edit."

**Accepted in full.** This is the spec's own step 5 (`L-064-12` — the tree
model *and* `package.json` are in scope, so the full Layer 3 run happens
after the **last** edit), and the sequence really did leave it unmet: the
recorded run at 11:18 covered the close-out projection and the marker
removal, and the operator's UAT ruling then removed the artifact menu
entry — `package.json`, `ActionRegistry.ts`, `openFile.ts` and two
Layer 3 specs — after it.

Nothing in the finding is disputed and nothing about it is a wording
question. The remediation is to make the record true, not to argue it.

### What was done

1. **Ran the full suite again after the removal.** It failed, 39 passed /
   1 failed — and the failure was a *real consequence of the removal*
   that no other layer could have produced:

   `rowContextMenuText` waited 15 seconds for a visible context menu and
   then threw. With the artifact entry gone, a session the run phrase
   does **not** resolve to now carries no applicable actions at all, and
   VS Code renders **no menu** rather than an empty one. The helper
   treated that correct behaviour as a timeout.

   This is the finding earning its keep twice over: the stale-coverage
   complaint was about a *risk*, and running the suite turned the risk
   into an actual defect on screen.

2. **Fixed the helper to treat "no menu" as an answer.** It now waits
   briefly and returns `""` on expiry, with the reasoning recorded at the
   call site. Waiting the full timeout for an absence was also simply the
   slow way to ask.

3. **Strengthened the assertion rather than relaxing it.** The spec no
   longer merely checks that session 2 lacks the two labels — it asserts
   the menu is **empty**, which is the state the removal actually
   produces and the state a future regression (a set-row entry leaking
   down, or the artifact entry returning) would break.

4. **Re-ran the full suite** with no code edits after it, and recorded it
   in `test-runs.jsonl` through `run_of_record record`.

### Acceptance criterion

> *judgment* — "test-runs.jsonl records a passing full
> `npm run test:playwright` run after the artifact-entry-removal /
> package-menu changes, or those post-run Playwright-scope changes are
> reverted."

Satisfied by the first branch: the changes stand, and the recorded run
post-dates them. The run of record is the one whose duration and outcome
`test-runs.jsonl` carries; the `run_of_record` freshness digest is
computed over the surfaces the suite covers, so a later edit to any of
them would stale the record rather than silently inheriting this pass.

### Note on the round's own timing

The discovery round ran *while* the artifact removal was being made — the
operator's ruling arrived mid-session — so the tree it read was in
motion. That does not weaken the finding: it named a gap that was real
when it was written and that remained real until the run above completed.
It is recorded here because the round's baseline tree
(`435dd7cc`) is not the tree the remediation review will see, and the
difference is this remediation plus the removal itself.

## Round 3 (remediation-review) — the same class, one suite over

The fix above was **accepted**, and the review then found the sibling I
had left standing: the remediation itself edited
`tools/dabbler-ai-orchestration/src/` — `electronLaunch.ts` and
`session-menu.spec.ts` — which is Mocha-covered surface, and the Mocha
run of record still pointed at 11:03.

**Accepted in full, and it is the same defect as round 1's**: a suite was
*run* after the last edit but not *recorded*, so the record no longer
proved the surface. I had in fact run `npm run test:unit` after the
empty-menu fix and read "1776 passing" off the screen — which is exactly
the trap `run_of_record` exists to close. Reading a green result is not
the same as leaving evidence that it was green, and a close gate can only
read the evidence.

Remediation: re-ran `npm run test:unit` (1776 passing, 0 failing, 2
pending — the 2 are the symlink-parity test, which unprivileged Windows
cannot execute, and one pre-existing pending) and recorded it. The
acceptance criterion is executable rather than judgment this time:

```
python -m ai_router.run_of_record check --session-set-dir docs/session-sets/115-work-explorer-session-node-ux
```

now exits 0 with all three suites reported: pytest untouched by this
session's surfaces, mocha fresh and green, playwright fresh and green.

**The lesson worth carrying out of both rounds** is one line: *run it,
then record it, in the same breath.* Two of this session's three blocking
findings were the gap between those two acts, and neither was a defect in
the shipped code.
