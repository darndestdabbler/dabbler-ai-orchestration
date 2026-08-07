# Set 111 — guided-look walk

> **Ten minutes.** Two sections. Nothing to set up.
>
> ```
> cd tools/dabbler-ai-orchestration
> npm run walk -- --walk-doc ../../docs/session-sets/111-verification-loop-and-ceremony-simplification/s4-uat-walk.md
> ```
>
> VS Code opens on a disposable fixture workspace with the Dabbler view
> already showing. Close the window when you are done.
>
> This walk is itself the acceptance test for the format. The word to beat
> is **"pleasurable."**

---

## Look

**1. The walk started itself.**
Run the command above.
Look at the window that opened: the Dabbler view is already showing, on a
workspace full of session sets you did not create.
*Did anything ask you to stage, open, or find something first?*

**2. The Work Explorer paints.**
It is the panel already in front of you.
Look at the tree: set rows, status icons, the N/M session fraction.
*Does it look right at a glance, or does something make you squint?*

**3. The size cap, on this very set.**
```
python -m ai_router.spec_admission --spec docs/session-sets/111-verification-loop-and-ceremony-simplification/spec.md
```
Look at the four lines it prints.
*Every session of this set is over the cap, and Session 4 is at 11 steps —
is that verdict fair, or is the check being pedantic?*

**4. The stale-run refusal, live.**
```
python -m ai_router.run_of_record check --session-set-dir docs/session-sets/111-verification-loop-and-ceremony-simplification
```
Look at whether it says "session touched none of this suite's surfaces" or
names a stale run.
*Is the message something you could act on at 6pm without re-reading it
twice?*

**5. The UAT gate refusing to let this very session close silently.**
```
python -c "from ai_router.gate_checks import check_uat_walk_recorded; from ai_router.disposition import read_disposition; d='docs/session-sets/111-verification-loop-and-ceremony-simplification'; print(check_uat_walk_recorded(d, read_disposition(d))[1])"
```
Look at the refusal text.
*Before this, a skipped walk was silence. Is this the right amount of
noise — or too much?*

---

## Decide

Three calls I could not make. Each has a **default if you say nothing**, so
"no answer" is a valid answer and the session still closes.

---

### D1 — The artifact-necessity table

**Where the set stands.** Set 111 has produced **65 files** across four
sessions. I went looking for who actually *reads* each required artifact.
The findings are uneven:

| artifact | who reads it | evidence |
| :--- | :--- | :--- |
| `sN-conventions.md` (3 files, 35 KB) | **Nothing, automatically.** `--conventions-file` is an optional hand-passed flag. Set 096 already automated the ledger half. | `verify_session.py:1122-1128` |
| `ai-assignment.md` (3.8 KB) | One parser in the extension (`extractRecommendation`) — but the UI that surfaced it was **removed in Set 048 S3**, and the accordion that used it **retired in Set 034**. | `openFile.ts:118-121`, `inProgressSetsService.ts:27-32` |
| `change-log.md` | **Heavily** — a close gate plus ~15 status-inference sites across Python and TypeScript. | `check_change_log_fresh`, `session_lifecycle.py` |
| one raw artifact per round (22 files, 41 KB) | The cross-round ledger assembles from them; they are the immutable evidence. | `verify_session.py` ledger |

**The question, in one sentence.** Which of these do we stop requiring?

**Options.**
- **(a) Retire `sN-conventions.md` as a required artifact**; keep
  `--conventions-file` as an optional flag for the suite baseline. *Cost:*
  the baseline/release-contract block becomes something the orchestrator
  writes inline rather than a file. *Reversible.*
- **(b) Also retire `ai-assignment.md`**, and delete its now-orphaned
  parser. *Cost:* loses a per-session written record of the
  next-orchestrator reasoning — though `disposition.next_orchestrator`
  already carries that structurally. *Reversible, but deletes a parser.*
- **(c) Keep everything.** *Cost:* the ceremony stays.

**My recommendation, with confidence.** (a) — **high confidence**; nothing
reads it and the automation that replaced most of it already shipped.
On (b) I am **genuinely split** and it is your call: the file is
near-orphaned, but it is also the only prose record of *why* an
orchestrator was chosen.

**Default if you say nothing:** nothing is retired. This is a
scope-reducing decision and I will not self-authorize it.

---

### D2 — The guidance admission bar

**Where the set stands.** The spec says `project-guidance.md` is 369 tokens
over its ceiling. **It is not** — commit `d3e00680` already brought it back
to exactly **3,499 / 3,499**, and that commit records the +369 figure as a
measurement artifact (a CRLF-inflating pipe). So the streamlining half of
Step 9 is already discharged.

What is *not* discharged is the structural problem underneath: the file is
at **100% of ceiling with zero headroom**, and Set 110's Step 9 promoted
three lessons into it with nothing coming out. Promotion is additive into a
full file.

**The question, in one sentence.** Should a promotion be required to name
what it displaces?

**Options.**
- **(a) A promotion must name what it displaces** — the promoting session
  states which entry is demoted or archived to make room. *Cost:* every
  promotion gets slightly more expensive. *Reversible.*
- **(b) An entry must fit in N tokens** or it is a doc, not guidance.
  *Cost:* needs a number chosen with no measurement behind it yet.
- **(c) A rule with an executable gate is archived rather than carried as
  prose.** *Cost:* none obvious — this one seems clearly right, and this
  session just created three such gates.
- **(d) Leave it; handle each breach ad hoc.**

**My recommendation, with confidence.** (a) **and** (c) — **medium-high
confidence**. (c) especially: L-064-12 and the test-run policy are now
enforced by `test_run_fresh`, so carrying them as preload prose is paying
twice. I would skip (b) until there is a measurement.

**Default if you say nothing:** no rule change. The ceiling still holds
today, so nothing breaks — the next promotion just hits the wall again.

---

### D3 — The close backstop has no bound *(carried from S2 and S3)*

**Where the set stands.** Session 1 made the verification loop's bounds
real: at most 2 discovery passes and 2 remediation-review cycles, machine
enforced. It worked — S3 closed with a cycle to spare.

The **close backstop** (`close_backstop.py`) has **no such bound**. It opens
a fresh verification round on every close attempt, forever. Session 2's
record is **six consecutive backstop rounds**, each a real metered dispatch
recorded as `$0.0000` because this seat cannot measure Copilot premium-request
spend. Unmeasured is not unbilled. It also never runs in CI, so its entire
cost lands on your machine at close time.

**The question, in one sentence.** Do we bound the close backstop?

**Options.**
- **(a) Bound it** (e.g. 2 rounds, then hard-stop to you). *Consequence:*
  spend becomes predictable; a genuinely-unfixed close blocks on your
  decision instead of grinding.
- **(b) Narrow it** — only re-round when the stamp is invalid *and* the work
  diff actually changed. *Consequence:* keeps unlimited rounds for real
  changes, stops the loop on no-op re-attempts.
- **(c) Leave it unbounded.** *Consequence:* maximum safety at the close
  gate, unbounded and unmeasurable cost.

**My recommendation, with confidence.** (b) — **medium confidence**. It
targets the observed failure (six rounds over a diff that was not moving)
without reducing coverage for the case the backstop exists to catch.

**This is a hard carve-out.** Set 111 S3 canonized that **anything reducing
verification is operator-held and can never be self-authorized** — and (a)
and (c) both reduce it. `decision_journal` will physically refuse to write
an AI-authority record for this. So I have built nothing here, and will not.

**Default if you say nothing:** unchanged (option c). Nothing breaks; you
keep paying the unbounded backstop when a close is contested.

---

*Answers are choices, not essays. "Default on all three" is a complete
answer and the session closes cleanly on it.*
