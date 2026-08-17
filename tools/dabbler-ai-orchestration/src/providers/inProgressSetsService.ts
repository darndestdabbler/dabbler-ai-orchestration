// Ordering rule for the In Progress bucket: the older the in-flight
// set, the higher it ranks.

import { SessionSet } from "../types";

export function listInProgressSets(all: SessionSet[]): SessionSet[] {
  return all
    .filter((s) => s.state === "in-progress")
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}
