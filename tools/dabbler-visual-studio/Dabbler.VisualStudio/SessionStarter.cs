using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Start Session: `dabbler session start --json` with this repository's
    /// configured engine and authoring model, and a refusal's ways on as
    /// buttons. Which engine and which model is the Configuration's to say;
    /// whether the session starts is the router's.
    /// </summary>
    internal sealed class SessionStarter
    {
        // A release start drives the release before it answers.
        private static readonly TimeSpan StartLimit = TimeSpan.FromHours(1);

        private readonly DabblerPackage package;

        public SessionStarter(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Runs the Start Session <paramref name="action"/> in <paramref name="repositoryRoot"/>.</summary>
        public async Task StartAsync(string repositoryRoot, WorkExplorerAction action)
        {
            if (action.Argv == null || !await package.EnsureNodeAsync()) return;
            var router = package.Router;
            if (router == null) return;
            await TaskScheduler.Default;
            var choice = ReadConfiguration(router, repositoryRoot, out var unreadable);
            if (choice == null || choice.Missing != null)
            {
                await SayAsync(unreadable ?? choice!.Missing!, OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            IReadOnlyList<string> args = action.Argv.Skip(1)
                .Concat(new[] { "--engine", choice.Engine!, "--model", choice.AuthoringModel!, "--json" })
                .ToList();
            while (true)
            {
                var answer = Start(router, repositoryRoot, args, out var words);
                await package.JoinableTaskFactory.SwitchToMainThreadAsync();
                if (answer?.Registered == true)
                {
                    await package.ShowTerminalQuietlyAsync();
                    await new EngineTab(package).OpenAsync(repositoryRoot, action, choice);
                    return;
                }
                var refusal = answer?.Refusal ?? words;
                var buttons = answer?.Buttons ?? Array.Empty<StartButton>();
                if (buttons.Count == 0)
                {
                    await SayAsync(refusal, OLEMSGICON.OLEMSGICON_WARNING);
                    return;
                }
                var chosen = StartRefusalDialog.Ask(refusal, buttons);
                if (chosen == null) return;
                args = chosen.Args;
                await TaskScheduler.Default;
            }
        }

        /// <summary>The configured choice, or null with why it could not be read.</summary>
        internal static ConfiguredChoice? ReadConfiguration(Router router, string repositoryRoot, out string? unreadable)
        {
            unreadable = null;
            try
            {
                return ConfiguredChoice.Read(router.Run(repositoryRoot, new[] { "view", "configuration", "--repo-root", repositoryRoot }));
            }
            catch (RouterFailure failure)
            {
                unreadable = failure.Message;
            }
            catch (FormatException error)
            {
                unreadable = error.Message;
            }
            return null;
        }

        /// <summary>
        /// The start's answer, read from what it printed whether or not it
        /// exited 0, or null where it printed none; <paramref name="words"/>
        /// is what it said where it failed.
        /// </summary>
        private static StartAnswer? Start(Router router, string repositoryRoot, IReadOnlyList<string> args, out string words)
        {
            string output;
            words = "The session did not start.";
            try
            {
                output = router.Run(repositoryRoot, args, StartLimit);
            }
            catch (RouterFailure failure)
            {
                output = failure.Output;
                words = failure.Message;
            }
            if (output.Trim().Length == 0) return null;
            try
            {
                return StartAnswer.Parse(output);
            }
            catch (FormatException)
            {
                return null;
            }
        }

        private async Task SayAsync(string text, OLEMSGICON icon)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            VsShellUtilities.ShowMessageBox(package, text, "Dabbler", icon, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}
