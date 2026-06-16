"""Set 069 S3 -- cross-provider session verification (Step 6, gated -> REQUIRED).

S3 ships the probe-template lane: a new module (probe_templates.py) + wiring into
the shared pull adapter (pull_verifier.py) + the producer (pull_critique.py), a
latent-bug fix in path_aware_critique.py, and a doc -- a 5-file ai_router+docs
diff, so routed_gate trips REQUIRED (breadth + multi-module). The orchestrator is
Anthropic/opus; the verifier routes to a different provider.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO))

from ai_router import route  # noqa: E402

# Filled from the green full-suite run at this commit (baseline 1767 + 1 skip).
NEW_TESTS = 47
TOTAL_PASS = 1814

FILES = [
    "ai_router/probe_templates.py",
    "ai_router/pull_verifier.py",
    "ai_router/pull_critique.py",
    "ai_router/path_aware_critique.py",
    "ai_router/docs/pull-verifier.md",
    "ai_router/tests/test_probe_templates.py",
    "ai_router/tests/test_pull_verifier.py",
    "ai_router/tests/test_pull_critique.py",
    "ai_router/tests/test_path_aware_critique.py",
]
DIFF = subprocess.run(
    ["git", "diff", "--cached", "--", *FILES],
    cwd=str(REPO), capture_output=True, text=True,
).stdout

# The new module is the heart of the session; include its FULL content (it is
# net-new, so the diff is the whole file anyway, but read it directly so the
# verifier sees it cleanly).
PROBE = (REPO / "ai_router/probe_templates.py").read_text(encoding="utf-8")
EVIDENCE = (REPO / "ai_router/evidence_protocol.py").read_text(encoding="utf-8")

PROMPT = f"""\
You are the cross-provider session verifier for Session 3 of 6 of Set 069
(automated pull-critique capabilities) in the dabbler-ai-orchestration repo.
Return the structured verdict.

=== CONVENTIONS / BASELINE (read first; do NOT re-flag the agreed baseline) ===
- Suite baseline BEFORE this session: 1767 passed, 1 skipped (1 pre-existing,
  tracked). This session ADDS {NEW_TESTS} unit tests; the full ai_router pytest
  suite is GREEN at this commit ({TOTAL_PASS} passed, 1 skipped). You are
  verifying CODE + DOCS, not re-running the suite.
- RELEASE CONTRACT: NO release this session. The ai_router PyPI release is
  Session 6; the version is intentionally unchanged. NO Marketplace / extension
  change (spec non-goal: no UI surface this whole set).
- BY-DESIGN SCOPE (Session 3 = "The probe-template lane -- the missing middle").
  IN scope: (a) an operator-authored, VERSIONED probe-template surface
  (probe_templates.py: declarations + typed-arg validation + a cage-backed runner
  + an in-cage driver harness); (b) wiring a run_probe_template tool + cage
  dispatch + templateId evidence stamping into pull_verifier.pull_route; (c)
  threading a ProbeTemplateConfig + a --probe-templates CLI flag through the
  pull_critique producer; (d) the seed template library that would have caught the
  two 0.22.x bug classes + a latent-bug fix it surfaced. The Session-1 evidence
  protocol (ai_router/evidence_protocol.py -- INCLUDED below) was VERIFIED in S1;
  verify only that S3 USES it correctly, do not re-audit it.
  DEFERRED (do NOT flag as gaps): the Podman model-authored-probe lane (S4), the
  ceiling->floor ratchet + replacement gate (S5), the PyPI release + dogfood (S6).
  The metered end-to-end agentic loop is NOT unit-tested (only the seams are);
  the FULL real-cage integration of the seed templates (running
  `python -m ai_router.probe_templates` in a worktree of the whole repo) is NOT
  unit-tested either (the module is not committed at test time; the driver probe
  bodies are instead tested IN-PROCESS against the real public entrypoints, both
  the robust and the reproduced directions). That is by design.
- ADDITIVITY IS A HARD REQUIREMENT: with NO ProbeTemplateConfig (and no
  RunTestConfig / DiffConfig) the loop + producer must be byte-for-byte the prior
  read-only behavior (no run_probe_template tool offered, no templateId field in
  the verdict schema, no evidence stamping). Confirm this.

=== WHAT TO VERIFY (cite file:line for any finding) ===

1. THE MODEL NEVER AUTHORS CODE OR ARGV (the load-bearing trust property of this
   lane). The model supplies ONLY a templateId + typed args; the harness/argv is
   operator-authored. In probe_templates.build_probe_argv + run_probe_template +
   the BUILTIN templates: confirm there is NO path where a model-supplied value
   becomes an executable command/argv token beyond the typed args the template
   declares, and that the args are validated BEFORE the cage runs. Is the argv
   `python -m ai_router.probe_templates --run <id> <json-args>` -- a fixed,
   operator-authored invocation -- with the model's input confined to the
   JSON-encoded validated args?

2. TYPED-ARG VALIDATION (validate_template_args). Confirm it: requires every
   `required` spec; rejects an unknown key (no smuggling an undeclared input);
   enforces exact JSON types (string->str, int->int but NOT bool, bool->bool,
   enum->a str in choices); treats None as {{}}; and NEVER raises. Is there any
   value the model could pass that slips past validation into the driver?

3. AGENT CANNOT SELF-GRANT REPRODUCED (template lane). In pull_verifier:
   _stamp_evidence_tiers now matches a proposed templateId (as well as commandId)
   against captured executions; _build_transcript emits a templateId transcript
   (NOT commandId) for a template-kind _Execution, with the template's declared
   PUBLIC entrypoint (meta-oracle). Confirm REPRODUCED is conferred ONLY after the
   orchestrator REPLAYS the captured argv on a SECOND pristine checkout whose
   outputHash MATCHES, and that an unknown/mismatched/leaked/errored run COLLAPSES
   to a read-claim. Is there ANY false-REPRODUCED path for a template finding?
   Note the transcript is a valid Set-066 EvidenceTranscript (commandId XOR
   templateId; the schema already supports templateId from S1).

4. DETERMINISTIC PROBE OUTPUT (the replay-hash contract). The driver probes must
   print a DETERMINISTIC PROBE_RESULT line (no memory addresses, no temp paths, no
   exception MESSAGES -- only stable classifications / exception TYPE names /
   result codes), so a pristine replay reproduces the same outputHash. Audit
   _probe_malformed_artifact_bytes and _probe_bad_parent_dir + _driver_main: is
   any non-deterministic value (a tempfile path, an address, an errno message)
   ever printed? Does the driver ever leak a raw traceback (it must catch and
   print a type-only message)?

5. THE META-ORACLE HOLDS BY CONSTRUCTION. Every BUILTIN template's entrypoint_kind
   must be one of evidence_protocol.PUBLIC_ENTRYPOINT_KINDS (never agent_harness),
   and each probe must drive that REAL public entrypoint (not an agent-built
   harness). Confirm the seed templates drive ai_router's own public functions
   (validate_path_aware_critique_artifact / run_test_in_cage).

6. THE CAGE CONTRACT IS REUSED CORRECTLY. run_probe_template runs the argv via
   run_test_in_cage (pristine checkout, crash-safe teardown, caps), dispatched
   OUTSIDE the byte-equality guard (execution is non-re-derivable, like run_test).
   A clean ProbeRun is captured ONLY when ran AND no cage error AND no teardown
   leak (a leak/error cannot back a reproduction). Confirm the bad_parent_dir
   probe does NOT create a nested worktree (mkdtemp fails BEFORE git worktree add).

7. ADDITIVITY / BACKWARD COMPATIBILITY. With probe_template_config=None: the
   run_probe_template tool is NOT offered; the verdict schema has NO templateId
   field; _stamp_evidence_tiers is reached only when an execution lane is active.
   With run_test active but NOT templates (and vice versa), the right ids are
   offered. Confirm the no-lane verdict schema is byte-for-byte the read-only
   shape, and the replay_cfg selection (run_test_config or probe_template_config)
   is sound when only ONE lane is active.

8. THE path_aware_critique.py FIX (the latent 0.22.x class this lane surfaced).
   Four readers (read_path_aware_critique, has_path_aware_critique_record,
   path_aware_critique_record_unreadable, validate_path_aware_critique_artifact's
   file-read path) now catch UnicodeError in addition to (OSError,
   JSONDecodeError). Confirm: (a) this is a REAL latent bug (invalid-UTF-8 bytes
   are a UnicodeError, NOT a JSONDecodeError, so they would have escaped and
   crashed close-out -- the same class contract_gate fixed in Set 068); (b) the
   fix is correct and complete for these four readers; (c) path_aware_critique_
   record_unreadable correctly returns True (the loud-warning path) on invalid
   UTF-8 rather than silently disarming. Is the fix's BLAST RADIUS appropriately
   scoped (the broader UnicodeError gap elsewhere in ai_router is intentionally
   left to a future set; is that a defensible scope decision for THIS session, or
   does any UNFIXED sibling reader sit on THIS session's close-out path)?

9. DOC ACCURACY (ai_router/docs/pull-verifier.md "What Set 069 S3 added"). Does it
   match the code EXACTLY (the lane, the model-supplies-only-typed-args rule, the
   templateId transcript, the seed library, the path_aware_critique fix)? Any
   claim of CURRENT behavior the code does not back (L-064-8)? Any overclaim of
   what S3 ships vs S4-S6?

10. TEST ADEQUACY. Do the new tests actually exercise the named behaviors (the
    reproduced AND robust driver directions, the false-REPRODUCED collapse, the
    additivity / read-only-unchanged case, the typed-arg rejections, the cage
    capture-vs-no-capture paths, the UnicodeError regression), or do any pass
    without exercising the behavior they name? Note the reproduced-direction
    driver tests monkeypatch the module _import_under_review resolves (both
    ai_router.X and bare X exist on the test sys.path) -- is that a sound test, or
    does it mask a production issue (in the cage only the worktree's ai_router
    exists)?

=== ai_router/probe_templates.py (NET-NEW this session; full content) ===
{PROBE}

=== ai_router/evidence_protocol.py (Session 1, VERIFIED; included for reference) ===
{EVIDENCE}

=== STAGED DIFF (pull_verifier.py, pull_critique.py, path_aware_critique.py, doc, tests) ===
{DIFF}
"""


def main():
    r = route(
        PROMPT,
        task_type="session-verification",
        complexity_hint=80,
        session_set=str(HERE),
        session_number=3,
    )
    out = HERE / "s3-verification.md"
    out.write_text(r.content, encoding="utf-8")
    print(f"Wrote {out} ({len(r.content)} chars)")
    print(json.dumps({"model_used": getattr(r, "model_used", None),
                      "cost_usd": round(getattr(r, "cost_usd", 0.0) or 0.0, 6)},
                     indent=2))


if __name__ == "__main__":
    main()
