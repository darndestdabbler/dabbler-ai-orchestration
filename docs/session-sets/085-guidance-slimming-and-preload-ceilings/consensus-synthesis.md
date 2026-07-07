# Cross-provider consult — synthesis (2026-07-07)

**Question.** Operator-initiated process retrospective: how much
reasoning capacity does the ~65k-token always-loaded guidance corpus
cost, what earns preload residency, and is "allow easily-detected,
easily-corrected mistakes" a sound principle for AI-led workflows?

**Method.** The same neutral prompt (measured facts, no nudging, an
explicit invitation to disagree with the premise) was sent to
`gemini-pro` and `gpt-5-4` via `ai_router.query()`,
`task_type="analysis"`. Raw responses: `consensus-gemini-pro.md`,
`consensus-gpt-5-4.md`. The formal `decision_consensus` config gate
(`enabled: false`) does not apply — this was a direct operator request,
not an orchestrator-initiated in-session consult.

**Convergence (both engines, independently):**

1. **The cost is real and first-order.** Mechanisms named by both:
   attention dilution / lost-in-the-middle salience, and — the sharper
   point — *behavioral shaping*: a high-volume process preload teaches
   the model that procedural defensibility is the success criterion,
   crowding out decisive task work. Both identified this as the likely
   cause of the observed wheel-spinning and cited the 10-round Set 083
   close as the signature symptom.
2. **Prose that duplicates an executable gate should be demoted.** The
   framework pays twice: the gate costs zero attention until it fires;
   the prose costs attention every session. Both named the same top
   cuts — schema doc (redundant with the validator), close-out
   reference (redundant with the CLI), workflow manual (compress to a
   2–4k operational constitution).
3. **"Allow cheap mistakes" is the correct default**, with the same
   four limits from both: irreversible/externally-visible actions,
   security/data integrity, silently-corrupting errors (wrong but
   validates), expensive-to-unwind cascades. GPT-5.4's refinement,
   adopted: the principle is "use the cheapest reliable control at the
   latest safe point," not "let the model make mistakes."
4. **Preload admission test** (GPT-5.4's formulation, adopted): recent
   recurrence AND high miss cost AND weak automated detectability AND
   no gate equivalent AND expressible in ≤150 tokens.
5. **Target size:** Gemini <10k (aim ~5k); GPT-5.4 8–12k with a 15k
   hard ceiling. Adopted: ≤12k total, ratcheting down.
6. **Validate empirically** — A/B across the 3–5 session/day cadence:
   verification rounds, time-to-first-substantive-action, gate
   failures.

**Material disagreement:** none. Differences were of degree (target
size 5k vs 10k) and emphasis only, so no operator adjudication was
required; the operator authorized the set directly.

**Additional adopted point (GPT-5.4 only):** the *verifier* must not
inherit the full manual either — scope verifier evidence to diff, test
output, gate outcomes, spec. Adopted as Set 085 S3 Step 1, with the
explicit constraint that the adversarial framing (L-069-2) and the
no-skip mandate (Set 083) are untouched.
