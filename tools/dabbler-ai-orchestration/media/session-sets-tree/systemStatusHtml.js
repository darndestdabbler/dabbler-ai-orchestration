(function (factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    (typeof self !== "undefined" ? self : this).DabblerSystemStatusHtml = factory();
  }
})(function () {
  var PROVIDER_KEY_TEXT =
    "No provider API key was found for direct API routing. Set at least one " +
    "DABBLER_ANTHROPIC_API_KEY, DABBLER_OPENAI_API_KEY, or " +
    "DABBLER_GEMINI_API_KEY value, then reload the VS Code window.";
  var PYTHON_TEXT =
    "Python was not found. Install Python or set dabblerSessionSets.pythonPath, " +
    "then reload the VS Code window.";
  var COPILOT_TEXT =
    "The GitHub Copilot CLI was not found. Install it or set " +
    "dabblerSessionSets.copilotCliPath, then reload the VS Code window.";
  var WORKSPACE_TEXT =
    "Workspace initialization is incomplete: the virtual environment, ai_router " +
    "package, and engine instruction files are required.";
  // Set 097 (spec D1): the durable replacement for the one-shot seat-setup
  // toast. Shown whenever the workspace's durable evidence says the
  // operator chose the Copilot seat but it is not confirmed yet — never a
  // nag on a workspace that never chose Copilot, and never suppressed by a
  // form that has (silently or otherwise) repainted back to Full/Direct
  // API, since that repaint is exactly the defect this note exists to
  // survive.
  var COPILOT_SEAT_UNCONFIRMED_TEXT =
    "You selected the GitHub Copilot CLI seat during setup, but it is not " +
    "confirmed yet — ai_router/router-config.yaml still runs on the api " +
    "profile. Re-run seat setup (no need to re-scaffold): ";

  function escHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderSystemStatus(status, controls) {
    if (!status || status.workspaceOpen === false) return "";
    var profile =
      controls && controls.transportProfile === "copilot-cli" ? "copilot-cli" : "api";
    var faults = [];
    if (status.workspaceInitialized === false) {
      faults.push({ code: "workspace-initialization", text: WORKSPACE_TEXT });
    }
    if (status.pythonPresent === false) {
      faults.push({ code: "python", text: PYTHON_TEXT });
    }
    // Set 112 S3 (operator UAT walk): the provider-key fault is gated on the
    // workspace being BUILT, not merely on the api profile being current.
    //
    // `api` is the DEFAULT profile, and an explicit "Direct provider API
    // keys" pick is never written to disk (gitScaffold records only the
    // Copilot choice, since api needs no override). So "profile === api"
    // is true on a brand-new project where the operator has chosen nothing
    // at all -- and the Getting Started form, whose whole first question is
    // which provider path to take, opened under a warning about the answer
    // it was still asking for. The operator's rule, from the walk: this
    // "should only become an issue when users select the direct API
    // approach and the API keys are not in the environment variables".
    //
    // `workspaceInitialized` is that line. Before it, the strip already
    // says the workspace is not set up, which is the accurate and
    // sufficient message; a second fault about keys is noise for the same
    // state. After it, a keyless direct-API workspace is a real, actionable
    // fault and still warns. This also makes the two transport faults
    // symmetric -- the copilot-cli fault has always required an ACTUAL
    // choice, because `copilot-cli` is never a default.
    if (
      profile === "api" &&
      status.providerKeyPresent === false &&
      status.workspaceInitialized !== false
    ) {
      faults.push({ code: "provider-key", text: PROVIDER_KEY_TEXT });
    }
    if (profile === "copilot-cli" && status.copilotCliPresent === false) {
      faults.push({ code: "copilot-cli", text: COPILOT_TEXT });
    }
    // Set 097 (spec D1): gated on the HOST-COMPUTED durable signal only —
    // deliberately NOT on `profile` (the live/possibly-reverted control
    // state) — so the note survives the exact repaint the defect causes.
    if (status.copilotSeatChosenUnconfirmed === true) {
      faults.push({
        code: "copilot-seat-unconfirmed",
        text: COPILOT_SEAT_UNCONFIRMED_TEXT + (status.copilotSeatRerunHint || ""),
      });
    }
    (status.manifestFaults || []).forEach(function (fault) {
      var suffix = fault.retainedLastKnownGood
        ? " Showing the last-known-good module tree."
        : " No prior valid module tree is available; showing recoverable fallback groups.";
      faults.push({
        code: "manifest-invalid",
        text: fault.rootLabel + ": " + fault.message + suffix,
      });
    });
    if (faults.length === 0) return "";
    return (
      '<section class="system-status" role="status" aria-live="polite" ' +
        'data-testid="system-status">' +
        '<div class="system-status-title">System Status</div>' +
        '<ul class="system-status-list">' +
          faults.map(function (fault) {
            return '<li class="system-status-item" data-status-code="' +
              fault.code + '">' + escHtml(fault.text) + "</li>";
          }).join("") +
        "</ul>" +
      "</section>"
    );
  }

  return {
    renderSystemStatus: renderSystemStatus,
    PROVIDER_KEY_TEXT: PROVIDER_KEY_TEXT,
    PYTHON_TEXT: PYTHON_TEXT,
    COPILOT_TEXT: COPILOT_TEXT,
    WORKSPACE_TEXT: WORKSPACE_TEXT,
    COPILOT_SEAT_UNCONFIRMED_TEXT: COPILOT_SEAT_UNCONFIRMED_TEXT,
  };
});