using System;
using System.Collections.Generic;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// What a row action asks a person before it runs, read from the router's
    /// own description of it: a confirmation, a reason, both, or nothing. The
    /// words are the router's; this decides only whether the command runs,
    /// and with which reason.
    /// </summary>
    public static class ActionAsk
    {
        /// <summary>
        /// The router arguments <paramref name="action"/> runs (its argv
        /// without the leading `dabbler`), or null where it runs nothing: it
        /// has no command, its confirmation was not accepted, or its reason
        /// box was dismissed or left blank where the router says that aborts.
        /// <paramref name="confirm"/> is true only for the confirmation's
        /// accept; <paramref name="reason"/> is what was typed, or null where
        /// the box was dismissed. A reason reaches the command as
        /// `--reason &lt;text&gt;`.
        /// </summary>
        public static IReadOnlyList<string>? Arguments(
            WorkExplorerAction action,
            Func<WorkExplorerConfirmation, bool> confirm,
            Func<WorkExplorerReason, string?> reason)
        {
            if (action.Argv == null) return null;
            if (action.Confirm != null && !confirm(action.Confirm)) return null;
            var args = action.Argv.Skip(1).ToList();
            if (action.Reason == null) return args;
            var typed = reason(action.Reason);
            if (typed == null && action.Reason.Dismissed != "blank") return null;
            var text = (typed ?? "").Trim();
            if (text.Length == 0)
            {
                if (action.Reason.Blank == null) return null;
                text = action.Reason.Blank;
            }
            args.Add("--reason");
            args.Add(text);
            return args;
        }
    }
}
