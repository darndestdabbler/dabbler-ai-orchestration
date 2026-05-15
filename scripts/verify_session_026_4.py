"""One-shot cross-provider verification for Set 026 / Session 4.

Routes the Session 4 deliverables (webview foundation:
ConfigEditorPanel.ts + yamlReadWrite.ts + schemaValidator.ts) to a
non-Anthropic verifier via task_type="session-verification".

CRITICAL: dumps RouteResult to JSON BEFORE any attribute access,
per the lost-spend memory (previous one-off scripts crashed during
attribute access and burned the routed call's cost).
"""
from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_ai_router():
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    import ai_router
    return ai_router


def main() -> int:
    config_editor_dir = (
        REPO_ROOT
        / "tools"
        / "dabbler-ai-orchestration"
        / "src"
        / "configEditor"
    )
    files = [
        config_editor_dir / "yamlReadWrite.ts",
        config_editor_dir / "schemaValidator.ts",
        config_editor_dir / "ConfigEditorPanel.ts",
    ]
    bundle_parts = []
    for f in files:
        rel = f.relative_to(REPO_ROOT).as_posix()
        body = f.read_text(encoding="utf-8")
        bundle_parts.append(f"=== {rel} ===\n{body}\n")
    bundle = "\n".join(bundle_parts)

    context = (
        "Set 026 Session 4 of 7 — Webview foundation for the new "
        "router-config editor (Set 025 spec'd it). Goal: stand up "
        "ConfigEditorPanel + YAML round-trip + schema validator; "
        "section UIs ship in Session 5. Spec lives at "
        "docs/session-sets/026-router-config-editor-implementation/spec.md "
        "(see 'Session 4 of 7: Webview foundation'). The single "
        "normative reference for the YAML schema + validation rules is "
        "Set 025's spec.md Appendix B. The webview registers as "
        "command 'dabbler.openConfigEditor', is singleton-per-workspace, "
        "shows a 6-section nav with placeholders, and has a Save button "
        "that round-trips the YAML files atomically. Tests are in "
        "src/test/suite/{yamlReadWrite,schemaValidator,configEditor-foundation}.test.ts "
        "(29 unit tests pass; tsc clean).\n\n"
        "Verification asks:\n"
        "1. Is the YAML round-trip lossless (comments/order preserved)?\n"
        "2. Does schemaValidator enforce the Appendix B rules: env-var "
        "shape (^[A-Z_][A-Z0-9_]*$), provider-ref resolution, local-"
        "overrides allowlist (verification_method + scope denied), "
        "local-only-provider rejection, threshold bounds?\n"
        "3. Is the panel singleton + tmp-rename atomic save correctly "
        "implemented?\n"
        "4. Are there any runtime bugs in the inline webview script "
        "block (Content-Security-Policy compatibility, valid JS syntax)?\n"
        "5. Any regressions or missed acceptance criteria from the spec?\n\n"
        "If you find no substantive issues, say VERIFIED. Otherwise "
        "list issues with severity (Blocker / Major / Minor) and file:"
        "line references."
    )
    content = (
        "Review the three foundation files for Set 026 Session 4 "
        "against the spec criteria above. Be specific about file "
        "paths and line numbers.\n\n"
        f"{bundle}"
    )

    ar = load_ai_router()
    result = ar.route(
        content=content,
        task_type="session-verification",
        context=context,
        session_set="026-router-config-editor-implementation",
        session_number=4,
    )

    # DUMP TO JSON FIRST — do not access result.* fields before this.
    dump_path = REPO_ROOT / "scripts" / "verify_session_026_4_result.json"
    try:
        as_dict = dataclasses.asdict(result)
    except TypeError:
        # Fallback if RouteResult is not a dataclass: read __dict__
        as_dict = {k: v for k, v in vars(result).items()}
    # Strip non-JSON-serializable values defensively
    cleaned = {}
    for k, v in as_dict.items():
        try:
            json.dumps(v)
            cleaned[k] = v
        except TypeError:
            cleaned[k] = repr(v)
    dump_path.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    print(f"Dumped result to {dump_path.as_posix()}")

    # Now safe to access fields via the dumped JSON.
    data = json.loads(dump_path.read_text(encoding="utf-8"))
    print("=== VERIFIER RESPONSE ===")
    print(data.get("content", "<no content>"))
    print()
    print("=== COST ===")
    print(
        f"model={data.get('model_name')} "
        f"input_tokens={data.get('input_tokens')} "
        f"output_tokens={data.get('output_tokens')} "
        f"cost_usd={data.get('total_cost_usd')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
