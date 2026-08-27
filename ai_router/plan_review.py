"""Checking an approved plan before it becomes one: free mechanical
checks first, then a cheap model against a fixed checklist.

The order is the whole economy of this module. The mechanical checks cost
nothing and settle a round on their own, so a plan with a missing goal or
undrived risk flags never reaches a model. Only a plan that survives them
is worth paying to read, and then the cheapest model that can do the job
reads it against fixed text -- not free-form critique -- and answers
approve, amend, or send it to a human, per step.

Two rules keep a supervisor from resubmitting its way to an approval.
A revision that does not touch the fields the previous round objected to
is refused without a model call, by comparing digests the previous round
recorded. And a plan that has been rejected twice stops being the cheap
model's problem: it routes to the premium model, as does any plan whose
derived risk flags say a mistake here is expensive.

Every round lands in ``plan-review.jsonl`` under the run directory,
schema-validated and append-only, bound to the exact plan content it
judged.

An amendment to an approved plan runs the same machinery, scoped: the
free checks, the prompt and the verdicts cover the changed step and
nothing else. Re-approving a step the amendment did not touch would buy
an answer the record already holds.
"""

from __future__ import annotations

import datetime
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import jsonschema

from .approved_plan import (
    RISK_DEPENDENCY_CHANGE,
    RISK_SENSITIVE_PATH,
    compute_plan_hash,
    derive_risk_flags,
)
from .evidence import hash_bytes

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "plan-review.schema.json"
_schema_cache: Optional[dict] = None

SCHEMA_VERSION = 1
REVIEW_FILENAME = "plan-review.jsonl"

OUTCOME_APPROVED = "approved"
OUTCOME_AMEND = "amend"
OUTCOME_HUMAN = "human"
OUTCOME_BOUNCED = "bounced"

VERDICT_APPROVE = "approve"
VERDICT_AMEND = "amend"
VERDICT_HUMAN = "human"
_VERDICTS = (VERDICT_APPROVE, VERDICT_AMEND, VERDICT_HUMAN)

# The fields a reviewer may object to, and therefore the only fields a
# revision can answer an objection by changing.
OBJECTABLE_FIELDS = ("intent", "file_envelope", "evidence_contract")

TRIGGER_HIGH_RISK = "high-risk-flag"
TRIGGER_REPEAT_OBJECTION = "repeat-objection"

# Only two of the four derived flags route to the premium model. The other
# two -- public-interface and integration-module -- fire on nearly every
# step in a codebase of any size, and a trigger that always fires is not a
# trigger, it is the default. These two are narrow and expensive to get
# wrong: they mark a step reaching for the machinery that decides what a
# session may do, or for the dependency set underneath all of it.
HIGH_RISK_FLAGS = frozenset({RISK_SENSITIVE_PATH, RISK_DEPENDENCY_CHANGE})

# Two rejected revisions is where the cheap model stops being the right
# reader: it has now failed twice to get an answer it will accept.
ESCALATE_AFTER_REJECTIONS = 2

# The two roles a plan review draws from. The escalated one is a stronger
# reader, not a higher tier: which models fill either role is declared in
# router-config.yaml, and this module only decides which of the two to ask.
ROLE_PLAN_REVIEW = "plan-review"
ROLE_PLAN_REVIEW_ESCALATED = "plan-review-escalated"


class PlanReviewError(RuntimeError):
    """The review record could not be read or written as the machine owns
    it."""


def _schema() -> dict:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache


def _now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat()


# --- Goals: the session's own work, never the ceremony around it ---------

# The framework's own lifecycle steps, recognized by the framework rather
# than flagged by a supervisor: a step kind a supervisor sets is a step
# kind a supervisor sets wrong. These six phrases open every session's
# ceremony rows in every spec, and a plan never carries them.
_LIFECYCLE_RES = (
    re.compile(r"^register\b", re.IGNORECASE),
    re.compile(r"^affected[- ]tests?\b", re.IGNORECASE),
    re.compile(r"^cross-provider verification\b", re.IGNORECASE),
    re.compile(r"^full test suite\b", re.IGNORECASE),
    re.compile(r"^close[- ]?out\b", re.IGNORECASE),
    re.compile(r"^technical/educational documentation\b", re.IGNORECASE),
)


def is_lifecycle_step(text: str) -> bool:
    """True for the fixed ceremony every session pays. Those steps have no
    file envelope and no evidence of their own to declare, so they are not
    plan steps and are not goals a plan must cover."""
    cleaned = re.sub(r"[*`_]", "", str(text or "")).strip()
    return any(rx.match(cleaned) for rx in _LIFECYCLE_RES)


@dataclass(frozen=True)
class Goal:
    """One unit of a session's own declared work, as the spec states it."""
    key: str
    text: str


def session_goals(spec_text: str, session_number: int) -> list:
    """The session's non-ceremony steps from ``spec.md``, each keyed by the
    same identity the plan's ``step_id`` and the activity log's ``stepKey``
    use -- the authored ``(slug: xxx)`` marker when the step declares one,
    the six-word truncation when it does not."""
    from .session import parse_session_plans, split_slug_marker
    from .writers import plan_step_key

    plan = next(
        (p for p in parse_session_plans(spec_text)
         if p["number"] == session_number),
        None,
    )
    if plan is None:
        return []
    goals = []
    for ordinal, text in enumerate(plan["steps"], start=1):
        clean_text, slug = split_slug_marker(text)
        if is_lifecycle_step(clean_text):
            continue
        goals.append(
            Goal(key=slug or plan_step_key(clean_text, ordinal),
                 text=clean_text)
        )
    return goals


# --- The free checks -----------------------------------------------------

CHECK_SCHEMA = "schema"
CHECK_GOAL_WITHOUT_STEP = "goal-without-step"
CHECK_STEP_WITHOUT_GOAL = "step-without-goal"
CHECK_ENVELOPE_OMITS_NAMED_FILE = "envelope-omits-named-file"
CHECK_RISK_FLAGS_NOT_DERIVED = "risk-flags-not-derived"


@dataclass(frozen=True)
class Finding:
    check: str
    detail: str
    step_id: Optional[str] = None

    def as_row(self) -> dict:
        return {
            "check": self.check, "detail": self.detail, "step_id": self.step_id
        }


# A backticked token that names a file: it carries a path separator or a
# known source/config extension. Prose in backticks (`step_id`, `verify`)
# is not a path and must not be read as one.
_NAMED_FILE_RE = re.compile(
    r"`([^`\s]+(?:/[^`\s]+|\.(?:py|ts|js|json|ya?ml|md|toml|cfg))[^`\s]*)`"
)


def named_files(text: str) -> list:
    """Repo paths the spec names literally in a goal's own wording. A file
    the spec asks for by name and no envelope declares is the cheapest
    omission there is to catch."""
    out = []
    for token in _NAMED_FILE_RE.findall(str(text or "")):
        token = token.rstrip(".,;:").replace("\\", "/")
        if token and token not in out:
            out.append(token)
    return out


def _envelope_union(plan: dict) -> set:
    paths = set()
    for step in plan.get("steps") or []:
        for path in step.get("file_envelope") or []:
            paths.add(str(path).replace("\\", "/").lstrip("/"))
    return paths


def _schema_findings(plan: dict) -> list:
    """The schema is the one implementation of "a step declares an evidence
    contract" and "a step declares a file envelope" -- it refuses both at
    write time. Here the same schema is asked to *report* rather than
    raise, so a plan under review is told everything at once instead of one
    exception at a time. Re-stating those rules as hand-written checks
    would be a second implementation of a rule that already has one."""
    from .approved_plan import _schema as plan_schema

    validator = jsonschema.Draft202012Validator(plan_schema())
    findings = []
    for error in sorted(validator.iter_errors(plan), key=str):
        location = "/".join(str(p) for p in error.absolute_path) or "(root)"
        step_id = None
        path = list(error.absolute_path)
        if len(path) >= 2 and path[0] == "steps" and isinstance(path[1], int):
            steps = plan.get("steps") or []
            if path[1] < len(steps):
                step_id = (steps[path[1]] or {}).get("step_id")
        findings.append(Finding(
            check=CHECK_SCHEMA,
            detail=f"{location}: {error.message}",
            step_id=step_id,
        ))
    return findings


def free_checks(plan: dict, spec_text: str, session_number: int,
                workspace_root=None, only_steps=None) -> list:
    """Every check that costs nothing, run before any model.

    A non-empty result settles the round on its own: there is no reason to
    pay a model to read a plan that a free check already refused.

    *only_steps* scopes the result to an amendment's changed steps.
    Findings that name no step -- a plan document that is malformed as a
    whole -- always survive the scope, because a plan nobody can read is
    not one step's problem.
    """
    findings = list(_schema_findings(plan))

    goals = session_goals(spec_text, session_number)
    steps = plan.get("steps") or []
    step_ids = {s.get("step_id") for s in steps if s.get("step_id")}
    goal_keys = {g.key for g in goals}

    for goal in goals:
        if goal.key not in step_ids:
            findings.append(Finding(
                check=CHECK_GOAL_WITHOUT_STEP,
                detail=(
                    f"the spec's goal {goal.key!r} has no step in the plan: "
                    f"{goal.text[:120]!r}"
                ),
                step_id=goal.key,
            ))

    for step in steps:
        step_id = step.get("step_id")
        if step_id and step_id not in goal_keys:
            findings.append(Finding(
                check=CHECK_STEP_WITHOUT_GOAL,
                detail=(
                    f"step {step_id!r} answers no goal in the spec for "
                    f"session {session_number} -- it is either ceremony, "
                    "which never enters a plan, or work nobody asked for"
                ),
                step_id=step_id,
            ))

    envelope = _envelope_union(plan)
    for goal in goals:
        if goal.key not in step_ids:
            continue  # already reported as an uncovered goal
        for path in named_files(goal.text):
            if path not in envelope:
                findings.append(Finding(
                    check=CHECK_ENVELOPE_OMITS_NAMED_FILE,
                    detail=(
                        f"goal {goal.key!r} names {path!r} but no step's "
                        "file envelope declares it"
                    ),
                    step_id=goal.key,
                ))

    for step in steps:
        declared = list(step.get("risk_flags") or [])
        actual = derive_risk_flags(
            step.get("file_envelope") or [], workspace_root
        )
        if declared != actual:
            findings.append(Finding(
                check=CHECK_RISK_FLAGS_NOT_DERIVED,
                detail=(
                    f"step {step.get('step_id')!r} carries risk_flags "
                    f"{declared!r}, but its file envelope derives {actual!r} "
                    "-- risk is derived, never declared"
                ),
                step_id=step.get("step_id"),
            ))

    if only_steps is None:
        return findings
    scope = set(only_steps)
    return [f for f in findings if f.step_id is None or f.step_id in scope]


# --- The fixed checklist -------------------------------------------------

CHECKLIST = """\
1. Would the declared evidence actually tell us this step worked? Could the
   step be done wrong and every evidence item still pass? If so, the
   evidence is the defect, not the intent.
2. Is each evidence item's type honest? An item typed `deterministic` must
   be something a command can decide with no model reading anything.
3. Does the file envelope hold the files this intent needs, and nothing it
   does not?
4. Is the intent one concrete action a reader could check, rather than a
   bundle of several?
"""

_RESPONSE_FORMAT = """\
Answer every step, in this exact block form and nothing else:

STEP: <step_id>
VERDICT: approve | amend | human
FIELDS: <comma-separated: intent, file_envelope, evidence_contract>
WHY: <one sentence>

VERDICT approve means the evidence would genuinely prove the step; leave
FIELDS empty. VERDICT amend means a listed field must change before this
plan is approved. VERDICT human means the call needs a person, not a
bigger model. Judge the proof, not the prose.\
"""


def build_review_prompt(plan: dict, goals: list, only_steps=None) -> str:
    """The reviewer's whole input: fixed checklist, fixed response form,
    and the plan. The checklist is fixed text on purpose -- a reviewer
    inventing its own criteria each round is the free-form critique this
    design replaced.

    *only_steps* narrows the prompt to an amendment's changed steps. The
    unchanged ones are not shown, because a reviewer shown a step it is
    not being asked about is a reviewer that may object to it -- and
    re-approving what was already approved is the ceremony this design is
    spending less of."""
    scope = None if only_steps is None else set(only_steps)
    steps = [
        s for s in (plan.get("steps") or [])
        if scope is None or s.get("step_id") in scope
    ]
    lines = [
        "You are reviewing a pre-registered plan for one coding session.",
        "The plan is not code. It declares, per step, what will be done, "
        "which files it may touch, and what evidence will prove it worked.",
        "",
    ]
    if scope is not None:
        lines += [
            "This is an amendment to a plan that was already approved. "
            "Only the amended step(s) are shown, and only they are yours "
            "to judge.",
            "",
        ]
    lines += [
        "Your assignment is the evidence. Work this checklist and nothing "
        "else:",
        "",
        CHECKLIST,
        "",
        _RESPONSE_FORMAT,
        "",
        "--- The session's goals, as its spec states them ---",
    ]
    for goal in goals:
        lines.append(f"- {goal.key}: {goal.text}")
    lines.append("")
    lines.append("--- The plan under review ---")
    for step in steps:
        lines.append("")
        lines.append(f"STEP: {step.get('step_id')}")
        lines.append(f"  intent: {step.get('intent')}")
        lines.append(
            f"  file_envelope: {', '.join(step.get('file_envelope') or [])}"
        )
        lines.append("  evidence_contract:")
        for item in step.get("evidence_contract") or []:
            lines.append(
                f"    - [{item.get('kind')}] {item.get('description')}"
            )
        flags = step.get("risk_flags") or []
        lines.append(f"  derived risk flags: {', '.join(flags) or 'none'}")
    return "\n".join(lines)


@dataclass
class StepVerdict:
    step_id: str
    verdict: str
    objected_fields: list = field(default_factory=list)
    reason: str = ""

    def as_row(self) -> dict:
        return {
            "step_id": self.step_id,
            "verdict": self.verdict,
            "objected_fields": list(self.objected_fields),
            "reason": self.reason,
        }


_STEP_LINE_RE = re.compile(r"^\s*STEP:\s*(\S+)", re.IGNORECASE)
_FIELD_RE = re.compile(r"^\s*(VERDICT|FIELDS|WHY):\s*(.*)$", re.IGNORECASE)


def parse_review_response(response: str, step_ids) -> list:
    """Parse the reviewer's blocks into one verdict per step.

    Fails closed in every direction: a step the reviewer did not answer,
    and a verdict that is not exactly one of the three tokens, both become
    ``human``. An unanswered step is not an approval, and a reviewer that
    answered in a shape nobody asked for has not approved anything either.
    """
    blocks: dict = {}
    current = None
    for line in str(response or "").splitlines():
        step_match = _STEP_LINE_RE.match(line)
        if step_match:
            current = step_match.group(1).strip().strip("`*")
            blocks.setdefault(current, {})
            continue
        if current is None:
            continue
        field_match = _FIELD_RE.match(line)
        if field_match:
            key = field_match.group(1).upper()
            blocks[current].setdefault(key, field_match.group(2).strip())

    verdicts = []
    for step_id in step_ids:
        raw = blocks.get(step_id)
        if raw is None:
            verdicts.append(StepVerdict(
                step_id=step_id, verdict=VERDICT_HUMAN,
                objected_fields=list(OBJECTABLE_FIELDS),
                reason="the reviewer did not answer this step",
            ))
            continue
        token = (raw.get("VERDICT") or "").strip().lower()
        # Exact match or nothing. The response format asks for one bare
        # token, so anything else -- "approve/amend", a token trailed by a
        # clause, a hedge -- is a shape nobody asked for, and reading a
        # verdict out of it is how an ambiguous answer becomes an approval.
        token = token.strip("*`_ ").rstrip(".")
        if token not in _VERDICTS:
            verdicts.append(StepVerdict(
                step_id=step_id, verdict=VERDICT_HUMAN,
                objected_fields=list(OBJECTABLE_FIELDS),
                reason=f"unreadable verdict {raw.get('VERDICT')!r}",
            ))
            continue
        fields = [
            f for f in re.split(r"[,\s]+", (raw.get("FIELDS") or "").lower())
            if f in OBJECTABLE_FIELDS
        ]
        if token == VERDICT_APPROVE and fields:
            # An approval that also names fields needing change is two
            # answers, not one. Keeping the approval and discarding the
            # fields would throw away the objection the reviewer just
            # made, which is the one direction this parser must not fail.
            verdicts.append(StepVerdict(
                step_id=step_id, verdict=VERDICT_HUMAN,
                objected_fields=fields,
                reason=(
                    "approved while naming "
                    f"{', '.join(fields)} as needing change"
                ),
            ))
            continue
        # An objection that names no field it can be answered by would make
        # every revision a bounce. Objecting to everything is the honest
        # reading: the reviewer must be answerable.
        if token != VERDICT_APPROVE and not fields:
            fields = list(OBJECTABLE_FIELDS)
        verdicts.append(StepVerdict(
            step_id=step_id,
            verdict=token,
            objected_fields=[] if token == VERDICT_APPROVE else fields,
            reason=(raw.get("WHY") or "").strip(),
        ))
    return verdicts


# --- Anti-grind ----------------------------------------------------------

def _field_digest(step: dict, name: str) -> str:
    return hash_bytes(
        json.dumps(step.get(name), sort_keys=True,
                   separators=(",", ":")).encode("utf-8")
    )


def objected_field_digests(plan: dict, verdicts) -> dict:
    """A digest per objected field, so the next round can tell a real
    revision from a resubmission without reading anything."""
    by_id = {
        s.get("step_id"): s for s in (plan.get("steps") or [])
        if s.get("step_id")
    }
    out: dict = {}
    for verdict in verdicts:
        step = by_id.get(verdict.step_id)
        if step is None or not verdict.objected_fields:
            continue
        out[verdict.step_id] = {
            name: _field_digest(step, name)
            for name in verdict.objected_fields
        }
    return out


def revision_answers_objections(plan: dict, prior_digests: dict) -> bool:
    """True when this plan changed at least one field the previous round
    objected to. A step the revision deleted outright counts as answered:
    the objected field is gone.

    This is the whole anti-grind rule, and it costs nothing -- which is the
    point. A supervisor cannot resubmit its way to an approval, because a
    resubmission never reaches the model.
    """
    if not prior_digests:
        return True
    by_id = {
        s.get("step_id"): s for s in (plan.get("steps") or [])
        if s.get("step_id")
    }
    for step_id, fields in prior_digests.items():
        step = by_id.get(step_id)
        if step is None:
            return True
        for name, digest in fields.items():
            if _field_digest(step, name) != digest:
                return True
    return False


def escalation_triggers(plan: dict, prior_rounds, only_steps=None) -> list:
    """Which triggers, if any, route this round to the premium model.

    Both are recorded when both fire: a precedence rule would hide one of
    them from the record, and the record is the point.

    Rejections are counted since the most recent approval, not since the
    session began. An approved plan that took two rounds to get there has
    settled its strikes; carrying them forward would send every later
    amendment to the premium model for a disagreement that is over.
    """
    scope = None if only_steps is None else set(only_steps)
    triggers = []
    for step in plan.get("steps") or []:
        if scope is not None and step.get("step_id") not in scope:
            continue
        if HIGH_RISK_FLAGS.intersection(step.get("risk_flags") or []):
            triggers.append(TRIGGER_HIGH_RISK)
            break
    rejections = 0
    for row in prior_rounds:
        if row.get("outcome") == OUTCOME_APPROVED:
            rejections = 0
            continue
        if row.get("model_called"):
            rejections += 1
    if rejections >= ESCALATE_AFTER_REJECTIONS:
        triggers.append(TRIGGER_REPEAT_OBJECTION)
    return triggers


# --- The record ----------------------------------------------------------

def review_path(run_dir) -> Path:
    return Path(run_dir) / REVIEW_FILENAME


def validate_round(record: dict) -> dict:
    try:
        jsonschema.validate(record, _schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise PlanReviewError(
            f"{REVIEW_FILENAME} row failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc
    return record


def read_rounds(run_dir) -> list:
    """Every recorded round, oldest first. A malformed row is refused
    rather than skipped: a review history with a hole in it is not a
    history."""
    path = review_path(run_dir)
    if not path.exists():
        return []
    rounds = []
    for number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise PlanReviewError(
                f"{path}: line {number} is not valid JSON: {exc}"
            ) from exc
        rounds.append(validate_round(record))
    return rounds


def _append_round(run_dir, record: dict) -> dict:
    validate_round(record)
    path = review_path(run_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, sort_keys=True) + "\n")
    return record


def _default_dispatch(prompt: str, *, role: str, session_set, session_number,
                      transport):
    from .route import route

    return route(
        prompt,
        task_type="plan-review",
        role=role,
        session_set=session_set,
        session_number=session_number,
        transport=transport,
    )


def review_round(
    run_dir, plan: dict, spec_text: str, session_number: int, *,
    workspace_root=None, session_set=None, dispatch=None, transport=None,
    only_steps=None,
) -> dict:
    """Review the plan once and record the round.

    Free first: the mechanical checks run before anything is spent, and a
    finding among them ends the round with no model call. Then the
    anti-grind bounce, which is also free. Only what survives both is worth
    a model, and which model is decided by the derived risk flags and by
    how many times this plan has already been rejected.

    *only_steps* reviews an amendment: the checks, the prompt and the
    verdicts cover the changed steps and nothing else, and the row records
    which steps that was.
    """
    prior = read_rounds(run_dir)
    round_number = len(prior) + 1
    core_hash = compute_plan_hash(plan)
    scope = None if only_steps is None else list(only_steps)

    base = {
        "schema_version": SCHEMA_VERSION,
        "round": round_number,
        "recorded_at": _now_iso(),
        "plan_core_hash": core_hash,
        "free_findings": [],
        "step_verdicts": [],
        "escalation_triggers": [],
        "objected_field_digests": {},
        "reviewer": None,
    }
    if scope is not None:
        base["reviewed_steps"] = scope

    findings = free_checks(
        plan, spec_text, session_number, workspace_root, only_steps=scope
    )
    if findings:
        return _append_round(run_dir, dict(
            base,
            outcome=OUTCOME_AMEND,
            model_called=False,
            free_findings=[f.as_row() for f in findings],
        ))

    last = prior[-1] if prior else None
    prior_digests = (last or {}).get("objected_field_digests") or {}
    if prior_digests and not revision_answers_objections(plan, prior_digests):
        return _append_round(run_dir, dict(
            base,
            outcome=OUTCOME_BOUNCED,
            model_called=False,
            objected_field_digests=prior_digests,
        ))

    triggers = escalation_triggers(plan, prior, only_steps=scope)
    role = ROLE_PLAN_REVIEW_ESCALATED if triggers else ROLE_PLAN_REVIEW
    goals = session_goals(spec_text, session_number)
    prompt = build_review_prompt(plan, goals, only_steps=scope)
    caller = dispatch or _default_dispatch
    result = caller(
        prompt, role=role, session_set=session_set,
        session_number=session_number, transport=transport,
    )

    step_ids = [
        s.get("step_id") for s in (plan.get("steps") or [])
        if s.get("step_id") and (scope is None or s.get("step_id") in scope)
    ]
    verdicts = parse_review_response(
        getattr(result, "content", "") or "", step_ids
    )
    tokens = {v.verdict for v in verdicts}
    if VERDICT_HUMAN in tokens:
        outcome = OUTCOME_HUMAN
    elif VERDICT_AMEND in tokens:
        outcome = OUTCOME_AMEND
    else:
        outcome = OUTCOME_APPROVED

    return _append_round(run_dir, dict(
        base,
        outcome=outcome,
        model_called=True,
        step_verdicts=[v.as_row() for v in verdicts],
        escalation_triggers=triggers,
        objected_field_digests=objected_field_digests(plan, verdicts),
        reviewer={
            "model": getattr(result, "model_name", "") or "",
            "provider": getattr(result, "provider", "") or "",
            "role": role,
            "transport": getattr(result, "transport", "") or "",
        },
    ))


# --- Amendments ----------------------------------------------------------

def review_amendment(
    run_dir, spec_text: str, session_number: int, *, step_id: str,
    reason: str, added_files=None, evidence_contract=None,
    workspace_root=None, session_set=None, dispatch=None, transport=None,
) -> tuple:
    """Put one proposed amendment through the same checks the plan passed,
    scoped to the step it changes, and append it only if they approve.

    Returns ``(round_record, plan_or_None)``; the plan is ``None`` when the
    round did not approve, and nothing was appended -- a rejected amendment
    leaves the approved plan exactly as it was.

    Only the changed step is re-checked. Re-approving the steps an
    amendment does not touch would cost a model call per unchanged step to
    re-derive an answer already on the record.
    """
    from .approved_plan import PlanImmutableError, effective_plan, read_plan

    if not added_files and not evidence_contract:
        raise ValueError(
            "an amendment must carry a change: added_files, an "
            "evidence_contract, or both"
        )
    plan = read_plan(run_dir)
    if not plan.get("approved"):
        raise PlanImmutableError(
            f"{run_dir}: cannot amend a plan that has not been approved"
        )
    if not any(s.get("step_id") == step_id for s in plan.get("steps") or []):
        raise ValueError(
            f"{run_dir}: step_id {step_id!r} is not declared in this plan"
        )

    proposed = dict(plan)
    proposed["amendments"] = list(plan.get("amendments") or []) + [{
        "recorded_at": _now_iso(),
        "step_id": step_id,
        "reason": reason,
        **({"added_files": list(added_files)} if added_files else {}),
        **({"evidence_contract": list(evidence_contract)}
           if evidence_contract else {}),
    }]
    candidate = effective_plan(proposed, workspace_root)

    record = review_round(
        run_dir, candidate, spec_text, session_number,
        workspace_root=workspace_root, session_set=session_set,
        dispatch=dispatch, transport=transport, only_steps=[step_id],
    )
    if record.get("outcome") != OUTCOME_APPROVED:
        return record, None

    from .approved_plan import append_amendment

    return record, append_amendment(
        run_dir, step_id=step_id, reason=reason, added_files=added_files,
        evidence_contract=evidence_contract,
    )

