# Proposal: `delegation.decision_consensus` Configuration Option

> **Status:** Design proposal authored 2026-05-17. Not yet implemented.
> Conceptually a **cross-repo** change — the schema acceptance and any
> helper code live in the `dabbler-ai-router` package
> (`dabbler-ai-orchestration` repo); the workflow-behavior change and
> instruction-file updates live in each consumer repo. Implementation
> should be scoped as its own session set, most naturally in
> `dabbler-ai-orchestration` since the change benefits every repo
> using the router.
>
> **Authority for the design:** cross-engine consult on 2026-05-17
> captured at
> [`docs/strategy-input/delegation-config-gpt-5-4.md`](../strategy-input/delegation-config-gpt-5-4.md)
> and
> [`docs/strategy-input/delegation-config-gemini-pro.md`](../strategy-input/delegation-config-gemini-pro.md).
> Both engines independently converged on the shape captured below;
> areas where they diverged are called out in "Design decisions where
> the engines diverged" near the end.

---

## Motivation

The Dabbler AI orchestrator workflow already routes substantive reasoning
through the `dabbler-ai-router` package (`route(task_type=…)`,
`query(model, …)`) and ends each session with mandatory cross-provider
verification. What it does **not** yet do is delegate **in-session
design / architecture / process questions** to a routed cross-engine
consensus before falling back to `AskUserQuestion`.

The user feedback that drove this proposal:

> "Whenever you want input from the human on non-trivial
> design/architecture/process-related things, please just get input
> from GPT and Gemini and then use your best judgment rather than
> bothering me with a whole bunch of questions that AI should be able
> to figure out. Now, there are some times when my human input is
> really needed. In those cases, ask me. But if you think that a
> consensus AI opinion would most likely be sufficient, then seek
> that instead."

The orchestrator's current default — present an `AskUserQuestion`
multiple-choice matrix when a design choice surfaces — wastes the
human's attention on calls the engines can converge on themselves.
A configuration option lets the human flip the default on a
per-workspace basis, without breaking existing repos that prefer the
current asking-by-default behavior.

---

## Recommended shape

Extend the existing `delegation:` block in
`ai_router/router-config.yaml` with a `decision_consensus` sub-block:

```yaml
delegation:
  # Existing keys (unchanged):
  always_route_task_types: [ ... ]
  direct_work_max_lines: 50
  direct_work_max_files: 1

  # New sub-block:
  decision_consensus:
    enabled: false
    engines:
      - openai:gpt-5-4
      - google:gemini-pro
    categories:
      - design
      - architecture
      - api-surface
      - refactor-placement
      - scoping
      - testing-strategy
      - file-layout
      - spec-clarification
    unresolved_action: ask_user      # ask_user | proceed_with_orchestrator_judgment
    journal_path: ai_router/consensus-decisions.jsonl
    journal_full_payloads_dir: ai_router/consensus-decisions  # optional; null disables
```

### Field semantics

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | bool | `false` | Master switch. When `false`, the orchestrator's existing asking-by-default behavior is preserved. |
| `engines` | list of `provider:model` | `[openai:gpt-5-4, google:gemini-pro]` | Engines the orchestrator routes the question to in parallel. Independent of `verification.preferred_pairings` because in-session decision support and end-of-session verification are different jobs and may want different pairings. |
| `categories` | list of slugs | (see above) | Declarative whitelist of question categories eligible for consensus. The orchestrator's runtime heuristic still applies the "is this human-only?" filter on top. |
| `unresolved_action` | enum | `ask_user` | What the orchestrator does when the engines disagree materially or the synthesis hinges on information neither engine has. `ask_user` surfaces the synthesized conflict via `AskUserQuestion`. `proceed_with_orchestrator_judgment` lets the orchestrator pick a side. **Default `ask_user` is the safe choice; `proceed_with_orchestrator_judgment` is reserved for power users who explicitly accept the autonomy trade.** |
| `journal_path` | path or null | `ai_router/consensus-decisions.jsonl` | Per-call structured log line. Null disables logging. |
| `journal_full_payloads_dir` | path or null | `ai_router/consensus-decisions` | Directory for the full prompt + per-engine responses (one file per call, named by timestamp + question-hash). Null disables full-payload capture; the journal still records the decision summary. |

### Default: opt-in

The default `enabled: false` preserves backward compatibility for
every existing repo. A repo that wants the consensus behavior flips
the flag explicitly. This matches the precedent already set in
`router-config.yaml` for behavioral additions
(`metrics.enabled`, `verification.auto_verify_task_types`, etc.).

### Engines are configurable, not inherited

`engines` is its own list, **not** inherited from
`verification.preferred_pairings`. Verification is "did the
orchestrator do its work correctly?"; consensus is "what should the
orchestrator do?". The two roles may want different models — e.g., a
repo whose verification is calibrated to gpt-5-4 might still want
opus + gemini-pro for in-session design consult. Keeping the two
lists independent costs one extra config key per repo and eliminates
a cross-purpose coupling.

The default pair (`gpt-5-4` + `gemini-pro`) is the same pair
already used informally for the cross-engine consults that motivated
this proposal — calibrated, cheap (~$0.05–$0.10 per consult), and
covers two different provider families.

---

## How the orchestrator interprets the option

### Pre-session

The orchestrator reads `delegation.decision_consensus` at session
start (alongside the existing
`router-config.yaml` reads) and caches the values for the rest of
the session.

### During the session — decision tree

When the orchestrator encounters a decision point that would otherwise
warrant `AskUserQuestion`:

```
Is the question genuinely human-only?
  └── YES → use AskUserQuestion (existing behavior).
        Examples: business priority, taste/aesthetic, things only
        the human knows, irreversible high-blast-radius actions
        (force-push, mass-deletion).

  └── NO → is `decision_consensus.enabled` true?
        ├── NO → use AskUserQuestion (existing behavior — no
        │        change for opt-out repos).
        │
        └── YES → does the question fall into one of the configured
                  `categories`?
              ├── NO → use AskUserQuestion (the option is
              │        narrowly scoped to declared categories).
              │
              └── YES → run consensus:
                  1. Send the same framing to every engine in
                     `engines` via `query()`.
                  2. Synthesize the responses (orchestrator's job —
                     the orchestrator has full session context and
                     is the right place to do this).
                  3. If the synthesis converges on a clear
                     recommendation, act on it. Log the decision
                     to `journal_path`. (Optionally save full
                     payloads to `journal_full_payloads_dir`.)
                  4. If the synthesis reveals material disagreement
                     or unresolved ambiguity, apply
                     `unresolved_action`:
                     • ask_user → surface the synthesized conflict
                       via AskUserQuestion with the engines' positions
                       summarized as the option labels.
                     • proceed_with_orchestrator_judgment →
                       orchestrator picks and proceeds, logging the
                       rationale.
```

### Human-only category examples (always go through `AskUserQuestion`)

- "Should we deprecate this feature?" (business priority)
- "What should we name this product?" (taste call)
- "Is the legacy team OK with this breaking change?" (the
  orchestrator can't know)
- "Should I force-push to main to fix the mistaken commit?"
  (irreversible)
- "I about to delete `samples/HomeHealthCare.accdb`. Confirm?"
  (irreversible / shared-state)

### Consensus-eligible examples (go through `query()` × N when enabled)

- "Should this loader strip happen at parse-input time or at YAML-
  mirror extract time?" — the question this session's
  `vba-attribute-header-strip` stub was scoped around. Both
  engines converged on the answer cleanly.
- "Should we extract the diff-message builder into a helper that
  both the gate and the sentinel test consume, or duplicate the
  message into the sentinel?" — a refactor-placement question.
- "Should the new endpoint be one POST or two?" — API-surface
  question.
- "Should this be a unit test, integration test, or both?" —
  testing-strategy question.
- "Should this logic live in the existing module or a new file?" —
  file-layout question.

---

## Observability

### Structured journal (default on)

`ai_router/consensus-decisions.jsonl` — one JSON object per consensus
call, append-only, similar in shape to the existing
`router-metrics.jsonl`. The journal is for **audit** (the human can
review which decisions the orchestrator made on its own), not for
forensics; full prompts and responses go elsewhere if needed.

Per-line fields:

```jsonc
{
  "timestamp": "2026-05-17T20:14:33.421-04:00",
  "session_set": "harvester-finish-canonical-parse-success-report",
  "session_number": 2,
  "category": "refactor-placement",
  "question_summary": "Where to strip the VBA Attribute VB_* header?",
  "question_hash": "sha256:9f3a…",  // for cross-ref with full-payload dir
  "engines": ["openai:gpt-5-4", "google:gemini-pro"],
  "agreement_level": "aligned",   // aligned | partial | conflict | degraded
  "chosen_recommendation_summary": "Shared module-body loader (B); audit every production call site",
  "applied": true,
  "fallback_action": null,        // null | ask_user | orchestrator_judgment
  "fallback_reason": null,
  "input_tokens_total": 2206,
  "output_tokens_total": 4768,
  "cost_usd": 0.0618
}
```

### Full payloads (optional, default on)

When `journal_full_payloads_dir` is set, each consensus call also
writes:

```
<journal_full_payloads_dir>/
  2026-05-17T20-14-33-9f3a.md
```

Containing the prompt, both engine responses verbatim, and the
synthesized recommendation. Disable by setting the field to `null` —
useful for repos where consensus calls are dense and the disk
footprint matters.

---

## Cross-repo touchpoints

### Lands in `dabbler-ai-router` (the `dabbler-ai-orchestration` repo)

- **Schema acceptance** for the new `delegation.decision_consensus`
  sub-block. The router validates `engines` entries against the
  configured `models:` table and rejects invalid pairings at load
  time.
- **Optional helper:** a `consensus(content, *, category,
  session_set, session_number) → ConsensusResult` function that does
  the dual `query()` + journal-write + payload-write in one call.
  Not strictly required (the orchestrator can call `query()` twice
  and write the journal itself), but it removes a per-orchestrator
  rough edge and keeps logging consistent across orchestrators.

### Lands in each consumer repo's workflow

- **`docs/ai-led-session-workflow.md`** gets a new section
  documenting the decision tree above, the eligible / human-only
  category examples, the journal format, and the requirement to
  synthesize into one concrete recommendation before acting.
- **`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`** each get a short
  pointer to the new workflow section. Per the existing
  *Keep-Agent-Instruction-Files-In-Sync* feedback memory, the
  pointer text is identical across the three files.

### Lands in each consumer repo's `router-config.yaml`

- The consumer repo's `router-config.yaml` is the actual
  enablement point. Repos that want the new behavior add the
  `decision_consensus` block; repos that don't want it leave
  the block absent (or set `enabled: false`).

---

## Minimum viable scope (V1)

Both engines independently converged on the same V1 shape; this is
the smallest version that delivers the value:

1. **Router package:** accept the new YAML sub-block with the four
   fields `enabled`, `engines`, `categories`, `unresolved_action`.
   Validate `engines` entries against `models:`. Reject invalid
   inputs at load time. **No new router API required for V1** —
   orchestrator calls `query()` twice and writes the journal
   itself. The optional `consensus()` helper can land later.
2. **Workflow doc:** new section documenting the decision tree +
   examples + journal format.
3. **Per-agent instruction files:** identical pointer to the new
   workflow section.
4. **Journal format:** the per-line shape above. `journal_path`
   defaults to `ai_router/consensus-decisions.jsonl`.
5. **Default:** `enabled: false`.
6. **Documented opt-in path:** a one-paragraph "how to enable" in
   the workflow doc.

Anything beyond V1 — full-payload dir, the `consensus()` helper,
the `proceed_with_orchestrator_judgment` fallback option, the
`agreement_level` heuristic refinement — is V2+ work, layered on a
working V1.

---

## Design decisions where the engines diverged

Both engines converged on **shape** (location, name, default,
configurability, observability). They diverged on two minor
implementation choices:

### 1. New `GetConsensus` tool vs. `query()` × N + workflow guidance

- **Gemini's view:** introduce a new `GetConsensus(question,
  category)` tool exposed to the orchestrator alongside
  `AskUserQuestion`, with strict instructions on when to reach for
  which.
- **GPT's view:** no new tool — the orchestrator just calls `query()`
  twice and the workflow-doc + per-agent instructions document the
  pattern.
- **Synthesis (my call):** skip the new tool for V1. The boundary
  lives in the workflow-doc + instruction-file guidance, not in tool
  surface. A new tool adds complexity without enforcement (the
  orchestrator can still bypass it), and the optional `consensus()`
  helper covers any "make this one call instead of two" ergonomics
  concern later.

### 2. Journal granularity — summaries vs. full payloads

- **GPT's view:** journal carries summaries + hashes by default;
  full payloads are optional / off by default for disk + safety
  reasons.
- **Gemini's view:** journal carries full payloads inline for
  auditability.
- **Synthesis (my call):** split it. The journal is per-line summary
  (GPT's pattern, mirrors `router-metrics.jsonl`); the full
  payloads land in a sibling directory (Gemini's auditability) but
  on by default since most repos want the audit trail. Either side
  is opt-out via config.

---

## Open questions for the human

Per the new *Seek AI Consensus Before Asking the Human* feedback
memory, this proposal deliberately makes choices on every design
question the engines could resolve. The remaining items genuinely
warrant your input before we commit to V1:

1. **Where should the implementation session set live?** Three
   reasonable homes:
   - In `dabbler-ai-orchestration` (the router's canonical repo) —
     cleanest place because the schema-acceptance code lands there
     and the consumer-repo workflow updates are mechanical
     follow-on commits.
   - As a new session set in this repo (`dabbler-access-harvester`)
     that scopes both the cross-repo router change and the
     local-repo workflow change in one set. Bigger blast radius but
     keeps the work coherent.
   - Split across both repos — router-side change as its own set;
     consumer-repo workflow updates as a separate small set.
2. **Default `categories` list — broader or narrower?** The list
   above (~8 categories) is the engines' converged shape. If you'd
   rather start narrower ("ship only `refactor-placement` and
   `file-layout` in V1, see how it feels, expand later"), the
   shape supports either default.
3. **Should the journal be checked into git or gitignored?** It
   accumulates one line per consensus call, which builds up. The
   `router-metrics.jsonl` precedent is **committed** for
   cross-conversation continuity. Following the same precedent
   would have `consensus-decisions.jsonl` also committed, with the
   `consensus-decisions/` full-payload dir gitignored.

These are the three taste / scope calls I won't try to AI-consensus
away. Everything else in this proposal is the orchestrator's
best-judgment synthesis of the cross-engine convergence and is ready
to act on once you bless the three items above.

---

## Routed cost of this proposal

Two engines × ~$0.04 each = **$0.0844 total** for the consult that
drove the proposal (full breakdown in
[`docs/strategy-input/`](../strategy-input/)). The drafting of this
document was orchestrator-side in-conversation, not routed.
