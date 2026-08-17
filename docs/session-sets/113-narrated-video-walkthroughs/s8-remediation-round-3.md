# Session 8 — remediation, round 3 (fix-delta review)

Round 3 reviewed the fix delta from rounds 1 and 2. **Two of the three fixes
were accepted; one was rejected**, with a new blocking finding against the
fix itself. The rejection was correct and is fixed here.

---

## Accepted

- **F1** — the guard-aborted partial recording no longer registers as an
  `os-video` artifact.
- **F3** — C5's missing-dependency variants now run through the real
  recorder, and the evaluator requires a manifest, a completed walkthrough
  and zero video artifacts from each.

---

## Rejected: F2's fix was incomplete — the run-count bar was not checked

**The finding.** `waiverCoverage()` verified that every unmet **criterion**
was named in the waiver, but never looked at the pilot's **run-count bar**.
The two are separate claims, and the gate was only reading one of them.

**The failure scenario, which is a realistic one.** A later re-measurement
produces C7 as its only unmet criterion — genuinely covered by the operator's
waiver — but yields fewer than the ten consecutive clean runs the pilot
requires, because a run was noisy, a desktop was busy, or the measurement was
shortened. `evaluation.verdict` would be `FAIL` and `barRunsMet` would be
`false`, and the gate would have approved capture anyway: every unmet
criterion really was named in the waiver.

**Why the first fix missed it.** The fix was written to answer the question
the round-2 finding asked — *does the waiver cover what is unmet?* — and
"unmet" was read as the criteria list, because that is what a waiver waives.
The run-count bar is not a criterion, so it fell outside the check without
anyone deciding it should. That is the shape of an incomplete fix rather than
a wrong one, and it is exactly what a fix-delta review exists to catch.

**The fix.** `waiverCoverage()` now additionally requires the bar:

```
barRunsMet !== false        (or, when absent, cleanRuns >= runsRequired)
```

and refuses with a message that names the shortfall — *"the measurement did
not meet the pilot's run-count bar (4 clean of 10 required). A waiver excepts
CRITERIA, not the number of consecutive clean runs, and s8-operator-waiver.json
does not claim to."*

The reasoning is recorded in the code beside the check: **ten consecutive
clean runs on a fresh fixture is what distinguishes a backend that works from
one that worked once**, nothing in the operator's attestation waives run
counts, so the gate does not either.

**Falsifiers, both directions** (L-112-1). A bar-failing measurement whose
every unmet criterion IS waived must be refused; the same waiver against a
bar-meeting measurement must be sufficient. Without the second, the new check
would be indistinguishable from a gate that refuses everything.

The current committed measurement meets the bar (10 of 10), so the live gate
verdict is unchanged: gdigrab approved by waiver, OBS still refused.

**No re-measurement was needed.** This change is in gate logic, which the
pilot harness does not exercise; `s8-gdigrab-capture-measurement.json` still
describes the code that produced it.

Unit coverage for this session's guards and gate is now 35 tests, of which 14
are planted falsifiers.
