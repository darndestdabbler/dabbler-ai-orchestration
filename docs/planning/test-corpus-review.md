# The rebuilt test corpus, read against itself

Session 88, 2026-09-03. Sessions 83 to 88 replaced the router's vitest suite
with `node --test` over `packages/router/test`: 60 files, ~17,900 lines,
1,096 passing cases and 4 skipped in 184 seconds. This is the review the
session plan asked for — the corpus read for what it fails to hold rather
than for what it covers.

The verifier that reads a session's diff is chosen by role and by provider
exclusion. **No verb pins a named model**, so where the session plan said
"routed to `gpt-5-6-sol`", what actually happens is the framework's own
cross-provider round plus this document. That difference is recorded here
rather than papered over; pinning a reviewer would be a new affordance, and
inventing one inside a session is how a gate becomes decorative.

## The method

Four questions, each asked mechanically where it could be and by reading
where it could not.

1. **Tautologies** — an assertion that would pass against any
   implementation. Searched for `assert.ok` over non-boolean expressions,
   `assert.equal(x, x)`, assertions with no subject, and `it` bodies
   containing no assertion at all.
2. **What a pure test fails to hold** — a module whose decision was
   extracted and tested, where nothing then exercises the code that composes
   it. Found by comparing each extracted judge against its call site.
3. **What a walkthrough steps over** — a phase or branch the one walked path
   does not enter.
4. **A seam wide enough that the shipping path is no longer what runs** —
   every `set*Source` and every injected spawner, weighed against what is
   left running underneath it.

## Findings

### 1. The direct-API dispatch was no longer driven at all — FIXED HERE

Session 86 replaced `route.test.ts`'s fetch-stubbed end-to-end tests with
pure tests of the extracted `apiLadder`, `escalationStep`,
`routeResultOf` and `routeCallRecordOf`. Each decision was covered and the
**branch that composes them was not**: nothing ran `buildPath`'s API arm, so
the per-provider rate-limiter lookup, `resolveGenerationParams` per task
type, the `DirectApiTransport` construction and the metrics write were
unexecuted by any test.

This is the same shape session 87's verifier rejected twice over the lease
fence: testing the extracted helper is not testing the branch.

Fixed. `test/route.test.ts` gains four cases that drive `route()` over the
API path with `setHttpSource` as the only seam — the wire itself — so the
ladder, the escalation walk, the exclusion and the telemetry row are the
shipping code. They assert the tokens and the row end to end, the escalation
history, the `max_escalations` ceiling with candidates left, and an
exclusion honoured end to end that then fails closed.

### 2. `assertNotExcluded` is tested as a function and never reached — OWED

`route.ts` asserts the provider exclusion a second time immediately before
the wire, after selection has already filtered on it. No current path can
reach that refusal, which is the point of the guard: it exists for the day a
preference path returns a candidate the call excluded.

The old suite reached it by replacing `selection.ts` with `vi.doMock`. The
rebuilt suite tests `assertNotExcluded` directly and leaves the composition
unproved — the loop calls it, and nothing shows that it does.

**Owed, not fixed.** Driving it needs a seam into ladder construction that
exists for no other reason, and a seam invented to reach an unreachable
branch is a worse trade than the gap. Recorded so the next person to touch
`routeLive` knows the call site is unguarded by any test.

### 3. Three walkthroughs report later milestones as skipped — SOUND, noted

`walk-git-states`, `walk-record` and `walk-verify` stop at the first failed
milestone and mark the rest `t.skip("not reached: '<milestone>' failed
first")`. A reader scanning a summary sees "N passed, M skipped" and could
misread it as green.

It is not a defect: the failed milestone still fails, so the file fails and
the run exits non-zero. It is recorded because the skip count in a
walkthrough means something different from the skip count in `live.test.ts`,
and the two now sit in one suite.

### 4. The live reachability tier is the only thing proving a vendor still
accepts our request — SOUND, and now visible

Every other transport test answers a canned response, which proves the
request this module BUILDS and the reading of a body it was handed, and
cannot prove that a real vendor accepts it. `test/live.test.ts` is that
proof, and it is opt-in (`DABBLER_E2E=1`) because a developer with keys set
must not discover that `npm test` spends money.

Changed in this session's retirement step, not by this review: the switch is
read per TEST rather than per file, so the four cases report as **skipped**
rather than vanishing. A tier nobody can see is one nobody runs.

### 5. Twenty-two source modules are imported by no test — MOSTLY SOUND

Seventeen of them are `src/cli/*` argument parsers whose verbs are exercised
through `sessionVerb`, `statusVerb`, `modulesVerb`, `workflowVerb`,
`bootstrapVerb` and `solutionVerb` in `cli.test.ts`, `workflow.test.ts` and
the walkthroughs — the parser runs, it is simply not imported by name.

Three are genuinely uncovered and named as owed:

- `src/bootstrap/env.ts` — the persisted transport preference. Its decision
  (`persistedScope`) IS tested with an injected writer; what is untested is
  the writer, which touches the machine's own environment. Deliberate.
- `src/verify/prepare.ts` — `dabbler verify prepare`, the claims file. No
  test imports it and no walkthrough enters it.
- `src/sessionState.ts` — reached through `progress` and `identity` in
  several files, so it runs; it has no test of its own raw-read behaviour.

### 6. The seams, weighed

Five seams replace something at a boundary. Each is named, each returns a
restore function, and none is a module mock:

| seam | replaces | what still runs under it |
|---|---|---|
| `setGitSource` | one `git` invocation | every judge over what git said |
| `setRouteSource` | one routed call | selection, the transports, the record |
| `setHttpSource` | one HTTP request | request building, response reading, retries |
| `setWorkSources` | review / authored-test run / suite run | the whole step driver's recording |
| `spawner` | one child process | the line pump, the deadlines, the parser |

The widest is `setWorkSources`, which replaces three module calls at once.
It is acceptable because each of the three has its own test file and what
`workflow/commands.ts` decides is what it RECORDS — but it is the seam to
watch: a future test that installs it and then asserts something about
`stepreview`'s own behaviour would be asserting the fake.

### 7. Two defects the rebuild itself introduced — both FIXED

Recorded because they are evidence about the method, not only about the
code.

- **A mechanical `expect`→`assert` conversion inverted three assertions.**
  In `contractdoc.test.ts`, repairing four mangled lines flipped the
  polarity of three, turning them green while asserting the opposite of the
  original. Caught by comparing negation counts against the source file, and
  fixed. Every mechanically converted file was audited the same way
  afterwards: `it` counts, assertion counts and negation counts, plus a grep
  for the three shapes a bad conversion produces that still pass.
- **A floating promise.** The round-ref migration test in
  `bootstrap.test.ts` discarded `bootstrapVerb`'s promise, so its assertion
  could run before the migration did. It now awaits, and asserts the refspec
  is absent first so the claim is about the call rather than about the
  fixture.

## What this review changed as a result

- `test/route.test.ts` — four cases driving the direct-API branch (finding 1).

Finding 4's change landed earlier in the session, with the retirement that
moved the file; this review records it rather than claiming it.

## Owed

- The call-site exclusion guard in `routeLive` is unreached by any test
  (finding 2).
- `src/verify/prepare.ts` and `src/sessionState.ts`'s raw read have no
  tests (finding 5).
- No verb pins a named verifier, so a review addressed to a specific model
  cannot be asked for through the framework.
