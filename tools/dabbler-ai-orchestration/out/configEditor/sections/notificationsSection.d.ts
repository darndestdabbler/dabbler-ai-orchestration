import { SectionState, SectionRenderResult } from "./types";
/**
 * §5 Notifications.
 *
 * Pushover toggle + two env-var-name inputs with ✓/(unset) badges.
 * The "Send a test notification now" button fires a live Pushover call
 * using the configured env vars; the result surfaces via a VS Code
 * info/error notification.
 *
 * Appendix B: all three fields live in local-overrides.yaml only.
 */
export declare function render(state: SectionState): SectionRenderResult;
