"""Per-set decision journal — the record behind the decision-rights rubric.

Set 111 Session 3 canonizes the rubric from
``docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md``
§11: decisions route by **whose authority they need**, not by how much
judgment they take. Everything judgment-shaped is AI-decidable under an
ordered tiebreak list; four classes stay human. The human moves from
**gate** to **auditor** — and an auditor needs a record, which is this
module.

One artifact: ``<session-set-dir>/decisions.jsonl``, append-only, one
JSON object per decision, git-tracked so the audit trail travels with the
repo. The shape is deliberately the same family as
``consensus-decisions.jsonl`` and ``router-metrics.jsonl``.

What a record must carry (the spec's four): the **decision**, the
**rubric line that fired**, the **options considered**, and
**reversibility**. Two more are required because the writer enforces
them: ``authority`` and ``verification_effect``.

The verification carve-out
--------------------------

Proposal §11's hard carve-out is that decisions which *reduce
verification* stay outside AI authority — the agent never authors its own
permission. :func:`record_decision` enforces it: a record with
``authority="ai"`` and ``verification_effect="reduces"`` is **refused**
(:class:`VerificationReductionRefused`), not journaled. The same call
under ``authority="human"`` requires a non-empty operator attestation.

Be precise about how strong that is, because overclaiming in a docstring
is its own defect class (L-064-8):

- ``verification_effect`` is **mandatory and has no default**. A caller
  cannot omit it and drift into the permissive branch; the conscious
  assertion is the auditable act, and it is the primary control.
- :func:`screen_for_verification_reduction` is a **backstop, and it can
  only escalate**. When it matches a decision declared ``none``, the
  write is refused. When it matches nothing, the mandatory declaration
  still stands unaided. Its incompleteness therefore cannot weaken the
  guard — it can only fail to add to it. That asymmetry is the point:
  Set 111 S2 spent six verification rounds learning that an open-ended
  classifier used as a *primary* control acquires one new spelling per
  round forever, so this one is never load-bearing, and it is expressed
  as one proximity rule rather than a phrase list that would grow the
  same way.
- Nothing here can stop an orchestrator that declares ``none`` about a
  decision that truly reduces verification. What it does is make that a
  **recorded false statement** in a git-tracked ledger rather than a
  silent omission, which is exactly what an auditor needs.

Cross-field coherence
---------------------

``authority``, ``rubric_line`` and ``verification_effect`` describe one
decision from three angles, so a hand-assembled record can be
individually well-formed and jointly false. :func:`validate_record`
rejects the incoherent combinations, because each of them silently
defeats a guarantee the other rules provide:

- ``rubric_line="verification-reduction"`` requires
  ``verification_effect="reduces"`` — otherwise a record naming the
  carve-out slips past the operator-attestation requirement, which is
  keyed on the declared effect.
- ``rubric_line="escalate-to-human"`` requires ``authority="human"`` —
  tiebreak 6 *is* the escalation, so recording one as an AI call hides
  an operator stop from the very audit the journal exists to enable.
- ``authority="human"`` requires a rubric line that routes to the
  operator (one of the four human classes, or ``escalate-to-human``) —
  a human decision attributed to an AI tiebreak does not say why the
  operator was involved.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

JOURNAL_FILENAME = "decisions.jsonl"

# --- The rubric, encoded -------------------------------------------------

# Human-required classes (proposal §11). Ordered: the carve-out is last
# because it is the one that is never negotiable, and a reader should
# arrive at it having seen the other three.
HUMAN_AUTHORITY_TRIGGERS = (
    # External or hard-to-reverse consequences: publish, spend, delete
    # beyond version control's undo horizon.
    "external-consequence",
    # Value trade-offs the AI cannot derive: business priority, taste,
    # what the operator's staff will tolerate.
    "value-trade-off",
    # Someone must be accountable for the sign-off itself.
    "accountability-sign-off",
    # The hard carve-out: anything that reduces verification.
    "verification-reduction",
)
_HUMAN_TRIGGERS_SET = frozenset(HUMAN_AUTHORITY_TRIGGERS)

# The ordered AI tiebreaks. Applied in order; the FIRST one that decides
# is the one recorded as ``rubric_line``.
AI_TIEBREAKS = (
    # 1. The spec's goal over its unmeetable letter.
    "goal-over-letter",
    # 2. Prefer the reversible option.
    "prefer-reversible",
    # 3. Tied -> the option that makes the code simpler: fewer branches,
    #    fewer tests needed to hold it true.
    "simpler-code",
    # 4. Prefer deferring evidence to an existing later gate over
    #    inventing a new one.
    "defer-to-existing-gate",
    # 5. Still tied -> cross-provider consensus.
    "cross-provider-consensus",
    # 6. Consensus splits -> the human, in education mode.
    "escalate-to-human",
)
_AI_TIEBREAKS_SET = frozenset(AI_TIEBREAKS)

RUBRIC_LINES = HUMAN_AUTHORITY_TRIGGERS + AI_TIEBREAKS
_RUBRIC_LINES_SET = frozenset(RUBRIC_LINES)

AUTHORITIES = ("ai", "human")
_AUTHORITIES_SET = frozenset(AUTHORITIES)

# What the decision does to verification coverage. No default: a caller
# must assert one.
VERIFICATION_EFFECTS = ("none", "strengthens", "reduces")
_VERIFICATION_EFFECTS_SET = frozenset(VERIFICATION_EFFECTS)

REVERSIBILITY_LEVELS = ("reversible", "reversible-with-cost", "irreversible")
_REVERSIBILITY_SET = frozenset(REVERSIBILITY_LEVELS)


class DecisionJournalError(Exception):
    """Base class for decision-journal refusals."""


class VerificationReductionRefused(DecisionJournalError):
    """A verification-reducing decision was submitted under AI authority.

    Proposal §11's hard carve-out. The agent never authors its own
    permission, so this is a refusal to *write*, not a warning: the
    decision does not enter the journal and the caller must take it to
    the operator as an education-mode brief.
    """


@dataclass(frozen=True)
class AuthorityRuling:
    """Which authority a decision needs, and which rubric line said so."""

    authority: str
    rubric_line: str
    rationale: str

    @property
    def is_human(self) -> bool:
        return self.authority == "human"


def classify_authority(
    *,
    reduces_verification: bool = False,
    external_consequence: bool = False,
    value_trade_off: bool = False,
    accountability_sign_off: bool = False,
) -> AuthorityRuling:
    """Route a decision by authority, per proposal §11.

    Any one of the four human triggers routes to the operator. Nothing
    else does — "this feels hard" is explicitly not a trigger, which is
    the whole point of the rubric: routing is by *authority*, not by
    judgment load.

    The carve-out is checked first so that a decision which is both
    verification-reducing and, say, externally consequential reports the
    carve-out as the firing line. The carve-out is the one that can never
    be delegated back, so it is the honest thing to name.
    """
    if reduces_verification:
        return AuthorityRuling(
            authority="human",
            rubric_line="verification-reduction",
            rationale=(
                "Reduces verification coverage. Hard carve-out: the agent "
                "never authors its own permission."
            ),
        )
    if external_consequence:
        return AuthorityRuling(
            authority="human",
            rubric_line="external-consequence",
            rationale=(
                "External or hard-to-reverse consequence (publish, spend, "
                "delete beyond version control's undo horizon)."
            ),
        )
    if value_trade_off:
        return AuthorityRuling(
            authority="human",
            rubric_line="value-trade-off",
            rationale=(
                "Underivable value trade-off: the answer depends on what "
                "the operator wants, not on what is true."
            ),
        )
    if accountability_sign_off:
        return AuthorityRuling(
            authority="human",
            rubric_line="accountability-sign-off",
            rationale="Someone must be accountable for the sign-off itself.",
        )
    return AuthorityRuling(
        authority="ai",
        rubric_line="goal-over-letter",
        rationale=(
            "Judgment-shaped and inside AI authority. Apply the ordered "
            "tiebreaks and record the first line that decides."
        ),
    )


# --- The escalate-only screen -------------------------------------------

# The escalate-only screen. Read the module docstring before touching
# this: it is a BACKSTOP. It can refuse a write; it can never permit one.
#
# It is deliberately ONE proximity rule rather than a phrase list. Set 111
# S2 spent six verification rounds learning that a growing list of literal
# spellings is a losing game — each round found a new one. A weakening VERB
# within a few words of a verification NOUN covers the class without
# pretending to enumerate it, and because the rule can only ever escalate,
# the cases it misses are simply cases where the mandatory declaration
# stands alone, which is the baseline it started from.
_WEAKENING_VERB = (
    r"skip|bypass|waiv|disabl|lower|reduc|drop|remov|relax|weaken|"
    r"suppress|forgo|omit|fewer|less"
)
_VERIFICATION_NOUN = (
    r"verification|verifying|verifier|verifiers|review|reviews|reviewer|"
    r"reviewers|round|rounds|bound|bounds|cap|caps|gate|gates|backstop|"
    r"stamp|pass|passes|fan-?out|cycle|cycles|critique|consensus"
)
_VERIFICATION_REDUCTION_RE = (
    # verb ... noun, within a short window
    re.compile(
        rf"\b(?:{_WEAKENING_VERB})\w*\b(?:\W+\w+){{0,5}}?\W+"
        rf"\b(?:{_VERIFICATION_NOUN})\b",
        re.IGNORECASE,
    ),
    # "turn/switch off the gate" — the verb is two words
    re.compile(
        rf"\b(?:turn|switch)\s+off\b(?:\W+\w+){{0,5}}?\W+"
        rf"\b(?:{_VERIFICATION_NOUN})\b",
        re.IGNORECASE,
    ),
    # Named escape hatches: operator-only flags and self/same-provider
    # verification, which reduce coverage without any weakening verb.
    re.compile(r"--force\b", re.IGNORECASE),
    re.compile(r"--manual-verify\b", re.IGNORECASE),
    re.compile(r"\bself[-\s]?verif\w*", re.IGNORECASE),
    re.compile(r"\bsame[-\s]?provider\b", re.IGNORECASE),
)


def screen_for_verification_reduction(*texts: Optional[str]) -> Optional[str]:
    """Return the first verification-reduction phrase matched, or ``None``.

    Escalate-only backstop; see the module docstring for why it is
    deliberately not the primary control.
    """
    for text in texts:
        if not text:
            continue
        for pattern in _VERIFICATION_REDUCTION_RE:
            match = pattern.search(text)
            if match:
                return match.group(0)
    return None


# --- The record ----------------------------------------------------------


@dataclass(frozen=True)
class DecisionOption:
    """One option that was on the table, and what taking it would cost.

    ``reversible`` is per-option because reversibility is usually the
    thing that differs between options — it is tiebreak 2, and a journal
    that records only the chosen option's reversibility cannot show the
    reader why that tiebreak fired.
    """

    option: str
    consequence: str
    reversible: bool

    def to_dict(self) -> dict:
        return {
            "option": self.option,
            "consequence": self.consequence,
            "reversible": self.reversible,
        }


@dataclass(frozen=True)
class DecisionRecord:
    """One journaled decision.

    Frozen: build it, validate it, write it once. Mutating a decision
    after it is journaled would defeat the audit.
    """

    timestamp: str
    session_set: str
    session_number: int
    question: str
    decision: str
    authority: str
    rubric_line: str
    options: Sequence[DecisionOption]
    reversibility: str
    verification_effect: str
    uat_decide: bool = False
    operator_attestation: Optional[str] = None
    consensus: Optional[Mapping[str, Any]] = None
    extra: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        out: dict = {
            "timestamp": self.timestamp,
            "session_set": self.session_set,
            "session_number": self.session_number,
            "question": self.question,
            "decision": self.decision,
            "authority": self.authority,
            "rubric_line": self.rubric_line,
            "options": [o.to_dict() for o in self.options],
            "reversibility": self.reversibility,
            "verification_effect": self.verification_effect,
            "uat_decide": self.uat_decide,
            "operator_attestation": self.operator_attestation,
            "consensus": dict(self.consensus) if self.consensus else None,
        }
        for key, value in dict(self.extra).items():
            if key in out:
                continue
            out[key] = value
        return out


def now_iso() -> str:
    """Local time with offset, matching ``consensus-decisions.jsonl``.

    The journal is read by humans alongside commit logs and
    ``session-state.json``, which use local-with-offset; keeping the same
    convention lets a reader line them up without converting.
    """
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def journal_path_for(session_set_dir: str | os.PathLike[str]) -> Path:
    """Path of the per-set journal for *session_set_dir*."""
    return Path(session_set_dir) / JOURNAL_FILENAME


def validate_record(record: DecisionRecord) -> None:
    """Validate a record's enum-shaped fields and cross-field invariants.

    Raises :class:`VerificationReductionRefused` for the carve-out and
    :class:`ValueError` for every other malformation. Called by
    :func:`record_decision` before any write, so a refused record leaves
    no partial line on disk.
    """
    if record.authority not in _AUTHORITIES_SET:
        raise ValueError(
            f"authority must be one of {AUTHORITIES}, got {record.authority!r}"
        )
    if record.rubric_line not in _RUBRIC_LINES_SET:
        raise ValueError(
            f"rubric_line must be one of {RUBRIC_LINES}, "
            f"got {record.rubric_line!r}"
        )
    if record.verification_effect not in _VERIFICATION_EFFECTS_SET:
        raise ValueError(
            f"verification_effect must be one of {VERIFICATION_EFFECTS}, "
            f"got {record.verification_effect!r}"
        )
    if record.reversibility not in _REVERSIBILITY_SET:
        raise ValueError(
            f"reversibility must be one of {REVERSIBILITY_LEVELS}, "
            f"got {record.reversibility!r}"
        )
    if not record.question.strip():
        raise ValueError("question must be non-empty")
    if not record.decision.strip():
        raise ValueError("decision must be non-empty")
    if not record.options:
        raise ValueError(
            "options must list at least the alternatives considered - a "
            "decision with one option is not a decision"
        )

    # A human-authority rubric line under AI authority is incoherent: the
    # line itself says the operator owns it.
    if record.authority == "ai" and record.rubric_line in _HUMAN_TRIGGERS_SET:
        if record.rubric_line == "verification-reduction":
            raise VerificationReductionRefused(
                "rubric_line 'verification-reduction' is the hard carve-out "
                "and cannot be recorded under authority='ai'. Take the "
                "question to the operator as an education-mode brief."
            )
        raise ValueError(
            f"rubric_line {record.rubric_line!r} is a human-authority "
            "trigger and cannot be recorded under authority='ai'"
        )

    # The carve-out.
    if record.verification_effect == "reduces":
        if record.authority == "ai":
            raise VerificationReductionRefused(
                "A decision that reduces verification cannot be "
                "self-authorized (proposal SS11 hard carve-out; the "
                "no-skip mandate). Re-route it to the operator with an "
                "education-mode brief and record it with authority='human' "
                "plus a non-empty operator_attestation."
            )
        if not (record.operator_attestation or "").strip():
            raise ValueError(
                "a verification-reducing decision requires a non-empty "
                "operator_attestation naming what the operator authorized"
            )

    # Cross-field coherence. ``authority``, ``rubric_line`` and
    # ``verification_effect`` describe the same decision from three
    # angles, so a caller assembling them by hand can produce a record
    # that is individually well-formed and jointly false. Left
    # unchecked, the two shapes below silently defeat the guarantees the
    # other rules exist to provide: a carve-out line with no declared
    # reduction skips the attestation requirement entirely, and a
    # human escalation labelled AI-authority makes the ledger under-count
    # the operator stops it exists to expose.
    if (
        record.rubric_line == "verification-reduction"
        and record.verification_effect != "reduces"
    ):
        raise ValueError(
            "rubric_line 'verification-reduction' means the decision "
            "reduces verification, so verification_effect must be "
            f"'reduces' (got {record.verification_effect!r}). A record "
            "that names the carve-out but declares no reduction would "
            "bypass the operator-attestation requirement."
        )
    if record.rubric_line == "escalate-to-human" and record.authority != "human":
        raise ValueError(
            "rubric_line 'escalate-to-human' IS tiebreak 6 - the decision "
            "went to the operator - so authority must be 'human' (got "
            f"{record.authority!r}). Recording an escalation as an AI call "
            "hides an operator stop from the audit."
        )
    if record.authority == "human" and record.rubric_line not in (
        _HUMAN_TRIGGERS_SET | {"escalate-to-human"}
    ):
        raise ValueError(
            f"authority='human' requires a rubric_line that routes to the "
            f"operator - one of {HUMAN_AUTHORITY_TRIGGERS} or "
            f"'escalate-to-human' - but got {record.rubric_line!r}, which "
            "is an AI tiebreak. Name why the operator decided."
        )

    # Escalate-only screen. Refuses a careless 'none'; never permits.
    if record.verification_effect == "none":
        hit = screen_for_verification_reduction(
            record.question, record.decision
        )
        if hit:
            raise VerificationReductionRefused(
                f"declared verification_effect='none' but the decision text "
                f"names {hit!r}. Either re-declare it as 'reduces' (which "
                "routes it to the operator) or rephrase so the record says "
                "what it means. This screen only ever escalates - it never "
                "permits a write."
            )


def append_record(
    record: DecisionRecord,
    *,
    journal_path: str | os.PathLike[str],
) -> Path:
    """Append one validated record to the JSONL journal.

    Creates the parent directory if missing; flushes and best-effort
    ``fsync``es so an external reader sees the line as soon as the call
    returns. A single append-mode write of a sub-``PIPE_BUF`` line is
    atomic against other appenders, so no temp-and-rename is needed —
    the same reasoning ``consensus_journal.append_record`` uses.
    """
    path = Path(journal_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record.to_dict(), ensure_ascii=False)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
        handle.flush()
        try:
            os.fsync(handle.fileno())
        except OSError:
            pass
    return path


def record_decision(
    record: DecisionRecord,
    *,
    session_set_dir: str | os.PathLike[str],
) -> Path:
    """The blessed writer: validate, then append. Nothing else writes here.

    Validation runs first and in full, so a refused decision never leaves
    a partial or half-legal line behind.
    """
    validate_record(record)
    return append_record(record, journal_path=journal_path_for(session_set_dir))


def make_record(
    *,
    session_set: str,
    session_number: int,
    question: str,
    decision: str,
    authority: str,
    rubric_line: str,
    options: Iterable[Mapping[str, Any] | DecisionOption],
    reversibility: str,
    verification_effect: str,
    uat_decide: bool = False,
    operator_attestation: Optional[str] = None,
    consensus: Optional[Mapping[str, Any]] = None,
    timestamp: Optional[str] = None,
    **extra: Any,
) -> DecisionRecord:
    """Build a :class:`DecisionRecord` from plain values.

    Options may be :class:`DecisionOption` instances or mappings with
    ``option`` / ``consequence`` / ``reversible`` keys, so a CLI or a
    JSON caller does not have to import the dataclass.
    """
    built: list[DecisionOption] = []
    for item in options:
        if isinstance(item, DecisionOption):
            built.append(item)
            continue
        try:
            built.append(
                DecisionOption(
                    option=str(item["option"]),
                    consequence=str(item["consequence"]),
                    reversible=bool(item["reversible"]),
                )
            )
        except KeyError as exc:
            raise ValueError(
                "each option needs 'option', 'consequence' and "
                f"'reversible' keys; missing {exc.args[0]!r}"
            ) from exc
    return DecisionRecord(
        timestamp=timestamp or now_iso(),
        session_set=session_set,
        session_number=session_number,
        question=question,
        decision=decision,
        authority=authority,
        rubric_line=rubric_line,
        options=tuple(built),
        reversibility=reversibility,
        verification_effect=verification_effect,
        uat_decide=uat_decide,
        operator_attestation=operator_attestation,
        consensus=consensus,
        extra=extra,
    )


def read_decisions(
    session_set_dir: str | os.PathLike[str],
) -> list[dict]:
    """Every journaled decision for a set, in write order.

    A malformed line is skipped rather than raising: the journal is an
    audit trail, and one unreadable line must not hide the rest of it.
    """
    path = journal_path_for(session_set_dir)
    if not path.exists():
        return []
    out: list[dict] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                out.append(parsed)
    return out


def uat_decide_items(
    session_set_dir: str | os.PathLike[str],
) -> list[dict]:
    """Decisions deferred to the UAT walk's Decide section.

    A UX-preference deferral is journaled with ``uat_decide: true`` at
    the moment it is deferred, so the walk author does not have to
    reconstruct the list from memory at the end of the set.
    """
    return [d for d in read_decisions(session_set_dir) if d.get("uat_decide")]


# --- CLI -----------------------------------------------------------------


def _print_decisions(rows: Sequence[Mapping[str, Any]]) -> None:
    if not rows:
        print("[dabbler] No journaled decisions.")
        return
    for row in rows:
        mark = "[H]" if row.get("authority") == "human" else "[A]"
        flag = " [UAT]" if row.get("uat_decide") else ""
        print(
            f"{mark} s{row.get('session_number')} "
            f"{row.get('rubric_line')}{flag}: {row.get('decision')}"
        )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="decision_journal",
        description=(
            "Read or append the per-set decision journal (decisions.jsonl). "
            "The rubric routes a decision by AUTHORITY, not judgment load; "
            "a verification-reducing decision cannot be self-authorized."
        ),
    )
    parser.add_argument(
        "--session-set-dir",
        help=(
            "Path to the session-set directory. Required for every mode "
            "except --rubric, which reads nothing from disk."
        ),
    )
    parser.add_argument(
        "--uat-decide-only",
        action="store_true",
        help=(
            "List only decisions tagged for the UAT walk's Decide section."
        ),
    )
    parser.add_argument(
        "--append-json",
        metavar="JSON",
        help=(
            "Append one decision given as a JSON object (or '-' to read it "
            "from stdin). Refused if it fails validation."
        ),
    )
    parser.add_argument(
        "--rubric",
        action="store_true",
        help="Print the rubric lines this journal accepts, then exit.",
    )
    args = parser.parse_args(argv)

    if args.rubric:
        print("Human-required triggers (operator authority):")
        for line in HUMAN_AUTHORITY_TRIGGERS:
            print(f"  {line}")
        print("Ordered AI tiebreaks (first one that decides is recorded):")
        for index, line in enumerate(AI_TIEBREAKS, start=1):
            print(f"  {index}. {line}")
        return 0

    if not args.session_set_dir:
        print("[dabbler] --session-set-dir is required (or use --rubric).")
        return 2

    set_dir = Path(args.session_set_dir)

    if args.append_json:
        raw = (
            sys.stdin.read()
            if args.append_json == "-"
            else args.append_json
        )
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(f"[dabbler] --append-json is not valid JSON: {exc}")
            return 2
        if not isinstance(payload, dict):
            print("[dabbler] --append-json must be a JSON object.")
            return 2
        try:
            record = make_record(**payload)
            path = record_decision(record, session_set_dir=set_dir)
        except VerificationReductionRefused as exc:
            print(f"[dabbler] REFUSED: {exc}")
            return 5
        except (ValueError, TypeError) as exc:
            print(f"[dabbler] Invalid decision record: {exc}")
            return 2
        print(f"[dabbler] Journaled decision -> {path}")
        return 0

    rows = (
        uat_decide_items(set_dir) if args.uat_decide_only
        else read_decisions(set_dir)
    )
    _print_decisions(rows)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
