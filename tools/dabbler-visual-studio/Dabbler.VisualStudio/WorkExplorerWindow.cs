using System;
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
    /// The Dabbler Work Explorer: the tree `dabbler view work-explorer --follow`
    /// prints for the git repository holding the open solution, shown again
    /// whole each time the router prints it.
    /// </summary>
    [Guid("6a1f6c55-3d1e-4f7b-9a43-0c5e2b8f71d4")]
    public sealed class WorkExplorerWindow : ToolWindowPane
    {
        private readonly WorkExplorerTree tree = new WorkExplorerTree();

        private RouterFollow? follow;

        // The repository being followed, which a row's action runs in; main thread only.
        private string? repositoryRoot;

        // Which following is current. A document or a restart that belongs to
        // an earlier one is dropped; read and written on the main thread only.
        private int generation;

        // The information bar the window shows last; main thread only.
        private IVsInfoBarUIElement? infoBar;

        public WorkExplorerWindow()
            : base(null)
        {
            Caption = "Dabbler Work Explorer";
            var control = new WorkExplorerControl { DataContext = tree };
            control.ActionChosen += OnActionChosen;
            control.DifferentModelsChosen += OnDifferentModelsChosen;
            control.SetUpChosen += OnSetUpChosen;
            Content = control;
        }

        // Whether a set-up is running, so a second click does not start another; main thread only.
        private bool settingUp;

        private void OnSetUpChosen(object sender, EventArgs e)
        {
            var root = repositoryRoot;
            if (root == null || settingUp) return;
            settingUp = true;
            Dabbler.JoinableTaskFactory.RunAsync(async () =>
            {
                try
                {
                    await new SolutionSetUp(Dabbler).RunAsync(root, Restart);
                }
                finally
                {
                    await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
                    settingUp = false;
                }
            }).FileAndForget("dabbler/work-explorer/set-up");
        }

        private void OnDifferentModelsChosen(object sender, WorkExplorerAction start)
        {
            var root = repositoryRoot;
            if (root == null) return;
            Dabbler.JoinableTaskFactory.RunAsync(() => new SessionStarter(Dabbler).StartWithDifferentModelsAsync(root, start))
                .FileAndForget("dabbler/work-explorer/different-models");
        }

        private void OnActionChosen(object sender, (WorkExplorerNode Node, WorkExplorerAction Action) chosen)
        {
            var root = repositoryRoot;
            if (root == null) return;
            Dabbler.JoinableTaskFactory.RunAsync(() => new RowActions(Dabbler).RunAsync(root, chosen.Node, chosen.Action))
                .FileAndForget("dabbler/work-explorer/action");
        }

        private DabblerPackage Dabbler => (DabblerPackage)Package;

        /// <summary>
        /// Says <paramref name="text"/> in an information bar across the top
        /// of the window, in place of the one it said last.
        /// </summary>
        internal void Say(string text)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            infoBar?.Close();
            infoBar = null;
            if (!(GetService(typeof(SVsInfoBarUIFactory)) is IVsInfoBarUIFactory factory)) return;
            infoBar = factory.CreateInfoBar(new InfoBarModel(text, KnownMonikers.StatusInformation));
            AddInfoBar(infoBar);
        }

        /// <summary>
        /// Selects session <paramref name="session"/> of the repository at
        /// <paramref name="root"/>. Where the tree does not show it yet -- the
        /// window was only just opened -- it is selected once the next
        /// document arrives, if that one holds it.
        /// </summary>
        internal void Reveal(string root, string session)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            pendingReveal = tree.Reveal(root, session) ? null : (root, session);
        }

        // The session to select once the next document is shown; main thread only.
        private (string Root, string Session)? pendingReveal;

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
            Dabbler.JoinableTaskFactory.RunAsync(RestartAsync).FileAndForget("dabbler/work-explorer/follow");
        }

        /// <summary>Stops what is followed, and follows the open solution's repository, where there is one.</summary>
        private async Task RestartAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            var mine = ++generation;
            Stop();
            repositoryRoot = null;
            tree.Roots.Clear();
            tree.Message = null;
            var folder = await Dabbler.SolutionFolderAsync();
            if (mine != generation) return;
            if (folder == null)
            {
                tree.Message = WorkExplorerTree.NoSolution;
                return;
            }
            var root = WorkExplorerTree.RepositoryRootOf(folder);
            if (root == null)
            {
                tree.Message = WorkExplorerTree.NotInRepository;
                return;
            }
            if (!await Dabbler.EnsureNodeAsync() || mine != generation) return;
            var router = Dabbler.Router;
            if (router == null) return;
            repositoryRoot = root;
            follow = new RouterFollow(
                router,
                root,
                new[] { "view", "work-explorer", "--repo-root", root, "--follow" },
                line => OnDocument(mine, line),
                Dabbler.Commands);
        }

        /// <summary>
        /// One line the router printed, read off the main thread and shown on
        /// it. A line that is not a document is said in the Dabbler Commands
        /// pane, and the tree stays as it was.
        /// </summary>
        private void OnDocument(int mine, string line)
        {
            WorkExplorerDocument document;
            try
            {
                document = WorkExplorerDocument.Parse(line);
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
                if (pendingReveal is (string root, string session)) tree.Reveal(root, session);
                pendingReveal = null;
            }).FileAndForget("dabbler/work-explorer/show");
        }

        private void Stop()
        {
            follow?.Dispose();
            follow = null;
        }
    }
}
