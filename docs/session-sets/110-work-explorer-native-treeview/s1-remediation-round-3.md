# S1 remediation — round 3 (the disputed Major, and the adjudication that went against me)

Against the single Major from round 5
([`s1-issues-round-5.json`](s1-issues-round-5.json)), which **rejected** the
round-2 activation fix.

---

## The finding

> *"The L5 remediation still substitutes a stub benchmark and payload size for
> the required real activation and first-paint measurements. `activate` and its
> dependency graph are imported before timing, so module loading is excluded.
> The harness calls `activate()` five times in one Node process against a
> vscode stub, rather than performing five cold activations. Payload bytes do
> not measure rendering latency."*

## What I conceded immediately

- Module loading **was** excluded by construction, and the document had
  compounded the error by *guessing* module loading might explain ~215 ms of
  unattributed activation time. Both wrong.
- The figures were warm and shared a process. Not cold activation.
- Payload bytes are not a latency, which the document already said.

## What I disputed, and the third-provider adjudication

I disputed the finding's implied requirement that S1 characterise the
migration's startup effect, on the grounds that the native tree **does not
exist until S2**, so no before/after is possible in S1.

The operator had pre-authorised one third-provider verification round. Spent
here, on a genuine disagreement rather than another identical pass. The
orchestrator is Anthropic and rounds 1–5 were verified by OpenAI, so the
adjudicator was routed to **Google** — sharing a provider with neither side.

**Adjudicator: `gemini-2.5-pro`. Verdict: `MUST_REMEDIATE_FURTHER`. It upheld
the verifier and ruled against me** ([`s1-third-provider-adjudication.json`](s1-third-provider-adjudication.json)):

> *"The orchestrator is wrong to defend the use of a warm, in-process stub for
> the activation measurement. While correct that the 'AFTER' state is
> un-measurable, they failed to fully measure the 'BEFORE' state as specified…
> They focused on the impossible part of the verifier's demand (measuring the
> future) while ignoring the verifier's still-valid point about the flawed
> current-state measurement."*

That is a fair description of what I did. Answering the impossible half of an
objection and citing that impossibility while leaving the possible half
undone reads as responsive and is not. **Accepted in full; the dispute is
withdrawn.**

The adjudicator named the remedy concretely: measure real cold activation,
capturing "Node.js module loading time and other synchronous bootstrap costs
excluded from the current in-process stub measurement."

---

## The fix

New harness
[`scripts/cold-activation.js`](../../../tools/dabbler-ai-orchestration/scripts/cold-activation.js).
Each rep is a **fresh Node process** that times `require()` of the real
`dist/extension.js` production bundle — module loading **inside** the
measurement — and then `activate()`. Nothing warm, nothing shared.

Raw: [`s1-activation-baseline.json`](s1-activation-baseline.json). Medians of 5
cold processes:

| | |
| --- | ---: |
| module load (`require` of the shipping bundle) | **54.3 ms** |
| `activate()` | **336.5 ms** |
| **cold bootstrap total** | **389.9 ms** |

**Two things the correction taught, one of which vindicates the old number and
one of which does not:**

1. `activate()` measured **336.5 ms cold** against **338.8 ms warm** — within
   noise. The warm harness was not wrong *about `activate()` itself*.
2. Module loading was a real **54.3 ms** that the warm harness excluded by
   construction, so the honest cold bootstrap is **~390 ms, not ~339 ms**. The
   document's guess that module loading might account for the ~212 ms of
   undecomposed activation time is now measured and **refuted** — module load
   sits outside `activate()` entirely.

Document changes:

- §2's bucket table gains module load and the cold total, and carries a note
  that the cold figures **supersede** the warm ones, naming both artifacts.
- The decomposition paragraph no longer speculates about module loading; it
  cites the measurement that rules it out.
- `s1-activation-measurements.json` is retained rather than deleted — it is
  still the honest source for `resolveWebviewView()` (0.1 ms) and the payload
  bytes — but its `activateMs` is explicitly marked superseded.

## What is still not measured, and why that is now a bounded claim

Renderer first paint. It needs a real renderer process. An attempt to capture
it through the Layer 3 Playwright harness was made and **abandoned rather than
faked**: the shipping tree paints rows only after a refresh in that harness, so
the number would have measured a refresh, not a first paint. A second attempt
to read VS Code's own *Show Running Extensions* activation figure failed on DOM
selectors. Neither attempt is presented as a result.

That leaves exactly one bucket open, for the native tree that does not exist
yet. S4 owns the comparison and now has a real cold baseline to compare
against instead of a warm stub figure.

---

## Files changed

| file | change |
| --- | --- |
| `tools/dabbler-ai-orchestration/scripts/cold-activation.js` | new — cold, per-process, module-load-inclusive activation harness |
| `s1-activation-baseline.json` | new — the cold measurements |
| `s1-third-provider-adjudication.json` | new — the adjudication that went against the orchestrator |
| `s1-migration-decision.md` | §2 bucket table + supersession note; decomposition paragraph corrected |

No product code changed.
