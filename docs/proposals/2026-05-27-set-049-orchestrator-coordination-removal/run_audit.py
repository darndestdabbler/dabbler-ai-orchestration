"""Run Pass A + Pass B audits for Set 049 (orchestrator coordination removal).

Pass A: gemini-pro, primary-author framing (the rip-out IS the right call).
Pass B: gpt-5-4, devil's advocate framing (find what the rip-out misses).

Per feedback_ai_router_route_result_handling.md: dump RouteResult to JSON
BEFORE attribute access. Don't trust the wrapper shape.
"""
import json
from pathlib import Path

from ai_router import query

HERE = Path(__file__).parent
PROPOSAL = (HERE / "proposal.md").read_text(encoding="utf-8")

PASS_A_FRAMING = """\
You are the audit-S1 primary author for Set 049 (full rip-out of the
orchestrator check-out / check-in coordination layer).

You are coming into this audit having ALREADY agreed with the operator
that the rip-out is the right call. The operator-locked premises P1–P5
are NOT yours to challenge. Your job is to dispose the open topics
T1–T7, address the discovered collisions D1–D3, and produce
Keep/Drop/Defer recommendations on the 5 feature roll-call items.

Be concrete. Cite specific files/lines from the proposal's read-site
survey where relevant. Choose paths; don't hand back option lists.
Output format:

# Audit-S1 Pass A — Primary author disposition

## T1 schema version
**Disposition:** <v4-compatible | v5 bump>
**Reasoning:** <2-4 sentences>

(same shape for T2–T7)

## D1 bare-touch under omit-null
**Disposition:** <retire detector | redefine | other>
**Reasoning:** <2-4 sentences>

(same shape for D2, D3)

## Feature roll-call

### FR1 external-verification.md soft gate
**Recommendation:** <Keep | Drop | Defer>
**Reasoning:** <2-4 sentences>

(same shape for FR2–FR5)

## Locked session arc
**Count:** <number>
**Per-session theme breakdown:** <bullet list>

## Audit-discovered open questions for operator
<list, or "None" if all dispositions are confident>
"""

PASS_B_FRAMING = """\
You are the audit-S1 devil's advocate for Set 049 (full rip-out of the
orchestrator check-out / check-in coordination layer).

A Pass A author has agreed with the operator that the rip-out is the
right call. The operator-locked premises P1–P5 are NOT yours to
challenge. But everything else IS — Pass A's framing, the open topic
dispositions, the discovered collisions, and the 5 feature roll-call
items.

Your job is to surface what Pass A is likely missing:

- Is there a non-coordination read site for any of the 3 dropped
  fields that the survey missed?
- Does the rip-out leave any consumer repo (dabbler-platform,
  dabbler-access-harvester, dabbler-homehealthcare-accessdb) with a
  hook installation that breaks silently?
- Is `writer-bypass` (D3) actually valuable enough to keep, or is it
  noise that catches few real bugs?
- Are any of the 5 feature roll-call items actually load-bearing for
  the post-rip state?
- Is the v4-compatible schema choice (T1) hiding a future migration
  cost that v5 would surface up-front?
- Is the session arc count reasonable, or is something being
  underestimated?

Output format:

# Audit-S1 Pass B — Devil's advocate review

## T1–T7 disagreements with Pass A's likely positions
<for each topic where you'd push back, state the topic and your
counter-position with reasoning>

## D1–D3 disagreements
<same>

## Feature roll-call counter-positions
<for each FR where you'd push back on Pass A's likely recommendation,
state the counter and reasoning>

## Survey gaps
<what the read-site survey missed>

## Session arc disagreement
<if any>

## Recommended operator-visible questions
<what the operator MUST see before lock, even if Pass A is confident>
"""


def call(framing: str, model: str, label: str) -> dict:
    """Route one audit pass and dump the full RouteResult.

    Returns the parsed dict (after json.loads) so the caller can access
    fields safely without depending on wrapper attribute shape.
    """
    prompt = framing + "\n\n---\n\n# PROPOSAL\n\n" + PROPOSAL
    result = query(
        model=model,
        content=prompt,
        task_type="architecture",
        session_set="049-orchestrator-coordination-removal",
        session_number=1,
    )
    # Dump to JSON first; do NOT touch attributes until we've inspected.
    try:
        raw = json.dumps(result, default=lambda o: o.__dict__, indent=2)
    except Exception as exc:
        raw = json.dumps({"_dump_error": str(exc), "_repr": repr(result)})
    out_path = HERE / f"pass-{label}.raw.json"
    out_path.write_text(raw, encoding="utf-8")
    parsed = json.loads(raw)
    return parsed


def extract_text(parsed: dict) -> str:
    """RouteResult has `content` per __init__.py:581."""
    for key in ("content", "response", "text", "output", "completion"):
        v = parsed.get(key)
        if isinstance(v, str) and v.strip():
            return v
    return json.dumps(parsed, indent=2)


def main():
    a_parsed = call(PASS_A_FRAMING, "gemini-pro", "a")
    a_text = extract_text(a_parsed)
    (HERE / "pass-a.md").write_text(a_text, encoding="utf-8")
    print(f"Pass A cost: {a_parsed.get('cost_usd', a_parsed.get('cost', '?'))}")

    b_parsed = call(PASS_B_FRAMING, "gpt-5-4", "b")
    b_text = extract_text(b_parsed)
    (HERE / "pass-b.md").write_text(b_text, encoding="utf-8")
    print(f"Pass B cost: {b_parsed.get('cost_usd', b_parsed.get('cost', '?'))}")


if __name__ == "__main__":
    main()
