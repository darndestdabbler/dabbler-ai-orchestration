# AI assignment — Set 123

One block per session, appended at that session's Step 3.5.

---

## Session 1 — One entry point that resolves the type

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** The work is implementation and
architecture: a new resolver module, a precedence rule, and a change to
the load path every consumer of `router-config.yaml` goes through. The
temporary verification-only policy window (Sets 110-112, carried by the
constitution's Delegation Discipline pointer) assigns those to the active
orchestrator. Only `session-verification` was routed, and it ran on a
different effective provider (`gpt-5.5`; `anthropic` excluded
automatically by registry lookup on the orchestrator's model).

**What routing bought — the whole design of the precedence rule.** Five
rounds, and the routed reader was right every time:

- Round 1 (two lenses) caught that the resolution *record* advertised a
  `transport_profile` the loader would never dispatch with — the split
  brain this session exists to remove, reintroduced one layer up, inside
  a decision I had journaled deliberately. The decision survived; my
  incomplete implementation of it did not.
- Round 1 also caught `--confirm` writing to the invocation directory:
  a setup command that reports success and configures nothing.
- Round 2 (supplementary) caught the mirror image on the read side — the
  nearest `project-verify-type.txt` answering instead of the project
  root's, which would have made the fact cwd-dependent again.
- Rounds 3 and 4 each caught a narrower variant of the anchoring rule:
  first that the caller's project outranked the explicitly-loaded
  config's, then that a loaded project which had committed *nothing* was
  still answered by somebody else's file. Round 4's version did not merely
  mis-route — it made the target project's config fail to load.
- Round 5 (operator-authorized past the bound) returned VERIFIED with six
  fix verdicts accepted and no findings.

The pattern across all five is one class: **I kept writing "the file
wins" and testing the case where a file exists.** Every finding lived in
a combination where one of the two projects had *not* chosen. A reader
who was not holding my mental model found each one.

**On the operator-authorized round.** Rounds 1-4 narrowed 5 findings to 1
to 1, which is convergence rather than thrash, and the round-4 anchoring
fix was the one change no independent reader had seen. The operator
authorized exactly one round for that reason; it settled clean.

**Next orchestrator: continue.** Session 2 (the qualified verdict) works
on `verification*.py` / `session_state.py` and needs the live context of
what the resolver now guarantees — specifically that a resolution names a
transport profile only when the project has committed one, which is the
precondition Session 2's cross-provider check reasons about. No blocker,
no cost pressure, no capability gap.

**Next set: unchanged.** Set 123 continues to Session 2. Nothing here
reorders the queue; Session 3 (delete the webview) still depends on
Sessions 1-2 shipping the replacement first, which is why it is last.
