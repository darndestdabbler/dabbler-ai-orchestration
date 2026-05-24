# Narration v1.1 Templates

> **Status:** Shipped in Set 045 / Session 4 (2026-05-24).
> **Locked by:** Set 044 proposal v1.1 (consensus-audited) +
> Set 045 / Session 1 phrasing-trigger ablation analysis.
> **Source of truth:** [`ai_router/narration.py`](../ai_router/narration.py).

This page documents the canonical CLAUDE.md / AGENTS.md narration
templates the harvester consumes. The templates ask the assistant
to emit a single `[DABBLER-NARRATION v1 phase=session-start ...]`
marker as the first text of its first response — that one line is
what lets the joiner correlate a free-running assistant session
back to a Dabbler session set.

## What is a narration marker?

The marker is a single bracketed token the assistant emits at
session-start:

```
[DABBLER-NARRATION v1 phase=session-start set=045-log-harvest-implementation session=4 total=6 effort=high]
```

The joiner ([`ai_router/joiner/`](../ai_router/joiner/)) scans
provider-native log files (`~/.claude/projects/<slug>/<conv>.jsonl`
for Claude Code; OTel JSONL for Copilot CLI) and uses the marker's
`set` + `session` keys to assign each native log to a Dabbler
session set without any extra metadata channel. Without the marker,
a free-running assistant session is still observable but is not
attributed to a specific session set.

Per the Set 044 v1.1 contract, **only session-start markers are
in scope**; per-turn narration is permanently OUT of contract.

## When to use these templates

You want one of these in your consumer project's workspace root
whenever:

1. You launch Claude Code or Copilot CLI *outside* the `dabbler-launch`
   wrapper (no native wrapper-record exists to bind to).
2. You want the Session Set Explorer's `narration_present` coverage
   badge to light up for the set.

If you only ever launch the assistant via `dabbler-launch` and never
free-run, the wrapper's launch record already supplies the
correlation and the narration template is optional.

## Generating a template

### From the extension (recommended)

`Dabbler: Regenerate Narration Templates` (Command Palette). The
command:

1. Picks the in-progress session set (auto-selects when exactly
   one is in-progress; quickpicks otherwise).
2. Reads `<set>/session-state.json` for the current set slug +
   session number + effort.
3. Writes the rendered files to
   `<set>/narration-templates/CLAUDE.md` and
   `<set>/narration-templates/AGENTS.md`.
4. Opens the Claude template for inspection.

Copy the rendered file to the *consumer project's* workspace root
(not the session-set folder) so the assistant picks it up at
session start.

### From the CLI (Lightweight tier)

```bash
python -m ai_router.narration \
  --kind claude \
  --state-file docs/session-sets/045-log-harvest-implementation/session-state.json \
  --output CLAUDE.md
```

Replace `--kind claude` with `--kind agents` for the AGENTS.md
variant. Both kinds emit the same marker; only the surrounding
prose differs to match each assistant's expected file location.

If you need to render without a state file (e.g., manually,
before `start_session` has run), use the explicit form:

```bash
python -m ai_router.narration --kind claude \
  --set-slug 045-log-harvest-implementation \
  --session 4 --total 6 --effort high \
  --output CLAUDE.md
```

## Anatomy of the marker

| Key       | Value shape                                | Required? |
|-----------|--------------------------------------------|-----------|
| `phase`   | literal `session-start`                    | yes       |
| `set`     | session-set slug (kebab-case)              | yes       |
| `session` | session number (positive integer)          | yes       |
| `total`   | total sessions in set (positive integer)   | yes       |
| `effort`  | one of `low`, `medium`, `high`             | optional  |

The full regex and parser-tolerance rules live in Set 044's
[narration-design.md §2.3 / §5](session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md).
The marker is parsed by
[`ai_router.narration.detect_marker`](../ai_router/narration.py)
and surfaces as a canonical `event_type="marker"` `HarvestRecord`
(joiner-spec.md §5).

Effort is the **reasoning axis only** (`low | medium | high`).
Speed-axis values `fast` / `standard` are NOT valid here — the
parser flags `effort=fast` as `unknown-effort-enum` and the render
function refuses to emit them.

## Defensive phrasing rules

The template prose obeys four rules locked in Set 045 / Session 1's
[Q3 phrasing-trigger analysis](session-sets/045-log-harvest-implementation/spike-prototypes/claude_phrasing_ablation_analysis.md).
Each rule traces to an empirical refusal Claude's classifier produced
against an earlier draft:

1. **No "harvest" lexical family.** No `harvest`, `harvester`,
   `harvesting`, `harvested`. Use `downstream tooling`,
   `session-boundary markers`, `correlation`, `session ledger`.
2. **No pretense self-disclosure.** Templates must not include
   `NOT a real project`, `synthetic`, `smoke probe`, `test
   fixture`, or similar self-flagging language. A test-fixture
   variant of the template lives under a clearly-different filename
   so it is never picked up by a real consumer project's
   CLAUDE.md resolution.
3. **Frame as a project convention,** not a data-emission request
   directed at the model. The marker is what the project *uses*;
   downstream tooling is *what processes it*.
4. **Minimal caps emphasis.** `FIRST` is fine; `VERY FIRST` adds
   pressure-language without value.

The rendered templates are unit-test-checked against these rules
in [`ai_router/tests/test_narration.py`](../ai_router/tests/test_narration.py)
(see `test_template_prose_obeys_defensive_phrasing_rules`).

## When the parser detects a malformed marker

`detect_marker` distinguishes four failure modes that the joiner
records as a `HarvestRecord` with `event_type="marker"` and
diagnostic flags on `raw_ref`:

| Diagnostic            | What triggered it                                                                   |
|-----------------------|--------------------------------------------------------------------------------------|
| `skipped`             | Unknown major version (`v9` instead of `v1`).                                       |
| `incomplete`          | Required field missing (`phase`, `set`, `session`; plus `total` for session-start). |
| `parse_error`         | The version number was not an integer (rare; the regex normally rejects this).      |
| `semantic_error`      | Syntactically valid but semantically wrong (placeholder leakage, unknown effort, session > total). |

The marker record is still emitted with whatever fields parsed —
the joiner does not silently drop malformed markers. Downstream
consumers decide whether to use, log, or quarantine.

## Optional follow-on ablation

Set 045 / Session 1 also authored an optional 8-run ablation
protocol (A1–A8) for empirically isolating the exact phrasing
trigger inside Claude's injection classifier. Cost: ~$1–3 against
the Set 045 NTE. See the ablation analysis
[§4](session-sets/045-log-harvest-implementation/spike-prototypes/claude_phrasing_ablation_analysis.md)
for the protocol. The defensive rules above are sufficient to ship
without running the ablation; the ablation upgrades the posture
from "defensive by best-evidence" to "defensive by isolated trigger
boundary."

## Cross-references

- [Set 044 narration-design.md](session-sets/044-ai-chat-log-discovery-and-experiments/narration-design.md) — full marker contract.
- [Set 045 joiner-spec.md](session-sets/045-log-harvest-implementation/joiner-spec.md) — how the joiner consumes marker events.
- [`ai_router/narration.py`](../ai_router/narration.py) — render + parse implementation.
- [`ai_router/joiner/parsers.py`](../ai_router/joiner/parsers.py) — Claude per-event parser that detects markers in JSONL.
