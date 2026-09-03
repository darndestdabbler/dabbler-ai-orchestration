// The contract's schema-backed answers, checked at the type level.
//
// The point of generating types from the schemas is that a schema change
// becomes a compile error at the seam rather than a cast inside a caller.
// That only holds if the methods whose answers HAVE a schema return its
// generated type -- so this asserts they do, and that a payload the schema
// would reject does not typecheck.
//
// `@ts-expect-error` is the assertion: the file fails to compile if the
// error it expects does not occur, so a return type silently widened to
// `unknown` or `RouterText` fails here and in `tsc --noEmit` both.

import { describe, expect, it } from "vitest";

import type { Router, RouterResult } from "../src/contracts/router.ts";
import type { ApprovedPlan } from "../src/generated/approved-plan.ts";
import type { ProgressProjection } from "../src/generated/progress-projection.ts";
import type { Rounds } from "../src/generated/rounds.ts";

type Answer<T> = T extends Promise<RouterResult<infer V>> ? V : never;

// The three methods whose answers a schema describes.
type ProgressAnswer = Answer<ReturnType<Router["progress"]>>;
type PlanAnswer = Answer<ReturnType<Router["approvedPlan"]["read"]>>;
type RoundAnswer = Answer<ReturnType<Router["ledger"]["latestRound"]>>;

// Each must be exactly the generated type -- assignable in both
// directions, so a widening to `unknown` fails as loudly as a narrowing.
const _progress: ProgressAnswer = {} as ProgressProjection;
const _progressBack: ProgressProjection = {} as ProgressAnswer;
const _plan: PlanAnswer = {} as ApprovedPlan;
const _planBack: ApprovedPlan = {} as PlanAnswer;
const _round: RoundAnswer = {} as Rounds | null;
const _roundBack: Rounds | null = {} as RoundAnswer;

describe("the schema-backed answers", () => {
  it("are the generated types, and reject a payload the schema would", () => {
    // A round row without its required `completion_tree` is not a Rounds.
    // @ts-expect-error the schema requires completion_tree
    const missingTree: Rounds = {
      round: 1,
      verdict: "VERIFIED",
      blocking: false,
      findings: [],
      recorded_at: "2026-08-28T00:00:00-04:00",
    };

    // A verdict outside the schema's enum is not a Rounds either.
    // @ts-expect-error "MAYBE" is not one of the four verdict tokens
    const badVerdict: Rounds["verdict"] = "MAYBE";

    // A projection missing its repository half is not a ProgressProjection.
    // @ts-expect-error the schema requires repository and sessions
    const halfProjection: ProgressProjection = {
      schemaVersion: 1,
      generatedAt: "2026-08-28T00:00:00-04:00",
    };

    expect([missingTree, badVerdict, halfProjection]).toHaveLength(3);
    expect([_progress, _progressBack, _plan, _planBack, _round, _roundBack])
      .toHaveLength(6);
  });
});
