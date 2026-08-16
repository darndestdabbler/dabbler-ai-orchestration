# Session 4 remediation — discovery rounds 1 and 2

Round 1 was the two-lens discovery fan-out (`gpt-5-6-sol`,
spec-conformance and failure-scenario); round 2 was the supplementary
completeness pass over the same evidence. Together they raised nine
findings, which are **six distinct defects** — the two lenses converged on
three of them (1≈5, 3≈6, 4≈8).

**Every finding is accepted. None is disputed.** Two of them are defects in
the *instruments* this session built to prevent false positives, which is
the outcome an adversarial round is for.

---

## The six defects

### 1. The recorder was presented as available while the verdict was FAIL

*(findings 1 and 5, both lenses)*

The criteria say plainly that a fail ships no recorder, and the spec says a
fail defers desktop capture with evidence. The tree nevertheless registered
`npm run walkthrough:vscode` and documented it, with the word
"provisional" in an outcome document doing all the gating. The verifier's
sentence is the one that lands: *"Calling it 'provisional' in prose does
not enforce a gate."* A user cannot tell "present pending approval" from
shipped.

**Fixed by removal first.** The `npm run` entry is gone — that was the
surface presenting it as available. The README section is retitled **NOT
APPROVED FOR USE** with a link to the outcome. And the recorder now reads
the pilot's own committed `evaluation.verdict` and announces its status on
every run, so the notice is **derived from the record rather than written
in prose**, and stops printing by itself when the verdict changes.

**What was not done, and why.** The verifier offered "remove the recorder
and retain only the measurements" as one acceptable route. The code stays,
because the pilot harness *drives* the recorder — deleting it deletes the
evidence this session exists to produce. What was removed is every surface
that presented it as available, which is what the criterion protects.

### 2. Capture failures destroyed the walkthrough instead of degrading

*(findings 3 and 6, both lenses — the most serious of the six)*

Only `ObsUnavailableError` was caught. Everything else propagated out of
the run, and the caller then deleted the output directory and exited
non-zero. Two realistic failures did exactly that:

- `configure()`'s refusal to guess between two Extension Development Hosts
  throws a **plain** `Error`, and a developer with a second host open hits
  it routinely.
- `startRecording()` throwing — the `output-never-started` case this
  session had just added — was raised *outside* the setup catch entirely.

So a person who wanted a walkthrough and could not have a video got
**neither**. That inverts the spec's rule.

**Fixed at all three points.** Setup, start and stop each degrade now: the
failure is named, a note explains it, cleanup runs, and the walkthrough
completes and writes its documents with no video artifact.

### 3. C6 passed on evidence that was not the evidence it asked for

*(findings 4 and 8, both lenses)*

C6 requires cleanup **including when the run fails part way**, proved by an
induced mid-run failure. It was passing on the three dependency-absent
variants — and the evaluator asserted in its own note that those *"ARE the
part-way failures C6 asks for"*. They are not. All three die during setup,
and two of them before a scene collection or profile exists at all, so they
exercise a cleanup with almost nothing to undo.

**Fixed by measuring the case that was missing.** A named internal test
seam throws a **plain** `Error` at each of the three points a capture can
fail, and the pilot runs all three. Each must satisfy both halves: nothing
left behind (no OBS process, no collection, no profile, no run marker,
config restored) **and** the walkthrough intact (completed, manifest
written, zero video artifacts, every step driven). All three now do —
measured, with the state at the moment of failure recorded so the
assertion is against a state that demonstrably existed.

The same finding noted that cleanup **suppressed** errors: a VS Code that
would not close was swallowed. It is now reported, because a leftover
process is exactly what C6 is about.

### 4. The shipped recorder silently enabled obs-websocket

*(finding 7)*

The documentation said the human enables the websocket once in OBS's UI.
The code enabled it automatically on every run — including in the state the
documentation calls a supported missing dependency, and including for a
user who had deliberately turned it off. The journaled decision even said
*"the harness never writes OBS configuration outside this session's own
pilot"*, and the shipped path did.

**Fixed by making it opt-in and defaulting it off.** Only the pilot passes
`mayEnableWebsocketConfig`, and only because it restores the file
byte-for-byte and C6 now asserts that it did. For everyone else, "websocket
off" produces the clean `unreachable` failure and a no-video walkthrough,
which is what was always documented.

### 5. Supplementary runs were counted toward the bar without being judged

*(round 2's single finding — a defect in the instrument built to prevent
exactly this)*

`cleanRuns` included `measurement.supplementaryRuns`, while C1–C4 were
evaluated over `measurement.runs` alone. On the *designed* path the
supplementary run is the one that supplies the tenth capture, because the
control-carrying run's video is excluded — so the recording that made the
bar was the one recording never checked against a single criterion. A
wrong-window supplementary capture with leaked pixels and broken caption
timing would have counted as clean.

**Fixed by evaluating every recording that can count.** C1–C4 now run over
primary and supplementary runs together; only C3's *baseline* frame still
comes from a primary run, since the resize comparison needs a fixed
reference. Two falsifiers pin it.

### 6. The ffmpeg fallback was never evaluated

*(finding 2)*

Accepted as a real gap in the record, and closed by **recording it rather
than by doing it**. ffmpeg is not installed on this machine, and installing
software on the operator's machine is their decision. The outcome document
now carries a section stating that, the argument that the fallback's
trigger is arguably unmet (OBS did not fail at *capture*), and the
hypothesis worth having for whoever runs it: `-an` would satisfy C7's
unmet audio clause, while GDI capture would very likely fail C1 and C2 for
the reasons that made OBS primary. Residual **S4-R7**.

---

## What the fixes cost the verdict

Nothing was softened to make a number move. The verdict is still **FAIL**
on C2 and C7, for the same reasons and with the same measurements.

C6 went **FAIL → PASS** during remediation, and in the honest direction: it
first went *from* an unearned pass *to* a fail the moment the evaluator
started demanding the right evidence, and then back to a pass once that
evidence was produced and came out clean. The intermediate fail is in the
record.

## Tests

51 passing. Nine new falsifiers cover the two evaluator defects: C6 refuses
to pass on setup failures alone, on a missing induction point, on a
leftover process, collection or unrestored config, and — the half that
matters most — on a capture failure that cleaned up perfectly while
destroying the user's walkthrough. Two more plant a bad supplementary run
and assert C1 and C2 catch it.

---

# Round 3 — the remediation review, and the one finding that is not mine to close

Round 3 reviewed the fix delta and returned **3 fix-accepted, 2
accepted-with-modification, 1 fix-rejected**, with one blocking finding
carried forward.

## Accepted outright

- **L3 / L6** — capture failures degrade without destroying the walkthrough.
- **L7** — ordinary recorder runs no longer enable obs-websocket.
- **L9** — supplementary recordings are now evaluated against the per-run
  criteria.

## Accepted with modification, and both modifications made

### L1 — `announceStatus()` failed open

> *"the direct CLI still runs under `FAIL`, and `announceStatus()` fails
> open when the measurement is missing or unreadable."*

Correct, and the fix is one branch: a missing or unreadable measurement is
**not** evidence of approval, so it now prints the not-approved notice
naming that it could not read the record, instead of staying silent. A
checkout without the pilot record can no longer present this as an ordinary
tool.

### L4 — two of the three injections proved less than the prose claimed

> *"the variants named `configure` and `start` inject immediately before
> those operations, not inside or after them."*

Exactly right, and the sharpest observation of the round. Both injections
moved **after** their operations — after `configure()` returns, and after
`startRecording()` returns.

More importantly the claim is now **evidence rather than placement**. The
seam hands the live session to the pilot before throwing, so each induced
failure records the OBS state at the instant it threw, and the evaluator
**requires** that state to be post-operation:

| induced at | collection | scene items | recording active |
| :--- | :--- | :--- | :--- |
| `configure` | `dabbler-walkthrough-collection` | 1 | **false** — created, not yet recording |
| `start` | `dabbler-walkthrough-collection` | 1 | **true** |
| `stop` | `dabbler-walkthrough-collection` | 1 | **true** |

Three falsifiers pin it: no recorded state fails C6, `sceneItems: 0` fails
C6, and a `start` failure with no live recording fails C6.

The same nit noted an *"unexplained singular `inducedFailure`"* still in the
measurement showing `walkthroughStillCompleted: false`. It was a leftover
from an earlier instrument that induced a **driver** failure rather than a
capture one — a different experiment, superseded by the plural field, read
by nothing, and genuinely confusing sitting beside it. Removed.

## Fix-rejected — and escalated rather than re-argued

**L2, the ffmpeg fallback.** The attempt to close it by *recording* it
rather than *doing* it was rejected, and the rejection lands:

> *"The claim that OBS 'did not fail at capture' improperly narrows the
> trigger: C7 is part of the authoritative capture criteria, OBS's verdict
> is FAIL, and the outcome itself acknowledges that ffmpeg `-an` could
> satisfy C7."*

Accepted. What changed in response is the **evidence**, not the argument:
the vague "ffmpeg is not installed" became a checked reachability table —
no ffmpeg on `PATH`, Playwright's bundled build compiled
`--disable-everything` with **no devices at all** and therefore no
`gdigrab`, no package-manager shim, no `C:\ffmpeg`. The fallback is not
merely unmeasured; it is unreachable without installing third-party
software on the operator's machine.

**This session stops here rather than spending its last remediation cycle.**
The review's own acceptance criterion offers two routes — run the fallback,
or record an explicit operator ruling that its absence terminates the
evaluation — and this session can produce neither on its own authority.
Installing software on the operator's machine is their decision, and
building a second capture backend is the expansion the spec's own Session 4
budget forbids in the same breath as it names the fallback. Resolving a
spec-versus-spec tension about scope is an operator adjudication.

Manufacturing the ruling would be the worst option available, so it is
**journaled and escalated**: `decisions.jsonl`, authority `human`, tiebreak
`escalate-to-human`, residual **S4-R7**.

## Verdict, unchanged

Still **FAIL on C2 and C7**, same reasons, same measurements. Nothing was
softened to move a number. 54 tests passing.
