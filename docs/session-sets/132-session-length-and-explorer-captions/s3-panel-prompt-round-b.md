# Panel round B — adversarial cross-critique

You gave an independent answer in round A. A second advisor, from a different
provider, answered the same brief independently. Both answers are reproduced
below, unedited and unattributed by name — **A** and **B**. One of them is
yours; identifying which is not the exercise.

You converged on a great deal. Convergence between two models is weak
evidence — you were given the same framing and may share the same blind
spots — so **round B is not a chance to agree again**. It has three jobs:

1. **Attack the other answer where it is wrong or under-argued**, including
   anywhere it agrees with you for a bad reason.
2. **Resolve the four live disagreements** named in §2 below. Pick a side and
   argue it; "either is fine" is not an answer a design can be built on.
3. **Name what you both missed.** You were handed a framing by an
   orchestrator with an interest in the study being worth running. If the
   honest answer is that some part of this should not be run at all, say so
   now — that is the most valuable thing you can return.

---

## 1. The two round-A answers

### Advisor A

{{A}}

### Advisor B

{{B}}

---

## 2. The four live disagreements — resolve each

**D-i. The primary outcome.** A proposes a blinded **Extra Work Score**:
weighted atomic obligations *beyond* the fixed brief's minimum acceptance
criteria. B proposes **total planned execution burden in minutes**, scored by
raters from atoms, with optional/excess burden as the key secondary. These
are different estimands: A measures scope *inflation* directly, B measures
scope *level* and derives inflation. Which is primary, and why? Consider
which one a rater can score reliably, and which one survives the objection
that "required vs optional" is itself a judgment call the rater makes after
seeing the brief.

**D-ii. Sample size.** A says ~48 paired blocks (12 specs × 4 engines),
powering on paired differences with an assumed paired SD of ~4 scope points.
B says ~60 blocks (12 specs × 5 engines), or 15 × 4, powering on a paired-
difference SD of ~50 minutes for a +20-minute material effect. Those two
power calculations are in different units and cannot both be the binding
constraint. Which drives the n, what is the assumed SD, and where does that
SD estimate come from? **If the honest answer is that nobody knows the SD
until a pilot runs, say that and specify the pilot** (how many cells, and the
decision rule that follows).

**D-iii. The uncapped arm.** Both would drop it under cost pressure, but for
different reasons — A calls it a confounded treatment (budget removal mixed
with model decomposition preference), B calls it merely the least
policy-relevant. If it is confounded, it should not be run at all; if it is
just less relevant, it is a cheap third point on a dose-response curve, and
dose-response is exactly what would make a Parkinson finding credible. Which
is it?

**D-iv. What the study can conclude.** B raises that plan-only testing covers
only the *authoring* pathway and misses execution-stage expansion (extra
exploration, remediation, optional polishing after the plan is accepted). A
does not address this. If B is right, a null result licenses a much narrower
claim than the operator will want. State precisely what a null result
licenses, in words the operator can act on, and say whether the study is
still worth its cost given that narrower claim.

---

## 3. New evidence: the observational fallback was actually run

You both said it was worth running **first**. It was — after round A, before
this round, on 97 sessions that carry both a parseable plan and logged step
marks. Method: walk each session's logged marks in time order; the interval
ending at a `complete` mark is charged to that mark's step; the step's role
(`work` or `ceremony`) comes from the corrected classifier. Per-role totals
are robust to batch logging (when an orchestrator logs steps 3–8 in one
second, all that time lands on the first of them, but every member of the
batch shares a role).

Results, medians:

- **Median ceremony time per session ("F, measured directly") = 41.1 min.**
  The independent regression intercept from the 199–225-session fit was
  `F = 39` (Theil–Sen) / 20–41 (OLS). Two unrelated methods, ~40 minutes.
- **Median `w̄` (work minutes ÷ N) = 6.4 min**, against the fit's 8.4.
- **`corr(N, w̄) = −0.029`** (elapsed), **−0.173** (idle-trimmed at 45 min),
  **−0.132** restricted to the 71 sessions where every work step carries its
  own distinct logged mark. **Directly measured `w̄` does not rise with N.**

And one result that looks wrong and that you are asked to attack:

- Median ceremony time is **~50–57 min** for sessions with N ≤ 3 but
  **7.1 min** at N = 4–5 and **1.9 min** at N ≥ 6, i.e. the ceremony share of
  a session falls from ~80% to ~3% as N rises. The orchestrator's working
  hypothesis is **composition, not behaviour**: the four-step ceremony
  skeleton was only mandated at Set 128, so low-N sessions are mostly recent
  skeleton-era specs with four ceremony steps to charge time to, while high-N
  sessions are mostly older pre-skeleton specs where the classifier finds one
  compressed tail step or none — so their ceremony time is not *absent*, it
  is *charged to work steps*.

**If that is right, it contaminates `w̄` in the direction that matters**:
high-N sessions would have unmeasured ceremony time inside their work
totals, inflating `w̄` at high N — which means the observed flat-to-falling
`corr(N, w̄)` is, if anything, an *over*-estimate of any Parkinson effect,
and the true `w̄` curve falls faster. Check that reasoning. If it is wrong,
say how. If it is right, say what the probe must do to be trustworthy —
specifically, whether restricting to skeleton-era (post-Set-128) sessions
leaves enough data, and what else would have to be reported.

Also react to this: **if `F ≈ 40` minutes and `w̄ ≈ 6–8` minutes, then fixed
overhead is 5–7× the cost of a work step, and the entire N debate is
second-order.** Is that the correct reading of these numbers? What follows
for policy if it is?

---

## 4. The tail, with the discriminators you both named

You both proposed nearly the same cheap discriminators for the residual
same-day tail: largest-gap share, verification-round count, remediation
loops, `requiresE2E`, test-heavy sessions, diff size, routed-call counts.
Those are being computed. Given the numbers in §3 — ceremony ≈ 40 min
median, work steps ≈ 6–8 min each — **state in advance which discriminator
you expect to dominate the residual tail, and what result would surprise
you.** A prediction made before the data is worth more than an
interpretation made after it.

## 5. Output format

Markdown, no preamble, these headings exactly:

- **Where the other answer is wrong** — numbered, most important first. Be
  specific; quote the claim you are attacking. If you find nothing material,
  say so in one line and move on rather than manufacturing a disagreement.
- **D-i / D-ii / D-iii / D-iv** — one heading each, a decision and its
  argument. Commit.
- **The observational result** — is the composition hypothesis right, does
  the `F ≈ 40` vs `w̄ ≈ 6–8` reading hold, and what does the probe still owe.
- **Tail prediction** — the discriminator you expect to dominate, and the
  result that would surprise you.
- **What we both missed** — including anything that should not be run.
- **Minimum viable version** — if the operator will fund only one thing from
  all of this, what is it, and what does it cost.
