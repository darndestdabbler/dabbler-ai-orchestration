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

---

## Session 2 — Left-click a session, land on its plan

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** Three of its four work steps are
implementation and design-decision work on a surface the previous session
had just restructured: the tree's command wiring, the file-opening
plumbing, and a parse rule that has to agree with a Python original. The
temporary verification-only policy window assigns those to the active
orchestrator. Only `session-verification` was routed, on a different
effective provider (`gpt-5.5`; `anthropic` excluded automatically by
registry lookup on the orchestrator's model).

**What routing bought.** Both discovery lenses returned VERIFIED with no
Critical/Major findings — the first zero-blocker round of this set. That
is a weaker signal than Session 1's three Majors, and worth reading
honestly: this session's change is small (one command, one pure module,
one optional argument threaded through an existing command) and it shipped
its falsifiers with it, including the fenced-sample case that would have
made the locator open a spec at its documentation template. The
failure-scenario lens explicitly reported trying to break the activation
path and finding nothing material.

The one nit is recorded and not fixed: when `spec.md` is **already open**
and scrolled elsewhere, the degradation path (`vscode.open`, no selection)
reveals the existing editor where it stands rather than forcing it to line
1. That is the same behaviour a set row's left-click has always had, and
matching the sibling surface is worth more than a literal reading of "at
the top" — the operator still ends up looking at the real file, which is
the rule the step is written to protect.

**Next orchestrator: continue.** Session 3 adds the session context menu
(run prompt + artifacts) on the node this session just made clickable, and
it reuses the same `openSpec` plumbing for the artifact QuickPick. The
live context that matters — the `contextValue` vocabulary, the menu-parity
test's forward/backward assertions, and why session-row menu entries are
*absent* rather than forgotten — is in this session's head. No blocker, no
cost pressure, no capability gap; verification stays cross-provider
regardless.

**Next set: unchanged.** Set 115 continues to Session 3.
`step-ledger-findings.md` still disqualifies Session 4 as written, and
nothing here touches that.
