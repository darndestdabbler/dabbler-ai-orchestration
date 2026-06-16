"""Pre-Set-069 design panel: what capabilities must the AUTOMATED pull-critique
process gain so it stops underperforming the MANUAL pull process?

Pattern (docs/planning/orchestration-strategy.md): generate-diverse -> adversarial
cross-critique -> (orchestrator) synthesize -> operator-confirm. NOT a consensus
vote. Three independent engines, each a fresh clean context:
  - opus       (claude-opus-4-8)  -- a FRESH Opus, NOT the orchestrator's context
  - gpt-5-4    (gpt-5.4)
  - gemini-pro (gemini-2.5-pro)

Round 1 = independent designs. Round 2 = each engine adversarially critiques all
three R1 proposals + names the real disagreements + what is MISSING from all of
them. Raw outputs persisted to disk FIRST (L-064-3).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import query  # noqa: E402

RAW = HERE / "raw"
RAW.mkdir(exist_ok=True)
ENGINES = ["opus", "gpt-5-4", "gemini-pro"]

PREAMBLE = """\
Bias cautions: this prompt was authored by an AI agent (an Anthropic/Claude
orchestrator) that JUST built and shipped the architecture under review and may be
invested in it. Its framing may steer you toward in-scope tweaks when the right
move is to question the architecture. One of the three panelists is itself an Opus
(same model family as the orchestrator) -- weigh the design on its merits, not on
what flatters the incumbent. If the framing is wrong, say so and answer the better
question. Do not rubber-stamp; a polished restatement of the prompt is a failure.
"""

CONTEXT = """\
## The system (dabbler-ai-orchestration: a Python package `ai_router` + a VS Code
## extension; AI-led software workflow with cross-provider verification)

Over Sets 065-068 we built a LAYERED VERIFICATION SURFACE:

1. FLOOR -- a deterministic CONTRACT-TEST / CDC gate. A set declares its
   contract/falsifier tests + its known defect classes (probeable vs non-probeable).
   A producer runs the falsifier command in a disposable `run_test` cage and saves
   the raw pass/fail; a close-out gate confirms it passed and covers every
   *probeable* class. The floor is meant to carry the ~95%-probeable defect bulk
   cheaply and reproducibly, RESERVING the expensive agent for the non-probeable
   residual + for AUTHORING the falsifiers. (Experiment A H4: ~95% of seeded
   defects were deterministically falsifiable.)

2. CEILING -- a "PATH-AWARE CRITIQUE": a first-party tool-loop agent (`pull_route`
   in ai_router/pull_verifier.py) that READS THE ACTUAL REPOSITORY via read-only
   tools (read_file / grep / list_dir) -- "Mode-2 PULL" -- instead of being fed a
   pasted snippet ("Mode-1 PUSH", a single-shot route() call). It is multi-provider
   (>=2 distinct providers), run once at end-of-set. The orchestrator is a
   DETERMINISTIC SERVANT: it answers the agent's tool calls with RAW ground truth
   (byte-equality-guarded for reads) and NEVER a model-summarized view; a
   summarizing or fabricating servant is a HARD failure. Two ways to produce the
   critique: (a) MANUAL (operator drives GPT-5.4 + Gemini-Pro in a GitHub-Copilot
   editor, which CAN run a terminal); (b) AUTOMATED producer `pull_critique.py`
   that drives `pull_route` per provider.

3. GATED ROUTED -- per-session cross-provider routed verification, now DEMOTED to
   fire only when a programmatic blast-radius/coupling predicate trips on the diff.

The pull adapter ALSO already has a `run_test` EXECUTION CAGE: a disposable,
detached git worktree created from a pinned ref, runs an OPERATOR-CONFIGURED argv
(shell=False; the model can only trigger it, never author a shell string),
write-confined to the throwaway checkout, hard wall-clock + output caps, crash-safe
teardown. It returns the RAW exit code + output (deterministic servant, extended to
execution). It is disposable-CWD isolation of a TRUSTED command, explicitly NOT an
OS sandbox (a deliberately hostile command could still escape; the threat model is
accidental writes by a trusted command).

## The motivating gap (REAL data from THIS week's 0.22.0 release)

When we shipped, we ran the AUTOMATED pull-critique producer as the required
dogfood. It ran READ-ONLY -- `pull_critique.py` never wires the `run_test` cage
through to its critics, so the automated critics could read+reason but NOT execute.
It found a stale-version-string + some doc drift.

Separately the operator ran the MANUAL pull critique (GPT-5.4 + Gemini-Pro in a
Copilot editor WITH terminal execution). It caught 5 real defects the automated
producer AND the per-session routed verification BOTH missed -- including TWO MAJOR
CORRECTNESS BUGS that it REPRODUCED BY RUNNING CODE: (1) `run_test_in_cage` called
`tempfile.mkdtemp` OUTSIDE its protected try/finally, so a bad parent dir raised
instead of returning the contracted raw cage-error; (2) a JSON loader caught only
OSError/JSONDecodeError, so an invalid-UTF-8 artifact raised UnicodeDecodeError
through validators that PROMISE never to raise, crashing close-out. The manual
critic literally wrote "I reproduced this by calling run_test_in_cage(...)".

So the AUTOMATED pull process SIGNIFICANTLY UNDERPERFORMED the MANUAL pull process
-- not because the engine can't, but because the automated producer is
CAPABILITY-STARVED (read-only; shallow single-shot probing). (Honest caveat: both
bugs were ALSO findable by careful reading alone; the manual run was simply more
thorough AND had execution to confirm.)

## The operator's thesis to PRESSURE-TEST (the falsification hinge)

"Granting an automated critic execute/write powers is normally scary because the
action space is unbounded. BUT if the deterministic falsifier FLOOR already carries
the probeable bulk AND characterizes the residual, then the domain the agent must
operate in is small and well-described -- and a small, well-described domain is
exactly where expanded capability is both SAFE and HIGH-LEVERAGE. Cheap
deterministic checks bound the surface; spend the expensive flexible capability
only on the characterized remainder." Is this sound? Where does it hold and where
does it break? The hard constraint: expand capability WITHOUT the agent producing
MISLEADING findings (hallucinated reproductions, fabricated results, cage escapes)
that erode the human reviewers' trust.
"""

R1_TASK = """\
## Your task (Round 1 -- independent design; do NOT hedge toward a committee answer)

Design the capability set the AUTOMATED pull-critique process should gain so it
approaches the manual pull process, and judge the architecture. Be concrete and
opinionated. Cover:

1. CAPABILITIES. Exactly which new tools/affordances should the automated critic
   get, and which must it NOT get? Consider at least: wiring the existing `run_test`
   execution cage into the producer; a WRITE-ENABLED scratch sandbox to author AND
   run a reproduction / a candidate falsifier; deeper multi-turn / multi-round
   probing budget; the ability to run a SUBSET of the real test suite or a
   one-off script the agent writes; diff-awareness (what changed); a
   "reproduce-then-claim" discipline (a finding backed by an executed repro vs a
   read-only assertion). Name each tool, its guardrail, and what it buys.

2. THE FALSIFICATION HINGE. Pressure-test the operator's thesis above. Does a
   falsifier-bounded, well-characterized residual actually justify EXPANDED
   (execute / write-in-disposable-sandbox / author-and-run-a-probe) capability that
   would be unsafe otherwise? Draw the LINE precisely: what expanded capability is
   safe+high-leverage given the floor, and what must stay forbidden to preserve the
   deterministic-servant guarantee and avoid misleading the human reviewers? Is the
   "reproduced by running" claim itself trustworthy, or does it open a new way for
   the agent to fool the reviewer?

3. ARCHITECTURE, GENERALLY. Is the floor -> ceiling -> gated-routed model
   structurally right? What is the single most important thing MISSING whose
   absence will make the automated pull process systematically underperform? Should
   Mode-2 PULL generalize beyond verification (to code-gen / docs / analysis)? If
   you would restructure, say how.

End with a tight PRIORITIZED list: the capabilities to add, in order, each with a
one-line guardrail. Flag anything you think is a trap.
"""


def run(engine, label, content):
    r = query(engine, content, task_type="analysis")
    text = r.content or ""
    out = RAW / f"{label}_{engine}.md"
    out.write_text(
        f"# {label} -- {engine}\n\n> model_used={getattr(r,'model_used',None)} "
        f"cost=${round(getattr(r,'cost_usd',0.0) or 0.0,6)} chars={len(text)}\n\n{text}\n",
        encoding="utf-8",
    )
    print(f"[{label}/{engine}] {len(text)} chars  ${round(getattr(r,'cost_usd',0.0) or 0.0,6)}")
    return text, (getattr(r, "cost_usd", 0.0) or 0.0)


def main():
    total = 0.0
    # Round 1 -- generate-diverse.
    r1 = {}
    for e in ENGINES:
        txt, cost = run(e, "r1", f"{PREAMBLE}\n{CONTEXT}\n{R1_TASK}")
        r1[e] = txt
        total += cost

    # Round 2 -- adversarial cross-critique (each sees ALL three R1 proposals).
    bundle = "\n\n".join(
        f"=== ROUND-1 PROPOSAL FROM {e.upper()} ===\n{r1[e]}" for e in ENGINES
    )
    r2_task = f"""\
## Your task (Round 2 -- adversarial cross-critique + synthesis)

Below are the three independent Round-1 proposals (yours is among them). Do NOT
summarize them. Instead:

1. ADVERSARIALLY critique all three -- including your own. Where is each WRONG,
   over-confident, unsafe, or hand-waving on a guardrail? Be specific.
2. Name the REAL DISAGREEMENTS (not cosmetic ones) -- the cruxes a human must
   decide.
3. What capability or risk is MISSING from ALL THREE proposals?
4. Give your best SYNTHESIS: the prioritized capability set you would actually
   ship first, each with its guardrail, and the ONE thing you would refuse to do.
   Do not converge for the sake of converging -- if the others are wrong, say so.

=== THE THREE ROUND-1 PROPOSALS ===
{bundle}
"""
    for e in ENGINES:
        _txt, cost = run(e, "r2", f"{PREAMBLE}\n{CONTEXT}\n{r2_task}")
        total += cost

    print(f"\nTOTAL panel spend ~${round(total,6)}")
    print(f"Raw outputs: {RAW}")


if __name__ == "__main__":
    main()
