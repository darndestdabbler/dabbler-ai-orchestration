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

---

## Session 2 — the qualified verdict

**Orchestrator:** github-copilot / anthropic / claude-opus-5 / high.

**What the session actually was.** The spec framed Session 2 as a warning
plus a field. It was neither, quite: the operator's standing decision 3
("verification with the same provider is better than no verification at
all, but the results should be flagged") turned out, on contact with the
code, to require **relaxing a machine-enforced close gate**. Today's
behaviour when no different-provider verifier exists is not "no
verification" — it is `verification_unavailable`, whose only exit is
`close_session --manual-verify` with an operator attestation naming a
different-provider surface, and `validate_stamped_row` check 5 rejects any
row whose verifier resolves to the orchestrator's provider outright.

That is a materially different question from the one the design doc
answered, and it is a verification reduction, which is never
self-authorized. I stopped, briefed the operator with the three options and
their consequences, and they re-ruled for the automatic path. Journaled to
`decisions.jsonl` with `authority: human`, `verification_effect: reduces`,
and the attestation.

**What verification caught, and the one class it all belonged to.** Four
rounds, six findings, every one accepted, none disputed. The class:
**the machinery was correct and unreachable.**

- `_init()` loads config with `require_api_keys=True`, which raised on the
  first keyless enabled provider — so the exact single-key `DIRECT_API`
  machine the ruling exists for died before the precondition could run.
- `verify_session` passes the orchestrator exclusion explicitly and
  `route()` unions caller exclusions in, so lifting the router's own
  exclusion achieved nothing through the sanctioned CLI.
- The qualification was computed by `complete_stamp` and **dropped** by
  `record_call`, which writes only `STAMP_FIELDS` — and the close gate
  reads the row, so the bijection was enforced against a field that never
  arrived.
- The disposition JSON Schema (`additionalProperties: false`) rejected the
  field the code writes — the same shape I had already fixed on the
  envelope schema, missed on its sibling. `L-066-1` and `L-069-1` together.
- Disabling a keyless provider left its **models** selectable, because
  `pick_model` reads `models[].is_enabled` and never
  `providers[].enabled` — so a pinned keyless verifier was still chosen and
  still died at dispatch, in the *satisfied* case, on a machine holding a
  perfectly good cross-provider key.

**Why I did not see any of it.** Every falsifier I shipped before
verification drove a unit directly: the precondition function, the
classifier, the stamp validator. Not one of them travelled the path a real
degraded machine takes. A permission that cannot be exercised is
indistinguishable from one that was never built, and unit falsifiers cannot
tell those apart by construction. The remediation's first reachability
falsifier crashed immediately on `NameError: name 'sys' is not defined` in
`ai_router/__init__.py` — every degraded run would have died there, and no
amount of reading the branch had surfaced it (`L-112-1`, exactly).

**On the irony budget.** The spec allowed 25 new test functions across the
set; Session 1 spent 16 and I planned Session 2 to land on 25 exactly. It
ships 12 (28 total, three over). The three extra are the reachability
falsifiers verification proved were missing. The budget's own framing is
that the number is the check, not the goal — and the check fired correctly:
it said the resolution rule had not grown, but my *evidence* had a hole in
it.

**Next orchestrator: continue.** Session 3 deletes the webview and rewrites
the first-run walkthrough against the terminal flow that Sessions 1-2 now
provide. It needs live knowledge of what the resolver guarantees and of
where the setup path actually lives, and it is mostly deletion plus a
`package.json` edit under `L-064-12`'s full Layer 3 run. No blocker, no
capability gap.

**Next set: unchanged.** Set 123 continues to Session 3, the last session.
Session 3's step 2 is the true cold-start dogfood (`L-079-3`) and it should
pay close attention to the config change this session made: a keyless
provider is now disabled rather than fatal, which is precisely the
condition a fresh project will be in.
