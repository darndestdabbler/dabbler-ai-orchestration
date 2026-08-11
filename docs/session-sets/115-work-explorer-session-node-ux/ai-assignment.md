# AI assignment — Set 115

One block per session, appended at that session's Step 3.5.

---

## Session 1 — The titles both writers already know

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** The work is a two-language
consistency fix across a writer, two readers and a tree scan, with a
recorded architectural constraint (no additional disk read) that had to
be honoured while changing the very path that reads. That is
implementation and architecture, which the temporary policy window
(Sets 110-112, extended by the constitution's Delegation Discipline
pointer) assigns to the active orchestrator. Only `session-verification`
was routed, and it ran on a different effective provider
(`gpt-5.5`, with `anthropic` excluded automatically by registry lookup on
the orchestrator's model).

**What routing bought.** Three Major findings across two discovery lenses
and one supplementary pass — and every one of them was a defect I could
not see from inside the change:

- Two lenses independently found that removing the write-on-read had
  made the *read* expensive (four `spec.md` reads per spec-only set per
  scan). I had verified "no file is created" and asserted "no additional
  disk read" without counting.
- The supplementary pass found that the parity I had just **documented**
  between the extension's inference and the router's backfill did not
  hold for an empty `activity-log.json` — a divergence older than this
  session, made newly harmful by the claim.

Both are the same class: a claim about behaviour that reads as verified
because it is written down. That is what a cross-provider reader is for.

**Next orchestrator: continue.** Session 2 (session-node activation) is
the same surface — `providers/`, `commands/openFile.ts`, and the same
`readSessionSets` row model this session just restructured — and it
inherits live context about the reader's read-count budget and the new
`specTitles` threading. No blocker, no cost pressure, no capability gap.

**Next set: unchanged.** Set 115 continues to Session 2. Nothing this
session learned reorders the queue; the step-ledger findings that
disqualify Session 4 are recorded and untouched by this work
(`step-ledger-findings.md` §8 explicitly holds Sessions 1-3 independent).
