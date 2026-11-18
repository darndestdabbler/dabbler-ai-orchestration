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
    /// A person's verb on a session: ask what the router said it needs
    /// (ActionAsk, in ActionDialog), run it off the main thread, and say what
    /// the router printed: a success in an information bar on the Work
    /// Explorer, a refusal in a dialog. Whether it may run is the router's.
    /// </summary>
    internal sealed class LifecycleActions
    {
        // A close runs the gates, and the run of record behind them can be long.
        private static readonly TimeSpan CloseLimit = TimeSpan.FromHours(1);

        private readonly DabblerPackage package;

        public LifecycleActions(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Runs <paramref name="action"/> in <paramref name="repositoryRoot"/> once a developer gives what it asks.</summary>
        public async Task RunAsync(string repositoryRoot, WorkExplorerAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            var args = ActionAsk.Arguments(action, ActionDialog.Confirm, ActionDialog.AskReason);
            if (args == null || !await package.EnsureNodeAsync()) return;
            var router = package.Router;
            if (router == null) return;
            var closing = action.Id == ActionIds.CloseSession;
            var progress = closing ? await StartProgressAsync() : null;
            await TaskScheduler.Default;
            var result = Run(router, repositoryRoot, args, closing ? CloseLimit : (TimeSpan?)null);
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            progress?.Dispose();
            var words = result.Words;
            if (closing)
            {
                // A close's rows say which gate refused and what to do: the
                // whole value of a refusal, and too many for a dialog.
                package.Session?.Show(action.Title, result.Printed);
                words = result.Succeeded
                    ? LastLine(words)
                    : $"{action.Title} was refused. The gate rows are in the {SessionPane.Title} pane of the Output window: read them there for which gate refused and what to do.";
            }
            if (result.Succeeded)
            {
                await package.SayDoneAsync(OneLine(words.Length > 0 ? words : action.Title));
                return;
            }
            VsShellUtilities.ShowMessageBox(package, words, "Dabbler", OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }

        private static string LastLine(string text)
        {
            var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            return lines.Length > 0 ? lines[lines.Length - 1].Trim() : "";
        }

        // An information bar is one line.
        private static string OneLine(string text)
        {
            return string.Join(" ", text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries).Select(line => line.Trim()));
        }

        /// <summary>The threaded wait dialog over a close, or null where Visual Studio offers none.</summary>
        private async Task<ThreadedWaitDialogHelper.Session?> StartProgressAsync()
        {
            if (!(await package.GetServiceAsync(typeof(SVsThreadedWaitDialogFactory)) is IVsThreadedWaitDialogFactory factory)) return null;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            return factory.StartWaitDialog("Dabbler", new ThreadedWaitDialogProgressData("Closing the session: running the gates", isCancelable: false), TimeSpan.FromSeconds(1));
        }

        /// <summary>
        /// Whether the verb succeeded, what to say (its output, or the words
        /// of its refusal), and everything it printed.
        /// </summary>
        private static Result Run(Router router, string repositoryRoot, IReadOnlyList<string> args, TimeSpan? limit)
        {
            try
            {
                var output = router.Run(repositoryRoot, args, limit).Trim();
                return new Result(true, output, output);
            }
            catch (RouterFailure failure)
            {
                var printed = failure.Output.Trim();
                if (!printed.Contains(failure.Message)) printed = (printed + Environment.NewLine + failure.Message).Trim();
                return new Result(false, failure.Message, printed);
            }
        }

        private sealed class Result
        {
            public Result(bool succeeded, string words, string printed)
            {
                Succeeded = succeeded;
                Words = words;
                Printed = printed;
            }

            public bool Succeeded { get; }

            public string Words { get; }

            public string Printed { get; }
        }
    }
}
