"""Build the Set 107 UAT checklist with every product literal BOUND to shipped
source, never hand-typed. Same discipline S2 applied to the tutorial itself:
the prose is authored (routed), the literals are substituted from the code.
"""
import json
import re
from datetime import datetime

REPO = "d:/Projects/dabbler-ai-orchestration"
TS = f"{REPO}/tools/dabbler-ai-orchestration/src/utils/sampleProject.ts"
BUNDLE = f"{REPO}/docs/templates/sample-project/bundle.json"
OUT = (f"{REPO}/docs/session-sets/107-first-run-rescue/"
       "107-first-run-rescue-uat-checklist.json")

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


def progress(step):
    """Pull a stage label from the SAMPLE_PROGRESS map SPECIFICALLY.

    An unscoped search matched SAMPLE_STEP_PHRASE instead -- same keys,
    different strings (it supplies fragments of the resume sentence) -- and
    silently produced a checklist quoting labels the reader will never see.
    That is the coincidence-satisfies-the-check class Set 107 S1 and S2 both
    caught in their own gates; scope the search to the right block.
    """
    block = re.search(
        r'export const SAMPLE_PROGRESS[^=]*=\s*\{(.+?)\n\};', src, re.S)
    if not block:
        raise SystemExit("BOUND PROGRESS MAP MISSING")
    m = re.search(rf'\b{step}: "([^"]+)"', block.group(1))
    if not m:
        raise SystemExit(f"BOUND PROGRESS STAGE MISSING: {step}")
    return m.group(1)


def progress_title():
    """The withProgress notification title, from the command module."""
    cmd = open(f"{REPO}/tools/dabbler-ai-orchestration/src/commands/"
               "trySampleProject.ts", encoding="utf-8").read()
    m = re.search(r'location: vscode\.ProgressLocation\.Notification,\s*'
                  r'title: "([^"]+)"', cmd)
    if not m:
        raise SystemExit("BOUND PROGRESS TITLE MISSING")
    return m.group(1)


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
STAGES = [progress(s) for s in ("render", "git", "marker", "install", "open")]
PROGRESS_TITLE = progress_title()
SLUG = bundle["sampleSetSlug"]
STARTER = f"Start the next session of `{SLUG}`."
NTESTS = bundle["expectedTestCount"]
PROGRAM = bundle["programEntryPoint"]
OUTPUT = bundle["expectedProgramOutput"]
MISSING_FN = bundle["missingFunction"]
TESTARGS = " ".join(bundle["testCommandArgs"])

WIN_TEST = f".venv\\Scripts\\python.exe {TESTARGS}"
NIX_TEST = f".venv/bin/python {TESTARGS}"
WIN_RUN = f".venv\\Scripts\\python.exe {PROGRAM}"
NIX_RUN = f".venv/bin/python {PROGRAM}"

# Every literal above must also appear in the tutorial the walk executes; the
# committed gate (ai_router/scripts/tutorial_gate.py) already enforces that
# direction. This assertion catches the other one: a checklist that quotes a
# string the reader will never be shown.
tutorial_raw = open(f"{REPO}/docs/tutorials/hello-world.md",
                    encoding="utf-8").read()
# Normalise the way the tutorial gate does: a quoted product string is reflowed
# across lines and may carry blockquote markers, so compare on collapsed
# whitespace rather than on the raw bytes (the same false-negative class Set 107
# S2's gate hit on the Full-tier sentence).
tutorial = re.sub(r"\s+", " ", re.sub(r"(?m)^\s*>\s?", "", tutorial_raw))
for label, literal in [
    ("picker title", PICKER_TITLE), ("picker label", PICKER_LABEL),
    ("copy action", NEXT_STEP_ACTION), ("copied status", COPIED),
    ("success toast", SUCCESS), ("starter line", STARTER),
    ("progress title", PROGRESS_TITLE),
    ("windows test cmd", WIN_TEST), ("posix test cmd", NIX_TEST),
    ("windows run cmd", WIN_RUN), ("posix run cmd", NIX_RUN),
]:
    if re.sub(r"\s+", " ", literal) not in tutorial:
        raise SystemExit(f"CHECKLIST/TUTORIAL DRIFT on {label}: {literal!r}")
for line in OUTPUT:
    if line not in tutorial:
        raise SystemExit(f"CHECKLIST/TUTORIAL DRIFT on output line: {line!r}")

NOTES = f"""AUTHORED IN SESSION 3, NOT YET WALKED. This checklist IS the acceptance test for Set 107. The set exists because staff called the previous tutorial "way too complicated" and some abandoned it; the replacement claims a 15-minute first run, and the only way to know whether a 15-minute first run takes 15 minutes is for a person to hold a clock. Nobody has walked docs/tutorials/hello-world.md end to end on a clean machine. You are the first.

THE NUMBER IS THE DELIVERABLE, NOT THE PASS. A walk that takes 40 minutes and says so is worth more to this project than one that reports success. Report what happened. Nothing downstream depends on the answer being 15.

PASSES STARTS FALSE ON EVERY ITEM, AND THAT IS NOT A CLAIM OF FAILURE. False here means NOT YET WALKED. Flip an item to true at the moment you record its Result.

THE TIMING PROTOCOL. You do not start and stop a stopwatch -- that is fiddly and it disturbs the thing being measured. You write down the wall-clock time (HH:MM:SS) at six marks, and the durations are worked out afterwards. Each mark is named again, in place, in the item where it falls:

  P0  you begin creating the new VS Code profile
  P1  your own AI coding agent is installed in that profile and signed in
  T0  you click Install on the Dabbler AI Orchestration extension page
  T1  the Dabbler extension has finished installing
  T2  you press Ctrl+Shift+P to run the create command      <-- THE MEASURED WINDOW OPENS
  T3  you send the pasted starter line to your AI agent
  T4  your agent's session finishes ("close_session: succeeded" appears)
  T5  "{OUTPUT[-1]}" is on your screen from the final run   <-- THE MEASURED WINDOW CLOSES

Four durations come out of that:
  Prerequisite setup = P1 - P0. Reported, and EXCLUDED from the 15 minutes. It is the cost of walking on a deliberately clean profile, which a real first-time reader does not pay -- they already have their agent.
  Install time = T1 - T0. Reported, and EXCLUDED. The spec excludes it so that a slow package index is not mistaken for tutorial complexity.
  INTERACTION TIME = T5 - T2. This is the headline number, the one the 15-minute criterion is about.
  Agent time = T4 - T3. Reported as a part OF the interaction time, never subtracted from it. A developer who waits six minutes for their agent waited six minutes -- but whoever reads this result must be able to see how much of the total was somebody else's model rather than this product.

If you are interrupted mid-walk, write down the clock time when you stop and when you resume, and say so in that item's Feedback. An honest interruption is recoverable; a guessed number is not.

WHAT AUTOMATION HAS ALREADY SETTLED, so you do not have to. A committed gate (ai_router/scripts/tutorial_gate.py, in CI) binds every command, path, message and output string quoted in the tutorial to the shipped extension code and to docs/templates/sample-project/bundle.json, so the tutorial cannot quote a string the product does not say. A Layer-2 smoke test renders the sample, runs the Lightweight lifecycle end to end, and asserts the program's exact output. The pytest suite and the Playwright rendering suite are green. The literals in THIS checklist were pulled from the same shipped source, not typed by hand.

WHAT NONE OF THAT CAN TELL US, and why you are walking. Whether a stranger can FOLLOW the document. Whether a wait is long enough to look broken. Whether step N assumes something step N-1 never established. And how long it really takes. Those are the findings; the pass/fail is secondary.

RECORD HESITATION EVEN ON A PASS. If you had to re-read a sentence, guess at what was meant, or look outside the document, that item's Feedback must say so even though the step worked. A step that works only if you guess right is broken for the next reader, and you are the only instrument that can detect it.

DO NOT REPAIR THE DOCUMENT AS YOU GO. If a step is wrong, record what it says, what you did instead, and move on. Improving it silently destroys the evidence.

DEFECTS ARE TRIAGED, NOT FIXED BY YOU. A defect in the tutorial's wording or ordering, or in the "Dabbler: Try a sample project" command itself, is fixed in this session. Anything else -- another extension surface, the router, VS Code, your agent -- is recorded and named for a follow-on set. You record; the orchestrator triages.

ONE THING YOU MUST NOT DO: do not type a git command at any point between T2 and T5, even to satisfy your own curiosity about what the sample is doing. The criterion this walk answers is partly "did the reader have to touch git", and a single "git status" typed out of interest makes that question unanswerable. If you WANT to type one, that wanting is itself a finding -- write it in Feedback instead of typing it."""

REVIEW = [
    {
        "FunctionalArea": "Before the clock - the walk machine",
        "Subarea": "Walk 1 - a genuinely clean profile with your own agent in it",
        "ItemLabel": ("The walk starts from a clean VS Code profile with no "
                      "Dabbler extension, no inherited virtual environment, "
                      "and your own AI agent signed in"),
        "HumanAction": (
            "Where you are: your normal machine, before anything has been set up "
            "for this walk. Nothing on this item is part of the tutorial, and "
            "none of it is inside the measured window -- this is the walk's own "
            "setup, and it exists because the spec requires the measurement to "
            "happen on a clean profile and a released extension rather than on "
            "the machine that built them.\n"
            "\n"
            "1. WRITE DOWN THE TIME NOW as P0.\n"
            "2. Close every open VS Code window.\n"
            "3. Create and open a new, empty VS Code profile. Either run this in "
            "a terminal:\n"
            "   code --profile hello-world-walk\n"
            "   or use the gear icon at the bottom of the Activity Bar > "
            "Profiles > New Profile, name it hello-world-walk, and switch to it.\n"
            "4. In that new window, open the Extensions view (Ctrl+Shift+X, or "
            "Cmd+Shift+X on a Mac) and search for: Dabbler AI Orchestration\n"
            "   Confirm the button on it reads Install, NOT Uninstall.\n"
            "5. Install the AI coding agent you intend to use (Copilot, Claude "
            "Code, Codex, Gemini Code Assist) into THIS profile, and open its "
            "chat once to confirm it is signed in and answers you. A new profile "
            "does not carry extensions across, so this step is real work even "
            "though your machine already has the agent.\n"
            "6. Decide where the sample will go and write the folder path in "
            "Result. It MUST NOT be inside d:\\Projects\\dabbler-ai-orchestration "
            "or any checkout of it.\n"
            "7. In a terminal, confirm your prompt does NOT show a (.venv) or "
            "(base) prefix -- no virtual environment may be active. If one is, "
            "open a fresh terminal.\n"
            "8. WRITE DOWN THE TIME NOW as P1, and record P1 - P0 in Result as "
            "the prerequisite setup time."
        ),
        "Expectation": (
            "The Dabbler extension shows an Install button (it is not already "
            "present in this profile). Your AI agent's chat opens in this profile "
            "and responds to a message, without asking you to sign in again. The "
            "folder you chose for the sample is outside every checkout of this "
            "repository, and no virtual environment is active in your terminal.\n"
            "\n"
            "RECORD IN RESULT: the P0 and P1 clock times, the prerequisite setup "
            "duration, which AI agent you are using, and the sample folder path.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: none for this item -- the tutorial does not "
            "ask a reader to do any of this. It is here so the measurement is "
            "honest about what a clean profile costs. If setting up the agent in "
            "a fresh profile was itself awkward, note it: it is not a tutorial "
            "defect, but it tells us what a reader on a new machine faces."
        ),
        "NoProgrammaticPathReason": (
            "Creating a VS Code profile and confirming a third-party AI agent "
            "extension is signed in cannot be driven from this repository's test "
            "harness; it is the precondition the acceptance test is measured on."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Before you start",
        "Subarea": "Walk 2 - the prerequisites are true, and you can tell",
        "ItemLabel": ("A reader can tell from the tutorial alone whether their "
                      "machine is ready, before the clock starts"),
        "HumanAction": (
            "Where you are: the clean profile from Walk 1, your agent installed "
            "and signed in, Dabbler NOT yet installed, nothing else done.\n"
            "\n"
            "1. Open docs/tutorials/hello-world.md and read ONLY the title and "
            "the section 'Before you start', down to the line that ends "
            "'...working internet access for that minute.' Stop there.\n"
            "2. Without typing any command, decide for each of the five "
            "prerequisites whether your machine satisfies it, and write the five "
            "answers in Result.\n"
            "3. Do NOT type 'git --version' or any other git command. If you "
            "wanted to, say so in Feedback -- that is the finding."
        ),
        "Expectation": (
            "You can answer all five without leaving the document or running "
            "anything. Prerequisite 3 is the one under suspicion: it names Git, "
            "says you will not type a single Git command, and links "
            "git-scm.com/downloads -- but it does not tell you how to find out "
            "whether you already have Git. Session 2's verification found Git "
            "missing from this list entirely and added it; whether the added "
            "wording is now SUFFICIENT is a question only a reader can answer.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK, and it is the whole point of this item: for "
            "each of the five, did you know? Which one, if any, would have sent "
            "you to a search engine or a terminal? Does the sentence about "
            "needing an AI agent you are 'already signed in to' square with the "
            "later sentence that you 'do not need any additional account'? Answer "
            "even where the answer is 'that was fine'."
        ),
        "NoProgrammaticPathReason": (
            "Whether a prerequisite list is sufficient for a reader to "
            "self-assess is a comprehension judgment; the gate can only check "
            "that the list's literals match the product."
        ),
        "IsJudgmentItem": True,
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Before the clock - the released build",
        "Subarea": "Walk 3 - install the published extension",
        "ItemLabel": ("The extension a real developer would install is the one "
                      "under test"),
        "HumanAction": (
            "Where you are: the clean profile, Extensions view open, Dabbler AI "
            "Orchestration found in the Marketplace and not installed.\n"
            "\n"
            "1. Open the Dabbler AI Orchestration extension page and READ THE "
            "VERSION NUMBER on it. Write it in Result.\n"
            "2. WRITE DOWN THE TIME NOW as T0, then click Install.\n"
            "3. When the button changes to Uninstall and the Dabbler icon "
            "appears in the Activity Bar down the left-hand side, WRITE DOWN THE "
            "TIME NOW as T1.\n"
            "4. Record T1 - T0 in Result as the install time.\n"
            "5. Do NOT open the Work Explorer or click anything Dabbler yet -- "
            "the tutorial does not, and exploring first would make the measured "
            "window meaningless."
        ),
        "Expectation": (
            "The version reads 0.47.0 OR NEWER. IF IT READS 0.46.0 OR LOWER, STOP "
            "THE WALK and say so -- the published build predates the command this "
            "tutorial is about, and every later item would be measuring the wrong "
            "product. The page's publisher is DarndestDabbler. After installing, "
            "the button reads Uninstall and a new icon appears in the Activity "
            "Bar.\n"
            "\n"
            "RECORD IN RESULT: the exact version string, T0, T1, and the install "
            "duration.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: the tutorial's prerequisite 4 says only "
            "'The Dabbler AI Orchestration extension, from the VS Code "
            "Marketplace.' Was that enough to find and install the right one, or "
            "did you have to disambiguate between search results?"
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - the user-facing strings' asserts "
            "every string this walk will see is ASCII-only and jargon-free; the "
            "published 0.47.0 tree was diffed against HEAD by the orchestrator "
            "and differs only in two consumer-bootstrap templates that this walk "
            "never touches."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Step 1 - create the sample project",
        "Subarea": "Walk 4 - one command, and a project exists",
        "ItemLabel": ("One Command Palette entry produces an opened, working "
                      "project and a starter line on the clipboard"),
        "HumanAction": (
            "Where you are: the clean profile with Dabbler 0.47.0 or newer "
            "installed, no folder open, nothing Dabbler clicked yet. From here "
            "you follow the tutorial EXACTLY as written and do nothing it does "
            "not tell you to do.\n"
            "\n"
            "1. WRITE DOWN THE TIME NOW as T2 -- THE MEASURED WINDOW OPENS -- and "
            "in the same motion press Ctrl+Shift+P (Cmd+Shift+P on a Mac).\n"
            "2. Type and run:\n"
            f"   {'Dabbler: Try a sample project'}\n"
            "3. In the dialog, make or pick the empty folder you chose in Walk 1, "
            "and click the button in its bottom-right corner.\n"
            "4. Watch the notification without clicking anything else.\n"
            "5. When the finished notification appears, click its button.\n"
            "6. Look at the status bar along the very bottom of the window."
        ),
        "Expectation": (
            f"Step 3's dialog is titled exactly:\n  {PICKER_TITLE}\n"
            f"and its button reads exactly:\n  {PICKER_LABEL}\n"
            "\n"
            f"Step 4 shows a progress notification headed '{PROGRESS_TITLE}' "
            "which moves through these stages, in this order:\n  "
            + "\n  ".join(STAGES) + "\n"
            "The tutorial says it takes about a minute, almost all of it the "
            "package install. TIME IT ROUGHLY and say in Feedback whether 'about "
            "a minute' was true, and whether any single stage sat still long "
            "enough that you wondered if it had hung.\n"
            "\n"
            "VS Code then opens the new folder -- the window reloads and your "
            "folder's files appear in the Explorer on the left. This is a reload "
            "of the same window, not a second window.\n"
            "\n"
            f"A notification then reads exactly:\n  {SUCCESS}\n"
            f"Its button reads exactly:\n  {NEXT_STEP_ACTION}\n"
            f"After clicking it, the status bar reads exactly:\n  {COPIED}\n"
            "That status-bar line clears itself after about five seconds. If you "
            "missed it, say so -- the tutorial presents it as confirmation, and "
            "confirmation you cannot catch is not confirmation.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: the tutorial says 'Make or pick a folder "
            "with nothing in it'. Was the dialog's own wording enough to get that "
            "right first time? Did the window reloading around you read as normal, "
            "or as something going wrong? Record any hesitation even though the "
            "step passed."
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - the happy path (steps 2-5) > "
            "renders, inits, marks local-only, installs, and retires the resume "
            "marker'; the dialog title, button label, success message, action "
            "label and status line quoted above were extracted from "
            "src/utils/sampleProject.ts by the checklist builder, and "
            "ai_router/scripts/tutorial_gate.py binds the same strings to the "
            "tutorial."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Step 1 - create the sample project",
        "Subarea": "Walk 5 - (only if creation failed) the recovery path",
        "ItemLabel": ("A failed package install leaves a recoverable project and "
                      "says so in words the reader can act on"),
        "HumanAction": (
            "Where you are: immediately after Walk 4. DO NOT PERFORM THIS ITEM "
            "DELIBERATELY -- do not disconnect your network to force it.\n"
            "\n"
            "IF Walk 4 failed (most likely the Python package install, behind a "
            "corporate network or VPN):\n"
            "1. Copy the failure notification's text into Result, verbatim.\n"
            "2. Click Show Log if the notification offers it, and copy the "
            "commands it lists into Result.\n"
            "3. Read the tutorial's final section, 'If the project did not finish "
            "creating', and do what it says: run Dabbler: Try a sample project "
            "again and pick the SAME folder.\n"
            "4. Record whether the second attempt finished, and keep the clock "
            "running -- the recovery time is part of the interaction time, "
            "because a reader who hits this pays it.\n"
            "\n"
            "IF Walk 4 succeeded: write 'not triggered' in Result, then answer "
            "the judgment question below by reading that section only."
        ),
        "Expectation": (
            "If triggered: the failure text names the folder, says plainly that "
            "the project was created and nothing was lost, names only the install "
            "as having failed, and tells you to re-run the same command on the "
            "same folder. It must NOT show a Python traceback. Re-running must "
            "offer to resume rather than refuse the folder for being non-empty.\n"
            "\n"
            "If not triggered: read 'If the project did not finish creating' and "
            "answer -- would that paragraph have been enough for you, on a day "
            "when it had just happened? It is the one step that fails in the real "
            "world, and it is the last section in the document.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: is the recovery section in the right place? "
            "It currently sits AFTER the success path, which means a reader who "
            "is stuck at step 1 has to scroll past three steps they have not done "
            "to find it."
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - a failed install is resumable, not "
            "a dead end (v3 12.3) > re-running on the same folder retries ONLY "
            "the install and succeeds', plus 'the install failure message > "
            "reassures first, names only what failed, and points at the resume' "
            "and '> never surfaces a traceback'."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Step 2 - see the failing test",
        "Subarea": "Walk 6 - the red state",
        "ItemLabel": "The reader sees a real failing test before any AI is involved",
        "HumanAction": (
            "Where you are: the sample project is open in VS Code, the starter "
            "line is on your clipboard, nothing has been run.\n"
            "\n"
            "1. Read the tutorial's step 2, including its description of what the "
            "project contains.\n"
            "2. Open a terminal: Terminal > New Terminal.\n"
            "3. Run the line for your platform, exactly as the tutorial gives it:\n"
            f"   Windows:      {WIN_TEST}\n"
            f"   macOS/Linux:  {NIX_TEST}\n"
            "4. Copy the last three lines of the output into Result."
        ),
        "Expectation": (
            f"The output ends with a line reading 'Ran {NTESTS} tests in <a time>' "
            "and then, after a blank line:\n  FAILED (errors=1)\n"
            "\n"
            "THE TIMING FIGURE WILL PROBABLY NOT MATCH. The tutorial prints "
            f"'Ran {NTESTS} tests in 0.000s' and your machine may print 0.001s or "
            "similar. That is normal and is a PASS. Say in Feedback whether the "
            "difference made you hesitate -- a reader comparing their screen to "
            "the document character by character is exactly who this tutorial is "
            "for.\n"
            "\n"
            f"The failure is real: the sample is missing a function called "
            f"'{MISSING_FN}' that its test calls.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: step 2 explains the project in three lines "
            "of prose before giving the command. Was that explanation needed, "
            "sufficient, or in the way? Did 'The project brings its own Python, so "
            "use that one' land, or did you wonder why you were not just typing "
            "'python'?"
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - smoke: the sample really goes red "
            "to green (v3 8) > the sample starts RED, with an error that points "
            "at the task', which asserts the test count and that the error names "
            "the missing function."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Step 3 - let your AI agent do the work",
        "Subarea": "Walk 7 - one pasted line, and a session runs",
        "ItemLabel": ("A single pasted line drives an AI session that writes the "
                      "code, runs the tests and records itself as done"),
        "HumanAction": (
            "Where you are: tests just failed in the terminal, the starter line "
            "still on your clipboard, the AI agent installed in this profile and "
            "signed in.\n"
            "\n"
            "1. Open your AI agent's chat inside VS Code.\n"
            "2. Paste the line you copied. It should read exactly:\n"
            f"   {STARTER}\n"
            "   If your clipboard has something else, say so in Result -- and get "
            "the line the way the tutorial says you can: click the Dabbler icon "
            "in the Activity Bar to open the Work Explorer, then click the "
            f"{SLUG} row.\n"
            "3. WRITE DOWN THE TIME NOW as T3, and send it.\n"
            "4. WATCH. Do not steer it, do not answer questions it does not ask, "
            "do not open files. If it asks you something, record the question "
            "verbatim in Feedback and answer as briefly as you can -- being asked "
            "anything at all is a finding.\n"
            "5. When the session finishes, WRITE DOWN THE TIME NOW as T4, and "
            "record T4 - T3 in Result as the agent time.\n"
            "6. Copy the last few lines of the agent's output into Result."
        ),
        "Expectation": (
            "The agent reads its instructions from the project's AGENTS.md, adds "
            f"the missing '{MISSING_FN}' function, runs the tests, runs the "
            "program, and closes the session. Two things the tutorial warns you "
            "about, both expected and neither an error:\n"
            "  - a warning that no second AI reviewed the work;\n"
            "  - the final line reading exactly:\n      close_session: succeeded\n"
            "\n"
            "TUTORIAL-QUALITY CHECK, and this is the highest-risk item in the "
            "walk: this step is where the reader has the least to do and the most "
            "to doubt. Did the wait ever feel broken? Was there a moment you "
            "nearly intervened -- and what did you nearly do? Did the "
            "no-second-AI warning read as reassurance, as the tutorial intends, "
            "or as a problem you should fix? If your agent asked for permission "
            "to run commands, say how many times: the tutorial says 'You do not "
            "have to steer it', and that claim is only as true as your agent's "
            "settings allow."
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - smoke > the Lightweight lifecycle "
            "registers the session' and '> close_session closes cleanly on the "
            "local-only repo' (which asserts the pushed_to_remote gate passes on "
            "a hostless repo); the starter line itself is asserted identical to "
            "the shipped copy affordance by 'the user-facing strings > the "
            "starter line matches the shipped copy affordance exactly (v3 12.2)'."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "Step 4 - see that it worked",
        "Subarea": "Walk 8 - green, and the program runs",
        "ItemLabel": ("The reader ends holding proof: passing tests, changed "
                      "program output, and a completed task in the Explorer"),
        "HumanAction": (
            "Where you are: the agent's session has finished; the same terminal "
            "is still open.\n"
            "\n"
            "1. Run the tests again, the same line as before:\n"
            f"   Windows:      {WIN_TEST}\n"
            f"   macOS/Linux:  {NIX_TEST}\n"
            "2. Then run the program:\n"
            f"   Windows:      {WIN_RUN}\n"
            f"   macOS/Linux:  {NIX_RUN}\n"
            f"3. THE MOMENT '{OUTPUT[-1]}' IS ON YOUR SCREEN, WRITE DOWN THE TIME "
            "NOW as T5. THE MEASURED WINDOW CLOSES HERE.\n"
            "4. Click the Dabbler icon in the Activity Bar to open the Work "
            f"Explorer and find the {SLUG} row.\n"
            "5. Copy both command outputs into Result."
        ),
        "Expectation": (
            f"The test run ends with 'Ran {NTESTS} tests in <a time>', a blank "
            "line, and:\n  OK\n"
            "The program prints exactly these two lines, in this order:\n  "
            + "\n  ".join(OUTPUT) + "\n"
            f"In the Work Explorer, {SLUG} now sits under Complete.\n"
            "\n"
            "TUTORIAL-QUALITY CHECK: the tutorial's last line before 'What next' "
            "claims 'That is the whole loop: a task that was written down, an AI "
            "session that did it, and a test that proves it.' Standing where you "
            "are now -- does that land? Do you believe you could do this again on "
            "your own code? If the Work Explorer step was the first time you "
            "opened it, say whether finding the row took any hunting."
        ),
        "ProgrammaticVerification": (
            "Layer 2 (mocha): 'sampleProject - smoke > the change turns it GREEN "
            "and the program prints the contracted lines', asserting OK, the test "
            "count and both output lines against bundle.json; Layer 3 "
            "(Playwright) covers the Work Explorer's rendering of a completed set."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
    {
        "FunctionalArea": "The criterion",
        "Subarea": "Walk 9 - answer it with a number, and with what you typed",
        "ItemLabel": ("The 15-minute criterion is answered as a number, and the "
                      "no-git/no-YAML/no-config half is answered from what was "
                      "actually typed"),
        "HumanAction": (
            "Where you are: the walk is over, all six clock times written down.\n"
            "\n"
            "1. Work out and record all four durations:\n"
            "     Prerequisite setup = P1 - P0   (excluded from the criterion)\n"
            "     Install time       = T1 - T0   (excluded from the criterion)\n"
            "     INTERACTION TIME   = T5 - T2   (the answer)\n"
            "     Agent time         = T4 - T3   (a part of interaction time)\n"
            "2. Scroll back through your terminal and your agent's chat, and list "
            "in Result EVERY command you typed between T2 and T5. Read them off "
            "the screen; do not reconstruct them from memory.\n"
            "3. From that list -- not from memory -- answer each of these four:\n"
            "     Did you type a git command?              yes / no\n"
            "     Did you edit a YAML file?                yes / no\n"
            "     Did you configure a git host or remote?  yes / no\n"
            "     Did you change a Dabbler setting?        yes / no\n"
            "4. Count the concepts the tutorial required you to understand to "
            "finish, and name them. For reference, the document this one replaces "
            "required branch protection, worktrees, CI, pull requests, modules and "
            "decomposition before a reader saw any AI-written code."
        ),
        "Expectation": (
            "There is no expected value here. Record what happened:\n"
            "  - If interaction time is at or under 15:00, the criterion is met.\n"
            "  - If it is over, THAT IS THE RESULT AND IT IS A VALID ONE. Record "
            "the number and, in Feedback, where the time actually went -- which "
            "step was longest, and whether it was Dabbler, your agent, or the "
            "document being unclear.\n"
            "  - All four answers in step 3 should be 'no'. Any 'yes' is a real "
            "finding: quote the exact command or file and say what sent you there.\n"
            "\n"
            "FINALLY, ONE SENTENCE IN FEEDBACK, and it is the most useful thing in "
            "this document: if a colleague asked you tomorrow whether they should "
            "follow this tutorial, what would you say?"
        ),
        "ProgrammaticVerification": (
            "ai_router/scripts/tutorial_gate.py (67 tests, wired into CI beside "
            "drift_guard) asserts the DOCUMENT contains no git command, no YAML "
            "block, no host configuration and no governance setting; only the walk "
            "can establish what the READER actually typed, which is what this item "
            "records."
        ),
        "Result": "",
        "Feedback": "",
        "Passes": False,
    },
]

checklist = {
    "ProjectName": "Dabbler AI Orchestration",
    "ReleaseLabel": (
        "Extension 0.47.0 (published to the Marketplace) + dabbler-ai-router "
        "from PyPI -- Set 107 'First-Run Rescue', Session 3 of 3: the stopwatch "
        "walk of docs/tutorials/hello-world.md"
    ),
    "DocumentDate": datetime.now().strftime("%-m/%-d/%Y, %-I:%M:%S %p")
    if hasattr(datetime.now(), "nonexistent") else datetime.now().strftime(
        "%m/%d/%Y, %I:%M:%S %p"),
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

print("BOUND FROM SHIPPED SOURCE:")
for k, v in [("progress title", PROGRESS_TITLE),
             ("picker title", PICKER_TITLE), ("picker label", PICKER_LABEL),
             ("success", SUCCESS), ("action", NEXT_STEP_ACTION),
             ("copied", COPIED), ("starter", STARTER),
             ("stages", " | ".join(STAGES)), ("outputs", " / ".join(OUTPUT))]:
    print(f"  {k:14} {v}")
print(f"\nitems: {len(REVIEW)}  ->  {OUT}")
