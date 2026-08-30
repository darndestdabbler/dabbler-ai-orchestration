import * as assert from "assert";
import {
  NODE_TOKEN,
  actionToken,
  childrenOf,
  descriptorFor,
  findingDescriptor,
  hasToken,
  humanizeStepKey,
  repositoryDescriptor,
  repositoryNodes,
  repositoryTooltip,
  attentionNodes,
  sessionDescriptor,
  sessionNodes,
  refusalDescriptor,
  severityOf,
  stepStartLabel,
  taskDescriptor,
  taskNodes,
  taskRowLabel,
  tokenString,
  verificationDescriptor,
} from "../../providers/workExplorerTreeModel";
import { SESSION_ACTIONS } from "../../providers/ActionRegistry";
import {
  makeFinding,
  makeRepository,
  makeSession,
  makeTask,
  makeVerification,
} from "./helpers";

suite("workExplorerTreeModel: nodes", () => {
  test("sessions render as one list in ledger order, never bucketed by status", () => {
    const repository = makeRepository({
      sessions: [
        makeSession({ number: 3, status: "not-started" }),
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 2, status: "in-progress" }),
      ],
    });
    const [node] = repositoryNodes([repository]);
    assert.deepStrictEqual(
      sessionNodes(node).map((n) => n.session.number),
      [1, 2, 3],
    );
  });

  test("taskNodes mirrors the projection's task list verbatim", () => {
    const session = makeSession({
      status: "in-progress",
      tasks: [makeTask({ position: 0 }), makeTask({ position: 1, stepId: "verify" })],
    });
    const nodes = taskNodes({
      kind: "session",
      repository: makeRepository(),
      session,
    });
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === "task" ? n.row.stepId : n.kind)),
      ["implement", "verify"],
    );
  });

  test("a session without projected tasks yields no task children", () => {
    const session = makeSession({ status: "complete", tasks: [] });
    assert.deepStrictEqual(
      taskNodes({ kind: "session", repository: makeRepository(), session }),
      [],
    );
  });

  test("a refused record yields one refusal row and no task rows", () => {
    // Not an empty list and not the rows that did parse: the tree has to
    // say it cannot tell which step is open.
    const session = makeSession({
      status: "in-progress",
      tasks: [makeTask()],
      tasksRefused: "execution record: row 2 failed schema validation",
    });
    const nodes = taskNodes({
      kind: "session",
      repository: makeRepository(),
      session,
    });
    assert.deepStrictEqual(nodes.map((n) => n.kind), ["refusal"]);
  });

  test("childrenOf covers every level and terminates at tasks", () => {
    const session = makeSession({ status: "in-progress", tasks: [makeTask()] });
    const [repositoryNode] = repositoryNodes([
      makeRepository({ sessions: [session] }),
    ]);
    const sessionNode = childrenOf(repositoryNode)[0];
    assert.strictEqual(sessionNode.kind, "session");
    const taskNode = childrenOf(sessionNode)[0];
    assert.strictEqual(taskNode.kind, "task");
    assert.deepStrictEqual(childrenOf(taskNode), []);
  });
});

suite("workExplorerTreeModel: tokens", () => {
  test("tokenString wraps every token in separators on both sides", () => {
    assert.strictEqual(tokenString(["a", "b"]), ";a;b;");
  });

  test("hasToken never matches a token inside a longer kebab token", () => {
    const cv = tokenString(["act-open-spec"]);
    assert.ok(!hasToken(cv, "spec"));
    assert.ok(hasToken(cv, "act-open-spec"));
  });

  test("actionToken strips the command prefix and dots", () => {
    assert.strictEqual(
      actionToken({
        id: "dabblerSessionSets.openSpec",
        label: "",
        group: 0,
        when: () => true,
      }),
      "act-openSpec",
    );
    assert.strictEqual(
      actionToken({
        id: "dabbler.copySessionRunPrompt",
        label: "",
        group: 0,
        when: () => true,
      }),
      "act-copySessionRunPrompt",
    );
  });
});

suite("workExplorerTreeModel: repository descriptor", () => {
  test("the fraction and the in-flight session read from the row itself", () => {
    const d = repositoryDescriptor(
      repositoryNodes([
        makeRepository({
          totalSessions: 20,
          sessionsCompleted: 14,
          currentSession: 15,
          sessions: [makeSession({ number: 15, status: "in-progress" })],
        }),
      ])[0],
    );
    assert.strictEqual(d.description, "14/20 · session 015 in flight");
    assert.ok(hasToken(d.contextValue, NODE_TOKEN.repository));
  });

  test("the repository row carries no lifecycle glyph of its own", () => {
    const [node] = repositoryNodes([makeRepository({ sessions: [makeSession()] })]);
    assert.strictEqual(repositoryDescriptor(node).icon, undefined);
  });

  test("a repository with no projected sessions is a leaf that says why", () => {
    const [node] = repositoryNodes([makeRepository({ sessions: [] })]);
    const d = repositoryDescriptor(node);
    assert.strictEqual(d.collapsible, "none");
    assert.ok(d.tooltip!.includes("router could not be run"));
  });

  test("the id is the root path, so two worktrees stay two rows", () => {
    const a = repositoryDescriptor(
      repositoryNodes([makeRepository({ root: "D:/ws" })])[0],
    );
    const b = repositoryDescriptor(
      repositoryNodes([makeRepository({ root: "D:/ws-wt" })])[0],
    );
    assert.notStrictEqual(a.id, b.id);
  });

  test("a never-run repository expands to its planned sessions and says so", () => {
    // Project setup is two sessions in a plan, and this is the whole
    // point of rendering them: the operator can see and start them
    // before the router has written anything here.
    const [node] = repositoryNodes([
      makeRepository({
        sessionsSource: "plan",
        totalSessions: 2,
        sessions: [
          makeSession({ number: 1, status: "not-started", iconKey: "not-started" }),
          makeSession({ number: 2, status: "not-started", iconKey: "not-started" }),
        ],
      }),
    ]);
    const d = repositoryDescriptor(node);
    assert.strictEqual(d.collapsible, "collapsed");
    assert.ok(d.tooltip!.includes("has not written a ledger here yet"));
    assert.strictEqual(sessionNodes(node).length, 2);
  });

  test("tooltip surfaces the forced-close bypass and an invariant violation", () => {
    const tip = repositoryTooltip(
      makeRepository({ forceClosed: true, invariantViolation: "rule 7" }),
    );
    assert.ok(tip.includes("--force bypass"));
    assert.ok(tip.includes("rule 7"));
  });
});

suite("workExplorerTreeModel: session descriptor", () => {
  const repository = makeRepository({
    sessions: [makeSession({ number: 1, status: "complete" })],
  });

  test("attention rows read above the sessions, and only when there is something", () => {
    // Sessions 38, 39 and 40 each added something worth seeing and each put
    // it somewhere different. This is the one place, and an empty one
    // renders nothing: a view that always has a row teaches people its rows
    // mean nothing.
    const quiet = makeRepository();
    assert.deepStrictEqual(attentionNodes({ kind: "repository", repository: quiet }), []);

    const waiting = makeRepository({
      currentSession: 3,
      possiblyStalled: true,
      owedDecisions: [
        {
          id: "testing-suites",
          question: "How do this repository's tests run?",
          severity: "blocking",
          blocking: true,
          onNoAnswer: null,
        },
      ],
    });
    const rows = attentionNodes({ kind: "repository", repository: waiting });
    assert.strictEqual(rows.length, 2);
    // Blocking first: it is the one that costs something.
    assert.strictEqual(rows[0].subject, "owed");
    assert.strictEqual(rows[0].urgent, true);
    assert.strictEqual(rows[1].subject, "stalled");
    // The heartbeat never claims the work stopped, only the record.
    assert.ok(rows[1].detail.includes("not that the work stopped"));
    assert.strictEqual(rows[1].urgent, false);
  });

  test("a planned session says so, since it shares the not-started glyph", () => {
    // The projection gives a plan-declared session `status: "planned"` and
    // `iconKey: "not-started"` deliberately: the two share a picture, so the
    // word on the row is the only thing that tells them apart.
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({
        number: 9,
        status: "planned",
        iconKey: "not-started",
      }),
    });
    assert.strictEqual(d.description, "planned");
  });

  test("the label leads with the zero-padded number", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ number: 7, title: "The sessions view" }),
    });
    assert.ok(d.label.startsWith("007 "), d.label);
    assert.ok(d.label.includes("The sessions view"));
  });

  test("only the in-flight session carries a description", () => {
    const inFlight = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ status: "in-progress", iconKey: "in-progress" }),
    });
    const done = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession(),
    });
    assert.strictEqual(inFlight.description, "in flight");
    assert.strictEqual(done.description, undefined);
  });

  test("a session with tasks is collapsible; without, a leaf", () => {
    const withSteps = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ status: "in-progress", tasks: [makeTask()] }),
    });
    const leaf = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession(),
    });
    assert.strictEqual(withSteps.collapsible, "collapsed");
    assert.strictEqual(leaf.collapsible, "none");
  });

  test("the icon comes from the projection's glyph key", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ iconKey: "cancelled" }),
    });
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
  });

  test("applicable session actions mint contextValue tokens", () => {
    const session = makeSession({ number: 1, status: "not-started" });
    const repo = makeRepository({ sessions: [session] });
    const d = sessionDescriptor({ kind: "session", repository: repo, session });
    for (const action of SESSION_ACTIONS.filter((a) => a.when(repo, session))) {
      assert.ok(hasToken(d.contextValue, actionToken(action)), action.id);
    }
  });

  test("a cancelled session offers restore but not cancel", () => {
    const session = makeSession({ number: 1, status: "cancelled" });
    const repo = makeRepository({ sessions: [session] });
    const d = sessionDescriptor({ kind: "session", repository: repo, session });
    assert.ok(hasToken(d.contextValue, "act-restore"));
    assert.ok(!hasToken(d.contextValue, "act-cancel"));
  });

  test("an untitled session falls back to its number", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ number: 4, title: "" }),
    });
    assert.strictEqual(d.label, "004 · Session 4");
  });

  test("tooltip flags an unrecognized verdict instead of laundering it", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ verificationVerdict: "sounds-fine" }),
    });
    assert.ok(d.tooltip!.includes("not a recognized verdict"));
  });
});

suite("workExplorerTreeModel: severity", () => {
  test("an unrecognized verdict is severe, never clean", () => {
    assert.strictEqual(
      severityOf(makeSession({ verificationVerdict: "manual-override-development" })),
      "verification",
    );
  });

  test("a VERIFIED verdict carries no severity", () => {
    assert.strictEqual(
      severityOf(makeSession({ verificationVerdict: "VERIFIED" })),
      null,
    );
  });

  test("the icon follows lifecycle status, never severity", () => {
    const session = makeSession({
      status: "complete",
      iconKey: "complete",
      verificationVerdict: "ISSUES_FOUND",
    });
    const d = sessionDescriptor({
      kind: "session",
      repository: makeRepository({ sessions: [session] }),
      session,
    });
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "done.svg" });
    assert.ok(hasToken(d.contextValue, "severity-verification"));
  });
});
suite("workExplorerTreeModel: task rows", () => {
  const repository = makeRepository();

  test("humanizeStepKey turns kebab and snake case into a sentence word", () => {
    assert.strictEqual(humanizeStepKey("verify-changes"), "Verify changes");
    assert.strictEqual(humanizeStepKey("run_tests"), "Run tests");
  });

  test("taskRowLabel prefers the step id, then truncated intent, then position", () => {
    assert.strictEqual(taskRowLabel(makeTask({ stepId: "close-out" })), "Close out");
    const longIntent = "d".repeat(80);
    const noId = makeTask({ stepId: null, intent: longIntent });
    assert.strictEqual(taskRowLabel(noId).length, 58);
    const bare = makeTask({ stepId: null, intent: "", position: 2 });
    assert.strictEqual(taskRowLabel(bare), "Step 3");
  });

  test("stepStartLabel renders HH:MM- and nothing for unparseable input", () => {
    assert.match(stepStartLabel("2026-08-17T09:06:00-04:00"), /^\d{2}:\d{2}-$/);
    assert.strictEqual(stepStartLabel("not-a-date"), "");
    assert.strictEqual(stepStartLabel(null), "");
  });

  test("the open task renders the projection's state and glyph, unmodified", () => {
    const d = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ isOpen: true, state: "in flight", iconKey: "in-progress" }),
    });
    assert.ok(d.tooltip!.includes("in flight"));
    assert.ok(hasToken(d.contextValue, "task-open"));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "in-progress.svg" });
  });

  test("task ids disambiguate by plan position", () => {
    const a = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ position: 0 }),
    });
    const b = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ position: 1 }),
    });
    assert.notStrictEqual(a.id, b.id);
  });

  test("a started task shows its opening time in the description slot", () => {
    const d = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ startedAt: "2026-08-17T09:06:00-04:00" }),
    });
    assert.match(d.description ?? "", /^\d{2}:\d{2}-$/);
  });

  test("the refusal row names the fault and shows no task state", () => {
    const d = refusalDescriptor({
      kind: "refusal",
      repository,
      session: makeSession({ status: "in-progress" }),
      subject: "execution record",
      reason: "execution record: row 2 failed schema validation at event",
    });
    assert.strictEqual(d.label, "Execution record unreadable");
    assert.ok(d.tooltip!.includes("row 2 failed schema validation"));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
    assert.ok(hasToken(d.contextValue, NODE_TOKEN.refusal));
  });

  test("an unreadable record is a session severity of its own", () => {
    const clean = makeSession({ status: "in-progress" });
    assert.strictEqual(severityOf(clean), null);
    const refused = makeSession({
      status: "in-progress",
      tasksRefused: "execution record: unreadable",
    });
    assert.strictEqual(severityOf(refused), "record");
    const d = sessionDescriptor({ kind: "session", repository, session: refused });
    assert.ok(hasToken(d.contextValue, "severity-record"));
    assert.strictEqual(d.collapsible, "collapsed");
  });
});

suite("workExplorerTreeModel: the unresolved-session view", () => {
  const repository = makeRepository();
  const sessionNode = (session: ReturnType<typeof makeSession>) =>
    ({ kind: "session", repository, session }) as const;

  test("a session that stopped at the cap reads first, then its tasks; a verified one has nothing to read", () => {
    const stopped = makeSession({
      status: "in-progress",
      verification: makeVerification(),
      tasks: [makeTask()],
    });
    assert.deepStrictEqual(
      childrenOf(sessionNode(stopped)).map((n) => n.kind),
      ["verification", "task"],
    );
    // A closed session carries the row too: it is read at planning time,
    // long after it stopped being the one in flight.
    const landed = makeSession({
      status: "complete",
      verification: makeVerification({ terminal: "REMEDIATED_AT_CAP" }),
    });
    assert.strictEqual(sessionDescriptor(sessionNode(landed)).collapsible, "collapsed");
    // Python said clean; the tree asks nothing further.
    const verified = makeSession({
      status: "complete",
      verification: makeVerification({ terminal: "VERIFIED", headline: "verified", clean: true }),
    });
    assert.deepStrictEqual(childrenOf(sessionNode(verified)), []);
    assert.strictEqual(sessionDescriptor(sessionNode(verified)).collapsible, "none");
  });

  test("the verification row repeats Python's headline and mints terminal and agency tokens", () => {
    const none = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification(),
    });
    assert.strictEqual(none.label, "Unresolved at the cap");
    assert.ok(none.description!.includes("round 3 of 3"), none.description);
    assert.ok(none.description!.includes("gpt-5-6-sol/openai"), none.description);
    assert.ok(hasToken(none.contextValue, "terminal-issues_found"));
    assert.ok(hasToken(none.contextValue, "agency-none"));
    assert.ok(!hasToken(none.contextValue, "transformed-reads"));
    assert.ok(none.tooltip!.includes("could not look at the tree"));
    assert.ok(none.tooltip!.includes("no approval to give"));

    const transformed = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({
        agency: {
          ...makeVerification().agency,
          mode: "tools",
          reads: 4,
          transformedReads: 1,
          operations: [
            { kind: "read", target: "ai_router/checks.py", fidelity: "transformed", inScope: true },
            { kind: "search", target: "spawn", fidelity: "verbatim", inScope: true },
            { kind: "read", target: "README.md", fidelity: "verbatim", inScope: false },
          ],
        },
      }),
    });
    assert.ok(hasToken(transformed.contextValue, "agency-tools"));
    assert.ok(hasToken(transformed.contextValue, "transformed-reads"));
    assert.ok(transformed.tooltip!.includes("1 read(s) were transformed"));
    // The targets themselves, not only the counts: which file a Major
    // came from is what the operator weighs it against.
    assert.ok(transformed.tooltip!.includes("- read ai_router/checks.py (transformed)"));
    assert.ok(transformed.tooltip!.includes("- search spawn\n"));
    assert.ok(transformed.tooltip!.includes("- read README.md (out of scope)"));
  });

  test("a stopping round past a since-lowered cap is not squeezed into 'round 6 of 3'", () => {
    const d = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({ stoppedAtRound: 6, rounds: 6, cap: 3 }),
    });
    assert.ok(d.description!.includes("round 6 (cap now 3)"), d.description);
  });

  test("a remediated-at-the-cap row names the fix and calls it unreviewed, never a waiver", () => {
    const d = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({
        terminal: "REMEDIATED_AT_CAP",
        headline: "remediated at the cap",
        findings: [makeFinding({ disposition: "fixed, unreviewed" })],
        fixPaths: ["ai_router/affected.py", "tests/test_affected.py"],
      }),
    });
    assert.strictEqual(d.label, "Remediated at the cap");
    assert.ok(hasToken(d.contextValue, "terminal-remediated_at_cap"));
    assert.ok(d.tooltip!.includes("Not a waiver"));
    assert.ok(d.tooltip!.includes("1 fixed, unreviewed"));
    assert.ok(d.tooltip!.includes("Fix touched: ai_router/affected.py, tests/test_affected.py"));
  });

  test("finding rows carry the severity, the disposition, the scenario and the cited paths", () => {
    const cited = findingDescriptor({
      kind: "finding",
      repository,
      session: makeSession({ number: 3 }),
      finding: makeFinding(),
      index: 0,
    });
    assert.ok(cited.label.startsWith("[major] "), cited.label);
    assert.strictEqual(cited.description, "outstanding");
    assert.ok(cited.tooltip!.includes("A Java repository gets"));
    assert.ok(cited.tooltip!.includes("Cited: ai_router/affected.py"));
    assert.ok(hasToken(cited.contextValue, "finding-blocking"));

    const uncited = findingDescriptor({
      kind: "finding",
      repository,
      session: makeSession({ number: 3 }),
      finding: makeFinding({ evidencePaths: [], severity: "minor", blocking: false, disposition: "noted" }),
      index: 1,
    });
    assert.ok(uncited.tooltip!.includes("No path cited"));
    assert.ok(!hasToken(uncited.contextValue, "finding-blocking"));
    assert.notStrictEqual(cited.id, uncited.id);
  });

  test("an unreadable rounds ledger is a refusal row and a record severity, never the last round that parsed", () => {
    const session = makeSession({
      status: "complete",
      verification: makeVerification(),
      verificationRefused: "rounds ledger: line 4 is not valid JSON",
    });
    const children = childrenOf(sessionNode(session));
    assert.deepStrictEqual(children.map((n) => n.kind), ["refusal"]);
    const d = descriptorFor(children[0]);
    assert.strictEqual(d.label, "Rounds ledger unreadable");
    assert.ok(d.tooltip!.includes("line 4 is not valid JSON"));
    assert.strictEqual(severityOf(session), "record");
    // Two refusals on one session are two rows, not one id.
    const tasksRefusal = descriptorFor(
      childrenOf(sessionNode(makeSession({ status: "in-progress", tasksRefused: "x" })))[0],
    );
    assert.notStrictEqual(d.id, tasksRefusal.id);
  });
});

suite("workExplorerTreeModel: descriptorFor dispatch", () => {
  test("every node kind resolves to a descriptor with a stable id", () => {
    const session = makeSession({ status: "in-progress", tasks: [makeTask()] });
    const [repositoryNode] = repositoryNodes([
      makeRepository({ sessions: [session] }),
    ]);
    const sessionNode = childrenOf(repositoryNode)[0];
    const taskNode = childrenOf(sessionNode)[0];
    const refusalNode = childrenOf(
      childrenOf(
        repositoryNodes([
          makeRepository({
            sessions: [
              makeSession({ status: "in-progress", tasksRefused: "unreadable" }),
            ],
          }),
        ])[0],
      )[0],
    )[0];
    for (const node of [repositoryNode, sessionNode, taskNode, refusalNode]) {
      const d = descriptorFor(node);
      assert.ok(d.id.length > 0, node.kind);
      assert.ok(d.contextValue.startsWith(";"), node.kind);
    }
  });
});
