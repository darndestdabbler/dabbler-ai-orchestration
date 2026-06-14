# Bake-off Results — Routed vs. Path-Aware Verification

> **Set 065, Session 1.** Retrospective comparison of two code-review surfaces
> over `dabbler-access-harvester` Sets 008–012 (n=5), each of which ran *both* a
> single-validator routed `session-verification` and a path-aware in-IDE
> devil's-advocate critique (GPT-5.4 + Gemini-Pro). Data: `bake-off-data.json`.
> Method: five parallel extraction sub-agents over each set's verification
> artifacts, aggregated and de-confounded by the orchestrator.

## TL;DR

1. **Promoting path-aware critique is strongly supported.** Two clean
   existence proofs (C9, C3) plus **12 unique real defects** path-aware caught
   that routed did not — mostly Major, two wrong-data/structural Criticals.
2. **The win is *both* context-access and provider-diversity — entangled.**
   012 C3 cleanly isolates context-access (same model, snippet→miss,
   repo→catch); 010 shows a provider-diversity effect (context-access via GPT did
   *not* help — a second provider, Gemini, caught what GPT missed in both
   surfaces). At n=5 we cannot quantify the split — and the full *multiplicity*
   effect size (two reviewers vs. one) needs the forward pair-vs-single
   comparison — but neither effect is zero and neither alone explains the data.
3. **~92% of path-aware's unique catches are *probeable*** — a cheap
   pre-committed deterministic check (count, dup-key assert, parser/round-trip
   test) could have caught them *in retrospect*. Strong support for the
   pre-registered-falsifier / contract-test direction; only ~8% of observed
   catches appear non-probeable, though whether the other ~92% could be
   *pre-authored* deterministically (vs. discovered by the agent) is itself for
   the forward study to test.
4. **"Is routed still worth keeping" remains unanswered** by the retrospective.
   Every routed-only catch is order-confounded or out-of-scope — there is **no
   clean case** of routed catching a real defect path-aware missed on the same
   code. *Within this corpus, the only evidenced defense for routed is cadence*
   (catching defects earlier during construction) — a capability defense is
   unsupported, but cost/simplicity are simply unevaluated here. Settling it
   needs **both** forward experiments: A (capability) and B (cadence).
5. **Path-aware is not noise-free.** Gemini over-escalated twice (009), both
   disproven by GPT probes — the two-provider cross-check is part of its
   reliability, and a real false-positive/remediation-churn cost.

## Corpus

| Set | Type | Routed validator | Routed rounds | Path-aware scope | PA rounds | PA order |
|---|---|---|---|---|---|---|
| 008 | cross-artifact | gpt-5.4 | 2 | S2 interim | 1 | **first** |
| 009 | cross-artifact | gpt-5-4 | 2 | S1 | 1 | second |
| 010 | local-logic | gpt-5-4 | 3 | whole-set | 1 | second |
| 011 | cross-artifact | gpt-5.4 (S1/S2; S3 PA-only) | 2 | S3 + addendum | **2** | second |
| 012 | cross-artifact | gpt-5-4 | **4** | S3 set-wide | 1 | second |

All five confounds we named are present and vary across the corpus: context,
provider-count (routed 1 vs PA 2), cadence (per-session vs per-set), round-count
(only 011 ran a 2nd PA round), and order (008 reversed; the rest PA-second).

## The four buckets (real defects only)

| Bucket | Count | Character |
|---|---|---|
| **critique-only** | 12 | mostly Major; 2 wrong-data/structural Criticals (C9, C3); ~92% probeable |
| **routed-only** | 10 | all order-confounded or out-of-scope; cluster in build-time impl defects + test-rigor |
| **both** | ~4 | C1/C4/member-LHS (012), BOM-test (009) |
| **missed-by-both** | 0 real | (011's two were routed false-positives that PA correctly dismissed) |

## The two existence proofs

**C9 (011) — index undercount.** `unresolved-items.json` is fed only
procedure-body references, so header- and module-level unresolved refs are
silently dropped; the index is not the superset it claims to be. Routed S2 R1
returned VERIFIED. Both path-aware providers caught it (GPT via a scratch
probe proving 1 unresolved in `Body.References`, 0 in the aggregator).
**Probeable**: an index-vs-artifact count assertion catches it deterministically.

**C3 (012) — fabricated data.** A `Dictionary<string,ChainNodeKind>` keyed on
bare name lets a Report overwrite a same-named Form, so the Form's chain edges
ship with a fabricated `Report` endpoint — **wrong data**, not a coverage gap.
Routed gpt-5-4 VERIFIED it across **four** rounds, explicitly judging it "a
low-risk hardening point, not a present blocker." Both path-aware providers
caught it independently. `stage=original` — it was present the whole time, so
the order confound does **not** excuse routed here. **Probeable**: a dup-key /
name-uniqueness assertion at build time.

C3 is the stronger proof: it survived four routed rounds, it's a wrong-data
defect, and it carries the clean isolation below.

## De-confounding: both effects are real

The central worry was that path-aware's apparent edge could be "two providers
beat one" (provider-multiplicity) rather than path-awareness (context-access).
The corpus contains a clean single-case demonstration of **each**, pointing
opposite directions:

- **Context-access is real — 012 C3.** GPT-5.4 was *both* the routed validator
  *and* a path-aware provider. As a snippet-fed validator it missed C3 across
  four rounds; as a repo-aware agent it caught it. Same model, one variable
  (context mode). This is the cleanest evidence in the corpus, and it implies a
  second routed validator would **not** reliably substitute — the miss was about
  *access*, not a second opinion.
- **Provider-diversity is also real — 010.** Both of 010's critique-only Majors
  (MakeTable QueryType contradiction; numeric regex degrading `.5`/`1.`) were
  caught by **Gemini only**. GPT *in path-aware mode* — same provider as the
  routed validator, with full repo access — also missed them. Here context-access
  did nothing; switching provider within path-aware was the win. (This is a
  provider-specific blind spot — evidence that provider *identity* matters; the
  full *multiplicity* effect, two reviewers vs. one, is what the forward
  pair-vs-single comparison measures, not this single case.)

Within path-aware itself, provider-diversity is load-bearing: of the 12
critique-only catches, **5** were found by both providers, **4** by GPT only,
**3** by Gemini only. Neither provider alone catches everything — a single-provider
path-aware critique would have missed 010's two Majors (GPT-only run) or 011's
C1/R2-1/R2-2 (Gemini-only run).

**Implication for the strategic fork.** "Just add a second routed validator"
(the cheap alternative to building path-aware tooling) would capture the
010-class catches (provider diversity) but would likely **miss the C3-class**
(which needed repo access, per the same-provider isolation). And "one path-aware
agent" would miss whatever that one provider's blind spot is. The configuration
the data supports is **path-aware AND multi-provider** — which is exactly what
the harvester practice does.

## The probeable partition (the biggest lever)

Of the 12 critique-only catches, **11 (~92%) are probeable** — a cheap,
pre-committed deterministic check would have caught them:

- C9 → index-vs-artifact count assertion
- C3 → name-uniqueness / dup-key assertion
- 010 MakeTable → a parser test asserting `QueryType` on `SELECT..INTO`
- 010 numeric regex → a parameterized test with `.5`, `1.`
- 008 H3/H4 → a parse test / field cross-ref
- 011 C1, R2-1, R2-2 → JSON key-set / count probes
- 009 DA-1/DA-2 → a UTF-16-BOM round-trip probe / a byte-grep

Only **011 C7b** (a latent-but-not-currently-triggerable state) is genuinely
novel-reasoning. This is the strongest result in the set for the
**pre-registered-falsifier / contract-test** direction: most of path-aware's
value is *mechanizable in retrospect* into deterministic checks. The expensive
agent appears needed mainly for the small novel-reasoning residual — and,
crucially, for *discovering which falsifiers to write* (the agent found these
invariants; a human author had not). The open caveat: probeability is
established *post hoc*; whether these falsifiers could be *pre-authored* cheaply,
or still need agent/human discovery, is for the forward study (the falsifier arm).

## Does routed verification still earn its keep?

Honestly: **the retrospective cannot answer this**, exactly as predicted.

- There is **no clean case** in the corpus of routed catching a real defect that
  path-aware, looking at the same code, missed. All 10 routed-only catches are
  either order-confounded (path-aware ran on post-remediation code — 009/010) or
  out-of-scope (path-aware reviewed a different session's code — 012's S1/S2
  Majors).
- What routed *did* do: catch implementation defects **during construction** (the
  R1→Rn remediation loop in 010 and 012) and **test-rigor** issues (009's three
  Minors — masking, mutation-survivability, non-discriminating tests). The
  test-rigor class is the one place routed surfaced something path-aware did not
  raise — though path-aware ran post-fix, so even that isn't clean.

So within this corpus the only defense *evidenced* for routed is **cadence** —
it runs per-session, automatically, and catches defects *while the work is being
built*, before later sessions compound on them. (A unique-capability defense is
unsupported here; cost / operational simplicity are simply not evaluated.)
Whether that early-catch is worth its metered cost — versus a single end-of-set
path-aware pass — is what **Experiment B (the cadence study)** measures. Note it
is *not* what the blind same-frozen-tree A/B (**Experiment A**) measures:
Experiment A holds cadence constant and tests *capability*. Settling routed's
status needs both. See `forward-ab-design.md`.

## Limitations

- **n=5, five confounds** → this is existence-proof + hypothesis-generation, not
  a causal estimate. The clean isolations (C3, 010) are single cases, not
  averages.
- **Order poisons the routed-only bucket** — the "is routed redundant" question
  is structurally unanswerable here.
- **Extraction was delegated** to sub-agents (sonnet); the two headline cases
  (C9, C3) and the same-provider isolation were verified against the harvester
  artifacts directly. Severity/real-vs-disproven calls follow each set's
  `disposition.json` + `change-log.md`.
- The harvester's own codified Convention ("a clean routed VERIFIED does not
  waive the devil's-advocate pass; non-overlapping blind spots") is **consistent
  with** this data: routed and path-aware catch overlapping-but-distinct classes,
  and the distinct path-aware class is high-severity and probeable.

## Bottom line for the proposal (S3)

- **Promote path-aware critique** — strongly evidenced; keep it **multi-provider**.
- **Lead the design with pre-registered falsifiers / a contract-test gate** —
  ~92% of the catches are probeable, so most of the value is deterministic and
  cheap, with the agent reserved for the novel-reasoning residual and for
  *authoring* the falsifiers.
- **Treat "demote/retire routed" as unresolved** — run forward Experiments A
  (capability) *and* B (cadence) before changing routed's status; its cadence
  defense is plausible but unmeasured, and Experiment A alone cannot test it.
