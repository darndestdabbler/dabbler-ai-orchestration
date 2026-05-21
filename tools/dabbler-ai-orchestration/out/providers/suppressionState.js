"use strict";
// Manual-collapse suppression state for the Set 029 Session 4 custom
// tree. Per S4 audit Q2(a) + GPT-5.4 M7: the suppression key is the
// (slug, marker.updatedAt) tuple — naturally aging because the key
// changes on every new SessionStart. Pure reducer functions; the
// caller persists the resulting state via vscode workspaceState.
//
// The state object is `Record<slug, marker.updatedAt>`. A row is
// suppressed iff `state[slug] === currentMarker.updatedAt` for that
// row's marker. Manual re-expand clears state[slug]. Pruning drops
// entries whose slug is no longer in the visible set list.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuppressed = isSuppressed;
exports.suppress = suppress;
exports.clearSuppression = clearSuppression;
exports.prune = prune;
// Is the row for this (slug, updatedAt) currently suppressed?
function isSuppressed(state, slug, markerUpdatedAt) {
    if (!markerUpdatedAt)
        return false;
    return state[slug] === markerUpdatedAt;
}
// Operator manually collapsed the accordion. Suppress auto-expand
// for THIS occurrence (same updatedAt). The next SessionStart writes
// a fresh marker with a new updatedAt — that automatically un-
// suppresses because the key tuple no longer matches.
function suppress(state, slug, markerUpdatedAt) {
    return { ...state, [slug]: markerUpdatedAt };
}
// Operator manually expanded the row again (clicked the collapsed
// header). Clear suppression for the slug entirely — the next
// auto-expand signal will fire normally even within the current
// occurrence.
function clearSuppression(state, slug) {
    if (!(slug in state))
        return state;
    const next = { ...state };
    delete next[slug];
    return next;
}
// Prune entries whose slug is no longer in the visible-set list.
// Prevents workspaceState from accumulating stale keys after sets
// are renamed, deleted, or moved.
function prune(state, visibleSlugs) {
    let changed = false;
    const next = {};
    for (const slug of Object.keys(state)) {
        if (visibleSlugs.has(slug)) {
            next[slug] = state[slug];
        }
        else {
            changed = true;
        }
    }
    return changed ? next : state;
}
//# sourceMappingURL=suppressionState.js.map