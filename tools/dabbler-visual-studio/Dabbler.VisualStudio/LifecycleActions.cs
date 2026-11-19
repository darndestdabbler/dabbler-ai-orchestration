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

        // A report or a check of a stop is one provider call.
        private static readonly TimeSpan ReportLimit = TimeSpan.FromMinutes(15);

        // A rollback reverts, commits and pushes.
        private static readonly TimeSpan RollbackLimit = TimeSpan.FromMinutes(15);

        private readonly DabblerPackage package;

        public LifecycleActions(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>Runs <paramref name="action"/> in <paramref name="repositoryRoot"/> once a developer gives what it asks.</summary>
        public async Task RunAsync(string repositoryRoot, WorkExplorerAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (action.Preview != null)
            {
                // What the preview prints (Review exception's card) is read
                // before anything is asked; it writes nothing.
                var preview = await RunRouterAsync(repositoryRoot, action.Preview.Skip(1).ToList(), null, null);
                if (preview == null) return;
                if (!preview.Succeeded)
                {
                    ShowRefusal(preview.Words);
                    return;
                }
                package.Session?.Show(action.Title, preview.Printed);
            }
            var args = ActionAsk.Arguments(action, ActionDialog.Confirm, ActionDialog.AskReason);
            if (args == null) return;
            var closing = action.Id == ActionIds.CloseSession;
            var checking = action.Id == ActionIds.CheckStop;
            var result = closing ? await RunRouterAsync(repositoryRoot, args, CloseLimit, "Closing the session: running the gates")
                : checking ? await RunRouterAsync(repositoryRoot, args, ReportLimit, "Checking the stop: one provider call")
                : await RunRouterAsync(repositoryRoot, args, null, null);
            if (result == null) return;
            var words = result.Words;
            if (checking)
            {
                // The check's answer is advice to read, refused or not, and
                // longer than a line.
                package.Session?.Show(action.Title, result.Printed);
                await package.SayDoneAsync($"{action.Title}: its answer is in the {SessionPane.Title} pane of the Output window.");
                return;
            }
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
            ShowRefusal(words);
        }

        /// <summary>
        /// Report this stop to Dabbler: once confirmed, the report is written
        /// and opened in the editor for the developer to read and send
        /// themselves. Nothing is sent.
        /// </summary>
        public async Task ReportAsync(string repositoryRoot, WorkExplorerAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (ActionAsk.Arguments(action, ActionDialog.Confirm, ActionDialog.AskReason) == null) return;
            var report = await WriteReportAsync(repositoryRoot, action, rollingBack: false);
            if (report == null) return;
            if (report.Written == null)
            {
                ShowRefusal(report.Refusal ?? $"{action.Title} wrote no report.");
                return;
            }
            await package.SayDoneAsync(OpenReport(report.Written));
        }

        /// <summary>
        /// Rollback to Start of This Session: one question on the dry run's
        /// facts, and where a stop stands (the row offers Report this stop)
        /// the report offered first, because nothing can report the stop
        /// once its run record is moved aside. The rollback is bound to the
        /// HEAD the facts were read at. A report written is opened whether or
        /// not the rollback goes through.
        /// </summary>
        public async Task RollbackAsync(string repositoryRoot, IReadOnlyList<WorkExplorerAction> rowActions, WorkExplorerAction action)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (action.Preview == null) return;
            var dryRun = await RunRouterAsync(repositoryRoot, action.Preview.Skip(1).ToList(), null, null);
            if (dryRun == null) return;
            if (!dryRun.Succeeded)
            {
                ShowRefusal(dryRun.Words);
                return;
            }
            RollbackQuestion question;
            try
            {
                question = RollbackAsk.Ask(action, rowActions, dryRun.Words);
            }
            catch (FormatException error)
            {
                ShowRefusal(error.Message);
                return;
            }
            var keep = action.Confirm?.Keep;
            var choice = ActionDialog.Choose(question.Title, question.Detail, question.Choices, question.Choices[0], keep);
            if (choice != question.Accept && choice != RollbackAsk.ReportFirst) return;

            WrittenReport? written = null;
            if (choice == RollbackAsk.ReportFirst && question.Report != null)
            {
                var report = await WriteReportAsync(repositoryRoot, question.Report, rollingBack: true);
                if (report == null) return;
                written = report.Written;
                if (written == null)
                {
                    // Asked once, and the default keeps the session: rolling
                    // back is what makes the report impossible.
                    const string anyway = "Roll Back Anyway";
                    var keepSession = keep ?? "Keep";
                    var go = ActionDialog.Choose(
                        $"No report was written for the stop: {report.Refusal}",
                        "Once it is rolled back, this stop cannot be reported. Roll back anyway?",
                        new[] { anyway, keepSession },
                        keepSession,
                        keepSession);
                    if (go != anyway) return;
                }
            }

            var result = await RunRouterAsync(repositoryRoot, question.Arguments, RollbackLimit, "Rolling back to the start of the session");
            if (result == null) return;
            var opened = written != null ? OpenReport(written) : null;
            if (result.Succeeded)
            {
                var words = OneLine(result.Words.Length > 0 ? RollbackAsk.Done(result.Words) : action.Title);
                await package.SayDoneAsync(opened != null ? $"{words} {opened}" : words);
                return;
            }
            if (opened != null) await package.SayDoneAsync(opened);
            ShowRefusal(result.Words);
        }

        /// <summary>
        /// Writes the report <paramref name="reportStop"/> stands for: what was
        /// written, or why nothing was; null where the router cannot run here.
        /// </summary>
        internal async Task<ReportOutcome?> WriteReportAsync(string repositoryRoot, WorkExplorerAction reportStop, bool rollingBack)
        {
            var result = await RunRouterAsync(repositoryRoot, StopReport.Arguments(reportStop, rollingBack), ReportLimit, "Writing the report of the stop: one provider call");
            if (result == null) return null;
            if (!result.Succeeded) return new ReportOutcome(null, result.Words);
            try
            {
                return new ReportOutcome(StopReport.Written(repositoryRoot, result.Words), null);
            }
            catch (FormatException error)
            {
                return new ReportOutcome(null, error.Message);
            }
        }

        /// <summary>Opens a written report in the editor, and returns the sentence that says where it goes; it is never sent from here.</summary>
        private string OpenReport(WrittenReport report)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            FileOpener.Open(package, report.File);
            return report.ReportsTo != null
                ? $"The report is open in the editor. When you have read it, copy it and send it to {report.ReportsTo} yourself: nothing was sent."
                : $"The report is open in the editor ({report.File}): nothing was sent.";
        }

        /// <summary>A refusal, in the router's words.</summary>
        internal void ShowRefusal(string words)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            VsShellUtilities.ShowMessageBox(package, words, "Dabbler", OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }

        /// <summary>
        /// Runs the router with <paramref name="args"/> off the main thread,
        /// under a threaded wait dialog saying <paramref name="waiting"/> where
        /// one is given, and returns to the main thread with what it did; null
        /// where Node or the router is not there to run.
        /// </summary>
        internal async Task<Result?> RunRouterAsync(string repositoryRoot, IReadOnlyList<string> args, TimeSpan? limit, string? waiting)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (!await package.EnsureNodeAsync()) return null;
            var router = package.Router;
            if (router == null) return null;
            var progress = waiting != null ? await StartProgressAsync(waiting) : null;
            await TaskScheduler.Default;
            var result = Run(router, repositoryRoot, args, limit);
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            progress?.Dispose();
            return result;
        }

        private static string LastLine(string text)
        {
            var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
            return lines.Length > 0 ? lines[lines.Length - 1].Trim() : "";
        }

        // An information bar is one line.
        internal static string OneLine(string text)
        {
            return string.Join(" ", text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries).Select(line => line.Trim()));
        }

        /// <summary>The threaded wait dialog saying <paramref name="waiting"/>, or null where Visual Studio offers none.</summary>
        private async Task<ThreadedWaitDialogHelper.Session?> StartProgressAsync(string waiting)
        {
            if (!(await package.GetServiceAsync(typeof(SVsThreadedWaitDialogFactory)) is IVsThreadedWaitDialogFactory factory)) return null;
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            return factory.StartWaitDialog("Dabbler", new ThreadedWaitDialogProgressData(waiting, isCancelable: false), TimeSpan.FromSeconds(1));
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

        internal sealed class Result
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

        /// <summary>The report written, or why none was.</summary>
        internal sealed class ReportOutcome
        {
            public ReportOutcome(WrittenReport? written, string? refusal)
            {
                Written = written;
                Refusal = refusal;
            }

            public WrittenReport? Written { get; }

            public string? Refusal { get; }
        }
    }
}
