"""S3 literal-fidelity gate.

Checks, mechanically, the three claims this session makes about its own output:
  A. Every `Dabbler: <Title>` string in docs/tutorials/ resolves to a REAL
     contributed command title in the extension's package.json.
  B. Every literal the scene scripts share with the tutorial is byte-identical.
  C. Every relative markdown link under docs/tutorials/ resolves on disk.

Exit 0 only when every check passes. Prints a per-check tally.
"""
import json
import pathlib
import re
import sys

# repo root = <root>/docs/session-sets/<set>/<this file>
ROOT = pathlib.Path(__file__).resolve().parents[3]
TUT = ROOT / "docs" / "tutorials"
VIDEO = TUT / "video"
PKG = ROOT / "tools" / "dabbler-ai-orchestration" / "package.json"

results = []          # (ok, check_id, message)
def check(ok, cid, msg):
    results.append((bool(ok), cid, msg))

# Markdown reflows prose across lines, and a blockquote adds "> " to each
# continuation. Neither is a content difference, so every SUBSTRING check
# below runs on a whitespace-normalised copy. The YAML block comparison
# deliberately does NOT normalise — there, whitespace IS the content.
def norm(text: str) -> str:
    text = re.sub(r"(?m)^\s*>\s?", " ", text)
    return re.sub(r"\s+", " ", text)


# ---------------------------------------------------------------- A
pkg = json.loads(PKG.read_text(encoding="utf-8"))
titles = {
    f"{c.get('category', '')}: {c['title']}".strip(): c["command"]
    for c in pkg["contributes"]["commands"]
}
md_files = sorted(TUT.rglob("*.md"))
cmd_re = re.compile(r"Dabbler: ([A-Z][A-Za-z0-9 \-]*[A-Za-z0-9])")
seen_cmds = {}
for f in md_files:
    for m in cmd_re.finditer(norm(f.read_text(encoding="utf-8"))):
        seen_cmds.setdefault(f"Dabbler: {m.group(1)}", set()).add(
            str(f.relative_to(ROOT)).replace("\\", "/")
        )
for full, where in sorted(seen_cmds.items()):
    check(
        full in titles,
        "A",
        f"command title {full!r} -> {titles.get(full, 'NOT A CONTRIBUTED COMMAND')}"
        f"  [{', '.join(sorted(where))}]",
    )

# ---------------------------------------------------------------- B
tutorial = (TUT / "hello-world.md").read_text(encoding="utf-8")
scripts = {
    p.name: p.read_text(encoding="utf-8") for p in sorted(VIDEO.glob("*.md"))
}
tutorial_n = norm(tutorial)
scripts_n = {k: norm(v) for k, v in scripts.items()}
# (literal, script file that must carry it byte-identically)
SHARED = [
    ('copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6',
     "scene-1-install-and-verify.md"),
    ("winget install GitHub.Copilot", "scene-1-install-and-verify.md"),
    ("npm install -g @github/copilot", "scene-1-install-and-verify.md"),
    ("copilot --version", "scene-1-install-and-verify.md"),
    ("gh auth login", "scene-1-install-and-verify.md"),
    ("gh auth status", "scene-1-install-and-verify.md"),
    ("Dabbler: Set Up Copilot Seat", "scene-1-install-and-verify.md"),
    ("Git: Clone", "scene-2-create-and-clone.md"),
    ("hello-modules", "scene-2-create-and-clone.md"),
    ("Provider access (how routed calls run)", "scene-3-dabbler-setup.md"),
    ("GitHub Copilot CLI seat", "scene-3-dabbler-setup.md"),
    ("Build project structure", "scene-3-dabbler-setup.md"),
    ("New module (1/2): slug", "scene-3-dabbler-setup.md"),
    ("New module (2/2): display title", "scene-3-dabbler-setup.md"),
    ("Dabbler: New Module", "scene-3-dabbler-setup.md"),
    ("Dabbler: Delete Module", "scene-3-dabbler-setup.md"),
    ("docs/modules/default/", "scene-3-dabbler-setup.md"),
    ("003-greeter-plan", "scene-3-dabbler-setup.md"),
    ("004-greeter-decomposition", "scene-3-dabbler-setup.md"),
    ('git commit -m "chore: scaffold Dabbler and declare the greeter module"',
     "scene-3-dabbler-setup.md"),
    ("Require a pull request before merging", "scene-3-dabbler-setup.md"),
    ("git switch -c authoring/greeter-lifecycle", "scene-4-first-module.md"),
    ("Start the next session of `003-greeter-plan`.", "scene-4-first-module.md"),
    (".venv\\Scripts\\python.exe -m ai_router.worktree open 005-greeter-hello",
     "scene-4-first-module.md"),
    ("Dabbler: Open PR for this set", "scene-4-first-module.md"),
    ("Dabbler: Finalize merged set", "scene-4-first-module.md"),
    ("Require status checks to pass before merging", "scene-4-first-module.md"),
    ("python -m services.greeter.greeter", "scene-4-first-module.md"),
    ("Hello, world!", "scene-4-first-module.md"),
    ("Solo repositories can stop here.", "scene-4-first-module.md"),
    ("Dabbler: Install ai-router", "scene-5-second-module.md"),
    ("touches:", "scene-5-second-module.md"),
    ("/services/greeter/  @priya-gh", "scene-5-second-module.md"),
    ("/services/app/      @sam-gh @priya-gh", "scene-5-second-module.md"),
    ("git switch -c authoring/app-module", "scene-5-second-module.md"),
    ('git commit -m "docs: declare the app module and route reviews"',
     "scene-5-second-module.md"),
    ("git switch -c authoring/app-lifecycle", "scene-5-second-module.md"),
    ("condition: complete", "scene-5-second-module.md"),
    # Added by the round-1 remediation, so the fixes cannot silently re-open.
    ("Require approvals", "scene-3-dabbler-setup.md"),
    ("Require approvals", "scene-5-second-module.md"),
    ('echo "== $module"', "scene-4-first-module.md"),
    ("Automatically included reviewers", "scene-2-alt-azure-devops.md"),
    ("python -m services.app.app", "scene-6-pr-and-merge.md"),
    ("Hello, world! It is 14:32.", "scene-6-pr-and-merge.md"),
    (".venv\\Scripts\\python.exe -m ai_router.worktree list", "scene-6-pr-and-merge.md"),
    ("DABBLER_ANTHROPIC_API_KEY", "scene-1-alt-direct-api.md"),
    ("DABBLER_GEMINI_API_KEY", "scene-1-alt-direct-api.md"),
    ("DABBLER_OPENAI_API_KEY", "scene-1-alt-direct-api.md"),
    ("dev.azure.com", "scene-2-alt-azure-devops.md"),
]
for lit, script in SHARED:
    litn = norm(lit)
    in_tut = litn in tutorial_n
    in_scr = litn in scripts_n.get(script, "")
    check(in_tut and in_scr, "B",
          f"{lit!r}: tutorial={in_tut} {script}={in_scr}")

# The CI job block must be identical between the tutorial and scene 4 once
# the tutorial's list indentation is removed (it is nested in a numbered step).
def yaml_block(text):
    """Return the ```yaml fenced block containing `jobs:`, dedented."""
    for m in re.finditer(r"^([ \t]*)```yaml\r?\n(.*?)^\1```", text,
                         re.S | re.M):
        indent, body = m.group(1), m.group(2)
        lines = [
            ln[len(indent):] if ln.startswith(indent) else ln
            for ln in body.splitlines()
        ]
        block = "\n".join(lines).rstrip()
        if block.startswith("jobs:"):
            return block
    return None

tut_yaml = yaml_block(tutorial)
s4_yaml = yaml_block(scripts["scene-4-first-module.md"])
check(tut_yaml is not None, "B", "tutorial carries a `jobs:` YAML block")
check(s4_yaml is not None, "B", "scene 4 carries a `jobs:` YAML block")
check(tut_yaml is not None and tut_yaml == s4_yaml, "B",
      "CI job YAML block identical in hello-world.md and scene-4-first-module.md")

# The tutorial's CI block must be reachable from the SCAFFOLDED template by
# ADDING steps only — the job name and the placeholder step name must survive.
tmpl = (ROOT / "docs" / "templates" / "consumer-bootstrap"
        / "monorepo-ci.yml.template").read_text(encoding="utf-8")
for frag in ("jobs:\n  test:", "- uses: actions/checkout@v4",
             "- name: Build and test every module"):
    check(frag in tmpl and (tut_yaml is not None and frag in tut_yaml),
          "B", f"scaffolded template and tutorial agree on {frag!r}")
# ...and the template must already run on pull_request, so the tutorial's
# "it already runs on pull requests" claim is true of the shipped file.
check("pull_request" in tmpl, "B",
      "scaffolded template already triggers on pull_request")
check("if: github.event_name" not in tmpl, "B",
      "scaffolded template carries no push-only `if:` gate to delete")

# ---------------------------------------------------------------- C
link_re = re.compile(r"\[[^\]]*\]\(([^)#]+?)(?:#[^)]*)?\)")
for f in md_files:
    for m in link_re.finditer(f.read_text(encoding="utf-8")):
        target = m.group(1).strip()
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        resolved = (f.parent / target).resolve()
        check(resolved.exists(), "C",
              f"{str(f.relative_to(ROOT)).replace(chr(92), '/')} -> {target}")

# ---------------------------------------------------------------- report
by = {}
for ok, cid, msg in results:
    by.setdefault(cid, []).append((ok, msg))
failed = 0
for cid in sorted(by):
    rows = by[cid]
    bad = [m for ok, m in rows if not ok]
    failed += len(bad)
    print(f"[{cid}] {len(rows) - len(bad)}/{len(rows)} PASS")
    for m in bad:
        print(f"    FAIL {m}")
print(f"\nTOTAL: {len(results) - failed}/{len(results)} PASS")
sys.exit(1 if failed else 0)
