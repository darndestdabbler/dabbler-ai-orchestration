# Session 2 — remediation, round 1

Both round-1 discovery findings were **accepted without argument**. Neither was
disputed, reshaped, or partially waived. The supplementary pass (round 2)
returned VERIFIED with zero new findings, so these two are the whole set.

---

## Finding 1 — Major, Correctness — ACCEPTED

> **A refused non-canonical severity can leave a raw-only verification round
> that the next run skips.**
> Evidence: `ai_router/verification.py:407`, `ai_router/verify_session.py:618`,
> `:3958`, `:4080`, `:1344`.

### Why it is right

The draft's safety argument was *"the raw `sN-verification*.md` is persisted
before parsing (L-064-3), so a refusal costs the envelope, never the paid
response."* That is true and **insufficient**. The verifier traced one step
further than the argument did:

- `write_issues_artifact` runs **before** `record_round_completed`.
- `resolve_round` advances on **raw-artifact existence**.
- The cross-round ledger reads **only** `sN-issues*.json`.

So a raise left a round with a raw artifact, **no envelope, and no ledger
entry** — and the next invocation would take the *next* round number and never
carry the finding forward. A vocabulary shipped to close an anti-laundering
hole had opened one. The trigger is not exotic: `Severity: major` is ordinary
case drift, which `_parse_issue_blocks` accepts by design via `re.IGNORECASE`.

### The fix — refuse the token, not the round

`ai_router/verification.py` gains `canonical_severity_for_write(severity)`,
which **never raises** and returns the canonical token or `None` (omit the key):

| given | persisted | blocking before → after |
| :--- | :--- | :--- |
| `Critical` / `Major` / `Minor` | unchanged | unchanged |
| `minor`, `MINOR`, `" Minor "` | `Minor` | nit → nit |
| `major`, `High`, `unknown`, prose, `""`, non-string | **omitted** | blocks → blocks |

`write_issues_artifact` uses it, **always writes the envelope**, copies rather
than mutating the caller's issue list (that list is what the round's blocking
decision and ledger were computed from), and prints a loud `stderr` line naming
the refused token. `require_severity` survives as a **post-condition guard** on
the writer's own output — it can now only fire on a bug in
`canonical_severity_for_write`, never on anything a verifier said.

The one value ever rewritten is a token that already lower-cases to the sole
non-blocking severity, rewritten to that severity's own canonical spelling.
Omitting it instead would silently convert a nit into a blocker and *lengthen*
the loop.

### Acceptance criterion (judgment) — met

> *A verifier response with an Issue whose severity is `"major"` must not leave
> an unledgered raw-only round that future `verify_session` runs skip; the
> finding must either be persisted as blocking without a non-canonical severity
> value or the round must remain explicitly blocked until repaired.*

The first branch is taken: the finding is persisted as blocking, with no
non-canonical value. `test_verify_session_phases.py::
test_a_non_canonical_severity_still_ledgers_the_round` drives a **full round**
through `vs.run()` with `Severity: major` and asserts the envelope exists, the
severity token was refused, `is_blocking_issue` is still `True`, and
`s1-rounds.jsonl` carries `"round-completed"` with `"blocking": true`.

---

## Finding 2 — Major, Completeness — ACCEPTED

> **The pull-verifier path still persists arbitrary severity strings.**
> Evidence: `ai_router/pull_verifier.py:149`, `:1681`,
> `ai_router/tests/test_pull_verifier.py:384`, `ai_router/pull_critique.py:10`,
> `ai_router/path_aware_critique.py:662`.

### Why it is right

The draft closed the `submit_verdict` **JSON Schema** and claimed the surface
was closed. A schema `enum` is a **declaration to the provider, not an
enforcement**: `_parse_verdict` copied any string into `Finding`, and
`Finding.to_dict()` emitted any non-empty severity onto disk. The verifier also
noted the existing test *asserted* lowercase `"major"` survives — so the open
vocabulary was not merely reachable, it was **pinned by a test**. That is the
sharpest part of the finding, and it is correct: this session claimed to close
a vocabulary that its own suite locked open.

This is also the G-008 sibling-site rule biting: the same class of defect on a
parallel writer, which the first pass fixed at one site only.

### The fix

`_parse_verdict` applies the same `canonical_severity_for_write` before
building a `Finding`, with the same loud `stderr` note. `Finding.to_dict()`
already omits an empty severity, so omission is the natural representation and
blocking semantics are preserved through the pull surface's readers too.
**It does not raise** — a paid agentic critique must not be discarded over a
token, and `test_the_parse_never_raises_on_a_bad_severity` pins that.

`test_pull_verifier.py::TestVerdictSchema::test_valid_verdict_parsed` was
updated from asserting `severity == "major"` to asserting the token is refused
and the key omitted. **This is a corrected assertion, not a weakened one:** the
finding it locks in is unchanged and still blocks, and five new cases in
`test_severity_vocabulary.py::TestPullVerifierProducerIsClosedToo` assert the
producer path across canonical, non-canonical and non-blocking tokens.

### Acceptance criterion (judgment) — met

> *The pull-verifier `submit_verdict` parse/write path must be unable to
> produce a critique finding with a non-canonical severity value; payloads such
> as `"major"` or `"Medium"` must be rejected before persistence or represented
> without a severity key.*

The second branch is taken: represented without a severity key.

---

## What changed, and what did not

**Changed:** `ai_router/verification.py` (adds `canonical_severity_for_write`;
`require_severity` re-documented as a post-condition guard),
`ai_router/verify_session.py` (writer refuses the token, always writes the
envelope, no longer mutates the caller's list),
`ai_router/pull_verifier.py` (`_parse_verdict` canonicalizes),
`ai_router/tests/test_severity_vocabulary.py`,
`ai_router/tests/test_verify_session_phases.py`,
`ai_router/tests/test_pull_verifier.py`,
`docs/session-issues-schema.md`, and §8 of
`s2-severity-discrimination.md` (G-012: the design change is propagated to
every echo in the same pass, including the conventions block this round's
verifier will read).

**Not changed, deliberately:** no measured number moved. The measurement in
§§1–7 rests on `sN-issues*.json`, `sN-rounds.jsonl`,
`sN-acceptance-round-*.json` and `git log` — all committed, none touched by
this remediation. The (a)/(b)/(c) call is unaffected: both findings are about
**how the vocabulary is enforced**, not about whether severity discriminates.
No gate was touched, and no verification-reducing change was made or proposed.

**Suite:** 386 passed, 3 skipped across `test_severity_vocabulary.py`,
`test_pull_verifier.py` and `test_verify_session_phases.py` after the last
edit. The full owed run of record is produced at Step 6.
