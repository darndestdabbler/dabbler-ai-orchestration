// Generated from defect-report-check.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * the answer `dabbler session defect-report` asks the Primary Reviewer for
 */
export type DefectReportCheck = {
  /**
   * True where neither passage names anything that is not the framework's own: no repository, file, folder, step, module, project, product, organisation, person, host or credential.
   */
  clean: boolean;
  /**
   * Each phrase, exactly as it appears in a passage, that names something that is not the framework's. Empty where clean is true.
   */
  phrases: string[];
};
