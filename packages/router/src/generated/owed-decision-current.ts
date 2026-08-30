// Generated from owed-decision-current.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * one owed decision, as its consumers read it (the fold of owed-decisions.jsonl)
 */
export type OwedDecisionCurrent = {
  [key: string]: unknown;
  id: string;
  /**
   * Where the decision stands. 'open' is waiting on a person; the log's corresponding event is 'raised', and translating between them is this projection's job rather than every consumer's.
   */
  state: "open" | "answered" | "superseded";
  /**
   * Whether an unanswered decision refuses the close. Derived from the class when the decision is raised and never settable per call: a severity a caller could set is a severity a caller could lower, and the class that blocks is the one no caller may opt out of.
   */
  severity: "blocking" | "advisory";
  class: "verification-reduction" | "external-consequence" | "value-tradeoff" | "accountability-signoff";
  question: string;
  file?: string | null;
  determined?: string;
  /**
   * Two or more, always: a question with one answer is a notification.
   */
  options: {
    label: string;
    consequence: string;
  }[];
  recommendation?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  onNoAnswer?: string | null;
  answer?: string | null;
  answeredBy?: "operator" | null;
  value?: string | null;
  note?: string | null;
  sessionNumber?: number | null;
  recordedAt?: string;
  /**
   * The last event folded into this record. Carried so a reader can trace the state back to the row that produced it; `state` is what a reader should branch on.
   */
  event?: "raised" | "answered" | "superseded";
};
