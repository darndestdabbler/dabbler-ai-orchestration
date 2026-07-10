# Change Log — Set 090: Verifier Pre-Close Review Scope

**Set:** `090-verifier-preclose-review-scope` · **Sessions:** 1 · **Tier:** Full
**Closed:** 2026-07-10 · **Verdict:** WAIVED (operator-adjudicated; see below)

## What this set did

Retired a **recurring verifier category error** that blocked two consecutive
closes (Sets 088 and 089), each needing an operator override. When
`verify_session` runs (Step 6, **before** close-out), the adversarial verifier
read the spec's close-out "Ends with" lines (`close_session` succeeded /
`change-log.md` / final verdict / committed+pushed / `complete`) as **due
deliverables**, saw them absent — which they always are at verify time — and
raised a Major "completeness" blocker. It also treated the review's own
prior-round artifacts as "stale/false" when a later round superseded them.

### The fix
- **`ai_router/prompt-templates/verification.md`** gains a **"Review scope"**
  section: the review is mid-flight (pre-close), so (a) not-yet-created close-out
  state is never a defect and (b) the set's own `sN-verification*.md` /
  `sN-issues*.json` are immutable append-only records, not deliverables under
  review. The Completeness criterion gains a one-line pointer. The carve-out is
  **narrow** — a genuinely missing spec-promised code/test/doc deliverable stays
  in scope — so adversarial rigor / materiality / anti-laundering are untouched.
- **`build_prompt`** (verify_session.py) gains a matching pre-close context note,
  so the scope is present in the assembled prompt independent of the file.
- **`verification_stamp.py`**: the template hash pin was version-bumped
  `session-verification-v1` → `v2` (Set 084 F3 discipline — a template change is
  an explicit version bump, never an accidental pass); v1 retained for
  historical rows.
- Section-anchored **regression tests** pin the new guidance (framing tests +
  a runtime `load_verification_template()` assertion + a `build_prompt` test).

### Dogfood evidence (the proof)
This set's **own** `verify_session` run confirms the fix: round 1 did **not**
raise the circular "set-not-closed-at-verify-time" finding that appeared in both
088 and 089. Its only real finding — a genuine coverage gap versus this set's
spec (no runtime-loader assertion) — was fixed in flight.

## Verification & adjudication

Two rounds (`verify_session`, verifier `gpt-5-4`, Anthropic orchestrator
excluded). Round 1: circular finding **gone**; one genuine coverage-gap finding
(fixed). Round 2 raised a single **verifiably-false** finding — it claimed
`spec.md` was "corrupted" with template sections, but the file is 146 lines,
ends cleanly at "End-of-set deliverables", and contains none of those sections;
the verifier **misattributed** `verification.md`'s (legitimately edited) template
content to `spec.md` in the diff. Per the bounded-round discipline the loop
**stopped at round 2**; the operator adjudicated the false positive
(`s1-adjudication.md`) and authorized an operator-attested close. Verdict
**WAIVED**.

> Suite: full run green (2920 passed; the sole transient failure is the
> `one-active-set` drift check tripping because Set 087 is also in flight — it
> resolves on this close).

## Step 9 — guidance reorganization review

**No preload changes recommended.** One follow-up worth logging (not into the
slimmed preload): this is the **3rd** consecutive set (088/089/090) whose close
was blocked by a spurious verifier finding. 090 fixed the specific recurring
category error (dogfood-proven), but gpt-5-4 still produced a *different* false
positive (diff misattribution) on this meta-work set. Whether to trial the newly
added `gpt-5-5` / `gemini-3-1-pro` as verifiers (with calibration) or otherwise
harden verifier reliability on small verification-machinery sets is a candidate
follow-up for the operator to weigh.
