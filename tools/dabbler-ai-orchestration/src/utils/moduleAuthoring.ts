// Read-only module-manifest helpers. Every transactional module
// operation runs through `python -m ai_router.modules` (reached from
// utils/moduleLifecycleCli.ts); what remains here is what the extension
// must do SYNCHRONOUSLY, in process: read the declared slugs and
// validate a new one while the operator types it.
//
// A module bounds a repository's CODE — its roots, the spec sections
// that map to it, the assets it owns. It is not a grouping of sessions
// and never appears in the Work Explorer's tree.

import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

export const MODULES_MANIFEST_REL = path.join("docs", "modules.yaml");

/** The manifest path as shown to operators (forward-slashed on every OS). */
export const MODULES_MANIFEST_DISPLAY = MODULES_MANIFEST_REL.replace(/\\/g, "/");

/** The kebab-case shape a module slug must match. */
export const MODULE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The slugs `docs/modules.yaml` declares, in file order. An absent,
 * unreadable or malformed manifest reads as an empty list: this feeds
 * the live "already exists" check in an input box, and the CLI re-reads
 * and re-validates at write time, so a degraded read here can only make
 * the input box friendlier — never corrupt the manifest.
 */
export function readModuleSlugs(root: string): string[] {
  let doc: unknown;
  try {
    doc = YAML.parse(fs.readFileSync(path.join(root, MODULES_MANIFEST_REL), "utf8"));
  } catch {
    return [];
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  const raw = (doc as Record<string, unknown>).modules;
  if (!Array.isArray(raw)) return [];
  const slugs: string[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const slug = (entry as Record<string, unknown>).slug;
    if (typeof slug === "string" && slug.trim() && !slugs.includes(slug.trim())) {
      slugs.push(slug.trim());
    }
  }
  return slugs;
}

/**
 * Validate a prospective module slug against the shape rule and the
 * manifest's existing slugs. Returns an operator-readable error message,
 * or null when the slug is acceptable — the exact contract
 * `showInputBox`'s validateInput wants, so the palette flow and the
 * CLI's own fail-loud re-check share one rule.
 */
export function validateNewModuleSlug(
  raw: string,
  existingSlugs: readonly string[],
): string | null {
  const slug = (raw ?? "").trim();
  if (slug === "") {
    return "Enter a module slug (kebab-case, e.g. greeter).";
  }
  if (!MODULE_SLUG_RE.test(slug)) {
    return (
      "Module slugs are kebab-case: lowercase letters and digits, " +
      'joined by single hyphens (e.g. "greeter", "payment-api").'
    );
  }
  if (existingSlugs.includes(slug)) {
    return `Module "${slug}" already exists in ${MODULES_MANIFEST_DISPLAY}.`;
  }
  return null;
}
