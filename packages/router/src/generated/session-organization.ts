// Generated from session-organization.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * Normalized session intent parsed from docs/sessions/session-plan.md
 */
export type SessionOrganization = {
  schema_version: 1;
  plan_path?: string;
  sessions: Array<{
    number: number;
    title: string;
    policy: "fast" | "verified" | null;
    notes?: string;
  }>;
  diagnostics: {
    detail: string;
  }[];
};
