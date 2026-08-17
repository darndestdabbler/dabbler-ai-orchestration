// Typed action registry for the Work Explorer's row context menus. Each
// entry mints a `contextValue` token (see actionToken in the tree
// model); package.json's `when` clauses match those tokens, and the
// registry check in the test suite keeps the two in lockstep.

import { SessionRecord, SessionSet } from "../types";
import { sessionOffersRunPrompt } from "./rowMenuHelpers";

export interface RowAction {
  id: string;
  label: string;
  group: number;
  when: (set: SessionSet) => boolean;
}

const inFlightLike = (s: SessionSet): boolean =>
  s.state === "in-progress" || s.state === "not-started";

const cancellable = (s: SessionSet): boolean =>
  s.state === "in-progress" || s.state === "not-started" || s.state === "complete";

// Ordered list; `group` bands: 1xx Open File submenu, 3xx Copy Prompt
// submenu, 9xx lifecycle.
export const ROW_ACTIONS: RowAction[] = [
  { id: "dabblerSessionSets.openSpec", label: "Spec", group: 101, when: () => true },
  { id: "dabblerSessionSets.openActivityLog", label: "Activity Log", group: 102, when: () => true },
  { id: "dabblerSessionSets.openChangeLog", label: "Change Log", group: 103, when: () => true },
  { id: "dabblerSessionSets.openSessionState", label: "Session State", group: 104, when: () => true },
  { id: "dabbler.copyStartNextSessionPrompt", label: "Start Next Session", group: 304, when: inFlightLike },
  { id: "dabblerSessionSets.startSession", label: "Start Next Session (terminal)", group: 905, when: inFlightLike },
  { id: "dabblerSessionSets.closeSession", label: "Close Session (terminal)", group: 906,
    when: (s) => s.state === "in-progress" },
  { id: "dabblerSessionSets.cancel", label: "Cancel Session Set", group: 901, when: cancellable },
  { id: "dabblerSessionSets.restore", label: "Restore Session Set", group: 902,
    when: (s) => s.state === "cancelled" },
];

export function applicableActions(set: SessionSet): RowAction[] {
  return ROW_ACTIONS.filter((a) => a.when(set)).sort((a, b) => a.group - b.group);
}

// A separate list because a session action's `when` needs the session;
// widening RowAction.when would make every set action's signature lie
// about what it reads. Band: 6xx.
export interface SessionAction {
  id: string;
  label: string;
  group: number;
  when: (set: SessionSet, session: SessionRecord) => boolean;
}

export const SESSION_ACTIONS: SessionAction[] = [
  {
    id: "dabbler.copySessionRunPrompt",
    label: "Copy Run Prompt",
    group: 601,
    when: (set, session) => sessionOffersRunPrompt(set, session),
  },
];

export function applicableSessionActions(
  set: SessionSet,
  session: SessionRecord,
): SessionAction[] {
  return SESSION_ACTIONS.filter((a) => a.when(set, session)).sort(
    (a, b) => a.group - b.group,
  );
}
