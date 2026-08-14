"""Author Session 3's disposition, preserving the verify_session-patched fields."""
import json
import pathlib
import subprocess
import sys

SET_DIR = pathlib.Path("docs/session-sets/132-session-length-and-explorer-captions")
path = SET_DIR / "disposition.json"
d = json.loads(path.read_text(encoding="utf-8"))

cost = json.loads(
    subprocess.run(
        [sys.executable, "-m", "ai_router.seat_cost",
         "--session-set-dir", str(SET_DIR), "--session-number", "3",
         "--cost-block", "--json"],
        capture_output=True, text=True, check=True,
    ).stdout
)

d["status"] = "completed"
d["next_orchestrator"] = None  # set-terminal session
d["blockers"] = []
d["cost"] = cost
d["lessons_cited"] = ["L-125-1", "L-112-1", "L-069-1", "L-064-8", "L-064-9"]
d["files_changed"] = [
    "docs/ai-led-session-workflow.md",
    "docs/planning/session-set-authoring-guide.md",
    "ai_router/changelog.d/0150-set-132-s3-why-long-sessions-are-long.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-causality-and-compaction.md",
    "docs/session-sets/132-session-length-and-explorer-captions/change-log.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-conventions.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-critique-prompt.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-prompt-round-a.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-prompt-round-b.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-a-openai.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-a-openai-sample-2.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-a-google.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-b-openai.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-b-openai-sample-2.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-panel-round-b-google.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-path-aware-critique-openai.md",
    "docs/session-sets/132-session-length-and-explorer-captions/s3-path-aware-critique-google.md",
    "docs/session-sets/132-session-length-and-explorer-captions/path-aware-critique.json",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_probe_overhead.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_probe_tail.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_panel_round_a.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_panel_round_b.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_panel_google.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_path_aware_critique.py",
    "docs/session-sets/132-session-length-and-explorer-captions/s3_assemble_critique.py",
]

d["summary"] = (
    "Set-terminal session. Shipped no production code by design: it reasons, "
    "recommends, and stops to the operator.\n\n"
    "STEP 2 -- the causal design, via a two-provider panel run as "
    "generate-diverse then adversarial cross-critique. The panel nearly "
    "failed silently: pinned with route(prefer_model=...), all four "
    "generations came back served by gpt-5.5, because "
    "_route_via_copilot_cli does not accept that parameter at all -- the "
    "profile resolves ONE generator role from the seat catalog rather than "
    "walking a tier ladder, so a documented preference is dropped without "
    "warning on one transport and honoured on the other. Undetectable from "
    "the call site: the metrics row records served_model_mismatch: false, "
    "because the model that answered IS the one the transport asked for. "
    "Repaired with exclude_providers, the lever that path does honour "
    "([anthropic] -> gpt-5.5; [anthropic, openai] -> "
    "gemini-3.1-pro-preview); the two mislabeled artifacts were RENAMED to "
    "-openai-sample-2, not edited or deleted. Both providers then killed the "
    "same things independently: self-reported effort as the primary outcome "
    "('models are text predictors'), step count as an outcome (it is the "
    "treatment), the single-spec design, and -- from opposite round-A "
    "positions -- the uncapped arm as CONFOUNDED rather than merely less "
    "relevant, since 'use the minimal sufficient number of steps' changes "
    "the instruction's semantics instead of raising the dose. Both concluded "
    "nobody can compute n until a pilot estimates the SD, and both then said "
    "unprompted that the experiment should not be funded at all yet. The "
    "operator independently ruled the same way on cost mid-session; both are "
    "journalled.\n\n"
    "The observational fallback was RUN, not merely evaluated (97 sessions). "
    "F = 41 min measured by partitioning ceremony-step time, beside S2's "
    "regression intercept of 39; w-bar = 6-9 min; corr(N, w-bar) = -0.03 to "
    "-0.40 across every cut, which is the direct test the F/N + w-bar "
    "composite was algebraically unable to perform. Fixed overhead is 5-7x a "
    "work step. The composition artifact the panel was asked to attack was "
    "confirmed (skeleton-era share falls 59% -> 0% as N rises), and its "
    "consequence is reported honestly: it biases w-bar UPWARD at high N, so "
    "the flat result is a conservative bound -- while the skeleton-era cut "
    "can validate F but CANNOT estimate the N slope, because every "
    "skeleton-era session has N <= 3. The cap censored the evidence that "
    "would identify its own optimum.\n\n"
    "TAIL: among sets 111+, verification-artifact count correlates with "
    "duration at +0.767 against N's +0.228, and largest-gap SHARE correlates "
    "negatively, so the residual tail is neither idle nor step count. "
    "Reported as a ranking of unmodelled correlations whose arrow is "
    "unresolved. Both providers predicted this ranking before seeing it.\n\n"
    "STEP 3 -- the operator's prevention question answered by ADDING "
    "NOTHING: no gate, no config key, no CLI, no close-out predicate. "
    "L-095-1's consequence rubric already IS that question, asked about a "
    "proposed step instead of a reported finding; the authoring guide gained "
    "the application point. project-guidance.md was deliberately not edited "
    "-- the spec made that touch conditional and a first draft breached its "
    "preload ceiling by 126 tokens, which ratchets down only.\n\n"
    "STEP 4 -- the compaction trigger keeps Set 131's ~150K threshold and "
    "first-boundary-after-crossing rule, and gains the half that forbids "
    "every-boundary firing: a flush RESETS the transcript to ~54K, inside "
    "the cheap plateau, so a second flush pays 400 credits to save "
    "approximately nothing. The coupling now lives in one place -- N "
    "determines how many boundaries EXIST, the threshold determines which "
    "FIRE -- with the obligation named in both directions.\n\n"
    "VERIFICATION: round 1 discovery, fan-out 2/2, VERIFIED with 0 findings. "
    "The set-terminal PATH-AWARE CRITIQUE (advisory) then ran BEFORE the "
    "suites per the Step 8 ordering. The automated producer refused: "
    "pull_verifier has no transport awareness and hard-requires DABBLER_* "
    "keys. The obvious reading of that -- 'path-aware review needs provider "
    "keys' -- is WRONG and the operator caught the orchestrator stating it "
    "that way; routed children on this transport carry --available-tools "
    "view,grep,glob and are path-aware by construction. It is a producer "
    "WIRING gap, recorded as R4 in the same family as R3. The manual flow "
    "(the template's documented default) was used: both critics returned "
    "ISSUES_FOUND and both independently found the SAME two Majors -- the "
    "batch-logging robustness claim holds only WITHIN a role, and the two F "
    "estimates are NOT independent (gemini's version was decisive "
    "arithmetic: work + ceremony sum by construction to completedAt - "
    "startedAt, exactly the interval S2 regressed). gpt-5.5 added the "
    "undisclosed 129-session exclusion and causal overstatement across four "
    "echoes. All remediated by MEASURING where possible rather than "
    "rewording: the probe now counts mixed-role batches (10 of 97) and "
    "reports the cut without them -- w-bar unchanged at 6.4, corr -0.029 -> "
    "-0.027, F rising 41.1 -> 47.0, so the conclusion survives its own "
    "correction -- and counts exclusions by reason, which showed the big "
    "drop is not era-concentrated. post_round_delta then classified the "
    "remediation A4.2 shipped-code, so one delta-scoped remediation-review "
    "ran: VERIFIED, 3 fix-accepted + 1 accepted-with-modification, 0 "
    "rejected, 2 Minor nits both fixed. Bounds: 1 discovery and 1 "
    "remediation-review used of 2 each.\n\n"
    "OPERATOR RULING ON N, received after the brief and after two suites had "
    "been recorded: allow three or four -- a CEILING of 4 with 3 retained as "
    "the stated TARGET, reversing the 2026-08-12 ratification. It overrides "
    "the orchestrator's own recommendation to keep 3, on an argument this "
    "session's measurement supplies but the brief failed to follow through: "
    "the brief priced a raise (~7-9 min) and never priced the opposite "
    "error, which is a forced session split costing a whole F (~40-60 min, "
    "6-7 work steps). Implementation is DEFERRED to the follow-on set by "
    "agreement -- WORK_STEP_BUDGET sits under ai_router/, which all three "
    "suites cover, so moving it here would discard recorded runs and a Layer "
    "3 run in flight, and this set's Ends-with promises a recommendation, "
    "not a changed number. Recorded in the brief (7.1), the change log and "
    "the authoring guide, each stating plainly that it is ruled and NOT yet "
    "in force.\n\n"
    "SUITES: all three owed (the changelog fragment lands under ai_router/, "
    "which mocha and playwright declare; pytest also covers "
    "docs/session-sets/). pytest 4519 passed / 9 skipped; mocha 1456 passing "
    "/ 0 failing / 2 pending; playwright recorded as a DISCLOSED COMPOSITE "
    "-- full run 31/32 with vsix-first-run-walkthrough exhausting its 300s "
    "budget under load, then 1/1 in 43.3s alone, all 32 executed and passed. "
    "That is R2, the third consecutive session in this set to record the "
    "same composition on the same spec. pytest was then re-run because the "
    "operator's N ruling arrived after the first recording and edited a file "
    "under docs/session-sets/, which pytest covers -- an honest cost of a "
    "late decision, not a shortcut around one."
)

path.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
print("wrote disposition")
print("cost:", cost["total_status"], round(cost["total_credits"], 2), "credits",
      "$" + str(round(cost["total_usd"], 2)))
