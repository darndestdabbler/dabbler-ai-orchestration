# S3 remediation — round 3 (fixes for discovery rounds 1 and 2)

Three distinct blockers across the two discovery phases, **all accepted, none
disputed.** The discovery fan-out (2/2 calls) independently raised the same two;
the supplementary completeness pass added a third that neither had seen.

## F1 — the builder hardcoded one machine's absolute path (Major, accepted in full)

**Raised by:** both discovery calls, independently.

`s3-checklist-builder.py` opened `d:/Projects/dabbler-ai-orchestration/...`.
Anyone who cloned this repo anywhere else — or onto any non-Windows machine —
got `FileNotFoundError` on the one artifact whose entire purpose is to be
re-runnable. The verifier's framing is exact: it *"blocks them from verifying or
reusing the session's own tooling"*, and the tooling's whole claim is that the
checklist's literals were bound from source rather than typed.

**Fixed.** Paths now resolve from `__file__` — the script sits three levels below
the repo root, so `REPO` derives from its own location and `OUT` is written
beside it. `os.path.join` throughout, so the resolution is not Windows-shaped
either. The companion `s3-checklist-fill.py` got the same treatment (with a
`CHECKLIST_PATH` override for anyone who wants to point it elsewhere).

**Verified by re-running both scripts from the repo root**: same four items, same
seven bound literals, same 2,588 characters of human-facing text, and the
tutorial-drift assertion still passes.

## F2 — `ai-assignment.md` described a timing protocol that never ran (Major, accepted in full)

**Raised by:** both discovery calls, independently, and it is the sharper of the
two.

The step-3.5 block argued at length for a **six-mark clock protocol** deriving
four durations, including an agent-time subtotal. Then the operator cut the
checklist to two marks, and the walk happened before even that existed — so the
number is an after-the-fact estimate and **none of the four durations exist**.
The design document still read as though they did. The verifier's failure
scenario is precisely right: a future reader *"places undue confidence in the
'under 15 minutes' claim, minimizing the significance of the 'operator's
estimate' caveat mentioned in other files."*

That is the **overclaim** class this session's own conventions block named as
material, arriving in the one file nobody had re-read after the checklist was
resized.

**Fixed, by correcting the record rather than deleting it.** The departure entry
now carries three parts: the original argument (retained — the rejection of the
stop-the-clock design stands on its merits and a future set may face the same
choice), what actually happened (cut to two marks, then walked with none), and an
explicit statement that **no six-mark protocol was ever executed and none of the
derived durations exist**, so the figure carries the precision of a competent
person's estimate and nothing more.

**Propagated to every echo in one pass (L-065-1)**, rather than fixed at the
reported site: the routing-plan row that promised *"the four durations"* now
reads *"the in-window time... with its provenance stated"*, and the
walk-setup departure's `P0→P1` bookkeeping is replaced by what the four-item
checklist actually does. A grep for `six clock|six marks|six-mark|four
durations|P0|T3|T4` across the set's artifacts returns only the corrected
passages.

## F3 — the checklist carried its own result in its instructions (Major, accepted in full)

**Raised by:** the supplementary completeness pass — neither discovery call saw
it, which is the case for running that phase.

The transcription step appended a `WALKED 2026-07-30/31 ... VERDICT: the
criterion is met` summary to the checklist's `Notes` field. `Notes` is the
**walker's instructions**; the outcome belongs in the per-item `Result` fields
(where it already was) and in `s3-walk-evidence.md` (where it already was, at
length). The verifier is right that this *"conflates the instrument with its own
result"* and that a future orchestrator could copy the shape.

**Fixed by removal, not rewording** — `project-guidance.md`'s
removal-over-addition rule, applied to the thing that was added. The summary was
redundant in both places it duplicated, so deleting it costs no information.
`s3-checklist-fill.py` now carries a comment naming the finding so the append
cannot come back.

`Notes` is back to its 1,313-character instruction preamble; the four `Result`
fields and their `Passes: true` values are untouched.

## What was NOT changed, and why

No tutorial change and no command change. Nothing in these three findings touches
`hello-world.md` or `Dabbler: Try a sample project` — they are defects in this
session's own bookkeeping and tooling, which is the only surface it ships. The
walk's substantive finding (the GHE prerequisite cost) remains triaged to a
follow-on set for the reasons in `s3-walk-evidence.md`.

## Suite after remediation

`tutorial_gate.py` **OK**; both checklist scripts re-run clean and reproduce the
committed artifact byte-for-byte apart from `DocumentDate`. No Python in the
shipped package changed, so the pytest baseline (3149 passed / 6 skipped) is
unmoved.
