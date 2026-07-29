"""S3 UAT-checklist floor gate.

The ad-hoc UAT floor (docs/ai-led-session-workflow.md -> "UAT Checklist Rule -
Ad-hoc") says the orchestrator validates, BEFORE the human is notified, that
every non-judgment functional item declares either ProgrammaticVerification or
NoProgrammaticPathReason. This runs that check, plus the shape and
authoring-bar checks this set's spec adds:

  D. Schema shape: the top-level keys and the per-item keys match the shipped
     exemplars (078 and 103), and every item is well-formed.
  E. The ad-hoc floor: ProgrammaticVerification XOR NoProgrammaticPathReason on
     every non-judgment item.
  F. The 078 authoring bar: a per-walk "Where you are" preamble, a
     checklist-level order map in Notes, literal command text in HumanAction,
     and an explicit intentional flag on every out-of-order or skipped walk.
"""
import json
import pathlib
import re
import sys

# repo root = <root>/docs/session-sets/<set>/<this file>
ROOT = pathlib.Path(__file__).resolve().parents[3]
SET = pathlib.Path(__file__).resolve().parent
CHECKLIST = SET / "106-hello-world-tutorial-simplification-uat-checklist.json"

results = []
def check(ok, cid, msg):
    results.append((bool(ok), cid, msg))

doc = json.loads(CHECKLIST.read_text(encoding="utf-8"))

# ------------------------------------------------------------------ D
for key in ("ProjectName", "ReleaseLabel", "DocumentDate", "Notes",
            "Configuration", "Review"):
    check(key in doc, "D", f"top-level key {key!r} present")
check(isinstance(doc.get("Review"), list) and len(doc["Review"]) > 0,
      "D", f"Review is a non-empty list ({len(doc.get('Review', []))} items)")
check(doc["Configuration"].get("reviewWidths") ==
      ["6%", "14%", "34%", "10%", "36%"],
      "D", "Configuration.reviewWidths matches the shipped exemplars")

REQUIRED_ITEM_KEYS = ("FunctionalArea", "Subarea", "ItemLabel", "HumanAction",
                      "Expectation", "Result", "Feedback", "Passes")
for i, it in enumerate(doc["Review"], 1):
    for key in REQUIRED_ITEM_KEYS:
        check(key in it, "D", f"item {i}: key {key!r} present")
    check(isinstance(it.get("Passes"), bool), "D",
          f"item {i}: Passes is a boolean")
    check(it.get("Result") == "" and it.get("Feedback") == "", "D",
          f"item {i}: Result/Feedback are empty (filled during the walk)")
    # Fail CLOSED. An item that claims to pass while carrying no Result is a
    # contradiction, and on an authored-not-yet-walked checklist it is the whole
    # acceptance artifact reading as green before anyone walked it.
    if not it.get("Result"):
        check(it.get("Passes") is False, "D",
              f"item {i}: Passes is False while Result is empty (not yet walked)")
    for key in it:
        check(key in REQUIRED_ITEM_KEYS or key in (
            "ProgrammaticVerification", "NoProgrammaticPathReason",
            "IsJudgmentItem", "Expectation_detail"), "D",
            f"item {i}: key {key!r} is a known checklist field")

# ------------------------------------------------------------------ E
for i, it in enumerate(doc["Review"], 1):
    judgment = bool(it.get("IsJudgmentItem"))
    has_prog = bool(it.get("ProgrammaticVerification", "").strip())
    has_noprog = bool(it.get("NoProgrammaticPathReason", "").strip())
    if judgment:
        check(True, "E", f"item {i}: judgment item, floor does not apply")
        continue
    check(has_prog != has_noprog, "E",
          f"item {i} ({it['Subarea'][:44]}...): exactly one of "
          f"ProgrammaticVerification / NoProgrammaticPathReason "
          f"(prog={has_prog}, noprog={has_noprog})")
    # A justification must be specific, not "no test possible".
    text = it.get("ProgrammaticVerification") or it.get("NoProgrammaticPathReason")
    check(len(text.split()) >= 12, "E",
          f"item {i}: justification is specific ({len(text.split())} words)")

# ------------------------------------------------------------------ F
for i, it in enumerate(doc["Review"], 1):
    check("Where you are:" in it["HumanAction"], "F",
          f"item {i}: carries a 'Where you are:' preamble")
    check(re.search(r"^\d+\.\s", it["HumanAction"], re.M) is not None, "F",
          f"item {i}: HumanAction is a numbered, followable step list")
    check(len(it["Expectation"].split()) >= 25, "F",
          f"item {i}: Expectation is a literal result, not a gesture "
          f"({len(it['Expectation'].split())} words)")

notes = doc["Notes"]
check("WALK ORDER MIRRORS THE TUTORIAL'S NATURAL ORDER" in notes, "F",
      "Notes carries the checklist-level order map")
for part in ("Walk 1 = Part 1", "Walk 2 = Part 2", "Walk 3 = Part 3",
             "Walk 4 = Part 4", "Walk 7 = Part 5", "Walk 9 = Part 6"):
    check(part in notes, "F", f"order map names {part!r}")
check("NOT YET WALKED" in notes, "F",
      "Notes states the checklist is authored-not-yet-walked")
check("PRECONDITIONS" in notes and "STOP AND RESCHEDULE" in notes, "F",
      "Notes names the operator preconditions and the stop-rather-than-degrade rule")

# Every walk that is out of tutorial order must SAY it is intentional, in the
# item itself as well as in the order map.
ooo = [i for i, it in enumerate(doc["Review"], 1)
       if "OUT OF" in it["Subarea"].upper()]
check(len(ooo) == 2, "F",
      f"exactly the two alternate-take walks are flagged out-of-order "
      f"(items {ooo})")
for i in ooo:
    it = doc["Review"][i - 1]
    check("INTENTIONALLY" in it["Subarea"].upper()
          and "INTENTIONALLY" in it["HumanAction"].upper(), "F",
          f"item {i}: flagged intentional in BOTH Subarea and HumanAction")
check("DELIBERATELY NOT EXECUTED" in notes.upper()
      or any("DELIBERATELY NOT EXECUTED" in it["Subarea"].upper()
             for it in doc["Review"]), "F",
      "the deliberately-not-executed walk is named as such")

# Literal command fidelity: commands quoted in the checklist must be the same
# ones the tutorial ships.
tutorial = (ROOT / "docs" / "tutorials" / "hello-world.md").read_text(
    encoding="utf-8")
def norm(t):
    return re.sub(r"\s+", " ", re.sub(r"(?m)^\s*>\s?", " ", t))
tut_n = norm(tutorial)
blob_n = norm(json.dumps(doc))
for lit in ('copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6',
            "winget install GitHub.Copilot",
            "python -m services.greeter.greeter",
            "python -m services.app.app",
            "Dabbler: Open PR for this set",
            "Dabbler: Finalize merged set",
            "Dabbler: New Module",
            "Dabbler: Delete Module",
            "Dabbler: Install ai-router",
            "New module (1/2): slug",
            "Solo repositories can stop here.",
            "Hello, world! It is 14:32."):
    litn = norm(lit)
    # json.dumps escapes backslashes and quotes; compare on the escaped form.
    esc = norm(json.dumps(lit)[1:-1])
    check(litn in tut_n and (litn in blob_n or esc in blob_n), "F",
          f"checklist quotes the tutorial's literal {lit!r}")

# ------------------------------------------------------------------ report
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
