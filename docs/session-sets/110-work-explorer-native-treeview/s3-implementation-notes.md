# Set 110 Session 3 — the switch-over, as built

> **The native tree is the shipping Work Explorer.** The hand-rolled
> renderer, its CSS, the module action strip and the 0.48.0 ellipsis rule
> are deleted; the Getting Started form and System Status strip are
> re-homed to a webview that is **contributed conditionally** and is absent
> entirely on a healthy repo; both of Session 2's assigned residuals are
> discharged; the activity-bar mark is swapped.
>
> **The session's own finding is smaller than Session 2's but the same
> shape: a routed recommendation was right about the mechanism and wrong
> about the design.** The architecture call said to surface the
> invalid-manifest fault in *both* `TreeView.message` and the System Status
> strip. It ships in one. §4.

---

## 1. What shipped

| deliverable | where |
| --- | --- |
| the native tree as the shipping view | `package.json` → `contributes.views` |
| the conditionally-present setup/status webview | `package.json` + `src/providers/SetupStatusView.ts` |
| the presence rule, and the fault predicate behind it | `src/providers/systemStatus.ts` |
| the invalid-manifest diagnostic | `WorkExplorerTreeProvider.onDiagnostic` → `TreeView.message` |
| eight shared native-tree Layer 3 helpers | `src/test/playwright/electronLaunch.ts` |
| the permanent click-swallow falsifier | `src/test/playwright/overlay-click-swallow.spec.ts` |

### What was deleted

| file | before | after |
| --- | --- | --- |
| `src/providers/CustomSessionSetsView.ts` | 977 | **gone** (→ `SetupStatusView.ts`, ~270) |
| `media/session-sets-tree/client.js` | 1,202 | 400 |
| `media/session-sets-tree/tree.css` | 724 | 277 |
| `src/providers/suppressionState.ts` | — | **gone** |
| `src/utils/moduleActionNarrowing.ts` | — | **gone** |
| `src/test/poc-nine-modules-{dom,ondisk}.ts` | — | **gone** |
| `media/{marketplace-work-explorer-mock,screenshot-mockup}.html`, `media/activity-bar-snapshot.png` | — | **gone** |

Plus, inside surviving files: `SnapshotPayload.modules`, the two QuickPick
item builders in `rowMenuHelpers.ts`, the `COMMAND_ALLOWLIST`, and six of
the eight webview→host message types.

## 2. The presence rule, and why it is not just cosmetics

The spec warned that *"a stacked `WebviewView` is a second view, not a
section — it has its own collapsible header and its own presence rules"*.
Three options were worked through and one was routed for a second opinion:

- **always present** — in the steady state (`mode === "list"`, no
  environment faults) `renderSystemStatus` returns `""`, so the operator
  permanently loses a pane header plus an empty body above their tree. The
  operator's standing complaint about this Explorer is wasted vertical
  space, so this is actively wrong.
- **`visibility: collapsed`** — costs only a header, but hides the Getting
  Started **form** on first run, which is what an entire prior session set
  (107, first-run rescue) existed to fix.
- **a `when` clause on a host-computed key** — the pane appears exactly when
  it has something to say.

The third ships. **What tipped it was not pixels.** Under the collapsed
option a missing provider key or a broken Python renders inside a collapsed
pane — invisible. That is a fail-quiet, the same class this session is
already fixing for manifest faults. The `when` gate makes a fault *pull the
surface back into existence*, which is a functional gain rather than a
cosmetic one.

**The drift trap, and how it was avoided.** The key must be computed by the
host, because a view hidden by a `when` clause is never resolved and so its
own provider cannot decide to bring it back. The obvious implementation —
re-derive the fault rules in TypeScript — is exactly the shape
`project-guidance.md` has a written convention against. So the rules are not
re-derived: `providers/systemStatus.ts` loads
`media/session-sets-tree/systemStatusHtml.js` into the host with
`createRequire` against the extension's own install directory and asks it
whether it would render anything. One implementation on disk, one at
runtime, no parity test needed because there is nothing to hold parity
*with*. `media/` already ships in the vsix, and esbuild never sees the path.

One asymmetry makes this sound: in `getting-started` mode the webview passes
**live form state** rather than durable values, but that mode only runs when
there are no sets — where the predicate has already returned `true`. So the
live-state path can never change the answer.

`isSetupNeeded` **fails toward visible** at every failure point (module
won't load, renderer throws, evaluation throws). A gate that failed closed
would hide the surface that reports faults, which is the opposite of what it
is for.

## 3. `viewsWelcome` is deliberately NOT contributed

The spec names it. It is not shipped, and this is the honest reason rather
than an oversight.

Driven, not argued (Session 2's evidence, re-confirmed): with a folder open
and no sets the tree renders a `Default` module row, so it is **not empty**
and `viewsWelcome` would not fire. With **no folder** the tree renders
nothing, so it would. That leaves `viewsWelcome` covering exactly one case —
the no-folder case — which the webview's own no-folder call-to-action
already covers, and covers more richly. Contributing it would stack two
competing empty states in one container.

The routed architecture call reached the same conclusion independently
(*"do not contribute `viewsWelcome` … a strictly less functional, visually
conflicting duplicate"*). The spec's **intent** — re-home the empty state —
is satisfied by the webview, which is what `emptyStateReHomed` names. The
deviation from the spec's stated mechanism is recorded here and raised at
Step 9 rather than being quietly absorbed.

## 4. The manifest fault ships in ONE channel, against routed advice

Session 2's residual: `WorkExplorerTreeProvider` discarded
`assembleVisibleModules(...).manifestFaults`, so a broken
`docs/modules.yaml` left the tree showing a stale last-known-good module
list **with no explanation**. Three independent reads raised it.

It is fixed through `TreeView.message`. The routed architecture call
recommended **both** `TreeView.message` *and* the System Status strip,
reasoning that the strip is a consolidated dashboard. That is not taken, for
three reasons it did not weigh:

1. two renderings of one fault is a duplication that then needs to agree —
   and the repo's standing principle is prefer removal over addition;
2. the message sits **directly above the stale tree it explains**, which is
   where an operator looking at wrong modules is already looking;
3. the strip's subject is the **environment** (Python, provider keys, the
   Copilot CLI), not repository content. The manifest fault was only ever in
   the strip because the webview owned both surfaces at once.

The consequence is asserted rather than assumed: `system-status.spec.ts`
drives a real broken manifest and requires the message to explain it, the
last-known-good tree to survive, the file to be left untouched, and the
message to **clear on repair** — that last one because a sink that only
fired on faults would leave a repaired workspace permanently accused.

## 5. The test rewrite, and the two verdicts rejected

The Layer 3 re-expression was routed as `test-generation` and its
behavioural mapping is the artifact
[`s3-layer3-rewrite-mapping.json`](s3-layer3-rewrite-mapping.json). Fifteen
specs became fourteen: five deleted, six rewritten, three new.

**Two of its verdicts were wrong and are rejected on the record**, because
the reasoning matters more than the outcome: it marked
`loading-state.spec.ts` and the four Getting Started scenarios inside
`session-sets-tree.spec.ts` as `delete-superseded`, on the grounds that the
form *"was replaced by the TreeView's `message` property"*. It was not — the
form is untouched by this migration. Deleting them would have taken five
live behaviours with the renderer. They are preserved in
`getting-started-surface.spec.ts` (and `loading-state.spec.ts` needed no
change at all).

The same discipline applied to the deletion review's `coverage_at_risk`
list: its claims that the migration-pending and kind-of-set distinctions
were "lost" are wrong — both survive, in the icon precedence table and the
tooltip respectively, and both are now asserted directly on
`setDescriptor` / `setTooltip` instead of by scanning source text.

**Locators are title-agnostic on purpose.** `openWorkExplorerTree` finds the
pane by the presence of a `.monaco-list`, not by its title, because this
session renames the pane mid-flight. A title-matched helper would have had
to change in the same commit that changed the title, and every spec would
have passed against whichever surface happened to answer. The shipping
identity is asserted in exactly **one** place —
`workExplorerMenuParity.test.ts` — which is the step-3.5 analyst's named
sequencing gap, closed.

## 6. Eight Layer 2 suites scanned a file that no longer exists

The repo's "house pattern" — when a class is not importable from the unit
harness, scan its source text — left eight suites reading
`CustomSessionSetsView.ts` by path. Each was triaged rather than batch-fixed:

- **retargeted** (the invariant is live): the never-write-`docs/modules.yaml`
  trust boundary, which now polices **five** passive paths instead of two
  because the native tree and the shared assembly are new passive readers;
  the `[BLOCKED BY PREREQS]` retirement, which follows the badge to the tree
  descriptors; the shared-assembly scan, which narrows from "both surfaces
  agree" to "the surviving surface still does not re-derive".
- **deleted** (the contract is dead): the `modules: ModulePayload[]` protocol
  scan and the webview ARIA-dialect scan.
- **migrated** (the behaviour is live, the carrier changed): kind-on-the-row
  and the verification verdict, now driven directly against
  `setDescriptor` / `setTooltip`. These are strictly better tests — the
  source scans existed only because the old host class could not be
  imported, and `workExplorerTreeModel.ts` imports no `vscode`.

## 6a. The full run earned its keep — three specs the targeted runs could not see

The operator's test-run policy makes the full Layer 3 suite non-negotiable
for this session. It found three failures that no targeted run would have,
because all three were in specs **outside** the set I had rewritten:

1. **`real-host-baseline.spec.ts`** measured *"cold launch-to-first-row for
   the shipping webview"* by drilling into the webview iframe for the
   `work-explorer-tree` test id. That surface is deleted. This is the harness
   that produced Session 1's 5,102 ms before-number and the one Session 4's
   sub-second gate is stated against — so it is **retargeted at the native
   tree through the identical protocol** (real host, shipping build, fresh
   profile per rep, natural cold paint, no forced refresh, same scales,
   median of reps) rather than deleted. Session 1's committed artifact is
   untouched; the opt-in write now produces `s3-native-tree-baseline.json`
   beside it instead of over it. **S4 inherits a working after-harness.**
2. **`icon-render-mechanism.spec.ts`** — Session 2's own probe — still found
   its pane by the Session 2 title `"Work Explorer (native preview)"`, the
   name this session retires. Repointed at the shared, title-agnostic helper.
3. **`vsix-first-run-walkthrough.spec.ts`** failed on a hidden assumption in
   a helper *I* wrote: `openWorkExplorerTree` waits 30 s for a first row, and
   at the moment the walkthrough opens the tree there are none — a real venv
   and network `pip install` are still running and can take minutes. The wait
   that matters is the one on the Default row, which already carried the
   install's own 300 s timeout. Switched to `workExplorerPane`, which does not
   wait for rows. **A convenience helper's built-in wait is an assumption
   about what has already happened**, and that is why the two helpers are
   separate rather than one with a flag.

Worth stating plainly, and counted rather than rounded, because it is the
lesson of the session's test work. **Eight Layer 3 failures across all runs.
Every one was in the TESTS, not the product.** They break down as:

- **three were wrong claims about how VS Code renders**, written into a spec
  and not run first: an empty `Cancelled` bucket rendering with "0 sets" (it
  is not rendered at all); a module row's label and description being on
  separate lines (same line); and `^Greeter\b` matching "Greeter1 set" (it
  does not — `r` and `1` are both word characters);
- **three were stale references to surfaces this session renamed or deleted**
  — two in specs outside my rewrite set, one a local helper I replaced
  everywhere but its own file;
- **one was a fixture mismatch** I introduced by re-pointing a spec at the
  shared manifest without updating its module stamps;
- **one was a hidden assumption inside a helper I had just written.**

The Set 108 lesson (L-064-12) is usually cited as "Layer 3 catches product
regressions Layer 2 and the static gates miss". It also catches the
migration's own assumptions about the platform — which is the cheaper half,
and the half a rewrite generates most of.

## 7. Owed, with an owner — the payload builders

`buildBucketPayloads`, `buildModulePayloads`, `buildVisibleModulePayloads`
and the `RowPayload` / `BucketPayload` / `ModulePayload` types have **no
production consumer** after this session. The routed deletion review
confirms it and says delete.

**They are not deleted here, and that is a decision rather than an
oversight.** They are reachable from 22 call sites across five Layer 2
suites, and those suites assert real grouping and ordering semantics through
the payload shape (`.buckets[].rows[]`). Deleting the builders without
first re-expressing those 22 assertions against `VisibleModule` +
`orderedBuckets` would delete the assertions, not migrate them — and the
deletion review's own `coverage_at_risk` list names unstamped-module
filtering as the thing that would go quiet. Doing that translation carefully
is a contained piece of work; doing it hastily at the end of a long session
is how coverage disappears while the diff looks like cleanup.

**One more member of the same residual, found in self-review rather than by
a gate:** `SystemStatusPayload.manifestFaults` is now **always `[]`** — §4
moved the fault to `TreeView.message`, so nothing produces it, while
`systemStatusHtml.js` still contains a live rendering branch for it (and
Layer 2 tests that drive that branch directly). It is harmless — an empty
array through a loop — but it is the same *class* as the payload builders:
correct code with no producer. Bundling it into one residual with one owner
beats filing it separately.

**Owner: Session 4**, as a pre-release tidy, or a follow-on set if S4's walk
turns up higher-priority work. Evidence: `s3-deletion-review.json`. This is
the one place this session leaves an orphan, it is named, and it is not
argued down to nothing.

## 8. What Session 4 inherits

1. **The startup gate is now measurable end to end.** The native tree is the
   shipping view, so the S1 protocol (real Extension Development Host,
   shipping build, fresh profile per rep, natural cold paint, no forced
   refresh, same 8-set × 4-session fixture, median of ≥3 reps) measures the
   *product* rather than a preview pane. The gate is **< 1,000 ms** against
   the 5,102 ms webview before-number. **Nothing in this session measured
   it, and nothing here should be read as predicting it.**
2. **The first suspect if the gate is missed** remains the ~102 ms
   synchronous `git worktree list` inside root discovery — the only
   attributed host-side cost in evidence.
3. **Three proposals still awaiting the walk**, unchanged from Session 2:
   bucket rows carrying `N sets` in `description`; set rows carrying **zero**
   inline actions; two inline actions on module rows staying readable at the
   operator's actual minimum width.
4. **Two `when`-gate behaviours the walk should feel, not just pass**:
   whether the setup/status pane appearing and disappearing is pleasant or
   startling, and whether losing it entirely on a healthy repo reads as
   "clean" or as "something is missing".
5. **README screenshots are stale.** `media/work-explorer-modules.png` and
   `media/getting-started.png` are referenced by both READMEs and show the
   deleted webview tree. The three *unreferenced* stale assets were deleted
   this session; these two are referenced, so replacing them needs a running
   build — which S4 has and this session did not. Retake at the release.
6. **The `media/session-sets-tree/` directory name is now a misnomer** —
   there is no tree in it. Left alone deliberately (many references, low
   value, high churn) and recorded here rather than hidden.

## 8a. A framework gap found at the close gate, reported not fixed

`close_session` **crashed with an unhandled traceback** on its first
invocation:

```
ai_router.verify_session.EvidenceTooLargeError:
  assembled evidence is 627074 chars, over the 614400-char cap
```

`close_backstop.run_close_backstop` wraps `assemble_evidence` in
`except _vs.VerifySessionError`, but `EvidenceTooLargeError` is **not a
subclass of it** — confirmed by inspection. So a guard that exists precisely
to fail closed *gracefully* instead takes the close gate down with a stack
trace and no remediation line, on a session whose only sin is a large diff.
Every other backstop failure path returns a `BackstopOutcome` with an
operator-facing `remediation` string; this one does not.

**Not fixed here, deliberately.** `ai_router` verification machinery is
out of this set's scope by the spec's own non-goals, and the operator's
2026-08-05 note is explicit that changing the harness mid-set taints the
set's own verification record. Reported instead, with the fix being one line
(make `EvidenceTooLargeError` inherit `VerifySessionError`, or catch it
alongside) plus a remediation string naming the documented env override.

**The workaround used, disclosed rather than buried:** the cap is
operator-tunable by design — `verify_session`'s own error path tells the
operator to set `AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS` — so the close ran with
it at 768 KiB against a 600 KiB default. The bundle was **2% over**. Nothing
about the evidence was reduced, filtered, or hidden; the verifier saw the
whole thing.

## 8b. The close backstop was right and this session was wrong

The backstop's own round found one blocking Major: **"the final tree has no
successful full Layer 3 run."**

**Accepted without argument.** The full run of record was 32 passed / 1
failed; the one failure was fixed afterwards and re-run *targeted*. So at the
moment of the first close attempt, no full suite had ever passed against the
tree being closed — and this session's Ends-with says, in the spec's own
words, *"Layer 3 is green on the new view."*

`s3-remediation-round-1.md` had already disclosed this and argued the
operator's test-run policy justified it. **The disclosure was honest and the
decision was wrong.** That policy has two halves — *do not start a full run
you might invalidate*, and *run it once, at close, AFTER the last code
change*. This session applied the first half to skip an obligation the second
half creates. The last code change was the three test fixes; the full run
belonged after them.

Twenty-three minutes was the correct price for the central claim of the set.
The sidecar's reasoning is superseded by `s3-remediation-round-2.md` rather
than quietly edited — the original argument stays on the record because
getting it wrong is the more useful artifact.

## 9. Honest limits of this session

- **No performance claim is made or implied.** Session 1 withdrew the
  performance pitch in writing; nothing here re-opens it. The native tree is
  now the shipping surface, which makes S4's measurement meaningful — it
  does not make it favourable.
- **The `when` gate's staleness window is real and accepted.** The context
  key is recomputed on the watcher tick, the 30-second poll, and the Refresh
  command. An operator who installs Python in another terminal will not see
  the pane disappear until one of those fires. Adding a watcher for it was
  considered and rejected as more machinery than the problem deserves.
- **`createRequire` of a `media/` file is an unusual seam.** It is the right
  call against the drift alternative, but it couples the host to a path
  inside `media/`, and it is guarded rather than proven: if the require
  fails, the pane shows unconditionally. The Layer 3 spec covers the
  succeeding path; the failing path is covered by inspection only.
- **The `viewsWelcome` deviation is a spec deviation**, argued in §3 and
  raised at Step 9. A reader who disagrees should reverse it there, not
  quietly re-add it.
