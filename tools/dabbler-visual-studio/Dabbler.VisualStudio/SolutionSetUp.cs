using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dabbler.VisualStudio.Core;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Set Up Dabbler in This Solution: the router's own `dabbler bootstrap`
    /// on the repository holding the open solution, what it printed shown in
    /// its words, and session 1 offered as VS Code offers it. What is written,
    /// what the repository is read as, and whether anything is refused are all
    /// the router's.
    /// </summary>
    internal sealed class SolutionSetUp
    {
        private const string Title = "Set Up Dabbler in This Solution";

        private const string StartFirst = "Start Session 1";

        private const string Later = "Later";

        private readonly DabblerPackage package;

        public SolutionSetUp(DabblerPackage package)
        {
            this.package = package;
        }

        /// <summary>
        /// Sets <paramref name="repositoryRoot"/> up, calls
        /// <paramref name="followAgain"/> once it is, and offers its first
        /// session.
        /// </summary>
        public async Task RunAsync(string repositoryRoot, Action followAgain)
        {
            await package.JoinableTaskFactory.SwitchToMainThreadAsync();
            var actions = new LifecycleActions(package);
            var bootstrap = await actions.RunRouterAsync(
                repositoryRoot,
                // A repository with uncommitted work is refused before
                // anything is written, in the router's words.
                new[] { "bootstrap", "--project-dir", repositoryRoot, "--refuse-uncommitted" },
                null,
                "Setting up Dabbler in this solution");
            if (bootstrap == null) return;
            if (!bootstrap.Succeeded)
            {
                actions.ShowRefusal(bootstrap.Words);
                return;
            }
            package.Session?.Show(Title, bootstrap.Printed);
            followAgain();

            var choice = ActionDialog.Choose(
                "Dabbler is set up in this solution, and committed.",
                "Session 1 authors the project plan and will ask you what the project is; session 2 breaks it into numbered sessions. " +
                    $"What set-up wrote, and what it read this repository as, are in the {SessionPane.Title} pane of the Output window.",
                new[] { StartFirst, Later },
                StartFirst,
                Later);
            if (choice != StartFirst) return;

            // Session 1's start is the router's action on its row, read once.
            var view = await actions.RunRouterAsync(repositoryRoot, new[] { "view", "work-explorer", "--repo-root", repositoryRoot }, null, null);
            if (view == null) return;
            if (!view.Succeeded)
            {
                actions.ShowRefusal(view.Words);
                return;
            }
            WorkExplorerAction? start;
            WorkExplorerDocument document;
            try
            {
                document = WorkExplorerDocument.Parse(view.Words);
                start = WorkExplorerTree.FirstStart(document);
            }
            catch (FormatException error)
            {
                actions.ShowRefusal(error.Message);
                return;
            }
            if (start == null)
            {
                actions.ShowRefusal("Dabbler is set up, but no session in this repository offers Start Session yet. The Work Explorer shows what each session is waiting on.");
                return;
            }
            await new SessionStarter(package).StartAsync(repositoryRoot, start, SessionOf(document, start));
        }

        /// <summary>The session of the row that offers <paramref name="start"/>.</summary>
        private static int? SessionOf(WorkExplorerDocument document, WorkExplorerAction start)
        {
            var tree = new WorkExplorerTree();
            tree.Show(document);
            return Walk(tree.Roots).FirstOrDefault(node => node.Row.Actions.Contains(start))?.Session;
        }

        private static IEnumerable<WorkExplorerNode> Walk(IEnumerable<WorkExplorerNode> nodes)
        {
            foreach (var node in nodes)
            {
                yield return node;
                foreach (var below in Walk(node.Children)) yield return below;
            }
        }
    }
}
