using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
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
            if (action.Argv == null || !await ReadyAsync() || !await package.EnsureNodeAsync()) return;
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
            await RunAsync(router, repositoryRoot, action, args, choice);
        }

        /// <summary>
        /// Start Session with Different Models: the engine, the authoring
        /// model, the reviewing vehicle and the two reviewers asked in turn,
        /// each from the pick the router prints for the answers before it,
        /// and the start run with them for this one session. A dismissed
        /// question starts nothing.
        /// </summary>
        public async Task StartWithDifferentModelsAsync(string repositoryRoot, WorkExplorerAction action)
        {
            if (action.Argv == null || !await ReadyAsync() || !await package.EnsureNodeAsync()) return;
            var router = package.Router;
            if (router == null) return;
            await TaskScheduler.Default;
            var configured = ReadConfiguration(router, repositoryRoot, out var unreadable);
            if (configured == null)
            {
                await SayAsync(unreadable!, OLEMSGICON.OLEMSGICON_WARNING);
                return;
            }
            var answers = new DifferentModelsAnswers();
            for (var at = 0; at < DifferentModels.Questions.Count; at++)
            {
                ConfigurationDocument document;
                try
                {
                    document = ConfigurationDocument.Parse(router.Run(repositoryRoot, DifferentModels.ViewArguments(repositoryRoot, answers)));
                }
                catch (Exception error) when (error is RouterFailure || error is FormatException)
                {
                    await SayAsync(error.Message, OLEMSGICON.OLEMSGICON_WARNING);
                    return;
                }
                var question = DifferentModels.ActionFor(document, DifferentModels.Questions[at]);
                if (question == null) continue;
                if (question.Unavailable != null)
                {
                    await SayAsync(question.Unavailable, OLEMSGICON.OLEMSGICON_WARNING);
                    return;
                }
                if (question.Pick == null) continue;
                await package.JoinableTaskFactory.SwitchToMainThreadAsync();
                if (!Ask(question.Pick, out var answer)) return;
                switch (at)
                {
                    case 0: answers.Engine = answer; break;
                    case 1: answers.AuthoringModel = answer; break;
                    case 2: answers.ReviewerTransport = answer; break;
                    case 3: answers.PrimaryReviewerModel = answer; break;
                    default: answers.AuxiliaryReviewerModel = answer; break;
                }
                await TaskScheduler.Default;
            }
            var args = DifferentModels.Arguments(action.Argv.Skip(1).ToList(), configured, answers);
            await RunAsync(router, repositoryRoot, action, args, DifferentModels.Launching(configured, answers));
        }

        /// <summary>
        /// Whether to go on: true where Visual Studio has no unsaved document,
        /// no debugger running and no build in progress, or the developer
        /// chose to go on once told which (saving every document first where
        /// they chose that). Nothing is stopped or closed here.
        /// </summary>
        private async Task<bool> ReadyAsync()
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            var table = await package.GetServiceAsync(typeof(SVsRunningDocumentTable)) as IVsRunningDocumentTable;
            var debugger = await package.GetServiceAsync(typeof(SVsShellDebugger)) as IVsDebugger;
            var builds = await package.GetServiceAsync(typeof(SVsSolutionBuildManager)) as IVsSolutionBuildManager;
            var question = StartCheck.Ask(UnsavedDocuments(), Debugging(debugger), Building(builds));
            if (question == null) return true;
            var chosen = ActionDialog.Choose(question.Title, question.Detail, question.Choices, question.DefaultChoice, StartCheck.NotNow);
            if (chosen == StartCheck.GoOnAnyway) return true;
            if (chosen != StartCheck.SaveAllAndGoOn || table == null) return false;
            // A null hierarchy saves every dirty document in the table.
            var saved = table.SaveDocuments((uint)__VSRDTSAVEOPTIONS.RDTSAVEOPT_SaveIfDirty, null, VSConstants.VSITEMID_NIL, 0);
            if (ErrorHandler.Succeeded(saved) && UnsavedDocuments().Count == 0) return true;
            VsShellUtilities.ShowMessageBox(package, "Not every document was saved, so the session did not start. Save them, or start again and choose Go On Anyway.",
                "Dabbler", OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
            return false;
        }

        /// <summary>The file names of the running document table's documents that have unsaved changes.</summary>
        private List<string> UnsavedDocuments()
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var unsaved = new List<string>();
            foreach (var document in new RunningDocumentTable(package))
            {
                if ((document.Flags & (uint)_VSRDTFLAGS.RDT_VirtualDocument) != 0) continue;
                if (!(document.DocData is IVsPersistDocData data)) continue;
                if (ErrorHandler.Succeeded(data.IsDocDataDirty(out var dirty)) && dirty != 0)
                {
                    unsaved.Add(Path.GetFileName(document.Moniker) is string name && name.Length > 0 ? name : document.Moniker);
                }
            }
            return unsaved;
        }

        private static bool Debugging(IVsDebugger? debugger)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var mode = new DBGMODE[1];
            return debugger != null && ErrorHandler.Succeeded(debugger.GetMode(mode)) && (mode[0] & ~DBGMODE.DBGMODE_EncMask) != DBGMODE.DBGMODE_Design;
        }

        private static bool Building(IVsSolutionBuildManager? builds)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            return builds != null && ErrorHandler.Succeeded(builds.QueryBuildManagerBusy(out var busy)) && busy != 0;
        }

        /// <summary>
        /// One question: the chosen choice's value, or a typed model id (blank
        /// leaves it at its default); false where the developer dismissed it.
        /// </summary>
        private static bool Ask(ConfigurationPick pick, out string? answer)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (pick.Typed != null)
            {
                answer = PickDialog.Type(pick);
                return answer != null;
            }
            var item = PickDialog.Choose(pick);
            answer = item?.Value;
            return item != null;
        }

        /// <summary>Runs the start with <paramref name="args"/>, offers a refusal's ways on, and opens the engine with <paramref name="choice"/> once it registers.</summary>
        private async Task RunAsync(Router router, string repositoryRoot, WorkExplorerAction action, IReadOnlyList<string> args, ConfiguredChoice choice)
        {
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
