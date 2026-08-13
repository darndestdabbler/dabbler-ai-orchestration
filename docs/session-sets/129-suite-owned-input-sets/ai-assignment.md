# AI Assignment — Set 129

## Session 1 of 2 — The suite declares its inputs

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic`.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** `gpt-5.5` (openai) on every round — a different effective
provider from the orchestrator's, resolved by model-registry lookup and
enforced by the exclusion (`excluded providers: anthropic`). The verdict
is independently corroborated; no `verification_qualification` is owed.

**Rounds:** five. Discovery fan-out of 2 (lenses `spec-conformance` and
`failure-scenario`) → 5 Major; supplementary → 1 Major; remediation-review
→ 1 Major; remediation-review cycle 2 → 2 Major; operator-authorized
round 5 → **VERIFIED**, 0 findings, 8 fixes accepted and 1
accepted-with-modification.

Nine Major findings in total. All nine accepted, none disputed, all nine
fixed. Round 5 required the operator's `--operator-authorized-round`
attestation because cycles 1 and 2 were spent settling the *earlier*
rounds' fixes, leaving round 4's two findings fixed but unreviewed —
recorded in `s1-rounds.jsonl`.

**What the routed verification actually bought.** More than a check. The
re-derivation of `covers` was empirical for Layer 1 (a full pytest run
under an audit hook) but derived Layer 2 and Layer 3 from their *commands*
— which name the build inputs and not what the specs read at runtime. The
verifier found that gap, and then found the harder thing underneath it: a
narrowing this session had written down as a *deliberate decision*, with
sound-sounding reasoning, resting on a false premise. Layer 3 does not
exercise the published router; `vsix-first-run-walkthrough.spec.ts` sets
`DABBLER_ROUTER_INSTALL_SPEC` to the repo root and `pip install -e`s this
tree. A same-author review does not catch its own premise.

## Recommendation for Session 2

**Continue with the same orchestrator** (`continue-current-trajectory`).
Session 2 is the doctrine-and-record half: A5's answer and the corrected
safety claim into the authoring guide, eight refusals and six
trigger-gated deferrals recorded where an author meets them, A5 closed in
`session-step-skeleton-and-verification-cost.md`, and `change-log.md`.
Its inputs are `verdict.md` and this session's own reasoning about what
was declared, what was refused, and why — context that is expensive to
rebuild and cheap to carry.

The verifier must remain a non-`anthropic` provider, as it was here.

---

## Session 2 of 2 — A5 answered, and the apparatus refused

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic` — the same
trajectory Session 1 recommended.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** `gpt-5.5` (openai) on both fan-out calls — a different
effective provider from the orchestrator's, resolved by model-registry
lookup and enforced by the exclusion (`excluded providers: anthropic`).
No `verification_qualification` is owed.

**Rounds:** one. Discovery fan-out of 2 (lenses `spec-conformance` and
`failure-scenario`) → **VERIFIED**, 0 findings, no remediation loop
opened. Both lenses independently checked the A5 doctrine against
`verdict.md`, the authoring guide, the diagnosis note, the module
recommendation, the constitution echo, the changelog fragment, the set
change log and the drift-guard test change.

**What actually caught something was the targeted run, not the round.**
Per A1/A2 only targeted tests preceded verification, and one of them
failed: `test_changelog_round_trip_flags_a_planted_reorder` planted its
reorder into `load_fragments(...)[0:2]` — the two *newest* fragments —
while `changelog.check()` deliberately re-renders from the **baseline**
set alone. The falsifier therefore only ever fired while at most one
post-baseline fragment sat above the frozen corpus, and this session's
own changelog fragment made it two. A mandatory close-out artifact
disarmed a falsifier, silently, and only the targeted run said so. The
fix is test-only: select from the baseline corpus and assert that corpus
is non-empty (L-112-1), which is precisely what the sibling helper in
`test_changelog_partition.py` already did and the drift-guard copy did
not (L-069-1). The gate itself was never wrong.

The generalisable shape: **a falsifier that selects its plant by
recency** is a falsifier whose target drifts with ordinary repo growth. A
gate proved by planting must plant into the corpus the gate reads, and
must say so in an assertion rather than in a comment.

## Recommendation for the next set

**A fresh orchestrator, and a set this repo does not currently have
queued.** Set 129 closes A5 and, with it, the last open item in
`docs/planning/session-step-skeleton-and-verification-cost.md`. Nothing
in this set names a successor, and every deferral it records is
explicitly **trigger-gated** — none of those triggers is true in this
repo today, and authoring against an untriggered row is exactly the
"validating selection against no real consumer" failure the verdict's
sizing argument rejected. The next set should therefore come from the
operator's own queue rather than from this set's tail.

Two observations worth carrying into whatever comes next, neither of them
a proposal:

1. **The preload corpus is at its ceiling.** After this session's
   one-sentence constitution edit the manifest reads 12,183 of 12,200
   tokens (constitution 4,162/4,200; `project-guidance.md` and
   `lessons-learned.md` both at exactly 100%). Ceilings ratchet down only,
   so the next session that needs to add preload prose must remove prose
   first. That is a Step 9 matter, and this session's Step 9 records it.
2. **A5's answer is now load-bearing in three files at once** — the
   authoring guide (canonical), the constitution (Step 8's one-sentence
   echo) and `run_of_record.py`'s docstrings. That is the L-064-8 shape,
   so a future change to suite selection has three echoes to fix, not
   one.

