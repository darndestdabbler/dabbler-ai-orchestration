"""Tests for the forward half of the step checklist (Set 114 S2).

Set 111 S4 shipped a checklist that renders what a session has **done**.
This set makes it show what is **coming** — without teaching the renderer
to invent rows, which that session deliberately ruled out. The plan is
written into ``activity-log.json`` at ``start_session`` as ``pending``
entries, and the renderer reconciles it against what actually gets
logged.

The load-bearing behaviours, and what each guards:

* **One parser.** The step texts come from ``spec_admission``, which
  already parses these lists for the size cap (L-069-1).
* **Nothing is dropped in either direction.** An unplanned step appears;
  a planned step nobody did stays ``[ ]``.
* **The plan owns position, the logged step owns content.** A real step
  cannot reorder the plan under the operator.
* **The plan is not work.** Seeded entries must not satisfy a close gate
  that exists to prove the session logged something — the falsifier
  plants a plan-only session and asserts the refusal (L-112-1).
"""

from __future__ import annotations

import json

import pytest

from ai_router import gate_checks
from ai_router import session_checklist as sc
from ai_router import spec_admission
from ai_router.session_log import SessionLog


SPEC = """# Fixture spec

### Session 1 of 2: The first one

**Steps:**

1. Register.
2. **Build the thing.** A longer sentence that wraps
   across two source lines and keeps going.
3. **Verify it.** Another one.

**Creates:** a thing
**Touches:** `ai_router/thing.py`

---

### Session 2 of 2: The second one

**Steps:**

1. Register.
2. Do the other thing.
"""


def _make_set(tmp_path, *, spec=SPEC, session=1, name="114-fixture"):
    set_dir = tmp_path / name
    set_dir.mkdir(parents=True)
    if spec is not None:
        (set_dir / "spec.md").write_text(spec, encoding="utf-8")
    (set_dir / "session-state.json").write_text(
        json.dumps(
            {
                "schemaVersion": 4,
                "sessionSetName": name,
                "status": "in-progress",
                "totalSessions": 2,
                "currentSession": session,
                "completedSessions": [],
                "sessions": [
                    {
                        "number": session,
                        "status": "in-progress",
                        "startedAt": "2026-01-01T09:00:00-05:00",
                        "completedAt": None,
                        "orchestrator": None,
                        "verificationVerdict": None,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return str(set_dir)


def _entries(set_dir):
    with open(f"{set_dir}/activity-log.json", encoding="utf-8") as fh:
        return json.load(fh)["entries"]


def _keys(rows):
    return [r.step_key for r in rows]


def _close_the_session(tmp_path, *, name="114-fixture", session=1):
    """Flip the fixture's session to ``complete`` in ``session-state.json``.

    Set 127 S1's derivation is gated on the state file — the single
    source of truth for progress — so the falsifier for "a closed session
    derives nothing" has to move the state, not the ledger. Written here
    rather than through ``close_session`` because the gates that writer
    runs are a whole other session's worth of fixture, and the only fact
    under test is the one field the derivation reads.
    """
    path = tmp_path / name / "session-state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    for entry in state["sessions"]:
        if entry.get("number") == session:
            entry["status"] = "complete"
            entry["completedAt"] = "2026-01-01T17:00:00-05:00"
    state["status"] = "complete"
    path.write_text(json.dumps(state), encoding="utf-8")


def _in_flight(rows):
    """Step keys the checklist shows as in flight.

    Set 120 S3 removed the ``<- here`` marker: what is current is no
    longer a rule's single answer but the ``in-progress`` status the
    strict writer guarantees, read straight off the row. This returns a
    LIST because zero and two are both real answers now.

    Set 127 S1 reads the row's ``box`` rather than its raw ``status``, so
    a DERIVED active step counts here too — this helper answers "what
    does the checklist show as running", and the derivation is exactly
    that and nothing more. A test that wants the RECORD instead asserts
    on ``status``, which the derivation never touches.
    """
    return [
        r.step_key for r in rows if r.box == sc.IN_PROGRESS_BOX
    ]


class TestStepTextParsing:
    def test_the_first_step_is_not_empty(self):
        """The regression that made this parser worth its own test.

        ``_STEP_RE``'s leading ``\\s{0,3}`` can consume the newline before
        the marker, so a step introduced by a blank line matched from
        that blank line. Counting never noticed; slicing produced an
        empty first step for every session in every spec.
        """
        plans = spec_admission.parse_session_plans(SPEC)
        assert plans[0].steps[0] == "Register."

    def test_a_wrapped_step_keeps_its_continuation_lines(self):
        plans = spec_admission.parse_session_plans(SPEC)
        assert plans[0].steps[1] == (
            "**Build the thing.** A longer sentence that wraps across two "
            "source lines and keeps going."
        )

    def test_the_creates_trailer_is_not_part_of_the_last_step(self):
        plans = spec_admission.parse_session_plans(SPEC)
        assert plans[0].steps[2] == "**Verify it.** Another one."
        assert "Creates" not in plans[0].steps[2]

    def test_the_count_is_the_text_it_found(self):
        """One parser: the cap cannot disagree with the plan operators see."""
        for plan in spec_admission.parse_session_plans(SPEC):
            assert plan.step_count == len(plan.steps)

    def test_steps_inside_a_fence_are_not_this_specs_steps(self):
        spec = (
            "### Session 1 of 1: T\n\n1. Real step.\n\n"
            "```\n1. Sample from the authoring guide.\n2. Another sample.\n```\n"
        )
        plans = spec_admission.parse_session_plans(spec)
        assert plans[0].steps == ("Real step.",)

    def test_nested_items_belong_to_their_parent_step(self):
        spec = (
            "### Session 1 of 1: T\n\n"
            "1. Parent step.\n"
            "    - a nested bullet\n"
            "2. Second step.\n"
        )
        plans = spec_admission.parse_session_plans(spec)
        assert plans[0].step_count == 2
        assert "nested bullet" in plans[0].steps[0]


class TestPlanStepKey:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Register.", "register"),
            ("**Build the thing.** Detail follows.", "build-the-thing"),
            ("**Handle the messy cases with tests:** a spec", "handle-the-messy-cases-with-tests"),
            ("Full pytest at close after freeze; verify, close.", "full-pytest-at-close-after-freeze"),
        ],
    )
    def test_the_key_reads_as_the_steps_name(self, text, expected):
        assert sc.plan_step_key(text, 1) == expected

    def test_a_step_with_no_words_still_gets_a_key(self):
        assert sc.plan_step_key("...", 4) == "step-4"

    def test_the_key_is_ascii_only(self):
        key = sc.plan_step_key("**Don\u2019t \u2014 break the console.**", 1)
        key.encode("ascii")
        assert key.startswith("don")


class TestSeeding:
    def test_the_plan_lands_in_the_ledger_in_spec_order(self, tmp_path):
        set_dir = _make_set(tmp_path)
        written = sc.seed_session_plan(set_dir, 1, total_sessions=2)
        assert [e["stepKey"] for e in written] == [
            "register",
            "build-the-thing",
            "verify-it",
        ]
        assert [e["stepNumber"] for e in written] == [1, 2, 3]
        assert {e["status"] for e in written} == {"pending"}
        assert {e["kind"] for e in written} == {sc.PLAN_STEP_KIND}
        assert _entries(set_dir) == written

    def test_the_description_carries_the_specs_own_words(self, tmp_path):
        set_dir = _make_set(tmp_path)
        written = sc.seed_session_plan(set_dir, 1)
        assert written[1]["description"].startswith("**Build the thing.**")

    def test_only_this_sessions_steps_are_seeded(self, tmp_path):
        set_dir = _make_set(tmp_path, session=2)
        written = sc.seed_session_plan(set_dir, 2)
        assert [e["description"] for e in written] == [
            "Register.",
            "Do the other thing.",
        ]

    def test_a_re_registered_session_is_not_re_seeded(self, tmp_path):
        """A context reset re-runs start_session. It must not write."""
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        before = _entries(set_dir)
        assert sc.seed_session_plan(set_dir, 1) == []
        assert _entries(set_dir) == before

    def test_a_plan_changed_mid_flight_does_not_rewrite_the_ledger(
        self, tmp_path
    ):
        """The seeded plan is a snapshot of what the session set out to do.

        Re-seeding a mid-flight spec edit would write to activity-log.json
        during the session (the freshness risk this set's spec names) and
        would let the plan mutate under an operator who read it an hour
        ago. New work shows up when it is LOGGED, as an unplanned row.
        """
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        (tmp_path / "114-fixture" / "spec.md").write_text(
            SPEC.replace("3. **Verify it.** Another one.", "3. **Verify it.** Another one.\n4. **A late addition.** Added mid-flight."),
            encoding="utf-8",
        )
        assert sc.seed_session_plan(set_dir, 1) == []
        assert len(_entries(set_dir)) == 3

        SessionLog(set_dir).log_step(
            1, 4, "a-late-addition", "Did the late work.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == [
            "register",
            "build-the-thing",
            "verify-it",
            "a-late-addition",
        ]
        assert rows[-1].is_planned is False

    @pytest.mark.parametrize(
        "spec",
        [
            pytest.param(None, id="no spec.md at all"),
            pytest.param("# Just prose, no session headings.\n", id="predates the format"),
            pytest.param("### Session 1 of 1: Empty\n\nNo numbered steps here.\n", id="no parseable steps"),
        ],
    )
    def test_an_unparseable_spec_seeds_nothing_and_does_not_raise(
        self, tmp_path, spec
    ):
        """A consumer repo whose specs predate the format keeps working."""
        set_dir = _make_set(tmp_path, spec=spec)
        assert sc.seed_session_plan(set_dir, 1) == []
        assert sc.read_spec_steps(set_dir, 1) == []
        assert sc.build_rows(set_dir, 1) == []

    def test_a_session_the_spec_does_not_describe_seeds_nothing(self, tmp_path):
        set_dir = _make_set(tmp_path)
        assert sc.seed_session_plan(set_dir, 7) == []

    def test_an_unreadable_activity_log_is_a_no_op_not_a_crash(self, tmp_path):
        set_dir = _make_set(tmp_path)
        (tmp_path / "114-fixture" / "activity-log.json").write_text(
            "{not json", encoding="utf-8"
        )
        assert sc.seed_session_plan(set_dir, 1) == []

    def test_seeding_coexists_with_a_log_that_already_has_entries(
        self, tmp_path
    ):
        """Set 114 S2 itself: the session had logged steps before seeding shipped."""
        set_dir = _make_set(tmp_path)
        SessionLog(set_dir).log_step(1, 1, "register", "Registered.", "complete")
        written = sc.seed_session_plan(set_dir, 1)
        assert len(written) == 3
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "build-the-thing", "verify-it"]
        assert rows[0].status == "complete"
        assert rows[0].is_planned is False

    def test_has_seeded_plan_is_false_before_and_true_after(self, tmp_path):
        set_dir = _make_set(tmp_path)
        assert sc.has_seeded_plan(set_dir, 1) is False
        sc.seed_session_plan(set_dir, 1)
        assert sc.has_seeded_plan(set_dir, 1) is True
        assert sc.has_seeded_plan(set_dir, 2) is False


class TestReconciliation:
    def _seeded(self, tmp_path):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        return set_dir

    def test_an_unstarted_plan_renders_as_pending_rows(self, tmp_path):
        """The plan is a forecast — with one row the session is ON.

        Set 127 S1 changed the first row's box and nothing else. The
        RECORD still says ``pending`` for all three (asserted below, and
        it is what the ledger holds), all three are still planned rows,
        and rows 2-3 are still visibly unstarted. What moved is the
        answer to "which of these is the session working on", which for
        a session ``session-state.json`` reports as in flight is the
        first row nothing has been logged against.
        """
        rows = sc.build_rows(self._seeded(tmp_path), 1)
        assert [r.box for r in rows] == ["[~]", "[ ]", "[ ]"]
        assert [r.status for r in rows] == ["pending"] * 3
        assert all(r.is_planned for r in rows)
        assert _keys(rows) == ["register", "build-the-thing", "verify-it"]
        assert _in_flight(rows) == ["register"]

    def test_a_logged_step_claims_its_planned_row_by_step_number(
        self, tmp_path
    ):
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).log_step(
            1, 2, "built-it-differently", "Done.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "built-it-differently", "verify-it"]
        assert rows[1].status == "complete"
        assert rows[1].is_planned is False

    def test_a_logged_step_claims_its_planned_row_by_key(self, tmp_path):
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).log_step(
            1, 99, "verify-it", "Verified.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "build-the-thing", "verify-it"]
        assert rows[2].status == "complete"

    def test_a_planned_step_nobody_did_stays_visibly_unchecked(self, tmp_path):
        """A skipped planned row is never claimed or relabelled.

        Set 127 S1 moved its BOX: the spec's rule is "the lowest-numbered
        seeded plan row with nothing logged against it", and in a session
        the state file reports as in flight that is this row — the step
        still outstanding — even though a later step was logged first.
        What the derivation may not do, and does not do here, is claim
        the row: it is still planned, still carries the plan's own
        ``pending``, and still shows the spec's words rather than the
        logged step's.
        """
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 1, "register", "Registered.", "complete")
        log.log_step(1, 3, "verify-it", "Verified.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert rows[1].step_key == "build-the-thing"
        assert rows[1].status == "pending"
        assert rows[1].box == "[~]"
        assert rows[1].is_planned is True

    def test_an_unplanned_step_appears_rather_than_being_dropped(
        self, tmp_path
    ):
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).log_step(
            1, 9, "emergency-hotfix", "Not in the plan.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == [
            "register",
            "build-the-thing",
            "verify-it",
            "emergency-hotfix",
        ]

    def test_logging_out_of_order_does_not_reorder_the_plan(self, tmp_path):
        """The plan owns position; the logged step owns content."""
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 3, "verify-it", "Verified first.", "complete")
        log.log_step(1, 1, "register", "Registered second.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "build-the-thing", "verify-it"]
        assert rows[0].description == "Registered second."

    def test_a_second_step_sharing_a_number_appends_rather_than_evicting(
        self, tmp_path
    ):
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 2, "build-part-one", "First half.", "complete")
        log.log_step(1, 2, "build-part-two", "Second half.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == [
            "register",
            "build-part-one",
            "verify-it",
            "build-part-two",
        ]

    def test_bookkeeping_entries_never_claim_a_planned_step(self, tmp_path):
        """A policy record is the writer's, not the session's work.

        ``path_aware_critique`` / ``contract_gate`` / ``suggestion_disposition``
        entries are written by machinery at set start and carry
        ``stepNumber: 1``. Letting one claim planned step 1 would mark a
        step done that nobody did.

        Set 128 S1 goes further: such an entry is not a row at all. It was
        rendered as an extra ``complete`` step, so the panel showed the
        path-aware critique — a stage that runs once at the END of a set —
        finished minutes after registration. Both halves are asserted
        here, because "it did not claim the planned row" was true the
        whole time the display was still wrong.
        """
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).append_entry(
            {
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-001/path-aware-critique",
                "dateTime": "2026-01-01T09:00:01-05:00",
                "description": "Operator set pathAwareCritique: advisory.",
                "status": "complete",
                "kind": "path_aware_critique",
                "choice": "advisory",
            }
        )
        rows = sc.build_rows(set_dir, 1)
        assert rows[0].step_key == "register"
        # The bookkeeping entry did not CLAIM the row: it is still a
        # planned row carrying the plan's own ``pending``. Its box is
        # ``[~]`` because Set 127 S1 derives the first unlogged planned
        # row of an in-flight session as the active step, which is a
        # different claim from "a step was logged against it".
        assert rows[0].status == "pending"
        assert rows[0].box == "[~]"
        assert rows[0].is_planned is True
        assert "session-001/path-aware-critique" not in [r.step_key for r in rows]

    def test_an_inserted_step_cannot_evict_a_planned_row(self, tmp_path):
        """Round 1, supplementary: the mid-flight insertion cascade.

        The plan is seeded 1 register / 2 build / 3 verify. The spec is
        then edited to insert a step, and the orchestrator does what the
        constitution tells it to — logs under the spec's **current**
        numbers. With ordinal-first matching the inserted step claimed
        the build row, build claimed the verify row, and the verify row
        vanished: a planned step nobody executed, silently dropped,
        which is the one thing the spec forbids in both directions.

        Identity-before-ordinal is what fixes it: a renumbering can add
        an unplanned row, never evict a planned one.
        """
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 1, "register", "Registered.", "complete")
        log.log_step(1, 2, "inserted-mid-flight", "New work.", "complete")
        log.log_step(1, 3, "build-the-thing", "Built.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == [
            "register",
            "build-the-thing",
            "verify-it",
            "inserted-mid-flight",
        ]
        verify = rows[2]
        assert verify.is_planned is True
        assert verify.status == "pending"
        # `[~]` since Set 127 S1: it is the one planned row nothing has
        # been logged against, in a session that is in flight. The claim
        # this test makes is that it is still HERE, as a planned row with
        # the plan's own words, rather than evicted by the renumbering.
        assert verify.box == "[~]"
        assert rows[3].is_planned is False

    def test_a_key_match_wins_over_a_different_rows_number(self, tmp_path):
        """Identity beats ordinal, stated directly rather than by cascade."""
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).log_step(
            1, 2, "verify-it", "Verified early.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert rows[1].step_key == "build-the-thing"
        assert rows[1].is_planned is True
        assert rows[2].step_key == "verify-it"
        assert rows[2].status == "complete"


class TestOrdinalClaimingIsGatedOnTheSpec:
    """Round 3: ordinal reconciliation is an inference, so it must be earned.

    "Logged step 2 is planned step 2" holds only while the numbers the
    orchestrator logs are the numbers the plan was seeded with. Round 2
    tried to make identity-first matching enough; round 3 rejected it by
    logging the shifted step under an ordinary key, and was right —
    inside the ledger, a renumbered plan and an intact one have the
    identical shape. The signal is in `spec.md`.
    """

    def _seeded(self, tmp_path):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        return set_dir

    def _insert_a_step(self, tmp_path):
        (tmp_path / "114-fixture" / "spec.md").write_text(
            SPEC.replace(
                "2. **Build the thing.**",
                "2. **A step inserted mid-flight.** Newly required.\n"
                "3. **Build the thing.**",
            ).replace("3. **Verify it.** Another one.", "4. **Verify it.** Another one."),
            encoding="utf-8",
        )

    def _log_under_the_new_numbers(self, set_dir):
        log = SessionLog(set_dir)
        log.log_step(1, 1, "register", "Registered.", "complete")
        log.log_step(1, 2, "new-work", "The inserted work.", "complete")
        log.log_step(1, 3, "build", "Built it.", "complete")

    def test_an_inserted_step_cannot_evict_a_planned_row_under_any_key(
        self, tmp_path
    ):
        """The round-3 fixture exactly: ordinary keys, shifted numbers.

        Every original planned row survives. `verify-it` — planned,
        never executed — stays visibly `[ ]` instead of being claimed
        and relabelled by the shifted `build`.
        """
        set_dir = self._seeded(tmp_path)
        self._insert_a_step(tmp_path)
        self._log_under_the_new_numbers(set_dir)
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == [
            "register",
            "build-the-thing",
            "verify-it",
            "new-work",
            "build",
        ]
        assert [r.box for r in rows[1:3]] == ["[~]", "[ ]"]
        # `build-the-thing` boxes `[~]` as the derived active step (Set
        # 127 S1) and `verify-it` stays visibly unstarted; both are still
        # PLANNED rows carrying the plan's own words, which is what this
        # test is about — a renumbering evicted neither.
        assert [r.status for r in rows[1:3]] == ["pending", "pending"]
        assert all(r.is_planned for r in rows[1:3])
        assert not any(r.is_planned for r in rows[3:])

    def test_the_very_same_log_reconciles_normally_when_the_spec_held(
        self, tmp_path
    ):
        """The control. Identical ledger, unedited spec — ordinal claims apply.

        Without this, "never evict a planned row" would be trivially
        satisfiable by dropping ordinal matching altogether, which would
        double nearly every checklist: an orchestrator's step keys are
        short handles and almost never equal the slug the seeder derived
        from the spec's sentence.
        """
        set_dir = self._seeded(tmp_path)
        self._log_under_the_new_numbers(set_dir)
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "new-work", "build"]
        assert not any(r.is_planned for r in rows)

    def test_plan_matches_spec_is_true_only_for_an_intact_plan(self, tmp_path):
        set_dir = self._seeded(tmp_path)
        plan = [
            e for e in _entries(set_dir) if e.get("kind") == sc.PLAN_STEP_KIND
        ]
        assert sc.plan_matches_spec(set_dir, 1, plan) is True
        self._insert_a_step(tmp_path)
        assert sc.plan_matches_spec(set_dir, 1, plan) is False

    @pytest.mark.parametrize(
        "damage",
        [
            pytest.param("delete", id="spec deleted mid-session"),
            pytest.param("scramble", id="spec no longer parses"),
        ],
    )
    def test_an_unreadable_spec_withdraws_ordinal_claiming(
        self, tmp_path, damage
    ):
        """Conservative in every failure direction.

        Losing a planned row is the failure that matters; showing a step
        twice is not. So anything that makes the spec unreadable costs
        only the ordinal convenience.
        """
        set_dir = self._seeded(tmp_path)
        spec = tmp_path / "114-fixture" / "spec.md"
        if damage == "delete":
            spec.unlink()
        else:
            spec.write_text("no headings, no steps\n", encoding="utf-8")
        self._log_under_the_new_numbers(set_dir)
        rows = sc.build_rows(set_dir, 1)
        assert "verify-it" in _keys(rows)
        assert rows[_keys(rows).index("verify-it")].box == "[ ]"

    def test_a_relogged_step_still_collapses_to_its_latest_entry(
        self, tmp_path
    ):
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 2, "build-the-thing", "Starting.", "in-progress")
        log.log_step(1, 2, "build-the-thing", "Finished.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "build-the-thing", "verify-it"]
        assert rows[1].status == "complete"


class TestWhatIsInFlight:
    """What replaced the ``<- here`` marker (Set 120 S3).

    The marker inferred a single current row; these assert the fact the
    ledger carries instead. The cases are the same ones the marker's
    tests covered, because they are the cases that were getting the
    wrong answer — an in-flight step below an unstarted planned row, a
    caught-up session, and an all-complete one.
    """

    def _seeded(self, tmp_path):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        return set_dir

    def test_in_flight_is_the_step_in_flight_not_an_earlier_pending_plan_row(
        self, tmp_path
    ):
        """The defect the marker used to produce, now impossible.

        With a plan seeded, an unstarted step 2 sits above an in-flight
        step 3. The old rule had to be TOLD to prefer the logged row;
        reading ``in-progress`` cannot get this wrong.
        """
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 1, "register", "Registered.", "complete")
        log.log_step(1, 3, "verify-it", "Working on it.", "in-progress")
        rows = sc.build_rows(set_dir, 1)
        assert _in_flight(rows) == ["verify-it"]

    def test_the_step_after_the_last_logged_one_is_where_the_session_is(
        self, tmp_path
    ):
        """Set 127 S1 reversed this case deliberately, and only this one.

        Before: step 1 complete, nothing logged since, answer "nothing is
        in flight". That answer is what the operator reported as the
        defect — it cannot tell "step 2 has not been started" from "step
        2 has been running for forty minutes", which is the exact
        question the in-progress glyph exists to answer.

        This is NOT the removed ``<- here`` marker returning. The marker
        pointed at the first non-terminal row of ANY kind, in ANY
        session, which is how it came to point confidently at a step that
        had finished hours earlier when four statuses were unparseable
        (Set 119 S2). This fires only on a SEEDED PLAN row, only in a
        session ``session-state.json`` reports as in flight, only when no
        row already boxes ``[~]`` or ``[!]``, and never on an
        unrecognised token — all four of which the marker lacked, and
        each of which has its own falsifier below.
        """
        set_dir = self._seeded(tmp_path)
        SessionLog(set_dir).log_step(
            1, 1, "register", "Registered.", "complete"
        )
        rows = sc.build_rows(set_dir, 1)
        assert _in_flight(rows) == ["build-the-thing"]
        # The RECORD is untouched — the derivation writes nothing and
        # overrides nothing.
        assert [r.status for r in rows] == ["complete", "pending", "pending"]

    def test_a_closed_session_derives_nothing(self, tmp_path):
        """Zero is still a real answer, and this is where it is real.

        The same ledger as above, with the session closed. A ``[~]`` on a
        session that finished is strictly worse than the silence it
        replaced, because the operator would have a reason to believe it.
        """
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        SessionLog(set_dir).log_step(
            1, 1, "register", "Registered.", "complete"
        )
        _close_the_session(tmp_path)
        rows = sc.build_rows(set_dir, 1)
        assert _in_flight(rows) == []

    def test_two_steps_can_be_in_flight_at_once(self, tmp_path):
        """The representational limit the operator ruling named.

        ``markHere`` selects exactly one row, so a session genuinely
        working two steps in parallel had to be misreported. It no
        longer has to be.
        """
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        log.log_step(1, 2, "build-the-thing", "Going.", "in-progress")
        log.log_step(1, 3, "verify-it", "Also going.", "in-progress")
        rows = sc.build_rows(set_dir, 1)
        assert _in_flight(rows) == ["build-the-thing", "verify-it"]

    def test_everything_complete_leaves_nothing_in_flight(self, tmp_path):
        set_dir = self._seeded(tmp_path)
        log = SessionLog(set_dir)
        for number, key in ((1, "register"), (2, "build-the-thing"), (3, "verify-it")):
            log.log_step(1, number, key, "Done.", "complete")
        rows = sc.build_rows(set_dir, 1)
        assert _in_flight(rows) == []

    def test_a_set_with_no_plan_keeps_the_set_111_behaviour(self, tmp_path):
        """No seeded plan: first-logged order, statuses as written."""
        set_dir = _make_set(tmp_path, spec=None)
        log = SessionLog(set_dir)
        log.log_step(1, 1, "register", "Registered.", "complete")
        log.log_step(1, 2, "execute", "Pending.", "pending")
        log.log_step(1, 3, "verify", "Going.", "in-progress")
        rows = sc.build_rows(set_dir, 1)
        assert _keys(rows) == ["register", "execute", "verify"]
        assert _in_flight(rows) == ["verify"]
        assert not any(r.is_planned for r in rows)


class TestThePlanIsNotWork:
    """Falsifiers for the gates a seeded plan could quietly satisfy.

    A gate that only ever passes proves nothing (L-112-1), and seeding
    puts entries in the ledger for every session before any work exists.
    Each test below plants the defect and asserts the refusal.
    """

    def test_a_plan_only_session_cannot_satisfy_the_activity_log_gate(
        self, tmp_path
    ):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        ok, message = gate_checks.check_activity_log_entry(set_dir, None)
        assert ok is False
        assert "no logged step" in message
        assert "log_step" in message

    def test_a_policy_record_is_not_a_logged_step_either(self, tmp_path):
        """Round 1, both discovery lenses: the half the first cut missed.

        A set with ``pathAwareCritique`` configured gets a
        ``kind``-bearing entry written at registration. Excluding only
        ``plan-step`` let that entry stand in for real work, so a
        no-work session passed the gate whose whole job is to prove one
        step was logged.
        """
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        SessionLog(set_dir).append_entry(
            {
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-001/path-aware-critique",
                "dateTime": "2026-01-01T09:00:01-05:00",
                "description": "Operator set pathAwareCritique: advisory.",
                "status": "complete",
                "kind": "path_aware_critique",
                "choice": "advisory",
            }
        )
        ok, message = gate_checks.check_activity_log_entry(set_dir, None)
        assert ok is False
        assert "path_aware_critique" in message
        assert "plan-step" in message

    @pytest.mark.parametrize(
        "kind",
        ["path_aware_critique", "contract_gate", "dual_surface_mode", "suggestion_disposition"],
    )
    def test_every_bookkeeping_kind_is_treated_the_same(self, tmp_path, kind):
        set_dir = _make_set(tmp_path)
        SessionLog(set_dir).append_entry(
            {
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": f"session-001/{kind}",
                "dateTime": "2026-01-01T09:00:01-05:00",
                "description": "Machinery wrote this.",
                "status": "complete",
                "kind": kind,
            }
        )
        ok, _ = gate_checks.check_activity_log_entry(set_dir, None)
        assert ok is False

    def test_one_real_step_beside_the_plan_satisfies_it(self, tmp_path):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        SessionLog(set_dir).log_step(
            1, 1, "register", "Registered.", "complete"
        )
        assert gate_checks.check_activity_log_entry(set_dir, None) == (True, "")

    def test_a_session_with_nothing_at_all_still_says_so(self, tmp_path):
        set_dir = _make_set(tmp_path)
        SessionLog(set_dir)  # creates an empty log
        ok, message = gate_checks.check_activity_log_entry(set_dir, None)
        assert ok is False
        assert "no entries for session 1" in message

    def test_a_plan_entry_is_not_the_last_logged_step_transition(
        self, tmp_path
    ):
        """A seeded plan must not invent a transition the session never hit.

        Planted the hard way round: the plan is seeded AFTER the only
        real step, so its timestamp is the newest in the log. If the
        transition scan counted it, the checklist-post gate would demand
        a post for a moment that is start_session's write, not the
        session's work.
        """
        set_dir = _make_set(tmp_path)
        SessionLog(set_dir).append_entry(
            {
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "register",
                "dateTime": "2026-01-01T09:05:00-05:00",
                "description": "Registered.",
                "status": "complete",
            }
        )
        sc.seed_session_plan(set_dir, 1)
        with open(f"{set_dir}/session-state.json", encoding="utf-8") as fh:
            state = json.load(fh)
        labels = [
            label
            for _, label in gate_checks._checklist_transitions(set_dir, 1, state)
        ]
        assert f"{gate_checks.CHECKLIST_TRANSITION_LAST_STEP} (register)" in labels
        assert not any("build-the-thing" in label for label in labels)

    def test_a_policy_record_is_not_the_last_logged_step_transition(
        self, tmp_path
    ):
        """Round 1: ``_checklist_transitions`` must wait for real work.

        Same plant, other bookkeeping kind, and newest of all: a session
        with a plan and a policy record and no logged step owes no
        ``last-logged-step`` post, because nothing moved on.
        """
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        SessionLog(set_dir).append_entry(
            {
                "sessionNumber": 1,
                "stepNumber": 4,
                "stepKey": "session-001/contract-gate",
                "dateTime": "2026-01-01T09:30:00-05:00",
                "description": "Operator set contractGate: advisory.",
                "status": "complete",
                "kind": "contract_gate",
            }
        )
        with open(f"{set_dir}/session-state.json", encoding="utf-8") as fh:
            state = json.load(fh)
        labels = [
            label
            for _, label in gate_checks._checklist_transitions(set_dir, 1, state)
        ]
        assert not any(
            label.startswith(gate_checks.CHECKLIST_TRANSITION_LAST_STEP)
            for label in labels
        )


class TestRenderingASeededPlan:
    def test_the_plan_prints_cp1252_safely(self, tmp_path):
        spec = (
            "### Session 1 of 1: T\n\n"
            "1. **Don\u2019t \u2014 crash the console.** Detail \u2026 here.\n"
        )
        set_dir = _make_set(tmp_path, spec=spec)
        sc.seed_session_plan(set_dir, 1)
        rows = sc.build_rows(set_dir, 1)
        text = sc.render(rows, 1) + sc.render(rows, 1, verbose=True)
        text.encode("cp1252")

    def test_verbose_shows_the_specs_prose(self, tmp_path):
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        out = sc.render(sc.build_rows(set_dir, 1), 1, verbose=True, width=200)
        assert "A longer sentence that wraps" in out

    def test_a_post_records_what_is_in_flight(self, tmp_path):
        """The post records what the operator was SHOWN.

        The old record claimed ``hereStepKey: "register"`` here — the
        marker's inference, not a fact. Set 127 S1 makes it a fact: the
        render this post attests draws ``[~]`` on ``register``, the
        derived active step of a session in flight, so the ledger line
        says ``register`` because that is what was on the screen. The key
        is always present, so "nothing in flight" (asserted below on a
        closed session) cannot be confused with "not recorded".
        """
        set_dir = _make_set(tmp_path)
        sc.seed_session_plan(set_dir, 1)
        rows = sc.build_rows(set_dir, 1)
        record = sc.record_post(set_dir, 1, rows)
        assert record["stepCount"] == 3
        assert record["inProgressStepKeys"] == ["register"]

        _close_the_session(tmp_path)
        closed = sc.record_post(set_dir, 1, sc.build_rows(set_dir, 1))
        assert closed["inProgressStepKeys"] == []


class TestStartSessionWiring:
    def test_start_session_seeds_the_plan(self, tmp_path, monkeypatch):
        from ai_router import start_session as ss

        set_dir = tmp_path / "114-wiring"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(SPEC, encoding="utf-8")
        monkeypatch.chdir(tmp_path)
        assert (
            ss.main(
                [
                    "--session-set-dir",
                    str(set_dir),
                    "--engine",
                    "claude",
                    "--session-number",
                    "1",
                    "--total-sessions",
                    "2",
                ]
            )
            == 0
        )
        keys = [
            e["stepKey"]
            for e in _entries(str(set_dir))
            if e.get("kind") == sc.PLAN_STEP_KIND
        ]
        assert keys == ["register", "build-the-thing", "verify-it"]

    def test_a_seeding_failure_never_blocks_the_boundary_write(
        self, tmp_path, monkeypatch, capsys
    ):
        """A plan is an affordance. Failing the state write over one would
        be a far worse trade than starting without a forward view — but
        the skip is NAMED, because a silently absent plan looks exactly
        like a session that has not started (L-079-1)."""
        from ai_router import start_session as ss

        set_dir = tmp_path / "114-wiring-fail"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(SPEC, encoding="utf-8")
        monkeypatch.setattr(
            sc,
            "seed_session_plan",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("disk on fire")),
        )
        monkeypatch.chdir(tmp_path)
        assert (
            ss.main(
                [
                    "--session-set-dir",
                    str(set_dir),
                    "--engine",
                    "claude",
                    "--session-number",
                    "1",
                    "--total-sessions",
                    "2",
                ]
            )
            == 0
        )
        assert "could not seed the session plan" in capsys.readouterr().err
        state = json.loads(
            (set_dir / "session-state.json").read_text(encoding="utf-8")
        )
        assert state["sessions"][0]["status"] == "in-progress"


class TestSessionLogAppendEntry:
    def test_a_non_dict_entry_is_refused_at_the_writer(self, tmp_path):
        set_dir = _make_set(tmp_path)
        with pytest.raises(ValueError):
            SessionLog(set_dir).append_entry(["not", "a", "dict"])

    def test_an_entry_without_a_session_number_is_refused(self, tmp_path):
        set_dir = _make_set(tmp_path)
        with pytest.raises(ValueError):
            SessionLog(set_dir).append_entry({"stepKey": "orphan"})

    def test_the_caller_cannot_mutate_the_log_through_its_own_dict(
        self, tmp_path
    ):
        set_dir = _make_set(tmp_path)
        entry = {"sessionNumber": 1, "stepKey": "a", "status": "complete"}
        SessionLog(set_dir).append_entry(entry)
        entry["status"] = "tampered"
        assert _entries(set_dir)[0]["status"] == "complete"
