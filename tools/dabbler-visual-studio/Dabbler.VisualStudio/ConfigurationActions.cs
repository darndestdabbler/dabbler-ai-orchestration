using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// A developer's action on a Configuration row: ask what the router said
    /// it needs (ConfigurationAsk, through PickDialog), run the command the
    /// answer names off the main thread, and say on the window what the
    /// router printed, its sentence or its refusal. What may be chosen, and
    /// whether it may, is the router's.
    /// </summary>
    internal sealed class ConfigurationActions
    {
        // One metadata request per vendor and one seat conversation: seconds, not minutes.
        private static readonly TimeSpan RefreshLimit = TimeSpan.FromMinutes(5);

        private readonly DabblerPackage package;

        private readonly ConfigurationWindow window;

        public ConfigurationActions(DabblerPackage package, ConfigurationWindow window)
        {
            this.package = package;
            this.window = window;
        }

        /// <summary>Runs <paramref name="action"/> in <paramref name="folder"/> once a developer gives what it asks.</summary>
        public async Task RunAsync(string folder, ConfigurationAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (action.Unavailable != null)
            {
                window.Say(action.Unavailable, refused: true);
                return;
            }
            var args = Ask(action);
            if (args == null) return;
            if (action.Id == ConfigurationAsk.RefreshRecord)
            {
                await RefreshAsync(folder, action.Title, args);
                return;
            }
            if (action.Id == ConfigurationAsk.StoreCredential)
            {
                // The key is asked for by `dabbler auth set`, in its own
                // terminal with the echo off, and never in this window. The
                // API Keys rows repaint when it is stored, because the window
                // follows the credentials index.
                if (!await new EngineTab(package).OpenRouterAsync(folder, action.Title, args)) return;
                await package.JoinableTaskFactory.SwitchToMainThreadAsync();
                window.Say($"{action.Title}: the key is asked for in the {WindowsTerminal.WindowName} window of Windows Terminal. Closing that tab stores nothing.", refused: false);
                return;
            }
            var lifecycle = new LifecycleActions(package);
            var result = await lifecycle.RunRouterAsync(folder, args, null, null);
            if (result == null) return;
            var words = LifecycleActions.OneLine(result.Words);
            window.Say(words.Length > 0 ? words : action.Title, refused: !result.Succeeded);
        }

        /// <summary>
        /// Update the Catalog: runs the router's refresh, shows what it
        /// printed in the Dabbler Session pane, and says on the window how it
        /// ended. The window repaints by itself, because it follows the catalog.
        /// </summary>
        public async Task RefreshAsync(string folder, string title, IReadOnlyList<string> args)
        {
            var result = await new LifecycleActions(package).RunRouterAsync(folder, args, RefreshLimit, "Updating the model catalog");
            if (result == null) return;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            package.Session?.Show(title, result.Printed);
            window.Say(
                result.Succeeded
                    ? $"{title}: done. What it read is in the {SessionPane.Title} pane of the Output window."
                    : $"{title} did not finish: {LifecycleActions.OneLine(result.Words)} Its lines are in the {SessionPane.Title} pane of the Output window.",
                refused: !result.Succeeded);
        }

        /// <summary>
        /// The router arguments the developer's answer runs, or null where
        /// they chose nothing: a pick's chosen or typed command, or an action's
        /// own command once its confirmation is accepted.
        /// </summary>
        private static IReadOnlyList<string>? Ask(ConfigurationAction action)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var pick = action.Pick;
            if (pick == null) return ConfigurationAsk.Arguments(action, ActionDialog.Confirm);
            return pick.Typed != null ? ConfigurationAsk.Typed(pick, PickDialog.Type(pick)) : PickDialog.Choose(pick)?.Arguments;
        }
    }
}
