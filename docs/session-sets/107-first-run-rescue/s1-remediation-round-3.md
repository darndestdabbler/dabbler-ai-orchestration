# Remediation — Set 107 Session 1, after discovery rounds 1 and 2

Five blocking findings were raised across the two discovery passes (round 1
fan-out 2/2, round 2 supplementary). Two of them — round 1 findings 2 and 3 —
are the **same defect** reported by both fan-out calls, so there are **four
distinct blockers**. All four are accepted as real. None is disputed.

Every fix below is accompanied by a test that fails without it.

---

## M1 — An empty folder inside an existing repo committed to the PARENT repo

**Accepted. Real, and the most serious finding of the round.**

`makeSampleGitOps().init` used `simpleGit(dir).checkIsRepo()`, which answers
*"is this path inside a repository"*, not *"is this path a repository root"*.
Picking an empty child folder of an existing checkout — `~/projects/their-repo/sample`,
an entirely ordinary choice — made that check return `true`. The command then
skipped `git init` and every later step operated on the **developer's own
repository**: `setLocalIdentity` rewrote their `user.name` / `user.email`, and
`commitAll`'s `git add -A` swept their unrelated working-tree changes into two
commits titled after our sample.

The verifier rated this Major. It is arguably worse than that in consequence —
it silently mutates and commits to a repository the product was never asked to
touch — but the severity label changes nothing about the fix.

**Fix** (`src/commands/trySampleProject.ts`): test for a `.git` entry in the
target directory itself. A nested repository is exactly what the sample wants,
so only a genuine re-run on the sample's own root now skips `init`.

**Test** (`sampleProjectSmoke.test.ts`, new): drives **real git**, because the
defect was a real-git behavior no in-memory fake reproduces. It builds a parent
repo with a committed file plus an uncommitted edit, runs the command in an
empty child folder, then asserts the child became its own repository, the
parent's `user.email` is untouched, the parent's edit is still uncommitted, and
the parent still has exactly one commit.

---

## M2 — The sample taught every reader to record a verification that never happened

**Accepted. Real** (raised twice — round 1 findings 2 and 3).

`AGENTS.md` handed the agent a literal `disposition.json` carrying
`"verification_method": "manual-via-other-engine"`, while the same file told
the developer in as many words that no second AI reviewed the work. The sample
is a **teaching artifact**: the first disposition most readers will ever see.
Shipping false verification provenance in it is exactly the class of defect
this repo has an incident history about.

Honesty about how the original token was chosen: I picked it empirically
because it made `close_session` pass, and did not go back and ask whether it
was *true*. It was not.

**Fix**: the token is now `"skipped"`, which is what actually happens, plus a
line in `AGENTS.md` telling the agent not to change it to anything implying a
review occurred. Verified empirically before committing to it — a scratch repo
closed cleanly on `"skipped"` under `--no-router` with no `budget.yaml`
(`[PASS] verification_integrity`), so the honest token is also the working one.
The smoke test's own disposition was updated in the same pass (the echo rule).

**Test**: `sampleProjectCore.test.ts` asserts `AGENTS.md` records `skipped` and
that the string `manual-via-other-engine` appears nowhere in the bundle.

---

## M3 — `bundle.json` was called the single source of truth without being enforced

**Accepted. Real, and a fair hit on my own claim.**

The bundle's README asserted that the smoke test "reads its expectations from
there, so a drifting sample fails the build". Partly true: the smoke test does
read `expectedProgramOutput`, `programEntryPoint`, `testCommandArgs` and
`sampleSetSlug`. But `expectedTests` was **decorative** — absent from the
TypeScript model and read by nothing — and the same claims were duplicated as
prose across `README.md` and `AGENTS.md`, where they could drift with no test
noticing.

**Fix**, preferring removal over addition:
- **removed** `expectedTests` from `bundle.json` (nothing consumed it);
- **added** `missingFunction`, which the red-state test now reads instead of a
  hard-coded `/\bdef shout\b/`, so the "starts red" claim is checked against
  the contract;
- **every** field is now required by `loadSampleBundle`, so a field cannot be
  quietly dropped;
- the bundle description now states plainly that no field is decorative.

**Test**: a new spec asserts that every prose copy of the contract in
`README.md` and `AGENTS.md` — both expected output lines, the program entry
point, the test command, and the set slug — matches `bundle.json` exactly.
That closes the drift hole rather than merely re-asserting the claim.

---

## M4 (supplementary) — Extension 0.47.0 claimed a router fix it cannot deliver

**Accepted. Real.**

The extension CHANGELOG listed the `close_session` EOF fix under 0.47.0's
**Fixed** section, and `docs/repository-reference.md` said it "rides along". It
does not: `Dabbler: Try a sample project` pip-installs the *published*
`dabbler-ai-router`, so a sample created by the 0.47.0 VSIX runs the old
router. Release notes describing behavior the release does not deliver are a
correctness defect in their own right.

**Fix**: the entry moved to `ai_router/CHANGELOG.md` under `[Unreleased]`,
where router-side work belongs, carrying an explicit delivery note. The
extension CHANGELOG and the release-status row now both state that 0.47.0 does
**not** carry it and that it reaches users only when the router is next
published. The sample's instructions pass `--accept-suggestions`, which avoids
the prompt on old and new router alike — so the sample is correct either way.

---

## Not changed, and why

Nothing was dismissed in cycle 1. All four distinct blockers are fixed above.

---

# Remediation cycle 2 — after the round-3 remediation-review

Round 3 accepted **M1, M2 and M4** and **rejected the M3 fix**, raising one
blocking finding: *"the canonical bundle still is not enforced as the single
source of truth."* It is partly right, and the part that is right is the same
defect M3 named — so it is accepted, not argued with.

## Accepted — the fix under-delivered in two ways

**1. My test's name over-claimed.** It was called *"every prose copy of the
contract matches bundle.json"* while checking two files. That is precisely the
claim-exceeds-enforcement pattern M3 is about, reproduced inside the fix for
M3. Renamed to *"the bundle's OWN rendered docs match bundle.json"*, with the
scope stated in the test body.

**2. Removing `expectedTests` left the test-state expectation unenforced.**
The verifier is right that deleting it was the cheaper half of the answer.
Replaced with **`expectedTestCount: 2`**, which the smoke test now asserts
against the **real** `Ran N tests` output — both before the change and after —
so the declared number is enforced by execution rather than trusted. A sample
that gains or loses a test now fails the build.

The bundle README now carries an explicit **enforced-vs-not-yet table**, field
by field, so the contract's actual coverage is legible instead of asserted.

## Disputed in part — `docs/tutorials/hello-world.md`

The finding requires asserting the contract against
`docs/tutorials/hello-world.md`. **That document does not describe this sample
and cannot be bound to it in this session.** The file currently on disk is the
old 419-line tutorial that Set 107 **Session 2** relocates to
`adopt-dabbler.md` before authoring a new `hello-world.md` around the sample.
There is nothing to assert against yet; a test written now would assert against
a document about to be deleted.

This is recorded in the round's up-front conventions block as a by-design
exclusion ("The tutorial rewrite is Session 2's job"), and the spec assigns it
to S2's plan. Rather than argue and leave it implicit, the obligation is now
**written down in two places a future session will read**: the bundle README's
"not yet bound" section names the tutorial as the one place the contract can
still drift silently and says S2 must close it, and `bundle.json`'s description
names the binding session. The residual is therefore a scheduled obligation
with an owner, not an oversight.

I am not re-rounding this point. Per the constitution, a settled scope
boundary does not reopen under fresh wording; the residual is recorded in
`disposition.json` and surfaced at Step 9.

---

# Remediation cycle 3 — fixes applied, and the loop SUSPENDED at its bound

Round 4 again accepted M1, M2 and M4 and rejected the M3 fix, with one blocking
finding: *"the canonical metadata still does not enforce all rendered task
instructions."* **That was remediation-review cycle 2 of the permitted 2.** Per
`session-constitution.md` → *Recovery and escalation*, the loop now **suspends**.
I have **not** opened a third review round, and will not on my own authority.

## Both concrete points were right, and both are fixed

**1. The rendered task spec was unbound.**
`docs/session-sets/001-add-a-shout/spec.md` names `shout` in its task text, but
nothing asserted it against `missingFunction`. A maintainer changing the
exercise could update `bundle.json`, the Python files and the smoke test, and
still ship a spec describing the old function — leaving the reader following a
stale task and staying red. Now asserted: the rendered spec must name
`missingFunction` and must quote both `expectedProgramOutput` lines.

**2. "EVERY field is read by a test" was itself an over-claim** — `description`
is not modelled or validated. This is the third time in this session that a
claim of mine outran its enforcement, which is worth naming plainly rather than
quietly patching. Corrected to "every **contract** field", with `description`
called out as deliberate prose carrying no contract, in both the README table
and `bundle.json` itself.

Both fixes are covered by the existing specs (42 passing across
`sampleProjectCore` + `sampleProjectSmoke`). **They have not been through a
further verification round** — that is what the bound forbids.

## What the operator is being asked to decide

The remaining disagreement is **severity and scope**, not facts:

- The verifier grades the residual drift risk **Major**. Under the round's own
  L-095-1 consequence rubric I read it as **Minor**: the failure scenario needs
  a *future maintainer* to change the exercise; no reader is affected by what
  ships today; the sample is internally consistent; and the two specific holes
  named in round 4 are now closed.
- The one genuinely open item — binding `docs/tutorials/hello-world.md` to
  `bundle.json` — **cannot be done in this session**. That file does not
  describe the sample yet; Session 2 authors it. The obligation is written into
  the bundle README ("Not yet bound") and `bundle.json`'s description, so S2
  inherits it explicitly.

**Options:** accept as Minor-only and close · dismiss with the residual
recorded · third-provider opinion · require the tutorial binding now (which
means re-scoping S2 into S1).

Nothing here is self-authorized. The session stops for adjudication.

---

# Adjudication — third-provider opinion, and the orchestrator concedes

The operator chose the **third-provider opinion** option. The disputed finding,
both sides' arguments, and the post-fix artifacts were routed to
**gemini-2.5-pro** with anthropic AND openai excluded, so the read was
genuinely independent of both parties (`s1-third-opinion.json`, $0.0116).

## Verdict: the reviewer was right, and I was wrong

Gemini returned `severity_verdict: "Major"`, `who_is_right: "reviewer"`,
`is_shipping_blocked: true`, `recommended_action: "fix-more-first"`.

That is **2 independent providers to 1** against my Minor call. I withdraw the
dispute. (For completeness: the cheap auto-verification pass attached to
Gemini's own response — gpt-5-4-mini, tier 2 — returned the opposite. It is a
response-shape check, not an adjudication with the artifacts in hand, and it is
not weighted here. Recording it so the record is not selectively quoted.)

## Gemini found four things NEITHER party had raised

Two are decisive, and one of them invalidated a test I had just written and
called a fix:

1. **The presence check was satisfied by a docstring.** `test_greeting.py`'s
   module docstring says *"The second test fails until `shout` exists"*, so my
   `/\bshout\b/` check passed on **prose**. Deleting the failing test outright
   — the single thing that makes the sample start red — would have left the
   guard green. Verified directly: the old pattern matched 3 lines (2 of them
   prose); the new `greeting\.shout\s*\(` matches only the real call. **Fixed.**
2. **The dictated `disposition.json` in `AGENTS.md` was unbound.** Its
   `summary` and `files_changed` are contract-bearing and nothing checked them.
   **Fixed** — the block is now parsed as JSON, its summary must name
   `missingFunction`, and its `files_changed` must be the module the task edits
   and must exist in the bundle.
3. **The hardcoded commit message named the exercise.** Removed the coupling
   rather than adding a guard: `"Add the shout greeting"` →
   `"Complete the sample task"` (prefer removal over addition).
4. **The absence regex was shape-brittle.** Now rejects `def`, `async def`,
   and a module-level binding. (Gemini's specific `async def` example was
   wrong — `\bdef shout\b` does match inside `async def shout` — but the
   underlying point about shape-brittleness held, so the check was widened.)

## What this cost me to learn

Four times this session a claim of mine outran its enforcement: "every field",
"every prose copy", and twice a guard that looked stricter than it was. The
last one is the instructive case — I wrote it *as the fix for exactly this
class of defect* and still shipped a check that prose satisfied. The pattern is
worth a lesson, and is proposed at Step 9.

## Status

The concrete work Gemini asked for is **done**. These fixes have not themselves
been through a verification round: the 2-cycle bound still stands, and running
another round requires the operator's say-so, not mine.

## Suite after remediation

- Layer 2: **1809 → 1810 passing, 0 failing** (`sampleProjectCore` +
  `sampleProjectSmoke` 43 of those).
- Layer 1: 3060 passed / 6 skipped before this cycle, plus 6 new drift-guard
  specs; re-run at close.
- Layer 3: still environment-blocked on this machine — see
  `s1-conventions.md`; CI's `playwright-tests` job is the signal.
- `drift_guard.py`: green.
