// One model id, spelled one way.
//
// The registry and a seat catalog spell the same model differently, and
// more than one layer has to decide whether two ids name one model:
// `identity` resolves who verified, `selection` filters candidates. While
// the normalizer lived in `identity`, selection's import of it was a
// back-edge in the 2026-09-02 measurement; a spelling rule is a shared
// shape, so it lives with the contracts.

const DATE_SUFFIX = /-\d{8}$/;

/**
 * Lowercased, dot-to-dash, and for Claude ids the date suffix dropped --
 * the transformations under which two spellings of one model compare
 * equal, and no more than those: a rule loose enough to make another
 * provider's id normalize onto a real entry would be worse than none.
 */
export function normalizeModelToken(model: string): string {
  let token = model.trim().toLowerCase().replace(/\./g, "-");
  if (token.startsWith("claude-")) token = token.replace(DATE_SUFFIX, "");
  return token;
}
