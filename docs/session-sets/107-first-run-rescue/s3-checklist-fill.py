"""Transcribe the operator's walk report into the committed checklist.

The operator walked the tutorial on a second machine (their GHE-linked Windows
account) and reported the outcome in conversation rather than filling the JSON
item by item. Every Result below is therefore ORCHESTRATOR-TRANSCRIBED, and each
one says so -- an attestation that hides how it was collected is worth less than
one that admits it.
"""
import json

import os
HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.environ.get(
    "CHECKLIST_PATH",
    os.path.join(HERE, "107-first-run-rescue-uat-checklist.json"))

TRANSCRIBED = (
    "[Transcribed by the orchestrator from the operator's report, 2026-07-31; "
    "not filled in during the walk itself.] "
)

RESULTS = {
    "The sample project, from one command": {
        "Result": TRANSCRIBED + (
            "PASS. The operator ran the walk on a second machine -- their "
            "GHE-linked Windows account -- with a fresh VS Code profile and the "
            "published 0.47.0 extension from the Marketplace. The command "
            "created the sample project and the tutorial's step 2 produced the "
            "failing test. No step-level output was captured; the operator "
            "reported the walk as passing end to end."
        ),
        "Feedback": (
            "No defect reported in this step. The operator did not report the "
            "creation failing, so the resume path was not exercised."
        ),
        "Passes": True,
    },
    "The AI session turns it green": {
        "Result": TRANSCRIBED + (
            "PASS. The pasted starter line drove a GitHub Copilot session that "
            "completed the task; the tests then passed and the program printed "
            "its two lines. The operator reported the tutorial as passing; no "
            "intervention or mid-session steering was reported."
        ),
        "Feedback": (
            "Agent: GitHub Copilot, chosen over Claude Code deliberately -- it "
            "is what the staff who abandoned the previous tutorial actually use, "
            "so it is the representative walk. This is the first session in the "
            "set to spend Copilot seat capacity."
        ),
        "Passes": True,
    },
    "How long it took": {
        "Result": TRANSCRIBED + (
            "UNDER 15 MINUTES, in-window (Ctrl+Shift+P to 'HELLO, WORLD!' on "
            "screen). THE CRITERION IS MET. This is the operator's estimate "
            "after the fact, NOT a stopwatch reading -- the walk was performed "
            "before the streamlined checklist existed, so the two clock marks "
            "were never written down. It is recorded as an estimate on purpose; "
            "a precise-looking number nobody measured would be worse evidence "
            "than an honest approximate one."
        ),
        "Feedback": (
            "THE REAL TIME COST WAS PREREQUISITE, NOT TUTORIAL, and it was "
            "large. In the operator's words the biggest time sink 'by far' was "
            "getting VS Code running while logged into GitHub Enterprise the "
            "right way: their organisation uses a special Windows account linked "
            "to a GHE account, and the working arrangement is a PowerShell "
            "script that launches VS Code under `runas` with a dedicated profile "
            "carrying GHE login settings. It works reliably but is not seamless "
            "-- THREE separate logins remain (the runas, the GHE sign-in, and "
            "the Copilot CLI).\n"
            "\n"
            "This is exactly the cost the spec excludes from the number so that "
            "environment setup is not mistaken for tutorial complexity, and "
            "excluding it is correct: the sample is hostless and needs no GHE at "
            "all -- the GHE login is what makes COPILOT work, not what makes "
            "Dabbler work. But it is a real finding about the honesty of the "
            "prerequisite line 'an AI coding agent you already use and are "
            "already signed in to': for an organisation like the operator's, "
            "'already signed in' is itself a project. Triaged as a follow-on "
            "set, not a tutorial change -- see s3-walk-evidence.md."
        ),
        "Passes": True,
    },
    "What you had to type": {
        "Result": TRANSCRIBED + (
            "Four no's, for the measured window only:\n"
            "  git command typed?             no\n"
            "  YAML edited?                   no\n"
            "  git host or remote configured? no\n"
            "  Dabbler setting changed?       no\n"
            "THE SECOND HALF OF THE CRITERION IS MET."
        ),
        "Feedback": (
            "One boundary worth stating plainly, because it would otherwise read "
            "as a contradiction against the Feedback on 'How long it took': the "
            "operator DID configure a git host on that machine -- GHE -- but "
            "BEFORE the measured window and for Copilot's benefit, not the "
            "tutorial's. The first run itself asked for none of it. The "
            "distinction is the whole reason the two halves are recorded "
            "separately."
        ),
        "Passes": True,
    },
}

data = json.load(open(PATH, encoding="utf-8"))
seen = set()
for item in data["Review"]:
    key = item["Subarea"]
    if key not in RESULTS:
        raise SystemExit(f"UNMATCHED CHECKLIST ITEM: {key}")
    item.update(RESULTS[key])
    seen.add(key)
missing = set(RESULTS) - seen
if missing:
    raise SystemExit(f"RESULTS WITH NO ITEM: {missing}")

# The Notes field is the WALKER'S INSTRUCTIONS and stays that way. Round 2 of
# verification caught an outcome summary appended here, which conflated the
# instrument with its own result; the per-item Result fields carry the outcome
# and s3-walk-evidence.md carries the narrative, so the summary was redundant as
# well as misplaced. Removed rather than reworded.

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"filled {len(seen)} items; passes:",
      [i["Passes"] for i in data["Review"]])
