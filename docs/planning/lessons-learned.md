# Lessons Learned

> **Purpose:** Capture durable tactics, failure patterns, and workflow lessons
> that should influence future sessions before the same mistake repeats.
>
> **Note for consumer repos:** The portable lessons below apply to all
> AI-led-workflow repos. Add repo-specific lessons in the section at the bottom.

- Add entries when a failure, surprise, or avoidable friction reveals a better
  repeatable strategy.
- When a lesson has proven itself in two or more different contexts, propose
  promoting it to `project-guidance.md` — as a Convention if it is a specific
  rule, or a Principle if it is durable strategy. Never delete a lesson; only
  move it.

---

## Portable Lessons (all AI-led-workflow repos)

## Truncation Detection: `stop_reason` Alone Is Not Sufficient

- **Context:** Any routed call whose response is consumed programmatically —
  code generation, test generation, structured data emission.
- **Failure or friction:** Gemini Pro has been observed to return
  `stop_reason: "end_turn"` on responses that visibly cut off mid-string.
  The orchestrator logs the call as successful; the structured consumer sees
  a malformed JSON / unbalanced brace and downstream parsing fails.
- **Lesson:** Use `detect_truncation(content, stop_reason)` from
  `ai-router/utils.py`. It returns True when `stop_reason == "max_tokens"`
  OR when the response shows syntactic incompleteness (odd triple-backtick
  count, more `{` than `}`).
- **Action for future sessions:** Call `detect_truncation()` before treating
  any structured output as canonical. On truncation, halve the batch and
  retry, fall back in-conversation, or escalate a tier.

## Cost Guard On Verification: Skip When Verifier Cost Greatly Exceeds Generator

- **Context:** Any auto-verified task type where the generator is a cheap
  tier-1 or tier-2 model and the verifier picks an expensive tier-3 model.
- **Failure or friction:** A cheap Gemini Flash call at $0.0003 can pull a
  $0.15 GPT-5.4 verification call — 500x cost ratio that destroys savings.
- **Lesson:** The router's `router-config.yaml` carries
  `verification.max_cost_multiplier` (default 3.0). When verifier cost
  exceeds `max_cost_multiplier × generator cost`, verification is skipped
  and metrics record `verification_skipped: cost_guard`. Session-verification
  is exempt — that is non-negotiable cross-provider review.
- **Action for future sessions:** Trust the guard for cheap routed work.

## Persist Routed Output To Disk Before Display Or Logging

- **Context:** Any routed call on Windows where the default console code page
  is `cp1252`.
- **Failure or friction:** `print(result.content)` crashes mid-line when
  content contains characters `cp1252` cannot encode. The crash loses the
  paid output that has not yet been written anywhere.
- **Lesson:** Write routed output to a file FIRST (`encoding="utf-8"`), then
  print or log. Pattern:
  ```python
  with open(out_path, "w", encoding="utf-8") as f:
      f.write(result.content)
  print(f"Wrote {out_path} ({len(result.content)} chars)")
  ```
- **Action for future sessions:** Never `print(result.content)` directly.

## ASCII-Only Glyphs In Cross-Platform Terminal Output

- **Context:** Any helper that prints status to the terminal.
- **Failure or friction:** Emoji glyphs crash Windows `cp1252` consoles.
- **Lesson:** Use ASCII-only: `[~]` in-progress, `[ ]` not-started, `[x]`
  done. Reserve Unicode for files written with `encoding="utf-8"`.
- **Action for future sessions:** Follow `print_session_set_status()` in
  `ai-router/__init__.py` as the pattern.

## Session-State.json Is The Single Source Of Truth For In-Progress Detection

- **Context:** External tools detecting which session set is currently active.
- **Failure or friction:** `activity-log.json` is only created on first
  `log_step()` — 5–10 minutes after a session starts. External tools showed
  sets as "not started" while a session was underway.
- **Lesson:** Call `register_session_start()` at Step 1 and
  `mark_session_complete()` at Step 8. Do not infer in-progress from
  activity-log presence.
- **Action for future sessions:** Always call both lifecycle functions.

## Always Route `ai-assignment.md` And Next-Orchestrator / Next-Set Recommendations

- **Context:** Authoring `ai-assignment.md` (Step 3.5) or next-orchestrator /
  next-session-set recommendations (Step 8).
- **Failure or friction:** Orchestrator self-opines biased toward its own
  provider. A Claude orchestrator predictably recommends Claude even when
  Gemini Flash would be cheaper.
- **Lesson:** Always produce via `route(task_type="analysis")`. Rule #17 in
  the workflow doc makes this explicit.
- **Action for future sessions:** Never self-opine on which model is cheaper.

## Per-Session-Set E2E/UAT Configuration Is Spec-Declared, Not Inferred

- **Context:** Authoring a new session-set spec or onboarding a set.
- **Failure or friction:** Earlier versions inferred UAT applicability at
  runtime, causing session-to-session inconsistency within a set.
- **Lesson:** UAT and E2E gates are declared once in a YAML configuration
  block at the top of the spec (`requiresUAT`, `requiresE2E`). The
  orchestrator reads the block at Step 2 and obeys it for the entire workflow.
- **Action for future sessions:** Read the authoring guide before setting
  flags. Trust the spec during execution.

---

## Repo-Specific Lessons

> **TODO:** Add lessons specific to this repo below as the project matures.
