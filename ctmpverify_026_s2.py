import sys, json, pathlib, textwrap

SESSION_SET = pathlib.Path("docs/session-sets/026-router-config-editor-implementation")
SESSION_NUMBER = 2

# ── read changed files ─────────────────────────────────────────────────────
def read(p): return pathlib.Path(p).read_text(encoding="utf-8")

adoption_bootstrap = read("docs/adoption-bootstrap.md")
workflow_doc       = read("docs/ai-led-session-workflow.md")
budget_yaml        = read("ai_router/budget.yaml")
changelog          = read("ai_router/CHANGELOG.md")

# ── spec excerpt ───────────────────────────────────────────────────────────
spec_full = read(SESSION_SET / "spec.md")
# Extract Session 2 block (from "### Session 2 of 7" to "### Session 3 of 7")
start = spec_full.find("### Session 2 of 7")
end   = spec_full.find("### Session 3 of 7")
spec_excerpt = spec_full[start:end].strip()

# ── JSON response schema ───────────────────────────────────────────────────
SCHEMA = textwrap.dedent("""
    Return your verdict as JSON on the very last line, in this exact schema:
    {"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [{"id": N, "severity": "Critical|Major|Minor", "description": "..."}]}
    If VERIFIED, "issues" must be an empty list [].
""").strip()

# ── verification prompt ────────────────────────────────────────────────────
prompt = f"""
## Session 2 Verification — Set 026 (Router-Config-Editor-Implementation)

### What this session was supposed to do (spec excerpt)

{spec_excerpt}

---

### Files changed this session

#### docs/adoption-bootstrap.md (Step 5 section — NTE dialog replacement + field reference)

```
{adoption_bootstrap}
```

#### docs/ai-led-session-workflow.md (Cost-budgeted verification modes section)

Relevant section only — search for "## Cost-budgeted verification modes":

```
{workflow_doc[workflow_doc.find("## Cost-budgeted verification modes"):workflow_doc.find("## Key Concepts")].strip()}
```

#### ai_router/budget.yaml (NEW FILE)

```yaml
{budget_yaml}
```

#### ai_router/CHANGELOG.md (Session 2 addendum appended to [0.3.0] section)

```
{changelog}
```

---

### Verification questions

1. Does the adoption-bootstrap.md Step 5 now show the single NTE ask (with empirical $0.05–$0.80/call range data) rather than the three separate tier dialog boxes?
2. Is the $0 zero-budget path (options a/b) unchanged?
3. Was `verification_nte_usd` added to both the YAML example and the field reference in the bootstrap's schema section?
4. Does the workflow doc's budget tier table now have exactly two rows (zero-budget and non-zero)?
5. Is the 50%-of-threshold tier-upgrade prompt mention gone?
6. Is `verification_nte_usd` documented in the "What this means at session execution time" sub-section?
7. Does budget.yaml look correct (threshold_usd=10, verification_nte_usd=10, mode=limited-budget)?
8. Does the CHANGELOG.md addendum accurately describe what changed?
9. Is the Step 9 "More info" pointer updated away from "four-tier mapping"?
10. Are there any inconsistencies, omissions, or errors in the changes?

{SCHEMA}
""".strip()

# ── route ──────────────────────────────────────────────────────────────────
sys.path.insert(0, ".")
from ai_router import route
from ai_router.session_log import SessionLog

log = SessionLog(SESSION_SET)

print("Running session-verification route call...")
result = route(
    content=prompt,
    task_type="session-verification",
    complexity_hint=60,
    session_set=str(SESSION_SET),
    session_number=SESSION_NUMBER,
)

print(f"\nVerifier model  : {result.model_name}")
print(f"Input tokens    : {result.input_tokens}")
print(f"Output tokens   : {result.output_tokens}")
print(f"Cost USD        : ${result.cost_usd:.4f}")
print(f"\n{'='*60}\nVERIFIER RESPONSE\n{'='*60}\n")
print(result.content)

# save raw review
log.save_session_review(session_number=SESSION_NUMBER, review_text=result.content, round_number=1)
print(f"\n[saved to {SESSION_SET}/session-reviews/session-002/session-002-review.md]")
