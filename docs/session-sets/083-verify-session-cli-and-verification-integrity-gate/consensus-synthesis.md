# Consensus synthesis — verification identity & integrity (pre-Set-084)

**Inputs** (both consulted through Copilot, 2026-07-06):

- `consensus-response.md` — untitled; presumed **Gemini Pro** ("response A")
- `verification-identity-consensus-response-copilot.md` — titled "GitHub
  Copilot"; presumed **GPT-5.5 via Copilot** ("response B")
- Prompt: `verification-identity-consensus-prompt.md` (three incidents,
  proposed fixes F1–F3, six questions)

## Verdict matrix

| Question | A (Gemini) | B (GPT-5.5) | Agreement |
|---|---|---|---|
| F1 identity = registry-resolved model | AGREE-WITH-CHANGES | AGREE-WITH-CHANGES | Yes — same caveat |
| F2 dynamic verifier exclusion | AGREE | AGREE | Yes — unanimous |
| F3 only-CLI rows corroborate | AGREE-WITH-CHANGES | AGREE-WITH-CHANGES | Yes — same reframing |
| Q3 asserted provenance acceptable? | Yes, given threat model | Yes, but as a **labeled degraded class** | Mostly |
| Q5 template-hash enforcement | Over-engineering once F3 exists | **"The missing half of F3"** | **Disagree** |
| Q6 structural fix | Move verification **inside `close_session`** | Framework-owned verifier runner (CI/second agent); keep CLI as immediate sole source | Converge on principle, differ on landing |
| Build-first | Structural shift first (renders F3 obsolete) | F1+F2+F3 now; structural runner later | **Disagree on sequencing** |

## Where they unanimously agree (adopt without further debate)

1. **F2 is right and urgent.** The static `session-verification: gpt-5-4`
   pin is indefensible; selection must exclude the session orchestrator's
   effective provider dynamically. When no different-provider verifier is
   reachable: hard `verification_unavailable`, close blocked, resolution
   only through the Mode-B manual path. B adds two refinements worth
   keeping: (a) bare `route(task_type="session-verification")` with
   session context must obey the same exclusion (no divergent semantics
   between CLI and bare calls); (b) the Mode-B attestation must be
   operator-grade — naming the verifying surface, model, effective
   provider, template used, timestamp, and raw artifact.
2. **F1 is right with the same caveat from both**: self-reported model
   name moves the lie one field over, and that is still strictly better —
   the lie becomes specific, auditable, and registry-constrained. Both:
   fail closed when unresolvable; validate against the registry at
   session start, not just at close. B adds the keeper: an explicit
   `identity_provenance` tier (`direct-api` / `copilot-cli-asserted` /
   `operator-attested` / `unknown`) recorded in the evidence trail — the
   gate uses effective provider for the ≠ check but never pretends a
   Copilot-asserted identity is as strong as a direct-API one.
3. **F3 reframed identically by both**: it is drift/affordance control,
   not cryptography — defend against lazy shortcuts and accidental
   dilution, and never document it as tamper-proof. Fields that make a
   row hard to produce accidentally (B's list): `source:
   verify_session_cli`, evidence-bundle hash, template id+hash, selected
   verifier model + resolved provider, orchestrator effective provider
   excluded, artifact path + content hash, set/session, package version.
   Missing/inconsistent field → fail closed. (A's session-nonce variant
   is a lighter version of the same idea; B's field-consistency approach
   is less brittle than nonce plumbing.)
4. **Both name the same root cause for the whole incident class**: the
   policed actor holds the pen. Verification initiation, prompt
   construction, and evidence writing must move out of the orchestrator's
   discretion.
5. **Both reject behavioral fingerprinting** (probabilistic, gameable,
   false confidence) and **both reject demoting all Copilot verification
   to manual** (kills the Full tier for Copilot-locked teams whose
   catalog does offer a second provider).

## The two disagreements, and the resolution I recommend

**Template hash (Q5).** A: unnecessary once the CLI is the only path.
B: without binding the corroborating row to the canonical template
(versioned ID + normalized content hash), future refactors or alternate
callers slowly reintroduce soft reviews — it is the missing half of F3.
**Recommendation: side with B.** The cost is one field and one hash
comparison; the failure it prevents (silent framing decay, the exact
diluted-prompt vector from incident 3) is one we have already observed
in the wild, today. B's brittleness guard (normalized hash + explicit
version bump when the operator changes the template) addresses A's
over-engineering concern.

**Sequencing (Q6 / build-first).** A: move verification inside
`close_session` first — the orchestrator just calls close; the framework
runs the verification; F3 and prompt-dilution concerns evaporate.
B: ship F1+F2+F3 at the current boundaries now; framework/CI-owned
runner later.
**Recommendation: A's destination, B's map — they compose.** Moving the
verification *call* inside `close_session` is not actually in tension
with F1–F3: close_session would invoke the same selection (F2) over the
same identity (F1) and write the same stamped evidence rows (F3). The
synthesis: **close_session becomes the guaranteed verification
backstop** — on a Full-tier close with no valid corroborating evidence,
it does not merely refuse; it *runs* the verification itself (same
in-process machinery as `verify_session`), then closes on VERIFIED or
refuses with the findings on ISSUES_FOUND. `verify_session` survives as
the mid-session tool for iterative remediation rounds; the close
boundary guarantees the last word is never the orchestrator's. B's CI /
second-agent runner remains the long-term strengthening, out of scope
for 084.

## Proposed Set 084 shape (for operator review — not yet authored)

1. **S1 — Identity and selection (F1 + F2).** Orchestrator block gains
   registry-validated `model` (required for multi-provider engines at
   `start_session`, fail closed) and `identity_provenance`; gate compares
   registry-resolved effective providers; verifier selection excludes the
   orchestrator's effective provider everywhere session context exists;
   `verification_unavailable` becomes an explicit blocked state resolved
   only by operator-grade Mode-B attestation.
2. **S2 — Evidence provenance and the close backstop (F3 + Q5 + A's Q6).**
   Corroborating rows must carry the stamped field set incl. template
   id+hash; bare `route()` rows no longer corroborate; `close_session`
   runs verification in-process when valid evidence is absent.
3. **S3 — Surfaces, UAT, releases.** Instruction surfaces re-taught
   (close runs verification if you didn't), cold-start UAT with the
   version-skew step, releases.

**Dependency**: 083's pending items (commit, re-walked UAT, router
0.29.0 + extension release) should land first — 084 builds on the 083
gate and the scaffolds must stop pulling 0.28.0 before any further
cold-start UAT is meaningful.
