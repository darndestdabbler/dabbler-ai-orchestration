"""Route the next-orchestrator recommendation for Set 065 Session 3 (synthesis
proposal). Per project-guidance: never self-opine; route via analysis."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route

PROMPT = """\
Recommend the orchestrator engine/model + effort for Set 065 Session 3 (FINAL)
of dabbler-ai-orchestration. Reply ONLY with a JSON object:
{"engine": "...", "provider": "...", "model": "...", "effort": "low|medium|high",
 "reason": "one or two sentences"}

Context:
- This is a research/proposal set (no shipping code, no release). S1 = retrospective
  bake-off (path-aware verification STRONGLY supported, ~92% probeable, routed's
  keep-or-drop left to a forward A/B). S2 = integration-surface spike (GO: path-aware
  critique CAN be a routed call; primary recommendation = first-party tool-loop
  adapter metered BYOK, alternative = Copilot CLI subscription).
- S1 and S2 were both run by Claude Code (claude-opus-4-8, high effort), R1->R2
  cross-provider VERIFIED each.
- S3 work: synthesize S1 evidence + S2 spike + the captured gpt-5.4/gemini-2.5-pro
  consensus into ONE proposal; score 4 candidate designs against a complexity/
  quality rubric; make explicit keep/demote/retire recommendations; resolve the
  contract-author-independence open question; author change-log.md; route the
  final cross-provider verification; close the set. Heavy synthesis + judgment
  over the full set's context.
- Candidates: claude-opus-4-8 (incumbent, full context continuity), gpt-5.4,
  gemini-2.5-pro. Consider context-continuity vs fresh-perspective tradeoffs and
  cost. Verification will be cross-provider regardless of who orchestrates.
"""

r = route(PROMPT, task_type="analysis", session_set="065-verification-surface-empirics",
          session_number=2)
out = HERE / "next-orchestrator-rec.md"
out.write_text(f"# Set 065 -> S3 next-orchestrator recommendation (routed)\n\n"
               f"> Routed via route(task_type='analysis'). Model used: {r.model_name} ({r.model_id})\n\n"
               f"{r.content}\n", encoding="utf-8")
print(f"Wrote {out}")
print("model:", r.model_name, r.model_id, "cost:", r.cost_usd)
print(r.content[:1200])
