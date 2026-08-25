"""Drive a deliberately weak model through a walkthrough as if it were the reader.

The model has no tools, so this script is its terminal: Luna says what it wants to
do and why, this runs the command for real, and the actual output goes back.
The point is to find where the document fails a reader, so nothing here helps
Luna along -- no hints, no corrections, no re-phrasing of the walkthrough.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/home/dennis-mitchell/dabbler-ai-orchestration")
from ai_router.route import route

WALKTHROUGH = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
REPO = Path(__file__).resolve().parents[1]
LOG = Path(os.environ.get("UAT_OUT", ".")) / "uat-log.md"
TRANSCRIPT = Path(os.environ.get("UAT_OUT", ".")) / "uat-transcript.json"
MAX_TURNS = 28
MAX_OUTPUT_CHARS = 4000

BRIEF = """You are a software development manager who also writes code. Your
team has built a framework for running AI-assisted projects, and they have
given you a walkthrough document to follow before you hand it to your staff.

You have never seen this project before. You know general software development
but nothing about this team's tools, vocabulary, or conventions.

Your job: follow the walkthrough end to end and find out whether you finish
knowing (a) what your staff would do at each step, and (b) where they would
look to see progress.

You are at a terminal. You cannot run commands yourself -- tell me what you
want to run and I will run it and give you the real output.

IMPORTANT: If any direction confuses you, say so. Do not guess, do not
quietly work around it, and do not pretend it made sense. Being confused is
the most useful thing you can report -- that is the whole reason you are
doing this. If you cannot tell what a word means, say which word. If you
cannot tell what you are supposed to do next, say so.

Reply in EXACTLY this format every turn, and nothing else:

LOG: what you are doing this turn and why, in plain language
CONFUSED: either the word "nothing" or a description of what confused you
ACTION: one of the following, on a single line
    RUN <shell command>
    READ <file path relative to the walkthrough directory>
    DONE <your overall verdict in a sentence>

You are in the walkthrough directory, in a terminal where nothing has been set
up yet -- exactly as you would be if you had just sat down. If the document
tells you to set something up, run those commands like any other; they will
persist for the rest of the session.

Start by reading README.md.
"""

ALLOWED = re.compile(
    r"^\s*(cat|ls|head|tail|find|wc|grep|sed -n|tree|file|less|more|python3?|"
    r"\.?/?[\w./-]*python[\w.]*|git status|git log|pwd|echo)\b")
BANNED = re.compile(r"(rm\s|(?<![12])>|\|\s*sh\b|curl|wget|pip |npm i|sudo|chmod|mv\s|cp\s)")


ACTIVATED = {"yes": False}


def run_command(cmd):
    if "activate" in cmd:
        ACTIVATED["yes"] = True
        return "(no output)"
    if re.search(r"ai_router\.workflow\s+(enter|review|approve|send-back|contract-changed)", cmd):
        return ("REFUSED: this harness is read-only and that command would "
                "write to the project's event log. The walkthrough is already "
                "finished -- you are inspecting it, not running it again.")
    if BANNED.search(cmd):
        return ("REFUSED: this harness will not run commands that write, "
                "delete or fetch. Ask for a read-only command instead.")
    if not ALLOWED.match(cmd):
        return (f"REFUSED: '{cmd.split()[0] if cmd.split() else cmd}' is not "
                "on this harness's allow-list. Ask for a read-only command.")
    env = {"PATH": "/usr/bin:/bin", "HOME": "/tmp"}
    if ACTIVATED["yes"]:
        # What `source .venv/bin/activate` actually buys you.
        env["PATH"] = f"{REPO}/.venv/bin:/usr/bin:/bin"
        env["VIRTUAL_ENV"] = f"{REPO}/.venv"
    try:
        p = subprocess.run(cmd, shell=True, cwd=WALKTHROUGH, capture_output=True,
                           text=True, timeout=90, env=env)
        out = (p.stdout or "") + (("\n[stderr]\n" + p.stderr) if p.stderr else "")
        out = out or "(no output)"
        if len(out) > MAX_OUTPUT_CHARS:
            out = out[:MAX_OUTPUT_CHARS] + f"\n... [truncated, {len(out)} chars total]"
        return f"exit {p.returncode}\n{out}"
    except subprocess.TimeoutExpired:
        return "TIMED OUT after 90s"


def read_file(rel):
    p = (WALKTHROUGH / rel.strip()).resolve()
    if not str(p).startswith(str(WALKTHROUGH.resolve())):
        return "REFUSED: path is outside the walkthrough directory."
    if not p.is_file():
        return f"There is no file at {rel}."
    t = p.read_text(errors="replace")
    if len(t) > MAX_OUTPUT_CHARS * 2:
        t = t[:MAX_OUTPUT_CHARS * 2] + f"\n... [truncated, {len(t)} chars total]"
    return t


def parse(reply):
    log = conf = action = ""
    for line in reply.splitlines():
        s = line.strip()
        if s.upper().startswith("LOG:"):
            log = s[4:].strip()
        elif s.upper().startswith("CONFUSED:"):
            conf = s[9:].strip()
        elif s.upper().startswith("ACTION:"):
            action = s[7:].strip()
    return log, conf, action


def main():
    history = []
    entries = []
    for turn in range(1, MAX_TURNS + 1):
        convo = BRIEF + "\n\n"
        for h in history:
            convo += f"--- YOUR TURN {h['turn']} ---\n{h['reply']}\n\n"
            convo += f"--- TERMINAL OUTPUT ---\n{h['result']}\n\n"
        convo += f"--- NOW: your turn {turn}. Reply in the required format. ---\n"

        r = route(content=convo, task_type="general",
                  prefer_model=os.environ.get("UAT_MODEL", "gpt-5-6-luna"), max_tier=3)
        reply = r.content.strip()
        log, conf, action = parse(reply)
        print(f"\n===== TURN {turn} ({r.model_name}) =====")
        print(f"LOG: {log}")
        if conf and conf.lower() not in ("nothing", "none", "n/a"):
            print(f"*** CONFUSED: {conf}")
        print(f"ACTION: {action}")

        if not action:
            result = ("Your reply did not contain an ACTION: line. Reply again "
                      "in the exact required format.")
        elif action.upper().startswith("DONE"):
            entries.append({"turn": turn, "log": log, "confused": conf,
                            "action": action, "result": "(finished)"})
            print("\n>>> Luna stopped.")
            break
        elif action.upper().startswith("RUN"):
            result = run_command(action[3:].strip())
        elif action.upper().startswith("READ"):
            result = read_file(action[4:].strip())
        else:
            result = ("Unrecognised ACTION. Use RUN, READ or DONE.")

        print(f"--- result ---\n{result[:600]}")
        history.append({"turn": turn, "reply": reply, "result": result})
        entries.append({"turn": turn, "log": log, "confused": conf,
                        "action": action, "result": result[:1500]})

    TRANSCRIPT.write_text(json.dumps(entries, indent=2))
    lines = ["# Luna's walkthrough log", "",
             f"Model: {r.model_name}/{r.provider}. {len(entries)} turns.", ""]
    for e in entries:
        lines += [f"## Turn {e['turn']}", "",
                  f"**Doing:** {e['log']}", ""]
        if e["confused"] and e["confused"].lower() not in ("nothing", "none", "n/a"):
            lines += [f"**CONFUSED:** {e['confused']}", ""]
        lines += [f"**Action:** `{e['action']}`", ""]
    LOG.write_text("\n".join(lines))
    print(f"\nWrote {LOG} and {TRANSCRIPT}")


if __name__ == "__main__":
    main()
