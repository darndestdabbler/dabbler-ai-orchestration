# Consensus verdict — gpt-5-4 (manual paste-and-relay)

> **Provider:** OpenAI gpt-5-4 (via operator's manual ChatGPT
> session, after two ai_router timeouts on the same prompt).
> **Date:** 2026-05-22.
> **Prompt used:** [`consensus-design-prompt-manual.txt`](consensus-design-prompt-manual.txt)
> — the same FOCUS_PROMPT + SYSTEM_SUMMARY + DRAFT bundle that
> the ai_router call would have used, with the bias-cautions
> preamble applied verbatim.
> **Cost:** zero routed dollars (operator's ChatGPT
> subscription).

## Verdict

APPROVED with REVISIONS.

## Must-fix items (5)

1. **De-overload the effort field before lock.** The draft
   allows `effort = low|medium|high|fast|standard` in both the
   start and turn markers, then collapses those into one
   downstream field with precedence rules. That is the biggest
   design bug. Low/medium/high and fast/standard are different
   axes, so this creates ambiguity and quietly makes the "one
   parser" claim backend-specific in practice. Either keep v1
   `effort` strictly to low/medium/high, or split it into two
   fields with separate source rules. See
   `narration-design.md:173`, `narration-design.md:213`,
   `narration-design.md:366`, and `narration-design.md:371`.

2. **Cut `outcome` from v1 or explicitly justify it as part of
   the locked contract.** The `session-end` marker adds an
   assistant-judged `outcome` field, but the baseline scopes
   narration to exactly two signals: C3 and A3. As written,
   `outcome` is a third narrated signal with no clear
   precedence against canonical session state or disposition
   files. For a lock-first contract, GPT recommends removing
   it. See `narration-design.md:196` and
   `baseline-comparison.md:255-267`.

3. **Make marker-emission reliability a lock gate, not a
   post-lock empirical question.** The draft says the Copilot
   delivery-channel TBDs are not blocking lock, and it leaves
   "does the LLM reliably emit the marker verbatim?" as an
   open question after lock. That is backwards. If the chosen
   channel cannot produce a verbatim, own-line marker with
   real values, the contract is not lock-safe. Run a cheap
   smoke probe before lock, and add parser validation that
   rejects placeholder leakage such as `SET-SLUG` or
   `EFFORT-LEVEL` from the template text. See
   `narration-design.md:397-415`, `narration-design.md:494`,
   and `narration-design.md:514`.

4. **Separate "where instructions live" from "how concrete
   values get injected."** The contract may be independent of
   whether the channel is a config file, workspace file, or
   env surface, but it is not independent of whether that
   surface can actually supply set slug, session number, total
   sessions, and branch state per run. Without an
   instantiation rule, the parser can accept syntactically
   valid but semantically bogus markers. Lock either a
   parameterization mechanism or a fallback rule. See
   `narration-design.md:397-415`.

5. **Fix the comparability claim.** The checklist says only
   the narration instruction changes, but the treatment also
   changes prompt length and token budget, and it can change
   compliance behavior or turn segmentation. Those are not
   reasons to reject the experiment, but they do need to be
   acknowledged as expected confounds. Also hold constant the
   explicit effort setting and tool-permission mode, not just
   version, workspace, and task battery. See
   `narration-design.md:459-479`.

## Closing assessment

The rest is close. The marker shape is acceptable; the biggest
missed risk is not bracket syntax, it is semantically
wrong-yet-parseable emission. Start plus end markers are
sufficient for C3, and you do not need an extra cross-session
link beyond explicit set/session numbering. Per-turn A3 is also
the right minimum if A3 is truly a per-assistant-turn signal;
per-tool-call narration would miss pure-text turns.

The more useful lock question is not "is this marker syntax
reasonable?" but "can v1 be reduced to a strict C3 boundary
marker plus an optional narrated high/medium/low A3 marker
that survives the real instruction channel?" GPT's answer:
yes, but only after the five revisions above. Don't skip
narration entirely (C3 is still a real native gap); don't
defer the contract to the harvester implementation. Lock a
narrower v1 than the one currently drafted.

## Nice-to-haves (2)

- Add parser-side domain checks for impossible or suspicious
  values, including session greater than total, unknown
  enums, and template placeholder leakage.
- Define missing session-end semantics explicitly so a crash
  or interrupted run becomes an open interval, not a
  malformed session.

## Disposition

All five must-fix items applied in
[`narration-design.md`](../narration-design.md) post-consensus
revision (see §13 consensus journal). Both nice-to-haves also
applied (§5.5 semantic validation; §3.3 open-interval rule).

Convergence with gemini-pro: items 1 (effort de-overload), 2
(outcome cut), and 5 (comparability confounds) overlap with
gemini-pro's must-fix items 2, 3, and 4 respectively. Items 3
(smoke probe as lock gate) and 4 (parameterization) are
gpt-5-4-unique. Both providers converged on "v1 should be
narrower than the pre-consensus draft."
