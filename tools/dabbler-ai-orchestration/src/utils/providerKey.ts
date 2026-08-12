// Whether this machine holds any provider API key.
//
// Set 123 S3: extracted from `utils/gettingStartedDetection.ts`, which was
// deleted with the Getting Started webview form it modelled. This one
// predicate outlived that surface — `commands/gitScaffold.ts` uses it to
// decide whether a freshly scaffolded project can route through the Direct
// APIs transport at all — so it is relocated rather than retired.
//
// Deliberately NOT merged into `ai_router`'s resolution: this is a
// *presence* probe for a scaffolding warning, not the answer to "what
// verifies this project". That answer now lives in one place only,
// `project-verify-type.txt`, resolved by `python -m ai_router.verify_type`
// (Set 123 S1). A key being present says nothing about which type the
// project committed to, and this module must never be read as though it did.

// The provider keys the router can route through. Any ONE of them present
// is enough — the router needs at least one provider, not all three.
const PROVIDER_KEY_VARS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
] as const;

/**
 * True iff at least one `DABBLER_*_API_KEY` resolves to a non-blank value
 * in `env`.
 *
 * The caller passes `process.env`, which covers BOTH Windows System and
 * User environment variables: the VS Code extension host inherits the
 * merged System+User environment captured when VS Code launched. That
 * launch-time capture is also why the operator is told to **reload the
 * window** after setting a key — a variable set after launch (System or
 * User) is invisible to `process.env` until the window reloads.
 *
 * A whitespace-only value counts as absent: it cannot authenticate, so
 * treating it as present would suppress the warning exactly when the
 * operator needs it.
 */
export function providerKeyPresent(
  env: Record<string, string | undefined>,
): boolean {
  return PROVIDER_KEY_VARS.some((k) => {
    const v = env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}
