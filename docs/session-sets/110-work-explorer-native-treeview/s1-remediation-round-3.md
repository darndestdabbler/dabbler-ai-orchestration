# S1 remediation — round 3 (the disputed Major, and the adjudication that went against me)

Against the single Major from round 5
([`s1-issues-round-5.json`](s1-issues-round-5.json)), which **rejected** the
round-2 activation fix.

---

## The finding

> *"The L5 remediation still substitutes a stub benchmark and payload size for
> the required real activation and first-paint measurements. `activate` and its
> dependency graph are imported before timing, so module loading is excluded.
> The harness calls `activate()` five times in one Node process against a
> vscode stub, rather than performing five cold activations. Payload bytes do
> not measure rendering latency."*

## What I conceded immediately

- Module loading **was** excluded by construction, and the document had
  compounded the error by *guessing* module loading might explain ~215 ms of
  unattributed activation time. Both wrong.
- The figures were warm and shared a process. Not cold activation.
- Payload bytes are not a latency, which the document already said.

## What I disputed, and the third-provider adjudication

I disputed the finding's implied requirement that S1 characterise the
migration's startup effect, on the grounds that the native tree **does not
exist until S2**, so no before/after is possible in S1.

The operator had pre-authorised one third-provider verification round. Spent
here, on a genuine disagreement rather than another identical pass. The
orchestrator is Anthropic and rounds 1–5 were verified by OpenAI, so the
adjudicator was routed to **Google** — sharing a provider with neither side.

**Adjudicator: `gemini-2.5-pro`. Verdict: `MUST_REMEDIATE_FURTHER`. It upheld
the verifier and ruled against me** ([`s1-third-provider-adjudication.json`](s1-third-provider-adjudication.json)):

> *"The orchestrator is wrong to defend the use of a warm, in-process stub for
> the activation measurement. While correct that the 'AFTER' state is
> un-measurable, they failed to fully measure the 'BEFORE' state as specified…
> They focused on the impossible part of the verifier's demand (measuring the
> future) while ignoring the verifier's still-valid point about the flawed
> current-state measurement."*

That is a fair description of what I did. Answering the impossible half of an
objection and citing that impossibility while leaving the possible half
undone reads as responsive and is not. **Accepted in full; the dispute is
withdrawn.**

The adjudicator named the remedy concretely: measure real cold activation,
capturing "Node.js module loading time and other synchronous bootstrap costs
excluded from the current in-process stub measurement."

---

## The fix

New harness
[`scripts/cold-activation.js`](../../../tools/dabbler-ai-orchestration/scripts/cold-activation.js).
Each rep is a **fresh Node process** that times `require()` of the real
`dist/extension.js` production bundle — module loading **inside** the
measurement — and then `activate()`. Nothing warm, nothing shared.

Raw: [`s1-activation-baseline.json`](s1-activation-baseline.json). Medians of 5
cold processes:

| | |
| --- | ---: |
| module load (`require` of the shipping bundle) | **54.3 ms** |
| `activate()` | **336.5 ms** |
| **cold bootstrap total** | **389.9 ms** |

**Two things the correction taught, one of which vindicates the old number and
one of which does not:**

1. `activate()` measured **336.5 ms cold** against **338.8 ms warm** — within
   noise. The warm harness was not wrong *about `activate()` itself*.
2. Module loading was a real **54.3 ms** that the warm harness excluded by
   construction, so the honest cold bootstrap is **~390 ms, not ~339 ms**. The
   document's guess that module loading might account for the ~212 ms of
   undecomposed activation time is now measured and **refuted** — module load
   sits outside `activate()` entirely.

Document changes:

- §2's bucket table gains module load and the cold total, and carries a note
  that the cold figures **supersede** the warm ones, naming both artifacts.
- The decomposition paragraph no longer speculates about module loading; it
  cites the measurement that rules it out.
- `s1-activation-measurements.json` is retained rather than deleted — it is
  still the honest source for `resolveWebviewView()` (0.1 ms) and the payload
  bytes — but its `activateMs` is explicitly marked superseded.

## What is still not measured, and why that is now a bounded claim

Renderer first paint. It needs a real renderer process. An attempt to capture
it through the Layer 3 Playwright harness was made and **abandoned rather than
faked**: the shipping tree paints rows only after a refresh in that harness, so
the number would have measured a refresh, not a first paint. A second attempt
to read VS Code's own *Show Running Extensions* activation figure failed on DOM
selectors. Neither attempt is presented as a result.

**This paragraph was overtaken by events — see the addendum below.** Round 6
rejected the cold-Node harness too, on the ground that it still never launches
VS Code, and the operator-authorized real-host attempt then failed twice. The
accurate statement is the addendum's: every activation figure here is
stub-measured, and the real-host baseline is owed to S4.

---

## Files changed

| file | change |
| --- | --- |
| `tools/dabbler-ai-orchestration/scripts/cold-activation.js` | new — cold, per-process, module-load-inclusive activation harness |
| `s1-activation-baseline.json` | new — the cold measurements |
| `s1-third-provider-adjudication.json` | new — the adjudication that went against the orchestrator |
| `s1-migration-decision.md` | §2 bucket table + supersession note; decomposition paragraph corrected |

No product code changed.

---

# Addendum — the operator-authorized real-host attempt, and its failure

Round 6 rejected the cold-Node harness for the same reason rounds 5 and 4 did:
`cold-activation.js` spawns fresh **Node** processes with `vscode-stub.js` and
never launches VS Code, so Electron spawn, the extension-host bootstrap, the
real vscode API and IPC stay excluded — exactly the surface the migration
changes.

The bounded loop was exhausted at that point (2 remediation-review cycles plus
the pre-authorized third-provider round), so the session **stopped to the
operator** rather than opening another cycle, as the constitution requires.

**The operator authorized one bounded real-host attempt.** It failed, twice:

| attempt | how far it got | what stopped it |
| ---: | --- | --- |
| 1 | launched a real EDH, opened the view | `triggerRefresh` timed out — the command palette never opened (`.quick-input-widget input` not visible in 10 s) |
| 2 | launched, opened the view, ran the refresh | no `[role="treeitem"]` ever became visible in 60 s — the tree painted no rows against the fixture |

Attempt 2 is the more informative failure: the fixture is built exactly as the
passing Layer 3 specs build theirs, but those specs wait on a **specific**
`[data-slug=...]` in a known state, while this one waited for *any* row. The
8-set all-not-started fixture evidently leaves the view in a state — empty
shell or fully collapsed — where no treeitem is visible.

**Disposition of the spec:** left in the repo, **skipped**, with both failure
modes written into its header and a concrete instruction for S4 (mirror
`session-sets-tree.spec.ts`'s specific-slug wait, then un-skip and run both
implementations through it). Not deleted, because the measurement is genuinely
owed and S4 needs the BEFORE half. Not left failing, because a red spec rots
the one gate this repo depends on (L-064-12).

**Consequence, stated without hedging:** every activation figure in this
session is stub-measured. The verifier was right about that through three
rounds, the third-provider adjudication was right to uphold it, and two
authorized attempts to fix it did not succeed. The residual is real and it is
now the largest single gap in S1's evidence.

**What it does and does not undermine.** It does not touch the host-pipeline
measurements, which are plain Node fs/subprocess work and need no extension
host — the ~102 ms empty-tree discovery floor and its `git worktree list` cause
stand. It does not touch the four API spikes, which ran in a real EDH. It does
not touch the density decisions, which the operator confirmed twice against
rendered evidence. What it undermines is precisely the claim that S1 measured
the migration-specific startup surface — and this session no longer makes that
claim.

---

# Addendum 2 — the measurement succeeded, and round 8's two findings

**The real-host measurement was obtained on the fifth attempt** (operator
authorized continuing after the fourth failed). Results, three cold reps,
no forced refresh: **launch → first row 11,582 ms; view open → first row
5,102 ms** (5083 / 5102 / 5221).

Both earlier write-ups of *why* it kept failing were wrong. The actual causes:

1. `launchVSCode(tmpPath)` opened the temp **parent** directory instead of
   `handle.repo_root`, so VS Code opened a workspace with no session sets in it
   and the tree correctly painted nothing. I had written this up as "the
   fixture leaves the view in an empty-state or all-collapsed shell" — a guess
   that sounded like analysis.
2. The run depended on `triggerRefresh`, whose command palette failed to open
   in three of four attempts. Dropping it was also the **more correct**
   measurement: forcing a refresh measures a refresh, not a first paint.

**The stub figures understated user-visible cost by more than 10×** (~390 ms
vs ~5.1 s). Every refusal by the verifier across rounds 4, 5 and 6 was correct
on the merits, and the first adjudication was right to uphold it.

## Round 8's two findings, both accepted

**F9 — the aggregate does not support the attribution I drew from it.** I wrote
that "only the ~124 ms scan provably survives the migration; the rest is
webview". The 5.1 s was never decomposed, so that attribution was unsupported —
an over-claim in the *opposite* direction from the one this session started
with. Withdrawn. The document now attributes none of the aggregate, says only
that a webview process, ~110 KB payload and an `innerHTML` render path are
inside it somewhere, and names the spec's four-buckets-at-four-scales
requirement as **still undelivered** in the real host.

**F10 — mutually exclusive instructions to S4.** §2 said "no forced refresh —
or the comparison is invalid"; §6 still said "including the refresh command —
or the comparison is invalid". §6 also still claimed the spec was skipped and
that no number came from a real host. All three were pre-success text that
survived because I replaced section **headings** without rewriting the bodies
beneath them — **L-065-1 for the third time in this session**. Fixed: §6 now
carries the single canonical instruction, §2 points at it rather than restating
it, and the superseded text is called out as superseded rather than silently
dropped.

The lesson, stated plainly for whoever reads this next: in this session the
echo-consistency failure was never a one-off. Citing L-065-1 did nothing;
grepping for the old claim's key phrases is the only thing that worked, and it
should be run *before* re-verifying, every time.
