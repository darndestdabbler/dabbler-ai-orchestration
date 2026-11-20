using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Imaging;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using SolutionEvents = Microsoft.VisualStudio.Shell.Events.SolutionEvents;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Dabbler Configuration window: the rows `dabbler view configuration
    /// --follow` prints for the git repository holding the open solution, or
    /// this machine's defaults alone where there is none, shown again whole
    /// each time the router prints them.
    /// </summary>
    [Guid("e8b5f0d2-7c41-4a9e-b3d6-2f1a8c94e605")]
    public sealed class ConfigurationWindow : ToolWindowPane
    {
        // Whether this Visual Studio has read an unread catalog without being asked; main thread only.
        private static bool unreadTaken;

        private readonly ConfigurationTree tree = new ConfigurationTree();

        private RouterFollow? follow;

        // The folder followed, which a row's action runs in: the repository's
        // root, or the router's own folder where only this machine is shown.
        // Main thread only.
        private string? folder;

        // Which following is current. A document or a restart that belongs to
        // an earlier one is dropped; read and written on the main thread only.
        private int generation;

        // The information bar the window shows last; main thread only.
        private IVsInfoBarUIElement? infoBar;

        public ConfigurationWindow()
            : base(null)
        {
            Caption = "Dabbler Configuration";
            var control = new ConfigurationControl { DataContext = tree };
            control.ActionChosen += OnActionChosen;
            Content = control;
        }

        private DabblerPackage Dabbler => (DabblerPackage)Package;

        private void OnActionChosen(object sender, ConfigurationAction action)
        {
            var where = folder;
            if (where == null) return;
            Dabbler.JoinableTaskFactory.RunAsync(() => new ConfigurationActions(Dabbler, this).RunAsync(where, action))
                .FileAndForget("dabbler/configuration/action");
        }

        /// <summary>
        /// Says <paramref name="text"/> in an information bar across the top
        /// of the window, in place of the one it said last; a refusal with a
        /// warning icon.
        /// </summary>
        internal void Say(string text, bool refused)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            infoBar?.Close();
            infoBar = null;
            if (!(GetService(typeof(SVsInfoBarUIFactory)) is IVsInfoBarUIFactory factory)) return;
            infoBar = factory.CreateInfoBar(new InfoBarModel(text, refused ? KnownMonikers.StatusWarning : KnownMonikers.StatusInformation));
            AddInfoBar(infoBar);
        }

        public override void OnToolWindowCreated()
        {
            base.OnToolWindowCreated();
            SolutionEvents.OnAfterOpenSolution += OnSolutionChanged;
            SolutionEvents.OnAfterCloseSolution += OnSolutionChanged;
            Restart();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                SolutionEvents.OnAfterOpenSolution -= OnSolutionChanged;
                SolutionEvents.OnAfterCloseSolution -= OnSolutionChanged;
                generation++;
                Stop();
            }
            base.Dispose(disposing);
        }

        private void OnSolutionChanged(object sender, EventArgs e)
        {
            Restart();
        }

        private void Restart()
        {
            Dabbler.JoinableTaskFactory.RunAsync(RestartAsync).FileAndForget("dabbler/configuration/follow");
        }

        /// <summary>Stops what is followed, and follows the open solution's repository, or this machine's defaults.</summary>
        private async Task RestartAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            var mine = ++generation;
            Stop();
            folder = null;
            tree.Clear();
            var solution = await Dabbler.SolutionFolderAsync();
            if (mine != generation) return;
            var root = solution != null ? WorkExplorerTree.RepositoryRootOf(solution) : null;
            if (!await Dabbler.EnsureNodeAsync() || mine != generation) return;
            var router = Dabbler.Router;
            if (router == null) return;
            var args = new List<string> { "view", "configuration" };
            if (root != null) args.AddRange(new[] { "--repo-root", root });
            args.Add("--follow");
            folder = root ?? Path.GetDirectoryName(router.BundlePath)!;
            follow = new RouterFollow(
                router,
                folder,
                args,
                line => OnDocument(mine, line),
                Dabbler.Commands);
        }

        /// <summary>
        /// One line the router printed, read off the main thread and shown on
        /// it. A line that is not a document is said in the Dabbler Commands
        /// pane, and the rows stay as they were.
        /// </summary>
        private void OnDocument(int mine, string line)
        {
            ConfigurationDocument document;
            try
            {
                document = ConfigurationDocument.Parse(line);
            }
            catch (FormatException error)
            {
                Dabbler.Commands?.Wrote(error.Message);
                return;
            }
            Dabbler.JoinableTaskFactory.RunAsync(async () =>
            {
                await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
                if (mine != generation) return;
                tree.Show(document);
                await ReadUnreadCatalogAsync(document);
            }).FileAndForget("dabbler/configuration/show");
        }

        /// <summary>
        /// The first time a document says a transport this machine reaches has
        /// never been read, Update the Catalog runs without being asked, once
        /// in this Visual Studio: it is free, and every model choice on that
        /// transport fails until it has run.
        /// </summary>
        private async Task ReadUnreadCatalogAsync(ConfigurationDocument document)
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            var where = folder;
            var args = ConfigurationAsk.UnreadRefresh(document);
            if (unreadTaken || where == null || args == null) return;
            unreadTaken = true;
            var title = document.Configuration.Actions.First(action => action.Id == ConfigurationAsk.RefreshRecord).Title;
            await new ConfigurationActions(Dabbler, this).RefreshAsync(where, title, args);
        }

        private void Stop()
        {
            follow?.Dispose();
            follow = null;
        }
    }
}
