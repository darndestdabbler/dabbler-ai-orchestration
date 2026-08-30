// Generated from owed-decisions.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * owed-decisions.jsonl (.dabbler/runs/owed-decisions.jsonl)
 */
export type OwedDecisions = {
  /**
   * Stable across the decision's whole life. The fold keys on it, so a re-raise of the same question is the same row rather than a second one.
   */
  id: string;
  /**
   * What this row records. 'raised' carries the brief; 'answered' carries the operator's choice; 'superseded' retires a question the repository outgrew without anyone answering it.
   */
  event: "raised" | "answered" | "superseded";
  /**
   * The state this row puts the decision INTO, stored beside the event that did it. Denormalised on purpose: the mapping from event to state is one-to-one and both are written at the same instant, so there is nothing here that can drift -- and the alternative made every consumer of the ledger reimplement the fold before it could read a state the record was supposed to publish.
   */
  state: "open" | "answered" | "superseded";
  recordedAt: string;
  /**
   * The session that recorded the row. Null when raised outside a session.
   */
  sessionNumber: number | null;
  /**
   * How much the framework is prepared to do without the answer. 'blocking' belongs to the verification-reduction class alone and refuses the close; 'advisory' proceeds on the stated default with the wait recorded. Derived from the class when the decision is raised and carried onto every later row of the same decision, so a reader of ANY single row knows what it costs to leave it unanswered.
   */
  severity: "blocking" | "advisory";
  /**
   * Which human-required class the question falls in, checked in the rubric's own precedence. 'verification-reduction' is first and absolute: it is the only class that refuses a close, because proceeding on a default would let the record claim something verification did not establish. The other three proceed on their default with the wait recorded, so no engine is ever held open.
   */
  class?: "verification-reduction" | "external-consequence" | "value-tradeoff" | "accountability-signoff";
  /**
   * One sentence, in the operator's language rather than the framework's.
   */
  question?: string;
  /**
   * Where the answer lands, repository-relative. Null when the answer is not a file edit. The framework writes it; the operator never does.
   */
  file?: string | null;
  /**
   * What the framework established on its own before asking. Its purpose is to prove the question could not simply be computed -- a brief that asks for something derivable is a framework gap wearing a question's clothes.
   */
  determined?: string;
  /**
   * Each choice with what follows from it, in plain language. Never fewer than two: a single option is a notification, not a decision.
   */
  options?: {
    label: string;
    consequence: string;
  }[];
  /**
   * Which option the framework would take, by label. Withholding one to seem neutral pushes the work back onto the operator, which is the failure this format exists to prevent.
   */
  recommendation?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  /**
   * What happens if nobody answers. For every class but verification-reduction this is what actually happens, and saying so is what makes a non-blocking question honest rather than ignorable.
   */
  onNoAnswer?: string | null;
  /**
   * The chosen option's label, on an 'answered' row.
   */
  answer?: string | null;
  /**
   * Only an operator answers. The enum is the point: no model may record an answer to a question reserved for a person.
   */
  answeredBy?: "operator" | null;
  /**
   * The datum an answer carries when the choice alone is not enough -- a remote URL for 'attach', for instance. Distinct from `note`, which is commentary: this is a parameter the framework acts on, and an option whose consequence does not say it needs one never has it.
   */
  value?: string | null;
  note?: string | null;
};
