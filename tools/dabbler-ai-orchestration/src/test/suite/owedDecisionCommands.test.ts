// Answering an owed decision from where it is seen.
//
// What is asserted is what the operator is offered and what the router is
// then asked to record -- and, for the two ways of not deciding, that it is
// asked nothing at all.

import * as assert from "assert";

import {
  DecisionAnnouncer,
  LATER_CHOICE,
  OTHER_CHOICE,
  type OwedDecisionUi,
  badgeFor,
  offerDecision,
  optionItems,
  runAnswerDecisionFlow,
} from "../../commands/owedDecisionCommands";
import type { OwedDecision } from "../../providers/workExplorerTreeModel";
import { fakeRouter, makeRepository } from "./helpers";

const STOP: OwedDecision = {
  id: "driver-stop-s62",
  question: "Session 062 stopped (budget) in phase 'steps'. Run it again, or cancel it?",
  severity: "advisory",
  blocking: false,
  determined: "the loop met driver.max_invocations (24)",
  recommendation: "Run `next` again",
  onNoAnswer: "The session stays in flight until someone resumes it or cancels it.",
  options: [
    { label: "Run `next` again", consequence: "It resumes from 'steps'." },
    { label: "Cancel the session", consequence: "It ends with a reason on the record." },
  ],
};

function decisionUi(overrides: Partial<OwedDecisionUi> = {}): {
  ui: OwedDecisionUi;
  offered: string[][];
  picked: Array<{ label: string; detail: string; picked: boolean }[]>;
  errors: string[];
  infos: string[];
} {
  const offered: string[][] = [];
  const picked: Array<{ label: string; detail: string; picked: boolean }[]> = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const ui: OwedDecisionUi = {
    toast: async (_message, choices) => {
      offered.push([...choices]);
      return undefined;
    },
    pickOption: async (_decision, items) => {
      picked.push([...items]);
      return undefined;
    },
    showErrorMessage: (m) => errors.push(m),
    showInformationMessage: (m) => infos.push(m),
    ...overrides,
  };
  return { ui, offered, picked, errors, infos };
}

const target = () => ({ repository: makeRepository(), decision: STOP });

suite("answering an owed decision", () => {
  test("the toast offers the recommendation by its own label, then Other and Later", async () => {
    const { ui, offered } = decisionUi();
    const { router, asked } = fakeRouter(0);
    assert.strictEqual(await offerDecision(target(), ui, router), false);
    // The recommendation is a button because making someone open a menu to
    // agree with it is the tax the brief format exists to remove.
    assert.deepStrictEqual(offered, [["Run `next` again", OTHER_CHOICE, LATER_CHOICE]]);
    // Dismissing it is not an answer.
    assert.deepStrictEqual(asked, []);
  });

  test("taking the recommendation records it, by the option's own label", async () => {
    const { ui, infos } = decisionUi({ toast: async () => "Run `next` again" });
    const { router, owedAnswers } = fakeRouter(0);
    const where = target();
    assert.strictEqual(await offerDecision(where, ui, router), true);
    assert.strictEqual(owedAnswers.length, 1);
    assert.strictEqual(owedAnswers[0].id, "driver-stop-s62");
    assert.strictEqual(owedAnswers[0].choice, "Run `next` again");
    assert.strictEqual(owedAnswers[0].repoRoot, where.repository.root);
    assert.ok(infos[0].includes("Run `next` again"));
  });

  test("Later records nothing, because dismissing a toast is not a decision", async () => {
    const { ui, picked } = decisionUi({ toast: async () => LATER_CHOICE });
    const { router, asked } = fakeRouter(0);
    assert.strictEqual(await offerDecision(target(), ui, router), false);
    assert.deepStrictEqual(asked, []);
    assert.deepStrictEqual(picked, []);
  });

  test("the picker carries each option's consequence, and the choice is what is recorded", async () => {
    const { ui } = decisionUi({ pickOption: async () => "Cancel the session" });
    const { router, owedAnswers } = fakeRouter(0);
    assert.strictEqual(await runAnswerDecisionFlow(target(), ui, router), true);
    assert.strictEqual(owedAnswers[0].choice, "Cancel the session");

    // A context-menu item cannot carry a tooltip, which is the whole reason
    // this is a QuickPick: the consequence rides on `detail`.
    const items = optionItems(STOP);
    assert.deepStrictEqual(
      items.map((item) => [item.label, item.detail, item.picked]),
      [
        ["Run `next` again", "It resumes from 'steps'. (recommended)", true],
        ["Cancel the session", "It ends with a reason on the record.", false],
      ],
    );
  });

  test("Other opens the picker, and a refusal from the router is shown", async () => {
    const { ui, errors } = decisionUi({
      toast: async () => OTHER_CHOICE,
      pickOption: async () => "Cancel the session",
    });
    const { router } = fakeRouter(3, "owed: refused -- 'driver-stop-s62' was already answered");
    assert.strictEqual(await offerDecision(target(), ui, router), false);
    assert.ok(errors[0].includes("already answered"));
  });

  test("the badge counts what is open across the window, and clears when nothing is", () => {
    assert.strictEqual(badgeFor([makeRepository()]), undefined);
    const badge = badgeFor([
      makeRepository({ owedDecisions: [STOP] }),
      makeRepository({ owedDecisions: [{ ...STOP, id: "git-remote", question: "Where should this push?" }] }),
    ]);
    assert.strictEqual(badge?.value, 2);
    assert.ok(badge?.tooltip.includes("Where should this push?"));
  });

  test("a decision is announced once, and again when its brief changes", () => {
    const announcer = new DecisionAnnouncer();
    const repository = makeRepository({ owedDecisions: [STOP] });
    assert.strictEqual(announcer.fresh([repository]).length, 1);
    assert.deepStrictEqual(announcer.fresh([repository]), []);
    // Re-raised with a changed question: the operator has not seen this one.
    const changed = makeRepository({
      owedDecisions: [{ ...STOP, question: "Session 062 stopped (blocked). Run it again, or cancel it?" }],
    });
    assert.strictEqual(announcer.fresh([changed]).length, 1);
  });
});
