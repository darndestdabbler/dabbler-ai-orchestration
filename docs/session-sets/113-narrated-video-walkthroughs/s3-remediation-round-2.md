# Session 3 remediation — discovery round 2

Round 2 was the two-lens discovery fan-out (`gpt-5-6-sol`,
spec-conformance and failure-scenario) run against the session's **real**
delta. It raised one Critical and four Majors, which are **three distinct
defects** — findings 1 and 4 are the same defect from two lenses, and so
are findings 2 and 5. Every one is accepted; none is disputed.

All three share a shape worth naming, because it is the shape this
session was most exposed to: **each one works on the bundled fixture and
fails on a real consumer application.** The fixture is dependency-free,
synchronous and single-page, so it silently satisfied three assumptions
that no .NET, Java, Python or SPA target would.

---

## Why round 1 does not appear here

**Round 1 verified nothing, and this is the session's most consequential
finding.** Its evidence bundle was empty: the work had been committed
before `verify_session` ran, and `verify_session` diffs the working tree
against `HEAD`. Both of its findings correctly reported that the verifier
had been handed nothing — but because the only path they could cite was
`spec.md`, the Set 119 doc-only severity cap recorded both at Minor, and
the round printed:

> `blocking: no (all 2 finding(s) Minor -> non-blocking (effectively
> VERIFIED for the loop) (2 doc-only capped at Minor))`
>
> `Next action: MINOR-ONLY round ... proceed to Step 8`

A session that had verified nothing was one instruction from closing as
verified. Round 1's artifacts are kept unaltered as the record of it. The
fix is described under **F4** below and journaled in `decisions.jsonl`.

---

## C1 — the recorder required a repository-local `.venv` (findings 1, 4)

**Accepted, and the fix goes further than the finding asked.**

`venvPython()` resolved exactly `<repo>/.venv/Scripts/python.exe` (or
`bin/python`) and threw if it was absent. The documented prerequisites
named Node.js and `npm install`, neither of which creates that path, so
`npm run walkthrough:web` died before planning or launching a browser on
a fresh clone.

The finding's acceptance criterion would have been satisfied by
*documenting* the venv. That was refused as satisfying the letter while
leaving the goal false: this capability is meant to be inherited by
consumer repositories, which install `dabbler-ai-router` from PyPI and
may have **no repo-local virtualenv at all**. A hard `.venv` requirement
would have made the recorder work in exactly one checkout — this one.

Fixed by asking the real question instead. The recorder now resolves the
first interpreter that can genuinely `import ai_router`, trying
`DABBLER_PYTHON`, then the repository venv, then `python3` and `python`
on `PATH`, and **probing each by importing** rather than by checking that
a file exists. When none works it names every candidate it tried and both
ways to fix it. The recorder still does not parse `scenario.yaml` — the
repository keeps one scenario parser — so needing *an* interpreter is
intrinsic; needing *that* interpreter was not.

`docs/walkthroughs/README.md` now states what recording needs, separately
from what the walkthrough itself needs, because they are genuinely
different lists.

## M1 — the generated index showed no captions on its own documented path (findings 2, 5)

**Accepted. This one was known and mitigated, and the mitigation was not
good enough.**

The page carried a `<track src="captions.vtt">` sidecar. Chromium refuses
to load one over `file://`, and opening the generated file directly from
disk is exactly what the recorder tells you to do — so the normal path
produced a video with no captions while the markup looked correct. The
module docstring already *documented* this and offered the on-page step
list as compensation. The verifier's rejection of that is right: prose
below a player is not synchronised captioning, and it may be off-screen
while the video plays.

Fixed by changing how the cues get in rather than by serving the
directory. The sidecar element is gone; the cues are embedded in the page
and added through the standard `addTextTrack` / `VTTCue` API on load, so
the browser renders them with its **own native caption UI**, the player's
caption button works, and nothing is fetched. Serving the run directory
over HTTP was rejected: it would add a process, a port and a lifecycle to
a static deliverable whose whole point is that it opens off disk.

`captions.vtt` is still written and still listed as an artifact — it is
the sidecar you upload beside a copy of the video, per the operator's
SharePoint/Teams convention. The page simply no longer depends on being
able to read it.

**Verified empirically over `file://`, not reasoned about:** one text
track, `kind: captions`, `mode: showing`, five cues, the correct cue
active at 20s, no console errors, and the caption visibly rendered in a
screenshot of the player.

## M2 — a step expectation took one snapshot instead of waiting (finding 3)

**Accepted, and it would have falsified the session's cross-cutting
claim.**

`assertExpectation` read `textContent()` once, immediately. The bundled
fixture updates synchronously, so a single read works against it — and
would have kept working forever, on the one target that was never the
point. Every application class the recorder advertises updates after a
round trip: `page.click()` returns first, the single read observes the
previous value, and the step is marked failed while the expected UI
arrives moments later.

Fixed with a bounded wait (`expect(locator).toContainText`, 15s), and a
failure still reports what was actually on screen when the budget ran
out, which is what a person reading the manifest needs.

**The fixture cannot prove this fix**, so it is proved elsewhere:
`src/test/playwright/expectation-wait.spec.ts` plants the delay the
fixture does not have. It asserts the wait succeeds across an
asynchronous update, that a single snapshot **would have failed on that
same page** (the control), that a genuinely wrong expectation still fails
with a message naming what it saw, and that a missing element fails as a
missing element.

Writing it surfaced a second defect: the failure path re-read the element
with no timeout, so a step that failed because an element was absent
spent another 15 seconds looking for it — doubling the cost of every
failed step. The diagnostic read now has its own 1s budget and only runs
when it has something to say. The test that caught it went from 16.1s to
1.1s.

---

## F4 — the empty-evidence hole in `verify_session` (found by this session, not by the round)

Not a finding of round 2; the defect round 1 exposed. Recorded here
because it was fixed in the same pass.

`assemble_evidence` now raises `EvidenceEmptyError` when the bundle
carries no diff **and** no untracked contents, refusing before anything
is routed and naming `--diff-base` as the fix. `close_backstop` handles
it explicitly rather than reporting it as a route failure, which would
have sent an operator looking for a provider problem.

Three things this fix deliberately is not:

- **Not a cleverer severity cap.** The Set 119 doc-only cap is
  operator-attested and behaved correctly on the input it was given. The
  defect is that the input should never have been routed.
- **Not a change to `verify_session`'s default diff base.** Deriving it
  from the session's `startedAt` — the way `close_backstop` already
  does — is the better long-term answer and is **deferred with evidence**,
  because it changes behaviour for every set on the most expensive path
  there is.
- **Not a new idea.** The class was already known and already fixed at
  one site: `resolve_backstop_diff_base` exists precisely because *"a
  plain `HEAD` diff at close time is empty — it would hand the verifier
  nothing"*. The interactive path never got the same treatment. That is
  G-008 / L-069-1 exactly.

**Blast radius was measured, not assumed.** Two shared test fixtures were
pristine trees, which meant every `run()` test had been exercising the
routing and verdict logic over an empty bundle; both now leave one
uncommitted change, and the `close_backstop` fixture now dates its commit
after the session's registration for the one-second-resolution reason its
own neighbouring test already documents. 461 tests green across the
`verify_session`, phases, `close_backstop` and walkthrough suites,
including a falsifier asserting the backstop routes nothing and does not
report a provider failure.

---

## Also fixed in this pass (not findings)

Small defects found by reading and by running, folded in rather than
carried:

- **Emphasis did not survive a navigation.** `addStyleTag` is
  per-document, so any navigation dropped it and the emphasis silently
  stopped working — on a consumer application with more than one page,
  which is all of them. `applyEmphasis` now injects the stylesheet if the
  document lacks it, and the redundant up-front injection is gone: one
  injection path, not two that can disagree.
- **A flag with a forgotten value** became `undefined` and travelled to a
  `spawn()` call, failing far away with a message about argument types.
  Now refused at the point of the typo.
- **`finalize_and_write` re-read the scenario** that `finalize_run` had
  already resolved. One `resolve_scenario` now serves both.
- **An invalid Python escape.** `"<\/"` — the sequence that stops a JSON
  payload ending its own `<script>` block early — is not a valid escape;
  it survives today with a `DeprecationWarning` and becomes a
  `SyntaxError` later. Now written raw.
