# Verification Identity And Close Backstop Spec

> **Purpose:** Close the identity/provenance holes behind the third live
> verification bypass (2026-07-06, cold-start Copilot-seat walk): the
> router's "cross-provider" verifier choice was a hand-tuned static pin
> that dispatched a Copilot-seat verification to the orchestrator's own
> underlying model; the close gate compared the verifier's provider
> against a free-text seat label the orchestrator itself supplied
> (`provider: openai` one session, `provider: anthropic` the next, same
> seat class); a bare `route(task_type="session-verification")` with a
> hand-diluted prompt corroborated the close as if it were the sanctioned
> Step 6; and a second session closed `VERIFIED` with zero verification
> calls. This set makes identity **the underlying model, resolved through
> the model registry, end to end** (F1), makes verifier selection
> **dynamically exclude the orchestrator's effective provider** with a
> fail-closed `verification_unavailable` outcome (F2), makes **only
> `verify_session`-stamped evidence rows corroborate** a close — evidence
> hash, template id + normalized hash, verifier/orchestrator identities
> (F3 + the template-integrity half) — and moves the last word out of the
> orchestrator's hands: **`close_session` runs the verification itself**
> when a Full-tier close arrives without valid evidence (the close
> backstop). Design was settled by cross-provider consensus (two
> independent models consulted 2026-07-06; both AGREE on F2, both
> AGREE-WITH-CHANGES on F1/F3 with the changes adopted here; synthesis and
> raw responses in the Set 083 directory:
> `consensus-synthesis.md`, `consensus-response.md`,
> `verification-identity-consensus-response-copilot.md`).
> **Created:** 2026-07-06 (operator-reported live incident #3)
> **Session Set:** `docs/session-sets/084-verification-identity-and-close-backstop/`
> **Prerequisite:** `083-verify-session-cli-and-verification-integrity-gate`
> (complete). Set 083 closed **without publishing** (operator decision,
> recorded in its spec Revision 2): its UAT and releases are superseded by
> this set — the combined router release ships from S3 here as **0.29.0**
> (the number never reached PyPI in between), and this set's UAT inherits
> 083's two text assertions. Until that release publishes, every scratch
> walk installs the router from this checkout (L-075-1).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: true
requiresE2E: false
uatScope: per-set
pathAwareCritique: required
prerequisites:
  - slug: 083-verify-session-cli-and-verification-integrity-gate
    condition: complete
```

> Rationale: Session 3 changes what a real Build writes to disk and what
> a real Copilot-seat session experiences at close, and the whole set
> exists because two prior UAT walks failed live — so a human walk that
> **reproduces incident 3 against the new machinery** is required
> (`requiresUAT: true`, per-set, to the Set 078–083 bar: literal
> copy-pasteable steps, literal-string expectations, cold start per
> L-079-3, and an explicit installed-router-version check per L-075-1).
> No browser E2E surface → no E2E gate. `pathAwareCritique: required` —
> this set rewires the close-out contract, the metrics writer, and the
> router's selection path (cross-artifact + wiring + shared schema, the
> blast-radius recommendation). All gates declared here in the block, not
> prose (L-079-2).

---

## Project Overview

**Scope.** Four deliverables, one product surface (`ai_router` release +
an extension release, because the template bundle ships in the VSIX):

- **F1 — Identity is the underlying model.** The session-state
  `orchestrator` block's `model` field becomes **required at
  `start_session` for multi-provider engines** (`github-copilot`,
  `copilot`); a new additive, omit-null `identityProvenance` field
  records how identity was established (`direct` for single-vendor
  engines, `asserted` for Copilot seats — derived from the engine, never
  a free choice). The **effective provider** is always *derived* at use
  time by registry lookup on `model` (never stored — stored-vs-derived
  drift is the disease this set treats); the free-text `provider` label
  remains only as the seat descriptor. One shared resolution helper
  serves every consumer — the close gate, verifier selection, and
  `start_session` validation — so the fix covers every sibling site in
  one pass (L-069-1). Unresolvable identity **fails closed** everywhere
  it is consumed.
- **F2 — Dynamic verifier exclusion.** `verify_session` (and `route()`
  itself when `task_type="session-verification"` arrives with session
  context) resolves the session orchestrator's effective provider and
  **excludes it from verifier selection** — replacing the static
  `session-verification: gpt-5-4` pin whose own comment said "swap this
  value if a different orchestrator runs sessions." Under the
  `copilot-cli` transport the exclusion is applied against the seat's
  catalog lockfile; a seat that cannot serve any different-provider
  verifier yields a hard **`verification_unavailable`** outcome — an
  explicit blocked state (no verdict written, close stays blocked)
  resolvable only by the operator-attested manual path
  (`--manual-verify` with an attestation naming the verifying surface,
  model, effective provider, template used, timestamp, and raw artifact).
  Never a silent same-provider verification; never an engine-facing skip
  (operator mandate, Set 083).
- **F3 — Only stamped evidence corroborates.** `verify_session` stamps
  its `session-verification` metrics rows with additive fields (null on
  all historical rows, the Set 078 pattern): `source:
  "verify_session_cli"`, `evidence_sha256` (the evidence bundle),
  `template_id` + `template_sha256` (normalized hash of the canonical
  adversarial template — the consensus "missing half of F3": a row not
  bound to the template lets diluted hand-rolled reviews creep back),
  `verifier_model` + derived provider, `orchestrator_effective_provider`
  (the exclusion applied), artifact path + content hash, and the package
  version. The Set 083 close gate's evidence layer now accepts **only**
  rows carrying a consistent stamp — a bare `route()` row no longer
  corroborates a close. Framing (consensus-confirmed, both models): this
  is **drift/affordance control, not cryptography** — it must never be
  documented as tamper-proof.
- **The close backstop (the structural move).** On a Full-tier close
  where no valid stamped evidence exists for the session, `close_session`
  does not merely refuse — it **runs the verification itself**,
  in-process, through the same F1/F2/F3 machinery (same evidence
  assembly, same canonical template, same exclusion, same stamped row and
  artifacts), then proceeds on `VERIFIED` or refuses with the findings on
  `ISSUES_FOUND`. The policed actor no longer holds the pen on the last
  word. `verify_session` remains the sanctioned mid-session tool for
  iterative remediation rounds; the backstop guarantees the floor. The
  backstop respects `budget.yaml` (zero-budget tier → the existing
  manual/attested flow, unchanged) and the existing two-attempt verifier
  fallback; provider unavailability at close yields
  `verification_unavailable` (blocked), never a pass.

**Operator decisions encoded (do not re-litigate in-session):**
verification is mandatory on Full tier with no engine-facing skip
(Set 083); asserted provenance is **labeled, not hidden** — a
Copilot-seat row must never look identical to a direct-API row; the
adversarial verifier framing is a hard constraint (L-069-2).

**Documented residuals (decisions, not oversights):** (1) `model` is
self-reported — F1 moves the lie one field over, but makes it specific,
auditable, and registry-constrained; the compensating control is the
`identityProvenance` label plus capture of the copilot-catalog lockfile
reference in the evidence trail where the transport provides it. (2) A
determined orchestrator forging the full stamped artifact set remains out
of scope (metrics-vs-billing audit territory) — the stamp raises the
floor from "lazy shortcut" to "deliberate multi-artifact forgery."
(3) A framework/CI-owned verifier runner (the consensus long-term
recommendation) is deferred to a future set; the close backstop is this
set's structural step. (4) Behavioral fingerprinting was considered and
rejected by both consulted models (probabilistic, gameable, false
confidence).

**Non-goals.** No change to: the verdict grammar or blocking predicate
(L-071-1), the adversarial template's framing (L-069-2), the Lightweight
tiers' Mode A/B machinery, the zero-budget exception's semantics, or the
Set 078 transport dispatch mechanics beyond verifier-role exclusion. No
git hooks (consensus: bypassable, undistributable). Consumer-repo floor
bumps (`dabbler-ai-router>=0.30.0` + L-075-1 venv-upgrade-and-confirm)
happen in the consumer repos' own sessions.

---

## Sessions

### Session 1 of 3: Identity and dynamic verifier exclusion (F1 + F2)

**Steps:**
1. **Shared identity resolution.** New helper (single home, e.g.
   `ai_router/orchestrator_identity.py`): given a session-state
   orchestrator block, return the **effective provider** by registry
   lookup on `model`; classify `identityProvenance` (`direct` /
   `asserted`) from the engine; fail closed (typed error / `None`) on a
   missing or registry-unknown model for a multi-provider engine
   (`github-copilot`, `copilot` — one module constant). Single-vendor
   engines without `model` keep their current provider-field fallback
   (existing behavior, now explicitly second choice after model
   resolution).
2. **Boundary enforcement.** `start_session` refuses a multi-provider
   engine without `--model` (exit non-zero, remediation names the exact
   flag); validates any supplied model against the registry; writes
   `identityProvenance` (additive, omit-null) into the orchestrator
   block. Schema parity in both directions (L-066-1):
   `docs/session-state-schema.md` + the JSON schema + the pure-Python
   validator.
3. **Gate consumes the helper.** `check_verification_integrity` resolves
   the orchestrator side of the ≠ check through the shared helper —
   registry-resolved effective provider, not the free-text label; missing
   or unresolvable identity fails closed with a remediation naming
   `start_session --model`.
4. **Dynamic exclusion.** `verify_session` resolves the session's
   orchestrator effective provider and passes it as `exclude_providers`
   into routing; `route()` with `task_type="session-verification"` and
   session context applies the same exclusion itself (no divergent
   semantics between the CLI and bare calls). The static
   `session-verification:` model pin in `router-config.yaml` is demoted
   to a preference that can never override the exclusion. Under
   `copilot-cli`, exclusion is applied against the catalog lockfile's
   confirmed entries; no different-provider candidate →
   **`verification_unavailable`**: no verdict written, explicit
   operator-facing message naming the Mode-B attested path.
5. **Layer-1 pytest matrix**, including the incident-3 regression
   fixture (orchestrator `engine: copilot, model: claude-sonnet-4.6`;
   a `claude-sonnet-4.6` verification row → gate refuses as
   same-provider; selection refuses to pick any anthropic verifier),
   the arbitrary-label fixture (seat label says `openai`, model says
   anthropic → model wins), the missing-model multi-provider fixture
   (start_session refuses; gate fails closed), the single-vendor
   back-compat fixture (existing sets keep closing), and the
   no-diverse-catalog fixture (`verification_unavailable`).
6. **Dogfood:** this session's own Step 6 runs through the new
   exclusion path (the orchestrator's provider is excluded by
   resolution, not by config luck).

**Creates:** `ai_router/orchestrator_identity.py`, its pytest suite.
**Touches:** `ai_router/start_session.py`, `ai_router/gate_checks.py`,
`ai_router/verify_session.py`, the router selection path,
`ai_router/router-config.yaml`, `ai_router/schemas/*session-state*`,
`docs/session-state-schema.md`.
**Ends with:** the incident-3 identity shape is refused in tests; this
session's own verification was selected by exclusion; suite green.
**Progress keys:** `s1.identity`, `s1.exclusion`, `s1.tests`

---

### Session 2 of 3: Stamped evidence and the close backstop (F3 + structural)

**Steps:**
1. **Row stamping.** `record_call` gains the additive stamp fields
   (null on historical rows): `source`, `evidence_sha256`,
   `template_id`, `template_sha256`, `verifier_model`,
   `orchestrator_effective_provider`, artifact path + content hash,
   package version. `verify_session` computes and writes them
   (normalized template hash: whitespace-normalized content, versioned
   id; an operator template change is an explicit version bump, never an
   accidental pass).
2. **Gate tightening.** The evidence layer accepts only rows with
   `source: "verify_session_cli"` (or the backstop's equivalent stamp)
   and internally consistent stamp fields — any missing or inconsistent
   field fails closed. Bare `route()` rows stop corroborating. Refusals
   keep naming the venv-qualified sanctioned command.
3. **The close backstop.** `close_session`, on a Full-tier close whose
   session lacks valid stamped evidence: assemble evidence and run the
   verification **in-process** through the S1 selection (exclusion,
   `verification_unavailable` on no-diversity), write the same artifacts
   and stamped row, patch the disposition, then continue the close on
   `VERIFIED` / refuse with findings on `ISSUES_FOUND` / block explicitly
   on `verification_unavailable`. Respects `budget.yaml` (zero-budget →
   existing manual flow untouched); prints cost; two-attempt fallback
   preserved; idempotent under the close lock; `--manual-verify` remains
   the attested bypass and `--force` still bypasses neither evidence
   layer.
4. **Layer-1 pytest matrix**: all three live incidents as end-to-end
   regression fixtures — (i) incident-1: self-attested VERIFIED, no row
   → backstop runs (stubbed router) and its verdict governs; (ii)
   incident-2 shape: null-verdict close → 083 behavior preserved, now
   with backstop; (iii) incident-3: bare-route row + diluted template →
   row rejected (no stamp), backstop runs with exclusion; plus
   template-hash mismatch fails closed, stamp-field-missing fails
   closed, backstop-unavailable blocks, zero-budget passthrough, force /
   manual-verify interplay unchanged.
5. **Dogfood:** this session's own close runs the backstop live — the
   orchestrator deliberately does **not** run `verify_session` by hand;
   `close_session` must produce the verification itself and the stamped
   row must corroborate its own close.

**Creates:** the backstop + stamping logic, their pytest suites.
**Touches:** `ai_router/close_session.py`, `ai_router/gate_checks.py`,
`ai_router/verify_session.py`, the metrics writer
(`record_call`), `ai_router/docs/close-out.md` (contract section).
**Ends with:** all three incidents' exact artifacts are blocked in
tests; this session's own close was verified by the backstop, not by
the orchestrator's hand.
**Progress keys:** `s2.stamp`, `s2.backstop`, `s2.tests`

---

### Session 3 of 3: Instruction surfaces, incident-3 reproduction UAT, and the two releases

**Steps:**
1. **Template bundle + docs:** `start-here.md.template` Step 5/6 note
   the backstop ("if you reach close-out unverified, `close_session`
   runs the verification itself — you cannot skip it, only pre-empt it
   with `verify_session`"); Copilot-seat guidance names the `--model`
   requirement at `start_session`; engine tails updated; canonical docs
   (`docs/ai-led-session-workflow.md` Step 6/8,
   `ai_router/docs/close-out.md`, `docs/concepts/tier-model.md` Copilot
   sections) describe effective-provider identity, the stamp,
   `verification_unavailable`, and the Mode-B attestation contents.
   Regenerate cold-start fixtures + dist bundle; grep for stale echoes
   of the old identity/selection claims across docs (L-065-1).
2. **Per-set UAT checklist** to the Set 078–083 bar, with the
   environment trap closed **inside the checklist**: (a) REAL cold-start
   Full Build from an empty folder (L-079-3); (b) a literal
   `pip show dabbler-ai-router` step asserting the scaffold resolved
   **>= 0.29.0** before any session runs (L-075-1 — the 0.28.0 skew is
   what invalidated both prior walks; until 0.29.0 publishes from this
   set's own step 3, the checklist's install step names the exact
   `pip install -e <this-checkout>` command); (c) the two assertions
   inherited from the waived Set 083 walk (its spec Revision 2): the
   rendered `start-here.md` teaches mandatory `verify_session` →
   `close_session` with no skip branch and no automatic-verification
   claim, and `start_session` prints the mandatory-verification advisory;
   (d) a REAL Copilot-seat session in the scratch repo reproducing
   incident 3: start with `--engine github-copilot` **without** `--model`
   (expect the literal refusal), then with `--model claude-sonnet-4.6`,
   attempt a same-provider verification (expect exclusion / refusal
   naming the effective provider), then close unverified (expect the
   backstop to run and its verdict to govern); (e) operator walk;
   remediate.
3. **Required end-of-set path-aware critique**; then the two releases in
   order on operator authorization: `dabbler-ai-router` **0.29.0** — the
   combined Set 083 + 084 release (both sets' changelog sections ship
   under it; 0.29.0 never reached PyPI in between, per 083 Revision 2) —
   (pyproject, CHANGELOG, tag), then the extension's next minor
   (package.json, CHANGELOG, repository-reference, vsix). Rollback text
   names only registry-live versions (L-078-1). Note the consumer
   floor-bump follow-up (`>=0.29.0` + L-075-1) for the consumer repos'
   own sessions.

**Creates:**
`084-verification-identity-and-close-backstop-uat-checklist.json`,
`path-aware-critique.json`, both releases.
**Touches:** `docs/templates/consumer-bootstrap/*`,
`test-fixtures/cold-start/**`, `docs/ai-led-session-workflow.md`,
`ai_router/docs/close-out.md`, `docs/concepts/tier-model.md`,
`pyproject.toml`, `ai_router/CHANGELOG.md`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/CHANGELOG.md`,
`docs/repository-reference.md`.
**Ends with:** UAT attested with the incident-3 reproduction passing
against the new machinery, required critique artifact valid, router
0.30.0 and the extension minor published on operator authorization.
**Progress keys:** `s3.surfaces`, `s3.uat`, `s3.release`

---

## Anti-patterns avoided

- **Trusting the policed actor's labels** — identity is registry-resolved
  from the model, provenance is derived from the engine, and the last
  word (the backstop) is the framework's, not the orchestrator's.
- **Security theater** — the stamp is documented as drift control;
  residual (2) names exactly what it does not defend against.
- **Prose-armed gates** — `requiresUAT`, `pathAwareCritique`, and the
  prerequisite are declared in the config block (L-079-2).
- **Steady-state UAT** — the walk starts from an empty folder (L-079-3)
  and asserts the installed router version before trusting anything it
  observes (L-075-1; both prior walks were invalidated by this exact
  trap).
- **Weakened verifier framing** — the canonical template is untouched;
  the template hash *protects* it (L-069-2).
- **Registry-blind rollback text** — L-078-1, as in 083.
