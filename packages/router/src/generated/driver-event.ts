// Generated from driver-event.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * events.jsonl row (one line the framework said)
 */
export type DriverEvent = {
  /**
   * Pinned rather than bounded, and required rather than optional. Every other record here makes it optional so that rows written before the field existed still read; nothing wrote this record before it existed, so there are no such rows and nothing to be tolerant of. A reader that accepted version 2 would be guessing at a shape it has never seen, and a second version is then a deliberate change here rather than a row that slipped through.
   */
  schema_version: 1;
  /**
   * Where this line fell among the lines of this run, counted from the rows already on disk. Two drivers cannot both be moving one run -- the lease fence settles that -- so a gap or a repeat here says the file was truncated or hand-touched, which is the one thing a reader of a record needs to be able to see.
   */
  sequence: number;
  /**
   * The event word, exactly as the terminal printed it: `phase`, `step`, `rejected`, `verify`, `tests`, `job-started`. It is what the tone grammar is keyed on, so a transcript and the Dabbler Terminal paint one line the same way.
   */
  event: string;
  /**
   * When the line was said, as a full ISO instant. The terminal prints a wall clock of hours, minutes and seconds; a record that kept only that could not say which day, nor order two sessions.
   */
  at: string;
  session_number: number;
  /**
   * The phase the run stood in when the line was said. Absent for a line said before the run had one -- the first lines of a run are exactly those.
   */
  phase?: string;
  /**
   * The line's own `key=value` pairs, as the caller passed them and before they were flattened for printing. Open, because the events are the driver's own vocabulary and a closed list here would be a second copy of it that drifts; a value is whatever `log` was given.
   */
  fields: Record<string, unknown>;
};
