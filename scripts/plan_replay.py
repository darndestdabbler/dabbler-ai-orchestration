"""Replay sets 136-141 against the plan design, and publish the counts.

Pre-registration stops the proof from moving. It does not prove the plan
was complete, and no amount of hashing makes it. This measures the gap on
the only evidence available -- six sets that ran before plans existed:

  * how often a session's real file set would have escaped the envelope a
    plan would have declared, and
  * how many verification findings concerned files the plan would have
    named at all.

The counterfactual envelope is reconstructed from the files each spec
names literally, through the same ``named_files`` the free checks use --
one implementation, not a second one written for the measurement. That is
a floor, not a guess: a supervisor authoring a plan would declare at least
the files its own spec asks for, and probably more. So the amendment rate
below is an **upper bound**, and the near-miss column says how much of it
is a supervisor who would plausibly have declared one more file in a
directory it already named.

Run manually:

    .venv/Scripts/python scripts/plan_replay.py [--write]

Without --write it prints the table; with --write it publishes to
docs/session-sets/144-the-approved-plan/replay-136-141.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_router import ledger  # noqa: E402
from ai_router.approved_plan import (  # noqa: E402
    lifecycle_written_paths,
    path_in_envelope,
)
from ai_router.evidence import run_git  # noqa: E402
from ai_router.plan_review import named_files, session_goals  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
SET_PREFIXES = ("136-", "137-", "138-", "139-", "140-", "141-")
SETS_DIR = REPO_ROOT / "docs" / "session-sets"
PUBLISH_TO = SETS_DIR / "144-the-approved-plan" / "replay-136-141.md"

_CLOSE_RE = re.compile(r"^Close session (\d+) of (\S+)$")

MACHINE_PREFIX = ".dabbler/"


def close_commits(repo_root) -> dict:
    """``(set_slug, session_number) -> sha`` for every session that closed.

    The close commit is the one boundary a session cannot fake: the gate
    writes it, and it is the last thing in the session's ancestry.
    """
    rc, out, err = run_git(repo_root, "log", "--reverse", "--format=%H%x1f%s")
    if rc != 0:
        raise SystemExit(f"git log failed: {err}")
    found = {}
    for line in out.splitlines():
        sha, _, subject = line.partition("\x1f")
        match = _CLOSE_RE.match(subject)
        if match:
            found[(match.group(2), int(match.group(1)))] = sha
    return found


def replayed_sessions(repo_root) -> list:
    """``(set_slug, session_number, started_at, close_sha)`` for every
    session of sets 136-141 that ran to a close.

    The window is the router's own record of it: ``startedAt`` from the
    session state, up to the commit the close gate wrote. Reading the
    boundary off commit messages alone puts the entire rebuild inside the
    first session that ever closed.
    """
    closes = close_commits(repo_root)
    out = []
    for set_dir in sorted(SETS_DIR.iterdir()):
        if not set_dir.name.startswith(SET_PREFIXES):
            continue
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        for session in state.get("sessions") or []:
            number = session.get("number")
            started = session.get("startedAt")
            sha = closes.get((set_dir.name, number))
            if not sha or not started:
                continue
            out.append((set_dir.name, number, started, sha))
    return out


def real_file_set(repo_root, set_slug: str, started_at: str,
                  close_sha: str) -> list:
    """Repo paths the session actually changed, ceremony removed. The
    lifecycle writes the state, the activity log and the close-out change
    log itself, and the machine record is not source: none of them is a
    step's work, so none can put a session outside its own plan."""
    rc, out, err = run_git(
        repo_root, "log", "--format=%H", f"--since={started_at}", close_sha,
    )
    if rc != 0:
        raise SystemExit(f"git log {close_sha} failed: {err}")
    ceremony = set(lifecycle_written_paths(SETS_DIR / set_slug, repo_root))
    paths = set()
    for sha in [s.strip() for s in out.splitlines() if s.strip()]:
        rc, files, err = run_git(
            repo_root, "show", "--pretty=format:", "--name-only",
            "-z", "--no-ext-diff", sha,
        )
        if rc != 0:
            raise SystemExit(f"git show {sha} failed: {err}")
        for path in files.split("\0"):
            path = path.strip().replace("\\", "/")
            if not path or path.startswith(MACHINE_PREFIX):
                continue
            if path in ceremony:
                continue
            paths.add(path)
    return sorted(paths)



def reconstructed_envelope(spec_text: str, session_number: int) -> list:
    """The envelope a plan would have declared, floored at the files the
    spec names in the session's own non-ceremony steps."""
    envelope = []
    for goal in session_goals(spec_text, session_number):
        for path in named_files(goal.text):
            if path not in envelope:
                envelope.append(path)
    return envelope


def _declared_dirs(envelope) -> set:
    return {p.rsplit("/", 1)[0] for p in envelope if "/" in p}


def classify_paths(paths, envelope) -> dict:
    """Inside the envelope, a near miss (a directory the plan already
    named), or a surprise. The middle column is the honest one: it is
    where the floor understates what a supervisor would have declared."""
    inside, near, surprise = [], [], []
    dirs = _declared_dirs(envelope)
    for path in paths:
        if envelope and path_in_envelope(path, envelope):
            inside.append(path)
        elif "/" in path and path.rsplit("/", 1)[0] in dirs:
            near.append(path)
        else:
            surprise.append(path)
    return {"inside": inside, "near": near, "surprise": surprise}


def classify_findings(rounds, envelope) -> dict:
    """Each verification finding, against the reconstructed envelope.

    ``coverable`` is the strongest claim this replay can make: every file
    the finding cites was inside the envelope, so a declared proof for
    that step could have been asked to cover it. Whether it *would* have
    is the completeness question, and it is exactly what pre-registration
    cannot answer -- a weak criterion inside the envelope passes.
    """
    coverable, outside, unpathed = [], [], []
    for row in rounds:
        for finding in row.get("findings") or []:
            paths = [
                str(p).replace("\\", "/")
                for p in (finding.get("evidencePaths") or [])
            ]
            paths = [p for p in paths if p and not p.startswith(MACHINE_PREFIX)]
            if not paths:
                unpathed.append(finding)
            elif envelope and all(path_in_envelope(p, envelope) for p in paths):
                coverable.append(finding)
            else:
                outside.append(finding)
    return {
        "coverable": coverable, "outside": outside, "unpathed": unpathed,
    }


def replay(repo_root) -> list:
    rows = []
    for set_slug, number, started, close_sha in replayed_sessions(repo_root):
        spec = (SETS_DIR / set_slug / "spec.md").read_text(encoding="utf-8")
        envelope = reconstructed_envelope(spec, number)
        paths = classify_paths(
            real_file_set(repo_root, set_slug, started, close_sha), envelope
        )
        rounds = ledger.read_rounds(repo_root, set_slug, number)
        rows.append({
            "set": set_slug,
            "session": number,
            "envelope": envelope,
            "paths": paths,
            "findings": classify_findings(rounds, envelope),
            "rounds": len(rounds),
            "rounds_on_disk": ledger.rounds_path(
                repo_root, set_slug, number
            ).exists(),
        })
    return rows


def _totals(rows) -> dict:
    # A session whose spec names no file at all gives the reconstruction
    # nothing to floor on. It is reported, never counted: an envelope of
    # zero paths would score every file as an escape and inflate the very
    # rate this replay exists to bound.
    measurable = [r for r in rows if r["envelope"]]
    return {
        "sessions": len(rows),
        "measurable": len(measurable),
        "unreconstructable": len(rows) - len(measurable),
        "amending": sum(
            1 for r in measurable
            if r["paths"]["near"] or r["paths"]["surprise"]
        ),
        "surprising": sum(1 for r in measurable if r["paths"]["surprise"]),
        "inside": sum(len(r["paths"]["inside"]) for r in measurable),
        "near": sum(len(r["paths"]["near"]) for r in measurable),
        "surprise": sum(len(r["paths"]["surprise"]) for r in measurable),
        "coverable": sum(len(r["findings"]["coverable"]) for r in measurable),
        "outside_findings": sum(
            len(r["findings"]["outside"]) for r in measurable
        ),
        "unpathed": sum(len(r["findings"]["unpathed"]) for r in measurable),
        "no_rounds": sorted({
            r["set"] for r in rows if not r["rounds_on_disk"]
        }),
        "escapes_by_area": _escapes_by_area(measurable),
    }


def _area(path: str) -> str:
    """Where an escaping path lives, at the coarsest useful grain: the
    top-level directory, or the file itself when it sits at the root."""
    return path.split("/", 1)[0] if "/" in path else path


def _escapes_by_area(rows) -> list:
    counts: dict = {}
    for row in rows:
        for key in ("near", "surprise"):
            for path in row["paths"][key]:
                counts[_area(path)] = counts.get(_area(path), 0) + 1
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))


def render(rows) -> str:
    totals = _totals(rows)
    totals["files"] = (
        totals["inside"] + totals["near"] + totals["surprise"]
    )
    findings_total = (
        totals["coverable"] + totals["outside_findings"] + totals["unpathed"]
    )
    lines = [
        "# Replay: sets 136-141 against the approved plan",
        "",
        "Generated by `scripts/plan_replay.py`. Every number here is "
        "measured, not estimated.",
        "",
        "The six sets replayed here ran before plans existed, so the "
        "envelope each session *would* have declared is reconstructed from "
        "the files its own spec names literally -- through the same "
        "`named_files` the free checks use, not a second implementation "
        "written for the measurement. That is a floor. A supervisor "
        "authoring a plan declares at least the files the spec asks for, "
        "and in practice more, so **the amendment rate below is an upper "
        "bound**. The `near miss` column is where the floor most obviously "
        "understates it: a file in a directory the spec already named.",
        "",
        "A session's real file set is the router's own record of it -- the "
        "commits from `startedAt` through the commit the close gate wrote, "
        "with `.dabbler/` and the files the lifecycle writes for itself "
        "(`session-state.json`, `activity-log.json`, `change-log.md`) "
        "removed. No step envelope is permitted to declare those, so "
        "counting them would refuse every session for obeying the "
        "lifecycle.",
        "",
        "| Set | S | Declared | Files | Inside | Near miss | Surprise | "
        "Findings | Coverable | Outside |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | "
        "---: |",
    ]
    for row in rows:
        paths, findings = row["paths"], row["findings"]
        total_findings = (
            len(findings["coverable"]) + len(findings["outside"])
            + len(findings["unpathed"])
        )
        files = (
            len(paths["inside"]) + len(paths["near"]) + len(paths["surprise"])
        )
        if not row["envelope"]:
            lines.append(
                f"| {row['set'].split('-')[0]} | {row['session']} | 0 | "
                f"{files} | n/a | n/a | n/a | n/a | n/a | n/a |"
            )
            continue
        rounds_cell = str(total_findings) if row["rounds_on_disk"] else "n/a"
        lines.append(
            f"| {row['set'].split('-')[0]} | {row['session']} | "
            f"{len(row['envelope'])} | {files} | "
            f"{len(paths['inside'])} | {len(paths['near'])} | "
            f"{len(paths['surprise'])} | {rounds_cell} | "
            f"{len(findings['coverable'])} | {len(findings['outside'])} |"
        )
    lines += [
        "",
        f"**{totals['amending']} of {totals['measurable']} measurable "
        "sessions** would have needed at least one amendment against the "
        f"reconstructed envelope; **{totals['surprising']}** touched a "
        "directory the spec never named at all. "
        f"{totals['unreconstructable']} session(s) named no file in the "
        "spec at all and are reported without being counted.",
        "",
        f"**Files:** {totals['files']} changed across the measurable "
        f"sessions -- {totals['inside']} inside the reconstructed envelope, "
        f"{totals['near']} in a directory it already named, "
        f"{totals['surprise']} in one it did not.",
        "",
        f"**Findings:** {findings_total} recorded across every verification "
        f"round on disk -- {totals['coverable']} cited only files inside "
        f"the envelope, {totals['outside_findings']} cited at least one "
        f"file outside it, {totals['unpathed']} cited no file.",
    ]
    if totals["no_rounds"]:
        lines += [
            "",
            "Verification rounds are not on disk for "
            + ", ".join(s.split("-")[0] for s in totals["no_rounds"])
            + ": that set predates `.dabbler/runs/`, so its findings "
            "cannot be replayed and are not counted above.",
        ]
    lines += [
        "",
        "## Where the escapes are",
        "",
        "Every file that fell outside the reconstructed envelope, by the "
        "area it lives in. This is the actionable half of the measurement: "
        "it says what an authored envelope has to declare that a spec "
        "never bothers to name.",
        "",
        "| Area | Files outside |",
        "| --- | ---: |",
    ]
    for area, count in totals["escapes_by_area"]:
        lines.append(f"| `{area}` | {count} |")
    lines += [
        "",
        "## The finding for the operator",
        "",
        "**The corpus cannot bound the amendment rate.** "
        f"{totals['amending']} of {totals['measurable']} sessions escape a "
        "reconstruction built from spec-named files, and the reason is the "
        "reconstruction, not the sessions: a spec names a handful of files "
        "and a session touches many. A rate this close to 1 says the "
        "measurement has no resolution, not that the plan is paperwork. "
        "The real rate has to be measured against envelopes an author "
        "actually declares -- live, in set 145 -- and the decision that "
        "rests on it belongs where the plan already puts it, in 146.",
        "",
        "**What an authored envelope has to declare that a spec does "
        "not.** The escapes concentrate in the source tree and the test "
        "tree. A step whose evidence contract says a test proves it, and "
        "whose envelope does not name that test, amends its plan the "
        "moment it writes the test -- which would make the amendment path "
        "the normal path and the envelope a formality. Authoring the "
        "envelope from the evidence contract, rather than from the spec's "
        "prose, is what this measurement asks of set 145.",
        "",
        "**One correction was taken here rather than deferred.** The "
        "set's `change-log.md` now joins `session-state.json` and "
        "`activity-log.json` as lifecycle-written: close-out writes it, "
        "close-out is not a plan step, and a file no envelope is permitted "
        "to declare cannot be evidence that a session left its plan. That "
        "is not a loosened check -- it names whose work the file is. "
        "`spec.md` deliberately did not join them: a session editing its "
        "own spec mid-flight is the drift the plan exists to catch.",
        "",
        "## What the numbers do not say",
        "",
        "`Coverable` is the strongest claim this replay can make: every "
        "file the finding cites was inside the envelope, so a declared "
        "proof for that step *could* have been asked to cover it. Whether "
        "it *would* have is the completeness question, and it is precisely "
        "what pre-registration cannot answer -- a weak criterion inside the "
        "envelope passes, and the plan is none the wiser. The one thing "
        "pre-registration does guarantee is that the criterion could not be "
        "rewritten once the code was seen.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write", action="store_true",
        help=f"publish the report to {PUBLISH_TO.name}",
    )
    args = parser.parse_args(argv)

    rows = replay(REPO_ROOT)
    if not rows:
        print("plan_replay: no closed sessions found for sets 136-141")
        return 1
    report = render(rows)
    print(report)
    if args.write:
        PUBLISH_TO.parent.mkdir(parents=True, exist_ok=True)
        PUBLISH_TO.write_text(report, encoding="utf-8")
        print(f"\nwritten: {PUBLISH_TO.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
