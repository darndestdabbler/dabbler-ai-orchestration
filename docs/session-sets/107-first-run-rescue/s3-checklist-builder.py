"""Build the Set 107 UAT checklist with every product literal BOUND to shipped
source, never hand-typed -- the discipline S2 applied to the tutorial, applied to
the instrument that measures it.

SIZED BY THE OPERATOR, 2026-07-30. The first build of this file produced nine
items with a tutorial-quality interrogation attached to each one, and the
operator's verdict was that it was "daunting and tedious" -- that UAT should
confirm the most important things and leave the human free to volunteer what
annoyed them, rather than carry a dedicated item for every cosmetic detail. That
is right, and the failure was one of altitude: this set's acceptance criterion
asks exactly two questions -- how long did it take, and did the reader have to
touch git/YAML/hosts/settings -- plus the obvious "did the loop work at all".
Four items answer all three. The literal binding stays, because it costs the
human nothing and it is the part that keeps the checklist honest.
"""
import json
import os
import re
from datetime import datetime

# Repo-relative, resolved from this file's own location: the script lives at
# docs/session-sets/107-first-run-rescue/, so the repo root is three levels up.
# (Round 1 of verification found this hardcoded to one machine's absolute path,
# which made the one artifact whose whole job is to be re-runnable
# un-re-runnable by anybody else.)
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TS = os.path.join(REPO, "tools", "dabbler-ai-orchestration", "src", "utils",
                  "sampleProject.ts")
BUNDLE = os.path.join(REPO, "docs", "templates", "sample-project",
                      "bundle.json")
TUTORIAL_PATH = os.path.join(REPO, "docs", "tutorials", "hello-world.md")
OUT = os.path.join(HERE, "107-first-run-rescue-uat-checklist.json")

src = open(TS, encoding="utf-8").read()
bundle = json.load(open(BUNDLE, encoding="utf-8"))


def const(name):
    """Pull a shipped string constant, joining TS '+' concatenation."""
    m = re.search(rf'export const {name} =\s*(.+?);', src, re.S)
    if not m:
        raise SystemExit(f"BOUND LITERAL MISSING: {name}")
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))
    if not parts:
        raise SystemExit(f"BOUND LITERAL UNPARSED: {name}")
    return "".join(p.encode().decode("unicode_escape") for p in parts)


def success_message():
    m = re.search(r'export function describeSuccess\(\): string \{(.+?)\n\}',
                  src, re.S)
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))
    return "".join(parts)


PICKER_TITLE = const("SAMPLE_PICKER_TITLE")
PICKER_LABEL = const("SAMPLE_PICKER_LABEL")
NEXT_STEP_ACTION = const("SUCCESS_NEXT_STEP_ACTION")
COPIED = const("STARTER_LINE_COPIED")
SUCCESS = success_message()
SLUG = bundle["sampleSetSlug"]
STARTER = f"Start the next session of `{SLUG}`."
NTESTS = bundle["expectedTestCount"]
PROGRAM = bundle["programEntryPoint"]
OUTPUT = bundle["expectedProgramOutput"]
TESTARGS = " ".join(bundle["testCommandArgs"])

WIN_TEST = f".venv\\Scripts\\python.exe {TESTARGS}"
NIX_TEST = f".venv/bin/python {TESTARGS}"
WIN_RUN = f".venv\\Scripts\\python.exe {PROGRAM}"
NIX_RUN = f".venv/bin/python {PROGRAM}"

# Every literal above must also appear in the tutorial the walk executes. The
# committed gate enforces that direction; this catches the other one -- a
# checklist quoting a string the reader will never be shown. Compared on
# collapsed whitespace because the product's strings are reflowed across lines
# in the document (the false-negative S2's gate hit on the Full-tier sentence).
tutorial_raw = open(TUTORIAL_PATH, encoding="utf-8").read()
tutorial = re.sub(r"\s+", " ", re.sub(r"(?m)^\s*>\s?", "", tutorial_raw))
for label, literal in [
    ("picker title", PICKER_TITLE), ("picker label", PICKER_LABEL),
    ("copy action", NEXT_STEP_ACTION), ("copied status", COPIED),
    ("success toast", SUCCESS), ("starter line", STARTER),
    ("windows test cmd", WIN_TEST), ("posix test cmd", NIX_TEST),
    ("windows run cmd", WIN_RUN), ("posix run cmd", NIX_RUN),
]:
    if re.sub(r"\s+", " ", literal) not in tutorial:
        raise SystemExit(f"CHECKLIST/TUTORIAL DRIFT on {label}: {literal!r}")
for line in OUTPUT:
    if line not in tutorial:
        raise SystemExit(f"CHECKLIST/TUTORIAL DRIFT on output line: {line!r}")

NOTES = f"""This is the acceptance test for Set 107: does the new 15-minute first run actually take 15 minutes, and can someone get through it without touching git? Four items, because the criterion asks two questions and "did the loop work at all" is the third.

Walk docs/tutorials/hello-world.md exactly as written, on a clean VS Code profile with the published extension and the AI agent you already use.

THE CLOCK. Note the time when you press Ctrl+Shift+P to start, and again when "{OUTPUT[-1]}" appears at the end. That difference is the number this whole set is measured by. Extension install time is not part of it.

THE NUMBER IS THE DELIVERABLE, NOT THE PASS. A walk that takes 40 minutes and says so is worth more than one that reports success. Nothing downstream needs the answer to be 15.

Passes: false means NOT YET WALKED, not "failed".

You do not need to grade the tutorial. If something annoyed you, confused you, or made you re-read a line, put it in that item's Feedback and I will pick it up -- including "the wait felt broken" or "this looked wrong". If nothing did, leave it empty.

ONE RULE: don't type a git command between the start and the end, even out of curiosity. Half the criterion is whether the reader had to, and one "git status" makes it unanswerable. If you wanted to, say so instead."""

REVIEW = [
    {
        "FunctionalArea": "Steps 1-2",
        "Subarea": "The sample project, from one command",
        "ItemLabel": "One Command Palette entry produces a working project, "
                     "with the starter line on the clipboard",
        "HumanAction": (
            "Where you are: a clean VS Code profile with the published Dabbler "
            "extension installed and your AI agent signed in. No folder open.\n"
            "\n"
            "1. Note the time. Press Ctrl+Shift+P (Cmd+Shift+P on a Mac) and run "
            "Dabbler: Try a sample project\n"
            "2. Pick an empty folder in the dialog.\n"
            "3. Wait for it to finish, then click the button on the notification "
            "that appears.\n"
            "4. Open a terminal (Terminal > New Terminal) and run:\n"
            f"     Windows:      {WIN_TEST}\n"
            f"     macOS/Linux:  {NIX_TEST}"
        ),
        "Expectation": (
            f"The dialog is titled '{PICKER_TITLE}' and its button reads "
            f"'{PICKER_LABEL}'. VS Code opens your folder (the same window "
            "reloads), then a notification reads:\n"
            f"  {SUCCESS}\n"
            f"Its button reads '{NEXT_STEP_ACTION}', and clicking it puts a "
            "confirmation in the status bar.\n"
            "\n"
            f"The test run ends with 'Ran {NTESTS} tests' and then:\n"
            "  FAILED (errors=1)\n"
            "(The timing figure in that line will not match the tutorial's "
            "exactly. That is fine.)"
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - the happy path (steps 2-5) > "
            "renders, inits, marks local-only, installs, and retires the resume "
            "marker' and 'smoke > the sample starts RED, with an error that "
            "points at the task'. Quoted strings bound from "
            "src/utils/sampleProject.ts by s3-checklist-builder.py."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Steps 3-4",
        "Subarea": "The AI session turns it green",
        "ItemLabel": "One pasted line drives a session that writes the code, "
                     "and the program prints the new output",
        "HumanAction": (
            "Where you are: the tests just failed, the starter line is on your "
            "clipboard.\n"
            "\n"
            "1. Open your AI agent's chat and paste it. It should read:\n"
            f"     {STARTER}\n"
            "2. Send it and wait. Don't steer it.\n"
            "3. When it finishes, run the tests again, then run the program:\n"
            f"     Windows:      {WIN_RUN}\n"
            f"     macOS/Linux:  {NIX_RUN}"
        ),
        "Expectation": (
            "The session ends with:\n  close_session: succeeded\n"
            "(A warning that no second AI reviewed the work is expected here, "
            "not an error.)\n"
            "\n"
            "The tests then pass with 'OK', and the program prints:\n  "
            + "\n  ".join(OUTPUT)
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - smoke > the Lightweight lifecycle "
            "registers the session', '> the change turns it GREEN and the program "
            "prints the contracted lines', and '> close_session closes cleanly on "
            "the local-only repo'."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "The criterion",
        "Subarea": "How long it took",
        "ItemLabel": "The 15-minute claim is answered with a number",
        "HumanAction": (
            "From the two times you noted -- Ctrl+Shift+P at the start, "
            f"'{OUTPUT[-1]}' on screen at the end -- record the elapsed time in "
            "Result.\n"
            "\n"
            "If you can, also note two things: roughly how much of it was waiting "
            "on your AI agent, and roughly how long the extension install took "
            "(that one is excluded from the number)."
        ),
        "Expectation": (
            "There is no expected value. Record what it was.\n"
            "\n"
            "At or under 15:00 meets the criterion. Over it is an equally valid "
            "result -- if so, say in Feedback where the time actually went."
        ),
        "NoProgrammaticPathReason": (
            "How long a person takes to follow a document cannot be measured by "
            "a test suite; it is the reason this set declares requiresUAT."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "The criterion",
        "Subarea": "What you had to type",
        "ItemLabel": "The first run needed no git, no YAML, no host setup and "
                     "no Dabbler settings",
        "HumanAction": (
            "Looking at what you actually typed -- not what you remember the "
            "document saying -- answer four questions in Result:\n"
            "\n"
            "  Did you type a git command?              yes / no\n"
            "  Did you edit a YAML file?                yes / no\n"
            "  Did you configure a git host or remote?  yes / no\n"
            "  Did you change a Dabbler setting?        yes / no"
        ),
        "Expectation": (
            "All four should be 'no'. Any 'yes' is a real finding -- quote the "
            "command or file and say what sent you there."
        ),
        "ProgrammaticVerification": (
            "ai_router/scripts/tutorial_gate.py (in CI) asserts the DOCUMENT "
            "contains no git command, no YAML block, no host configuration and no "
            "governance setting; only the walk can establish what the READER "
            "actually typed."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
]

checklist = {
    "ProjectName": "Dabbler AI Orchestration",
    "ReleaseLabel": (
        "Extension 0.47.0 (published) -- Set 107 'First-Run Rescue', Session 3 "
        "of 3: the stopwatch walk of docs/tutorials/hello-world.md"
    ),
    "DocumentDate": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
    "Notes": NOTES,
    "Configuration": {"reviewWidths": ["6%", "14%", "34%", "10%", "36%"]},
    "Review": REVIEW,
}

# The ad-hoc UAT floor: every non-judgment functional item declares either a
# ProgrammaticVerification reference or a NoProgrammaticPathReason.
for item in REVIEW:
    if item.get("IsJudgmentItem"):
        continue
    if not (item.get("ProgrammaticVerification")
            or item.get("NoProgrammaticPathReason")):
        raise SystemExit(f"AD-HOC UAT FLOOR VIOLATED: {item['Subarea']}")
    if item["Passes"] is not False or item["Result"] or item["Feedback"]:
        raise SystemExit(f"NOT-YET-WALKED INVARIANT VIOLATED: {item['Subarea']}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(checklist, f, indent=2, ensure_ascii=False)
    f.write("\n")

human_chars = sum(len(i["HumanAction"]) + len(i["Expectation"]) for i in REVIEW)
print("BOUND FROM SHIPPED SOURCE:")
for k, v in [("picker title", PICKER_TITLE), ("picker label", PICKER_LABEL),
             ("success", SUCCESS), ("action", NEXT_STEP_ACTION),
             ("copied", COPIED), ("starter", STARTER),
             ("outputs", " / ".join(OUTPUT))]:
    print(f"  {k:14} {v}")
print(f"\nitems: {len(REVIEW)}   human-facing text: {human_chars:,} chars")
print(f"-> {OUT}")
